// src/lib/data/insider.ts
// Phase 17 — Insider transactions (Form 4) fetcher.
// Finnhub primary, SEC EDGAR fallback (D-07). Returns InsiderSnapshot or null.
// Lookback: 30 days trailing (matches 30d primary horizon — D-10).
//
// Failure semantics (Pitfall 1 + Pitfall 4):
//   - HTTP 429 / 4xx / 5xx / parse error / timeout / thrown exception → falls through.
//   - Empty Finnhub `data: []` → falls through to fetchEdgarForm4 (REAL parser as of
//     2026-05-01: pulls Form 4 XML primary docs from data.sec.gov and aggregates).
//   - Final null only if both Finnhub AND EDGAR yield nothing for this ticker.
//   - 5s AbortSignal timeout per fetch.
//   - NEVER throws.

import type { InsiderBucket, InsiderSnapshot } from '@/lib/types';
import { classifyInsider } from './insider-classifier';
import { fetchEdgarForm4 } from './edgar';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const LOOKBACK_DAYS = 30;
const TIMEOUT_MS = 5000;

interface FinnhubInsiderTx {
  name?: string;
  share?: number;
  change?: number;
  filingDate?: string;
  transactionDate?: string;
  transactionCode?: string;
  transactionPrice?: number;
  isDerivative?: boolean;
}

function isoDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function detectTitle(name: string): { ceo: boolean; cfo: boolean; director: boolean } {
  // Finnhub does not return a structured title. Best-effort regex over the
  // insider name string. Pitfall 7: defensive default — if title can't be
  // inferred, fall back to lone/cluster classification by count only.
  const upper = (name ?? '').toUpperCase();
  return {
    ceo: /\bCEO\b|\bCHIEF EXECUTIVE\b/.test(upper),
    cfo: /\bCFO\b|\bCHIEF FINANCIAL\b/.test(upper),
    director: /\bDIRECTOR\b/.test(upper),
  };
}

function detect10b5_1(_tx: FinnhubInsiderTx): boolean {
  // Pitfall 7: Finnhub free tier doesn't expose the 10b5-1 indicator
  // reliably. Plan 17-05 closeout audits whether this matters in practice;
  // if histogram shows 0 hits despite known events, drop the bucket.
  // For now: always false. EDGAR XML parse would set this if fleshed out.
  return false;
}

export async function fetchInsiderData(
  ticker: string,
  asOf: Date = new Date(),
): Promise<InsiderSnapshot | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return fetchEdgarForm4(ticker, LOOKBACK_DAYS);

  const from = isoDateNDaysAgo(LOOKBACK_DAYS);
  const to = asOf.toISOString().slice(0, 10);

  let txs: FinnhubInsiderTx[] = [];
  try {
    const url = `${FINNHUB_BASE}/stock/insider-transactions?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return fetchEdgarForm4(ticker, LOOKBACK_DAYS);
    const json = await res.json() as { data?: FinnhubInsiderTx[]; symbol?: string };
    txs = Array.isArray(json?.data) ? json.data : [];
  } catch {
    return fetchEdgarForm4(ticker, LOOKBACK_DAYS);
  }

  if (txs.length === 0) return fetchEdgarForm4(ticker, LOOKBACK_DAYS);

  // Best-effort cross-reference: latest month's MSPR (insider-sentiment endpoint).
  let mspr: number | null = null;
  try {
    const url = `${FINNHUB_BASE}/stock/insider-sentiment?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok) {
      const json = await res.json() as { data?: Array<{ mspr?: number }> };
      const last = (json?.data ?? []).at(-1);
      if (last && typeof last.mspr === 'number' && Number.isFinite(last.mspr)) mspr = last.mspr;
    }
  } catch { /* non-fatal — leave mspr null */ }

  // Bucket the transactions into buyers / sellers
  const buyers = new Set<string>();
  const sellers = new Set<string>();
  let net_buy_share_count = 0;
  let net_sell_share_count = 0;
  let buy_value_usd = 0;
  let sell_value_usd = 0;
  let has_ceo_buy = false;
  let has_cfo_buy = false;
  let has_director_buy = false;
  let is_planned_10b5_1 = false;
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const tx of txs) {
    const change = typeof tx.change === 'number' ? tx.change : 0;
    const price = typeof tx.transactionPrice === 'number' ? tx.transactionPrice : null;
    const name = tx.name ?? '';
    const filing = typeof tx.filingDate === 'string' ? tx.filingDate : null;
    if (filing) {
      if (!earliest || filing < earliest) earliest = filing;
      if (!latest || filing > latest) latest = filing;
    }
    if (change > 0) {
      buyers.add(name);
      net_buy_share_count += change;
      if (price != null) buy_value_usd += change * price;
      const t = detectTitle(name);
      if (t.ceo) has_ceo_buy = true;
      if (t.cfo) has_cfo_buy = true;
      if (t.director) has_director_buy = true;
    } else if (change < 0) {
      sellers.add(name);
      net_sell_share_count += Math.abs(change);
      if (price != null) sell_value_usd += Math.abs(change) * price;
      if (detect10b5_1(tx)) is_planned_10b5_1 = true;
    }
  }

  const data_age_days = latest
    ? Math.max(0, Math.floor((asOf.getTime() - new Date(latest).getTime()) / 86_400_000))
    : null;

  const snapshot: InsiderSnapshot = {
    insider_bucket: null,   // filled in below
    distinct_buyers: buyers.size,
    distinct_sellers: sellers.size,
    net_buy_share_count,
    net_sell_share_count,
    buy_value_usd: buy_value_usd > 0 ? buy_value_usd : null,
    sell_value_usd: sell_value_usd > 0 ? sell_value_usd : null,
    has_ceo_buy,
    has_cfo_buy,
    has_director_buy,
    is_planned_10b5_1,
    filings_count: txs.length,
    earliest_filing_date: earliest,
    latest_filing_date: latest,
    data_age_days,
    computed_at: asOf.toISOString(),
    data_source: 'finnhub',
    insider_sentiment_mspr: mspr,
  };

  const bucket: InsiderBucket | null = classifyInsider(snapshot);
  return { ...snapshot, insider_bucket: bucket };
}
