// src/lib/data/merge.ts
// Field-level merge layer (Phase 10-FIX-01).
// Cascades yahoo → finnhub → polygon per field. First non-null wins.
// Per-field provenance recorded in `_field_sources`. Fields that are null
// across every source are listed in `unavailable_fields` so the UI can
// distinguish "we asked three sources, none had it" from "we never asked".

import type {
  MarketDataSection,
  FundamentalsSection,
  MarketDataFieldSources,
  FundamentalsFieldSources,
  FieldOrigin,
  SupplementarySource,
  SupplementaryMarketFields,
  SupplementaryFundamentalsFields,
} from '@/lib/types';

const MARKET_KEYS = [
  'price',
  'volume',
  'market_cap',
  'fifty_two_week_high',
  'fifty_two_week_low',
  'percent_change_today',
  'exchange',
] as const satisfies readonly (keyof SupplementaryMarketFields)[];

const FUNDAMENTAL_KEYS = [
  'pe_ratio',
  'eps',
  'revenue',
  'debt_to_equity',
  'profit_margin',
] as const satisfies readonly (keyof SupplementaryFundamentalsFields)[];

type CascadeEntry<T> = { source: Exclude<FieldOrigin, null>; data: T | null | undefined };

function pickField<T, K extends keyof T>(
  cascade: CascadeEntry<T>[],
  key: K,
): { value: T[K] | null; source: FieldOrigin } {
  for (const entry of cascade) {
    if (!entry.data) continue;
    const v = entry.data[key];
    if (v !== null && v !== undefined) {
      return { value: v, source: entry.source };
    }
  }
  return { value: null, source: null };
}

export function mergeMarketData(
  yahoo: MarketDataSection,
  finnhub: SupplementarySource | null,
  polygon: SupplementarySource | null,
): MarketDataSection {
  const cascade: CascadeEntry<SupplementaryMarketFields>[] = [
    { source: 'yahoo', data: yahooToMarket(yahoo) },
    { source: 'finnhub', data: finnhub?.market ?? null },
    { source: 'polygon', data: polygon?.market ?? null },
  ];

  const merged: Partial<SupplementaryMarketFields> = {};
  const sources = {} as MarketDataFieldSources;
  const unavailable: string[] = [];

  for (const k of MARKET_KEYS) {
    const { value, source } = pickField(cascade, k);
    (merged as Record<string, unknown>)[k] = value;
    sources[k] = source;
    if (source === null) unavailable.push(k);
  }

  // Preserve yahoo's collected_at so timestamps stay consistent across reruns.
  return {
    collected_at: yahoo.collected_at,
    price: merged.price ?? null,
    volume: merged.volume ?? null,
    market_cap: merged.market_cap ?? null,
    fifty_two_week_high: merged.fifty_two_week_high ?? null,
    fifty_two_week_low: merged.fifty_two_week_low ?? null,
    percent_change_today: merged.percent_change_today ?? null,
    exchange: merged.exchange ?? null,
    _field_sources: sources,
    ...(unavailable.length > 0 ? { unavailable_fields: unavailable } : {}),
    // Only surface yahoo's error when we got nothing from any source.
    ...(unavailable.length === MARKET_KEYS.length && yahoo.error ? { error: yahoo.error } : {}),
  };
}

export function mergeFundamentals(
  yahoo: FundamentalsSection,
  finnhub: SupplementarySource | null,
  polygon: SupplementarySource | null,
): FundamentalsSection {
  const cascade: CascadeEntry<SupplementaryFundamentalsFields>[] = [
    { source: 'yahoo', data: yahooToFundamentals(yahoo) },
    { source: 'finnhub', data: finnhub?.fundamentals ?? null },
    { source: 'polygon', data: polygon?.fundamentals ?? null },
  ];

  const merged: Partial<SupplementaryFundamentalsFields> = {};
  const sources = {} as FundamentalsFieldSources;
  const unavailable: string[] = [];

  for (const k of FUNDAMENTAL_KEYS) {
    const { value, source } = pickField(cascade, k);
    (merged as Record<string, unknown>)[k] = value;
    sources[k] = source;
    if (source === null) unavailable.push(k);
  }

  return {
    collected_at: yahoo.collected_at,
    pe_ratio: merged.pe_ratio ?? null,
    eps: merged.eps ?? null,
    revenue: merged.revenue ?? null,
    debt_to_equity: merged.debt_to_equity ?? null,
    profit_margin: merged.profit_margin ?? null,
    _field_sources: sources,
    ...(unavailable.length > 0 ? { unavailable_fields: unavailable } : {}),
    ...(unavailable.length === FUNDAMENTAL_KEYS.length && yahoo.error ? { error: yahoo.error } : {}),
  };
}

function yahooToMarket(y: MarketDataSection): SupplementaryMarketFields {
  return {
    price: y.price,
    volume: y.volume,
    market_cap: y.market_cap,
    fifty_two_week_high: y.fifty_two_week_high,
    fifty_two_week_low: y.fifty_two_week_low,
    percent_change_today: y.percent_change_today,
    exchange: y.exchange,
  };
}

function yahooToFundamentals(y: FundamentalsSection): SupplementaryFundamentalsFields {
  return {
    pe_ratio: y.pe_ratio,
    eps: y.eps,
    revenue: y.revenue,
    debt_to_equity: y.debt_to_equity,
    profit_margin: y.profit_margin,
  };
}
