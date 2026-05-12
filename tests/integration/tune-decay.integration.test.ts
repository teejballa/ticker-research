/**
 * Plan 20-A-03 — live-Neon integration test for DecayCalibration + aggregateDecayed.
 *
 * Skips when DATABASE_URL is unset (mirrors mention-baseline.integration.test.ts).
 * Run via `npm run test:integration`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { aggregateDecayed } from '@/lib/sentiment/aggregator';

const HAS_DB = !!process.env.DATABASE_URL;
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb('tune-decay integration (live Neon)', () => {
  let prisma: PrismaClient;
  const TEST_TICKER = 'TEST_DECAY';
  const FIXTURE_MODEL_VERSION = 'decay-test-fixture-v1';

  beforeAll(async () => {
    const adapter = new PrismaNeon({
      connectionString: process.env.DATABASE_URL!,
    });
    prisma = new PrismaClient({ adapter });
    // Cleanup any prior test rows
    await prisma.sentimentObservation.deleteMany({
      where: { ticker: TEST_TICKER },
    });
    await prisma.decayCalibration.deleteMany({
      where: { source_class: 'retail', model_version: FIXTURE_MODEL_VERSION },
    });
  });

  afterAll(async () => {
    await prisma.sentimentObservation.deleteMany({
      where: { ticker: TEST_TICKER },
    });
    await prisma.decayCalibration.deleteMany({
      where: { source_class: 'retail', model_version: FIXTURE_MODEL_VERSION },
    });
    await prisma.$disconnect();
  });

  it('aggregateDecayed returns uniform fallback on all-old rows (T-20-A-03-02)', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      ticker: TEST_TICKER,
      source: 'stocktwits',
      message_id: `msg-${i}`,
      classifier_score: 0.5,
      decay_weight: 1e-50, // effectively zero — triggers fallback (sum < EPSILON 1e-9)
    }));
    const r = aggregateDecayed(rows);
    expect(r.fallback_to_uniform).toBe(true);
    expect(r.weighted_score).toBeCloseTo(0.5, 6);
    expect(r.total_weight).toBe(0);
    expect(r.n_rows).toBe(5);
  });

  it('aggregateDecayed weighted-mean matches hand calc on synthetic rows', () => {
    const r = aggregateDecayed([
      {
        ticker: TEST_TICKER,
        source: 'stocktwits',
        message_id: '1',
        classifier_score: 1.0,
        decay_weight: 1.0,
      },
      {
        ticker: TEST_TICKER,
        source: 'stocktwits',
        message_id: '2',
        classifier_score: -1.0,
        decay_weight: 0.5,
      },
    ]);
    expect(r.weighted_score).toBeCloseTo(
      (1.0 * 1.0 + -1.0 * 0.5) / (1.0 + 0.5),
      9,
    );
    expect(r.fallback_to_uniform).toBe(false);
  });

  it('DecayCalibration table accepts an insert with all required fields', async () => {
    const row = await prisma.decayCalibration.create({
      data: {
        source_class: 'retail',
        lambda_per_day: 0.5,
        half_life_days: Math.LN2 / 0.5,
        icir_uplift_vs_no_decay: 0.07, // > gate of 0.05
        training_window_days: 90,
        n_observations: 120, // > gate of 60
        model_version: FIXTURE_MODEL_VERSION,
      },
    });
    expect(row.id).toBeTruthy();
    expect(row.training_window_days).toBe(90);
    expect(row.icir_uplift_vs_no_decay).toBeCloseTo(0.07, 9);
  });

  it('DecayCalibration query by (source_class, computed_at DESC) returns most-recent first', async () => {
    // Insert two rows for the same class; verify ordering
    await prisma.decayCalibration.create({
      data: {
        source_class: 'retail',
        lambda_per_day: 0.6,
        half_life_days: Math.LN2 / 0.6,
        icir_uplift_vs_no_decay: 0.08,
        training_window_days: 90,
        n_observations: 200,
        model_version: FIXTURE_MODEL_VERSION,
      },
    });
    const rows = await prisma.decayCalibration.findMany({
      where: {
        source_class: 'retail',
        model_version: FIXTURE_MODEL_VERSION,
      },
      orderBy: { computed_at: 'desc' },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // Most recent first
    expect(rows[0].computed_at.getTime()).toBeGreaterThanOrEqual(
      rows[1].computed_at.getTime(),
    );
  });
});
