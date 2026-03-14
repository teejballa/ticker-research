// src/lib/formatters.ts
// Display formatting utilities for the research report.
// All functions are pure — no side effects, safe to use in both client and server contexts.

/**
 * Formats an ISO 8601 timestamp into a human-readable date/time string.
 * Example: "2026-03-13T14:32:00Z" → "March 13, 2026 at 2:32 PM"
 */
export function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Formats a market cap (or large dollar value) into a human-readable shorthand.
 * Examples: 2_100_000_000_000 → "$2.1T", 450_000_000_000 → "$450.0B", null → "—"
 */
export function formatMarketCap(value: number | null | undefined): string {
  if (value == null) return '—';
  const T = 1e12;
  const B = 1e9;
  const M = 1e6;
  if (value >= T) return `$${(value / T).toFixed(1)}T`;
  if (value >= B) return `$${(value / B).toFixed(1)}B`;
  if (value >= M) return `$${(value / M).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

/**
 * Formats a decimal fraction as a percentage with explicit sign.
 * Examples: 0.0234 → "+2.34%", -0.012 → "-1.20%", null → "—"
 * Note: value is a decimal fraction (0.02 = 2%) — multiplied by 100 before display.
 */
export function formatPercent(value: number | null): string {
  if (value == null) return '—';
  const pct = value * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Formats a price with $ prefix and 2 decimal places.
 * Examples: 182.63 → "$182.63", null → "—"
 */
export function formatPrice(value: number | null): string {
  if (value == null) return '—';
  return `$${value.toFixed(2)}`;
}
