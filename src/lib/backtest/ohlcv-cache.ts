// src/lib/backtest/ohlcv-cache.ts
// Phase 27 D-07/COVERAGE-08 — Disk-cached fetch-once mechanism for backfill.
//
// Purpose: Each ticker's full 5-year OHLCV is fetched from Yahoo exactly once per
// backfill run. Subsequent calls (driven by per-window computeTechnicalSnapshot
// invocations) hit the in-process memo map first, then the disk cache — zero
// extra Yahoo calls.
//
// The prototype-level intercept (installChartCache) patches YahooFinance.prototype.chart
// BEFORE technical.ts loads, so the module-scope `new YahooFinance(...)` instance
// inside technical.ts is also covered — without any edit to technical.ts.
// This is the critical mechanism from RESEARCH Pitfall 3.
//
// Design: fetchOrLoadOhlcv accepts injectable deps ({ chart, cacheDir }) for
// unit-testability — tests supply a spy chart + temp dir without touching ~/.cipher.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import YahooFinance from 'yahoo-finance2';

// Default cache dir lives outside the repo — never enters git or Vercel bundle (T-27-08).
const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.cipher', 'backfill-cache');
const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export interface OhlcvBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Injectable seam for testability (spy chart fn + temp cacheDir). */
export interface FetchOrLoadDeps {
  /** chart function — defaults to the real YahooFinance.prototype.chart. */
  chart?: (
    sym: string,
    opts: { period1: Date; period2: Date; interval: string },
  ) => Promise<{ quotes?: Array<Record<string, unknown>> }>;
  /** Cache directory — defaults to ~/.cipher/backfill-cache */
  cacheDir?: string;
}

// In-process memo: { cacheDir → { ticker → bars[] } }
// Keyed by cacheDir so tests using temp dirs get independent memos.
const _memo = new Map<string, Map<string, OhlcvBar[]>>();

function getMemoForDir(cacheDir: string): Map<string, OhlcvBar[]> {
  let m = _memo.get(cacheDir);
  if (!m) {
    m = new Map<string, OhlcvBar[]>();
    _memo.set(cacheDir, m);
  }
  return m;
}

/**
 * Fetch or load the full ~5y daily OHLCV for `ticker`.
 *
 * Order of preference:
 *   1. In-process memo (same ticker, same run)
 *   2. Disk cache at `cacheDir/<ticker>.json`
 *   3. Real Yahoo chart() call (stores result to disk + memo)
 *
 * Returns bars where `close != null`. Date strings in the cache file are
 * revived to Date objects on read.
 */
export async function fetchOrLoadOhlcv(
  ticker: string,
  deps?: FetchOrLoadDeps,
): Promise<OhlcvBar[]> {
  const cacheDir = deps?.cacheDir ?? DEFAULT_CACHE_DIR;
  const memo = getMemoForDir(cacheDir);

  // 1. In-process memo hit (concurrent windows of the same ticker share one fetch).
  if (memo.has(ticker)) {
    return memo.get(ticker)!;
  }

  const cacheFile = path.join(cacheDir, `${ticker}.json`);

  // 2. Disk cache hit.
  if (fs.existsSync(cacheFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as Array<Record<string, unknown>>;
      const bars: OhlcvBar[] = raw.map((b) => ({
        date: new Date(b.date as string),
        open: b.open as number,
        high: b.high as number,
        low: b.low as number,
        close: b.close as number,
        volume: (b.volume as number) ?? 0,
      }));
      memo.set(ticker, bars);
      return bars;
    } catch {
      // Corrupt cache file — fall through to re-fetch.
    }
  }

  // 3. Network fetch — exactly ONE chart() call per ticker per run.
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - FIVE_YEARS_MS);

  const chartFn =
    deps?.chart ??
    ((sym: string, opts: { period1: Date; period2: Date; interval: string }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (YahooFinance.prototype.chart as any).call(
        new YahooFinance({ suppressNotices: ['yahooSurvey'] }),
        sym,
        opts,
      ));

  let rawResult: { quotes?: Array<Record<string, unknown>> } = {};
  try {
    rawResult = await chartFn(ticker, { period1, period2, interval: '1d' });
  } catch {
    memo.set(ticker, []);
    return [];
  }

  const quotes = rawResult?.quotes ?? [];
  const bars: OhlcvBar[] = [];
  for (const q of quotes) {
    const close = q.close as number | null | undefined;
    if (close == null) continue; // T-27-07: filter null close bars
    const high = q.high as number | null | undefined;
    const low = q.low as number | null | undefined;
    const open = q.open as number | null | undefined;
    const dateRaw = q.date;
    if (high == null || low == null || open == null || dateRaw == null) continue;
    bars.push({
      date: dateRaw instanceof Date ? dateRaw : new Date(dateRaw as string),
      open: open,
      high: high,
      low: low,
      close: close,
      volume: (q.volume as number) ?? 0,
    });
  }

  // Write to disk cache ONLY when the fetch actually returned data. Persisting an
  // empty array poisons resume: a transient Yahoo soft-block (0 bars) would be
  // cached and every later run would read the empty file instead of re-fetching.
  // On 0 bars we cache nothing and do not memo — the next run re-fetches.
  if (bars.length > 0) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(bars));
    memo.set(ticker, bars);
  }
  return bars;
}

/**
 * Installs a prototype-level intercept on YahooFinance.prototype.chart.
 *
 * After this call, every YahooFinance instance (including the module-scope one
 * in technical.ts) will route chart() calls through fetchOrLoadOhlcv — fetching
 * the full 5y window once, caching it, then slicing to the requested [period1,period2]
 * window for the caller.
 *
 * Returns an uninstall() function (used by tests to restore the original).
 */
export function installChartCache(opts?: { cacheDir?: string }): { uninstall: () => void } {
  const cacheDir = opts?.cacheDir ?? DEFAULT_CACHE_DIR;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = YahooFinance.prototype as any;
  const _orig = proto.chart as (
    sym: string,
    opts: { period1: Date | string; period2: Date | string; interval: string },
  ) => Promise<{ quotes?: Array<Record<string, unknown>> }>;

  proto.chart = async function (
    sym: string,
    chartOpts: { period1: Date | string; period2: Date | string; interval: string },
  ) {
    // Load or fetch the full ticker history using the injected originalchart as fallback.
    const all = await fetchOrLoadOhlcv(String(sym), {
      chart: (s, o) => _orig.call(this, s, o),
      cacheDir,
    });

    // Slice to the requested [period1, period2] window.
    const p1 = new Date(chartOpts.period1).getTime();
    const p2 = new Date(chartOpts.period2).getTime();
    return { quotes: all.filter((b) => b.date.getTime() >= p1 && b.date.getTime() <= p2) };
  };

  return {
    uninstall: () => {
      proto.chart = _orig;
    },
  };
}
