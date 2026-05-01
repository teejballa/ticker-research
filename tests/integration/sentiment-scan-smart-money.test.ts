// Integration test — proves the sentiment-scan cron now writes insider_data and
// institutional_data on every SentimentSnapshot row (Phase 17-03).
//
// Hits the live DATABASE_URL. Uses a unique throwaway ticker (TESTPHASE17SCAN)
// so production data is untouched.
//
// vi.mock'd modules:
//   - yahoo-finance2                   → deterministic price quote
//   - lightweight-community-scan       → controllable null/non-null per test
//   - data/technical                   → controllable null/non-null per test
//   - data/insider                     → controllable null/non-null per test
//   - data/institutional               → controllable null/non-null per test
//   - ticker-watchlist                 → forced to a single test ticker

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import type { InsiderSnapshot, InstitutionalSnapshot } from '@/lib/types';

// ─── Mocks (must be set BEFORE importing the route handler) ─────────────────

vi.mock('yahoo-finance2', () => ({
  default: class {
    quote() {
      return Promise.resolve({ regularMarketPrice: 150 });
    }
  },
}));

vi.mock('@/lib/data/ticker-watchlist', () => ({
  getCurrentWatchlist: () => ['TESTPHASE17SCAN'],
}));

vi.mock('@/lib/data/lightweight-community-scan', () => ({
  lightweightCommunityScan: vi.fn(),
}));
vi.mock('@/lib/data/technical', () => ({
  computeTechnicalSnapshot: vi.fn(),
}));
vi.mock('@/lib/data/insider', () => ({
  fetchInsiderData: vi.fn(),
}));
vi.mock('@/lib/data/institutional', () => ({
  fetchInstitutionalData: vi.fn(),
}));

// ─── Test DB client ──────────────────────────────────────────────────────────

const TEST_TICKER = 'TESTPHASE17SCAN';
const HAS_DB = !!process.env.DATABASE_URL;
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron-secret';

async function cleanup() {
  if (!HAS_DB) return;
  const snaps = await prisma.sentimentSnapshot.findMany({
    where: { ticker: TEST_TICKER },
    select: { id: true },
  });
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

// ─── Sample fixtures ─────────────────────────────────────────────────────────

const SAMPLE_COMMUNITY = {
  quantity: 7,
  quality: 0.55,
  market_cap: 500_000_000_000,
  cap_class: 'large_cap' as const,
  tier_breakdown: { mainstream: 1, middle: 2, niche: 4 },
  highlights: [],
};

const SAMPLE_TECHNICAL = {
  rsi_14: 60,
  macd_line: 0.4,
  macd_signal: 0.2,
  macd_histogram: 0.2,
  sma_50: 148,
  sma_200: 135,
  atr_14: 1.8,
  avg_volume_20d: 2_000_000,
  volume_ratio: 1.2,
  trend_regime: 'uptrend' as const,
  momentum_regime: 'neutral' as const,
  cross_state: 'none' as const,
  tech_pattern: 'breakout_uptrend' as const,
  bar_count: 252,
  computed_at: new Date().toISOString(),
  data_source: 'yahoo' as const,
};

const SAMPLE_INSIDER: InsiderSnapshot = {
  insider_bucket: 'cluster_buying',
  distinct_buyers: 4,
  distinct_sellers: 0,
  net_buy_share_count: 100000,
  net_sell_share_count: 0,
  buy_value_usd: 1000000,
  sell_value_usd: null,
  has_ceo_buy: true,
  has_cfo_buy: false,
  has_director_buy: true,
  is_planned_10b5_1: false,
  filings_count: 4,
  earliest_filing_date: '2026-04-01',
  latest_filing_date: '2026-04-25',
  data_age_days: 5,
  computed_at: new Date().toISOString(),
  data_source: 'finnhub',
  insider_sentiment_mspr: 0.4,
};

const SAMPLE_INSTITUTIONAL: InstitutionalSnapshot = {
  institutional_bucket: 'net_accumulation',
  total_institutional_share: 1000000,
  total_institutional_share_prev: 950000,
  net_share_change: 50000,
  net_share_change_pct: 0.0526,
  fund_count_current: 100,
  fund_count_prev: 95,
  fund_count_delta: 5,
  top10_concentration_pct: 0.30,
  top10_concentration_pct_prev: 0.28,
  ticker_30d_return_pct: 5.0,
  spy_30d_return_pct: 2.0,
  report_date: '2026-03-31',
  filing_date: '2026-04-15',
  data_age_days: 15,
  computed_at: new Date().toISOString(),
  data_source: 'finnhub',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)('Phase 17 — sentiment-scan writes smart-money columns', () => {
  beforeEach(async () => {
    await cleanup();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    if (HAS_DB) await prisma.$disconnect();
  });

  it('writes both insider_data and institutional_data when both fetchers succeed', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
    const { fetchInsiderData } = await import('@/lib/data/insider');
    const { fetchInstitutionalData } = await import('@/lib/data/institutional');

    vi.mocked(lightweightCommunityScan).mockResolvedValueOnce(
      SAMPLE_COMMUNITY as unknown as Awaited<ReturnType<typeof lightweightCommunityScan>>,
    );
    vi.mocked(computeTechnicalSnapshot).mockResolvedValueOnce(SAMPLE_TECHNICAL);
    vi.mocked(fetchInsiderData).mockResolvedValueOnce(SAMPLE_INSIDER);
    vi.mocked(fetchInstitutionalData).mockResolvedValueOnce(SAMPLE_INSTITUTIONAL);

    const result = await callCron();
    expect(result.ok).toBe(true);
    expect(result.scanned).toBe(1);

    const row = await prisma.sentimentSnapshot.findFirst({
      where: { ticker: TEST_TICKER },
      orderBy: { scanned_at: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row!.insider_data).not.toBeNull();
    expect((row!.insider_data as { insider_bucket: string }).insider_bucket).toBe('cluster_buying');
    expect(row!.institutional_data).not.toBeNull();
    expect(
      (row!.institutional_data as { institutional_bucket: string }).institutional_bucket,
    ).toBe('net_accumulation');
  });

  it('writes insider_data populated and institutional_data null on asymmetric coverage', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
    const { fetchInsiderData } = await import('@/lib/data/insider');
    const { fetchInstitutionalData } = await import('@/lib/data/institutional');

    vi.mocked(lightweightCommunityScan).mockResolvedValueOnce(
      SAMPLE_COMMUNITY as unknown as Awaited<ReturnType<typeof lightweightCommunityScan>>,
    );
    vi.mocked(computeTechnicalSnapshot).mockResolvedValueOnce(SAMPLE_TECHNICAL);
    vi.mocked(fetchInsiderData).mockResolvedValueOnce(SAMPLE_INSIDER);
    vi.mocked(fetchInstitutionalData).mockResolvedValueOnce(null);

    const result = await callCron();
    expect(result.scanned).toBe(1);

    const row = await prisma.sentimentSnapshot.findFirst({
      where: { ticker: TEST_TICKER },
      orderBy: { scanned_at: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row!.insider_data).not.toBeNull();
    expect((row!.insider_data as { insider_bucket: string }).insider_bucket).toBe('cluster_buying');
    // D-19: Prisma.JsonNull reads back as JS null
    expect(row!.institutional_data).toBeNull();
  });

  it('writes both columns null via Prisma.JsonNull when both new fetchers return null', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
    const { fetchInsiderData } = await import('@/lib/data/insider');
    const { fetchInstitutionalData } = await import('@/lib/data/institutional');

    vi.mocked(lightweightCommunityScan).mockResolvedValueOnce(
      SAMPLE_COMMUNITY as unknown as Awaited<ReturnType<typeof lightweightCommunityScan>>,
    );
    vi.mocked(computeTechnicalSnapshot).mockResolvedValueOnce(SAMPLE_TECHNICAL);
    vi.mocked(fetchInsiderData).mockResolvedValueOnce(null);
    vi.mocked(fetchInstitutionalData).mockResolvedValueOnce(null);

    const result = await callCron();
    expect(result.scanned).toBe(1);

    const row = await prisma.sentimentSnapshot.findFirst({
      where: { ticker: TEST_TICKER },
      orderBy: { scanned_at: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row!.insider_data).toBeNull();
    expect(row!.institutional_data).toBeNull();
  });

  it('does NOT create snapshot when all 4 fetchers return null', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
    const { fetchInsiderData } = await import('@/lib/data/insider');
    const { fetchInstitutionalData } = await import('@/lib/data/institutional');

    vi.mocked(lightweightCommunityScan).mockResolvedValueOnce(null);
    vi.mocked(computeTechnicalSnapshot).mockResolvedValueOnce(null);
    vi.mocked(fetchInsiderData).mockResolvedValueOnce(null);
    vi.mocked(fetchInstitutionalData).mockResolvedValueOnce(null);

    const result = await callCron();
    expect(result.scanned).toBe(0);
    expect(result.failed).toBe(1);

    const row = await prisma.sentimentSnapshot.findFirst({ where: { ticker: TEST_TICKER } });
    expect(row).toBeNull();
  });
});
