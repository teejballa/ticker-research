/**
 * Phase 19-B-01 — Upstash Redis cache wrapper (D-24).
 *
 * `cached(key, fetcher, opts)` is the foundation every Wave B adapter
 * (Tiingo, Twelve Data, Exa) builds on. Per the threat model:
 *
 *   - T-19-B-01-02 (Redis outage breaks fetches): all Redis calls are
 *     wrapped in try/catch; on any failure (connection refused, timeout,
 *     auth error) we fall through to the underlying fetcher and never
 *     re-throw. Redis is opt-in via env vars; absence ≠ error.
 *
 *   - T-19-B-01-03 (token in URL): UPSTASH_REDIS_REST_TOKEN is read from
 *     env, never logged.
 *
 * The companion `cache-keys.ts` defines CACHE_KEYS + TTL_SECONDS so callers
 * never inline cache namespaces or expiries.
 */

import { Redis } from '@upstash/redis';

// Re-export CacheKey from cache-keys so callers only import from one module
// when convenient.
export type { CacheKey } from './cache-keys';

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    redisClient = new Redis({ url, token });
  } catch {
    // Constructor throws if URL is malformed — graceful degrade.
    redisClient = null;
  }
  return redisClient;
}

/**
 * @internal — test-only hook to drop the cached client so a fresh instance
 * is built against the next process.env values. Used by the unit tests to
 * exercise the env-driven branches deterministically.
 */
export function __resetUpstashClientForTests(): void {
  redisClient = null;
}

export interface CacheOptions {
  /** TTL in seconds applied to the SET on miss. */
  ttlSeconds: number;
  /** When true, skip the read entirely and force a fetcher run. Result is NOT
   * written back to Redis (callers wanting a hard refresh should `invalidate`
   * first then call `cached`). */
  bypass?: boolean;
}

/**
 * Wraps `fetcher` with Upstash-backed TTL caching. Falls through transparently
 * on Redis outage (D-24): no retry, no error propagation.
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: CacheOptions,
): Promise<T> {
  if (opts.bypass) return fetcher();

  const r = getRedis();
  if (!r) return fetcher();

  // Read path — graceful degrade on any error.
  try {
    const hit = await r.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch {
    return fetcher();
  }

  // Miss — compute then best-effort write.
  const value = await fetcher();
  try {
    await r.set(key, value as unknown as string, { ex: opts.ttlSeconds });
  } catch {
    // Swallow — value already produced; the next request will re-fetch.
  }
  return value;
}

/**
 * Best-effort key eviction. Silently no-ops when Redis is unavailable.
 */
export async function invalidate(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // Swallow — graceful degrade per D-24.
  }
}
