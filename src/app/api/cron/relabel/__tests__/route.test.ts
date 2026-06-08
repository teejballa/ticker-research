// Phase 21 — /api/cron/relabel integration tests (Plan 21-2-04).
//
// The route hits prisma + yahoo-finance2 at runtime. To keep the unit test
// fast and deterministic, we vi.mock both:
//   • @/lib/db.prisma — priceOutcome.findMany returns a controllable fixture
//     per test; priceOutcome.update is a vi.fn() that records calls.
//   • @/lib/data/sector-mapping.getSectorETF + @/lib/data/sector-prices
//     .fetchSectorETFReturn — vi.fn()s armed per case.
//
// Coverage (5 it() blocks, all green):
//   R1 — missing Authorization header → 401
//   R2 — wrong Bearer → 401
//   R3 — correct Bearer → 200 + {ok, scanned, labeled, skipped, …} shape
//   R4 — idempotent re-run: second call labeled=0 + counters match
//   R5 — sector resolution falling back to SPY does NOT throw, counter increments

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { NextRequest } from 'next/server';

const { mockFindMany, mockUpdate, mockGetSectorETF, mockFetchSectorReturn } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetSectorETF: vi.fn(),
  mockFetchSectorReturn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    priceOutcome: {
      findMany: mockFindMany,
      update: mockUpdate,
    },
  },
}));

vi.mock('@/lib/data/sector-mapping', () => ({
  getSectorETF: mockGetSectorETF,
  // Wave 2 (Plan 21.1-02) added getSectorSigma60d, consumed by computeLabelsFor.
  // Tests in this file exercise the relabel route only; a fixed σ keeps the
  // sigma-label arithmetic deterministic without expanding suite scope.
  getSectorSigma60d: vi.fn().mockResolvedValue(0.012),
}));

vi.mock('@/lib/data/sector-prices', () => ({
  fetchSectorETFReturn: mockFetchSectorReturn,
}));

import { GET } from '../route';

const TEST_SECRET = 'test-cron-secret-phase-21-relabel';

function makeReq(opts: { authorization?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.authorization) headers.set('authorization', opts.authorization);
  // The route only reads `.headers`; a plain Request satisfies that surface.
  // Cast to NextRequest so the GET(request: NextRequest) call sites type-check
  // without pulling in the full NextRequest constructor.
  return new Request('http://test.local/api/cron/relabel', {
    method: 'GET',
    headers,
  }) as unknown as NextRequest;
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
    mockFindMany.mockReset();
    mockUpdate.mockReset();
    mockGetSectorETF.mockReset();
    mockFetchSectorReturn.mockReset();
  });

  it('R1: without Authorization header → 401 (cron auth)', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('R2: with wrong Bearer → 401', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const res = await GET(makeReq({ authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('R3: with correct Bearer → 200 + {ok, scanned, labeled, skipped} JSON shape', async () => {
    // Two rows in the backlog: one with a report parent, one with a snapshot parent.
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'po-1',
        report_id: 'r-1',
        snapshot_id: null,
        days_after: 3,
        price: 195,
        pct_change: 4.5,
        recorded_at: new Date('2026-04-15T16:00:00Z'),
        sector_etf: null,
        forward_return_raw: null,
        forward_return_sector_rel: null,
        report: { id: 'r-1', ticker: 'AAPL', analyzed_at: new Date('2026-04-12T13:30:00Z') },
        snapshot: null,
      },
      {
        id: 'po-2',
        report_id: null,
        snapshot_id: 's-1',
        days_after: 7,
        price: 425,
        pct_change: -1.2,
        recorded_at: new Date('2026-04-19T16:00:00Z'),
        sector_etf: null,
        forward_return_raw: null,
        forward_return_sector_rel: null,
        report: null,
        snapshot: { id: 's-1', ticker: 'JPM', scanned_at: new Date('2026-04-12T15:00:00Z') },
      },
    ]);
    mockGetSectorETF.mockResolvedValueOnce('XLK').mockResolvedValueOnce('XLF');
    mockFetchSectorReturn.mockResolvedValueOnce(2.0).mockResolvedValueOnce(0.5);
    mockUpdate.mockResolvedValue({});

    const res = await GET(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      scanned: expect.any(Number),
      labeled: expect.any(Number),
      skipped: expect.any(Number),
    });
    expect(json.scanned).toBe(2);
    expect(json.labeled).toBe(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('R4: idempotent re-run — second call scanned=0, labeled=0', async () => {
    const seedRow = {
      id: 'po-A',
      report_id: 'r-A',
      snapshot_id: null,
      days_after: 3,
      price: 100,
      pct_change: 1.0,
      recorded_at: new Date('2026-04-15T16:00:00Z'),
      sector_etf: null,
      forward_return_raw: null,
      forward_return_sector_rel: null,
      report: { id: 'r-A', ticker: 'AAPL', analyzed_at: new Date('2026-04-12T13:30:00Z') },
      snapshot: null,
    };
    // First call: 1 row to label.
    mockFindMany.mockResolvedValueOnce([seedRow]);
    mockGetSectorETF.mockResolvedValueOnce('XLK');
    mockFetchSectorReturn.mockResolvedValueOnce(0.5);
    mockUpdate.mockResolvedValueOnce({});
    // Second call: WHERE sector_etf IS NULL returns nothing — row already labeled.
    mockFindMany.mockResolvedValueOnce([]);

    const first = await GET(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    const firstJson = await first.json();
    expect(firstJson.ok).toBe(true);
    expect(firstJson.labeled).toBe(1);

    const second = await GET(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    const secondJson = await second.json();
    expect(secondJson.ok).toBe(true);
    expect(secondJson.scanned).toBe(0);
    expect(secondJson.labeled).toBe(0);
  });

  it('R5: rows whose sector_etf return cannot be resolved default to SPY fallback (no throw, counter increments)', async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: 'po-fb',
        report_id: 'r-fb',
        snapshot_id: null,
        days_after: 3,
        price: 100,
        pct_change: 0.7,
        recorded_at: new Date('2026-04-15T16:00:00Z'),
        sector_etf: null,
        forward_return_raw: null,
        forward_return_sector_rel: null,
        report: { id: 'r-fb', ticker: 'OBSCURE', analyzed_at: new Date('2026-04-12T13:30:00Z') },
        snapshot: null,
      },
    ]);
    mockGetSectorETF.mockResolvedValueOnce('XLRE'); // some sector
    mockFetchSectorReturn.mockResolvedValueOnce(null);  // sector price fetch fails
    mockFetchSectorReturn.mockResolvedValueOnce(0.3);   // SPY fallback returns a number
    mockUpdate.mockResolvedValue({});

    const res = await GET(makeReq({ authorization: `Bearer ${TEST_SECRET}` }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.scanned).toBe(1);
    expect(json.labeled).toBe(1);
    expect(json.fallback_to_spy).toBe(1);
    // Row labeled with sector_etf='SPY' instead of original XLRE.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sector_etf: 'SPY' }),
      }),
    );
  });
});
