/**
 * Benjamini-Yekutieli (BY) False Discovery Rate Correction
 *  + Phase 22 D-15: Hierarchical BY → meta-BH (Benjamini-Bogomolov 2014)
 *
 * Implements the BY procedure for controlling the FDR under arbitrary
 * (including negative) dependence among test statistics, plus a hierarchical
 * wrapper (`hierarchicalBYBH`) for multi-family selective inference.
 *
 * References:
 *   - Benjamini, Y. & Yekutieli, D. (2001). "The control of the false discovery
 *     rate in multiple testing under dependency." *Annals of Statistics*
 *     29(4):1165-1188.
 *   - Benjamini, Y. & Bogomolov, M. (2014). "Selective inference on multiple
 *     families of hypotheses." *Journal of the Royal Statistical Society B*,
 *     76(1):297-318. doi:10.1111/rssb.12028.
 *   - ISL 2nd ed. Ch. 13 (Multiple Testing)
 *
 * Why BY not BH (per RESEARCH.md D-02): the ~156 cells in the learning engine
 * (signal_class × cap_class × horizon) share market regime and sector exposure —
 * they are NOT independent. BH assumes positive regression dependence (PRDS);
 * BY assumes nothing about the dependence structure.
 *
 * Why hierarchical BY → meta-BH (per Phase 22 D-15 + Pitfall 3): with the
 * 4-bucket regime split, naive single-pass BY across all cells × all regimes
 * inflates c(m) from ln(157)≈5.6 to ln(628)≈7.0 (~25% denominator inflation,
 * ~25% power loss per regime). The hierarchical structure keeps per-regime
 * c(m_r) at the original level, paid for by a small outer BH correction over
 * the 4 regime-family summary statistics.
 *
 * Hand-rolled — no external dependencies.
 */

import type { RegimeLabel } from '@/lib/regime/types';

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

// ─── Phase 22 D-15: Hierarchical BY → meta-BH wrapper ──────────────────────
//
// Benjamini & Bogomolov 2014 ("Selective inference on multiple families of
// hypotheses", JRSS B 76(1):297-318). Canonical use case: multi-tissue eQTL
// analysis, where each tissue is a family of tests and the outer BH controls
// the family-level FDR over per-tissue minimum q-values.
//
// Cipher reuse: each of the 4 market regimes (bull/bear × low-vol/high-vol)
// is one "family". Inner per-regime BY preserves c(m_r) at its single-family
// value; the outer BH over family-summary statistics gates which regimes are
// allowed to carry promotions.
//
// Inner uses BY (dependent tests, robust to positive correlation among cells
// within a regime, since cells share the regime's market context).
// Outer uses BH (regime families are conditionally independent given the
// regime-classifier assignment, so BH's standard FDR control applies).

/** Result of `hierarchicalBYBH`. */
export interface HierarchicalBYResult {
  /** Per-regime BY result (decisions + adjusted_p + harmonic_sum c(m_r)). */
  per_regime: Record<RegimeLabel, BYResult>;
  /** Outer meta-BH decisions per regime (REJECT = regime passes outer gate). */
  meta_bh_decisions: Record<RegimeLabel, 'REJECT' | 'ACCEPT'>;
  /**
   * Family-summary statistic per regime — `min(per-family adjusted q)`.
   * 1.0 for empty regimes (no inner cells). Used as the input to outer BH.
   */
  effective_q: Record<RegimeLabel, number>;
}

/**
 * Inner helper: classic Benjamini-Hochberg 1995 FDR control at level `q`.
 * Used at the OUTER level of `hierarchicalBYBH` over family-summary statistics.
 * (Per BB-2014 §3, BH is appropriate at the outer level because regime
 * families are conditionally independent given the regime-classifier
 * assignment, and BH's PRDS assumption is satisfied.)
 */
function benjaminiHochbergDecisions(
  p_values: number[],
  q: number,
): Array<'REJECT' | 'ACCEPT'> {
  const m = p_values.length;
  if (m === 0) return [];

  const indexed = p_values.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  // BH threshold at rank r (1-indexed): t_r = (r * q) / m
  let largestRejectRank = -1; // 0-indexed in sorted array
  for (let r = 0; r < m; r++) {
    const threshold = ((r + 1) * q) / m;
    if (indexed[r].p <= threshold) {
      largestRejectRank = r;
    }
  }

  const sortedDecisions: Array<'REJECT' | 'ACCEPT'> = indexed.map((_, r) =>
    r <= largestRejectRank ? 'REJECT' : 'ACCEPT',
  );

  const decisions: Array<'REJECT' | 'ACCEPT'> = new Array(m);
  for (let r = 0; r < m; r++) {
    decisions[indexed[r].i] = sortedDecisions[r];
  }
  return decisions;
}

/**
 * Hierarchical BY-FDR per Benjamini & Bogomolov 2014.
 *
 * Stage 1 (inner): for each regime r, call `benjaminiYekutieli(P_r, q_inner)`.
 *                  Capture per-regime `BYResult`. Compute the family-summary
 *                  statistic `Q_r = min_i(adjusted_p_r,i)`. If `P_r` is empty,
 *                  `Q_r = 1.0` (no signal → fail outer gate by default).
 *
 * Stage 2 (outer): apply Benjamini-Hochberg (NOT BY) to `{Q_r : r ∈ regimes}`
 *                  at level `q_outer`. Regimes failing meta-BH are marked
 *                  `ACCEPT` (no promotions); regimes passing are `REJECT`
 *                  (promotions inside that regime preserved at the inner-BY
 *                  q-value).
 *
 * Returned `per_regime[r]` carries the raw inner-BY decisions. The CONSUMER
 * (`/api/cron/learn` PASS 2) is expected to read `meta_bh_decisions[r]` and
 * demote ALL inner rejections to ACCEPT when `meta_bh_decisions[r] === 'ACCEPT'`.
 * This separation keeps the wrapper pure-functional and lets callers introspect
 * the unmasked inner decisions (useful for the IS paper's "what would the
 * naive denominator have promoted" table).
 *
 * @param perRegimePValues — record keyed by RegimeLabel, value is the p-value
 *   panel for cells in that regime.
 * @param q_inner — per-regime BY target FDR (default 0.10).
 * @param q_outer — outer BH target FDR across regime families (default 0.10).
 *
 * @returns HierarchicalBYResult (per_regime + meta_bh_decisions + effective_q).
 */
export function hierarchicalBYBH(
  perRegimePValues: Record<RegimeLabel, number[]>,
  q_inner: number = 0.1,
  q_outer: number = 0.1,
): HierarchicalBYResult {
  const regimeKeys = Object.keys(perRegimePValues) as RegimeLabel[];

  // ─── Stage 1 (inner): per-regime BY ──────────────────────────────────────
  const per_regime = {} as Record<RegimeLabel, BYResult>;
  const effective_q = {} as Record<RegimeLabel, number>;

  for (const r of regimeKeys) {
    const panel = perRegimePValues[r] ?? [];
    const inner = benjaminiYekutieli(panel, q_inner);
    per_regime[r] = inner;

    // Family-summary statistic — minimum adjusted q (BB-2014 §3 "min" rule).
    // Empty regime → Q_r = 1.0 (fails outer gate by default; explicitly NOT
    // a divide-by-zero or undefined edge case).
    effective_q[r] =
      inner.adjusted_p.length === 0
        ? 1.0
        : Math.min(...inner.adjusted_p);
  }

  // ─── Stage 2 (outer): BH over family-summary statistics ─────────────────
  // Build the outer p-value vector in a fixed regime order; map decisions back.
  const outerPValues = regimeKeys.map((r) => effective_q[r]);
  const outerDecisions = benjaminiHochbergDecisions(outerPValues, q_outer);

  const meta_bh_decisions = {} as Record<RegimeLabel, 'REJECT' | 'ACCEPT'>;
  for (let i = 0; i < regimeKeys.length; i++) {
    meta_bh_decisions[regimeKeys[i]] = outerDecisions[i];
  }

  return { per_regime, meta_bh_decisions, effective_q };
}
