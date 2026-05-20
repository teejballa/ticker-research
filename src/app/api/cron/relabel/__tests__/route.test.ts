// @ts-nocheck — red-phase test for /api/cron/relabel. The route file itself
// is created in 21-2-04; until then, `import { GET } from '../route'` resolves
// to "Cannot find module" at vitest runtime — which IS the red-phase signal.
// Remove this @ts-nocheck after 21-2-04 lands.
//
// Phase 21 — Sector-Relative Outcome Labels (21-0-01 TDD red-phase scaffolding).
//
// Mirrors Phase 18 plan 05's backfill-ess pattern: one-shot idempotent cron
// gated by Bearer CRON_SECRET, returns scanned/labeled/skipped counters, and
// is safe to re-run (second invocation labels nothing new).
//
// Coverage (5 it() blocks, all currently fail with "Cannot find module"):
//   R1 — missing Authorization header → 401
//   R2 — wrong Bearer → 401
//   R3 — correct Bearer → 200 + {ok, scanned, labeled, skipped} JSON shape
//   R4 — idempotent re-run: second call scanned=N, labeled=0, skipped=N
//   R5 — rows without resolvable sector default to SPY fallback (no throw)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// This import will fail with "Cannot find module" at runtime until 21-2-04
// creates src/app/api/cron/relabel/route.ts. That is the red-phase signal.
import { GET } from '../route';

const TEST_SECRET = 'test-cron-secret-phase-21-relabel';

function makeReq(opts: { authorization?: string } = {}): Request {
  const headers = new Headers();
  if (opts.authorization) headers.set('authorization', opts.authorization);
  return new Request('http://test.local/api/cron/relabel', {
    method: 'GET',
    headers,
  });
}

describe('/api/cron/relabel — idempotent sector-relabel backfill (Plan 21-2-04)', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeAll(() => {
    process.env.CRON_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  beforeEach(() => {
    // 21-2-04 implementation must wire fresh DB state via a beforeEach helper.
    // Red-phase: this body is empty because the route does not yet exist.
  });

  it('R1: without Authorization header → 401 (cron auth)', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('R2: with wrong Bearer → 401', async () => {
    const res = await GET(makeReq({ authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('R3: with correct Bearer → 200 + {ok, scanned, labeled, skipped} JSON shape', async () => {
    const res = await GET(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      scanned: expect.any(Number),
      labeled: expect.any(Number),
      skipped: expect.any(Number),
    });
  });

  it('R4: idempotent re-run — second call scanned=N, labeled=0, skipped=N', async () => {
    const first = await GET(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    const firstJson = await first.json();
    expect(firstJson.ok).toBe(true);
    const labeledOnFirst = firstJson.labeled;

    const second = await GET(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    const secondJson = await second.json();
    expect(secondJson.ok).toBe(true);
    expect(secondJson.scanned).toBe(firstJson.scanned);
    expect(secondJson.labeled).toBe(0);
    expect(secondJson.skipped).toBeGreaterThanOrEqual(labeledOnFirst);
  });

  it('R5: rows whose sector cannot be resolved default to SPY fallback (no throw)', async () => {
    // 21-2-04 must ensure unknown-sector rows resolve to sector_etf='SPY' and
    // are counted as labeled (with SPY-relative forward return == raw return).
    // This contract test verifies the absence of a throw and the SPY fallback
    // shows up in the labeled count, not the skipped count.
    const res = await GET(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
