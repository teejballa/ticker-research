/**
 * Benjamini-Yekutieli (BY) False Discovery Rate Correction
 *
 * Implements the BY procedure for controlling the FDR under arbitrary
 * (including negative) dependence among test statistics.
 *
 * Reference: Benjamini & Yekutieli 2001, Annals of Statistics 29(4):1165-1188
 *   "The control of the false discovery rate in multiple testing under dependency"
 *
 * Also cited: ISL 2nd ed. Ch. 13 (Multiple Testing)
 *
 * Why BY not BH (per RESEARCH.md D-02): the ~156 cells in the learning engine
 * (signal_class × cap_class × horizon) share market regime and sector exposure —
 * they are NOT independent. BH assumes positive regression dependence (PRDS);
 * BY assumes nothing about the dependence structure.
 *
 * Hand-rolled — no external dependencies.
 */

export interface BYResult {
  decisions: Array<'REJECT' | 'ACCEPT'>;
  adjusted_p: number[];
  harmonic_sum: number;
}

/**
 * Benjamini-Yekutieli FDR correction.
 *
 * @param p_values - Array of raw p-values (order preserved in output)
 * @param q - Target FDR level (default 0.10)
 * @returns BYResult with decisions, adjusted p-values, and harmonic correction c(m)
 *
 * Algorithm:
 *  1. c(m) = Σᵢ₌₁^m 1/i  (harmonic number — dependence correction)
 *  2. Sort p-values ascending, track original indices
 *  3. Threshold at rank i: tᵢ = (i · q) / (m · c(m))
 *  4. Find largest rank k with p(k) ≤ tₖ; reject all ranks ≤ k
 *  5. Adjusted p: p_adj(i) = min(1, p(i) · m · c(m) / i)
 *  6. Monotone-enforce p_adj from largest rank down
 *
 * Reference: Benjamini & Yekutieli 2001, Annals of Statistics 29(4):1165-1188
 */
export function benjaminiYekutieli(p_values: number[], q: number = 0.1): BYResult {
  const m = p_values.length;

  // Edge case: empty input
  if (m === 0) {
    return { decisions: [], adjusted_p: [], harmonic_sum: 0 };
  }

  // Step 1: Harmonic correction c(m) = Σᵢ₌₁^m 1/i
  let harmonic_sum = 0;
  for (let i = 1; i <= m; i++) {
    harmonic_sum += 1 / i;
  }

  // Step 2: Sort p-values ascending, preserving original indices
  const indexed = p_values.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  // Step 3: Compute BY thresholds and find the largest rejecting rank
  // Threshold at rank r (1-indexed): t_r = (r * q) / (m * c(m))
  const threshold_denom = m * harmonic_sum;
  let largestRejectRank = -1; // 0-indexed in the sorted array

  for (let r = 0; r < m; r++) {
    const threshold = ((r + 1) * q) / threshold_denom;
    if (indexed[r].p <= threshold) {
      largestRejectRank = r;
    }
  }

  // Step 4: Build decisions: reject all ranks ≤ largestRejectRank
  const sortedDecisions: Array<'REJECT' | 'ACCEPT'> = indexed.map((_, r) =>
    r <= largestRejectRank ? 'REJECT' : 'ACCEPT',
  );

  // Step 5: Compute adjusted p-values in sorted order
  // p_adj(r) = min(1, p(r) * m * c(m) / (r+1))  [r is 0-indexed]
  const sortedAdjP: number[] = indexed.map((entry, r) =>
    Math.min(1, (entry.p * threshold_denom) / (r + 1)),
  );

  // Step 6: Monotone-enforce from largest rank down (isotonic correction)
  // Walk from m-1 down to 0: p_adj[r] = min(p_adj[r], p_adj[r+1])
  // This ensures adjusted p-values are non-decreasing in sorted order
  for (let r = m - 2; r >= 0; r--) {
    sortedAdjP[r] = Math.min(sortedAdjP[r], sortedAdjP[r + 1]);
  }

  // Step 7: Un-sort — map back to original input order
  const decisions: Array<'REJECT' | 'ACCEPT'> = new Array(m);
  const adjusted_p: number[] = new Array(m);

  for (let r = 0; r < m; r++) {
    const origIdx = indexed[r].i;
    decisions[origIdx] = sortedDecisions[r];
    adjusted_p[origIdx] = sortedAdjP[r];
  }

  return { decisions, adjusted_p, harmonic_sum };
}
