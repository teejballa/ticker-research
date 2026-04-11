// src/lib/data/source-package.test.ts
// Tests mock all data fetchers — no real network calls.
import { describe, it, expect, vi } from 'vitest';

// Mock all data collection modules
vi.mock('@/lib/data/yahoo', () => ({
  fetchMarketData: vi.fn().mockResolvedValue({
    collected_at: '2026-03-11T00:00:00.000Z',
    price: 189.42,
    volume: 50000000,
    market_cap: 2900000000000,
    fifty_two_week_high: 200.0,
    fifty_two_week_low: 150.0,
    percent_change_today: 1.2,
    exchange: 'NASDAQ',
  }),
  fetchFundamentals: vi.fn().mockResolvedValue({
    collected_at: '2026-03-11T00:00:00.000Z',
    pe_ratio: 28.5,
    eps: 6.43,
    revenue: 385000000000,
    debt_to_equity: 145.0,
    profit_margin: 0.26,
  }),
}));

vi.mock('@/lib/data/finnhub', () => ({
  fetchFinnhub: vi.fn().mockResolvedValue({
    name: 'Finnhub',
    fetched_at: '2026-03-11T00:00:00.000Z',
    text_block: '=== MARKET DATA: FINNHUB ===\nTicker: AAPL\nP/E (Annual): 28.5',
    available: true,
  }),
}));

vi.mock('@/lib/data/polygon', () => ({
  fetchPolygon: vi.fn().mockResolvedValue({
    name: 'Polygon',
    fetched_at: '2026-03-11T00:00:00.000Z',
    text_block: '=== MARKET DATA: POLYGON ===\nTicker: AAPL\nMarket Cap: $2.90T',
    available: true,
  }),
}));

vi.mock('@/lib/data/anthropic-search', () => ({
  fetchNews: vi.fn().mockResolvedValue({
    collected_at: '2026-03-11T00:00:00.000Z',
    items: [{ headline: 'Apple Q1 Earnings Beat', url: 'https://example.com', published_date: '2026-03-01', source: 'Reuters' }],
  }),
  fetchAnalystSentiment: vi.fn().mockResolvedValue({
    collected_at: '2026-03-11T00:00:00.000Z',
    consensus: 'Buy',
    avg_price_target: 210.0,
    analyst_count: 45,
    recent_changes: [],
  }),
  fetchSecFilingSummary: vi.fn().mockResolvedValue({
    collected_at: '2026-03-11T00:00:00.000Z',
    most_recent_10k: 'Strong revenue growth...',
    most_recent_10q: 'Q1 results...',
    filing_dates: { '10k': '2025-11-01', '10q': '2026-02-01' },
  }),
  fetchSocialSentiment: vi.fn().mockResolvedValue({
    collected_at: '2026-03-11T00:00:00.000Z',
    overall_tone: 'bullish',
    signals: ['high call volume', 'trending on r/investing'],
    sources_checked: ['Reddit', 'Stocktwits'],
  }),
}));

describe('collectAllData', () => {
  it('returns SourcePackage with all 6 sections and supplementary_market_data', async () => {
    const { collectAllData } = await import('./source-package');
    const pkg = await collectAllData('AAPL', 'Apple Inc', 'NASDAQ');
    expect(pkg.ticker).toBe('AAPL');
    expect(pkg.assembled_at).toBeDefined();
    expect(pkg.market_data).toBeDefined();
    expect(pkg.fundamentals).toBeDefined();
    expect(pkg.news).toBeDefined();
    expect(pkg.analyst_sentiment).toBeDefined();
    expect(pkg.sec_filing_summary).toBeDefined();
    expect(pkg.social_sentiment).toBeDefined();
    // Phase 10 — supplementary sources always present
    expect(pkg.supplementary_market_data).toBeDefined();
    expect(pkg.supplementary_market_data.sources).toHaveLength(2);
    const names = pkg.supplementary_market_data.sources.map(s => s.name);
    expect(names).toContain('Finnhub');
    expect(names).toContain('Polygon');
  });

  it('all 6 sections have collected_at timestamp (DATA-07)', async () => {
    const { collectAllData } = await import('./source-package');
    const pkg = await collectAllData('AAPL', 'Apple Inc', 'NASDAQ');
    expect(pkg.market_data.collected_at).toBeDefined();
    expect(pkg.fundamentals.collected_at).toBeDefined();
    expect(pkg.news.collected_at).toBeDefined();
    expect(pkg.analyst_sentiment.collected_at).toBeDefined();
    expect(pkg.sec_filing_summary.collected_at).toBeDefined();
    expect(pkg.social_sentiment.collected_at).toBeDefined();
  });

  it('supplementary_market_data has 2 sources with available:false when fetchers return unavailable', async () => {
    const { fetchFinnhub } = await import('@/lib/data/finnhub');
    const { fetchPolygon } = await import('@/lib/data/polygon');
    vi.mocked(fetchFinnhub).mockResolvedValueOnce({ name: 'Finnhub', fetched_at: new Date().toISOString(), text_block: '', available: false });
    vi.mocked(fetchPolygon).mockResolvedValueOnce({ name: 'Polygon', fetched_at: new Date().toISOString(), text_block: '', available: false });
    const { collectAllData } = await import('./source-package');
    const pkg = await collectAllData('AAPL', 'Apple Inc', 'NASDAQ');
    expect(pkg.supplementary_market_data.sources).toHaveLength(2);
    expect(pkg.supplementary_market_data.sources.every(s => !s.available)).toBe(true);
  });

  it('continues with partial data when one source fails', async () => {
    const { fetchNews } = await import('@/lib/data/anthropic-search');
    vi.mocked(fetchNews).mockRejectedValueOnce(new Error('Rate limit exceeded'));
    const { collectAllData } = await import('./source-package');
    const pkg = await collectAllData('AAPL', 'Apple Inc', 'NASDAQ');
    // Other sections should still be present
    expect(pkg.market_data.price).toBe(189.42);
    // News section should be a graceful fallback
    expect(pkg.news.items).toEqual([]);
    // Error should be recorded
    expect(pkg.collection_errors.length).toBeGreaterThan(0);
  });
});
