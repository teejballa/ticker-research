/**
 * Phase 22 Wave 1 (hotfix 2026-06-14/15) — FRED (St. Louis Fed) Tier-3 fallback
 * for the regime classifier.
 *
 * Why this exists:
 *   Yahoo Finance IP-blocks Vercel's egress range — every
 *   `query2.finance.yahoo.com` call from production fails. Polygon's free tier
 *   rejects `I:VIX` (NOT_AUTHORIZED) and historical SPY aggregates
 *   (timeframe-locked). FRED is the only free, production-safe source for
 *   VIX + S&P 500 historicals.
 *
 * Endpoint: GET https://api.stlouisfed.org/fred/series/observations
 *   Documented at https://fred.stlouisfed.org/docs/api/fred/series_observations.html
 *
 * Series in use:
 *   - VIXCLS — CBOE Volatility Index, daily close, 1990-present, T+1 publish lag
 *   - SP500  — S&P 500 daily close, trailing 10 calendar years, T+1 publish lag
 *
 *   Both are sufficient for the regime classifier's 60-day VIX percentile and
 *   200-day MA cross requirements.
 *
 * PIT correctness (CLAUDE.md rule #6 — feature-leakage audit):
 *   FRED supports REAL-TIME (vintage) queries via realtime_start / realtime_end.
 *   These select the database snapshot as it would have been observed at that
 *   wall-clock date — critical for backtesting because future revisions to a
 *   series would otherwise leak into past predictions. We always pass
 *   `realtime_end=period2` so the caller's `asOf` defines the as-known cutoff.
 *
 *   For VIXCLS and SP500 the vintage matters less than it does for revised
 *   macro series (GDP, payrolls, etc.) — daily market closes are rarely
 *   revised — but setting it explicitly defends the IS-paper methodology and
 *   protects against future schema changes by FRED.
 *
 * Rate-limit handling:
 *   FRED limits API keys to 120 requests per 60 seconds. Our callers cache
 *   per `asOf` date so the effective rate is well below cap, but if a 429
 *   is returned we retry once after a Retry-After delay before giving up.
 *
 * Error semantics (returns empty array — silent graceful degrade):
 *   - FRED_API_KEY env var missing
 *   - HTTP 4xx other than 429 (key revoked, bad series ID, malformed range)
 *   - HTTP 5xx (FRED outage)
 *   - Network timeout (5s default)
 *   - Malformed JSON response
 *
 *   The caller treats an empty array the same as Yahoo/Polygon returning
 *   nothing — falls through to regime='ALL' (D-09 cold-start).
 *
 * @knowable_at period2 — every observation returned has `date <= period2` AND
 *   was published by `realtime_end = period2`. No forward data leakage.
 */

const FRED_BASE = 'https://api.stlouisfed.org/fred';
const FRED_TIMEOUT_MS = 5000;

export interface FredClose {
  date: Date;
  close: number;
}

interface FredObservation {
  realtime_start: string;
  realtime_end: string;
  date: string;
  /** "." indicates missing data on that date (holiday or pre-history). Always a string. */
  value: string;
}

interface FredObservationsResponse {
  observations?: FredObservation[];
  /** Present on error responses; otherwise undefined. */
  error_code?: number;
  error_message?: string;
}

/**
 * Fetch FRED daily observations for the given series in `[period1, period2]`
 * inclusive, as known on or before `period2` (vintage controls — see module
 * doc).
 *
 * Returns `[]` for any failure mode (missing key, HTTP error, malformed JSON,
 * timeout). The caller's fallback chain treats `[]` the same as Yahoo+Polygon
 * returning nothing.
 *
 * @knowable_at period2
 */
export async function fetchFredSeriesCloses(
  seriesId: string,
  period1: Date,
  period2: Date,
): Promise<FredClose[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return [];

  const obsStart = period1.toISOString().slice(0, 10);
  const obsEnd = period2.toISOString().slice(0, 10);

  // Vintage = period2: ask FRED for the database as it was known on that date.
  // For series with no revisions (like VIXCLS) this is a no-op; for revised
  // series (GDP, employment) this prevents future revisions from leaking.
  const params = new URLSearchParams({
    series_id: seriesId,
    observation_start: obsStart,
    observation_end: obsEnd,
    realtime_start: obsEnd,
    realtime_end: obsEnd,
    file_type: 'json',
    api_key: apiKey,
  });
  const url = `${FRED_BASE}/series/observations?${params.toString()}`;

  // One-retry policy: if FRED returns 429 (rate limit), back off briefly and
  // try once more. Anything else (4xx, 5xx, network) returns [] immediately.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FRED_TIMEOUT_MS) });

      if (res.status === 429 && attempt === 1) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterMs = Math.max(
          500,
          retryAfterHeader ? Number(retryAfterHeader) * 1000 : 1000,
        );
        await new Promise((r) => setTimeout(r, retryAfterMs));
        continue;
      }

      if (!res.ok) return [];

      const json = (await res.json()) as FredObservationsResponse;
      if (json.error_code !== undefined) return [];

      const out: FredClose[] = [];
      for (const o of json.observations ?? []) {
        // "." sentinel + empty + missing field → skip
        if (!o?.date || !o?.value || o.value === '.') continue;
        const close = parseFloat(o.value);
        if (!Number.isFinite(close) || close <= 0) continue;
        // FRED dates are YYYY-MM-DD UTC midnight
        const date = new Date(o.date + 'T00:00:00Z');
        if (Number.isNaN(date.getTime())) continue;
        out.push({ date, close });
      }
      return out.sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch {
      // network failure / timeout — silent graceful degrade per D-12
      return [];
    }
  }
  return [];
}
