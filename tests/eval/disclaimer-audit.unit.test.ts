// tests/eval/disclaimer-audit.unit.test.ts
// Plan 20-D-05 Task 2 — RED unit tests for auditDisclaimers.
//
// Drives the 4 RequiredElement contract:
//   disclaimer_footer, data_as_of_timestamp_per_source,
//   price_target_hedge, source_list_footer.

import { describe, it, expect } from 'vitest';
import { auditDisclaimers, type RequiredElement } from '@/lib/eval/disclaimer-audit';
import type { AnalysisResult } from '@/lib/types';

// ── Canonical fixture ───────────────────────────────────────────────────────
const canonicalAnalysis: AnalysisResult = {
  ticker: 'AAPL',
  company_name: 'Apple Inc.',
  analyzed_at: '2026-05-11T17:00:00Z',
  market_sentiment: 'bullish',
  sentiment_reasoning: 'Strong fundamentals.',
  bullish_signals: [{ signal: 'Revenue growth', detail: '+12% YoY', source: 'Q1 10-Q' }],
  bearish_signals: [{ signal: 'Margin pressure', detail: 'Services down 1 pp', source: 'Earnings call' }],
  assessment: { decision: 'Hold', buy_rationale: '', hold_rationale: 'Fair value', sell_rationale: '' },
  confidence_level: 'Medium',
  confidence_explanation: 'Strong data.',
  price_target: '$185',
  sources_used: [
    { name: 'Yahoo Finance', key_fact: 'Live price', url: 'https://finance.yahoo.com' },
    { name: 'SEC EDGAR', key_fact: '10-Q', url: 'https://www.sec.gov' },
    { name: 'Anthropic Web Search', key_fact: 'Analyst summary', url: '' },
  ],
  source_warnings: [],
} as unknown as AnalysisResult;

// "Clean" rendered HTML — all 4 RequiredElements present.
function buildCleanHtml(): string {
  return [
    '<p>This research is for educational purposes only and does not constitute personalized investment advice, investment recommendation, or solicitation. Past performance does not guarantee future results. Consult a licensed financial advisor before making investment decisions. Data sources current as of 2026-05-11.</p>',
    '<div data-testid="source-item-0"><h5>Yahoo Finance</h5><p>as of 2026-05-11</p></div>',
    '<div data-testid="source-item-1"><h5>SEC EDGAR</h5><p>as of 2026-05-11</p></div>',
    '<div data-testid="source-item-2"><h5>Anthropic Web Search</h5><p>as of 2026-05-11</p></div>',
    '<div data-testid="price-target-block"><p>$185</p><p>Price target reflects analyst consensus or model-implied range as of 2026-05-11; not a forecast or recommendation. ± $5.20 (95% CI)</p></div>',
    '<ul data-testid="sources-footer-list"><li>Yahoo Finance</li><li>SEC EDGAR</li><li>Anthropic Web Search</li></ul>',
  ].join('\n');
}

describe('auditDisclaimers — 4 RequiredElement contract (Plan 20-D-05)', () => {
  it('returns missing: [] when all 4 elements present (clean fixture)', () => {
    const html = buildCleanHtml();
    const result = auditDisclaimers(html, canonicalAnalysis, null);
    expect(result.missing).toEqual([]);
    expect(result.required_elements_present.disclaimer_footer).toBe(true);
    expect(result.required_elements_present.data_as_of_timestamp_per_source).toBe(true);
    expect(result.required_elements_present.price_target_hedge).toBe(true);
    expect(result.required_elements_present.source_list_footer).toBe(true);
  });

  it('flags disclaimer_footer when "educational purposes only" missing', () => {
    const html = buildCleanHtml().replace(/educational purposes only/g, 'informational use');
    const result = auditDisclaimers(html, canonicalAnalysis, null);
    expect(result.missing).toContain('disclaimer_footer' as RequiredElement);
    expect(result.required_elements_present.disclaimer_footer).toBe(false);
  });

  it('flags disclaimer_footer when "personalized investment advice" phrase weakened', () => {
    const html = buildCleanHtml().replace(
      /does not constitute personalized investment advice, investment recommendation, or solicitation/,
      'is not financial advice',
    );
    const result = auditDisclaimers(html, canonicalAnalysis, null);
    expect(result.missing).toContain('disclaimer_footer' as RequiredElement);
  });

  it('flags data_as_of_timestamp_per_source when count < sources_used.length', () => {
    // Remove 2 of the 3 source as-of lines (leaving footer's & disclaimer's & price-target's intact — but those don't match the per-source attribute count)
    let html = buildCleanHtml();
    html = html.replace('<div data-testid="source-item-1"><h5>SEC EDGAR</h5><p>as of 2026-05-11</p></div>', '');
    html = html.replace('<div data-testid="source-item-2"><h5>Anthropic Web Search</h5><p>as of 2026-05-11</p></div>', '');
    html = html.replace('<ul data-testid="sources-footer-list"><li>Yahoo Finance</li><li>SEC EDGAR</li><li>Anthropic Web Search</li></ul>', '');
    // Also remove the disclaimer footer's "as of" so we are below 3.
    html = html.replace('Data sources current as of 2026-05-11.', 'Data sources current.');
    // Remove the price-target hedge's as-of as well to drop the count strictly below 3.
    html = html.replace('as of 2026-05-11; not a forecast', '; not a forecast');
    const result = auditDisclaimers(html, canonicalAnalysis, null);
    expect(result.missing).toContain('data_as_of_timestamp_per_source' as RequiredElement);
  });

  it('flags price_target_hedge when raw number alone (no CI band, no "(implied range)")', () => {
    let html = buildCleanHtml();
    html = html.replace('± $5.20 (95% CI)', '');
    html = html.replace(/\(implied range\)/g, '');
    const result = auditDisclaimers(html, canonicalAnalysis, null);
    expect(result.missing).toContain('price_target_hedge' as RequiredElement);
  });

  it('accepts CI band as price_target_hedge', () => {
    const html = buildCleanHtml(); // already contains ± $5.20 (95% CI)
    const result = auditDisclaimers(html, canonicalAnalysis, null);
    expect(result.required_elements_present.price_target_hedge).toBe(true);
  });

  it('accepts "(implied range)" as price_target_hedge', () => {
    const html = buildCleanHtml().replace('± $5.20 (95% CI)', '(implied range)');
    const result = auditDisclaimers(html, canonicalAnalysis, null);
    expect(result.required_elements_present.price_target_hedge).toBe(true);
  });

  it('auto-passes price_target_hedge when AnalysisResult.price_target is null', () => {
    const analysisNullPT = { ...canonicalAnalysis, price_target: null } as AnalysisResult;
    let html = buildCleanHtml();
    html = html.replace('± $5.20 (95% CI)', '');
    html = html.replace(/\(implied range\)/g, '');
    const result = auditDisclaimers(html, analysisNullPT, null);
    expect(result.required_elements_present.price_target_hedge).toBe(true);
  });

  it('flags source_list_footer when data-testid="sources-footer-list" attribute missing', () => {
    const html = buildCleanHtml().replace('data-testid="sources-footer-list"', 'data-testid="something-else"');
    const result = auditDisclaimers(html, canonicalAnalysis, null);
    expect(result.missing).toContain('source_list_footer' as RequiredElement);
  });

  it('returns multiple elements in missing[] when multiple missing, in stable RequiredElement union order', () => {
    let html = buildCleanHtml();
    html = html.replace(/educational purposes only/g, 'XX');
    html = html.replace('data-testid="sources-footer-list"', 'data-testid="x"');
    const result = auditDisclaimers(html, canonicalAnalysis, null);
    expect(result.missing).toContain('disclaimer_footer' as RequiredElement);
    expect(result.missing).toContain('source_list_footer' as RequiredElement);
    // Stable order: disclaimer_footer must appear before source_list_footer.
    const idxDisc = result.missing.indexOf('disclaimer_footer' as RequiredElement);
    const idxFoot = result.missing.indexOf('source_list_footer' as RequiredElement);
    expect(idxDisc).toBeLessThan(idxFoot);
  });
});
