// Phase 18 Wave 0/1: computeESS primitive (Kish formula) — CORE-ML-01 / D-03.
// Activated assertions per Plan 18-01 §<behavior>.

import { describe, it, expect } from 'vitest';
import { computeESS } from '../learning';

describe('computeESS (Phase 18 — Kish effective sample size)', () => {
  it('returns 0 for empty input', () => {
    expect(computeESS([])).toBe(0);
  });

  it('uniform weights of length N yield ESS = N', () => {
    expect(computeESS([1, 1, 1, 1, 1])).toBe(5);
    expect(computeESS([1])).toBe(1);
    expect(computeESS(new Array(20).fill(1))).toBe(20);
  });

  it('uniform weights of value 0.5 still yield ESS = N (scale-invariant)', () => {
    // Kish ESS is invariant to global scaling: (Σw)² / Σw² = N when all weights equal.
    expect(computeESS([0.5, 0.5, 0.5, 0.5])).toBe(4);
  });

  it('single dominant weight collapses ESS toward 1', () => {
    // [100, 1, 1] → (102)² / (10000+1+1) = 10404 / 10002 ≈ 1.0402
    const ess = computeESS([100, 1, 1]);
    expect(ess).toBeGreaterThan(1);
    expect(ess).toBeLessThan(1.1);
    expect(ess).toBeCloseTo((102 * 102) / (100 * 100 + 1 + 1), 6);
  });

  it('zero-vector returns 0 (no NaN, safe for DB writes)', () => {
    const ess = computeESS([0, 0, 0, 0]);
    expect(ess).toBe(0);
    expect(Number.isNaN(ess)).toBe(false);
  });

  it('mixed all-zero with non-zero is bounded by N', () => {
    const ess = computeESS([1, 0, 1, 0, 1]);
    // 3 effective observations among 5 entries.
    expect(ess).toBe(3);
  });

  it('half-decayed weights cluster ESS around the geometric mean (heavier-recent skew)', () => {
    // 5 weights of 1 plus 5 weights of 0.5: Σw=7.5, Σw²=5+1.25=6.25, ESS=56.25/6.25=9.
    const w = [1, 1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5];
    expect(computeESS(w)).toBeCloseTo(9, 6);
  });
});
