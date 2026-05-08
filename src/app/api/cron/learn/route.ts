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
  type LogisticState,
  type WeightedObservation,
  type LearnedStatus,
} from '@/lib/learning';
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
  source: 'report' | 'snapshot';
  source_id: string;
  snapshot_id: string | null;
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
        source: 'snapshot',
        source_id: o.snapshot.id,
        snapshot_id: o.snapshot.id,
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
        source: 'report',
        source_id: o.report.id,
        snapshot_id: null,
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
  const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;

  const tasks: Array<Promise<void>> = [];
  const seen = new Set<string>();
  const enqueue = (key: CellKey) => {
    const k = `${key.signal_class}|${key.pattern_key}|${key.cap_class}|${key.horizon_days}`;
    if (seen.has(k)) return;
    seen.add(k);
    tasks.push(recomputeOneCell(history, key));
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

  await Promise.all(tasks);
}

async function recomputeOneCell(history: SpyHistory, key: CellKey): Promise<void> {
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
  if (!cell) return; // never observed; no metrics to recompute

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

  if (predictions.length === 0) return;

  // ─── Phase 18: Decay weights + ESS + weighted posterior ───────────────────
  // CONTEXT D-03 (Kish), D-04 (ESS<30 gate via patternStatus extension),
  // D-15 (n_trials_attempted populated). Pure primitives from Plan 18-01.
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
  // Plan 19-A-02 / D-18: replace buggy max(1, n-14) split (silent 0-row OOS
  // at n<16 → trivial Brier=0 disguise) with chronological 80/20 split via
  // computeBrierOOS. Returns { brier: null, reason } when n_test<5 instead of
  // a meaningless number. We persist `null` to brier_out_sample in that case.
  // Pair predictions with the chronological event ordering — `events` and
  // `weightedObs` are both populated in `events.orderBy: { occurred_at: 'asc' }`
  // order above, so weightedObs is the canonical recorded_at carrier.
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
  // For each event in chronological order, compute residual =
  // (hit ? 1 : 0) − running_posterior_mean_before_i. Page-Hinkley accumulates
  // these residuals to detect sustained shifts (CONTEXT D-06).
  const perObsDeltas: number[] = [];
  let runningAlpha = 1;
  let runningBeta = 1;
  for (const obs of weightedObs) {
    const runningMean = runningAlpha / (runningAlpha + runningBeta);
    const obsValue = obs.hit ? 1 : 0;
    perObsDeltas.push(obsValue - runningMean);
    if (obs.hit) runningAlpha += 1;
    else runningBeta += 1;
  }

  // ─── Phase 18: Two-of-two drift detection (CONTEXT D-06, D-08, D-09) ─────
  // confirmedDrift fires iff (raw N≥30 AND |drift_z|>2 AND ph_stat>0). The
  // weighted posterior drives the all-time leg of drift_z so concept-drift
  // defenses operate against decay-weighted reality, not stale raw counts.
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

  let status: LearnedStatus = patternStatus({
    sample_size: cell.sample_size,
    effective_sample_size: ess,                          // D-04 ESS<30 → EXPLORATORY supersedes raw N gate
    brier_in,
    brier_out,
    brier_null: nullResult.mean_null_brier,
    drift_z,
  }) as LearnedStatus;

  // D-09: confirmed drift → EXPLORATORY-WATCH (no auto-demote, no silencing).
  // STATUS_VALUES validates the literal at write time (T-18-04 mitigation).
  if (drift.fired) {
    if (!STATUS_VALUES.includes('EXPLORATORY-WATCH' as LearnedStatus)) {
      throw new Error('STATUS_VALUES missing EXPLORATORY-WATCH — Plan 18-01 not applied');
    }
    status = 'EXPLORATORY-WATCH';
  } else if (cell.status === 'EXPLORATORY-WATCH') {
    // Recovery counter — D-09 step 4: 14 consecutive clear days needed to
    // flip back to ACTIVE. Plan 09 derives the count from drift_clear rows.
    // Hold the watch state until that counter is satisfied.
    status = 'EXPLORATORY-WATCH';
  }

  const prevStatus = cell.status;
  await prisma.learnedPattern.update({
    where: {
      signal_class_pattern_key_cap_class_horizon_days: {
        signal_class: key.signal_class,
        pattern_key: key.pattern_key,
        cap_class: key.cap_class,
        horizon_days: key.horizon_days,
      },
    },
    data: {
      brier_in_sample: brier_in,
      brier_out_sample: brier_out,
      brier_null: nullResult.mean_null_brier,
      alpha_30d,
      beta_30d,
      drift_z,
      status,
      // Phase 18: decay-weighted posterior + ESS + n_trials_attempted (D-15).
      effective_sample_size: ess,
      n_trials_attempted: { increment: events.length },
      alpha: weightedPosterior.alpha,                    // overwrites raw +1/+0 with decayed sum
      beta: weightedPosterior.beta,
    },
  });

  // ─── Phase 18: drift_alert / drift_clear emission (decisions D09, T18.05)
  // drift_alert fires only on a cell-level transition INTO drift (prev status
  // wasn't already EXPLORATORY-WATCH from a previous fire) so the alert
  // remains idempotent across cron retries on a stationary regime — D-09 step 3.
  if (drift.fired && prevStatus !== 'EXPLORATORY-WATCH') {
    await prisma.learningEvent.create({
      data: {
        event_type: 'drift_alert',
        signal_class: key.signal_class,
        pattern_key: key.pattern_key,
        cap_class: key.cap_class,
        horizon_days: key.horizon_days,
        // Numeric-only payload — T-18-05 mitigation. Downstream readers
        // Zod-validate via z.object({drift_z, ph_stat, ph_threshold, raw_n, ess}).
        delta: {
          drift_z: drift.drift_z,
          ph_stat: drift.ph_stat,
          ph_threshold: drift.ph_threshold,
          raw_n: cell.sample_size,
          ess,
        },
        // D-17 operational action surfaced in message string for dashboard.
        message: `${key.signal_class}/${key.pattern_key} × ${key.cap_class} @${key.horizon_days}d: confirmed drift (z=${drift.drift_z.toFixed(2)}, PH=${drift.ph_stat.toFixed(2)}, raw_n=${cell.sample_size}, ess=${ess.toFixed(1)}). ACTION: investigate underlying signal regime; do NOT auto-demote (D-09).`,
      },
    });
  } else if (!drift.fired && cell.status === 'EXPLORATORY-WATCH') {
    // Drift-clear marker — counted by Plan 09 recovery state machine.
    // Emit one row per cron tick that the cell shows clear signals so the
    // 14-consecutive-day recovery counter has rows to count.
    await prisma.learningEvent.create({
      data: {
        event_type: 'drift_clear',
        signal_class: key.signal_class,
        pattern_key: key.pattern_key,
        cap_class: key.cap_class,
        horizon_days: key.horizon_days,
        delta: {
          drift_z: drift.drift_z,
          ph_stat: drift.ph_stat,
          raw_n: cell.sample_size,
          ess,
        },
        message: `${key.signal_class}/${key.pattern_key}: drift clear (1 of 14 days needed for ACTIVE recovery)`,
      },
    });
  }
  // SPY history is referenced for cross-cell windowing in future enhancements;
  // currently the per-cell loop pulls hits from LearningEvent.delta directly.
  void history;
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
      model: 'anthropic/claude-haiku-4.5',
      prompt: `Write a single-sentence research-log entry summarizing today's diffusion engine cycle. Do not use bullet points. Stats: ${stats.outcomes_processed} new outcomes resolved across all horizons, ${stats.hits} were hits (>1% excess vs SPY), ${stats.drift_alerts} drift alerts triggered, ${stats.cells_active} pattern cells currently ACTIVE. Keep under 30 words. Plain text, no quotes.`,
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
  const hit = classifyHit({ ticker_return_pct: outcome.ticker_return_pct, spy_return_pct: spyReturn });
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
        },
        message: `${outcome.ticker} @${horizon}d: ${hit ? 'HIT' : 'MISS'} — ticker ${outcome.ticker_return_pct.toFixed(2)}% vs SPY ${spyReturn.toFixed(2)}% [flow=${trace?.flow_pattern ?? '–'} / tech=${techPattern ?? '–'} / insider=${insiderBucket ?? '–'} / inst=${institutionalBucket ?? '–'}]`,
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
