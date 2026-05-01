// src/lib/data/institutional.ts
// Phase 17 — Institutional ownership (13F) fetcher.
// Finnhub primary, SEC EDGAR fallback (D-07). Returns InstitutionalSnapshot
// or null. Latest 13F vs prior quarter comparison (D-11).
//
// 30d-return cross-reference (Open Question 3 RESOLVED): yahoo-finance2 chart()
// for ticker AND SPY over a 32-day window centered on (snapshot_date - 30d).
//
// Failure semantics: HTTP 429 / 4xx / 5xx / parse error / timeout / throw → null.
// Empty Finnhub `data: []` → fetchEdgar13F (currently stub → null).
// 5s AbortSignal timeout per Finnhub fetch.

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

async function fetch30dReturn(ticker: string, asOf: Date): Promise<number | null> {
  // Open Question 3: 32-day window centered on (asOf - 30d). Pick closest bar.
  const center = new Date(asOf.getTime() - 30 * 86_400_000);
  const period1 = new Date(center.getTime() - 16 * 86_400_000);
  const period2 = new Date(center.getTime() + 16 * 86_400_000);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (yf as any).chart(ticker, { period1, period2, interval: '1d' }) as { quotes?: Array<{ date?: Date; close?: number | null }> };
    const quotes = raw?.quotes ?? [];
    if (quotes.length === 0) return null;
    let best: { date: Date; close: number } | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const q of quotes) {
      if (q.date == null || q.close == null) continue;
      const d = Math.abs(q.date.getTime() - center.getTime());
      if (d < bestDelta) { bestDelta = d; best = { date: q.date, close: q.close }; }
    }
    if (!best) return null;
    const todayQuote = await yf.quote(ticker).catch(() => null);
    const today = todayQuote?.regularMarketPrice;
    if (typeof today !== 'number' || best.close === 0) return null;
    return ((today - best.close) / best.close) * 100;
  } catch {
    return null;
  }
}

export async function fetchInstitutionalData(
  ticker: string,
  asOf: Date = new Date(),
): Promise<InstitutionalSnapshot | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return fetchEdgar13F(ticker);

  let quarters: FinnhubInstQuarter[] = [];
  try {
    const url = `${FINNHUB_BASE}/stock/institutional-ownership?symbol=${encodeURIComponent(ticker)}&token=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return fetchEdgar13F(ticker);
    const json = await res.json() as { data?: FinnhubInstQuarter[] };
    quarters = Array.isArray(json?.data) ? json.data : [];
  } catch {
    return fetchEdgar13F(ticker);
  }

  if (quarters.length === 0) return fetchEdgar13F(ticker);

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
