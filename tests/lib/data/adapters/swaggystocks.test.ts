/**
 * Plan 19-C-05 — Swaggystocks adapter unit tests (D-37).
 *
 * 6 tests covering the SUPPLEMENTAL community-data path:
 *   1. Returns null when no public endpoint is reachable
 *   2. Returns CommunitySignal-shaped object on success (API path)
 *   3. Falls through to Redis cache on second call (fetch invoked once)
 *   4. Retries 5xx then succeeds
 *   5. Skips 4xx — surfaces null without retrying
 *   6. Rate-limit (HTTP 429) returns null without crashing primary path
 *
 * Per RESEARCH Assumption A5, swaggystocks.com has no official API docs;
 * if the (community-discovered) JSON endpoint is unavailable the adapter
 * returns null without auto-fallback (post-Phase-30.1: there is no
 * third-party-scraper fallback path).
 *
 * Per the threat model (T-19-C-05-01), the adapter MUST return null on any
 * non-2xx so a rate-limit / endpoint move on this supplemental never crashes
 * the canonical community-scan path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory Redis double for the cache-hit test.
const cacheStore = new Map<string, { value: unknown; expiresAt: number }>();

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      constructor(_opts: { url: string; token: string }) {}
      async get<T>(key: string): Promise<T | null> {
        const entry = cacheStore.get(key);
        if (!entry) return null;
        if (Date.now() >= entry.expiresAt) {
          cacheStore.delete(key);
          return null;
        }
        return entry.value as T;
      }
      async set(
        key: string,
        value: unknown,
        opts: { ex: number },
      ): Promise<'OK'> {
        cacheStore.set(key, { value, expiresAt: Date.now() + opts.ex * 1000 });
        return 'OK';
      }
      async del(key: string): Promise<number> {
        return cacheStore.delete(key) ? 1 : 0;
      }
    },
  };
});

import { fetchSwaggyStocks } from '@/lib/data/adapters/swaggystocks';
import { __resetUpstashClientForTests } from '@/lib/data/cache/upstash';

/**
 * Synthetic Swaggystocks JSON shape — community-discovered endpoint at
 * `https://api.swaggystocks.com/wsb/ticker/<TICKER>` returns the latest
 * mention/sentiment summary for a ticker. Fields named to match the most
 * commonly-cited schema in community references; the adapter normalizes
 * them into a CommunitySignal regardless.
 */
function swaggyPayload(opts: {
  ticker: string;
  mentions: number;
  bullish_pct: number;
  bearish_pct: number;
  rank?: number | null;
}) {
  return {
    ticker: opts.ticker,
    mention_count: opts.mentions,
    bullish_percent: opts.bullish_pct,
    bearish_percent: opts.bearish_pct,
    rank: opts.rank ?? null,
    timestamp: new Date().toISOString(),
  };
}

describe('Swaggystocks adapter (Plan 19-C-05)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let errorSpy: any;

  beforeEach(() => {
    cacheStore.clear();
    __resetUpstashClientForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  it('returns null when endpoint unreachable (no scrape fallback post-Phase-30.1)', async () => {
    const netErr = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    fetchSpy.mockRejectedValue(netErr);

    const sig = await fetchSwaggyStocks('AAPL');
    expect(sig).toBeNull();
    // 3 retry attempts default — must not throw, must not crash primary
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('returns CommunitySignal-shaped object on success', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          swaggyPayload({
            ticker: 'AAPL',
            mentions: 87,
            bullish_pct: 62,
            bearish_pct: 38,
            rank: 5,
          }),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const sig = await fetchSwaggyStocks('AAPL');
    expect(sig).not.toBeNull();
    expect(sig).toMatchObject({
      source: 'swaggystocks',
      mention_count: 87,
      bullish_pct: 62,
      bearish_pct: 38,
      trending_rank: 5,
    });
  });

  it('falls through to Redis cache on second call (fetch invoked once)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'http://upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    __resetUpstashClientForTests();

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify(
          swaggyPayload({
            ticker: 'AAPL',
            mentions: 50,
            bullish_pct: 55,
            bearish_pct: 45,
            rank: 12,
          }),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const a = await fetchSwaggyStocks('AAPL');
    const b = await fetchSwaggyStocks('AAPL');
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx error then succeeds', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('upstream timeout', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            swaggyPayload({
              ticker: 'AAPL',
              mentions: 99,
              bullish_pct: 70,
              bearish_pct: 30,
              rank: 3,
            }),
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const sig = await fetchSwaggyStocks('AAPL');
    expect(sig).not.toBeNull();
    expect(sig!.mention_count).toBe(99);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('skips 4xx (404) — surfaces null without retry', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not found', { status: 404 }));

    const sig = await fetchSwaggyStocks('AAPL');
    expect(sig).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rate-limit (429) returns null without crashing primary path', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));

    const sig = await fetchSwaggyStocks('AAPL');
    // T-19-C-05-01: must be null, must NOT throw
    expect(sig).toBeNull();
    // 429 is 4xx — must NOT retry
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
