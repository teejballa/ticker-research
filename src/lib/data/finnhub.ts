// src/lib/data/finnhub.ts
// Finnhub market data fetcher — profile2 + metric=all endpoints.
// Returns available:false gracefully when FINNHUB_API_KEY is absent or fetch fails.
// Field names verified against live API (AAPL test, April 2026).

import type {
  SupplementarySource,
  SupplementaryMarketFields,
  SupplementaryFundamentalsFields,
} from '@/lib/types';
import { cached } from '@/lib/data/cache/upstash';
import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';
import { withRetry } from '@/lib/data/retry';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';

const BASE = 'https://finnhub.io/api/v1';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Fetch a single Finnhub URL with `withRetry` (3x on 5xx + network) and
 * coerce non-OK responses into a thrown status-Error so the retry classifier
 * can decide whether to back off.
 */
async function fetchOk(url: string, ticker?: string): Promise<Response> {
  return withTelemetry(
    'finnhub',
    () =>
      withRetry(
        async () => {
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) {
            const err = Object.assign(new Error(`finnhub ${res.status}`), { status: res.status });
            throw err;
          }
          return res;
        },
        { maxAttempts: 3, baseDelayMs: 100 },
      ),
    { ticker },
  );
}

/**
 * Post-Phase-19 P0: wrapped in cached(24h) + per-request withRetry inside
 * fetchOk. The cache wrapper no-ops gracefully when Upstash is unset.
 */
export async function fetchFinnhub(ticker: string): Promise<SupplementarySource> {
  const key = process.env.FINNHUB_API_KEY;
  const empty = (available: boolean): SupplementarySource => ({
    name: 'Finnhub', fetched_at: new Date().toISOString(), text_block: '', available,
  });
  if (!key) return empty(false);

  return cached<SupplementarySource>(
    CACHE_KEYS.fundamentals(`finnhub:${ticker.toUpperCase()}`),
    () => fetchFinnhubInner(ticker, key, empty),
    { ttlSeconds: TTL_SECONDS.fundamentals },
  );
}

async function fetchFinnhubInner(
  ticker: string,
  key: string,
  empty: (available: boolean) => SupplementarySource,
): Promise<SupplementarySource> {
  try {
    const [pRes, mRes] = await Promise.all([
      fetchOk(`${BASE}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${key}`, ticker),
      fetchOk(`${BASE}/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${key}`, ticker),
    ]);
    if (!pRes.ok || !mRes.ok) return empty(false);

    const profile = await pRes.json() as Record<string, unknown>;
    const { metric = {} } = await mRes.json() as { metric?: Record<string, unknown> };

    if (!profile.name && !profile.ticker) return empty(false);

    const mktCapM = num(profile.marketCapitalization); // Finnhub returns market cap in millions
    const mktCap = mktCapM != null ? `$${(mktCapM / 1000).toFixed(2)}B` : 'N/A';

    // Parsed structured fields for the Phase-10 merge layer.
    // Finnhub's profile2/metric=all do not return current price/volume/percent-change,
    // so those stay null and the merge cascade falls through to other sources.
    const peTTM = num(metric.peTTM);
    const peAnnual = num(metric.peAnnual);
    const epsTTM = num(metric.epsTTM);
    const epsAnnual = num(metric.epsAnnual);
    const revPerShareTTM = num(metric.revenuePerShareTTM);
    const sharesOutMillions = num(profile.shareOutstanding);
    const netMarginTTM = num(metric.netProfitMarginTTM); // returned as percent
    const debtEquity =
      num((metric as Record<string, unknown>)['totalDebt/totalEquityQuarterly']) ??
      num((metric as Record<string, unknown>)['totalDebt/totalEquityAnnual']);

    const market: SupplementaryMarketFields = {
      price: null,
      volume: null,
      market_cap: mktCapM != null ? mktCapM * 1_000_000 : null,
      fifty_two_week_high: num((metric as Record<string, unknown>)['52WeekHigh']),
      fifty_two_week_low: num((metric as Record<string, unknown>)['52WeekLow']),
      percent_change_today: null,
      exchange: str(profile.exchange),
    };

    const fundamentals: SupplementaryFundamentalsFields = {
      pe_ratio: peTTM ?? peAnnual,
      eps: epsTTM ?? epsAnnual,
      revenue:
        revPerShareTTM != null && sharesOutMillions != null
          ? revPerShareTTM * sharesOutMillions * 1_000_000
          : null,
      debt_to_equity: debtEquity,
      profit_margin: netMarginTTM != null ? netMarginTTM / 100 : null,
    };

    const f = (v: unknown) => v != null ? String(v) : 'N/A';
    const fetched_at = new Date().toISOString();
    const text_block = [
      '=== MARKET DATA: FINNHUB ===',
      `Ticker: ${f(profile.ticker) !== 'N/A' ? profile.ticker : ticker}`,
      `Company: ${f(profile.name)}`,
      `Exchange: ${f(profile.exchange)}`,
      `Country: ${f(profile.country)}`,
      `Industry: ${f(profile.finnhubIndustry)}`,
      `Market Cap: ${mktCap}`,
      `Shares Outstanding (M): ${f(profile.shareOutstanding)}`,
      `P/E (Annual): ${f(metric.peAnnual)}`,
      `P/E (TTM): ${f(metric.peTTM)}`,
      `P/E (Forward): ${f(metric.forwardPE)}`,
      `EPS (Annual): ${f(metric.epsAnnual)}`,
      `EPS (TTM): ${f(metric.epsTTM)}`,
      `Revenue/Share (Annual): ${f(metric.revenuePerShareAnnual)}`,
      `Revenue/Share (TTM): ${f(metric.revenuePerShareTTM)}`,
      `52-Week High: ${f(metric['52WeekHigh'])}`,
      `52-Week Low: ${f(metric['52WeekLow'])}`,
      `Beta: ${f(metric.beta)}`,
      `Net Profit Margin (Annual): ${f(metric.netProfitMarginAnnual)}%`,
      `Net Profit Margin (TTM): ${f(metric.netProfitMarginTTM)}%`,
      `Total Debt/Equity (Annual): ${f(metric['totalDebt/totalEquityAnnual'])}`,
      `ROA (TTM): ${f(metric.roaTTM)}`,
      `ROE (TTM): ${f(metric.roeTTM)}`,
      `P/B: ${f(metric.pb)}`,
      `Current Ratio (Annual): ${f(metric.currentRatioAnnual)}`,
      `Dividend Yield: ${f(metric.dividendYieldIndicatedAnnual)}%`,
      `Data As Of: ${fetched_at}`,
    ].join('\n');

    return { name: 'Finnhub', fetched_at, text_block, available: true, market, fundamentals };
  } catch {
    return empty(false);
  }
}
