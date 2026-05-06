// Phase 18-00 Wave 0 stub — covers CORE-ML-01 (decayWeights primitive).
// Wave 1 (Plan 18-01) will implement `decayWeights` + `WeightedObservation`
// in `src/lib/learning.ts`; until then this file goes RED on import.
// Pass criteria sourced from 18-RESEARCH.md §"Validation Architecture" and
// CONTEXT D-03 (exponential decay shape: w = e^(-Δt/λ)).

import { describe, it, expect } from 'vitest';
import { decayWeights, type WeightedObservation } from '@/lib/learning';

describe('decayWeights — exponential decay primitive', () => {
  it('returns weight 1.0 at Δt=0 (observation right now)', () => {
    const now = new Date('2026-05-04T00:00:00Z');
    const obs: WeightedObservation[] = [{ hit: true, recorded_at: now }];
    const w = decayWeights(obs, 30, now);
    expect(w[0]).toBeCloseTo(1, 10);
  });
  it.todo('returns weight e^-1 at Δt=λ (one half-life back)');
  it.todo('weights are monotonically decreasing as Δt increases');
  it.todo('handles empty input — returns empty array');
  it.todo('clamps Δt at 0 (future observations get weight 1.0, not >1)');
});
