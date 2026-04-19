// src/lib/data/__tests__/options-sentiment.test.ts
// Unit tests for fetchOptionsSentiment (D-09 through D-13)
// Tests cover: null return paths, put/call ratio computation, D-11 threshold logic.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchOptionsSentiment } from '../options-sentiment';

// Mock yahoo-finance2
vi.mock('yahoo-finance2', () => ({
  default: {
    options: vi.fn(),
  },
}));

import yahooFinance from 'yahoo-finance2';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOptions = yahooFinance.options as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchOptionsSentiment', () => {
  describe('null return paths (D-13)', () => {
    it('returns null when yahooFinance.options throws', async () => {
      mockOptions.mockRejectedValueOnce(new Error('no options chain'));
      const result = await fetchOptionsSentiment('INVALID');
      expect(result.put_call_ratio).toBeNull();
      expect(result.put_call_interpretation).toBeNull();
    });

    it('returns null when all call openInterest is zero (avoids division by zero)', async () => {
      mockOptions.mockResolvedValueOnce({
        options: [{ calls: [], puts: [{ openInterest: 100 }] }],
      });
      const result = await fetchOptionsSentiment('AAPL');
      expect(result.put_call_ratio).toBeNull();
      expect(result.put_call_interpretation).toBeNull();
    });

    it('returns null when options array is empty', async () => {
      mockOptions.mockResolvedValueOnce({ options: [] });
      const result = await fetchOptionsSentiment('AAPL');
      expect(result.put_call_ratio).toBeNull();
      expect(result.put_call_interpretation).toBeNull();
    });
  });

  describe('put/call ratio computation (D-10)', () => {
    it('sums openInterest across all chains and contracts', async () => {
      mockOptions.mockResolvedValueOnce({
        options: [
          {
            calls: [{ openInterest: 1000 }, { openInterest: 500 }],
            puts: [{ openInterest: 800 }, { openInterest: 200 }],
          },
        ],
      });
      const result = await fetchOptionsSentiment('AAPL');
      // putOI = 1000, callOI = 1500, ratio = 1000/1500 = 0.667
      expect(result.put_call_ratio).toBeCloseTo(0.667, 2);
    });

    it('handles undefined openInterest by treating as 0', async () => {
      mockOptions.mockResolvedValueOnce({
        options: [
          {
            calls: [{ openInterest: 1000 }, {}], // second has no openInterest
            puts: [{ openInterest: 500 }],
          },
        ],
      });
      const result = await fetchOptionsSentiment('AAPL');
      expect(result.put_call_ratio).toBeCloseTo(0.5, 2);
    });
  });

  describe('D-11 threshold interpretation', () => {
    it('returns bearish when ratio > 1.0', async () => {
      mockOptions.mockResolvedValueOnce({
        options: [{ calls: [{ openInterest: 500 }], puts: [{ openInterest: 1500 }] }],
      });
      const result = await fetchOptionsSentiment('AAPL');
      expect(result.put_call_interpretation).toBe('bearish');
    });

    it('returns bullish when ratio < 0.5', async () => {
      mockOptions.mockResolvedValueOnce({
        options: [{ calls: [{ openInterest: 2000 }], puts: [{ openInterest: 500 }] }],
      });
      const result = await fetchOptionsSentiment('AAPL');
      expect(result.put_call_interpretation).toBe('bullish');
    });

    it('returns neutral when ratio is between 0.5 and 1.0 inclusive', async () => {
      mockOptions.mockResolvedValueOnce({
        options: [{ calls: [{ openInterest: 1000 }], puts: [{ openInterest: 700 }] }],
      });
      const result = await fetchOptionsSentiment('AAPL');
      expect(result.put_call_interpretation).toBe('neutral');
    });

    it('returns neutral at exactly 0.5 boundary (< 0.5 is bullish, = 0.5 is neutral)', async () => {
      mockOptions.mockResolvedValueOnce({
        options: [{ calls: [{ openInterest: 1000 }], puts: [{ openInterest: 500 }] }],
      });
      const result = await fetchOptionsSentiment('AAPL');
      // ratio = 0.5 exactly — neutral (boundary condition for D-11: <0.5 = bullish)
      expect(result.put_call_interpretation).toBe('neutral');
    });
  });
});
