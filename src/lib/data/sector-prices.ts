/**
 * Phase 21 — Sector-Relative Outcome Labels
 *
 * Fetches sector ETF (or SPY) price history via yahoo-finance2 .chart() and
 * computes the percent return over a [fromDate, toDate] window.
 *
 * Mirrors the SPY history pattern in /api/cron/learn/route.ts but generalizes
 * to all 12 SectorETF union values (XLK/XLF/XLE/XLV/XLY/XLP/XLI/XLU/XLB/XLRE/XLC/SPY).
 *
 * Cached per (ETF, year-month) so backfill walks the table without flooding
 * yahoo-finance2. TTL 30 days — historical ETF closes do not change.
 */

import YahooFinance from 'yahoo-finance2';
import type { SectorETF } from '@/lib/data/sector-mapping';
import { cached } from '@/lib/data/cache';
import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface Quote {
  date: Date;
  close: number;
}

async function fetchEtfChartCached(etf: SectorETF, monthKey: string): Promise<Quote[]> {
  const fetcher = async (): Promise<Quote[]> => {
    // monthKey is 'YYYY-MM'; fetch the full month plus 10 days of buffer on each side.
    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr); // 1-indexed in monthKey
    const period1 = new Date(Date.UTC(year, month - 1, 1) - 10 * 86_400_000);
    const period2 = new Date(Date.UTC(year, month, 1) + 10 * 86_400_000);
    try {
      const result = await yf.chart(etf, { period1, period2, interval: '1d' });
      const quotes = result?.quotes ?? [];
      const validated: Quote[] = [];
      for (const q of quotes) {
        if (q?.date instanceof Date && typeof q.close === 'number') {
          validated.push({ date: q.date, close: q.close });
        }
      }
      return validated;
    } catch {
      return [];
    }
  };

  return cached(
    CACHE_KEYS.sectorEtfChart(etf, monthKey),
    fetcher,
    { ttlSeconds: TTL_SECONDS.sector_etf_chart },
  );
}

function nearestClose(quotes: Quote[], when: Date): number | null {
  if (quotes.length === 0) return null;
  let best: Quote | null = null;
  let bestDiff = Infinity;
  for (const q of quotes) {
    const diff = Math.abs(q.date.getTime() - when.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      best = q;
    }
  }
  // Reject if nearest close is more than 7 calendar days away (long weekend / holiday tolerance).
  if (best == null || bestDiff > 7 * 86_400_000) return null;
  return best.close;
}

/**
 * Returns the percent return (e.g. 2.5 for +2.5%) of `etf` between `fromDate`
 * and `toDate`. Returns null when prices on either side cannot be retrieved.
 */
export async function fetchSectorETFReturn(
  etf: SectorETF,
  fromDate: Date,
  toDate: Date,
): Promise<number | null> {
  // Union of month-keys spanning the window (handles month-crossing windows).
  const monthKeys = new Set<string>();
  for (
    let d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    d <= toDate;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  ) {
    monthKeys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const allQuotes: Quote[] = [];
  for (const monthKey of monthKeys) {
    const quotes = await fetchEtfChartCached(etf, monthKey);
    allQuotes.push(...quotes);
  }

  const closeFrom = nearestClose(allQuotes, fromDate);
  const closeTo = nearestClose(allQuotes, toDate);
  if (closeFrom == null || closeTo == null) return null;
  return ((closeTo - closeFrom) / closeFrom) * 100;
}
