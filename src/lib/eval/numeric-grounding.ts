// src/lib/eval/numeric-grounding.ts
//
// Plan 20-D-01 — Numeric-grounding matcher (test-only artifact).
//
// Asserts every numeric span in the rendered AnalysisResult traces to a
// SourcePackage leaf within the per-tier tolerance schedule. The module is
// pure: no Prisma, no fs, no env vars, no fetch. It runs only in CI via
// scripts/check-numeric-grounding.ts and the tests/integration/*.regression
// suites.
//
// Threat-model coverage:
//   T-20-D-01-01 (regex coverage gap)        — comprehensive regex + unit suite
//   T-20-D-01-02 (derived false-fail)        — 2% tier + synthetic products
//   T-20-D-01-03 (prompt-version staleness)  — scripts/check-numeric-grounding
//   T-20-D-01-04 (corpus too small)          — owned by 20-D-04 rotation
//   T-20-D-01-05 (price-target false-fail)   — 1% tier (analyst rounding)
//
// CRITICAL: This module MUST NOT be imported by any src/lib/* or src/app/*
// runtime file. The Hard Cleanup Gate verifies this with grep at CI time.

import type {
  GroundingFailure,
  GroundingResult,
  NumericFormHint,
  NumericSpan,
  ReportSection,
  SourceMatch,
  ToleranceTier,
} from './numeric-grounding.types';
import { TOLERANCE_SCHEDULE } from './numeric-grounding.types';
import type { SourcePackage } from '@/lib/types';

// Re-export so callers can import everything from numeric-grounding.ts.
export type {
  NumericSpan,
  ReportSection,
  SourceMatch,
  GroundingFailure,
  GroundingResult,
  ToleranceTier,
} from './numeric-grounding.types';
export { TOLERANCE_SCHEDULE } from './numeric-grounding.types';

// ── extractNumericSpans ────────────────────────────────────────────────────────
//
// Regex hits every canonical numeric form documented in the rendered-report
// audit of the plan. Three forms compose into the master regex:
//   1. Parens-wrapped negative:  (-?\$?N(.\d+)?[suffix]?)
//   2. "down N" / "down $N":     captured via context window post-match
//   3. Suffix:                   T / B / M / K / % / ％ / x / ×
//
// The regex deliberately accepts numbers without dollar signs (e.g. "23x",
// "5.2%", "125,000"). The unit test verifies all 23 canonical cases pass.

const CONTEXT_WINDOW = 30;

// Master regex. NOT global-sticky here — we use the global flag in the loop.
//
// Breakdown:
//   (\()?              — optional opening paren (negative wrapper)
//   (-)?               — optional leading minus
//   \$?                — optional dollar prefix
//   (\d{1,3}(?:,\d{3})+|\d+)   — integer body: comma-thousands OR plain digits
//   (\.\d+)?           — optional decimal
//   \s*                — optional whitespace before suffix
//   ([TBMK%×x］])?      — optional suffix (placeholder, refined below)
//   (\))?              — optional closing paren
const NUMERIC_REGEX = /(\()?(-)?\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*([TBMK%×x］]|％)?(\))?/g;

// Map suffix character → multiplier.
const SUFFIX_MULTIPLIER: Record<string, number> = {
  T: 1e12,
  B: 1e9,
  M: 1e6,
  K: 1e3,
  '%': 1,
  '％': 1,
  x: 1,
  '×': 1,
};

/** Extract every numeric span from a single report section. */
export function extractNumericSpans(text: string, section: ReportSection): NumericSpan[] {
  if (!text) return [];
  const out: NumericSpan[] = [];

  // Reset regex state per call (global regexes carry lastIndex).
  const re = new RegExp(NUMERIC_REGEX.source, 'g');

  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const [raw, openParen, leadingMinus, intBody, decBody, suffixRaw, closeParen] = match;
    if (intBody === undefined) continue;

    // Skip false positives: numbers embedded in scientific notation or version-strings.
    // 5.2e-3 — the regex would capture "5.2" then leave "e-3" tail. We tolerate the
    // partial match (per Task 1 test #21) but flag it as low-confidence by checking
    // the trailing character. If the char immediately after is 'e' or 'E' followed
    // by a digit/sign, skip — let the operator add canonical regex cases if they
    // hit it in production.
    const trailIdx = match.index + raw.length;
    const trailChar = text[trailIdx];
    if (trailChar === 'e' || trailChar === 'E') {
      const next = text[trailIdx + 1];
      if (next === '-' || next === '+' || (next >= '0' && next <= '9')) {
        continue; // documented unsupported: scientific notation
      }
    }

    // Locale EU "1.234,56" — the regex picks up "1.234" as decimal then ",56" is left.
    // Per Task 1 test #23 we just need to not crash. The "1.234" partial match passes.
    // No special handling needed; we still emit the span (low confidence — operator
    // can extend the regex if locale numbers become a real production concern).

    // Skip numbers preceded immediately by a letter (Q3, V2, K8, etc) — these are
    // identifiers, not financial figures. Allow $-prefixed numbers always.
    const charBefore = match.index > 0 ? text[match.index - 1] : '';
    const isLetter = /[a-zA-Z]/.test(charBefore);
    const hasDollarPrefix = raw.includes('$');
    if (isLetter && !hasDollarPrefix && !suffixRaw) {
      // Allow x/× context (e.g. "P/E of 23x") because suffix is present.
      // Allow % suffix similarly. Plain "Q3" with no suffix is rejected.
      continue;
    }

    // Parse value: strip commas from integer body.
    const intClean = intBody.replace(/,/g, '');
    const numericText = decBody ? `${intClean}${decBody}` : intClean;
    let value = parseFloat(numericText);
    if (!Number.isFinite(value)) continue;

    // Suffix multiplier (T / B / M / K). %, ％, x, × do NOT multiply the value.
    const suffix = (suffixRaw ?? '') as NumericFormHint['suffix'];
    if (suffix && SUFFIX_MULTIPLIER[suffix] !== undefined) {
      value *= SUFFIX_MULTIPLIER[suffix];
    }

    // Negation: parens, leading minus, or preceding "down" within 5 chars.
    const isParens = !!(openParen && closeParen);
    const preceding = text.slice(Math.max(0, match.index - 6), match.index).toLowerCase();
    const isDown = /(^|\s)down\s*$/.test(preceding);
    if (isParens || leadingMinus || isDown) {
      value = -value;
    }

    // Capture context window for tier inference.
    const ctxStart = Math.max(0, match.index - CONTEXT_WINDOW);
    const ctxEnd = Math.min(text.length, trailIdx + CONTEXT_WINDOW);
    const context = text.slice(ctxStart, ctxEnd);

    // Tier inference.
    const tier = inferTier({ value, suffix }, context);

    out.push({
      text: raw,
      value,
      position: match.index,
      context,
      tier,
      section,
    });
  }

  return out;
}

// ── inferTier ──────────────────────────────────────────────────────────────────
//
// Precedence (highest first):
//   percentage   — % or ％ suffix
//   share_count  — "shares outstanding" / "float" in context
//   price_target — "price target" / "consensus" / " PT " in context
//   market_cap   — "market cap" / "capitalization" in context
//   revenue      — "revenue" / "sales" / "top-line" / "topline" in context
//   ratio        — x/× suffix, OR "P/E" / "P/B" / "ratio" in context
//   derived      — default

const RE_PRICE_TARGET = /\b(price\s*target|consensus|pt)\b/i;
const RE_MARKET_CAP = /\b(market\s*cap|capitali[sz]ation)\b/i;
const RE_REVENUE = /\b(revenue|sales|top[-\s]?line)\b/i;
const RE_SHARE_COUNT = /\b(shares?\s*outstanding|float)\b/i;
const RE_RATIO_CONTEXT = /\b(p\/?e|p\/?b|ratio|earnings)\b/i;

export function inferTier(hint: NumericFormHint, context: string): ToleranceTier {
  // 1. Percentage wins absolutely (matches both "0.5%" and "ROE of 145%").
  if (hint.suffix === '%' || hint.suffix === '％') return 'percentage';

  // 2. Share count by context.
  if (RE_SHARE_COUNT.test(context)) return 'share_count';

  // 3. Price target by context.
  if (RE_PRICE_TARGET.test(context)) return 'price_target';

  // 4. Market cap by context.
  if (RE_MARKET_CAP.test(context)) return 'market_cap';

  // 5. Revenue / sales by context.
  if (RE_REVENUE.test(context)) return 'revenue';

  // 6. Ratio — x/× suffix OR ratio context.
  if (hint.suffix === 'x' || hint.suffix === '×') return 'ratio';
  if (RE_RATIO_CONTEXT.test(context)) return 'ratio';

  // 7. Default.
  return 'derived';
}

// ── walkNumericLeaves ──────────────────────────────────────────────────────────
//
// Returns every numeric leaf in a SourcePackage tree with its field path.
// Used by findClosestSourceValue. Skips null/undefined/NaN.

export interface NumericLeaf {
  path: string;
  value: number;
  field_origin: string | null;
}

export function walkNumericLeaves(pkg: SourcePackage): NumericLeaf[] {
  const out: NumericLeaf[] = [];

  const push = (path: string, value: number | null | undefined, origin: string | null = null) => {
    if (value == null || !Number.isFinite(value)) return;
    out.push({ path, value, field_origin: origin });
  };

  // market_data leaves
  if (pkg.market_data) {
    const md = pkg.market_data;
    const src = md._field_sources as Record<string, string> | undefined;
    push('market_data.price', md.price, src?.price ?? null);
    push('market_data.volume', md.volume, src?.volume ?? null);
    push('market_data.market_cap', md.market_cap, src?.market_cap ?? null);
    push('market_data.fifty_two_week_high', md.fifty_two_week_high, src?.fifty_two_week_high ?? null);
    push('market_data.fifty_two_week_low', md.fifty_two_week_low, src?.fifty_two_week_low ?? null);
    push('market_data.percent_change_today', md.percent_change_today, src?.percent_change_today ?? null);
    // Percent change in pp form (research-brief renders this as a %)
    if (md.percent_change_today != null && Number.isFinite(md.percent_change_today)) {
      push('market_data.percent_change_today_pp', md.percent_change_today * 100, src?.percent_change_today ?? null);
    }
  }

  // fundamentals leaves
  if (pkg.fundamentals) {
    const f = pkg.fundamentals;
    const src = f._field_sources as Record<string, string> | undefined;
    push('fundamentals.pe_ratio', f.pe_ratio, src?.pe_ratio ?? null);
    push('fundamentals.eps', f.eps, src?.eps ?? null);
    push('fundamentals.revenue', f.revenue, src?.revenue ?? null);
    push('fundamentals.debt_to_equity', f.debt_to_equity, src?.debt_to_equity ?? null);
    push('fundamentals.profit_margin', f.profit_margin, src?.profit_margin ?? null);
    // profit_margin commonly rendered as a percentage — emit pp form too.
    if (f.profit_margin != null && Number.isFinite(f.profit_margin)) {
      push('fundamentals.profit_margin_pp', f.profit_margin * 100, src?.profit_margin ?? null);
    }
  }

  // analyst_sentiment leaves
  if (pkg.analyst_sentiment) {
    const a = pkg.analyst_sentiment;
    push('analyst_sentiment.avg_price_target', a.avg_price_target);
    push('analyst_sentiment.analyst_count', a.analyst_count);
  }

  // sentiment_intelligence leaves
  if (pkg.sentiment_intelligence) {
    const s = pkg.sentiment_intelligence;
    push('sentiment_intelligence.stocktwits_bull_pct', s.stocktwits_bull_pct);
    push('sentiment_intelligence.stocktwits_bear_pct', s.stocktwits_bear_pct);
    push('sentiment_intelligence.stocktwits_message_count', s.stocktwits_message_count);
    push('sentiment_intelligence.put_call_ratio', s.put_call_ratio);
    push('sentiment_intelligence.aggregated_bull_pct', s.aggregated_bull_pct);
    push('sentiment_intelligence.aggregated_bear_pct', s.aggregated_bear_pct);
    push('sentiment_intelligence.sentiment_source_count', s.sentiment_source_count);
  }

  // supplementary sources (Polygon / Finnhub) — both market + fundamentals fields.
  if (pkg.supplementary_market_data?.sources) {
    for (const ss of pkg.supplementary_market_data.sources) {
      const tag = `supplementary[${ss.name}]`;
      if (ss.market) {
        push(`${tag}.market.price`, ss.market.price, ss.name);
        push(`${tag}.market.volume`, ss.market.volume, ss.name);
        push(`${tag}.market.market_cap`, ss.market.market_cap, ss.name);
        push(`${tag}.market.fifty_two_week_high`, ss.market.fifty_two_week_high, ss.name);
        push(`${tag}.market.fifty_two_week_low`, ss.market.fifty_two_week_low, ss.name);
      }
      if (ss.fundamentals) {
        push(`${tag}.fundamentals.pe_ratio`, ss.fundamentals.pe_ratio, ss.name);
        push(`${tag}.fundamentals.eps`, ss.fundamentals.eps, ss.name);
        push(`${tag}.fundamentals.revenue`, ss.fundamentals.revenue, ss.name);
        push(`${tag}.fundamentals.debt_to_equity`, ss.fundamentals.debt_to_equity, ss.name);
        push(`${tag}.fundamentals.profit_margin`, ss.fundamentals.profit_margin, ss.name);
      }
    }
  }

  // Synthetic derived products (T-20-D-01-02 mitigation).
  if (pkg.market_data?.price != null && pkg.fundamentals?.eps != null && pkg.fundamentals.eps !== 0) {
    push('derived:price/eps', pkg.market_data.price / pkg.fundamentals.eps, null);
  }
  if (pkg.market_data?.market_cap != null && pkg.fundamentals?.revenue != null && pkg.fundamentals.revenue !== 0) {
    push('derived:market_cap/revenue', pkg.market_data.market_cap / pkg.fundamentals.revenue, null);
  }
  // Implicit shares outstanding = market_cap / price (works without revenue).
  if (
    pkg.market_data?.market_cap != null && pkg.market_data.market_cap !== 0 &&
    pkg.market_data?.price != null && pkg.market_data.price !== 0
  ) {
    const shares = pkg.market_data.market_cap / pkg.market_data.price;
    if (Number.isFinite(shares) && shares > 0) {
      push('derived:shares_outstanding', shares, null);
      if (pkg.fundamentals?.revenue != null) {
        push('derived:revenue_per_share', pkg.fundamentals.revenue / shares, null);
      }
    }
  }

  return out;
}

// ── findClosestSourceValue ────────────────────────────────────────────────────

/** Compute delta per-tier (absolute pp for percentage; relative otherwise). */
function tierDelta(spanValue: number, sourceValue: number, tier: ToleranceTier): number {
  if (tier === 'percentage') {
    return Math.abs(spanValue - sourceValue); // absolute pp comparison
  }
  if (tier === 'share_count') {
    return spanValue === sourceValue ? 0 : Math.abs(spanValue - sourceValue);
  }
  if (sourceValue === 0) {
    return spanValue === 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return Math.abs(spanValue - sourceValue) / Math.abs(sourceValue);
}

/** Compute a context-preference bonus when the source path semantically aligns. */
function contextPathBonus(spanContext: string, sourcePath: string): number {
  const ctx = spanContext.toLowerCase();
  const path = sourcePath.toLowerCase();

  // P/E context prefers pe_ratio path.
  if (/p\/?e|earnings|ratio/.test(ctx) && path.includes('pe_ratio')) return -0.001;
  // Revenue context prefers revenue path.
  if (/revenue|sales|top.?line/.test(ctx) && path.includes('revenue')) return -0.001;
  // Market cap context prefers market_cap path.
  if (/market\s*cap|capitali/.test(ctx) && path.includes('market_cap')) return -0.001;
  // Price target context prefers analyst path.
  if (/price\s*target|consensus|pt\b/.test(ctx) && path.includes('analyst')) return -0.001;
  // Shares outstanding context prefers shares path.
  if (/shares?\s*outstanding|float/.test(ctx) && path.includes('shares')) return -0.001;
  // Bull/bear percent contexts prefer stocktwits paths.
  if (/bullish|bearish|sentiment/.test(ctx) && path.includes('sentiment')) return -0.001;

  return 0;
}

export function findClosestSourceValue(
  span: NumericSpan,
  pkg: SourcePackage,
  tolerance: number,
): SourceMatch | null {
  const leaves = walkNumericLeaves(pkg);
  if (leaves.length === 0) return null;

  let best: SourceMatch | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const leaf of leaves) {
    const delta = tierDelta(span.value, leaf.value, span.tier);
    if (!Number.isFinite(delta)) continue;

    // Score = delta + context-alignment bonus (negative bonus = prefer).
    const score = delta + contextPathBonus(span.context, leaf.path);

    if (score < bestScore) {
      bestScore = score;
      best = {
        source_value: leaf.value,
        source_path: leaf.path,
        field_origin: leaf.field_origin,
        delta,
        tier_used: span.tier,
      };
    }
  }

  if (!best) return null;
  if (best.delta > tolerance) {
    // Still return the closest match for diagnostic output, but caller decides
    // whether it counts as grounded. We surface this via the tolerance check
    // in numericGroundingCheck.
    return best;
  }
  return best;
}

// ── numericGroundingCheck ─────────────────────────────────────────────────────

interface AnalysisResultLike {
  executive_summary?: string;
  investment_thesis?: string;
  key_risks?: string;
  valuation_context?: string;
  future_projection?: string;
  business_description?: string;
  financial_analysis?: string;
  competitive_landscape?: string;
}

const SCANNED_SECTIONS: ReadonlyArray<ReportSection> = [
  'executive_summary',
  'investment_thesis',
  'key_risks',
  'valuation_context',
  'future_projection',
  'business_description',
  'financial_analysis',
  'competitive_landscape',
];

export function numericGroundingCheck(
  report: AnalysisResultLike,
  pkg: SourcePackage,
  schedule = TOLERANCE_SCHEDULE,
): GroundingResult {
  const allSpans: NumericSpan[] = [];
  for (const section of SCANNED_SECTIONS) {
    const text = report[section];
    if (typeof text === 'string' && text.length > 0) {
      allSpans.push(...extractNumericSpans(text, section));
    }
  }

  const failures: GroundingFailure[] = [];
  let grounded = 0;

  for (const span of allSpans) {
    const tolerance = schedule[span.tier];
    const match = findClosestSourceValue(span, pkg, tolerance);

    if (!match) {
      failures.push({ span, closest: null, reason: 'no_numeric_leaf_in_source' });
      continue;
    }
    if (match.delta > tolerance) {
      failures.push({ span, closest: match, reason: 'no_match_within_tolerance' });
      continue;
    }
    grounded += 1;
  }

  const total = allSpans.length;
  return {
    grounded_count: grounded,
    ungrounded_spans: failures,
    total_spans: total,
    coverage_pct: total === 0 ? 1 : grounded / total,
  };
}
