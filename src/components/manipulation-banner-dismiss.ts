// src/components/manipulation-banner-dismiss.ts
//
// Plan 20-C-04 — Banner dismissal helpers for the pump-and-dump UI warning.
// Dismissal is per-(ticker, UTC-day) with a 24h TTL. CONTEXT.md spec line 127:
// "persists for 24h then auto-clears". Keys live in localStorage under:
//   pump_dump_dismissed:{TICKER}:{YYYY-MM-DD}
// The value is the dismissal timestamp (ms since epoch) — the TTL is enforced
// at read-time so stale entries from yesterday's date naturally fall away
// even before the storage entry is reclaimed.
//
// SSR-safe — every function no-ops when `typeof window === 'undefined'`.
// This module deliberately ships with NO React deps so it can be unit-tested
// without jsdom and consumed from both the banner component and the
// Playwright spec via plain JS evaluation in the page context.

const TTL_MS = 24 * 3600 * 1000;

function dismissKey(ticker: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return `pump_dump_dismissed:${ticker}:${today}`;
}

/**
 * True iff the banner for `ticker` was dismissed within the last 24h.
 * Returns false on the server (no window) — banner renders on first paint
 * if its other gates are satisfied; the client-side effect re-evaluates
 * after hydration. T-20-C-04-03 mitigation.
 */
export function isDismissed(ticker: string): boolean {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(dismissKey(ticker));
  if (!raw) return false;
  const dismissedAt = parseInt(raw, 10);
  if (!Number.isFinite(dismissedAt)) return false;
  return (Date.now() - dismissedAt) <= TTL_MS;
}

/**
 * Writes `Date.now()` under the per-(ticker, UTC-day) key. Called by the
 * banner's X button onClick. No-op on the server.
 */
export function dismissBanner(ticker: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(dismissKey(ticker), String(Date.now()));
}
