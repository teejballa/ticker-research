// src/lib/types.ts
// Canonical type contracts for the Ticker Research source package.
// All data collection functions return types defined here.
// DATA-07: every section includes collected_at (ISO 8601 timestamp).

export interface SourceSection {
  collected_at: string; // ISO 8601 — DATA-07
  error?: string;       // Set if this section's collection failed gracefully
}

export interface MarketDataSection extends SourceSection {
  price: number | null;
  volume: number | null;
  market_cap: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  percent_change_today: number | null;
  exchange: string | null;
}

export interface FundamentalsSection extends SourceSection {
  pe_ratio: number | null;
  eps: number | null;
  revenue: number | null;
  debt_to_equity: number | null;
  profit_margin: number | null;
}

export interface NewsItem {
  headline: string;
  url: string;
  published_date: string;
  source: string;
}

export interface NewsSection extends SourceSection {
  items: NewsItem[];
}

export interface AnalystChange {
  analyst: string;
  firm: string;
  action: string;
  date: string;
}

export interface AnalystSentimentSection extends SourceSection {
  consensus: 'Buy' | 'Hold' | 'Sell' | null;
  avg_price_target: number | null;
  analyst_count: number | null;
  recent_changes: AnalystChange[];
}

export interface SecFilingSummarySection extends SourceSection {
  most_recent_10k: string | null;
  most_recent_10q: string | null;
  filing_dates: { '10k': string | null; '10q': string | null };
}

export interface SocialSentimentSection extends SourceSection {
  overall_tone: 'bullish' | 'bearish' | 'neutral' | null;
  signals: string[];
  sources_checked: string[];
}

export interface ChartDataPoint {
  time: string;   // YYYY-MM-DD format for lightweight-charts
  value: number;  // closing price
}

export interface TickerSearchResult {
  symbol: string;
  shortname: string | null;
  longname: string | null;
  exchDisp: string | null;
  typeDisp: string | null;
  currentPrice?: number | null;
}

export interface SourcePackage {
  ticker: string;
  company_name: string;
  exchange: string | null;
  assembled_at: string;  // ISO 8601 — when the package was assembled
  market_data: MarketDataSection;
  fundamentals: FundamentalsSection;
  news: NewsSection;
  analyst_sentiment: AnalystSentimentSection;
  sec_filing_summary: SecFilingSummarySection;
  social_sentiment: SocialSentimentSection;
  collection_errors: string[];
}
