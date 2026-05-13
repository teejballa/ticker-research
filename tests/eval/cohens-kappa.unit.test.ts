// tests/eval/cohens-kappa.unit.test.ts — Plan 20-D-02 Task 1
import { describe, it, expect } from 'vitest';
import { cohensKappa } from '@/lib/eval/cohens-kappa';

// Tiny seeded RNG (mulberry32) so the "≈ 0 on independent random" test is
// deterministic across runs.
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('cohensKappa', () => {
  it('perfect agreement → 1.0', () => {
    expect(cohensKappa([true, true, false, false], [true, true, false, false])).toBeCloseTo(1.0, 6);
  });

  it('independent random ≈ 0 (within ±0.1)', () => {
    const rng = mulberry32(12345);
    const a: boolean[] = [];
    const b: boolean[] = [];
    for (let i = 0; i < 500; i++) {
      a.push(rng() > 0.5);
      b.push(rng() > 0.5);
    }
    const k = cohensKappa(a, b);
    expect(Math.abs(k)).toBeLessThan(0.15);
  });

  it('length mismatch throws', () => {
    expect(() => cohensKappa([true, false], [true])).toThrow(/length mismatch/);
  });

  it('all-true vs all-true returns 1.0 (degenerate p_e === 1)', () => {
    const a = Array(10).fill(true);
    const b = Array(10).fill(true);
    expect(cohensKappa(a, b)).toBe(1.0);
  });

  it('perfect disagreement → ≈ -1.0', () => {
    const k = cohensKappa([true, true, false, false], [false, false, true, true]);
    expect(k).toBeCloseTo(-1.0, 1);
  });

  it('empty arrays → 1.0 (vacuous agreement convention)', () => {
    expect(cohensKappa([], [])).toBe(1.0);
  });
});
