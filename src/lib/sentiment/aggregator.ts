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
