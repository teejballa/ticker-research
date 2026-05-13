// tests/integration/sentiment-pump-dump.integration.test.ts
//
// Plan 20-C-04 — Integration test for the ManipulationWarning persistence path.
//
// Skipped when DATABASE_URL is absent (CI parity with the rest of the
// integration suite — bot-filter.integration.test.ts pattern).
//
// Covers the aggregator → Prisma → ManipulationWarning row write that wires
// the pure detector to Neon. Pure-math correctness is covered exhaustively
// by tests/sentiment-pump-dump-detector.unit.test.ts; this file proves the
// IO contract:
//   1. Out-of-scope cap_class (large_cap) returns a non-firing block AND
//      writes NO row (early-exit per aggregator.ts:742).
//   2. In-scope cap_class with all-firing features writes ONE row with
//      is_warning_fired=true, matched_rules covering all 5 conditions, and
//      rule_version='pdd-v1.0'.
//   3. In-scope cap_class with non-firing features still writes ONE row
//      (telemetry on every invocation per aggregator.ts:773 — operator FP
//      review during the 30d shadow gate).
//   4. mean_account_age_days is derived from author_features_snapshot over
//      the rolling 24h window — observations outside the window are ignored
//      (PIT-safe via fetched_at — never published_at).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const HAVE_DB = !!process.env.DATABASE_URL;
const TEST_TICKER = `TEST20C04_${Date.now()}`;

async function getPrisma() {
  const { prisma } = await import('@/lib/db');
  return prisma;
}

async function clean(ticker: string) {
  const prisma = await getPrisma();
  await prisma.manipulationWarning.deleteMany({ where: { ticker } });
  await prisma.sentimentObservation.deleteMany({ where: { ticker } });
}

describe.skipIf(!HAVE_DB)('ManipulationWarning — aggregator → Neon persistence (skipped when no DATABASE_URL)', () => {
  beforeAll(() => {
    // Ensure detector compute path is gated ON for the duration of these tests.
    // The aggregator reads FEATURES.pump_dump_detector_mode at module-import time;
    // the feature evaluator parses env at first read so setting here is enough.
    if (!process.env.FEATURE_PUMP_DUMP_DETECTOR) {
      process.env.FEATURE_PUMP_DUMP_DETECTOR = 'shadow';
    }
  });

  beforeEach(async () => { await clean(TEST_TICKER); });

  afterAll(async () => {
    await clean(TEST_TICKER);
    const prisma = await getPrisma();
    await prisma.$disconnect();
  });

  it('out-of-scope cap_class (large_cap) returns non-firing block AND writes NO row', async () => {
    const { computeManipulationWarning } = await import('@/lib/sentiment/aggregator');
    const result = await computeManipulationWarning({
      ticker: TEST_TICKER,
      cap_class: 'large_cap',
      bull_pct: 99,
      mention_z: 10,
      gini: 0.95,
    });

    expect(result).not.toBeNull();
    expect(result!.is_warning).toBe(false);
    expect(result!.matched_rules).toEqual([]);
    expect(result!.rule_version).toBe('pdd-v1.0');

    const prisma = await getPrisma();
    const rows = await prisma.manipulationWarning.findMany({ where: { ticker: TEST_TICKER } });
    expect(rows.length).toBe(0);
  });

  it('all-firing inputs → one row with is_warning_fired=true + 5 matched rules', async () => {
    const prisma = await getPrisma();

    // Seed SentimentObservation rows providing mean_account_age_days < 90 over the
    // rolling 24h window. fetched_at = now ensures inclusion in the aggregator query.
    const now = new Date();
    await prisma.sentimentObservation.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        ticker: TEST_TICKER,
        source: 'stocktwits' as const,
        message_id: `pdd-fire-${TEST_TICKER}-${i}`,
        author_id: `sha256:author-fire-${i}`,
        fetched_at: new Date(now.getTime() - i * 60_000), // last 5 minutes
        published_at: new Date(now.getTime() - i * 60_000),
        raw_body_hash: 'a'.repeat(64),
        classifier_version: 'test-20-c-04',
        model_version: 'test-20-c-04',
        author_features_snapshot: { account_age_days: 30 }, // < 90
      })),
    });

    const { computeManipulationWarning } = await import('@/lib/sentiment/aggregator');
    const result = await computeManipulationWarning({
      ticker: TEST_TICKER,
      cap_class: 'small_cap',
      bull_pct: 99,    // > 95
      mention_z: 10,   // > 5
      gini: 0.9,       // > 0.7
      now,
    });

    expect(result!.is_warning).toBe(true);
    expect(result!.rule_version).toBe('pdd-v1.0');
    // lexicographically sorted union
    expect(result!.matched_rules).toEqual(
      ['account_age', 'bull_pct', 'cap_class', 'gini', 'mention_z'],
    );

    const rows = await prisma.manipulationWarning.findMany({ where: { ticker: TEST_TICKER } });
    expect(rows.length).toBe(1);
    expect(rows[0].is_warning_fired).toBe(true);
    expect(rows[0].rule_version).toBe('pdd-v1.0');
    expect(rows[0].cap_class).toBe('small_cap');
    expect(rows[0].mean_account_age_days).toBeLessThan(90);
    expect(rows[0].mean_account_age_days).toBeGreaterThan(0);
  });

  it('non-firing inputs still write a telemetry row (FP review during shadow gate)', async () => {
    const prisma = await getPrisma();

    const now = new Date();
    await prisma.sentimentObservation.createMany({
      data: [{
        ticker: TEST_TICKER,
        source: 'stocktwits' as const,
        message_id: `pdd-quiet-${TEST_TICKER}-0`,
        author_id: `sha256:author-quiet-0`,
        fetched_at: now,
        published_at: now,
        raw_body_hash: 'b'.repeat(64),
        classifier_version: 'test-20-c-04',
        model_version: 'test-20-c-04',
        author_features_snapshot: { account_age_days: 1500 }, // > 90 — gate fails
      }],
    });

    const { computeManipulationWarning } = await import('@/lib/sentiment/aggregator');
    const result = await computeManipulationWarning({
      ticker: TEST_TICKER,
      cap_class: 'small_cap',
      bull_pct: 50,    // < 95 — gate fails
      mention_z: 1,    // < 5  — gate fails
      gini: 0.3,       // < 0.7 — gate fails
      now,
    });

    expect(result!.is_warning).toBe(false);

    // Telemetry row STILL persisted — operator reviews FP/TN distribution.
    const rows = await prisma.manipulationWarning.findMany({ where: { ticker: TEST_TICKER } });
    expect(rows.length).toBe(1);
    expect(rows[0].is_warning_fired).toBe(false);
    expect(rows[0].rule_version).toBe('pdd-v1.0');
  });

  it('mean_account_age_days is derived from the rolling 24h window only', async () => {
    const prisma = await getPrisma();
    const now = new Date();

    // Within-window: account_age_days=30
    // Outside-window (48h ago): account_age_days=5000 — must be EXCLUDED.
    await prisma.sentimentObservation.createMany({
      data: [
        {
          ticker: TEST_TICKER,
          source: 'stocktwits' as const,
          message_id: `pdd-win-${TEST_TICKER}-recent`,
          author_id: 'sha256:author-recent',
          fetched_at: now,
          published_at: now,
          raw_body_hash: 'c'.repeat(64),
          classifier_version: 'test-20-c-04',
          model_version: 'test-20-c-04',
          author_features_snapshot: { account_age_days: 30 },
        },
        {
          ticker: TEST_TICKER,
          source: 'stocktwits' as const,
          message_id: `pdd-win-${TEST_TICKER}-old`,
          author_id: 'sha256:author-old',
          fetched_at: new Date(now.getTime() - 48 * 3600 * 1000),
          published_at: new Date(now.getTime() - 48 * 3600 * 1000),
          raw_body_hash: 'd'.repeat(64),
          classifier_version: 'test-20-c-04',
          model_version: 'test-20-c-04',
          author_features_snapshot: { account_age_days: 5000 },
        },
      ],
    });

    const { computeManipulationWarning } = await import('@/lib/sentiment/aggregator');
    await computeManipulationWarning({
      ticker: TEST_TICKER,
      cap_class: 'small_cap',
      bull_pct: 99,
      mention_z: 10,
      gini: 0.9,
      now,
    });

    const rows = await prisma.manipulationWarning.findMany({ where: { ticker: TEST_TICKER } });
    expect(rows.length).toBe(1);
    // Only the within-window row (account_age=30) contributes — the 5000 entry
    // is filtered out by fetched_at >= since (24h boundary).
    expect(rows[0].mean_account_age_days).toBe(30);
    expect(rows[0].is_warning_fired).toBe(true);
  });
});
