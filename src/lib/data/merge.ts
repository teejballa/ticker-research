// src/lib/data/merge.ts
// Field-level merge layer (Phase 10-FIX-01).
//
// Phase 30 D-01 — cascade order for fields Polygon and Finnhub cover:
//   polygon (primary) -> finnhub (fallback 1) -> yahoo (fallback 2)
// Yahoo-only fields (price, volume, percent_change_today) keep yahoo-primary
// because Polygon and Finnhub do not expose them (see field coverage matrix
// in .planning/phases/30-provider-health-hardening/30-RESEARCH.md).
//
// Phase 30 D-09 — every cascade resolution emits a FallbackSummaryEntry into
// the returned `fallback_summary` array: `{ field, tried, resolved_by }`. The
// `tried` array reflects providers consulted in cascade order until a non-null
// value was found (sequential short-circuit semantics — see plan additional
// guidance). When all providers in the cascade returned null, `resolved_by` is
// `'unavailable'` and `_field_sources[field]` is set to `'unavailable'` per
// D-11 instead of `null` (legacy persisted records keep `null`; renderers in
// `research-brief.ts` and the report page treat both as the em-dash case).
//
// Plan 19-B-06 (D-29): the canonical FieldOrigin union (declared in
// `src/lib/types.ts`) was extended additively with 'tiingo' | 'twelvedata' |
// 'exa' | 'anthropic-search' so the new merge ladder
// (tiingo → twelvedata → 'yahoo' → 'finnhub' → 'polygon' fallbacks; exa →
// 'anthropic-search' for news/analyst) can stamp provenance without breaking
// the existing Yahoo/Finnhub/Polygon paths. New ladder rungs slot in via
// additional CascadeEntry rows in source-package.ts's buildSourcePackageNewLadder.

import type {
  MarketDataSection,
  FundamentalsSection,
  MarketDataFieldSources,
  FundamentalsFieldSources,
  FieldOrigin,
  SupplementarySource,
  SupplementaryMarketFields,
  SupplementaryFundamentalsFields,
  FallbackSummaryEntry,
} from '@/lib/types';
import type { ProviderId } from '@/lib/telemetry/cost-estimators';

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

// Phase 30 D-01 — Yahoo-only market fields (no alternative source available).
const YAHOO_ONLY_MARKET_KEYS = new Set<keyof SupplementaryMarketFields>([
  'price',
  'volume',
  'percent_change_today',
]);

// Phase 30 D-01 — sequential short-circuit cascade orderings.
//   - SHARED fields are tried polygon → finnhub → yahoo (Yahoo demoted).
//   - YAHOO-ONLY fields are tried yahoo only.
const SHARED_CASCADE_ORDER: ReadonlyArray<Extract<ProviderId, 'polygon' | 'finnhub' | 'yahoo'>> = [
  'polygon',
  'finnhub',
  'yahoo',
];
const YAHOO_ONLY_CASCADE_ORDER: ReadonlyArray<Extract<ProviderId, 'yahoo'>> = ['yahoo'];

/**
 * Resolve a single field via sequential short-circuit cascade. Returns the
 * value, the FieldOrigin marker, and the per-field tried/resolved_by entry.
 *
 * `data[provider]` is the already-fetched candidate from that provider
 * (parallel fan-out happens upstream in source-package.ts — this layer
 * implements the *cascade selection* short-circuit, NOT the network short-
 * circuit; the breaker primitive owns the network short-circuit story via
 * BreakerOpenError → withRetry never runs).
 *
 * `tried` reflects providers consulted in cascade order until the first
 * non-null value was found; on all-null the full cascade is recorded.
 */
function resolveFieldFromCascade<T extends object, K extends keyof T>(
  field: string,
  cascadeOrder: ReadonlyArray<Extract<ProviderId, 'polygon' | 'finnhub' | 'yahoo'>>,
  data: Partial<Record<'polygon' | 'finnhub' | 'yahoo', T | null | undefined>>,
  key: K,
): { value: T[K] | null; source: FieldOrigin; entry: FallbackSummaryEntry } {
  const tried: ProviderId[] = [];
  for (const provider of cascadeOrder) {
    tried.push(provider);
    const candidate = data[provider];
    if (!candidate) continue;
    const v = candidate[key];
    if (v !== null && v !== undefined) {
      return {
        value: v,
        source: provider,
        entry: { field, tried, resolved_by: provider },
      };
    }
  }
  // All-null path — D-11: FieldOrigin set to 'unavailable' (not null).
  return {
    value: null,
    source: 'unavailable',
    entry: { field, tried, resolved_by: 'unavailable' },
  };
}

export function mergeMarketData(
  yahoo: MarketDataSection,
  finnhub: SupplementarySource | null,
  polygon: SupplementarySource | null,
): MarketDataSection {
  const data = {
    polygon: polygon?.market ?? null,
    finnhub: finnhub?.market ?? null,
    yahoo: yahooToMarket(yahoo),
  } as const;

  const merged: Partial<SupplementaryMarketFields> = {};
  const sources = {} as MarketDataFieldSources;
  const unavailable: string[] = [];
  const fallback_summary: FallbackSummaryEntry[] = [];

  for (const k of MARKET_KEYS) {
    const order = YAHOO_ONLY_MARKET_KEYS.has(k)
      ? YAHOO_ONLY_CASCADE_ORDER
      : SHARED_CASCADE_ORDER;
    const { value, source, entry } = resolveFieldFromCascade<SupplementaryMarketFields, typeof k>(
      k,
      order,
      data,
      k,
    );
    (merged as Record<string, unknown>)[k] = value;
    sources[k] = source;
    fallback_summary.push(entry);
    if (source === 'unavailable') unavailable.push(k);
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
    _fallback_summary: fallback_summary,
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
  const data = {
    polygon: polygon?.fundamentals ?? null,
    finnhub: finnhub?.fundamentals ?? null,
    yahoo: yahooToFundamentals(yahoo),
  } as const;

  const merged: Partial<SupplementaryFundamentalsFields> = {};
  const sources = {} as FundamentalsFieldSources;
  const unavailable: string[] = [];
  const fallback_summary: FallbackSummaryEntry[] = [];

  for (const k of FUNDAMENTAL_KEYS) {
    // All FUNDAMENTAL_KEYS are shared (Polygon + Finnhub both can cover them).
    const { value, source, entry } = resolveFieldFromCascade<SupplementaryFundamentalsFields, typeof k>(
      k,
      SHARED_CASCADE_ORDER,
      data,
      k,
    );
    (merged as Record<string, unknown>)[k] = value;
    sources[k] = source;
    fallback_summary.push(entry);
    if (source === 'unavailable') unavailable.push(k);
  }

  return {
    collected_at: yahoo.collected_at,
    pe_ratio: merged.pe_ratio ?? null,
    eps: merged.eps ?? null,
    revenue: merged.revenue ?? null,
    debt_to_equity: merged.debt_to_equity ?? null,
    profit_margin: merged.profit_margin ?? null,
    _field_sources: sources,
    _fallback_summary: fallback_summary,
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
    total_institutional_share: f.total_institutional_share ?? e.total_institutional_share,
    total_institutional_share_prev: f.total_institutional_share_prev ?? e.total_institutional_share_prev,
    net_share_change: f.net_share_change,
    net_share_change_pct: f.net_share_change_pct,
    fund_count_current: f.fund_count_current ?? e.fund_count_current,
    fund_count_prev: f.fund_count_prev ?? e.fund_count_prev,
    fund_count_delta: f.fund_count_delta,
    top10_concentration_pct: f.top10_concentration_pct ?? e.top10_concentration_pct,
    top10_concentration_pct_prev: f.top10_concentration_pct_prev ?? e.top10_concentration_pct_prev,
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
