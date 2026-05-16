// tests/integration/sentiment-scan-reddit.integration.test.ts
//
// Plan 30.1-04 Tasks 1 + 2 — live-Neon integration test for the Reddit + HN
// SentimentObservation writers. Gated by:
//
//   RUN_LIVE_NEON=true RUN_LIVE_REDDIT=true npm run test:integration -- sentiment-scan-reddit
//
// When either env is unset, the test suite skips entirely (matches Plan 30.1-02
// style for consistency per WARNING-8). When both are set, the test:
//   1. Builds a fixture pair of RedditPost + HNStory rows.
//   2. Calls writeRedditObservations + writeHackerNewsObservations directly
//      with a unique test-ticker (`__30_1_04_TEST_${epoch}__`) so we don't
//      pollute prod observation rows.
//   3. Asserts that:
//      - 2 reddit rows land with source='reddit' + model_version='reddit-tag-v1'
//      - 1 hackernews row lands with source='hackernews' + model_version='hackernews-tag-v1'
//      - Each row's fetched_at matches new Date(created_utc/created_at_i * 1000).
//   4. Cleans up via prisma.sentimentObservation.deleteMany in afterAll.
//
// The DAO is insert-only by design (Phase 20-Z-01 immutability); cleanup is
// the test's responsibility, hence the unique-ticker namespacing.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config as loadEnv } from 'dotenv';
import type { RedditPost } from '@/lib/data/adapters/reddit';
import type { HNStory } from '@/lib/data/adapters/hackernews';

const RUN =
  process.env.RUN_LIVE_NEON === 'true' && process.env.RUN_LIVE_REDDIT === 'true';

// Lazy-load all DB-touching modules so we don't require DATABASE_URL at
// module-import time; mirrors the bot-filter.integration.test.ts pattern
// (consistency per WARNING-8). The writer module transitively imports
// observation-store → prisma, so we lazy-import it too.
async function getPrisma() {
  const { prisma } = await import('@/lib/db');
  return prisma;
}
async function getWriters() {
  return await import('@/lib/sentiment/community-observation-writers');
}

const TEST_TICKER = `__30_1_04_TEST_${Date.now()}__`;
const CREATED_AT_S = Math.floor(Date.UTC(2026, 4, 15, 12, 0, 0) / 1000); // 2026-05-15T12:00:00Z

const REDDIT_POSTS: RedditPost[] = [
  {
    id: 'r1',
    subreddit: 'wallstreetbets',
    title: 'AAPL puts loaded',
    selftext: 'thesis goes here',
    score: 142,
    num_comments: 50,
    upvote_ratio: 0.92,
    author: 'TestUser1',
    permalink: `/r/wallstreetbets/comments/30104test1/aapl_puts_loaded/`,
    created_utc: CREATED_AT_S,
    domain: 'self.wallstreetbets',
  },
  {
    id: 'r2',
    subreddit: 'stocks',
    title: 'AAPL fundamentals',
    selftext: 'second post',
    score: 22,
    num_comments: 11,
    upvote_ratio: 0.85,
    author: 'TestUser2',
    permalink: `/r/stocks/comments/30104test2/aapl_fundamentals/`,
    created_utc: CREATED_AT_S + 60,
    domain: 'self.stocks',
  },
];

const HN_STORIES: HNStory[] = [
  {
    objectID: `30104-test-hn-1`,
    title: 'AAPL discussion thread',
    url: null,
    story_text: null,
    points: 32,
    num_comments: 15,
    author: 'testpg',
    created_at_i: CREATED_AT_S,
    permalink: `https://news.ycombinator.com/item?id=30104-test-hn-1`,
  },
];

describe.skipIf(!RUN)('Plan 30.1-04 — sentiment-scan Reddit/HN writers (live Neon)', () => {
  beforeAll(() => {
    loadEnv({ path: '.env.local' });
    // Use a test-only pepper so rotation doesn't affect prod author_id rows.
    process.env.SENTIMENT_AUTHOR_PEPPER = 'test-pepper-30.1-04';
  });

  afterAll(async () => {
    // Cleanup: deleteMany all rows we wrote under the test ticker namespace.
    if (!RUN) return;
    const prisma = await getPrisma();
    try {
      await prisma.sentimentObservation.deleteMany({
        where: { ticker: TEST_TICKER },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('inserts Reddit observations with PIT-correct fetched_at = created_utc*1000', async () => {
    const { writeRedditObservations } = await getWriters();
    const results: Record<string, number> = {};
    await writeRedditObservations(TEST_TICKER, REDDIT_POSTS, results);

    expect(results[`reddit_obs_written_${TEST_TICKER}`]).toBe(2);
    expect(results[`reddit_obs_errors_${TEST_TICKER}`]).toBe(0);

    const prisma = await getPrisma();
    const rows = await prisma.sentimentObservation.findMany({
      where: { ticker: TEST_TICKER, source: 'reddit' },
      orderBy: { fetched_at: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].source).toBe('reddit');
    expect(rows[0].model_version).toBe('reddit-tag-v1');
    expect(rows[0].fetched_at.getTime()).toBe(CREATED_AT_S * 1000);
    expect(rows[1].fetched_at.getTime()).toBe((CREATED_AT_S + 60) * 1000);
    // Raw author NEVER persisted; author_id is a SHA-256 hex.
    expect(rows[0].author_id).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].author_id).not.toContain('TestUser1');
  });

  it('inserts HackerNews observations with PIT-correct fetched_at = created_at_i*1000', async () => {
    const { writeHackerNewsObservations } = await getWriters();
    const results: Record<string, number> = {};
    await writeHackerNewsObservations(TEST_TICKER, HN_STORIES, results);

    expect(results[`hackernews_obs_written_${TEST_TICKER}`]).toBe(1);
    expect(results[`hackernews_obs_errors_${TEST_TICKER}`]).toBe(0);

    const prisma = await getPrisma();
    const rows = await prisma.sentimentObservation.findMany({
      where: { ticker: TEST_TICKER, source: 'hackernews' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('hackernews');
    expect(rows[0].model_version).toBe('hackernews-tag-v1');
    expect(rows[0].fetched_at.getTime()).toBe(CREATED_AT_S * 1000);
    expect(rows[0].author_id).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].author_id).not.toContain('testpg');
  });

  it('re-running the writer is idempotent (P2002 → dupes counter, never throws)', async () => {
    const { writeRedditObservations } = await getWriters();
    const results: Record<string, number> = {};
    // Same fixtures, same model_version → expect every insert to dedupe.
    await writeRedditObservations(TEST_TICKER, REDDIT_POSTS, results);
    expect(results[`reddit_obs_written_${TEST_TICKER}`]).toBe(0);
    expect(results[`reddit_obs_dupes_${TEST_TICKER}`]).toBe(2);
    expect(results[`reddit_obs_errors_${TEST_TICKER}`]).toBe(0);
  });
});
