// tests/eval/disclaimer-audit.integration.test.ts
// Plan 20-D-05 Task 5 — render → auditDisclaimers → clean + 4 negative cases.
//
// Renders the real ResearchReport with a canonical AnalysisResult and asserts
// the audit catches each RequiredElement when synthetically removed.

// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { AnalysisResult } from '@/lib/types';
import { auditDisclaimers } from '@/lib/eval/disclaimer-audit';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => ({ get: vi.fn() }),
}));

vi.mock('@/components/NavBar', () => ({
  default: ({ ticker }: { ticker: string }) => <div data-testid="navbar">{ticker}</div>,
}));

vi.mock('@/components/FooterTicker', () => ({
  default: () => <div data-testid="footer-ticker" />,
}));

const canonicalFixture: AnalysisResult = {
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
  executive_summary: 'AAPL executive summary.',
  valuation_context: 'Reasonable valuation.',
  sources_used: [
    { name: 'Yahoo Finance', key_fact: 'Live price', url: 'https://finance.yahoo.com' },
    { name: 'SEC EDGAR', key_fact: '10-Q', url: 'https://www.sec.gov' },
    { name: 'Anthropic Web Search', key_fact: 'Analyst summary', url: '' },
  ],
  source_warnings: [],
} as unknown as AnalysisResult;

async function renderReport(): Promise<string> {
  const mod = await import('@/components/ResearchReport');
  const Component = (mod.default ?? (mod as Record<string, unknown>).ResearchReport) as React.ComponentType<{
    analysisResult: AnalysisResult;
    ticker: string;
  }>;
  const { container } = render(<Component analysisResult={canonicalFixture} ticker="AAPL" />);
  return container.innerHTML;
}

describe('auditDisclaimers — render → audit integration (Plan 20-D-05)', () => {
  it('clean fixture passes audit (missing == [])', async () => {
    const html = await renderReport();
    const result = auditDisclaimers(html, canonicalFixture, null);
    expect(result.missing).toEqual([]);
  });

  it('synthetic removal of disclaimer footer trips audit', async () => {
    const html = (await renderReport()).replace(/educational purposes only/g, 'XX');
    const result = auditDisclaimers(html, canonicalFixture, null);
    expect(result.missing).toContain('disclaimer_footer');
  });

  it('synthetic removal of all data-as-of timestamps trips audit', async () => {
    const html = (await renderReport()).replace(/as of \d{4}-\d{2}-\d{2}/g, '');
    const result = auditDisclaimers(html, canonicalFixture, null);
    expect(result.missing).toContain('data_as_of_timestamp_per_source');
  });

  it('synthetic removal of price-target hedge trips audit', async () => {
    let html = await renderReport();
    html = html.replace(/\u00b1 \$[\d,.]+ \(\d+% CI\)/g, '');
    html = html.replace(/\(implied range\)/g, '');
    const result = auditDisclaimers(html, canonicalFixture, null);
    expect(result.missing).toContain('price_target_hedge');
  });

  it('synthetic removal of source list footer trips audit', async () => {
    const html = (await renderReport()).replace(
      /data-testid="sources-footer-list"/g,
      'data-testid="sources-footer-list-removed"',
    );
    const result = auditDisclaimers(html, canonicalFixture, null);
    expect(result.missing).toContain('source_list_footer');
  });
});
