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

  return {
    aggregated_bull_pct: rounded,
    aggregated_bear_pct: Math.round((100 - rounded) * 100) / 100,
    source_count: components.length,
    components,
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
