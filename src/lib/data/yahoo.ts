// src/lib/data/yahoo.ts
// yahoo-finance2 data collection functions for structured financial data.
// All functions return typed objects with collected_at timestamps (DATA-07).
// Errors throw typed exceptions — callers use Promise.allSettled.

import YahooFinance from 'yahoo-finance2';
import type {
  TickerSearchResult,
  ChartDataPoint,
  MarketDataSection,
  FundamentalsSection,
} from '@/lib/types';

// yahoo-finance2 v3 requires instantiation
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// TICK-01: Ticker/company search for autocomplete
export async function searchTickers(query: string): Promise<TickerSearchResult[]> {
  const results = await yahooFinance.search(query);
  // yahoo-finance2 v3 returns typeDisp as lowercase (e.g. 'equity', not 'Equity')
  const equities = results.quotes
    ?.filter((q) => q.isYahooFinance && q.typeDisp?.toLowerCase() === 'equity')
    .slice(0, 8) ?? [];

  return equities.map((q) => ({
    symbol: q.symbol as string,
    shortname: (q.shortname as string | undefined) ?? null,
    longname: (q.longname as string | undefined) ?? null,
    exchDisp: (q.exchDisp as string | undefined) ?? null,
    typeDisp: (q.typeDisp as string | undefined) ?? null,
    currentPrice: null, // Populated by the API route via a separate quote() call
  }));
}

// TICK-02: 1-month OHLCV chart data for chart confirmation view
export async function fetchChartData(ticker: string): Promise<ChartDataPoint[]> {
  const period1 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await yahooFinance.chart(ticker, {
    period1,
    period2: new Date(),
    interval: '1d',
  });

  return (result.quotes ?? [])
    .filter((q) => q.close != null)
    .map((q) => ({
      time: q.date.toISOString().split('T')[0], // YYYY-MM-DD
      value: q.close as number,
    }));
}

// DATA-01: Current market data (price, volume, 52-week range, market cap)
export async function fetchMarketData(ticker: string): Promise<MarketDataSection> {
  const collected_at = new Date().toISOString();
  try {
    const quote = await yahooFinance.quote(ticker);
    return {
      collected_at,
      price: quote.regularMarketPrice ?? null,
      volume: quote.regularMarketVolume ?? null,
      market_cap: quote.marketCap ?? null,
      fifty_two_week_high: quote.fiftyTwoWeekHigh ?? null,
      fifty_two_week_low: quote.fiftyTwoWeekLow ?? null,
      percent_change_today: quote.regularMarketChangePercent ?? null,
      exchange: quote.fullExchangeName ?? null,
    };
  } catch (err) {
    return {
      collected_at,
      price: null,
      volume: null,
      market_cap: null,
      fifty_two_week_high: null,
      fifty_two_week_low: null,
      percent_change_today: null,
      exchange: null,
      error: err instanceof Error ? err.message : 'fetchMarketData failed',
    };
  }
}

// DATA-02: Company fundamentals (P/E, EPS, revenue, debt ratios)
export async function fetchFundamentals(ticker: string): Promise<FundamentalsSection> {
  const collected_at = new Date().toISOString();
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ['financialData', 'defaultKeyStatistics'],
    });
    const dks = summary.defaultKeyStatistics;
    return {
      collected_at,
      // DefaultKeyStatistics has [key: string]: unknown index signature; cast each field
      pe_ratio: (dks?.trailingPE as number | undefined) ?? null,
      eps: (dks?.trailingEps as number | undefined) ?? null,
      revenue: summary.financialData?.totalRevenue ?? null,
      debt_to_equity: (summary.financialData?.debtToEquity as number | undefined) ?? null,
      profit_margin: summary.financialData?.profitMargins ?? null,
    };
  } catch (err) {
    return {
      collected_at,
      pe_ratio: null,
      eps: null,
      revenue: null,
      debt_to_equity: null,
      profit_margin: null,
      error: err instanceof Error ? err.message : 'fetchFundamentals failed',
    };
  }
}
