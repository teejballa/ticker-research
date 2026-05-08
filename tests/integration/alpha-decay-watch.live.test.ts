// tests/integration/alpha-decay-watch.live.test.ts
//
// Phase 19-A-05 Task 5 (live-DB integration). Hits the live DATABASE_URL
// from .env.local. Uses TEST_TICKER + TEST_CAP scoped throwaway data so
// production cells are untouched.
//
// Per-class IC scope: the cron computes ONE rolling_ic_20d per signal class
// (across all non-EXPLORATORY cells in that class) and broadcasts the same
// value + flag to every cell of the class. Tests use 2+ pattern_keys so
// prediction variance exists.
//
// Invariants pinned:
//   1. Auth — request without Bearer ${CRON_SECRET} returns 401
//   2. Happy path — seed 2+ ACTIVE cells with paired outcomes; cron writes
//      a numeric rolling_ic_20d to every seeded cell
//   3. Confirmation — seed events designed to produce 5+ consecutive low-IC
//      days → ic_decay_flag flips true on every cell of the class
//   4. Recovery — start with ic_decay_flag = true and provide insufficient
//      recent evidence → flag must NOT silently clear (sticky default)
//   5. Cleanup — afterAll removes every row touched by these tests

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const TEST_TICKER = 'TESTPHASE19A05';
const TEST_CAP = 'TESTPHASE19A05CAP';
// Two distinct pattern_keys for prediction-variance across cells in the
// same signal class. Both are valid TechPattern values.
const TEST_PATTERN_A = 'breakout_uptrend';
const TEST_PATTERN_B = 'consolidation';
const TEST_SIGNAL_CLASS = 'technical';
const TEST_HORIZON = 30;

const HAS_DB = !!process.env.DATABASE_URL;
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB
  ? new PrismaClient({ adapter: adapter! })
  : (null as unknown as PrismaClient);

process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron-secret';

async function cleanup() {
  if (!HAS_DB) return;
  await prisma.learningEvent.deleteMany({ where: { ticker: TEST_TICKER } });
  await prisma.learnedPattern.deleteMany({ where: { cap_class: TEST_CAP } });
}

async function callCron(opts: { auth?: string } = {}): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const { GET } = await import('@/app/api/cron/alpha-decay-watch/route');
  const headers: Record<string, string> = {};
  if (opts.auth !== undefined) headers.authorization = opts.auth;
  const req = new NextRequest('http://localhost/api/cron/alpha-decay-watch', { headers });
  const res = await GET(req);
  return { status: res.status, body: await res.json() };
}

/**
 * Seed a LearnedPattern cell with given alpha/beta/status/ic_decay_flag.
 * Returns the row id.
 */
async function seedCell(opts: {
  pattern_key: string;
  alpha: number;
  beta: number;
  sample_size: number;
  status: string;
  ic_decay_flag?: boolean;
}): Promise<string> {
  const row = await prisma.learnedPattern.create({
    data: {
      signal_class: TEST_SIGNAL_CLASS,
      pattern_key: opts.pattern_key,
      cap_class: TEST_CAP,
      horizon_days: TEST_HORIZON,
      alpha: opts.alpha,
      beta: opts.beta,
      sample_size: opts.sample_size,
      effective_sample_size: opts.sample_size,
      hits: opts.alpha > 1 ? Math.round(opts.alpha - 1) : 0,
      status: opts.status,
      ic_decay_flag: opts.ic_decay_flag ?? false,
      last_updated: new Date(),
    },
  });
  return row.id;
}

/**
 * Seed N posterior_update LearningEvent rows for a given cell key,
 * distributed across `daysWindow` days. `alphaSign` controls correlation
 * direction.
 */
async function seedEvents(opts: {
  pattern_key: string;
  count: number;
  daysWindow: number;
  alphaSign: 'positive' | 'noise' | 'negative';
}): Promise<void> {
  const MS_PER_DAY = 86_400_000;
  const now = Date.now();
  for (let i = 0; i < opts.count; i++) {
    const dayOffset = opts.daysWindow - 1 - Math.floor((i / opts.count) * opts.daysWindow);
    const occurredAt = new Date(now - dayOffset * MS_PER_DAY);
    let tickerReturn = 0;
    if (opts.alphaSign === 'positive') {
      tickerReturn = 0.01 + i * 0.01;
    } else if (opts.alphaSign === 'negative') {
      tickerReturn = 1.0 - i * 0.05;
    } else {
      // Pseudo-random uncorrelated alpha
      tickerReturn = ((i * 7) % 11) / 100 - 0.05;
    }
    await prisma.learningEvent.create({
      data: {
        event_type: 'posterior_update',
        ticker: TEST_TICKER,
        signal_class: TEST_SIGNAL_CLASS,
        pattern_key: opts.pattern_key,
        cap_class: TEST_CAP,
        horizon_days: TEST_HORIZON,
        occurred_at: occurredAt,
        delta: {
          tech_hit: tickerReturn > 0,
          hit: tickerReturn > 0,
          ticker_return_pct: tickerReturn,
          spy_return_pct: 0,
          horizon: TEST_HORIZON,
          tech_pattern: opts.pattern_key,
        },
        message: `[test] alpha-decay seed event pattern=${opts.pattern_key} i=${i}`,
      },
    });
  }
}

describe.skipIf(!HAS_DB)('Phase 19-A-05 — alpha-decay-watch live cron', () => {
  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    if (HAS_DB) await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
  });

  it('returns 401 when Authorization header is missing or wrong', async () => {
    const noAuth = await callCron();
    expect(noAuth.status).toBe(401);

    const wrongAuth = await callCron({ auth: 'Bearer not-the-secret' });
    expect(wrongAuth.status).toBe(401);
  });

  it('happy path: 2 ACTIVE cells with paired outcomes get rolling_ic_20d populated on every cell', async () => {
    // Two cells with DIFFERENT posterior means → predictions vary in the IC.
    const cellAId = await seedCell({
      pattern_key: TEST_PATTERN_A,
      alpha: 8,
      beta: 2, // mean = 0.8
      sample_size: 8,
      status: 'ACTIVE',
    });
    const cellBId = await seedCell({
      pattern_key: TEST_PATTERN_B,
      alpha: 2,
      beta: 8, // mean = 0.2
      sample_size: 8,
      status: 'ACTIVE',
    });
    // Each cell gets some events; together the class has > 5 paired obs
    // with 2 distinct prediction values.
    await seedEvents({ pattern_key: TEST_PATTERN_A, count: 8, daysWindow: 18, alphaSign: 'positive' });
    await seedEvents({ pattern_key: TEST_PATTERN_B, count: 8, daysWindow: 18, alphaSign: 'negative' });

    const { status, body } = await callCron({
      auth: `Bearer ${process.env.CRON_SECRET}`,
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const cellA = await prisma.learnedPattern.findUnique({ where: { id: cellAId } });
    const cellB = await prisma.learnedPattern.findUnique({ where: { id: cellBId } });
    expect(cellA).not.toBeNull();
    expect(cellB).not.toBeNull();

    // Both cells share the same per-class rolling_ic_20d + flag (broadcast).
    expect(cellA!.rolling_ic_20d).not.toBeNull();
    expect(cellB!.rolling_ic_20d).not.toBeNull();
    expect(Number.isFinite(cellA!.rolling_ic_20d!)).toBe(true);
    expect(cellA!.rolling_ic_20d).toBe(cellB!.rolling_ic_20d);
    expect(cellA!.ic_decay_flag).toBe(cellB!.ic_decay_flag);
  });

  it('confirmation: persistent low-IC across 5+ days flips ic_decay_flag → true on every class cell', async () => {
    await seedCell({
      pattern_key: TEST_PATTERN_A,
      alpha: 5,
      beta: 5, // mean = 0.5
      sample_size: 25,
      status: 'ACTIVE',
    });
    await seedCell({
      pattern_key: TEST_PATTERN_B,
      alpha: 3,
      beta: 7, // mean = 0.3
      sample_size: 25,
      status: 'ACTIVE',
    });
    // Noise-correlated alpha across both cells → IC ≈ 0 across the rolling
    // window → 5 consecutive low-IC days → confirmation fires.
    await seedEvents({ pattern_key: TEST_PATTERN_A, count: 30, daysWindow: 25, alphaSign: 'noise' });
    await seedEvents({ pattern_key: TEST_PATTERN_B, count: 30, daysWindow: 25, alphaSign: 'noise' });

    const { status, body } = await callCron({
      auth: `Bearer ${process.env.CRON_SECRET}`,
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const cells = await prisma.learnedPattern.findMany({
      where: { cap_class: TEST_CAP, signal_class: TEST_SIGNAL_CLASS },
    });
    expect(cells.length).toBe(2);
    for (const c of cells) {
      expect(c.ic_decay_flag).toBe(true);
    }
  });

  it('recovery: ic_decay_flag stays true when recent IC evidence is insufficient (sticky default)', async () => {
    // Setup: seed cells already in flagged state.
    await seedCell({
      pattern_key: TEST_PATTERN_A,
      alpha: 5,
      beta: 5,
      sample_size: 25,
      status: 'ACTIVE',
      ic_decay_flag: true,
    });
    await seedCell({
      pattern_key: TEST_PATTERN_B,
      alpha: 3,
      beta: 7,
      sample_size: 25,
      status: 'ACTIVE',
      ic_decay_flag: true,
    });
    // Sparse events — not enough to populate isDecayCleared's 3-day tail.
    await seedEvents({ pattern_key: TEST_PATTERN_A, count: 4, daysWindow: 25, alphaSign: 'positive' });
    await seedEvents({ pattern_key: TEST_PATTERN_B, count: 4, daysWindow: 25, alphaSign: 'positive' });

    const { status, body } = await callCron({
      auth: `Bearer ${process.env.CRON_SECRET}`,
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const cells = await prisma.learnedPattern.findMany({
      where: { cap_class: TEST_CAP, signal_class: TEST_SIGNAL_CLASS },
    });
    expect(cells.length).toBe(2);
    // Sticky default — the flag must NOT silently clear without 3 consecutive
    // recovery days of evidence.
    for (const c of cells) {
      expect(c.ic_decay_flag).toBe(true);
    }
  });

  it('cleanup verification: test rows are removed by cleanup helper', async () => {
    await seedCell({
      pattern_key: TEST_PATTERN_A,
      alpha: 2,
      beta: 1,
      sample_size: 1,
      status: 'EXPLORATORY',
    });
    await cleanup();
    const remaining = await prisma.learnedPattern.findMany({ where: { cap_class: TEST_CAP } });
    expect(remaining.length).toBe(0);
    const remainingEvents = await prisma.learningEvent.findMany({
      where: { ticker: TEST_TICKER },
    });
    expect(remainingEvents.length).toBe(0);
  });
});
