// tests/stats/brier.unit.test.ts
//
// Phase 20-C-02 Task 1: brierScore + brierDecomposition unit tests.
//
// Citations:
//   - Brier 1950 — "Verification of forecasts expressed in terms of
//     probability," Monthly Weather Review 78(1):1–3.
//   - Murphy 1973 — "A new vector partition of the probability score,"
//     J. Applied Meteorology 12(4):595–600.
//   - Bröcker & Smith 2007 — "Increasing the reliability of reliability
//     diagrams," Weather and Forecasting 22(3):651–661 (used here as the
//     committed worked example since Murphy 1973 Table 1 is paywalled).
//
// Identity gate (T-20-C-02-03):
//     BS = Reliability − Resolution + Uncertainty       (Murphy 1973)
// asserted within 1e-9 on 3 distinct seeded datasets.

import { describe, expect, it } from 'vitest';

import {
  brierScore,
  brierDecomposition,
} from '../../src/lib/stats/brier';

describe('brierScore — Brier 1950', () => {
  it('throws on empty input', () => {
    expect(() => brierScore([], [])).toThrow();
  });

  it('throws on length mismatch', () => {
    expect(() => brierScore([0.5, 0.5], [1])).toThrow();
  });

  it('throws on out-of-range prediction (p=1.5)', () => {
    expect(() => brierScore([1.5], [1])).toThrow();
  });

  it('throws on out-of-range prediction (p=-0.1)', () => {
    expect(() => brierScore([-0.1], [0])).toThrow();
  });

  it('throws on out-of-range outcome (o=0.5)', () => {
    expect(() => brierScore([0.5], [0.5])).toThrow();
  });

  it('N=1 perfect prediction (p=1, o=1) returns 0', () => {
    expect(brierScore([1], [1])).toBe(0);
  });

  it('N=1 maximally-wrong prediction (p=1, o=0) returns 1', () => {
    expect(brierScore([1], [0])).toBe(1);
  });

  it('all-correct vector returns 0', () => {
    expect(brierScore([1, 0, 1, 0], [1, 0, 1, 0])).toBe(0);
  });

  it('all-50/50 vector on balanced outcomes returns 0.25 (random baseline)', () => {
    const bs = brierScore([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 0]);
    expect(Math.abs(bs - 0.25)).toBeLessThan(1e-12);
  });

  // ── Committed reference example (Bröcker-Smith 2007 style) ────────────────
  //
  // Predictions p ∈ {0.1, 0.3, 0.5, 0.7, 0.9}, each replicated 20 times → N=100.
  // Outcomes: per-bin positive frequency exactly matches the prediction (a
  // perfectly-calibrated forecaster on a stratified panel). The marginal base
  // rate is mean(p) = 0.5.
  //
  //   BS = (1/N) Σ_i (p_i − o_i)²
  //
  // For each bin with prediction p, the number of 1-outcomes is p × 20 and
  // 0-outcomes is (1−p) × 20. Per-bin squared error contribution:
  //     20·[ p·(p−1)² + (1−p)·(p−0)² ]
  //   = 20·[ p·(1−p)² + (1−p)·p² ]
  //   = 20·p·(1−p)·[(1−p) + p]
  //   = 20·p·(1−p)
  //
  // Sum over p ∈ {0.1, 0.3, 0.5, 0.7, 0.9}:
  //     20·(0.09 + 0.21 + 0.25 + 0.21 + 0.09) = 20·0.85 = 17.0
  // Divide by N=100: BS = 0.17.
  //
  // This is the literature-canonical "perfectly calibrated forecaster on a
  // 50/50 base rate" BS value used as a sanity reference.
  it('Bröcker-Smith 2007 reference example: perfectly calibrated forecaster → BS = 0.17 ± 1e-6', () => {
    const preds: number[] = [];
    const outs: number[] = [];
    const bins = [0.1, 0.3, 0.5, 0.7, 0.9];
    for (const p of bins) {
      const n1 = Math.round(p * 20);
      const n0 = 20 - n1;
      for (let i = 0; i < n1; i++) {
        preds.push(p);
        outs.push(1);
      }
      for (let i = 0; i < n0; i++) {
        preds.push(p);
        outs.push(0);
      }
    }
    expect(preds.length).toBe(100);
    const bs = brierScore(preds, outs);
    expect(Math.abs(bs - 0.17)).toBeLessThan(1e-6);
  });
});

describe('brierDecomposition — Murphy 1973 identity', () => {
  // ── Dataset A — uniform predictions, balanced outcomes ────────────────────
  const datasetA = {
    preds: [0.1, 0.3, 0.5, 0.7, 0.9, 0.2, 0.4, 0.6, 0.8, 0.95],
    outs: [0, 0, 0, 1, 1, 0, 1, 1, 1, 1],
  };

  // ── Dataset B — skewed predictions clustered near 0, balanced outcomes ────
  const datasetB = {
    preds: [0.05, 0.1, 0.05, 0.15, 0.2, 0.1, 0.05, 0.1, 0.05, 0.1],
    outs: [0, 0, 0, 0, 0, 1, 1, 1, 0, 0],
  };

  // ── Dataset C — balanced predictions, imbalanced outcomes ō ≈ 0.9 ─────────
  const datasetC = {
    preds: [0.3, 0.4, 0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.8, 0.9],
    outs: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  };

  it('returns reliability, resolution, uncertainty, bs_check, base_rate, n, per_bin fields', () => {
    const r = brierDecomposition(datasetA.preds, datasetA.outs);
    expect(typeof r.reliability).toBe('number');
    expect(typeof r.resolution).toBe('number');
    expect(typeof r.uncertainty).toBe('number');
    expect(typeof r.bs_check).toBe('number');
    expect(typeof r.base_rate).toBe('number');
    expect(typeof r.n).toBe('number');
    expect(Array.isArray(r.per_bin)).toBe(true);
  });

  it('dataset A: identity |bs_check − brierScore| ≤ 1e-9 AND |bs_check − (R − Res + U)| ≤ 1e-9', () => {
    const r = brierDecomposition(datasetA.preds, datasetA.outs);
    const bs = brierScore(datasetA.preds, datasetA.outs);
    expect(Math.abs(r.bs_check - bs)).toBeLessThan(1e-9);
    expect(
      Math.abs(r.bs_check - (r.reliability - r.resolution + r.uncertainty)),
    ).toBeLessThan(1e-9);
  });

  it('dataset B: identity holds within 1e-9 (skewed predictions)', () => {
    const r = brierDecomposition(datasetB.preds, datasetB.outs);
    const bs = brierScore(datasetB.preds, datasetB.outs);
    expect(Math.abs(r.bs_check - bs)).toBeLessThan(1e-9);
    expect(
      Math.abs(r.bs_check - (r.reliability - r.resolution + r.uncertainty)),
    ).toBeLessThan(1e-9);
  });

  it('dataset C: identity holds within 1e-9 (imbalanced ō=0.9)', () => {
    const r = brierDecomposition(datasetC.preds, datasetC.outs);
    const bs = brierScore(datasetC.preds, datasetC.outs);
    expect(Math.abs(r.bs_check - bs)).toBeLessThan(1e-9);
    expect(
      Math.abs(r.bs_check - (r.reliability - r.resolution + r.uncertainty)),
    ).toBeLessThan(1e-9);
  });

  it('uncertainty = ō(1−ō) verified literally on dataset C', () => {
    const r = brierDecomposition(datasetC.preds, datasetC.outs);
    // datasetC has 9/10 = 0.9 base rate → uncertainty = 0.09
    expect(Math.abs(r.base_rate - 0.9)).toBeLessThan(1e-12);
    expect(Math.abs(r.uncertainty - 0.09)).toBeLessThan(1e-12);
  });

  it('predictions on bin boundaries (p=0.1, p=1.0) fall into valid bins (no out-of-range index)', () => {
    // p=0.1 with n_bins=10 → floor(0.1*10)=1 → bin 1
    // p=1.0 → would be floor(1.0*10)=10 (out of range) without clamp; must clamp to bin 9
    const preds = [0.0, 0.1, 0.2, 0.5, 0.9, 1.0];
    const outs = [0, 0, 0, 1, 1, 1];
    const r = brierDecomposition(preds, outs, 10);
    // Every per_bin row must have bin_index ∈ [0, 9].
    for (const b of r.per_bin) {
      expect(b.bin_index).toBeGreaterThanOrEqual(0);
      expect(b.bin_index).toBeLessThanOrEqual(9);
    }
  });
});
