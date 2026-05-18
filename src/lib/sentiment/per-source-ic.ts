// src/lib/sentiment/per-source-ic.ts
//
// Phase 20-C-01: Per-input-source rolling 20-day cross-sectional Spearman
// IC of (bull_pct - bear_pct) against forward 7d / 30d returns. Newey-West
// HAC SE for significance; BH-FDR correction applied at the script layer.
//
// The Spearman primitive lives in src/lib/reasoning/alpha-decay-monitor.ts
// (19-A-05) — we RE-EXPORT it here. There must be ONE Spearman implementation
// across the codebase.

import { rollingSpearmanIC } from '@/lib/reasoning/alpha-decay-monitor';
import { neweyWestSE, ttestNW } from '@/lib/stats/newey-west';
import { prisma } from '@/lib/db';

/**
 * Thin re-export — keeps a single Spearman implementation across the codebase.
 * MUST NOT introduce a parallel rank-correlation function.
 */
export const spearmanIC = rollingSpearmanIC;

/**
 * Newey-West lag per forward horizon, derived from the Newey-West 1987 rule
 *   L = floor(4·(T/100)^(2/9))
 * evaluated at T = (20-day window) × (~5 sources cross-section) and biased
 * upward for the 30d horizon to account for overlapping-returns
 * autocorrelation.
 *
 * Pinned values per CONTEXT.md §20-C-01 and HYPERPARAMETERS.md.
 *
 * @param horizon  7 | 30 — forward days_after
 * @returns        Bartlett-kernel truncation lag L
 */
export function selectNeweyWestLag(horizon: 7 | 30): number {
  if (horizon === 7) return 5;
  if (horizon === 30) return 10;
  throw new Error(`selectNeweyWestLag: unsupported horizon ${horizon}`);
}

/**
 * Rolling ICIR (Information Coefficient Information Ratio).
 *
 *   ICIR = mean(IC) / sample_std(IC)        over the trailing `window` days
 *
 * Sample std uses (n-1) denominator (Bessel correction). Returns null when:
 *   - perDayIC.length < window
 *   - sample_std(IC) === 0 (constant IC — degenerate)
 *
 * @param perDayIC  daily IC series, ordered oldest → newest
 * @param window    rolling window length, default 20
 * @returns         ICIR scalar or null
 */
export function rollingICIR(
  perDayIC: number[],
  window: number = 20,
): number | null {
  if (perDayIC.length < window) return null;
  const tail = perDayIC.slice(perDayIC.length - window);
  const n = tail.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += tail[i];
  const mean = sum / n;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = tail[i] - mean;
    sumSq += d * d;
  }
  if (sumSq === 0) return null;
  const sampleStd = Math.sqrt(sumSq / (n - 1));
  if (sampleStd === 0) return null;
  return mean / sampleStd;
}

/**
 * Compute per-source IC for a single (source, horizon, asOf) tuple.
 *
 * Joins:
 *   SentimentObservation (PIT-safe via fetched_at)
 *   ⨯ PriceOutcome via the report/snapshot taken on the same fetched_at day
 *
 * Per-day cross-sectional Spearman IC across all tickers in the source on
 * that day, then aggregated over the trailing 20-day window. Newey-West SE
 * applied to the residual series (IC_t - mean(IC)). p-value via ttestNW.
 *
 * Returns null and writes ZERO rows when:
 *   - distinct fetched_at days in window < 20 (cold-start; per CONTEXT.md spec)
 *   - cross-sectional N per day < 5 (Spearman unstable below this) for EVERY day
 *
 * @param source_id  e.g. 'stocktwits' | 'reddit' | 'x' | 'twitter' | 'news' | 'apewisdom' | 'hackernews'
 * @param horizon    7 | 30 — forward days_after
 * @param asOf       cutoff date (exclusive); rolling 20-day window ends here
 */
export async function computePerSourceIC(
  source_id: string,
  horizon: 7 | 30,
  asOf: Date,
): Promise<{
  ic_20d: number;
  icir_20d: number | null;
  ic_se_nw: number;
  ic_p_value_nw: number;
  n_observations: number;
  nw_lag: number;
} | null> {
  const N_MIN = 20;
  const N_CROSS_MIN = 5;

  const windowStart = new Date(asOf.getTime() - N_MIN * 24 * 60 * 60 * 1000);

  // PIT-INVARIANT — join on fetched_at, NEVER published_at (enforced by 20-Z-07).
  const observations = await prisma.sentimentObservation.findMany({
    where: {
      source: source_id,
      fetched_at: {
        gte: windowStart,
        lt: asOf,
      },
    },
    select: {
      ticker: true,
      fetched_at: true,
      classifier_score: true,
    },
  });

  if (observations.length === 0) return null;

  // Group observations by (day, ticker), averaging classifier_score per ticker
  // per day. The aggregator's published (bull_pct - bear_pct) proxy is the
  // mean classifier_score across messages on that day for that ticker.
  type DayKey = string; // YYYY-MM-DD
  const perDayPerTicker = new Map<DayKey, Map<string, { sum: number; count: number }>>();
  for (const obs of observations) {
    if (obs.classifier_score == null || !Number.isFinite(obs.classifier_score)) continue;
    const day = obs.fetched_at.toISOString().slice(0, 10);
    let dayMap = perDayPerTicker.get(day);
    if (!dayMap) {
      dayMap = new Map();
      perDayPerTicker.set(day, dayMap);
    }
    const entry = dayMap.get(obs.ticker) ?? { sum: 0, count: 0 };
    entry.sum += obs.classifier_score;
    entry.count += 1;
    dayMap.set(obs.ticker, entry);
  }

  const distinctDays = Array.from(perDayPerTicker.keys()).sort();
  if (distinctDays.length < N_MIN) {
    return null;
  }

  // For each day, look up forward returns for that day's tickers.
  // Strategy: fetch all relevant PriceOutcome rows in one query, then filter by
  // (snapshot_or_report -> recorded_at + days_after = forward) on the JS side.
  //
  // We approximate "forward return" via PriceOutcome.pct_change at days_after =
  // horizon, indexed by the snapshot/report's analyzed_at / scanned_at date.
  // For the per-source-ic backtest, we treat (ticker, fetched_at day) as a
  // proxy for the snapshot. Rather than re-snapshot for this metric, we
  // accept PriceOutcome rows in the window and join the closest one for each
  // (ticker, fetched_at day).
  //
  // For simplicity and PIT-safety, we fetch all relevant PriceOutcome rows for
  // these tickers in the window + horizon. Mock callers in unit tests don't
  // need PriceOutcome — they just exercise the cold-start / NMIN branches.
  const tickerSet = new Set<string>();
  for (const dayMap of perDayPerTicker.values()) {
    for (const t of dayMap.keys()) tickerSet.add(t);
  }

  const horizonMs = horizon * 24 * 60 * 60 * 1000;
  const recordedUpper = new Date(asOf.getTime() + horizonMs);

  // PIT-INVARIANT — outcomes joined via recorded_at + days_after, NOT published_at.
  const outcomes = await prisma.priceOutcome.findMany({
    where: {
      days_after: horizon,
      recorded_at: {
        gte: windowStart,
        lte: recordedUpper,
      },
    },
    select: {
      pct_change: true,
      recorded_at: true,
      report: { select: { ticker: true, analyzed_at: true } },
      snapshot: { select: { ticker: true, scanned_at: true } },
    },
  });

  // Index outcomes by (ticker, day-of-snapshot/report).
  // recorded_at = origin + days_after; origin day = recorded_at - days_after.
  type OutcomeKey = string;
  const outcomeByTickerDay = new Map<OutcomeKey, number>();
  for (const o of outcomes) {
    const ticker = o.report?.ticker ?? o.snapshot?.ticker;
    if (!ticker) continue;
    const originAt =
      o.report?.analyzed_at ??
      o.snapshot?.scanned_at ??
      new Date(o.recorded_at.getTime() - horizonMs);
    const day = originAt.toISOString().slice(0, 10);
    outcomeByTickerDay.set(`${ticker}__${day}`, o.pct_change);
  }

  // Per-day cross-sectional Spearman IC.
  const perDayIC: number[] = [];
  for (const day of distinctDays) {
    const dayMap = perDayPerTicker.get(day);
    if (!dayMap) continue;
    const predictions: number[] = [];
    const realized: number[] = [];
    for (const [ticker, entry] of dayMap.entries()) {
      const score = entry.sum / entry.count;
      const outcome = outcomeByTickerDay.get(`${ticker}__${day}`);
      if (outcome == null || !Number.isFinite(outcome)) continue;
      predictions.push(score);
      realized.push(outcome);
    }
    if (predictions.length < N_CROSS_MIN) continue;
    const ic = spearmanIC({ predictions, realizedReturns: realized });
    if (Number.isFinite(ic)) perDayIC.push(ic);
  }

  if (perDayIC.length === 0) return null;
  if (perDayIC.length < N_MIN) {
    // Fewer than 20 days met the cross-sectional N>=5 floor.
    return null;
  }

  // Aggregate.
  let icSum = 0;
  for (const v of perDayIC) icSum += v;
  const ic_20d = icSum / perDayIC.length;

  const icir_20d = rollingICIR(perDayIC, Math.min(N_MIN, perDayIC.length));

  // Newey-West SE on the residual series (IC_t - mean(IC)).
  const residuals = perDayIC.map((v) => v - ic_20d);
  const nw_lag = selectNeweyWestLag(horizon);
  const safeLag = Math.min(nw_lag, residuals.length - 1);
  const se_raw = neweyWestSE(residuals, safeLag);
  // Convert per-observation SE to mean SE via /sqrt(n).
  const ic_se_nw = se_raw / Math.sqrt(perDayIC.length);
  const ic_p_value_nw = ttestNW(ic_20d, ic_se_nw, perDayIC.length - 1);

  return {
    ic_20d,
    icir_20d,
    ic_se_nw,
    ic_p_value_nw,
    n_observations: perDayIC.length,
    nw_lag,
  };
}
