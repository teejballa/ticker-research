// tests/stats/isotonic.unit.test.ts
//
// Phase 20-C-02 Task 2: Pool-Adjacent-Violators (PAV) isotonic regression
// unit tests. Reference: Barlow & Brunk 1972; Robertson-Wright-Dykstra 1988
// "Order Restricted Statistical Inference," Wiley.

import { describe, expect, it } from 'vitest';

import { isotonicRegression } from '../../src/lib/stats/isotonic';

// Inline seeded RNG so the test is deterministic without adding a dep.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('isotonicRegression — PAV (Barlow-Brunk 1972)', () => {
  it('monotonicity invariant: 1000 random (x, y) inputs produce non-decreasing fit', () => {
    const rng = mulberry32(42);
    const N = 1000;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < N; i++) {
      x.push(rng());
      y.push(rng()); // y in [0, 1)
    }
    const fit = isotonicRegression(x, y);
    // Evaluate on sorted x. Output must be non-decreasing.
    const sortedX = x.slice().sort((a, b) => a - b);
    let prev = -Infinity;
    for (const xv of sortedX) {
      const yv = fit(xv);
      // Allow tiny floating-point slack — strict equality between identical
      // pools is fine, but adjacent pools must satisfy yv >= prev.
      expect(yv).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = yv;
    }
  });

  it('identity recovery: already-sorted ascending y returns y unchanged within 1e-12', () => {
    const x = [0.1, 0.2, 0.3, 0.4, 0.5];
    const y = [0.05, 0.15, 0.35, 0.6, 0.9];
    const fit = isotonicRegression(x, y);
    for (let i = 0; i < x.length; i++) {
      expect(Math.abs(fit(x[i]) - y[i])).toBeLessThan(1e-12);
    }
  });

  // ── Single-pool merge worked example ──────────────────────────────────────
  //
  // x = [0, 1, 2, 3, 4, 5, 6, 7], y = [3, 1, 4, 1, 5, 9, 2, 6] (digits of π).
  //
  // Standard PAV walk (left-to-right, merge into the lowest preceding pool
  // whose mean it violates):
  //   [3] add 1     → 1 < 3, merge → [3,1] mean=2
  //   [(3,1)=2] add 4 → 4 > 2 OK     → [2 | 4]
  //   [..|4] add 1     → 1 < 4, merge → [..|4,1]=2.5
  //                                    2.5 > 2 OK
  //                                    → [2 | 2.5]
  //   add 5 → 5 > 2.5 OK              → [2 | 2.5 | 5]
  //   add 9 → 9 > 5 OK                → [2 | 2.5 | 5 | 9]
  //   add 2 → 2 < 9, merge            → [..|9,2]=5.5
  //                                    5.5 > 5 OK
  //                                    → [2 | 2.5 | 5 | 5.5]
  //   add 6 → 6 > 5.5 OK              → [2 | 2.5 | 5 | 5.5 | 6]
  //
  // Final pool means assigned per original index:
  //   x=0,1 → 2.0 ; x=2,3 → 2.5 ; x=4 → 5.0 ; x=5,6 → 5.5 ; x=7 → 6.0
  it('PAV worked example: y = [3,1,4,1,5,9,2,6] → pool means match by-hand', () => {
    const x = [0, 1, 2, 3, 4, 5, 6, 7];
    const y = [3, 1, 4, 1, 5, 9, 2, 6];
    const fit = isotonicRegression(x, y);
    const expected = [2.0, 2.0, 2.5, 2.5, 5.0, 5.5, 5.5, 6.0];
    for (let i = 0; i < x.length; i++) {
      expect(Math.abs(fit(x[i]) - expected[i])).toBeLessThan(1e-12);
    }
  });
});
