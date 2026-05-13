// src/lib/stats/bh-fdr.ts
//
// Phase 20-C-01: Benjamini-Hochberg (1995) false-discovery-rate correction.
// PIT-SAFE — pure numerical primitive, NO DB, NO network, NO external math
// libraries.
//
// Reference (Benjamini & Hochberg 1995): "Controlling the False Discovery
// Rate: A Practical and Powerful Approach to Multiple Testing," Journal of
// the Royal Statistical Society Series B 57(1): 289-300.

/**
 * Benjamini & Hochberg (1995) false-discovery-rate correction at level alpha.
 *
 * Given m raw p-values {p_1, ..., p_m}:
 *   1. Sort ascending: p_(1) <= p_(2) <= ... <= p_(m)
 *   2. Find largest k such that p_(k) <= (k/m) · alpha
 *   3. Reject H_0 for the k smallest p-values
 *
 * For per-test "corrected" p-values (BH-adjusted, monotonically NON-decreasing
 * in rank):
 *   p_corrected_(i) = min_{j >= i} (m/j) · p_(j)        (running min from the top)
 *   then clamped to [0, 1].
 *
 * The output `corrected[i]` is guaranteed to satisfy `corrected[i] >= raw[i]`
 * — this is the standard property of the BH adjustment and is unit-tested.
 *
 * Reference: Benjamini & Hochberg (1995), "Controlling the False Discovery
 * Rate: A Practical and Powerful Approach to Multiple Testing," Journal of
 * the Royal Statistical Society Series B 57(1): 289-300.
 *
 * @param pValues  the raw p-values to correct (order preserved in return)
 * @param alpha    FDR level (default 0.05)
 * @returns        { corrected: number[], rejected: boolean[] } same length
 *                 and INPUT ORDER as the input.
 */
export function benjaminiHochbergFDR(
  pValues: number[],
  alpha: number = 0.05,
): { corrected: number[]; rejected: boolean[] } {
  const m = pValues.length;
  if (m === 0) return { corrected: [], rejected: [] };

  // Validate inputs.
  for (let i = 0; i < m; i++) {
    if (!Number.isFinite(pValues[i])) {
      throw new Error(`benjaminiHochbergFDR: non-finite p-value at index ${i}`);
    }
    if (pValues[i] < 0 || pValues[i] > 1) {
      throw new Error(
        `benjaminiHochbergFDR: p-value at index ${i} out of [0,1] (got ${pValues[i]})`,
      );
    }
  }
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) {
    throw new Error(`benjaminiHochbergFDR: alpha must be in (0,1) (got ${alpha})`);
  }

  // Sort ascending, keeping the original index so we can return in input order.
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  // Compute corrected p-values via running-min-from-the-top.
  // p_corrected_(i) = min_{j >= i} (m/j) · p_(j)
  // Iterate from the largest rank (m) down to 1, maintaining the running min.
  const correctedSorted = new Array<number>(m);
  let runningMin = Infinity;
  for (let rank = m; rank >= 1; rank--) {
    const idxInSorted = rank - 1;
    const adjusted = (m / rank) * indexed[idxInSorted].p;
    runningMin = Math.min(runningMin, adjusted);
    correctedSorted[idxInSorted] = Math.min(1, Math.max(0, runningMin));
  }

  // Find the largest k such that p_(k) <= (k/m) · alpha.
  // Standard BH step-up procedure.
  let kReject = 0;
  for (let rank = m; rank >= 1; rank--) {
    const idxInSorted = rank - 1;
    if (indexed[idxInSorted].p <= (rank / m) * alpha) {
      kReject = rank;
      break;
    }
  }

  // Map back to input order.
  const corrected = new Array<number>(m);
  const rejected = new Array<boolean>(m);
  for (let rank = 1; rank <= m; rank++) {
    const idxInSorted = rank - 1;
    const originalIdx = indexed[idxInSorted].i;
    corrected[originalIdx] = correctedSorted[idxInSorted];
    rejected[originalIdx] = rank <= kReject;
  }

  return { corrected, rejected };
}
