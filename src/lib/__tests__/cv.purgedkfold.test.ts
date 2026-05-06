// Phase 18-00 Wave 0 stub — covers D-16 (López de Prado Purged K-Fold + Embargo).
// Wave 1 (Plan 18-02) will create `src/lib/cv.ts` exporting `purgedKFold`.
// Pass criteria sourced from 18-RESEARCH.md §"Validation Architecture" and
// CONTEXT D-16 (defaults purge=embargo=90 days; train/test never overlap).

import { describe, it, expect } from 'vitest';
import { purgedKFold, type Observation } from '@/lib/cv';

describe('purgedKFold — López de Prado Purged K-Fold + Embargo', () => {
  it('produces non-empty folds for synthetic input', () => {
    const obs: Observation[] = Array.from({ length: 50 }, (_, i) => ({
      recorded_at: new Date(2026, 0, 1 + i), horizon_days: 30, hit: i % 2 === 0, cell_key: 'A',
    }));
    const folds = purgedKFold(obs, 5, 90, 90);
    expect(folds).toHaveLength(5);
    expect(folds[0].testIdx.length).toBeGreaterThan(0);
  });
  it.todo('train and test indices never overlap');
  it.todo('purges training obs whose [t, t+horizon] window overlaps test fold range');
  it.todo('embargoes training obs within embargoDays AFTER test fold end');
  it.todo('default purge=embargo=90 days per D-16');
});
