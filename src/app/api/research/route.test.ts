// src/app/api/research/route.test.ts
// Tests the TICK-03 server enforcement: POST without confirmed=true returns 400.
import { describe, it, expect, vi } from 'vitest';

// Mock heavy dependencies to avoid real network calls
vi.mock('@/lib/data/source-package', () => ({
  collectAllData: vi.fn().mockResolvedValue({
    ticker: 'AAPL',
    company_name: 'Apple Inc',
    exchange: 'NASDAQ',
    assembled_at: '2026-03-11T00:00:00.000Z',
    market_data: { collected_at: '2026-03-11T00:00:00.000Z', price: 189.42 },
    fundamentals: { collected_at: '2026-03-11T00:00:00.000Z' },
    news: { collected_at: '2026-03-11T00:00:00.000Z', items: [] },
    analyst_sentiment: { collected_at: '2026-03-11T00:00:00.000Z', consensus: null, recent_changes: [] },
    sec_filing_summary: { collected_at: '2026-03-11T00:00:00.000Z', most_recent_10k: null, most_recent_10q: null, filing_dates: { '10k': null, '10q': null } },
    social_sentiment: { collected_at: '2026-03-11T00:00:00.000Z', overall_tone: null, signals: [], sources_checked: [] },
    collection_errors: [],
  }),
}));

vi.mock('@/lib/temp-file', () => ({
  writeSourcePackage: vi.fn().mockResolvedValue('/tmp/ticker-research-123/AAPL-1000.json'),
}));

vi.mock('yahoo-finance2', () => {
  const mockQuote = vi.fn().mockResolvedValue({ longName: 'Apple Inc', fullExchangeName: 'NASDAQ' });
  const MockYahooFinance = vi.fn().mockImplementation(() => ({ quote: mockQuote }));
  return { default: MockYahooFinance };
});

describe('POST /api/research/[ticker]', () => {
  it('returns 400 when confirmed is not true (TICK-03 server enforcement)', async () => {
    const { POST } = await import('@/app/api/research/[ticker]/route');
    const request = new Request('http://localhost/api/research/AAPL', {
      method: 'POST',
      body: JSON.stringify({}), // No confirmed field
      headers: { 'Content-Type': 'application/json' },
    });
    const params = Promise.resolve({ ticker: 'AAPL' });
    const response = await POST(request as unknown as import('next/server').NextRequest, { params });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('confirmed');
  });
});
