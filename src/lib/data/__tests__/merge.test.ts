// src/lib/data/__tests__/merge.test.ts
// Phase 10-FIX-01 unit tests for the field-level merge layer.
//
// Phase 30 D-01 — cascade order REVERSED for shared fields:
//   polygon (primary) → finnhub (fallback 1) → yahoo (fallback 2).
//   Yahoo-only fields (price, volume, percent_change_today) keep yahoo-primary
//   because Polygon and Finnhub do not expose them (see field coverage matrix
//   in 30-RESEARCH.md). The original Phase-10 tests in this file have been
//   updated to reflect the new contract.

import { describe, it, expect } from 'vitest';
import { mergeMarketData, mergeFundamentals } from '../merge';
import type {
  MarketDataSection,
  FundamentalsSection,
  SupplementarySource,
  SupplementaryMarketFields,
  SupplementaryFundamentalsFields,
} from '@/lib/types';

const TS = '2026-04-26T00:00:00.000Z';

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

describe('mergeMarketData — cascade ordering (Phase 30 D-01)', () => {
  it('yahoo-only field (price) is yahoo-primary even when supplementary sources set values', () => {
    // price / volume / percent_change_today are YAHOO-ONLY — Polygon and
    // Finnhub do not expose them. The supplementary `price: 999/888` values
    // are stray test data; the cascade should ignore them and use Yahoo.
    const merged = mergeMarketData(
      yahooMarket({ price: 195.5, volume: 50_000_000 }),
      supplementary('Finnhub', { price: 999, volume: 1 }),
      supplementary('Polygon', { price: 888, volume: 2 }),
    );
    expect(merged.price).toBe(195.5);
    expect(merged.volume).toBe(50_000_000);
    expect(merged._field_sources?.price).toBe('yahoo');
    expect(merged._field_sources?.volume).toBe('yahoo');
  });

  it('polygon wins for shared field (exchange) when polygon has the value', () => {
    // exchange is SHARED — D-01 puts polygon first in the cascade.
    const merged = mergeMarketData(
      yahooMarket({ exchange: 'NasdaqGS' }),
      supplementary('Finnhub', { exchange: 'NYSE' }),
      supplementary('Polygon', { exchange: 'AMEX' }),
    );
    expect(merged.exchange).toBe('AMEX');
    expect(merged._field_sources?.exchange).toBe('polygon');
  });

  it('finnhub wins when polygon is null and finnhub has the value (shared field)', () => {
    const merged = mergeMarketData(
      yahooMarket({ market_cap: null, fifty_two_week_high: null }),
      supplementary('Finnhub', { market_cap: 3_000_000_000_000, fifty_two_week_high: 250 }),
      supplementary('Polygon', { market_cap: null, fifty_two_week_high: null }),
    );
    expect(merged.market_cap).toBe(3_000_000_000_000);
    expect(merged.fifty_two_week_high).toBe(250);
    expect(merged._field_sources?.market_cap).toBe('finnhub');
    expect(merged._field_sources?.fifty_two_week_high).toBe('finnhub');
  });

  it('yahoo wins for shared field when polygon and finnhub are both null', () => {
    const merged = mergeMarketData(
      yahooMarket({ market_cap: 1_500_000_000_000 }),
      supplementary('Finnhub', { market_cap: null }),
      supplementary('Polygon', { market_cap: null }),
    );
    expect(merged.market_cap).toBe(1_500_000_000_000);
    expect(merged._field_sources?.market_cap).toBe('yahoo');
  });

  it('marks every-source-null fields as unavailable (FieldOrigin = "unavailable")', () => {
    const merged = mergeMarketData(
      yahooMarket(),
      supplementary('Finnhub'),
      supplementary('Polygon'),
    );
    expect(merged.unavailable_fields).toEqual([
      'price',
      'volume',
      'market_cap',
      'fifty_two_week_high',
      'fifty_two_week_low',
      'percent_change_today',
      'exchange',
    ]);
    // Phase 30 D-11 — every-null fields now emit 'unavailable', not null.
    expect(merged._field_sources?.price).toBe('unavailable');
    expect(merged._field_sources?.volume).toBe('unavailable');
  });

  it('omits unavailable_fields when every field has a source', () => {
    const merged = mergeMarketData(
      yahooMarket({
        price: 100,
        volume: 10,
        market_cap: 1,
        fifty_two_week_high: 200,
        fifty_two_week_low: 50,
        percent_change_today: 0.01,
        exchange: 'NasdaqGS',
      }),
      null,
      null,
    );
    expect(merged.unavailable_fields).toBeUndefined();
  });

  it('handles null finnhub / null polygon (api keys missing)', () => {
    const merged = mergeMarketData(
      yahooMarket({ price: 195.5, exchange: 'NasdaqGS' }),
      null,
      null,
    );
    expect(merged.price).toBe(195.5);
    expect(merged._field_sources?.price).toBe('yahoo');
    expect(merged.unavailable_fields).toContain('volume');
    expect(merged.unavailable_fields).toContain('market_cap');
  });

  it('does NOT propagate yahoo error when supplementary sources fill the gaps', () => {
    const merged = mergeMarketData(
      yahooMarket({ error: 'fetchMarketData failed' }),
      supplementary('Finnhub', { market_cap: 100, exchange: 'NYSE' }),
      supplementary('Polygon', { market_cap: 99, exchange: 'NYSE' }),
    );
    expect(merged.error).toBeUndefined();
    // Polygon wins for shared field per D-01.
    expect(merged._field_sources?.market_cap).toBe('polygon');
  });

  it('preserves yahoo error when EVERY field is unavailable', () => {
    const merged = mergeMarketData(
      yahooMarket({ error: 'fetchMarketData failed' }),
      null,
      null,
    );
    expect(merged.error).toBe('fetchMarketData failed');
  });
});

describe('mergeFundamentals — cascade ordering (Phase 30 D-01)', () => {
  it('polygon wins for pe_ratio when polygon has the value (shared field)', () => {
    const merged = mergeFundamentals(
      yahooFundamentals({ pe_ratio: 28.5, eps: 6.4 }),
      supplementary('Finnhub', {}, { pe_ratio: 99, eps: 1 }),
      supplementary('Polygon', {}, { pe_ratio: 50, eps: 5 }),
    );
    // Polygon primary per D-01.
    expect(merged.pe_ratio).toBe(50);
    expect(merged.eps).toBe(5);
    expect(merged._field_sources?.pe_ratio).toBe('polygon');
    expect(merged._field_sources?.eps).toBe('polygon');
  });

  it('finnhub wins when polygon is null (the production bug we are fixing)', () => {
    const merged = mergeFundamentals(
      yahooFundamentals({
        pe_ratio: null,
        eps: null,
        revenue: null,
        debt_to_equity: null,
        profit_margin: null,
      }),
      supplementary('Finnhub', {}, {
        pe_ratio: 28.5,
        eps: 6.4,
        revenue: 391_000_000_000,
        debt_to_equity: 1.85,
        profit_margin: 0.245,
      }),
      null,
    );
    expect(merged.pe_ratio).toBe(28.5);
    expect(merged.eps).toBe(6.4);
    expect(merged.revenue).toBe(391_000_000_000);
    expect(merged.debt_to_equity).toBe(1.85);
    expect(merged.profit_margin).toBe(0.245);
    expect(merged._field_sources?.pe_ratio).toBe('finnhub');
    expect(merged._field_sources?.revenue).toBe('finnhub');
    expect(merged.unavailable_fields).toBeUndefined();
  });

  it('yahoo fills eps/revenue when both polygon and finnhub are null', () => {
    const merged = mergeFundamentals(
      yahooFundamentals({ eps: 5.2, revenue: 100_000_000_000 }),
      supplementary('Finnhub', {}, { eps: null, revenue: null }),
      supplementary('Polygon', {}, { eps: null, revenue: null }),
    );
    expect(merged.eps).toBe(5.2);
    expect(merged.revenue).toBe(100_000_000_000);
    expect(merged._field_sources?.eps).toBe('yahoo');
    expect(merged._field_sources?.revenue).toBe('yahoo');
  });

  it('marks all-null fundamentals as unavailable instead of rendering as N/A', () => {
    const merged = mergeFundamentals(
      yahooFundamentals(),
      supplementary('Finnhub'),
      supplementary('Polygon'),
    );
    expect(merged.unavailable_fields).toEqual([
      'pe_ratio',
      'eps',
      'revenue',
      'debt_to_equity',
      'profit_margin',
    ]);
    expect(merged.pe_ratio).toBeNull();
    // Phase 30 D-11 — every-null fields now emit 'unavailable', not null.
    expect(merged._field_sources?.pe_ratio).toBe('unavailable');
  });

  it('treats unavailable supplementary sources as null', () => {
    const offlineFinnhub: SupplementarySource = {
      name: 'Finnhub',
      fetched_at: TS,
      text_block: '',
      available: false,
    };
    const merged = mergeFundamentals(
      yahooFundamentals({ pe_ratio: 30 }),
      offlineFinnhub, // no .fundamentals — must not crash
      null,
    );
    expect(merged.pe_ratio).toBe(30);
    // Polygon and Finnhub both unavailable → yahoo fills.
    expect(merged._field_sources?.pe_ratio).toBe('yahoo');
  });

  it('a real PE of 0 from polygon is preserved (no surprise null coercion at merge level)', () => {
    // The plan defers Finnhub-specific 0-as-missing handling to 10-FIX-04.
    // The merge layer itself must not invent semantics — 0 is a valid number.
    // Under D-01 polygon is primary, so a 0 from polygon wins.
    const merged = mergeFundamentals(
      yahooFundamentals({ pe_ratio: 28.5 }),
      supplementary('Finnhub', {}, { pe_ratio: 99 }),
      supplementary('Polygon', {}, { pe_ratio: 0 }),
    );
    expect(merged.pe_ratio).toBe(0);
    expect(merged._field_sources?.pe_ratio).toBe('polygon');
  });
});

// ─── Phase 30 / D-01 + D-09 + D-11 acceptance tests ────────────────────────

describe('Phase 30 / D-01 + D-09 + D-11', () => {
  it('shared fields cascade polygon → finnhub → yahoo: tried[0] === "polygon"', () => {
    const merged = mergeMarketData(
      yahooMarket({ market_cap: 100, exchange: 'YAHOO' }),
      supplementary('Finnhub', { market_cap: 200, exchange: 'FH' }),
      supplementary('Polygon', { market_cap: 300, exchange: 'PG' }),
    );
    const mcEntry = merged._fallback_summary?.find((e) => e.field === 'market_cap');
    expect(mcEntry?.tried[0]).toBe('polygon');
    expect(mcEntry?.resolved_by).toBe('polygon');
    expect(mcEntry?.tried).toEqual(['polygon']); // short-circuit — only polygon consulted

    const exEntry = merged._fallback_summary?.find((e) => e.field === 'exchange');
    expect(exEntry?.tried[0]).toBe('polygon');
    expect(exEntry?.resolved_by).toBe('polygon');
  });

  it('yahoo-only fields (price, volume, percent_change_today) still yahoo-primary', () => {
    const merged = mergeMarketData(
      yahooMarket({ price: 100, volume: 50_000, percent_change_today: 0.01 }),
      supplementary('Finnhub'),
      supplementary('Polygon'),
    );
    const priceEntry = merged._fallback_summary?.find((e) => e.field === 'price');
    expect(priceEntry?.tried).toEqual(['yahoo']);
    expect(priceEntry?.resolved_by).toBe('yahoo');

    const volEntry = merged._fallback_summary?.find((e) => e.field === 'volume');
    expect(volEntry?.tried).toEqual(['yahoo']);
    expect(volEntry?.resolved_by).toBe('yahoo');

    const pctEntry = merged._fallback_summary?.find((e) => e.field === 'percent_change_today');
    expect(pctEntry?.tried).toEqual(['yahoo']);
    expect(pctEntry?.resolved_by).toBe('yahoo');
  });

  it('tried sequence reflects sequential short-circuit on shared fields', () => {
    // polygon null → finnhub has value: tried = ['polygon', 'finnhub']
    const merged = mergeFundamentals(
      yahooFundamentals({ pe_ratio: 10 }),
      supplementary('Finnhub', {}, { pe_ratio: 20 }),
      supplementary('Polygon', {}, { pe_ratio: null }),
    );
    const peEntry = merged._fallback_summary?.find((e) => e.field === 'pe_ratio');
    expect(peEntry?.tried).toEqual(['polygon', 'finnhub']);
    expect(peEntry?.resolved_by).toBe('finnhub');
  });

  it('all-three-null cascade emits resolved_by="unavailable", tried=full cascade', () => {
    const merged = mergeFundamentals(
      yahooFundamentals(), // all nulls
      supplementary('Finnhub'),
      supplementary('Polygon'),
    );
    const peEntry = merged._fallback_summary?.find((e) => e.field === 'pe_ratio');
    expect(peEntry?.tried).toEqual(['polygon', 'finnhub', 'yahoo']);
    expect(peEntry?.resolved_by).toBe('unavailable');
    // D-11 — FieldOrigin is 'unavailable' (not null).
    expect(merged._field_sources?.pe_ratio).toBe('unavailable');
  });

  it('D-09: fallback_summary has one entry per merged field (no duplicates)', () => {
    const merged = mergeMarketData(
      yahooMarket({ price: 100, market_cap: 1, exchange: 'NY' }),
      null,
      null,
    );
    expect(merged._fallback_summary?.length).toBe(7); // MARKET_KEYS length
    const fields = merged._fallback_summary?.map((e) => e.field);
    expect(fields).toEqual([
      'price',
      'volume',
      'market_cap',
      'fifty_two_week_high',
      'fifty_two_week_low',
      'percent_change_today',
      'exchange',
    ]);
  });

  it('D-09: fundamentals fallback_summary covers all FUNDAMENTAL_KEYS', () => {
    const merged = mergeFundamentals(
      yahooFundamentals({ pe_ratio: 10, eps: 1, revenue: 1, debt_to_equity: 1, profit_margin: 0.1 }),
      null,
      null,
    );
    expect(merged._fallback_summary?.length).toBe(5);
    const fields = merged._fallback_summary?.map((e) => e.field);
    expect(fields).toEqual([
      'pe_ratio',
      'eps',
      'revenue',
      'debt_to_equity',
      'profit_margin',
    ]);
  });

  it('D-11: when all three sources are null, FieldOrigin is "unavailable" not null', () => {
    const merged = mergeMarketData(
      yahooMarket(),
      supplementary('Finnhub'),
      supplementary('Polygon'),
    );
    // Every field has all-null cascade. Check a shared field and a yahoo-only field.
    expect(merged._field_sources?.market_cap).toBe('unavailable');
    expect(merged._field_sources?.price).toBe('unavailable');
  });
});
