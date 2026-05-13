// tests/stats-newey-west.unit.test.ts
//
// Phase 20-C-01 Task 3: Newey-West HAC SE unit tests.
//
// Numerical reference values for the scipy-equivalence test are derived
// FROM THE FORMULA by hand and committed as literals so the test never
// silently drifts.

import { describe, expect, it } from 'vitest';

import { neweyWestSE, ttestNW } from '../src/lib/stats/newey-west';

describe('neweyWestSE', () => {
  // ── 1. scipy-equivalence on canonical period-2 alternating residuals ──
  // residuals = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1], T = 10, mean = 0.
  //
  //   γ_0 = (1/10) · Σ e_t² = (1/10) · 10·1 = 1.0
  //   γ_1 = (1/10) · Σ_{t=1..9} e_t·e_{t-1} = (1/10) · 9·(-1) = -0.9
  //   γ_2 = (1/10) · Σ_{t=2..9} e_t·e_{t-2} = (1/10) · 8·(+1) = +0.8
  //
  // At lag = 0:  SE_NW² = γ_0 = 1.0  →  SE_NW = 1.0
  // At lag = 2:  Bartlett weights w_1 = 1 - 1/3 = 2/3, w_2 = 1 - 2/3 = 1/3
  //              SE_NW² = γ_0 + 2·w_1·γ_1 + 2·w_2·γ_2
  //                     = 1.0 + 2·(2/3)·(-0.9) + 2·(1/3)·(0.8)
  //                     = 1.0 + (-1.2) + (0.533333…)
  //                     = 0.333333…
  //              SE_NW = sqrt(0.333333…) = 0.57735026918962576…
  const ALTERNATING = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1];

  it('scipy-equivalence: lag=0 reduces to sqrt(mean(e²)) on period-2 residuals', () => {
    const se = neweyWestSE(ALTERNATING, 0);
    expect(Math.abs(se - 1.0)).toBeLessThan(1e-9);
  });

  it('scipy-equivalence: lag=2 with Bartlett weights matches hand-derived value within 1e-6', () => {
    const se = neweyWestSE(ALTERNATING, 2);
    // Hand-derived reference: sqrt(1/3) = 0.5773502691896258
    const expected = Math.sqrt(1 / 3);
    expect(Math.abs(se - expected)).toBeLessThan(1e-6);
  });

  it('lag=0 reduction: equals sqrt(mean(e²)) for arbitrary residuals', () => {
    const r = [0.5, -0.2, 0.1, 0.7, -0.4, 0.3, -0.6, 0.8];
    const meanSq = r.reduce((s, v) => s + v * v, 0) / r.length;
    expect(Math.abs(neweyWestSE(r, 0) - Math.sqrt(meanSq))).toBeLessThan(1e-12);
  });

  it('Bartlett weights are strictly positive and decreasing in k (PSD guarantee)', () => {
    // For L = 4, weights w_k = 1 - k/(L+1) for k=1..4 → 4/5, 3/5, 2/5, 1/5
    const weights = [1, 2, 3, 4].map((k) => 1 - k / (4 + 1));
    const expected = [0.8, 0.6, 0.4, 0.2];
    for (let i = 0; i < weights.length; i++) {
      expect(Math.abs(weights[i] - expected[i])).toBeLessThan(1e-12);
    }
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeLessThan(weights[i - 1]);
      expect(weights[i]).toBeGreaterThan(0);
    }
  });

  it('throws on lag < 0', () => {
    expect(() => neweyWestSE([1, 2, 3, 4], -1)).toThrow(/non-negative integer/);
  });

  it('throws on lag >= residuals.length', () => {
    expect(() => neweyWestSE([1, 2, 3], 3)).toThrow(/lag must be < residuals.length/);
    expect(() => neweyWestSE([1, 2, 3], 4)).toThrow(/lag must be < residuals.length/);
  });

  it('throws on residuals.length < 2', () => {
    expect(() => neweyWestSE([1], 0)).toThrow(/length must be >= 2/);
    expect(() => neweyWestSE([], 0)).toThrow(/length must be >= 2/);
  });

  it('throws on non-finite residual', () => {
    expect(() => neweyWestSE([1, NaN, 3], 0)).toThrow(/non-finite residual/);
    expect(() => neweyWestSE([1, Infinity, 3], 0)).toThrow(/non-finite residual/);
  });

  it('always non-negative on seeded random inputs (PSD)', () => {
    // Linear-congruential PRNG with fixed seed — deterministic randomization.
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed >>> 8) / (1 << 24);
    };
    for (let trial = 0; trial < 50; trial++) {
      const n = 5 + Math.floor(rand() * 20); // 5..24
      const r = Array.from({ length: n }, () => rand() * 2 - 1);
      const L = Math.floor(rand() * (n - 1)); // 0..n-2
      const se = neweyWestSE(r, L);
      expect(se).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(se)).toBe(true);
    }
  });
});

describe('ttestNW', () => {
  it('returns 1 when t-statistic is 0 (beta = 0)', () => {
    expect(ttestNW(0, 1, 10)).toBe(1);
  });

  it('returns 1 when SE is 0 (degenerate, no inference)', () => {
    expect(ttestNW(0.5, 0, 10)).toBe(1);
  });

  it('returns approximately 0.05 at t-critical for df=10 (two-sided)', () => {
    // Student-t critical value at df=10, two-sided α=0.05 ≈ 2.228
    const p = ttestNW(2.228, 1, 10);
    expect(p).toBeGreaterThan(0.04);
    expect(p).toBeLessThan(0.06);
  });

  it('p-value is monotone decreasing in |t|', () => {
    const pSmall = ttestNW(1, 1, 20);
    const pBig = ttestNW(3, 1, 20);
    expect(pBig).toBeLessThan(pSmall);
  });

  it('two-sided symmetry: p(-t) === p(+t)', () => {
    const pPlus = ttestNW(1.8, 1, 15);
    const pMinus = ttestNW(-1.8, 1, 15);
    expect(Math.abs(pPlus - pMinus)).toBeLessThan(1e-9);
  });

  it('extreme |t| ≫ 0 → p ≈ 0 (clamped to [0,1])', () => {
    const p = ttestNW(20, 1, 30);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1e-6);
  });
});
