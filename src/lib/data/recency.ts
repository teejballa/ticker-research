/**
 * Centralized recency windows for every time-bounded data source.
 *
 * Before this file, each adapter hardcoded its own window in its own units:
 * Reddit `time: 'week'`, Twitter `sinceDays = 7`, HackerNews `7 * 86400`,
 * Exa `NEWS_LOOKBACK_MS`, anthropic-search prompt text. Tuning the freshness
 * of the report meant editing five files. This module is the single knob.
 *
 * Decision (2026-05-19, operator): community sentiment is fast-decaying — a
 * Reddit/Twitter/HN post older than a trading week carries little signal — so
 * the community window is 5 days. News and analyst commentary have a longer
 * half-life (a downgrade or earnings reaction from three weeks ago still moves
 * a stock), so the news window stays at 30 days.
 */
export const RECENCY_WINDOWS = {
  /** Community sentiment — Reddit, Twitter, HackerNews. One calendar week. */
  community_days: 7,
  /** News + analyst commentary — anthropic-search, Exa. */
  news_days: 30,
} as const;

/** Community window in milliseconds (Date.now() arithmetic). */
export const COMMUNITY_WINDOW_MS = RECENCY_WINDOWS.community_days * 86_400_000;

/** Community window in seconds (Unix `created_utc` / `created_at_i` arithmetic). */
export const COMMUNITY_WINDOW_SECONDS = RECENCY_WINDOWS.community_days * 86_400;

/** News window in milliseconds. */
export const NEWS_WINDOW_MS = RECENCY_WINDOWS.news_days * 86_400_000;
