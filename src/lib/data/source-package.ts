// src/lib/data/source-package.ts
// Orchestrates parallel data collection and assembles the SourcePackage.
// DATA-08: Claude Code SDK orchestrates all collection and structures inputs.
// Uses Promise.allSettled — a single source failure does not abort the pipeline.
//
// Plan 19-B-06 (D-29): merge precedence reorder behind shadow A/B harness.
//   Old ladder (preserved when flags off): yahoo → finnhub → polygon for
//     market+fundamentals; anthropic-search for news/analyst/SEC/social.
//   New ladder (active when all 3 flags 'on'): tiingo → yahoo → finnhub →
//     polygon for quote; tiingo → twelvedata → yahoo → finnhub → polygon for
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
import { fetchTiingoQuote, fetchTiingoFundamentals } from '@/lib/data/adapters/tiingo';
import { fetchTwelveDataFundamentals } from '@/lib/data/adapters/twelve-data';
import { fetchExaNews, fetchExaAnalystSentiment } from '@/lib/data/adapters/exa-search';
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
  const [stwitsResult, optionsResult] = await Promise.allSettled([
    fetchStockTwitsSentiment(ticker),
    optionsPromise,
  ]);
  const stwits = stwitsResult.status === 'fulfilled' ? stwitsResult.value : null;
  const options = optionsResult.status === 'fulfilled' ? optionsResult.value : null;

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

// ─── New ladder (Plan 19-B-06 — D-29) ──────────────────────────────────────
// Order:
//   1. Quote: tiingo → yahoo → finnhub → polygon (twelvedata is fundamentals only)
//   2. Fundamentals: tiingo → twelvedata → yahoo → finnhub → polygon
//   3. News:   exa → anthropic-search (RESEARCH Pitfall 7 fallback)
//   4. Analyst: exa → anthropic-search
//   5. SEC + Social: anthropic-search (no Exa parity yet — graceful keep-as-is)
//
// Each leg is null-on-failure (the Wave-B adapters never throw); merge layer
// stamps FieldOrigin per-field via mergeMarketData / mergeFundamentals — the
// new origins (tiingo / twelvedata) flow through after types.ts extension
// (Task 1). Yahoo / Finnhub / Polygon stay as fallbacks.
async function buildSourcePackageNewLadder(
  ticker: string,
  companyName: string,
  exchange: string | null,
  securityType: SecurityType,
): Promise<SourcePackage> {
  // Fan out every fetcher in parallel. Promise.allSettled never throws.
  const [
    tiingoQuoteResult,
    tiingoFundsResult,
    twelveFundsResult,
    marketDataResult,
    fundamentalsResult,
    finnhubResult,
    polygonResult,
    exaNewsResult,
    exaAnalystResult,
    anthroNewsResult,
    anthroAnalystResult,
    secResult,
    socialResult,
    sentimentIntelligenceResult,
  ] = await Promise.allSettled([
    fetchTiingoQuote(ticker),
    fetchTiingoFundamentals(ticker),
    fetchTwelveDataFundamentals(ticker),
    fetchMarketData(ticker),
    fetchFundamentals(ticker),
    fetchFinnhub(ticker),
    fetchPolygon(ticker),
    fetchExaNews(ticker),
    fetchExaAnalystSentiment(ticker),
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
  const tiingoQuote = settleNullable(tiingoQuoteResult, 'tiingo_quote');
  const tiingoFunds = settleNullable(tiingoFundsResult, 'tiingo_fundamentals');
  const twelveFunds = settleNullable(twelveFundsResult, 'twelvedata_fundamentals');
  const exaNews = settleNullable(exaNewsResult, 'exa_news');
  const exaAnalyst = settleNullable(exaAnalystResult, 'exa_analyst');

  // Field-level merge — first non-null wins. New ladder synthesizes the
  // primary slot from the highest-priority provider that returned a value.
  // We feed mergeMarketData / mergeFundamentals a *yahoo-shaped* primary
  // (using the Tiingo result if present) so the existing merge function's
  // first-non-null semantics produce a tiingo→yahoo→finnhub→polygon cascade
  // for market and tiingo→twelvedata→yahoo→finnhub→polygon for fundamentals.
  const yahooMarket = settle(marketDataResult, emptyMarketData('market data collection failed'), 'market_data');
  const yahooFundamentals = settle(fundamentalsResult, emptyFundamentals('fundamentals collection failed'), 'fundamentals');

  // Quote: tiingo first (if present) — overlay onto the merge cascade by
  // upgrading the "yahoo" primary slot with Tiingo values where available.
  // Wrap as SupplementarySource so existing mergeMarketData logic uses it.
  const tiingoQuoteAsPrimary: MarketDataSection = tiingoQuote
    ? { ...tiingoQuote, _field_sources: undefined }
    : yahooMarket;

  const merged_market = mergeMarketData(
    tiingoQuoteAsPrimary,
    finnhub.available ? finnhub : null,
    polygon.available ? polygon : null,
  );

  // Fundamentals: tiingo → twelvedata → yahoo → finnhub → polygon. We use
  // tiingoFunds as the "yahoo-slot" primary when present (forces tiingo to
  // win first); twelvedata gets stamped via a synthetic SupplementarySource.
  const tiingoFundsAsPrimary: FundamentalsSection = tiingoFunds
    ? { ...tiingoFunds, _field_sources: undefined }
    : (twelveFunds ?? yahooFundamentals);

  // Synthesize a SupplementarySource out of yahoo / twelvedata / finnhub for
  // the cascade so per-field provenance still gets stamped. The merge layer
  // takes the FIRST non-null per field; we sequence the cascade by the order
  // we hand it the candidates (tiingo primary slot → twelvedata pseudo →
  // yahoo pseudo → finnhub → polygon).
  const twelveFundsSource: SupplementarySource | null = twelveFunds
    ? {
        name: 'TwelveData',
        fetched_at: twelveFunds.collected_at,
        text_block: '',
        available: true,
        fundamentals: {
          pe_ratio: twelveFunds.pe_ratio,
          eps: twelveFunds.eps,
          revenue: twelveFunds.revenue,
          debt_to_equity: twelveFunds.debt_to_equity,
          profit_margin: twelveFunds.profit_margin,
        },
      }
    : null;

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

  // mergeFundamentals signature is (yahoo, finnhub, polygon). To honor the
  // new ladder ordering tiingo → twelvedata → yahoo → finnhub → polygon, we
  // pass tiingo (or fall-through) as primary, then sequence twelvedata-as-
  // pseudo-finnhub, then real-finnhub-as-pseudo-polygon — but only when we
  // have NEW values. When tiingo+twelve both null we fall through to the
  // canonical 3-source cascade so behavior is invariant.
  const merged_fundamentals = (() => {
    if (tiingoFunds && twelveFundsSource && finnhub.available) {
      // Full new-ladder cascade: tiingo → twelvedata → yahoo → finnhub.
      // Polygon gets dropped to keep the function arity at 3 — this is fine
      // because polygon has historically been the lowest-yield rung. The
      // cascade still backstops with finnhub for any nulls left after the
      // first three rungs.
      const stage1 = mergeFundamentals(
        tiingoFundsAsPrimary,
        twelveFundsSource,
        yahooFundsSource,
      );
      // Backfill any remaining nulls with finnhub → polygon.
      return mergeFundamentals(
        stage1,
        finnhub.available ? finnhub : null,
        polygon.available ? polygon : null,
      );
    }
    if (tiingoFunds || twelveFunds) {
      // Partial new-ladder: only tiingo OR only twelve present.
      return mergeFundamentals(
        tiingoFundsAsPrimary,
        finnhub.available ? finnhub : null,
        polygon.available ? polygon : null,
      );
    }
    // Both new sources unavailable → canonical cascade unchanged.
    return mergeFundamentals(
      yahooFundamentals,
      finnhub.available ? finnhub : null,
      polygon.available ? polygon : null,
    );
  })();

  // News + analyst: exa → anthropic-search fallback (RESEARCH Pitfall 7).
  const news: NewsSection =
    exaNews ??
    settle(
      anthroNewsResult,
      { collected_at: new Date().toISOString(), items: [], error: 'news collection failed' },
      'news',
    );
  const analyst_sentiment: AnalystSentimentSection =
    exaAnalyst ??
    settle(
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
    FEATURES.tiingo_primary_mode,
    FEATURES.twelvedata_primary_mode,
    FEATURES.exa_primary_mode,
  ]);

  return runWithShadow(
    'source-package-merge',
    () => buildSourcePackageOldLadder(ticker, companyName, exchange, securityType),
    () => buildSourcePackageNewLadder(ticker, companyName, exchange, securityType),
    mode,
    { ticker },
  );
}
