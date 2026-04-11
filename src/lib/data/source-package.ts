// src/lib/data/source-package.ts
// Orchestrates parallel data collection and assembles the SourcePackage.
// DATA-08: Claude Code SDK orchestrates all collection and structures inputs.
// Uses Promise.allSettled — a single source failure does not abort the pipeline.

import { fetchMarketData, fetchFundamentals } from '@/lib/data/yahoo';
import {
  fetchNews,
  fetchAnalystSentiment,
  fetchSecFilingSummary,
  fetchSocialSentiment,
} from '@/lib/data/anthropic-search';
import { fetchFinnhub } from '@/lib/data/finnhub';
import { fetchPolygon } from '@/lib/data/polygon';
import type { SourcePackage, MarketDataSection, FundamentalsSection, SupplementaryMarketData, SupplementarySource } from '@/lib/types';
import type { SecurityType } from '@/lib/types';

// Empty fallback sections for when a data source fails completely
function emptyMarketData(error: string): MarketDataSection {
  return {
    collected_at: new Date().toISOString(),
    price: null,
    volume: null,
    market_cap: null,
    fifty_two_week_high: null,
    fifty_two_week_low: null,
    percent_change_today: null,
    exchange: null,
    error,
  };
}

function emptyFundamentals(error: string): FundamentalsSection {
  return {
    collected_at: new Date().toISOString(),
    pe_ratio: null,
    eps: null,
    revenue: null,
    debt_to_equity: null,
    profit_margin: null,
    error,
  };
}

export async function collectAllData(
  ticker: string,
  companyName: string = ticker,
  exchange: string | null = null,
  securityType: SecurityType = 'equity',
): Promise<SourcePackage> {
  // Run all 8 data sources in parallel — Promise.allSettled never throws
  const [
    marketDataResult,
    fundamentalsResult,
    newsResult,
    analystResult,
    secResult,
    socialResult,
    finnhubResult,
    polygonResult,
  ] = await Promise.allSettled([
    fetchMarketData(ticker),
    fetchFundamentals(ticker),
    fetchNews(ticker, securityType),
    fetchAnalystSentiment(ticker, securityType),
    fetchSecFilingSummary(ticker, securityType),
    fetchSocialSentiment(ticker, securityType),
    fetchFinnhub(ticker),
    fetchPolygon(ticker),
  ]);

  const collection_errors: string[] = [];

  function settle<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
    if (result.status === 'fulfilled') return result.value;
    const msg = `${label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`;
    collection_errors.push(msg);
    return fallback;
  }

  // settleSupplementary extracts a SupplementarySource from a settled result.
  // Missing API keys are handled internally by each fetcher (they return available:false),
  // so only unexpected rejections (network errors not caught inside the fetcher) push to collection_errors.
  const settleSupplementary = (
    result: PromiseSettledResult<SupplementarySource>,
    sourceName: string,
  ): SupplementarySource => {
    if (result.status === 'fulfilled') return result.value;
    collection_errors.push(
      `${sourceName}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
    );
    return { name: sourceName, fetched_at: new Date().toISOString(), text_block: '', available: false };
  };

  const supplementary_market_data: SupplementaryMarketData = {
    sources: [
      settleSupplementary(finnhubResult, 'Finnhub'),
      settleSupplementary(polygonResult, 'Polygon'),
    ],
  };

  return {
    ticker,
    company_name: companyName,
    exchange,
    security_type: securityType,
    assembled_at: new Date().toISOString(),
    market_data: settle(marketDataResult, emptyMarketData('market data collection failed'), 'market_data'),
    fundamentals: settle(fundamentalsResult, emptyFundamentals('fundamentals collection failed'), 'fundamentals'),
    news: settle(newsResult, { collected_at: new Date().toISOString(), items: [], error: 'news collection failed' }, 'news'),
    analyst_sentiment: settle(analystResult, { collected_at: new Date().toISOString(), consensus: null, avg_price_target: null, analyst_count: null, recent_changes: [], error: 'analyst collection failed' }, 'analyst_sentiment'),
    sec_filing_summary: settle(secResult, { collected_at: new Date().toISOString(), most_recent_10k: null, most_recent_10q: null, filing_dates: { '10k': null, '10q': null }, error: 'SEC filing collection failed' }, 'sec_filing_summary'),
    social_sentiment: settle(socialResult, { collected_at: new Date().toISOString(), overall_tone: null, signals: [], sources_checked: [], error: 'social sentiment collection failed' }, 'social_sentiment'),
    collection_errors,
    supplementary_market_data,
  };
}
