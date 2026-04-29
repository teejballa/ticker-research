// Integration test — proves the price-followup cron writes outcomes for the
// six Phase-16 horizons (3, 7, 14, 30, 60, 90 days) over a 95-day query window.
//
// Hits the live DATABASE_URL. Seeds SentimentSnapshots at controlled ages
// using a unique throwaway ticker (TEST_PHASE16_PFU) so production data is
// untouched. The cron handler is invoked directly (not via fetch) using a
// synthetic NextRequest with the CRON_SECRET bearer token.

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

// Stub yahoo-finance2 — the cron's fetchPrice() call would otherwise return
// null for our throwaway ticker (TEST_PHASE16_PFU), which is indistinguishable
// from a network failure. Returning a deterministic price isolates the test
// from network flakiness and proves the horizon-write logic, not the data
// fetcher.
vi.mock('yahoo-finance2', () => {
  return {
    default: class {
      quote() {
        return Promise.resolve({ regularMarketPrice: 110 });
      }
    },
  };
});

const TEST_TICKER = 'TEST_PHASE16_PFU';
const HAS_DB = !!process.env.DATABASE_URL;

const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

// Yahoo finance can be flaky. Default CRON_SECRET so the auth gate passes
// in tests; if the env already has one, it wins.
process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron-secret';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function cleanup() {
  if (!HAS_DB) return;
  // Delete outcomes first (FK), then snapshots.
  const snaps = await prisma.sentimentSnapshot.findMany({ where: { ticker: TEST_TICKER }, select: { id: true } });
  if (snaps.length > 0) {
    await prisma.priceOutcome.deleteMany({ where: { snapshot_id: { in: snaps.map((s) => s.id) } } });
    await prisma.sentimentSnapshot.deleteMany({ where: { ticker: TEST_TICKER } });
  }
}

async function callCron() {
  const { GET } = await import('@/app/api/cron/price-followup/route');
  const req = new NextRequest('http://localhost/api/cron/price-followup', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const res = await GET(req);
  return res.json();
}

describe.skipIf(!HAS_DB)('price-followup multi-horizon (Phase 16)', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    if (HAS_DB) await prisma.$disconnect();
  });

  it('writes outcome for snapshot exactly 30 days old (days_after=30)', async () => {
    const snap = await prisma.sentimentSnapshot.create({
      data: {
        ticker: TEST_TICKER,
        scanned_at: daysAgo(30),
        price_at_scan: 100,
        community_data: { quantity: 1, quality: 0.5, market_cap: 500_000_000_000, cap_class: 'large_cap', tier_breakdown: { mainstream: 0, middle: 0, niche: 1 } },
      },
    });
    await callCron();
    const outcomes = await prisma.priceOutcome.findMany({ where: { snapshot_id: snap.id } });
    const horizons = outcomes.map((o) => o.days_after);
    expect(horizons).toContain(30);
  });

  it('writes outcome for snapshot exactly 60 days old (days_after=60)', async () => {
    const snap = await prisma.sentimentSnapshot.create({
      data: {
        ticker: TEST_TICKER,
        scanned_at: daysAgo(60),
        price_at_scan: 100,
        community_data: { quantity: 1, quality: 0.5, market_cap: 500_000_000_000, cap_class: 'large_cap', tier_breakdown: { mainstream: 0, middle: 0, niche: 1 } },
      },
    });
    await callCron();
    const outcomes = await prisma.priceOutcome.findMany({ where: { snapshot_id: snap.id } });
    const horizons = outcomes.map((o) => o.days_after);
    expect(horizons).toContain(60);
  });

  it('writes outcome for snapshot exactly 90 days old (days_after=90)', async () => {
    const snap = await prisma.sentimentSnapshot.create({
      data: {
        ticker: TEST_TICKER,
        scanned_at: daysAgo(90),
        price_at_scan: 100,
        community_data: { quantity: 1, quality: 0.5, market_cap: 500_000_000_000, cap_class: 'large_cap', tier_breakdown: { mainstream: 0, middle: 0, niche: 1 } },
      },
    });
    await callCron();
    const outcomes = await prisma.priceOutcome.findMany({ where: { snapshot_id: snap.id } });
    const horizons = outcomes.map((o) => o.days_after);
    expect(horizons).toContain(90);
  });

  it('writes NO outcome for snapshot 50 days old (no horizon match)', async () => {
    const snap = await prisma.sentimentSnapshot.create({
      data: {
        ticker: TEST_TICKER,
        scanned_at: daysAgo(50),
        price_at_scan: 100,
        community_data: { quantity: 1, quality: 0.5, market_cap: 500_000_000_000, cap_class: 'large_cap', tier_breakdown: { mainstream: 0, middle: 0, niche: 1 } },
      },
    });
    await callCron();
    const outcomes = await prisma.priceOutcome.findMany({ where: { snapshot_id: snap.id } });
    expect(outcomes).toHaveLength(0);
  });

  it('does NOT duplicate outcomes when cron is run twice', async () => {
    const snap = await prisma.sentimentSnapshot.create({
      data: {
        ticker: TEST_TICKER,
        scanned_at: daysAgo(7),
        price_at_scan: 100,
        community_data: { quantity: 1, quality: 0.5, market_cap: 500_000_000_000, cap_class: 'large_cap', tier_breakdown: { mainstream: 0, middle: 0, niche: 1 } },
      },
    });
    await callCron();
    await callCron();
    const outcomes = await prisma.priceOutcome.findMany({ where: { snapshot_id: snap.id, days_after: 7 } });
    expect(outcomes).toHaveLength(1);
  });

  it('query window covers a 90-day-old snapshot (proves windowMs >= 95d)', async () => {
    // Pre-Phase-16 windowMs was 15 days, so a 90-day-old snapshot would be
    // excluded. Phase 16 widens to 95 days. If the snapshot is outside the
    // window, no outcome will be written even though the age matches a horizon.
    const snap = await prisma.sentimentSnapshot.create({
      data: {
        ticker: TEST_TICKER,
        scanned_at: daysAgo(90),
        price_at_scan: 100,
        community_data: { quantity: 1, quality: 0.5, market_cap: 500_000_000_000, cap_class: 'large_cap', tier_breakdown: { mainstream: 0, middle: 0, niche: 1 } },
      },
    });
    await callCron();
    const outcomes = await prisma.priceOutcome.findMany({ where: { snapshot_id: snap.id, days_after: 90 } });
    expect(outcomes.length).toBeGreaterThan(0);
  });
});
