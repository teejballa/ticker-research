/**
 * Phase 30.1 — Engagement-tier calibration primitives unit tests (D-19).
 *
 * Covers `compareDistributions` plus the supporting helpers in
 * src/lib/evaluation/tier-calibration.ts. The CLI in
 * scripts/calibrate-engagement-tiers.ts is just a thin Prisma I/O wrapper
 * around this module — proving the comparison core here is sufficient to
 * cover the ±10pp deviation gate behavior end-to-end.
 */
import { describe, expect, it } from 'vitest';
import {
  allWithinTolerance,
  compareDistributions,
  maxAbsDelta,
  type CalibrationResult,
  type Distribution,
} from '@/lib/evaluation/tier-calibration';

const TIERS: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];

function byTier(results: CalibrationResult[]): Record<'high' | 'medium' | 'low', CalibrationResult> {
  const out: Partial<Record<'high' | 'medium' | 'low', CalibrationResult>> = {};
  for (const r of results) out[r.tier] = r;
  return out as Record<'high' | 'medium' | 'low', CalibrationResult>;
}

describe('compareDistributions (D-19 engagement-tier calibration)', () => {
  it('marks every tier within tolerance when actual differs from target by ≤ tolerancePP', () => {
    // Actual: 50/30/20  vs Target: 55/25/20. Deltas: -5, +5, 0 — all within ±10pp.
    const actual: Distribution = { high: 50, medium: 30, low: 20, total: 100 };
    const target: Distribution = { high: 55, medium: 25, low: 20, total: 100 };
    const results = compareDistributions(actual, target, 10);

    expect(results).toHaveLength(3);
    for (const tier of TIERS) {
      expect(results.find((r) => r.tier === tier)).toBeDefined();
    }
    const byT = byTier(results);
    expect(byT.high.delta_pp).toBeCloseTo(-5, 6);
    expect(byT.medium.delta_pp).toBeCloseTo(5, 6);
    expect(byT.low.delta_pp).toBeCloseTo(0, 6);
    for (const r of results) {
      expect(r.within_tolerance).toBe(true);
    }
    expect(allWithinTolerance(results)).toBe(true);
    expect(maxAbsDelta(results)).toBeCloseTo(5, 6);
  });

  it('treats the tolerance boundary as INCLUSIVE — exactly 10pp is within tolerance', () => {
    // Actual: 60/20/20  vs Target: 50/30/20. Deltas: +10, -10, 0.
    const actual: Distribution = { high: 60, medium: 20, low: 20, total: 100 };
    const target: Distribution = { high: 50, medium: 30, low: 20, total: 100 };
    const results = compareDistributions(actual, target, 10);
    const byT = byTier(results);

    expect(byT.high.delta_pp).toBeCloseTo(10, 6);
    expect(byT.medium.delta_pp).toBeCloseTo(-10, 6);
    expect(byT.low.delta_pp).toBeCloseTo(0, 6);
    // |delta| == tolerance ⇒ within_tolerance true
    expect(byT.high.within_tolerance).toBe(true);
    expect(byT.medium.within_tolerance).toBe(true);
    expect(byT.low.within_tolerance).toBe(true);
    expect(allWithinTolerance(results)).toBe(true);
  });

  it('flags miscalibration when at least one tier exceeds the tolerance band', () => {
    // Actual: 80/10/10  vs Target: 50/30/20. Deltas: +30, -20, -10.
    const actual: Distribution = { high: 80, medium: 10, low: 10, total: 100 };
    const target: Distribution = { high: 50, medium: 30, low: 20, total: 100 };
    const results = compareDistributions(actual, target, 10);
    const byT = byTier(results);

    expect(byT.high.delta_pp).toBeCloseTo(30, 6);
    expect(byT.medium.delta_pp).toBeCloseTo(-20, 6);
    expect(byT.low.delta_pp).toBeCloseTo(-10, 6);
    expect(byT.high.within_tolerance).toBe(false); // +30pp blows the gate
    expect(byT.medium.within_tolerance).toBe(false); // -20pp blows the gate
    expect(byT.low.within_tolerance).toBe(true); // -10pp at the inclusive boundary
    expect(allWithinTolerance(results)).toBe(false);
    expect(maxAbsDelta(results)).toBeCloseTo(30, 6);
  });

  it('zero-total guard: returns 0% for every tier when total is 0 (no division by zero)', () => {
    const actual: Distribution = { high: 0, medium: 0, low: 0, total: 0 };
    const target: Distribution = { high: 50, medium: 30, low: 20, total: 100 };
    const results = compareDistributions(actual, target, 10);
    const byT = byTier(results);

    // actual side collapses to 0% across the board; deltas are -target_pct
    expect(byT.high.actual_pct).toBe(0);
    expect(byT.medium.actual_pct).toBe(0);
    expect(byT.low.actual_pct).toBe(0);
    expect(byT.high.delta_pp).toBeCloseTo(-50, 6);
    expect(byT.medium.delta_pp).toBeCloseTo(-30, 6);
    expect(byT.low.delta_pp).toBeCloseTo(-20, 6);
    // No NaN / Infinity leaked into actual_pct, target_pct, or delta_pp
    for (const r of results) {
      expect(Number.isFinite(r.actual_pct)).toBe(true);
      expect(Number.isFinite(r.target_pct)).toBe(true);
      expect(Number.isFinite(r.delta_pp)).toBe(true);
    }
  });

  it('handles a non-default tolerance argument', () => {
    // Actual: 60/30/10  vs Target: 50/30/20. Deltas: +10, 0, -10.
    const actual: Distribution = { high: 60, medium: 30, low: 10, total: 100 };
    const target: Distribution = { high: 50, medium: 30, low: 20, total: 100 };
    // tolerancePP = 5 ⇒ |10| > 5 blows the gate
    const tightResults = compareDistributions(actual, target, 5);
    expect(allWithinTolerance(tightResults)).toBe(false);
    // tolerancePP = 20 ⇒ |10| ≤ 20 within tolerance
    const loose = compareDistributions(actual, target, 20);
    expect(allWithinTolerance(loose)).toBe(true);
  });
});

describe('maxAbsDelta', () => {
  it('returns 0 for an empty results array', () => {
    expect(maxAbsDelta([])).toBe(0);
  });
});
