// @model-card: docs/cards/MODEL-CARD-agreement.md
/**
 * Plan 20-A-05 — Cross-platform agreement signal (Cookson & Engelberg "Echo Chambers").
 *
 * Pure-functions module. No Prisma imports, no env reads, no I/O — fully unit-testable.
 *
 * Formula:
 *
 *     agreement_score = 1 - std(bull_pct) / 50,   clamped to [0, 1]
 *
 * Returns null when fewer than 2 sources contributed (no cross-platform signal
 * is possible). Bessel-corrected sample std (sqrt(Σ(x-μ)² / (n-1))) so a
 * 2-source vector has well-defined dispersion. The /50 normalization assumes
 * bull_pct ∈ [0, 100]; callers are responsible for range validation BEFORE
 * invocation (aggregator throws on out-of-range inputs — T-20-A-05-02).
 *
 * The literature default threshold is 0.5 per Cookson & Engelberg. Production
 * reads the latest AgreementCalibration.threshold row from Neon (grid-searched
 * monthly against forward 7d realized-vol uplift); if no candidate beats
 * baseline with bootstrap CI > 0, the script persists 0.5 with
 * `null_result = true` (T-20-A-05-04).
 *
 * Used by:
 *   - `aggregator.ts` — surfaces `agreement_score` + `low_agreement_warning`
 *     on `SentimentIntelligenceSection`.
 *   - `learning.ts buildPatternKey()` — buckets score into 'mixed' | 'aligned'
 *     | 'na' so LearnedPattern accumulates separate Beta posteriors per
 *     agreement regime.
 *
 * See docs/cards/MODEL-CARD-agreement.md for the Mitchell-2019 model card,
 * including evaluation metric (forward 7d realized-vol uplift), null-result
 * handling, and the 6-month re-evaluation cadence.
 */

/** Literature default — used as fallback when no AgreementCalibration row exists. */
export const AGREEMENT_DEFAULT_THRESHOLD = 0.5;

export type AgreementBucket = 'mixed' | 'aligned' | 'na';

/**
 * Sample standard deviation (Bessel-corrected) of a numeric vector.
 *   std = sqrt( Σ (x - μ)² / (n - 1) )
 * Returns 0 when n < 2 (degenerate — no dispersion can be computed).
 */
export function std(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  let sse = 0;
  for (const v of values) {
    const d = v - mean;
    sse += d * d;
  }
  return Math.sqrt(sse / (n - 1));
}

/**
 * Cross-platform agreement score per Cookson & Engelberg ("Echo Chambers").
 *
 *     agreement_score = 1 - std(bull_pct) / 50,   clamped to [0, 1]
 *
 * @param perSourceBullPct - per-source bullish percentages ∈ [0, 100]
 * @returns score ∈ [0, 1], OR null when fewer than 2 sources contributed.
 */
export function agreementScore(perSourceBullPct: number[]): number | null {
  if (perSourceBullPct.length < 2) return null;
  const raw = 1 - std(perSourceBullPct) / 50;
  // Defend against FP drift — std of [0,100] gives sqrt(5000)≈70.71, so the
  // raw value can be negative. Clamp to [0,1] for downstream determinism.
  return Math.max(0, Math.min(1, raw));
}

/**
 * Strict-less-than threshold gate. `score === threshold` is NOT low agreement.
 * Threshold is supplied by the caller (latest AgreementCalibration.threshold
 * with AGREEMENT_DEFAULT_THRESHOLD fallback).
 */
export function lowAgreement(score: number, threshold: number): boolean {
  return score < threshold;
}

/**
 * Bucket an agreement score into the categorical key suffix appended to
 * LearnedPattern.pattern_key. 'na' is reserved for legacy rows / single-source
 * tickers so existing learned priors continue accumulating uninterrupted
 * (T-20-A-05-03 backward-compat).
 */
export function agreementBucket(
  score: number | null,
  threshold: number,
): AgreementBucket {
  if (score === null) return 'na';
  return lowAgreement(score, threshold) ? 'mixed' : 'aligned';
}
