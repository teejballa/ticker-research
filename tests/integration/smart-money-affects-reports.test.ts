// tests/integration/smart-money-affects-reports.test.ts
// Phase 17-05 — End-to-end live-DB test analog of technical-affects-reports.test.ts
// for the two new smart money signal classes. Pins acceptance criteria AC2 + AC5:
//
//   AC2 — bumping a LearnedPattern (signal_class='institutional' OR 'insider') seed
//         changes the next getEngineContextForTicker() call's institutional_posterior_mean
//         / insider_posterior_mean by >0.05.
//
//   AC5 — buildSystemPrompt for a ticker with both smart money patterns seeded
//         contains the substring '30' (in days/d context) AND at least one
//         InstitutionalPattern label AND at least one InsiderPattern label.
//
// Five tests:
//   1. Cold read → institutional_status NO_DATA, insider_status NO_DATA, horizon_calibrations length 6.
//   2. Seeded ACTIVE — institutional → institutional fields populate.
//   3. Bumped seed shifts institutional posterior >0.05 (AC2 — institutional class).
//   4. Bumped seed shifts insider posterior >0.05 (AC2 — insider class).
//   5. buildSystemPrompt regex (AC5).

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

const TEST_TICKER = 'CIPHRSMRT';
const INST_PATTERN = 'cluster_buying';          // representative InstitutionalPattern bucket
const INSIDER_PATTERN = 'smart_money_concentration'; // representative InsiderPattern bucket
const CAP = 'large_cap';
const PRIMARY_HORIZON = 30;
const ALL_HORIZONS = [3, 7, 14, 30, 60, 90] as const;

const HAS_DB = !!process.env.DATABASE_URL;
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb('smart money state changes flow into report engine_calibration', () => {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  async function cleanup() {
    await prisma.learnedPattern.deleteMany({
      where: {
        OR: [
          { signal_class: 'institutional', pattern_key: INST_PATTERN, cap_class: CAP },
          { signal_class: 'insider', pattern_key: INSIDER_PATTERN, cap_class: CAP },
        ],
      },
    });
    await prisma.sentimentSnapshot.deleteMany({ where: { ticker: TEST_TICKER } });
  }

  beforeAll(async () => { await cleanup(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('cold read → institutional_status NO_DATA, insider_status NO_DATA, horizon_calibrations always length 6', async () => {
    const { getEngineContextForTicker } = await import('@/lib/engine-context');

    // Seed two snapshots that include institutional_data + insider_data shapes.
    const baseAt = new Date('2026-04-23T12:00:00Z');
    await prisma.sentimentSnapshot.createMany({
      data: [
        {
          ticker: TEST_TICKER,
          scanned_at: baseAt,
          price_at_scan: 100,
          community_data: {
            quantity: 5,
            quality: 0.4,
            market_cap: 800_000_000_000,
            cap_class: CAP,
            tier_breakdown: { mainstream: 0, middle: 1, niche: 4 },
          },
          institutional_data: {
            institutional_bucket: INST_PATTERN,
            total_institutional_share: 0.65,
            total_institutional_share_prev: 0.60,
            net_share_change: 0.05,
            net_share_change_pct: 8.3,
            fund_count_current: 120,
            fund_count_prev: 115,
            fund_count_delta: 5,
            top10_concentration_pct: 0.42,
            top10_concentration_pct_prev: 0.40,
            ticker_30d_return_pct: 5.2,
            spy_30d_return_pct: 2.1,
            report_date: '2026-03-31',
            filing_date: '2026-04-15',
            data_age_days: 8,
            computed_at: baseAt.toISOString(),
            data_source: 'finnhub',
          },
          insider_data: {
            insider_bucket: INSIDER_PATTERN,
            distinct_buyers: 3,
            distinct_sellers: 1,
            net_buy_share_count: 50000,
            net_sell_share_count: 10000,
            buy_value_usd: 500000,
            sell_value_usd: 80000,
            has_ceo_buy: true,
            has_cfo_buy: false,
            has_director_buy: true,
            is_planned_10b5_1: false,
            filings_count: 4,
            earliest_filing_date: '2026-03-15',
            latest_filing_date: '2026-04-10',
            data_age_days: 13,
            computed_at: baseAt.toISOString(),
            data_source: 'finnhub',
            insider_sentiment_mspr: 0.35,
          },
        },
        {
          ticker: TEST_TICKER,
          scanned_at: new Date(baseAt.getTime() + 86400_000),
          price_at_scan: 102,
          community_data: {
            quantity: 12,
            quality: 0.6,
            market_cap: 800_000_000_000,
            cap_class: CAP,
            tier_breakdown: { mainstream: 0, middle: 4, niche: 8 },
          },
          institutional_data: {
            institutional_bucket: INST_PATTERN,
            total_institutional_share: 0.66,
            total_institutional_share_prev: 0.60,
            net_share_change: 0.06,
            net_share_change_pct: 10.0,
            fund_count_current: 122,
            fund_count_prev: 115,
            fund_count_delta: 7,
            top10_concentration_pct: 0.43,
            top10_concentration_pct_prev: 0.40,
            ticker_30d_return_pct: 5.5,
            spy_30d_return_pct: 2.0,
            report_date: '2026-03-31',
            filing_date: '2026-04-16',
            data_age_days: 7,
            computed_at: new Date(baseAt.getTime() + 86400_000).toISOString(),
            data_source: 'finnhub',
          },
          insider_data: {
            insider_bucket: INSIDER_PATTERN,
            distinct_buyers: 4,
            distinct_sellers: 1,
            net_buy_share_count: 60000,
            net_sell_share_count: 5000,
            buy_value_usd: 650000,
            sell_value_usd: 40000,
            has_ceo_buy: true,
            has_cfo_buy: true,
            has_director_buy: true,
            is_planned_10b5_1: false,
            filings_count: 5,
            earliest_filing_date: '2026-03-20',
            latest_filing_date: '2026-04-11',
            data_age_days: 12,
            computed_at: new Date(baseAt.getTime() + 86400_000).toISOString(),
            data_source: 'finnhub',
            insider_sentiment_mspr: 0.40,
          },
        },
      ],
    });

    const cold = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T00:00:00Z'));
    expect(cold.institutional_status).toBe('NO_DATA');
    expect(cold.institutional_posterior_mean).toBeNull();
    expect(cold.insider_status).toBe('NO_DATA');
    expect(cold.insider_posterior_mean).toBeNull();
    expect(cold.horizon_calibrations.length).toBe(6);
    expect(cold.horizon_calibrations.map((h) => h.horizon_days).sort((a, b) => a - b)).toEqual([
      ...ALL_HORIZONS,
    ]);
  });

  it('after seeding institutional LearnedPattern, institutional fields populate (AC2 — seeded read)', async () => {
    await prisma.learnedPattern.create({
      data: {
        signal_class: 'institutional',
        pattern_key: INST_PATTERN,
        cap_class: CAP,
        horizon_days: PRIMARY_HORIZON,
        alpha: 12,
        beta: 4,
        sample_size: 16,
        hits: 12,
        alpha_30d: 12,
        beta_30d: 4,
        brier_in_sample: 0.18,
        brier_out_sample: 0.20,
        brier_null: 0.25,
        drift_z: 0.5,
        status: 'ACTIVE',
      },
    });

    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    const seeded = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T01:00:00Z'));
    expect(seeded.institutional_pattern).toBe(INST_PATTERN);
    expect(seeded.institutional_status).toBe('ACTIVE');
    expect(seeded.institutional_posterior_mean).not.toBeNull();
    expect(seeded.institutional_posterior_mean!).toBeGreaterThan(0.6);
    expect(seeded.institutional_posterior_mean!).toBeLessThan(0.85);
    expect(seeded.institutional_sample_size).toBe(16);
  });

  it('bumping the institutional seed (alpha 12→60) shifts posterior >0.05 (AC2 — institutional class)', async () => {
    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    const before = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T02:00:00Z'));

    await prisma.learnedPattern.update({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'institutional',
          pattern_key: INST_PATTERN,
          cap_class: CAP,
          horizon_days: PRIMARY_HORIZON,
        },
      },
      data: { alpha: 60, beta: 6, sample_size: 66, hits: 60 },
    });

    const after = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T03:00:00Z'));
    expect(after.institutional_sample_size).toBe(66);
    expect(after.institutional_posterior_mean).not.toBeNull();
    expect(before.institutional_posterior_mean).not.toBeNull();
    expect(
      Math.abs((after.institutional_posterior_mean ?? 0) - (before.institutional_posterior_mean ?? 0)),
    ).toBeGreaterThan(0.05);
  });

  it('bumping the insider seed (alpha 12→60) shifts posterior >0.05 (AC2 — insider class)', async () => {
    // Insert the insider LearnedPattern row, capture before, bump, capture after.
    await prisma.learnedPattern.create({
      data: {
        signal_class: 'insider',
        pattern_key: INSIDER_PATTERN,
        cap_class: CAP,
        horizon_days: PRIMARY_HORIZON,
        alpha: 12,
        beta: 4,
        sample_size: 16,
        hits: 12,
        alpha_30d: 12,
        beta_30d: 4,
        brier_in_sample: 0.18,
        brier_out_sample: 0.20,
        brier_null: 0.25,
        drift_z: 0.5,
        status: 'ACTIVE',
      },
    });

    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    const before = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T04:00:00Z'));

    await prisma.learnedPattern.update({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'insider',
          pattern_key: INSIDER_PATTERN,
          cap_class: CAP,
          horizon_days: PRIMARY_HORIZON,
        },
      },
      data: { alpha: 60, beta: 6, sample_size: 66, hits: 60 },
    });

    const after = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T05:00:00Z'));
    expect(after.insider_sample_size).toBe(66);
    expect(after.insider_posterior_mean).not.toBeNull();
    expect(before.insider_posterior_mean).not.toBeNull();
    expect(
      Math.abs((after.insider_posterior_mean ?? 0) - (before.insider_posterior_mean ?? 0)),
    ).toBeGreaterThan(0.05);
  });

  it('buildSystemPrompt references 30d AND an InstitutionalPattern label AND an InsiderPattern label (AC5)', async () => {
    const { buildSystemPrompt } = await import('@/lib/gemini-analysis');
    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    const ctx = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T06:00:00Z'));
    const prompt = buildSystemPrompt(ctx);

    // (a) references the 30-day horizon
    expect(prompt).toMatch(/30\s*d|30\s*day/i);

    // (b) mentions at least one InstitutionalPattern label (bucket names or display labels)
    expect(prompt.toLowerCase()).toMatch(
      /cluster_buying|distribution_phase|accumulation_phase|institutional_outflow|fund_rotation|consensus_buy|consensus_sell|smart_money_concentration|net_accumulation|net_distribution|new_initiation|complete_exit|smart_money_dispersion|contrarian_inflow|contrarian_outflow/,
    );

    // (c) mentions at least one InsiderPattern label
    expect(prompt.toLowerCase()).toMatch(
      /smart_money_concentration|insider_cluster_buy|insider_cluster_sell|c_suite_buy|10b5_1_plan|opportunistic_buy|opportunistic_sell|silent_period|net_buy_cluster|lone_buy|lone_sell|planned_sell_10b5_1/,
    );
  });
});
