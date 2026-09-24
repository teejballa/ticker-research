import { describe, it, expect } from 'vitest';
import { computeCompositeCi, type CompositeRow } from '@/lib/composite/isotonic-fit';

describe('computeCompositeCi — BCa reproducible with seed=42 (D-02)', () => {
  it('returns identical (low, high) across two runs with same seed', () => {
    const identityCurve = (x: number) => x;
    const curves = { diffusion: identityCurve, technical: identityCurve, institutional: identityCurve, insider: identityCurve };
    const rows: CompositeRow[] = Array.from({ length: 150 }, (_, i) => ({
      ticker: `T${i}`,
      predicted_at: new Date(2026, 0, 1),
      resolved_at: new Date(2026, 1, 1),  // > 30d after predicted_at
      horizon_days: 30,
      raw_posteriors: { diffusion: 0.5 + (i % 5) * 0.05, technical: 0.55, institutional: 0.6, insider: 0.5 },
      ess: { diffusion: 50, technical: 50, institutional: 50, insider: 50 },
      status: { diffusion: 'ACTIVE', technical: 'ACTIVE', institutional: 'ACTIVE', insider: 'ACTIVE' },
      outcome: (i % 2) as 0 | 1,
    }));
    const a = computeCompositeCi(rows, curves, { nResamples: 100, seed: 42 });
    const b = computeCompositeCi(rows, curves, { nResamples: 100, seed: 42 });
    expect(a.low).toBeCloseTo(b.low, 10);
    expect(a.high).toBeCloseTo(b.high, 10);
  });
});
