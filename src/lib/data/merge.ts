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

// ─── Phase 17: Insider + Institutional merge functions ─────────────────────
// Field-level cascade: finnhub → edgar (first non-null wins). The two-source
// case is simpler than the 3-source market data merge — no tracking object
// beyond the snapshot's existing `data_source` provenance.

import type { InsiderSnapshot, InstitutionalSnapshot } from '@/lib/types';

/**
 * Merge two InsiderSnapshot candidates field-by-field. First-non-null wins
 * per field (finnhub preferred over edgar). Returns null when both inputs are
 * null. The merged snapshot's `data_source` is set to whichever source
 * provided the bucket (or 'finnhub' if both did).
 *
 * Most snapshots flow through one source only (Finnhub). This function is
 * the symmetry point for plan 17-05's potential EDGAR co-equal mode (D-09).
 */
export function mergeInsiderData(
  finnhub: InsiderSnapshot | null,
  edgar: InsiderSnapshot | null,
): InsiderSnapshot | null {
  if (!finnhub && !edgar) return null;
  if (finnhub && !edgar) return finnhub;
  if (!finnhub && edgar) return edgar;
  // Both populated — take Finnhub as base, fall through to edgar field-by-field.
  const f = finnhub!; const e = edgar!;
  return {
    insider_bucket: f.insider_bucket ?? e.insider_bucket,
    distinct_buyers: Math.max(f.distinct_buyers, e.distinct_buyers),
    distinct_sellers: Math.max(f.distinct_sellers, e.distinct_sellers),
    net_buy_share_count: Math.max(f.net_buy_share_count, e.net_buy_share_count),
    net_sell_share_count: Math.max(f.net_sell_share_count, e.net_sell_share_count),
    buy_value_usd: f.buy_value_usd ?? e.buy_value_usd,
    sell_value_usd: f.sell_value_usd ?? e.sell_value_usd,
    has_ceo_buy: f.has_ceo_buy || e.has_ceo_buy,
    has_cfo_buy: f.has_cfo_buy || e.has_cfo_buy,
    has_director_buy: f.has_director_buy || e.has_director_buy,
    is_planned_10b5_1: f.is_planned_10b5_1 || e.is_planned_10b5_1,
    filings_count: Math.max(f.filings_count, e.filings_count),
    earliest_filing_date: pickEarliest(f.earliest_filing_date, e.earliest_filing_date),
    latest_filing_date: pickLatest(f.latest_filing_date, e.latest_filing_date),
    data_age_days: f.data_age_days ?? e.data_age_days,
    computed_at: f.computed_at,
    data_source: f.insider_bucket ? 'finnhub' : 'edgar',
    insider_sentiment_mspr: f.insider_sentiment_mspr ?? e.insider_sentiment_mspr,
  };
}

/**
 * Merge two InstitutionalSnapshot candidates. First-non-null wins per field.
 * Same shape as mergeInsiderData.
 */
export function mergeInstitutionalData(
  finnhub: InstitutionalSnapshot | null,
  edgar: InstitutionalSnapshot | null,
): InstitutionalSnapshot | null {
  if (!finnhub && !edgar) return null;
  if (finnhub && !edgar) return finnhub;
  if (!finnhub && edgar) return edgar;
  const f = finnhub!; const e = edgar!;
  // Prefer Finnhub for numeric inputs; only fall back to EDGAR when the
  // Finnhub field is genuinely missing (zero is a real value, not missing).
  return {
    institutional_bucket: f.institutional_bucket ?? e.institutional_bucket,
    total_institutional_share: f.total_institutional_share || e.total_institutional_share,
    total_institutional_share_prev: f.total_institutional_share_prev || e.total_institutional_share_prev,
    net_share_change: f.net_share_change,
    net_share_change_pct: f.net_share_change_pct,
    fund_count_current: f.fund_count_current || e.fund_count_current,
    fund_count_prev: f.fund_count_prev || e.fund_count_prev,
    fund_count_delta: f.fund_count_delta,
    top10_concentration_pct: f.top10_concentration_pct || e.top10_concentration_pct,
    top10_concentration_pct_prev: f.top10_concentration_pct_prev || e.top10_concentration_pct_prev,
    ticker_30d_return_pct: f.ticker_30d_return_pct ?? e.ticker_30d_return_pct,
    spy_30d_return_pct: f.spy_30d_return_pct ?? e.spy_30d_return_pct,
    report_date: f.report_date || e.report_date,
    filing_date: f.filing_date || e.filing_date,
    data_age_days: f.data_age_days,
    computed_at: f.computed_at,
    data_source: f.institutional_bucket ? 'finnhub' : 'edgar',
  };
}

function pickEarliest(a: string | null, b: string | null): string | null {
  if (a && b) return a < b ? a : b;
  return a ?? b;
}
function pickLatest(a: string | null, b: string | null): string | null {
  if (a && b) return a > b ? a : b;
  return a ?? b;
}
