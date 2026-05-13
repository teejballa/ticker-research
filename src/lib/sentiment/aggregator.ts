// @model-card: docs/cards/MODEL-CARD-reputation-weighted.md
/**
 * Post-Phase-19 — multi-source community sentiment aggregator.
 *
 * Fixes the "100% bullish" failure mode where a single echo-chamber source
 * (StockTwits on meme stocks like GME) drives the headline sentiment number
 * to an extreme that doesn't reflect the broader sentiment landscape.
 *
 * The pipeline already collects ApeWisdom + Swaggystocks bullish percentages
 * (Phase 19-C-05) but never aggregated them into a single cross-source number.
 * This module does that aggregation with two robustness techniques:
 *
 *   1. Beta(α=5, β=5) prior — equivalent to 10 pseudo-mentions at 50% bullish.
 *      A 100% StockTwits sample of N=20 messages becomes
 *      (100×20 + 5×100) / (20 + 10) ≈ 83% — accurately conveying "looks bullish
 *      but small sample, treat with caution" rather than "definitely bullish."
 *
 *   2. WEIGHT_CAP per source. One viral StockTwits thread can spike
 *      mention_count into the 100K+ range and silently dominate. Capping at
 *      WEIGHT_CAP keeps the aggregate honest about cross-source disagreement
 *      while still reflecting the dominant source.
 *
 * The aggregate is additive — the original `stocktwits_bull_pct` field
 * remains unchanged so the per-source UI breakdown can still display it.
 */

import { FEATURES } from '@/lib/features';
import {
  AGREEMENT_DEFAULT_THRESHOLD,
  agreementScore,
} from '@/lib/sentiment/agreement';
import {
  authorDiversityGini,
  bullPctStd,
  crowdedConsensus,
  shannonEntropy,
  type DispersionFeatures,
} from '@/lib/sentiment/dispersion';
import { mentionZ } from '@/lib/sentiment/mention-z-stub';
import { loadLatestCrowdedConsensusThresholds } from '@/lib/sentiment/crowded-consensus-config';
import {
  authorDisplayPrefix,
  authorShareDistribution,
  giniCoefficient,
  messageCountsByAuthor,
} from './gini';

export type SentimentSource = 'stocktwits' | 'swaggystocks' | 'apewisdom';

export interface SourceInput {
  /** 0-100 — null when the source could not parse a bullish percentage. */
  bullish_pct: number | null;
  /** Total messages / mentions in the sample. 0 = source contributed nothing. */
  mention_count: number | null;
}

export interface SentimentComponent {
  source: SentimentSource;
  bullish_pct: number;
  /** Effective weight after WEIGHT_CAP. */
  weight: number;
  /** Raw upstream mention_count (pre-cap). UI shows this so caps are inspectable. */
  raw_mention_count: number;
}

export interface AggregatedSentiment {
  /** Smoothed cross-source bullish percentage, 0-100. Null when no source contributed. */
  aggregated_bull_pct: number | null;
  /** Complement of aggregated_bull_pct; null when aggregated_bull_pct is null. */
  aggregated_bear_pct: number | null;
  /** Number of contributing sources (non-null bullish_pct AND mention_count > 0). */
  source_count: number;
  components: SentimentComponent[];
  // ── Plan 20-A-01 — crowded_consensus flag (GME-100% fix) ─────
  /**
   * true  → flag fires (warning UI in 'on' mode)
   * false → flag explicitly does NOT fire
   * null  → cannot compute (calibration unavailable, or any input non-finite)
   */
  crowded_consensus?: boolean | null;
  /** Inputs used to compute the flag — surfaced for telemetry + spot-check log. */
  dispersion_features?: DispersionFeatures | null;
  /** 'off' | 'shadow' | 'on' — value of FEATURE_CROWDED_CONSENSUS at compute time. */
  crowded_consensus_mode?: 'off' | 'shadow' | 'on';
  // ── Plan 20-A-02 — mention-volume z-score surfacing ──────────
  /**
   * Calibrated cross-platform mention-volume z-score against the per-ticker
   * rolling 90d median + MAD baseline (see src/lib/sentiment/baseline.ts).
   * Populated by upstream callers that hold ticker context; the pure
   * aggregator function does not load this from the DB itself.
   * null = baseline unavailable (sparse-data ticker, n<30) or upstream did
   * not populate.
   */
  mention_z?: number | null;
  /**
   * mention_z > Z_thresh[cap_class] — the calibrated replacement for the
   * GME-era stocktwits_is_trending heuristic. Populated upstream; the off
   * path of FEATURE_MENTION_Z_TRENDING preserves the legacy boolean.
   */
  is_trending_v2?: boolean | null;
  /** 'off' | 'shadow' | 'on' — value of FEATURE_MENTION_Z_TRENDING at compute time. */
  mention_z_trending_mode?: 'off' | 'shadow' | 'on';
  // ── Plan 20-A-05 — cross-platform agreement signal ───────────
  /**
   * agreement_score = 1 - std(per-source bull_pct) / 50, clamped [0, 1].
   * Null when <2 sources contributed (T-20-A-05-01 sparse-data sentinel) OR
   * when FEATURE_AGREEMENT_SIGNAL is 'off'.
   */
  agreement_score?: number | null;
  /**
   * True iff agreement_score < calibrated threshold (default 0.5 per Cookson
   * & Engelberg). Drives the "MIXED · LOW AGREEMENT" UI badge when the flag
   * is 'on'; logged but UI-hidden when 'shadow'; always false when 'off'.
   */
  low_agreement_warning?: boolean;
  /** 'off' | 'shadow' | 'on' — value of FEATURE_AGREEMENT_SIGNAL at compute time. */
  agreement_signal_mode?: 'off' | 'shadow' | 'on';
  // ── Plan 20-C-03 — Cresci bot filter + coordinated-posting warning ────
  /**
   * coordinated_posting === true when the latest CoordinationCluster row
   * for the ticker within the 24h window has is_flagged === true.
   * Populated by upstream callers that hold the row context; the pure
   * aggregator function does not load this from the DB itself.
   */
  coordinated_posting?: boolean;
  /** Bot-filter summary surfaced to the UI subtext. Populated regardless
   *  of FEATURE_BOT_FILTER mode so 'shadow' callers can still inspect. */
  bot_filter_summary?: BotFilterSummary | null;
  /** 'off' | 'shadow' | 'on' — value of FEATURE_BOT_FILTER at compute time. */
  bot_filter_mode?: 'off' | 'shadow' | 'on';
}

// ── Plan 20-C-03 — Bot-filter summary surfaced to UI + downstream consumers ─
export interface BotFilterSummary {
  /** Count of distinct author_ids with is_bot_flagged=true in the 24h window. */
  authors_flagged: number;
  /** cluster_size from the latest CoordinationCluster row in the 24h window. */
  messages_flagged_coordinated: number;
  /** is_flagged of the latest CoordinationCluster row (mirrors coordinated_posting). */
  coordinated_posting: boolean;
}

/**
 * Apply the bot-filter weight gate to an upstream `mention_count`.
 * When `FEATURE_BOT_FILTER === 'on'`, the caller pre-filters by author_id
 * and reduces the effective mention_count by the count of bot-flagged authors.
 * Otherwise the count passes through unchanged (off/shadow modes).
 *
 * The aggregator works on aggregate `SourceInput`s — per-message gating is the
 * CALLER's responsibility. This helper centralizes the count math so the
 * weight delta is auditable. T-20-C-03-05: filter affects WEIGHT, not VISIBILITY.
 */
export function applyBotFilterToCount(
  count: number,
  n_flagged: number,
  mode: 'off' | 'shadow' | 'on',
): number {
  if (mode !== 'on') return count;
  return Math.max(0, count - n_flagged);
}

/**
 * Beta(α=5, β=5) prior — equivalent to 10 pseudo-mentions at 50% bullish.
 * Higher α=β = more aggressive smoothing toward neutral; 5/5 is light-touch
 * (only meaningfully shifts samples below ~30 mentions).
 */
const PRIOR_ALPHA = 5;
const PRIOR_BETA = 5;
/**
 * Per-source weight ceiling. One viral thread can push mention_count past 100K
 * and silently dominate. 10K is generous (a typical "trending" stock has
 * hundreds of mentions) while preventing one source from completely overriding
 * cross-source disagreement.
 */
const WEIGHT_CAP = 10_000;

export interface AggregatorInputs {
  stocktwits: SourceInput | null;
  swaggystocks: SourceInput | null;
  apewisdom: SourceInput | null;
}

function inputToComponent(
  source: SentimentSource,
  input: SourceInput | null,
): SentimentComponent | null {
  if (!input) return null;
  const { bullish_pct, mention_count } = input;
  if (bullish_pct == null || mention_count == null || mention_count <= 0) return null;
  if (!Number.isFinite(bullish_pct) || !Number.isFinite(mention_count)) return null;
  return {
    source,
    bullish_pct,
    weight: Math.min(mention_count, WEIGHT_CAP),
    raw_mention_count: mention_count,
  };
}

export function aggregateCommunitySentiment(inputs: AggregatorInputs): AggregatedSentiment {
  const components: SentimentComponent[] = [];
  for (const source of ['stocktwits', 'swaggystocks', 'apewisdom'] as const) {
    const c = inputToComponent(source, inputs[source]);
    if (c) components.push(c);
  }

  // ── Plan 20-A-05 — Range validation (T-20-A-05-02 mitigation) ─────────────
  // Per-source bull_pct MUST be ∈ [0, 100]. Out-of-range silently breaks the
  // /50 normalization in agreementScore. Throw with diagnostic — caller bug.
  for (const c of components) {
    if (c.bullish_pct < 0 || c.bullish_pct > 100) {
      throw new Error(
        `aggregator: per-source bull_pct out of [0,100]: source=${c.source} ` +
          `bullish_pct=${c.bullish_pct} — see T-20-A-05-02`,
      );
    }
  }

  if (components.length === 0) {
    return {
      aggregated_bull_pct: null,
      aggregated_bear_pct: null,
      source_count: 0,
      components: [],
    };
  }

  // Bayesian-smoothed weighted average.
  //   numerator   = Σ(bull_i × w_i) + α × 100
  //   denominator = Σ(w_i) + α + β
  // The prior (α=β=5) is equivalent to 10 pseudo-mentions at 50% bullish.
  let weightedSum = 0;
  let totalWeight = 0;
  for (const c of components) {
    weightedSum += c.bullish_pct * c.weight;
    totalWeight += c.weight;
  }
  const num = weightedSum + PRIOR_ALPHA * 100;
  const den = totalWeight + PRIOR_ALPHA + PRIOR_BETA;
  const aggregated_bull_pct = num / den;
  const clamped = Math.max(0, Math.min(100, aggregated_bull_pct));
  const rounded = Math.round(clamped * 100) / 100;

  // ── Plan 20-A-05 — Agreement signal (flag-gated) ──────────────────────────
  // Three-mode flag (FEATURE_AGREEMENT_SIGNAL):
  //   'off':    short-circuit; agreement fields are undefined
  //   'shadow': compute + surface on AggregatedSentiment; UI badge hidden
  //   'on':     compute + surface + UI badge visible
  // Threshold defaults to AGREEMENT_DEFAULT_THRESHOLD (0.5); the calibrated
  // override is loaded async via getLatestAgreementThreshold() at the
  // SourcePackage layer when a Prisma client is available.
  const agreementMode = FEATURES.agreement_signal_mode;
  let agreement_score: number | null | undefined;
  let low_agreement_warning: boolean | undefined;
  if (agreementMode === 'off') {
    agreement_score = null;
    low_agreement_warning = false;
  } else {
    agreement_score = agreementScore(components.map((c) => c.bullish_pct));
    low_agreement_warning =
      agreement_score != null && agreement_score < AGREEMENT_DEFAULT_THRESHOLD;
  }

  return {
    aggregated_bull_pct: rounded,
    aggregated_bear_pct: Math.round((100 - rounded) * 100) / 100,
    source_count: components.length,
    components,
    agreement_score,
    low_agreement_warning,
    agreement_signal_mode: agreementMode,
  };
}

// ─── Plan 20-A-05 — Threshold loader (async, Prisma-bound) ─────────────────
/**
 * Reads the latest AgreementCalibration.threshold (by computed_at DESC).
 * Falls back to AGREEMENT_DEFAULT_THRESHOLD (0.5 — Cookson & Engelberg
 * literature default) when no calibration row exists.
 *
 * Cached for the duration of one process (no in-process TTL — calibration
 * runs monthly so per-cold-start refresh is sufficient). The cache is
 * cleared by Vercel's serverless container recycling.
 */
let _cachedAgreementThreshold: number | null = null;

export async function getLatestAgreementThreshold(): Promise<number> {
  if (_cachedAgreementThreshold != null) return _cachedAgreementThreshold;
  try {
    const { prisma } = await import('@/lib/db');
    const row = await prisma.agreementCalibration.findFirst({
      orderBy: { computed_at: 'desc' },
    });
    _cachedAgreementThreshold = row?.threshold ?? AGREEMENT_DEFAULT_THRESHOLD;
  } catch {
    // No DB available (unit tests, missing DATABASE_URL) — return literature default.
    _cachedAgreementThreshold = AGREEMENT_DEFAULT_THRESHOLD;
  }
  return _cachedAgreementThreshold;
}

/** Recompute low_agreement_warning for an AggregatedSentiment using the
 *  calibrated threshold. Called by SourcePackage assembly so the UI badge
 *  reflects the latest AgreementCalibration row rather than the literature
 *  default 0.5. No-op when agreement_score is null. */
export function applyCalibratedAgreementThreshold(
  agg: AggregatedSentiment,
  threshold: number,
): AggregatedSentiment {
  if (agg.agreement_score == null) return agg;
  return {
    ...agg,
    low_agreement_warning: agg.agreement_score < threshold,
  };
}

// ─── Plan 20-A-03 — Decayed aggregator branch (shadow lifecycle) ──────────
// SENTIMENT_DECAY_MODE ∈ {off, shadow, on}
//   off    → existing aggregateCommunitySentiment only (current production behavior)
//   shadow → both paths compute; the decayed result is logged but NOT served
//   on     → aggregateDecayed result is the authoritative number (cutover)
//
// Cutover from shadow → on requires the paired-bootstrap report from
// scripts/tune-decay.ts --bootstrap-cutover with 95% CI lower-bound > 0
// on Sharpe (T-20-A-03-04).

export const DECAY_EPSILON = 1e-9; // T-20-A-03-02 — div-by-zero floor

export type SentimentDecayMode = 'off' | 'shadow' | 'on';

export interface DecayedAggregatorInput {
  ticker: string;
  source: string; // raw source string from DB (CipherSource)
  message_id: string;
  classifier_score: number; // [-1, +1]
  decay_weight: number; // pre-computed, persisted in SentimentObservation by 20-A-03 backfill
}

export interface DecayedAggregatorResult {
  weighted_score: number; // [-1, +1]
  total_weight: number;
  fallback_to_uniform: boolean; // true iff Σ decay_weight < EPSILON
  n_rows: number;
}

/**
 * Σ score × decay_weight / Σ decay_weight, with uniform-weight fallback when
 * Σ decay_weight < EPSILON (all-old samples).
 */
export function aggregateDecayed(
  rows: DecayedAggregatorInput[],
): DecayedAggregatorResult {
  if (rows.length === 0) {
    return {
      weighted_score: 0,
      total_weight: 0,
      fallback_to_uniform: false,
      n_rows: 0,
    };
  }
  let num = 0;
  let den = 0;
  for (const r of rows) {
    num += r.classifier_score * r.decay_weight;
    den += r.decay_weight;
  }
  if (den < DECAY_EPSILON) {
    // Uniform fallback — all decay_weights effectively zero.
    const uniform =
      rows.reduce((a, r) => a + r.classifier_score, 0) / rows.length;
    return {
      weighted_score: uniform,
      total_weight: 0,
      fallback_to_uniform: true,
      n_rows: rows.length,
    };
  }
  return {
    weighted_score: num / den,
    total_weight: den,
    fallback_to_uniform: false,
    n_rows: rows.length,
  };
}

/** Reads SENTIMENT_DECAY_MODE env var; defaults to 'off' (safe default for first deploy). */
export function getDecayMode(): SentimentDecayMode {
  const v = (process.env.SENTIMENT_DECAY_MODE ?? 'off').toLowerCase();
  if (v === 'off' || v === 'shadow' || v === 'on') return v;
  // Unknown values fail closed → 'off'
  return 'off';
}

// ─── Plan 20-B-04 — Source-tier weighting branch (shadow lifecycle) ─────────
// SOURCE_TIER_MODE ∈ {off, shadow, on}
//   off    → baseline aggregateCommunitySentiment only (current production behavior);
//            tier_weights_applied is an empty object
//   shadow → baseline numbers ARE returned as the authoritative aggregate;
//            tier weights are LOOKED UP and surfaced (so UI/telemetry can compare)
//            but the bull_pct number is the baseline (NOT tier-adjusted)
//   on     → tier multiplier is applied to each component's weight:
//                w'_i = w_i × getWeightForSource(source_i)
//            aggregate bull_pct = Beta-smoothed weighted mean over w'_i
//
// Cutover from shadow → on requires (per Hard Cleanup Gate criterion 4):
//   (a) ≥30d of SourceTier history per source AND
//   (b) paired-bootstrap on validation Sharpe of tier-weighted vs unweighted
//       aggregate with 95% CI lower-bound > 0 (1000 resamples).
//
// Cold-start fallback: missing SourceTier row → getWeightForSource returns 1.0
// (degrades to off behavior for that source).
import { getWeightForSource } from './source-tier';

export type SourceTierMode = 'off' | 'shadow' | 'on';

export interface TierAwareAggregatorOptions {
  /** Overrides SOURCE_TIER_MODE env var when provided. */
  mode?: SourceTierMode;
  /** Cutoff date for getWeightForSource SourceTier lookup; defaults to now(). */
  asOf?: Date;
}

/** Reads SOURCE_TIER_MODE env var; defaults to 'off' (safe default for first deploy). */
export function getSourceTierMode(): SourceTierMode {
  const v = (process.env.SOURCE_TIER_MODE ?? 'off').toLowerCase();
  if (v === 'off' || v === 'shadow' || v === 'on') return v;
  // Unknown values fail closed → 'off'
  return 'off';
}

function resolveTierMode(opts?: TierAwareAggregatorOptions): SourceTierMode {
  if (opts?.mode) return opts.mode;
  return getSourceTierMode();
}

/**
 * Tier-aware variant of `aggregateCommunitySentiment`.
 *
 * Preserves the baseline `aggregateCommunitySentiment` signature unchanged
 * (called internally). When `mode === 'off'`, returns identical numbers with
 * `tier_weights_applied = {}`. When `mode === 'on'`, recomputes the Beta-
 * smoothed weighted mean using `w'_i = w_i × tier_weight_i`. When `mode ===
 * 'shadow'`, returns the BASELINE numbers but surfaces the tier weights so
 * the UI / telemetry can compare without changing the report-facing aggregate.
 */
export async function aggregateCommunitySentimentTierAware(
  inputs: AggregatorInputs,
  options?: TierAwareAggregatorOptions,
): Promise<
  AggregatedSentiment & {
    tier_weights_applied: Record<string, number>;
    tier_mode: SourceTierMode;
  }
> {
  const mode = resolveTierMode(options);
  const baseline = aggregateCommunitySentiment(inputs);

  if (mode === 'off') {
    return { ...baseline, tier_weights_applied: {}, tier_mode: mode };
  }

  const asOf = options?.asOf ?? new Date();
  const tier_weights_applied: Record<string, number> = {};
  // Compute tier-adjusted numerator/denominator for the Beta-smoothed mean.
  let weightedSum = 0;
  let totalWeight = 0;
  for (const c of baseline.components) {
    const tier = await getWeightForSource(c.source, asOf);
    tier_weights_applied[c.source] = tier;
    const adjW = c.weight * tier;
    weightedSum += c.bullish_pct * adjW;
    totalWeight += adjW;
  }
  // Beta(α=5, β=5) prior — equivalent to 10 pseudo-mentions at 50% bullish.
  // Constants mirror PRIOR_ALPHA / PRIOR_BETA above (kept local to avoid
  // export churn on a private constant).
  const PRIOR_ALPHA_LOCAL = 5;
  const PRIOR_BETA_LOCAL = 5;
  const num = weightedSum + PRIOR_ALPHA_LOCAL * 100;
  const den = totalWeight + PRIOR_ALPHA_LOCAL + PRIOR_BETA_LOCAL;
  const tierAdjustedBull = Math.max(0, Math.min(100, num / den));
  const tierAdjustedBullRounded = Math.round(tierAdjustedBull * 100) / 100;
  const tierAdjustedBearRounded =
    Math.round((100 - tierAdjustedBull) * 100) / 100;

  if (mode === 'shadow') {
    // Return baseline aggregate; surface tier weights for telemetry/UI inspection.
    return {
      ...baseline,
      tier_weights_applied,
      tier_mode: mode,
    };
  }

  // mode === 'on' — return tier-adjusted aggregate as authoritative
  return {
    ...baseline,
    aggregated_bull_pct: tierAdjustedBullRounded,
    aggregated_bear_pct: tierAdjustedBearRounded,
    tier_weights_applied,
    tier_mode: mode,
  };
}

// ─── Plan 20-A-01 — crowded_consensus flag (GME-100% fix) ──────────────────────
/**
 * Compute the crowded_consensus flag + the 4-feature dispersion vector.
 *
 * Sibling to `aggregateCommunitySentiment`. Called by the cron writer
 * (sentiment-scan) and the per-request analysis path. The three-mode flag
 * gates work as follows:
 *   - 'off':    short-circuit; return mode only (flag/features undefined)
 *   - 'shadow': compute, persist into SentimentSnapshot.community_aggregated.crowded_consensus_shadow,
 *               but DO NOT surface to UI (UI suppresses on 'shadow')
 *   - 'on':     compute + surface to UI
 */
export async function computeCrowdedConsensus(args: {
  components: SentimentComponent[];
  messageTagCounts: { bull: number; bear: number; neutral: number };
  messagesByAuthor: Map<string, number>;
  observations: unknown[];
}): Promise<{
  flag: boolean | null | undefined;
  features: DispersionFeatures | null | undefined;
  mode: 'off' | 'shadow' | 'on';
}> {
  const mode = FEATURES.crowded_consensus_mode;
  if (mode === 'off') {
    return { flag: undefined, features: undefined, mode };
  }

  const thresholds = await loadLatestCrowdedConsensusThresholds();

  // Compute features even if thresholds are null — feature persistence has
  // independent value (audit log, debugging) and is cheap.
  let features: DispersionFeatures | null;
  try {
    const total =
      args.messageTagCounts.bull +
      args.messageTagCounts.bear +
      args.messageTagCounts.neutral;
    features = {
      entropy_bits: total > 0 ? shannonEntropy(args.messageTagCounts) : NaN,
      bull_pct_std: bullPctStd(
        args.components.map((c) => ({ source: c.source, bull_pct: c.bullish_pct })),
      ),
      author_gini: authorDiversityGini(args.messagesByAuthor),
      mention_z: mentionZ(args.observations),
    };
  } catch {
    features = null;
  }

  if (thresholds == null || features == null) {
    return { flag: null, features, mode };
  }

  const flag = crowdedConsensus(features, thresholds);
  return { flag, features, mode };
}

// ─── Plan 20-A-04 — Author-concentration via Gini ──────────────────────────
/**
 * Feature flag for the author-Gini computation. Three modes (off/shadow/on).
 * Read directly from env (mirrors the SENTIMENT_DECAY_MODE pattern). Default
 * 'off' so first deploys are dark.
 */
export type AuthorGiniMode = 'off' | 'shadow' | 'on';

export function getAuthorGiniMode(): AuthorGiniMode {
  const v = (process.env.FEATURE_AUTHOR_GINI ?? 'off').toLowerCase();
  if (v === 'off' || v === 'shadow' || v === 'on') return v;
  return 'off';
}

/** Below this many distinct authors, Gini is statistically meaningless on a
 *  24h window — return null so the UI hides the sub-card.
 *  Documented in HYPERPARAMETERS.md.  T-20-A-04-02. */
export const AUTHOR_GINI_N_MIN = 5;

/** Per-author down-weight when 24h share > per-ticker Q1.
 *  Cookson & Engelberg 2020 literature default. */
export const AUTHOR_GINI_DOWNWEIGHT = 0.5;

/** Global fallback Q1 sentinel used when no AuthorShareCalibration row exists
 *  for the ticker. Conservative — only fires on the very top tail. */
export const AUTHOR_GINI_GLOBAL_Q1_FALLBACK = 0.25;

export interface AuthorConcentrationResult {
  gini_coefficient: number | null;
  author_concentration: Array<{
    author_hash_prefix: string;
    share: number;
    message_count: number;
  }> | null;
  /** Per-author down-weight multipliers ∈ {1.0, 0.5}.
   *  Empty Map when down-weighting is off or no authors exceeded Q1. */
  weight_multipliers: Map<string, number>;
}

/**
 * Compute the author-concentration block for `ticker` over the rolling 24h
 * window. Reads from SentimentObservation (20-Z-01) — PIT-safe via
 * `fetched_at` (NEVER the upstream-claimed-timestamp — S2 / 20-Z-07).
 *
 * Returns:
 *   - { gini=null, author_concentration=null, weight_multipliers=∅ }
 *     when FEATURE_AUTHOR_GINI === 'off' (short-circuits the DB call)
 *   - same when n_authors < AUTHOR_GINI_N_MIN (T-20-A-04-02)
 *   - same when no observations in the window
 *
 * When FEATURE_AUTHOR_GINI === 'on' (or 'shadow'): looks up the latest
 * AuthorShareCalibration for the ticker. Authors whose 24h share exceeds the
 * Q1 threshold are flagged for down-weighting (multiplier = AUTHOR_GINI_DOWNWEIGHT).
 */
export async function computeAuthorConcentration(
  ticker: string,
  now: Date = new Date(),
): Promise<AuthorConcentrationResult> {
  const mode = getAuthorGiniMode();
  if (mode === 'off') {
    return {
      gini_coefficient: null,
      author_concentration: null,
      weight_multipliers: new Map(),
    };
  }

  // Lazy import — keep this module unit-testable without DATABASE_URL.
  const { prisma } = await import('@/lib/db');

  const since = new Date(now.getTime() - 24 * 3600 * 1000);
  const obs = await prisma.sentimentObservation.findMany({
    where: { ticker, fetched_at: { gte: since } },
    select: { author_id: true, classifier_score: true },
  });

  if (obs.length === 0) {
    return {
      gini_coefficient: null,
      author_concentration: null,
      weight_multipliers: new Map(),
    };
  }

  const counts = messageCountsByAuthor(obs);
  const dist = authorShareDistribution(counts);
  const nAuthors = counts.size;

  if (nAuthors < AUTHOR_GINI_N_MIN || dist.length === 0) {
    return {
      gini_coefficient: null,
      author_concentration: null,
      weight_multipliers: new Map(),
    };
  }

  const values = Array.from(counts.values());
  const gini = giniCoefficient(values);

  // Top-5 author shares with display-safe prefixes (defense-in-depth re-hash).
  const top5 = dist.slice(0, 5).map((d) => ({
    author_hash_prefix: authorDisplayPrefix(d.author_id),
    share: d.share,
    message_count: d.message_count,
  }));

  // Per-author weight multipliers (Q1-relative; Cookson 2020).
  const weight_multipliers = new Map<string, number>();
  const latestCal = await prisma.authorShareCalibration.findFirst({
    where: { ticker },
    orderBy: { computed_at: 'desc' },
  });
  const q1 = latestCal?.q1_author_share_pct ?? AUTHOR_GINI_GLOBAL_Q1_FALLBACK;
  if (latestCal == null) {
    console.warn(
      `[20-A-04] No AuthorShareCalibration for ${ticker}; using global Q1=${AUTHOR_GINI_GLOBAL_Q1_FALLBACK}`,
    );
  }
  for (const d of dist) {
    if (d.share > q1) {
      weight_multipliers.set(d.author_id, AUTHOR_GINI_DOWNWEIGHT);
    } else {
      weight_multipliers.set(d.author_id, 1.0);
    }
  }

  return {
    gini_coefficient: gini,
    author_concentration: top5,
    weight_multipliers,
  };
}
