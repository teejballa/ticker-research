import { describe, it, expect } from 'vitest';
// RED: enforceLiveOnlyGate does not exist yet — Plan 04 adds it to learning.ts.
import {
  enforceLiveOnlyGate,
  LIVE_OUTCOME_THRESHOLD,
  decayWeights,
  updatePosteriorWeighted,
  posteriorMean,
} from '@/lib/learning';

describe('live-only promotion gate (COVERAGE-10 / D-10)', () => {
  it('default threshold is 10', () => {
    expect(LIVE_OUTCOME_THRESHOLD).toBe(10);
  });
  it('forces EXPLORATORY when live outcomes < threshold (backfill alone cannot graduate)', () => {
    expect(enforceLiveOnlyGate('ACTIVE', 0)).toBe('EXPLORATORY');
    expect(enforceLiveOnlyGate('ACTIVE', 9)).toBe('EXPLORATORY');
  });
  it('allows ACTIVE once live outcomes >= threshold', () => {
    expect(enforceLiveOnlyGate('ACTIVE', 10)).toBe('ACTIVE');
    expect(enforceLiveOnlyGate('ACTIVE', 25)).toBe('ACTIVE');
  });
  it('never PROMOTES a non-ACTIVE status (gate only demotes)', () => {
    expect(enforceLiveOnlyGate('EXPLORATORY', 50)).toBe('EXPLORATORY');
    expect(enforceLiveOnlyGate('DEPRECATED', 50)).toBe('DEPRECATED');
  });
});

describe('backfill rows do not move the live posterior (D-01)', () => {
  const DAY = 86_400_000;
  const now = new Date('2026-05-26T00:00:00Z');

  it('a 5y-old observation has near-zero decay weight (lambda=60d)', () => {
    const obs = [{ hit: true, recorded_at: new Date(now.getTime() - 1825 * DAY) }];
    const w = decayWeights(obs, 60, now);
    // exp(-1825/60) ≈ 1.5e-13 — effectively zero live-posterior contribution
    expect(w[0]).toBeLessThan(1e-10);
  });

  it('a 5y-old backfill row barely shifts the posterior vs one fresh live hit', () => {
    const fresh = { hit: true, recorded_at: new Date(now.getTime() - 1 * DAY) };
    const old = { hit: false, recorded_at: new Date(now.getTime() - 1825 * DAY) };
    const obsAll = [fresh, old];
    const wAll = decayWeights(obsAll, 60, now);
    const withBackfill = posteriorMean(
      updatePosteriorWeighted({ alpha: 1, beta: 1 }, obsAll, wAll),
    );
    const wFresh = decayWeights([fresh], 60, now);
    const freshOnly = posteriorMean(
      updatePosteriorWeighted({ alpha: 1, beta: 1 }, [fresh], wFresh),
    );
    // The 5y-old row contributes negligible weight — posterior shift < 1e-6
    expect(Math.abs(withBackfill - freshOnly)).toBeLessThan(1e-6);
  });
});
