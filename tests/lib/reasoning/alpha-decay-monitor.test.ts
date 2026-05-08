// Phase 19-A-05 Task 1 (TDD RED): Pin invariants of the rolling-IC monitor
// before any implementation lands.
//
// D-21 (CONTEXT.md): rolling 20-day Spearman rank-IC computed per signal
// class. ic_decay_flag = true when rolling_ic_20d < 0.02 for 5 consecutive
// days; clears when >= 0.02 for 3 consecutive days.
//
// Tests are deterministic — pinned vectors only, no randomness, no I/O.

import { describe, it, expect } from 'vitest';
import {
  rollingSpearmanIC,
  isDecayConfirmed,
  isDecayCleared,
} from '@/lib/reasoning/alpha-decay-monitor';

describe('rollingSpearmanIC', () => {
  it('returns 1.0 for identical-rank arrays', () => {
    const ic = rollingSpearmanIC({
      predictions: [0.1, 0.2, 0.3, 0.4, 0.5],
      realizedReturns: [0.05, 0.10, 0.15, 0.20, 0.25],
    });
    expect(ic).toBeCloseTo(1.0, 6);
  });

  it('returns -1.0 for reverse-rank arrays', () => {
    const ic = rollingSpearmanIC({
      predictions: [0.1, 0.2, 0.3, 0.4, 0.5],
      realizedReturns: [0.50, 0.40, 0.30, 0.20, 0.10],
    });
    expect(ic).toBeCloseTo(-1.0, 6);
  });

  it('returns ~1.0 for monotone but non-linear pinned vectors (Spearman, not Pearson)', () => {
    // Predictions are uniform, returns are convex — Pearson would be < 1,
    // Spearman ranks are identical so IC = 1.0.
    const ic = rollingSpearmanIC({
      predictions: [0.1, 0.3, 0.5, 0.7, 0.9],
      realizedReturns: [0.05, 0.10, 0.20, 0.30, 0.40],
    });
    expect(ic).toBeCloseTo(1.0, 6);
  });

  it('handles ties using midrank (no NaN, no infinity)', () => {
    // Two ties in predictions: 0.3 appears twice → midrank = 2.5
    // Returns are also tied at 0.10 twice → midrank = 2.5
    const ic = rollingSpearmanIC({
      predictions: [0.1, 0.3, 0.3, 0.5, 0.7],
      realizedReturns: [0.05, 0.10, 0.10, 0.20, 0.30],
    });
    expect(ic).toBeCloseTo(1.0, 6);
    expect(Number.isFinite(ic)).toBe(true);
  });

  it('throws on length mismatch', () => {
    expect(() =>
      rollingSpearmanIC({
        predictions: [0.1, 0.2],
        realizedReturns: [0.1, 0.2, 0.3],
      }),
    ).toThrow(/length/i);
  });
});

describe('isDecayConfirmed', () => {
  it('returns true when last 5 ICs all < 0.02', () => {
    const ics = [0.05, 0.04, 0.01, 0.0, -0.01, 0.005, 0.001];
    // last-5 tail = [0.01, 0.0, -0.01, 0.005, 0.001] — all < 0.02
    expect(isDecayConfirmed(ics, 0.02, 5)).toBe(true);
  });

  it('returns false when 4 of last 5 < 0.02 (one above threshold)', () => {
    const ics = [0.001, 0.001, 0.001, 0.05, 0.001];
    // last-5 tail contains 0.05 ≥ 0.02 → not confirmed
    expect(isDecayConfirmed(ics, 0.02, 5)).toBe(false);
  });
});

describe('isDecayCleared', () => {
  it('returns true when last 3 ICs all >= 0.02 (recovery confirmed)', () => {
    const ics = [0.001, 0.001, 0.001, 0.05, 0.04, 0.03];
    // last-3 tail = [0.05, 0.04, 0.03] — all >= 0.02
    expect(isDecayCleared(ics, 0.02, 3)).toBe(true);
  });

  it('returns false on transient recovery (1 day above, then back below)', () => {
    const ics = [0.001, 0.001, 0.001, 0.05, 0.001];
    // last-3 tail = [0.001, 0.05, 0.001] — only 1 of 3 above → transient, not cleared
    expect(isDecayCleared(ics, 0.02, 3)).toBe(false);
  });
});
