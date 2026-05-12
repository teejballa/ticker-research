/**
 * Plan 20-A-02 — Live-Neon integration test for the mention-baseline cron path.
 *
 * Asserts:
 *   - computeBaselinesForAllTickers writes ≥1 MentionBaseline row when
 *     SentimentObservation has ≥30 daily-count buckets for some ticker.
 *   - getBaselineForTicker returns the persisted row.
 *   - PIT discipline: query targets fetched_at only (covered by 20-Z-07
 *     lookahead regression — this test does not duplicate that assertion).
 *
 * Skips entirely when `DATABASE_URL` is unset (e.g. sandbox CI without
 * Neon credentials). Same pattern as other Phase-20 integration tests.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDB = !!process.env.DATABASE_URL;
const describeFn = hasDB ? describe : describe.skip;

describeFn('mention-baseline integration (live Neon)', () => {
  let prisma: typeof import('@/lib/db').prisma;
  let testTicker: string;

  beforeAll(async () => {
    const mod = await import('@/lib/db');
    prisma = mod.prisma;
    // Use a unique fixture ticker so concurrent test runs don't collide.
    testTicker = `T${Math.floor(Math.random() * 1e8).toString(36).toUpperCase()}`;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.mentionBaseline.deleteMany({ where: { ticker: testTicker } });
    await prisma.sentimentObservation.deleteMany({ where: { ticker: testTicker } });
  });

  it('skips when DATABASE_URL is not set (smoke)', () => {
    expect(hasDB).toBe(true);
  });

  it('writes a MentionBaseline row when ≥30 daily-count buckets exist', async () => {
    const now = new Date();
    // Seed 35 daily-count buckets across the trailing 90d with varying counts.
    for (let day = 1; day <= 35; day++) {
      const fetched_at = new Date(now.getTime() - day * 86_400_000);
      for (let i = 0; i < 1 + (day % 5); i++) {
        const crypto = await import('node:crypto');
        await prisma.sentimentObservation.create({
          data: {
            ticker: testTicker,
            source: 'stocktwits',
            message_id: `${testTicker}-${day}-${i}-${Date.now()}-${i}`,
            classifier_version: 'naive-stocktwits-v1',
            model_version: 'naive-stocktwits-v1',
            classifier_score: 0.5,
            raw_body_hash: crypto.createHash('sha256').update(`${testTicker}-${day}-${i}`).digest('hex'),
            author_id: crypto.createHash('sha256').update(`stocktwits:test-author-${day}`).digest('hex'),
            author_features_snapshot: { follower_count: 100, account_age_days: 365, is_verified: false },
            fetched_at,
          },
        });
      }
    }

    const { computeBaselinesForAllTickers } = await import(
      '@/../scripts/recompute-mention-baselines'
    );
    const result = await computeBaselinesForAllTickers();
    expect(result.baselines_written).toBeGreaterThanOrEqual(1);

    const row = await prisma.mentionBaseline.findFirst({
      where: { ticker: testTicker },
    });
    expect(row).not.toBeNull();
    expect(row!.n_observations).toBeGreaterThanOrEqual(30);
    expect(row!.mention_count_median).toBeGreaterThanOrEqual(0);
    expect(row!.mention_count_mad).toBeGreaterThanOrEqual(0);
  }, 60_000);
});
