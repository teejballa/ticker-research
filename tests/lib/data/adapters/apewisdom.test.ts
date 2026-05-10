/**
 * Plan 19-C-05 — ApeWisdom adapter unit tests (D-37).
 *
 * 6 tests covering the SUPPLEMENTAL community-data path:
 *   1. Returns null when API endpoint unreachable
 *   2. Returns CommunitySignal-shaped object on success
 *   3. Falls through to Redis cache on second call (fetch invoked once)
 *   4. Retries 5xx then succeeds
 *   5. Skips 4xx — surfaces null without retrying
 *   6. Rate-limit (HTTP 429) returns null without crashing primary path
 *
 * Per RESEARCH §Sources line 985, ApeWisdom exposes a free public endpoint
 * `/api/v1.0/filter/{filter}/page/{n}` that returns a list of trending tickers
 * with mention counts and a sentiment ratio. No auth header required.
 *
 * Per the threat model (T-19-C-05-01), the adapter MUST return null on any
 * non-2xx so a rate-limit on this supplemental never propagates and crashes
 * the canonical Firecrawl path.
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

import { fetchApeWisdom } from '@/lib/data/adapters/apewisdom';
import { __resetUpstashClientForTests } from '@/lib/data/cache/upstash';

/**
 * Synthetic ApeWisdom JSON envelope per RESEARCH §Sources line 985 — endpoint
 * shape `/api/v1.0/filter/all-stocks/page/1` returns `{ count, pages, results: [...] }`
 * where each result row carries `ticker`, `mentions`, `sentiment` (bullish 0-100),
 * and `rank`.
 */
function apewisdomPayload(rows: Array<{
  ticker: string;
  mentions: number;
  sentiment: number;
  rank: number;
}>) {
  return {
    count: rows.length,
    pages: 1,
    currentPage: 1,
    results: rows,
  };
}

describe('ApeWisdom adapter (Plan 19-C-05)', () => {
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

  it('returns null when endpoint unreachable (network error after retries)', async () => {
    const netErr = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    fetchSpy.mockRejectedValue(netErr);

    const sig = await fetchApeWisdom('AAPL');
    expect(sig).toBeNull();
    // 3 retry attempts default (per withRetry / D-25)
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('returns CommunitySignal-shaped object on success', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          apewisdomPayload([
            { ticker: 'AAPL', mentions: 142, sentiment: 73, rank: 4 },
            { ticker: 'TSLA', mentions: 250, sentiment: 60, rank: 2 },
          ]),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const sig = await fetchApeWisdom('AAPL');
    expect(sig).not.toBeNull();
    expect(sig).toMatchObject({
      source: 'apewisdom',
      mention_count: 142,
      trending_rank: 4,
    });
    // bullish_pct should be the sentiment field (0-100)
    expect(sig!.bullish_pct).toBeGreaterThan(0);
    // bearish_pct is the complement
    expect(sig).toHaveProperty('bearish_pct');
  });

  it('falls through to Redis cache on second call (fetch invoked once)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'http://upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    __resetUpstashClientForTests();

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify(
          apewisdomPayload([{ ticker: 'AAPL', mentions: 50, sentiment: 55, rank: 10 }]),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const a = await fetchApeWisdom('AAPL');
    const b = await fetchApeWisdom('AAPL');
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
            apewisdomPayload([{ ticker: 'AAPL', mentions: 99, sentiment: 80, rank: 1 }]),
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const sig = await fetchApeWisdom('AAPL');
    expect(sig).not.toBeNull();
    expect(sig!.mention_count).toBe(99);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('skips 4xx (404) — surfaces null without retry', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not found', { status: 404 }));

    const sig = await fetchApeWisdom('AAPL');
    expect(sig).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rate-limit (429) returns null without crashing primary path', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));

    const sig = await fetchApeWisdom('AAPL');
    // T-19-C-05-01: must be null, must NOT throw
    expect(sig).toBeNull();
    // 429 is 4xx — must NOT retry per D-25
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
