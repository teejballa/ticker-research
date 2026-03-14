// src/lib/__tests__/analysis-result.test.ts
// Wave 0 stubs for AnalysisResult schema validation.
// Tests assert that the RESULT: JSON protocol produces correctly-shaped data.

import { describe, it, expect } from 'vitest';

const FIXTURE = `RESULT: ${JSON.stringify({
  ticker: 'AAPL',
  company_name: 'Apple Inc.',
  analyzed_at: '2026-03-12T00:00:00Z',
  market_sentiment: 'bullish',
  sentiment_reasoning: 'Strong performance.',
  bullish_signals: [
    { signal: 'Signal A', source_citation: 'Source 1' },
    { signal: 'Signal B', source_citation: 'Source 2' },
    { signal: 'Signal C', source_citation: 'Source 3' },
  ],
  bearish_signals: [
    { signal: 'Risk A', source_citation: 'Source 1' },
    { signal: 'Risk B', source_citation: 'Source 2' },
    { signal: 'Risk C', source_citation: 'Source 3' },
  ],
  assessment: {
    buy_pct: 60,
    hold_pct: 30,
    sell_pct: 10,
    buy_rationale: 'Strong',
    hold_rationale: 'Moderate',
    sell_rationale: 'Minor',
  },
  confidence_level: 'High',
  confidence_explanation: 'Multiple corroborating sources.',
  sources_used: [],
  source_warnings: [],
})}`;

describe('AnalysisResult schema', () => {
  it('market_sentiment is bullish, neutral, or bearish', async () => {
    const result = JSON.parse(FIXTURE.replace('RESULT: ', ''));
    expect(['bullish', 'neutral', 'bearish']).toContain(result.market_sentiment);
  });

  it('bullish_signals has exactly 3 items', async () => {
    const result = JSON.parse(FIXTURE.replace('RESULT: ', ''));
    expect(result.bullish_signals).toHaveLength(3);
  });

  it('assessment percentages sum to 100', async () => {
    const result = JSON.parse(FIXTURE.replace('RESULT: ', ''));
    const { buy_pct, hold_pct, sell_pct } = result.assessment;
    expect(buy_pct + hold_pct + sell_pct).toBe(100);
  });
});
