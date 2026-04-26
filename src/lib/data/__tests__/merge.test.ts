// src/lib/data/__tests__/merge.test.ts
// Phase 10-FIX-01 unit tests for the field-level merge layer.
// Cascade order: yahoo → finnhub → polygon. First non-null wins.

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

describe('mergeMarketData — cascade ordering', () => {
  it('yahoo wins when yahoo has the value', () => {
    const merged = mergeMarketData(
      yahooMarket({ price: 195.5, volume: 50_000_000, exchange: 'NasdaqGS' }),
      supplementary('Finnhub', { price: 999, volume: 1, exchange: 'NYSE' }),
      supplementary('Polygon', { price: 888, volume: 2, exchange: 'AMEX' }),
    );
    expect(merged.price).toBe(195.5);
    expect(merged.volume).toBe(50_000_000);
    expect(merged.exchange).toBe('NasdaqGS');
    expect(merged._field_sources?.price).toBe('yahoo');
    expect(merged._field_sources?.volume).toBe('yahoo');
    expect(merged._field_sources?.exchange).toBe('yahoo');
  });

  it('finnhub wins when yahoo is null and finnhub has the value', () => {
    const merged = mergeMarketData(
      yahooMarket({ market_cap: null, fifty_two_week_high: null }),
      supplementary('Finnhub', { market_cap: 3_000_000_000_000, fifty_two_week_high: 250 }),
      supplementary('Polygon', { market_cap: 2_000_000_000_000, fifty_two_week_high: 240 }),
    );
    expect(merged.market_cap).toBe(3_000_000_000_000);
    expect(merged.fifty_two_week_high).toBe(250);
    expect(merged._field_sources?.market_cap).toBe('finnhub');
    expect(merged._field_sources?.fifty_two_week_high).toBe('finnhub');
  });

  it('polygon wins when both yahoo and finnhub are null', () => {
    const merged = mergeMarketData(
      yahooMarket({ market_cap: null }),
      supplementary('Finnhub', { market_cap: null }),
      supplementary('Polygon', { market_cap: 1_500_000_000_000 }),
    );
    expect(merged.market_cap).toBe(1_500_000_000_000);
    expect(merged._field_sources?.market_cap).toBe('polygon');
  });

  it('marks every-source-null fields as unavailable', () => {
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
    expect(merged._field_sources?.price).toBeNull();
    expect(merged._field_sources?.volume).toBeNull();
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
    expect(merged._field_sources?.market_cap).toBe('finnhub');
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

describe('mergeFundamentals — cascade ordering', () => {
  it('yahoo wins for pe_ratio when present', () => {
    const merged = mergeFundamentals(
      yahooFundamentals({ pe_ratio: 28.5, eps: 6.4 }),
      supplementary('Finnhub', {}, { pe_ratio: 99, eps: 1 }),
      null,
    );
    expect(merged.pe_ratio).toBe(28.5);
    expect(merged.eps).toBe(6.4);
    expect(merged._field_sources?.pe_ratio).toBe('yahoo');
    expect(merged._field_sources?.eps).toBe('yahoo');
  });

  it('finnhub fills the standard yahoo-null gap (the production bug we are fixing)', () => {
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

  it('polygon fills eps/revenue when finnhub is also null', () => {
    const merged = mergeFundamentals(
      yahooFundamentals(),
      supplementary('Finnhub', {}, { eps: null, revenue: null }),
      supplementary('Polygon', {}, { eps: 5.2, revenue: 100_000_000_000 }),
    );
    expect(merged.eps).toBe(5.2);
    expect(merged.revenue).toBe(100_000_000_000);
    expect(merged._field_sources?.eps).toBe('polygon');
    expect(merged._field_sources?.revenue).toBe('polygon');
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
    expect(merged._field_sources?.pe_ratio).toBe('yahoo');
  });

  it('a real PE of 0 from yahoo is preserved (no surprise null coercion at merge level)', () => {
    // The plan defers Finnhub-specific 0-as-missing handling to 10-FIX-04.
    // The merge layer itself must not invent semantics — 0 is a valid number.
    const merged = mergeFundamentals(
      yahooFundamentals({ pe_ratio: 0 }),
      supplementary('Finnhub', {}, { pe_ratio: 28.5 }),
      null,
    );
    expect(merged.pe_ratio).toBe(0);
    expect(merged._field_sources?.pe_ratio).toBe('yahoo');
  });
});
