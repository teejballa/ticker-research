import { describe, it, expect } from 'vitest';
import { purgedKFold, type Observation } from '@/lib/cv';

const dayMs = 86_400_000;

function makeObs(count: number, startISO = '2026-01-01T00:00:00Z', horizonDays = 30): Observation[] {
  const start = new Date(startISO).getTime();
  return Array.from({ length: count }, (_, i) => ({
    recorded_at: new Date(start + i * dayMs),
    horizon_days: horizonDays,
    hit: i % 2 === 0,
    cell_key: 'A',
  }));
}

describe('purgedKFold — López de Prado Purged K-Fold + Embargo', () => {
  it('produces non-empty folds for synthetic input', () => {
    const obs = makeObs(50);
    const folds = purgedKFold(obs, 5, 90, 90);
    expect(folds).toHaveLength(5);
    expect(folds[0].testIdx.length).toBeGreaterThan(0);
  });

  it('train and test indices never overlap', () => {
    const obs = makeObs(50);
    const folds = purgedKFold(obs, 5, 90, 90);
    for (const fold of folds) {
      const testSet = new Set(fold.testIdx);
      for (const trainI of fold.trainIdx) {
        expect(testSet.has(trainI)).toBe(false);
      }
    }
  });

  it('purges training obs whose [t, t+horizon] window overlaps test fold range', () => {
    // Construct 5 obs at known dates with horizon=30. Each obs is 1 day apart so
    // a training row at t=Jan 1 with [Jan 1, Jan 31] outcome window overlaps the
    // last test fold (Jan 5). Use purgeDays=0/embargoDays=0 so the purge effect
    // is solely from the [t, t+horizon] outcome window overlap rule.
    const obs: Observation[] = [
      { recorded_at: new Date('2026-01-01T00:00:00Z'), horizon_days: 30, hit: true, cell_key: 'A' },
      { recorded_at: new Date('2026-01-02T00:00:00Z'), horizon_days: 30, hit: false, cell_key: 'A' },
      { recorded_at: new Date('2026-01-03T00:00:00Z'), horizon_days: 30, hit: true, cell_key: 'A' },
      { recorded_at: new Date('2026-01-04T00:00:00Z'), horizon_days: 30, hit: false, cell_key: 'A' },
      { recorded_at: new Date('2026-01-05T00:00:00Z'), horizon_days: 30, hit: true, cell_key: 'A' },
    ];
    const folds = purgedKFold(obs, 5, 0, 0);
    // Last test fold (f=4): testIdx=[4], tMin=tMax=Jan 5.
    // Training obs 0..3 all have recorded_at <= Jan 5 AND outcome end >= Jan 5
    // (outcomes end Jan 31, Feb 1, Feb 2, Feb 3) → ALL purged by horizon overlap.
    const lastFold = folds[4];
    expect(lastFold.testIdx).toEqual([4]);
    expect(lastFold.trainIdx).toEqual([]);

    // First test fold (f=0): testIdx=[0], tMin=tMax=Jan 1.
    // Training obs 1..4 have recorded_at > Jan 1 (i.e., > tMax+purge=Jan 1) so
    // the horizon-overlap purge rule (which requires ti <= tMax+purgeMs) does
    // NOT exclude them. With embargoDays=0, none are embargoed either.
    const firstFold = folds[0];
    expect(firstFold.testIdx).toEqual([0]);
    expect(firstFold.trainIdx).toEqual([1, 2, 3, 4]);
  });

  it('embargoes training obs within embargoDays AFTER test fold end', () => {
    // Construct 10 obs with horizon=0 (so purge has zero outcome-window effect).
    // Use embargoDays=3 with purgeDays=0. Test fold 0 = obs 0-1 (Jan 1-2).
    // tMax = Jan 2. Embargo zone: (Jan 2, Jan 5). Obs 2 (Jan 3) and obs 3 (Jan 4)
    // fall in embargo and must be excluded; obs 4 (Jan 5) lies on the boundary
    // (ti < tMax + embargoMs is strict, so Jan 5 == tMax+3d is excluded);
    // obs 5+ (Jan 6+) survive.
    const obs: Observation[] = Array.from({ length: 10 }, (_, i) => ({
      recorded_at: new Date(Date.UTC(2026, 0, 1 + i)),
      horizon_days: 0,
      hit: i % 2 === 0,
      cell_key: 'A',
    }));
    const folds = purgedKFold(obs, 5, 0, 3);
    const fold0 = folds[0];
    expect(fold0.testIdx).toEqual([0, 1]);
    // Training set must not contain obs 2, 3, 4 (embargoed).
    expect(fold0.trainIdx).not.toContain(2);
    expect(fold0.trainIdx).not.toContain(3);
    // Obs 5+ should remain.
    expect(fold0.trainIdx).toContain(5);
  });

  it('default purge=embargo=90 days per D-16', () => {
    const obs = makeObs(50);
    const foldsExplicit = purgedKFold(obs, 5, 90, 90);
    const foldsDefault = purgedKFold(obs, 5);
    expect(foldsDefault).toHaveLength(foldsExplicit.length);
    for (let i = 0; i < foldsExplicit.length; i++) {
      expect(foldsDefault[i].testIdx).toEqual(foldsExplicit[i].testIdx);
      expect(foldsDefault[i].trainIdx).toEqual(foldsExplicit[i].trainIdx);
    }
  });
});
