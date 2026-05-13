/**
 * Plan 20-C-05 — Joint sentiment-interaction feature primitives.
 *
 * Four pure derived-feature functions tested for marginal predictive Sharpe
 * uplift over sentiment-alone in the Diffusion Engine pattern key. Each is a
 * pure function — NO DB import, NO Date.now, NO Math.random.
 *
 * Hypothesis under test (see plan 20-C-05):
 *   Do these four features add Sharpe-difference over sentiment-alone after
 *   controlling for 5d momentum? Tested via paired block-bootstrap on CPCV
 *   per-fold Sharpe estimates (1000 resamples, 7-day blocks).
 *
 * See also: tests/learning.joint-features-key.test.ts for the additive
 * pattern-key hashing path, and scripts/ablate-joint-features.ts for the
 * end-to-end ablation runner.
 */

/**
 * sentiment × |returns_5d| — amplifies sentiment when price is moving.
 *
 * Sign of sentiment is preserved; the absolute value of the 5-day return is
 * used so that the feature captures "how strong the signal is" decoupled from
 * the realized direction (which is the LABEL, not a feature).
 */
export function sentimentMomentumProduct(
  sentiment: number, // [-1, +1]
  returns_5d: number, // raw return, e.g., 0.03 for +3%
): number {
  return sentiment * Math.abs(returns_5d);
}

/**
 * sentiment × volume_zscore — amplifies sentiment when discussion volume spikes.
 * Both signs are preserved: a negative sentiment × positive volume_z = strongly
 * negative interaction (loud bearish chatter).
 */
export function sentimentVolumeInteraction(
  sentiment: number, // [-1, +1]
  volume_zscore: number, // robust z-score from 20-A-02 MentionBaseline
): number {
  return sentiment * volume_zscore;
}

/**
 * First-difference of sentiment over a 3-day window — captures sentiment
 * momentum/decay. Sign-correct: positive = sentiment is rising, negative =
 * falling.
 */
export function deltaSentiment3d(
  sentiment_t: number,
  sentiment_t_minus_3: number,
): number {
  return sentiment_t - sentiment_t_minus_3;
}

/**
 * Cross-source bull-pct dispersion — population standard deviation across
 * per-source bull percentages. Reuses 20-A-05 bullPctStd semantics
 * (POPULATION std, not sample std) per CONTEXT.md line 107.
 *
 * Returns 0 for length < 2 (single source has no cross-source dispersion).
 */
export function sentimentDispersion(perSourceBullPct: number[]): number {
  if (perSourceBullPct.length < 2) return 0;
  let sum = 0;
  for (const x of perSourceBullPct) sum += x;
  const mean = sum / perSourceBullPct.length;
  let sqSum = 0;
  for (const x of perSourceBullPct) {
    const d = x - mean;
    sqSum += d * d;
  }
  return Math.sqrt(sqSum / perSourceBullPct.length);
}
