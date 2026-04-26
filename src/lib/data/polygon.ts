// src/lib/data/polygon.ts
// Polygon.io market data fetcher — ticker reference + financial statements.
// Returns available:false gracefully when POLYGON_API_KEY is absent or fetch fails.
// Financial statements (vX endpoint) are optional — skipped gracefully if unavailable.
// Field names verified against live API (AAPL test, April 2026).

import type {
  SupplementarySource,
  SupplementaryMarketFields,
  SupplementaryFundamentalsFields,
} from '@/lib/types';

const BASE = 'https://api.polygon.io';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export async function fetchPolygon(ticker: string): Promise<SupplementarySource> {
  const key = process.env.POLYGON_API_KEY;
  const empty = (available: boolean): SupplementarySource => ({
    name: 'Polygon', fetched_at: new Date().toISOString(), text_block: '', available,
  });
  if (!key) return empty(false);

  try {
    const [refRes, finRes] = await Promise.all([
      fetch(`${BASE}/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${key}`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${BASE}/vX/reference/financials?ticker=${encodeURIComponent(ticker)}&limit=1&apiKey=${key}`, { signal: AbortSignal.timeout(5000) }),
    ]);
    if (!refRes.ok) return empty(false);

    const refData = await refRes.json() as { results?: Record<string, unknown> };
    const r = refData.results;
    if (!r) return empty(false);

    // Financial statements are optional — don't fail if endpoint returns error
    let revenues: number | null = null;
    let netIncome: number | null = null;
    let epsBasic: number | null = null;
    if (finRes.ok) {
      try {
        const finData = await finRes.json() as { results?: Array<{ financials?: { income_statement?: Record<string, { value?: number }> } }> };
        const ic = finData.results?.[0]?.financials?.income_statement ?? {};
        revenues = ic.revenues?.value ?? null;
        netIncome = ic.net_income_loss?.value ?? null;
        epsBasic = ic.basic_earnings_per_share?.value ?? null;
      } catch { /* optional — income statement data is supplementary */ }
    }

    const f = (v: unknown) => v != null ? String(v) : 'N/A';
    const fmt = (n: number | null, divisor: number, suffix: string) =>
      n != null ? `${(n / divisor).toFixed(2)}${suffix}` : 'N/A';

    const mktCap = typeof r.market_cap === 'number'
      ? (r.market_cap >= 1e12 ? fmt(r.market_cap, 1e12, 'T') : fmt(r.market_cap, 1e9, 'B'))
      : 'N/A';

    const fetched_at = new Date().toISOString();
    const text_block = [
      '=== MARKET DATA: POLYGON ===',
      `Ticker: ${ticker}`,
      `Company: ${f(r.name)}`,
      `Exchange: ${f(r.primary_exchange)}`,
      `Sector/SIC: ${f(r.sic_description)}`,
      `Employees: ${f(r.total_employees)}`,
      `Market Cap: $${mktCap}`,
      `Shares Outstanding: ${f(r.share_class_shares_outstanding)}`,
      `Description: ${typeof r.description === 'string' ? r.description.slice(0, 300) : 'N/A'}`,
      `--- Latest Financial Statements ---`,
      `Revenue: ${revenues != null ? `$${(revenues / 1e9).toFixed(2)}B` : 'N/A'}`,
      `Net Income: ${netIncome != null ? `$${(netIncome / 1e9).toFixed(2)}B` : 'N/A'}`,
      `EPS (Basic): ${f(epsBasic)}`,
      `Data As Of: ${fetched_at}`,
    ].join('\n');

    // Parsed structured fields for the Phase-10 merge layer.
    // Polygon's /v3/reference/tickers endpoint does not return current price/volume,
    // so those stay null and the merge cascade falls through to yahoo / finnhub.
    const market: SupplementaryMarketFields = {
      price: null,
      volume: null,
      market_cap: num(r.market_cap),
      fifty_two_week_high: null,
      fifty_two_week_low: null,
      percent_change_today: null,
      exchange: str(r.primary_exchange),
    };

    const profitMargin =
      revenues != null && revenues !== 0 && netIncome != null ? netIncome / revenues : null;

    const fundamentals: SupplementaryFundamentalsFields = {
      pe_ratio: null,
      eps: epsBasic,
      revenue: revenues,
      debt_to_equity: null,
      profit_margin: profitMargin,
    };

    return { name: 'Polygon', fetched_at, text_block, available: true, market, fundamentals };
  } catch {
    return empty(false);
  }
}
