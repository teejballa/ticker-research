/**
 * Plan 19-B-03 — Tiingo adapter unit tests (D-26).
 *
 * 9 tests covering:
 *   1. Returns null when TIINGO_API_KEY missing
 *   2. fetchTiingoQuote returns MarketDataSection-shaped object on success
 *   3. fetchTiingoFundamentals returns FundamentalsSection-shaped object
 *   4. Falls through to Redis cache on second call
 *   5. Retries 5xx error then succeeds
 *   6. Does NOT retry 401 — surfaces immediately as null
 *   7. API key NEVER appears in any logged string  (T-19-B-03 mitigation)
 *   8. Returns null when fetch throws after maxAttempts retries
 *   9. (Live, skipped by default) live API call returns valid quote for AAPL
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory Redis double so we can verify cache hits (Test 4).
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

import {
  fetchTiingoQuote,
  fetchTiingoFundamentals,
} from '@/lib/data/adapters/tiingo';
import { __resetUpstashClientForTests } from '@/lib/data/cache/upstash';

// Sentinel API key — every test that exercises auth uses this exact value so we
// can grep console output and prove it never escaped.
const SENTINEL_KEY = 'tk_phase19_test_sentinel_xyz';

describe('Tiingo adapter (Plan 19-B-03)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cacheStore.clear();
    __resetUpstashClientForTests();
    delete process.env.TIINGO_API_KEY;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    // Default: no Redis configured → cached() falls through to fetcher every call.
    // Tests that need the cache enable it explicitly.
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

  // ---------------------------------------------------------------------------
  // Test 1 — env missing
  // ---------------------------------------------------------------------------
  it('returns null when TIINGO_API_KEY missing', async () => {
    const quote = await fetchTiingoQuote('AAPL');
    const fund = await fetchTiingoFundamentals('AAPL');
    expect(quote).toBeNull();
    expect(fund).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 2 — quote shape
  // ---------------------------------------------------------------------------
  it('fetchTiingoQuote returns MarketDataSection-shaped object on success', async () => {
    process.env.TIINGO_API_KEY = SENTINEL_KEY;
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            ticker: 'AAPL',
            last: 150.25,
            tngoLast: 150.25,
            prevClose: 148.0,
            volume: 1_234_567,
            high: 151.5,
            low: 149.0,
            open: 149.5,
            timestamp: '2026-05-08T20:00:00.000Z',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const quote = await fetchTiingoQuote('AAPL');
    expect(quote).not.toBeNull();
    // MarketDataSection contract from src/lib/types.ts
    expect(quote).toMatchObject({
      price: 150.25,
      volume: 1_234_567,
      // percent_change_today is derived from prevClose vs last
    });
    expect(typeof quote!.collected_at).toBe('string');
    // Per MarketDataSection, fifty_two_week_* + market_cap may be null (Tiingo IEX endpoint
    // doesn't surface them); the shape must still include the keys.
    expect(quote).toHaveProperty('market_cap');
    expect(quote).toHaveProperty('fifty_two_week_high');
    expect(quote).toHaveProperty('fifty_two_week_low');
    expect(quote).toHaveProperty('exchange');
    expect(quote).toHaveProperty('percent_change_today');
  });

  // ---------------------------------------------------------------------------
  // Test 3 — fundamentals shape
  // ---------------------------------------------------------------------------
  it('fetchTiingoFundamentals returns FundamentalsSection-shaped object on success', async () => {
    process.env.TIINGO_API_KEY = SENTINEL_KEY;
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ticker: 'AAPL',
          peRatio: 28.5,
          eps: 6.3,
          revenue: 394_328_000_000,
          marketCap: 2_900_000_000_000,
          debtToEquity: 1.95,
          profitMargin: 0.247,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const fund = await fetchTiingoFundamentals('AAPL');
    expect(fund).not.toBeNull();
    expect(fund).toMatchObject({
      pe_ratio: 28.5,
      eps: 6.3,
      revenue: 394_328_000_000,
    });
    expect(fund).toHaveProperty('debt_to_equity');
    expect(fund).toHaveProperty('profit_margin');
    expect(typeof fund!.collected_at).toBe('string');
  });

  // ---------------------------------------------------------------------------
  // Test 4 — cache hit on second call
  // ---------------------------------------------------------------------------
  it('falls through to Redis cache on second call (fetch invoked once)', async () => {
    process.env.TIINGO_API_KEY = SENTINEL_KEY;
    process.env.UPSTASH_REDIS_REST_URL = 'http://upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    __resetUpstashClientForTests();

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            ticker: 'AAPL',
            last: 150,
            tngoLast: 150,
            prevClose: 148,
            volume: 1000,
            timestamp: '2026-05-08T20:00:00.000Z',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const a = await fetchTiingoQuote('AAPL');
    const b = await fetchTiingoQuote('AAPL');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b).toEqual(a);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test 5 — retry on 5xx then succeed
  // ---------------------------------------------------------------------------
  it('retries 5xx error then succeeds', async () => {
    process.env.TIINGO_API_KEY = SENTINEL_KEY;
    fetchSpy
      .mockResolvedValueOnce(
        new Response('upstream timeout', { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              ticker: 'AAPL',
              last: 200,
              tngoLast: 200,
              prevClose: 198,
              volume: 5000,
              timestamp: '2026-05-08T20:00:00.000Z',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const quote = await fetchTiingoQuote('AAPL');
    expect(quote).not.toBeNull();
    expect(quote!.price).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // Test 6 — does NOT retry 401
  // ---------------------------------------------------------------------------
  it('does NOT retry 401 — surfaces immediately as null', async () => {
    process.env.TIINGO_API_KEY = SENTINEL_KEY;
    fetchSpy.mockResolvedValueOnce(
      new Response('unauthorized', { status: 401 }),
    );

    const quote = await fetchTiingoQuote('AAPL');
    expect(quote).toBeNull();
    // Critical: only ONE call. If retry classifier misfires this becomes 3.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test 7 — API key NEVER logged (T-19-B-03 mitigation)
  // ---------------------------------------------------------------------------
  it('API key NEVER appears in any logged string', async () => {
    process.env.TIINGO_API_KEY = SENTINEL_KEY;
    // Force 3 retries on 500 so the failure path WILL log something.
    fetchSpy.mockResolvedValue(
      new Response('boom', { status: 500 }),
    );

    const quote = await fetchTiingoQuote('AAPL');
    expect(quote).toBeNull();

    // Aggregate every console call's stringified args.
    const allCalls = [
      ...warnSpy.mock.calls,
      ...logSpy.mock.calls,
      ...errorSpy.mock.calls,
    ]
      .flat()
      .map((arg) => {
        if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join('\n');

    expect(allCalls).not.toContain(SENTINEL_KEY);
  });

  // ---------------------------------------------------------------------------
  // Test 8 — null after exhausted retries
  // ---------------------------------------------------------------------------
  it('returns null when fetch throws after maxAttempts retries', async () => {
    process.env.TIINGO_API_KEY = SENTINEL_KEY;
    // Network-style error — undici-shaped (cause.code = ECONNREFUSED).
    const netErr = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    fetchSpy.mockRejectedValue(netErr);

    const quote = await fetchTiingoQuote('AAPL');
    expect(quote).toBeNull();
    // 3 attempts default per RetryOptions
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  // ---------------------------------------------------------------------------
  // Test 9 — live API (skipped unless RUN_LIVE_INTEGRATION=true)
  // ---------------------------------------------------------------------------
  const liveIt = process.env.RUN_LIVE_INTEGRATION === 'true' ? it : it.skip;
  liveIt('live API call returns valid quote for AAPL', async () => {
    fetchSpy.mockRestore();
    if (!process.env.TIINGO_API_KEY) {
      throw new Error('TIINGO_API_KEY required for live integration smoke test');
    }
    const quote = await fetchTiingoQuote('AAPL');
    expect(quote).not.toBeNull();
    expect(typeof quote!.price).toBe('number');
    expect(quote!.price).toBeGreaterThan(0);
  });
});
