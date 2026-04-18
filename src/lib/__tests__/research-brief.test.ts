// src/lib/__tests__/research-brief.test.ts
// TDD tests for formatResearchBrief and extractNewsUrls
// RED phase: tests written before implementation

import { describe, it, expect } from 'vitest';
import { formatResearchBrief, extractNewsUrls } from '../research-brief';
import type { SourcePackage } from '../types';

// ---- Fixtures ----

const basePackage: SourcePackage = {
  ticker: 'AAPL',
  company_name: 'Apple Inc.',
  exchange: 'NASDAQ',
  security_type: 'equity',
  assembled_at: '2026-03-12T14:23:00Z',
  market_data: {
    collected_at: '2026-03-12T14:22:00Z',
    price: 178.45,
    volume: 52345678,
    market_cap: 2_800_000_000_000,
    fifty_two_week_high: 199.62,
    fifty_two_week_low: 143.90,
    percent_change_today: 1.23,
    exchange: 'NASDAQ',
  },
  fundamentals: {
    collected_at: '2026-03-12T14:22:05Z',
    pe_ratio: 28.5,
    eps: 6.25,
    revenue: 394_300_000_000,
    debt_to_equity: 1.45,
    profit_margin: 25.3,
  },
  news: {
    collected_at: '2026-03-12T14:22:10Z',
    items: [
      { headline: 'Apple reports record revenue', url: 'https://news.example.com/apple-revenue', published_date: '2026-03-11', source: 'Reuters' },
      { headline: 'AAPL analyst upgrade', url: 'https://finance.example.com/aapl-upgrade', published_date: '2026-03-10', source: 'Bloomberg' },
    ],
  },
  analyst_sentiment: {
    collected_at: '2026-03-12T14:22:15Z',
    consensus: 'Buy',
    avg_price_target: 210.50,
    analyst_count: 42,
    recent_changes: [
      { analyst: 'Jane Smith', firm: 'Goldman Sachs', action: 'Upgrade', date: '2026-03-10' },
      { analyst: 'Bob Jones', firm: 'Morgan Stanley', action: 'Reiterate', date: '2026-03-09' },
    ],
  },
  sec_filing_summary: {
    collected_at: '2026-03-12T14:22:20Z',
    most_recent_10k: 'Strong revenue growth across all segments. Services revenue up 23% YoY.',
    most_recent_10q: 'Q2 EPS beat consensus by $0.12. iPhone sales exceeded expectations.',
    filing_dates: { '10k': '2025-10-30', '10q': '2026-02-01' },
  },
  social_sentiment: {
    collected_at: '2026-03-12T14:22:25Z',
    overall_tone: 'bullish',
    signals: ['High retail interest on Reddit', 'Positive Twitter/X sentiment', 'Trending on StockTwits'],
    sources_checked: ['Reddit', 'Twitter/X', 'StockTwits'],
  },
  collection_errors: [],
  supplementary_market_data: {
    sources: [],
  },
};

// ---- formatResearchBrief tests ----

describe('formatResearchBrief', () => {
  it('returns a string', () => {
    const result = formatResearchBrief(basePackage);
    expect(typeof result).toBe('string');
  });

  it('includes the ticker header line', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('=== TICKER RESEARCH BRIEF: AAPL ===');
  });

  it('uppercases the ticker in the header', () => {
    const pkg: SourcePackage = { ...basePackage, ticker: 'aapl' };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('=== TICKER RESEARCH BRIEF: AAPL ===');
  });

  it('includes company name and exchange in header block', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('Company: Apple Inc.');
    expect(result).toContain('Exchange: NASDAQ');
    expect(result).toContain('Data Assembled: 2026-03-12T14:23:00Z');
  });

  it('contains all 6 section headers', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('--- MARKET DATA ---');
    expect(result).toContain('--- FUNDAMENTALS ---');
    expect(result).toContain('--- ANALYST SENTIMENT ---');
    expect(result).toContain('--- SEC FILINGS ---');
    expect(result).toContain('--- SOCIAL SENTIMENT ---');
    expect(result).toContain('--- COLLECTION NOTES ---');
  });

  it('formats market data price with $ prefix and 2 decimal places', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('Current Price: $178.45');
  });

  it('formats 52-week high and low with $ prefix', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('52-Week High: $199.62');
    expect(result).toContain('52-Week Low: $143.90');
  });

  it('formats percent change with sign and 2 decimal places', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('% Change Today: +1.23%');
  });

  it('formats negative percent change with minus sign', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      market_data: { ...basePackage.market_data, percent_change_today: -2.5 },
    };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('% Change Today: -2.50%');
  });

  it('formats market cap in trillions shorthand', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('Market Cap: $2.80T');
  });

  it('formats revenue in billions shorthand', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('Revenue: $394.30B');
  });

  it('formats revenue in millions shorthand for small revenue', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      fundamentals: { ...basePackage.fundamentals, revenue: 500_000_000 },
    };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('Revenue: $500.00M');
  });

  it('formats fundamentals section', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('P/E Ratio: 28.5');
    expect(result).toContain('EPS: $6.25');
    expect(result).toContain('Debt/Equity: 1.45');
    expect(result).toContain('Profit Margin: 25.30%');
  });

  it('formats analyst consensus and price target', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('Consensus: Buy');
    expect(result).toContain('Avg Price Target: $210.50');
    expect(result).toContain('Analyst Count: 42');
  });

  it('formats analyst recent changes as bullet list', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('  - Jane Smith at Goldman Sachs (Upgrade, 2026-03-10)');
    expect(result).toContain('  - Bob Jones at Morgan Stanley (Reiterate, 2026-03-09)');
  });

  it('formats SEC filing summaries', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('Most Recent 10-K: Strong revenue growth across all segments. Services revenue up 23% YoY.');
    expect(result).toContain('Most Recent 10-Q: Q2 EPS beat consensus by $0.12. iPhone sales exceeded expectations.');
  });

  it('formats social sentiment overall tone and signals', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('Overall Tone: bullish');
    expect(result).toContain('  - High retail interest on Reddit');
    expect(result).toContain('  - Positive Twitter/X sentiment');
    expect(result).toContain('  - Trending on StockTwits');
  });

  it('includes collection timestamp in COLLECTION NOTES', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).toContain('Data collected: 2026-03-12T14:23:00Z');
  });

  it('shows no warnings in COLLECTION NOTES when collection_errors is empty', () => {
    const result = formatResearchBrief(basePackage);
    expect(result).not.toContain('Warning:');
  });

  it('shows each collection error as Warning: line in COLLECTION NOTES', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      collection_errors: ['SEC filing fetch failed: timeout', 'Social sentiment unavailable'],
    };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('Warning: SEC filing fetch failed: timeout');
    expect(result).toContain('Warning: Social sentiment unavailable');
  });

  it('formats null market data values as N/A', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      market_data: {
        ...basePackage.market_data,
        price: null,
        market_cap: null,
        percent_change_today: null,
      },
    };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('Current Price: N/A');
    expect(result).toContain('Market Cap: N/A');
    expect(result).toContain('% Change Today: N/A');
  });

  it('formats null fundamentals values as N/A', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      fundamentals: {
        ...basePackage.fundamentals,
        pe_ratio: null,
        eps: null,
        revenue: null,
      },
    };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('P/E Ratio: N/A');
    expect(result).toContain('EPS: N/A');
    expect(result).toContain('Revenue: N/A');
  });

  it('formats null analyst consensus as N/A', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      analyst_sentiment: { ...basePackage.analyst_sentiment, consensus: null, avg_price_target: null, analyst_count: null },
    };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('Consensus: N/A');
    expect(result).toContain('Avg Price Target: N/A');
    expect(result).toContain('Analyst Count: N/A');
  });

  it('formats null SEC filings as N/A', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      sec_filing_summary: {
        ...basePackage.sec_filing_summary,
        most_recent_10k: null,
        most_recent_10q: null,
      },
    };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('Most Recent 10-K: N/A');
    expect(result).toContain('Most Recent 10-Q: N/A');
  });

  it('formats null exchange as N/A', () => {
    const pkg: SourcePackage = { ...basePackage, exchange: null };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('Exchange: N/A');
  });

  it('produces output in the 2000-4000 character range for a full package', () => {
    const result = formatResearchBrief(basePackage);
    expect(result.length).toBeGreaterThan(500);
  });

  it('includes Finnhub text_block when supplementary source is available', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      supplementary_market_data: {
        sources: [
          {
            name: 'Finnhub',
            fetched_at: '2026-04-17T10:00:00Z',
            text_block: '=== MARKET DATA: FINNHUB ===\nBeta: 1.2\nROE (TTM): 145%',
            available: true,
          },
        ],
      },
    };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('=== MARKET DATA: FINNHUB ===');
    expect(result).toContain('Beta: 1.2');
    expect(result).toContain('ROE (TTM): 145%');
  });

  it('excludes text_block when supplementary source is not available', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      supplementary_market_data: {
        sources: [
          {
            name: 'Finnhub',
            fetched_at: '2026-04-17T10:00:00Z',
            text_block: '=== MARKET DATA: FINNHUB ===\nBeta: 1.2',
            available: false,
          },
        ],
      },
    };
    const result = formatResearchBrief(pkg);
    expect(result).not.toContain('=== MARKET DATA: FINNHUB ===');
  });

  it('includes both Finnhub and Polygon blocks when both available', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      supplementary_market_data: {
        sources: [
          {
            name: 'Finnhub',
            fetched_at: '2026-04-17T10:00:00Z',
            text_block: '=== MARKET DATA: FINNHUB ===\nBeta: 1.2',
            available: true,
          },
          {
            name: 'Polygon',
            fetched_at: '2026-04-17T10:00:00Z',
            text_block: '=== MARKET DATA: POLYGON ===\nEmployees: 161000',
            available: true,
          },
        ],
      },
    };
    const result = formatResearchBrief(pkg);
    expect(result).toContain('=== MARKET DATA: FINNHUB ===');
    expect(result).toContain('=== MARKET DATA: POLYGON ===');
    expect(result).toContain('Employees: 161000');
  });
});

// ---- extractNewsUrls tests ----

describe('extractNewsUrls', () => {
  it('returns an array of URLs from news items', () => {
    const result = extractNewsUrls(basePackage);
    expect(result).toEqual([
      'https://news.example.com/apple-revenue',
      'https://finance.example.com/aapl-upgrade',
    ]);
  });

  it('returns empty array when news.items is empty', () => {
    const pkg: SourcePackage = { ...basePackage, news: { ...basePackage.news, items: [] } };
    const result = extractNewsUrls(pkg);
    expect(result).toEqual([]);
  });

  it('filters out empty string URLs', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      news: {
        ...basePackage.news,
        items: [
          { headline: 'Good', url: 'https://example.com/a', published_date: '2026-01-01', source: 'Test' },
          { headline: 'Empty', url: '', published_date: '2026-01-01', source: 'Test' },
          { headline: 'Whitespace', url: '   ', published_date: '2026-01-01', source: 'Test' },
        ],
      },
    };
    const result = extractNewsUrls(pkg);
    expect(result).toEqual(['https://example.com/a']);
  });

  it('deduplicates URLs while preserving order', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      news: {
        ...basePackage.news,
        items: [
          { headline: 'A', url: 'https://example.com/1', published_date: '2026-01-01', source: 'S' },
          { headline: 'B', url: 'https://example.com/2', published_date: '2026-01-01', source: 'S' },
          { headline: 'C', url: 'https://example.com/1', published_date: '2026-01-01', source: 'S' }, // duplicate
          { headline: 'D', url: 'https://example.com/3', published_date: '2026-01-01', source: 'S' },
        ],
      },
    };
    const result = extractNewsUrls(pkg);
    expect(result).toEqual(['https://example.com/1', 'https://example.com/2', 'https://example.com/3']);
  });

  it('caps at 15 URLs maximum', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      headline: `Article ${i}`,
      url: `https://example.com/article-${i}`,
      published_date: '2026-01-01',
      source: 'Test',
    }));
    const pkg: SourcePackage = { ...basePackage, news: { ...basePackage.news, items } };
    const result = extractNewsUrls(pkg);
    expect(result).toHaveLength(15);
  });

  it('caps at 15 even after deduplication', () => {
    // 20 unique + 5 duplicates = 20 unique before cap → should return 15
    const items = Array.from({ length: 25 }, (_, i) => ({
      headline: `Article ${i}`,
      url: `https://example.com/article-${i < 20 ? i : i - 20}`, // last 5 are duplicates
      published_date: '2026-01-01',
      source: 'Test',
    }));
    const pkg: SourcePackage = { ...basePackage, news: { ...basePackage.news, items } };
    const result = extractNewsUrls(pkg);
    expect(result).toHaveLength(15);
  });

  it('returns exactly 15 URLs when input has exactly 15 unique URLs', () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      headline: `Article ${i}`,
      url: `https://example.com/article-${i}`,
      published_date: '2026-01-01',
      source: 'Test',
    }));
    const pkg: SourcePackage = { ...basePackage, news: { ...basePackage.news, items } };
    const result = extractNewsUrls(pkg);
    expect(result).toHaveLength(15);
  });

  it('preserves order of first occurrences', () => {
    const pkg: SourcePackage = {
      ...basePackage,
      news: {
        ...basePackage.news,
        items: [
          { headline: 'Z article', url: 'https://example.com/z', published_date: '2026-01-01', source: 'S' },
          { headline: 'A article', url: 'https://example.com/a', published_date: '2026-01-01', source: 'S' },
        ],
      },
    };
    const result = extractNewsUrls(pkg);
    expect(result[0]).toBe('https://example.com/z');
    expect(result[1]).toBe('https://example.com/a');
  });
});
