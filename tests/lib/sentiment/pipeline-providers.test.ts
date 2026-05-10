/**
 * Post-Phase-19 — derivePipelineProviders helper.
 *
 * Given a SourcePackage, returns a list of AnalysisSource attribution rows
 * for the data-pipeline providers that actually contributed (Twelve Data,
 * Exa, Yahoo Finance, Finnhub, Polygon, Anthropic web search). These are
 * APPENDED to sources_used in gemini-analysis.ts so the final report credits
 * data-infrastructure providers, not just the publisher names from news/SEC.
 *
 * Heuristics:
 *   - Twelve Data fundamentals → if any fundamentals field has _field_sources['*'] === 'twelvedata'
 *   - Exa news / analyst → if news.items or analyst recent_changes contain entries
 *     and exa_primary flag is on (we can't see the flag at this layer; use field_sources where available)
 *   - Yahoo Finance → fundamentals or market data have _field_sources entries === 'yahoo'
 *   - Finnhub / Polygon → supplementary_market_data sources marked available
 *   - Anthropic web search → news.items or analyst recent_changes when we can't detect Exa
 *
 * Conservative — never credits a provider that didn't contribute. The
 * heuristic uses concrete evidence in the SourcePackage (counts, _field_sources,
 * supplementary_market_data.sources[].available) rather than env-flag checks.
 */

import { describe, it, expect } from 'vitest';
import { derivePipelineProviders } from '@/lib/sentiment/pipeline-providers';
import type { SourcePackage } from '@/lib/types';

function emptyPkg(): SourcePackage {
  return {
    ticker: 'TEST',
    company_name: 'Test Co',
    exchange: null,
    security_type: 'equity',
    assembled_at: new Date().toISOString(),
    market_data: {
      collected_at: new Date().toISOString(),
      price: null, volume: null, market_cap: null,
      fifty_two_week_high: null, fifty_two_week_low: null,
      percent_change_today: null, exchange: null,
    },
    fundamentals: {
      collected_at: new Date().toISOString(),
      pe_ratio: null, eps: null, revenue: null,
      debt_to_equity: null, profit_margin: null,
    },
    news: { collected_at: new Date().toISOString(), items: [] },
    analyst_sentiment: {
      collected_at: new Date().toISOString(),
      consensus: null, avg_price_target: null, analyst_count: null, recent_changes: [],
    },
    sec_filing_summary: {
      collected_at: new Date().toISOString(),
      most_recent_10k: null, most_recent_10q: null,
      filing_dates: { '10k': null, '10q': null },
    },
    social_sentiment: {
      collected_at: new Date().toISOString(),
      overall_tone: null, signals: [], sources_checked: [],
    },
    collection_errors: [],
    supplementary_market_data: { sources: [] },
    sentiment_intelligence: {
      collected_at: new Date().toISOString(),
      stocktwits_bull_pct: null, stocktwits_bear_pct: null,
      stocktwits_message_count: null, stocktwits_is_trending: null,
      reddit_tone: null, put_call_ratio: null, put_call_interpretation: null,
    },
  };
}

describe('derivePipelineProviders', () => {
  it('returns empty array when no providers contributed', () => {
    const pkg = emptyPkg();
    expect(derivePipelineProviders(pkg)).toEqual([]);
  });

  it('credits Twelve Data when fundamentals._field_sources contains twelvedata', () => {
    const pkg = emptyPkg();
    pkg.fundamentals.pe_ratio = 25.4;
    pkg.fundamentals._field_sources = {
      pe_ratio: 'twelvedata',
      eps: 'twelvedata',
      revenue: 'twelvedata',
      debt_to_equity: 'yahoo',
      profit_margin: 'yahoo',
    };
    const providers = derivePipelineProviders(pkg);
    expect(providers.find((p) => p.name === 'Twelve Data')).toBeDefined();
    expect(providers.find((p) => p.name === 'Yahoo Finance')).toBeDefined();
  });

  it('credits Exa when news items have exa-style URLs and analyst recent_changes from Exa', () => {
    const pkg = emptyPkg();
    pkg.analyst_sentiment.recent_changes = [
      { analyst: 'Exa', firm: 'reuters.com', action: 'Goldman raises target', date: '2026-04-25' },
    ];
    pkg.news.items = [
      { headline: 'AAPL beats Q2', url: 'https://reuters.com/aapl', published_date: '2026-04-25', source: 'reuters.com' },
    ];
    const providers = derivePipelineProviders(pkg);
    expect(providers.find((p) => p.name === 'Exa')).toBeDefined();
  });

  it('credits Yahoo when analyst.recent_changes contain Yahoo-attributed rows', () => {
    const pkg = emptyPkg();
    pkg.analyst_sentiment.recent_changes = [
      { analyst: 'Yahoo', firm: 'Goldman Sachs', action: 'Hold → Buy', date: '2026-04-21' },
    ];
    const providers = derivePipelineProviders(pkg);
    expect(providers.find((p) => p.name === 'Yahoo Finance')).toBeDefined();
  });

  it('credits Finnhub when supplementary_market_data has Finnhub available', () => {
    const pkg = emptyPkg();
    pkg.supplementary_market_data.sources = [
      { name: 'Finnhub', fetched_at: new Date().toISOString(), text_block: 'data', available: true },
    ];
    const providers = derivePipelineProviders(pkg);
    expect(providers.find((p) => p.name === 'Finnhub')).toBeDefined();
  });

  it('credits Polygon when supplementary_market_data has Polygon available', () => {
    const pkg = emptyPkg();
    pkg.supplementary_market_data.sources = [
      { name: 'Polygon', fetched_at: new Date().toISOString(), text_block: 'data', available: true },
    ];
    const providers = derivePipelineProviders(pkg);
    expect(providers.find((p) => p.name === 'Polygon')).toBeDefined();
  });

  it('credits Anthropic web search when news items present and analyst.recent_changes contain Anthropic-attributed rows', () => {
    const pkg = emptyPkg();
    pkg.news.items = [
      { headline: 'Generic news', url: 'https://example.com', published_date: '2026-04-25', source: 'example.com' },
    ];
    pkg.analyst_sentiment.recent_changes = [
      // Anthropic-search emits AnalystChange without a specific analyst label
      { analyst: '', firm: 'Bernstein', action: 'Upgraded', date: '2026-04-21' },
    ];
    const providers = derivePipelineProviders(pkg);
    expect(providers.find((p) => p.name === 'Anthropic Web Search')).toBeDefined();
  });

  it('all entries have name + non-empty key_fact', () => {
    const pkg = emptyPkg();
    pkg.fundamentals.pe_ratio = 25;
    pkg.fundamentals._field_sources = {
      pe_ratio: 'twelvedata',
      eps: 'twelvedata',
      revenue: 'yahoo',
      debt_to_equity: 'yahoo',
      profit_margin: 'yahoo',
    };
    pkg.supplementary_market_data.sources = [
      { name: 'Finnhub', fetched_at: new Date().toISOString(), text_block: 'd', available: true },
      { name: 'Polygon', fetched_at: new Date().toISOString(), text_block: 'd', available: true },
    ];
    const providers = derivePipelineProviders(pkg);
    for (const p of providers) {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.key_fact).toBe('string');
      expect(p.key_fact.length).toBeGreaterThan(0);
    }
  });
});
