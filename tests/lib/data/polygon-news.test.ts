/**
 * Post-Phase-19 P0 — Polygon news as 3rd-tier news fallback.
 *
 * Slots into the new ladder as: exa → anthropic-search → polygon-news.
 * Long-tail insurance for small-cap tickers Exa neural-search + Anthropic
 * search both miss.
 *
 * 5 tests:
 *   1. Returns null when POLYGON_API_KEY missing (no fetch issued).
 *   2. Returns NewsSection on success — maps Polygon schema → NewsItem[].
 *   3. Returns null on 4xx (no retry).
 *   4. Returns null on persistent 5xx (after withRetry exhausts).
 *   5. Returns null on empty results envelope.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub global fetch — every test injects its own response.
const fetchSpy = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
const realFetch = global.fetch;

beforeEach(() => {
  fetchSpy.mockReset();
  global.fetch = fetchSpy as unknown as typeof fetch;
  delete process.env.POLYGON_API_KEY;
});

afterEach(() => {
  global.fetch = realFetch;
});

import { fetchPolygonNews } from '@/lib/data/polygon-news';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchPolygonNews', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns null when POLYGON_API_KEY missing (no fetch)', async () => {
    const r = await fetchPolygonNews('AAPL');
    expect(r).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns NewsSection — maps Polygon schema → NewsItem[]', async () => {
    process.env.POLYGON_API_KEY = 'test-key';
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: 'a1',
            publisher: { name: 'Reuters' },
            title: 'AAPL beats Q2 earnings',
            article_url: 'https://reuters.com/aapl-q2',
            tickers: ['AAPL'],
            published_utc: '2026-04-25T13:30:00Z',
            description: 'Apple reported record revenue...',
          },
          {
            id: 'a2',
            publisher: { name: 'Bloomberg' },
            title: 'Goldman raises AAPL target',
            article_url: 'https://bloomberg.com/aapl-target',
            tickers: ['AAPL'],
            published_utc: '2026-04-26T09:00:00Z',
          },
        ],
      }),
    );

    const r = await fetchPolygonNews('AAPL');
    expect(r).not.toBeNull();
    expect(r!.items.length).toBe(2);
    expect(r!.items[0]).toMatchObject({
      headline: 'AAPL beats Q2 earnings',
      url: 'https://reuters.com/aapl-q2',
      source: 'Reuters',
      published_date: '2026-04-25',
    });
  });

  it('returns null on 4xx (no retry)', async () => {
    process.env.POLYGON_API_KEY = 'test-key';
    fetchSpy.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));

    const r = await fetchPolygonNews('AAPL');
    expect(r).toBeNull();
    // 4xx not retried per D-25 — single fetch only.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null on persistent 5xx (after withRetry exhausts)', async () => {
    process.env.POLYGON_API_KEY = 'test-key';
    fetchSpy.mockResolvedValue(jsonResponse({ error: 'upstream' }, 503));

    const r = await fetchPolygonNews('AAPL');
    expect(r).toBeNull();
    // 5xx is retried up to 3 attempts.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('returns null on empty results envelope', async () => {
    process.env.POLYGON_API_KEY = 'test-key';
    fetchSpy.mockResolvedValueOnce(jsonResponse({ results: [] }));

    const r = await fetchPolygonNews('NOPE');
    expect(r).toBeNull();
  });
});
