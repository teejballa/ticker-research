/**
 * Phase 19-B-01 — Centralized cache key + TTL config (D-24).
 *
 * Every Wave B adapter (Tiingo, Twelve Data, Exa) and downstream consumer
 * imports from this file rather than building cache keys inline. Per the
 * threat model (T-19-B-01-01), key namespaces prevent cross-domain collision
 * via per-source prefixes (`quote:`, `fund:`, ...).
 */

export type CacheKey = string;

export const CACHE_KEYS = {
  quote:        (ticker: string) => `quote:${ticker.toUpperCase()}`,
  fundamentals: (ticker: string) => `fund:${ticker.toUpperCase()}`,
  options:      (ticker: string) => `opts:${ticker.toUpperCase()}`,
  community:    (ticker: string) => `comm:${ticker.toUpperCase()}`,
  news:         (ticker: string) => `news:${ticker.toUpperCase()}`,
  source_pkg:   (ticker: string) => `pkg:${ticker.toUpperCase()}`,
} as const;

export const TTL_SECONDS = {
  quote: 300,           // 5min
  fundamentals: 86_400, // 24h
  options: 900,         // 15min
  community: 600,       // 10min
  news: 1_800,          // 30min
  source_pkg: 600,      // 10min
} as const;
