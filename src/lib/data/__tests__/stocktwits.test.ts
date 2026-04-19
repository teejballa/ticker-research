// src/lib/data/__tests__/stocktwits.test.ts
// Unit tests for fetchStockTwitsSentiment (D-06, D-07)
// Tests cover: null return paths, bull/bear computation, is_trending derivation.

import { fetchStockTwitsSentiment } from '../stocktwits';

// Mock global fetch for all tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchStockTwitsSentiment', () => {
  describe('null return paths', () => {
    it('returns all-null StockTwits fields when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'));
      const result = await fetchStockTwitsSentiment('AAPL');
      expect(result.stocktwits_bull_pct).toBeNull();
      expect(result.stocktwits_bear_pct).toBeNull();
      expect(result.stocktwits_message_count).toBeNull();
      expect(result.stocktwits_is_trending).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('returns all-null StockTwits fields when API returns non-200', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
      const result = await fetchStockTwitsSentiment('AAPL');
      expect(result.stocktwits_bull_pct).toBeNull();
      expect(result.stocktwits_bear_pct).toBeNull();
    });

    it('returns null bull/bear_pct (not 0) when no messages have sentiment labels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            { id: 1, body: 'interesting', created_at: '2026-01-01', entities: { sentiment: null } },
          ],
          symbol: { sentiment_change: 0 },
        }),
      });
      const result = await fetchStockTwitsSentiment('AAPL');
      // No labeled messages — pct should be null, not 0
      expect(result.stocktwits_bull_pct).toBeNull();
      expect(result.stocktwits_bear_pct).toBeNull();
      // message_count still non-null (1 message exists)
      expect(result.stocktwits_message_count).toBe(1);
    });
  });

  describe('bull/bear computation (D-07)', () => {
    it('computes bull_pct and bear_pct from per-message sentiment labels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            { id: 1, body: 'up', created_at: '2026-01-01', entities: { sentiment: { basic: 'Bullish' } } },
            { id: 2, body: 'up', created_at: '2026-01-01', entities: { sentiment: { basic: 'Bullish' } } },
            { id: 3, body: 'down', created_at: '2026-01-01', entities: { sentiment: { basic: 'Bearish' } } },
            { id: 4, body: 'no label', created_at: '2026-01-01', entities: { sentiment: null } },
          ],
          symbol: { sentiment_change: 0.1 },
        }),
      });
      const result = await fetchStockTwitsSentiment('AAPL');
      // 2 bullish out of 3 labeled = 67%
      expect(result.stocktwits_bull_pct).toBe(67);
      expect(result.stocktwits_bear_pct).toBe(33);
      expect(result.stocktwits_message_count).toBe(4); // total messages, not labeled
    });
  });

  describe('is_trending derivation (D-07)', () => {
    it('sets is_trending true when |sentiment_change| > 0.5', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [],
          symbol: { sentiment_change: 0.8 },
        }),
      });
      const result = await fetchStockTwitsSentiment('AAPL');
      expect(result.stocktwits_is_trending).toBe(true);
    });

    it('sets is_trending false when |sentiment_change| <= 0.5', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [],
          symbol: { sentiment_change: 0.3 },
        }),
      });
      const result = await fetchStockTwitsSentiment('AAPL');
      expect(result.stocktwits_is_trending).toBe(false);
    });

    it('sets is_trending false when symbol field absent (defaults to 0)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [] }),
      });
      const result = await fetchStockTwitsSentiment('AAPL');
      expect(result.stocktwits_is_trending).toBe(false);
    });
  });

  describe('URL safety', () => {
    it('encodes ticker in URL to prevent injection', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
      await fetchStockTwitsSentiment('BRK.A');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('BRK.A')),
        expect.any(Object),
      );
    });
  });
});
