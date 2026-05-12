// @model-card: docs/cards/MODEL-CARD-crowded-consensus.md
/**
 * Plan 20-A-01 — Dispersion features for the crowded-consensus flag.
 *
 * Pure functions only. ZERO IO. All callers pass already-aggregated inputs
 * (counts, per-source bull_pct, messages-by-author Map). Threshold loading +
 * Prisma reads live in `crowded-consensus-config.ts`.
 *
 * Why these three features (Cookson & Engelberg 2022, "Echo Chambers"):
 *   - Shannon entropy over {bull, bear, neutral} is LOW when one tag dominates —
 *     the academic signature of a one-sided narrative.
 *   - Volume z-score (mention_z) is HIGH when chatter is anomalously loud.
 *   - Author Gini is HIGH when a small number of accounts produce most messages.
 *
 * The conjunction (low entropy AND high volume AND low diversity) is the
 * "echo chamber" configuration that historically mean-reverts within 14d.
 * Single dimensions in isolation are noisy; the boolean AND is the signal.
 *
 * Naming inversion: spec wording reads "author_diversity < D_thresh" but
 * Gini is INVERSELY related to diversity (high Gini = low diversity), so
 * the implementation uses `gini > D_thresh`. See model card for the explicit
 * conversion `diversity ≈ 1 − gini` and which orientation the persisted
 * D_thresh follows (it is the Gini floor).
 */

/**
 * Shannon entropy in bits over the {bull, bear, neutral} categorical
 * distribution of per-message classifier tags.
 *
 * Formula: H(X) = -Σ p_i × log₂(p_i)
 *
 * Returns:
 *   - log₂(3) ≈ 1.585 when {bull, bear, neutral} is uniform (max disorder)
 *   - 0 when one category holds 100% of the mass (max concentration → CROWDED)
 *   - Convention 0 × log₂(0) := 0 (standard for empty bins)
 *
 * Throws when:
 *   - any count is negative, NaN, or Infinity
 *   - bull + bear + neutral === 0 (caller must filter empty windows upstream)
 */
export function shannonEntropy(counts: {
  bull: number;
  bear: number;
  neutral: number;
}): number {
  const { bull, bear, neutral } = counts;
  for (const c of [bull, bear, neutral]) {
    if (!Number.isFinite(c) || c < 0) {
      throw new Error(`shannonEntropy: invalid count ${c}; must be a finite non-negative number`);
    }
  }
  const total = bull + bear + neutral;
  if (total === 0) {
    throw new Error('shannonEntropy: total count is 0; caller must filter empty windows');
  }
  let H = 0;
  for (const c of [bull, bear, neutral]) {
    if (c === 0) continue; // 0 × log₂(0) := 0
    const p = c / total;
    H -= p * Math.log2(p);
  }
  return H;
}

/**
 * Population standard deviation (divisor n, not n-1) of bull_pct values
 * across cross-platform sources. Used as the secondary disagreement signal —
 * entropy is intra-platform per-message; this is inter-platform per-source.
 *
 * Returns:
 *   - 0 when all sources report identical bull_pct
 *   - Up to 50 when half are at 0 and half at 100
 *   - 0 when perSource.length < 2 (cannot compute stdev with one observation)
 */
export function bullPctStd(
  perSource: { source: string; bull_pct: number }[],
): number {
  if (!Array.isArray(perSource) || perSource.length < 2) return 0;
  const vals = perSource.map((s) => s.bull_pct);
  for (const v of vals) {
    if (!Number.isFinite(v)) {
      throw new Error(`bullPctStd: non-finite bull_pct ${v}`);
    }
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance =
    vals.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / vals.length;
  return Math.sqrt(variance);
}

/**
 * Gini coefficient of message-counts-per-author within a window.
 *
 * Formula (mean-difference form for bias-resistance with small samples):
 *   G = (Σᵢ Σⱼ |x_i − x_j|) / (2 × n² × x̄)
 *
 * Returns:
 *   - 0 when every author has the same count (perfect equality, HIGH diversity)
 *   - Approaches 1 as a single author dominates (perfect inequality, LOW diversity)
 *   - 0 when messagesByAuthor.size === 0 (vacuous; caller filters empty windows)
 *
 * Naming inversion: spec wording "author_diversity < D_thresh" reads
 * naturally but Gini is INVERSELY related to diversity. The crowdedConsensus
 * predicate uses `gini > D_thresh`. Model card documents the conversion.
 */
export function authorDiversityGini(
  messagesByAuthor: Map<string, number>,
): number {
  if (!messagesByAuthor || messagesByAuthor.size === 0) return 0;
  const counts = Array.from(messagesByAuthor.values());
  for (const c of counts) {
    if (!Number.isFinite(c) || c < 0) {
      throw new Error(`authorDiversityGini: invalid count ${c}`);
    }
  }
  const n = counts.length;
  const mean = counts.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;
  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(counts[i] - counts[j]);
    }
  }
  return sumDiff / (2 * n * n * mean);
}

export interface DispersionFeatures {
  /** Shannon entropy in bits over {bull, bear, neutral} message tags. */
  entropy_bits: number;
  /** Population stdev of bull_pct across contributing sources. 0 if <2 sources. */
  bull_pct_std: number;
  /** Gini of per-author message counts in the window. */
  author_gini: number;
  /** Mention z-score from 20-A-02 (stub returns 0 until 20-A-02 ships). */
  mention_z: number;
}

export interface CrowdedConsensusThresholds {
  H_thresh: number; // entropy ceiling
  V_thresh: number; // mention-z floor
  D_thresh: number; // gini floor (high gini = low diversity)
  model_version: string;
  computed_at: Date;
  brier_skill_score: number;
}

/**
 * The flag predicate.
 *
 *   crowded_consensus = (entropy < H_thresh) AND (mention_z > V_thresh) AND (gini > D_thresh)
 *
 * All three conditions must be met. Returns:
 *   - true/false when all four DispersionFeatures fields are finite AND thresholds are present
 *   - null when any input is non-finite OR thresholds are null (distinguishes
 *     "cannot compute" from "did not fire" so UI never shows a false negative
 *     as a true negative).
 */
export function crowdedConsensus(
  features: DispersionFeatures,
  thresholds: CrowdedConsensusThresholds | null,
): boolean | null {
  if (thresholds == null) return null;
  const { entropy_bits, bull_pct_std, author_gini, mention_z } = features;
  for (const v of [entropy_bits, bull_pct_std, author_gini, mention_z]) {
    if (!Number.isFinite(v)) return null;
  }
  const lowEntropy = entropy_bits < thresholds.H_thresh;
  const highVolume = mention_z > thresholds.V_thresh;
  const lowDiversity = author_gini > thresholds.D_thresh;
  return lowEntropy && highVolume && lowDiversity;
}
