// src/app/api/cron/learn/route.ts
// Daily learning cron — runs after price-followup at 07:30 UTC.
//
// Phase 16-03 dual-class behaviour:
// 1. Pull newly-resolved outcomes at ALL horizons (3/7/14/30/60/90), filtered
//    to those without a LearningEvent linked (idempotent via outcome_id).
// 2. For each outcome:
//      - Reconstruct the DiffusionTrace from preceding snapshots.
//      - Read the TechnicalSnapshot directly off the snapshot row.
//      - Compute the SPY-relative hit at this horizon.
//      - Inside a single prisma.$transaction so cron retries never double-count:
//          • upsert the (diffusion, flow_pattern, cap_class, horizon_days) cell
//          • upsert the (technical, tech_pattern, cap_class, horizon_days) cell
//          • if horizon === 30 AND both trace + tech snap present, take one
//            updateLogistic step on the 12-d Bayesian regression.
//          • write LearningEvent (commit point — outcome_id dedup key).
// 3. Recompute Brier (in/out/null) + 30d-rolling alpha/beta + drift_z + status
//    for every (signal_class, pattern_key, cap_class, horizon_days) cell.
// 4. Persist a fresh LogisticEpoch from the in-memory state (also handles the
//    Pitfall-5 first-cycle reinit from the legacy 6-d shape).
// 5. AI-authored cycle_summary + prune events older than 90 days.

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { generateText } from 'ai';
import YahooFinance from 'yahoo-finance2';
import { prisma } from '@/lib/db';
// Plan 20-Z-04 — cycle-summary prompt is a versioned registry artifact.
// Body lives at src/lib/prompts/_v1/gemini-cycle-summary.md.
import { renderPrompt } from '@/lib/prompts/render';
import {
  computeDiffusionTrace,
  classifyCapClass,
  type FlowPattern,
  type CapClass,
  type SnapshotInput,
  type DiffusionTraceResult,
} from '@/lib/diffusion-trace';
import {
  posteriorMean,
  brierScore,
  driftZ,
  classifyHit,
  initLogisticState,
  updateLogistic,
  predictLogistic,
  adversarialNullBrier,
  patternStatus,
  buildFeatureVector12,
  needsLogisticReinit,
  FEATURE_NAMES,
  // Phase 18 time-decay, ESS, and two-of-two drift primitives (see plan 01).
  decayWeights,
  computeESS,
  updatePosteriorWeighted,
  confirmedDrift,
  HYPERPARAMETERS,
  STATUS_VALUES,
  // Phase 19 Plan 19-A-02 — D-18 chronological split + look-ahead embargo.
  timeBasedSplit,
  computeBrierOOS,
  filterSnapshotsForEmbargo,
  // Phase 19 Plan 19-A-07 — empirical-Bayes hierarchical pooling.
  hierarchicalPooledPosterior,
  // Phase 27 Plan 27-03 — D-10 live-only promotion gate (COVERAGE-10).
  enforceLiveOnlyGate,
  // Phase 21.1 Wave 4 — 5-gate patternStatus constants + PRIOR_PRECISION annealing
  BRIER_LIFT_THRESHOLD,
  type LogisticState,
  type WeightedObservation,
  type LearnedStatus,
} from '@/lib/learning';
import { purgedKFold, type Observation } from '@/lib/cv';
import {
  bootstrapBCa,
  benjaminiYekutieli,
  deflatedSharpeRatio,
} from '@/lib/evaluation';
import { FEATURES } from '@/lib/features';
import { runWithShadow } from '@/lib/shadow/shadow-runner';
import type {
  TechPattern,
  TechnicalSnapshot,
  InsiderBucket,
  InstitutionalBucket,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ─── Pattern × cap × horizon enumerations ──────────────────────────────────
//
// CAP_CLASSES locked to the union returned by classifyCapClass() in
// src/lib/diffusion-trace.ts:
//   export type CapClass = 'large_cap' | 'mid_cap' | 'small_cap' | 'unknown';
// Recompute pass iterates only the 3 traded buckets — `'unknown'` is a fallback
// for missing market_cap and is NOT a learnable cell.
const FLOW_PATTERNS: FlowPattern[] = ['niche_leads', 'simultaneous', 'mainstream_first', 'flat'];
const TECH_PATTERNS: TechPattern[] = [
  'breakout_uptrend',
  'overbought_uptrend',
  'pullback_in_uptrend',
  'consolidation',
  'breakdown',
  'oversold_downtrend',
  'death_cross',
  'golden_cross',
];
const INSIDER_PATTERNS: InsiderBucket[] = [
  'cluster_buying',
  'lone_buy',
  'ceo_buy',
  'cfo_buy',
  'director_buy',
  'cluster_selling',
  'planned_sell_10b5_1',
  'lone_sell',
];
const INSTITUTIONAL_PATTERNS: InstitutionalBucket[] = [
  'net_accumulation',
  'net_distribution',
  'new_initiation',
  'complete_exit',
  'smart_money_concentration',
  'smart_money_dispersion',
  'contrarian_inflow',
  'contrarian_outflow',
];
const CAP_CLASSES = ['large_cap', 'mid_cap', 'small_cap'] as const;
const HORIZONS = [3, 7, 14, 30, 60, 90] as const;
type Horizon = (typeof HORIZONS)[number];

// Cell-space size: 4 signal_classes × patterns × 3 cap_classes × 6 horizons
//   = (4 + 8 + 8 + 8) × 3 × 6 = 28 × 18 = 504 cells (Phase 17 — D-13 says 672
//   counting the 'unknown' cap class which the recompute pass skips).

// ─── SPY history helpers (unchanged from pre-Phase-16) ──────────────────────

interface SpyHistory {
  closes: Map<string, number>;            // YYYY-MM-DD → close
}

async function fetchSpyHistory(daysBack = 100): Promise<SpyHistory> {
  // Widened from 60 to 100 so 90d-old outcomes have SPY closes both ends.
  const period1 = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const period2 = new Date();
  const result = await yf.chart('SPY', { period1, period2, interval: '1d' });
  const closes = new Map<string, number>();
  for (const q of result.quotes ?? []) {
    if (q.close == null) continue;
    closes.set(q.date.toISOString().split('T')[0], q.close);
  }
  return { closes };
}

function nearestSpyClose(history: SpyHistory, target: Date): number | null {
  // Walk back up to 5 days to find a trading-day close.
  for (let offset = 0; offset < 5; offset++) {
    const d = new Date(target.getTime() - offset * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    const close = history.closes.get(key);
    if (close != null) return close;
  }
  return null;
}

// ─── Outcome loader — multi-horizon + idempotent ────────────────────────────

interface ResolvedOutcome {
  outcome_id: string;
  ticker: string;
  scanned_at: Date;
  recorded_at: Date;
  price_at_scan: number;
  price_at_outcome: number;
  ticker_return_pct: number;
  // Phase 21 — sector-relative label fields (null when row pre-dates backfill).
  sector_relative_pct: number | null;
  sector_etf: string | null;
  source: 'report' | 'snapshot';
  source_id: string;
  snapshot_id: string | null;
  /** Phase 27 D-10: SentimentSnapshot.source column — 'live' | 'backfill'. Reports are always live. */
  snapshot_source: string;
  days_after: number;
}

async function loadUnprocessedOutcomes(opts: { isBackfill: boolean }): Promise<ResolvedOutcome[]> {
  // Subquery: outcome_ids already incorporated into a LearningEvent
  const processedRows = await prisma.learningEvent.findMany({
    where: { outcome_id: { not: null } },
    select: { outcome_id: true },
  });
  const processed = new Set(processedRows.map((r) => r.outcome_id!).filter(Boolean));

  const since = opts.isBackfill ? new Date(0) : new Date(Date.now() - 36 * 60 * 60 * 1000);

  // Phase 16-03: removed the days_after === 7 filter — load ALL horizons.
  const outcomes = await prisma.priceOutcome.findMany({
    where: { recorded_at: { gte: since } },
    include: { snapshot: true, report: true },
    orderBy: { recorded_at: 'asc' },
  });

  const out: ResolvedOutcome[] = [];
  for (const o of outcomes) {
    if (processed.has(o.id)) continue;

    if (o.snapshot) {
      out.push({
        outcome_id: o.id,
        ticker: o.snapshot.ticker,
        scanned_at: o.snapshot.scanned_at,
        recorded_at: o.recorded_at,
        price_at_scan: o.snapshot.price_at_scan,
        price_at_outcome: o.price,
        ticker_return_pct: o.pct_change,
        // Phase 21 — sector-relative label fields (null when row pre-dates backfill).
        sector_relative_pct: o.forward_return_sector_rel,
        sector_etf: o.sector_etf,
        source: 'snapshot',
        source_id: o.snapshot.id,
        snapshot_id: o.snapshot.id,
        snapshot_source: o.snapshot.source ?? 'live',  // Phase 27 D-10: backfill vs live provenance
        days_after: o.days_after,
      });
    } else if (o.report) {
      const priceAt = o.report.price_at_report;
      if (priceAt == null) continue;
      out.push({
        outcome_id: o.id,
        ticker: o.report.ticker,
        scanned_at: o.report.analyzed_at,
        recorded_at: o.recorded_at,
        price_at_scan: priceAt,
        price_at_outcome: o.price,
        ticker_return_pct: o.pct_change,
        // Phase 21 — sector-relative label fields (null when row pre-dates backfill).
        sector_relative_pct: o.forward_return_sector_rel,
        sector_etf: o.sector_etf,
        source: 'report',
        source_id: o.report.id,
        snapshot_id: null,
        snapshot_source: 'live',  // Phase 27 D-10: reports are always live (no backfill path)
        days_after: o.days_after,
      });
    }
  }
  return out;
}

// ─── Trace + technical-snap reconstruction ──────────────────────────────────

async function buildTraceForOutcome(
  outcome: ResolvedOutcome,
): Promise<{ trace: DiffusionTraceResult; snapshotIds: string[] } | null> {
  // Pull up to 4 snapshots for this ticker BEFORE the outcome's scanned_at,
  // ordered oldest → newest.
  const snaps = await prisma.sentimentSnapshot.findMany({
    where: { ticker: outcome.ticker, scanned_at: { lte: outcome.scanned_at } },
    orderBy: { scanned_at: 'desc' },
    take: 4,
  });
  if (snaps.length < 2) return null;

  // Plan 19-A-02 / D-18: enforce look-ahead embargo. Reject any snapshot whose
  // scanned_at falls within `prediction_horizon_days` of the outcome's
  // recorded_at — those snapshots carry information that has effectively
  // already leaked from the future (the outcome's price path is partly priced
  // into the snapshot at scan time). The natural query filter `scanned_at <=
  // outcome.scanned_at` enforces this implicitly when scanned_at + days_after
  // = recorded_at, but if a re-scan or clock skew produced a snapshot inside
  // the window, this strict-< filter catches it. Pure helper from learning.ts.
  const embargoed = filterSnapshotsForEmbargo(
    snaps,
    outcome.recorded_at,
    outcome.days_after,
  );
  if (embargoed.length < 2) return null;

  // Historical context for z-scoring.
  const allTickerSnaps = await prisma.sentimentSnapshot.findMany({
    where: { ticker: outcome.ticker },
    select: { community_data: true },
    take: 50,
    orderBy: { scanned_at: 'desc' },
  });
  const histQuantity: number[] = [];
  const histQuality: number[] = [];
  for (const s of allTickerSnaps) {
    const cd = s.community_data as Record<string, unknown> | null;
    if (cd && typeof cd.quantity === 'number') histQuantity.push(cd.quantity);
    if (cd && typeof cd.quality === 'number') histQuality.push(cd.quality);
  }

  const inputs: SnapshotInput[] = embargoed.map((s) => ({
    scanned_at: s.scanned_at,
    community_data: (s.community_data ?? {}) as SnapshotInput['community_data'],
  }));

  const trace = computeDiffusionTrace(inputs, histQuantity, histQuality);
  return trace ? { trace, snapshotIds: embargoed.map((s) => s.id) } : null;
}

/**
 * Read the TechnicalSnapshot off the originating SentimentSnapshot row, if any.
 * Returns null when the outcome traces back to a Report (no snapshot_id), or
 * when the snapshot has no technical_data (pre-Phase-16 row, or both fetches
 * failed at scan time).
 */
async function readTechSnapshotForOutcome(
  outcome: ResolvedOutcome,
  tx: Prisma.TransactionClient,
): Promise<TechnicalSnapshot | null> {
  if (!outcome.snapshot_id) return null;
  const snap = await tx.sentimentSnapshot.findUnique({
    where: { id: outcome.snapshot_id },
    select: { technical_data: true },
  });
  if (!snap?.technical_data) return null;
  // Json column — caller treats malformed JSON as null at downstream gates.
  return snap.technical_data as unknown as TechnicalSnapshot;
}

/**
 * Read the InsiderSnapshot's bucket off the originating SentimentSnapshot,
 * if any. Returns null when the outcome traces back to a Report (no
 * snapshot_id), the snapshot has no insider_data, or the classifier did
 * not classify a bucket. Phase 17 — D-21.
 */
async function readInsiderBucketForOutcome(
  outcome: ResolvedOutcome,
  tx: Prisma.TransactionClient,
): Promise<InsiderBucket | null> {
  if (!outcome.snapshot_id) return null;
  const snap = await tx.sentimentSnapshot.findUnique({
    where: { id: outcome.snapshot_id },
    select: { insider_data: true },
  });
  const data = snap?.insider_data as { insider_bucket?: InsiderBucket | null } | null;
  return data?.insider_bucket ?? null;
}

/**
 * Read the InstitutionalSnapshot's bucket off the originating
 * SentimentSnapshot, if any. Same null-handling as the insider variant.
 * Phase 17 — D-21.
 */
async function readInstitutionalBucketForOutcome(
  outcome: ResolvedOutcome,
  tx: Prisma.TransactionClient,
): Promise<InstitutionalBucket | null> {
  if (!outcome.snapshot_id) return null;
  const snap = await tx.sentimentSnapshot.findUnique({
    where: { id: outcome.snapshot_id },
    select: { institutional_data: true },
  });
  const data = snap?.institutional_data as { institutional_bucket?: InstitutionalBucket | null } | null;
  return data?.institutional_bucket ?? null;
}

// ─── Cell upsert (composite key on the new schema) ──────────────────────────

interface CellKey {
  signal_class: 'diffusion' | 'technical' | 'insider' | 'institutional';
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
}

async function upsertCell(
  tx: Prisma.TransactionClient,
  key: CellKey,
  hit: boolean,
): Promise<void> {
  // Skip 'unknown' cap_class — it's a fallback for missing market_cap, not a
  // learnable cell. The recompute pass also skips these, so writing them would
  // create dead rows that never get recomputed.
  if (key.cap_class === 'unknown') return;

  await tx.learnedPattern.upsert({
    where: {
      signal_class_pattern_key_cap_class_horizon_days: {
        signal_class: key.signal_class,
        pattern_key: key.pattern_key,
        cap_class: key.cap_class,
        horizon_days: key.horizon_days,
      },
    },
    update: {
      alpha: { increment: hit ? 1 : 0 },
      beta: { increment: hit ? 0 : 1 },
      sample_size: { increment: 1 },
      hits: { increment: hit ? 1 : 0 },
      last_updated: new Date(),
    },
    create: {
      signal_class: key.signal_class,
      pattern_key: key.pattern_key,
      cap_class: key.cap_class,
      horizon_days: key.horizon_days,
      alpha: 1 + (hit ? 1 : 0),
      beta: 1 + (hit ? 0 : 1),
      sample_size: 1,
      hits: hit ? 1 : 0,
      last_updated: new Date(),
    },
  });
}

// ─── Phase 21.1 Wave 4 — Per-cell evaluation result ─────────────────────────
//
// CORE-ML-15/17/18/19: `recomputeOneCell` now returns a CellEvalResult instead
// of writing status directly. The orchestrator collects all results, runs
// Benjamini-Yekutieli FDR over the per-cell p-values, then calls
// `applyPatternStatusAndEmitEvents` with q-values known.

interface CellEvalResult {
  key: CellKey;
  cell_id: string;
  prev_status: string;
  // Existing metrics (Phase 18/19/27)
  brier_in: number;
  brier_out: number | null;
  brier_null: number;
  ess: number;
  drift_z: number;
  drift_fired: boolean;
  ph_stat: number;
  ph_threshold: number;
  live_outcome_count: number;
  // Phase 21.1 D-26 new fields
  cv_folds: number;
  brier_lift: number;
  brier_lift_ci_bca_95: [number, number];
  p_value: number;              // one-sided: fraction of Purged-K-Fold folds with lift ≤ 0
  dsr: number | null;
  forward_returns: number[];    // for DSR computation (forward_return_sector_rel per outcome)
  // Full DB update payload (fields to write once status is known)
  db_update_data: Record<string, unknown>;
  // weighted posterior for DB overwrite
  alpha_new: number;
  beta_new: number;
  alpha_30d: number;
  beta_30d: number;
  n_trials_delta: number;
}

// ─── Recompute pass (per-cell metrics across all 216 cells) ─────────────────

// ─── Phase 19 Plan 19-A-07: hierarchical pooling + lake-of-cells pruning ──
//
// CORE-ML-11..14: pool (α, β) across cells in the same (signal_class,
// cap_class) group via empirical-Bayes method-of-moments. The cron writes
// parent_alpha, parent_beta, shrinkage_strength per cell — but NEVER
// overwrites the local α/β columns (RESEARCH §Pitfall 3 safe rollout).
// engine-context.ts computes α_pooled at READ time when the flag is enabled,
// so flipping the flag on or off cannot corrupt persisted state.
//
// CORE-ML-14 pruning: cells with raw_N === 0 AND `last_updated > 90 days
// ago` are deleted to keep the cell space from drifting into a lake of
// never-observed allocations.

type PoolingSummary = { groups: number; pooled_cells: number };

async function pruneIdleEmptyCells(): Promise<{ deleted: number }> {
  // CORE-ML-14: cells with raw_N=0 AND no observations in the last 90 days
  // are not allocated rows. Use last_updated as a proxy for last observation
  // (the cron's per-cell update touches it on every cycle, so an idle cell's
  // last_updated stays anchored at its allocation time).
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const result = await prisma.learnedPattern.deleteMany({
    where: {
      sample_size: 0,
      last_updated: { lt: cutoff },
    },
  });
  return { deleted: result.count };
}

async function applyHierarchicalPooling(): Promise<PoolingSummary> {
  // Read every allocated cell once, group by (signal_class, cap_class),
  // run hierarchicalPooledPosterior with the group's siblings, persist
  // parent_alpha/beta/shrinkage_strength per cell.
  const cells = await prisma.learnedPattern.findMany({
    where: { cap_class: { not: 'unknown' } },
    select: {
      id: true,
      signal_class: true,
      cap_class: true,
      alpha: true,
      beta: true,
      sample_size: true,
    },
  });

  const groups = new Map<string, typeof cells>();
  for (const c of cells) {
    const k = `${c.signal_class}|${c.cap_class}`;
    const arr = groups.get(k);
    if (arr) arr.push(c);
    else groups.set(k, [c]);
  }

  let pooled_cells = 0;
  for (const groupCells of groups.values()) {
    const groupBetas = groupCells.map((c) => ({ alpha: c.alpha, beta: c.beta }));
    for (const c of groupCells) {
      const result = hierarchicalPooledPosterior({
        cell_local: { alpha: c.alpha, beta: c.beta },
        cell_n: c.sample_size,
        group_cells: groupBetas,
      });
      await prisma.learnedPattern.update({
        where: { id: c.id },
        data: {
          // Pitfall 3 safe rollout: write parent + shrinkage only.
          // alpha/beta untouched — read-time pooling in engine-context.
          parent_alpha: result.parent_alpha,
          parent_beta: result.parent_beta,
          shrinkage_strength: result.shrinkage_strength,
        },
      });
      pooled_cells += 1;
    }
  }
  return { groups: groups.size, pooled_cells };
}

async function clearHierarchicalPoolingFields(): Promise<PoolingSummary> {
  // Old / control path for shadow A/B: nulls out parent_α/β/λ so any prior
  // pooled state is removed. Used as the baseline when flag is in shadow.
  const result = await prisma.learnedPattern.updateMany({
    where: { cap_class: { not: 'unknown' } },
    data: { parent_alpha: null, parent_beta: null, shrinkage_strength: null },
  });
  return { groups: 0, pooled_cells: result.count };
}

async function runHierarchicalPoolingStep(): Promise<void> {
  await runWithShadow<PoolingSummary>(
    'hierarchical-pooling',
    clearHierarchicalPoolingFields,
    applyHierarchicalPooling,
    FEATURES.hierarchical_pooling_mode,
    {},
  );
}

async function recomputePerSignalClassPatternMetrics(history: SpyHistory): Promise<void> {
  // Phase 17 — D-21: extends from dual-class (diffusion + technical) to
  // quad-class. Cell-space across the 3 traded cap_classes is
  // (4 + 8 + 8 + 8) patterns × 3 cap_classes × 6 horizons = 504 cells.
  //
  // Phase 18 — CONTEXT D-13: the cell space evolves over time (Plan 20 will
  // add a `regime` dimension; tests use throwaway cap_class values for
  // isolation). Iterate the cartesian product AND any rows that already exist
  // in the table (excluding the 'unknown' cap_class fallback) so every cell
  // touched by a write path also gets its ESS / weighted posterior recomputed.
  //
  // Phase 21.1 Wave 4 — CORE-ML-15/17/18/19: two-pass orchestration.
  //   PASS 1: evaluateOneCell — compute metrics (Brier, ESS, drift, lift, DSR)
  //           for each cell. Sequential to avoid Neon connection saturation.
  //   BY-FDR: benjaminiYekutieli over all per-cell p-values — denominator =
  //           total candidate cells evaluated this run (CONTEXT D-05).
  //   PASS 2: applyPatternStatusAndEmitEvents — write status + LearningEvents
  //           using the now-known q-values.

  const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;

  const keysToEvaluate: CellKey[] = [];
  const seen = new Set<string>();
  const enqueue = (key: CellKey) => {
    const k = `${key.signal_class}|${key.pattern_key}|${key.cap_class}|${key.horizon_days}`;
    if (seen.has(k)) return;
    seen.add(k);
    keysToEvaluate.push(key);
  };

  for (const signal_class of SIGNAL_CLASSES) {
    const patterns: readonly string[] =
      signal_class === 'diffusion'
        ? FLOW_PATTERNS
        : signal_class === 'technical'
          ? TECH_PATTERNS
          : signal_class === 'insider'
            ? INSIDER_PATTERNS
            : INSTITUTIONAL_PATTERNS;

    for (const pattern_key of patterns) {
      for (const cap_class of CAP_CLASSES) {
        for (const horizon_days of HORIZONS) {
          enqueue({ signal_class, pattern_key, cap_class, horizon_days });
        }
      }
    }
  }

  // Discover any extant cells outside the cartesian enumeration (e.g. test
  // fixtures, future Phase 20 regime keys) so they also get ESS recomputed.
  const existing = await prisma.learnedPattern.findMany({
    select: {
      signal_class: true,
      pattern_key: true,
      cap_class: true,
      horizon_days: true,
    },
    where: { cap_class: { not: 'unknown' } },
  });
  for (const row of existing) {
    enqueue({
      signal_class: row.signal_class as CellKey['signal_class'],
      pattern_key: row.pattern_key,
      cap_class: row.cap_class,
      horizon_days: row.horizon_days,
    });
  }

  // ─── PASS 1: evaluate all cells sequentially ───────────────────────────────
  // Sequential (not Promise.all) so Neon serverless connection pool isn't
  // saturated by 500+ concurrent queries. Each cell does 2–3 DB reads.
  const cellEvals: CellEvalResult[] = [];
  for (const key of keysToEvaluate) {
    try {
      const result = await evaluateOneCell(history, key);
      if (result !== null) cellEvals.push(result);
    } catch (err) {
      console.error('[learn] evaluateOneCell error', key, err);
    }
  }

  // ─── BY-FDR: Benjamini-Yekutieli over all per-cell p-values ───────────────
  // CONTEXT D-05: n_trials_attempted denominator = total cells evaluated this run.
  // BY is dependence-robust (cells share market regime) — CONTEXT D-02.
  const pValues = cellEvals.map((e) => e.p_value);
  const fdrResult = benjaminiYekutieli(pValues, 0.10);

  // ─── PASS 2: write status + emit LearningEvents ────────────────────────────
  await applyPatternStatusAndEmitEvents(cellEvals, fdrResult.adjusted_p);
}

/**
 * Phase 21.1 Wave 4 — CORE-ML-15/17/18/19.
 *
 * Evaluates one cell's metrics without writing status (patternStatus is applied
 * after BY-FDR runs across ALL cells). Returns null when the cell has no
 * observations (no metrics to compute).
 *
 * All existing Phase 18/19/27 logic (decay weights, ESS, Brier OOS, drift) is
 * preserved verbatim — this refactor adds Purged-K-Fold lift computation,
 * p-value, BCa CI, DSR, and live_outcome_count, and defers status assignment to
 * `applyPatternStatusAndEmitEvents`.
 */
async function evaluateOneCell(history: SpyHistory, key: CellKey): Promise<CellEvalResult | null> {
  const cell = await prisma.learnedPattern.findUnique({
    where: {
      signal_class_pattern_key_cap_class_horizon_days: {
        signal_class: key.signal_class,
        pattern_key: key.pattern_key,
        cap_class: key.cap_class,
        horizon_days: key.horizon_days,
      },
    },
  });
  if (!cell) return null; // never observed; no metrics to recompute

  const predMean = posteriorMean({ alpha: cell.alpha, beta: cell.beta });

  // Fetch all posterior_update events for this cell (bounded by what the
  // dedup index allows). For the diffusion class we still need to walk back
  // through DiffusionTrace + outcome to recompute hits; for the technical
  // class the LearningEvent.delta itself carries the hit boolean (written in
  // processOneOutcome below).
  const events = await prisma.learningEvent.findMany({
    where: {
      event_type: 'posterior_update',
      signal_class: key.signal_class,
      pattern_key: key.pattern_key,
      cap_class: key.cap_class,
      horizon_days: key.horizon_days,
    },
    orderBy: { occurred_at: 'asc' },
    take: 500,
  });

  const predictions: number[] = [];
  const outcomes: boolean[] = [];

  for (const ev of events) {
    const d = ev.delta as {
      diffusion_hit?: boolean;
      tech_hit?: boolean;
      insider_hit?: boolean;
      institutional_hit?: boolean;
      hit?: boolean;
    } | null;
    // Phase 17: insider/institutional do NOT fall back to legacy `hit`
    // because pre-Phase-17 events never had those snapshots.
    const hit =
      key.signal_class === 'diffusion'
        ? d?.diffusion_hit ?? d?.hit
        : key.signal_class === 'technical'
          ? d?.tech_hit ?? d?.hit
          : key.signal_class === 'insider'
            ? d?.insider_hit ?? null
            : d?.institutional_hit ?? null;
    if (typeof hit !== 'boolean') continue;
    predictions.push(predMean);
    outcomes.push(hit);
  }

  if (predictions.length === 0) return null;

  // ─── Phase 18: Decay weights + ESS + weighted posterior ───────────────────
  const lambdaDays = HYPERPARAMETERS[key.signal_class]?.lambda_days ?? 60;
  const now = new Date();
  const weightedObs: WeightedObservation[] = events
    .map((ev) => {
      const d = ev.delta as {
        diffusion_hit?: boolean;
        tech_hit?: boolean;
        insider_hit?: boolean;
        institutional_hit?: boolean;
        hit?: boolean;
      } | null;
      const hitVal =
        key.signal_class === 'diffusion'
          ? d?.diffusion_hit ?? d?.hit
          : key.signal_class === 'technical'
            ? d?.tech_hit ?? d?.hit
            : key.signal_class === 'insider'
              ? d?.insider_hit ?? null
              : d?.institutional_hit ?? null;
      if (typeof hitVal !== 'boolean') return null;
      return { hit: hitVal, recorded_at: ev.occurred_at };
    })
    .filter((o): o is WeightedObservation => o !== null);
  const weights = decayWeights(weightedObs, lambdaDays, now);
  const ess = computeESS(weights);
  const weightedPosterior = updatePosteriorWeighted({ alpha: 1, beta: 1 }, weightedObs, weights);

  const brier_in = brierScore(predictions, outcomes);
  const oosResult = computeBrierOOS(predictions, weightedObs, 0.2);
  const brier_out = oosResult.brier;
  const nullResult = adversarialNullBrier(predictions, outcomes, 100);

  // 30d rolling
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let alpha_30d = 1;
  let beta_30d = 1;
  for (const ev of events) {
    if (ev.occurred_at < cutoff30d) continue;
    const d = ev.delta as {
      diffusion_hit?: boolean;
      tech_hit?: boolean;
      insider_hit?: boolean;
      institutional_hit?: boolean;
      hit?: boolean;
    } | null;
    const hit =
      key.signal_class === 'diffusion'
        ? d?.diffusion_hit ?? d?.hit
        : key.signal_class === 'technical'
          ? d?.tech_hit ?? d?.hit
          : key.signal_class === 'insider'
            ? d?.insider_hit ?? null
            : d?.institutional_hit ?? null;
    if (hit === true) alpha_30d++;
    else if (hit === false) beta_30d++;
  }

  // ─── Phase 18: Per-observation deltas for Page-Hinkley ────────────────────
  const perObsDeltas: number[] = [];
  let runningAlpha = 1;
  let runningBeta = 1;
  for (const obs of weightedObs) {
    const runningMean = runningAlpha / (runningAlpha + runningBeta);
    perObsDeltas.push((obs.hit ? 1 : 0) - runningMean);
    if (obs.hit) runningAlpha += 1;
    else runningBeta += 1;
  }

  // ─── Phase 18: Two-of-two drift detection ─────────────────────────────────
  const phParams = HYPERPARAMETERS[key.signal_class] ?? HYPERPARAMETERS.diffusion;
  const drift = confirmedDrift({
    rolling: { alpha: alpha_30d, beta: beta_30d },
    allTime: { alpha: weightedPosterior.alpha, beta: weightedPosterior.beta },
    perObsDeltas,
    delta: phParams.ph_delta,
    lambdaPH: phParams.ph_lambda,
    rawN: cell.sample_size,
  });
  const drift_z = drift.drift_z;

  // ─── Phase 27 D-10: live-only count ───────────────────────────────────────
  const liveOutcomeCount = events.filter((ev) => {
    const d = ev.delta as { source?: string } | null;
    return d?.source !== 'backfill';
  }).length;

  // ─── Phase 21.1 D-26: Purged K-Fold lift + p-value + BCa CI ───────────────
  // Build Observation[] parallel to weightedObs for purgedKFold.
  // cell_key is needed by cv.ts but not used in the per-cell fold logic.
  const cvObs: Observation[] = weightedObs.map((o) => ({
    recorded_at: o.recorded_at,
    horizon_days: key.horizon_days,
    hit: o.hit,
    cell_key: `${key.signal_class}|${key.pattern_key}|${key.cap_class}|${key.horizon_days}`,
  }));

  // We need ≥ 5 folds of data. Use k=5 folds with shortened purge/embargo
  // when N is thin (purge/embargo at 1% of period range — documented in
  // HYPERPARAMETERS.md as DSR T<30 SKIP entry which governs the same floor).
  const K_FOLDS = 5;
  let cv_folds = 0;
  let brier_lift = 0;
  let brier_lift_ci_bca_95: [number, number] = [0, 0];
  let p_value = 1; // conservative: assume no lift until proven

  if (cvObs.length >= K_FOLDS) {
    const folds = purgedKFold(cvObs, K_FOLDS, key.horizon_days, key.horizon_days);
    cv_folds = folds.length;

    // Fold-wise Brier lifts: for each fold, train on trainIdx, predict on testIdx,
    // compare to null (base-rate) Brier. Since we use predMean (posterior mean)
    // as the prediction, the "model" prediction is constant at predMean.
    // lift_f = brier_null_f - brier_out_f
    const foldLifts: number[] = [];
    for (const fold of folds) {
      if (fold.testIdx.length < 2) continue;
      const testHits = fold.testIdx.map((i) => cvObs[i].hit);
      // Null = predict base rate (fraction of training hits)
      const trainHits = fold.trainIdx.map((i) => cvObs[i].hit);
      const baseRate = trainHits.length > 0 ? trainHits.filter(Boolean).length / trainHits.length : 0.5;
      const nullBrier = brierScore(Array(testHits.length).fill(baseRate), testHits);
      const modelBrier = brierScore(Array(testHits.length).fill(predMean), testHits);
      foldLifts.push(nullBrier - modelBrier);
    }

    if (foldLifts.length > 0) {
      brier_lift = foldLifts.reduce((a, b) => a + b, 0) / foldLifts.length;
      // One-sided p-value: fraction of folds with lift ≤ 0 (null: model ≤ baseline)
      p_value = foldLifts.filter((l) => l <= 0).length / foldLifts.length;
      // BCa CI over fold lifts (ISL Ch. 5 — bootstrap on fold-level statistics)
      const ciResult = bootstrapBCa(
        foldLifts,
        (s) => s.reduce((a, b) => a + b, 0) / Math.max(1, s.length),
        { nResamples: 1000, seed: 42 },
      );
      brier_lift_ci_bca_95 = [ciResult.low, ciResult.high];
    }
  }

  // ─── Phase 21.1 D-26 gate (e): Deflated Sharpe Ratio ─────────────────────
  // Returns from the sector-relative pct field per HYPERPARAMETERS.md §DSR
  // (continuous returns, not binary — per Bailey & López de Prado 2014).
  const forward_returns: number[] = events
    .map((ev) => {
      const d = ev.delta as { sector_relative_pct?: number; ticker_return_pct?: number } | null;
      // sector_relative_pct is the primary label (Phase 21 D-14); fall back to raw pct
      return d?.sector_relative_pct ?? d?.ticker_return_pct ?? null;
    })
    .filter((r): r is number => r !== null);

  let dsr: number | null = null;
  if (forward_returns.length >= 30) {
    const mean = forward_returns.reduce((a, b) => a + b, 0) / forward_returns.length;
    const variance = forward_returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (forward_returns.length - 1);
    const sd = Math.sqrt(Math.max(0, variance));
    const sampleSharpe = sd > 0 ? mean / sd : 0;
    const skewness = (() => {
      if (sd === 0) return 0;
      return (forward_returns.reduce((a, r) => a + ((r - mean) / sd) ** 3, 0) / forward_returns.length);
    })();
    const kurtosis = (() => {
      if (sd === 0) return 3;
      return (forward_returns.reduce((a, r) => a + ((r - mean) / sd) ** 4, 0) / forward_returns.length);
    })();
    dsr = deflatedSharpeRatio({
      sampleSharpe,
      skewness,
      kurtosis,
      T: forward_returns.length,
      nTrialsAttempted: Math.max(1, cell.n_trials_attempted ?? 1),
    });
  }

  // ─── Build DB update payload (status written by applyPatternStatusAndEmitEvents) ──
  const db_update_data = {
    brier_in_sample: brier_in,
    brier_out_sample: brier_out,
    brier_null: nullResult.mean_null_brier,
    alpha_30d,
    beta_30d,
    drift_z,
    effective_sample_size: ess,
    n_trials_attempted: { increment: events.length },
    alpha: weightedPosterior.alpha,
    beta: weightedPosterior.beta,
  };

  // SPY history is referenced for cross-cell windowing in future enhancements;
  // currently the per-cell loop pulls hits from LearningEvent.delta directly.
  void history;

  return {
    key,
    cell_id: cell.id,
    prev_status: cell.status ?? 'EXPLORATORY',
    brier_in,
    brier_out,
    brier_null: nullResult.mean_null_brier,
    ess,
    drift_z,
    drift_fired: drift.fired,
    ph_stat: drift.ph_stat,
    ph_threshold: drift.ph_threshold,
    live_outcome_count: liveOutcomeCount,
    cv_folds,
    brier_lift,
    brier_lift_ci_bca_95,
    p_value,
    dsr,
    forward_returns,
    db_update_data,
    alpha_new: weightedPosterior.alpha,
    beta_new: weightedPosterior.beta,
    alpha_30d,
    beta_30d,
    n_trials_delta: events.length,
  };
}

/**
 * Phase 21.1 Wave 4 — CORE-ML-15/17/18/19.
 *
 * PASS 2: Given cell evals + BY-FDR results, apply patternStatus per cell,
 * write the updated status to DB, emit drift_alert / drift_clear / cell_promoted /
 * cell_demoted LearningEvents.
 *
 * Called after benjaminiYekutieli() has run across all per-cell p-values so
 * every cell's q-value is known before any status flip is written.
 */
async function applyPatternStatusAndEmitEvents(
  evals: CellEvalResult[],
  fdrAdjustedP: number[],
): Promise<void> {
  for (let i = 0; i < evals.length; i++) {
    const e = evals[i];
    const by_fdr_q_value = fdrAdjustedP[i] ?? null;

    // ─── patternStatus (Phase 21.1 D-26 5-gate) ───────────────────────────
    let status: LearnedStatus = patternStatus({
      sample_size: 0,                       // ESS gate supersedes when ess is set
      effective_sample_size: e.ess,
      brier_in: e.brier_in,
      brier_out: e.brier_out,
      brier_null: e.brier_null,
      drift_z: e.drift_z,
      live_outcome_count: e.live_outcome_count,
      brier_lift_threshold: BRIER_LIFT_THRESHOLD,
      by_fdr_q_value,
      dsr: e.dsr,
    }) as LearnedStatus;

    // D-09: confirmed drift → EXPLORATORY-WATCH (no auto-demote, no silencing).
    if (e.drift_fired) {
      if (!STATUS_VALUES.includes('EXPLORATORY-WATCH' as LearnedStatus)) {
        throw new Error('STATUS_VALUES missing EXPLORATORY-WATCH — Plan 18-01 not applied');
      }
      status = 'EXPLORATORY-WATCH';
    } else if (e.prev_status === 'EXPLORATORY-WATCH') {
      // Recovery counter — D-09 step 4: 14 consecutive clear days needed.
      status = 'EXPLORATORY-WATCH';
    }

    // Phase 27 D-10: enforce live-only gate (already baked into patternStatus
    // gate (b), but enforceLiveOnlyGate provides an extra safety layer for
    // the drift/watch paths that bypass patternStatus).
    status = enforceLiveOnlyGate(status, e.live_outcome_count);

    // ─── Write status + Brier metrics to DB ───────────────────────────────
    await prisma.learnedPattern.update({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: e.key.signal_class,
          pattern_key: e.key.pattern_key,
          cap_class: e.key.cap_class,
          horizon_days: e.key.horizon_days,
        },
      },
      data: {
        ...(e.db_update_data as Parameters<typeof prisma.learnedPattern.update>[0]['data']),
        status,
      },
    });

    // ─── drift_alert / drift_clear emission (D-09, T-18-05) ───────────────
    if (e.drift_fired && e.prev_status !== 'EXPLORATORY-WATCH') {
      await prisma.learningEvent.create({
        data: {
          event_type: 'drift_alert',
          signal_class: e.key.signal_class,
          pattern_key: e.key.pattern_key,
          cap_class: e.key.cap_class,
          horizon_days: e.key.horizon_days,
          delta: {
            drift_z: e.drift_z,
            ph_stat: e.ph_stat,
            ph_threshold: e.ph_threshold,
            raw_n: 0,   // raw sample_size — 0 sentinel as we use ESS; future plan may add
            ess: e.ess,
          } as Parameters<typeof prisma.learningEvent.create>[0]['data']['delta'],
          message: `${e.key.signal_class}/${e.key.pattern_key} × ${e.key.cap_class} @${e.key.horizon_days}d: confirmed drift (z=${e.drift_z.toFixed(2)}, PH=${e.ph_stat.toFixed(2)}, ess=${e.ess.toFixed(1)}). ACTION: investigate underlying signal regime; do NOT auto-demote (D-09).`,
        },
      });
    } else if (!e.drift_fired && e.prev_status === 'EXPLORATORY-WATCH') {
      await prisma.learningEvent.create({
        data: {
          event_type: 'drift_clear',
          signal_class: e.key.signal_class,
          pattern_key: e.key.pattern_key,
          cap_class: e.key.cap_class,
          horizon_days: e.key.horizon_days,
          delta: {
            drift_z: e.drift_z,
            ph_stat: e.ph_stat,
            ess: e.ess,
          } as Parameters<typeof prisma.learningEvent.create>[0]['data']['delta'],
          message: `${e.key.signal_class}/${e.key.pattern_key}: drift clear (1 of 14 days needed for ACTIVE recovery)`,
        },
      });
    }

    // ─── Phase 21.1 D-27: cell_promoted / cell_demoted events ─────────────
    if (status !== e.prev_status) {
      const isPromotion = status === 'ACTIVE';
      const isDemotion = e.prev_status === 'ACTIVE' && status !== 'ACTIVE';
      if (isPromotion || isDemotion) {
        const eventType = isPromotion ? 'cell_promoted' : 'cell_demoted';
        await prisma.learningEvent.create({
          data: {
            event_type: eventType,
            signal_class: e.key.signal_class,
            pattern_key: e.key.pattern_key,
            cap_class: e.key.cap_class,
            horizon_days: e.key.horizon_days,
            // D-27: full evaluation context — replayable for the IS paper.
            delta: {
              cv_folds: e.cv_folds,
              brier_lift: e.brier_lift,
              brier_lift_ci_bca_95: e.brier_lift_ci_bca_95,
              q_value_by: by_fdr_q_value,
              dsr: e.dsr,
              n_trials_attempted: e.n_trials_delta,
              prev_status: e.prev_status,
              new_status: status,
            } as Parameters<typeof prisma.learningEvent.create>[0]['data']['delta'],
            message: `cell ${eventType}: ${e.key.signal_class}/${e.key.pattern_key}/${e.key.cap_class}/${e.key.horizon_days}d (lift=${e.brier_lift.toFixed(4)}, q=${by_fdr_q_value?.toFixed(4) ?? 'null'}, dsr=${e.dsr?.toFixed(3) ?? 'null'})`,
          },
        });
      }
    }
  }
}

// ─── Logistic state read/write ──────────────────────────────────────────────

async function loadCurrentLogisticState(): Promise<LogisticState> {
  const last = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
  if (!last) return initLogisticState([...FEATURE_NAMES]);

  const c = last.coefficients as Record<string, { mu: number; sigma: number }>;

  // Pitfall 5 — RESEARCH §8 lines 925-930: the legacy 6-d state must be
  // discarded on the first post-Phase-16 cycle, NOT padded with zeros.
  if (needsLogisticReinit(c)) {
    console.log('[learn] First post-Phase-16 cycle: reinitializing logistic to 12-d zero state.');
    return initLogisticState([...FEATURE_NAMES]);
  }

  return {
    intercept: last.intercept,
    intercept_var: ((c['_intercept']?.sigma) ?? 1) ** 2,
    weights: FEATURE_NAMES.map((n) => c[n]?.mu ?? 0),
    weight_vars: FEATURE_NAMES.map((n) => (c[n]?.sigma ?? 1) ** 2),
    feature_names: [...FEATURE_NAMES],
  };
}

async function persistLogisticEpoch(
  state: LogisticState,
  brier_in: number,
  brier_out: number,
  sampleSize: number,
): Promise<void> {
  const last = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
  const epoch = (last?.epoch ?? 0) + 1;
  const coefficients: Record<string, { mu: number; sigma: number }> = {
    _intercept: { mu: state.intercept, sigma: Math.sqrt(state.intercept_var) },
  };
  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    coefficients[FEATURE_NAMES[i]] = {
      mu: state.weights[i],
      sigma: Math.sqrt(state.weight_vars[i]),
    };
  }
  await prisma.logisticEpoch.create({
    data: { epoch, coefficients, intercept: state.intercept, brier_in, brier_out, sample_size: sampleSize },
  });
}

// ─── Cycle summary + prune (unchanged from pre-Phase-16) ─────────────────────

async function maybeWriteCycleSummary(stats: {
  outcomes_processed: number;
  hits: number;
  drift_alerts: number;
  cells_active: number;
}): Promise<void> {
  let message = `Cycle summary: ${stats.outcomes_processed} outcomes resolved (${stats.hits} hits), ${stats.drift_alerts} drift alerts, ${stats.cells_active} active cells.`;
  try {
    const { text } = await generateText({
      model: 'anthropic/claude-haiku-4.6',
      prompt: renderPrompt('gemini-cycle-summary', {
        outcomes_processed: String(stats.outcomes_processed),
        hits: String(stats.hits),
        drift_alerts: String(stats.drift_alerts),
        cells_active: String(stats.cells_active),
      }),
    });
    if (text && text.length > 0 && text.length < 400) message = text.trim();
  } catch {
    // fall back to deterministic summary
  }
  await prisma.learningEvent.create({
    data: {
      event_type: 'cycle_summary',
      delta: stats,
      message,
    },
  });
}

async function pruneOldEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await prisma.learningEvent.deleteMany({ where: { occurred_at: { lt: cutoff } } });
}

// ─── Per-outcome processing — atomic, dual-class, idempotent ─────────────────

interface ProcessOutcomeResult {
  trace_built: boolean;
  hit: boolean | null;
  used_logistic: boolean;
  diffusion_x12: number[] | null;
  diffusion_y: 0 | 1 | null;
}

async function processOneOutcome(
  outcome: ResolvedOutcome,
  history: SpyHistory,
  logisticStateRef: { state: LogisticState },
): Promise<ProcessOutcomeResult> {
  const result: ProcessOutcomeResult = {
    trace_built: false,
    hit: null,
    used_logistic: false,
    diffusion_x12: null,
    diffusion_y: null,
  };

  // Reconstruct trace OUTSIDE the transaction — pure read with sub-queries.
  const built = await buildTraceForOutcome(outcome);
  const trace = built?.trace ?? null;
  if (trace) result.trace_built = true;

  // Resolve SPY-relative hit BEFORE the transaction so the tx body stays small.
  const spyAtScan = nearestSpyClose(history, outcome.scanned_at);
  const spyAtOutcome = nearestSpyClose(history, outcome.recorded_at);
  if (spyAtScan == null || spyAtOutcome == null) {
    // Cannot evaluate hit. Still write a LearningEvent so the outcome doesn't
    // get re-attempted on every cron retry.
    await prisma.learningEvent.create({
      data: {
        event_type: 'posterior_update',
        ticker: outcome.ticker,
        outcome_id: outcome.outcome_id,
        signal_class: null,
        pattern_key: null,
        cap_class: trace?.cap_class ?? null,
        horizon_days: outcome.days_after,
        delta: { skipped: 'no_spy_data', horizon: outcome.days_after },
        message: `${outcome.ticker}: no SPY data either side → skipped (horizon=${outcome.days_after}d)`,
      },
    });
    return result;
  }
  const spyReturn = ((spyAtOutcome - spyAtScan) / spyAtScan) * 100;
  const hit = classifyHit({
    ticker_return_pct: outcome.ticker_return_pct,
    spy_return_pct: spyReturn,
    sector_relative_pct: outcome.sector_relative_pct,
  });
  result.hit = hit;

  await prisma.$transaction(async (tx) => {
    const techSnap = await readTechSnapshotForOutcome(outcome, tx);
    const techPattern: TechPattern | null = techSnap?.tech_pattern ?? null;
    const insiderBucket = await readInsiderBucketForOutcome(outcome, tx);
    const institutionalBucket = await readInstitutionalBucketForOutcome(outcome, tx);
    const horizon = outcome.days_after as Horizon | number;

    // Resolve cap_class via fallback chain so single-snapshot tickers (no trace)
    // and older snapshots written before cap_class was persisted both populate cells.
    //   1. trace.cap_class (full window classification)
    //   2. snapshot.community_data.cap_class (current scan layout)
    //   3. classifyCapClass(snapshot.community_data.market_cap) (legacy snapshots)
    // Without all three, the upsert silently drops to 'unknown' → 0 technical cells.
    let resolvedCap: string | null = trace?.cap_class ?? null;
    if (!resolvedCap && outcome.snapshot_id) {
      const snap = await tx.sentimentSnapshot.findUnique({
        where: { id: outcome.snapshot_id },
        select: { community_data: true },
      });
      const cd = snap?.community_data as { cap_class?: string; market_cap?: number } | null;
      if (cd?.cap_class && cd.cap_class !== 'unknown') {
        resolvedCap = cd.cap_class;
      } else if (cd?.market_cap != null) {
        const derived = classifyCapClass(cd.market_cap);
        if (derived !== 'unknown') resolvedCap = derived;
      }
    }

    // Persist the diffusion trace alongside the cell update (preserves
    // pre-Phase-16 DiffusionTrace history for downstream dashboards).
    if (trace && built) {
      await tx.diffusionTrace.create({
        data: {
          ticker: outcome.ticker,
          cap_class: trace.cap_class,
          end_at: outcome.scanned_at,
          window_cycles: trace.source_count,
          v_niche: trace.v_niche,
          v_middle: trace.v_middle,
          v_mainstream: trace.v_mainstream,
          q_z: trace.q_z,
          qual_z: trace.qual_z,
          niche_lead_cycles: trace.niche_lead_cycles,
          flow_pattern: trace.flow_pattern,
          source_snapshot_ids: built.snapshotIds,
        },
      });
    }

    // 1. Diffusion cell update — fires when trace exists and pattern is informative.
    if (trace && trace.flow_pattern !== 'flat') {
      await upsertCell(
        tx,
        {
          signal_class: 'diffusion',
          pattern_key: trace.flow_pattern,
          cap_class: trace.cap_class,
          horizon_days: horizon,
        },
        hit,
      );
    }

    // 2. Technical cell update — fires when a tech_pattern was classified
    //    at snapshot time AND cap_class is resolvable from trace or snapshot.
    if (techPattern && resolvedCap) {
      await upsertCell(
        tx,
        {
          signal_class: 'technical',
          pattern_key: techPattern,
          cap_class: resolvedCap,
          horizon_days: horizon,
        },
        hit,
      );
    }

    // 2a. Insider cell update — fires when the snapshot was classified
    //     into one of 8 insider buckets AND cap_class is resolvable. (D-21)
    if (insiderBucket && resolvedCap) {
      await upsertCell(
        tx,
        {
          signal_class: 'insider',
          pattern_key: insiderBucket,
          cap_class: resolvedCap,
          horizon_days: horizon,
        },
        hit,
      );
    }

    // 2b. Institutional cell update — fires when the snapshot was classified
    //     into one of 8 institutional buckets AND cap_class is resolvable. (D-21)
    if (institutionalBucket && resolvedCap) {
      await upsertCell(
        tx,
        {
          signal_class: 'institutional',
          pattern_key: institutionalBucket,
          cap_class: resolvedCap,
          horizon_days: horizon,
        },
        hit,
      );
    }

    // 3. Logistic update — fires on any horizon ≥ 7d when both trace and techSnap
    //    are present (full 12-feature vector). Was previously 30d-only, which
    //    meant the logistic stayed at all-zero weights for ~30 days after first
    //    snapshots — too long a cold-start. 7d outcomes are still informative
    //    for forward probability of >1% excess vs SPY; we accept the modest
    //    horizon-mixing cost in exchange for an order-of-magnitude faster
    //    bootstrap of the model weights.
    if (horizon >= 7 && trace && techSnap) {
      const x12 = buildFeatureVector12(trace, techSnap, techPattern);
      logisticStateRef.state = updateLogistic(logisticStateRef.state, x12, hit ? 1 : 0);
      result.used_logistic = true;
      result.diffusion_x12 = x12;
      result.diffusion_y = hit ? 1 : 0;
    }

    // 4. LearningEvent — commit point. outcome_id is the dedup key picked up
    //    by loadUnprocessedOutcomes on subsequent runs.
    await tx.learningEvent.create({
      data: {
        event_type: 'posterior_update',
        ticker: outcome.ticker,
        outcome_id: outcome.outcome_id,
        // Primary signal class for this row — used by the recompute pass to
        // attribute the event to one cell when computing per-cell Brier.
        // Phase 17: insider > institutional > technical > diffusion (D-21)
        signal_class: insiderBucket
          ? 'insider'
          : institutionalBucket
            ? 'institutional'
            : techPattern
              ? 'technical'
              : trace
                ? 'diffusion'
                : null,
        pattern_key:
          insiderBucket
          ?? institutionalBucket
          ?? techPattern
          ?? trace?.flow_pattern
          ?? null,
        cap_class: resolvedCap,
        horizon_days: horizon,
        delta: {
          // Per-class hit booleans — recompute pass attributes one outcome
          // to up to 4 cells. All four mirror the same hit because the same
          // outcome drives them; the booleans only mark which cells WERE
          // updated for this outcome.
          diffusion_hit: trace && trace.flow_pattern !== 'flat' ? hit : null,
          tech_hit: techPattern ? hit : null,
          insider_hit: insiderBucket ? hit : null,
          institutional_hit: institutionalBucket ? hit : null,
          hit, // legacy compatibility
          ticker_return_pct: outcome.ticker_return_pct,
          spy_return_pct: spyReturn,
          horizon,
          tech_pattern: techPattern,
          flow_pattern: trace?.flow_pattern ?? null,
          insider_bucket: insiderBucket,
          institutional_bucket: institutionalBucket,
          source: outcome.snapshot_source ?? 'live',   // Phase 27 D-10 — live vs backfill provenance for the promotion gate
        },
        message: `${outcome.ticker} @${horizon}d: ${hit ? 'HIT' : 'MISS'} — ticker ${outcome.ticker_return_pct.toFixed(2)}% vs SPY ${spyReturn.toFixed(2)}% / vs ${outcome.sector_etf ?? 'sector–'} ${outcome.sector_relative_pct?.toFixed(2) ?? '–'}% [flow=${trace?.flow_pattern ?? '–'} / tech=${techPattern ?? '–'} / insider=${insiderBucket ?? '–'} / inst=${institutionalBucket ?? '–'}]`,
      },
    });
  });

  return result;
}

// ─── Top-level handler ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = {
    outcomes_processed: 0,
    hits: 0,
    traces_built: 0,
    drift_alerts: 0,
    cells_active: 0,
    errors: 0,
    logistic_updates: 0,
  };

  try {
    const existingPatternCount = await prisma.learnedPattern.count();
    const isBackfill = existingPatternCount === 0;

    const history = await fetchSpyHistory(100);
    const outcomes = await loadUnprocessedOutcomes({ isBackfill });

    // Pitfall 5: single load + reinit detection up front so the rest of the
    // run sees the right shape. logisticStateRef wraps the state so each
    // per-outcome 30d update mutates the same reference.
    const logisticStateRef = { state: await loadCurrentLogisticState() };

    const trainingX: number[][] = [];
    const trainingY: (0 | 1)[] = [];

    for (const o of outcomes) {
      try {
        const r = await processOneOutcome(o, history, logisticStateRef);
        if (r.trace_built) stats.traces_built++;
        if (r.hit === true) stats.hits++;
        if (r.used_logistic && r.diffusion_x12 && r.diffusion_y !== null) {
          stats.logistic_updates++;
          trainingX.push(r.diffusion_x12);
          trainingY.push(r.diffusion_y);
        }
        stats.outcomes_processed++;
      } catch (err) {
        stats.errors++;
        console.error('[learn] outcome error', o.outcome_id, err);
      }
    }

    // Recompute aggregate metrics + drift across all 216 cells. Always runs
    // (even with 0 new outcomes) so cell metrics catch up after data backfills.
    await recomputePerSignalClassPatternMetrics(history);

    // Plan 19-A-07: prune lake-of-cells (CORE-ML-14: raw_N=0 AND idle 90d),
    // then apply empirical-Bayes hierarchical pooling under shadow A/B.
    // Pooling persists parent_α/β/λ only — local α/β are NEVER overwritten
    // (RESEARCH §Pitfall 3). engine-context.ts surfaces α_pooled at READ time.
    await pruneIdleEmptyCells();
    await runHierarchicalPoolingStep();

    // Persist a fresh LogisticEpoch when the regression saw any 30d updates,
    // OR on the first post-Phase-16 cycle (so the new 12-d zero state is
    // captured and needsLogisticReinit returns false next time).
    if (trainingX.length > 0) {
      const preds = trainingX.map((x) => predictLogistic(logisticStateRef.state, x));
      const outs = trainingY.map((y) => y === 1);
      const brier_in = brierScore(preds, outs);
      // Plan 19-A-02 / D-18: chronological 80/20 split. The training arrays
      // are populated in `outcomes` iteration order, which is
      // `recorded_at: 'asc'` from loadUnprocessedOutcomes — i.e. already
      // chronological. Synthesize an index-based recorded_at so timeBasedSplit
      // can do the partition (guarantees ≥1 test row when len ≥ 2; replaces
      // the n-14 silent 0-row OOS bug).
      const indexed = preds.map((p, i) => ({
        recorded_at: new Date(i),
        pred: p,
        out: outs[i],
      }));
      const { test } = timeBasedSplit(indexed, 0.2);
      // Logistic Brier persistence schema requires Float (non-null) — record 0
      // as a sentinel "insufficient OOS rows" when test set is too small.
      // Subsequent cycles with more data will overwrite this in a new epoch.
      const brier_out =
        test.length >= 5
          ? brierScore(
              test.map((t) => t.pred),
              test.map((t) => t.out),
            )
          : 0;
      await persistLogisticEpoch(logisticStateRef.state, brier_in, brier_out, trainingX.length);
    } else {
      // Pitfall 5 second half: if the latest persisted epoch is still legacy
      // 6-d, persist the freshly-initialized 12-d state so subsequent cycles
      // start from the new shape even if there were no 30d outcomes today.
      const last = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
      const lastCoefs = last?.coefficients as Record<string, { mu: number; sigma: number }> | undefined;
      if (needsLogisticReinit(lastCoefs)) {
        await persistLogisticEpoch(logisticStateRef.state, 0, 0, 0);
      }
    }

    // Active cells count for summary
    stats.cells_active = await prisma.learnedPattern.count({ where: { status: 'ACTIVE' } });
    stats.drift_alerts = await prisma.learningEvent.count({
      where: {
        event_type: 'drift_alert',
        occurred_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (stats.outcomes_processed > 0) {
      await maybeWriteCycleSummary({
        outcomes_processed: stats.outcomes_processed,
        hits: stats.hits,
        drift_alerts: stats.drift_alerts,
        cells_active: stats.cells_active,
      });
    }

    await pruneOldEvents();

    return NextResponse.json({ ok: true, isBackfill, ...stats });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Learn cron failed', ...stats },
      { status: 500 },
    );
  }
}
