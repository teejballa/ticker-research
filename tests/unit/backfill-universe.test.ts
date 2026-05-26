import { describe, it, expect } from 'vitest';
import { BACKFILL_UNIVERSE, UNIVERSE_VERSION, tickersByCuration } from '@/lib/backtest/universe';

describe('backfill universe (COVERAGE-06)', () => {
  it('has >=100 tickers', () => {
    expect(BACKFILL_UNIVERSE.length).toBeGreaterThanOrEqual(100);
  });
  it('has no duplicate tickers', () => {
    const set = new Set(BACKFILL_UNIVERSE.map((e) => e.ticker));
    expect(set.size).toBe(BACKFILL_UNIVERSE.length);
  });
  it('is roughly balanced across the 3 cap buckets (>=30 each)', () => {
    for (const cap of ['large_cap', 'mid_cap', 'small_cap'] as const) {
      expect(tickersByCuration(cap).length).toBeGreaterThanOrEqual(30);
    }
  });
  it('has no micro_cap bucket (D-05 correction)', () => {
    const caps = new Set(BACKFILL_UNIVERSE.map((e) => e.curation_cap));
    expect(caps.has('micro_cap' as never)).toBe(false);
  });
  it('exposes a version string', () => {
    expect(UNIVERSE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\./);
  });
});
