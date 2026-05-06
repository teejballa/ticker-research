// Phase 18 Wave 0/1: confirmedDrift two-of-two — CORE-ML-04 / D-06 / D-08.
// Activated assertions per Plan 18-01 §<behavior>.
//
// IMPORTANT: the `rawN: 29` literal in the floor test is grep-verified by the
// plan-checker as evidence the D-08 minimum-N floor is wired. Do not parameterize.

import { describe, it, expect } from 'vitest';
import { confirmedDrift, type BetaPosterior } from '../learning';

const STRONG_DRIFT_ROLLING: BetaPosterior = { alpha: 9, beta: 1 };   // mean 0.9
const STRONG_DRIFT_ALLTIME: BetaPosterior = { alpha: 50, beta: 50 }; // mean 0.5 — drift_z ≫ 2

const NO_DRIFT_ROLLING: BetaPosterior = { alpha: 5, beta: 5 };       // mean 0.5
const NO_DRIFT_ALLTIME: BetaPosterior = { alpha: 50, beta: 50 };     // mean 0.5 — drift_z ≈ 0

const SHIFT_DELTAS = new Array(30).fill(0.5);                        // PH fires
const STATIONARY_DELTAS = new Array(30).fill(0);                     // PH silent

describe('confirmedDrift (Phase 18 — two-of-two confirmation)', () => {
  it('fires when ALL three gates trip (rawN≥30, |drift_z|>2, ph>0)', () => {
    const r = confirmedDrift({
      rolling: STRONG_DRIFT_ROLLING,
      allTime: STRONG_DRIFT_ALLTIME,
      perObsDeltas: SHIFT_DELTAS,
      delta: 0.005,
      lambdaPH: 0.05,
      rawN: 30,
    });
    expect(r.fired).toBe(true);
    expect(Math.abs(r.drift_z)).toBeGreaterThan(2);
    expect(r.ph_stat).toBeGreaterThan(0);
    expect(r.ph_threshold).toBe(0.05);
  });

  it('D-08 floor: rawN: 29 NEVER fires even when drift_z and PH both trip', () => {
    // rawN: 29 literal is grep-verified by plan-checker.
    const r = confirmedDrift({
      rolling: STRONG_DRIFT_ROLLING,
      allTime: STRONG_DRIFT_ALLTIME,
      perObsDeltas: SHIFT_DELTAS,
      delta: 0.005,
      lambdaPH: 0.05,
      rawN: 29,
    });
    expect(r.fired).toBe(false);
    // Underlying signals still computed and exposed for diagnostics.
    expect(Math.abs(r.drift_z)).toBeGreaterThan(2);
    expect(r.ph_stat).toBeGreaterThan(0);
  });

  it('does NOT fire when only drift_z trips (PH silent)', () => {
    const r = confirmedDrift({
      rolling: STRONG_DRIFT_ROLLING,
      allTime: STRONG_DRIFT_ALLTIME,
      perObsDeltas: STATIONARY_DELTAS,
      delta: 0.005,
      lambdaPH: 0.05,
      rawN: 60,
    });
    expect(r.fired).toBe(false);
    expect(Math.abs(r.drift_z)).toBeGreaterThan(2);
    expect(r.ph_stat).toBeLessThanOrEqual(0);
  });

  it('does NOT fire when only PH trips (drift_z near zero)', () => {
    const r = confirmedDrift({
      rolling: NO_DRIFT_ROLLING,
      allTime: NO_DRIFT_ALLTIME,
      perObsDeltas: SHIFT_DELTAS,
      delta: 0.005,
      lambdaPH: 0.05,
      rawN: 60,
    });
    expect(r.fired).toBe(false);
    expect(Math.abs(r.drift_z)).toBeLessThan(2);
    expect(r.ph_stat).toBeGreaterThan(0);
  });

  it('returns numeric-only payload for LearningEvent.delta (T-18-05 mitigation)', () => {
    const r = confirmedDrift({
      rolling: STRONG_DRIFT_ROLLING,
      allTime: STRONG_DRIFT_ALLTIME,
      perObsDeltas: SHIFT_DELTAS,
      delta: 0.005,
      lambdaPH: 0.05,
      rawN: 30,
    });
    // All four exposed fields must be primitive booleans/numbers — no strings.
    expect(typeof r.fired).toBe('boolean');
    expect(typeof r.drift_z).toBe('number');
    expect(typeof r.ph_stat).toBe('number');
    expect(typeof r.ph_threshold).toBe('number');
  });

  it('does NOT fire on a fully stationary cell (no drift, no PH)', () => {
    const r = confirmedDrift({
      rolling: NO_DRIFT_ROLLING,
      allTime: NO_DRIFT_ALLTIME,
      perObsDeltas: STATIONARY_DELTAS,
      delta: 0.005,
      lambdaPH: 0.05,
      rawN: 60,
    });
    expect(r.fired).toBe(false);
  });

  it('exposes ph_threshold equal to the lambdaPH input (round-trips for delta payload)', () => {
    const r = confirmedDrift({
      rolling: NO_DRIFT_ROLLING,
      allTime: NO_DRIFT_ALLTIME,
      perObsDeltas: STATIONARY_DELTAS,
      delta: 0.005,
      lambdaPH: 0.123,
      rawN: 30,
    });
    expect(r.ph_threshold).toBe(0.123);
  });
});
