/**
 * Plan 19-B-03 — Tiingo adapter (D-26).
 *
 * Point-in-time fundamentals + EOD market data from Tiingo ($30/mo Hobbyist).
 * Dormant primitive — Plan 19-B-06 wires it into source-package.ts merge ladder
 * as the new top tier (tiingo → twelvedata → yahoo → finnhub → polygon).
 *
 * Returns MarketDataSection / FundamentalsSection (canonical shapes from
 * src/lib/types.ts) so the existing field-level merge layer can consume the
 * output unchanged. Per D-32 fallback semantics, both functions return null
 * (not throw) on:
 *
 *   - missing TIINGO_API_KEY              (graceful degrade)
 *   - 4xx response (incl. 401/403/404)    (per D-25, do NOT retry)
 *   - network or 5xx error after retries  (withRetry exhaustion)
 *
 * Threat model:
 *   - T-19-B-03-01 (key in logs): API key attached as `Authorization: Token <k>`
 *     header. Never interpolated into URL strings or error messages. Console
 *     output contains only HTTP status (`tiingo quote 503`) — no key, no header.
 *   - T-19-B-03-02 (rate limit): withRetry only retries 5xx + network (never
 *     429). cached() with 5min/24h TTL keeps call frequency far below the
 *     500/hr Hobbyist quota.
 */

import { cached } from '@/lib/data/cache/upstash';
import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';
import { withRetry } from '@/lib/data/retry';
import type { MarketDataSection, FundamentalsSection } from '@/lib/types';

const TIINGO_BASE = 'https://api.tiingo.com';

function getApiKey(): string | null {
  const k = process.env.TIINGO_API_KEY;
  return k && k.length > 0 ? k : null;
}

/**
 * Tiingo IEX endpoint shape (as documented at
 * https://www.tiingo.com/documentation/iex). The endpoint returns an array
 * because it accepts a comma-separated ticker list; for single-ticker calls
 * the array has length 1.
 */
interface TiingoIexQuote {
  ticker?: string;
  last?: number | null;
  tngoLast?: number | null;
  prevClose?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  timestamp?: string | null;
}

/**
 * Tiingo fundamentals endpoint shape. Tiingo's `/fundamentals/<ticker>/statements`
 * returns a JSON object keyed by latest-period statement values. We map the
 * subset that overlaps with FundamentalsSection.
 */
interface TiingoFundamentals {
  ticker?: string;
  peRatio?: number | null;
  eps?: number | null;
  revenue?: number | null;
  marketCap?: number | null;
  debtToEquity?: number | null;
  profitMargin?: number | null;
}

/**
 * Throws an `Error` whose `status` property is set so isRetryableError() in
 * src/lib/data/retry.ts can classify it. Importantly, the message contains
 * only the HTTP status — never the API key or Authorization header.
 */
function statusError(prefix: string, status: number): Error & { status: number } {
  const err = new Error(`${prefix} ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

async function doFetchTiingoQuote(ticker: string): Promise<MarketDataSection | null> {
  const key = getApiKey();
  if (!key) return null;

  const url = `${TIINGO_BASE}/iex/${encodeURIComponent(ticker)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${key}` },
  });
  if (!res.ok) {
    throw statusError('tiingo quote', res.status);
  }

  const json = (await res.json()) as TiingoIexQuote[] | TiingoIexQuote;
  const row: TiingoIexQuote | undefined = Array.isArray(json) ? json[0] : json;
  if (!row) return null;

  const last = row.last ?? row.tngoLast ?? null;
  const prev = row.prevClose ?? null;
  // percent_change_today is a decimal fraction (e.g. -0.0101 = -1.01%) per
  // the convention established by yahoo.ts.
  const percent_change_today =
    last != null && prev != null && prev !== 0 ? (last - prev) / prev : null;

  return {
    collected_at: new Date().toISOString(),
    price: last,
    volume: row.volume ?? null,
    market_cap: null,            // Tiingo IEX doesn't surface market cap; fundamentals does.
    fifty_two_week_high: null,   // Same — would require a separate /tiingo/daily call.
    fifty_two_week_low: null,
    percent_change_today,
    exchange: null,
  };
}

async function doFetchTiingoFundamentals(
  ticker: string,
): Promise<FundamentalsSection | null> {
  const key = getApiKey();
  if (!key) return null;

  // Tiingo's daily-fundamentals endpoint returns an array of period rows; the
  // /statements path returns the latest. We use /daily for the simple ratio
  // shape (peRatio / marketCap / etc.) since that overlaps with what
  // FundamentalsSection cares about. The endpoint is stable per
  // https://www.tiingo.com/documentation/fundamentals.
  const url = `${TIINGO_BASE}/tiingo/fundamentals/${encodeURIComponent(ticker)}/daily`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${key}` },
  });
  if (!res.ok) {
    throw statusError('tiingo fundamentals', res.status);
  }

  const json = (await res.json()) as TiingoFundamentals | TiingoFundamentals[];
  const row: TiingoFundamentals | undefined = Array.isArray(json)
    ? json[json.length - 1]
    : json;
  if (!row) return null;

  return {
    collected_at: new Date().toISOString(),
    pe_ratio: row.peRatio ?? null,
    eps: row.eps ?? null,
    revenue: row.revenue ?? null,
    debt_to_equity: row.debtToEquity ?? null,
    profit_margin: row.profitMargin ?? null,
  };
}

/**
 * Fetch the latest Tiingo IEX quote for `ticker`. Cached 5min, retried 3x on
 * 5xx + network errors. Returns null on auth failure, 4xx, retry exhaustion,
 * or missing API key.
 */
export async function fetchTiingoQuote(
  ticker: string,
): Promise<MarketDataSection | null> {
  try {
    return await cached(
      `${CACHE_KEYS.quote(ticker)}:tiingo`,
      () =>
        withRetry(() => doFetchTiingoQuote(ticker), {
          maxAttempts: 3,
          baseDelayMs: 100,
        }),
      { ttlSeconds: TTL_SECONDS.quote },
    );
  } catch (err) {
    // SECURITY: err.message is `tiingo quote <status>` — no key. err.stack
    // contains code paths only, never headers. Stringify to message only.
    console.warn(
      `[tiingo] quote(${ticker}) failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Fetch the latest Tiingo daily fundamentals row for `ticker`. Cached 24h,
 * retried 3x on 5xx + network errors. Same null-on-error semantics as
 * fetchTiingoQuote.
 */
export async function fetchTiingoFundamentals(
  ticker: string,
): Promise<FundamentalsSection | null> {
  try {
    return await cached(
      `${CACHE_KEYS.fundamentals(ticker)}:tiingo`,
      () =>
        withRetry(() => doFetchTiingoFundamentals(ticker), {
          maxAttempts: 3,
          baseDelayMs: 100,
        }),
      { ttlSeconds: TTL_SECONDS.fundamentals },
    );
  } catch (err) {
    console.warn(
      `[tiingo] fundamentals(${ticker}) failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
