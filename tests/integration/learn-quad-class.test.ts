// Integration test — pins quad-class invariants of the Phase 17-03 learn cron.
//
// Hits the live DATABASE_URL. Uses a unique throwaway ticker (TESTPHASE17LRN)
// and a throwaway cap_class (TESTPHASE17CAP) so production cells are untouched.
//
// vi.mock'd modules:
//   - yahoo-finance2 → deterministic SPY chart (ticker return 10% vs SPY ~0% = hit)
//   - ai (generateText) → stubbed so cycle_summary doesn't hit the network
//
// Invariants pinned:
//   1. One 30d outcome with all 4 sensor data → at least 3 Beta cells upserted
//      (technical, insider, institutional — diffusion may be skipped if insufficient snapshots).
//   2. Cron retry idempotent — same outcome processed twice produces exactly 1 LearningEvent.
//   3. LearningEvent.delta carries diffusion_hit, tech_hit, insider_hit, institutional_hit keys.
//   4. FEATURE_NAMES.length === 12 — D-22 lock invariant.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { FEATURE_NAMES } from '@/lib/learning';

// ─── Mocks (must be set BEFORE importing the route handler) ─────────────────

// Deterministic SPY chart: monotone rise of 0.1% per day → SPY return ≈ 0.1%
// per day over any window. A ticker_return_pct of 10% always classifies as HIT.
vi.mock('yahoo-finance2', () => {
  return {
    default: class {
      chart() {
        const quotes: Array<{ date: Date; close: number }> = [];
        const start = Date.now() - 100 * 24 * 60 * 60 * 1000;
        for (let i = 0; i < 100; i++) {
          quotes.push({
            date: new Date(start + i * 24 * 60 * 60 * 1000),
            close: 100 + i * 0.001,
          });
        }
        return Promise.resolve({ quotes });
      }
    },
  };
});

// Avoid the Anthropic Gateway call for cycle_summary in tests.
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({ text: 'test cycle summary' }),
}));

// ─── Test DB client ──────────────────────────────────────────────────────────

const TEST_TICKER = 'TESTPHASE17LRN';
const TEST_CAP = 'TESTPHASE17CAP';
const HAS_DB = !!process.env.DATABASE_URL;
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron-secret';

async function cleanup() {
  if (!HAS_DB) return;
  await prisma.learningEvent.deleteMany({ where: { ticker: TEST_TICKER } });
  // Delete price outcomes linked to test snapshots
  const snaps = await prisma.sentimentSnapshot.findMany({
    where: { ticker: TEST_TICKER },
    select: { id: true },
  });
  if (snaps.length > 0) {
    await prisma.priceOutcome.deleteMany({
      where: { snapshot_id: { in: snaps.map((s) => s.id) } },
    });
  }
  await prisma.sentimentSnapshot.deleteMany({ where: { ticker: TEST_TICKER } });
  // Clean up test-scoped LearnedPattern cells
  await prisma.learnedPattern.deleteMany({ where: { cap_class: TEST_CAP } });
}

async function callLearnCron() {
  const { GET } = await import('@/app/api/cron/learn/route');
  const req = new NextRequest('http://localhost/api/cron/learn', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const res = await GET(req);
  return res.json();
}

// ─── Fixture helpers ─────────────────────────────────────────────────────────

/**
 * Insert a SentimentSnapshot with all 4 sensor data fields populated,
 * scanned at `daysAgo` days before now. Uses TEST_CAP as cap_class so
 * LearnedPattern cells are scoped to test data.
 */
async function insertSnapshotWithAllData(daysAgo: number) {
  const scannedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return prisma.sentimentSnapshot.create({
    data: {
      ticker: TEST_TICKER,
      scanned_at: scannedAt,
      price_at_scan: 100,
      community_data: {
        quantity: 7,
        quality: 0.55,
        market_cap: 500_000_000_000,
        cap_class: TEST_CAP,
        tier_breakdown: { mainstream: 1, middle: 2, niche: 4 },
        highlights: [],
      },
      technical_data: {
        tech_pattern: 'breakout_uptrend',
        rsi_14: 65,
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
        bar_count: 252,
        computed_at: scannedAt.toISOString(),
        data_source: 'yahoo',
      },
      insider_data: {
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
        computed_at: scannedAt.toISOString(),
        data_source: 'finnhub',
        insider_sentiment_mspr: 0.4,
      },
      institutional_data: {
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
        computed_at: scannedAt.toISOString(),
        data_source: 'finnhub',
      },
    },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)('Phase 17 — learn cron quad-class', () => {
  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    if (HAS_DB) await prisma.$disconnect();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  it('upserts at least 3 LearnedPattern rows (technical + insider + institutional) on a resolved outcome at horizon=30', { timeout: 60_000 }, async () => {
    // 1. Insert a snapshot scanned 31 days ago (so a 30d outcome falls within the window).
    const snap = await insertSnapshotWithAllData(31);

    // 2. Insert a PriceOutcome at days_after=30 — ticker +10% vs SPY ~0% = HIT.
    await prisma.priceOutcome.create({
      data: {
        snapshot_id: snap.id,
        recorded_at: new Date(),
        days_after: 30,
        price: 110,
        pct_change: 10,
      },
    });

    // 3. Run the learn cron.
    const result = await callLearnCron();
    expect(result.ok).toBe(true);

    // 4. Assert LearnedPattern rows for technical, insider, institutional.
    //    diffusion may be skipped (single snapshot — buildTraceForOutcome requires ≥2).
    const rows = await prisma.learnedPattern.findMany({
      where: {
        cap_class: TEST_CAP,
        horizon_days: 30,
        signal_class: { in: ['technical', 'insider', 'institutional'] },
      },
    });
    const classes = new Set(rows.map((r) => r.signal_class));
    expect(classes.has('technical')).toBe(true);
    expect(classes.has('insider')).toBe(true);
    expect(classes.has('institutional')).toBe(true);

    // Each cell must have sample_size ≥ 1 after one outcome.
    for (const r of rows) {
      expect(r.sample_size).toBeGreaterThanOrEqual(1);
    }
  });

  it('is idempotent: same outcome processed twice produces exactly ONE LearningEvent', async () => {
    // The prior test already ran the cron once. Run it again.
    const resultB = await callLearnCron();
    expect(resultB.ok).toBe(true);

    // Count LearningEvents for the test ticker. The dedup key is outcome_id;
    // the second run's loadUnprocessedOutcomes filters out already-processed outcomes.
    const count = await prisma.learningEvent.count({
      where: {
        ticker: TEST_TICKER,
        event_type: 'posterior_update',
      },
    });
    expect(count).toBe(1);
  });

  it('LearningEvent.delta carries diffusion_hit, tech_hit, insider_hit, institutional_hit keys', async () => {
    const ev = await prisma.learningEvent.findFirst({
      where: { ticker: TEST_TICKER, event_type: 'posterior_update' },
    });
    expect(ev).not.toBeNull();
    const d = ev!.delta as Record<string, unknown>;
    // All 4 hit keys must be present (each may be true/false/null depending on
    // whether that class had data at the time of the outcome).
    expect(d).toHaveProperty('diffusion_hit');
    expect(d).toHaveProperty('tech_hit');
    expect(d).toHaveProperty('insider_hit');
    expect(d).toHaveProperty('institutional_hit');
    // tech_hit, insider_hit, institutional_hit must be boolean (not null) because
    // the snapshot had all 3 classes populated.
    expect(typeof d.tech_hit).toBe('boolean');
    expect(typeof d.insider_hit).toBe('boolean');
    expect(typeof d.institutional_hit).toBe('boolean');
  });

  it('FEATURE_NAMES.length === 12 — D-22 lock: logistic stays 12-d, NOT extended for insider/institutional', async () => {
    // Direct assertion on the exported constant.
    expect(FEATURE_NAMES.length).toBe(12);

    // The most recent LogisticEpoch should have 12 named coefficients + intercept.
    const epoch = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
    // epoch may not exist if the prior test's outcome had no 30d trace+techSnap
    // combination that triggers the logistic gate — that's valid; D-22 is still
    // asserted via FEATURE_NAMES.length above. If it does exist, verify shape.
    if (epoch) {
      const coeffs = epoch.coefficients as Record<string, unknown>;
      const namedCount = Object.keys(coeffs).filter((k) => k !== '_intercept').length;
      expect(namedCount).toBe(12);
    }
  });
});
