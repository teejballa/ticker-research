/**
 * Plan 19-C-05 — Swaggystocks adapter (D-37, SUPPLEMENTAL).
 *
 * Swaggystocks is a SUPPLEMENTAL community-data source. Output is merged into
 * `SentimentSnapshot.community_aggregated` JSONB column by
 * `lightweight-community-scan.ts` (Task 4) — never replaces the canonical
 * community-scan branch.
 *
 * Per RESEARCH Assumption A5, swaggystocks.com has no official API docs;
 * the endpoint shape was community-discovered and is MEDIUM confidence. The
 * adapter:
 *
 *   1. Tries the JSON endpoint at `https://api.swaggystocks.com/wsb/ticker/<TICKER>`
 *   2. On 4xx (endpoint moved) — graceful null. No auto-fallback to any
 *      third-party scraper.
 *   3. Maps a successful payload to `CommunitySignal`.
 *
 * Threat-model mitigations (T-19-C-05-01):
 *   - Any non-2xx response, retry exhaustion, or unexpected payload returns
 *     null. The adapter NEVER throws — it cannot crash the canonical
 *     community-scan path. Promise.allSettled in Task 4 is a second
 *     guard, but the null-sentinel discipline is the first line of defense.
 *   - withRetry(5xx + network only — D-25). 429 is 4xx → not retried.
 *   - cached(10min — TTL_SECONDS.community) keeps call frequency low.
 */

import { cached } from '@/lib/data/cache/upstash';
import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';
import { withRetry } from '@/lib/data/retry';
import type { CommunitySignal } from './apewisdom';

// Re-export so callers can import either type from either module.
export type { CommunitySignal };

const SWAGGY_API_BASE = 'https://api.swaggystocks.com';

interface SwaggyPayload {
  ticker?: string;
  // Common variant names — Swaggystocks has surfaced different shapes across
  // community references. We accept any of these and map to a canonical form.
  mention_count?: number | string | null;
  mentions?: number | string | null;
  bullish_percent?: number | string | null;
  bullish_pct?: number | string | null;
  bearish_percent?: number | string | null;
  bearish_pct?: number | string | null;
  rank?: number | string | null;
  trending_rank?: number | string | null;
}

function statusError(prefix: string, status: number): Error & { status: number } {
  const err = new Error(`${prefix} ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function doFetchSwaggyStocks(
  ticker: string,
): Promise<CommunitySignal | null> {
  const url = `${SWAGGY_API_BASE}/wsb/ticker/${encodeURIComponent(ticker.toUpperCase())}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw statusError('swaggystocks', res.status);
  }

  const data = (await res.json()) as SwaggyPayload | SwaggyPayload[];
  const row: SwaggyPayload | undefined = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const mentions = num(row.mention_count) ?? num(row.mentions);
  if (mentions == null) return null;

  return {
    source: 'swaggystocks',
    mention_count: mentions,
    bullish_pct: num(row.bullish_percent) ?? num(row.bullish_pct),
    bearish_pct: num(row.bearish_percent) ?? num(row.bearish_pct),
    trending_rank: num(row.rank) ?? num(row.trending_rank),
  };
}

/**
 * Fetch a supplemental community signal from Swaggystocks for `ticker`.
 *
 * Returns null (graceful degrade — D-37 + T-19-C-05-01) on:
 *   - HTTP 4xx (incl. 404 / 429) — endpoint moved or rate-limited
 *   - Persistent 5xx / network failure after retries
 *   - Any malformed payload (no ticker / no mentions field)
 *
 * Cached 10min via `comm:TICKER:swaggystocks` namespace per
 * TTL_SECONDS.community.
 *
 * Per Assumption A5, if the JSON endpoint is permanently moved, the adapter
 * returns null — there is no scrape-based fallback. Callers fall back through
 * `Promise.allSettled` in the orchestrator.
 */
export async function fetchSwaggyStocks(
  ticker: string,
): Promise<CommunitySignal | null> {
  try {
    return await cached(
      `${CACHE_KEYS.community(ticker)}:swaggystocks`,
      async () => {
        try {
          return await withRetry(() => doFetchSwaggyStocks(ticker), {
            maxAttempts: 3,
            baseDelayMs: 100,
          });
        } catch (err) {
          console.warn(
            `[swaggystocks] ${ticker} failed:`,
            err instanceof Error ? err.message : String(err),
          );
          return null;
        }
      },
      { ttlSeconds: TTL_SECONDS.community },
    );
  } catch (err) {
    // Belt-and-suspenders — Promise.allSettled in Task 4 also catches, but the
    // adapter itself must NEVER throw per T-19-C-05-01.
    console.warn(
      `[swaggystocks] ${ticker} cache-layer failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
