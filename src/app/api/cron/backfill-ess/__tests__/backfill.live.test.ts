// Phase 18-00 Wave 0 stub — covers D-13 (ESS backfill idempotency).
// Wave 2 (Plan 18-05) will create `/api/cron/backfill-ess/route.ts` and replace
// the placeholder assertion with real first-run / second-run / unauthorised paths.
// Pass criteria sourced from CONTEXT D-13 (one-shot marker `ess_backfill_complete`),
// T-18-01 (cron Bearer auth via CRON_SECRET), T-18-03 (ENABLE_BACKFILL_ESS env-flag gate).

import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/db';

// reference prisma so the import isn't elided — Wave 2 will use it for marker queries
void prisma;

describe('[live-DB] /api/cron/backfill-ess — idempotent ESS migration', () => {
  it.todo('first invocation with ENABLE_BACKFILL_ESS=1 + valid CRON_SECRET — writes effective_sample_size to all 504 cells AND writes one LearningEvent with event_type=ess_backfill_complete');
  it.todo('second invocation — returns { status: "already_done" }, ESS values unchanged, no duplicate ess_backfill_complete event');
  it.todo('without ENABLE_BACKFILL_ESS=1 — returns 401 (T-18-03 env-flag gate)');
  it.todo('without Bearer ${CRON_SECRET} — returns 401 (T-18-01 cron auth)');
  it('placeholder — Wave 2 Plan 05 fills in', () => {
    expect(true).toBe(true);
  });
});
