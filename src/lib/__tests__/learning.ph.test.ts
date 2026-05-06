// Phase 18-00 Wave 0 stub — covers CORE-ML-04 (Page-Hinkley statistic).
// Wave 1 (Plan 18-01) will implement `pageHinkleyStatistic` in `src/lib/learning.ts`.
// Pass criteria sourced from 18-RESEARCH.md §"Validation Architecture" and
// CONTEXT D-07 (PH parameters δ, λ_PH per signal class).

import { describe, it, expect } from 'vitest';
import { pageHinkleyStatistic } from '@/lib/learning';

describe('pageHinkleyStatistic — concept-drift accumulator', () => {
  it('is callable with (deltas, delta, lambdaPH) and returns a number', () => {
    const out = pageHinkleyStatistic([0, 0, 0], 0.005, 50);
    expect(typeof out).toBe('number');
  });
  it.todo('stays ≤0 on stationary stream of zero-mean deltas');
  it.todo('rises >0 when a sustained shift exceeds δ for many steps');
  it.todo('detects upward AND downward shifts (returns max of both)');
  it.todo('per-class F1 ≥ 0.9 on synthetic injected-drift suite');
});
