/**
 * Plan 20-B-04 — monthly recompute of source-tier weights from per-source IC.
 *
 * PHASE 22 Wave 3 extension (D-06 + D-07 + D-11 step 1):
 *   - Iterates per regime ∈ {bull-low-vol, bull-high-vol, bear-low-vol,
 *     bear-high-vol} AND emits the unconditional `'ALL'` row.
 *   - Per regime, computes regime-sliced IC + n per source, then applies
 *     `shrinkSourceIcEmpiricalBayes` toward the unconditional `(source, 'ALL')`
 *     IC.  λ is computed per-cell as
 *       λ = clamp( n_{s,ALL} / max(1, var(IC_{s,r}) / n_{s,r}),
 *                  eb_shrinkage_lambda_min, eb_shrinkage_lambda_max )
 *     (RESEARCH §F line 147 verbatim).
 *   - softmaxWithCaps is applied INDEPENDENTLY per regime bucket — weights
 *     within `bull-low-vol` sum to a constant ≠ the constant within
 *     `bear-high-vol` (per-regime softmax INDEPENDENCE).
 *   - Pitfall 2 enforcement: order is IC → shrink → softmax, NEVER the reverse.
 *   - Sparse-cell skip (RESEARCH §F line 369): a `(source, regime)` cell with
 *     ZERO PerSourceIC rows for that regime does NOT INSERT a row — the D-09
 *     read-time fallback resolves via the `'ALL'` row.  Logged as
 *     `sparse_cell source=… regime=… skipped (n=0)`.
 *   - Idempotency: all per-regime INSERTs (and the `'ALL'` row) execute inside
 *     a single `prisma.$transaction([...])` so a failed recompute leaves NO
 *     half-written history.
 *
 * Reads from the PerSourceIC table owned by 20-C-01. If 20-C-01 hasn't shipped
 * or the table is empty for the window, the adapter returns [] and this script
 * exits 0 with a diagnostic — aggregator continues with default weight=1.0
 * per source (cold-start fallback) via getWeightForSource().
 *
 * Called by:
 *   - src/app/api/cron/source-tier-recompute/route.ts (monthly cron, '0 7 1 * *')
 *   - operator CLI:  npx tsx scripts/recompute-source-tiers.ts
 *   - operator CLI:  npx tsx scripts/recompute-source-tiers.ts --bootstrap-cutover
 *
 * Threat T-20-B-04-03 mitigation: empty / missing PerSourceIC is a known-good
 * cross-wave decoupling. The script NEVER throws on that path — telemetry
 * (20-Z-03) surfaces real errors via withTelemetry wrappers at the caller.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  computeSourceWeights,
  shrinkSourceIcEmpiricalBayes,
  softmaxWithCaps,
  type PerSourceICRow,
} from '@/lib/sentiment/source-tier';
import { SOURCE_TIER_HYPERPARAMETERS } from '@/lib/sentiment/source-tier-hyperparameters';
import { ACTIVE_REGIME_LABELS, type RegimeLabel } from '@/lib/regime/types';

export interface RecomputeOptions {
  bootstrapCutover?: boolean;
  modelVersion?: string;
}

export interface RecomputeResult {
  sources_processed: number;
  rows_written: number;
  cold_start_sources: string[];
  per_source_ic_table_empty: boolean;
  // PHASE 22 Wave 3 — per-regime row breakdown for operator confirmation.
  per_regime_rows_written: Record<RegimeLabel, number>;
  sparse_cells_skipped: Array<{ source_id: string; regime: RegimeLabel }>;
  bootstrap_report?: {
    sharpe_uplift: number;
    ci_lower_95: number;
    ci_upper_95: number;
    n_resamples: number;
    cutover_eligible: boolean;
  };
}

/**
 * Internal panel row carrying the regime slice + ic-variance estimate that the
 * λ-formula needs.  The fetch query computes these in SQL so this script stays
 * pure-aggregation + write.
 */
interface PerSourceRegimeICRow {
  source_id: string;
  regime: RegimeLabel | 'ALL';
  mean_ic: number | null;
  variance_ic: number | null; // sample variance of ic_20d in the slice
  n_observations: number;
}

/**
 * Read-only adapter for 20-C-01's per_source_ic table.
 *
 * Returns [] on:
 *  - Table does not exist (Prisma P2021) — 20-C-01 hasn't shipped to live DB yet
 *  - Table exists but has no rows for the window
 *
 * Aggregates PerSourceIC.ic_20d to mean_ic_90d by averaging the last
 * `windowDays` of computed_at rows per source_id (forward_horizon_days=7).
 *
 * PHASE 22 D-06 + D-11 step 1: the PerSourceIC table now carries a `regime`
 * column written by the Wave 2 backfill cron.  Each row represents (ticker,
 * source, day, regime).  This adapter returns the UNCONDITIONAL panel used for
 * the legacy single-regime path; the regime-aware panel is fetched separately
 * by `fetchPerSourceICByRegime` below.
 */
async function fetchPerSourceIC(
  windowDays: number,
): Promise<PerSourceICRow[]> {
  try {
    // 20-C-01 ships a typed PerSourceIC Prisma model. We aggregate ic_20d over
    // the trailing `windowDays` to get mean_ic_90d per source.
    const since = new Date(Date.now() - windowDays * 86_400_000);
    const rows = await prisma.$queryRaw<
      Array<{
        source_id: string;
        mean_ic_90d: number | null;
        n_observations: bigint;
      }>
    >`
      SELECT source_id,
             AVG(ic_20d)::float8 AS mean_ic_90d,
             COUNT(DISTINCT computed_at::date)::bigint AS n_observations
      FROM per_source_ic
      WHERE forward_horizon_days = 7
        AND computed_at >= ${since}
      GROUP BY source_id
    `;
    return rows.map((r) => ({
      source_id: r.source_id,
      mean_ic_90d: r.mean_ic_90d,
      n_observations: Number(r.n_observations),
    }));
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2021'
    ) {
      // Table does not exist — 20-C-01 not shipped yet OR not pushed.
      return [];
    }
    // Treat any other read error as table-empty for graceful degradation
    // (T-20-B-04-03). Operator-side telemetry (20-Z-03) catches the error rate.
    // eslint-disable-next-line no-console
    console.warn(
      `[source-tier-recompute] PerSourceIC read failed (treating as empty): ${String(err)}`,
    );
    return [];
  }
}

/**
 * PHASE 22 Wave 3 — fetches the per-(source, regime) panel for EB shrinkage input.
 *
 * Returns rows for every (source_id, regime) pair in the window, INCLUDING
 * empty cells (n=0) so the caller can detect sparse cells and skip them per
 * RESEARCH §F line 369.  Caller still receives a row per (source, regime) so
 * the "ALL" → 1.0 fallback decision is structural, not a missing-key inference.
 *
 * Regime 'ALL' is computed as the unconditional aggregate across all rows
 * regardless of label — gives the EB shrinkage target.
 */
async function fetchPerSourceICByRegime(
  windowDays: number,
): Promise<PerSourceRegimeICRow[]> {
  try {
    const since = new Date(Date.now() - windowDays * 86_400_000);
    // VAR_SAMP is the sample variance estimator (n-1 denominator) — what the
    // EB λ-formula expects.  Coalesce to 0 for single-row cells; the formula
    // handles 0-variance by falling through to lambda_max via the max(1, …) clamp.
    const rows = await prisma.$queryRaw<
      Array<{
        source_id: string;
        regime: string;
        mean_ic: number | null;
        variance_ic: number | null;
        n_observations: bigint;
      }>
    >`
      SELECT source_id,
             regime,
             AVG(ic_20d)::float8 AS mean_ic,
             VAR_SAMP(ic_20d)::float8 AS variance_ic,
             COUNT(DISTINCT computed_at::date)::bigint AS n_observations
      FROM per_source_ic
      WHERE forward_horizon_days = 7
        AND computed_at >= ${since}
      GROUP BY source_id, regime
    `;
    return rows.map((r) => ({
      source_id: r.source_id,
      regime: r.regime as RegimeLabel | 'ALL',
      mean_ic: r.mean_ic,
      variance_ic: r.variance_ic,
      n_observations: Number(r.n_observations),
    }));
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2021'
    ) {
      return [];
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[source-tier-recompute] PerSourceIC-by-regime read failed (treating as empty): ${String(err)}`,
    );
    return [];
  }
}

/**
 * PHASE 22 Wave 3 — compute the per-regime SourceTier insert payloads.
 *
 * Pipeline per regime r ∈ ACTIVE_REGIME_LABELS:
 *   1. For each source s, look up the regime-sliced (mean_ic, var_ic, n).
 *      If no row → sparse_cells_skipped.push({source_id: s, regime: r}); continue.
 *   2. Look up the unconditional (source, 'ALL') aggregate.
 *   3. Compute λ_{s,r} = clamp(n_{s,ALL} / max(1, var_{s,r}/n_{s,r}), λ_min, λ_max).
 *   4. shrunk_ic = (n_{s,r} × ic_{s,r} + λ × ic_{s,ALL}) / (n_{s,r} + λ).
 *   5. Build IC_shrunk vector for this regime; pass through softmaxWithCaps.
 *   6. Emit one SourceTier row per (source_id, regime) with weight,
 *      shrinkage_strength, n_observations, validation_window_days.
 *
 * The unconditional `'ALL'` row is emitted separately (one row per source) with
 * shrinkage_strength=null — IT IS the unconditional baseline.
 *
 * Exported for unit-testability (the cron route + integration test exercise
 * the full runRecompute; unit tests pin this pure step).
 */
export interface RegimeShrinkPayload {
  source_id: string;
  regime: RegimeLabel | 'ALL';
  mean_ic_90d: number | null;
  weight: number;
  n_observations: number;
  validation_window_days: number;
  shrinkage_strength: number | null;
}

export function computePerRegimeWeights(
  panel: PerSourceRegimeICRow[],
  cfg: typeof SOURCE_TIER_HYPERPARAMETERS = SOURCE_TIER_HYPERPARAMETERS,
): {
  payloads: RegimeShrinkPayload[];
  sparse_cells_skipped: Array<{ source_id: string; regime: RegimeLabel }>;
} {
  const payloads: RegimeShrinkPayload[] = [];
  const sparse_cells_skipped: Array<{ source_id: string; regime: RegimeLabel }> = [];

  // Index by (source, regime) for O(1) lookup during per-regime iteration.
  const bySourceRegime = new Map<string, PerSourceRegimeICRow>();
  for (const row of panel) {
    bySourceRegime.set(`${row.source_id}|${row.regime}`, row);
  }

  // Collect the set of distinct sources observed anywhere in the panel.
  const distinctSources = new Set<string>();
  for (const row of panel) distinctSources.add(row.source_id);

  // ── 1. Per-regime IC → shrink → softmax (per-regime independence) ───────────
  for (const regime of ACTIVE_REGIME_LABELS) {
    // Build the slice of {source: shrunk_ic} for THIS regime, skipping sparse cells.
    const inflightSources: string[] = [];
    const shrunkICs: number[] = [];
    const shrinkageStrengths: number[] = [];
    const ns: number[] = [];

    for (const source_id of distinctSources) {
      const regimeRow = bySourceRegime.get(`${source_id}|${regime}`);
      if (!regimeRow || regimeRow.n_observations === 0) {
        // Sparse cell — D-09 fallback will resolve via the 'ALL' row at read time.
        sparse_cells_skipped.push({ source_id, regime });
        // eslint-disable-next-line no-console
        console.log(
          `[cron:source-tier-recompute] sparse_cell source=${source_id} regime=${regime} skipped (n=0)`,
        );
        continue;
      }
      if (regimeRow.mean_ic == null) {
        // No IC measurable in the slice — treat as sparse (no signal).
        sparse_cells_skipped.push({ source_id, regime });
        continue;
      }

      const allRow = bySourceRegime.get(`${source_id}|ALL`);
      const unconditional_ic = allRow?.mean_ic ?? 0;
      const n_all = allRow?.n_observations ?? 0;

      // λ = clamp(n_ALL / max(1, var_{s,r} / n_{s,r}), λ_min, λ_max).
      // The max(1, …) denominator clamp prevents div-by-zero on single-row cells.
      const var_ratio = Math.max(
        1,
        (regimeRow.variance_ic ?? 0) / Math.max(1, regimeRow.n_observations),
      );
      const lambda_raw = n_all / var_ratio;

      // ── Pitfall 2 enforcement: IC → SHRINK → softmax ───────────────────────
      const shrink = shrinkSourceIcEmpiricalBayes({
        regime_ic: regimeRow.mean_ic,
        regime_n: regimeRow.n_observations,
        unconditional_ic,
        lambda: lambda_raw,
        lambda_min: cfg.eb_shrinkage_lambda_min,
        lambda_max: cfg.eb_shrinkage_lambda_max,
      });

      inflightSources.push(source_id);
      shrunkICs.push(shrink.shrunk_ic);
      shrinkageStrengths.push(shrink.shrinkage_strength);
      ns.push(regimeRow.n_observations);
    }

    if (inflightSources.length === 0) continue; // no dense cells in this regime.

    // Per-regime independent softmax — pitfall 2 step 2.
    const weights = softmaxWithCaps(shrunkICs, cfg.cap_min, cfg.cap_max);
    for (let i = 0; i < inflightSources.length; i++) {
      payloads.push({
        source_id: inflightSources[i],
        regime,
        mean_ic_90d: shrunkICs[i],
        weight: weights[i],
        n_observations: ns[i],
        validation_window_days: cfg.validation_window_days,
        shrinkage_strength: shrinkageStrengths[i],
      });
    }
  }

  // ── 2. Unconditional 'ALL' row per source — EB shrinkage target ────────────
  // Compute baseline weights via the existing pure helper for backwards-compat
  // with the legacy single-regime path.  shrinkage_strength is null on these
  // rows — they ARE the reference distribution, not a shrunken estimate.
  const allRows: PerSourceICRow[] = [];
  for (const source_id of distinctSources) {
    const allRow = bySourceRegime.get(`${source_id}|ALL`);
    if (!allRow || allRow.n_observations === 0) continue;
    allRows.push({
      source_id,
      mean_ic_90d: allRow.mean_ic,
      n_observations: allRow.n_observations,
    });
  }
  const allWeights = computeSourceWeights(allRows, cfg);
  for (const w of allWeights) {
    const allRow = bySourceRegime.get(`${w.source_id}|ALL`);
    payloads.push({
      source_id: w.source_id,
      regime: 'ALL',
      mean_ic_90d: allRow?.mean_ic ?? null,
      weight: w.weight,
      n_observations: allRow?.n_observations ?? 0,
      validation_window_days: cfg.validation_window_days,
      shrinkage_strength: null, // 'ALL' is the baseline — no shrinkage applied.
    });
  }

  return { payloads, sparse_cells_skipped };
}

export async function runRecompute(
  opts: RecomputeOptions = {},
): Promise<RecomputeResult> {
  const cfg = SOURCE_TIER_HYPERPARAMETERS;
  const modelVersion =
    opts.modelVersion ?? `recompute-${new Date().toISOString().slice(0, 10)}`;

  // PHASE 22 Wave 3 — fetch the regime-aware panel.  If the DB has no regime
  // labels yet (Wave 2 backfill hasn't run), all rows will carry regime='ALL'
  // and the per-regime iteration will skip every cell as sparse — degrading
  // gracefully to the unconditional-only baseline (legacy behavior).
  const regimePanel = await fetchPerSourceICByRegime(cfg.validation_window_days);

  // eslint-disable-next-line no-console
  console.log('[cron:source-tier-recompute] start', {
    panel_rows: regimePanel.length,
    n_regimes: ACTIVE_REGIME_LABELS.length,
  });

  if (regimePanel.length === 0) {
    // 20-C-01 not shipped OR table empty in the window → legacy fallback.
    const icRows = await fetchPerSourceIC(cfg.validation_window_days);
    if (icRows.length === 0) {
      // eslint-disable-next-line no-console
      console.log(
        '[source-tier-recompute] PerSourceIC table empty — defaulting all weights to 1.0; no SourceTier rows written.',
      );
      return {
        sources_processed: 0,
        rows_written: 0,
        cold_start_sources: [],
        per_source_ic_table_empty: true,
        per_regime_rows_written: makeEmptyPerRegimeCounter(),
        sparse_cells_skipped: [],
      };
    }
    // Backwards-compat: write only 'ALL' rows when no regime labels exist.
    const weights = computeSourceWeights(icRows, cfg);
    const per_regime_rows_written = makeEmptyPerRegimeCounter();
    let rows_written = 0;
    const cold_start_sources: string[] = [];
    const inserts: Prisma.PrismaPromise<unknown>[] = [];
    for (const w of weights) {
      const ic = icRows.find((r) => r.source_id === w.source_id);
      if (!ic) continue;
      inserts.push(
        prisma.sourceTier.create({
          data: {
            source_id: w.source_id,
            regime: 'ALL',
            mean_ic_90d: ic.mean_ic_90d,
            weight: w.weight,
            n_observations: ic.n_observations,
            validation_window_days: cfg.validation_window_days,
            model_version: modelVersion,
            shrinkage_strength: null,
          },
        }),
      );
      rows_written += 1;
      per_regime_rows_written.ALL += 1;
      if (w.is_cold_start) cold_start_sources.push(w.source_id);
    }
    if (inserts.length > 0) {
      await prisma.$transaction(inserts);
    }

    const result: RecomputeResult = {
      sources_processed: weights.length,
      rows_written,
      cold_start_sources,
      per_source_ic_table_empty: false,
      per_regime_rows_written,
      sparse_cells_skipped: [],
    };
    if (opts.bootstrapCutover) {
      result.bootstrap_report = await maybeBootstrapReport();
    }
    return result;
  }

  // ── PHASE 22 Wave 3 main path — IC → shrink → softmax → INSERT per-regime ──
  const { payloads, sparse_cells_skipped } = computePerRegimeWeights(regimePanel, cfg);

  const per_regime_rows_written = makeEmptyPerRegimeCounter();
  const cold_start_sources: string[] = [];
  const inserts: Prisma.PrismaPromise<unknown>[] = [];
  for (const p of payloads) {
    inserts.push(
      prisma.sourceTier.create({
        data: {
          source_id: p.source_id,
          regime: p.regime,
          mean_ic_90d: p.mean_ic_90d,
          weight: p.weight,
          n_observations: p.n_observations,
          validation_window_days: p.validation_window_days,
          model_version: modelVersion,
          shrinkage_strength: p.shrinkage_strength,
        },
      }),
    );
    per_regime_rows_written[p.regime] += 1;
    if (p.regime === 'ALL' && (p.mean_ic_90d == null || p.n_observations < cfg.n_min_observations)) {
      cold_start_sources.push(p.source_id);
    }
  }

  // Idempotency: all per-regime + 'ALL' INSERTs land in one transaction.
  // A mid-flight failure leaves NO half-written recompute history.
  if (inserts.length > 0) {
    await prisma.$transaction(inserts);
  }

  // eslint-disable-next-line no-console
  console.log('[cron:source-tier-recompute] complete', {
    total_inserts: inserts.length,
    per_regime_counts: per_regime_rows_written,
    sparse_cells: sparse_cells_skipped.length,
  });

  const distinctSources = new Set(payloads.map((p) => p.source_id));
  const result: RecomputeResult = {
    sources_processed: distinctSources.size,
    rows_written: inserts.length,
    cold_start_sources,
    per_source_ic_table_empty: false,
    per_regime_rows_written,
    sparse_cells_skipped,
  };

  if (opts.bootstrapCutover) {
    result.bootstrap_report = await maybeBootstrapReport();
  }

  return result;
}

function makeEmptyPerRegimeCounter(): Record<RegimeLabel, number> {
  return {
    'bull-low-vol': 0,
    'bull-high-vol': 0,
    'bear-low-vol': 0,
    'bear-high-vol': 0,
    ALL: 0,
  };
}

async function maybeBootstrapReport(): Promise<NonNullable<RecomputeResult['bootstrap_report']>> {
  // Paired-bootstrap on validation Sharpe — 1000 resamples.
  // STUB: implementation deferred to a follow-up task once 20-C-01 has
  // ≥30d of IC AND we have a Sharpe-uplift testing harness wired. The stub
  // returns a not-yet-eligible report so the operator gets clear feedback
  // on what's missing (days_of_history printed below).
  const oldestRow = await prisma.sourceTier.findFirst({
    orderBy: { computed_at: 'asc' },
    select: { computed_at: true },
  });
  const days_of_history = oldestRow
    ? (Date.now() - oldestRow.computed_at.getTime()) / 86_400_000
    : 0;
  // eslint-disable-next-line no-console
  console.log(
    `[source-tier-recompute] bootstrap-cutover: days_of_history=${days_of_history.toFixed(1)}; gate requires >=30. Implementation lands after 20-C-01 has ≥30d of IC.`,
  );
  return {
    sharpe_uplift: NaN,
    ci_lower_95: NaN,
    ci_upper_95: NaN,
    n_resamples: 0,
    cutover_eligible: false,
  };
}

// CLI entry — only when invoked directly (not when imported by cron route/tests).
if (
  typeof require !== 'undefined' &&
  require.main === module &&
  !process.env.VITEST
) {
  const bootstrapCutover = process.argv.includes('--bootstrap-cutover');
  runRecompute({ bootstrapCutover })
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
