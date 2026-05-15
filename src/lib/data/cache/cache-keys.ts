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
  // Phase 30 D-02 — short TTL to avoid sentiment-scan reading stale 5-min prices
  // (was 300s pre-Phase-30). Yahoo cache hits are NOT counted as Yahoo errors
  // (the withTelemetry cache_check path masks them), so this tightening just
  // reduces the staleness window without affecting the breaker's view of Yahoo.
  quote: 60,
  // Phase 30 D-02 — fundamentals TTL stays 24h (planner discretion; rarely intra-day).
  // Documented explicitly here so any future tightening goes through a planning
  // round (price feeds are intra-day; balance sheets are not).
  fundamentals: 86_400, // 24h
  options: 900,         // 15min
  community: 600,       // 10min
  news: 1_800,          // 30min
  source_pkg: 600,      // 10min
} as const;
