import { describe, it, expect } from 'vitest';
import {
  fitLogisticBaseline,
  logistic36Brier,
  type LogisticRow,
} from '@/lib/composite/logistic-baseline';

// Wave 2 Task 24-02-03 creates src/lib/composite/logistic-baseline.ts with 3 exports:
//   fitLogisticBaseline, predictLogisticBaseline, logistic36Brier.
// Uses ml-matrix (Wave 2 installs it) for IRLS. Same 36 features as P21.1.
// Time-series CV per CLAUDE.md #1 (forward-chaining only).
describe('fitLogisticBaseline — deterministic on golden 36-feature vector (CLAUDE.md §8)', () => {
  it('produces identical coefficients across two runs on the same input (IRLS is deterministic)', () => {
    // Fixed 36-feature vectors × 200 rows — deterministic PRNG-free generator.
    const rows: LogisticRow[] = Array.from({ length: 200 }, (_, i) => ({
      features: Array.from({ length: 36 }, (_, k) => ((i * 7 + k * 3) % 100) / 100),
      outcome: (i % 2) as 0 | 1,
    }));
    const modelA = fitLogisticBaseline(rows);
    const modelB = fitLogisticBaseline(rows);
    // Contract per plan Task 3 behavior: coefficients length = 37 (36 features + intercept at [0]).
    expect(modelA.coefficients.length).toBe(37);
    for (let k = 0; k < 37; k++) {
      expect(modelA.coefficients[k]).toBeCloseTo(modelB.coefficients[k], 4);
    }
  });
});

describe('logistic36Brier — forward-chaining CV (CLAUDE.md #1 — never random k-fold)', () => {
  it('returns a numeric Brier score on a fit/eval window split', () => {
    const rows: LogisticRow[] = Array.from({ length: 300 }, (_, i) => ({
      features: Array.from({ length: 36 }, (_, k) => ((i + k) % 100) / 100),
      outcome: (i % 3 === 0 ? 1 : 0) as 0 | 1,
      predicted_at: new Date(2026, 0, 1 + i), // forward-chaining timestamps
    }));
    // Contract per Blocker #2: fit_window strictly precedes eval_window in time.
    const brier = logistic36Brier(
      rows,
      { fit_start: 0, fit_end: 200 },
      { eval_start: 200, eval_end: 300 },
    );
    expect(typeof brier).toBe('number');
    expect(brier).toBeGreaterThanOrEqual(0);
    expect(brier).toBeLessThanOrEqual(1);
  });

  it('throws when fit_end > eval_start (rejects overlapping / random k-fold)', () => {
    const rows: LogisticRow[] = Array.from({ length: 100 }, (_, i) => ({
      features: Array.from({ length: 36 }, (_, k) => ((i + k) % 100) / 100),
      outcome: (i % 2) as 0 | 1,
    }));
    expect(() =>
      logistic36Brier(rows, { fit_start: 0, fit_end: 80 }, { eval_start: 50, eval_end: 100 }),
    ).toThrow(/forward-chaining required/);
  });
});
