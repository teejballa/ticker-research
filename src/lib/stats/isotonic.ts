// src/lib/stats/isotonic.ts
//
// Phase 20-C-02: Pool-Adjacent-Violators (PAV) isotonic regression +
// the CORP-method reliability diagram (Dimitriadis-Gneiting-Jordan
// PNAS 2021). Pure functions; no DB, no network, no external math libs.
//
// References:
//   • Ayer, M., Brunk, H. D., Ewing, G. M., Reid, W. T., & Silverman, E.
//     (1955) "An empirical distribution function for sampling with
//     incomplete information," Annals of Mathematical Statistics
//     26(4):641–647. PAV algorithm.
//   • Barlow, R. E., & Brunk, H. D. (1972) "The isotonic regression
//     problem and its dual," JASA 67(337):140–147.
//   • Robertson, T., Wright, F. T., & Dykstra, R. L. (1988) "Order
//     Restricted Statistical Inference," Wiley. Standard textbook.
//   • Dimitriadis, T., Gneiting, T., & Jordan, A. I. (2021) "Stable
//     reliability diagrams for probabilistic classifiers," PNAS 118(8),
//     doi:10.1073/pnas.2016191118.

interface Pool {
  x_start: number;
  x_end: number;
  mean: number;
  weight: number;
}

/**
 * Pool-Adjacent-Violators (PAV) isotonic regression.
 *
 * Fits a non-decreasing step function ŷ(x) to (x_i, y_i) pairs by
 * least-squares. Algorithm (Barlow-Brunk 1972; Ayer et al. 1955):
 *
 *   1. Sort pairs by x ascending (stable, preserving relative order of
 *      equal x).
 *   2. Initialize pools = [{x_start, x_end, mean=y_i, weight=1}, ...]
 *      one per input point.
 *   3. While any adjacent pair violates monotonicity
 *      (pools[i].mean > pools[i+1].mean), merge into a single pool with
 *      weight-averaged mean:
 *         w' = w_i + w_{i+1}
 *         m' = (w_i·m_i + w_{i+1}·m_{i+1}) / w'
 *      Restart the violator scan from max(0, i-1) to catch newly-
 *      adjacent violations.
 *   4. Continue until a full sweep finds no violations.
 *
 * Returns: a predictor (x: number) => number whose output is
 * monotonic non-decreasing in x. Queries outside the fit range clamp to
 * the nearest endpoint pool's mean.
 *
 * Throws on empty input or length mismatch.
 */
export function isotonicRegression(
  x: number[],
  y: number[],
): (x: number) => number {
  if (x.length === 0) {
    throw new Error('isotonicRegression: x array is empty');
  }
  if (x.length !== y.length) {
    throw new Error(
      `isotonicRegression: length mismatch (x=${x.length}, y=${y.length})`,
    );
  }

  // 1. Sort (x, y) pairs by x ascending (stable via index pairing).
  const idx = x.map((_, i) => i);
  idx.sort((a, b) => x[a] - x[b]);
  const sx = idx.map((i) => x[i]);
  const sy = idx.map((i) => y[i]);

  // 2. Initialize pools. Pre-aggregate ties on x: all observations sharing
  // the same x value collapse into ONE initial pool whose mean is the
  // weighted average. This matters when the input contains many repeated
  // x values (e.g., classifier outputs only {0.05, 0.95}) — otherwise
  // PAV's strict left-to-right scan can leave leading-y=0 singleton
  // pools at the same x as a much higher empirical frequency, producing
  // a misleading "pocket" of 0 at the leftmost x.
  const pools: Pool[] = [];
  let j = 0;
  while (j < sx.length) {
    const xv = sx[j];
    let k = j;
    let sum_y = 0;
    let count = 0;
    while (k < sx.length && sx[k] === xv) {
      sum_y += sy[k];
      count += 1;
      k += 1;
    }
    pools.push({
      x_start: xv,
      x_end: xv,
      mean: sum_y / count,
      weight: count,
    });
    j = k;
  }

  // 3. PAV merge loop.
  let i = 0;
  while (i < pools.length - 1) {
    if (pools[i].mean > pools[i + 1].mean) {
      const a = pools[i];
      const b = pools[i + 1];
      const w = a.weight + b.weight;
      const m = (a.weight * a.mean + b.weight * b.mean) / w;
      pools.splice(i, 2, {
        x_start: a.x_start,
        x_end: b.x_end,
        mean: m,
        weight: w,
      });
      // Restart scan one back to check newly-adjacent violations.
      i = Math.max(0, i - 1);
    } else {
      i += 1;
    }
  }

  // 4. Predictor: binary-search pools by x_start; clamp to endpoints.
  return (xq: number): number => {
    if (xq <= pools[0].x_end) return pools[0].mean;
    if (xq >= pools[pools.length - 1].x_start) {
      return pools[pools.length - 1].mean;
    }
    // Binary search for the pool whose [x_start, x_end] contains xq, or
    // the nearest pool by start. Linear walk is fine for our sizes (≤2000).
    let lo = 0;
    let hi = pools.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const p = pools[mid];
      if (xq >= p.x_start && xq <= p.x_end) return p.mean;
      if (xq < p.x_start) hi = mid - 1;
      else lo = mid + 1;
    }
    // Between two pools — return the lower one (left-step convention).
    return pools[Math.max(0, hi)].mean;
  };
}

export interface CorpReliabilityResult {
  calibrated_probs: number[];
  recalibrated_curve: { x: number[]; y: number[] };
  bin_counts: number[];
  n: number;
}

/**
 * CORP-method reliability diagram (Consistent, Optimally binned,
 * Reproducible, PAV-based). Reference: Dimitriadis, Gneiting & Jordan
 * (2021), PNAS 118(8), doi:10.1073/pnas.2016191118.
 *
 * Replaces equal-width binning (sensitive to bin choice; misleading on
 * multimodal prediction distributions per T-20-C-02-04) with isotonic
 * regression of outcomes on predictions. The PAV fit IS the
 * recalibration curve:
 *   • Perfectly-calibrated classifier → curve ≈ identity (y = x).
 *   • Systematic overconfidence → curve shrinks toward the base rate.
 *
 * Returns:
 *   • calibrated_probs[i]: PAV-recalibrated probability for prediction i.
 *   • recalibrated_curve {x, y}: dense 200-point grid over
 *     [min(predictions), max(predictions)] for plotting.
 *   • bin_counts: 20 equal-width bin histogram of predictions on [0, 1]
 *     (rendered alongside the curve per T-20-C-02-04 multimodal defense).
 *   • n: input length.
 */
export function corpReliabilityDiagram(
  predictions: number[],
  outcomes: number[],
): CorpReliabilityResult {
  if (predictions.length === 0) {
    throw new Error('corpReliabilityDiagram: predictions array is empty');
  }
  if (predictions.length !== outcomes.length) {
    throw new Error(
      `corpReliabilityDiagram: length mismatch (predictions=${predictions.length}, outcomes=${outcomes.length})`,
    );
  }

  const predictor = isotonicRegression(predictions, outcomes);
  const calibrated_probs = predictions.map((p) => predictor(p));

  // Dense plotting grid.
  let xmin = Infinity;
  let xmax = -Infinity;
  for (const p of predictions) {
    if (p < xmin) xmin = p;
    if (p > xmax) xmax = p;
  }
  if (xmin === xmax) {
    // Degenerate: all predictions equal — emit a single point grid.
    return {
      calibrated_probs,
      recalibrated_curve: { x: [xmin], y: [predictor(xmin)] },
      bin_counts: corpHistogram(predictions),
      n: predictions.length,
    };
  }
  const G = 200;
  const cx: number[] = new Array(G);
  const cy: number[] = new Array(G);
  for (let i = 0; i < G; i++) {
    const t = i / (G - 1);
    const xi = xmin + t * (xmax - xmin);
    cx[i] = xi;
    cy[i] = predictor(xi);
  }

  return {
    calibrated_probs,
    recalibrated_curve: { x: cx, y: cy },
    bin_counts: corpHistogram(predictions),
    n: predictions.length,
  };
}

// 20 equal-width bins on [0, 1] — only used for the dashboard histogram
// (T-20-C-02-04 multimodal defense); does NOT feed back into the CORP
// curve, which is fit non-parametrically via PAV.
function corpHistogram(predictions: number[]): number[] {
  const n_bins = 20;
  const counts = new Array<number>(n_bins).fill(0);
  for (const p of predictions) {
    let k = Math.floor(p * n_bins);
    if (k >= n_bins) k = n_bins - 1;
    if (k < 0) k = 0;
    counts[k] += 1;
  }
  return counts;
}
