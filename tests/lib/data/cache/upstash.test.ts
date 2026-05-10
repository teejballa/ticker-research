import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cached, invalidate, type CacheKey } from '../../../../src/lib/data/cache/upstash';
import { CACHE_KEYS } from '../../../../src/lib/data/cache/cache-keys';

describe('upstash cache wrapper', () => {
  beforeEach(() => vi.useFakeTimers());

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
