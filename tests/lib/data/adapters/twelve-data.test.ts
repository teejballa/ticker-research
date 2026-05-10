/**
 * Plan 19-B-04 — Twelve Data adapter (fundamentals fallback) tests.
 *
 * Behaviors covered (per plan must-haves):
 *   1. returns null when TWELVEDATA_API_KEY missing (fail-closed)
 *   2. returns FundamentalsSection on a successful /statistics fetch
 *   3. cache hit on second call (no second HTTP)
 *   4. retries on 5xx
 *   5. does NOT retry 401 (auth) — surface null
 *   6. does NOT retry 429 (rate limit) — surface null
 *   7. API key never appears in any logged string (T-19-B-04-01 mitigation)
 *   8. returns null after retry exhaustion (network error)
 *   9. live integration — skipped by default
 *
 * Twelve Data passes the API key as a `?apikey=` query param. Logs MUST
 * sanitize the URL so the secret cannot leak via captured stderr.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory Redis double — same pattern as the cache test. Honors `ex` TTL via
// Date.now() so vi.useFakeTimers can advance past expiry deterministically.
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
      async set(key: string, value: unknown, opts: { ex: number }): Promise<'OK'> {
        cacheStore.set(key, { value, expiresAt: Date.now() + opts.ex * 1000 });
        return 'OK';
      }
      async del(key: string): Promise<number> {
        return cacheStore.delete(key) ? 1 : 0;
      }
    },
  };
});

import { fetchTwelveDataFundamentals } from '@/lib/data/adapters/twelve-data';
import { __resetUpstashClientForTests } from '@/lib/data/cache/upstash';

// Sample successful response shape (verified live 2026-05-09 against
// https://api.twelvedata.com/statistics?symbol=AAPL&apikey=demo).
function statisticsOk(opts: {
  trailing_pe?: number | null;
  diluted_eps_ttm?: number | null;
  revenue_ttm?: number | null;
  total_debt_to_equity_mrq?: number | null;
  profit_margin?: number | null;
} = {}) {
  return {
    meta: { symbol: 'AAPL', name: 'Apple Inc', currency: 'USD', exchange: 'NASDAQ' },
    statistics: {
      valuations_metrics: {
        trailing_pe: opts.trailing_pe ?? 35.46,
      },
      financials: {
        profit_margin: opts.profit_margin ?? 0.2715,
        income_statement: {
          revenue_ttm: opts.revenue_ttm ?? 451442016256,
          diluted_eps_ttm: opts.diluted_eps_ttm ?? 8.27,
        },
        balance_sheet: {
          total_debt_to_equity_mrq: opts.total_debt_to_equity_mrq ?? 79.548,
        },
      },
    },
  };
}

const SECRET_KEY = 'sekret-twelve-data-key-do-not-leak';

describe('fetchTwelveDataFundamentals (Plan 19-B-04)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;

  beforeEach(() => {
    cacheStore.clear();
    process.env.UPSTASH_REDIS_REST_URL = 'http://upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    process.env.TWELVEDATA_API_KEY = SECRET_KEY;
    __resetUpstashClientForTests();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.TWELVEDATA_API_KEY;
    __resetUpstashClientForTests();
    cacheStore.clear();
  });

  // -------------------------------------------------------------------------
  // 1. returns null when TWELVEDATA_API_KEY missing
  // -------------------------------------------------------------------------
  it('returns null when TWELVEDATA_API_KEY missing (fail closed)', async () => {
    delete process.env.TWELVEDATA_API_KEY;
    const result = await fetchTwelveDataFundamentals('AAPL');
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. returns FundamentalsSection on successful /statistics fetch
  // -------------------------------------------------------------------------
  it('returns FundamentalsSection on successful /statistics fetch', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(statisticsOk()), { status: 200 }) as unknown as Response,
    );
    const result = await fetchTwelveDataFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(result?.pe_ratio).toBeCloseTo(35.46, 2);
    expect(result?.eps).toBeCloseTo(8.27, 2);
    expect(result?.revenue).toBe(451442016256);
    expect(result?.debt_to_equity).toBeCloseTo(79.548, 3);
    expect(result?.profit_margin).toBeCloseTo(0.2715, 4);
    expect(typeof result?.collected_at).toBe('string');
  });

  // -------------------------------------------------------------------------
  // 3. cache hit on second call — no second HTTP
  // -------------------------------------------------------------------------
  it('cache hit on second call — no second HTTP request', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(statisticsOk()), { status: 200 }) as unknown as Response,
    );
    const r1 = await fetchTwelveDataFundamentals('AAPL');
    const r2 = await fetchTwelveDataFundamentals('AAPL');
    expect(r1).toEqual(r2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 4. retries 5xx
  // -------------------------------------------------------------------------
  it('retries on 5xx — eventually returns parsed result', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response('upstream', { status: 503 }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(statisticsOk()), { status: 200 }) as unknown as Response,
      );
    const result = await fetchTwelveDataFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(result?.pe_ratio).toBeCloseTo(35.46, 2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // 5. does NOT retry 401 — single call, returns null (graceful degrade)
  // -------------------------------------------------------------------------
  it('does NOT retry on 401 — single call, returns null', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }) as unknown as Response,
    );
    const result = await fetchTwelveDataFundamentals('AAPL');
    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 6. does NOT retry 429 — single call, returns null (D-25)
  // -------------------------------------------------------------------------
  it('does NOT retry on 429 — single call, returns null', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Too Many Requests', { status: 429 }) as unknown as Response,
    );
    const result = await fetchTwelveDataFundamentals('AAPL');
    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 7. API key never appears in any logged string (T-19-B-04-01)
  // -------------------------------------------------------------------------
  it('API key never appears in any logged string (sanitized URL)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    fetchSpy.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    );

    const result = await fetchTwelveDataFundamentals('AAPL');
    expect(result).toBeNull();

    const allLogged = [
      ...errSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
      ...logSpy.mock.calls.flat(),
    ]
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');

    expect(allLogged).not.toContain(SECRET_KEY);
    // Belt-and-suspenders: query-param leak shape must be redacted.
    expect(allLogged).not.toMatch(/apikey=[^*&\s"]+/);
  });

  // -------------------------------------------------------------------------
  // 8. returns null after retry exhaustion on persistent network error
  // -------------------------------------------------------------------------
  it('returns null after retry exhaustion (persistent network error)', async () => {
    fetchSpy.mockRejectedValue(
      Object.assign(new Error('ENOTFOUND api.twelvedata.com'), { code: 'ENOTFOUND' }),
    );
    const result = await fetchTwelveDataFundamentals('AAPL');
    expect(result).toBeNull();
    // 3 attempts (default maxAttempts) then surface as null.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------------
  // 9. live integration — skipped by default
  // -------------------------------------------------------------------------
  it.skip('live integration: hits Twelve Data /statistics for AAPL', async () => {
    // Unskip locally with a real TWELVEDATA_API_KEY in env to verify shape.
    fetchSpy.mockRestore();
    const result = await fetchTwelveDataFundamentals('AAPL');
    expect(result).not.toBeNull();
    expect(typeof result?.pe_ratio === 'number' || result?.pe_ratio === null).toBe(true);
  });
});
