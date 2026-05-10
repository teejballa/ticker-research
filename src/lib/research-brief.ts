// src/lib/research-brief.ts
// Formats a SourcePackage into structured text and a URL list for the Gemini analysis prompt.
// Consumed by src/lib/gemini-analysis.ts.
//
// Phase 19 / Plan 19-C-07 (D-39): also assembles structured Citation objects
// from the SourcePackage and renders them into a CITATIONS section. The LLM
// SELECTS citations from this list — it never fabricates URLs (T-19-C-07-01).

import type { SourcePackage, NewsItem, AnalystChange } from './types';
import type { Citation } from './sentiment/citation-schema';
import { sanitizeUrl } from './sentiment/citation-schema';

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

  // Recent News — surfaces headlines so Gemini reasons over them, not just cites them.
  lines.push('--- RECENT NEWS ---');
  if (pkg.news.items.length > 0) {
    const sorted = [...pkg.news.items].sort((a, b) => (b.published_date ?? '').localeCompare(a.published_date ?? ''));
    for (const item of sorted.slice(0, 20)) {
      lines.push(`  - [${fmt(item.published_date)}] ${fmt(item.source)}: ${fmt(item.headline)}`);
    }
  } else {
    lines.push('No recent news headlines retrieved.');
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

// ─── Phase 19-C-07 — structured citations (D-39) ─────────────────────────────

function safeIso(date: string | null | undefined, fallback: string): string {
  // Coerce to ISO 8601 datetime. Many SourcePackage date fields are date-only
  // (e.g. "2026-04-15") — append time so it satisfies z.string().datetime().
  if (!date || typeof date !== 'string' || date.trim() === '') return fallback;
  if (/^\d{4}-\d{2}-\d{2}T/.test(date)) {
    // already datetime-like; trust it but normalize trailing zone
    return date.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(date) ? date : `${date}Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return `${date}T00:00:00Z`;
  }
  // Unparseable — fall back so we never emit invalid citations
  return fallback;
}

function safeUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string' || url.trim() === '') return null;
  try {
    // Round-trip through URL constructor to catch malformed strings before
    // Zod does. Sanitization (strip user:pass@) is applied here AND again
    // by CitationSchema.url.transform — defense in depth.
    return sanitizeUrl(new URL(url).toString());
  } catch {
    return null;
  }
}

/**
 * Assemble a flat array of Citation objects from a SourcePackage. The LLM is
 * shown this exact list in the prompt's CITATIONS section and must SELECT
 * which citations support each thesis claim by including them in
 * `citations_v2` on the AnalysisResult — it MAY NOT fabricate new URLs
 * (T-19-C-07-01 mitigation).
 *
 * Confidence policy:
 *   - news / sec_filing / analyst with verified URL → 0.85
 *   - analyst recent_changes (analyst+firm only, no per-row URL) → 0.5 with
 *     null URL — these are surfaced under source: 'other' so the schema's
 *     analyst-URL-mandatory rule isn't triggered for unsourced rows.
 *   - social signals (e.g. StockTwits aggregate) → 0.4
 */
export function assembleCitationsFromPackage(pkg: SourcePackage): Citation[] {
  const fallbackTs = pkg.assembled_at && /^\d{4}-\d{2}-\d{2}T/.test(pkg.assembled_at)
    ? safeIso(pkg.assembled_at, new Date().toISOString())
    : new Date().toISOString();

  const out: Citation[] = [];
  const seenUrls = new Set<string>();

  // News articles → source: 'news' (URL mandatory; we only emit when present).
  for (const item of (pkg.news.items ?? []) as NewsItem[]) {
    const url = safeUrl(item.url);
    if (!url) continue; // skip — schema would reject without URL
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    out.push({
      source: 'news',
      url,
      confidence: 0.85,
      date_retrieved: safeIso(item.published_date, fallbackTs),
    });
  }

  // SEC filings → source: 'sec_filing'. Schema does NOT require URL here, but
  // we attempt to emit one when the SourcePackage carries it. The current
  // SecFilingSummarySection only carries date strings; emit with null URL.
  if (pkg.sec_filing_summary.most_recent_10k) {
    out.push({
      source: 'sec_filing',
      url: null,
      confidence: 0.7,
      date_retrieved: safeIso(pkg.sec_filing_summary.most_recent_10k, fallbackTs),
    });
  }
  if (pkg.sec_filing_summary.most_recent_10q) {
    out.push({
      source: 'sec_filing',
      url: null,
      confidence: 0.7,
      date_retrieved: safeIso(pkg.sec_filing_summary.most_recent_10q, fallbackTs),
    });
  }

  // Analyst changes → schema requires URL for source: 'analyst'. The current
  // AnalystChange shape has no per-row URL, so we emit these under 'other'
  // (which has no mandatory-URL rule) to preserve the evidence without
  // tripping Zod. When a future fetcher adds URLs to recent_changes, switch
  // these emissions to source: 'analyst'.
  for (const change of (pkg.analyst_sentiment.recent_changes ?? []) as AnalystChange[]) {
    out.push({
      source: 'other',
      url: null,
      confidence: 0.5,
      date_retrieved: safeIso(change.date, fallbackTs),
    });
  }

  // StockTwits / put-call aggregate → source: 'social'. URL optional (no
  // single per-message URL surfaces from the StockTwits aggregate).
  const si = pkg.sentiment_intelligence;
  if (si && (si.stocktwits_message_count ?? 0) > 0) {
    out.push({
      source: 'social',
      url: null,
      confidence: 0.4,
      date_retrieved: fallbackTs,
    });
  }

  // Price/market data — single row per package, no URL.
  out.push({
    source: 'price_data',
    url: null,
    confidence: 0.95,
    date_retrieved: fallbackTs,
  });

  return out;
}

/**
 * Render the CITATIONS section the LLM sees in its user prompt. The text is
 * deliberately concrete: "Available citations: [...]" + an instruction to
 * RETURN the subset that supports each thesis claim in `citations_v2`. This
 * is the prompt-side half of the T-19-C-07-01 mitigation (the schema-side
 * half is the structured `Citation` validator).
 *
 * Returns '' when no citations were assembled (caller can skip the section).
 */
export function renderCitationsSection(citations: Citation[]): string {
  if (citations.length === 0) return '';
  const lines: string[] = [];
  lines.push('=== CITATIONS ===');
  lines.push(
    `Available citations (${citations.length}). You MUST select WHICH of these support each claim by populating citations_v2 on your output. DO NOT invent URLs that are not in this list.`,
  );
  lines.push('');
  // Compact JSON payload — keeps the section short while preserving every
  // structured field the schema validates against.
  const payload = citations.map((c) => ({
    source: c.source,
    url: c.url,
    confidence: c.confidence,
    date_retrieved: c.date_retrieved,
  }));
  lines.push(JSON.stringify(payload, null, 2));
  lines.push('');
  return lines.join('\n');
}
