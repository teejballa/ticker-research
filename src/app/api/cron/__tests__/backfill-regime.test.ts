/**
 * PHASE 22 Wave 2 GREEN — turns the Wave 0 RED stub GREEN.
 * Covers: D-10 (one-shot P27-style backfill cron) + D-12 (Yahoo primary + Polygon fallback)
 *         per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Reference implementation contract (22-02-PLAN.md):
 *   - Bearer CRON_SECRET guard (mirrors learn/route.ts + relabel/route.ts)
 *   - maxDuration: 800 (Pro tier per RESEARCH §D)
 *   - Sweeps SentimentSnapshot WHERE regime = 'ALL' ORDER BY scanned_at ASC LIMIT batch
 *   - Sweeps PerSourceIC      WHERE regime = 'ALL' ORDER BY computed_at ASC LIMIT batch
 *   - For each row: classifyRegimeAt({ asOf: row.scanned_at | row.computed_at }) → update
 *   - Auto-disables after a complete pass via BACKFILL_REGIME_DISABLED env-var
 *   - Re-runnable: classifyRegimeAt -> { regime: 'ALL', ...nulls } leaves the row at
 *     regime='ALL' (logged + skipped, NOT updated — preserves the WHERE filter on re-run)
 *
 * Mocking strategy: same shape as sentiment-scan-regime.test.ts (mocks @/lib/db
 * and @/lib/regime/classify; calls the POST handler directly).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks installed BEFORE importing the route -----------------------------
const {
  mockSnapshotFindMany,
  mockSnapshotUpdate,
  mockIcFindMany,
  mockIcUpdate,
} = vi.hoisted(() => ({
  mockSnapshotFindMany: vi.fn(),
  mockSnapshotUpdate: vi.fn(),
  mockIcFindMany: vi.fn(),
  mockIcUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    sentimentSnapshot: {
      findMany: mockSnapshotFindMany,
      update: mockSnapshotUpdate,
    },
    perSourceIC: {
      findMany: mockIcFindMany,
      update: mockIcUpdate,
    },
  },
}));

const { mockClassify } = vi.hoisted(() => ({ mockClassify: vi.fn() }));
vi.mock('@/lib/regime/classify', () => ({
  classifyRegimeAt: mockClassify,
}));

// Import the handler under test AFTER mocks are installed.
import { POST as backfillRegimeHandler } from '@/app/api/cron/backfill-regime/route';
import {
  isRegimeBackfillDisabled,
  readRegimeBackfillCheckpoint,
} from '@/lib/regime/checkpoint';
import type { RegimeResult } from '@/lib/regime/classify';

// --- Test helpers -----------------------------------------------------------

const SECRET = 'test-cron-secret';

function authedRequest(): Request {
  return new Request('http://localhost/api/cron/backfill-regime', {
    method: 'POST',
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

function unauthedRequest(): Request {
  return new Request('http://localhost/api/cron/backfill-regime', {
    method: 'POST',
    // no Authorization header
  });
}

const BULL_LOW_VOL: RegimeResult = {
  regime: 'bull-low-vol',
  vix_level: 14.5,
  vix_60d_percentile: 0.22,
  spy_ma_50_minus_200: 18.3,
};

const BEAR_HIGH_VOL: RegimeResult = {
  regime: 'bear-high-vol',
  vix_level: 32.1,
  vix_60d_percentile: 0.87,
  spy_ma_50_minus_200: -25.6,
};

const COLD_START_NULL: RegimeResult = {
  regime: 'ALL',
  vix_level: null,
  vix_60d_percentile: null,
  spy_ma_50_minus_200: null,
};

function makeSnapshotRow(id: string, scanned_at: Date) {
  return { id, ticker: 'AAPL', scanned_at };
}
function makeIcRow(id: string, computed_at: Date) {
  return {
    id,
    source_id: 'stocktwits',
    computed_at,
    forward_horizon_days: 7,
    model_version: 'per-source-ic-v1',
  };
}

// Snapshot env state we touch so we can restore.
const ORIGINAL_ENV = {
  CRON_SECRET: process.env.CRON_SECRET,
  BACKFILL_REGIME_DISABLED: process.env.BACKFILL_REGIME_DISABLED,
};

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  delete process.env.BACKFILL_REGIME_DISABLED;

  mockSnapshotFindMany.mockReset();
  mockSnapshotUpdate.mockReset();
  mockIcFindMany.mockReset();
  mockIcUpdate.mockReset();
  mockClassify.mockReset();

  // Default: no rows to process unless a test overrides.
  mockSnapshotFindMany.mockResolvedValue([]);
  mockIcFindMany.mockResolvedValue([]);
  mockSnapshotUpdate.mockResolvedValue({});
  mockIcUpdate.mockResolvedValue({});
});

afterEach(() => {
  // Restore env to whatever the surrounding test runner had.
  if (ORIGINAL_ENV.CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_ENV.CRON_SECRET;
  if (ORIGINAL_ENV.BACKFILL_REGIME_DISABLED === undefined) delete process.env.BACKFILL_REGIME_DISABLED;
  else process.env.BACKFILL_REGIME_DISABLED = ORIGINAL_ENV.BACKFILL_REGIME_DISABLED;
});

describe('/api/cron/backfill-regime — Wave 2 contract (D-10 + D-12)', () => {
  // -------------------------------------------------------------------------
  // Threat T-22-02-01 — Spoofing
  // -------------------------------------------------------------------------
  it('rejects requests without Bearer CRON_SECRET with 401 (T-22-02-01 spoofing defense)', async () => {
    const res = await backfillRegimeHandler(unauthedRequest());
    expect(res.status).toBe(401);
    // No DB activity should have happened.
    expect(mockSnapshotFindMany).not.toHaveBeenCalled();
    expect(mockIcFindMany).not.toHaveBeenCalled();
  });

  it('rejects requests with wrong Bearer token (T-22-02-01)', async () => {
    const req = new Request('http://localhost/api/cron/backfill-regime', {
      method: 'POST',
      headers: { authorization: 'Bearer not-the-secret' },
    });
    const res = await backfillRegimeHandler(req);
    expect(res.status).toBe(401);
    expect(mockSnapshotFindMany).not.toHaveBeenCalled();
  });

  it('accepts valid Bearer CRON_SECRET with 200 (positive auth path)', async () => {
    const res = await backfillRegimeHandler(authedRequest());
    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // D-10: SentimentSnapshot sweep — scanned_at ASC, regime='ALL' filter
  // -------------------------------------------------------------------------
  it('processes SentimentSnapshot rows WHERE regime = "ALL" in scanned_at ASC order (resumable)', async () => {
    const t0 = new Date('2024-01-10T14:00:00Z');
    const t1 = new Date('2024-01-11T14:00:00Z');
    const t2 = new Date('2024-01-12T14:00:00Z');
    mockSnapshotFindMany.mockResolvedValueOnce([
      makeSnapshotRow('snap-1', t0),
      makeSnapshotRow('snap-2', t1),
      makeSnapshotRow('snap-3', t2),
    ]);
    mockClassify.mockResolvedValue(BULL_LOW_VOL);

    const res = await backfillRegimeHandler(authedRequest());
    expect(res.status).toBe(200);

    // findMany invoked with regime='ALL' filter and scanned_at ASC order.
    expect(mockSnapshotFindMany).toHaveBeenCalled();
    const findManyArgs = mockSnapshotFindMany.mock.calls[0]![0] as {
      where: { regime: string };
      orderBy: { scanned_at: 'asc' | 'desc' };
      take: number;
    };
    expect(findManyArgs.where.regime).toBe('ALL');
    expect(findManyArgs.orderBy.scanned_at).toBe('asc');
    expect(typeof findManyArgs.take).toBe('number');
    expect(findManyArgs.take).toBeGreaterThan(0);

    // Classifier was called per row with row.scanned_at as PIT input.
    expect(mockClassify).toHaveBeenCalledTimes(3);
    expect(mockClassify).toHaveBeenNthCalledWith(1, { asOf: t0 });
    expect(mockClassify).toHaveBeenNthCalledWith(2, { asOf: t1 });
    expect(mockClassify).toHaveBeenNthCalledWith(3, { asOf: t2 });
  });

  // -------------------------------------------------------------------------
  // D-10 + Pitfall 4: PerSourceIC sweep — computed_at-keyed
  // -------------------------------------------------------------------------
  it('also processes PerSourceIC rows WHERE regime = "ALL" so source-tier-recompute sees per-regime IC', async () => {
    const ct0 = new Date('2024-02-01T00:00:00Z');
    const ct1 = new Date('2024-02-02T00:00:00Z');
    mockIcFindMany.mockResolvedValueOnce([
      makeIcRow('ic-1', ct0),
      makeIcRow('ic-2', ct1),
    ]);
    mockClassify.mockResolvedValue(BEAR_HIGH_VOL);

    const res = await backfillRegimeHandler(authedRequest());
    expect(res.status).toBe(200);

    // PerSourceIC findMany invoked with regime='ALL' + computed_at ASC.
    expect(mockIcFindMany).toHaveBeenCalled();
    const findManyArgs = mockIcFindMany.mock.calls[0]![0] as {
      where: { regime: string };
      orderBy: { computed_at: 'asc' | 'desc' };
      take: number;
    };
    expect(findManyArgs.where.regime).toBe('ALL');
    expect(findManyArgs.orderBy.computed_at).toBe('asc');

    // Classifier called per IC row with row.computed_at.
    expect(mockClassify).toHaveBeenCalledWith({ asOf: ct0 });
    expect(mockClassify).toHaveBeenCalledWith({ asOf: ct1 });

    // PerSourceIC update was called per row.
    expect(mockIcUpdate).toHaveBeenCalledTimes(2);
    const icPayload = mockIcUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: { regime: string };
    };
    expect(icPayload.where.id).toBe('ic-1');
    expect(icPayload.data.regime).toBe('bear-high-vol');
  });

  // -------------------------------------------------------------------------
  // CORE-ML-08 contract: 4-column write payload on SentimentSnapshot
  // -------------------------------------------------------------------------
  it('writes regime + regime_vix_level + regime_vix_pctile + regime_ma_diff via classifyRegimeAt({asOf: row.scanned_at})', async () => {
    const t = new Date('2024-03-15T14:00:00Z');
    mockSnapshotFindMany.mockResolvedValueOnce([makeSnapshotRow('snap-x', t)]);
    mockClassify.mockResolvedValue(BULL_LOW_VOL);

    await backfillRegimeHandler(authedRequest());

    expect(mockSnapshotUpdate).toHaveBeenCalledOnce();
    const payload = mockSnapshotUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(payload.where.id).toBe('snap-x');
    expect(payload.data).toMatchObject({
      regime: 'bull-low-vol',
      regime_vix_level: 14.5,
      regime_vix_pctile: 0.22,
      regime_ma_diff: 18.3,
    });
  });

  // -------------------------------------------------------------------------
  // D-12 fallback semantics are owned by classifyRegimeAt (verified in Wave 1
  // suites). At THIS layer the backfill cron only sees the result. Asserting
  // that the cron calls the SINGLE classifier (no parallel logic) suffices.
  // -------------------------------------------------------------------------
  it('Yahoo primary failure → Polygon fallback for VIX (^VIX → I:VIX) and SPY (D-12) is delegated to classifyRegimeAt', async () => {
    const t = new Date('2024-04-01T14:00:00Z');
    mockSnapshotFindMany.mockResolvedValueOnce([makeSnapshotRow('snap-fb', t)]);
    // Wave 1 helper resolves a real label via its internal Polygon fallback —
    // the cron sees a non-null result and writes it. We assert the cron
    // delegates (no forked VIX/SPY logic at this layer).
    mockClassify.mockResolvedValue(BEAR_HIGH_VOL);

    await backfillRegimeHandler(authedRequest());

    expect(mockClassify).toHaveBeenCalledExactlyOnceWith({ asOf: t });
    expect(mockSnapshotUpdate).toHaveBeenCalledOnce();
    const data = (mockSnapshotUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.regime).toBe('bear-high-vol');
  });

  // -------------------------------------------------------------------------
  // D-12 dual-provider null semantics: cold-start ('ALL') result → row is
  // logged + skipped (NOT updated). Preserves the WHERE filter so the next
  // pass naturally retries.
  // -------------------------------------------------------------------------
  it('both Yahoo and Polygon NULL → row stays at regime="ALL" with NULL ancillary fields (logged + skipped)', async () => {
    const t = new Date('2024-05-01T14:00:00Z');
    mockSnapshotFindMany.mockResolvedValueOnce([makeSnapshotRow('snap-null', t)]);
    mockClassify.mockResolvedValue(COLD_START_NULL);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await backfillRegimeHandler(authedRequest());
    expect(res.status).toBe(200);

    // No update emitted — row stays at regime='ALL', re-tryable on next pass.
    expect(mockSnapshotUpdate).not.toHaveBeenCalled();

    // Skip was logged (investigation-mode skill: every async boundary logs).
    const logged = logSpy.mock.calls.map((c) => JSON.stringify(c));
    const found = logged.find((line) => line.includes('dual_provider_null'));
    expect(found).toBeDefined();

    logSpy.mockRestore();
  });

  it('PerSourceIC dual-provider null → row stays at regime="ALL" (logged + skipped)', async () => {
    const ct = new Date('2024-05-02T00:00:00Z');
    mockIcFindMany.mockResolvedValueOnce([makeIcRow('ic-null', ct)]);
    mockClassify.mockResolvedValue(COLD_START_NULL);

    await backfillRegimeHandler(authedRequest());

    expect(mockIcUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // D-10 + R2 acceptance: auto-disables after a complete pass.
  // -------------------------------------------------------------------------
  it('auto-disables after a complete pass (BACKFILL_REGIME_DISABLED env-var checkpoint mirrors P27)', async () => {
    // Both findMany return [] → "no rows remain" → set disabled = true.
    mockSnapshotFindMany.mockResolvedValueOnce([]);
    mockIcFindMany.mockResolvedValueOnce([]);

    expect(isRegimeBackfillDisabled()).toBe(false);

    const res = await backfillRegimeHandler(authedRequest());
    expect(res.status).toBe(200);

    // Helper now reports disabled.
    expect(isRegimeBackfillDisabled()).toBe(true);

    // Response body carries the 'complete' status.
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('complete');
  });

  it('honors BACKFILL_REGIME_DISABLED=true → short-circuits with status=disabled, no DB calls', async () => {
    process.env.BACKFILL_REGIME_DISABLED = 'true';

    const res = await backfillRegimeHandler(authedRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('disabled');

    // No DB activity at all.
    expect(mockSnapshotFindMany).not.toHaveBeenCalled();
    expect(mockIcFindMany).not.toHaveBeenCalled();
    expect(mockClassify).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Idempotency — re-running over already-labeled rows is a no-op because the
  // WHERE regime='ALL' filter excludes them.
  // -------------------------------------------------------------------------
  it('is idempotent: re-running with already-labeled rows finds nothing (WHERE filter excludes them)', async () => {
    // findMany returns [] because all rows are already labeled (regime != 'ALL').
    mockSnapshotFindMany.mockResolvedValueOnce([]);
    mockIcFindMany.mockResolvedValueOnce([]);

    const res = await backfillRegimeHandler(authedRequest());
    expect(res.status).toBe(200);

    expect(mockSnapshotUpdate).not.toHaveBeenCalled();
    expect(mockIcUpdate).not.toHaveBeenCalled();
    expect(mockClassify).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Pitfall 6: single classifier call per ROW (not per BATCH wholesale) — but
  // the *per-cycle hoisting* benefit comes from classify caching, not from a
  // separate batched fetch primitive. This wave honors @knowable_at by feeding
  // each row's individual PIT date. We assert the classifier is called with
  // the EXACT row dates (NOT now()).
  // -------------------------------------------------------------------------
  it('uses per-row PIT classification — not a single "now()" call wholesale', async () => {
    const t0 = new Date('2023-06-01T14:00:00Z');
    const t1 = new Date('2023-09-15T14:00:00Z');
    mockSnapshotFindMany.mockResolvedValueOnce([
      makeSnapshotRow('s0', t0),
      makeSnapshotRow('s1', t1),
    ]);
    mockClassify.mockResolvedValue(BULL_LOW_VOL);

    await backfillRegimeHandler(authedRequest());

    const dates = mockClassify.mock.calls.map((c) => (c[0] as { asOf: Date }).asOf);
    expect(dates).toContainEqual(t0);
    expect(dates).toContainEqual(t1);
    // Critical PIT correctness assertion — Pitfall 1 / lookahead bias defense:
    // no classify call used "now()" (a date in the year of the test run).
    for (const d of dates) {
      expect(d.getUTCFullYear()).toBe(2023);
    }
  });

  // -------------------------------------------------------------------------
  // maxDuration export — proves the route file declares the Pro-tier budget
  // per RESEARCH §D. Imported as a module-level constant.
  // -------------------------------------------------------------------------
  it('exports maxDuration: 800s per Pro tier (T-22-02-03 DoS mitigation)', async () => {
    const mod = await import('@/app/api/cron/backfill-regime/route');
    expect((mod as { maxDuration?: number }).maxDuration).toBe(800);
  });

  // -------------------------------------------------------------------------
  // Checkpoint module — read/write/clear API surface owned by Task 1.
  // -------------------------------------------------------------------------
  it('checkpoint helper round-trips snapshot_id + ic_id cursor via env var', async () => {
    const { writeRegimeBackfillCheckpoint, readRegimeBackfillCheckpoint } = await import(
      '@/lib/regime/checkpoint'
    );

    writeRegimeBackfillCheckpoint({ snapshot_id: 'snap-99', ic_id: 'ic-42' });
    expect(readRegimeBackfillCheckpoint()).toEqual({
      snapshot_id: 'snap-99',
      ic_id: 'ic-42',
    });
  });

  it('checkpoint helper returns nulls when env var is unset', () => {
    delete process.env.BACKFILL_REGIME_CHECKPOINT;
    expect(readRegimeBackfillCheckpoint()).toEqual({
      snapshot_id: null,
      ic_id: null,
    });
  });
});
