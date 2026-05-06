// Phase 18 Wave 0/1: decayWeights primitive — CORE-ML-01 / D-03 / D-18.
// Activated assertions per Plan 18-01 §<behavior>.

import { describe, it, expect } from 'vitest';
import { decayWeights, type WeightedObservation } from '../learning';

const DAY_MS = 86_400_000;

function obsAt(daysAgo: number, hit = true): WeightedObservation {
  return {
    hit,
    recorded_at: new Date(Date.now() - daysAgo * DAY_MS),
  };
}

describe('decayWeights (Phase 18 — exponential time decay)', () => {
  it('returns [] for empty input', () => {
    expect(decayWeights([], 30)).toEqual([]);
  });

  it('weight at Δt=0 is exactly 1.0', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const obs: WeightedObservation[] = [{ hit: true, recorded_at: now }];
    const w = decayWeights(obs, 30, now);
    expect(w).toHaveLength(1);
    expect(w[0]).toBe(1);
  });

  it('weight at Δt=λ is e^-1 ≈ 0.36788', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const lambda = 30;
    const obs: WeightedObservation[] = [
      { hit: true, recorded_at: new Date(now.getTime() - lambda * DAY_MS) },
    ];
    const w = decayWeights(obs, lambda, now);
    expect(w[0]).toBeCloseTo(Math.exp(-1), 6);
    expect(w[0]).toBeCloseTo(0.36788, 4);
  });

  it('is monotonically non-increasing as Δt grows', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const lambda = 30;
    const obs: WeightedObservation[] = [0, 1, 7, 14, 30, 60, 90, 180, 365].map(d => ({
      hit: true,
      recorded_at: new Date(now.getTime() - d * DAY_MS),
    }));
    const w = decayWeights(obs, lambda, now);
    for (let i = 1; i < w.length; i++) {
      expect(w[i]).toBeLessThanOrEqual(w[i - 1]);
    }
  });

  it('clamps future-dated observations (Δt<0) to weight 1.0', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const future: WeightedObservation = {
      hit: true,
      recorded_at: new Date(now.getTime() + 5 * DAY_MS), // 5 days in the future
    };
    const w = decayWeights([future], 30, now);
    expect(w[0]).toBe(1);
  });

  it('uses now=Date.now() by default', () => {
    // Observation recorded right now should get weight ~1.
    const obs: WeightedObservation[] = [{ hit: true, recorded_at: new Date() }];
    const w = decayWeights(obs, 30);
    expect(w[0]).toBeGreaterThan(0.999);
    expect(w[0]).toBeLessThanOrEqual(1);
  });

  it('decays to ~0.5 at Δt = λ·ln(2)', () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const lambda = 30;
    const halfLifeDays = lambda * Math.log(2);
    const obs: WeightedObservation[] = [
      { hit: true, recorded_at: new Date(now.getTime() - halfLifeDays * DAY_MS) },
    ];
    const w = decayWeights(obs, lambda, now);
    expect(w[0]).toBeCloseTo(0.5, 6);
  });
});
