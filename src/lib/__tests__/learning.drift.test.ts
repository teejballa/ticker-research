// Phase 18-00 Wave 0 stub — covers CORE-ML-04 (confirmedDrift two-of-two rule).
// Wave 1 (Plan 18-01) will implement `confirmedDrift` in `src/lib/learning.ts`.
// Pass criteria sourced from 18-RESEARCH.md §"Validation Architecture" and
// CONTEXT D-06 (two-of-two confirmation: |drift_z|>2 AND PH>threshold) +
// CONTEXT D-08 (min raw N=30 floor — drift never fires below this).

import { describe, it, expect } from 'vitest';
import { confirmedDrift } from '@/lib/learning';

describe('confirmedDrift — two-of-two confirmation rule (D-06) + N≥30 floor (D-08)', () => {
  it('returns fired=false when rawN < 30 even if both signals trip (D-08 floor)', () => {
    const out = confirmedDrift({
      rolling: { alpha: 50, beta: 1 },
      allTime: { alpha: 1, beta: 50 },
      perObsDeltas: Array(40).fill(0.5),
      delta: 0.005, lambdaPH: 1, rawN: 29,
    });
    expect(out.fired).toBe(false);
  });
  it.todo('returns fired=false when only |drift_z|>2 trips (PH cold)');
  it.todo('returns fired=false when only PH trips (drift_z cold)');
  it.todo('returns fired=true when BOTH trip AND rawN ≥ 30');
  it.todo('exposes drift_z, ph_stat, ph_threshold for LearningEvent.delta payload');
});
