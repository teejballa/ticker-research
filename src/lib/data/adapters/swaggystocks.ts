/**
 * Plan 19-C-05 — Swaggystocks adapter (D-37, SUPPLEMENTAL).
 *
 * Per D-37 + user direction 2026-05-07 ("firecrawl is very reliable"),
 * Swaggystocks is a SUPPLEMENTAL community-data source. Firecrawl REMAINS
 * PRIMARY. Output is merged into `SentimentSnapshot.community_aggregated`
 * JSONB column by `lightweight-community-scan.ts` (Task 4) — never replaces
 * the Firecrawl branch.
 *
 * Per RESEARCH Assumption A5, swaggystocks.com has no official API docs;
 * the endpoint shape was community-discovered and is MEDIUM confidence. The
 * adapter:
 *
 *   1. Tries the JSON endpoint at `https://api.swaggystocks.com/wsb/ticker/<TICKER>`
 *   2. On 4xx (endpoint moved) — graceful null. The Firecrawl-fallback path
 *      is intentionally NOT auto-triggered here: it would require a Firecrawl
 *      credit per call, and the planner's intent was "fall back to Firecrawl
 *      scrape" only when the JSON endpoint is fundamentally unavailable AND
 *      the operator opts in. We expose `fetchSwaggyStocksViaFirecrawl` for
 *      that use-case but the default `fetchSwaggyStocks` does NOT consume it
 *      (so a flaky 4xx doesn't burn Firecrawl credits silently). If
 *      operators want the fallback, they wire it explicitly in Task 4.
 *   3. Maps a successful payload to `CommunitySignal`.
 *
 * Threat-model mitigations (T-19-C-05-01):
 *   - Any non-2xx response, retry exhaustion, or unexpected payload returns
 *     null. The adapter NEVER throws — it cannot crash the canonical
 *     Firecrawl primary path. Promise.allSettled in Task 4 is a second
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
 * Per Assumption A5, if the JSON endpoint is permanently moved, operators
 * may wire the Firecrawl-scrape fallback by importing
 * `fetchSwaggyStocksViaFirecrawl` and chaining it after this returns null.
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

/**
 * Optional Firecrawl-scrape fallback per RESEARCH Assumption A5. Only fires
 * when explicitly invoked — `fetchSwaggyStocks` does NOT auto-call this on
 * 4xx, because doing so would burn Firecrawl credits silently. Operators
 * who want the fallback can chain:
 *
 *   const sig = (await fetchSwaggyStocks(t))
 *             ?? (await fetchSwaggyStocksViaFirecrawl(t));
 *
 * Returns null gracefully when FIRECRAWL_API_KEY is missing or the scrape
 * fails — same null-sentinel discipline as the JSON path.
 */
export async function fetchSwaggyStocksViaFirecrawl(
  ticker: string,
): Promise<CommunitySignal | null> {
  if (!process.env.FIRECRAWL_API_KEY) return null;
  try {
    // Lazy-import Firecrawl so the JSON-only fast path doesn't load the SDK.
    const { default: Firecrawl } = await import('@mendable/firecrawl-js');
    const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
    const url = `https://swaggystocks.com/dashboard/wsb/ticker/${encodeURIComponent(ticker.toUpperCase())}`;
    const doc = await fc.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    } as Parameters<typeof fc.scrape>[1]);
    const md = (doc as { markdown?: string }).markdown ?? '';
    if (md.length < 100) return null;

    // Parse loose mention-count + bullish-percent from markdown. The page
    // surfaces both as numeric strings near labels.
    const mentionMatch = md.match(/(\d{1,6})\s*mentions?/i);
    const bullishMatch = md.match(/bullish[^0-9]{0,20}(\d{1,3})\s*%/i);
    const bearishMatch = md.match(/bearish[^0-9]{0,20}(\d{1,3})\s*%/i);

    const mention_count = mentionMatch ? num(mentionMatch[1]) : null;
    if (mention_count == null) return null;

    return {
      source: 'swaggystocks',
      mention_count,
      bullish_pct: bullishMatch ? num(bullishMatch[1]) : null,
      bearish_pct: bearishMatch ? num(bearishMatch[1]) : null,
      trending_rank: null,
    };
  } catch (err) {
    console.warn(
      `[swaggystocks] firecrawl-fallback ${ticker} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
