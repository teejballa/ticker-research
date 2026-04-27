// src/lib/research-brief.ts
// Formats a SourcePackage into structured text and a URL list for the Gemini analysis prompt.
// Consumed by src/lib/gemini-analysis.ts.

import type { SourcePackage } from './types';

// ---- Helpers ----

/**
 * Null-safe value formatter. Returns 'N/A' for null/undefined.
 */
function fmt(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  return String(val);
}

/**
 * Format a dollar amount: returns 'N/A' for null, or '$X.XX' for numbers.
 */
function fmtDollar(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  return `$${val.toFixed(2)}`;
}

/**
 * Format a large number (market cap, revenue) in human-readable shorthand.
 * Thresholds: >= 1T → T, >= 1B → B, >= 1M → M.
 * Returns 'N/A' for null.
 */
function fmtLargeNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'N/A';
  const T = 1_000_000_000_000;
  const B = 1_000_000_000;
  const M = 1_000_000;
  if (Math.abs(n) >= T) return `$${(n / T).toFixed(2)}T`;
  if (Math.abs(n) >= B) return `$${(n / B).toFixed(2)}B`;
  if (Math.abs(n) >= M) return `$${(n / M).toFixed(2)}M`;
  return `$${n.toFixed(2)}`;
}

/**
 * Format a percentage with explicit sign and 2 decimal places.
 * Returns 'N/A' for null.
 */
function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

/**
 * Format a plain percentage (no sign) with 2 decimal places.
 * Returns 'N/A' for null.
 */
function fmtPctPlain(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  return `${val.toFixed(2)}%`;
}

/**
 * Format a number with no special treatment — just toString.
 * Returns 'N/A' for null.
 */
function fmtNum(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  return String(val);
}

// ---- Public API ----

/**
 * Formats a SourcePackage into a structured plain-text research brief string.
 * The brief is consumed as the source-grounded context for the Gemini prompt.
 *
 * Sections: header, MARKET DATA, FUNDAMENTALS, ANALYST SENTIMENT,
 *           SEC FILINGS, SOCIAL SENTIMENT, COLLECTION NOTES
 */
export function formatResearchBrief(pkg: SourcePackage): string {
  const lines: string[] = [];

  // Header
  lines.push(`=== TICKER RESEARCH BRIEF: ${pkg.ticker.toUpperCase()} ===`);
  lines.push(`Company: ${fmt(pkg.company_name)}`);
  lines.push(`Exchange: ${fmt(pkg.exchange)}`);
  lines.push(`Data Assembled: ${fmt(pkg.assembled_at)}`);
  const suppCount = pkg.supplementary_market_data?.sources?.filter(s => s.available).length ?? 0;
  const suppNames = suppCount > 0
    ? pkg.supplementary_market_data.sources.filter(s => s.available).map(s => s.name).join(', ')
    : 'none';
  lines.push(`Supplementary Sources Included: ${suppCount} (${suppNames})`);
  lines.push('');

  // Market Data
  lines.push('--- MARKET DATA ---');
  lines.push(`Current Price: ${fmtDollar(pkg.market_data.price)}`);
  lines.push(`Market Cap: ${fmtLargeNum(pkg.market_data.market_cap)}`);
  lines.push(`52-Week High: ${fmtDollar(pkg.market_data.fifty_two_week_high)}`);
  lines.push(`52-Week Low: ${fmtDollar(pkg.market_data.fifty_two_week_low)}`);
  lines.push(`% Change Today: ${fmtPct(pkg.market_data.percent_change_today)}`);
  lines.push(`Volume: ${fmtNum(pkg.market_data.volume)}`);
  lines.push('');

  // Fundamentals
  lines.push('--- FUNDAMENTALS ---');
  lines.push(`P/E Ratio: ${fmtNum(pkg.fundamentals.pe_ratio)}`);
  lines.push(`EPS: ${fmtDollar(pkg.fundamentals.eps)}`);
  lines.push(`Revenue: ${fmtLargeNum(pkg.fundamentals.revenue)}`);
  lines.push(`Debt/Equity: ${fmtNum(pkg.fundamentals.debt_to_equity)}`);
  lines.push(`Profit Margin: ${fmtPctPlain(pkg.fundamentals.profit_margin)}`);
  lines.push('');

  // Analyst Sentiment
  lines.push('--- ANALYST SENTIMENT ---');
  lines.push(`Consensus: ${fmt(pkg.analyst_sentiment.consensus)}`);
  lines.push(`Avg Price Target: ${fmtDollar(pkg.analyst_sentiment.avg_price_target)}`);
  lines.push(`Analyst Count: ${fmtNum(pkg.analyst_sentiment.analyst_count)}`);
  if (pkg.analyst_sentiment.recent_changes.length > 0) {
    lines.push('Recent Changes:');
    for (const change of pkg.analyst_sentiment.recent_changes) {
      lines.push(`  - ${change.analyst} at ${change.firm} (${change.action}, ${change.date})`);
    }
  }
  lines.push('');

  // SEC Filings
  lines.push('--- SEC FILINGS ---');
  lines.push(`Most Recent 10-K: ${fmt(pkg.sec_filing_summary.most_recent_10k)}`);
  lines.push(`Most Recent 10-Q: ${fmt(pkg.sec_filing_summary.most_recent_10q)}`);
  lines.push('');

  // Social Sentiment
  lines.push('--- SOCIAL SENTIMENT ---');
  lines.push(`Overall Tone: ${fmt(pkg.social_sentiment.overall_tone)}`);
  if (pkg.social_sentiment.signals.length > 0) {
    lines.push('Signals:');
    for (const signal of pkg.social_sentiment.signals) {
      lines.push(`  - ${signal}`);
    }
  }
  lines.push('');

  // Supplementary Market Data (Finnhub, Polygon) — append available text_blocks
  const availableSuppSources = pkg.supplementary_market_data?.sources?.filter(s => s.available) ?? [];
  if (availableSuppSources.length > 0) {
    lines.push('--- SUPPLEMENTARY MARKET DATA ---');
    for (const source of availableSuppSources) {
      lines.push('');
      lines.push(source.text_block);
    }
    lines.push('');
  }

  // Collection Notes
  lines.push('--- COLLECTION NOTES ---');
  lines.push(`Data collected: ${fmt(pkg.assembled_at)}`);
  for (const err of pkg.collection_errors) {
    lines.push(`Warning: ${err}`);
  }

  return lines.join('\n');
}

/**
 * Extracts a deduplicated list of news URLs from a SourcePackage, capped at 15.
 * Filters out null, empty, and whitespace-only URLs.
 */
export function extractNewsUrls(pkg: SourcePackage): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of pkg.news.items ?? []) {
    const url = item.url;
    if (!url || url.trim() === '') continue;
    if (seen.has(url)) continue;
    seen.add(url);
    result.push(url);
    if (result.length >= 15) break;
  }

  return result;
}
