import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory Redis double. Honors `ex` TTL via Date.now() so vi.useFakeTimers()
// can advance past the expiry deterministically.
const store = new Map<string, { value: unknown; expiresAt: number }>();
let forceFail = false;

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      constructor(_opts: { url: string; token: string }) {
        if (_opts.url === 'http://127.0.0.1:1') forceFail = true;
      }
      async get<T>(key: string): Promise<T | null> {
        if (forceFail) throw new Error('ECONNREFUSED');
        const entry = store.get(key);
        if (!entry) return null;
        if (Date.now() >= entry.expiresAt) {
          store.delete(key);
          return null;
        }
        return entry.value as T;
      }
      async set(
        key: string,
        value: unknown,
        opts: { ex: number },
      ): Promise<'OK'> {
        if (forceFail) throw new Error('ECONNREFUSED');
        store.set(key, { value, expiresAt: Date.now() + opts.ex * 1000 });
        return 'OK';
      }
      async del(key: string): Promise<number> {
        if (forceFail) throw new Error('ECONNREFUSED');
        const had = store.delete(key);
        return had ? 1 : 0;
      }
    },
  };
});

import { cached, invalidate, type CacheKey } from '../../../../src/lib/data/cache/upstash';
import { CACHE_KEYS } from '../../../../src/lib/data/cache/cache-keys';
import { __resetUpstashClientForTests } from '../../../../src/lib/data/cache/upstash';

describe('upstash cache wrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0, toFake: ['Date'] });
    store.clear();
    forceFail = false;
    process.env.UPSTASH_REDIS_REST_URL = 'http://upstash.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    __resetUpstashClientForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('returns fetched value on miss + populates cache', async () => {
    const fetcher = vi.fn().mockResolvedValue({ price: 150 });
    const result = await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    expect(result).toEqual({ price: 150 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns cached value on hit + skips fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue({ price: 150 });
    await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    const second = await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    expect(second).toEqual({ price: 150 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches after TTL', async () => {
    const fetcher = vi.fn().mockResolvedValue({ price: 150 });
    await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 1 });
    vi.advanceTimersByTime(2000);
    await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('falls through to fetcher on Redis outage (graceful degrade)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:1';
    __resetUpstashClientForTests();
    const fetcher = vi.fn().mockResolvedValue({ price: 150 });
    const result = await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    expect(result).toEqual({ price: 150 });
    expect(fetcher).toHaveBeenCalled();
  });

  it('invalidate evicts key', async () => {
    const fetcher = vi.fn().mockResolvedValue({ price: 150 });
    await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    await invalidate(CACHE_KEYS.quote('AAPL'));
    await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
