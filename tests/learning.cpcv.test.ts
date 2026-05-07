// Phase 19 Plan 19-A-04 — Combinatorial Purged K-Fold Cross-Validation.
// Reference: Lopez de Prado 2018, "Advances in Financial Machine Learning"
// chapter 7 (CPCV). Plan 19-A-04 / D-20.
//
// Combinatorial assertions:
//   For (N=6, k=2): splits.length = C(6,2) = 15
//                   nPaths       = C(6,2) × k / N = 15 × 2 / 6 = 5
//   For (N=8, k=2): splits.length = C(8,2) = 28
//                   nPaths       = ⌊C(8,2) × k / N⌋ = ⌊28 × 2 / 8⌋ = 7
//
// 19-A-04 unblocks v2.0 P21 (Lift-Gated Cell Promotion) which imports CPCV.

import { describe, it, expect } from 'vitest';
import {
  combinatorialPurgedKFold,
  type CPCVSplit,
} from '../src/lib/learning';

// Inline binomial helper (n choose k) — used to verify the split count
// formula independent of the implementation under test.
function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) {
    r = (r * (n - i)) / (i + 1);
  }
  return Math.round(r);
}

describe('combinatorialPurgedKFold (Lopez de Prado 2018 ch.7 — Plan 19-A-04)', () => {
  it('Test 1: (N=6, k=2) produces C(6,2) = 15 splits', () => {
    const { splits } = combinatorialPurgedKFold({
      n: 6,
      k: 2,
      embargo: 10,
      totalSamples: 600,
    });
    expect(splits.length).toBe(15);
    expect(splits.length).toBe(binomial(6, 2));
  });

  it('Test 2: (N=6, k=2) produces 5 distinct backtest paths (C(N,k)·k/N)', () => {
    const { nPaths } = combinatorialPurgedKFold({
      n: 6,
      k: 2,
      embargo: 10,
      totalSamples: 600,
    });
    expect(nPaths).toBe(5);
    expect(nPaths).toBe(Math.floor((binomial(6, 2) * 2) / 6));
  });

  it('Test 3: (N=8, k=2) produces C(8,2) = 28 splits and ⌊28·2/8⌋ = 7 paths', () => {
    const { splits, nPaths } = combinatorialPurgedKFold({
      n: 8,
      k: 2,
      embargo: 10,
      totalSamples: 800,
    });
    expect(splits.length).toBe(28);
    expect(splits.length).toBe(binomial(8, 2));
    expect(nPaths).toBe(7);
    expect(nPaths).toBe(Math.floor((binomial(8, 2) * 2) / 8));
  });

  it('Test 4: each split has disjoint train + test indices', () => {
    const { splits } = combinatorialPurgedKFold({
      n: 6,
      k: 2,
      embargo: 10,
      totalSamples: 600,
    });
    for (const split of splits) {
      const trainSet = new Set(split.train_indices);
      for (const ti of split.test_indices) {
        expect(trainSet.has(ti)).toBe(false);
      }
    }
  });

  it('Test 5: embargo period excluded from train AND test (purged)', () => {
    const totalSamples = 600;
    const embargo = 10;
    const { splits } = combinatorialPurgedKFold({
      n: 6,
      k: 2,
      embargo,
      totalSamples,
    });
    for (const split of splits) {
      const trainSet = new Set(split.train_indices);
      const testSet = new Set(split.test_indices);
      const embargoSet = new Set(split.embargo_indices);
      // No overlap: embargo ∩ train = ∅, embargo ∩ test = ∅
      for (const ei of embargoSet) {
        expect(trainSet.has(ei)).toBe(false);
        expect(testSet.has(ei)).toBe(false);
      }
      // Sanity: embargo cardinality is bounded above by k * embargo
      // (each test fold contributes at most `embargo` purged indices on its
      // trailing edge; with k=2 test folds and embargo=10 → ≤ 20).
      expect(split.embargo_indices.length).toBeLessThanOrEqual(2 * embargo);
    }
  });

  it('Test 6: every test_indices comprises contiguous block(s) within timeseries', () => {
    const { splits } = combinatorialPurgedKFold({
      n: 6,
      k: 2,
      embargo: 10,
      totalSamples: 600,
    });
    // Each test region is a union of `k` contiguous folds. Sort indices,
    // walk them, count the number of "breaks" (where idx[i+1] != idx[i]+1).
    // For k=2, breaks ∈ {0, 1} — exactly 1 break for non-adjacent folds,
    // 0 breaks for adjacent folds.
    for (const split of splits) {
      const sorted = [...split.test_indices].sort((a, b) => a - b);
      let breaks = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] !== sorted[i] + 1) breaks++;
      }
      expect(breaks).toBeLessThanOrEqual(1);
    }
  });

  it('Test 7: union of test_indices across splits covers all samples (each fold tested in some path)', () => {
    const totalSamples = 600;
    const { splits } = combinatorialPurgedKFold({
      n: 6,
      k: 2,
      embargo: 10,
      totalSamples,
    });
    const universe = new Set<number>();
    for (const split of splits) {
      for (const ti of split.test_indices) universe.add(ti);
    }
    // Every fold appears in C(N-1, k-1) = C(5,1) = 5 splits, so the union
    // covers ALL totalSamples (modulo any leftover sample-mod-N at the end).
    // Lopez de Prado uses ⌊totalSamples / N⌋ samples per fold; tail samples
    // beyond k·⌊totalSamples/N⌋ may be unassigned. With totalSamples=600 and
    // N=6, foldSize is exactly 100, so all 600 samples participate in some
    // test fold.
    expect(universe.size).toBe(totalSamples);
  });

  it('Test 8: n=k throws (no train fold remains)', () => {
    expect(() =>
      combinatorialPurgedKFold({ n: 4, k: 4, embargo: 0, totalSamples: 400 }),
    ).toThrow();
  });

  it('Test 9: k=0 throws', () => {
    expect(() =>
      combinatorialPurgedKFold({ n: 6, k: 0, embargo: 0, totalSamples: 600 }),
    ).toThrow();
  });
});
