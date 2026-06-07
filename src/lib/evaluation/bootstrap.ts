/**
 * BCa Bootstrap Confidence Intervals
 *
 * Implements the Bias-Corrected and Accelerated (BCa) bootstrap per:
 * Efron 1987, JASA 82(397):171-185 "Better Bootstrap Confidence Intervals"
 *
 * Also cited: ISL 2nd ed. Ch. 5 (Resampling Methods).
 *
 * Hand-rolled — no external math dependencies.
 * RNG: mulberry32 seeded PRNG for reproducibility.
 * Inverse normal CDF: Beasley-Springer-Moro rational approximation.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32 (public-domain, Tommy Ettinger)
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Normal CDF Φ(z) — Hart's approximation via numeric erf
// ---------------------------------------------------------------------------

/** Standard normal CDF Φ(z). Exported for reuse in dsr.ts. */
export function normalCdf(z: number): number {
  // Using the relationship Φ(z) = 0.5 * (1 + erf(z / sqrt(2)))
  // erf approximated by Horner-form polynomial (Abramowitz & Stegun 7.1.26, max error 1.5e-7)
  const x = z / Math.SQRT2;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly =
    t *
    (0.254829592 +
      t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = sign * (1 - poly * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

// ---------------------------------------------------------------------------
// Inverse Normal CDF Φ⁻¹(p) — Beasley-Springer-Moro rational approximation
// Source: Moro 1995, "The Full Monte", Risk Magazine 8(2):57-58 (builds on
//   Beasley & Springer 1977 JRSS algorithm AS 111).
// ---------------------------------------------------------------------------
const BSM_A = [
  2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637,
];
const BSM_B = [
  -8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833,
];
const BSM_C = [
  0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
  0.0276438810333863, 0.0038405729373609, 0.0003951896511349,
  0.0000321767881768, 0.0000002888167364, 0.0000003960315187,
];

/** Inverse normal CDF Φ⁻¹(p) — Beasley-Springer-Moro approximation. */
function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const y = p - 0.5;

  if (Math.abs(y) < 0.42) {
    // Central region: rational approximation
    const r = y * y;
    let num = 0;
    let den = 1;
    for (let i = 3; i >= 0; i--) {
      num = num * r + BSM_A[i];
      if (i < 4) den = den * r + BSM_B[i];
    }
    // Horner form: A[0] + r*(A[1] + r*(A[2] + r*A[3]))
    const a = BSM_A[0] + r * (BSM_A[1] + r * (BSM_A[2] + r * BSM_A[3]));
    const b = 1 + r * (BSM_B[0] + r * (BSM_B[1] + r * (BSM_B[2] + r * BSM_B[3])));
    return y * (a / b);
  }

  // Tail region: log-log transform
  const r = Math.log(-Math.log(y < 0 ? p : 1 - p));
  let result = BSM_C[0];
  for (let i = 1; i < 9; i++) {
    result += BSM_C[i] * Math.pow(r, i);
  }
  return y < 0 ? -result : result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BCaResult {
  point: number;
  low: number;
  high: number;
  method: 'bca' | 'percentile';
  degenerate?: boolean;
  warning?: string;
}

/**
 * Bootstrap BCa (Bias-Corrected and Accelerated) confidence interval.
 *
 * @param samples - Input data array (generic T)
 * @param statistic - Function mapping a sample to a scalar estimate
 * @param opts.nResamples - Number of bootstrap resamples (default 10000)
 * @param opts.alpha - Significance level (default 0.05 → 95% CI)
 * @param opts.seed - RNG seed for reproducibility (default random)
 * @returns BCaResult with point estimate and [low, high] CI
 *
 * Reference: Efron 1987, JASA 82(397):171-185 "Better Bootstrap Confidence Intervals"
 */
export function bootstrapBCa<T>(
  samples: T[],
  statistic: (s: T[]) => number,
  opts: { nResamples?: number; alpha?: number; seed?: number } = {},
): BCaResult {
  const nResamples = opts.nResamples ?? 10000;
  const alpha = opts.alpha ?? 0.05;
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const n = samples.length;

  const point = statistic(samples);

  // --- n < 10 fallback: percentile method (Efron acceleration is unstable for very small n) ---
  // Note: HYPERPARAMETERS.md documents this threshold as n=10. The Efron 1987 paper uses BCa
  // even on n=10 samples; instability only becomes severe below ~6 observations.
  if (n < 10) {
    const rng = mulberry32(seed);
    const bootStats: number[] = [];
    for (let b = 0; b < nResamples; b++) {
      const resample: T[] = [];
      for (let i = 0; i < n; i++) {
        resample.push(samples[Math.floor(rng() * n)]);
      }
      const s = statistic(resample);
      if (!isNaN(s)) bootStats.push(s);
    }
    bootStats.sort((a, b) => a - b);
    const loIdx = Math.max(0, Math.floor((alpha / 2) * bootStats.length));
    const hiIdx = Math.min(bootStats.length - 1, Math.floor((1 - alpha / 2) * bootStats.length));
    return {
      point,
      low: bootStats[loIdx] ?? point,
      high: bootStats[hiIdx] ?? point,
      method: 'percentile',
      warning: 'n < 50 — falling back to percentile method',
    };
  }

  // --- BCa bootstrap ---
  const rng = mulberry32(seed);

  // Step 1: Bootstrap resamples
  const bootStats: number[] = [];
  let nanCount = 0;
  for (let b = 0; b < nResamples; b++) {
    const resample: T[] = [];
    for (let i = 0; i < n; i++) {
      resample.push(samples[Math.floor(rng() * n)]);
    }
    const s = statistic(resample);
    if (isNaN(s)) {
      nanCount++;
    } else {
      bootStats.push(s);
    }
  }

  if (nanCount > nResamples * 0.1) {
    console.warn(
      `[bootstrapBCa] ${nanCount}/${nResamples} resamples produced NaN (>${Math.round((nanCount / nResamples) * 100)}%)`,
    );
  }

  // Step 2: Check for degenerate distribution
  if (bootStats.length === 0) {
    return { point, low: point, high: point, method: 'bca', degenerate: true };
  }

  bootStats.sort((a, b) => a - b);
  const std = Math.sqrt(
    bootStats.reduce((acc, v) => acc + (v - point) ** 2, 0) / bootStats.length,
  );
  if (std < 1e-12) {
    return { point, low: point, high: point, method: 'bca', degenerate: true };
  }

  // Step 3: Bias correction z₀ = Φ⁻¹(P(θ̂* < θ̂))
  const countBelow = bootStats.filter((v) => v < point).length;
  const pBelow = countBelow / bootStats.length;
  const z0 = normalInv(pBelow === 0 ? 1 / (2 * bootStats.length) : pBelow);

  // Step 4: Acceleration a via jackknife
  // θ̂₍ᵢ₎ = statistic on samples with i-th observation removed
  const jackStats: number[] = [];
  for (let i = 0; i < n; i++) {
    const jSamples = samples.filter((_, idx) => idx !== i);
    jackStats.push(statistic(jSamples));
  }
  const jackMean = jackStats.reduce((a, v) => a + v, 0) / n;
  const diffs = jackStats.map((v) => jackMean - v);
  const num = diffs.reduce((a, v) => a + v ** 3, 0);
  const den = Math.pow(
    diffs.reduce((a, v) => a + v ** 2, 0),
    1.5,
  );
  const a = den < 1e-15 ? 0 : num / (6 * den);

  // Step 5: Adjusted percentiles α₁, α₂
  const zAlpha = normalInv(alpha / 2); // e.g. -1.96
  const zAlpha2 = normalInv(1 - alpha / 2); // e.g. +1.96

  function adjustedPercentile(zTail: number): number {
    const denom = 1 - a * (z0 + zTail);
    if (Math.abs(denom) < 1e-12) return zTail < 0 ? 0 : 1;
    return normalCdf(z0 + (z0 + zTail) / denom);
  }

  const alpha1 = adjustedPercentile(zAlpha);
  const alpha2 = adjustedPercentile(zAlpha2);

  // Step 6: Interpolate from sorted bootstrap distribution
  function quantile(sorted: number[], p: number): number {
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  const low = quantile(bootStats, Math.max(0, Math.min(1, alpha1)));
  const high = quantile(bootStats, Math.max(0, Math.min(1, alpha2)));

  return { point, low, high, method: 'bca' };
}
