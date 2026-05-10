/**
 * Plan 19-C-06 — Quiver adapter unit tests (D-38).
 *
 * Quiver Hobbyist tier ($30/mo) — insider + congressional trade data. Per
 * D-38 the adapter is opt-in: when QUIVER_API_KEY is unset both fetchers
 * MUST return null silently without ever issuing a fetch call. This is the
 * primary mitigation for T-19-C-06-02 (configuration: adapter activates
 * without explicit opt-in).
 *
 * 7 tests total:
 *   1. Returns null for both fetchers when QUIVER_API_KEY missing (no fetch issued)
 *   2. fetchQuiverInsider returns QuiverInsiderData on success
 *   3. fetchQuiverCongressional returns QuiverCongressionalData on success
 *   4. Cache hit on second call (fetch invoked once)
 *   5. Retries 5xx then succeeds
 *   6. Does NOT retry 4xx — surfaces immediately as null
 *   7. API key NEVER appears in any logged string  (T-19-C-06-01 mitigation)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory Redis double — same pattern as Tiingo tests so we can verify the
// cache-hit path (Test 4) deterministically.
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
  fetchQuiverInsider,
  fetchQuiverCongressional,
} from '@/lib/data/adapters/quiver';
import { __resetUpstashClientForTests } from '@/lib/data/cache/upstash';

// Sentinel API key — every test that exercises auth uses this exact value so
// we can grep console output and prove it never escaped (T-19-C-06-01).
const SENTINEL_KEY = 'qv_phase19_c06_test_sentinel_xyz';

describe('Quiver adapter (Plan 19-C-06)', () => {
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
    delete process.env.QUIVER_API_KEY;
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

  // ---------------------------------------------------------------------------
  // Test 1 — env missing (T-19-C-06-02 mitigation)
  // ---------------------------------------------------------------------------
  it('returns null for both fetchers when QUIVER_API_KEY missing (no fetch issued)', async () => {
    const insider = await fetchQuiverInsider('AAPL');
    const congress = await fetchQuiverCongressional('AAPL');
    expect(insider).toBeNull();
    expect(congress).toBeNull();
    // Critical: the network MUST NOT be touched when the adapter is opted out.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 2 — insider shape
  // ---------------------------------------------------------------------------
  it('fetchQuiverInsider returns QuiverInsiderData on success', async () => {
    process.env.QUIVER_API_KEY = SENTINEL_KEY;
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            Date: '2026-04-15',
            Ticker: 'AAPL',
            Name: 'Tim Cook',
            Shares: 50_000,
            PricePerShare: 175.0,
            SharesOwnedFollowing: 950_000,
            AcquiredDisposedCode: 'D',
          },
          {
            Date: '2026-04-10',
            Ticker: 'AAPL',
            Name: 'Luca Maestri',
            Shares: 10_000,
            PricePerShare: 172.0,
            SharesOwnedFollowing: 200_000,
            AcquiredDisposedCode: 'A',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const insider = await fetchQuiverInsider('AAPL');
    expect(insider).not.toBeNull();
    expect(insider!.ticker).toBe('AAPL');
    expect(Array.isArray(insider!.trades)).toBe(true);
    expect(insider!.trades.length).toBe(2);
    expect(insider!.trades[0]).toMatchObject({
      name: 'Tim Cook',
      shares: 50_000,
      price_per_share: 175.0,
    });
    expect(typeof insider!.collected_at).toBe('string');
  });

  // ---------------------------------------------------------------------------
  // Test 3 — congressional shape
  // ---------------------------------------------------------------------------
  it('fetchQuiverCongressional returns QuiverCongressionalData on success', async () => {
    process.env.QUIVER_API_KEY = SENTINEL_KEY;
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            ReportDate: '2026-04-12',
            TransactionDate: '2026-04-08',
            Ticker: 'AAPL',
            Representative: 'Nancy Pelosi',
            Transaction: 'Purchase',
            Range: '$1,000,001 - $5,000,000',
            House: 'House',
            Party: 'D',
          },
          {
            ReportDate: '2026-04-11',
            TransactionDate: '2026-04-05',
            Ticker: 'AAPL',
            Representative: 'Dan Crenshaw',
            Transaction: 'Sale',
            Range: '$15,001 - $50,000',
            House: 'House',
            Party: 'R',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const congress = await fetchQuiverCongressional('AAPL');
    expect(congress).not.toBeNull();
    expect(congress!.ticker).toBe('AAPL');
    expect(Array.isArray(congress!.trades)).toBe(true);
    expect(congress!.trades.length).toBe(2);
    expect(congress!.trades[0]).toMatchObject({
      representative: 'Nancy Pelosi',
      transaction: 'Purchase',
    });
    expect(typeof congress!.collected_at).toBe('string');
  });

  // ---------------------------------------------------------------------------
  // Test 4 — cache hit on second call
  // ---------------------------------------------------------------------------
  it('falls through to Redis cache on second call (fetch invoked once)', async () => {
    process.env.QUIVER_API_KEY = SENTINEL_KEY;
    process.env.UPSTASH_REDIS_REST_URL = 'http://upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    __resetUpstashClientForTests();

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            Date: '2026-04-15',
            Ticker: 'AAPL',
            Name: 'Tim Cook',
            Shares: 1000,
            PricePerShare: 175,
            SharesOwnedFollowing: 100_000,
            AcquiredDisposedCode: 'D',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const a = await fetchQuiverInsider('AAPL');
    const b = await fetchQuiverInsider('AAPL');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b).toEqual(a);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test 5 — retry on 5xx
  // ---------------------------------------------------------------------------
  it('retries 5xx error then succeeds', async () => {
    process.env.QUIVER_API_KEY = SENTINEL_KEY;
    fetchSpy
      .mockResolvedValueOnce(new Response('upstream timeout', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              ReportDate: '2026-04-12',
              TransactionDate: '2026-04-08',
              Ticker: 'AAPL',
              Representative: 'Nancy Pelosi',
              Transaction: 'Purchase',
              Range: '$1,000,001 - $5,000,000',
              House: 'House',
              Party: 'D',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const congress = await fetchQuiverCongressional('AAPL');
    expect(congress).not.toBeNull();
    expect(congress!.trades.length).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // Test 6 — does NOT retry 4xx
  // ---------------------------------------------------------------------------
  it('does NOT retry 4xx — surfaces immediately as null', async () => {
    process.env.QUIVER_API_KEY = SENTINEL_KEY;
    fetchSpy.mockResolvedValueOnce(
      new Response('unauthorized', { status: 401 }),
    );

    const insider = await fetchQuiverInsider('AAPL');
    expect(insider).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test 7 — API key NEVER logged (T-19-C-06-01 mitigation)
  // ---------------------------------------------------------------------------
  it('API key NEVER appears in any logged string', async () => {
    process.env.QUIVER_API_KEY = SENTINEL_KEY;
    // Force exhausted retries so the failure path WILL log.
    fetchSpy.mockResolvedValue(new Response('boom', { status: 500 }));

    const insider = await fetchQuiverInsider('AAPL');
    const congress = await fetchQuiverCongressional('AAPL');
    expect(insider).toBeNull();
    expect(congress).toBeNull();

    const allCalls = [
      ...warnSpy.mock.calls,
      ...logSpy.mock.calls,
      ...errorSpy.mock.calls,
    ]
      .flat()
      .map((arg) => {
        if (arg instanceof Error)
          return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
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
});
