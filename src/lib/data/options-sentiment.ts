// src/lib/data/options-sentiment.ts
// yahoo-finance2 options chain put/call ratio.
// Fetches nearest-expiry options chain (default behavior of .options()).
// Returns nulls gracefully for tickers with no options chains.
// VERIFIED: live test on AAPL returned callOI=27885, putOI=12653, ratio=0.454 (bullish).
//
// Note: Uses the yahoo-finance2 default export directly (not as a constructor) so that
// vitest module mocks can replace it cleanly in tests. In production, yahoo-finance2 v3
// exposes a pre-built singleton as its default export.
//
// Plan 19-C-04 additions (D-36):
//   fetchOptionsTermStructure(ticker) — fetches chains at 30/60/90d expiries,
//   OI-weights per-expiry put/call ratios, and classifies the IV regime via
//   implied/realized vol ratio. Old nearest-only fetchOptionsSentiment is kept
//   unchanged behind FEATURE_OPTIONS_TERM_STRUCTURE=off.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import yahooFinance from 'yahoo-finance2';

export interface OptionsSentimentResult {
  put_call_ratio: number | null;
  put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null;
}

export async function fetchOptionsSentiment(ticker: string): Promise<OptionsSentimentResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (yahooFinance as any).options(ticker);
    let totalCallOI = 0;
    let totalPutOI = 0;

    for (const chain of result.options ?? []) {
      for (const c of chain.calls ?? []) totalCallOI += c.openInterest ?? 0;
      for (const p of chain.puts ?? []) totalPutOI += p.openInterest ?? 0;
    }

    if (totalCallOI === 0) {
      return { put_call_ratio: null, put_call_interpretation: null };
    }

    const ratio = totalPutOI / totalCallOI;
    // D-11 thresholds: >1.0 = bearish, <0.5 = bullish, 0.5–1.0 = neutral
    const interpretation: 'bullish' | 'bearish' | 'neutral' =
      ratio > 1.0 ? 'bearish' :
      ratio < 0.5 ? 'bullish' :
      'neutral';

    return {
      put_call_ratio: Math.round(ratio * 1000) / 1000, // 3 decimal places
      put_call_interpretation: interpretation,
    };
  } catch {
    // Options unavailable for this ticker (common for small-caps, ETFs, crypto)
    return { put_call_ratio: null, put_call_interpretation: null };
  }
}

// ─── Plan 19-C-04: Term-structure 30/60/90d + IV regime gate (D-36) ──────────

/**
 * Term-structure summary for a ticker's options chain. All per-expiry ratios
 * use total Open Interest as the put/call denominator. `oi_weighted_avg` is
 * the OI-weighted average across the up-to-3 successful expiries:
 *
 *   oi_weighted_avg = Σ_i (p/c_i × oi_i) / Σ_i (oi_i)
 *
 * where oi_i = (callOI_i + putOI_i) at expiry i.
 *
 * `iv_realized_ratio` = mean implied vol across all contracts in fulfilled
 * chains / 30d annualized realized vol (stdev of log returns × √252).
 *
 * `iv_regime` thresholds (per D-36 / impl plan):
 *   ratio ≥ 1.3   → 'high'   (implied much higher than realized — flips put/call interpretation)
 *   0.8 ≤ ratio < 1.3 → 'normal'
 *   ratio < 0.8   → 'low'
 */
export interface TermStructure {
  put_call_30d: number | null;
  put_call_60d: number | null;
  put_call_90d: number | null;
  oi_weighted_avg: number;
  iv_regime: 'low' | 'normal' | 'high';
  iv_realized_ratio: number;
}

interface ExpirySummary {
  put_call: number;
  total_oi: number;
  ivs: number[];
}

/**
 * Reduce a single yahoo-finance2 OptionsResult to per-expiry summary.
 * Returns null if the chain has zero call OI (avoids div-by-zero) or no
 * `options[]` entries.
 */
function summarizeChain(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain: any,
): ExpirySummary | null {
  if (!chain || !Array.isArray(chain.options) || chain.options.length === 0) return null;
  let totalCallOI = 0;
  let totalPutOI = 0;
  const ivs: number[] = [];
  // yahoo-finance2 returns one entry in `options[]` per requested expiration.
  // We fold over all of them to be defensive (some tickers return a single entry).
  for (const expiry of chain.options) {
    for (const c of expiry.calls ?? []) {
      totalCallOI += c.openInterest ?? 0;
      if (typeof c.impliedVolatility === 'number' && Number.isFinite(c.impliedVolatility)) {
        ivs.push(c.impliedVolatility);
      }
    }
    for (const p of expiry.puts ?? []) {
      totalPutOI += p.openInterest ?? 0;
      if (typeof p.impliedVolatility === 'number' && Number.isFinite(p.impliedVolatility)) {
        ivs.push(p.impliedVolatility);
      }
    }
  }
  if (totalCallOI === 0) return null;
  return {
    put_call: totalPutOI / totalCallOI,
    total_oi: totalCallOI + totalPutOI,
    ivs,
  };
}

/**
 * Annualized realized vol from a daily-close series.
 *
 *   r_t = ln(close_t / close_{t-1})
 *   stdev(r) × √252
 *
 * Returns null if fewer than 2 returns or stdev is 0 (constant series).
 */
function realizedVolFromCloses(closes: number[]): number | null {
  if (!Array.isArray(closes) || closes.length < 2) return null;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (typeof prev !== 'number' || typeof curr !== 'number' || prev <= 0 || curr <= 0) continue;
    returns.push(Math.log(curr / prev));
  }
  if (returns.length < 1) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) * (r - mean), 0) / returns.length;
  const stdev = Math.sqrt(variance);
  if (stdev === 0) return null;
  return stdev * Math.sqrt(252);
}

/**
 * Classify IV regime from implied/realized ratio (D-36).
 */
function classifyRegime(ratio: number): 'low' | 'normal' | 'high' {
  if (ratio >= 1.3) return 'high';
  if (ratio < 0.8) return 'low';
  return 'normal';
}

/**
 * Plan 19-C-04 (D-36) — term-structure 30/60/90d + IV regime gate.
 *
 * Behavior:
 *   - Fetches options() at expiries roughly 30, 60, 90 calendar days out via
 *     yahoo-finance2's `date` query option.
 *   - Uses Promise.allSettled so a single expiry failure doesn't block the
 *     other two (one-of-three resilience per `<behavior>` Test 6).
 *   - Per expiry: computes p/c = totalPutOI / totalCallOI.
 *   - oi_weighted_avg = Σ(p/c_i × oi_i) / Σ(oi_i) over the successful expiries.
 *   - iv_realized_ratio = mean implied vol across all successful contracts /
 *     30-day annualized realized vol. Pulls 60 calendar days of daily closes
 *     via yahooFinance.chart() to compute realized vol.
 *   - Classifies regime per D-36 thresholds (≥1.3 high, 0.8-1.3 normal, <0.8 low).
 *   - Returns null if every expiry failed/empty (no signal at all).
 */
export async function fetchOptionsTermStructure(ticker: string): Promise<TermStructure | null> {
  const now = Date.now();
  const targets = [30, 60, 90].map((d) => new Date(now + d * 86_400_000));

  // Fetch chart in parallel with all 3 expiries — one Promise.allSettled call.
  const period1 = new Date(now - 60 * 86_400_000); // 60 calendar days back
  const period2 = new Date(now);

  const [opt30, opt60, opt90, chartRes] = await Promise.allSettled([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (yahooFinance as any).options(ticker, { date: targets[0] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (yahooFinance as any).options(ticker, { date: targets[1] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (yahooFinance as any).options(ticker, { date: targets[2] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (yahooFinance as any).chart(ticker, { period1, period2, interval: '1d' }),
  ]);

  const summaries: Array<ExpirySummary | null> = [
    opt30.status === 'fulfilled' ? summarizeChain(opt30.value) : null,
    opt60.status === 'fulfilled' ? summarizeChain(opt60.value) : null,
    opt90.status === 'fulfilled' ? summarizeChain(opt90.value) : null,
  ];

  // If every expiry failed/empty → no term-structure signal at all → null.
  if (summaries.every((s) => s === null)) return null;

  const put_call_30d = summaries[0]?.put_call ?? null;
  const put_call_60d = summaries[1]?.put_call ?? null;
  const put_call_90d = summaries[2]?.put_call ?? null;

  // OI-weighted average over successful expiries only.
  let weightedNumer = 0;
  let weightedDenom = 0;
  const allIVs: number[] = [];
  for (const s of summaries) {
    if (s === null) continue;
    weightedNumer += s.put_call * s.total_oi;
    weightedDenom += s.total_oi;
    allIVs.push(...s.ivs);
  }
  // weightedDenom == 0 would mean every successful expiry had zero OI total;
  // summarizeChain already rejects callOI==0, but be defensive.
  const oi_weighted_avg = weightedDenom > 0 ? weightedNumer / weightedDenom : 0;

  // Realized vol from the chart (if available).
  let realizedVol: number | null = null;
  if (chartRes.status === 'fulfilled') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = (chartRes.value as any)?.quotes;
    if (Array.isArray(quotes)) {
      const closes = quotes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((q: any) => q?.close)
        .filter((c: unknown): c is number => typeof c === 'number' && Number.isFinite(c));
      realizedVol = realizedVolFromCloses(closes);
    }
  }

  // Mean implied vol across all successful contracts.
  const meanIV =
    allIVs.length > 0 ? allIVs.reduce((s, v) => s + v, 0) / allIVs.length : null;

  // If we cannot compute a ratio, default to 'normal' regime with ratio = 1.
  // (We still return a valid TermStructure because put/call data is the
  // primary signal — IV regime is a gating modifier; per impl-plan stub the
  // function returns TermStructure | null only when chains are fully absent.)
  let iv_realized_ratio = 1;
  if (meanIV !== null && realizedVol !== null && realizedVol > 0) {
    iv_realized_ratio = meanIV / realizedVol;
  }
  const iv_regime = classifyRegime(iv_realized_ratio);

  return {
    put_call_30d: put_call_30d != null ? Math.round(put_call_30d * 1000) / 1000 : null,
    put_call_60d: put_call_60d != null ? Math.round(put_call_60d * 1000) / 1000 : null,
    put_call_90d: put_call_90d != null ? Math.round(put_call_90d * 1000) / 1000 : null,
    oi_weighted_avg: Math.round(oi_weighted_avg * 10000) / 10000,
    iv_regime,
    iv_realized_ratio: Math.round(iv_realized_ratio * 1000) / 1000,
  };
}

/**
 * Plan 19-C-04 — adapter that derives the legacy OptionsSentimentResult
 * shape (`put_call_ratio` + `put_call_interpretation`) from term-structure
 * output, so the source-package consumer signature is unchanged when the
 * shadow harness flips from old to new.
 *
 * D-36 IV-regime modifier: in 'high' IV regime (implied >> realized) elevated
 * put activity is interpreted as hedging rather than bearish thesis. That
 * folds the bearish bucket into 'neutral' — interpretation in 'high' regime
 * never reads as 'bearish'.
 */
export async function fetchOptionsSentimentTermStructure(
  ticker: string,
): Promise<OptionsSentimentResult> {
  const ts = await fetchOptionsTermStructure(ticker);
  if (ts === null) return { put_call_ratio: null, put_call_interpretation: null };

  const ratio = ts.oi_weighted_avg;
  let interpretation: 'bullish' | 'bearish' | 'neutral';
  if (ts.iv_regime === 'high') {
    // D-36 high-IV flip: elevated puts = hedging, not bearish thesis.
    interpretation = ratio < 0.5 ? 'bullish' : 'neutral';
  } else {
    interpretation = ratio > 1.0 ? 'bearish' : ratio < 0.5 ? 'bullish' : 'neutral';
  }

  return {
    put_call_ratio: Math.round(ratio * 1000) / 1000,
    put_call_interpretation: interpretation,
  };
}
