/**
 * Phase 19-B-01 — Public surface of the Upstash cache layer.
 *
 * Wave B adapters (Tiingo, Twelve Data, Exa) and downstream consumers
 * import from this barrel rather than reaching into individual files:
 *
 *   import { cached, invalidate, CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache';
 *
 * Per D-24 the wrapper gracefully degrades on Redis outage (transparent
 * fallthrough to the fetcher). Centralizing the export surface here keeps
 * adapter call-sites single-line + makes it easy to swap the underlying
 * Redis client implementation later without touching every adapter.
 */

export { cached, invalidate, __resetUpstashClientForTests } from './upstash';
export type { CacheOptions, CacheKey } from './upstash';
export { CACHE_KEYS, TTL_SECONDS } from './cache-keys';
