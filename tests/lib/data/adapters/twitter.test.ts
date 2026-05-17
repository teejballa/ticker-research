/**
 * Phase 30.1 (pivot 2026-05-16) — Xpoz Twitter adapter tests.
 *
 * Covers fetchTwitterCommunity (happy path, empty, normalization, error
 * fallback, since-window construction, composition wrapping) plus
 * isAuthenticTwitterUser (inauthentic flag, probability threshold, error
 * default-true).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  searchPostsMock,
  getUserMock,
  connectMock,
  XpozClientCtor,
  withTelemetryMock,
  withBreakerMock,
  withRetryMock,
} = vi.hoisted(() => {
  const searchPostsMock = vi.fn();
  const getUserMock = vi.fn();
  const connectMock = vi.fn(async () => {});
  const XpozClientCtor = vi.fn(function XpozClientCtor(this: unknown, _opts: { apiKey?: string }) {
    (this as { twitter: unknown; connect: unknown }).twitter = {
      searchPosts: searchPostsMock,
      getUser: getUserMock,
    };
    (this as { connect: unknown }).connect = connectMock;
  });
  const withTelemetryMock = vi.fn(<T,>(_id: string, fn: () => Promise<T>) => fn());
  const withBreakerMock = vi.fn(<T,>(_id: string, fn: () => Promise<T>) => fn());
  const withRetryMock = vi.fn(<T,>(fn: () => Promise<T>) => fn());
  return {
    searchPostsMock,
    getUserMock,
    connectMock,
    XpozClientCtor,
    withTelemetryMock,
    withBreakerMock,
    withRetryMock,
  };
});

vi.mock('@xpoz/xpoz', () => ({
  XpozClient: XpozClientCtor,
  ResponseType: { Fast: 'fast', Paging: 'paging', Csv: 'csv' },
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
  fetchTwitterCommunity,
  isAuthenticTwitterUser,
  _resetXpozClientForTests,
} from '@/lib/data/adapters/twitter';

function buildXpozTweet(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '1234',
    text: '$AAPL is going to the moon',
    authorUsername: 'cryptoBro',
    likeCount: 142,
    retweetCount: 28,
    replyCount: 9,
    quoteCount: 3,
    impressionCount: 10000,
    lang: 'en',
    isRetweet: false,
    possiblySensitive: false,
    createdAtDate: '2026-01-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('twitter adapter — fetchTwitterCommunity (Plan 30.1-pivot Task 3)', () => {
  beforeEach(() => {
    _resetXpozClientForTests();
    XpozClientCtor.mockClear();
    searchPostsMock.mockReset();
    getUserMock.mockReset();
    connectMock.mockClear();
    withTelemetryMock.mockClear();
    withBreakerMock.mockClear();
    withRetryMock.mockClear();
    vi.stubEnv('XPOZ_API_KEY', 'fake-xpoz-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns [] when ticker is empty', async () => {
    const r = await fetchTwitterCommunity('');
    expect(r).toEqual([]);
    expect(XpozClientCtor).not.toHaveBeenCalled();
  });

  it('constructs XpozClient with apiKey from XPOZ_API_KEY env on first call', async () => {
    searchPostsMock.mockResolvedValueOnce({ data: [] });
    await fetchTwitterCommunity('AAPL');
    expect(XpozClientCtor).toHaveBeenCalledWith({ apiKey: 'fake-xpoz-key' });
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('passes query, language=en, and startDate computed from sinceDays', async () => {
    searchPostsMock.mockResolvedValueOnce({ data: [] });
    await fetchTwitterCommunity('aapl', { limit: 25, sinceDays: 7 });
    expect(searchPostsMock).toHaveBeenCalledTimes(1);
    const [query, opts] = searchPostsMock.mock.calls[0];
    expect(query).toBe('"$AAPL" OR "AAPL stock"');
    expect(opts.language).toBe('en');
    expect(opts.limit).toBe(25);
    expect(opts.responseType).toBe('fast');
    // startDate is an ISO string ~7 days before now.
    const startDateMs = Date.parse(opts.startDate);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(startDateMs - sevenDaysAgo)).toBeLessThan(5_000);
    // Field set requested.
    expect(opts.fields).toContain('createdAtDate');
    expect(opts.fields).toContain('likeCount');
  });

  it('normalizes Xpoz tweet → snake_case TwitterPost shape with synthesized URL', async () => {
    const tweet = buildXpozTweet({
      id: '999',
      authorUsername: 'finBro',
      text: 'Buy AAPL now',
      likeCount: 500,
      retweetCount: 100,
      replyCount: 25,
      quoteCount: 5,
      impressionCount: 50000,
      createdAtDate: '2026-01-08T12:00:00.000Z',
    });
    searchPostsMock.mockResolvedValueOnce({ data: [tweet] });
    const posts = await fetchTwitterCommunity('AAPL');
    expect(posts).toHaveLength(1);
    const p = posts[0];
    expect(p.id).toBe('999');
    expect(p.author).toBe('finBro');
    expect(p.text).toBe('Buy AAPL now');
    expect(p.like_count).toBe(500);
    expect(p.retweet_count).toBe(100);
    expect(p.reply_count).toBe(25);
    expect(p.quote_count).toBe(5);
    expect(p.impression_count).toBe(50000);
    expect(p.lang).toBe('en');
    expect(p.is_retweet).toBe(false);
    expect(p.possibly_sensitive).toBe(false);
    expect(p.created_utc).toBe(Math.floor(Date.parse('2026-01-08T12:00:00.000Z') / 1000));
    expect(p.url).toBe('https://twitter.com/finBro/status/999');
  });

  it('filters out tweets with empty id', async () => {
    searchPostsMock.mockResolvedValueOnce({
      data: [
        buildXpozTweet({ id: '' }),
        buildXpozTweet({ id: 'good' }),
      ],
    });
    const posts = await fetchTwitterCommunity('AAPL');
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('good');
  });

  it('returns empty array on empty results', async () => {
    searchPostsMock.mockResolvedValueOnce({ data: [] });
    const posts = await fetchTwitterCommunity('AAPL');
    expect(posts).toEqual([]);
  });

  it('soft-fails to [] on SDK / network error', async () => {
    searchPostsMock.mockRejectedValueOnce(new Error('xpoz upstream 503'));
    const posts = await fetchTwitterCommunity('AAPL');
    expect(posts).toEqual([]);
  });

  it('wraps search with withTelemetry → withBreaker → withRetry (provider_id=twitter-xpoz)', async () => {
    searchPostsMock.mockResolvedValueOnce({ data: [] });
    await fetchTwitterCommunity('AAPL');
    expect(withTelemetryMock).toHaveBeenCalledTimes(1);
    expect(withBreakerMock).toHaveBeenCalledTimes(1);
    expect(withRetryMock).toHaveBeenCalledTimes(1);
    expect(withTelemetryMock.mock.calls[0][0]).toBe('twitter-xpoz');
    expect(withBreakerMock.mock.calls[0][0]).toBe('twitter-xpoz');
  });
});

describe('twitter adapter — isAuthenticTwitterUser (Plan 30.1-pivot Task 3 / D-39)', () => {
  beforeEach(() => {
    _resetXpozClientForTests();
    XpozClientCtor.mockClear();
    searchPostsMock.mockReset();
    getUserMock.mockReset();
    connectMock.mockClear();
    vi.stubEnv('XPOZ_API_KEY', 'fake-xpoz-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when isInauthentic is false and prob score ≤ 0.7', async () => {
    getUserMock.mockResolvedValueOnce({
      username: 'realUser',
      isInauthentic: false,
      isInauthenticProbScore: 0.2,
    });
    const ok = await isAuthenticTwitterUser('realUser');
    expect(ok).toBe(true);
  });

  it('returns true even when isInauthentic would be true (gate disabled 2026-05-16; Xpoz rejects the field)', async () => {
    getUserMock.mockResolvedValueOnce({
      username: 'botUser',
      isInauthentic: true,
      isInauthenticProbScore: 0.95,
    });
    const ok = await isAuthenticTwitterUser('botUser');
    expect(ok).toBe(true);
  });

  it('returns true even when isInauthenticProbScore > 0.7 (gate disabled 2026-05-16)', async () => {
    getUserMock.mockResolvedValueOnce({
      username: 'suspectUser',
      isInauthentic: false,
      isInauthenticProbScore: 0.75,
    });
    const ok = await isAuthenticTwitterUser('suspectUser');
    expect(ok).toBe(true);
  });

  it('returns true on Xpoz error (default-true so a flaky lookup never drops legit posts)', async () => {
    getUserMock.mockRejectedValueOnce(new Error('xpoz 503'));
    const ok = await isAuthenticTwitterUser('anyUser');
    expect(ok).toBe(true);
  });

  it('returns true when username is empty (no lookup)', async () => {
    const ok = await isAuthenticTwitterUser('');
    expect(ok).toBe(true);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('handles missing isInauthentic field gracefully (treats as authentic)', async () => {
    getUserMock.mockResolvedValueOnce({ username: 'anyone' });
    const ok = await isAuthenticTwitterUser('anyone');
    expect(ok).toBe(true);
  });
});
