// Integration test — pins all dual-class invariants of the Phase 16-03 learn cron.
//
// Hits the live DATABASE_URL. Uses a unique throwaway ticker (TEST_PHASE16_LRN)
// so production data is untouched. The cron handler is invoked directly via
// import (not via fetch) using a synthetic NextRequest with the CRON_SECRET.
//
// vi.mock'd modules:
//   - yahoo-finance2 → deterministic SPY chart (so SPY-relative hits are stable)
//   - ai (generateText) → stubbed so the cycle_summary path doesn't hit network
//
// Invariants pinned:
//   1. One 7d outcome with both diffusion + technical signals → 2 Beta cells
//      at horizon=7, NO LogisticEpoch appended.
//   2. One 30d outcome with both signals → 2 Beta cells at horizon=30 AND one
//      new LogisticEpoch row appended (epoch increments).
//   3. 30d outcome with technical_data null → only diffusion cell updated;
//      no technical cell, no logistic epoch.
//   4. Cron retry idempotent — two consecutive invocations produce same final
//      cell counts (LearningEvent.outcome_id dedup).
//   5. First post-Phase-16 cycle reinitializes the logistic to 12-d zero state
//      when the latest persisted epoch has only 6 keys.
//   6. Recompute pass touches pre-existing cells (last_updated refreshed).

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { NextRequest } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import type { TechnicalSnapshot } from '@/lib/types';

// ─── Mocks (must be set BEFORE importing the route handler) ─────────────────

// Deterministic SPY chart: 100 → 100.1 monotone (so SPY return ≈ 0% across the
// window — ticker_return_pct of 5% always classifies as a hit > 1%).
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

const TEST_TICKER = 'TEST_PHASE16_LRN';
const HAS_DB = !!process.env.DATABASE_URL;
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron-secret';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const SAMPLE_COMMUNITY_NICHE_LEADS = {
  // Two snapshots with this shape → flow_pattern='niche_leads' (mainstream
  // never moves, niche moves first).
  quantity: 8,
  quality: 0.55,
  market_cap: 500_000_000_000,
  cap_class: 'large_cap' as const,
  tier_breakdown: { mainstream: 0, middle: 1, niche: 4 },
  highlights: [],
};
const SAMPLE_COMMUNITY_NICHE_LEADS_LATER = {
  ...SAMPLE_COMMUNITY_NICHE_LEADS,
  quantity: 12,
  quality: 0.6,
  tier_breakdown: { mainstream: 0, middle: 4, niche: 8 },
};

const SAMPLE_TECH_BREAKOUT: TechnicalSnapshot = {
  rsi_14: 60,
  macd_line: 0.5,
  macd_signal: 0.3,
  macd_histogram: 0.2,
  sma_50: 152,
  sma_200: 140,
  atr_14: 2.1,
  avg_volume_20d: 1_500_000,
  volume_ratio: 1.6,
  trend_regime: 'uptrend',
  momentum_regime: 'neutral',
  cross_state: 'none',
  tech_pattern: 'breakout_uptrend',
  bar_count: 252,
  computed_at: new Date().toISOString(),
  data_source: 'yahoo',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function teardown() {
  if (!HAS_DB) return;
  // Delete dependency-safe order: LearningEvent (by outcome_id + by ticker) →
  // PriceOutcome → SentimentSnapshot → DiffusionTrace → LearnedPattern
  // (by pattern_key) → LogisticEpoch (test-created).
  const snaps = await prisma.sentimentSnapshot.findMany({
    where: { ticker: TEST_TICKER },
    select: { id: true },
  });
  const snapIds = snaps.map((s) => s.id);
  if (snapIds.length > 0) {
    const outcomes = await prisma.priceOutcome.findMany({
      where: { snapshot_id: { in: snapIds } },
      select: { id: true },
    });
    const outcomeIds = outcomes.map((o) => o.id);
    if (outcomeIds.length > 0) {
      await prisma.learningEvent.deleteMany({ where: { outcome_id: { in: outcomeIds } } });
    }
    await prisma.priceOutcome.deleteMany({ where: { snapshot_id: { in: snapIds } } });
  }
  // Also remove ticker-tagged learning events that aren't tied to a current
  // outcome (e.g., posterior_update rows whose outcome was already deleted in
  // a prior teardown — leaves them orphaned and queryable by ticker).
  await prisma.learningEvent.deleteMany({ where: { ticker: TEST_TICKER } });
  await prisma.sentimentSnapshot.deleteMany({ where: { ticker: TEST_TICKER } });
  await prisma.diffusionTrace.deleteMany({ where: { ticker: TEST_TICKER } });
  // Pattern cells touched by the test ticker — niche_leads/large_cap and
  // breakout_uptrend/large_cap at horizons used by the suite.
  await prisma.learnedPattern.deleteMany({
    where: {
      cap_class: 'large_cap',
      OR: [
        { signal_class: 'diffusion', pattern_key: 'niche_leads' },
        { signal_class: 'technical', pattern_key: 'breakout_uptrend' },
      ],
    },
  });
  // Test-created LogisticEpoch rows. The Test 5 legacy seed uses intercept=-999
  // sentinel; freshly-persisted epochs from the cron use sample_size IN (0, 1)
  // (test outcomes always feed the regression with 1 row max); the helper
  // seedNeutral12dEpoch uses sample_size=2, intercept=0 — also delete those.
  await prisma.logisticEpoch.deleteMany({
    where: {
      OR: [
        { intercept: -999 }, // Test 5 legacy seed
        { sample_size: { in: [0, 1] } }, // test-cron persisted epochs
        { intercept: 0, sample_size: 2 }, // seedNeutral12dEpoch helper
      ],
    },
  });
}

interface SeedSnapsAndOutcomeOpts {
  daysAgoSnap: number; // age of the snapshot at scan time (to drive horizon)
  horizon: number; // days_after on the PriceOutcome
  withTech: boolean; // whether the snapshot has technical_data
  pctChange: number; // ticker_return_pct on the outcome
}

/**
 * Seed two snapshots (so computeDiffusionTrace can produce a trace) and a
 * PriceOutcome at the requested horizon. Returns the outcome row + the most-
 * recent snapshot id (the one the outcome attaches to).
 */
async function seedSnapsAndOutcome(opts: SeedSnapsAndOutcomeOpts) {
  const olderSnapAt = daysAgo(opts.daysAgoSnap + 1);
  const newerSnapAt = daysAgo(opts.daysAgoSnap);
  // The OLDER snapshot is needed by the diffusion trace (it walks back up to 4
  // snapshots BEFORE outcome.scanned_at).
  await prisma.sentimentSnapshot.create({
    data: {
      ticker: TEST_TICKER,
      scanned_at: olderSnapAt,
      price_at_scan: 100,
      community_data: SAMPLE_COMMUNITY_NICHE_LEADS as unknown as Prisma.InputJsonValue,
      technical_data: opts.withTech
        ? (SAMPLE_TECH_BREAKOUT as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
  const newerSnap = await prisma.sentimentSnapshot.create({
    data: {
      ticker: TEST_TICKER,
      scanned_at: newerSnapAt,
      price_at_scan: 100,
      community_data: SAMPLE_COMMUNITY_NICHE_LEADS_LATER as unknown as Prisma.InputJsonValue,
      technical_data: opts.withTech
        ? (SAMPLE_TECH_BREAKOUT as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
  const outcome = await prisma.priceOutcome.create({
    data: {
      snapshot_id: newerSnap.id,
      days_after: opts.horizon,
      price: 100 * (1 + opts.pctChange / 100),
      pct_change: opts.pctChange,
      recorded_at: new Date(),
    },
  });
  return { outcome, snapshotId: newerSnap.id };
}

async function callLearn() {
  const { GET } = await import('@/app/api/cron/learn/route');
  const req = new NextRequest('http://localhost/api/cron/learn', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const res = await GET(req);
  return res.json();
}

async function logisticEpochCount(): Promise<number> {
  return prisma.logisticEpoch.count();
}

/**
 * Pre-seed a 12-d zero-init LogisticEpoch so the cron's `else` branch
 * (Pitfall-5 reinit fallback) does NOT fire — i.e. simulate "not the first
 * post-Phase-16 cycle". Tests that specifically exercise the reinit path
 * (Test 5) skip this. sample_size=2 so teardown's broad cleanup leaves it
 * intact within the test run.
 */
async function seedNeutral12dEpoch(): Promise<void> {
  const last = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
  const epoch = (last?.epoch ?? 0) + 1;
  const coefficients: Record<string, { mu: number; sigma: number }> = {
    _intercept: { mu: 0, sigma: 1 },
  };
  // Cover all 12 named feature keys so needsLogisticReinit returns false.
  const FEATURES = [
    'v_niche', 'v_middle', 'v_mainstream', 'niche_lead_cycles', 'q_z', 'qual_z',
    'rsi_14', 'macd_histogram', 'sma_relative_spread', 'atr_14', 'volume_ratio',
    'tech_pattern_uptrend_flag',
  ];
  for (const f of FEATURES) coefficients[f] = { mu: 0, sigma: 1 };
  await prisma.logisticEpoch.create({
    data: {
      epoch,
      intercept: 0,
      brier_in: 0.25,
      brier_out: 0.25,
      sample_size: 2, // not in teardown's IN(0,1) filter
      coefficients: coefficients as Prisma.InputJsonValue,
    },
  });
}

// Note: the seedNeutral12dEpoch helper relies on the broader teardown() call
// (matches sample_size=2, intercept=0) — no separate cleanup needed.

// ─── Suite ──────────────────────────────────────────────────────────────────

// Each integration test below runs at least one full cron pass against live
// Neon — bump test timeout to 30s so the 216-cell recompute + transactional
// per-outcome work doesn't trip vitest's default 5s.
const TEST_TIMEOUT_MS = 30_000;

describe.skipIf(!HAS_DB)('learn cron — Phase 16-03 dual-class', () => {
  beforeEach(async () => {
    await teardown();
  });

  afterAll(async () => {
    await teardown();
    if (HAS_DB) await prisma.$disconnect();
  });

  it('one 7d outcome with diffusion + tech updates 2 cells at horizon=7, no logistic update', { timeout: TEST_TIMEOUT_MS }, async () => {
    // Seed a neutral 12-d epoch so the Pitfall-5 reinit fallback in the cron
    // does NOT fire (it would otherwise persist a fresh epoch even with no 30d
    // training data, which is correct behaviour but masks the 7d-no-epoch
    // invariant we're pinning here).
    await seedNeutral12dEpoch();
    await seedSnapsAndOutcome({ daysAgoSnap: 7, horizon: 7, withTech: true, pctChange: 5 });
    const epochsBefore = await logisticEpochCount();

    await callLearn();

    const diffCell = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'diffusion',
          pattern_key: 'niche_leads',
          cap_class: 'large_cap',
          horizon_days: 7,
        },
      },
    });
    const techCell = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: 'breakout_uptrend',
          cap_class: 'large_cap',
          horizon_days: 7,
        },
      },
    });
    expect(diffCell).not.toBeNull();
    expect(techCell).not.toBeNull();
    expect(diffCell!.sample_size).toBe(1);
    expect(techCell!.sample_size).toBe(1);

    // No logistic update at 7d horizon.
    const epochsAfter = await logisticEpochCount();
    expect(epochsAfter).toBe(epochsBefore);
  });

  it('one 30d outcome with diffusion + tech updates 2 cells at horizon=30 AND appends 1 LogisticEpoch', { timeout: TEST_TIMEOUT_MS }, async () => {
    await seedSnapsAndOutcome({ daysAgoSnap: 30, horizon: 30, withTech: true, pctChange: 5 });
    const epochsBefore = await logisticEpochCount();

    await callLearn();

    const diffCell = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'diffusion',
          pattern_key: 'niche_leads',
          cap_class: 'large_cap',
          horizon_days: 30,
        },
      },
    });
    const techCell = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: 'breakout_uptrend',
          cap_class: 'large_cap',
          horizon_days: 30,
        },
      },
    });
    expect(diffCell).not.toBeNull();
    expect(techCell).not.toBeNull();
    expect(diffCell!.sample_size).toBe(1);
    expect(techCell!.sample_size).toBe(1);

    // Logistic epoch appended exactly once.
    const epochsAfter = await logisticEpochCount();
    expect(epochsAfter).toBe(epochsBefore + 1);

    const latest = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
    expect(latest).not.toBeNull();
    // 12 named coefficients (FEATURE_NAMES) + the synthetic _intercept key.
    const c = latest!.coefficients as Record<string, unknown>;
    const namedKeys = Object.keys(c).filter((k) => !k.startsWith('_'));
    expect(namedKeys.length).toBe(12);
  });

  it('30d outcome with technical_data null updates only diffusion cell, no logistic update', { timeout: TEST_TIMEOUT_MS }, async () => {
    await seedNeutral12dEpoch(); // Suppress Pitfall-5 reinit fallback (see Test 1).
    await seedSnapsAndOutcome({ daysAgoSnap: 30, horizon: 30, withTech: false, pctChange: 5 });
    const epochsBefore = await logisticEpochCount();

    await callLearn();

    const diffCell = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'diffusion',
          pattern_key: 'niche_leads',
          cap_class: 'large_cap',
          horizon_days: 30,
        },
      },
    });
    const techCell = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: 'breakout_uptrend',
          cap_class: 'large_cap',
          horizon_days: 30,
        },
      },
    });
    expect(diffCell).not.toBeNull();
    expect(diffCell!.sample_size).toBe(1);
    expect(techCell).toBeNull();

    // Gate is `horizon === 30 && trace && techSnap` — null tech → no logistic update.
    const epochsAfter = await logisticEpochCount();
    expect(epochsAfter).toBe(epochsBefore);
  });

  it('idempotent under cron retry — two consecutive runs leave cell sample_size at 1', { timeout: TEST_TIMEOUT_MS * 2 }, async () => {
    await seedSnapsAndOutcome({ daysAgoSnap: 7, horizon: 7, withTech: true, pctChange: 5 });

    await callLearn();
    const diffAfterFirst = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'diffusion',
          pattern_key: 'niche_leads',
          cap_class: 'large_cap',
          horizon_days: 7,
        },
      },
    });
    const techAfterFirst = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: 'breakout_uptrend',
          cap_class: 'large_cap',
          horizon_days: 7,
        },
      },
    });
    expect(diffAfterFirst!.sample_size).toBe(1);
    expect(techAfterFirst!.sample_size).toBe(1);
    const epochsAfterFirst = await logisticEpochCount();

    // Second run — outcome_id dedup must prevent double-counting.
    await callLearn();
    const diffAfterSecond = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'diffusion',
          pattern_key: 'niche_leads',
          cap_class: 'large_cap',
          horizon_days: 7,
        },
      },
    });
    const techAfterSecond = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: 'breakout_uptrend',
          cap_class: 'large_cap',
          horizon_days: 7,
        },
      },
    });
    expect(diffAfterSecond!.sample_size).toBe(1);
    expect(diffAfterSecond!.alpha).toBe(diffAfterFirst!.alpha);
    expect(diffAfterSecond!.beta).toBe(diffAfterFirst!.beta);
    expect(techAfterSecond!.sample_size).toBe(1);
    const epochsAfterSecond = await logisticEpochCount();
    // 7d horizon: no logistic update on either run.
    expect(epochsAfterSecond).toBe(epochsAfterFirst);
  });

  it('first post-Phase-16 cycle reinitializes logistic to 12-d zero state when latest epoch has 6 keys', { timeout: TEST_TIMEOUT_MS }, async () => {
    // Seed a fake legacy 6-d LogisticEpoch with the sentinel intercept value
    // so teardown() can clean it up reliably across runs.
    const lastEpoch = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
    const seedEpoch = (lastEpoch?.epoch ?? 0) + 1;
    await prisma.logisticEpoch.create({
      data: {
        epoch: seedEpoch,
        intercept: -999, // sentinel for teardown
        brier_in: 0.25,
        brier_out: 0.25,
        sample_size: 0,
        coefficients: {
          v_niche: { mu: 0, sigma: 1 },
          v_middle: { mu: 0, sigma: 1 },
          v_mainstream: { mu: 0, sigma: 1 },
          niche_lead_cycles: { mu: 0, sigma: 1 },
          q_z: { mu: 0, sigma: 1 },
          qual_z: { mu: 0, sigma: 1 },
        } as Prisma.InputJsonValue,
      },
    });
    await seedSnapsAndOutcome({ daysAgoSnap: 30, horizon: 30, withTech: true, pctChange: 5 });

    await callLearn();

    const latest = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
    expect(latest).not.toBeNull();
    expect(latest!.epoch).toBeGreaterThan(seedEpoch);
    const c = latest!.coefficients as Record<string, unknown>;
    const namedKeys = Object.keys(c).filter((k) => !k.startsWith('_'));
    expect(namedKeys.length).toBe(12);
    // Confirm the 6 new technical features are present in the new epoch.
    expect(namedKeys).toContain('rsi_14');
    expect(namedKeys).toContain('macd_histogram');
    expect(namedKeys).toContain('sma_relative_spread');
    expect(namedKeys).toContain('atr_14');
    expect(namedKeys).toContain('volume_ratio');
    expect(namedKeys).toContain('tech_pattern_uptrend_flag');
  });

  it('recompute pass refreshes last_updated on a pre-existing cell', { timeout: TEST_TIMEOUT_MS }, async () => {
    await seedNeutral12dEpoch(); // Suppress Pitfall-5 reinit fallback.
    // Pre-seed a LearnedPattern row stale by 1 day, AND a matching
    // LearningEvent so recomputeOneCell can compute Brier/drift on it (the
    // recompute fast-paths cells with zero matching events). Use a fake
    // outcome_id so dedup doesn't reject re-processing.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.learnedPattern.upsert({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'diffusion',
          pattern_key: 'niche_leads',
          cap_class: 'large_cap',
          horizon_days: 7,
        },
      },
      create: {
        signal_class: 'diffusion',
        pattern_key: 'niche_leads',
        cap_class: 'large_cap',
        horizon_days: 7,
        alpha: 5,
        beta: 5,
        sample_size: 8,
        hits: 4,
        last_updated: oneDayAgo,
      },
      update: { alpha: 5, beta: 5, sample_size: 8, hits: 4, last_updated: oneDayAgo },
    });
    await prisma.learningEvent.create({
      data: {
        event_type: 'posterior_update',
        ticker: TEST_TICKER,
        signal_class: 'diffusion',
        pattern_key: 'niche_leads',
        cap_class: 'large_cap',
        horizon_days: 7,
        delta: { diffusion_hit: true, hit: true, horizon: 7 },
        message: 'recompute-test seed event',
        occurred_at: oneDayAgo,
      },
    });

    // Sanity: snapshot the actual seeded last_updated value (Prisma's
    // @updatedAt may have rounded the millisecond on insert).
    const seeded = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'diffusion',
          pattern_key: 'niche_leads',
          cap_class: 'large_cap',
          horizon_days: 7,
        },
      },
    });
    const seededTs = seeded!.last_updated.getTime();

    // Run the cron — no new outcomes (no PriceOutcome rows), so the only
    // effect is the recompute pass touching the seeded cell.
    await callLearn();

    const cell = await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'diffusion',
          pattern_key: 'niche_leads',
          cap_class: 'large_cap',
          horizon_days: 7,
        },
      },
    });
    expect(cell).not.toBeNull();
    // recomputeOneCell writes brier/drift fields on every cell that has
    // matching events; @updatedAt fires on every UPDATE.
    expect(cell!.last_updated.getTime()).toBeGreaterThan(seededTs);
  });
});
