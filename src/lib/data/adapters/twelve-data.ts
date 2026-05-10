/**
 * Plan 19-B-04 — Twelve Data adapter (fundamentals fallback).
 *
 * Per CONTEXT D-27, Twelve Data ($29/mo) is the second-tier fundamentals
 * fallback in the merge ladder (yahoo → tiingo → twelve_data → polygon →
 * finnhub). This module exposes a single primitive — `fetchTwelveDataFundamentals` —
 * that returns a `FundamentalsSection`-shaped result OR `null` on any
 * non-recoverable failure (missing key, 4xx, retry exhaustion).
 *
 * Wiring into the merge ladder is the responsibility of Plan 19-B-06.
 *
 * ## Threat-model mitigations (T-19-B-04)
 *   1. T-19-B-04-01 — API key in logs.
 *      Twelve Data passes the key as a `?apikey=` query param. Every error
 *      log path that includes the URL routes it through `sanitizeUrl()`,
 *      which collapses `apikey=...` to `apikey=***`. The key is *never*
 *      string-interpolated into a log line directly.
 *   2. T-19-B-04-02 — DoS / rate limit.
 *      `withRetry` skips 4xx (incl. 429) so a hot rate-limit response
 *      surfaces fast. Successful responses are cached for 24h via the
 *      `fund:TICKER` namespace + `TTL_SECONDS.fundamentals`.
 *
 * ## Wrappers
 *   - `cached(CACHE_KEYS.fundamentals(...))` (24h TTL) for the public surface.
 *   - `withRetry({ maxAttempts: 3, baseDelayMs: 100 })` inside the cache miss
 *     path so each cold lookup gets up to 3 attempts before it surfaces null.
 *
 * ## Graceful degrade
 *   Any non-retryable error (4xx) or post-retry network failure returns
 *   `null`, *not* a thrown exception, so the merge ladder can simply move
 *   on to the next source without a try/catch at every call-site.
 */

import { cached, CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache';
import { withRetry } from '@/lib/data/retry';
import type { FundamentalsSection } from '@/lib/types';

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

/**
 * Replace any `apikey=<token>` substring in a URL/string with `apikey=***`
 * before it is included in a log line. Both `?apikey=` and `&apikey=` shapes
 * are covered. Used by every error-logging path in this module so the secret
 * cannot leak via captured stderr (T-19-B-04-01).
 */
function sanitizeUrl(url: string): string {
  return url.replace(/apikey=[^&\s"]+/g, 'apikey=***');
}

/**
 * Coerce a Twelve Data numeric field that may arrive as `number`, numeric
 * string, or null/undefined into a plain `number | null`.
 */
function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

interface TwelveDataStatistics {
  statistics?: {
    valuations_metrics?: {
      trailing_pe?: number | string | null;
    };
    financials?: {
      profit_margin?: number | string | null;
      income_statement?: {
        revenue_ttm?: number | string | null;
        diluted_eps_ttm?: number | string | null;
      };
      balance_sheet?: {
        total_debt_to_equity_mrq?: number | string | null;
      };
    };
  };
  /** Twelve Data error envelope — present on 4xx with `code` + `message`. */
  code?: number;
  status?: string;
  message?: string;
}

/**
 * fetchTwelveDataFundamentals — pulls trailing P/E, diluted EPS TTM,
 * revenue TTM, total-debt-to-equity (MRQ), and profit margin from the
 * `/statistics` endpoint.
 *
 * Returns `null` (never throws) on:
 *   - missing TWELVEDATA_API_KEY
 *   - any 4xx response (incl. 401 / 403 / 404 / 429)
 *   - persistent 5xx / network failure after withRetry exhausts attempts
 *
 * On success, returns a `FundamentalsSection` populated with whatever
 * subset of fields Twelve Data returned for the symbol; missing fields
 * are surfaced as `null` (consistent with the rest of the merge layer).
 */
export async function fetchTwelveDataFundamentals(
  ticker: string,
): Promise<FundamentalsSection | null> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) return null;

  const symbol = ticker.toUpperCase();
  const url = `${TWELVE_DATA_BASE}/statistics?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;

  return cached<FundamentalsSection | null>(
    CACHE_KEYS.fundamentals(`twelve:${symbol}`),
    async () => {
      try {
        const data = await withRetry<TwelveDataStatistics>(
          async () => {
            const res = await fetch(url, { method: 'GET' });
            if (!res.ok) {
              // Attach status so withRetry's classifier sees it.
              const err = Object.assign(new Error(`Twelve Data ${res.status}`), {
                status: res.status,
              });
              throw err;
            }
            return (await res.json()) as TwelveDataStatistics;
          },
          { maxAttempts: 3, baseDelayMs: 100 },
        );

        // Twelve Data 4xx envelope — some endpoints return 200 with a
        // {code, message} payload instead of a real status. Treat those
        // as unavailable too.
        if (data && typeof data.code === 'number' && data.code >= 400) {
          console.warn(
            `[twelve-data] envelope error for ${symbol} (code=${data.code}): ${sanitizeUrl(url)}`,
          );
          return null;
        }

        const v = data?.statistics?.valuations_metrics;
        const f = data?.statistics?.financials;
        const inc = f?.income_statement;
        const bal = f?.balance_sheet;

        return {
          collected_at: new Date().toISOString(),
          pe_ratio: num(v?.trailing_pe),
          eps: num(inc?.diluted_eps_ttm),
          revenue: num(inc?.revenue_ttm),
          debt_to_equity: num(bal?.total_debt_to_equity_mrq),
          profit_margin: num(f?.profit_margin),
        };
      } catch (err) {
        const e = err as { status?: number; message?: string; code?: string };
        // 4xx — not retried, surface null.
        if (typeof e.status === 'number' && e.status >= 400 && e.status < 500) {
          console.warn(
            `[twelve-data] ${e.status} for ${symbol}: ${sanitizeUrl(url)}`,
          );
          return null;
        }
        // 5xx survived retries, or network error after retry exhaustion.
        console.error(
          `[twelve-data] fetch failed for ${symbol} (status=${e.status ?? 'n/a'}, code=${e.code ?? 'n/a'}): ${sanitizeUrl(url)}`,
        );
        return null;
      }
    },
    { ttlSeconds: TTL_SECONDS.fundamentals },
  );
}
