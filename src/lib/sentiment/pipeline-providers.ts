/**
 * Post-Phase-19 — pipeline provider attribution helper.
 *
 * Inspects a SourcePackage and returns the data-infrastructure providers
 * that actually contributed to it. Appended to AnalysisResult.sources_used
 * by gemini-analysis.ts so the final report credits Twelve Data / Exa /
 * Yahoo / Finnhub / Polygon / Anthropic web search alongside the publisher
 * names (CNBC, Reuters, etc.) the LLM emits from news items.
 *
 * Conservative — only credits a provider when the SourcePackage carries
 * concrete evidence the provider returned data:
 *   - Twelve Data: any fundamentals._field_sources value === 'twelvedata'
 *   - Exa: analyst recent_changes[].analyst === 'Exa' OR news items present
 *     with Exa as a likely retriever (we credit conservatively — see Exa block)
 *   - Yahoo Finance: any market_data / fundamentals _field_sources === 'yahoo'
 *     OR analyst recent_changes attributed to 'Yahoo'
 *   - Finnhub: supplementary_market_data.sources[name='Finnhub'].available === true
 *     OR analyst recent_changes attributed to 'Finnhub'
 *   - Polygon: supplementary_market_data.sources[name='Polygon'].available === true
 *   - Anthropic Web Search: news.items present + analyst.recent_changes contain
 *     entries NOT already attributed to Yahoo/Finnhub/Exa (i.e., the unlabeled
 *     anthropic-search.fetchAnalystSentiment shape).
 */

import type { SourcePackage, AnalysisSource } from '@/lib/types';

function fieldSourcesContain(
  // Accepts any object that may carry a _field_sources map; the concrete
  // MarketDataFieldSources / FundamentalsFieldSources types both satisfy a
  // string→string-or-null shape at runtime even though they're nominally typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: { _field_sources?: any } | undefined,
  origin: string,
): boolean {
  const fs = obj?._field_sources;
  if (!fs || typeof fs !== 'object') return false;
  for (const k of Object.keys(fs)) {
    if ((fs as Record<string, unknown>)[k] === origin) return true;
  }
  return false;
}

export function derivePipelineProviders(pkg: SourcePackage): AnalysisSource[] {
  const out: AnalysisSource[] = [];

  // ---- Twelve Data ----------------------------------------------------------
  if (fieldSourcesContain(pkg.fundamentals, 'twelvedata')) {
    out.push({
      name: 'Twelve Data',
      key_fact: 'Primary fundamentals provider — P/E, EPS, revenue, debt/equity, profit margin.',
    });
  }

  // ---- Yahoo Finance --------------------------------------------------------
  const yahooFromFields =
    fieldSourcesContain(pkg.market_data, 'yahoo') ||
    fieldSourcesContain(pkg.fundamentals, 'yahoo');
  const yahooFromAnalyst = pkg.analyst_sentiment.recent_changes.some(
    (c) => c.analyst === 'Yahoo',
  );
  if (yahooFromFields || yahooFromAnalyst) {
    out.push({
      name: 'Yahoo Finance',
      key_fact: 'Quote, options chain, fundamentals, and analyst recommendation trend.',
    });
  }

  // ---- Exa ------------------------------------------------------------------
  // Conservative: only credit Exa when an analyst row is explicitly attributed
  // to it (the adapter labels analyst='Exa' on every row it produces). For
  // news, we cannot distinguish Exa-retrieved items from anthropic-search-
  // retrieved items at this layer — both populate news.items with publisher
  // hostnames. The flag-state (EXA_PRIMARY) decides which actually fired
  // upstream; here we trust the analyst-row label as the unambiguous signal.
  const exaFromAnalyst = pkg.analyst_sentiment.recent_changes.some(
    (c) => c.analyst === 'Exa',
  );
  if (exaFromAnalyst) {
    out.push({
      name: 'Exa',
      key_fact: 'Neural-search news + analyst commentary discovery layer.',
    });
  }

  // ---- Finnhub --------------------------------------------------------------
  const finnhubAvailable = pkg.supplementary_market_data?.sources?.some(
    (s) => s.name === 'Finnhub' && s.available,
  );
  const finnhubFromAnalyst = pkg.analyst_sentiment.recent_changes.some(
    (c) => c.analyst === 'Finnhub',
  );
  if (finnhubAvailable || finnhubFromAnalyst) {
    out.push({
      name: 'Finnhub',
      key_fact: 'Fundamentals fallback + structured analyst price targets.',
    });
  }

  // ---- Polygon --------------------------------------------------------------
  const polygonAvailable = pkg.supplementary_market_data?.sources?.some(
    (s) => s.name === 'Polygon' && s.available,
  );
  if (polygonAvailable) {
    out.push({
      name: 'Polygon',
      key_fact: 'Reference data + financial statements + news feed fallback.',
    });
  }

  // ---- Anthropic Web Search -------------------------------------------------
  // Credit when news items are present AND there's at least one analyst row
  // not attributed to Yahoo/Finnhub/Exa (the anthropic-search shape). This
  // catches the case where Exa returned no analyst hits and the cascade
  // fell through to anthropic-search.fetchAnalystSentiment.
  const hasNews = (pkg.news?.items?.length ?? 0) > 0;
  const hasUnlabeledAnalyst = pkg.analyst_sentiment.recent_changes.some(
    (c) => c.analyst !== 'Yahoo' && c.analyst !== 'Finnhub' && c.analyst !== 'Exa',
  );
  if (hasNews && hasUnlabeledAnalyst) {
    out.push({
      name: 'Anthropic Web Search',
      key_fact: 'News, analyst, SEC, and social-sentiment LLM-driven web search.',
    });
  }

  return out;
}
