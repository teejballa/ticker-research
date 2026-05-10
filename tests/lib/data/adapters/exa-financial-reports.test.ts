/**
 * Post-Phase-19 P0 — Exa `category: 'financial report'` SEC filing fallback.
 *
 * Slots into the new ladder as:
 *   exa-financial-report → anthropic-search.fetchSecFilingSummary
 *
 * Returns SecFilingSummarySection-shaped output. Same null-on-error semantics
 * as fetchExaNews (missing key, 4xx, retry-exhausted 5xx/network).
 *
 * 5 tests:
 *   1. Returns null when EXA_API_KEY missing (no SDK call).
 *   2. Returns SecFilingSummarySection on success — picks 10-K + 10-Q from results.
 *   3. Returns null when neither 10-K nor 10-Q can be identified.
 *   4. Cache hit on second call (Exa search invoked once).
 *   5. Returns null on 4xx (not retried).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const exaSearchSpy = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('exa-js', () => {
  class ExaError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'ExaError';
      this.statusCode = statusCode;
    }
  }
  class Exa {
    constructor(_apiKey?: string) {}
    search(...args: unknown[]) {
      return exaSearchSpy(...args);
    }
  }
  return { Exa, ExaError, default: Exa };
});

import {
  fetchExaFinancialReports,
  __resetExaClientForTests,
} from '@/lib/data/adapters/exa-search';
import { __resetUpstashClientForTests } from '@/lib/data/cache/upstash';

const SENTINEL_KEY = 'exa_phase19_test_sentinel_fin_12345';

describe('fetchExaFinancialReports', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;

  beforeEach(() => {
    cacheStore.clear();
    __resetUpstashClientForTests();
    __resetExaClientForTests();
    exaSearchSpy.mockReset();
    delete process.env.EXA_API_KEY;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns null when EXA_API_KEY missing (no SDK call)', async () => {
    const r = await fetchExaFinancialReports('AAPL');
    expect(r).toBeNull();
    expect(exaSearchSpy).not.toHaveBeenCalled();
  });

  it('returns SecFilingSummarySection — picks 10-K + 10-Q from results', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    exaSearchSpy.mockResolvedValueOnce({
      results: [
        {
          id: 'r1',
          title: 'Apple Inc. 10-K Annual Report',
          url: 'https://sec.gov/aapl/aapl-10k-2025.htm',
          publishedDate: '2025-11-01T00:00:00.000Z',
          text: 'Apple reported record fiscal 2025 results...',
        },
        {
          id: 'r2',
          title: 'Form 10-Q Q1 fiscal 2026',
          url: 'https://sec.gov/aapl/aapl-10q.htm',
          publishedDate: '2026-02-01T00:00:00.000Z',
          text: 'Q1 fiscal 2026 highlights...',
        },
      ],
    });

    const r = await fetchExaFinancialReports('AAPL');
    expect(r).not.toBeNull();
    expect(r!.most_recent_10k).toContain('Apple');
    expect(r!.most_recent_10q).toContain('Q1');
    expect(r!.filing_dates['10k']).toBe('2025-11-01');
    expect(r!.filing_dates['10q']).toBe('2026-02-01');
    // Single SDK call
    expect(exaSearchSpy).toHaveBeenCalledTimes(1);
    // Verify category param wired through
    const args = exaSearchSpy.mock.calls[0]!;
    expect(args[1]).toMatchObject({ category: 'financial report' });
  });

  it('returns null when neither 10-K nor 10-Q can be identified', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    exaSearchSpy.mockResolvedValueOnce({
      results: [
        {
          id: 'r1',
          title: 'Apple investor presentation Q3',
          url: 'https://example.com/aapl-investor.pdf',
          publishedDate: '2026-01-01T00:00:00.000Z',
          text: 'Quarterly investor deck.',
        },
      ],
    });

    const r = await fetchExaFinancialReports('AAPL');
    expect(r).toBeNull();
  });

  it('cache hit on second call (Exa search invoked once)', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    process.env.UPSTASH_REDIS_REST_URL = 'http://upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    __resetUpstashClientForTests();

    exaSearchSpy.mockResolvedValue({
      results: [
        {
          id: 'r1',
          title: 'AAPL 10-K Annual Report',
          url: 'https://sec.gov/aapl-10k.htm',
          publishedDate: '2025-11-01T00:00:00.000Z',
          text: 'Annual report text',
        },
      ],
    });

    const a = await fetchExaFinancialReports('AAPL');
    const b = await fetchExaFinancialReports('AAPL');
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
    expect(exaSearchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null on 4xx (not retried)', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    const upstreamErr = Object.assign(new Error('unauthorized'), {
      name: 'ExaError',
      statusCode: 401,
    });
    exaSearchSpy.mockRejectedValueOnce(upstreamErr);

    const r = await fetchExaFinancialReports('AAPL');
    expect(r).toBeNull();
    // 4xx is NOT retried per D-25 — single SDK call only.
    expect(exaSearchSpy).toHaveBeenCalledTimes(1);
  });
});
