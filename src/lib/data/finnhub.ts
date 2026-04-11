// src/lib/data/finnhub.ts
// Finnhub market data fetcher — profile2 + metric=all endpoints.
// Returns available:false gracefully when FINNHUB_API_KEY is absent or fetch fails.
// Field names verified against live API (AAPL test, April 2026).

import type { SupplementarySource } from '@/lib/types';

const BASE = 'https://finnhub.io/api/v1';

export async function fetchFinnhub(ticker: string): Promise<SupplementarySource> {
  const key = process.env.FINNHUB_API_KEY;
  const empty = (available: boolean): SupplementarySource => ({
    name: 'Finnhub', fetched_at: new Date().toISOString(), text_block: '', available,
  });
  if (!key) return empty(false);

  try {
    const [pRes, mRes] = await Promise.all([
      fetch(`${BASE}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${key}`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${BASE}/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${key}`, { signal: AbortSignal.timeout(5000) }),
    ]);
    if (!pRes.ok || !mRes.ok) return empty(false);

    const profile = await pRes.json() as Record<string, unknown>;
    const { metric = {} } = await mRes.json() as { metric?: Record<string, unknown> };

    if (!profile.name && !profile.ticker) return empty(false);

    const mktCapM = typeof profile.marketCapitalization === 'number' ? profile.marketCapitalization : null;
    const mktCap = mktCapM != null ? `$${(mktCapM / 1000).toFixed(2)}B` : 'N/A';

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

    return { name: 'Finnhub', fetched_at, text_block, available: true };
  } catch {
    return empty(false);
  }
}
