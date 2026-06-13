/**
 * Phase 22 D-04 + D-12 — VIX rolling 60d percentile helper.
 *
 * SINGLE source of truth for the vol-axis input to `classifyRegimeAt`.
 * Called by BOTH:
 *   - src/lib/regime/classify.ts                 (forward classify path)
 *   - /api/cron/backfill-regime (Wave 2)         (historical PIT classify path)
 *
 * There is NO parallel/forked VIX-history logic — train/serve skew defense per
 * CLAUDE.md rule #6.
 *
 * D-12 NULL semantics: if Yahoo AND Polygon both return null AND no prior-trading-day
 * close resolves within a 10-trading-day backward sweep, this helper returns null
 * (does NOT throw). The classifier reads null → returns `'ALL'` per D-09 step 3.
 *
 * Cache namespace `vix_60d:{YYYY-MM-DD}` with 24h TTL mirrors `getSectorSigma60d`
 * (`src/lib/data/sector-mapping.ts:175`) cache + retry semantics. Historical VIX
 * closes do not change intraday, so a long TTL is safe.
 *
 * @knowable_at asOf — uses only ^VIX (or I:VIX fallback) closes ending on `asOf`;
 *   no forward data is used. The trailing 60d window excludes `asOf` itself.
 */

import YahooFinance from 'yahoo-finance2';
import { cached } from '@/lib/data/cache';
import { REGIME_HYPERPARAMETERS } from './hyperparameters';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const POLYGON_BASE = 'https://api.polygon.io';

export interface VixPercentilePoint {
  /** The latest VIX close at or before `asOf` (after any prior-trading-day fallback). */
  level: number;
  /**
   * Fraction of the trailing 60 trading-day closes (NOT counting `asOf`'s own close)
   * that are <= the current `level`. Range [0, 1].
   *
   * Boundary: `>= 0.5` → 'high-vol' per D-04. Strict-`>=` semantics owned in
   * `classify.ts` so this helper only emits the raw percentile rank.
   */
  percentile_60d: number;
}

interface VixClose {
  date: Date;
  close: number;
}

/**
 * Fetch up to ~100 calendar days of trailing daily VIX closes ending at `asOf`,
 * trying Yahoo `^VIX` first, then Polygon `I:VIX` per D-12.
 *
 * Returns the merged ascending-by-date series (deduplicated by date). Empty array
 * when both providers return nothing — caller maps that to a null helper result.
 */
async function fetchVixCloses(asOf: Date): Promise<VixClose[]> {
  // ~100 calendar days back guarantees >= 60 trading days under any holiday pattern.
  const period2 = asOf;
  const period1 = new Date(asOf.getTime() - 100 * 24 * 60 * 60 * 1000);

  // ── Primary: Yahoo `^VIX` via .chart() (mirrors sector-prices.ts pattern) ──
  const yahooCloses: VixClose[] = [];
  try {
    const result = await yf.chart('^VIX', { period1, period2, interval: '1d' });
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

  // ── Fallback: Polygon I:VIX aggregates ─────────────────────────────────────
  const polygonKey = process.env.POLYGON_API_KEY;
  if (!polygonKey) return [];

  try {
    const fromIso = period1.toISOString().slice(0, 10);
    const toIso = period2.toISOString().slice(0, 10);
    const url =
      `${POLYGON_BASE}/v2/aggs/ticker/I:VIX/range/1/day/${fromIso}/${toIso}` +
      `?adjusted=true&sort=asc&limit=200&apiKey=${polygonKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: Array<{ t: number; c: number }> };
    const out: VixClose[] = [];
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
 * Find the latest close at or before `asOf`, sweeping backward up to 10 trading-day
 * entries (per D-12 holiday-gap tolerance). Returns null when no entry resolves.
 */
function resolveCurrentClose(closes: VixClose[], asOf: Date): VixClose | null {
  if (closes.length === 0) return null;
  // Closes are ascending; the most recent close on or before asOf is the last
  // entry with date <= asOf. We tolerate up to 10 trading days of gap (holidays)
  // by simply walking backwards until we find a valid close — yahoo + polygon
  // both omit non-trading days entirely so adjacent entries ARE prior trading days.
  let lastBefore: VixClose | null = null;
  for (let i = closes.length - 1; i >= 0; i--) {
    if (closes[i].date.getTime() <= asOf.getTime()) {
      lastBefore = closes[i];
      break;
    }
  }
  if (!lastBefore) return null;

  // Reject when the gap is > 10 trading days (~14 calendar days). Cron callers
  // pass an `asOf` that is at most ~1 trading day stale; backfill cron passes
  // PIT dates. A 10-trading-day gap means data is genuinely unavailable.
  const gapDays = Math.floor((asOf.getTime() - lastBefore.date.getTime()) / (24 * 60 * 60 * 1000));
  if (gapDays > 14) return null;

  return lastBefore;
}

/**
 * Returns `{ level, percentile_60d }` for the VIX at `asOf` per D-04. Null when
 * both Yahoo and Polygon fail, or when fewer than `vix_window_days` trailing
 * closes are available (cold-start path; classifier maps to 'ALL').
 *
 * Cache key: `vix_60d:{YYYY-MM-DD}` with 24h TTL.
 *
 * @knowable_at asOf — uses ONLY closes <= asOf. The trailing 60d percentile
 *   intentionally excludes `asOf`'s own close so the rank is "where does today
 *   sit vs the recent past" rather than self-ranked.
 */
export async function getVix60dPercentile(asOf: Date): Promise<VixPercentilePoint | null> {
  const dateKey = asOf.toISOString().slice(0, 10);
  return cached<VixPercentilePoint | null>(
    `vix_60d:${dateKey}`,
    async () => {
      try {
        const closes = await fetchVixCloses(asOf);
        const current = resolveCurrentClose(closes, asOf);
        if (!current) return null;

        // Trailing window = the `vix_window_days` closes ENDING at the most-recent
        // close STRICTLY BEFORE `current`. (Self-exclusion per @knowable_at.)
        const window = REGIME_HYPERPARAMETERS.vix_window_days;
        const trailing = closes.filter(
          (c) => c.date.getTime() < current.date.getTime(),
        );
        if (trailing.length < window) return null;

        const last60 = trailing.slice(-window).map((c) => c.close);
        const below = last60.filter((c) => c <= current.close).length;
        const percentile_60d = below / last60.length;

        return { level: current.close, percentile_60d };
      } catch (err) {
        console.warn(`[getVix60dPercentile] ${dateKey} failed:`, err);
        return null;
      }
    },
    { ttlSeconds: 24 * 60 * 60 }, // 24h — historical VIX closes don't change intraday
  );
}
