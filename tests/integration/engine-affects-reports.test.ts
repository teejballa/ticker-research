// Integration test — proves the auto-updating engine state actually changes
// what a report will surface. Hits the live DATABASE_URL, seeds engine state
// directly through prisma, and verifies getEngineContextForTicker reads it.
//
// This is the test counterpart to /api/cron/learn: that endpoint writes
// LearnedPattern + LogisticEpoch rows; this test proves the read side honors
// what gets written.

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

const TEST_TICKER = 'CIPHRTEST';
const FLOW = 'niche_leads';
const CAP = 'large_cap';

// Skip the suite when no DATABASE_URL is reachable — keeps CI green for
// contributors without DB access while still letting the maintainer run it.
const HAS_DB = !!process.env.DATABASE_URL;
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb('engine state changes flow into report engine_calibration', () => {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  async function cleanup() {
    await prisma.learnedPattern.deleteMany({ where: { flow_pattern: FLOW, cap_class: CAP } });
    await prisma.sentimentSnapshot.deleteMany({ where: { ticker: TEST_TICKER } });
  }

  beforeAll(async () => { await cleanup(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('cold read → status NO_DATA, posterior null', async () => {
    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    // Seed two history-only snapshots so the cold scan does not run.
    const baseAt = new Date('2026-04-23T12:00:00Z');
    await prisma.sentimentSnapshot.createMany({ data: [
      { ticker: TEST_TICKER, scanned_at: baseAt, price_at_scan: 100,
        community_data: { quantity: 5, quality: 0.4, market_cap: 800_000_000_000, cap_class: CAP,
                          tier_breakdown: { mainstream: 0, middle: 1, niche: 4 } } },
      { ticker: TEST_TICKER, scanned_at: new Date(baseAt.getTime() + 24*3600*1000), price_at_scan: 102,
        community_data: { quantity: 12, quality: 0.6, market_cap: 800_000_000_000, cap_class: CAP,
                          tier_breakdown: { mainstream: 0, middle: 4, niche: 8 } } },
    ]});

    const cold = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T00:00:00Z'));
    expect(cold.status).toBe('NO_DATA');
    expect(cold.posterior_mean).toBeNull();
    expect(cold.sample_size).toBe(0);
  });

  it('after seeding LearnedPattern, posterior + status reflect the seed', async () => {
    await prisma.learnedPattern.create({ data: {
      flow_pattern: FLOW, cap_class: CAP,
      alpha: 12, beta: 4, sample_size: 16, hits: 12,
      alpha_30d: 6, beta_30d: 2,
      brier_in_sample: 0.18, brier_out_sample: 0.20, brier_null: 0.25,
      drift_z: 0.5, status: 'ACTIVE',
    }});

    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    const seeded = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T01:00:00Z'));

    // The two snapshots from the previous test gave us a "niche_leads" trace
    // (everything in middle/niche tiers, nothing mainstream → niche/middle
    // velocity > mainstream → flow_pattern niche_leads).
    expect(seeded.flow_pattern).toBe(FLOW);
    expect(seeded.cap_class).toBe(CAP);
    expect(seeded.status).toBe('ACTIVE');
    expect(seeded.sample_size).toBe(16);
    expect(seeded.hits).toBe(12);
    expect(seeded.posterior_mean).toBeGreaterThan(0.5);
  });

  it('a learning cycle (alpha bumped) changes posterior on the next read', async () => {
    const { getEngineContextForTicker } = await import('@/lib/engine-context');
    const before = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T02:00:00Z'));

    await prisma.learnedPattern.update({
      where: { flow_pattern_cap_class: { flow_pattern: FLOW, cap_class: CAP } },
      data: { alpha: 60, beta: 6, sample_size: 66, hits: 60 },
    });

    const after = await getEngineContextForTicker(TEST_TICKER, new Date('2026-04-25T03:00:00Z'));

    expect(after.sample_size).toBe(66);
    expect(after.hits).toBe(60);
    // Posterior should have moved toward the new alpha/(alpha+beta) ratio.
    expect(after.posterior_mean).not.toBeNull();
    expect(before.posterior_mean).not.toBeNull();
    expect(Math.abs((after.posterior_mean ?? 0) - (before.posterior_mean ?? 0))).toBeGreaterThan(0.05);
  });
});
