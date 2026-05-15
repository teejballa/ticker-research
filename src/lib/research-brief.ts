// src/lib/research-brief.ts
// Formats a SourcePackage into structured text and a URL list for the Gemini analysis prompt.
// Consumed by src/lib/gemini-analysis.ts.
//
// Phase 19 / Plan 19-C-07 (D-39): also assembles structured Citation objects
// from the SourcePackage and renders them into a CITATIONS section. The LLM
// SELECTS citations from this list — it never fabricates URLs (T-19-C-07-01).
//
// Phase 30 D-11 — when merge.ts cannot resolve a field from any source it sets
// FieldOrigin to 'unavailable' (legacy persisted records use `null` for the
// same case). The fmtUnavailable() helper renders "(no source available)" so
// the Gemini prompt does not see "N/A" for fields that have been exhausted
// across every source. "N/A" is reserved for "we never asked".

import type { SourcePackage, NewsItem, AnalystChange, PerAspectSentimentEntry, FieldOrigin } from './types';
import type { Citation } from './sentiment/citation-schema';
import { sanitizeUrl } from './sentiment/citation-schema';
// Plan 20-Z-04 — every Gemini-bound prompt section is a versioned (id, version)
// artifact in src/lib/prompts/registry. The CITATIONS section body is in
// src/lib/prompts/_v1/gemini-citations-section.md.
import { renderPrompt } from '@/lib/prompts/render';

// ---- Helpers ----

/**
 * Phase 30 D-11 — guard for unavailable FieldOrigin.
 * Returns the literal "(no source available)" for `'unavailable'` or `null`
 * origin; otherwise defers to the provided formatter.
 */
function fmtUnavailable(
  origin: FieldOrigin | undefined,
  formatter: () => string,
): string {
  if (origin === 'unavailable' || origin === null) return '(no source available)';
  return formatter();
}

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

// ---- Plan 20-B-05 — per-aspect breakdown helper ----

/**
 * Render the per-aspect breakdown block for the Gemini prompt.
 * Replaces/supplements the existing single global bull% line when per_aspect
 * is non-empty AND at least one entry has bull_pct != null. Returns '' when
 * per_aspect is empty or all-null — callers must then fall back to the
 * existing global sentiment line (which remains in the prompt either way).
 *
 * Output format example:
 *   Per-aspect sentiment:
 *     earnings: 75% bullish (n=12)
 *     guidance: 50% bullish (n=4)
 *     regulatory: insufficient data
 *     M&A: insufficient data
 *
 * Aspects with bull_pct == null render the literal "insufficient data"
 * (NEVER "0% bullish" — T-20-B-05-03: empty data must not communicate as
 * zero bullishness).
 */
export function renderPerAspectBlock(perAspect: PerAspectSentimentEntry[] | undefined): string {
  if (!perAspect || perAspect.length === 0) return '';
  const hasAnySignal = perAspect.some((p) => p.bull_pct !== null);
  if (!hasAnySignal) return '';
  const lines = perAspect.map((p) => {
    if (p.bull_pct === null) return `  ${p.aspect}: insufficient data`;
    return `  ${p.aspect}: ${p.bull_pct.toFixed(0)}% bullish (n=${p.n_docs})`;
  });
  return `Per-aspect sentiment:\n${lines.join('\n')}\n\n`;
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

  // Market Data — Phase 30 D-11: route every per-field formatter through
  // fmtUnavailable() so the LLM sees "(no source available)" when every
  // cascade source for that field returned null. Plain `N/A` continues to
  // signal "we never asked" (legacy SourcePackage records with no merge
  // metadata).
  const mfs = pkg.market_data._field_sources;
  lines.push('--- MARKET DATA ---');
  lines.push(`Current Price: ${fmtUnavailable(mfs?.price, () => fmtDollar(pkg.market_data.price))}`);
  lines.push(`Market Cap: ${fmtUnavailable(mfs?.market_cap, () => fmtLargeNum(pkg.market_data.market_cap))}`);
  lines.push(`52-Week High: ${fmtUnavailable(mfs?.fifty_two_week_high, () => fmtDollar(pkg.market_data.fifty_two_week_high))}`);
  lines.push(`52-Week Low: ${fmtUnavailable(mfs?.fifty_two_week_low, () => fmtDollar(pkg.market_data.fifty_two_week_low))}`);
  lines.push(`% Change Today: ${fmtUnavailable(mfs?.percent_change_today, () => fmtPct(pkg.market_data.percent_change_today))}`);
  lines.push(`Volume: ${fmtUnavailable(mfs?.volume, () => fmtNum(pkg.market_data.volume))}`);
  lines.push('');

  // Fundamentals — Phase 30 D-11: same FieldOrigin-aware rendering.
  const ffs = pkg.fundamentals._field_sources;
  lines.push('--- FUNDAMENTALS ---');
  lines.push(`P/E Ratio: ${fmtUnavailable(ffs?.pe_ratio, () => fmtNum(pkg.fundamentals.pe_ratio))}`);
  lines.push(`EPS: ${fmtUnavailable(ffs?.eps, () => fmtDollar(pkg.fundamentals.eps))}`);
  lines.push(`Revenue: ${fmtUnavailable(ffs?.revenue, () => fmtLargeNum(pkg.fundamentals.revenue))}`);
  lines.push(`Debt/Equity: ${fmtUnavailable(ffs?.debt_to_equity, () => fmtNum(pkg.fundamentals.debt_to_equity))}`);
  lines.push(`Profit Margin: ${fmtUnavailable(ffs?.profit_margin, () => fmtPctPlain(pkg.fundamentals.profit_margin))}`);
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
  // Plan 20-B-05 — per-aspect breakdown precedes the global bull% line so
  // Gemini can reason aspect-by-aspect (Cookson/Engelberg "averaging-out
  // opposite signals" motivation). Reads the _per_aspect_sentiment sidecar
  // attached in source-package.ts under FEATURE_PER_ASPECT_AGGREGATE.
  // renderPerAspectBlock returns '' when empty/all-null → falls back to the
  // existing global rendering below (graceful degradation per CONTEXT.md
  // line 117 — "Falls back to global when no aspect-tagged signal").
  const perAspectSidecar = (pkg as SourcePackage & { _per_aspect_sentiment?: PerAspectSentimentEntry[] })
    ._per_aspect_sentiment;
  const perAspectBlock = renderPerAspectBlock(perAspectSidecar);
  if (perAspectBlock.length > 0) {
    lines.push(perAspectBlock.trimEnd());
  }

  // Post-Phase-19: cross-source aggregated bullishness with Beta(5,5) smoothing.
  // Always prefer this number over any single-source percentage when reasoning
  // about retail/community sentiment — it accounts for sample-size effects and
  // multi-source disagreement that a single venue (e.g. StockTwits on a meme
  // stock) cannot represent.
  const si = pkg.sentiment_intelligence;
  if (si?.aggregated_bull_pct != null && (si.sentiment_source_count ?? 0) > 0) {
    lines.push(
      `Cross-Source Bullish (smoothed, ${si.sentiment_source_count} sources): ${si.aggregated_bull_pct.toFixed(1)}%`,
    );
    if (si.sentiment_components && si.sentiment_components.length > 0) {
      lines.push('Per-source breakdown:');
      for (const c of si.sentiment_components) {
        lines.push(`  - ${c.source}: ${c.bullish_pct}% bullish (n=${c.raw_mention_count})`);
      }
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
  // Compact JSON payload — keeps the section short while preserving every
  // structured field the schema validates against.
  const payload = citations.map((c) => ({
    source: c.source,
    url: c.url,
    confidence: c.confidence,
    date_retrieved: c.date_retrieved,
  }));
  // Plan 20-Z-04 — body lives in src/lib/prompts/_v1/gemini-citations-section.md.
  return renderPrompt('gemini-citations-section', {
    citation_count: String(citations.length),
    citations_json: JSON.stringify(payload, null, 2),
  });
}
