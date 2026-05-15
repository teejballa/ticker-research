// Phase: 30 — Provider Health Hardening
// Phase 30 D-09
//
// GREEN-state tests for SourcePackage.fallback_summary plumbing:
//   { field: string; tried: ProviderId[]; resolved_by: ProviderId | 'unavailable' }[]
//
// Reports themselves do NOT render this — it's telemetry surfaced on
// `/insights/sentiment-health` via the fallback heatmap tile (D-10). These
// tests exercise the merge layer directly (no full SourcePackage build) so
// the shape contract is pinned without dragging in the parallel-fetch network
// surface.

import { describe, it, expect } from 'vitest';
import { mergeMarketData, mergeFundamentals } from '@/lib/data/merge';
import type {
  MarketDataSection,
  FundamentalsSection,
  SupplementarySource,
  SupplementaryMarketFields,
  SupplementaryFundamentalsFields,
  FallbackSummaryEntry,
} from '@/lib/types';

const TS = '2026-05-14T00:00:00.000Z';

function yahooMarket(over: Partial<MarketDataSection> = {}): MarketDataSection {
  return {
    collected_at: TS,
    price: null,
    volume: null,
    market_cap: null,
    fifty_two_week_high: null,
    fifty_two_week_low: null,
    percent_change_today: null,
    exchange: null,
    ...over,
  };
}

function yahooFundamentals(over: Partial<FundamentalsSection> = {}): FundamentalsSection {
  return {
    collected_at: TS,
    pe_ratio: null,
    eps: null,
    revenue: null,
    debt_to_equity: null,
    profit_margin: null,
    ...over,
  };
}

function supplementary(
  name: 'Finnhub' | 'Polygon',
  market: Partial<SupplementaryMarketFields> = {},
  fundamentals: Partial<SupplementaryFundamentalsFields> = {},
): SupplementarySource {
  return {
    name,
    fetched_at: TS,
    text_block: '',
    available: true,
    market: {
      price: null,
      volume: null,
      market_cap: null,
      fifty_two_week_high: null,
      fifty_two_week_low: null,
      percent_change_today: null,
      exchange: null,
      ...market,
    },
    fundamentals: {
      pe_ratio: null,
      eps: null,
      revenue: null,
      debt_to_equity: null,
      profit_margin: null,
      ...fundamentals,
    },
  };
}

function findEntry(
  fs: FallbackSummaryEntry[] | undefined,
  field: string,
): FallbackSummaryEntry | undefined {
  return fs?.find((e) => e.field === field);
}

describe('Phase 30 / D-09: SourcePackage.fallback_summary shape', () => {
  it('D-09: fallback_summary entry has { field, tried: ProviderId[], resolved_by: ProviderId | "unavailable" }', () => {
    const merged = mergeMarketData(
      yahooMarket({ price: 100 }),
      supplementary('Finnhub', { market_cap: 1_000_000_000 }),
      supplementary('Polygon', { market_cap: 2_000_000_000, exchange: 'NYSE' }),
    );
    expect(Array.isArray(merged._fallback_summary)).toBe(true);
    for (const entry of merged._fallback_summary ?? []) {
      expect(typeof entry.field).toBe('string');
      expect(Array.isArray(entry.tried)).toBe(true);
      // resolved_by is either a ProviderId or 'unavailable'.
      expect(typeof entry.resolved_by).toBe('string');
    }
  });

  it('D-09: field served by polygon directly: tried=["polygon"], resolved_by="polygon"', () => {
    // Shared field: market_cap. Polygon has the value first → short-circuit
    // means finnhub and yahoo are NOT consulted, so tried = ['polygon'] only.
    const merged = mergeMarketData(
      yahooMarket({ market_cap: 999 }),
      supplementary('Finnhub', { market_cap: 500 }),
      supplementary('Polygon', { market_cap: 1_500_000_000 }),
    );
    const mc = findEntry(merged._fallback_summary, 'market_cap');
    expect(mc?.tried).toEqual(['polygon']);
    expect(mc?.resolved_by).toBe('polygon');
  });

  it('D-09: polygon null → finnhub returns value: tried=["polygon","finnhub"], resolved_by="finnhub"', () => {
    const merged = mergeFundamentals(
      yahooFundamentals({ pe_ratio: 30 }),
      supplementary('Finnhub', {}, { pe_ratio: 25 }),
      supplementary('Polygon', {}, { pe_ratio: null }),
    );
    const pe = findEntry(merged._fallback_summary, 'pe_ratio');
    expect(pe?.tried).toEqual(['polygon', 'finnhub']);
    expect(pe?.resolved_by).toBe('finnhub');
  });

  it('D-09: polygon null → finnhub null → yahoo returns value: tried order preserved, resolved_by="yahoo"', () => {
    const merged = mergeFundamentals(
      yahooFundamentals({ pe_ratio: 30 }),
      supplementary('Finnhub', {}, { pe_ratio: null }),
      supplementary('Polygon', {}, { pe_ratio: null }),
    );
    const pe = findEntry(merged._fallback_summary, 'pe_ratio');
    expect(pe?.tried).toEqual(['polygon', 'finnhub', 'yahoo']);
    expect(pe?.resolved_by).toBe('yahoo');
  });

  it('D-09: all three nulls: tried=["polygon","finnhub","yahoo"], resolved_by="unavailable"', () => {
    const merged = mergeFundamentals(
      yahooFundamentals(), // all nulls
      supplementary('Finnhub'),
      supplementary('Polygon'),
    );
    const pe = findEntry(merged._fallback_summary, 'pe_ratio');
    expect(pe?.tried).toEqual(['polygon', 'finnhub', 'yahoo']);
    expect(pe?.resolved_by).toBe('unavailable');
    // D-11 — FieldOrigin set to 'unavailable' (not null).
    expect(merged._field_sources?.pe_ratio).toBe('unavailable');
  });

  it('D-09: fallback_summary is emitted per-field, not per-provider — one entry per merged field', () => {
    const merged = mergeMarketData(
      yahooMarket({ price: 100, volume: 10, market_cap: 1, exchange: 'NY' }),
      supplementary('Finnhub'),
      supplementary('Polygon'),
    );
    // MARKET_KEYS has 7 fields: price, volume, market_cap, fifty_two_week_high,
    // fifty_two_week_low, percent_change_today, exchange.
    expect(merged._fallback_summary?.length).toBe(7);
    // No duplicates.
    const fields = (merged._fallback_summary ?? []).map((e) => e.field);
    expect(new Set(fields).size).toBe(fields.length);
  });
});
