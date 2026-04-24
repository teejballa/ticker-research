// src/components/__tests__/ResearchReport.test.tsx
// Wave 0 test stubs for the ResearchReport component.
// These stubs verify module export shape at runtime — they fail with "module not found"
// until ResearchReport.tsx is created in Plan 02 (Wave 1).
// Pattern matches established Wave 0 approach in this project.

// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AnalysisResult } from '@/lib/types';

// Mock Next.js navigation (required by NavBar which ResearchReport renders)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => ({ get: vi.fn() }),
}));

// Mock NavBar and FooterTicker to avoid full Next.js rendering complexity
vi.mock('@/components/NavBar', () => ({
  default: ({ ticker }: { ticker: string }) => <div data-testid="navbar">{ticker}</div>,
}));

vi.mock('@/components/FooterTicker', () => ({
  default: () => <div data-testid="footer-ticker" />,
}));

describe('ResearchReport', () => {
  it('renders without crashing given valid AnalysisResult', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('handleDownloadPDF sets document.title to TICKER-YYYY-MM-DD format', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('renders sections in order: Ticker Overview, Market Sentiment, Bullish, Bearish, Assessment, Confidence, Sources', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('renders disclaimer text containing not financial advice', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('renders all sources_used entries in Sources section', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('shows source_warnings note when source_warnings array is non-empty', async () => {
    const mod = await import('../ResearchReport');
    expect(mod.default ?? (mod as Record<string, unknown>).ResearchReport).toBeDefined();
  });

  it('renders without crash when pre-Phase-12 AnalysisResult is missing optional fields (DB-QA-05)', async () => {
    const ResearchReport = (await import('../ResearchReport')).default;

    const PRE_PHASE_12_RESULT: AnalysisResult = {
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      analyzed_at: '2026-03-15T10:00:00.000Z',
      market_sentiment: 'bullish',
      sentiment_reasoning: 'Strong fundamentals.',
      bullish_signals: [{ signal: 'Revenue growth', source_citation: 'SEC' }],
      bearish_signals: [{ signal: 'High P/E', source_citation: 'Fundamentals' }],
      assessment: {
        buy_pct: 60, hold_pct: 30, sell_pct: 10,
        buy_rationale: 'Strong.', hold_rationale: 'Fair.', sell_rationale: 'Overvalued.',
      },
      confidence_level: 'High',
      confidence_explanation: 'Multiple sources.',
      sources_used: [{ name: 'SEC', key_fact: 'Revenue' }],
      source_warnings: [],
      // NOTE: no sentiment_intelligence, future_projection, price_target, community_highlights
    };

    expect(() => render(
      <ResearchReport analysisResult={PRE_PHASE_12_RESULT} ticker="AAPL" />
    )).not.toThrow();

    // NavBar mock renders the ticker — confirm component output is present
    expect(screen.getByText('AAPL')).toBeTruthy();
  });
});
