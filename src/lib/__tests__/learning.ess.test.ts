// Phase 18-00 Wave 0 stub — covers CORE-ML-01 (Kish effective sample size).
// Wave 1 (Plan 18-01) will implement `computeESS` in `src/lib/learning.ts`.
// Pass criteria sourced from 18-RESEARCH.md §"Validation Architecture" and
// CONTEXT D-03 (Kish formula: ESS = (Σw)² / Σw²).

import { describe, it, expect } from 'vitest';
import { computeESS } from '@/lib/learning';

describe('computeESS — Kish effective sample size', () => {
  it('returns 0 for empty input', () => {
    expect(computeESS([])).toBe(0);
  });
  it.todo('returns N for uniform weights w_i=1 (ESS=N)');
  it.todo('returns ~1 for single-spike weights (one >> rest)');
  it.todo('matches hand-computed Kish (Σw)²/Σw² on [1,2,3]');
  it.todo('returns 0 when all weights are 0 (no division by zero)');
});
