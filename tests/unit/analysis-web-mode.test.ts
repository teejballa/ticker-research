// tests/unit/analysis-web-mode.test.ts
// Unit tests for the web-mode behavior of src/app/api/analysis/[ticker]/route.ts
// Phase 12: container proxy is gone. Web mode now persists result to Neon DB
// (non-fatal). Analysis itself calls Gemini directly in both local and web modes.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';

const TMP_FILE = `${tmpdir()}/analysis-web-mode-AAPL.json`;

// Minimal SourcePackage for readFile mock
const MOCK_PKG = {
  ticker: 'AAPL',
  company_name: 'Apple Inc.',
  exchange: 'NASDAQ',
  security_type: 'equity',
  assembled_at: '2026-04-17T00:00:00Z',
  market_data: {
    collected_at: '2026-04-17T00:00:00Z',
    price: 180, volume: 1000000, market_cap: 2800000000000,
    fifty_two_week_high: 200, fifty_two_week_low: 150,
    percent_change_today: 1.5, exchange: 'NASDAQ',
  },
  fundamentals: {
    collected_at: '2026-04-17T00:00:00Z',
    pe_ratio: 28, eps: 6.43, revenue: 394000000000,
    debt_to_equity: 1.8, profit_margin: 0.25,
  },
  news: { collected_at: '2026-04-17T00:00:00Z', items: [] },
  analyst_sentiment: {
    collected_at: '2026-04-17T00:00:00Z',
    consensus: 'Buy', avg_price_target: 195, analyst_count: 40, recent_changes: [],
  },
  sec_filing_summary: {
    collected_at: '2026-04-17T00:00:00Z',
    most_recent_10k: '2024-11-01', most_recent_10q: '2025-02-01',
    filing_dates: { '10k': '2024-11-01', '10q': '2025-02-01' },
  },
  social_sentiment: {
    collected_at: '2026-04-17T00:00:00Z',
    overall_tone: 'bullish', signals: [], sources_checked: [],
  },
  collection_errors: [],
  supplementary_market_data: { sources: [] },
};

// Minimal AnalysisResult
const MOCK_RESULT = {
  ticker: 'AAPL',
  company_name: 'Apple Inc.',
  analyzed_at: '2026-04-17T00:00:00Z',
  market_sentiment: 'bullish' as const,
  sentiment_reasoning: 'Strong fundamentals.',
  bullish_signals: [
    { signal: 'Revenue growth', source_citation: 'SEC 10-K' },
    { signal: 'Analyst buy', source_citation: 'Bloomberg' },
    { signal: 'High margin', source_citation: 'SEC 10-Q' },
    { signal: 'Momentum', source_citation: 'Yahoo Finance' },
    { signal: 'Market cap stability', source_citation: 'Market data' },
  ],
  bearish_signals: [
    { signal: 'High P/E', source_citation: 'Fundamentals' },
    { signal: 'High debt', source_citation: 'Fundamentals' },
    { signal: 'Slowing growth', source_citation: 'SEC 10-Q' },
    { signal: 'Macro headwinds', source_citation: 'Reuters' },
    { signal: 'Competition', source_citation: 'Industry analysis' },
  ],
  assessment: {
    buy_pct: 60, hold_pct: 30, sell_pct: 10,
    buy_rationale: 'Strong.', hold_rationale: 'Fair.', sell_rationale: 'Overvalued.',
  },
  confidence_level: 'High' as const,
  confidence_explanation: 'Multiple sources corroborate.',
  price_target: '$195',
  sources_used: [{ name: 'SEC 10-K', key_fact: 'Revenue $394B' }],
  source_warnings: [],
};

// Mock all dependencies
vi.mock('child_process', () => ({ spawn: vi.fn() }));
vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn() },
  NoObjectGeneratedError: class NoObjectGeneratedError extends Error {
    static isInstance(e: unknown): e is NoObjectGeneratedError {
      return e instanceof NoObjectGeneratedError;
    }
  },
}));
vi.mock('fs/promises', () => ({
  // Inline the minimal package JSON to avoid hoisting issues with MOCK_PKG
  readFile: vi.fn().mockResolvedValue(JSON.stringify({
    ticker: 'AAPL', company_name: 'Apple Inc.', exchange: 'NASDAQ', security_type: 'equity',
    assembled_at: '2026-04-17T00:00:00Z',
    market_data: { collected_at: '2026-04-17T00:00:00Z', price: 180, volume: 1000000,
      market_cap: 2800000000000, fifty_two_week_high: 200, fifty_two_week_low: 150,
      percent_change_today: 1.5, exchange: 'NASDAQ' },
    fundamentals: { collected_at: '2026-04-17T00:00:00Z', pe_ratio: 28, eps: 6.43,
      revenue: 394000000000, debt_to_equity: 1.8, profit_margin: 0.25 },
    news: { collected_at: '2026-04-17T00:00:00Z', items: [] },
    analyst_sentiment: { collected_at: '2026-04-17T00:00:00Z', consensus: 'Buy',
      avg_price_target: 195, analyst_count: 40, recent_changes: [] },
    sec_filing_summary: { collected_at: '2026-04-17T00:00:00Z',
      most_recent_10k: '2024-11-01', most_recent_10q: '2025-02-01',
      filing_dates: { '10k': '2024-11-01', '10q': '2025-02-01' } },
    social_sentiment: { collected_at: '2026-04-17T00:00:00Z',
      overall_tone: 'bullish', signals: [], sources_checked: [] },
    collection_errors: [], supplementary_market_data: { sources: [] },
  })),
}));
vi.mock('@/lib/gemini-analysis', () => ({
  runGeminiAnalysis: vi.fn().mockResolvedValue({
    ticker: 'AAPL', company_name: 'Apple Inc.', analyzed_at: '2026-04-17T00:00:00Z',
    market_sentiment: 'bullish', sentiment_reasoning: 'Strong fundamentals.',
    bullish_signals: [
      { signal: 'Revenue growth', source_citation: 'SEC 10-K' },
      { signal: 'Analyst buy', source_citation: 'Bloomberg' },
      { signal: 'High margin', source_citation: 'SEC 10-Q' },
      { signal: 'Momentum', source_citation: 'Yahoo Finance' },
      { signal: 'Market cap stability', source_citation: 'Market data' },
    ],
    bearish_signals: [
      { signal: 'High P/E', source_citation: 'Fundamentals' },
      { signal: 'High debt', source_citation: 'Fundamentals' },
      { signal: 'Slowing growth', source_citation: 'SEC 10-Q' },
      { signal: 'Macro headwinds', source_citation: 'Reuters' },
      { signal: 'Competition', source_citation: 'Industry analysis' },
    ],
    assessment: { buy_pct: 60, hold_pct: 30, sell_pct: 10,
      buy_rationale: 'Strong.', hold_rationale: 'Fair.', sell_rationale: 'Overvalued.' },
    confidence_level: 'High', confidence_explanation: 'Multiple sources corroborate.',
    price_target: '$195',
    sources_used: [{ name: 'SEC 10-K', key_fact: 'Revenue $394B' }],
    source_warnings: [],
  }),
  scrapeCommunitySentiment: vi.fn().mockResolvedValue(''),
  extractCommunityHighlights: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/reports', () => ({ writeReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/reports-db', () => ({ writeReportToDb: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { email: 'test@example.com' } }),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { POST } from '@/app/api/analysis/[ticker]/route';
import { NextRequest } from 'next/server';

async function collectSSE(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(decoder.decode(value));
  }
  return parts.join('');
}

function parseSSEEvents(raw: string): Array<{ type: string; message?: string; data?: unknown }> {
  const events: Array<{ type: string; message?: string; data?: unknown }> = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try { events.push(JSON.parse(line.slice('data: '.length))); } catch { /* skip */ }
  }
  return events;
}

describe('analysis route — web mode (DEPLOYMENT_MODE=web)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, DEPLOYMENT_MODE: 'web' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns SSE stream (not 401) — analysis is not gated on session in web mode', async () => {
    // Phase 12: analysis always runs via Gemini. Only persistence is gated on session.
    const req = new NextRequest('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: TMP_FILE }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ ticker: 'AAPL' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('streams a result event in web mode via Gemini (no container proxy)', async () => {
    const req = new NextRequest('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: TMP_FILE }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ ticker: 'AAPL' }) });
    const raw = await collectSSE(res.body!);
    const events = parseSSEEvents(raw);
    const resultEvents = events.filter(e => e.type === 'result');

    expect(resultEvents).toHaveLength(1);
    expect((resultEvents[0] as { type: string; data: { ticker: string } }).data.ticker).toBe('AAPL');
  });

  it('calls writeReportToDb in web mode when session has email', async () => {
    const { writeReportToDb } = await import('@/lib/reports-db');

    const req = new NextRequest('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: TMP_FILE }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ ticker: 'AAPL' }) });
    await collectSSE(res.body!); // drain stream to ensure async IIFE completes

    expect(writeReportToDb as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL' }),
      'test@example.com',
      expect.any(Object)
    );
  });

  it('does not call spawn() in web mode', async () => {
    const { spawn } = await import('child_process');

    const req = new NextRequest('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: TMP_FILE }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ ticker: 'AAPL' }) });
    await collectSSE(res.body!);

    expect(spawn as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('local mode path calls writeReport (not writeReportToDb)', async () => {
    delete process.env.DEPLOYMENT_MODE;
    const { writeReport } = await import('@/lib/reports');
    const { writeReportToDb } = await import('@/lib/reports-db');

    const req = new NextRequest('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: TMP_FILE }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req, { params: Promise.resolve({ ticker: 'AAPL' }) });
    await collectSSE(res.body!);

    expect(writeReport as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    expect(writeReportToDb as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
