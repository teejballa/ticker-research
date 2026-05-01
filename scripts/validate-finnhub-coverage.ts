// scripts/validate-finnhub-coverage.ts
// Phase 17 — One-shot CLI to measure Finnhub coverage on the existing
// watchlist for both insider-transactions and institutional-ownership endpoints.
//
// D-09 decision rule: if BOTH endpoints have ≥95% coverage on US-listed tickers,
// EDGAR fallback in src/lib/data/edgar.ts stays a thin null-guard (current stub
// is sufficient). If EITHER is below 95%, plan 17-05 closeout installs
// fast-xml-parser@4.5.1 and fleshes out edgar.ts.
//
// Usage:
//   npx tsx scripts/validate-finnhub-coverage.ts
//
// No DB writes — read-only Finnhub probes. 1.1s throttle per fetch
// (60 req/min headroom — Finnhub free tier).

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { getCurrentWatchlist } from '../src/lib/data/ticker-watchlist';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const THROTTLE_MS = 1100;

function isoDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    console.error('FINNHUB_API_KEY not set in .env.local');
    process.exit(1);
  }

  const tickers = getCurrentWatchlist();
  console.log(`validate-finnhub-coverage — ${tickers.length} tickers`);

  const from = isoDateNDaysAgo(30);
  const to = isoDateNDaysAgo(0);

  let insiderCovered = 0;
  let institutionalCovered = 0;
  let insider429 = 0;
  let institutional429 = 0;
  const insiderMissing: string[] = [];
  const institutionalMissing: string[] = [];

  for (const t of tickers) {
    // Insider probe
    try {
      const url = `${FINNHUB_BASE}/stock/insider-transactions?symbol=${encodeURIComponent(t)}&from=${from}&to=${to}&token=${key}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.status === 429) insider429++;
      else if (res.ok) {
        const json = await res.json() as { data?: unknown[] };
        if (Array.isArray(json.data) && json.data.length > 0) insiderCovered++;
        else insiderMissing.push(t);
      } else {
        insiderMissing.push(t);
      }
    } catch {
      insiderMissing.push(t);
    }

    // 13F probe
    try {
      const url = `${FINNHUB_BASE}/stock/institutional-ownership?symbol=${encodeURIComponent(t)}&token=${key}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.status === 429) institutional429++;
      else if (res.ok) {
        const json = await res.json() as { data?: Array<{ ownership?: unknown[] }> };
        const top = Array.isArray(json.data) ? json.data[0] : null;
        if (top && Array.isArray(top.ownership) && top.ownership.length > 0) institutionalCovered++;
        else institutionalMissing.push(t);
      } else {
        institutionalMissing.push(t);
      }
    } catch {
      institutionalMissing.push(t);
    }

    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  const total = tickers.length;
  const insiderPct = ((insiderCovered / total) * 100).toFixed(1);
  const institutionalPct = ((institutionalCovered / total) * 100).toFixed(1);

  console.log('\n──────────────────────────────────────────────');
  console.log(`insider coverage:        ${insiderCovered}/${total}  (${insiderPct}%)`);
  console.log(`13F coverage:            ${institutionalCovered}/${total}  (${institutionalPct}%)`);
  if (insider429 > 0) console.log(`insider 429s:            ${insider429}`);
  if (institutional429 > 0) console.log(`13F 429s:                ${institutional429}`);
  console.log('──────────────────────────────────────────────');

  const insiderOk = insiderCovered / total >= 0.95;
  const instOk = institutionalCovered / total >= 0.95;
  console.log(`\nD-09 decision: insider≥95% ${insiderOk ? 'YES' : 'NO'}, 13F≥95% ${instOk ? 'YES' : 'NO'}`);
  if (insiderOk && instOk) {
    console.log('→ EDGAR stays a thin null-guard. No fast-xml-parser install needed.');
  } else {
    console.log('→ EDGAR must become co-equal. Plan 17-05 closeout installs fast-xml-parser@4.5.1 and fleshes out src/lib/data/edgar.ts.');
    if (!insiderOk) console.log(`  Insider missing (sample): ${insiderMissing.slice(0, 10).join(', ')}`);
    if (!instOk) console.log(`  13F missing (sample): ${institutionalMissing.slice(0, 10).join(', ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
