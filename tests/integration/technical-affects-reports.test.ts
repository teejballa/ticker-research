// tests/integration/technical-affects-reports.test.ts
// Phase 16-05 — End-to-end live-DB test analog of engine-affects-reports.test.ts
// for the technical signal class. Pins acceptance criteria AC2 + AC5:
//
//   AC2 — bumping a LearnedPattern (signal_class='technical') seed changes
//         the next getEngineContextForTicker() call's technical_posterior_mean
//         by >0.05.
//
//   AC5 — Gemini's system prompt for a ticker with technical_pattern set
//         contains the substring `30` (in days/d context) AND at least one
//         TechPattern label from the 8-bucket display set.
//
// Five tests:
//   1. Cold read → technical_status NO_DATA, horizon_calibrations always 6.
//   2. Seeded ACTIVE → technical fields populate.
//   3. Bumped seed → posterior shifts >0.05 (AC2).
//   4. Both diffusion + technical seeded high → agreement === 'aligned'.
//   5. buildSystemPrompt regex (AC5).

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

const TEST_TICKER = 'CIPHRTECH';
const TECH_PATTERN = 'breakout_uptrend';
const FLOW_PATTERN = 'niche_leads';
const CAP = 'large_cap';
const PRIMARY_HORIZON = 30;
// Other horizons we touch so engine-context's horizon_calibrations array always
// returns the locked length-6 shape regardless of which row is seeded.
const ALL_HORIZONS = [3, 7, 14, 30, 60, 90] as const;

const HAS_DB = !!process.env.DATABASE_URL;
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb('technical state changes flow into report engine_calibration', () => {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  async function cleanup() {
    await prisma.learnedPattern.deleteMany({
      where: {
        OR: [
          { signal_class: 'technical', pattern_key: TECH_PATTERN, cap_class: CAP },
          { signal_class: 'diffusion', pattern_key: FLOW_PATTERN, cap_class: CAP },
        ],
      },
    });
    await prisma.sentimentSnapshot.deleteMany({ where: { ticker: TEST_TICKER } });
  }

  beforeAll(async () => { await cleanup(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('cold read → technical_status NO_DATA, horizon_calibrations always length 6', async () => {
    const { getEngineContextForTicker } = await import('@/lib/engine-context');

    // Seed two snapshots that include technical_data → tech_pattern='breakout_uptrend'
    const baseAt = new Date('2026-04-23T12:00:00Z');
    await prisma.sentimentSnapshot.createMany({ data: [
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
        technical_data: {
          tech_pattern: TECH_PATTERN,
          rsi_14: 65,
          macd_line: 0.5,
          macd_signal: 0.3,
          macd_histogram: 0.2,
          sma_50: 95,
          sma_200: 90,
          atr_14: 1.2,
          avg_volume_20d: 1_000_000,
          volume_ratio: 1.8,
          trend_regime: 'uptrend',
          momentum_regime: 'neutral',
          cross_state: 'none',
          bar_count: 250,
          computed_at: baseAt.toISOString(),
          data_source: 'yahoo',
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
        technical_data: {
          tech_pattern: TECH_PATTERN,
          rsi_14: 68,
          macd_line: 0.6,
          macd_signal: 0.35,
          macd_histogram: 0.25,
          sma_50: 95.5,
          sma_200: 90.5,
          atr_14: 1.3,
          avg_volume_20d: 1_000_000,
          volume_ratio: 1.9,
          trend_regime: 'uptrend',
          momentum_regime: 'neutral',
          cross_state: 'none',
          bar_count: 251,
          computed_at: new Date(baseAt.getTime() + 86400_000).toISOString(),
          data_source: 'yahoo',
        },
      },
    ]});

    const cold = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T00:00:00Z'));
    expect(cold.technical_status).toBe('NO_DATA');
    expect(cold.technical_posterior_mean).toBeNull();
    expect(cold.horizon_calibrations.length).toBe(6);
    expect(cold.horizon_calibrations.map((h) => h.horizon_days).sort((a, b) => a - b)).toEqual([
      ...ALL_HORIZONS,
    ]);
  });

  it('after seeding technical LearnedPattern, technical fields populate (AC2 — seeded read)', async () => {
    await prisma.learnedPattern.create({ data: {
      signal_class: 'technical',
      pattern_key: TECH_PATTERN,
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
    }});

    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    const seeded = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T01:00:00Z'));
    expect(seeded.technical_pattern).toBe(TECH_PATTERN);
    expect(seeded.technical_status).toBe('ACTIVE');
    expect(seeded.technical_posterior_mean).not.toBeNull();
    expect(seeded.technical_posterior_mean!).toBeGreaterThan(0.6);
    expect(seeded.technical_posterior_mean!).toBeLessThan(0.85);
    expect(seeded.technical_sample_size).toBe(16);
  });

  it('bumping the seed (alpha=60) changes posterior on the next read (AC2 core)', async () => {
    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    const before = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T02:00:00Z'));

    await prisma.learnedPattern.update({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: TECH_PATTERN,
          cap_class: CAP,
          horizon_days: PRIMARY_HORIZON,
        },
      },
      data: { alpha: 60, beta: 6, sample_size: 66, hits: 60 },
    });

    const after = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T03:00:00Z'));
    expect(after.technical_sample_size).toBe(66);
    expect(after.technical_posterior_mean).not.toBeNull();
    expect(before.technical_posterior_mean).not.toBeNull();
    expect(
      Math.abs((after.technical_posterior_mean ?? 0) - (before.technical_posterior_mean ?? 0)),
    ).toBeGreaterThan(0.05);
  });

  it('agreement label: aligned when both diffusion + technical are high', async () => {
    // engine-context reads diffusion at horizon_days=7 (its primary horizon)
    // and technical at horizon_days=30 — seed the diffusion row at 7d so the
    // agreement classifier sees both signal classes as ACTIVE + bullish.
    await prisma.learnedPattern.create({ data: {
      signal_class: 'diffusion',
      pattern_key: FLOW_PATTERN,
      cap_class: CAP,
      horizon_days: 7,
      alpha: 60,
      beta: 6,
      sample_size: 66,
      hits: 60,
      alpha_30d: 60,
      beta_30d: 6,
      brier_in_sample: 0.18,
      brier_out_sample: 0.20,
      brier_null: 0.25,
      drift_z: 0.5,
      status: 'ACTIVE',
    }});

    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    const ctx = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T04:00:00Z'));
    // 'aligned' is one of the four valid agreement values; it requires both
    // signal classes to be ACTIVE-class with directionally consistent posteriors.
    expect(['aligned', 'mixed', 'opposed', 'unknown']).toContain(ctx.agreement);
    expect(ctx.agreement).toBe('aligned');
  });

  it('Gemini system prompt references 30d AND a TechPattern (AC5)', async () => {
    const { buildSystemPrompt } = await import('@/lib/gemini-analysis');
    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    const ctx = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T05:00:00Z'));
    const prompt = buildSystemPrompt(ctx);
    // (a) references the 30-day horizon
    expect(prompt).toMatch(/30\s*d|30\s*day/i);
    // (b) mentions at least one TechPattern (display label OR snake_case key)
    expect(prompt.toLowerCase()).toMatch(
      /breakout[\s_]uptrend|overbought[\s_]uptrend|pullback[\s_]in[\s_]uptrend|consolidation|breakdown|oversold[\s_]downtrend|death[\s_]cross|golden[\s_]cross/,
    );
  });
});
