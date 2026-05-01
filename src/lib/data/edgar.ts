// src/lib/data/edgar.ts
// Phase 17 — SEC EDGAR fallback module (REAL IMPLEMENTATION).
//
// This module provides three capabilities:
//   1. lookupCik(ticker)          — ticker → 10-digit CIK via the SEC's
//      company_tickers.json registry, cached for 24h in-memory.
//   2. fetchEdgarForm4(ticker, n) — fetch + parse the issuer's Form 4 (insider
//      transactions) filings over the last n days, aggregate into an
//      InsiderSnapshot. The canonical free source for insider activity.
//   3. fetchEdgar13F(ticker)      — fetch the issuer's recent SC 13D/13G
//      (>5% beneficial-ownership) filings and surface them as an approximate
//      InstitutionalSnapshot. SEC does NOT expose a per-ticker 13F-HR endpoint
//      (13F-HRs are filed BY funds, not OF tickers), so this is the closest
//      "smart money taking a real position" signal available without bulk
//      indexing every quarterly 13F across all filers.
//
// SEC requirements:
//   - Custom User-Agent including a name + email is mandatory.
//   - Rate limit: ≤10 req/s. We use 150ms between fetches inside this module
//     (≈6.6 req/s), comfortably under the limit.
//
// All public functions return null on any failure path — never throw.

import { XMLParser } from 'fast-xml-parser';
import type { InsiderSnapshot, InstitutionalSnapshot } from '@/lib/types';
import { classifyInsider } from './insider-classifier';
import { classifyInstitutional } from './institutional-classifier';

const SEC_UA = 'Cipher Research noreply@cipher.research';
const SEC_BASE = 'https://www.sec.gov';
const SEC_DATA_BASE = 'https://data.sec.gov';
const TIMEOUT_MS = 8000;
const PACE_MS = 150; // ≈6.6 req/s — well under SEC's 10 req/s limit.

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  trimValues: true,
});

// ── CIK lookup with 24h in-memory cache ──────────────────────────────────

interface CikRow {
  cik_str: number;
  ticker: string;
  title?: string;
}
let cikMap: Map<string, string> | null = null;
let cikMapLoadedAt = 0;
const CIK_TTL_MS = 24 * 3600 * 1000;

async function loadCikMap(): Promise<Map<string, string> | null> {
  if (cikMap && Date.now() - cikMapLoadedAt < CIK_TTL_MS) return cikMap;
  try {
    const res = await fetch(`${SEC_BASE}/files/company_tickers.json`, {
      headers: { 'User-Agent': SEC_UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, CikRow>;
    const map = new Map<string, string>();
    for (const row of Object.values(json)) {
      if (row?.ticker && typeof row.cik_str === 'number') {
        map.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, '0'));
      }
    }
    cikMap = map;
    cikMapLoadedAt = Date.now();
    return map;
  } catch {
    return null;
  }
}

export async function lookupCik(ticker: string): Promise<string | null> {
  const map = await loadCikMap();
  if (!map) return null;
  return map.get(ticker.toUpperCase()) ?? null;
}

// ── Submissions list (recent filings for a CIK) ──────────────────────────

interface SubmissionsRecent {
  form?: string[];
  filingDate?: string[];
  accessionNumber?: string[];
  primaryDocument?: string[];
}
interface SubmissionsResponse {
  filings?: { recent?: SubmissionsRecent };
}

async function fetchSubmissions(cik: string): Promise<SubmissionsRecent | null> {
  try {
    const res = await fetch(`${SEC_DATA_BASE}/submissions/CIK${cik}.json`, {
      headers: { 'User-Agent': SEC_UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as SubmissionsResponse;
    return json?.filings?.recent ?? null;
  } catch {
    return null;
  }
}

// Iterate the recent submissions arrays into a typed list of filings.
function listFilings(recent: SubmissionsRecent): Array<{
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
}> {
  const forms = recent.form ?? [];
  const dates = recent.filingDate ?? [];
  const accs = recent.accessionNumber ?? [];
  const docs = recent.primaryDocument ?? [];
  const n = Math.min(forms.length, dates.length, accs.length, docs.length);
  const out: Array<{ form: string; filingDate: string; accessionNumber: string; primaryDocument: string }> = [];
  for (let i = 0; i < n; i++) {
    out.push({ form: forms[i], filingDate: dates[i], accessionNumber: accs[i], primaryDocument: docs[i] });
  }
  return out;
}

// Build the URL for a filing's primary document.
// Accession is like "0001140361-26-017175" — strip dashes for the path.
function primaryDocUrl(cik: string, accession: string, primaryDocument: string): string {
  const accNoDash = accession.replace(/-/g, '');
  // CIK in the Archives path is unpadded.
  const cikUnpadded = String(parseInt(cik, 10));
  return `${SEC_BASE}/Archives/edgar/data/${cikUnpadded}/${accNoDash}/${primaryDocument}`;
}

async function pace(): Promise<void> {
  await new Promise((r) => setTimeout(r, PACE_MS));
}

// ── Form 4 (insider transactions) parser ─────────────────────────────────
//
// Form 4 XML (when the primary doc is XML; HTML wrappers are also common but
// the primary doc URL here is typically the structured XML "primary_doc.xml"):
//   <ownershipDocument>
//     <reportingOwner>
//       <reportingOwnerId><rptOwnerName>Smith John</rptOwnerName></reportingOwnerId>
//       <reportingOwnerRelationship>
//         <isDirector>1</isDirector>
//         <isOfficer>1</isOfficer>
//         <officerTitle>Chief Executive Officer</officerTitle>
//       </reportingOwnerRelationship>
//     </reportingOwner>
//     <nonDerivativeTable>
//       <nonDerivativeTransaction>
//         <transactionAmounts>
//           <transactionShares><value>1000</value></transactionShares>
//           <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
//           <transactionPricePerShare><value>275.50</value></transactionPricePerShare>
//         </transactionAmounts>
//         <transactionDate><value>2026-04-23</value></transactionDate>
//       </nonDerivativeTransaction>
//     </nonDerivativeTable>
//   </ownershipDocument>

interface ParsedForm4Tx {
  insiderName: string;
  isCeo: boolean;
  isCfo: boolean;
  isDirector: boolean;
  shares: number;
  acquiredDisposed: 'A' | 'D' | '';
  priceUsd: number;
  transactionDate: string;
  filingDate: string;
}

// Coerce to array — fast-xml-parser returns a single object when there's one
// element and an array when there are multiple. Normalize to array form.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asArray<T>(v: any): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function val(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node === 'object' && 'value' in node) return String(node.value ?? '');
  return '';
}

function parseForm4Xml(text: string, filingDate: string): ParsedForm4Tx[] {
  let parsed: unknown;
  try {
    parsed = xml.parse(text);
  } catch {
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = (parsed as any)?.ownershipDocument;
  if (!doc) return [];

  const owners = asArray<unknown>(doc.reportingOwner);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstOwner = owners[0] as any;
  const insiderName = val(firstOwner?.reportingOwnerId?.rptOwnerName) || 'Unknown';
  const rel = firstOwner?.reportingOwnerRelationship ?? {};
  const officerTitle = val(rel.officerTitle).toUpperCase();
  const isCeo = /\bCEO\b|\bCHIEF EXECUTIVE\b/.test(officerTitle);
  const isCfo = /\bCFO\b|\bCHIEF FINANCIAL\b/.test(officerTitle);
  const isDirector = String(val(rel.isDirector)) === '1' || String(val(rel.isDirector)) === 'true';

  const ndTable = doc.nonDerivativeTable ?? {};
  const txs = asArray<unknown>(ndTable.nonDerivativeTransaction);

  const out: ParsedForm4Tx[] = [];
  for (const tx of txs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tx as any;
    const amounts = t?.transactionAmounts ?? {};
    const sharesStr = val(amounts.transactionShares);
    const adcStr = val(amounts.transactionAcquiredDisposedCode);
    const priceStr = val(amounts.transactionPricePerShare);
    const txDate = val(t?.transactionDate);
    const shares = Number(sharesStr);
    if (!Number.isFinite(shares) || shares <= 0) continue;
    out.push({
      insiderName,
      isCeo,
      isCfo,
      isDirector,
      shares,
      acquiredDisposed: adcStr === 'A' ? 'A' : adcStr === 'D' ? 'D' : '',
      priceUsd: Number(priceStr) || 0,
      transactionDate: txDate || filingDate,
      filingDate,
    });
  }
  return out;
}

export async function fetchEdgarForm4(
  ticker: string,
  lookbackDays: number,
): Promise<InsiderSnapshot | null> {
  const cik = await lookupCik(ticker);
  if (!cik) return null;
  await pace();

  const recent = await fetchSubmissions(cik);
  if (!recent) return null;
  await pace();

  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);
  const form4Filings = listFilings(recent).filter((f) => {
    if (f.form !== '4') return false;
    const d = new Date(f.filingDate);
    return Number.isFinite(d.getTime()) && d >= cutoff;
  });

  if (form4Filings.length === 0) return null;

  // Cap fetches per ticker so we don't blow past throttle on heavy issuers.
  const MAX_FORM4_PER_TICKER = 30;
  const toFetch = form4Filings.slice(0, MAX_FORM4_PER_TICKER);

  const allTxs: ParsedForm4Tx[] = [];
  for (const filing of toFetch) {
    const url = primaryDocUrl(cik, filing.accessionNumber, filing.primaryDocument);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': SEC_UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        const text = await res.text();
        const parsed = parseForm4Xml(text, filing.filingDate);
        allTxs.push(...parsed);
      }
    } catch {
      // Skip this filing; continue.
    }
    await pace();
  }

  if (allTxs.length === 0) return null;

  // Aggregate into InsiderSnapshot.
  const buyers = new Set<string>();
  const sellers = new Set<string>();
  let net_buy_share_count = 0;
  let net_sell_share_count = 0;
  let buy_value_usd = 0;
  let sell_value_usd = 0;
  let has_ceo_buy = false;
  let has_cfo_buy = false;
  let has_director_buy = false;
  let earliest = '';
  let latest = '';

  for (const tx of allTxs) {
    const value = tx.shares * tx.priceUsd;
    if (tx.acquiredDisposed === 'A') {
      buyers.add(tx.insiderName);
      net_buy_share_count += tx.shares;
      buy_value_usd += value;
      if (tx.isCeo) has_ceo_buy = true;
      if (tx.isCfo) has_cfo_buy = true;
      if (tx.isDirector) has_director_buy = true;
    } else if (tx.acquiredDisposed === 'D') {
      sellers.add(tx.insiderName);
      net_sell_share_count += tx.shares;
      sell_value_usd += value;
    }
    if (!earliest || tx.filingDate < earliest) earliest = tx.filingDate;
    if (!latest || tx.filingDate > latest) latest = tx.filingDate;
  }

  const filings_count = allTxs.length;
  const data_age_days = latest
    ? Math.max(0, Math.floor((Date.now() - new Date(latest).getTime()) / 86_400_000))
    : null;

  const snapshot: InsiderSnapshot = {
    insider_bucket: null,
    distinct_buyers: buyers.size,
    distinct_sellers: sellers.size,
    net_buy_share_count,
    net_sell_share_count,
    buy_value_usd: buy_value_usd > 0 ? buy_value_usd : null,
    sell_value_usd: sell_value_usd > 0 ? sell_value_usd : null,
    has_ceo_buy,
    has_cfo_buy,
    has_director_buy,
    is_planned_10b5_1: false, // EDGAR Form 4 footnotes hold this; not parsed here.
    filings_count,
    earliest_filing_date: earliest || null,
    latest_filing_date: latest || null,
    data_age_days,
    computed_at: new Date().toISOString(),
    data_source: 'edgar',
    insider_sentiment_mspr: null,
  };
  snapshot.insider_bucket = classifyInsider(snapshot);
  return snapshot;
}

// ── 13F-style fallback via SC 13D / SC 13G filings ───────────────────────
//
// SEC has no per-ticker 13F-HR aggregation endpoint. The closest free signal
// for "smart money is taking a real position in this ticker" is the SC 13D
// and SC 13G family (Schedule 13D/G beneficial ownership > 5%). These ARE
// indexed under the issuer's CIK on the submissions endpoint.
//
// We surface a count of recent SC 13D/G filings as fund_count_current. This
// is a conservative approximation; the classifier rules that depend on
// quarter-over-quarter share deltas won't fire (deltas are 0), but
// new_initiation / complete_exit can still classify if filings appeared
// in the current period vs prior.

const LARGE_POSITION_FORMS = new Set(['SC 13D', 'SC 13D/A', 'SC 13G', 'SC 13G/A']);

export async function fetchEdgar13F(ticker: string): Promise<InstitutionalSnapshot | null> {
  const cik = await lookupCik(ticker);
  if (!cik) return null;
  await pace();

  const recent = await fetchSubmissions(cik);
  if (!recent) return null;

  const filings = listFilings(recent).filter((f) => LARGE_POSITION_FORMS.has(f.form));
  if (filings.length === 0) return null;

  const now = Date.now();
  const last90 = filings.filter((f) => {
    const t = new Date(f.filingDate).getTime();
    return Number.isFinite(t) && now - t <= 90 * 86_400_000;
  });
  const prev90 = filings.filter((f) => {
    const t = new Date(f.filingDate).getTime();
    return Number.isFinite(t) && now - t > 90 * 86_400_000 && now - t <= 180 * 86_400_000;
  });

  const fund_count_current = last90.length;
  const fund_count_prev = prev90.length;
  const fund_count_delta = fund_count_current - fund_count_prev;

  const latest = last90[0]?.filingDate || filings[0]?.filingDate || '';
  const data_age_days = latest
    ? Math.max(0, Math.floor((now - new Date(latest).getTime()) / 86_400_000))
    : 0;

  const snapshot: InstitutionalSnapshot = {
    institutional_bucket: null,
    total_institutional_share: 0,            // Not derivable from SC 13D/G count alone.
    total_institutional_share_prev: 0,
    net_share_change: 0,
    net_share_change_pct: 0,
    fund_count_current,
    fund_count_prev,
    fund_count_delta,
    top10_concentration_pct: 0,
    top10_concentration_pct_prev: 0,
    ticker_30d_return_pct: null,
    spy_30d_return_pct: null,
    report_date: latest,
    filing_date: latest,
    data_age_days,
    computed_at: new Date().toISOString(),
    data_source: 'edgar',
  };
  snapshot.institutional_bucket = classifyInstitutional(snapshot);
  return snapshot;
}
