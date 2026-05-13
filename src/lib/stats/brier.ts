// src/lib/stats/brier.ts
//
// Phase 20-C-02: Pure-function Brier score + Murphy 1973 decomposition.
//
// HARD RULE — pure numerical primitives only. No DB, no network, no
// external math libraries. Mirrors src/lib/stats/newey-west.ts and
// src/lib/stats/bh-fdr.ts.
//
// References:
//   • Brier (1950) "Verification of forecasts expressed in terms of
//     probability," Monthly Weather Review 78(1):1–3. Original score.
//   • Murphy (1973) "A new vector partition of the probability score,"
//     J. Applied Meteorology 12(4):595–600. Reliability/Resolution/
//     Uncertainty decomposition.
//   • Bröcker & Smith (2007) "Increasing the reliability of reliability
//     diagrams," Weather and Forecasting 22(3):651–661. Modern restatement
//     with worked examples.
//   • Guo et al. (2017) "On calibration of modern neural networks," ICML —
//     n_bins=10 convention for reliability diagrams (default here).

/**
 * Brier score for binary outcomes.
 *
 *     BS = (1/N) Σ_{i=1..N} (p_i − o_i)²
 *
 * where p_i ∈ [0,1] is the predicted probability for the positive class and
 * o_i ∈ {0,1} is the realized outcome (1 = positive). Range: [0, 1]; lower
 * is better; BS = 0.25 = always predict 0.5 on a 50/50 base rate.
 *
 * Throws on empty input, length mismatch, p_i ∉ [0,1], or o_i ∉ {0,1}.
 */
export function brierScore(
  predictions: number[],
  outcomes: number[],
): number {
  if (predictions.length === 0) {
    throw new Error('brierScore: predictions array is empty');
  }
  if (predictions.length !== outcomes.length) {
    throw new Error(
      `brierScore: length mismatch (predictions=${predictions.length}, outcomes=${outcomes.length})`,
    );
  }
  let sum = 0;
  for (let i = 0; i < predictions.length; i++) {
    const p = predictions[i];
    const o = outcomes[i];
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error(
        `brierScore: prediction[${i}] = ${p} is outside [0, 1]`,
      );
    }
    if (o !== 0 && o !== 1) {
      throw new Error(
        `brierScore: outcome[${i}] = ${o} is not in {0, 1}`,
      );
    }
    const d = p - o;
    sum += d * d;
  }
  return sum / predictions.length;
}

export interface BrierDecomposition {
  reliability: number;
  resolution: number;
  uncertainty: number;
  bs_check: number;
  base_rate: number;
  n: number;
  per_bin: Array<{
    bin_index: number;
    n_k: number;
    p_bar_k: number;
    o_bar_k: number;
  }>;
}

/**
 * Murphy 1973 vector partition of the Brier score:
 *
 *     BS = Reliability − Resolution + Uncertainty
 *
 *     Reliability  = (1/N) Σ_k n_k × (p̄_k − ō_k)²
 *     Resolution   = (1/N) Σ_k n_k × (ō_k − ō)²
 *     Uncertainty  = ō × (1 − ō)
 *
 * where k partitions the observations such that all p_i within a single
 * partition share the same prediction value p̄_k = p_i. This is the
 * STRICT Murphy 1973 decomposition — the algebraic identity
 *
 *     BS = Reliability − Resolution + Uncertainty
 *
 * holds exactly (within floating-point) only when grouping by unique
 * prediction values (or equivalently, when each within-bin prediction
 * variance is zero). Equal-width binning collapses the within-bin
 * prediction variance into Reliability, breaking the identity by an
 * amount equal to (1/N) Σ_i (p_i − p̄_{bin(i)})² — a well-documented
 * artefact (Bröcker 2009 §3). Phase 20-C-02 requires the identity to
 * hold at 1e-9 (T-20-C-02-03), so we group by unique prediction value.
 *
 * The optional `n_bins` parameter is retained for the dashboard's per-bin
 * histogram (10 equal-width bins on [0,1] for the BrierTile stacked
 * reliability rendering). It does NOT affect the R/Res/U computation —
 * only the `per_bin` array returned for visualisation.
 *
 *   • ō_k = empirical positive-class frequency within partition k
 *   • ō   = (1/N) Σ_i o_i = the marginal positive-class base rate
 *
 * bs_check = Reliability − Resolution + Uncertainty (the algebraic
 * identity asserted by unit tests on 3 distinct datasets).
 *
 * Throws on the same inputs as brierScore plus n_bins < 1.
 */
export function brierDecomposition(
  predictions: number[],
  outcomes: number[],
  n_bins: number = 10,
): BrierDecomposition {
  if (predictions.length === 0) {
    throw new Error('brierDecomposition: predictions array is empty');
  }
  if (predictions.length !== outcomes.length) {
    throw new Error(
      `brierDecomposition: length mismatch (predictions=${predictions.length}, outcomes=${outcomes.length})`,
    );
  }
  if (!Number.isInteger(n_bins) || n_bins < 1) {
    throw new Error(
      `brierDecomposition: n_bins must be a positive integer, got ${n_bins}`,
    );
  }

  const N = predictions.length;

  // Validate inputs + accumulate unique-prediction-value partitions for the
  // strict Murphy 1973 identity (group by unique p_i so within-partition
  // prediction variance is zero by construction).
  // Use string keys to avoid floating-point hashing ambiguity; format with
  // 17 significant digits so distinct doubles map to distinct keys.
  const partition = new Map<
    string,
    { p: number; n: number; sum_o: number }
  >();
  let sum_o = 0;

  for (let i = 0; i < N; i++) {
    const p = predictions[i];
    const o = outcomes[i];
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error(
        `brierDecomposition: prediction[${i}] = ${p} is outside [0, 1]`,
      );
    }
    if (o !== 0 && o !== 1) {
      throw new Error(
        `brierDecomposition: outcome[${i}] = ${o} is not in {0, 1}`,
      );
    }
    const key = p.toString();
    const entry = partition.get(key) ?? { p, n: 0, sum_o: 0 };
    entry.n += 1;
    entry.sum_o += o;
    partition.set(key, entry);
    sum_o += o;
  }

  const base_rate = sum_o / N;
  const uncertainty = base_rate * (1 - base_rate);

  let reliability = 0;
  let resolution = 0;

  for (const entry of partition.values()) {
    const p_k = entry.p;
    const o_bar_k = entry.sum_o / entry.n;
    reliability += entry.n * (p_k - o_bar_k) ** 2;
    resolution += entry.n * (o_bar_k - base_rate) ** 2;
  }
  reliability /= N;
  resolution /= N;

  const bs_check = reliability - resolution + uncertainty;

  // Build the per_bin array for the dashboard histogram using n_bins
  // equal-width bins on [0,1]. Independent of R/Res/U above.
  const n_k = new Array<number>(n_bins).fill(0);
  const sum_p_k = new Array<number>(n_bins).fill(0);
  const sum_o_k = new Array<number>(n_bins).fill(0);
  for (let i = 0; i < N; i++) {
    const p = predictions[i];
    const o = outcomes[i];
    let bin_index = Math.floor(p * n_bins);
    if (bin_index >= n_bins) bin_index = n_bins - 1;
    if (bin_index < 0) bin_index = 0;
    n_k[bin_index] += 1;
    sum_p_k[bin_index] += p;
    sum_o_k[bin_index] += o;
  }

  const per_bin: BrierDecomposition['per_bin'] = [];
  for (let k = 0; k < n_bins; k++) {
    if (n_k[k] === 0) continue;
    per_bin.push({
      bin_index: k,
      n_k: n_k[k],
      p_bar_k: sum_p_k[k] / n_k[k],
      o_bar_k: sum_o_k[k] / n_k[k],
    });
  }

  return {
    reliability,
    resolution,
    uncertainty,
    bs_check,
    base_rate,
    n: N,
    per_bin,
  };
}
