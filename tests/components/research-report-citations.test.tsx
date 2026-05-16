// tests/components/research-report-citations.test.tsx
//
// Plan 30.1-04 Task 3 (D-24) — React Testing Library assertions that the
// ResearchReport renderer wires `CommunityHighlight.standout_url` to a clickable
// <a target="_blank" rel="noopener noreferrer"> anchor.
//
// Security surface (T-30.1-04-05): `target="_blank"` without
// `rel="noopener noreferrer"` enables tabnabbing — both tokens MUST be present
// on every external anchor.

// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AnalysisResult } from '@/lib/types';

// Mock Next.js navigation (NavBar dependency)
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

// Shared baseline AnalysisResult — community_highlights varied per test.
function buildResult(community_highlights: AnalysisResult['community_highlights']): AnalysisResult {
  return {
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    analyzed_at: '2026-05-15T10:00:00.000Z',
    market_sentiment: 'neutral',
    sentiment_reasoning: 'Mixed signals.',
    bullish_signals: [{ signal: 'Revenue growth', source_citation: 'SEC' }],
    bearish_signals: [{ signal: 'High P/E', source_citation: 'Fundamentals' }],
    assessment: {
      buy_pct: 50, hold_pct: 30, sell_pct: 20,
      buy_rationale: 'X', hold_rationale: 'Y', sell_rationale: 'Z',
    },
    confidence_level: 'Medium',
    confidence_explanation: 'OK.',
    sources_used: [{ name: 'SEC', key_fact: 'Revenue' }],
    source_warnings: [],
    community_highlights,
  };
}

describe('ResearchReport — community-highlight standout_url wiring (D-24)', () => {
  it('renders standout_quote as a clickable <a> when standout_url is present', async () => {
    const ResearchReport = (await import('@/components/ResearchReport')).default;
    render(
      <ResearchReport
        ticker="AAPL"
        analysisResult={buildResult([
          {
            community_name: 'r/wallstreetbets',
            community_type: 'mainstream',
            audience: 'retail momentum traders',
            standout_quote: 'AAPL puts loaded',
            standout_url: 'https://www.reddit.com/r/wallstreetbets/comments/1abc/aapl_puts_loaded/',
            theme: 'meme + options momentum',
            sentiment: 'neutral',
            engagement_signal: 'high',
          },
        ])}
      />,
    );
    const link = screen.getByRole('link', { name: /AAPL puts loaded/ });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe(
      'https://www.reddit.com/r/wallstreetbets/comments/1abc/aapl_puts_loaded/',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    // T-30.1-04-05 — tabnabbing mitigation: rel MUST include both tokens.
    const rel = link.getAttribute('rel') ?? '';
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it('renders standout_quote as plain text (no anchor) when standout_url is undefined', async () => {
    const ResearchReport = (await import('@/components/ResearchReport')).default;
    render(
      <ResearchReport
        ticker="AAPL"
        analysisResult={buildResult([
          {
            community_name: 'r/wallstreetbets',
            community_type: 'mainstream',
            audience: 'retail',
            standout_quote: 'no-link quote',
            theme: 'general',
            sentiment: 'neutral',
            engagement_signal: 'medium',
            // no standout_url — legacy firecrawl-branch highlight
          },
        ])}
      />,
    );
    // The quote text appears…
    expect(screen.getByText(/no-link quote/)).toBeTruthy();
    // …but NOT as an anchor element pointing to that text
    const links = screen.queryAllByRole('link', { name: /no-link quote/ });
    expect(links).toHaveLength(0);
  });

  it('renders HackerNews permalink as anchor when standout_url is HN URL', async () => {
    const ResearchReport = (await import('@/components/ResearchReport')).default;
    render(
      <ResearchReport
        ticker="AAPL"
        analysisResult={buildResult([
          {
            community_name: 'HackerNews',
            community_type: 'middle',
            audience: 'technical/analytical readers',
            standout_quote: 'AAPL discussion thread',
            standout_url: 'https://news.ycombinator.com/item?id=12345',
            theme: 'tech and finance discussion',
            sentiment: 'neutral',
            engagement_signal: 'medium',
          },
        ])}
      />,
    );
    const link = screen.getByRole('link', { name: /AAPL discussion thread/ });
    expect(link.getAttribute('href')).toBe('https://news.ycombinator.com/item?id=12345');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(link.getAttribute('rel')).toMatch(/noreferrer/);
  });
});
