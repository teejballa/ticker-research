// src/lib/data/technical.ts
// Phase 16-01 — Technical-analysis sensor (pure compute layer).
//
// Exports:
//   - fetchOhlcv(ticker, asOf?): ~1y of daily OHLCV bars from yahoo-finance2.
//   - computeTechnicalSnapshot(ticker, asOf?): full TechnicalSnapshot or null on failure.
//   - classifyTechPattern(snap, currentClose, sma50Yest, sma200Yest): 1-of-8 TechPattern.
//
// Downstream plans (16-02 schema, 16-03 cron writer, 16-04 engine-context, 16-05 backfill)
// all consume these signatures. Do not change the function contracts without updating those
// plans. The 8 TechPattern literals are LOCKED — see src/lib/types.ts.
//
// Indicator API gotchas (per 16-RESEARCH.md §3.1 and Pitfalls 1, 7):
//   - technicalindicators output arrays are TRUNCATED, not padded. Always read [length-1].
//   - MACD warmup leaves `signal`/`histogram` as `undefined` for early bars — coerce to null.
//   - yahoo-finance2 OHLCV fields can be `null` — drop affected bars BEFORE calling ATR.
//   - volume === 0 is a halt-day; exclude from 20d avg AND null out volume_ratio when latest.
//   - SMA(200) needs ≥ 200 bars; insufficient bars → sma_200 = null AND tech_pattern = null.

import { RSI, MACD, SMA, ATR } from 'technicalindicators';
import YahooFinance from 'yahoo-finance2';
import type { TechPattern, TechnicalSnapshot } from '@/lib/types';

// yahoo-finance2 v3 requires instantiation (matches src/lib/data/yahoo.ts)
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ---------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------

export interface OhlcvBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------------
// fetchOhlcv — yahoo-finance2.chart() wrapper with null/zero filtering
// ---------------------------------------------------------------------------------

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Fetch ~1y of daily OHLCV bars for a ticker via yahoo-finance2.chart().
 * Drops bars where ANY of high/low/close is null (technicalindicators does not handle nulls).
 * Returns [] on fetch failure — caller treats empty array as "no data".
 *
 * @param asOf optional clock anchor used by the backfill driver in 16-05.
 *   period1 = asOf - 365d, period2 = asOf. Defaults to now.
 */
export async function fetchOhlcv(ticker: string, asOf?: Date): Promise<OhlcvBar[]> {
  const period2 = asOf ?? new Date();
  const period1 = new Date(period2.getTime() - ONE_YEAR_MS);

  let raw: { quotes?: Array<Record<string, unknown>> } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw = (await (yahooFinance as any).chart(ticker, {
      period1,
      period2,
      interval: '1d',
    })) as { quotes?: Array<Record<string, unknown>> };
  } catch (err) {
    // Real network/parse errors → log so a silent SDK regression doesn't hide
    // itself behind a clean empty array (caller still treats [] as "no data").
    console.warn(`[technical] fetchOhlcv(${ticker}) failed:`, (err as Error)?.message ?? err);
    return [];
  }

  const quotes = raw?.quotes ?? [];
  const bars: OhlcvBar[] = [];

  for (const q of quotes) {
    const high = q.high as number | null | undefined;
    const low = q.low as number | null | undefined;
    const close = q.close as number | null | undefined;
    const open = q.open as number | null | undefined;
    const volume = q.volume as number | null | undefined;
    const date = q.date as Date | undefined;

    // Drop bars where any of the indicator-critical fields is null/undefined.
    if (high == null || low == null || close == null || open == null || date == null) {
      continue;
    }
    bars.push({
      date,
      open,
      high,
      low,
      close,
      volume: volume ?? 0,
    });
  }

  return bars;
}

// ---------------------------------------------------------------------------------
// classifyTechPattern — pure 8-bucket classifier
// ---------------------------------------------------------------------------------

/**
 * Pure function. Given a fully-populated TechnicalSnapshot (sans tech_pattern),
 * the current close, and yesterday's sma_50/sma_200 (for cross detection), returns
 * exactly one of the 8 TechPattern literals — or null when bar_count < 200.
 *
 * Priority order (first match wins) — see plan 16-01 §action.11:
 *   1. bar_count < 200                                                     → null
 *   2. golden_cross (sma50_today > sma200 AND sma50_yest <= sma200_yest)   → 'golden_cross'
 *   3. death_cross  (sma50_today < sma200 AND sma50_yest >= sma200_yest)   → 'death_cross'
 *   4. price > sma_50 AND price > sma_200 (uptrend stack):
 *        a. RSI > 70                                                       → 'overbought_uptrend'
 *        b. MACD hist > 0 AND volume_ratio > 1.5                           → 'breakout_uptrend'
 *        c. RSI in [40, 55]                                                → 'pullback_in_uptrend'
 *        d. otherwise                                                      → 'consolidation'
 *   5. price < sma_50 AND price < sma_200 (downtrend stack):
 *        a. RSI < 30                                                       → 'oversold_downtrend'
 *        b. otherwise                                                      → 'breakdown'
 *   6. mixed stack (above50 XOR above200)                                  → 'consolidation'
 */
export function classifyTechPattern(
  snap: Omit<TechnicalSnapshot, 'tech_pattern'>,
  currentClose: number,
  sma50Yesterday: number | null,
  sma200Yesterday: number | null,
): TechPattern | null {
  // Rule 1: insufficient bars.
  if (snap.bar_count < 200) return null;

  const { sma_50, sma_200, rsi_14, macd_histogram, volume_ratio } = snap;

  // Rules 2 + 3: cross states (require both today's and yesterday's SMAs).
  if (sma_50 != null && sma_200 != null && sma50Yesterday != null && sma200Yesterday != null) {
    if (sma_50 > sma_200 && sma50Yesterday <= sma200Yesterday) return 'golden_cross';
    if (sma_50 < sma_200 && sma50Yesterday >= sma200Yesterday) return 'death_cross';
  }

  const above50 = sma_50 != null && currentClose > sma_50;
  const above200 = sma_200 != null && currentClose > sma_200;

  // Rule 4: full uptrend stack.
  if (above50 && above200) {
    if (rsi_14 != null && rsi_14 > 70) return 'overbought_uptrend';
    if (
      macd_histogram != null &&
      macd_histogram > 0 &&
      volume_ratio != null &&
      volume_ratio > 1.5
    ) {
      return 'breakout_uptrend';
    }
    if (rsi_14 != null && rsi_14 >= 40 && rsi_14 <= 55) return 'pullback_in_uptrend';
    return 'consolidation';
  }

  // Rule 5: full downtrend stack.
  if (!above50 && !above200) {
    if (rsi_14 != null && rsi_14 < 30) return 'oversold_downtrend';
    return 'breakdown';
  }

  // Rule 6: mixed stack — fall through to consolidation.
  return 'consolidation';
}

// ---------------------------------------------------------------------------------
// computeTechnicalSnapshot — top-level entry point
// ---------------------------------------------------------------------------------

/**
 * Returns a TechnicalSnapshot for `ticker`, or null if no usable bars were fetched.
 *
 * Best-effort: never throws on the hot path. If yahoo fails, returns null.
 * If bars exist but bar_count < 200, returns a snapshot with sma_200 = null and
 * tech_pattern = null (other indicators populated where their warmup permits).
 */
export async function computeTechnicalSnapshot(
  ticker: string,
  asOf?: Date,
): Promise<TechnicalSnapshot | null> {
  let bars: OhlcvBar[] = [];
  try {
    bars = await fetchOhlcv(ticker, asOf);
  } catch {
    return null;
  }

  if (bars.length === 0) return null;

  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  const bar_count = bars.length;
  const todayBar = bars[bars.length - 1];
  const todayVolume = todayBar.volume;

  // ---- Indicators ----------------------------------------------------------
  // Each call is wrapped: if input is too short for the indicator's warmup, the
  // library returns []. Reading [length-1] of [] yields undefined → null below.

  const rsiArr = RSI.calculate({ period: 14, values: closes });
  const rsi_14 = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : null;

  const macdArr = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const macdLast = macdArr.length > 0 ? macdArr[macdArr.length - 1] : undefined;
  const macd_line = macdLast?.MACD ?? null;
  const macd_signal = macdLast?.signal ?? null;
  const macd_histogram = macdLast?.histogram ?? null;

  const sma50Arr = closes.length >= 50 ? SMA.calculate({ period: 50, values: closes }) : [];
  const sma_50 = sma50Arr.length > 0 ? sma50Arr[sma50Arr.length - 1] : null;
  const sma50_yesterday = sma50Arr.length >= 2 ? sma50Arr[sma50Arr.length - 2] : null;

  const sma200Arr = closes.length >= 200 ? SMA.calculate({ period: 200, values: closes }) : [];
  const sma_200 = sma200Arr.length > 0 ? sma200Arr[sma200Arr.length - 1] : null;
  const sma200_yesterday = sma200Arr.length >= 2 ? sma200Arr[sma200Arr.length - 2] : null;

  const atrArr =
    closes.length > 14 ? ATR.calculate({ period: 14, high: highs, low: lows, close: closes }) : [];
  const atr_14 = atrArr.length > 0 ? atrArr[atrArr.length - 1] : null;

  // ---- Volume aggregates ---------------------------------------------------
  // 20d avg from the trailing 20 bars, excluding any with volume === 0 (halts).
  // If fewer than 5 valid (non-zero) volume samples remain, treat avg as null.
  const trailing20 = bars.slice(-20);
  const nonZeroVols = trailing20.filter((b) => b.volume > 0).map((b) => b.volume);
  let avg_volume_20d: number | null = null;
  if (nonZeroVols.length >= 5) {
    avg_volume_20d = nonZeroVols.reduce((acc, v) => acc + v, 0) / nonZeroVols.length;
  }

  // volume_ratio: null when today's bar is a halt OR avg unavailable.
  let volume_ratio: number | null = null;
  if (todayVolume > 0 && avg_volume_20d != null && avg_volume_20d > 0) {
    volume_ratio = todayVolume / avg_volume_20d;
  }

  // ---- Regime derivations --------------------------------------------------
  const currentClose = todayBar.close;

  let trend_regime: TechnicalSnapshot['trend_regime'];
  if (sma_50 == null || sma_200 == null) {
    trend_regime = 'unknown';
  } else if (currentClose > sma_50 && sma_50 > sma_200) {
    trend_regime = 'uptrend';
  } else if (currentClose < sma_50 && sma_50 < sma_200) {
    trend_regime = 'downtrend';
  } else {
    trend_regime = 'sideways';
  }

  let momentum_regime: TechnicalSnapshot['momentum_regime'];
  if (rsi_14 == null) {
    momentum_regime = 'unknown';
  } else if (rsi_14 > 70) {
    momentum_regime = 'overbought';
  } else if (rsi_14 < 30) {
    momentum_regime = 'oversold';
  } else {
    momentum_regime = 'neutral';
  }

  // cross_state: detected from same series — uses the last two SMA values.
  let cross_state: TechnicalSnapshot['cross_state'] = 'none';
  if (
    sma_50 != null &&
    sma_200 != null &&
    sma50_yesterday != null &&
    sma200_yesterday != null
  ) {
    if (sma_50 > sma_200 && sma50_yesterday <= sma200_yesterday) {
      cross_state = 'golden_cross';
    } else if (sma_50 < sma_200 && sma50_yesterday >= sma200_yesterday) {
      cross_state = 'death_cross';
    }
  }

  // ---- Snapshot assembly ---------------------------------------------------
  // SMA(200) needs ≥ 200 bars; if not met, sma_200 stays null and so does tech_pattern.
  const baseSnap: Omit<TechnicalSnapshot, 'tech_pattern'> = {
    rsi_14,
    macd_line,
    macd_signal,
    macd_histogram,
    sma_50,
    sma_200,
    atr_14,
    avg_volume_20d,
    volume_ratio,
    trend_regime,
    momentum_regime,
    cross_state,
    bar_count,
    computed_at: new Date().toISOString(),
    data_source: 'yahoo',
  };

  const tech_pattern = classifyTechPattern(
    baseSnap,
    currentClose,
    sma50_yesterday,
    sma200_yesterday,
  );

  return { ...baseSnap, tech_pattern };
}
