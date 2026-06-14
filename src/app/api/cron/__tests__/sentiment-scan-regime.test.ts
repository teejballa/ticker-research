/**
 * Phase 22 Wave 1 — sentiment-scan regime-write contract test.
 *
 * Covers: CORE-ML-08 (sentiment-scan writes regime at scan time).
 * Turns Wave 0 RED stub GREEN by:
 *   1. Mocking @/lib/regime/classify (the SINGLE classifier path) to return a
 *      known regime + audit numerics.
 *   2. Mocking @/lib/db so prisma.sentimentSnapshot.create is observable as a
 *      spy without touching Neon.
 *   3. Calling classifyRegimeAndPersistForScan directly and asserting the
 *      payload threads the regime + 3 audit columns through verbatim.
 *
 * Why direct-helper calls (and not GET-handler invocation):
 *   - The cron GET handler does ~120 lines of work per ticker (Phase 30 breaker,
 *     Phase 20 SentimentObservation writer, Phase 20-C-03 Cresci scoring, etc.).
 *   - Mocking that surface to assert one INSERT payload is the wrong scope.
 *   - classifyRegimeAndPersistForScan is the EXTRACTED unit under test;
 *     integration of the full cron cycle is covered by RUN_LIVE_INTEGRATION
 *     suites in later waves.
 *
 * Idempotency note: re-running on the same scanned_at preserves @@unique([ticker,
 * scanned_at]) semantics. Wave 0 schema migration kept that constraint; only
 * Wave 5 (D-11 step 4) flips a different constraint (LearnedPattern.regime),
 * never the SentimentSnapshot one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @/lib/db BEFORE importing the route — the route imports `prisma` at the
// top so the mock must be installed before the route module is loaded.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    sentimentSnapshot: {
      create: mockCreate,
    },
  },
}));

// Mock the regime classifier so test can drive the result directly.
const { mockClassify } = vi.hoisted(() => ({ mockClassify: vi.fn() }));
vi.mock('@/lib/regime/classify', () => ({
  classifyRegimeAt: mockClassify,
}));

import { classifyRegimeAndPersistForScan } from '@/app/api/cron/sentiment-scan/persist';
import { Prisma } from '@prisma/client';
import type { RegimeResult } from '@/lib/regime/classify';

const scanned_at = new Date('2024-06-01T14:30:00Z');

const BULL_LOW_VOL: RegimeResult = {
  regime: 'bull-low-vol',
  vix_level: 14.5,
  vix_60d_percentile: 0.22,
  spy_ma_50_minus_200: 18.3,
};

const COLD_START_ALL: RegimeResult = {
  regime: 'ALL',
  vix_level: null,
  vix_60d_percentile: null,
  spy_ma_50_minus_200: null,
};

describe('classifyRegimeAndPersistForScan — CORE-ML-08 contract', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockClassify.mockReset();
    mockCreate.mockResolvedValue({ id: 'snap-test' });
  });

  it('writes regime + regime_vix_level + regime_vix_pctile + regime_ma_diff on the snapshot payload', async () => {
    await classifyRegimeAndPersistForScan({
      ticker: 'AAPL',
      scanned_at,
      price_at_scan: 195.5,
      community_data: {} as Prisma.InputJsonValue,
      technical_data: Prisma.JsonNull,
      insider_data: Prisma.JsonNull,
      institutional_data: Prisma.JsonNull,
      regimeResult: BULL_LOW_VOL,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const payload = mockCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(payload.data).toMatchObject({
      ticker: 'AAPL',
      scanned_at,
      price_at_scan: 195.5,
      regime: 'bull-low-vol',
      regime_vix_level: 14.5,
      regime_vix_pctile: 0.22,
      regime_ma_diff: 18.3,
    });
  });

  it('writes regime="ALL" with null audit fields on cold-start (D-09 step 3)', async () => {
    await classifyRegimeAndPersistForScan({
      ticker: 'NVDA',
      scanned_at,
      price_at_scan: 800,
      community_data: {} as Prisma.InputJsonValue,
      technical_data: Prisma.JsonNull,
      insider_data: Prisma.JsonNull,
      institutional_data: Prisma.JsonNull,
      regimeResult: COLD_START_ALL,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const payload = mockCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(payload.data.regime).toBe('ALL');
    expect(payload.data.regime_vix_level).toBeNull();
    expect(payload.data.regime_vix_pctile).toBeNull();
    expect(payload.data.regime_ma_diff).toBeNull();
  });

  it('preserves the existing payload fields untouched alongside the regime columns', async () => {
    const communityBlob = { stocktwits: { bull_percent: 60 } } as unknown as Prisma.InputJsonValue;
    const technicalBlob = { rsi_14: 55 } as unknown as Prisma.InputJsonValue;
    await classifyRegimeAndPersistForScan({
      ticker: 'TSLA',
      scanned_at,
      price_at_scan: 200,
      community_data: communityBlob,
      technical_data: technicalBlob,
      insider_data: Prisma.JsonNull,
      institutional_data: Prisma.JsonNull,
      regimeResult: BULL_LOW_VOL,
    });

    const payload = mockCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(payload.data.community_data).toEqual({ stocktwits: { bull_percent: 60 } });
    expect(payload.data.technical_data).toEqual({ rsi_14: 55 });
  });

  it('does not change the @@unique([ticker, scanned_at]) semantics — uses create (not upsert)', async () => {
    await classifyRegimeAndPersistForScan({
      ticker: 'MSFT',
      scanned_at,
      price_at_scan: 420,
      community_data: {} as Prisma.InputJsonValue,
      technical_data: Prisma.JsonNull,
      insider_data: Prisma.JsonNull,
      institutional_data: Prisma.JsonNull,
      regimeResult: BULL_LOW_VOL,
    });
    // create() is what the existing cron uses; re-scan within 2d is gated upstream
    // by the recent-snapshot check (route.ts L56). Asserting create-not-upsert
    // proves we didn't accidentally widen the surface.
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('persisted regime is a member of the 5-value RegimeLabel union', async () => {
    const VALID_LABELS = new Set([
      'bull-low-vol',
      'bull-high-vol',
      'bear-low-vol',
      'bear-high-vol',
      'ALL',
    ]);
    for (const label of VALID_LABELS) {
      mockCreate.mockClear();
      await classifyRegimeAndPersistForScan({
        ticker: 'AAPL',
        scanned_at,
        price_at_scan: 100,
        community_data: {} as Prisma.InputJsonValue,
        technical_data: Prisma.JsonNull,
        insider_data: Prisma.JsonNull,
        institutional_data: Prisma.JsonNull,
        regimeResult: { ...BULL_LOW_VOL, regime: label as RegimeResult['regime'] },
      });
      const payload = mockCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
      expect(VALID_LABELS.has(payload.data.regime as string)).toBe(true);
    }
  });

  it('PIT-correct: the regime persisted on the row matches the regimeResult passed in (no re-classification)', async () => {
    // The helper MUST NOT call classifyRegimeAt itself — that's the GET handler's
    // job (one classify per cron cycle, not one per ticker). The mock proves the
    // helper consumed `regimeResult` verbatim and did not re-derive anything.
    await classifyRegimeAndPersistForScan({
      ticker: 'AMZN',
      scanned_at,
      price_at_scan: 130,
      community_data: {} as Prisma.InputJsonValue,
      technical_data: Prisma.JsonNull,
      insider_data: Prisma.JsonNull,
      institutional_data: Prisma.JsonNull,
      regimeResult: BULL_LOW_VOL,
    });
    expect(mockClassify).not.toHaveBeenCalled();
  });
});
