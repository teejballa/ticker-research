import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import {
  insertObservation,
  SentimentObservationDuplicateError,
} from '@/lib/sentiment/observation-store';

/**
 * Plan 20-Z-01 — Integration test against live Neon.
 * Acceptance gate per CONTEXT.md line 89:
 *   "Live for ≥1 cron cycle; lookahead-bias regression test (20-Z-07) green; 0 NULL fetched_at."
 *
 * This test covers the first ("≥1 row written") and third ("0 NULL fetched_at") gates.
 * The 20-Z-07 lookahead test ships in its own plan.
 *
 * Uses the project-standard PrismaNeon adapter (matches tests/integration/schema-phase-17.test.ts).
 */
const HAS_DB = !!process.env.DATABASE_URL;
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

const TEST_TICKER = `TEST20Z01_${Date.now()}`; // unique per-run to avoid collision
const TEST_MODEL_VERSION = 'stocktwits-tag-v1';

beforeAll(async () => {
  if (!HAS_DB) {
    throw new Error('Integration test requires DATABASE_URL in .env.local');
  }
});

afterAll(async () => {
  if (!HAS_DB) return;
  // Best-effort cleanup; safe even if some inserts failed.
  await prisma.sentimentObservation.deleteMany({ where: { ticker: TEST_TICKER } });
  await prisma.$disconnect();
});

describe.skipIf(!HAS_DB)('SentimentObservation — live-Neon integration', () => {
  it('writes ≥1 row in one simulated cron-equivalent invocation', async () => {
    const r = await insertObservation({
      ticker: TEST_TICKER,
      source: 'stocktwits',
      message_id: 'integ-msg-1',
      raw_body: 'integration test body',
      classifier_version: TEST_MODEL_VERSION,
      classifier_score: 0.5,
      model_version: TEST_MODEL_VERSION,
      decay_weight: null,
      author_id: 'sha256:integ',
      author_features_snapshot: {
        account_age_days: 365,
        follower_count: 10,
        is_verified: false,
        message_count_30d: 3,
      },
    });
    // UUID v4 shape (8-4-4-4-12 hex chars)
    expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    const count = await prisma.sentimentObservation.count({ where: { ticker: TEST_TICKER } });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('every persisted row has NON-NULL fetched_at (PIT invariant)', async () => {
    const nullCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "sentiment_observations" WHERE "fetched_at" IS NULL`,
    );
    expect(Number(nullCount[0].count)).toBe(0);
  });

  it('enforces (ticker, message_id, model_version) composite uniqueness — backfill same-version is rejected', async () => {
    // Same triple as the first write → must throw the typed duplicate error.
    await expect(
      insertObservation({
        ticker: TEST_TICKER,
        source: 'stocktwits',
        message_id: 'integ-msg-1',
        raw_body: 'integration test body',
        classifier_version: TEST_MODEL_VERSION,
        classifier_score: 0.7,
        model_version: TEST_MODEL_VERSION,
        decay_weight: null,
        author_id: 'sha256:integ',
        author_features_snapshot: {
          account_age_days: 365,
          follower_count: 10,
          is_verified: false,
          message_count_30d: 3,
        },
      }),
    ).rejects.toBeInstanceOf(SentimentObservationDuplicateError);
  });

  it('allows insert under a NEW model_version for the same (ticker, message_id) — backfill PIT pattern', async () => {
    const r = await insertObservation({
      ticker: TEST_TICKER,
      source: 'stocktwits',
      message_id: 'integ-msg-1',
      raw_body: 'integration test body',
      classifier_version: 'finbert-prosus@sha-DUMMY',
      classifier_score: -0.2, // a new classifier scored it differently
      model_version: 'finbert-prosus@sha-DUMMY', // ← NEW model_version → allowed
      decay_weight: null,
      author_id: 'sha256:integ',
      author_features_snapshot: {
        account_age_days: 365,
        follower_count: 10,
        is_verified: false,
        message_count_30d: 3,
      },
    });
    expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('both required composite indexes exist on the table', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname::text AS indexname FROM pg_indexes
       WHERE tablename = 'sentiment_observations' AND indexname LIKE 'idx_sentobs_%'`,
    );
    const indexNames = rows.map(r => r.indexname).sort();
    expect(indexNames).toContain('idx_sentobs_ticker_fetched_at');
    expect(indexNames).toContain('idx_sentobs_ticker_modelver_fetched_at');
    expect(indexNames.length).toBeGreaterThanOrEqual(2);
  });

  it('raw_body_hash is a 64-char lowercase SHA-256 hex (T-20-Z-01-02)', async () => {
    const row = await prisma.sentimentObservation.findFirst({
      where: { ticker: TEST_TICKER, message_id: 'integ-msg-1', model_version: TEST_MODEL_VERSION },
    });
    expect(row).not.toBeNull();
    expect(row!.raw_body_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
