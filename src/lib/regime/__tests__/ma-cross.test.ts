/**
 * Phase 22 Wave 1 — SPY MA-cross helper tests.
 *
 * Covers: CORE-ML-07 (trend axis) per D-03 + D-12.
 * NOTE: Wave 0 did not seed a RED stub for this file — Wave 1 adds it as a sibling
 * of vix-percentile.test.ts so trend-axis correctness is testable in isolation.
 *
 * Strategy mirrors vix-percentile.test.ts:
 *   - vi.mock('yahoo-finance2') with hoisted mockChart
 *   - vi.mock('@/lib/data/cache') with in-memory Upstash mock
 *   - vi.stubGlobal('fetch') for Polygon fallback
 *   - Deterministic fixture tests/fixtures/regime/spy-history.json (Wave 0)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import spyHistory from '../../../../tests/fixtures/regime/spy-history.json';

const { mockChart } = vi.hoisted(() => ({ mockChart: vi.fn() }));

vi.mock('yahoo-finance2', () => ({
  default: class {
    chart = mockChart;
  },
}));

vi.mock('@/lib/data/cache', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

import { __resetUpstashClientForTests } from '@/lib/data/cache/__mocks__/upstash';
import { getSpyMaCross } from '../ma-cross';

interface FixturePoint {
  date: string;
  close: number;
}
const FIXTURE = spyHistory as FixturePoint[];

function toYahooQuotes(rows: FixturePoint[]): Array<{ date: Date; close: number }> {
  return rows.map((r) => ({ date: new Date(`${r.date}T00:00:00Z`), close: r.close }));
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

describe('getSpyMaCross — D-03 + D-12 contract', () => {
  beforeEach(() => {
    mockChart.mockReset();
    __resetUpstashClientForTests();
    vi.unstubAllGlobals();
    delete process.env.POLYGON_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('computes mean(last 50) - mean(last 200) at asOf via Yahoo primary', async () => {
    mockChart.mockResolvedValueOnce({ quotes: toYahooQuotes(FIXTURE) });
    const lastIdx = FIXTURE.length - 1;
    const asOf = new Date(`${FIXTURE[lastIdx].date}T00:00:00Z`);
    const result = await getSpyMaCross(asOf);
    expect(result).not.toBeNull();

    const closes = FIXTURE.map((r) => r.close);
    const expectedMa50 = mean(closes.slice(-50));
    const expectedMa200 = mean(closes.slice(-200));
    expect(result!.ma50_minus_ma200).toBeCloseTo(expectedMa50 - expectedMa200, 4);
  });

  it('detects bear → bull trend flip across the fixture crossover region', async () => {
    // Per 22-00-SUMMARY: at idx 199 diff = -13.88 (bear); at idx 209 diff = +4.38 (bull).
    mockChart.mockResolvedValue({ quotes: toYahooQuotes(FIXTURE) });

    const asOfBear = new Date(`${FIXTURE[199].date}T00:00:00Z`);
    const bear = await getSpyMaCross(asOfBear);
    expect(bear).not.toBeNull();
    expect(bear!.ma50_minus_ma200).toBeLessThan(0);

    const asOfBull = new Date(`${FIXTURE[209].date}T00:00:00Z`);
    const bull = await getSpyMaCross(asOfBull);
    expect(bull).not.toBeNull();
    expect(bull!.ma50_minus_ma200).toBeGreaterThan(0);
  });

  it('returns null when fewer than ma_long (200) closes are available', async () => {
    mockChart.mockResolvedValueOnce({ quotes: toYahooQuotes(FIXTURE.slice(0, 100)) });
    const asOf = new Date(`${FIXTURE[99].date}T00:00:00Z`);
    const result = await getSpyMaCross(asOf);
    expect(result).toBeNull();
  });

  it('falls back to Polygon SPY when Yahoo returns empty quotes (D-12)', async () => {
    mockChart.mockResolvedValueOnce({ quotes: [] });
    process.env.POLYGON_API_KEY = 'test-poly-key';
    const polygonResults = FIXTURE.map((r) => ({
      t: new Date(`${r.date}T00:00:00Z`).getTime(),
      c: r.close,
    }));
    let capturedUrl = '';
    const fetchSpy = vi.fn(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ results: polygonResults }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const asOf = new Date(`${FIXTURE[FIXTURE.length - 1].date}T00:00:00Z`);
    const result = await getSpyMaCross(asOf);
    expect(result).not.toBeNull();
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(capturedUrl).toContain('/aggs/ticker/SPY/');
  });

  it('returns null when Yahoo throws AND Polygon key absent (cold-start fed to D-09)', async () => {
    mockChart.mockRejectedValueOnce(new Error('yahoo-finance2: upstream 503'));
    const asOf = new Date(`${FIXTURE[FIXTURE.length - 1].date}T00:00:00Z`);
    const result = await getSpyMaCross(asOf);
    expect(result).toBeNull();
  });

  it('returns null when both Yahoo and Polygon return empty (cold-start fed to D-09)', async () => {
    mockChart.mockResolvedValueOnce({ quotes: [] });
    process.env.POLYGON_API_KEY = 'test-poly-key';
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const asOf = new Date(`${FIXTURE[FIXTURE.length - 1].date}T00:00:00Z`);
    const result = await getSpyMaCross(asOf);
    expect(result).toBeNull();
  });

  it('honors prior-trading-day fallback when asOf is a market holiday (D-12)', async () => {
    const truncated = FIXTURE.slice(0, FIXTURE.length - 2);
    mockChart.mockResolvedValueOnce({ quotes: toYahooQuotes(truncated) });
    const lastAvailable = truncated[truncated.length - 1];
    const asOf = new Date(`${lastAvailable.date}T00:00:00Z`);
    asOf.setUTCDate(asOf.getUTCDate() + 1);
    const result = await getSpyMaCross(asOf);
    expect(result).not.toBeNull();
  });

  it('is PIT-correct: uses ONLY closes <= asOf (no forward data)', async () => {
    mockChart.mockResolvedValueOnce({ quotes: toYahooQuotes(FIXTURE) });
    // Pick an asOf in the middle of the fixture where the trend direction differs
    // from the end-of-fixture trend (bull). At idx 199 the trend is bear.
    const asOf = new Date(`${FIXTURE[199].date}T00:00:00Z`);
    const result = await getSpyMaCross(asOf);
    expect(result).not.toBeNull();
    expect(result!.ma50_minus_ma200).toBeLessThan(0);
    // If the helper had leaked forward data (e.g. used closes up to idx 219),
    // we'd see a positive diff — assert it stayed bear.
  });
});
