/**
 * Plan 30.1-02 — Reddit adapter implementation tests.
 *
 * Wave 0 frozen-contract tests (Plan 30.1-01) are preserved verbatim.
 * Wave 1 (this plan) adds OAuth token mint + cache + SETNX (Task 1),
 * atomic rate bucket (Task 2), per-sub search + Promise.allSettled fan-out
 * with composition wrapping (Task 3).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Per-test mock state for Upstash REST primitives. We mock @/lib/data/cache/upstash
// to return an object that exposes the methods reddit.ts actually calls.
const setMock = vi.fn();
const getMock = vi.fn();
const delMock = vi.fn();
const incrMock = vi.fn();
const expireMock = vi.fn();

let upstashClientOverride: unknown | null = {
  get: getMock,
  set: setMock,
  del: delMock,
  incr: incrMock,
  expire: expireMock,
};

vi.mock('@/lib/data/cache/upstash', () => ({
  getRedis: () => upstashClientOverride,
}));

// Composition wrappers — pass-through to the inner fn so we can assert on
// fetch calls / RedditPost mapping without running the real breaker / telemetry
// / retry stacks. We assert the COMPOSITION ORDER separately via static greps
// in the plan's acceptance criteria.
vi.mock('@/lib/telemetry/withTelemetry', () => ({
  withTelemetry: <T,>(_id: string, fn: () => Promise<T>) => fn(),
}));
vi.mock('@/lib/data/circuit-breaker', () => ({
  withBreaker: <T,>(_id: string, fn: () => Promise<T>) => fn(),
}));

import {
  USER_AGENT,
  TOKEN_ENDPOINT,
  OAUTH_BASE,
  fetchRedditCommunity,
  getRedditToken,
  consumeRateToken,
  type RedditPost,
} from '@/lib/data/adapters/reddit';

// ──────────────────────────────────────────────────────────────────────────
// Wave 0 frozen contracts — preserved verbatim from plan 30.1-01.
// ──────────────────────────────────────────────────────────────────────────

describe('reddit adapter — Wave 0 frozen contracts (Plan 30.1-01)', () => {
  it('exports the mandatory User-Agent string per D-06', () => {
    expect(USER_AGENT).toBe('Cipher/1.0 (by /u/cipher-research)');
  });

  it('exports the OAuth token endpoint per D-01', () => {
    expect(TOKEN_ENDPOINT).toBe('https://www.reddit.com/api/v1/access_token');
  });

  it('exports the OAUTH_BASE per D-01', () => {
    expect(OAUTH_BASE).toBe('https://oauth.reddit.com');
  });

  it('exports the RedditPost type shape (10 fields, D-14)', () => {
    const sample: RedditPost = {
      id: '1', subreddit: 's', title: 't', selftext: '', score: 0,
      num_comments: 0, upvote_ratio: 1, author: 'a', permalink: '/r/x/comments/1/t/',
      created_utc: 1715200000, domain: 'self.s',
    };
    expect(sample.id).toBe('1');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Plan 30.1-02 — implementation tests.
// ──────────────────────────────────────────────────────────────────────────

describe('reddit adapter — OAuth Token mintFresh + getRedditToken (Plan 30.1-02 Task 1)', () => {
  beforeEach(() => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'sec');
    setMock.mockReset();
    getMock.mockReset();
    delMock.mockReset();
    incrMock.mockReset();
    expireMock.mockReset();
    upstashClientOverride = {
      get: getMock, set: setMock, del: delMock, incr: incrMock, expire: expireMock,
    };
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mintFreshToken throws when REDDIT_CLIENT_ID is unset', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', '');
    // No cached token, lock acquired, then mint fires and should throw fail-fast.
    getMock.mockResolvedValue(null);
    setMock.mockResolvedValue('OK');
    await expect(getRedditToken()).rejects.toThrow(/REDDIT_CLIENT_ID\/SECRET unset/);
  });

  it('mintFreshToken POSTs with Basic Auth + UA + grant_type=client_credentials', async () => {
    // Force cache miss and lock acquired so mint runs.
    getMock.mockResolvedValue(null);
    setMock.mockResolvedValue('OK');
    delMock.mockResolvedValue(1);
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'fresh',
          token_type: 'bearer',
          expires_in: 86400,
          scope: '*',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await getRedditToken();

    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(TOKEN_ENDPOINT);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^Basic /);
    expect(headers['User-Agent']).toBe(USER_AGENT);
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect((init as RequestInit).body).toBe('grant_type=client_credentials');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('getRedditToken returns cached value when present', async () => {
    getMock.mockResolvedValueOnce('cached-tok');
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    const tok = await getRedditToken();
    expect(tok).toBe('cached-tok');
    expect(f).not.toHaveBeenCalled();
  });

  it('getRedditToken mints and caches with TTL = expires_in - 60', async () => {
    getMock.mockResolvedValueOnce(null); // first read — cache miss
    // SETNX lock acquired, then SET token write.
    setMock.mockResolvedValueOnce('OK').mockResolvedValueOnce('OK');
    delMock.mockResolvedValue(1);
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'fresh',
          token_type: 'bearer',
          expires_in: 86400,
          scope: '*',
        }),
        { status: 200 },
      ),
    );

    const tok = await getRedditToken();
    expect(tok).toBe('fresh');

    // Verify the second `set` is the token-write with ex = expires_in - 60 = 86340.
    const tokenWrite = setMock.mock.calls.find(
      (call) => call[0] === 'reddit:oauth_token',
    );
    expect(tokenWrite).toBeDefined();
    expect(tokenWrite![1]).toBe('fresh');
    expect(tokenWrite![2]).toEqual({ ex: 86340 });
  });

  it('getRedditToken honors SETNX dogpile guard (lock not held, second read wins)', async () => {
    getMock
      .mockResolvedValueOnce(null) // initial miss
      .mockResolvedValueOnce('late-cached-tok'); // post-wait re-read
    setMock.mockResolvedValueOnce(null); // SETNX lock NOT acquired
    delMock.mockResolvedValue(1);
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;

    const tok = await getRedditToken();
    expect(tok).toBe('late-cached-tok');
    expect(f).not.toHaveBeenCalled();
  });

  it('getRedditToken falls through to mint when Upstash is unavailable', async () => {
    upstashClientOverride = null; // graceful-degrade branch
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'no-cache-fresh',
          token_type: 'bearer',
          expires_in: 86400,
          scope: '*',
        }),
        { status: 200 },
      ),
    );
    const tok = await getRedditToken();
    expect(tok).toBe('no-cache-fresh');
    expect(f).toHaveBeenCalledTimes(1);
    // No Upstash methods should have been hit on this path.
    expect(getMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });

  it('mintFreshToken propagates !res.ok with err.status set so withRetry classifier works', async () => {
    upstashClientOverride = null; // simplify — direct mint path
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    // withRetry will see 4xx as non-retryable; surfaces immediately.
    f.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(getRedditToken()).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1); // 4xx => no retry
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Task 2 — consumeRateToken (atomic Upstash bucket).
// ──────────────────────────────────────────────────────────────────────────

describe('reddit adapter — consumeRateToken / rate bucket (Plan 30.1-02 Task 2)', () => {
  beforeEach(() => {
    setMock.mockReset();
    getMock.mockReset();
    delMock.mockReset();
    incrMock.mockReset();
    expireMock.mockReset();
    upstashClientOverride = {
      get: getMock, set: setMock, del: delMock, incr: incrMock, expire: expireMock,
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('consumeRateToken("report") returns ok at count 60 (default ceiling)', async () => {
    incrMock.mockResolvedValueOnce(60);
    const r = await consumeRateToken('report');
    expect(r).toBe('ok');
  });

  it('consumeRateToken("report") returns throttle at count 61 (default ceiling)', async () => {
    incrMock.mockResolvedValueOnce(61);
    const r = await consumeRateToken('report');
    expect(r).toBe('throttle');
  });

  it('consumeRateToken("cron") returns ok at count 40 (default ceiling)', async () => {
    incrMock.mockResolvedValueOnce(40);
    const r = await consumeRateToken('cron');
    expect(r).toBe('ok');
  });

  it('consumeRateToken("cron") returns throttle at count 41 (default ceiling)', async () => {
    incrMock.mockResolvedValueOnce(41);
    const r = await consumeRateToken('cron');
    expect(r).toBe('throttle');
  });

  it('consumeRateToken honors REDDIT_QPM_CEILING_REPORT env override', async () => {
    vi.stubEnv('REDDIT_QPM_CEILING_REPORT', '100');
    // Force a reset of the cached ceiling — adapter reads env per call so override is live.
    incrMock.mockResolvedValueOnce(100);
    expect(await consumeRateToken('report')).toBe('ok');
    incrMock.mockResolvedValueOnce(101);
    expect(await consumeRateToken('report')).toBe('throttle');
  });

  it('consumeRateToken sets EXPIRE on first INCR with key prefix reddit:rate_bucket: + ttl 65', async () => {
    incrMock.mockResolvedValueOnce(1);
    await consumeRateToken('report');
    expect(expireMock).toHaveBeenCalledTimes(1);
    const [key, ttl] = expireMock.mock.calls[0];
    expect(typeof key).toBe('string');
    expect(key.startsWith('reddit:rate_bucket:')).toBe(true);
    expect(ttl).toBe(65);
  });

  it('consumeRateToken does NOT call EXPIRE on subsequent INCRs (count > 1)', async () => {
    incrMock.mockResolvedValueOnce(5);
    await consumeRateToken('report');
    expect(expireMock).not.toHaveBeenCalled();
  });

  it('consumeRateToken degrades to ok when Upstash is unavailable', async () => {
    upstashClientOverride = null;
    const r = await consumeRateToken('report');
    expect(r).toBe('ok');
    expect(incrMock).not.toHaveBeenCalled();
  });

  it('consumeRateToken degrades to ok on Upstash INCR transient failure', async () => {
    incrMock.mockRejectedValueOnce(new Error('upstash 503'));
    const r = await consumeRateToken('report');
    expect(r).toBe('ok');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Task 3 — fetchRedditCommunity + per-sub search + Promise.allSettled.
// ──────────────────────────────────────────────────────────────────────────

function buildListing(children: Array<Record<string, unknown>>): {
  kind: 'Listing';
  data: { children: Array<{ kind: 't3'; data: Record<string, unknown> }> };
} {
  return {
    kind: 'Listing',
    data: { children: children.map((d) => ({ kind: 't3' as const, data: d })) },
  };
}

describe('reddit adapter — fetchRedditCommunity (Plan 30.1-02 Task 3)', () => {
  beforeEach(() => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'sec');
    setMock.mockReset();
    getMock.mockReset();
    delMock.mockReset();
    incrMock.mockReset();
    expireMock.mockReset();
    upstashClientOverride = {
      get: getMock, set: setMock, del: delMock, incr: incrMock, expire: expireMock,
    };
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetchRedditCommunity returns [] when subs is empty', async () => {
    const r = await fetchRedditCommunity('AAPL', []);
    expect(r).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetchRedditCommunity returns [] when consumeRateToken throttles', async () => {
    // Force bucket > ceiling on the first INCR.
    incrMock.mockResolvedValueOnce(9999);
    const r = await fetchRedditCommunity('AAPL', ['stocks'], 'report');
    expect(r).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetchRedditCommunity returns [] when token mint fails (env unset)', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', '');
    incrMock.mockResolvedValueOnce(1); // bucket OK
    getMock.mockResolvedValue(null); // cache miss
    setMock.mockResolvedValue('OK'); // lock + (would-be) token write
    const r = await fetchRedditCommunity('AAPL', ['stocks'], 'report');
    expect(r).toEqual([]);
  });

  it('fetchRedditCommunity maps response into RedditPost[]', async () => {
    incrMock.mockResolvedValueOnce(1);
    getMock.mockResolvedValueOnce('tok'); // cached token
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          buildListing([
            {
              id: 'abc', subreddit: 'stocks', title: 'AAPL puts', selftext: 'body',
              score: 142, num_comments: 89, upvote_ratio: 0.87, author: 'user1',
              permalink: '/r/stocks/comments/abc/aapl_puts/',
              created_utc: 1715200000, domain: 'self.stocks',
            },
            {
              id: 'def', subreddit: 'stocks', title: 'AAPL calls', selftext: '',
              score: 50, num_comments: 12, upvote_ratio: 0.7, author: 'user2',
              permalink: '/r/stocks/comments/def/aapl_calls/',
              created_utc: 1715200200, domain: 'self.stocks',
            },
          ]),
        ),
        { status: 200 },
      ),
    );

    const posts = await fetchRedditCommunity('AAPL', ['stocks'], 'report');
    expect(posts).toHaveLength(2);
    expect(posts[0].id).toBe('abc');
    expect(posts[0].score).toBe(142);
    expect(posts[0].created_utc).toBe(1715200000);
    expect(posts[1].id).toBe('def');
  });

  it('fetchRedditCommunity filters out posts with empty id or created_utc=0', async () => {
    incrMock.mockResolvedValueOnce(1);
    getMock.mockResolvedValueOnce('tok');
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          buildListing([
            { id: '', subreddit: 'stocks', title: 'no id', score: 1, num_comments: 1, created_utc: 1715200000 },
            { id: 'noTime', subreddit: 'stocks', title: 'no time', score: 1, num_comments: 1, created_utc: 0 },
            { id: 'good', subreddit: 'stocks', title: 'good', score: 1, num_comments: 1, created_utc: 1715200000 },
          ]),
        ),
        { status: 200 },
      ),
    );
    const posts = await fetchRedditCommunity('AAPL', ['stocks'], 'report');
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('good');
  });

  it('fetchRedditCommunity uses Promise.allSettled (per-sub 403 soft-skip; siblings still return)', async () => {
    incrMock.mockResolvedValueOnce(1);
    getMock.mockResolvedValueOnce('tok');
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    // First sub returns 403 (banned), second sub returns one post.
    f.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          buildListing([
            { id: 'x1', subreddit: 'stocks', title: 't', score: 1, num_comments: 1, created_utc: 1715200000 },
          ]),
        ),
        { status: 200 },
      ),
    );

    const posts = await fetchRedditCommunity('AAPL', ['banned-sub', 'stocks'], 'report');
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('x1');
  });

  it('fetchRedditCommunity sends User-Agent header on every search call', async () => {
    incrMock.mockResolvedValueOnce(1);
    getMock.mockResolvedValueOnce('tok');
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(
      new Response(JSON.stringify(buildListing([])), { status: 200 }),
    );
    await fetchRedditCommunity('AAPL', ['stocks', 'investing'], 'report');
    expect(f).toHaveBeenCalledTimes(2);
    for (const call of f.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers['User-Agent']).toBe(USER_AGENT);
    }
  });

  it('fetchRedditCommunity sends Authorization Bearer on every search call', async () => {
    incrMock.mockResolvedValueOnce(1);
    getMock.mockResolvedValueOnce('tok-abc');
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(
      new Response(JSON.stringify(buildListing([])), { status: 200 }),
    );
    await fetchRedditCommunity('AAPL', ['stocks', 'investing'], 'report');
    for (const call of f.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer tok-abc');
    }
  });

  it('fetchRedditCommunity uppercases ticker and encodes for the search query', async () => {
    incrMock.mockResolvedValueOnce(1);
    getMock.mockResolvedValueOnce('tok');
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(
      new Response(JSON.stringify(buildListing([])), { status: 200 }),
    );
    await fetchRedditCommunity('aapl', ['stocks'], 'report');
    const url = f.mock.calls[0][0] as string;
    expect(url).toContain('/r/stocks/search.json?q=AAPL');
    expect(url).toContain('restrict_sr=on&sort=new&t=week&limit=25');
  });
});
