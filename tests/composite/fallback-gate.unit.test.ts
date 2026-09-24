import { describe, it, expect } from 'vitest';
import { widenCi } from '@/lib/composite/weights';

describe('widenCi — √(4/K) at K∈{1,2,3,4}', () => {
  it('K=4 → factor = 1.00 (no widening)', () => {
    const out = widenCi(0.5, 0.40, 0.60, 4);
    expect(out.low).toBeCloseTo(0.40, 6);
    expect(out.high).toBeCloseTo(0.60, 6);
  });
  it('K=3 → factor = √(4/3) ≈ 1.1547', () => {
    const out = widenCi(0.5, 0.40, 0.60, 3);
    expect(out.low).toBeCloseTo(0.5 - 0.10 * Math.sqrt(4/3), 4);
    expect(out.high).toBeCloseTo(0.5 + 0.10 * Math.sqrt(4/3), 4);
  });
  it('K=2 → factor = √(4/2) = √2 ≈ 1.4142', () => {
    const out = widenCi(0.5, 0.40, 0.60, 2);
    expect(out.low).toBeCloseTo(0.5 - 0.10 * Math.sqrt(2), 4);
    expect(out.high).toBeCloseTo(0.5 + 0.10 * Math.sqrt(2), 4);
  });
  it('K=1 → suppressed (low=high=point)', () => {
    const out = widenCi(0.5, 0.40, 0.60, 1);
    expect(out.low).toBeCloseTo(0.5, 6);
    expect(out.high).toBeCloseTo(0.5, 6);
  });
  it('clamps to [0,1]', () => {
    const out = widenCi(0.05, 0.00, 0.10, 2);
    expect(out.low).toBeGreaterThanOrEqual(0);
    expect(out.high).toBeLessThanOrEqual(1);
  });
});
