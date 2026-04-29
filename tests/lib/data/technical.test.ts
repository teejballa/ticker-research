// tests/lib/data/technical.test.ts
// Phase 16-01: Unit suite for the technical-analysis sensor.
// Covers RSI/MACD/SMA/ATR math + 8-bucket classifier + edge cases per
// .planning/phases/16-technical-analysis/16-RESEARCH.md §3 / Pitfalls 1, 7.
//
// All 8 TechPattern literals MUST be reachable via the classifier tests below.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RSI, MACD, SMA, ATR } from 'technicalindicators';
import type { TechnicalSnapshot } from '@/lib/types';

// --- Mock yahoo-finance2 BEFORE the SUT is imported -------------------------------
// yahoo-finance2 v3 exports a class default — module imports do `new YahooFinance(opts)`.
// The mock must expose a constructor whose instances share a single `chart` spy so
// tests can drive the return value via mockChart. vi.hoisted() lets us share the
// spy reference with the hoisted vi.mock() factory.
const { mockChart } = vi.hoisted(() => ({ mockChart: vi.fn() }));
vi.mock('yahoo-finance2', () => ({
  default: vi.fn().mockImplementation(() => ({
    chart: mockChart,
  })),
}));

import {
  fetchOhlcv,
  computeTechnicalSnapshot,
  classifyTechPattern,
  type OhlcvBar,
} from '@/lib/data/technical';

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Synthetic OHLCV builders ---------------------------------------------------

function makeBars(
  closes: number[],
  opts: { volume?: number; highOffset?: number; lowOffset?: number } = {},
): OhlcvBar[] {
  const { volume = 1_000_000, highOffset = 1, lowOffset = 1 } = opts;
  const start = new Date('2025-01-01T00:00:00Z').getTime();
  return closes.map((close, i) => ({
    date: new Date(start + i * 86_400_000),
    open: close,
    high: close + highOffset,
    low: close - lowOffset,
    close,
    volume,
  }));
}

function makeSnapshotBase(overrides: Partial<TechnicalSnapshot> = {}): Omit<TechnicalSnapshot, 'tech_pattern'> {
  return {
    rsi_14: 50,
    macd_line: 0,
    macd_signal: 0,
    macd_histogram: 0,
    sma_50: 100,
    sma_200: 100,
    atr_14: 1,
    avg_volume_20d: 1_000_000,
    volume_ratio: 1,
    trend_regime: 'sideways',
    momentum_regime: 'neutral',
    cross_state: 'none',
    bar_count: 250,
    computed_at: new Date().toISOString(),
    data_source: 'yahoo',
    ...overrides,
  };
}

// =================================================================================
// SECTION A: Indicator math (Tests 1–7)
// =================================================================================

describe('technicalindicators math (sanity, library contract)', () => {
  it('Test 1 — RSI on 250 monotonically-rising closes is overbought (> 70)', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i);
    const rsi = RSI.calculate({ period: 14, values: closes });
    const last = rsi[rsi.length - 1];
    expect(last).toBeGreaterThan(70);
  });

  it('Test 2 — RSI on 250 monotonically-falling closes is oversold (< 30)', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 1000 - i);
    const rsi = RSI.calculate({ period: 14, values: closes });
    const last = rsi[rsi.length - 1];
    expect(last).toBeLessThan(30);
  });

  it('Test 3 — RSI(14) output is TRUNCATED, not padded — length 250 in → length 236 out (Pitfall 1)', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i);
    const rsi = RSI.calculate({ period: 14, values: closes });
    expect(rsi.length).toBe(236);
    // Reading [length-1] yields the most recent value, never undefined.
    expect(rsi[rsi.length - 1]).toBeTypeOf('number');
  });

  it('Test 4 — MACD warmup: first entry has no signal/histogram; impl must coerce undefined → null', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i);
    const macd = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    expect(macd[0].signal).toBeUndefined();
    expect(macd[0].histogram).toBeUndefined();
    // Latest entry has all three populated (warmup is past).
    const last = macd[macd.length - 1];
    expect(last.MACD).toBeTypeOf('number');
    expect(last.signal).toBeTypeOf('number');
    expect(last.histogram).toBeTypeOf('number');
  });

  it('Test 5 — SMA(50) and SMA(200) lengths are closes.length - 49 and - 199', () => {
    const closes = Array.from({ length: 250 }, (_, i) => i + 1);
    const sma50 = SMA.calculate({ period: 50, values: closes });
    const sma200 = SMA.calculate({ period: 200, values: closes });
    expect(sma50.length).toBe(closes.length - 49);
    expect(sma200.length).toBe(closes.length - 199);
    // First SMA50 value = mean of [1..50] = 25.5
    expect(sma50[0]).toBeCloseTo(25.5, 6);
  });

  it('Test 6 — ATR(14) yields one value per bar past warmup (length = bars - 14)', () => {
    const closes = Array.from({ length: 100 }, (_, i) => 100 + i);
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const atr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    expect(atr.length).toBe(closes.length - 14);
    expect(atr[atr.length - 1]).toBeGreaterThan(0);
  });

  it('Test 7 — volume halt: today_volume === 0 → volume_ratio === null', async () => {
    // 250 normal-volume bars + 1 final halt bar
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i);
    const bars = makeBars(closes, { volume: 1_000_000 });
    bars[bars.length - 1].volume = 0; // today: halted
    mockChart.mockResolvedValueOnce({ quotes: bars });

    const snap = await computeTechnicalSnapshot('HALTED');
    expect(snap).not.toBeNull();
    expect(snap!.volume_ratio).toBeNull();
  });
});

// =================================================================================
// SECTION B: 8-bucket classifier — every bucket must be reachable (Tests 8–15)
// =================================================================================

describe('classifyTechPattern — every TechPattern literal is reachable', () => {
  it('Test 8 — golden_cross: SMA50 yesterday <= SMA200 yesterday AND SMA50 today > SMA200 today', () => {
    const snap = makeSnapshotBase({ sma_50: 105, sma_200: 100 });
    const out = classifyTechPattern(snap, 110, /*sma50_yest*/ 99, /*sma200_yest*/ 100);
    expect(out).toBe('golden_cross');
  });

  it('Test 9 — death_cross: SMA50 yesterday >= SMA200 yesterday AND SMA50 today < SMA200 today', () => {
    const snap = makeSnapshotBase({ sma_50: 95, sma_200: 100 });
    const out = classifyTechPattern(snap, 90, /*sma50_yest*/ 101, /*sma200_yest*/ 100);
    expect(out).toBe('death_cross');
  });

  it('Test 10 — overbought_uptrend: RSI > 70 AND price > SMA200 AND no cross', () => {
    const snap = makeSnapshotBase({
      rsi_14: 75,
      sma_50: 100,
      sma_200: 90,
      macd_histogram: 0,
      volume_ratio: 1,
    });
    const out = classifyTechPattern(snap, 110, /*sma50_y*/ 100, /*sma200_y*/ 90);
    expect(out).toBe('overbought_uptrend');
  });

  it('Test 11 — oversold_downtrend: RSI < 30 AND price < SMA200 AND no cross', () => {
    const snap = makeSnapshotBase({
      rsi_14: 25,
      sma_50: 100,
      sma_200: 110,
      macd_histogram: 0,
      volume_ratio: 1,
    });
    const out = classifyTechPattern(snap, 90, /*sma50_y*/ 100, /*sma200_y*/ 110);
    expect(out).toBe('oversold_downtrend');
  });

  it('Test 12 — breakout_uptrend: MACD hist > 0 AND volume_ratio > 1.5 AND price > SMA50/200 AND not overbought', () => {
    const snap = makeSnapshotBase({
      rsi_14: 60, // not > 70 (not overbought)
      sma_50: 100,
      sma_200: 90,
      macd_histogram: 0.8,
      volume_ratio: 2.1,
    });
    const out = classifyTechPattern(snap, 110, /*sma50_y*/ 100, /*sma200_y*/ 90);
    expect(out).toBe('breakout_uptrend');
  });

  it('Test 13 — pullback_in_uptrend: price > SMA200 AND price > SMA50 AND RSI in [40, 55]', () => {
    const snap = makeSnapshotBase({
      rsi_14: 47,
      sma_50: 100,
      sma_200: 90,
      macd_histogram: -0.1, // not breakout
      volume_ratio: 0.8,
    });
    const out = classifyTechPattern(snap, 105, /*sma50_y*/ 100, /*sma200_y*/ 90);
    expect(out).toBe('pullback_in_uptrend');
  });

  it('Test 14 — breakdown: price < SMA50 AND price < SMA200 AND RSI >= 30', () => {
    const snap = makeSnapshotBase({
      rsi_14: 45,
      sma_50: 100,
      sma_200: 110,
      macd_histogram: -0.5,
      volume_ratio: 1,
    });
    const out = classifyTechPattern(snap, 90, /*sma50_y*/ 100, /*sma200_y*/ 110);
    expect(out).toBe('breakdown');
  });

  it('Test 15 — consolidation: fallback inside an uptrend with no other rule matching', () => {
    // Above SMA50/200, RSI not extreme (60, outside [40,55]), no breakout, no cross.
    const snap = makeSnapshotBase({
      rsi_14: 60,
      sma_50: 100,
      sma_200: 90,
      macd_histogram: 0.2, // positive but volume_ratio is low → not breakout
      volume_ratio: 1.0,
    });
    const out = classifyTechPattern(snap, 105, /*sma50_y*/ 100, /*sma200_y*/ 90);
    expect(out).toBe('consolidation');
  });

  it('Test 15b — consolidation also covers mixed stack (price > SMA50 XOR price > SMA200)', () => {
    const snap = makeSnapshotBase({
      rsi_14: 50,
      sma_50: 100,
      sma_200: 120, // price 105 > sma_50 but < sma_200 — mixed
      macd_histogram: 0,
      volume_ratio: 1,
    });
    const out = classifyTechPattern(snap, 105, /*sma50_y*/ 100, /*sma200_y*/ 120);
    expect(out).toBe('consolidation');
  });
});

// =================================================================================
// SECTION C: Insufficient bars + best-effort error handling (Tests 16–17)
// =================================================================================

describe('insufficient-data and error paths', () => {
  it('Test 16 — bar_count < 200: tech_pattern = null AND sma_200 = null, no throw', async () => {
    // Only 150 bars — SMA(200) cannot warm up.
    const closes = Array.from({ length: 150 }, (_, i) => 100 + i);
    const bars = makeBars(closes);
    mockChart.mockResolvedValueOnce({ quotes: bars });

    const snap = await computeTechnicalSnapshot('SHORT');
    expect(snap).not.toBeNull();
    expect(snap!.bar_count).toBe(150);
    expect(snap!.sma_200).toBeNull();
    expect(snap!.tech_pattern).toBeNull();
    // SMA(50) still has data.
    expect(snap!.sma_50).toBeTypeOf('number');
  });

  it('Test 16b — classifyTechPattern returns null when bar_count < 200 directly', () => {
    const snap = makeSnapshotBase({ bar_count: 50, sma_200: null });
    const out = classifyTechPattern(snap, 100, null, null);
    expect(out).toBeNull();
  });

  it('Test 17 — fetchOhlcv throws → computeTechnicalSnapshot returns null (best-effort, no throw)', async () => {
    mockChart.mockRejectedValueOnce(new Error('yahoo down'));
    const snap = await computeTechnicalSnapshot('NETERR');
    expect(snap).toBeNull();
  });

  it('Test 17b — fetchOhlcv: zero bars → computeTechnicalSnapshot returns null', async () => {
    mockChart.mockResolvedValueOnce({ quotes: [] });
    const snap = await computeTechnicalSnapshot('EMPTY');
    expect(snap).toBeNull();
  });

  it('Test 17c — fetchOhlcv filters out bars with null high/low/close (Pitfall: technicalindicators chokes on nulls)', async () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i);
    // Yahoo can return null for any OHLC field; quotes shape is broader than OhlcvBar.
    type RawQuote = {
      date: Date;
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
      volume: number | null;
    };
    const bars: RawQuote[] = makeBars(closes);
    bars[5].close = null; // null close — must be filtered
    bars[10].high = null; // null high — must be filtered
    mockChart.mockResolvedValueOnce({ quotes: bars });

    const fetched = await fetchOhlcv('AAPL');
    expect(fetched.length).toBe(248); // 250 minus 2 dropped bars
    expect(fetched.every((b) => b.high != null && b.low != null && b.close != null)).toBe(true);
  });
});

// =================================================================================
// SECTION D: End-to-end snapshot wiring through computeTechnicalSnapshot
// =================================================================================

describe('computeTechnicalSnapshot — wiring', () => {
  it('returns a fully-populated snapshot for 250 monotone-rising bars (overbought uptrend)', async () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i);
    const bars = makeBars(closes);
    mockChart.mockResolvedValueOnce({ quotes: bars });

    const snap = await computeTechnicalSnapshot('AAPL');
    expect(snap).not.toBeNull();
    expect(snap!.bar_count).toBe(250);
    expect(snap!.sma_50).toBeTypeOf('number');
    expect(snap!.sma_200).toBeTypeOf('number');
    expect(snap!.rsi_14).toBeGreaterThan(70);
    expect(snap!.momentum_regime).toBe('overbought');
    expect(snap!.trend_regime).toBe('uptrend');
    expect(snap!.data_source).toBe('yahoo');
    expect(snap!.computed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Tech pattern should be reachable; with rising series the latest is overbought_uptrend.
    expect(snap!.tech_pattern).toBe('overbought_uptrend');
  });

  it('handles sparse non-zero volumes in last 20 bars (< 5 valid → avg_volume_20d null)', async () => {
    const closes = Array.from({ length: 250 }, (_, i) => 100 + i);
    const bars = makeBars(closes, { volume: 0 });
    // Give only 3 bars in the trailing 20 a non-zero volume.
    bars[bars.length - 5].volume = 1_000_000;
    bars[bars.length - 4].volume = 1_000_000;
    bars[bars.length - 3].volume = 1_000_000;
    mockChart.mockResolvedValueOnce({ quotes: bars });

    const snap = await computeTechnicalSnapshot('THIN');
    expect(snap).not.toBeNull();
    expect(snap!.avg_volume_20d).toBeNull();
    expect(snap!.volume_ratio).toBeNull();
  });
});
