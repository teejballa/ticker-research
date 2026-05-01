// src/lib/data/institutional.ts
// Phase 17 — Institutional ownership (13F) fetcher.
//
// Source priority (post-2026-05-01 yahoo upgrade):
//   1. yahoo-finance2 quoteSummary {institutionOwnership, majorHoldersBreakdown}
//      — yahoo aggregates 13F data into institutionsCount + top-10 ownership list
//      with quarter-over-quarter pctChange, free, no API key, fast.
//   2. Finnhub /stock/institutional-ownership (premium-only on Finnhub free tier;
//      kept here for users who upgrade their Finnhub plan).
//   3. fetchEdgar13F (real SEC EDGAR fallback — SC 13D/13G recent-filer count).
//
// Returns InstitutionalSnapshot or null. Latest filing vs prior period comparison.
//
// 30d-return cross-reference: yahoo-finance2 chart() for ticker AND SPY over a
// 32-day window centered on (snapshot_date - 30d).
//
// Failure semantics: HTTP 429 / 4xx / 5xx / parse error / timeout / throw → null
// at each tier; falls through to next tier. Final null only when all tiers fail.
// 5s AbortSignal timeout per network fetch.

import YahooFinance from 'yahoo-finance2';
import type { InstitutionalBucket, InstitutionalSnapshot } from '@/lib/types';
import { classifyInstitutional } from './institutional-classifier';
import { fetchEdgar13F } from './edgar';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const TIMEOUT_MS = 5000;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface FinnhubFundHolding {
  name?: string;
  share?: number;
  change?: number;
  filingDate?: string;
  putCallShare?: number | null;
  putCallChange?: number | null;
}
interface FinnhubInstQuarter {
  reportDate?: string;
  filingDate?: string;
  ownership?: FinnhubFundHolding[];
}

function topNConcentrationPct(holdings: FinnhubFundHolding[], n: number): number {
  if (holdings.length === 0) return 0;
  const total = holdings.reduce((s, h) => s + (typeof h.share === 'number' ? h.share : 0), 0);
  if (total === 0) return 0;
  const sorted = [...holdings].sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, n);
  const topSum = sorted.reduce((s, h) => s + (typeof h.share === 'number' ? h.share : 0), 0);
  return topSum / total;
}

// Module-level cache for fetch30dReturn results, keyed by `${ticker}|${asOfDay}`.
// IN-04: avoids 200 redundant SPY quote+chart fetches per cron cycle when
// fetchInstitutionalData is invoked once per ticker in the watchlist scan.
// 60s TTL is short enough to be safe across multiple cron triggers but long
// enough to dedupe within a single sweep (which completes in <60s typically).
const RETURN_CACHE_TTL_MS = 60_000;
interface ReturnCacheEntry { value: number | null; cachedAt: number; }
const returnCache = new Map<string, ReturnCacheEntry>();

async function fetch30dReturn(ticker: string, asOf: Date): Promise<number | null> {
  // Cache key includes ticker + UTC day so cross-day cron triggers don't
  // accidentally reuse a stale 30d window.
  const cacheKey = `${ticker}|${asOf.toISOString().slice(0, 10)}`;
  const cached = returnCache.get(cacheKey);
  if (cached && (Date.now() - cached.cachedAt) < RETURN_CACHE_TTL_MS) {
    return cached.value;
  }

  // Open Question 3: 32-day window centered on (asOf - 30d). Pick closest bar.
  const center = new Date(asOf.getTime() - 30 * 86_400_000);
  const period1 = new Date(center.getTime() - 16 * 86_400_000);
  const period2 = new Date(center.getTime() + 16 * 86_400_000);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (yf as any).chart(ticker, { period1, period2, interval: '1d' }) as { quotes?: Array<{ date?: Date; close?: number | null }> };
    const quotes = raw?.quotes ?? [];
    if (quotes.length === 0) {
      returnCache.set(cacheKey, { value: null, cachedAt: Date.now() });
      return null;
    }
    let best: { date: Date; close: number } | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const q of quotes) {
      if (q.date == null || q.close == null) continue;
      const d = Math.abs(q.date.getTime() - center.getTime());
      if (d < bestDelta) { bestDelta = d; best = { date: q.date, close: q.close }; }
    }
    if (!best) {
      returnCache.set(cacheKey, { value: null, cachedAt: Date.now() });
      return null;
    }
    const todayQuote = await yf.quote(ticker).catch(() => null);
    const today = todayQuote?.regularMarketPrice;
    if (typeof today !== 'number' || best.close === 0) {
      returnCache.set(cacheKey, { value: null, cachedAt: Date.now() });
      return null;
    }
    const value = ((today - best.close) / best.close) * 100;
    returnCache.set(cacheKey, { value, cachedAt: Date.now() });
    return value;
  } catch {
    returnCache.set(cacheKey, { value: null, cachedAt: Date.now() });
    return null;
  }
}

// ── Tier 1: yahoo-finance2 quoteSummary ──────────────────────────────────
// Yahoo aggregates the SEC's 13F filings into convenient per-ticker shape.
// Free, no API key, fast (single quoteSummary call).
async function fetchYahooInstitutional(
  ticker: string,
  asOf: Date,
): Promise<InstitutionalSnapshot | null> {
  try {
    const summary = await yf.quoteSummary(ticker, {
      modules: ['institutionOwnership', 'majorHoldersBreakdown'],
    });
    const breakdown = summary.majorHoldersBreakdown;
    const holders = summary.institutionOwnership?.ownershipList ?? [];
    if (holders.length === 0 || !breakdown) return null;

    // Sum top-10 positions as a proxy for total_institutional_share.
    // Reconstruct prior-period values via each holder's pctChange.
    let totalCurrent = 0;
    let totalPrev = 0;
    let topPctHeldCurrent = 0;
    let topPctHeldPrev = 0;
    let latestReportDate: Date | null = null;
    for (const h of holders) {
      const pos = typeof h.position === 'number' ? h.position : 0;
      const pct = typeof h.pctHeld === 'number' ? h.pctHeld : 0;
      const chg = typeof h.pctChange === 'number' ? h.pctChange : 0;
      totalCurrent += pos;
      // Reverse pctChange to estimate prior position. Guard divide-by-zero
      // (chg = -1.0 means position was just opened; treat prev as 0).
      const prevPos = chg > -1 ? pos / (1 + chg) : 0;
      totalPrev += prevPos;
      topPctHeldCurrent += pct;
      const prevPct = chg > -1 ? pct / (1 + chg) : 0;
      topPctHeldPrev += prevPct;
      if (h.reportDate instanceof Date && (!latestReportDate || h.reportDate > latestReportDate)) {
        latestReportDate = h.reportDate;
      }
    }

    const fundCountCurrent = typeof breakdown.institutionsCount === 'number' ? breakdown.institutionsCount : 0;
    // Yahoo doesn't expose institutionsCount delta; fund_count_prev defaults to
    // current. Classifier rules using fund_count_delta (new_initiation,
    // complete_exit) won't fire on yahoo data — intentional, since yahoo only
    // surfaces tickers that already have institutional coverage.
    const fundCountPrev = fundCountCurrent;

    const net_share_change = totalCurrent - totalPrev;
    const net_share_change_pct = totalPrev > 0 ? net_share_change / totalPrev : 0;

    const reportIso = latestReportDate ? latestReportDate.toISOString().slice(0, 10) : '';
    const data_age_days = latestReportDate
      ? Math.max(0, Math.floor((asOf.getTime() - latestReportDate.getTime()) / 86_400_000))
      : 0;

    const [ticker_30d_return_pct, spy_30d_return_pct] = await Promise.all([
      fetch30dReturn(ticker, asOf),
      fetch30dReturn('SPY', asOf),
    ]);

    const snapshot: InstitutionalSnapshot = {
      institutional_bucket: null,
      total_institutional_share: totalCurrent,
      total_institutional_share_prev: totalPrev,
      net_share_change,
      net_share_change_pct,
      fund_count_current: fundCountCurrent,
      fund_count_prev: fundCountPrev,
      fund_count_delta: 0,
      top10_concentration_pct: topPctHeldCurrent,
      top10_concentration_pct_prev: topPctHeldPrev,
      ticker_30d_return_pct,
      spy_30d_return_pct,
      report_date: reportIso,
      filing_date: reportIso, // Yahoo doesn't expose filing date separately; use report_date as approximation.
      data_age_days,
      computed_at: asOf.toISOString(),
      data_source: 'yahoo',
    };

    const bucket: InstitutionalBucket | null = classifyInstitutional(snapshot);
    return { ...snapshot, institutional_bucket: bucket };
  } catch {
    return null;
  }
}

// ── Tier 2: Finnhub (premium-only endpoint; null on free tier) ───────────
async function fetchFinnhubInstitutional(
  ticker: string,
  asOf: Date,
): Promise<InstitutionalSnapshot | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  let quarters: FinnhubInstQuarter[] = [];
  try {
    const url = `${FINNHUB_BASE}/stock/institutional-ownership?symbol=${encodeURIComponent(ticker)}&token=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = await res.json() as { data?: FinnhubInstQuarter[] };
    quarters = Array.isArray(json?.data) ? json.data : [];
  } catch {
    return null;
  }

  if (quarters.length === 0) return null;

  const current = quarters[0];
  const prev = quarters[1] ?? { ownership: [], reportDate: undefined, filingDate: undefined };
  const currentOwn = current.ownership ?? [];
  const prevOwn = prev.ownership ?? [];

  const total_institutional_share = currentOwn.reduce((s, h) => s + (typeof h.share === 'number' ? h.share : 0), 0);
  const total_institutional_share_prev = prevOwn.reduce((s, h) => s + (typeof h.share === 'number' ? h.share : 0), 0);
  const net_share_change = total_institutional_share - total_institutional_share_prev;
  const net_share_change_pct = total_institutional_share_prev > 0
    ? net_share_change / total_institutional_share_prev
    : 0;

  const top10_concentration_pct = topNConcentrationPct(currentOwn, 10);
  const top10_concentration_pct_prev = topNConcentrationPct(prevOwn, 10);

  const [ticker_30d_return_pct, spy_30d_return_pct] = await Promise.all([
    fetch30dReturn(ticker, asOf),
    fetch30dReturn('SPY', asOf),
  ]);

  const filing_date = current.filingDate ?? '';
  const report_date = current.reportDate ?? '';
  const data_age_days = filing_date
    ? Math.max(0, Math.floor((asOf.getTime() - new Date(filing_date).getTime()) / 86_400_000))
    : 0;

  const snapshot: InstitutionalSnapshot = {
    institutional_bucket: null,
    total_institutional_share,
    total_institutional_share_prev,
    net_share_change,
    net_share_change_pct,
    fund_count_current: currentOwn.length,
    fund_count_prev: prevOwn.length,
    fund_count_delta: currentOwn.length - prevOwn.length,
    top10_concentration_pct,
    top10_concentration_pct_prev,
    ticker_30d_return_pct,
    spy_30d_return_pct,
    report_date,
    filing_date,
    data_age_days,
    computed_at: asOf.toISOString(),
    data_source: 'finnhub',
  };

  const bucket: InstitutionalBucket | null = classifyInstitutional(snapshot);
  return { ...snapshot, institutional_bucket: bucket };
}

// ── Public orchestrator: yahoo → Finnhub → EDGAR → null ─────────────────
export async function fetchInstitutionalData(
  ticker: string,
  asOf: Date = new Date(),
): Promise<InstitutionalSnapshot | null> {
  // Tier 1: yahoo (works for ~all listed tickers, free)
  const yahoo = await fetchYahooInstitutional(ticker, asOf);
  if (yahoo) return yahoo;

  // Tier 2: Finnhub (only useful with premium plan; returns null on 404)
  const finnhub = await fetchFinnhubInstitutional(ticker, asOf);
  if (finnhub) return finnhub;

  // Tier 3: EDGAR fallback (SC 13D/13G recent-filer count when both above fail)
  return fetchEdgar13F(ticker);
}
