/**
 * Post-Phase-19 P0 — Yahoo `recommendationTrend` + `upgradeDowngradeHistory`
 * as a free, structured analyst-sentiment source.
 *
 * Slots into the analyst cascade as: exa → yahoo → finnhub → anthropic-search.
 * No flag (free, zero key, zero rate-limit risk). Returns
 * AnalystSentimentSection so callers swap transparently.
 *
 * Tests pin:
 *   1. Returns null when yahoo-finance2 throws (graceful degrade).
 *   2. Maps recommendationTrend.trend[0] (current month) → consensus.
 *      Strong-Buy + Buy ≥ Hold + Sell + StrongSell with bias toward Buy → 'Buy'.
 *   3. Maps upgradeDowngradeHistory.history → recent_changes[].
 *   4. analyst_count derived from the sum of trend[0] cells.
 *   5. avg_price_target null (Yahoo doesn't expose it on these modules — leave
 *      to Finnhub layer to fill).
 *   6. Hold-dominant trend → 'Hold' consensus.
 *   7. Sell-dominant trend → 'Sell' consensus.
 *   8. Empty history array → recent_changes is [] (not null).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('yahoo-finance2', () => {
  const ctorSpy = vi.fn();
  const quoteSummarySpy = vi.fn();
  class FakeYahoo {
    constructor(opts?: unknown) {
      ctorSpy(opts);
    }
    quoteSummary = quoteSummarySpy;
  }
  return { default: FakeYahoo, __spies: { ctorSpy, quoteSummarySpy } };
});

import YahooFinance from 'yahoo-finance2';
import { fetchYahooAnalystSentiment } from '@/lib/data/yahoo-analyst';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spies = (YahooFinance as any).__spies ?? (await import('yahoo-finance2') as any).__spies;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const quoteSummarySpy = (YahooFinance as any).prototype?.quoteSummary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ?? (spies as any)?.quoteSummarySpy;

beforeEach(() => {
  // Reset the mock between tests — vitest mock factories return the same
  // object reference, so we clear without dropping the prototype binding.
  if (quoteSummarySpy?.mockReset) quoteSummarySpy.mockReset();
});

describe('fetchYahooAnalystSentiment', () => {
  it('returns null when quoteSummary throws', async () => {
    quoteSummarySpy.mockRejectedValueOnce(new Error('not found'));
    const r = await fetchYahooAnalystSentiment('NOPE');
    expect(r).toBeNull();
  });

  it('Buy-dominant trend maps to consensus="Buy"', async () => {
    quoteSummarySpy.mockResolvedValueOnce({
      recommendationTrend: {
        trend: [
          { period: '0m', strongBuy: 10, buy: 12, hold: 4, sell: 1, strongSell: 0 },
          { period: '-1m', strongBuy: 9, buy: 12, hold: 5, sell: 1, strongSell: 0 },
        ],
      },
      upgradeDowngradeHistory: { history: [] },
    });
    const r = await fetchYahooAnalystSentiment('AAPL');
    expect(r).not.toBeNull();
    expect(r!.consensus).toBe('Buy');
    expect(r!.analyst_count).toBe(27); // 10 + 12 + 4 + 1 + 0
    expect(r!.avg_price_target).toBeNull();
    expect(r!.recent_changes).toEqual([]);
  });

  it('Hold-dominant trend maps to consensus="Hold"', async () => {
    quoteSummarySpy.mockResolvedValueOnce({
      recommendationTrend: {
        trend: [{ period: '0m', strongBuy: 1, buy: 2, hold: 10, sell: 2, strongSell: 1 }],
      },
      upgradeDowngradeHistory: { history: [] },
    });
    const r = await fetchYahooAnalystSentiment('XYZ');
    expect(r!.consensus).toBe('Hold');
  });

  it('Sell-dominant trend maps to consensus="Sell"', async () => {
    quoteSummarySpy.mockResolvedValueOnce({
      recommendationTrend: {
        trend: [{ period: '0m', strongBuy: 0, buy: 1, hold: 3, sell: 6, strongSell: 4 }],
      },
      upgradeDowngradeHistory: { history: [] },
    });
    const r = await fetchYahooAnalystSentiment('LOSE');
    expect(r!.consensus).toBe('Sell');
  });

  it('maps upgradeDowngradeHistory.history → recent_changes[] (newest first)', async () => {
    quoteSummarySpy.mockResolvedValueOnce({
      recommendationTrend: {
        trend: [{ period: '0m', strongBuy: 5, buy: 5, hold: 2, sell: 0, strongSell: 0 }],
      },
      upgradeDowngradeHistory: {
        history: [
          {
            firm: 'Goldman Sachs',
            toGrade: 'Buy',
            fromGrade: 'Hold',
            action: 'up',
            epochGradeDate: new Date('2026-04-21').getTime() / 1000,
          },
          {
            firm: 'JPMorgan',
            toGrade: 'Overweight',
            fromGrade: 'Equal-Weight',
            action: 'up',
            epochGradeDate: new Date('2026-04-19').getTime() / 1000,
          },
        ],
      },
    });
    const r = await fetchYahooAnalystSentiment('NVDA');
    expect(r!.recent_changes.length).toBe(2);
    expect(r!.recent_changes[0]!.firm).toBe('Goldman Sachs');
    expect(r!.recent_changes[0]!.action).toContain('Hold');
    expect(r!.recent_changes[0]!.action).toContain('Buy');
    expect(r!.recent_changes[0]!.date).toBe('2026-04-21');
  });

  it('returns null when recommendationTrend module is absent', async () => {
    quoteSummarySpy.mockResolvedValueOnce({});
    const r = await fetchYahooAnalystSentiment('???');
    expect(r).toBeNull();
  });

  it('handles upgradeDowngradeHistory undefined gracefully (consensus still set, recent_changes [])', async () => {
    quoteSummarySpy.mockResolvedValueOnce({
      recommendationTrend: {
        trend: [{ period: '0m', strongBuy: 4, buy: 8, hold: 3, sell: 1, strongSell: 0 }],
      },
    });
    const r = await fetchYahooAnalystSentiment('META');
    expect(r!.consensus).toBe('Buy');
    expect(r!.recent_changes).toEqual([]);
  });

  it('analyst_count is null when trend cells are all zero', async () => {
    quoteSummarySpy.mockResolvedValueOnce({
      recommendationTrend: {
        trend: [{ period: '0m', strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 }],
      },
    });
    const r = await fetchYahooAnalystSentiment('TINY');
    // Still returns an object — the trend module was present — but analyst_count is null.
    expect(r).not.toBeNull();
    expect(r!.consensus).toBeNull();
    expect(r!.analyst_count).toBeNull();
  });
});
