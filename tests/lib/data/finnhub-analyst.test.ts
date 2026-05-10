/**
 * Post-Phase-19 P0 — Finnhub structured analyst sentiment.
 *
 * Slots into the new-ladder analyst cascade between Yahoo and Anthropic-search:
 *   exa → yahoo → finnhub → anthropic-search.
 * Adds the structured `avg_price_target` field that Yahoo's analyst module
 * does not surface.
 *
 * 5 tests:
 *   1. Returns null when FINNHUB_API_KEY missing (no fetch issued).
 *   2. Returns AnalystSentimentSection — maps recommendation + price-target +
 *      upgrade/downgrade to canonical shape (consensus = Buy when
 *      strongBuy+buy > hold > sell+strongSell on the most-recent month).
 *   3. Returns null when both endpoints fail (single fetch each, no surface).
 *   4. Maps Hold-dominant trend → consensus="Hold".
 *   5. recent_changes[] populated from upgrade/downgrade endpoint, newest first.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchSpy = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>();
const realFetch = global.fetch;

beforeEach(() => {
  fetchSpy.mockReset();
  global.fetch = fetchSpy as unknown as typeof fetch;
  delete process.env.FINNHUB_API_KEY;
});

afterEach(() => {
  global.fetch = realFetch;
});

import { fetchFinnhubAnalystSentiment } from '@/lib/data/finnhub-analyst';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchFinnhubAnalystSentiment', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns null when FINNHUB_API_KEY missing (no fetch)', async () => {
    const r = await fetchFinnhubAnalystSentiment('AAPL');
    expect(r).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns AnalystSentimentSection on success — Buy-dominant + price target + recent_changes', async () => {
    process.env.FINNHUB_API_KEY = 'test-key';
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/stock/recommendation')) {
        return Promise.resolve(
          jsonResponse([
            // Finnhub returns most-recent-first.
            { period: '2026-04-30', strongBuy: 10, buy: 12, hold: 4, sell: 1, strongSell: 0 },
            { period: '2026-03-31', strongBuy: 9, buy: 11, hold: 5, sell: 1, strongSell: 0 },
          ]),
        );
      }
      if (u.includes('/stock/price-target')) {
        return Promise.resolve(
          jsonResponse({
            symbol: 'AAPL',
            targetHigh: 285,
            targetLow: 195,
            targetMean: 248.5,
            targetMedian: 250,
            lastUpdated: '2026-04-30 10:00:00',
          }),
        );
      }
      if (u.includes('/stock/upgrade-downgrade')) {
        return Promise.resolve(
          jsonResponse([
            {
              symbol: 'AAPL',
              gradeTime: 1745625600, // 2026-04-26
              fromGrade: 'Hold',
              toGrade: 'Buy',
              company: 'Goldman Sachs',
              action: 'up',
            },
            {
              symbol: 'AAPL',
              gradeTime: 1745452800, // 2026-04-24
              fromGrade: 'Sell',
              toGrade: 'Hold',
              company: 'Bernstein',
              action: 'up',
            },
          ]),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    const r = await fetchFinnhubAnalystSentiment('AAPL');
    expect(r).not.toBeNull();
    expect(r!.consensus).toBe('Buy');
    expect(r!.avg_price_target).toBe(248.5);
    expect(r!.analyst_count).toBe(27);
    expect(r!.recent_changes.length).toBe(2);
    expect(r!.recent_changes[0]!.firm).toBe('Goldman Sachs');
    expect(r!.recent_changes[0]!.action).toContain('Hold');
    expect(r!.recent_changes[0]!.action).toContain('Buy');
  });

  it('returns null when both endpoints fail / return empty', async () => {
    process.env.FINNHUB_API_KEY = 'test-key';
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/stock/recommendation')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    const r = await fetchFinnhubAnalystSentiment('NOPE');
    expect(r).toBeNull();
  });

  it('Hold-dominant trend → consensus="Hold"', async () => {
    process.env.FINNHUB_API_KEY = 'test-key';
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/stock/recommendation')) {
        return Promise.resolve(
          jsonResponse([
            { period: '2026-04-30', strongBuy: 1, buy: 2, hold: 10, sell: 2, strongSell: 1 },
          ]),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    const r = await fetchFinnhubAnalystSentiment('XYZ');
    expect(r).not.toBeNull();
    expect(r!.consensus).toBe('Hold');
    // Price target endpoint returned 404 → null.
    expect(r!.avg_price_target).toBeNull();
  });

  it('handles missing upgrade-downgrade list gracefully (recent_changes [])', async () => {
    process.env.FINNHUB_API_KEY = 'test-key';
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/stock/recommendation')) {
        return Promise.resolve(
          jsonResponse([
            { period: '2026-04-30', strongBuy: 8, buy: 10, hold: 2, sell: 0, strongSell: 0 },
          ]),
        );
      }
      if (u.includes('/stock/price-target')) {
        return Promise.resolve(
          jsonResponse({ targetMean: 200, targetMedian: 198 }),
        );
      }
      // upgrade-downgrade endpoint absent → 404
      return Promise.resolve(jsonResponse({}, 404));
    });

    const r = await fetchFinnhubAnalystSentiment('META');
    expect(r).not.toBeNull();
    expect(r!.consensus).toBe('Buy');
    expect(r!.avg_price_target).toBe(200);
    expect(r!.recent_changes).toEqual([]);
  });
});
