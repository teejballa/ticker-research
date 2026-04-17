// tests/unit/analysis-schema.test.ts
// Schema contract tests for AnalysisResult — Phase 12 type evolution.
// Validates backward-compatible additions: price_target, community_sentiment_available,
// AnalysisSource.url, and 1-5 signal arrays.

import { describe, it, expect } from 'vitest';
import type { AnalysisResult, AnalysisSignal, AnalysisSource, StoredReport } from '@/lib/types';

// ---- Helpers ----

function makeSignal(n: number): AnalysisSignal {
  return { signal: 'Signal ' + n, source_citation: 'Source ' + n };
}

function makeSource(): AnalysisSource {
  return { name: 'Test Source', key_fact: 'Key fact' };
}

function makeBase(): Omit<AnalysisResult, 'bullish_signals' | 'bearish_signals'> {
  return {
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    analyzed_at: '2026-04-17T00:00:00Z',
    market_sentiment: 'bullish',
    sentiment_reasoning: 'Strong earnings and product pipeline.',
    assessment: {
      buy_pct: 60,
      hold_pct: 30,
      sell_pct: 10,
      buy_rationale: 'Solid fundamentals.',
      hold_rationale: 'Valuation stretched.',
      sell_rationale: 'Macro headwinds.',
    },
    confidence_level: 'High',
    confidence_explanation: 'Multiple corroborating sources.',
    sources_used: [makeSource()],
    source_warnings: [],
  };
}

// ---- Tests ----

describe('AnalysisResult schema — Phase 12 evolution', () => {
  it('Test 1: accepts 5 bullish_signals and 5 bearish_signals', () => {
    const result: AnalysisResult = {
      ...makeBase(),
      bullish_signals: [1, 2, 3, 4, 5].map(makeSignal),
      bearish_signals: [1, 2, 3, 4, 5].map(makeSignal),
    };
    expect(result.bullish_signals).toHaveLength(5);
    expect(result.bearish_signals).toHaveLength(5);
  });

  it('Test 2: accepts 1 bullish_signal and 1 bearish_signal (not exactly 3)', () => {
    const result: AnalysisResult = {
      ...makeBase(),
      bullish_signals: [makeSignal(1)],
      bearish_signals: [makeSignal(1)],
    };
    expect(result.bullish_signals).toHaveLength(1);
    expect(result.bearish_signals).toHaveLength(1);
  });

  it('Test 3: AnalysisResult without price_target is valid (backward-compat)', () => {
    const result: AnalysisResult = {
      ...makeBase(),
      bullish_signals: [makeSignal(1), makeSignal(2), makeSignal(3)],
      bearish_signals: [makeSignal(1), makeSignal(2), makeSignal(3)],
    };
    expect(result.price_target).toBeUndefined();
  });

  it('Test 4: AnalysisResult with price_target string is valid', () => {
    const result: AnalysisResult = {
      ...makeBase(),
      bullish_signals: [makeSignal(1), makeSignal(2), makeSignal(3)],
      bearish_signals: [makeSignal(1), makeSignal(2), makeSignal(3)],
      price_target: '$185-$200',
    };
    expect(result.price_target).toBe('$185-$200');
  });

  it('Test 5: AnalysisResult with price_target null is valid', () => {
    const result: AnalysisResult = {
      ...makeBase(),
      bullish_signals: [makeSignal(1), makeSignal(2), makeSignal(3)],
      bearish_signals: [makeSignal(1), makeSignal(2), makeSignal(3)],
      price_target: null,
    };
    expect(result.price_target).toBeNull();
  });

  it('Test 6: StoredReport round-trips through JSON without data loss', () => {
    const analysis: AnalysisResult = {
      ...makeBase(),
      bullish_signals: [makeSignal(1), makeSignal(2)],
      bearish_signals: [makeSignal(1), makeSignal(2)],
      price_target: '$190',
      community_sentiment_available: true,
    };
    const storedReport: StoredReport = {
      ticker: analysis.ticker,
      company_name: analysis.company_name,
      analyzed_at: analysis.analyzed_at,
      market_sentiment: analysis.market_sentiment,
      confidence_level: analysis.confidence_level,
      analysis,
    };
    const parsed: StoredReport = JSON.parse(JSON.stringify(storedReport));
    expect(parsed.analysis.price_target).toBe('$190');
    expect(parsed.analysis.community_sentiment_available).toBe(true);
    expect(parsed.analysis.bullish_signals).toHaveLength(2);
    expect(parsed.ticker).toBe('AAPL');
  });
});
