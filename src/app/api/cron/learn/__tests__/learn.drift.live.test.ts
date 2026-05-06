// Phase 18-00 Wave 0 stub — covers CORE-ML-04 (drift_alert + EXPLORATORY-WATCH flip + D-08 N=29 floor).
// Wave 2 (Plan 18-04) will replace the placeholder assertion with seeded-drift fixtures.
// Two scenarios are encoded as it.todo entries: synthetic injected drift fires; raw N=29 floor blocks.
// Pass criteria sourced from 18-RESEARCH.md §"Validation Architecture", CONTEXT D-06/D-08/D-09,
// and threat T-18-05 (numeric-only contract for LearningEvent.delta payload).

import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/db';

// reference prisma so the import isn't elided — Wave 2 will use it for seeding/dedup queries
void prisma;

describe('[live-DB] /api/cron/learn drift detector — two-of-two + EXPLORATORY-WATCH', () => {
  it.todo('synthetic injected drift in seeded events — one drift_alert LearningEvent written, cell.status flips to EXPLORATORY-WATCH');
  it.todo('cell with raw N=29 (below D-08 floor) and synthetic drift — zero drift_alert events written');
  it.todo('drift_alert.delta payload contains numeric drift_z, ph_stat, ph_threshold, raw_n, ess (T-18-05 numeric-only contract)');
  it.todo('cell already in EXPLORATORY-WATCH stays in EXPLORATORY-WATCH on subsequent fire (no flap, no auto-demote per D-09)');
  it('placeholder — Wave 2 Plan 04 fills in', () => {
    expect(true).toBe(true); // remove + replace with red assertion in Wave 2
  });
});
