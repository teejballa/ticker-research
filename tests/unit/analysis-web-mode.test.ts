// tests/unit/analysis-web-mode.test.ts
// Unit tests for the web-mode branch of src/app/api/analysis/[ticker]/route.ts
// All external dependencies are mocked: NextAuth, @/lib/auth, user-credential-db, credentials, fs/promises, fetch

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Hoisted mock factories ---
const {
  mockGetServerSession,
  mockGetCredential,
  mockDecrypt,
  mockReadFile,
  mockFetch,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockGetCredential: vi.fn(),
  mockDecrypt: vi.fn(),
  mockReadFile: vi.fn(),
  mockFetch: vi.fn(),
}));

// Mock dynamic imports used inside the web-mode branch
vi.mock('next-auth/next', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/user-credential-db', () => ({ getCredential: mockGetCredential }));
vi.mock('@/lib/credentials', () => ({ decrypt: mockDecrypt }));
vi.mock('fs/promises', () => ({ readFile: mockReadFile }));
vi.mock('@/lib/reports', () => ({ writeReport: vi.fn() }));
vi.mock('@/lib/reports-db', () => ({ writeReportToDb: vi.fn() }));
vi.mock('child_process', () => ({ spawn: vi.fn() }));

import { POST } from '@/app/api/analysis/[ticker]/route';
import { NextRequest } from 'next/server';

// Helper to build a minimal NextRequest with a JSON body
function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/analysis/AAPL', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('analysis route — web mode (DEPLOYMENT_MODE=web)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      DEPLOYMENT_MODE: 'web',
      DAYTONA_CONTAINER_URL: 'https://container.example.com',
      DAYTONA_SECRET: 'test-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 401 when there is no session', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const req = makeRequest({ filePath: '/tmp/AAPL.json' });
    const res = await POST(req, { params: Promise.resolve({ ticker: 'AAPL' }) });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.type).toBe('error');
    expect(body.message).toMatch(/not authenticated/i);
  });

  it('returns 400 with "NotebookLM account not connected." when no UserCredential exists', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: 'user@example.com' } });
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ ticker: 'AAPL' }));
    mockGetCredential.mockResolvedValueOnce(null);

    const req = makeRequest({ filePath: '/tmp/AAPL.json' });
    const res = await POST(req, { params: Promise.resolve({ ticker: 'AAPL' }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toBe('error');
    expect(body.message).toBe('NotebookLM account not connected.');
  });

  it('calls fetch to DAYTONA_CONTAINER_URL/analyze/{ticker} with correct body and headers and returns streaming response', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { email: 'user@example.com' } });
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ ticker: 'AAPL' }));
    mockGetCredential.mockResolvedValueOnce({ encrypted_state: 'enc-blob' });
    mockDecrypt.mockReturnValueOnce(JSON.stringify({ cookies: [{ name: 'SID', value: 'abc' }] }));

    const fakeBody = new ReadableStream();
    mockFetch.mockResolvedValueOnce({
      body: fakeBody,
      ok: true,
    });
    // Replace global fetch with mock
    const globalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const req = makeRequest({ filePath: '/tmp/AAPL.json' });
      const res = await POST(req, { params: Promise.resolve({ ticker: 'AAPL' }) });

      // Verify fetch was called with the correct URL and headers
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://container.example.com/analyze/AAPL');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(opts.headers['x-daytona-secret']).toBe('test-secret');

      // Verify body contains sourcePackage and storageState
      const parsedBody = JSON.parse(opts.body);
      expect(parsedBody.sourcePackage).toEqual({ ticker: 'AAPL' });
      expect(parsedBody.storageState).toEqual({ cookies: [{ name: 'SID', value: 'abc' }] });

      // Verify response is SSE stream
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');
      expect(res.body).toBe(fakeBody);
    } finally {
      global.fetch = globalFetch;
    }
  });

  it('local mode path is unchanged (DEPLOYMENT_MODE not set)', async () => {
    // Remove DEPLOYMENT_MODE — local mode should spawn Python, not call getServerSession
    delete process.env.DEPLOYMENT_MODE;

    // spawn should never be called with args that invoke web-mode path
    // Just verify getServerSession is NOT called in local mode
    const req = makeRequest({ filePath: '/tmp/AAPL.json' });

    // In local mode, spawn is called which requires a real Python process —
    // we verify the web branch is NOT entered by checking getServerSession was never called
    // The response will be an SSE stream (local branch runs spawn internally)
    try {
      await POST(req, { params: Promise.resolve({ ticker: 'AAPL' }) });
    } catch {
      // spawn mock may throw — that's fine, we only care about session not being called
    }

    expect(mockGetServerSession).not.toHaveBeenCalled();
  });
});
