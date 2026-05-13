// src/lib/data/source-package.ts
// Orchestrates parallel data collection and assembles the SourcePackage.
// DATA-08: Claude Code SDK orchestrates all collection and structures inputs.
// Uses Promise.allSettled — a single source failure does not abort the pipeline.
//
// Plan 19-B-06 (D-29): merge precedence reorder behind shadow A/B harness.
//   Old ladder (preserved when flags off): yahoo → finnhub → polygon for
//     market+fundamentals; anthropic-search for news/analyst/SEC/social.
//   New ladder (active when both flags 'on'): yahoo → finnhub → polygon for
//     quote; twelvedata → yahoo → finnhub → polygon for
//     fundamentals; exa → anthropic-search for news/analyst.
//   Yahoo / Finnhub / Polygon / Anthropic-search adapters NOT removed (D-32).

import { fetchMarketData, fetchFundamentals } from '@/lib/data/yahoo';
import {
  fetchNews,
  fetchAnalystSentiment,
  fetchSecFilingSummary,
  fetchSocialSentiment,
} from '@/lib/data/anthropic-search';
import { fetchFinnhub } from '@/lib/data/finnhub';
import { fetchPolygon } from '@/lib/data/polygon';
import { mergeMarketData, mergeFundamentals } from '@/lib/data/merge';
import { fetchStockTwitsSentiment } from '@/lib/data/stocktwits';
import {
  fetchOptionsSentiment,
  fetchOptionsSentimentTermStructure,
} from '@/lib/data/options-sentiment';
import { runWithShadow } from '@/lib/shadow/shadow-runner';
import { FEATURES } from '@/lib/features';
import type { FeatureMode } from '@/lib/features';
import { ensembleSentiment } from '@/lib/sentiment/ensemble';
// Plan 19-B-06 (D-26..D-28) — new-ladder primary fetchers from Wave-B prereqs.
// Tiingo removed 2026-05-10 — fundamentals subscription required Tiingo sales contact;
// TwelveData + Yahoo + Finnhub + Polygon cover the same ground without it.
import { fetchTwelveDataFundamentals } from '@/lib/data/adapters/twelve-data';
import { fetchSwaggyStocks } from '@/lib/data/adapters/swaggystocks';
import { fetchApeWisdom } from '@/lib/data/adapters/apewisdom';
import {
  aggregateCommunitySentiment,
  applyCalibratedAgreementThreshold,
  getLatestAgreementThreshold,
} from '@/lib/sentiment/aggregator';
import {
  fetchExaNews,
  fetchExaAnalystSentiment,
  fetchExaFinancialReports,
} from '@/lib/data/adapters/exa-search';
// Post-Phase-19 P0 — free, structured Yahoo analyst module pair.
import { fetchYahooAnalystSentiment } from '@/lib/data/yahoo-analyst';
// Post-Phase-19 P0 — Polygon news as 3rd-tier news fallback.
import { fetchPolygonNews } from '@/lib/data/polygon-news';
// Post-Phase-19 P0 — Finnhub structured analyst (price-target + recommendation).
import { fetchFinnhubAnalystSentiment } from '@/lib/data/finnhub-analyst';
import type {
  SourcePackage,
  MarketDataSection,
  FundamentalsSection,
  SupplementaryMarketData,
  SupplementarySource,
  SentimentIntelligenceSection,
  NewsSection,
  AnalystSentimentSection,
} from '@/lib/types';
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

// Plan 19-C-02 (D-34) — Single-model fallback used by the shadow A/B harness
// for the `finsentllm-ensemble` path. Returns the canonical `null` baseline so
// pre-rollout (and FEATURE_FINSENTLLM_ENSEMBLE='off') the SentimentSnapshot
// finsentllm_score / model_agreement fields stay null exactly as today. The
// shadow-verdict CLI computes Pearson correlation between this baseline and
// the new ensemble path over the 7d shadow window.
async function scoreSingleModel(): Promise<{
  finsentllm_score: number | null;
  model_agreement: number | null;
}> {
  return { finsentllm_score: null, model_agreement: null };
}

// Plan 19-C-02 (D-34) — Ensemble path. Aggregates the chatter text we have
// in-process during sentiment intelligence collection and feeds it through
// `ensembleSentiment` (FinGPT v3 + Mistral-Fin + FinBERT). Errors return
// {null, null} so this path is no-op-on-failure and the shadow harness
// records the comparison without poisoning the canonical SentimentSnapshot.
async function scoreEnsemble(text: string): Promise<{
  finsentllm_score: number | null;
  model_agreement: number | null;
}> {
  if (!text || text.trim().length === 0) {
    return { finsentllm_score: null, model_agreement: null };
  }
  const r = await ensembleSentiment(text);
  // Map the EnsembleResult onto the SentimentSnapshot column shape per the
  // schema additions in 19-Z-02 (D-47): finsentllm_score (Float?) +
  // model_agreement (Float?). per_model is intentionally not persisted on
  // SentimentSnapshot — it lives in ShadowComparison.new_output_json for
  // verdict-time telemetry and is GC'd after 30d (D-15).
  return {
    finsentllm_score: r.score,
    model_agreement: r.model_agreement,
  };
}

async function fetchSentimentIntelligence(ticker: string): Promise<SentimentIntelligenceSection> {
  const collected_at = new Date().toISOString();
  // Plan 19-C-04: options-sentiment is now wrapped by runWithShadow.
  // - mode='off'    → fetchOptionsSentiment (nearest-only — historical canonical)
  // - mode='on'     → fetchOptionsSentimentTermStructure (30/60/90d OI-weighted +
  //                   IV-regime gate — D-36 canonical post-cutover)
  // - mode='shadow' → off-path returns first; new path runs in setImmediate
  //                   and persists ShadowComparison (D-05/D-14).
  const optionsPromise = runWithShadow(
    'options-sentiment-term-structure',
    () => fetchOptionsSentiment(ticker),
    () => fetchOptionsSentimentTermStructure(ticker),
    FEATURES.options_term_structure_mode,
    { ticker },
  );
  // Post-Phase-19 — also fan-out the supplemental community-sentiment sources
  // (Swaggystocks + ApeWisdom) so the cross-source aggregator can apply Beta
  // smoothing and prevent the "100% bullish" failure mode driven by StockTwits
  // alone on meme-stock echo chambers.
  const [stwitsResult, optionsResult, swaggyResult, apeResult] = await Promise.allSettled([
    fetchStockTwitsSentiment(ticker),
    optionsPromise,
    fetchSwaggyStocks(ticker),
    fetchApeWisdom(ticker),
  ]);
  const stwits = stwitsResult.status === 'fulfilled' ? stwitsResult.value : null;
  const options = optionsResult.status === 'fulfilled' ? optionsResult.value : null;
  const swaggy = swaggyResult.status === 'fulfilled' ? swaggyResult.value : null;
  const ape = apeResult.status === 'fulfilled' ? apeResult.value : null;

  const aggregatedRaw = aggregateCommunitySentiment({
    stocktwits:
      stwits?.stocktwits_bull_pct != null && stwits?.stocktwits_message_count != null
        ? { bullish_pct: stwits.stocktwits_bull_pct, mention_count: stwits.stocktwits_message_count }
        : null,
    swaggystocks: swaggy
      ? { bullish_pct: swaggy.bullish_pct, mention_count: swaggy.mention_count }
      : null,
    apewisdom: ape
      ? { bullish_pct: ape.bullish_pct, mention_count: ape.mention_count }
      : null,
  });
  // Plan 20-A-05 — overlay the calibrated AgreementCalibration.threshold on
  // top of the literature-default 0.5 that aggregateCommunitySentiment used.
  // No-op when no calibration row exists yet.
  const agreementThreshold = await getLatestAgreementThreshold();
  const aggregated = applyCalibratedAgreementThreshold(aggregatedRaw, agreementThreshold);

  // Plan 19-C-02 (D-34) — runWithShadow('finsentllm-ensemble', ...).
  // Aggregated chatter text is the StockTwits / options interpretation
  // signal we already have in-process. Per D-44 the dedicated community
  // chatter ingestion lands later in Wave C (Firecrawl / Arctic Shift) and
  // will replace this seed text with the full chatter blob; this wiring
  // keeps the shadow harness exercising the path on every research request
  // so 19-C-02 PASS verdict (Pearson ≥0.85, ≥95% chatter coverage) can
  // accumulate without waiting on later plans.
  const chatterText = [
    stwits ? `StockTwits: bull ${stwits.stocktwits_bull_pct ?? '?'}%, bear ${stwits.stocktwits_bear_pct ?? '?'}%` : '',
    options?.put_call_interpretation ? `Options put/call interpretation: ${options.put_call_interpretation}` : '',
  ].filter(Boolean).join('. ');

  const ensembleScores = await runWithShadow(
    'finsentllm-ensemble',
    () => scoreSingleModel(),
    () => scoreEnsemble(chatterText),
    FEATURES.finsentllm_ensemble_mode,
    { ticker },
  );

  return {
    collected_at,
    stocktwits_bull_pct: stwits?.stocktwits_bull_pct ?? null,
    stocktwits_bear_pct: stwits?.stocktwits_bear_pct ?? null,
    stocktwits_message_count: stwits?.stocktwits_message_count ?? null,
    stocktwits_is_trending: stwits?.stocktwits_is_trending ?? null,
    reddit_tone: null,  // derived qualitatively by Gemini from community content
    put_call_ratio: options?.put_call_ratio ?? null,
    put_call_interpretation: options?.put_call_interpretation ?? null,
    // Plan 19-C-02: surface ensemble fields so downstream
    // SentimentSnapshot.create({ data }) callers can persist them.
    finsentllm_score: ensembleScores.finsentllm_score,
    model_agreement: ensembleScores.model_agreement,
    // Post-Phase-19: cross-source aggregated sentiment with Beta(5,5) smoothing.
    // Surfaces the headline number the UI should display by default; the raw
    // stocktwits_bull_pct stays available as a per-source breakdown component.
    aggregated_bull_pct: aggregated.aggregated_bull_pct,
    aggregated_bear_pct: aggregated.aggregated_bear_pct,
    sentiment_source_count: aggregated.source_count,
    sentiment_components: aggregated.components,
    // Plan 20-A-05 — cross-platform agreement signal.
    agreement_score: aggregated.agreement_score,
    low_agreement_warning: aggregated.low_agreement_warning,
  };
}

// ─── Plan 19-B-06 (D-29) ───────────────────────────────────────────────────
// `combinedMode` — coalesces the three independent feature flags
// (FEATURE_TIINGO_PRIMARY, FEATURE_TWELVEDATA_PRIMARY, FEATURE_EXA_PRIMARY)
// into one FeatureMode for `runWithShadow('source-package-merge', ...)`.
//
// Decision rules:
//   - if ANY mode is 'shadow' → 'shadow' (highest-priority observation signal)
//   - else if ALL modes are 'on' → 'on' (full cutover)
//   - else → 'off' (any explicit off or mixed-without-shadow keeps users on
//                   the old ladder — safe default)
//
// Exported so unit tests can import + cover the 6 decision permutations
// directly (T-19-B-06-04 mitigation).
export function combinedMode(modes: FeatureMode[]): FeatureMode {
  if (modes.some(m => m === 'shadow')) return 'shadow';
  if (modes.every(m => m === 'on')) return 'on';
  return 'off';
}

// ─── Old ladder (preserved verbatim from pre-19-B-06 implementation) ───────
async function buildSourcePackageOldLadder(
  ticker: string,
  companyName: string,
  exchange: string | null,
  securityType: SecurityType,
): Promise<SourcePackage> {
  // Run all 9 data sources in parallel — Promise.allSettled never throws
  const [
    marketDataResult,
    fundamentalsResult,
    newsResult,
    analystResult,
    secResult,
    socialResult,
    finnhubResult,
    polygonResult,
    sentimentIntelligenceResult,
  ] = await Promise.allSettled([
    fetchMarketData(ticker),
    fetchFundamentals(ticker),
    fetchNews(ticker, securityType),
    fetchAnalystSentiment(ticker, securityType),
    fetchSecFilingSummary(ticker, securityType),
    fetchSocialSentiment(ticker, securityType),
    fetchFinnhub(ticker),
    fetchPolygon(ticker),
    fetchSentimentIntelligence(ticker),
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

  const finnhub = settleSupplementary(finnhubResult, 'Finnhub');
  const polygon = settleSupplementary(polygonResult, 'Polygon');
  const supplementary_market_data: SupplementaryMarketData = { sources: [finnhub, polygon] };

  // Field-level merge (Phase 10-FIX-01): yahoo → finnhub → polygon. First non-null wins.
  // Source attribution is recorded per-field in `_field_sources` so the UI can render badges.
  const yahooMarket = settle(marketDataResult, emptyMarketData('market data collection failed'), 'market_data');
  const yahooFundamentals = settle(fundamentalsResult, emptyFundamentals('fundamentals collection failed'), 'fundamentals');
  const merged_market = mergeMarketData(yahooMarket, finnhub.available ? finnhub : null, polygon.available ? polygon : null);
  const merged_fundamentals = mergeFundamentals(yahooFundamentals, finnhub.available ? finnhub : null, polygon.available ? polygon : null);

  return {
    ticker,
    company_name: companyName,
    exchange,
    security_type: securityType,
    assembled_at: new Date().toISOString(),
    market_data: merged_market,
    fundamentals: merged_fundamentals,
    news: settle(newsResult, { collected_at: new Date().toISOString(), items: [], error: 'news collection failed' }, 'news'),
    analyst_sentiment: settle(analystResult, { collected_at: new Date().toISOString(), consensus: null, avg_price_target: null, analyst_count: null, recent_changes: [], error: 'analyst collection failed' }, 'analyst_sentiment'),
    sec_filing_summary: settle(secResult, { collected_at: new Date().toISOString(), most_recent_10k: null, most_recent_10q: null, filing_dates: { '10k': null, '10q': null }, error: 'SEC filing collection failed' }, 'sec_filing_summary'),
    social_sentiment: settle(socialResult, { collected_at: new Date().toISOString(), overall_tone: null, signals: [], sources_checked: [], error: 'social sentiment collection failed' }, 'social_sentiment'),
    collection_errors,
    supplementary_market_data,
    sentiment_intelligence: settle(
      sentimentIntelligenceResult,
      {
        collected_at: new Date().toISOString(),
        stocktwits_bull_pct: null,
        stocktwits_bear_pct: null,
        stocktwits_message_count: null,
        stocktwits_is_trending: null,
        reddit_tone: null,
        put_call_ratio: null,
        put_call_interpretation: null,
        error: 'sentiment intelligence collection failed',
      },
      'sentiment_intelligence',
    ),
  };
}

// ─── New ladder (Plan 19-B-06 — D-29; Tiingo removed 2026-05-10) ───────────
// Order:
//   1. Quote: yahoo → finnhub → polygon (Tiingo removed — paid sales contact)
//   2. Fundamentals: twelvedata → yahoo → finnhub → polygon
//   3. News:   exa → anthropic-search (RESEARCH Pitfall 7 fallback)
//   4. Analyst: exa → anthropic-search
//   5. SEC + Social: anthropic-search (no Exa parity yet — graceful keep-as-is)
//
// Each leg is null-on-failure (the Wave-B adapters never throw); merge layer
// stamps FieldOrigin per-field via mergeMarketData / mergeFundamentals — the
// new origin (twelvedata) flows through after types.ts extension (Task 1).
// Yahoo / Finnhub / Polygon stay as fallbacks.
async function buildSourcePackageNewLadder(
  ticker: string,
  companyName: string,
  exchange: string | null,
  securityType: SecurityType,
): Promise<SourcePackage> {
  // Fan out every fetcher in parallel. Promise.allSettled never throws.
  const [
    twelveFundsResult,
    marketDataResult,
    fundamentalsResult,
    finnhubResult,
    polygonResult,
    exaNewsResult,
    exaAnalystResult,
    exaFinReportsResult,
    yahooAnalystResult,
    finnhubAnalystResult,
    polygonNewsResult,
    anthroNewsResult,
    anthroAnalystResult,
    secResult,
    socialResult,
    sentimentIntelligenceResult,
  ] = await Promise.allSettled([
    fetchTwelveDataFundamentals(ticker),
    fetchMarketData(ticker),
    fetchFundamentals(ticker),
    fetchFinnhub(ticker),
    fetchPolygon(ticker),
    fetchExaNews(ticker),
    fetchExaAnalystSentiment(ticker),
    fetchExaFinancialReports(ticker),
    fetchYahooAnalystSentiment(ticker),
    fetchFinnhubAnalystSentiment(ticker),
    fetchPolygonNews(ticker),
    fetchNews(ticker, securityType),
    fetchAnalystSentiment(ticker, securityType),
    fetchSecFilingSummary(ticker, securityType),
    fetchSocialSentiment(ticker, securityType),
    fetchSentimentIntelligence(ticker),
  ]);

  const collection_errors: string[] = [];

  function settle<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
    if (result.status === 'fulfilled') return result.value;
    const msg = `${label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`;
    collection_errors.push(msg);
    return fallback;
  }

  function settleNullable<T>(result: PromiseSettledResult<T | null>, label: string): T | null {
    if (result.status === 'fulfilled') return result.value;
    collection_errors.push(
      `${label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
    );
    return null;
  }

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

  const finnhub = settleSupplementary(finnhubResult, 'Finnhub');
  const polygon = settleSupplementary(polygonResult, 'Polygon');
  const supplementary_market_data: SupplementaryMarketData = { sources: [finnhub, polygon] };

  // Resolve the new-ladder primary leg outputs (null = unavailable / errored).
  const twelveFunds = settleNullable(twelveFundsResult, 'twelvedata_fundamentals');
  const exaNews = settleNullable(exaNewsResult, 'exa_news');
  const exaAnalyst = settleNullable(exaAnalystResult, 'exa_analyst');
  const yahooAnalyst = settleNullable(yahooAnalystResult, 'yahoo_analyst');
  const exaFinReports = settleNullable(exaFinReportsResult, 'exa_financial_reports');
  const polygonNews = settleNullable(polygonNewsResult, 'polygon_news');
  const finnhubAnalyst = settleNullable(finnhubAnalystResult, 'finnhub_analyst');

  // Field-level merge — first non-null wins. New ladder uses Yahoo as the
  // quote primary (Tiingo removed). Fundamentals route through TwelveData
  // first when present, then fall through to the canonical Yahoo cascade.
  const yahooMarket = settle(marketDataResult, emptyMarketData('market data collection failed'), 'market_data');
  const yahooFundamentals = settle(fundamentalsResult, emptyFundamentals('fundamentals collection failed'), 'fundamentals');

  const merged_market = mergeMarketData(
    yahooMarket,
    finnhub.available ? finnhub : null,
    polygon.available ? polygon : null,
  );

  // Fundamentals: twelvedata → yahoo → finnhub → polygon. We use TwelveData
  // as the primary slot when present so it wins first; otherwise fall back
  // to the canonical Yahoo cascade.
  const twelveFundsAsPrimary: FundamentalsSection = twelveFunds ?? yahooFundamentals;

  const yahooFundsSource: SupplementarySource = {
    name: 'Yahoo',
    fetched_at: yahooFundamentals.collected_at,
    text_block: '',
    available: true,
    fundamentals: {
      pe_ratio: yahooFundamentals.pe_ratio,
      eps: yahooFundamentals.eps,
      revenue: yahooFundamentals.revenue,
      debt_to_equity: yahooFundamentals.debt_to_equity,
      profit_margin: yahooFundamentals.profit_margin,
    },
  };

  const merged_fundamentals = (() => {
    if (twelveFunds) {
      // TwelveData → Yahoo → finnhub cascade.
      const stage1 = mergeFundamentals(
        twelveFundsAsPrimary,
        yahooFundsSource,
        finnhub.available ? finnhub : null,
      );
      // Backfill any remaining nulls with polygon.
      return mergeFundamentals(
        stage1,
        finnhub.available ? finnhub : null,
        polygon.available ? polygon : null,
      );
    }
    // No TwelveData → canonical 3-source cascade unchanged.
    return mergeFundamentals(
      yahooFundamentals,
      finnhub.available ? finnhub : null,
      polygon.available ? polygon : null,
    );
  })();

  // News cascade (post-Phase-19 P0 — was 19-B-06 fallback only):
  //   exa → anthropic-search → polygon-news.
  // Polygon is a 3rd-tier insurance source for small-cap tickers Exa neural
  // search and Anthropic search both miss. Free on the existing Polygon tier
  // (no new key needed).
  const anthroNews = settle(
    anthroNewsResult,
    { collected_at: new Date().toISOString(), items: [], error: 'news collection failed' },
    'news',
  );
  const news: NewsSection =
    exaNews ??
    (anthroNews.items.length > 0 ? anthroNews : (polygonNews ?? anthroNews));
  // Analyst cascade (post-Phase-19 P0): exa → yahoo → finnhub → anthropic-search.
  // Yahoo's `recommendationTrend` + `upgradeDowngradeHistory` are free + structured.
  // Finnhub adds the `avg_price_target` field Yahoo's analyst module doesn't surface.
  // Field-level merge: when the chosen primary leaves price target null but
  // Finnhub has it, fill it in.
  const anthroAnalyst = settle(
    anthroAnalystResult,
    {
      collected_at: new Date().toISOString(),
      consensus: null,
      avg_price_target: null,
      analyst_count: null,
      recent_changes: [],
      error: 'analyst collection failed',
    },
    'analyst_sentiment',
  );
  const analystPrimary: AnalystSentimentSection =
    exaAnalyst ?? yahooAnalyst ?? finnhubAnalyst ?? anthroAnalyst;
  const analyst_sentiment: AnalystSentimentSection =
    analystPrimary.avg_price_target == null && finnhubAnalyst?.avg_price_target != null
      ? { ...analystPrimary, avg_price_target: finnhubAnalyst.avg_price_target }
      : analystPrimary;

  return {
    ticker,
    company_name: companyName,
    exchange,
    security_type: securityType,
    assembled_at: new Date().toISOString(),
    market_data: merged_market,
    fundamentals: merged_fundamentals,
    news,
    analyst_sentiment,
    // SEC cascade (post-Phase-19 P0): exa-financial-report → anthropic-search.
    // Exa's `category: 'financial report'` is a structured neural-search
    // surface for 10-K / 10-Q PDFs; falls back to the existing Anthropic
    // search prompt when neither form is identified in the result set.
    sec_filing_summary:
      exaFinReports ??
      settle(secResult, { collected_at: new Date().toISOString(), most_recent_10k: null, most_recent_10q: null, filing_dates: { '10k': null, '10q': null }, error: 'SEC filing collection failed' }, 'sec_filing_summary'),
    social_sentiment: settle(socialResult, { collected_at: new Date().toISOString(), overall_tone: null, signals: [], sources_checked: [], error: 'social sentiment collection failed' }, 'social_sentiment'),
    collection_errors,
    supplementary_market_data,
    sentiment_intelligence: settle(
      sentimentIntelligenceResult,
      {
        collected_at: new Date().toISOString(),
        stocktwits_bull_pct: null,
        stocktwits_bear_pct: null,
        stocktwits_message_count: null,
        stocktwits_is_trending: null,
        reddit_tone: null,
        put_call_ratio: null,
        put_call_interpretation: null,
        error: 'sentiment intelligence collection failed',
      },
      'sentiment_intelligence',
    ),
  };
}

// ─── Public entry point — runWithShadow gate ───────────────────────────────
// Plan 19-B-06 (D-05/D-14): the canonical user-facing call. When all 3 flags
// are off (default), the old ladder runs unchanged. When all 3 flip to on,
// the new ladder runs. When any flag is shadow, the user sees old-ladder
// output FIRST and the new ladder runs in setImmediate, persisting a
// ShadowComparison row for verdict scoring.
export async function collectAllData(
  ticker: string,
  companyName: string = ticker,
  exchange: string | null = null,
  securityType: SecurityType = 'equity',
): Promise<SourcePackage> {
  const mode = combinedMode([
    FEATURES.twelvedata_primary_mode,
    FEATURES.exa_primary_mode,
  ]);

  const pkg = await runWithShadow(
    'source-package-merge',
    () => buildSourcePackageOldLadder(ticker, companyName, exchange, securityType),
    () => buildSourcePackageNewLadder(ticker, companyName, exchange, securityType),
    mode,
    { ticker },
  );

  // ── Plan 20-B-05 — per-aspect aggregation under FEATURE_PER_ASPECT_AGGREGATE ──
  // Sidecar property `_per_aspect_sentiment` attached after the 20-B-01 per-doc
  // classifier populates `_per_document_sentiment`. runGeminiAnalysis reads it
  // post-generation and writes it onto AnalysisResult.per_aspect_sentiment
  // (LLM does NOT author this field — mirrors engine_calibration trust boundary).
  // ── Plan 20-B-01 — per-doc sentiment classification under FEATURE_PER_DOC_SENTIMENT ──
  // 'off' branch: no classifier call, no persistence, no AnalysisResult field write.
  // 'shadow' branch (default): classifier runs, SentimentObservation rows persist,
  //   AnalysisResult.per_document_sentiment populated — but no downstream consumer is
  //   activated yet (20-B-05 lands the consumer). Cutover to 'on' is gated by the
  //   shadow_cutover_criteria in 20-B-01-PLAN.md frontmatter.
  // 'on' branch: same as shadow plus downstream activation when 20-B-05 ships.
  //
  // Attached as a sidecar property on the returned package; runGeminiAnalysis
  // reads it post-generation and writes it onto AnalysisResult.per_document_sentiment.
  if (FEATURES.per_doc_sentiment_mode !== 'off') {
    try {
      const { selectTopDocs } = await import('@/lib/sentiment/select-top-docs');
      const { classifyDocumentsBatch } = await import('@/lib/sentiment/per-doc-classifier');
      const { insertObservation } = await import('@/lib/sentiment/observation-store');
      const docs = selectTopDocs(pkg);
      if (docs.length > 0) {
        const perDocResults = await classifyDocumentsBatch(docs, { ticker });
        // Attach for downstream Gemini-analysis post-process pickup (no SourcePackage shape change).
        (pkg as SourcePackage & { _per_document_sentiment?: typeof perDocResults }).
          _per_document_sentiment = perDocResults;
        // Fire-and-forget persistence — never blocks the user-facing analysis.
        // Each result becomes one SentimentObservation row (classifier_version=model_version='gemini-per-doc-v1').
        void Promise.allSettled(
          perDocResults.map(async (r) => {
            const docInput = docs.find((d) => d.doc_id === r.doc_id);
            if (!docInput) return;
            try {
              await insertObservation({
                ticker,
                source: docInput.source === 'news' ? 'news' : 'reddit',
                message_id: r.doc_id,
                raw_body: docInput.text,
                classifier_version: 'gemini-per-doc-v1',
                classifier_score: r.polarity,
                model_version: 'gemini-per-doc-v1',
                decay_weight: null,
                author_id: 'unknown',
                author_features_snapshot: {
                  account_age_days: null,
                  follower_count: null,
                  is_verified: null,
                  message_count_30d: null,
                },
                aspects: r.aspects,
              });
            } catch {
              // Duplicate or transient — observation-store throws on (ticker, message_id, model_version)
              // collision per 20-Z-01 immutability. Swallow: per-doc classifier output is
              // additive and the row already exists under this model_version.
            }
          }),
        );
      }
    } catch {
      // Defensive: pipeline must not fail if per-doc step trips. Shadow mode is
      // diagnostic only until cutover.
    }
  }

  // ── Plan 20-B-05 — per-aspect aggregation ─────────────────────────────────
  // Compute per_aspect_sentiment from the _per_document_sentiment sidecar
  // attached by the 20-B-01 block above. The aggregator is pure functions —
  // no DB, no network. Off-mode wires an explicit empty array so downstream
  // consumers can grep-distinguish "feature off" from "no per-doc results".
  // Shadow/on: aggregateByAspect over per-doc results; emits one entry per
  // AspectTag in the fixed taxonomy (n_docs==0 aspects appear with bull_pct=null).
  try {
    const perAspectMode = FEATURES.per_aspect_aggregate_mode;
    if (perAspectMode === 'off') {
      (pkg as SourcePackage & { _per_aspect_sentiment?: import('@/lib/types').PerAspectSentimentEntry[] })
        ._per_aspect_sentiment = [];
    } else {
      const { aggregateByAspect } = await import('@/lib/sentiment/per-aspect-aggregate');
      const perDocSidecar = (pkg as SourcePackage & { _per_document_sentiment?: import('@/lib/types').PerDocSentimentResult[] })
        ._per_document_sentiment ?? [];
      // aggregateByAspect typing accepts PerDocResult { doc_id, polarity, confidence, aspects } —
      // PerDocSentimentResult is structurally identical.
      const perAspect = aggregateByAspect(perDocSidecar);
      (pkg as SourcePackage & { _per_aspect_sentiment?: import('@/lib/types').PerAspectSentimentEntry[] })
        ._per_aspect_sentiment = perAspect;
    }
  } catch {
    // Defensive: aggregation must not poison the pipeline. Worst case downstream
    // sees no per_aspect_sentiment field and renders the existing global chip.
  }

  return pkg;
}
