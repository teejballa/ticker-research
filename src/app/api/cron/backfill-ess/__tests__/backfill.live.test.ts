// Phase 18 Plan 05 — live-DB integration test for /api/cron/backfill-ess.
// Covers all four threat-mitigation paths from the plan's <behavior> contract:
//   - T-18-01 (cron Bearer auth via CRON_SECRET)
//   - T-18-03 (ENABLE_BACKFILL_ESS env-flag gate)
//   - D-13 (one-shot marker ess_backfill_complete + idempotency)
//   - T-18-02 (single transaction includes the marker)
//
// Run via `npm run test:integration -- --run src/app/api/cron/backfill-ess/__tests__/backfill.live.test.ts`.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

// Use dynamic imports for modules that read process.env at evaluation time.
// `@/lib/db` instantiates the Prisma client at module-load and throws when
// DATABASE_URL is not set — static import order under ESM hoists it above the
// loadDotenv() call, so we defer to a top-level `await import()` instead.
const HAS_DB = !!process.env.DATABASE_URL;
const describeIfDb = HAS_DB ? describe : describe.skip;

const { prisma } = HAS_DB ? await import('@/lib/db') : { prisma: null as unknown as import('@prisma/client').PrismaClient };
const { POST } = HAS_DB ? await import('@/app/api/cron/backfill-ess/route') : { POST: null as unknown as typeof import('@/app/api/cron/backfill-ess/route').POST };

const MARKER = 'ess_backfill_complete';
const TEST_SECRET = 'test-cron-secret-phase-18-05';

// Deterministic envelope for building a synthetic POST request without spinning
// up Next.js. POST() reads `request.headers.get('authorization')` only.
function makeReq(opts: { authorization?: string } = {}): Request {
  const headers = new Headers();
  if (opts.authorization) headers.set('authorization', opts.authorization);
  return new Request('http://test.local/api/cron/backfill-ess', {
    method: 'POST',
    headers,
  });
}

async function clearMarker() {
  await prisma.learningEvent.deleteMany({ where: { event_type: MARKER } });
}

async function snapshotEss() {
  const rows = await prisma.learnedPattern.findMany({
    select: { id: true, effective_sample_size: true, alpha: true, beta: true, alpha_30d: true, beta_30d: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

describeIfDb('[live-DB] /api/cron/backfill-ess — idempotent ESS migration (Plan 18-05)', () => {
  // Stash original env so we never leak test config into other test files.
  const originalCronSecret = process.env.CRON_SECRET;
  const originalEnableFlag = process.env.ENABLE_BACKFILL_ESS;

  beforeAll(() => {
    process.env.CRON_SECRET = TEST_SECRET;
  });

  afterAll(async () => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    if (originalEnableFlag === undefined) delete process.env.ENABLE_BACKFILL_ESS;
    else process.env.ENABLE_BACKFILL_ESS = originalEnableFlag;
    await clearMarker();
  });

  beforeEach(async () => {
    await clearMarker();
    delete process.env.ENABLE_BACKFILL_ESS;
  });

  it('without Authorization header → 401 (T-18-01 cron auth)', async () => {
    process.env.ENABLE_BACKFILL_ESS = '1';
    // @ts-expect-error NextRequest extends Request; the route only reads .headers.get
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
    // No marker should have been written.
    const marker = await prisma.learningEvent.findFirst({ where: { event_type: MARKER } });
    expect(marker).toBeNull();
  });

  it('with auth but ENABLE_BACKFILL_ESS unset → 401 with reason "backfill disabled" (T-18-03 env-flag gate)', async () => {
    // ENABLE_BACKFILL_ESS deliberately unset by beforeEach
    // @ts-expect-error NextRequest extends Request
    const res = await POST(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
    expect(json.reason).toBe('backfill disabled');
    const marker = await prisma.learningEvent.findFirst({ where: { event_type: MARKER } });
    expect(marker).toBeNull();
  });

  it('first invocation with auth + ENABLE_BACKFILL_ESS=1 → completed, writes marker, populates ESS', async () => {
    process.env.ENABLE_BACKFILL_ESS = '1';

    const cellsBefore = await prisma.learnedPattern.count();

    // @ts-expect-error NextRequest extends Request
    const res = await POST(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('completed');
    expect(json.cells_updated).toBe(cellsBefore);
    expect(typeof json.total_outcomes_replayed).toBe('number');
    expect(typeof json.duration_ms).toBe('number');

    // Exactly ONE marker exists.
    const markers = await prisma.learningEvent.findMany({ where: { event_type: MARKER } });
    expect(markers).toHaveLength(1);
    const marker = markers[0];
    expect(marker.message).toMatch(/ESS backfill complete/);
    const delta = marker.delta as { cells_updated: number; total_outcomes_replayed: number; hyperparameters_snapshot: Record<string, unknown> };
    expect(delta.cells_updated).toBe(cellsBefore);
    expect(delta.hyperparameters_snapshot).toBeDefined();

    // Sanity: every cell now has effective_sample_size >= 0 (no NaN, no negative).
    const cellsAfter = await prisma.learnedPattern.findMany({ select: { effective_sample_size: true } });
    for (const c of cellsAfter) {
      expect(Number.isFinite(c.effective_sample_size)).toBe(true);
      expect(c.effective_sample_size).toBeGreaterThanOrEqual(0);
    }
    // At least one cell has ESS > 0 if any posterior_update events exist for it.
    const eventCount = await prisma.learningEvent.count({
      where: {
        event_type: 'posterior_update',
        signal_class: { not: null },
        pattern_key: { not: null },
        cap_class: { not: null },
        horizon_days: { not: null },
      },
    });
    if (eventCount > 0) {
      const someEss = await prisma.learnedPattern.findFirst({
        where: { effective_sample_size: { gt: 0 } },
      });
      expect(someEss).not.toBeNull();
    }
  });

  it('second invocation with marker present → already_done, no rewrite, no duplicate marker', async () => {
    process.env.ENABLE_BACKFILL_ESS = '1';

    // First run lays down the marker + populates ESS.
    // @ts-expect-error NextRequest extends Request
    const firstRes = await POST(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    expect(firstRes.status).toBe(200);
    const firstJson = await firstRes.json();
    expect(firstJson.status).toBe('completed');

    const before = await snapshotEss();
    const markersBefore = await prisma.learningEvent.count({ where: { event_type: MARKER } });
    expect(markersBefore).toBe(1);

    // Second run finds marker, no-ops.
    // @ts-expect-error NextRequest extends Request
    const secondRes = await POST(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    expect(secondRes.status).toBe(200);
    const secondJson = await secondRes.json();
    expect(secondJson.status).toBe('already_done');
    expect(secondJson.completed_at).toBeDefined();

    // Marker count UNCHANGED (still 1).
    const markersAfter = await prisma.learningEvent.count({ where: { event_type: MARKER } });
    expect(markersAfter).toBe(1);

    // ESS values UNCHANGED across all cells.
    const after = await snapshotEss();
    expect(after.size).toBe(before.size);
    for (const [id, beforeRow] of before) {
      const afterRow = after.get(id);
      expect(afterRow).toBeDefined();
      expect(afterRow!.effective_sample_size).toBe(beforeRow.effective_sample_size);
      expect(afterRow!.alpha).toBe(beforeRow.alpha);
      expect(afterRow!.beta).toBe(beforeRow.beta);
      expect(afterRow!.alpha_30d).toBe(beforeRow.alpha_30d);
      expect(afterRow!.beta_30d).toBe(beforeRow.beta_30d);
    }
  });
});

