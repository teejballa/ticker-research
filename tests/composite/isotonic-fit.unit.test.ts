import { describe, it, expect } from 'vitest';
import { fitAndSerialize, deserialize } from '@/lib/composite/isotonic-serde';
import goldenFit from './_fixtures/golden-isotonic.json';

describe('fitAndSerialize (Wave 1)', () => {
  it('produces monotone non-decreasing y_values against golden vector', () => {
    const curve = fitAndSerialize(goldenFit.x, goldenFit.y);
    for (let i = 1; i < curve.y_values.length; i++) {
      expect(curve.y_values[i]).toBeGreaterThanOrEqual(curve.y_values[i - 1]);
    }
  });
  it('deserialize round-trips via binary search', () => {
    const curve = fitAndSerialize(goldenFit.x, goldenFit.y);
    const pred = deserialize(curve);
    for (let i = 0; i < curve.x_breakpoints.length; i++) {
      expect(pred(curve.x_breakpoints[i])).toBeCloseTo(curve.y_values[i], 6);
    }
  });
});

describe('fitPerClassCurves — look-ahead defense (CLAUDE.md #6)', () => {
  it('rejects rows where resolved_at <= predicted_at + horizon', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fitPerClassCurves } = require('@/lib/composite/isotonic-fit');
    const rows = [
      { predicted_at: new Date('2026-01-01'), resolved_at: new Date('2026-01-10'), horizon_days: 30, raw_posteriors: { diffusion: 0.5 }, outcome: 1 },
    ];
    // Row should be filtered because resolved_at (Jan 10) < predicted_at + 30d (Jan 31)
    expect(() => fitPerClassCurves(rows, { minN: 50, horizonDays: 30 })).toThrow(/insufficient|no valid|leak/i);
  });
});
