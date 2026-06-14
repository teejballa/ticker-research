/**
 * Phase 22 Wave 1 (hotfix) — FRED (St. Louis Fed) Tier-3 fallback for the
 * regime classifier.
 *
 * Why: Yahoo Finance IP-blocks Vercel's egress (every `query2.finance.yahoo.com`
 * call from prod fails). Polygon's free tier doesn't include `I:VIX`
 * (NOT_AUTHORIZED) or historical SPY aggregates (timeframe-locked). FRED's
 * free API serves both VIXCLS and SP500 daily observations with only a free
 * API key needed.
 *
 * Series in use:
 *   - VIXCLS: CBOE Volatility Index, daily close, 1990-present
 *   - SP500:  S&P 500 daily close, trailing 10 years (rolling window — enough
 *             for the 200d MA cross D-03 requires)
 *
 * Per CLAUDE.md rule #6 (feature-leakage audit), this module is `@knowable_at
 * asOf` — every observation it returns has `date <= asOf`. FRED publishes T+1
 * for VIXCLS and SP500 (delay = 1 trading day) which is acceptable for the
 * regime classifier since we always pull a ≥60d trailing window.
 *
 * Falls through to [] (empty array) when:
 *   - FRED_API_KEY env var is missing (allowed — caller sees [] and returns null)
 *   - The HTTP request fails or times out
 *   - The response shape is malformed
 *
 * @knowable_at asOf
 */

const FRED_BASE = 'https://api.stlouisfed.org/fred';

export interface FredClose {
  date: Date;
  close: number;
}

/**
 * Fetch FRED daily observations for the given series between period1 and
 * period2 inclusive. Both ends are clipped to `<= asOf` by the caller — FRED
 * also publishes T+1 so asking for observations through today is safe.
 *
 * @knowable_at period2 — observations returned have date <= period2.
 */
export async function fetchFredSeriesCloses(
  seriesId: string,
  period1: Date,
  period2: Date,
): Promise<FredClose[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return [];

  const fromIso = period1.toISOString().slice(0, 10);
  const toIso = period2.toISOString().slice(0, 10);

  const url =
    `${FRED_BASE}/series/observations?series_id=${seriesId}` +
    `&observation_start=${fromIso}` +
    `&observation_end=${toIso}` +
    `&file_type=json` +
    `&api_key=${apiKey}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      observations?: Array<{ date: string; value: string }>;
    };
    const out: FredClose[] = [];
    for (const o of json.observations ?? []) {
      // FRED uses "." for missing values (e.g., trading-day gaps). Skip those.
      if (!o?.date || !o?.value || o.value === '.') continue;
      const close = parseFloat(o.value);
      if (!Number.isFinite(close) || close <= 0) continue;
      // FRED dates are in UTC midnight, ISO YYYY-MM-DD format
      const date = new Date(o.date + 'T00:00:00Z');
      if (Number.isNaN(date.getTime())) continue;
      out.push({ date, close });
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch {
    return [];
  }
}
