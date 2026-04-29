// Integration test — proves the sentiment-scan cron now writes a TechnicalSnapshot
// onto every SentimentSnapshot row alongside the existing community_data.
//
// Hits the live DATABASE_URL. Uses a unique throwaway ticker (TEST_PHASE16_SS)
// so production data is untouched. The cron handler is invoked directly via
// import (not via fetch) with a synthetic NextRequest carrying the CRON_SECRET.
//
// vi.mock'd modules:
//   - yahoo-finance2          → deterministic price quote (avoids network flake)
//   - lightweight-community-scan → controllable null/non-null per test
//   - data/technical          → controllable null/non-null per test
//   - ticker-watchlist         → forced to a single test ticker

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import type { TechnicalSnapshot } from '@/lib/types';

// ─── Mocks (must be set BEFORE importing the route handler) ─────────────────

// Stub yahoo-finance2 so the throwaway ticker yields a deterministic price.
vi.mock('yahoo-finance2', () => ({
  default: class {
    quote() {
      return Promise.resolve({ regularMarketPrice: 150 });
    }
  },
}));

// Force the watchlist to our throwaway ticker so the cron only processes one row.
vi.mock('@/lib/data/ticker-watchlist', () => ({
  getCurrentWatchlist: () => ['TEST_PHASE16_SS'],
}));

// Stubs whose return value each test will override via mockResolvedValueOnce.
vi.mock('@/lib/data/lightweight-community-scan', () => ({
  lightweightCommunityScan: vi.fn(),
}));
vi.mock('@/lib/data/technical', () => ({
  computeTechnicalSnapshot: vi.fn(),
}));

const TEST_TICKER = 'TEST_PHASE16_SS';
const HAS_DB = !!process.env.DATABASE_URL;
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron-secret';

async function cleanup() {
  if (!HAS_DB) return;
  const snaps = await prisma.sentimentSnapshot.findMany({ where: { ticker: TEST_TICKER }, select: { id: true } });
  if (snaps.length > 0) {
    await prisma.priceOutcome.deleteMany({ where: { snapshot_id: { in: snaps.map((s) => s.id) } } });
    await prisma.sentimentSnapshot.deleteMany({ where: { ticker: TEST_TICKER } });
  }
}

async function callCron() {
  const { GET } = await import('@/app/api/cron/sentiment-scan/route');
  const req = new NextRequest('http://localhost/api/cron/sentiment-scan', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const res = await GET(req);
  return res.json();
}

// Realistic-ish technical snapshot used as the mock fetch return.
const SAMPLE_TECH: TechnicalSnapshot = {
  rsi_14: 58,
  macd_line: 0.5,
  macd_signal: 0.3,
  macd_histogram: 0.2,
  sma_50: 152,
  sma_200: 140,
  atr_14: 2.1,
  avg_volume_20d: 1_500_000,
  volume_ratio: 1.1,
  trend_regime: 'uptrend',
  momentum_regime: 'neutral',
  cross_state: 'none',
  tech_pattern: 'consolidation',
  bar_count: 252,
  computed_at: new Date().toISOString(),
  data_source: 'yahoo',
};

const SAMPLE_COMMUNITY = {
  quantity: 7,
  quality: 0.55,
  market_cap: 500_000_000_000,
  cap_class: 'large_cap' as const,
  tier_breakdown: { mainstream: 1, middle: 2, niche: 4 },
  highlights: [],
};

describe.skipIf(!HAS_DB)('sentiment-scan writes technical_data alongside community_data', () => {
  beforeEach(async () => {
    await cleanup();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    if (HAS_DB) await prisma.$disconnect();
  });

  it('writes a SentimentSnapshot row with non-null technical_data when both fetches succeed', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
    vi.mocked(lightweightCommunityScan).mockResolvedValueOnce(SAMPLE_COMMUNITY as unknown as Awaited<ReturnType<typeof lightweightCommunityScan>>);
    vi.mocked(computeTechnicalSnapshot).mockResolvedValueOnce(SAMPLE_TECH);

    const result = await callCron();
    expect(result.ok).toBe(true);
    expect(result.scanned).toBe(1);

    const snap = await prisma.sentimentSnapshot.findFirst({
      where: { ticker: TEST_TICKER },
      orderBy: { scanned_at: 'desc' },
    });
    expect(snap).not.toBeNull();
    expect(snap!.community_data).not.toBeNull();
    expect(snap!.technical_data).not.toBeNull();

    const td = snap!.technical_data as unknown as TechnicalSnapshot;
    expect(td.tech_pattern).toBe('consolidation');
    expect(td.bar_count).toBe(252);
    expect(td.rsi_14).toBe(58);
  });

  it('still creates a row when only the technical fetch succeeds (community null)', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
    vi.mocked(lightweightCommunityScan).mockResolvedValueOnce(null);
    vi.mocked(computeTechnicalSnapshot).mockResolvedValueOnce(SAMPLE_TECH);

    const result = await callCron();
    expect(result.scanned).toBe(1);

    const snap = await prisma.sentimentSnapshot.findFirst({
      where: { ticker: TEST_TICKER },
      orderBy: { scanned_at: 'desc' },
    });
    expect(snap).not.toBeNull();
    expect(snap!.technical_data).not.toBeNull();
    // community_data column is non-null at the schema level — coerced to {}
    expect(snap!.community_data).toBeDefined();
  });

  it('still creates a row when only the community fetch succeeds (technical null)', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
    vi.mocked(lightweightCommunityScan).mockResolvedValueOnce(SAMPLE_COMMUNITY as unknown as Awaited<ReturnType<typeof lightweightCommunityScan>>);
    vi.mocked(computeTechnicalSnapshot).mockResolvedValueOnce(null);

    const result = await callCron();
    expect(result.scanned).toBe(1);

    const snap = await prisma.sentimentSnapshot.findFirst({
      where: { ticker: TEST_TICKER },
      orderBy: { scanned_at: 'desc' },
    });
    expect(snap).not.toBeNull();
    expect(snap!.community_data).not.toBeNull();
    expect(snap!.technical_data).toBeNull();
  });

  it('skips the ticker (results.failed++) when BOTH community and technical return null', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
    vi.mocked(lightweightCommunityScan).mockResolvedValueOnce(null);
    vi.mocked(computeTechnicalSnapshot).mockResolvedValueOnce(null);

    const result = await callCron();
    expect(result.scanned).toBe(0);
    expect(result.failed).toBe(1);

    const snap = await prisma.sentimentSnapshot.findFirst({ where: { ticker: TEST_TICKER } });
    expect(snap).toBeNull();
  });
});
