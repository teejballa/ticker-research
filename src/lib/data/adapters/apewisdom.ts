/**
 * Plan 19-C-05 — ApeWisdom adapter (D-37, SUPPLEMENTAL).
 *
 * Per D-37 + user direction 2026-05-07 ("firecrawl is very reliable"),
 * ApeWisdom is a SUPPLEMENTAL community-data source. Firecrawl REMAINS PRIMARY.
 * Output is merged into `SentimentSnapshot.community_aggregated` JSONB column
 * by `lightweight-community-scan.ts` (Task 4) — never replaces the Firecrawl
 * branch.
 *
 * Endpoint (free, no auth — per RESEARCH §Sources line 985):
 *   https://apewisdom.io/api/v1.0/filter/all-stocks/page/1
 *
 * Returns a paginated list of trending tickers. Per the plan's
 * `CommunitySignal` interface, we map the row matching the requested ticker
 * (case-insensitive). If the ticker is not in the trending set, we return
 * null — that's the correct semantic for "no community signal observed".
 *
 * Threat-model mitigations (T-19-C-05-01):
 *   - Any non-2xx response, retry exhaustion, or unexpected payload returns
 *     null. The adapter NEVER throws — it cannot crash the canonical
 *     Firecrawl primary path (Promise.allSettled in Task 4 absorbs this too,
 *     but the null-sentinel discipline is the first line of defense).
 *   - withRetry(5xx + network only — D-25). 429 is 4xx → not retried, surfaces
 *     fast. cached(10min — TTL_SECONDS.community) keeps call frequency low.
 */

import { cached } from '@/lib/data/cache/upstash';
import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';
import { withRetry } from '@/lib/data/retry';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';

export interface CommunitySignal {
  source: 'swaggystocks' | 'apewisdom';
  mention_count: number;
  bullish_pct: number | null;
  bearish_pct: number | null;
  trending_rank: number | null;
}

const APEWISDOM_BASE = 'https://apewisdom.io/api/v1.0';

interface ApeWisdomRow {
  ticker?: string;
  mentions?: number | string | null;
  // Some endpoint variants surface bullish percentage as `sentiment` (0-100).
  sentiment?: number | string | null;
  rank?: number | string | null;
}

interface ApeWisdomEnvelope {
  count?: number;
  pages?: number;
  currentPage?: number;
  results?: ApeWisdomRow[];
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

async function doFetchApeWisdom(ticker: string): Promise<CommunitySignal | null> {
  // `all-stocks` filter covers the major equity universe (vs `wallstreetbets`
  // which is WSB-only). For supplemental signal we want broad coverage.
  const url = `${APEWISDOM_BASE}/filter/all-stocks/page/1`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw statusError('apewisdom', res.status);
  }

  const env = (await res.json()) as ApeWisdomEnvelope;
  const rows = Array.isArray(env.results) ? env.results : [];
  if (rows.length === 0) return null;

  const upper = ticker.toUpperCase();
  const row = rows.find(
    (r) => typeof r.ticker === 'string' && r.ticker.toUpperCase() === upper,
  );
  if (!row) return null;

  const mentions = num(row.mentions);
  if (mentions == null) return null;

  // Sentiment is 0-100 bullish (per ApeWisdom convention). Bearish is the
  // complement when bullish is non-null. If sentiment field absent, leave
  // both null — caller can still consume mention_count + trending_rank.
  const bullish = num(row.sentiment);
  const bearish = bullish != null ? Math.max(0, 100 - bullish) : null;

  return {
    source: 'apewisdom',
    mention_count: mentions,
    bullish_pct: bullish,
    bearish_pct: bearish,
    trending_rank: num(row.rank),
  };
}

/**
 * Fetch a supplemental community signal from ApeWisdom for `ticker`.
 *
 * Returns null (graceful degrade — D-37 + T-19-C-05-01) on:
 *   - HTTP 4xx (incl. 404 / 429)
 *   - Persistent 5xx / network failure after retries
 *   - Ticker not in current trending payload
 *   - Any malformed payload
 *
 * Cached 10min via `comm:TICKER` namespace per TTL_SECONDS.community.
 */
export async function fetchApeWisdom(
  ticker: string,
): Promise<CommunitySignal | null> {
  try {
    return await cached(
      `${CACHE_KEYS.community(ticker)}:apewisdom`,
      async () => {
        try {
          // graceful catch: withRetry exhaustion bubbles up here — we degrade
          // to null so the calling Promise.allSettled branch resolves cleanly.
          // Plan 20-Z-03: telemetry wraps the retry-wrapped fetch.
          return await withTelemetry(
            'apewisdom',
            () =>
              withRetry(() => doFetchApeWisdom(ticker), {
                maxAttempts: 3,
                baseDelayMs: 100,
              }),
            { ticker },
          );
        } catch (err) {
          console.warn(
            `[apewisdom] ${ticker} failed:`,
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
      `[apewisdom] ${ticker} cache-layer failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
