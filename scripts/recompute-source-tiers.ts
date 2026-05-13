/**
 * Plan 20-B-04 — monthly recompute of source-tier weights from per-source IC.
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
  type PerSourceICRow,
} from '@/lib/sentiment/source-tier';
import { SOURCE_TIER_HYPERPARAMETERS } from '@/lib/sentiment/source-tier-hyperparameters';

export interface RecomputeOptions {
  bootstrapCutover?: boolean;
  modelVersion?: string;
}

export interface RecomputeResult {
  sources_processed: number;
  rows_written: number;
  cold_start_sources: string[];
  per_source_ic_table_empty: boolean;
  bootstrap_report?: {
    sharpe_uplift: number;
    ci_lower_95: number;
    ci_upper_95: number;
    n_resamples: number;
    cutover_eligible: boolean;
  };
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

export async function runRecompute(
  opts: RecomputeOptions = {},
): Promise<RecomputeResult> {
  const cfg = SOURCE_TIER_HYPERPARAMETERS;
  const modelVersion =
    opts.modelVersion ?? `recompute-${new Date().toISOString().slice(0, 10)}`;
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
    };
  }

  const weights = computeSourceWeights(icRows, cfg);

  // Persist EVERY source (eligible AND cold-start) so SourceTier history is complete.
  let rows_written = 0;
  const cold_start_sources: string[] = [];
  for (const w of weights) {
    const ic = icRows.find((r) => r.source_id === w.source_id);
    if (!ic) continue;
    await prisma.sourceTier.create({
      data: {
        source_id: w.source_id,
        mean_ic_90d: ic.mean_ic_90d,
        weight: w.weight,
        n_observations: ic.n_observations,
        validation_window_days: cfg.validation_window_days,
        model_version: modelVersion,
      },
    });
    rows_written += 1;
    if (w.is_cold_start) cold_start_sources.push(w.source_id);
  }

  const result: RecomputeResult = {
    sources_processed: weights.length,
    rows_written,
    cold_start_sources,
    per_source_ic_table_empty: false,
  };

  if (opts.bootstrapCutover) {
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
    result.bootstrap_report = {
      sharpe_uplift: NaN,
      ci_lower_95: NaN,
      ci_upper_95: NaN,
      n_resamples: 0,
      cutover_eligible: false, // requires ≥30d history AND CI lower-bound > 0
    };
    // eslint-disable-next-line no-console
    console.log(
      `[source-tier-recompute] bootstrap-cutover: days_of_history=${days_of_history.toFixed(1)}; gate requires >=30. Implementation lands after 20-C-01 has ≥30d of IC.`,
    );
  }

  return result;
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
