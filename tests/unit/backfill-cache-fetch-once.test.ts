import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// NOTE: ohlcv-cache.ts uses a module-level _memo Map. We need a fresh temp dir
// per test to get independent memo namespaces (each cacheDir gets its own map entry).
// Tests never touch ~/.cipher.

import { fetchOrLoadOhlcv, installChartCache } from '@/lib/backtest/ohlcv-cache';
import YahooFinance from 'yahoo-finance2';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cipher-ohlcv-test-'));
}

function makeFakeBar(dateStr: string, close = 100) {
  return {
    date: new Date(dateStr),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
  };
}

describe('fetchOrLoadOhlcv — fetch-once per ticker (COVERAGE-08)', () => {
  it('calls the chart spy EXACTLY once for a ticker across 3 invocations with different windows', async () => {
    const cacheDir = makeTempDir();

    const fakeBars = [
      makeFakeBar('2021-01-04', 130),
      makeFakeBar('2021-01-11', 132),
      makeFakeBar('2021-01-18', 135),
    ];

    const chartSpy = vi.fn().mockResolvedValue({ quotes: fakeBars });

    // Three separate calls simulating different asOf windows for the same ticker.
    const result1 = await fetchOrLoadOhlcv('AAPL', { chart: chartSpy, cacheDir });
    const result2 = await fetchOrLoadOhlcv('AAPL', { chart: chartSpy, cacheDir });
    const result3 = await fetchOrLoadOhlcv('AAPL', { chart: chartSpy, cacheDir });

    // The underlying chart must fire at most once — all subsequent calls hit the memo.
    expect(chartSpy).toHaveBeenCalledTimes(1);

    // All three results must have the same bars.
    expect(result1).toHaveLength(fakeBars.length);
    expect(result2).toHaveLength(fakeBars.length);
    expect(result3).toHaveLength(fakeBars.length);
  });

  it('reads from disk cache on a second instance (memo miss, disk hit)', async () => {
    const cacheDir = makeTempDir();

    const fakeBars = [makeFakeBar('2021-06-01', 145)];
    const chartSpy = vi.fn().mockResolvedValue({ quotes: fakeBars });

    // First call — writes to disk.
    await fetchOrLoadOhlcv('MSFT', { chart: chartSpy, cacheDir });
    expect(chartSpy).toHaveBeenCalledTimes(1);

    // Simulate a new process: the disk file exists but the in-process memo for
    // this ticker+dir is cold. We can't truly reset the module singleton in the
    // same test process, but we can verify the disk file exists and that a second
    // spy (different mock) would NOT be called because the file is present.
    const cacheFile = path.join(cacheDir, 'MSFT.json');
    expect(fs.existsSync(cacheFile)).toBe(true);

    const chartSpy2 = vi.fn().mockResolvedValue({ quotes: [] });
    // A fresh cacheDir means the memo is empty for that dir, so it will read disk.
    // We use a new cacheDir that already has the file pre-populated to simulate this.
    const cacheDir2 = makeTempDir();
    fs.copyFileSync(cacheFile, path.join(cacheDir2, 'MSFT.json'));

    const result = await fetchOrLoadOhlcv('MSFT', { chart: chartSpy2, cacheDir: cacheDir2 });
    // chartSpy2 must NOT have been called — disk cache was used instead.
    expect(chartSpy2).toHaveBeenCalledTimes(0);
    expect(result).toHaveLength(1);
    // Date strings are revived back to Date objects on disk read.
    expect(result[0].date).toBeInstanceOf(Date);
  });

  it('filters out bars where close is null', async () => {
    const cacheDir = makeTempDir();

    const quotesWithNulls = [
      { date: new Date('2021-01-04'), open: 130, high: 131, low: 129, close: 130, volume: 100 },
      { date: new Date('2021-01-05'), open: null, high: null, low: null, close: null, volume: 0 }, // should be dropped
      { date: new Date('2021-01-06'), open: 132, high: 133, low: 131, close: 132, volume: 200 },
    ];
    const chartSpy = vi.fn().mockResolvedValue({ quotes: quotesWithNulls });

    const result = await fetchOrLoadOhlcv('TSLA', { chart: chartSpy, cacheDir });
    // Null-close bar is filtered (T-27-07).
    expect(result).toHaveLength(2);
    expect(result.every((b) => b.close != null)).toBe(true);
  });
});

describe('installChartCache — prototype patch and restore', () => {
  it('patches YahooFinance.prototype.chart and uninstall() restores the original', async () => {
    const cacheDir = makeTempDir();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = YahooFinance.prototype as any;
    const originalChart = proto.chart;

    const { uninstall } = installChartCache({ cacheDir });

    // After install, the prototype method must have been replaced.
    expect(proto.chart).not.toBe(originalChart);

    uninstall();

    // After uninstall, the prototype method is restored.
    expect(proto.chart).toBe(originalChart);
  });

  it('the patched chart slices bars to the requested [period1, period2] window', async () => {
    const cacheDir = makeTempDir();

    // Pre-seed the disk cache with bars spanning a wide date range.
    const bars = [
      makeFakeBar('2020-01-01', 100),
      makeFakeBar('2020-06-01', 110),
      makeFakeBar('2021-01-01', 120),
      makeFakeBar('2021-06-01', 130),
      makeFakeBar('2022-01-01', 140),
    ];
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'NVDA.json'), JSON.stringify(bars));

    const { uninstall } = installChartCache({ cacheDir });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proto = YahooFinance.prototype as any;
      const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

      // Request only the 2021 window.
      const result = await proto.chart.call(yf, 'NVDA', {
        period1: new Date('2021-01-01'),
        period2: new Date('2021-12-31'),
        interval: '1d',
      });

      // Only the two bars within [2021-01-01, 2021-12-31] should be returned.
      expect(result.quotes).toHaveLength(2);
      expect(result.quotes[0].close).toBe(120);
      expect(result.quotes[1].close).toBe(130);
    } finally {
      uninstall();
    }
  });
});
