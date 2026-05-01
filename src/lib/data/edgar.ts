// src/lib/data/edgar.ts
// Phase 17 — SEC EDGAR fallback module (STUB).
//
// D-09: implementation is empirically gated. If §3.1 measurement (run via
// scripts/validate-finnhub-coverage.ts) shows Finnhub coverage ≥95% on the
// 200-ticker watchlist for both insider AND 13F endpoints, EDGAR stays a thin
// null-guard (this stub). If <95% on either, plan 17-05 (closeout) installs
// `fast-xml-parser@4.5.1` and replaces these stubs with real XML parsers per
// 17-RESEARCH §3.2 lines 681-691.
//
// Throttle (when fleshed out): SEC mandates ≤10 req/s and `User-Agent: <name> <email>` header.
// Endpoints (when fleshed out):
//   - https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=4&...
//   - https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=13F-HR&...
//   - https://www.sec.gov/files/company_tickers.json   (CIK lookup, cache 24h in /tmp)

import type { InsiderSnapshot, InstitutionalSnapshot } from '@/lib/types';

export async function lookupCik(_ticker: string): Promise<string | null> {
  return null;   // STUB
}

export async function fetchEdgarForm4(
  _ticker: string,
  _lookbackDays: number,
): Promise<InsiderSnapshot | null> {
  return null;   // STUB — Finnhub-only mode (D-09 thin null-guard)
}

export async function fetchEdgar13F(_ticker: string): Promise<InstitutionalSnapshot | null> {
  return null;   // STUB — Finnhub-only mode (D-09 thin null-guard)
}
