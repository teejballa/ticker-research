// Phase 19 Plan 19-A-03 — Conformal prediction primitive (Vovk-Romano).
// Tests the synthetic-coverage validation contract from 19-RESEARCH.md
// §"19-A-03 conformal" lines 685-695. All seven tests are pinned to lock
// the Vovk-Romano formula and the n<10 widest-interval edge case.
//
// CONTEXT D-19: distribution-free coverage guarantees alongside the existing
// Bayesian credible interval. ADDITIVE — Bayesian CI display in
// EngineCalibrationPanel stays; conformal is a parallel surface.

import { describe, it, expect } from 'vitest';
import { conformalInterval, type ConformalInterval } from '../src/lib/learning';

// Deterministic Mulberry32 LCG so synthetic coverage tests are reproducible.
// Source: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic data per RESEARCH §19-A-03 lines 685-695:
 *   y_i ~ Bernoulli(p), ŷ_i = p + ε_i, ε_i ~ Normal(0, sigma)
 *
 * Returns calibration + test arrays of equal length.
 */
function syntheticDataset(
  n: number,
  p = 0.5,
  sigma = 0.05,
  seed = 42,
): { predictions: number[]; outcomes: number[]; residuals: number[] } {
  const rng = mulberry32(seed);
  // Box-Muller for Normal(0, sigma)
  const normal = () => {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
  };
  const predictions = Array.from({ length: n }, () =>
    Math.max(0, Math.min(1, p + normal())),
  );
  const outcomes = Array.from({ length: n }, () => (rng() < p ? 1 : 0));
  const residuals = predictions.map((p_i, i) => Math.abs(outcomes[i] - p_i));
  return { predictions, outcomes, residuals };
}

describe('conformalInterval (Vovk-Romano split-conformal — D-19 / Plan 19-A-03)', () => {
  it('Test 1: α=0.05 with n=10000 synthetic — empirical coverage ∈ [0.93, 0.97]', () => {
    // Per RESEARCH §19-A-03 lines 685-695: split n=20000 into 10000 cal +
    // 10000 test. For each test point, build the conformal interval from
    // calibration residuals and check whether the outcome falls inside.
    const cal = syntheticDataset(10000, 0.5, 0.05, 42);
    const tst = syntheticDataset(10000, 0.5, 0.05, 1337);

    const alpha = 0.05;
    let inside = 0;
    for (let i = 0; i < tst.predictions.length; i++) {
      const ci = conformalInterval(tst.predictions[i], cal.residuals, alpha);
      if (tst.outcomes[i] >= ci.low && tst.outcomes[i] <= ci.high) inside++;
    }
    const coverage = inside / tst.predictions.length;
    expect(coverage).toBeGreaterThanOrEqual(0.93);
    expect(coverage).toBeLessThanOrEqual(0.97);
  });

  it('Test 2: α ∈ {0.01, 0.05, 0.10, 0.20} — each within ±2% of nominal', () => {
    const cal = syntheticDataset(10000, 0.5, 0.05, 7);
    const tst = syntheticDataset(10000, 0.5, 0.05, 8);
    for (const alpha of [0.01, 0.05, 0.10, 0.20]) {
      let inside = 0;
      for (let i = 0; i < tst.predictions.length; i++) {
        const ci = conformalInterval(tst.predictions[i], cal.residuals, alpha);
        if (tst.outcomes[i] >= ci.low && tst.outcomes[i] <= ci.high) inside++;
      }
      const coverage = inside / tst.predictions.length;
      const nominal = 1 - alpha;
      expect(coverage).toBeGreaterThanOrEqual(nominal - 0.02);
      expect(coverage).toBeLessThanOrEqual(Math.min(1, nominal + 0.02));
    }
  });

  it('Test 3: n<10 calibration returns [0, 1] widest interval with warning indicator', () => {
    // Edge: too few calibration points to estimate a quantile. Return widest
    // possible interval rather than throwing — caller can detect via
    // n_calibration field.
    for (const n of [0, 1, 5, 9]) {
      const residuals = Array.from({ length: n }, () => 0.1);
      const ci: ConformalInterval = conformalInterval(0.5, residuals, 0.05);
      expect(ci.low).toBe(0);
      expect(ci.high).toBe(1);
      expect(ci.n_calibration).toBe(n);
      expect(ci.alpha).toBe(0.05);
    }
  });

  it('Test 4: n=10 with calibrationResiduals all 0 returns tight interval around pointPrediction', () => {
    // All residuals zero means the calibration set is a perfect predictor.
    // Quantile at any α is 0, so the interval collapses to [p, p].
    const residuals = Array.from({ length: 10 }, () => 0);
    const ci = conformalInterval(0.42, residuals, 0.05);
    expect(ci.low).toBe(0.42);
    expect(ci.high).toBe(0.42);
    expect(ci.n_calibration).toBe(10);
  });

  it('Test 5: quantile index formula — ⌈(1-α)(n+1)⌉ - 1 (worked example, α=0.05, n=100)', () => {
    // Per Vovk-Romano: zero-indexed position = ⌈(1-α)(n+1)⌉ - 1
    //   α = 0.05, n = 100 → ⌈0.95 × 101⌉ - 1 = ⌈95.95⌉ - 1 = 96 - 1 = 95
    // Build residuals as 0, 0.01, 0.02, ..., 0.99 — sorted ascending.
    // Quantile at index 95 (zero-indexed) = 0.95. Half-width is 0.95.
    const residuals = Array.from({ length: 100 }, (_, i) => i * 0.01);
    const ci = conformalInterval(0.5, residuals, 0.05);
    // Half-width q = 0.95 → low = max(0, 0.5 - 0.95) = 0, high = min(1, 0.5 + 0.95) = 1
    expect(ci.low).toBe(0);
    expect(ci.high).toBe(1);
    expect(ci.n_calibration).toBe(100);

    // Verify the quantile pick at index 95 by using a prediction in the
    // middle so neither boundary clamp fires. Use a smaller residual scale.
    const r2 = Array.from({ length: 100 }, (_, i) => i * 0.001); // 0.000…0.099
    // idx 95 → q = 0.095. Centered prediction at 0.5 → low=0.405, high=0.595.
    const ci2 = conformalInterval(0.5, r2, 0.05);
    expect(ci2.low).toBeCloseTo(0.405, 10);
    expect(ci2.high).toBeCloseTo(0.595, 10);
  });

  it('Test 6: interval is symmetric around pointPrediction (low = max(0, p-q), high = min(1, p+q))', () => {
    // 50 residuals all equal to 0.1 — quantile at any reasonable α is 0.1.
    const residuals = Array.from({ length: 50 }, () => 0.1);
    const ci = conformalInterval(0.4, residuals, 0.05);
    // No clamp fires since 0.4 - 0.1 = 0.3 > 0 and 0.4 + 0.1 = 0.5 < 1.
    expect(ci.low).toBeCloseTo(0.3, 10);
    expect(ci.high).toBeCloseTo(0.5, 10);
    expect(ci.high - 0.4).toBeCloseTo(0.4 - ci.low, 10);
  });

  it('Test 7: interval clipped to [0,1] when prediction near boundary', () => {
    const residuals = Array.from({ length: 50 }, () => 0.3);
    // p near 0 — low clamps to 0, high stays at p+q
    const ciLow = conformalInterval(0.1, residuals, 0.05);
    expect(ciLow.low).toBe(0);
    expect(ciLow.high).toBeCloseTo(0.4, 10);

    // p near 1 — high clamps to 1, low stays at p-q
    const ciHigh = conformalInterval(0.9, residuals, 0.05);
    expect(ciHigh.low).toBeCloseTo(0.6, 10);
    expect(ciHigh.high).toBe(1);
  });
});
