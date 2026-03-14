// src/app/api/analysis/__tests__/route.test.ts
// Integration tests for POST /api/analysis/[ticker]
// Mocks child_process.spawn to control stdout and test SSE event streaming.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process before importing the route
vi.mock('child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

/**
 * Helper: create a fake child process emitter that mimics spawn() return value.
 * Emits stdout data and close events on demand.
 */
function makeProc() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  (proc as unknown as { stdout: EventEmitter }).stdout = stdout;
  (proc as unknown as { stderr: EventEmitter }).stderr = stderr;
  (proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill = vi.fn();
  return proc;
}

/**
 * Helper: read a ReadableStream into an array of SSE data strings.
 */
async function collectSSE(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(decoder.decode(value));
  }
  return parts;
}

describe('POST /api/analysis/[ticker]', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('streams a progress SSE event when Python script emits PROGRESS: line', async () => {
    const { spawn } = await import('child_process');
    const proc = makeProc();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);

    const { POST } = await import('@/app/api/analysis/[ticker]/route');

    const request = new Request('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: '/tmp/test.json' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const responsePromise = POST(
      request as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ ticker: 'AAPL' }) }
    );

    // Emit a PROGRESS line from the fake process
    setImmediate(() => {
      proc.stdout.emit('data', Buffer.from('PROGRESS: Creating notebook...\n'));
      // Emit RESULT to close the stream
      const resultJson = JSON.stringify({
        ticker: 'AAPL',
        company_name: 'Apple Inc.',
        analyzed_at: '2026-03-12T00:00:00Z',
        market_sentiment: 'bullish',
        sentiment_reasoning: 'Strong.',
        bullish_signals: [
          { signal: 'A', source_citation: 'S1' },
          { signal: 'B', source_citation: 'S2' },
          { signal: 'C', source_citation: 'S3' },
        ],
        bearish_signals: [
          { signal: 'X', source_citation: 'S1' },
          { signal: 'Y', source_citation: 'S2' },
          { signal: 'Z', source_citation: 'S3' },
        ],
        assessment: { buy_pct: 60, hold_pct: 30, sell_pct: 10, buy_rationale: 'Strong', hold_rationale: 'Moderate', sell_rationale: 'Minor' },
        confidence_level: 'High',
        confidence_explanation: 'Multiple sources agree.',
        sources_used: [],
        source_warnings: [],
      });
      proc.stdout.emit('data', Buffer.from(`RESULT: ${resultJson}\n`));
    });

    const response = await responsePromise;
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const parts = await collectSSE(response.body!);
    const combined = parts.join('');
    expect(combined).toContain('"type":"progress"');
    expect(combined).toContain('"message":"Creating notebook..."');
  });

  it('streams a result SSE event when Python script emits RESULT: JSON', async () => {
    const { spawn } = await import('child_process');
    const proc = makeProc();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);

    const { POST } = await import('@/app/api/analysis/[ticker]/route');

    const request = new Request('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: '/tmp/test.json' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const responsePromise = POST(
      request as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ ticker: 'AAPL' }) }
    );

    const resultData = {
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      analyzed_at: '2026-03-12T00:00:00Z',
      market_sentiment: 'bullish',
      sentiment_reasoning: 'Strong.',
      bullish_signals: [
        { signal: 'A', source_citation: 'S1' },
        { signal: 'B', source_citation: 'S2' },
        { signal: 'C', source_citation: 'S3' },
      ],
      bearish_signals: [
        { signal: 'X', source_citation: 'S1' },
        { signal: 'Y', source_citation: 'S2' },
        { signal: 'Z', source_citation: 'S3' },
      ],
      assessment: { buy_pct: 60, hold_pct: 30, sell_pct: 10, buy_rationale: 'Strong', hold_rationale: 'Moderate', sell_rationale: 'Minor' },
      confidence_level: 'High',
      confidence_explanation: 'Multiple sources agree.',
      sources_used: [],
      source_warnings: [],
    };

    setImmediate(() => {
      proc.stdout.emit('data', Buffer.from(`RESULT: ${JSON.stringify(resultData)}\n`));
    });

    const response = await responsePromise;
    const parts = await collectSSE(response.body!);
    const combined = parts.join('');

    expect(combined).toContain('"type":"result"');
    expect(combined).toContain('"ticker":"AAPL"');
    expect(combined).toContain('"market_sentiment":"bullish"');
  });

  it('streams an error SSE event when Python script emits ERROR: line', async () => {
    const { spawn } = await import('child_process');
    const proc = makeProc();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(proc);

    const { POST } = await import('@/app/api/analysis/[ticker]/route');

    const request = new Request('http://localhost/api/analysis/AAPL', {
      method: 'POST',
      body: JSON.stringify({ filePath: '/tmp/test.json' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const responsePromise = POST(
      request as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ ticker: 'AAPL' }) }
    );

    setImmediate(() => {
      proc.stdout.emit('data', Buffer.from('ERROR: NotebookLM daily limit reached. Resets at midnight PST — try again tomorrow.\n'));
    });

    const response = await responsePromise;
    const parts = await collectSSE(response.body!);
    const combined = parts.join('');

    expect(combined).toContain('"type":"error"');
    expect(combined).toContain('daily limit');
  });
});
