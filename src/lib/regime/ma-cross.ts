/**
 * Phase 22 D-03 + D-12 — SPY moving-average cross helper.
 *
 * SINGLE source of truth for the trend-axis input to `classifyRegimeAt`.
 * Called by BOTH:
 *   - src/lib/regime/classify.ts                 (forward classify path)
 *   - /api/cron/backfill-regime (Wave 2)         (historical PIT classify path)
 *
 * There is NO parallel/forked SPY-trend logic — train/serve skew defense per
 * CLAUDE.md rule #6.
 *
 * D-03 boundary semantics: trend axis is `sign(MA50 − MA200)` with the convention
 * `>= 0 → bull` (owned in `classify.ts`). An exact zero crossing rounds toward bull.
 * This helper only emits the raw signed difference `mean(last 50 closes) - mean(last 200 closes)`.
 *
 * D-12 NULL semantics: if Yahoo AND Polygon both return null AND no prior-trading-day
 * close resolves within a 10-trading-day backward sweep, this helper returns null
 * (does NOT throw). The classifier reads null → returns `'ALL'` per D-09 step 3.
 *
 * Cache namespace `spy_ma_cross:{YYYY-MM-DD}` with 24h TTL mirrors `getSectorSigma60d`
 * (`src/lib/data/sector-mapping.ts:175`) cache + retry semantics.
 *
 * @knowable_at asOf — uses ONLY ^GSPC (or SPY/Polygon fallback) closes ending on `asOf`;
 *   no forward data is used.
 */

import YahooFinance from 'yahoo-finance2';
import { cached } from '@/lib/data/cache';
import { REGIME_HYPERPARAMETERS } from './hyperparameters';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const POLYGON_BASE = 'https://api.polygon.io';

export interface SpyMaCrossPoint {
  /** `mean(last ma_short closes) - mean(last ma_long closes)` in price units. */
  ma50_minus_ma200: number;
}

interface SpyClose {
  date: Date;
  close: number;
}

/**
 * Fetch up to ~300 calendar days of trailing daily SPY closes ending at `asOf`,
 * trying Yahoo `^GSPC` first, then Polygon `SPY` per D-12.
 *
 * Returns the merged ascending-by-date series. Empty array when both providers
 * return nothing — caller maps to null helper result.
 */
async function fetchSpyCloses(asOf: Date): Promise<SpyClose[]> {
  // ~300 calendar days back guarantees >= 200 trading days under any holiday pattern.
  const period2 = asOf;
  const period1 = new Date(asOf.getTime() - 300 * 24 * 60 * 60 * 1000);

  // ── Primary: Yahoo `^GSPC` via .chart() ────────────────────────────────────
  const yahooCloses: SpyClose[] = [];
  try {
    const result = await yf.chart('^GSPC', { period1, period2, interval: '1d' });
    const quotes = result?.quotes ?? [];
    for (const q of quotes) {
      if (
        q?.date instanceof Date &&
        typeof q.close === 'number' &&
        Number.isFinite(q.close) &&
        q.close > 0
      ) {
        yahooCloses.push({ date: q.date, close: q.close });
      }
    }
  } catch {
    // graceful degrade per D-12 — fall through to Polygon
  }

  if (yahooCloses.length > 0) {
    return yahooCloses.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  // ── Fallback: Polygon SPY aggregates ───────────────────────────────────────
  const polygonKey = process.env.POLYGON_API_KEY;
  if (!polygonKey) return [];

  try {
    const fromIso = period1.toISOString().slice(0, 10);
    const toIso = period2.toISOString().slice(0, 10);
    const url =
      `${POLYGON_BASE}/v2/aggs/ticker/SPY/range/1/day/${fromIso}/${toIso}` +
      `?adjusted=true&sort=asc&limit=400&apiKey=${polygonKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: Array<{ t: number; c: number }> };
    const out: SpyClose[] = [];
    for (const r of json.results ?? []) {
      if (typeof r?.t === 'number' && typeof r?.c === 'number' && Number.isFinite(r.c) && r.c > 0) {
        out.push({ date: new Date(r.t), close: r.c });
      }
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch {
    return [];
  }
}

/**
 * Find the latest close at or before `asOf` (D-12 holiday-gap tolerance).
 * Returns null when no entry resolves within ~14 calendar days.
 */
function resolveCurrentClose(closes: SpyClose[], asOf: Date): SpyClose | null {
  if (closes.length === 0) return null;
  let lastBefore: SpyClose | null = null;
  for (let i = closes.length - 1; i >= 0; i--) {
    if (closes[i].date.getTime() <= asOf.getTime()) {
      lastBefore = closes[i];
      break;
    }
  }
  if (!lastBefore) return null;
  const gapDays = Math.floor((asOf.getTime() - lastBefore.date.getTime()) / (24 * 60 * 60 * 1000));
  if (gapDays > 14) return null;
  return lastBefore;
}

/**
 * Returns `{ ma50_minus_ma200 }` for SPY at `asOf` per D-03. Null when both
 * Yahoo and Polygon fail, or when fewer than `ma_long` closes are available
 * (cold-start path; classifier maps to 'ALL').
 *
 * Cache key: `spy_ma_cross:{YYYY-MM-DD}` with 24h TTL.
 *
 * @knowable_at asOf — uses ONLY closes <= asOf, including `asOf`'s own close
 *   as the trailing window's right edge.
 */
export async function getSpyMaCross(asOf: Date): Promise<SpyMaCrossPoint | null> {
  const dateKey = asOf.toISOString().slice(0, 10);
  return cached<SpyMaCrossPoint | null>(
    `spy_ma_cross:${dateKey}`,
    async () => {
      try {
        const closes = await fetchSpyCloses(asOf);
        const current = resolveCurrentClose(closes, asOf);
        if (!current) return null;

        // Window ends at and includes `current`. (Unlike VIX, the MA window is
        // "where is the trend at asOf" so the most-recent close is in the window.)
        const upto = closes.filter((c) => c.date.getTime() <= current.date.getTime());
        const longN = REGIME_HYPERPARAMETERS.ma_long;
        const shortN = REGIME_HYPERPARAMETERS.ma_short;
        if (upto.length < longN) return null;

        const closesAsc = upto.map((c) => c.close);
        const lastShort = closesAsc.slice(-shortN);
        const lastLong = closesAsc.slice(-longN);

        const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        const ma50 = mean(lastShort);
        const ma200 = mean(lastLong);

        return { ma50_minus_ma200: ma50 - ma200 };
      } catch (err) {
        console.warn(`[getSpyMaCross] ${dateKey} failed:`, err);
        return null;
      }
    },
    { ttlSeconds: 24 * 60 * 60 }, // 24h — historical SPY closes don't change intraday
  );
}
