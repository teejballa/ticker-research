/**
 * Plan 19-B-05 — Exa 2.0 adapter unit tests (D-28).
 *
 * Per D-28 / RESEARCH §exa-js v2.12.1, the adapter wraps `exa-js`'s neural
 * search in a `cached() + withRetry()` envelope and returns
 * NewsSection / AnalystSentimentSection objects (canonical types from
 * src/lib/types.ts) so callers can swap transparently with the existing
 * anthropic-search.ts hot path. Per RESEARCH Pitfall 7 + D-32, every
 * non-recoverable failure surfaces as null rather than throwing — the
 * merge ladder in 19-B-06 will fall back to anthropic-search on null.
 *
 * 8 tests:
 *   1. fetchExaNews + fetchExaAnalystSentiment return null when EXA_API_KEY missing
 *      (no SDK call issued)
 *   2. fetchExaNews returns NewsSection-shaped object on success
 *   3. fetchExaAnalystSentiment returns AnalystSentimentSection-shaped object
 *   4. Cache hit on second call (Exa search invoked once)
 *   5. Retries 5xx (ExaError.statusCode 503) then succeeds
 *   6. Does NOT retry 401 — surfaces immediately as null (single SDK call)
 *   7. API key NEVER appears in any logged string  (T-19-B-05-01 mitigation)
 *   8. Returns null after maxAttempts retries on persistent network error
 *      (i.e. cleanly returns null on error rather than throwing — the
 *      anthropic-search fallback path is wired at the merge-ladder level
 *      in 19-B-06; here we pin the contract that the adapter never throws)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory Redis double (Test 4 verifies cache hit). Same pattern as
// tests/lib/data/adapters/tiingo.test.ts.
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

// Module-level spy on the Exa class instance method. Tests mutate this
// between cases; the vi.mock factory resolves it lazily via a getter so each
// `new Exa()` shares the same module-level spy.
const exaSearchSpy = vi.fn<(...args: unknown[]) => Promise<unknown>>();
let lastExaApiKey: string | undefined;

vi.mock('exa-js', () => {
  // ExaError mirrors the SDK shape — `statusCode` (not `status`) is the field
  // used by the real ExaError class. The adapter's custom retry classifier
  // must accept either.
  class ExaError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'ExaError';
      this.statusCode = statusCode;
    }
  }
  class Exa {
    constructor(apiKey?: string) {
      lastExaApiKey = apiKey;
    }
    search(...args: unknown[]) {
      return exaSearchSpy(...args);
    }
  }
  return { Exa, ExaError, default: Exa };
});

import {
  fetchExaNews,
  fetchExaAnalystSentiment,
  __resetExaClientForTests,
} from '@/lib/data/adapters/exa-search';
import { __resetUpstashClientForTests } from '@/lib/data/cache/upstash';

const SENTINEL_KEY = 'exa_phase19_test_sentinel_12345';

describe('Exa 2.0 adapter (Plan 19-B-05)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let errorSpy: any;

  beforeEach(() => {
    cacheStore.clear();
    __resetUpstashClientForTests();
    __resetExaClientForTests();
    exaSearchSpy.mockReset();
    lastExaApiKey = undefined;
    delete process.env.EXA_API_KEY;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Test 1 — graceful degrade when env unset (D-32 fail-closed)
  // ---------------------------------------------------------------------------
  it('returns null when EXA_API_KEY missing (no SDK call issued)', async () => {
    const news = await fetchExaNews('AAPL');
    const analyst = await fetchExaAnalystSentiment('AAPL');
    expect(news).toBeNull();
    expect(analyst).toBeNull();
    expect(exaSearchSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Test 2 — news shape compatible with NewsSection (anthropic-search swap)
  // ---------------------------------------------------------------------------
  it('fetchExaNews returns NewsSection-shaped object on success', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    exaSearchSpy.mockResolvedValueOnce({
      results: [
        {
          id: 'r1',
          title: 'AAPL beats earnings expectations Q2',
          url: 'https://example.com/aapl-earnings',
          publishedDate: '2026-04-25T00:00:00.000Z',
          text: 'Apple reported strong Q2 results...',
        },
        {
          id: 'r2',
          title: 'Analysts raise AAPL price targets',
          url: 'https://example.com/aapl-pt-raise',
          publishedDate: '2026-04-26T00:00:00.000Z',
          text: 'Goldman Sachs raised AAPL target to $250...',
        },
      ],
      requestId: 'req_abc',
    });

    const news = await fetchExaNews('AAPL');
    expect(news).not.toBeNull();
    // NewsSection contract from src/lib/types.ts
    expect(typeof news!.collected_at).toBe('string');
    expect(Array.isArray(news!.items)).toBe(true);
    expect(news!.items.length).toBe(2);
    // NewsItem fields per src/lib/types.ts: headline, url, published_date, source
    expect(news!.items[0]).toMatchObject({
      headline: 'AAPL beats earnings expectations Q2',
      url: 'https://example.com/aapl-earnings',
    });
    expect(news!.items[0]).toHaveProperty('published_date');
    expect(news!.items[0]).toHaveProperty('source');
  });

  // ---------------------------------------------------------------------------
  // Test 3 — analyst shape compatible with AnalystSentimentSection
  // ---------------------------------------------------------------------------
  it('fetchExaAnalystSentiment returns AnalystSentimentSection-shaped object on success', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    exaSearchSpy.mockResolvedValueOnce({
      results: [
        {
          id: 'r1',
          title: 'Goldman raises AAPL target',
          url: 'https://example.com/gs-aapl',
          publishedDate: '2026-04-25T00:00:00.000Z',
          text: 'Goldman Sachs raised AAPL price target to $250 (Buy).',
        },
        {
          id: 'r2',
          title: 'Morgan Stanley initiates coverage',
          url: 'https://example.com/ms-aapl',
          publishedDate: '2026-04-26T00:00:00.000Z',
          text: 'Morgan Stanley initiates Overweight on AAPL.',
        },
      ],
      requestId: 'req_def',
    });

    const analyst = await fetchExaAnalystSentiment('AAPL');
    expect(analyst).not.toBeNull();
    // AnalystSentimentSection contract from src/lib/types.ts
    expect(typeof analyst!.collected_at).toBe('string');
    expect(analyst).toHaveProperty('consensus');
    expect(analyst).toHaveProperty('avg_price_target');
    expect(analyst).toHaveProperty('analyst_count');
    expect(Array.isArray(analyst!.recent_changes)).toBe(true);
    // Adapter populates recent_changes from Exa results — every entry must
    // have analyst + firm + action + date keys per AnalystChange.
    if (analyst!.recent_changes.length > 0) {
      const first = analyst!.recent_changes[0];
      expect(first).toHaveProperty('analyst');
      expect(first).toHaveProperty('firm');
      expect(first).toHaveProperty('action');
      expect(first).toHaveProperty('date');
    }
  });

  // ---------------------------------------------------------------------------
  // Test 4 — cache hit on second call
  // ---------------------------------------------------------------------------
  it('falls through to Redis cache on second call (Exa search invoked once)', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    process.env.UPSTASH_REDIS_REST_URL = 'http://upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    __resetUpstashClientForTests();

    exaSearchSpy.mockResolvedValue({
      results: [
        {
          id: 'r1',
          title: 'AAPL news',
          url: 'https://example.com/aapl',
          publishedDate: '2026-04-25T00:00:00.000Z',
          text: 'body',
        },
      ],
      requestId: 'req',
    });

    const a = await fetchExaNews('AAPL');
    const b = await fetchExaNews('AAPL');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b).toEqual(a);
    expect(exaSearchSpy).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test 5 — retry on 5xx then succeed
  // ---------------------------------------------------------------------------
  it('retries 5xx error then succeeds', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    // ExaError has statusCode (not status). Adapter's classifier must accept
    // either shape so withRetry retries this case.
    const upstreamErr = Object.assign(new Error('upstream error'), {
      name: 'ExaError',
      statusCode: 503,
    });
    exaSearchSpy
      .mockRejectedValueOnce(upstreamErr)
      .mockResolvedValueOnce({
        results: [
          {
            id: 'r1',
            title: 'AAPL recovers',
            url: 'https://example.com/aapl',
            publishedDate: '2026-04-25T00:00:00.000Z',
            text: 'body',
          },
        ],
        requestId: 'req',
      });

    const news = await fetchExaNews('AAPL');
    expect(news).not.toBeNull();
    expect(news!.items.length).toBe(1);
    expect(exaSearchSpy).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // Test 6 — does NOT retry 401
  // ---------------------------------------------------------------------------
  it('does NOT retry 401 — surfaces immediately as null', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    const authErr = Object.assign(new Error('unauthorized'), {
      name: 'ExaError',
      statusCode: 401,
    });
    exaSearchSpy.mockRejectedValueOnce(authErr);

    const news = await fetchExaNews('AAPL');
    expect(news).toBeNull();
    // Critical: only ONE call. If the classifier misfires this becomes 3.
    expect(exaSearchSpy).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test 7 — API key NEVER logged (T-19-B-05-01 mitigation)
  // ---------------------------------------------------------------------------
  it('API key NEVER appears in any logged string', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    const persistent5xx = Object.assign(new Error('persistent 500'), {
      name: 'ExaError',
      statusCode: 500,
    });
    exaSearchSpy.mockRejectedValue(persistent5xx);

    const news = await fetchExaNews('AAPL');
    const analyst = await fetchExaAnalystSentiment('AAPL');
    expect(news).toBeNull();
    expect(analyst).toBeNull();

    const allLoggedText = [
      ...warnSpy.mock.calls,
      ...logSpy.mock.calls,
      ...errorSpy.mock.calls,
    ]
      .flat()
      .map((arg) => {
        if (arg instanceof Error) {
          return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
        }
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join('\n');

    expect(allLoggedText).not.toContain(SENTINEL_KEY);
  });

  // ---------------------------------------------------------------------------
  // Test 8 — null after exhausted retries (cleanly returns null, never throws)
  // ---------------------------------------------------------------------------
  it('returns null when SDK throws after maxAttempts retries (no throw on caller)', async () => {
    process.env.EXA_API_KEY = SENTINEL_KEY;
    // Network-style undici-shaped error — both withRetry's default classifier
    // and the adapter's custom one must treat this as retryable.
    const netErr = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    exaSearchSpy.mockRejectedValue(netErr);

    // The contract is "never throws to caller" so the next-line `await`
    // must resolve to null — if the adapter throws, vitest will surface
    // it as an unhandled rejection.
    const news = await fetchExaNews('AAPL');
    expect(news).toBeNull();
    // 3 attempts default per RetryOptions
    expect(exaSearchSpy).toHaveBeenCalledTimes(3);
  });
});
