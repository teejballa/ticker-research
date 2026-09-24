import { describe, it, expect } from 'vitest';
// Wave 2 Task 24-02-03 creates src/lib/composite/logistic-baseline.ts with 3 exports:
//   fitLogisticBaseline, predictLogisticBaseline, logistic36Brier.
// Uses ml-matrix (Wave 2 executor MUST run `npm install ml-matrix` first) for IRLS.
// Same 36 features as P21.1. Time-series CV per CLAUDE.md #1 (forward-chaining only).
describe('fitLogisticBaseline — deterministic on golden 36-feature vector (CLAUDE.md §8)', () => {
  it('produces coefficients within ε=1e-4 across two runs with identical seed', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fitLogisticBaseline } = require('@/lib/composite/logistic-baseline');
    // Fixed 36-feature vectors × 200 rows — executor MUST author a small deterministic
    // fixture (or inline generator with fixed seed) that produces reproducible IRLS output.
    const rows = Array.from({ length: 200 }, (_, i) => {
      const features: number[] = Array.from({ length: 36 }, (_, k) => ((i * 7 + k * 3) % 100) / 100);
      return { features, outcome: (i % 2) as 0 | 1 };
    });
    const modelA = fitLogisticBaseline(rows);
    const modelB = fitLogisticBaseline(rows);
    expect(modelA.coefficients.length).toBe(36);
    for (let k = 0; k < 36; k++) {
      expect(modelA.coefficients[k]).toBeCloseTo(modelB.coefficients[k], 4);
    }
  });
});

describe('logistic36Brier — forward-chaining CV (CLAUDE.md #1 — never random k-fold)', () => {
  it('returns a numeric Brier score on a fit/eval window split', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logistic36Brier } = require('@/lib/composite/logistic-baseline');
    const rows = Array.from({ length: 300 }, (_, i) => ({
      features: Array.from({ length: 36 }, (_, k) => ((i + k) % 100) / 100),
      outcome: (i % 3 === 0 ? 1 : 0) as 0 | 1,
      predicted_at: new Date(2026, 0, 1 + i),  // forward-chaining timestamps
    }));
    // Contract per Blocker #2: fit_window strictly precedes eval_window in time.
    const brier = logistic36Brier(rows, { fit_start: 0, fit_end: 200 }, { eval_start: 200, eval_end: 300 });
    expect(typeof brier).toBe('number');
    expect(brier).toBeGreaterThanOrEqual(0);
    expect(brier).toBeLessThanOrEqual(1);
  });
});
