// src/lib/engine-context.ts
// Read-only snapshot of the Cipher learning engine's beliefs about a ticker
// at report-generation time. The returned object is the single contract every
// downstream component (Gemini prompt, EngineCalibrationPanel) reads from.
//
// No new math here — this layer composes existing primitives:
//   - computeDiffusionTrace + classifyCapClass from diffusion-trace.ts
//   - predictLogistic + credibleInterval95 + buildFeatureVector12 from learning.ts
//   - LearnedPattern / LogisticEpoch / LearningEvent / SentimentSnapshot from Prisma
//
// Phase 16 extension (16-04):
//   - Adds technical_* fields parallel to the diffusion fields, keyed on
//     (signal_class='technical', pattern_key=tech_pattern, cap_class, horizon_days=30)
//   - Adds horizon_calibrations[] — 6 entries × {3,7,14,30,60,90} days × both signal classes
//   - Adds agreement classification (deterministic, post-process safe)
//   - Adds combined_logistic_score from the 12-d Bayesian logistic
//
// Phase 17 extension (17-04):
//   - Adds institutional_* + insider_* fields (10 numeric/categorical fields per D-04)
//   - computeAgreementNWay: N-way agreement over 4 signal classes
//   - readHorizonCalibrations grows from 12 cells (2×6) to 24 cells (4×6)
//   - Institutional + insider bucket resolution from snapshot data (same pattern as technical)
//   - D-22 preserved: 12-d logistic in learning.ts is NOT extended
//
// The "trust boundary" sits here: numeric fields produced by this module are
// authoritative — Gemini cannot override them.

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import YahooFinance from 'yahoo-finance2';
import {
  computeDiffusionTrace,
  classifyCapClass,
  type FlowPattern,
  type CapClass,
  type SnapshotInput,
} from './diffusion-trace';

const yfQuote = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function fetchLivePrice(ticker: string): Promise<number | null> {
  try {
    const q = await yfQuote.quote(ticker);
    return typeof q.regularMarketPrice === 'number' && q.regularMarketPrice > 0
      ? q.regularMarketPrice
      : null;
  } catch {
    return null;
  }
}
import {
  predictLogistic,
  credibleInterval95,
  posteriorMean,
  patternStatus,
  buildFeatureVector12,
  FEATURE_NAMES,
  type LogisticState,
} from './learning';
import { FEATURES } from './features';

// ─── Plan 19-A-07: read-time hierarchical pooling (RESEARCH §Pitfall 3) ─────
//
// The cron persists local α/β AND parent_α/β/λ separately; we recombine here
// so the canonical posterior remains local while the *displayed* posterior
// inherits parent strength when the flag is on. Flipping the flag therefore
// never corrupts persisted state — only the read view changes.
//
// Formula:
//   n         = α_local + β_local
//   α_pooled  = (n × α_local + λ × α_parent) / (n + λ)
//   β_pooled  = (n × β_local + λ × β_parent) / (n + λ)
//
// Cell view: when FEATURES.hierarchical_pooling_enabled is false OR the cell
// row has no parent_alpha (cold-start, sparse group, or pre-cutover backfill),
// we surface the local posterior unchanged.

type PooledBetaCell = {
  alpha: number;
  beta: number;
  sample_size?: number;
  parent_alpha?: number | null;
  parent_beta?: number | null;
  shrinkage_strength?: number | null;
};

function pooledBeta(cell: PooledBetaCell): { alpha: number; beta: number } {
  // Honesty guard (engine-review 2026-06-17 fix #2): if the cell has zero
  // local observations, pooling silently substitutes the parent regime's
  // posterior — UI then renders parent-base-rate confidence as if it were
  // specific to this (pattern × cap × horizon). Surface the un-shrunk
  // local Beta(1,1) prior instead so downstream NO_DATA handling fires.
  if (cell.sample_size != null && cell.sample_size <= 0) {
    return { alpha: cell.alpha, beta: cell.beta };
  }
  if (
    !FEATURES.hierarchical_pooling_enabled ||
    cell.parent_alpha == null ||
    cell.parent_beta == null ||
    cell.shrinkage_strength == null
  ) {
    return { alpha: cell.alpha, beta: cell.beta };
  }
  const n = cell.alpha + cell.beta;
  const lambda = cell.shrinkage_strength;
  const alpha_pooled =
    (n * cell.alpha + lambda * cell.parent_alpha) / (n + lambda);
  const beta_pooled =
    (n * cell.beta + lambda * cell.parent_beta) / (n + lambda);
  return { alpha: alpha_pooled, beta: beta_pooled };
}
import { lightweightCommunityScan } from './data/lightweight-community-scan';
import { computeTechnicalSnapshot } from './data/technical';
import { fetchInsiderData } from './data/insider';
import { fetchInstitutionalData } from './data/institutional';
// Phase 21 (21-4-07) — sector-relative headline + SPY-alpha "vs market" diagnostic.
import { getSectorETF } from './data/sector-mapping';
import { computeSpyAlphaHitRate } from './data/spy-alpha';
import type { TechPattern, TechnicalSnapshot, HorizonCalibration, InsiderSnapshot, InstitutionalSnapshot, InsiderBucket, InstitutionalBucket } from './types';
// ─── Plan 19-C-10 (D-42) — Cross-class contradiction detector (DETECTION-ONLY) ──
//
// DETECTION-ONLY MODE — PERMANENT for Phase 19. The detector NEVER gates the
// gemini-analysis output; it only feeds an additive `contradiction_warnings`
// array consumed by EngineCalibrationPanel. Upgrading to gating mode requires
// a separate plan + new decision (out of scope for Phase 19).
import { detectContradictions } from './sentiment/contradiction-detector';

// Match the order used by /api/cron/learn (FEATURE_NAMES) for the 6-d diffusion
// logistic forward pass. Phase 16 introduces the 12-d combined logistic that uses
// FEATURE_NAMES from learning.ts directly.
export const ENGINE_FEATURE_NAMES = [
  'v_niche', 'v_middle', 'v_mainstream', 'niche_lead_cycles', 'q_z', 'qual_z',
] as const;

const HORIZONS = [3, 7, 14, 30, 60, 90] as const;
type Horizon = typeof HORIZONS[number];
// Phase 18-07: 'EXPLORATORY-WATCH' added to the local CellStatus union — Plan
// 18-04 cron flips a cell to this literal when confirmedDrift fires (D-09).
// EngineCalibration types in src/lib/types.ts mirror this union.
type CellStatus = 'ACTIVE' | 'EXPLORATORY' | 'EXPLORATORY-WATCH' | 'DEPRECATED' | 'NO_DATA';

// ─── Phase 22 Wave 5 (D-17, CORE-ML-27) — Source-mix data contract ───────
// The 8 known source_ids surfaced in the EngineCalibrationPanel "Source mix"
// row per 22-UI-SPEC. Frozen union so downstream typescript checks that new
// sources are explicitly added to both the UI label map and the pipeline.
export type SourceMixSourceId =
  | 'stocktwits'
  | 'options_term_structure'
  | 'finsentllm_ensemble'
  | 'reddit'
  | 'hackernews'
  | 'news_analyst'
  | 'quiver_insider'
  | 'quiver_congressional';

/** Ordered list of the 8 sources — used to zero-fill missing regime rows. */
const SOURCE_MIX_SOURCE_IDS: readonly SourceMixSourceId[] = [
  'stocktwits',
  'options_term_structure',
  'finsentllm_ensemble',
  'reddit',
  'hackernews',
  'news_analyst',
  'quiver_insider',
  'quiver_congressional',
] as const;

export interface SourceMixEntry {
  source_id: SourceMixSourceId;
  /** Regime-conditional weight, post EB-shrink. Fraction in [0, 1]. */
  weight: number;
  /** (source, 'ALL') unconditional reference weight — dashed baseline in sparkline. */
  weight_unconditional: number;
  /** 30-trading-day weight history for this source in the active regime. Length 30. */
  weight_drift_30d: number[];
  /**
   * Pre-computed slope sign (UI TRUSTS this — no re-derivation).
   * 'rising' if net 30d delta > +1pp; 'falling' if < -1pp; 'flat' otherwise.
   */
  drift_direction: 'rising' | 'falling' | 'flat';
  /** Net 30d delta in percentage points (signed). */
  delta_pp_30d: number;
  /** True iff this row fell back to (source, 'ALL') per D-09 cold-start chain. */
  is_cold_start_fallback: boolean;
}

export interface SourceMix {
  /** Regime label at the report's PIT (matches snapshot.regime per D-08). */
  regime: import('@/lib/regime/types').RegimeLabel;
  /** Up to 8 entries. Sorted DESCENDING by weight. UI trusts pre-sort. */
  top_sources: SourceMixEntry[];
}

export interface EngineContext {
  // ── Trace classification at this moment ───────────────────────────────
  flow_pattern: FlowPattern | null;
  cap_class: CapClass;
  niche_lead_cycles: number;
  v_niche: number;
  v_middle: number;
  v_mainstream: number;
  q_z: number;
  qual_z: number;
  trace_window_size: number;

  // ── From LearnedPattern[diffusion × pattern × cap × 7d] ───────────────
  posterior_mean: number | null;
  ci_low: number | null;
  ci_high: number | null;
  // Phase 19 Plan 19-A-03 (D-19) — Vovk-Romano conformal interval surfaced
  // alongside (NOT replacing) the Bayesian credible interval above.
  // ADDITIVE only — both render side-by-side in EngineCalibrationPanel.
  // Populated by 19-A-04+ DSR/PBO/CPCV cron path; null until that ships.
  conformal_low: number | null;
  conformal_high: number | null;
  posterior_30d_mean: number | null;
  sample_size: number;
  hits: number;
  status: CellStatus;
  brier_in_sample: number | null;
  brier_out_sample: number | null;
  brier_null: number | null;
  drift_z: number;

  // ── From latest LogisticEpoch (6-d diffusion-only forward pass) ───────
  logistic_score: number | null;
  logistic_ci_low: number | null;
  logistic_ci_high: number | null;
  feature_contributions: Array<{ feature: string; mu: number; contribution: number }>;
  logistic_brier_in: number | null;
  logistic_sample_size: number;

  // ── Engine meta ───────────────────────────────────────────────────────
  cycle_count: number;
  engine_first_run_at: Date | null;
  last_event_at: Date | null;

  // ── Prediction registration ───────────────────────────────────────────
  predicted_at: Date;
  prediction_id_seed: string;

  // ── Per-community alphas (Phase 2 stub — empty for now) ───────────────
  community_alphas: Array<{
    community_name: string;
    posterior_mean: number;
    sample_size: number;
  }>;

  // ── Sparkline (last up-to-4 snapshots' tier_breakdown, oldest → newest)
  diffusion_sparkline: Array<{ niche: number; middle: number; mainstream: number; scanned_at: string }>;

  // ── Phase 16: Technical signal class (parallel to flow_pattern fields) ─
  technical_pattern: TechPattern | null;
  technical_posterior_mean: number | null;
  technical_ci: [number, number] | null;
  technical_sample_size: number;
  technical_status: CellStatus;

  // ── Phase 16: Horizon table — both signal classes per horizon ─────────
  horizon_calibrations: HorizonCalibration[];

  // ── Phase 16: 12-d logistic, trained on 30d ────────────────────────────
  combined_logistic_score: number | null;

  // ── Phase 16: Q3 agreement (Q1 vs Q2) ─────────────────────────────────
  agreement: 'aligned' | 'mixed' | 'opposed' | 'unknown';

  // ── Phase 17: Institutional signal class (parallel to technical fields) ─
  // Uses InstitutionalBucket (8-value union) — the canonical bucket names from
  // the classifier. Widened from string | null to allow type-safe assignment
  // to EngineCalibration.institutional_pattern without casts.
  institutional_pattern: InstitutionalBucket | null;
  institutional_posterior_mean: number | null;
  institutional_ci: [number, number] | null;
  institutional_sample_size: number;
  institutional_status: CellStatus;
  institutional_data_age_days: number | null;

  // ── Phase 17: Insider signal class ──────────────────────────────────────
  // Uses InsiderBucket (8-value union) — the canonical bucket names from the classifier.
  insider_pattern: InsiderBucket | null;
  insider_posterior_mean: number | null;
  insider_ci: [number, number] | null;
  insider_sample_size: number;
  insider_status: CellStatus;
  insider_data_age_days: number | null;

  // ── Phase 18-07: Effective sample size (Kish — CONTEXT D-03 / D-10) ───────
  // Authoritative numerics from LearnedPattern.effective_sample_size,
  // populated every cron tick by /api/cron/learn (Plan 18-04). The diffusion
  // cell's ESS is `effective_sample_size`; per-class ESS for the technical /
  // institutional / insider buckets are surfaced parallel to their existing
  // posterior fields. `logistic_ess` is currently 0 — LogisticEpoch carries
  // a raw `sample_size` only; Plan 21 may revisit the logistic ESS column.
  effective_sample_size: number;
  technical_ess: number;
  institutional_ess: number;
  insider_ess: number;
  logistic_ess: number;

  // ── Phase 19 Plan 19-C-10 (D-42) — Cross-class contradiction warnings ────
  // ADDITIVE field surfaced by EngineCalibrationPanel only (DETECTION-ONLY
  // mode is PERMANENT for Phase 19 — never gates report output). Populated
  // when FEATURES.contradiction_detector flag is 'on' or 'shadow'; empty
  // array otherwise. Each warning is a human-readable string — see
  // src/lib/sentiment/contradiction-detector.ts for format.
  //
  // Lifecycle: shadow → PASS verdict (detector validity) → cutover ('on'
  // permanent) → 7d hatch → flag removal makes detector unconditional code,
  // STILL detection-only. Flag removal does NOT change behavior; gating
  // mode is OUT OF SCOPE for Phase 19.
  contradiction_warnings: string[];

  // ── Phase 21 (21-4-07) — Sector-relative headline + SPY-alpha diagnostic ──
  // primary_sector_etf: the SPDR ETF code (XLK/XLF/…/SPY) the calibration is
  //   graded against. Resolved from the MOST-RECENT labeled PriceOutcome's
  //   sector_etf (WARNING-2) so the panel headline matches what the engine
  //   actually learned from. Cold start (no labeled rows yet) falls back to
  //   getSectorETF({ ticker }) — today's sector — and sets
  //   primary_sector_etf_is_current=true so the UI labels it "sector (current)"
  //   instead of pretending the prior is historically anchored.
  // spy_alpha_hit_rate: the LEGACY "vs market" hit rate, DERIVED ON THE FLY
  //   (BLOCKER-3) — never read from a stored column. Null when no rows resolve.
  primary_sector_etf: string | null;
  primary_sector_etf_is_current: boolean;
  spy_alpha_hit_rate: number | null;

  // ── Phase 22 Wave 5 (D-17, CORE-ML-27) — Source-mix authoritative payload ─
  // Consumed by the EngineCalibrationPanel "Source mix" row per 22-UI-SPEC.
  // Optional so old persisted reports (pre-Wave 5) render the panel unchanged.
  // Numerics are pre-computed here — the UI component does zero math.
  source_mix?: SourceMix;
}

function sigmoid(z: number): number {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

interface SnapshotCommunityData {
  quantity?: number;
  quality?: number;
  tier_breakdown?: { mainstream: number; middle: number; niche: number };
  highlights?: SnapshotInput['community_data']['highlights'];
  market_cap?: number | null;
  cap_class?: CapClass;
}

interface LearnedCellLike {
  alpha: number;
  beta: number;
  alpha_30d: number;
  beta_30d: number;
  sample_size: number;
  // Phase 18-07: Kish effective sample size — written by Plan 18-04 cron.
  // Required so engine-context.ts can surface it without nullable bookkeeping.
  effective_sample_size: number;
  hits: number;
  brier_in_sample: number | null;
  brier_out_sample: number | null;
  brier_null: number | null;
  drift_z: number;
  status: string;
  // Phase 19 Plan 19-A-03 (D-19) — Vovk-Romano conformal interval columns.
  // Nullable until 19-A-04+ DSR/PBO/CPCV cron writes them. Reading from the
  // row directly so engine-context surfaces both conformal AND Bayesian CIs
  // — the UI panel chooses which to render (additive, no replacement).
  conformal_low: number | null;
  conformal_high: number | null;
  // Phase 19 Plan 19-A-07 — empirical-Bayes pooling fields. Cron writes them;
  // engine-context's pooledBeta() helper recombines into a pooled posterior
  // at READ time when FEATURES.hierarchical_pooling_enabled is true.
  parent_alpha: number | null;
  parent_beta: number | null;
  shrinkage_strength: number | null;
}

function deriveCellStatus(cell: LearnedCellLike | null): CellStatus {
  if (!cell) return 'NO_DATA';
  // Status comes from the learn cron (patternStatus + drift state machine);
  // validate it's one of the known set. Phase 18-07: 'EXPLORATORY-WATCH' is
  // emitted by Plan 18-04 cron when confirmedDrift fires (CONTEXT D-09).
  const s = cell.status;
  if (s === 'ACTIVE' || s === 'EXPLORATORY' || s === 'EXPLORATORY-WATCH' || s === 'DEPRECATED') return s;
  return 'EXPLORATORY';
}

// Promote the higher-conviction status when reporting a row that aggregates
// both signal classes (used for the per-horizon row's overall status column).
//
// Phase 18-07: 'EXPLORATORY-WATCH' slots between ACTIVE and EXPLORATORY —
// these cells are still calibrated (D-09 says no auto-demote on drift fire),
// but the watch flag should outrank a plain EXPLORATORY in the aggregate row.
function maxStatus(a: CellStatus, b: CellStatus): CellStatus {
  const order: Record<CellStatus, number> = {
    ACTIVE: 4,
    'EXPLORATORY-WATCH': 3,
    EXPLORATORY: 2,
    DEPRECATED: 1,
    NO_DATA: 0,
  };
  return order[a] >= order[b] ? a : b;
}

/**
 * Pure helper: agreement classification from RESEARCH §9 lines 446-450.
 *
 *   - 'aligned'  if (dP > 0.55 AND tP > 0.55) OR (dP < 0.45 AND tP < 0.45) AND both ACTIVE
 *   - 'opposed'  if (dP > 0.6 AND tP < 0.4) OR (dP < 0.4 AND tP > 0.6) AND both ACTIVE
 *   - 'mixed'    if both ACTIVE but neither aligned nor opposed
 *   - 'unknown'  if either status is NO_DATA, EXPLORATORY, or DEPRECATED
 *
 * Exported so unit tests can pin the deterministic boundaries without
 * spinning up the full Prisma stack.
 *
 * @deprecated Use computeAgreementNWay for Phase 17+ 4-class agreement.
 */
export function computeAgreement(
  dP: number | null,
  tP: number | null,
  dS: CellStatus,
  tS: CellStatus,
): 'aligned' | 'mixed' | 'opposed' | 'unknown' {
  if (dS !== 'ACTIVE' || tS !== 'ACTIVE' || dP == null || tP == null) return 'unknown';
  const bothBullish = dP > 0.55 && tP > 0.55;
  const bothBearish = dP < 0.45 && tP < 0.45;
  if (bothBullish || bothBearish) return 'aligned';
  if ((dP > 0.6 && tP < 0.4) || (dP < 0.4 && tP > 0.6)) return 'opposed';
  return 'mixed';
}

/**
 * Phase 17-04: N-way agreement over up to 4 signal classes
 * (diffusion, technical, institutional, insider).
 *
 * Rules (17-04 must_haves):
 *   - active.length < 2 → 'unknown'
 *   - all active posteriors > 0.55 → 'aligned' (bullish)
 *   - all active posteriors < 0.45 → 'aligned' (bearish)
 *   - at least one > 0.6 AND at least one < 0.4 → 'opposed'
 *   - otherwise → 'mixed'
 *
 * Exported for unit tests (no Prisma dependency).
 */
export function computeAgreementNWay(
  classes: Array<{ posterior: number | null; status: CellStatus }>,
): 'aligned' | 'mixed' | 'opposed' | 'unknown' {
  const active = classes.filter(c => c.status === 'ACTIVE' && c.posterior != null);
  if (active.length < 2) return 'unknown';
  const posteriors = active.map(c => c.posterior as number);
  const bullish = posteriors.filter(p => p > 0.55).length;
  const bearish = posteriors.filter(p => p < 0.45).length;
  if (bullish === active.length) return 'aligned';
  if (bearish === active.length) return 'aligned';
  // Strong opposition: at least one > 0.6 AND at least one < 0.4
  const strongBull = posteriors.some(p => p > 0.6);
  const strongBear = posteriors.some(p => p < 0.4);
  if (strongBull && strongBear) return 'opposed';
  return 'mixed';
}

/**
 * Private helper: look up a bucket-keyed LearnedPattern cell at horizon=30 for
 * institutional or insider signal classes. Falls back to the highest-sample
 * horizon for the same bucket × cap_class if 30d has no data yet (warmup).
 */
async function resolveBucketCellAt30(
  bucketKind: 'insider',
  bucket: InsiderBucket | null,
  capClass: CapClass,
): Promise<{ pattern: InsiderBucket | null; posterior: number | null; ci: [number, number] | null; sampleSize: number; ess: number; status: CellStatus }>;
async function resolveBucketCellAt30(
  bucketKind: 'institutional',
  bucket: InstitutionalBucket | null,
  capClass: CapClass,
): Promise<{ pattern: InstitutionalBucket | null; posterior: number | null; ci: [number, number] | null; sampleSize: number; ess: number; status: CellStatus }>;
async function resolveBucketCellAt30(
  bucketKind: 'insider' | 'institutional',
  bucket: InsiderBucket | InstitutionalBucket | null,
  capClass: CapClass,
): Promise<{ pattern: InsiderBucket | InstitutionalBucket | null; posterior: number | null; ci: [number, number] | null; sampleSize: number; ess: number; status: CellStatus }> {
  if (!bucket) return { pattern: null, posterior: null, ci: null, sampleSize: 0, ess: 0, status: 'NO_DATA' };

  // 1. Exact match: bucket × capClass × horizon=30
  let cell = (await prisma.learnedPattern.findUnique({
    where: {
      signal_class_pattern_key_cap_class_horizon_days: {
        signal_class: bucketKind,
        pattern_key: bucket,
        cap_class: capClass,
        horizon_days: 30,
      },
    },
  })) as LearnedCellLike | null;

  // 2. Fallback: bucket × any cap_class × horizon=30 (different cap tier)
  if (!cell || cell.sample_size === 0) {
    const fallback = await prisma.learnedPattern.findFirst({
      where: {
        signal_class: bucketKind,
        pattern_key: bucket,
        cap_class: capClass,
        sample_size: { gt: 0 },
      },
      orderBy: [{ sample_size: 'desc' }, { horizon_days: 'desc' }],
    });
    if (fallback) cell = fallback as LearnedCellLike;
  }

  if (!cell || cell.sample_size === 0) {
    return { pattern: bucket, posterior: null, ci: null, sampleSize: 0, ess: 0, status: 'NO_DATA' };
  }

  const pooled = pooledBeta(cell);
  const ci = credibleInterval95(pooled);
  const status = deriveCellStatus(cell);
  return {
    pattern: bucket,
    posterior: ci.mean,
    ci: [ci.low, ci.high],
    sampleSize: cell.sample_size,
    // Phase 18-07: surface ESS from the same cell — Plan 18-04 cron writes
    // it on every recompute. Defaults to 0 if the row predates 18-04.
    ess: cell.effective_sample_size ?? 0,
    status,
  };
}

/**
 * Phase 17-04: 24-cell horizon calibration table (6 horizons × 4 signal classes).
 * Extends Phase 16's 12-cell (6×2) version to include institutional + insider classes.
 *
 * Each horizon row carries 4 posteriors + 4 CIs. Row.sample_size = max of 4 class
 * sample sizes. Row.status = highest-conviction status across the 4 classes.
 */
async function readHorizonCalibrations(
  flow_pattern: FlowPattern | null,
  techPattern: TechPattern | null,
  cap_class: CapClass,
  insiderBucket: InsiderBucket | null,
  institutionalBucket: InstitutionalBucket | null,
): Promise<HorizonCalibration[]> {
  // Skip lookups for pattern_key that the engine never stores ('flat' for
  // diffusion is intentionally a no-op cell).
  const queryDiffusion = flow_pattern && flow_pattern !== 'flat';
  const queryTechnical = techPattern != null;
  const queryInsider = insiderBucket != null;
  const queryInstitutional = institutionalBucket != null;

  // 24 promises: 6 horizons × 4 classes (diffusion, technical, institutional, insider)
  const cellQueries = HORIZONS.flatMap((horizon) => {
    const diffusionPromise: Promise<LearnedCellLike | null> = queryDiffusion
      ? prisma.learnedPattern.findUnique({
          where: {
            signal_class_pattern_key_cap_class_horizon_days: {
              signal_class: 'diffusion',
              pattern_key: flow_pattern!,
              cap_class,
              horizon_days: horizon,
            },
          },
        }) as Promise<LearnedCellLike | null>
      : Promise.resolve(null);
    const technicalPromise: Promise<LearnedCellLike | null> = queryTechnical
      ? prisma.learnedPattern.findUnique({
          where: {
            signal_class_pattern_key_cap_class_horizon_days: {
              signal_class: 'technical',
              pattern_key: techPattern!,
              cap_class,
              horizon_days: horizon,
            },
          },
        }) as Promise<LearnedCellLike | null>
      : Promise.resolve(null);
    const institutionalPromise: Promise<LearnedCellLike | null> = queryInstitutional
      ? prisma.learnedPattern.findUnique({
          where: {
            signal_class_pattern_key_cap_class_horizon_days: {
              signal_class: 'institutional',
              pattern_key: institutionalBucket!,
              cap_class,
              horizon_days: horizon,
            },
          },
        }) as Promise<LearnedCellLike | null>
      : Promise.resolve(null);
    const insiderPromise: Promise<LearnedCellLike | null> = queryInsider
      ? prisma.learnedPattern.findUnique({
          where: {
            signal_class_pattern_key_cap_class_horizon_days: {
              signal_class: 'insider',
              pattern_key: insiderBucket!,
              cap_class,
              horizon_days: horizon,
            },
          },
        }) as Promise<LearnedCellLike | null>
      : Promise.resolve(null);
    // Order: diffusion, technical, institutional, insider (4 per horizon)
    return [diffusionPromise, technicalPromise, institutionalPromise, insiderPromise];
  });

  const cells = await Promise.all(cellQueries);

  return HORIZONS.map((horizon, i) => {
    const dCell   = cells[i * 4];
    const tCell   = cells[i * 4 + 1];
    const instCell = cells[i * 4 + 2];
    const insdCell = cells[i * 4 + 3];

    // Plan 19-A-07: read-time α_pooled / β_pooled when flag enabled.
    // Honesty guard (engine-review 2026-06-17 fix #2): skip pooling for
    // cells with zero local observations so the row shows `—` instead of
    // a parent-regime base rate masquerading as cell-specific confidence.
    const dPooled    = (dCell    && dCell.sample_size    > 0) ? pooledBeta(dCell)    : null;
    const tPooled    = (tCell    && tCell.sample_size    > 0) ? pooledBeta(tCell)    : null;
    const instPooled = (instCell && instCell.sample_size > 0) ? pooledBeta(instCell) : null;
    const insdPooled = (insdCell && insdCell.sample_size > 0) ? pooledBeta(insdCell) : null;
    const dPosterior    = dPooled    ? posteriorMean(dPooled)        : null;
    const dCi           = dPooled    ? credibleInterval95(dPooled)   : null;
    const tPosterior    = tPooled    ? posteriorMean(tPooled)        : null;
    const tCi           = tPooled    ? credibleInterval95(tPooled)   : null;
    const instPosterior = instPooled ? posteriorMean(instPooled)     : null;
    const instCi        = instPooled ? credibleInterval95(instPooled): null;
    const insdPosterior = insdPooled ? posteriorMean(insdPooled)     : null;
    const insdCi        = insdPooled ? credibleInterval95(insdPooled): null;

    const dStatus    = deriveCellStatus(dCell);
    const tStatus    = deriveCellStatus(tCell);
    const instStatus = deriveCellStatus(instCell);
    const insdStatus = deriveCellStatus(insdCell);

    const aggregateStatus = [dStatus, tStatus, instStatus, insdStatus].reduce(maxStatus);

    return {
      horizon_days: horizon,
      diffusion_posterior:      dPosterior,
      diffusion_ci:             dCi    ? [dCi.low,    dCi.high]    : null,
      technical_posterior:      tPosterior,
      technical_ci:             tCi    ? [tCi.low,    tCi.high]    : null,
      institutional_posterior:  instPosterior,
      institutional_ci:         instCi ? [instCi.low, instCi.high] : null,
      insider_posterior:        insdPosterior,
      insider_ci:               insdCi ? [insdCi.low, insdCi.high] : null,
      sample_size: Math.max(
        dCell?.sample_size    ?? 0,
        tCell?.sample_size    ?? 0,
        instCell?.sample_size ?? 0,
        insdCell?.sample_size ?? 0,
      ),
      // Phase 18-07: row-level effective_sample_size — max across the four
      // signal classes so the UI's per-horizon ESS column reflects the
      // best-calibrated cell at this horizon (CONTEXT D-10).
      effective_sample_size: Math.max(
        dCell?.effective_sample_size    ?? 0,
        tCell?.effective_sample_size    ?? 0,
        instCell?.effective_sample_size ?? 0,
        insdCell?.effective_sample_size ?? 0,
      ),
      status: aggregateStatus,
    } satisfies HorizonCalibration;
  });
}

export async function getEngineContextForTicker(
  ticker: string,
  asOf: Date,
): Promise<EngineContext> {
  const upperTicker = ticker.toUpperCase();

  // ── 1. Pull last 4 snapshots ────────────────────────────────────────
  let snaps = await prisma.sentimentSnapshot.findMany({
    where: { ticker: upperTicker, scanned_at: { lte: asOf } },
    orderBy: { scanned_at: 'desc' },
    take: 4,
  });

  // ── 2. Cold-start: ticker has no snapshots → trigger parallel one-shot scans ──
  // Phase 17-03 extends Phase 16's 2-sensor parallel cold-start to 4 sensors.
  // All four fire concurrently so first-research-on-a-ticker latency is
  // bounded by the slowest single sensor, not the sum. coldStartInsiderSnap
  // and coldStartInstitutionalSnap are populated here for plan 17-04's
  // §6.5 calibration resolution to consume.
  let coldStartTechSnap: TechnicalSnapshot | null = null;
  let coldStartInsiderSnap: InsiderSnapshot | null = null;
  let coldStartInstitutionalSnap: InstitutionalSnapshot | null = null;
  if (snaps.length === 0) {
    const [communityResult, techResult, insiderResult, institutionalResult] = await Promise.all([
      lightweightCommunityScan(upperTicker).catch(() => null),
      computeTechnicalSnapshot(upperTicker).catch(() => null),
      fetchInsiderData(upperTicker).catch(() => null),
      fetchInstitutionalData(upperTicker).catch(() => null),
    ]);
    coldStartTechSnap = techResult;
    coldStartInsiderSnap = insiderResult;
    coldStartInstitutionalSnap = institutionalResult;
    if (communityResult) {
      // Fix: cold-start used to write price_at_scan: 0, which made
      // price-followup/route.ts permanently skip these snapshots → no PriceOutcome
      // ever created → engine never learned from cold-start research. Fetch the
      // live price (best-effort; null if Yahoo fails — still better than 0 because
      // the followup guard skips !price_at_scan rather than treating null as 0).
      const livePrice = await fetchLivePrice(upperTicker);
      const created = await prisma.sentimentSnapshot.create({
        data: {
          ticker: upperTicker,
          scanned_at: asOf,
          price_at_scan: livePrice ?? 0,
          community_data: communityResult as object,
          technical_data: techResult ? (techResult as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          insider_data: insiderResult ? (insiderResult as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          institutional_data: institutionalResult ? (institutionalResult as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
      snaps = [created];
    }
  }
  // snaps come back desc; reverse to chronological for trace computation.
  const snapsAsc = [...snaps].reverse();

  // Phase 17-04: resolve insider + institutional snapshots.
  // Resolution order mirrors the technical_data pattern (§5 below):
  //   1. coldStartInsiderSnap / coldStartInstitutionalSnap (if cold-start fired)
  //   2. insider_data / institutional_data on the most-recent snapshot
  //   3. null (no data available)
  const mostRecentSnapForSmartMoney = snapsAsc[snapsAsc.length - 1];
  const insiderSnap: InsiderSnapshot | null =
    coldStartInsiderSnap ??
    (mostRecentSnapForSmartMoney?.insider_data && typeof mostRecentSnapForSmartMoney.insider_data === 'object'
      ? (mostRecentSnapForSmartMoney.insider_data as unknown as InsiderSnapshot)
      : null);
  const institutionalSnap: InstitutionalSnapshot | null =
    coldStartInstitutionalSnap ??
    (mostRecentSnapForSmartMoney?.institutional_data && typeof mostRecentSnapForSmartMoney.institutional_data === 'object'
      ? (mostRecentSnapForSmartMoney.institutional_data as unknown as InstitutionalSnapshot)
      : null);
  const insiderBucket: InsiderBucket | null = insiderSnap?.insider_bucket ?? null;
  const institutionalBucket: InstitutionalBucket | null = institutionalSnap?.institutional_bucket ?? null;

  // ── 3. Historical context for z-scoring (best effort) ───────────────
  const tickerHistory = await prisma.sentimentSnapshot.findMany({
    where: { ticker: upperTicker },
    select: { community_data: true },
    take: 50,
    orderBy: { scanned_at: 'desc' },
  });
  const histQuantity: number[] = [];
  const histQuality: number[] = [];
  for (const s of tickerHistory) {
    const cd = (s.community_data ?? {}) as SnapshotCommunityData;
    if (typeof cd.quantity === 'number' && Number.isFinite(cd.quantity)) histQuantity.push(cd.quantity);
    if (typeof cd.quality === 'number' && Number.isFinite(cd.quality)) histQuality.push(cd.quality);
  }

  // ── 4. Compute trace ────────────────────────────────────────────────
  const inputs: SnapshotInput[] = snapsAsc.map(s => ({
    scanned_at: s.scanned_at,
    community_data: (s.community_data ?? {}) as SnapshotInput['community_data'],
  }));
  const trace = inputs.length >= 2 ? computeDiffusionTrace(inputs, histQuantity, histQuality) : null;

  // Most-recent snapshot's stored cap_class wins; otherwise classify from market_cap.
  const mostRecent = snapsAsc[snapsAsc.length - 1]?.community_data as SnapshotCommunityData | undefined;
  const flow_pattern = trace?.flow_pattern ?? null;
  const cap_class: CapClass =
    trace?.cap_class
    ?? mostRecent?.cap_class
    ?? classifyCapClass(mostRecent?.market_cap ?? null);

  // ── 5. Compute live technical snapshot for the 12-d combined logistic forward
  // pass and the technical-cell lookup. Resolution order:
  //   1. coldStartTechSnap from §2 (if cold start fired).
  //   2. technical_data on the most-recent snapshot (Phase 16-05: backfill writes this
  //      so engine-context doesn't need to re-hit Yahoo for every report read; also lets
  //      test fixtures seed technical_data without depending on yahoo-finance2).
  //   3. Live computeTechnicalSnapshot (best-effort, null on fail).
  let techSnap: TechnicalSnapshot | null = coldStartTechSnap;
  if (techSnap == null) {
    const mostRecentSnap = snapsAsc[snapsAsc.length - 1];
    const persisted = mostRecentSnap?.technical_data;
    if (persisted && typeof persisted === 'object') {
      techSnap = persisted as unknown as TechnicalSnapshot;
    } else {
      techSnap = await computeTechnicalSnapshot(upperTicker).catch(() => null);
    }
  }
  const techPattern: TechPattern | null = techSnap?.tech_pattern ?? null;

  // ── 6. Look up diffusion LearnedPattern at the 7d primary horizon ────
  // Phase 16: composite key is (signal_class, pattern_key, cap_class, horizon_days).
  // 7d remains the diffusion primary horizon. Fall back to highest-sample
  // horizon during warmup so the panel surfaces something while 7d ramps up.
  let diffusionCell: LearnedCellLike | null = null;
  if (flow_pattern && flow_pattern !== 'flat') {
    diffusionCell = (await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'diffusion',
          pattern_key: flow_pattern,
          cap_class,
          horizon_days: 7,
        },
      },
    })) as LearnedCellLike | null;

    if (!diffusionCell || diffusionCell.sample_size === 0) {
      const fallback = await prisma.learnedPattern.findFirst({
        where: {
          signal_class: 'diffusion',
          pattern_key: flow_pattern,
          cap_class,
          sample_size: { gt: 0 },
        },
        orderBy: [{ sample_size: 'desc' }, { horizon_days: 'desc' }],
      });
      if (fallback) diffusionCell = fallback as LearnedCellLike;
    }
  }

  let posterior_mean: number | null = null;
  let ci_low: number | null = null;
  let ci_high: number | null = null;
  let posterior_30d_mean: number | null = null;
  if (diffusionCell) {
    const ci = credibleInterval95(pooledBeta(diffusionCell));
    posterior_mean = ci.mean;
    ci_low = ci.low;
    ci_high = ci.high;
    const n30 = diffusionCell.alpha_30d + diffusionCell.beta_30d;
    posterior_30d_mean = n30 > 0 ? diffusionCell.alpha_30d / n30 : null;
  }

  // ── 7. Look up technical LearnedPattern ─────────────────────────────────
  // 30d is the LOCKED primary horizon. If 30d has no samples yet (typical for
  // the first ~30 days of operation), fall back to the highest-sample horizon
  // so the report panel surfaces SOMETHING meaningful while 30d ramps up.
  let technicalCell: LearnedCellLike | null = null;
  if (techPattern) {
    technicalCell = (await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: techPattern,
          cap_class,
          horizon_days: 30,
        },
      },
    })) as LearnedCellLike | null;

    // Fallback: pick the populated horizon with the largest sample_size.
    // Keeps the dashboard readable during the engine's warmup period.
    if (!technicalCell || technicalCell.sample_size === 0) {
      const fallback = await prisma.learnedPattern.findFirst({
        where: {
          signal_class: 'technical',
          pattern_key: techPattern,
          cap_class,
          sample_size: { gt: 0 },
        },
        orderBy: [{ sample_size: 'desc' }, { horizon_days: 'desc' }],
      });
      if (fallback) technicalCell = fallback as LearnedCellLike;
    }
  }

  let technical_posterior_mean: number | null = null;
  let technical_ci: [number, number] | null = null;
  if (technicalCell) {
    const tci = credibleInterval95(pooledBeta(technicalCell));
    technical_posterior_mean = tci.mean;
    technical_ci = [tci.low, tci.high];
  }

  // ── 8. Latest LogisticEpoch + forward pass ──────────────────────────
  const lastEpoch = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
  let logistic_score: number | null = null;
  let logistic_ci_low: number | null = null;
  let logistic_ci_high: number | null = null;
  let combined_logistic_score: number | null = null;
  const feature_contributions: EngineContext['feature_contributions'] = [];

  if (lastEpoch && trace) {
    const c = (lastEpoch.coefficients ?? {}) as Record<string, { mu: number; sigma: number }>;
    const x = [
      trace.v_niche,
      trace.v_middle,
      trace.v_mainstream,
      trace.niche_lead_cycles,
      trace.q_z,
      trace.qual_z,
    ];
    const state6: LogisticState = {
      intercept: lastEpoch.intercept,
      intercept_var: ((c['_intercept']?.sigma) ?? 1) ** 2,
      weights: ENGINE_FEATURE_NAMES.map(n => c[n]?.mu ?? 0),
      weight_vars: ENGINE_FEATURE_NAMES.map(n => (c[n]?.sigma ?? 1) ** 2),
      feature_names: [...ENGINE_FEATURE_NAMES],
    };
    logistic_score = predictLogistic(state6, x);

    // CI via propagated variance: var(z) = var(intercept) + Σ var(w_i) * x_i^2
    let varZ = state6.intercept_var;
    let z = state6.intercept;
    for (let i = 0; i < state6.weights.length; i++) {
      z += state6.weights[i] * x[i];
      varZ += state6.weight_vars[i] * x[i] * x[i];
      feature_contributions.push({
        feature: ENGINE_FEATURE_NAMES[i],
        mu: state6.weights[i],
        contribution: state6.weights[i] * x[i],
      });
    }
    const sd = Math.sqrt(Math.max(0, varZ));
    logistic_ci_low = sigmoid(z - 1.96 * sd);
    logistic_ci_high = sigmoid(z + 1.96 * sd);

    // Combined 12-d logistic forward pass (Phase 16). Only run when both sensors
    // are populated AND the persisted epoch has the 12-d shape — otherwise the
    // missing-key fallback (`c[n]?.mu ?? 0`) yields a degenerate score.
    if (techSnap) {
      const x12 = buildFeatureVector12(trace, techSnap, techPattern);
      const state12: LogisticState = {
        intercept: lastEpoch.intercept,
        intercept_var: ((c['_intercept']?.sigma) ?? 1) ** 2,
        weights: FEATURE_NAMES.map(n => c[n]?.mu ?? 0),
        weight_vars: FEATURE_NAMES.map(n => (c[n]?.sigma ?? 1) ** 2),
        feature_names: [...FEATURE_NAMES],
      };
      combined_logistic_score = predictLogistic(state12, x12);
    }
  }

  // ── 9. Institutional + insider cell lookup at horizon=30 (primary horizon for both classes) ─
  const [institutionalResult, insiderResult] = await Promise.all([
    resolveBucketCellAt30('institutional', institutionalBucket, cap_class),
    resolveBucketCellAt30('insider', insiderBucket, cap_class),
  ]);

  // ── 9b. Horizon calibrations (24 cells: 6 horizons × 4 signal classes) ─
  const horizon_calibrations = await readHorizonCalibrations(
    flow_pattern, techPattern, cap_class, insiderBucket, institutionalBucket,
  );

  // ── 10. Engine meta ─────────────────────────────────────────────────
  const firstEvent = await prisma.learningEvent.findFirst({ orderBy: { occurred_at: 'asc' } });
  const lastEvent = await prisma.learningEvent.findFirst({ orderBy: { occurred_at: 'desc' } });

  // ── 11. Status ──────────────────────────────────────────────────────
  const status: CellStatus = deriveCellStatus(diffusionCell);
  const technical_status: CellStatus = deriveCellStatus(technicalCell);

  // ── 12. Sparkline ───────────────────────────────────────────────────
  const diffusion_sparkline: EngineContext['diffusion_sparkline'] = snapsAsc.map(s => {
    const cd = (s.community_data ?? {}) as SnapshotCommunityData;
    const tb = cd.tier_breakdown ?? { niche: 0, middle: 0, mainstream: 0 };
    return {
      niche: tb.niche ?? 0,
      middle: tb.middle ?? 0,
      mainstream: tb.mainstream ?? 0,
      scanned_at: s.scanned_at.toISOString(),
    };
  });

  // ── 13. N-way agreement across all 4 signal classes ─────────────────
  // Phase 17-04: replace computeAgreement (2-class) with computeAgreementNWay (4-class).
  // Each class contributes its primary-horizon posterior:
  //   diffusion → 7d, technical → 30d, institutional → 30d, insider → 30d
  const agreement = computeAgreementNWay([
    { posterior: posterior_mean,                         status },
    { posterior: technical_posterior_mean,               status: technical_status },
    { posterior: institutionalResult.posterior,          status: institutionalResult.status },
    { posterior: insiderResult.posterior,                status: insiderResult.status },
  ]);

  // ── 14. Phase 19 Plan 19-C-10 (D-42) — Cross-class contradiction detector ─
  // DETECTION-ONLY mode permanent. Runs when flag is 'on' OR 'shadow'; never
  // gates report output. Result feeds an additive `contradiction_warnings`
  // array consumed by EngineCalibrationPanel only.
  //
  // Skips entirely (empty array) when:
  //   - flag is 'off' (default), OR
  //   - any of the 4 class posteriors is null (insufficient calibration data)
  //
  // Detector errors are caught and degraded to empty warnings — the rest of
  // the report must always render.
  let contradiction_warnings: string[] = [];
  const detectorMode = FEATURES.contradiction_detector_mode;
  if (
    (detectorMode === 'on' || detectorMode === 'shadow') &&
    posterior_mean != null &&
    technical_posterior_mean != null &&
    institutionalResult.posterior != null &&
    insiderResult.posterior != null
  ) {
    try {
      const detection = await detectContradictions({
        ticker: upperTicker,
        classPosteriors: {
          diffusion: posterior_mean,
          technical: technical_posterior_mean,
          institutional: institutionalResult.posterior,
          insider: insiderResult.posterior,
        },
      });
      contradiction_warnings = detection.warnings;
    } catch {
      // Graceful degrade — never fail report render because of the detector.
      contradiction_warnings = [];
    }
  }

  // ── Phase 21 (21-4-07) — resolve the sector-relative headline ETF (WARNING-2)
  // + the legacy SPY-alpha "vs market" diagnostic (BLOCKER-3). ──────────────
  //
  // WARNING-2: use the MOST-RECENT labeled PriceOutcome's snapshotted sector_etf
  // so the headline matches what the engine actually graded against. NO silent
  // hardcode-current fallback — cold start uses today's sector but flags it.
  let primary_sector_etf: string | null = null;
  let primary_sector_etf_is_current = false;
  try {
    const mostRecentOutcome = await prisma.priceOutcome.findFirst({
      where: { report: { ticker: upperTicker } },
      orderBy: { recorded_at: 'desc' },
      select: { sector_etf: true },
    });
    primary_sector_etf = mostRecentOutcome?.sector_etf ?? null;
    if (!primary_sector_etf) {
      // Cold start — no labeled PriceOutcome rows for this ticker yet. Resolve
      // TODAY's sector (no asOfDate) but mark it so the UI is honest about the
      // prior NOT being historically anchored.
      primary_sector_etf = await getSectorETF({ ticker: upperTicker });
      primary_sector_etf_is_current = true;
    }
  } catch {
    // Never fail the report render because the sector lookup failed.
    primary_sector_etf = null;
    primary_sector_etf_is_current = false;
  }

  // BLOCKER-3: SPY-alpha hit rate is DERIVED ON THE FLY from absolute returns
  // minus the contemporaneous SPY return — never from a stored SPY column.
  let spy_alpha_hit_rate: number | null = null;
  try {
    spy_alpha_hit_rate = await computeSpyAlphaHitRate(upperTicker);
  } catch {
    spy_alpha_hit_rate = null;
  }

  // ── Phase 22 Wave 5 (D-17, CORE-ML-27) — Source-mix payload ──────────────
  // Regime resolution per D-08: the report's regime is the regime stored on
  // the most-recent SentimentSnapshot at asOf (matches learning_engine PIT
  // classifier). If the snapshot lacks a regime (pre-Wave-1 backfill row) or
  // classifier fell back cold-start, we pass 'ALL' to buildSourceMix which
  // renders the REGIME-UNCONDITIONAL variant per UI-SPEC.
  const regimeForSourceMix: import('@/lib/regime/types').RegimeLabel = (() => {
    const mostRecent = snapsAsc[snapsAsc.length - 1];
    const raw = (mostRecent as unknown as { regime?: string } | undefined)?.regime;
    if (
      raw === 'bull-low-vol' ||
      raw === 'bull-high-vol' ||
      raw === 'bear-low-vol' ||
      raw === 'bear-high-vol' ||
      raw === 'ALL'
    ) {
      return raw;
    }
    return 'ALL';
  })();
  let source_mix: SourceMix | undefined;
  try {
    source_mix = await buildSourceMix(regimeForSourceMix, asOf);
  } catch {
    // Never fail the report render because source-mix resolution failed.
    source_mix = undefined;
  }

  return {
    flow_pattern,
    cap_class,
    niche_lead_cycles: trace?.niche_lead_cycles ?? 0,
    v_niche: trace?.v_niche ?? 0,
    v_middle: trace?.v_middle ?? 0,
    v_mainstream: trace?.v_mainstream ?? 0,
    q_z: trace?.q_z ?? 0,
    qual_z: trace?.qual_z ?? 0,
    trace_window_size: snapsAsc.length,

    posterior_mean,
    ci_low,
    ci_high,
    // Phase 19 Plan 19-A-03 (D-19): Conformal CI from the same diffusion 7d
    // LearnedPattern row. Surfaced ALONGSIDE the Bayesian (ci_low, ci_high)
    // pair above — never instead of. Null when the DSR/PBO/CPCV cron
    // (19-A-04) hasn't yet computed conformal residuals for this cell.
    conformal_low: diffusionCell?.conformal_low ?? null,
    conformal_high: diffusionCell?.conformal_high ?? null,
    posterior_30d_mean,
    sample_size: diffusionCell?.sample_size ?? 0,
    hits: diffusionCell?.hits ?? 0,
    status,
    brier_in_sample: diffusionCell?.brier_in_sample ?? null,
    brier_out_sample: diffusionCell?.brier_out_sample ?? null,
    brier_null: diffusionCell?.brier_null ?? null,
    drift_z: diffusionCell?.drift_z ?? 0,

    logistic_score,
    logistic_ci_low,
    logistic_ci_high,
    feature_contributions,
    logistic_brier_in: lastEpoch?.brier_in ?? null,
    logistic_sample_size: lastEpoch?.sample_size ?? 0,

    cycle_count: lastEpoch?.epoch ?? 0,
    engine_first_run_at: firstEvent?.occurred_at ?? null,
    last_event_at: lastEvent?.occurred_at ?? null,

    predicted_at: asOf,
    prediction_id_seed: `${upperTicker}-${asOf.toISOString()}`,

    community_alphas: [],
    diffusion_sparkline,

    technical_pattern: techPattern,
    technical_posterior_mean,
    technical_ci,
    technical_sample_size: technicalCell?.sample_size ?? 0,
    technical_status,

    horizon_calibrations,
    combined_logistic_score,
    agreement,

    // ── Phase 17-04: institutional + insider signal class fields ─────────
    // Numeric fields only — prose fields (institutional_alignment etc.) are
    // written by the LLM in gemini-analysis.ts and NOT set here (D-04 trust boundary).
    institutional_pattern:        institutionalResult.pattern,
    institutional_posterior_mean: institutionalResult.posterior,
    institutional_ci:             institutionalResult.ci,
    institutional_sample_size:    institutionalResult.sampleSize,
    institutional_status:         institutionalResult.status,
    institutional_data_age_days:  institutionalSnap?.data_age_days ?? null,

    insider_pattern:              insiderResult.pattern,
    insider_posterior_mean:       insiderResult.posterior,
    insider_ci:                   insiderResult.ci,
    insider_sample_size:          insiderResult.sampleSize,
    insider_status:               insiderResult.status,
    insider_data_age_days:        insiderSnap?.data_age_days ?? null,

    // ── Phase 18-07: Effective sample size (Kish — CONTEXT D-03 / D-10) ─────
    // Authoritative read from LearnedPattern.effective_sample_size — Plan
    // 18-04 cron writes this every tick. logistic_ess is currently 0:
    // LogisticEpoch carries a raw sample_size only; Plan 21 may revisit.
    effective_sample_size:        diffusionCell?.effective_sample_size ?? 0,
    technical_ess:                technicalCell?.effective_sample_size ?? 0,
    institutional_ess:            institutionalResult.ess,
    insider_ess:                  insiderResult.ess,
    logistic_ess:                 0,

    // ── Phase 19 Plan 19-C-10 (D-42) — DETECTION-ONLY warnings (additive) ───
    contradiction_warnings,

    // ── Phase 21 (21-4-07) — sector-relative headline + SPY-alpha diagnostic ─
    primary_sector_etf,
    primary_sector_etf_is_current,
    spy_alpha_hit_rate,

    // ── Phase 22 Wave 5 (D-17, CORE-ML-27) — Source-mix payload ────────────
    source_mix,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 22 Wave 5 — D-17 buildSourceMix reader (CORE-ML-27)
//
// Assembles the SourceMix payload consumed by EngineCalibrationPanel per
// 22-UI-SPEC. CLAUDE.md rule — authoritative numerics from engine-context.ts
// only; UI does zero math.
//
// Reads:
//   - SourceTier: latest row per (source_id, regime) for current weight
//   - SourceTier: latest row per (source_id, 'ALL') for unconditional baseline
//   - SourceTier history: last 30 rows per (source_id, regime) for drift line
//     (falls back to (source_id, 'ALL') history when regime rows are sparse
//      per D-09 cold-start chain)
//
// Sort order: DESC by weight. UI trusts the sort.
// ═══════════════════════════════════════════════════════════════════════════

export async function buildSourceMix(
  regime: import('@/lib/regime/types').RegimeLabel,
  _asOf: Date,
): Promise<SourceMix> {
  // Fetch, per source, the most-recent row for (source, regime) AND the
  // most-recent row for (source, 'ALL'). If (source, regime) has no rows,
  // the row falls back per D-09 cold-start chain — we mark is_cold_start_fallback.
  const entries: SourceMixEntry[] = [];

  for (const source_id of SOURCE_MIX_SOURCE_IDS) {
    // Latest (source, regime) row — most-recent computed_at.
    const regimeLatest = regime === 'ALL'
      ? null
      : await prisma.sourceTier.findFirst({
          where: { source_id, regime },
          orderBy: { computed_at: 'desc' },
          select: { weight: true, computed_at: true },
        });

    // Unconditional (source, 'ALL') row — used for baseline AND as the fallback
    // per D-09 when the (source, regime) row is missing.
    const allLatest = await prisma.sourceTier.findFirst({
      where: { source_id, regime: 'ALL' },
      orderBy: { computed_at: 'desc' },
      select: { weight: true },
    });

    const weight_unconditional = allLatest?.weight ?? 0;
    const is_cold_start_fallback = regime !== 'ALL' && regimeLatest == null;
    // Per D-09: fall back to (source, 'ALL') weight when regime-specific row
    // has not accumulated yet. When regime='ALL' the "current" IS the ALL row.
    const weight = regimeLatest?.weight ?? weight_unconditional;

    // 30 most-recent (source, regime) rows for drift sparkline. If regime is
    // 'ALL' or the regime row is a cold-start fallback, we pull from the ALL
    // series so the sparkline is still meaningful (flat at ALL weight).
    const history = regime === 'ALL' || is_cold_start_fallback
      ? await prisma.sourceTier.findMany({
          where: { source_id, regime: 'ALL' },
          orderBy: { computed_at: 'desc' },
          take: 30,
          select: { weight: true },
        })
      : await prisma.sourceTier.findMany({
          where: { source_id, regime },
          orderBy: { computed_at: 'desc' },
          take: 30,
          select: { weight: true },
        });
    // history returned DESC; reverse to chronological ASC so the last entry
    // corresponds to the report's PIT (matches UI-SPEC data-contract note).
    const seriesAsc = history.map((r) => r.weight).reverse();
    // Pad from the front with the earliest observation (or the unconditional
    // weight) so the sparkline always has length 30 — UI-SPEC hard length.
    const padTo30: number[] = [];
    if (seriesAsc.length === 0) {
      for (let i = 0; i < 30; i++) padTo30.push(weight_unconditional);
    } else {
      const pad = seriesAsc[0];
      while (padTo30.length + seriesAsc.length < 30) padTo30.push(pad);
      padTo30.push(...seriesAsc);
    }
    const weight_drift_30d = padTo30.slice(-30);

    const delta_pp_30d =
      (weight_drift_30d[weight_drift_30d.length - 1] - weight_drift_30d[0]) * 100;
    const drift_direction: SourceMixEntry['drift_direction'] =
      delta_pp_30d > 1 ? 'rising' : delta_pp_30d < -1 ? 'falling' : 'flat';

    entries.push({
      source_id,
      weight,
      weight_unconditional,
      weight_drift_30d,
      drift_direction,
      delta_pp_30d,
      is_cold_start_fallback,
    });
  }

  // Sort DESC by weight per UI-SPEC (UI trusts the order).
  entries.sort((a, b) => b.weight - a.weight);

  // Filter zero-weight sources (no observations at all) so the row's
  // top_sources.length === 0 empty-state fires when the (source, regime)
  // and (source, 'ALL') both have no rows.
  const top_sources = entries.filter((e) => e.weight > 0 || e.weight_unconditional > 0);

  return { regime, top_sources };
}

// Internal helpers re-exported for the unit-test surface only. Production
// callers should use getEngineContextForTicker — these are unstable.
export const __internal = { patternStatus };

// ═══════════════════════════════════════════════════════════════════════════
// Phase 21.1 Wave 5 — D-30 Trust Boundary Reader Functions
//
// All numeric values flowing into the dashboard MUST be sourced through these
// reader functions. No component may read LLMEvaluation rows directly.
// No LLM API calls happen in this layer.
//
// Per D-30: "all metrics flow through engine-context.ts reader functions."
// ═══════════════════════════════════════════════════════════════════════════

import { informationCoefficient, bootstrapBCa } from '@/lib/evaluation';

// ── Exported types for the Wave 5 dashboard surfaces ──────────────────────

export interface RollingLLMICPoint {
  t: Date;
  ic: number;
  ci_low: number;
  ci_high: number;
  n: number;
}

export type LLMICVerdict =
  | 'EDGE_DETECTED'
  | 'NEGATIVE_EDGE'
  | 'INCONCLUSIVE'
  | 'COLLECTING_DATA';

export interface RollingLLMICResult {
  series: RollingLLMICPoint[];
  current: { ic: number; ci_low: number; ci_high: number; n: number } | null;
  verdict: LLMICVerdict;
}

export interface BaselineComparisonRow {
  metric: 'brier' | 'ic' | 'log_loss';
  llm: { value: number; ci: [number, number]; q_value: number | null };
  logistic24: { value: number; ci: [number, number]; q_value: number | null };
  logisticCanonical: { value: number; ci: [number, number]; q_value: number | null };
  null: { value: number };
}

export interface BaselineComparisonResult {
  rows: BaselineComparisonRow[];
  n_trials_attempted: number;
  last_updated: Date | null;
}

export interface PerSignalIC {
  signal_class: string;
  ic: number;
  ci: [number, number];
  n: number;
}

// ── getLLMICRolling — Surface 2 headline (D-10) ───────────────────────────

/**
 * Phase 21.1 D-10 / CORE-ML-20 — Rolling N-day LLM IC with BCa 95% CI band.
 *
 * Reads LLMEvaluation rows where is_resolved=true and recorded_at is in the
 * last `windowDays` days. Computes a headline IC over the window plus a daily
 * sliding-window series for the SVG sparkline in RollingLLMICTile.
 *
 * Per D-30 (trust boundary): all numerics flow through this reader. The
 * dashboard component never reads LLMEvaluation rows directly.
 *
 * Verdict per UI-SPEC Surface 2 state variants:
 *   - n < 30              → COLLECTING_DATA (insufficient data)
 *   - BCa CI fully > 0    → EDGE_DETECTED
 *   - BCa CI fully < 0    → NEGATIVE_EDGE
 *   - BCa CI spans 0      → INCONCLUSIVE
 *
 * @knowable_at  every row carries its own recorded_at
 * Reference: Efron 1987 / Grinold & Kahn §3 (IC convention)
 */
export async function getLLMICRolling(windowDays: number = 30): Promise<RollingLLMICResult> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.lLMEvaluation.findMany({
    where: { is_resolved: true, recorded_at: { gte: cutoff } },
    select: {
      recorded_at: true,
      ll_signed_score: true,
      forward_return: true,
      horizon_days: true,
    },
    orderBy: { recorded_at: 'asc' },
  });

  if (rows.length < 30) {
    return { series: [], current: null, verdict: 'COLLECTING_DATA' };
  }

  const predictions = rows.map((r) => r.ll_signed_score);
  const returns = rows.map((r) => r.forward_return ?? 0);

  // Headline IC over the entire window
  const ic = informationCoefficient(predictions, returns, 'spearman');

  // BCa 95% CI via paired-resample of (prediction, return) tuples (B=10,000)
  const indices = rows.map((_, i) => i);
  const ci = bootstrapBCa(
    indices,
    (idx) => {
      const p = idx.map((i) => predictions[i]);
      const r = idx.map((i) => returns[i]);
      return informationCoefficient(p, r, 'spearman');
    },
    { nResamples: 10000 },
  );

  const current = { ic, ci_low: ci.low, ci_high: ci.high, n: rows.length };

  // Sliding-window series: one IC per day for the sparkline
  const dayMs = 24 * 60 * 60 * 1000;
  const series: RollingLLMICPoint[] = [];

  const sortedTimes = rows.map((r) => r.recorded_at.getTime());
  const firstDay = Math.floor(sortedTimes[0] / dayMs) * dayMs;
  const lastDay = Math.floor(sortedTimes[sortedTimes.length - 1] / dayMs) * dayMs;

  for (let day = firstDay; day <= lastDay; day += dayMs) {
    const windowStart = day - windowDays * dayMs;
    const inWindow = rows.filter((r) => {
      const t = r.recorded_at.getTime();
      return t > windowStart && t <= day;
    });
    if (inWindow.length < 30) continue;

    const p = inWindow.map((r) => r.ll_signed_score);
    const ret = inWindow.map((r) => r.forward_return ?? 0);
    const wIc = informationCoefficient(p, ret, 'spearman');

    // Smaller B for the sparkline series (performance vs precision trade-off)
    const wCi = bootstrapBCa(
      inWindow.map((_, i) => i),
      (idx) => informationCoefficient(idx.map((i) => p[i]), idx.map((i) => ret[i]), 'spearman'),
      { nResamples: 2000 },
    );

    series.push({
      t: new Date(day),
      ic: wIc,
      ci_low: wCi.low,
      ci_high: wCi.high,
      n: inWindow.length,
    });
  }

  // Verdict from headline CI
  let verdict: LLMICVerdict = 'INCONCLUSIVE';
  if (!isNaN(ci.low) && !isNaN(ci.high)) {
    if (ci.low > 0) verdict = 'EDGE_DETECTED';
    else if (ci.high < 0) verdict = 'NEGATIVE_EDGE';
  }

  return { series, current, verdict };
}

// ── getBaselineComparison — Surface 1 source (D-28) ──────────────────────

/**
 * Phase 21.1 D-28 / CORE-ML-21 — 3-way comparison table data.
 *
 * Reads the most recent baseline_eval LearningEvent (written by
 * /api/cron/baseline-eval) for engine36 + canonical7 metrics, and computes
 * LLM metrics from resolved LLMEvaluation rows at the requested horizon.
 *
 * Returns rows shaped for BaselinesComparisonTable. q_value is null for
 * v1 (BY-FDR across the full set runs in the cron, not in this read path).
 *
 * Per D-30 trust boundary: all numerics computed here; page components
 * receive pre-computed values only.
 *
 * @knowable_at  most recent baseline_eval LearningEvent.occurred_at
 */
export async function getBaselineComparison(
  horizon: 3 | 7 | 14 | 30 = 7,
): Promise<BaselineComparisonResult> {
  const evt = await prisma.learningEvent.findFirst({
    where: { event_type: 'baseline_eval' },
    orderBy: { occurred_at: 'desc' },
  });

  if (!evt) {
    return { rows: [], n_trials_attempted: 0, last_updated: null };
  }

  const delta = evt.delta as Record<string, unknown>;
  const e36 = (delta['engine36'] ?? {}) as Record<string, unknown>;
  const c7 = (delta['canonical7'] ?? {}) as Record<string, unknown>;
  const nullBrier = typeof delta['null_brier'] === 'number' ? delta['null_brier'] : 0.25;
  const nTrials = typeof delta['n_train'] === 'number' ? delta['n_train'] : 0;

  // LLM metrics at this horizon — aggregate over resolved LLMEvaluation rows
  const llmRows = await prisma.lLMEvaluation.findMany({
    where: { is_resolved: true, horizon_days: horizon },
    select: { ll_signed_score: true, forward_return: true, brier_buy_prob: true },
  });

  const llmIC =
    llmRows.length >= 10
      ? informationCoefficient(
          llmRows.map((r) => r.ll_signed_score),
          llmRows.map((r) => r.forward_return ?? 0),
          'spearman',
        )
      : NaN;

  const llmBrier =
    llmRows.length > 0
      ? llmRows.reduce((acc, r) => acc + (r.brier_buy_prob ?? 0), 0) / llmRows.length
      : NaN;

  const llmBrierCI =
    llmRows.length >= 30
      ? bootstrapBCa(
          llmRows.map((r) => r.brier_buy_prob ?? 0),
          (s) => s.reduce((a, b) => a + b, 0) / s.length,
          { nResamples: 5000 },
        )
      : { low: NaN, high: NaN };

  const rows: BaselineComparisonRow[] = [
    {
      metric: 'brier',
      llm: {
        value: llmBrier,
        ci: [llmBrierCI.low, llmBrierCI.high],
        q_value: null,
      },
      logistic24: {
        value: typeof e36['brier'] === 'number' ? e36['brier'] : NaN,
        ci: (Array.isArray(e36['brier_ci_bca_95']) ? e36['brier_ci_bca_95'] : [NaN, NaN]) as [number, number],
        q_value: null,
      },
      logisticCanonical: {
        value: typeof c7['brier'] === 'number' ? c7['brier'] : NaN,
        ci: (Array.isArray(c7['brier_ci_bca_95']) ? c7['brier_ci_bca_95'] : [NaN, NaN]) as [number, number],
        q_value: null,
      },
      null: { value: nullBrier },
    },
    {
      metric: 'ic',
      llm: { value: llmIC, ci: [NaN, NaN], q_value: null },
      logistic24: {
        value: typeof e36['ic'] === 'number' ? e36['ic'] : NaN,
        ci: [NaN, NaN],
        q_value: null,
      },
      logisticCanonical: {
        value: typeof c7['ic'] === 'number' ? c7['ic'] : NaN,
        ci: [NaN, NaN],
        q_value: null,
      },
      null: { value: 0 },
    },
    {
      metric: 'log_loss',
      llm: { value: NaN, ci: [NaN, NaN], q_value: null },
      logistic24: {
        value: typeof e36['log_loss'] === 'number' ? e36['log_loss'] : NaN,
        ci: [NaN, NaN],
        q_value: null,
      },
      logisticCanonical: {
        value: typeof c7['log_loss'] === 'number' ? c7['log_loss'] : NaN,
        ci: [NaN, NaN],
        q_value: null,
      },
      null: { value: Math.LN2 }, // log(2) ≈ 0.693 — 2-class uniform null
    },
  ];

  return {
    rows,
    n_trials_attempted: nTrials,
    last_updated: evt.occurred_at,
  };
}

// ── getPerSignalIC — Surface 4 source (D-29) ──────────────────────────────

/**
 * Phase 21.1 D-29 — IC by signal class from LearnedPattern aggregation.
 *
 * Reads LearnedPattern rows that carry rolling_ic_20d (written by Wave 4's
 * learn cron per-source-ic path). Aggregates by signal_class: computes the
 * mean IC and BCa 95% CI across all cells in the class with ≥5 observations.
 *
 * Returns one PerSignalIC row per class, sorted by |IC| descending (most
 * impactful signal classes float to the top, per UI-SPEC Surface 4).
 *
 * For classes with n < 10 total cells, the row is still returned (with NaN
 * CI values) so the operator can see "Insider has only 3 cells" — per
 * UI-SPEC empty-state contract: don't hide the row.
 *
 * Per D-30 trust boundary: no raw DB rows leave this function.
 *
 * @knowable_at  most recent LearnedPattern.last_updated for each cell
 */
export async function getPerSignalIC(): Promise<PerSignalIC[]> {
  const cells = await prisma.learnedPattern.findMany({
    where: { rolling_ic_20d: { not: null } },
    select: {
      signal_class: true,
      rolling_ic_20d: true,
      sample_size: true,
    },
  });

  // Group by signal_class
  const byClass = new Map<string, number[]>();
  for (const c of cells) {
    if (c.rolling_ic_20d == null) continue;
    if (!byClass.has(c.signal_class)) byClass.set(c.signal_class, []);
    byClass.get(c.signal_class)!.push(c.rolling_ic_20d);
  }

  const out: PerSignalIC[] = [];
  for (const [signal_class, ics] of byClass) {
    const n = ics.length;
    const mean = ics.reduce((a, b) => a + b, 0) / n;

    let ciLow = NaN;
    let ciHigh = NaN;
    if (n >= 5) {
      const result = bootstrapBCa(
        ics,
        (s) => s.reduce((a, b) => a + b, 0) / s.length,
        { nResamples: 5000 },
      );
      ciLow = result.low;
      ciHigh = result.high;
    }

    out.push({ signal_class, ic: mean, ci: [ciLow, ciHigh], n });
  }

  // Sort by |IC| descending — most impactful signal classes float to top
  out.sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic));
  return out;
}
