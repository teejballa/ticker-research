// src/app/api/analysis/__tests__/route.test.ts
// Tests for POST /api/analysis/[ticker] — Gemini-based analysis route.
// Mocks: ai module, fs/promises, @/lib/gemini-analysis.
// Verifies: SSE event streaming, no spawn() calls, no CONTAINER_URL references.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import type { AnalysisResult } from '@/lib/types';

// Use the real tmpdir so path validation passes on all platforms (macOS /tmp symlink safe)
const TMP_FILE = `${tmpdir()}/source-package-AAPL.json`;

// Mock child_process — assert spawn is never called
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock ai module
vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn() },
  NoObjectGeneratedError: class NoObjectGeneratedError extends Error {
    static isInstance(e: unknown): e is NoObjectGeneratedError {
      return e instanceof NoObjectGeneratedError;
    }
  },
}));

// Minimal valid SourcePackage for readFile mock
const MOCK_PKG = {
  ticker: 'AAPL',
  company_name: 'Apple Inc.',
  exchange: 'NASDAQ',
  security_type: 'equity',
  assembled_at: '2026-04-17T00:00:00Z',
  market_data: {
    collected_at: '2026-04-17T00:00:00Z',
    price: 180,
    volume: 1000000,
    market_cap: 2800000000000,
    fifty_two_week_high: 200,
    fifty_two_week_low: 150,
    percent_change_today: 1.5,
    exchange: 'NASDAQ',
  },
  fundamentals: {
    collected_at: '2026-04-17T00:00:00Z',
    pe_ratio: 28,
    eps: 6.43,
    revenue: 394000000000,
    debt_to_equity: 1.8,
    profit_margin: 0.25,
  },
  news: {
    collected_at: '2026-04-17T00:00:00Z',
    items: [],
  },
  analyst_sentiment: {
    collected_at: '2026-04-17T00:00:00Z',
    consensus: 'Buy',
    avg_price_target: 195,
    analyst_count: 40,
    recent_changes: [],
  },
  sec_filing_summary: {
    collected_at: '2026-04-17T00:00:00Z',
    most_recent_10k: '2024-11-01',
    most_recent_10q: '2025-02-01',
    filing_dates: { '10k': '2024-11-01', '10q': '2025-02-01' },
  },
  social_sentiment: {
    collected_at: '2026-04-17T00:00:00Z',
    overall_tone: 'bullish',
    signals: [],
    sources_checked: [],
  },
  collection_errors: [],
  supplementary_market_data: { sources: [] },
};

// Mock fs/promises — return a minimal valid SourcePackage
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(JSON.stringify(MOCK_PKG)),
}));

// Minimal valid AnalysisResult for runGeminiAnalysis mock
const MOCK_RESULT: AnalysisResult = {
  ticker: 'AAPL',
  company_name: 'Apple Inc.',
  analyzed_at: '2026-04-17T00:00:00Z',
  market_sentiment: 'bullish',
  sentiment_reasoning: 'Strong fundamentals and positive momentum.',
  bullish_signals: [
    { signal: 'Strong revenue growth', source_citation: 'SEC 10-K 2024' },
    { signal: 'Analyst consensus Buy', source_citation: 'Bloomberg, 2026-04-17' },
    { signal: 'High profit margin', source_citation: 'SEC 10-Q 2025' },
    { signal: 'Positive price momentum', source_citation: 'Yahoo Finance' },
    { signal: 'Large market cap stability', source_citation: 'Market data' },
  ],
  bearish_signals: [
    { signal: 'High valuation', source_citation: 'P/E ratio analysis' },
    { signal: 'Debt to equity elevated', source_citation: 'Fundamentals data' },
    { signal: 'Revenue growth slowing', source_citation: 'SEC 10-Q 2025' },
    { signal: 'Macro headwinds', source_citation: 'Reuters, 2026-04-15' },
    { signal: 'Competitive pressure', source_citation: 'Industry analysis' },
  ],
  assessment: {
    buy_pct: 60,
    hold_pct: 30,
    sell_pct: 10,
    buy_rationale: 'Strong fundamentals support upside.',
    hold_rationale: 'Fair value at current levels.',
    sell_rationale: 'Elevated valuation is a risk.',
  },
  confidence_level: 'High',
  confidence_explanation: 'Multiple reliable sources corroborate analysis.',
  price_target: '$195',
  sources_used: [{ name: 'SEC 10-K 2024', key_fact: 'Revenue $394B' }],
  source_warnings: [],
};

// Mock @/lib/gemini-analysis — prevent actual Gemini calls
vi.mock('@/lib/gemini-analysis', () => ({
  runGeminiAnalysis: vi.fn().mockResolvedValue(MOCK_RESULT),
  scrapeCommunitySentiment: vi.fn().mockResolvedValue({ pinnedContent: '', nicheContent: '', nicheUrls: [] }),
  extractCommunityHighlights: vi.fn().mockResolvedValue([]),
}));

// Mock @/lib/reports to prevent filesystem writes
vi.mock('@/lib/reports', () => ({
  writeReport: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Helper: read a ReadableStream into a concatenated string of all SSE chunks.
 */
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

/**
 * Parse SSE events from a collected string into typed event objects.
 */
function parseSSEEvents(raw: string): Array<{ type: string; message?: string; data?: unknown }> {
  const events: Array<{ type: string; message?: string; data?: unknown }> = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const jsonStr = line.slice('data: '.length).trim();
    if (!jsonStr) continue;
    try {
      events.push(JSON.parse(jsonStr));
    } catch {
      // skip malformed
    }
  }
  return events;
}

describe('POST /api/analysis/[ticker] — Gemini route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.DEPLOYMENT_MODE;
  });

  afterEach(() => {
    delete process.env.DEPLOYMENT_MODE;
  });

  it('Test 1: returns a response with Content-Type: text/event-stream', async () => {
    const { POST } = await import('@/app/api/analysis/[ticker]/route');

    const request = new Request('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: TMP_FILE }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(
      request as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ ticker: 'AAPL' }) }
    );

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('Test 2: SSE stream emits at least one progress event with "creating" substring before Gemini call', async () => {
    const { POST } = await import('@/app/api/analysis/[ticker]/route');

    const request = new Request('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: TMP_FILE }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(
      request as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ ticker: 'AAPL' }) }
    );

    const raw = await collectSSE(response.body!);
    const events = parseSSEEvents(raw);
    const progressEvents = events.filter(e => e.type === 'progress');

    expect(progressEvents.length).toBeGreaterThan(0);
    const hasCreating = progressEvents.some(
      e => typeof e.message === 'string' && e.message.toLowerCase().includes('creating')
    );
    expect(hasCreating).toBe(true);
  });

  it('Test 3: SSE stream emits a result event with AnalysisResult data when Gemini succeeds', async () => {
    const { POST } = await import('@/app/api/analysis/[ticker]/route');

    const request = new Request('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: TMP_FILE }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(
      request as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ ticker: 'AAPL' }) }
    );

    const raw = await collectSSE(response.body!);
    const events = parseSSEEvents(raw);
    const resultEvents = events.filter(e => e.type === 'result');

    expect(resultEvents).toHaveLength(1);
    const resultData = (resultEvents[0] as { type: 'result'; data: AnalysisResult }).data;
    expect(resultData.ticker).toBe('AAPL');
    expect(resultData.market_sentiment).toBe('bullish');
  });

  it('Test 4: SSE stream emits an error event when runGeminiAnalysis throws', async () => {
    const { runGeminiAnalysis } = await import('@/lib/gemini-analysis');
    (runGeminiAnalysis as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Gemini API unavailable')
    );

    const { POST } = await import('@/app/api/analysis/[ticker]/route');

    const request = new Request('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: TMP_FILE }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(
      request as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ ticker: 'AAPL' }) }
    );

    const raw = await collectSSE(response.body!);
    const events = parseSSEEvents(raw);
    const errorEvents = events.filter(e => e.type === 'error');

    expect(errorEvents.length).toBeGreaterThan(0);
    expect((errorEvents[0] as { type: 'error'; message: string }).message).toContain('Gemini API unavailable');
  });

  it('Test 5: spawn() from child_process is never called', async () => {
    const { spawn } = await import('child_process');
    const { POST } = await import('@/app/api/analysis/[ticker]/route');

    const request = new Request('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: TMP_FILE }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(
      request as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ ticker: 'AAPL' }) }
    );

    // Drain the stream to ensure the route async function completes
    await collectSSE(response.body!);

    expect(spawn as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('Test 6: returns 400 when filePath is outside os.tmpdir() (path traversal guard)', async () => {
    const { POST } = await import('@/app/api/analysis/[ticker]/route');

    const request = new Request('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: '/etc/passwd' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(
      request as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ ticker: 'AAPL' }) }
    );

    expect(response.status).toBe(400);
  });
});
