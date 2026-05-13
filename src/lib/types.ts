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
  unavailable_fields?: string[]; // fields where every source returned null (Phase 10 merge)
}

// Per-field provenance after the Phase-10 merge layer runs.
// null when no source supplied a value (the field is genuinely unavailable).
// Plan 19-B-06 (D-29): extended additively with 'twelvedata' | 'exa' so the
// new merge ladder can stamp provenance without breaking the existing
// Yahoo / Finnhub / Polygon / EDGAR lineage. 'anthropic-search' added for the
// news/analyst news-leg attribution under the new ladder. Original origins
// stay because Yahoo / Finnhub / Polygon / Anthropic-search remain in tree as
// fallbacks (D-32). Tiingo removed 2026-05-10 (paid sales contact required).
export type FieldOrigin =
  | 'yahoo'
  | 'finnhub'
  | 'polygon'
  | 'edgar'
  | 'twelvedata'
  | 'exa'
  | 'anthropic-search'
  | null;

export interface MarketDataFieldSources {
  price: FieldOrigin;
  volume: FieldOrigin;
  market_cap: FieldOrigin;
  fifty_two_week_high: FieldOrigin;
  fifty_two_week_low: FieldOrigin;
  percent_change_today: FieldOrigin;
  exchange: FieldOrigin;
}

export interface FundamentalsFieldSources {
  pe_ratio: FieldOrigin;
  eps: FieldOrigin;
  revenue: FieldOrigin;
  debt_to_equity: FieldOrigin;
  profit_margin: FieldOrigin;
}

export interface MarketDataSection extends SourceSection {
  price: number | null;
  volume: number | null;
  market_cap: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  percent_change_today: number | null;
  exchange: string | null;
  _field_sources?: MarketDataFieldSources; // populated by mergeMarketData
}

export interface FundamentalsSection extends SourceSection {
  pe_ratio: number | null;
  eps: number | null;
  revenue: number | null;
  debt_to_equity: number | null;
  profit_margin: number | null;
  _field_sources?: FundamentalsFieldSources; // populated by mergeFundamentals
}

// Structured fields the merge layer can read. Mirror MarketDataSection / FundamentalsSection
// minus the bookkeeping. Optional on SupplementarySource so legacy callers are unaffected.
export interface SupplementaryMarketFields {
  price: number | null;
  volume: number | null;
  market_cap: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  percent_change_today: number | null;
  exchange: string | null;
}

export interface SupplementaryFundamentalsFields {
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
  // Plan 19-C-02 (D-34) — FinSentLLM ensemble score over aggregated chatter
  // text. Optional / nullable so SourcePackage stays backward-compatible when
  // FEATURE_FINSENTLLM_ENSEMBLE is `off` (the canonical mode pre-rollout).
  // model_agreement = 1 - std(non-null scores); null when <2 contributors.
  finsentllm_score?: number | null;
  model_agreement?: number | null;
  // Post-Phase-19 — multi-source community sentiment aggregator (fixes the
  // "100% bullish" failure mode). Optional / nullable so SourcePackage stays
  // backward-compatible when no community sources contributed.
  aggregated_bull_pct?: number | null;
  aggregated_bear_pct?: number | null;
  /** Number of community sources (StockTwits / Swaggystocks / ApeWisdom) that contributed. */
  sentiment_source_count?: number | null;
  /** Per-source breakdown for the UI. Always populated when source_count > 0. */
  sentiment_components?: Array<{
    source: 'stocktwits' | 'swaggystocks' | 'apewisdom';
    bullish_pct: number;
    weight: number;
    raw_mention_count: number;
  }> | null;
  // Plan 20-A-01 — crowded_consensus flag (GME-100% fix). Optional / nullable so
  // SourcePackage stays backward-compatible when FEATURE_CROWDED_CONSENSUS is 'off'.
  /**
   * true  → flag fires (warning UI in 'on' mode)
   * false → flag explicitly does NOT fire
   * null  → cannot compute (calibration unavailable, or any input non-finite)
   */
  crowded_consensus?: boolean | null;
  /** Inputs used to compute the flag — surfaced for telemetry + the model card spot-check log. */
  dispersion_features?: {
    entropy_bits: number;
    bull_pct_std: number;
    author_gini: number;
    mention_z: number;
  } | null;
  /** 'off' | 'shadow' | 'on' — the value FEATURE_CROWDED_CONSENSUS read at compute time. */
  crowded_consensus_mode?: 'off' | 'shadow' | 'on';
  // Plan 20-A-04 — Author-concentration via Gini. Optional/nullable so SourcePackage
  // stays backward-compatible when FEATURE_AUTHOR_GINI is 'off' or 'shadow'.
  /**
   * Gini coefficient of message-counts-per-author over the rolling 24h window.
   * ∈ [0, 1]; 0 = perfectly even, 1 = single author dominates.
   * Null when n_authors < 5 (T-20-A-04-02 sparse-data sentinel).
   */
  gini_coefficient?: number | null;
  /**
   * Top-N author shares for the 24h window. UI renders top-5 as horizontal bars.
   * `author_hash_prefix` is the first 8 chars of sha256(author_id) — raw handles
   * are NEVER surfaced (T-20-A-04-01 PII defense; references 20-Z-01 allowlist).
   */
  author_concentration?: Array<{
    author_hash_prefix: string; // 8 lowercase hex chars
    share: number; // ∈ [0, 1]
    message_count: number;
  }> | null;
  // Plan 20-A-05 — Cross-platform agreement signal (Cookson & Engelberg
  // "Echo Chambers"). Optional/nullable so SourcePackage stays
  // backward-compatible when FEATURE_AGREEMENT_SIGNAL is 'off' or fewer than
  // 2 sources contributed.
  /**
   * agreement_score = 1 - std(per-source bull_pct) / 50, clamped [0, 1].
   * Null when <2 sources contributed (no cross-platform signal possible).
   */
  agreement_score?: number | null;
  /**
   * True when agreement_score < calibrated threshold (default 0.5 per
   * Cookson & Engelberg). Drives the "MIXED · LOW AGREEMENT" UI badge.
   * Always false when agreement_score is null.
   */
  low_agreement_warning?: boolean;
  // ── Plan 20-C-03 — bot-filter / coordinated-posting surfaces ────────
  /** Snapshot of bot-filter aggregation for the SentimentIntelligenceCard
   *  subtext. Populated regardless of FEATURE_BOT_FILTER mode; UI gates
   *  rendering on mode==='on' AND counts > 0. */
  bot_filter_summary?: {
    authors_flagged: number;
    messages_flagged_coordinated: number;
    coordinated_posting: boolean;
  } | null;
  /** Convenience boolean — true when latest CoordinationCluster row in 24h
   *  is_flagged === true. Mirrors bot_filter_summary.coordinated_posting. */
  coordinated_posting?: boolean;
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
  market?: SupplementaryMarketFields;             // structured fields consumed by mergeMarketData
  fundamentals?: SupplementaryFundamentalsFields; // structured fields consumed by mergeFundamentals
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
  community_type: 'mainstream' | 'middle' | 'niche';
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

// ---- EngineCalibration — diffusion-engine prior carried inside each report ----
// Numeric fields are authoritative — written by getEngineContextForTicker, never by the LLM.
// Old persisted reports won't have this key; UI hides the panel if absent.

export interface HorizonCalibration {
  horizon_days: 3 | 7 | 14 | 30 | 60 | 90;
  diffusion_posterior: number | null;
  diffusion_ci: [number, number] | null;
  technical_posterior: number | null;
  technical_ci: [number, number] | null;
  sample_size: number;
  // Phase 18-07: 'EXPLORATORY-WATCH' added to status union — drift watch flag
  // (CONTEXT D-09 / D-11). Old persisted rows lacking the literal still typecheck.
  status: 'ACTIVE' | 'EXPLORATORY' | 'EXPLORATORY-WATCH' | 'DEPRECATED' | 'NO_DATA';
  // Phase 17-04 extension — all optional for back-compat with old persisted reports
  institutional_posterior?: number | null;
  institutional_ci?: [number, number] | null;
  insider_posterior?: number | null;
  insider_ci?: [number, number] | null;
  // Phase 18-07 — per-row effective sample size (CONTEXT D-10). Optional for
  // back-compat: old persisted rows lacking it must still typecheck and render
  // gracefully (UI falls back to raw `sample_size` when undefined).
  effective_sample_size?: number;
}

export interface EngineCalibration {
  cycle_count: number;
  flow_pattern: 'niche_leads' | 'simultaneous' | 'mainstream_first' | 'flat' | null;
  cap_class: 'large_cap' | 'mid_cap' | 'small_cap' | 'unknown';
  trace_window_size: number;

  posterior_mean: number | null;
  ci_low: number | null;
  ci_high: number | null;
  sample_size: number;
  // Phase 18-07: 'EXPLORATORY-WATCH' added to status union (CONTEXT D-09 / D-11).
  // Old persisted reports lacking the literal still typecheck — TS only widens.
  status: 'ACTIVE' | 'EXPLORATORY' | 'EXPLORATORY-WATCH' | 'DEPRECATED' | 'NO_DATA';
  brier_in_sample: number | null;
  brier_null: number | null;
  drift_z: number;

  logistic_score: number | null;
  logistic_ci_low: number | null;
  logistic_ci_high: number | null;
  logistic_sample_size: number;

  predicted_at: string;        // ISO 8601

  // LLM-authored qualitative reaction to the prior (post-process keeps these strings only)
  engine_alignment: string | null;     // present if Gemini's read agrees
  engine_disagreement: string | null;  // present if Gemini's read disagrees

  // Sparkline data — last 4 snapshots' tier_breakdown (so UI doesn't refetch)
  diffusion_sparkline: Array<{ niche: number; middle: number; mainstream: number; scanned_at: string }>;

  // ── Phase 16 — dual-class technical signal extension ────────────────────
  // All NEW fields are OPTIONAL — old persisted reports lacking them must
  // still typecheck and render via graceful degraded-mode fallback in the UI.
  technical_pattern?: TechPattern | null;
  technical_posterior_mean?: number | null;
  technical_ci?: [number, number] | null;
  technical_sample_size?: number;
  // Phase 18-07: 'EXPLORATORY-WATCH' added to per-class status union.
  technical_status?: 'ACTIVE' | 'EXPLORATORY' | 'EXPLORATORY-WATCH' | 'DEPRECATED' | 'NO_DATA';
  horizon_calibrations?: HorizonCalibration[];
  combined_logistic_score?: number | null;
  agreement?: 'aligned' | 'mixed' | 'opposed' | 'unknown';
  technical_alignment?: string | null;
  technical_disagreement?: string | null;

  // ── Phase 17-04 — institutional + insider signal classes ────────────────
  // All fields optional — old persisted reports lacking them must still
  // typecheck and render via graceful degraded-mode fallback in the UI.
  // Numeric/categorical group (10 fields — overwritten by post-process per D-04):
  // NOTE: institutional_pattern uses InstitutionalBucket (8-value union) and
  //       insider_pattern uses InsiderBucket (8-value union) — these are the
  //       canonical bucket names from the classifiers. The prior abbreviated
  //       unions ('accumulation' | 'flat' | ...) were too narrow and caused
  //       type casts at the post-process overwrite site in gemini-analysis.ts.
  institutional_pattern?: InstitutionalBucket | null;
  institutional_posterior_mean?: number | null;
  institutional_ci?: [number, number] | null;
  institutional_sample_size?: number | null;
  // Phase 18-07: 'EXPLORATORY-WATCH' added to per-class status union.
  institutional_status?: 'ACTIVE' | 'EXPLORATORY' | 'EXPLORATORY-WATCH' | 'DEPRECATED' | 'NO_DATA' | null;
  insider_pattern?: InsiderBucket | null;
  insider_posterior_mean?: number | null;
  insider_ci?: [number, number] | null;
  insider_sample_size?: number | null;
  // Phase 18-07: 'EXPLORATORY-WATCH' added to per-class status union.
  insider_status?: 'ACTIVE' | 'EXPLORATORY' | 'EXPLORATORY-WATCH' | 'DEPRECATED' | 'NO_DATA' | null;
  // Prose group (4 fields — LLM-written per D-05, NOT overwritten by post-process):
  institutional_alignment?: string | null;
  institutional_disagreement?: string | null;
  insider_alignment?: string | null;
  insider_disagreement?: string | null;

  // ── Phase 18-07: Effective sample size (CONTEXT D-10 / D-11 / D-12) ────
  // All fields OPTIONAL — old persisted reports lack them and must still
  // typecheck. UI graceful-fallback: render raw `sample_size` when ESS
  // undefined. Authoritative numerics — written by the engine-context.ts
  // post-process overwrite in gemini-analysis.ts (D-04 trust boundary).
  effective_sample_size?: number;
  technical_ess?: number;
  institutional_ess?: number;
  insider_ess?: number;
  logistic_ess?: number;

  // ── Phase 19-A-03 (D-19): Vovk-Romano conformal prediction interval ─────
  // ADDITIVE alongside the Bayesian ci_low / ci_high above — both render
  // side-by-side in EngineCalibrationPanel. Optional for back-compat with
  // old persisted reports (UI shows "Conformal CI: pending" when undefined
  // OR null until 19-A-04 cron writes them).
  conformal_low?: number | null;
  conformal_high?: number | null;
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
  // Per-field origin (yahoo/finnhub/polygon) — populated by mergeMarketData/mergeFundamentals
  field_sources?: {
    price?: FieldOrigin;
    percent_change_today?: FieldOrigin;
    market_cap?: FieldOrigin;
    fifty_two_week_high?: FieldOrigin;
    fifty_two_week_low?: FieldOrigin;
    pe_ratio?: FieldOrigin;
    eps?: FieldOrigin;
    revenue?: FieldOrigin;
  };
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
    // Post-Phase-19 — cross-source aggregated sentiment (Beta-smoothed).
    // Optional/nullable for back-compat with reports persisted before this field landed.
    aggregated_bull_pct?: number | null;
    aggregated_bear_pct?: number | null;
    sentiment_source_count?: number | null;
    sentiment_components?: Array<{
      source: 'stocktwits' | 'swaggystocks' | 'apewisdom';
      bullish_pct: number;
      weight: number;
      raw_mention_count: number;
    }> | null;
    // Plan 20-A-01 — crowded_consensus flag (GME-100% fix).
    crowded_consensus?: boolean | null;
    dispersion_features?: {
      entropy_bits: number;
      bull_pct_std: number;
      author_gini: number;
      mention_z: number;
    } | null;
    crowded_consensus_mode?: 'off' | 'shadow' | 'on';
    // Plan 20-A-04 — author-concentration via Gini.
    gini_coefficient?: number | null;
    author_concentration?: Array<{
      author_hash_prefix: string;
      share: number;
      message_count: number;
    }> | null;
    // Plan 20-A-05 — cross-platform agreement signal.
    agreement_score?: number | null;
    low_agreement_warning?: boolean;
    // Plan 20-C-03 — bot-filter / coordinated-posting surfaces.
    bot_filter_summary?: {
      authors_flagged: number;
      messages_flagged_coordinated: number;
      coordinated_posting: boolean;
    } | null;
    coordinated_posting?: boolean;
  };
  community_highlights?: CommunityHighlight[];   // per-community structured findings
  community_analysis?: string;                   // Gemini-written narrative paragraph
  // Phase 19-C-07 (D-39) — structured citations v2.
  // Populated when FEATURE_CITATIONS_V2 mode is shadow or on; the LLM SELECTS
  // entries from the assembled SourcePackage citations and never fabricates URLs.
  // Each entry is validated by CitationSchema (analyst/news require URL).
  citations_v2?: Array<{
    source: 'analyst' | 'news' | 'sec_filing' | 'social' | 'options' | 'community' | 'price_data' | 'other';
    url: string | null;
    confidence: number;
    date_retrieved: string;
  }>;
  // Phase 19-C-08 (D-40) — Chain-of-Verification two-pass output.
  // Populated when FEATURE_COVE_TWO_PASS mode is shadow or on. Each entry is
  // the per-claim NLI verdict against the SourcePackage:
  //   true  → claim entailed; false → claim contradicted; null → unverifiable
  // (NLI 'neutral'/error/threw). source_warnings is appended additively with
  // the contradiction warnings — `cove_verified` is the structured surface
  // for downstream UI / shadow-verdict scoring.
  cove_verified?: (boolean | null)[];
  // Phase 19-C-08 (D-40) — verification claims emitted by Pass 1 Gemini call.
  // Optional; populated when CoVe pass-2 path runs so callers can correlate
  // the per-claim verdict back to the claim text.
  verification_claims?: string[];
  engine_calibration?: EngineCalibration;        // diffusion-engine prior at report-generation time
  technical_at_report?: TechnicalSnapshot | null; // Phase 16-04: live technical snapshot at report time
  // Phase 17-04: smart-money snapshots persisted at report time (written by 17-03 cron path)
  insider_at_report?: InsiderSnapshot | null;
  institutional_at_report?: InstitutionalSnapshot | null;
}

// ---- TechnicalSnapshot — Phase 16 technical-analysis sensor ----
// Pure compute layer. No DB writes here; downstream plans (16-02 schema, 16-03 cron writer,
// 16-04 engine-context) consume these types. The 8 TechPattern literals are LOCKED — no
// additional values may be added without updating the classifier in src/lib/data/technical.ts
// AND the engine-context lookup table.

export type TechPattern =
  | 'breakout_uptrend'
  | 'overbought_uptrend'
  | 'pullback_in_uptrend'
  | 'consolidation'
  | 'breakdown'
  | 'oversold_downtrend'
  | 'death_cross'
  | 'golden_cross';

export interface TechnicalSnapshot {
  rsi_14: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  sma_50: number | null;
  sma_200: number | null;
  atr_14: number | null;
  avg_volume_20d: number | null;
  volume_ratio: number | null;             // today_volume / avg_volume_20d
  trend_regime: 'uptrend' | 'downtrend' | 'sideways' | 'unknown';
  momentum_regime: 'overbought' | 'oversold' | 'neutral' | 'unknown';
  cross_state: 'golden_cross' | 'death_cross' | 'none';
  tech_pattern: TechPattern | null;        // null if bar_count < 200
  bar_count: number;
  computed_at: string;                     // ISO 8601
  data_source: 'yahoo';
}

// ---- StoredReport — persisted report file (Phase 5) ----
// Wraps AnalysisResult with metadata duplicated at top level for fast list reads.
// Written to ~/.cipher/reports/{TICKER}-{analyzed_at_sanitized}.json

export interface StoredReport {
  id?: string; // UUID from Neon (web mode only — undefined for local filesystem reports)
  ticker: string;
  company_name: string;
  analyzed_at: string;
  market_sentiment: 'bullish' | 'neutral' | 'bearish';
  confidence_level: 'Low' | 'Medium' | 'High';
  analysis: AnalysisResult;
}

// ─── Phase 17: Institutional & Insider Intelligence ────────────────────────
// Insider transactions (Form 4) and institutional ownership (13F) — two new
// signal classes in the diffusion learning engine. Bucket sets locked by D-10
// and D-11; classifier thresholds in src/lib/data/{insider,institutional}-classifier.ts.

export type InsiderBucket =
  | 'cluster_buying'
  | 'lone_buy'
  | 'ceo_buy'
  | 'cfo_buy'
  | 'director_buy'
  | 'cluster_selling'
  | 'planned_sell_10b5_1'
  | 'lone_sell';

export interface InsiderSnapshot {
  insider_bucket: InsiderBucket | null;

  // Classifier inputs (auditable — bucket can be re-derived from these)
  distinct_buyers: number;
  distinct_sellers: number;
  net_buy_share_count: number;
  net_sell_share_count: number;
  buy_value_usd: number | null;
  sell_value_usd: number | null;
  has_ceo_buy: boolean;
  has_cfo_buy: boolean;
  has_director_buy: boolean;
  is_planned_10b5_1: boolean;

  // Provenance
  filings_count: number;
  earliest_filing_date: string | null;   // ISO 8601 — null when filings_count === 0
  latest_filing_date: string | null;     // ISO 8601 — null when filings_count === 0
  data_age_days: number | null;          // today − latest_filing_date; null when no filings
  computed_at: string;                   // ISO 8601
  data_source: 'finnhub' | 'edgar';

  // Cross-reference (LLM prose can cite this)
  insider_sentiment_mspr: number | null;
}

export type InstitutionalBucket =
  | 'net_accumulation'
  | 'net_distribution'
  | 'new_initiation'
  | 'complete_exit'
  | 'smart_money_concentration'
  | 'smart_money_dispersion'
  | 'contrarian_inflow'
  | 'contrarian_outflow';

export interface InstitutionalSnapshot {
  institutional_bucket: InstitutionalBucket | null;

  // Classifier inputs
  total_institutional_share: number;
  total_institutional_share_prev: number;
  net_share_change: number;
  net_share_change_pct: number;
  fund_count_current: number;
  fund_count_prev: number;
  fund_count_delta: number;
  top10_concentration_pct: number;
  top10_concentration_pct_prev: number;
  ticker_30d_return_pct: number | null;
  spy_30d_return_pct: number | null;

  // Provenance
  report_date: string;          // 13F quarter end (YYYY-MM-DD)
  filing_date: string;          // SEC filing date
  data_age_days: number;        // today − filing_date
  computed_at: string;
  data_source: 'finnhub' | 'edgar' | 'yahoo';
}
