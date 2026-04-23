// src/lib/types.ts
// Canonical type contracts for the Ticker Research source package.
// All data collection functions return types defined here.
// DATA-07: every section includes collected_at (ISO 8601 timestamp).

// Security type classification for adaptive prompt branching (Phase 7).
// Populated by detectSecurityType() before collectAllData runs.
export type SecurityType = 'equity' | 'spac' | 'etf' | 'adr' | 'preferred' | 'crypto' | 'unknown';

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

// ---- SentimentIntelligenceSection — Phase 13: Deep Sentiment Intelligence ----
// D-14: structured signals from StockTwits API + options put/call ratio.
// reddit_tone is set to null here (derived qualitatively from community content by Gemini).

export interface SentimentIntelligenceSection extends SourceSection {
  stocktwits_bull_pct: number | null;
  stocktwits_bear_pct: number | null;
  stocktwits_message_count: number | null;
  stocktwits_is_trending: boolean | null;  // derived: Math.abs(sentiment_change) > 0.5 (no API flag)
  reddit_tone: 'bullish' | 'bearish' | 'neutral' | null;  // null — set by Gemini qualitatively
  put_call_ratio: number | null;
  put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null;
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
  security_type: SecurityType;   // populated by detectSecurityType() before collectAllData runs
  assembled_at: string;  // ISO 8601 — when the package was assembled
  market_data: MarketDataSection;
  fundamentals: FundamentalsSection;
  news: NewsSection;
  analyst_sentiment: AnalystSentimentSection;
  sec_filing_summary: SecFilingSummarySection;
  social_sentiment: SocialSentimentSection;
  collection_errors: string[];
  supplementary_market_data: SupplementaryMarketData;
  sentiment_intelligence: SentimentIntelligenceSection;
}

// ---- Supplementary Market Data — multi-source aggregation (Phase 10) ----

export interface SupplementarySource {
  name: string;        // "Finnhub" | "Polygon"
  fetched_at: string;  // ISO 8601
  text_block: string;  // pre-formatted labeled block for add_text()
  available: boolean;  // false if API key missing or fetch failed
}

export interface SupplementaryMarketData {
  sources: SupplementarySource[];
}

// ---- AnalysisResult types (Phase 12 — Gemini direct intelligence pipeline) ----

export interface AnalysisSignal {
  signal: string;
  source_citation: string;
}

export interface BuySellBreakdown {
  buy_pct: number;
  hold_pct: number;
  sell_pct: number;
  buy_rationale: string;
  hold_rationale: string;
  sell_rationale: string;
}

export interface AnalysisSource {
  name: string;
  key_fact: string;
  url?: string;  // optional source URL for direct attribution (D-11)
}

export interface CatalystEvent {
  event: string;    // e.g. "Q2 Earnings Release", "FDA Decision on GLP-1 drug"
  timing: string;   // e.g. "Expected May 2026", "Q3 2026"
  impact: 'positive' | 'negative' | 'uncertain';
}

export interface CommunityHighlight {
  community_name: string;           // e.g. "r/SecurityAnalysis", "BioPharma Catalyst Forum"
  community_type: 'mainstream' | 'niche';
  audience: string;                 // e.g. "institutional-adjacent analysts"
  standout_quote: string;           // best single user opinion (backward compat)
  theme: string;                    // primary theme (backward compat)
  sentiment: 'bullish' | 'bearish' | 'neutral';
  engagement_signal: 'high' | 'medium' | 'low';
  quotes?: string[];                // 3-5 verbatim user quotes extracted from comments
  recurring_themes?: string[];      // themes mentioned by 2+ distinct users
  unique_to_community?: string[];   // signals discussed here but absent from mainstream financial coverage
  analysis_paragraph?: string;      // Gemini-written 150-250 word investigative prose per community
}

// ---- MarketSnapshot — embedded market stats for the report header (Phase 3) ----

export interface MarketSnapshot {
  price: number | null;
  percent_change_today: number | null;
  market_cap: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  pe_ratio: number | null;
  eps: number | null;
  revenue: number | null;
}

export interface AnalysisResult {
  ticker: string;
  company_name: string;
  analyzed_at: string;         // ISO 8601
  market_sentiment: 'bullish' | 'neutral' | 'bearish';
  sentiment_reasoning: string;
  bullish_signals: AnalysisSignal[];   // 1-5 signals
  bearish_signals: AnalysisSignal[];   // 1-5 signals
  assessment: BuySellBreakdown;
  confidence_level: 'Low' | 'Medium' | 'High';
  confidence_explanation: string;
  price_target?: string | null;  // analyst-consensus price target or range — optional for backward compat (D-10)
  executive_summary?: string;   // One-paragraph institutional thesis
  investment_thesis?: string;   // Bull case narrative (2-3 sentences)
  key_risks?: string;           // Bear case narrative (2-3 sentences)
  valuation_context?: string;   // Cheap/fair/expensive vs P/E history and analyst target
  catalyst_watch?: CatalystEvent[];  // Upcoming events that could move the stock
  sources_used: AnalysisSource[];
  source_warnings: string[];
  community_sentiment_available?: boolean;  // true if Firecrawl community content was included (D-11)
  market_snapshot?: MarketSnapshot;  // optional — populated by analysis pipeline (Phase 3)
  security_type?: SecurityType;  // optional — old persisted reports may not have this field
  // Depth sections — added for richer report content
  business_description?: string;        // What the company does, revenue model, key segments
  financial_analysis?: string;          // Revenue trend, margins, FCF, debt — numbers and direction
  competitive_landscape?: string;       // Main competitors, market position, moat
  future_projection?: string;           // D-15: Gemini forward-looking synthesis
  community_sources_scraped?: number;   // D-18: count of pages returned from community scrape
  sentiment_intelligence?: {            // D-17: structured signals for report display
    stocktwits_bull_pct: number | null;
    stocktwits_bear_pct: number | null;
    stocktwits_message_count: number | null;
    stocktwits_is_trending: boolean | null;
    put_call_ratio: number | null;
    put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null;
  };
  community_highlights?: CommunityHighlight[];   // per-community structured findings
  community_analysis?: string;                   // Gemini-written narrative paragraph
}

// ---- StoredReport — persisted report file (Phase 5) ----
// Wraps AnalysisResult with metadata duplicated at top level for fast list reads.
// Written to ~/.cipher/reports/{TICKER}-{analyzed_at_sanitized}.json

export interface StoredReport {
  ticker: string;
  company_name: string;
  analyzed_at: string;
  market_sentiment: 'bullish' | 'neutral' | 'bearish';
  confidence_level: 'Low' | 'Medium' | 'High';
  analysis: AnalysisResult;
}
