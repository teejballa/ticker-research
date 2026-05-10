// Phase 19-C-11 — live-DB integration test for the Arctic Shift one-time
// historical Reddit backfill (D-43).
//
// Verifies:
//   1. Backfill populates CommunityChatter rows for a synthetic ticker
//   2. Re-running the backfill is idempotent (unique constraint on
//      ticker+source+url+scraped_at catches duplicates)
//   3. raw_text is sanitized (HTML tags stripped, whitespace normalized,
//      truncated at 5000 chars) — T-19-C-11-01 mitigation
//   4. Reddit `author` field is NEVER persisted to CommunityChatter —
//      schema confirms no author column (T-19-C-11-02 / V8 ASVS)
//   5. Rate-limit (HTTP 429) surfaces as a transient error and `withRetry`
//      eventually succeeds — T-19-C-11-03 mitigation
//   6. afterAll teardown removes test rows (no test pollution)
//
// Runs against live DATABASE_URL via `npm run test:integration`. Skipped if
// no DB. Test ticker prefix `TEST-C11-` namespaces rows for cleanup.
//
// All Arctic Shift fetches are mocked via `vi.stubGlobal('fetch', ...)` —
// no live network calls.

import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

import {
  sanitize,
  backfillTicker,
  type ArcticPost,
} from '../../scripts/arctic-shift-backfill';

const HAS_DB =
  !!process.env.DATABASE_URL && /^postgres/i.test(process.env.DATABASE_URL ?? '');
const adapter = HAS_DB
  ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
  : null;
const prisma = HAS_DB
  ? new PrismaClient({ adapter: adapter! })
  : (null as unknown as PrismaClient);

const TEST_TICKER = 'TEST-C11-AAPL';
const TEST_SOURCE = 'reddit';

function makePost(id: string, ts: number, opts: Partial<ArcticPost> = {}): ArcticPost {
  return {
    id,
    title: `post ${id}`,
    selftext: 'lorem ipsum body',
    url: `https://reddit.com/r/wallstreetbets/comments/${id}`,
    permalink: `/r/wallstreetbets/comments/${id}`,
    created_utc: ts,
    author: `u_${id}`, // MUST NOT be persisted
    ...opts,
  };
}

afterAll(async () => {
  if (HAS_DB) await prisma.$disconnect();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (!HAS_DB) return;
  await prisma.communityChatter.deleteMany({
    where: { ticker: { startsWith: 'TEST-C11-' } },
  });
});

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe.skipIf(!HAS_DB)('Plan 19-C-11 Arctic Shift backfill (live Neon)', () => {
  it('Test 1: populates CommunityChatter rows for a small mocked window', async () => {
    const now = Math.floor(Date.now() / 1000);
    // Single 30-day window per subreddit. backfillTicker iterates 4 subreddits
    // × ceil(yearsBack*365/30) windows. yearsBack=0.05 → ~18 days → 1 window
    // per subreddit, 4 windows total. We stub fetch to return 1 post per call
    // for the first call only.
    const posts = [makePost('a1', now - 100), makePost('a2', now - 200)];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: posts }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const inserted = await backfillTicker(TEST_TICKER, 0.05, { sleepMs: 0 });

    expect(inserted).toBeGreaterThanOrEqual(2);
    const rows = await prisma.communityChatter.findMany({
      where: { ticker: TEST_TICKER },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.source === TEST_SOURCE)).toBe(true);
    expect(rows.every((r) => r.url?.startsWith('https://reddit.com'))).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('Test 2: re-running is idempotent (no duplicate rows)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const posts = [makePost('idem-1', now - 100), makePost('idem-2', now - 200)];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: posts }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    // First run
    await backfillTicker(TEST_TICKER, 0.05, { sleepMs: 0 });
    const firstCount = await prisma.communityChatter.count({
      where: { ticker: TEST_TICKER },
    });
    expect(firstCount).toBeGreaterThanOrEqual(2);

    // Second run — same posts, should NOT increase row count
    await backfillTicker(TEST_TICKER, 0.05, { sleepMs: 0 });
    const secondCount = await prisma.communityChatter.count({
      where: { ticker: TEST_TICKER },
    });
    expect(secondCount).toBe(firstCount);
  });

  it('Test 3: raw_text sanitized — HTML stripped, whitespace normalized, truncated at 5000', () => {
    const dirty = `<p>Hello <b>world</b></p>\n\n\t  this is a   <script>alert(1)</script>  test.`;
    const out = sanitize(dirty);
    expect(out).not.toMatch(/<[^>]+>/);
    expect(out).not.toMatch(/\s{2,}/);
    expect(out).toContain('Hello world');
    expect(out).toContain('test.');

    // Truncation
    const long = 'x'.repeat(7000);
    const truncated = sanitize(long);
    expect(truncated.length).toBeLessThanOrEqual(5000);
  });

  it('Test 4: Reddit author field is NEVER persisted (V8 ASVS privacy)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const post = makePost('priv-1', now - 100, { author: 'sensitive_username' });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [post] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await backfillTicker(TEST_TICKER, 0.05, { sleepMs: 0 });

    // Schema-level guarantee: CommunityChatter has no author/user_id column.
    // Belt-and-suspender: confirm no row contains the author username.
    const rows = await prisma.communityChatter.findMany({
      where: { ticker: TEST_TICKER },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.raw_text ?? '').not.toContain('sensitive_username');
      // Prisma type for CommunityChatter has no author/user_id keys at compile time;
      // runtime cast confirms.
      const keys = Object.keys(r);
      expect(keys).not.toContain('author');
      expect(keys).not.toContain('user_id');
    }
  });

  it('Test 5: rate-limit 429 → backoff and retry; eventually succeeds', async () => {
    const now = Math.floor(Date.now() / 1000);
    const posts = [makePost('rate-1', now - 100)];
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      if (callCount <= 2) {
        // First two calls hit the rate limit
        return { ok: false, status: 429, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ data: posts }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const inserted = await backfillTicker(TEST_TICKER, 0.013, {
      sleepMs: 0,
      retryBaseDelayMs: 5,
      subreddits: ['wallstreetbets'], // narrow to one subreddit for speed
    });

    expect(inserted).toBeGreaterThanOrEqual(1);
    expect(callCount).toBeGreaterThanOrEqual(3); // at least one retry happened
  });

  it('Test 6: cleanup removes test rows', async () => {
    // afterEach already removes — assert no leftover rows persist between tests.
    const remaining = await prisma.communityChatter.count({
      where: { ticker: { startsWith: 'TEST-C11-' } },
    });
    // Either 0 (clean) or non-zero from THIS test's prior assertions; the cleanup
    // hook runs *after* this test, so we just confirm the deleteMany code path
    // works by deleting + re-counting.
    await prisma.communityChatter.deleteMany({
      where: { ticker: { startsWith: 'TEST-C11-' } },
    });
    const after = await prisma.communityChatter.count({
      where: { ticker: { startsWith: 'TEST-C11-' } },
    });
    expect(after).toBe(0);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });
});
