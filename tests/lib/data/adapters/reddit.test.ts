/**
 * Phase 30.1 (pivot 2026-05-16) — Xpoz Reddit adapter tests.
 *
 * Supersedes the Reddit OAuth + token-cache + rate-bucket tests from the
 * pre-pivot adapter. The new adapter is a thin wrapper over @xpoz/xpoz so
 * tests mock the SDK and assert: client construction with apiKey from env,
 * argument shape of searchPosts, normalization of Xpoz RedditPost → legacy
 * RedditPost, error → empty-array fallback, telemetry/breaker composition.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────
// SDK mock — captures constructor args + searchPosts calls.
// vi.hoisted() runs before vi.mock factories are evaluated so mock state can
// live across the hoist boundary.
// ─────────────────────────────────────────────────────────────────────────
const {
  searchPostsMock,
  connectMock,
  closeMock,
  XpozClientCtor,
  withTelemetryMock,
  withBreakerMock,
  withRetryMock,
} = vi.hoisted(() => {
  const searchPostsMock = vi.fn();
  const connectMock = vi.fn(async () => {});
  const closeMock = vi.fn(async () => {});
  const XpozClientCtor = vi.fn(function XpozClientCtor(this: unknown, _opts: { apiKey?: string }) {
    (this as { reddit: unknown; connect: unknown; close: unknown }).reddit = {
      searchPosts: searchPostsMock,
    };
    (this as { connect: unknown }).connect = connectMock;
    (this as { close: unknown }).close = closeMock;
  });
  const withTelemetryMock = vi.fn(<T,>(_id: string, fn: () => Promise<T>) => fn());
  const withBreakerMock = vi.fn(<T,>(_id: string, fn: () => Promise<T>) => fn());
  const withRetryMock = vi.fn(<T,>(fn: () => Promise<T>) => fn());
  return {
    searchPostsMock,
    connectMock,
    closeMock,
    XpozClientCtor,
    withTelemetryMock,
    withBreakerMock,
    withRetryMock,
  };
});

vi.mock('@xpoz/xpoz', () => ({
  XpozClient: XpozClientCtor,
  ResponseType: { Fast: 'fast', Paging: 'paging', Csv: 'csv' },
  XpozError: class XpozError extends Error {},
  AuthenticationError: class AuthenticationError extends Error {},
  XpozConnectionError: class XpozConnectionError extends Error {},
  OperationTimeoutError: class OperationTimeoutError extends Error {},
  OperationFailedError: class OperationFailedError extends Error {},
}));

vi.mock('@/lib/telemetry/withTelemetry', () => ({
  withTelemetry: withTelemetryMock,
}));
vi.mock('@/lib/data/circuit-breaker', () => ({
  withBreaker: withBreakerMock,
}));
vi.mock('@/lib/data/retry', () => ({
  withRetry: withRetryMock,
}));

import {
  fetchRedditCommunity,
  _resetXpozClientForTests,
  type RedditPost,
} from '@/lib/data/adapters/reddit';

// Helper — build a Xpoz-shaped RedditPost.
function buildXpozPost(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'abc',
    title: 'AAPL crushes earnings',
    selftext: 'body text',
    authorUsername: 'user1',
    subredditName: 'stocks',
    score: 142,
    upvotes: 142,
    commentsCount: 89,
    upvoteRatio: 0.87,
    permalink: '/r/stocks/comments/abc/aapl_crushes_earnings/',
    createdAtDate: '2026-01-08T00:00:00.000Z',
    domain: 'self.stocks',
    url: 'https://www.reddit.com/r/stocks/comments/abc',
    ...overrides,
  };
}

describe('reddit adapter (Xpoz) — fetchRedditCommunity (Plan 30.1-pivot Task 2)', () => {
  beforeEach(() => {
    _resetXpozClientForTests();
    XpozClientCtor.mockClear();
    searchPostsMock.mockReset();
    connectMock.mockClear();
    withTelemetryMock.mockClear();
    withBreakerMock.mockClear();
    withRetryMock.mockClear();
    vi.stubEnv('XPOZ_API_KEY', 'fake-key-from-env');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns [] when ticker is empty', async () => {
    const r = await fetchRedditCommunity('', 'stocks');
    expect(r).toEqual([]);
    expect(XpozClientCtor).not.toHaveBeenCalled();
  });

  it('returns [] when subreddit is empty', async () => {
    const r = await fetchRedditCommunity('AAPL', '');
    expect(r).toEqual([]);
    expect(XpozClientCtor).not.toHaveBeenCalled();
  });

  it('constructs XpozClient with apiKey from XPOZ_API_KEY env on first call', async () => {
    searchPostsMock.mockResolvedValueOnce({ data: [] });
    await fetchRedditCommunity('AAPL', 'stocks');
    expect(XpozClientCtor).toHaveBeenCalledTimes(1);
    expect(XpozClientCtor).toHaveBeenCalledWith({ apiKey: 'fake-key-from-env' });
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('reuses XpozClient singleton across concurrent calls', async () => {
    searchPostsMock.mockResolvedValue({ data: [] });
    await Promise.all([
      fetchRedditCommunity('AAPL', 'stocks'),
      fetchRedditCommunity('NVDA', 'wallstreetbets'),
      fetchRedditCommunity('GME', 'Superstonk'),
    ]);
    // Single client/connect across the three concurrent calls.
    expect(XpozClientCtor).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    // But three searchPosts calls.
    expect(searchPostsMock).toHaveBeenCalledTimes(3);
  });

  it('passes the subreddit, sort, time, limit, and Lucene query to searchPosts', async () => {
    searchPostsMock.mockResolvedValueOnce({ data: [] });
    await fetchRedditCommunity('aapl', 'wallstreetbets', { limit: 10 });
    expect(searchPostsMock).toHaveBeenCalledTimes(1);
    const [query, opts] = searchPostsMock.mock.calls[0];
    // Query uppercases ticker and uses Lucene-style OR clauses.
    expect(query).toBe('"$AAPL" OR "AAPL stock" OR "AAPL shares"');
    expect(opts.subreddit).toBe('wallstreetbets');
    expect(opts.sort).toBe('new');
    expect(opts.time).toBe('week');
    expect(opts.limit).toBe(10);
    expect(opts.responseType).toBe('fast');
    expect(Array.isArray(opts.fields)).toBe(true);
    expect(opts.fields).toContain('createdAtDate');
    expect(opts.fields).toContain('commentsCount');
  });

  it('defaults limit to 25 when opts.limit is omitted', async () => {
    searchPostsMock.mockResolvedValueOnce({ data: [] });
    await fetchRedditCommunity('AAPL', 'stocks');
    const [, opts] = searchPostsMock.mock.calls[0];
    expect(opts.limit).toBe(25);
  });

  it('normalizes Xpoz post → legacy snake_case RedditPost shape', async () => {
    const xpozPost = buildXpozPost({
      id: 'p1',
      title: 'AAPL puts looking juicy',
      selftext: 'wsb DD',
      authorUsername: 'Foo',
      subredditName: 'wallstreetbets',
      score: 200,
      commentsCount: 50,
      upvoteRatio: 0.92,
      permalink: '/r/wallstreetbets/comments/p1/aapl_puts/',
      createdAtDate: '2026-01-08T12:00:00.000Z',
      domain: 'self.wallstreetbets',
    });
    searchPostsMock.mockResolvedValueOnce({ data: [xpozPost] });
    const posts = await fetchRedditCommunity('AAPL', 'wallstreetbets');
    expect(posts).toHaveLength(1);
    const p: RedditPost = posts[0];
    expect(p.id).toBe('p1');
    expect(p.title).toBe('AAPL puts looking juicy');
    expect(p.selftext).toBe('wsb DD');
    expect(p.author).toBe('Foo');
    expect(p.subreddit).toBe('wallstreetbets');
    expect(p.score).toBe(200);
    expect(p.num_comments).toBe(50);
    expect(p.upvote_ratio).toBeCloseTo(0.92);
    expect(p.permalink).toBe('/r/wallstreetbets/comments/p1/aapl_puts/');
    expect(p.domain).toBe('self.wallstreetbets');
    // ISO → Unix epoch SECONDS.
    expect(p.created_utc).toBe(Math.floor(Date.parse('2026-01-08T12:00:00.000Z') / 1000));
  });

  it('parses upvoteRatio as float when SDK returns a string', async () => {
    const xpozPost = buildXpozPost({ upvoteRatio: '0.73' as unknown as number });
    searchPostsMock.mockResolvedValueOnce({ data: [xpozPost] });
    const posts = await fetchRedditCommunity('AAPL', 'stocks');
    expect(posts[0].upvote_ratio).toBeCloseTo(0.73);
  });

  it('defaults missing or malformed fields to safe values', async () => {
    const xpozPost = {
      // Mostly empty — adapter must NOT throw, must coerce to safe defaults.
      id: 'minimal',
      createdAtDate: '2026-01-08T00:00:00.000Z',
    };
    searchPostsMock.mockResolvedValueOnce({ data: [xpozPost] });
    const posts = await fetchRedditCommunity('AAPL', 'stocks');
    expect(posts).toHaveLength(1);
    const p = posts[0];
    expect(p.id).toBe('minimal');
    expect(p.title).toBe('');
    expect(p.selftext).toBe('');
    expect(p.author).toBe('[deleted]');
    expect(p.subreddit).toBe('');
    expect(p.score).toBe(0);
    expect(p.num_comments).toBe(0);
    expect(p.upvote_ratio).toBe(0);
    expect(p.permalink).toBe('');
    expect(p.domain).toBe('');
    expect(p.created_utc).toBeGreaterThan(0);
  });

  it('falls back to createdAtTimestamp when createdAtDate is missing', async () => {
    const xpozPost = buildXpozPost({
      createdAtDate: null,
      createdAtTimestamp: 1715200000,
    });
    searchPostsMock.mockResolvedValueOnce({ data: [xpozPost] });
    const posts = await fetchRedditCommunity('AAPL', 'stocks');
    expect(posts[0].created_utc).toBe(1715200000);
  });

  it('filters out posts with empty id', async () => {
    searchPostsMock.mockResolvedValueOnce({
      data: [
        buildXpozPost({ id: '' }),
        buildXpozPost({ id: 'good' }),
      ],
    });
    const posts = await fetchRedditCommunity('AAPL', 'stocks');
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('good');
  });

  it('returns empty array on empty results', async () => {
    searchPostsMock.mockResolvedValueOnce({ data: [] });
    const posts = await fetchRedditCommunity('AAPL', 'stocks');
    expect(posts).toEqual([]);
  });

  it('soft-fails to [] on SDK / network error (crons never 500)', async () => {
    searchPostsMock.mockRejectedValueOnce(new Error('xpoz upstream 503'));
    const posts = await fetchRedditCommunity('AAPL', 'stocks');
    expect(posts).toEqual([]);
  });

  it('wraps the search with withTelemetry → withBreaker → withRetry composition', async () => {
    searchPostsMock.mockResolvedValueOnce({ data: [] });
    await fetchRedditCommunity('AAPL', 'stocks');
    // Each layer must have run exactly once (one provider call).
    expect(withTelemetryMock).toHaveBeenCalledTimes(1);
    expect(withBreakerMock).toHaveBeenCalledTimes(1);
    expect(withRetryMock).toHaveBeenCalledTimes(1);
    // Both telemetry + breaker must be tagged with the new provider_id.
    expect(withTelemetryMock.mock.calls[0][0]).toBe('reddit-xpoz');
    expect(withBreakerMock.mock.calls[0][0]).toBe('reddit-xpoz');
  });
});
