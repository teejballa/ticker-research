// tests/unit/numeric-grounding.unit.test.ts
//
// Plan 20-D-01 Task 1 (RED) — failing tests for the numeric-grounding matcher.
// Tests for extractNumericSpans + inferTier + TOLERANCE_SCHEDULE.
// Task 2 lands the implementation; this file proves the spec is real first.
//
// The matcher implementation will live at:
//   src/lib/eval/numeric-grounding.ts (extractNumericSpans, inferTier, ...)
//   src/lib/eval/numeric-grounding.types.ts (TOLERANCE_SCHEDULE + interfaces)

import { describe, it, expect } from 'vitest';
import {
  extractNumericSpans,
  inferTier,
  findClosestSourceValue,
  numericGroundingCheck,
} from '@/lib/eval/numeric-grounding';
import { TOLERANCE_SCHEDULE } from '@/lib/eval/numeric-grounding.types';
import type { SourcePackage } from '@/lib/types';

const ANY_SECTION = 'executive_summary' as const;

// ── extractNumericSpans canonical cases (≥20) ──────────────────────────────────

describe('extractNumericSpans — canonical forms', () => {
  it('matches plain dollar amount $125.50', () => {
    const spans = extractNumericSpans('Apple closed at $125.50 today.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(125.50);
  });

  it('matches billion suffix $1.23B', () => {
    const spans = extractNumericSpans('Revenue of $1.23B last quarter.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(1_230_000_000);
  });

  it('matches million suffix $850M', () => {
    const spans = extractNumericSpans('Profit was $850M.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(850_000_000);
  });

  it('matches thousand suffix $45K', () => {
    const spans = extractNumericSpans('Spend of $45K on R&D.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(45_000);
  });

  it('matches percentage 5.2%', () => {
    const spans = extractNumericSpans('Margin compressed 5.2% YoY.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(5.2);
  });

  it('matches small percentage 0.5%', () => {
    const spans = extractNumericSpans('Yield rose 0.5%.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(0.5);
  });

  it('matches multiplier 23x', () => {
    const spans = extractNumericSpans('Trades at 23x earnings.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(23);
  });

  it('matches Unicode multiplication sign 1.5×', () => {
    const spans = extractNumericSpans('Book value of 1.5× tangible.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(1.5);
  });

  it('matches parenthesized negative (3.4%)', () => {
    const spans = extractNumericSpans('Operating loss of (3.4%).', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(-3.4);
  });

  it('matches "up 12.5%"', () => {
    const spans = extractNumericSpans('Stock is up 12.5% YTD.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(12.5);
  });

  it('matches "down $0.50" as negative dollar', () => {
    const spans = extractNumericSpans('Shares are down $0.50 today.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(-0.50);
  });

  it('matches comma-thousands integer 125,000', () => {
    const spans = extractNumericSpans('Headcount is 125,000 globally.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(125_000);
  });

  it('matches Unicode full-width percent 5％', () => {
    const spans = extractNumericSpans('Margin 5％ this quarter.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(5);
  });

  it('matches 23x P/E and surfaces P/E in context', () => {
    const spans = extractNumericSpans('Trading at 23x P/E currently.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(23);
    expect(spans[0].context.toLowerCase()).toContain('p/e');
  });

  it('matches "P/E of 23x" with P/E in context', () => {
    const spans = extractNumericSpans('P/E of 23x on trailing earnings.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(23);
    expect(spans[0].context.toLowerCase()).toContain('p/e');
  });

  it('matches "$182.50 price target"', () => {
    const spans = extractNumericSpans('$182.50 price target from Morgan Stanley.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(182.50);
    expect(spans[0].context.toLowerCase()).toContain('price target');
  });

  it('matches "consensus PT of $200"', () => {
    const spans = extractNumericSpans('Consensus PT of $200 across the street.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(200);
    expect(spans[0].context.toLowerCase()).toMatch(/pt|consensus/);
  });

  it('matches trillion suffix $2.4T for market cap', () => {
    const spans = extractNumericSpans('Market cap of $2.4T as of Friday.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(2_400_000_000_000);
  });

  it('matches "Q3 revenue of $89.5B" with revenue in context', () => {
    const spans = extractNumericSpans('Q3 revenue of $89.5B beat the consensus.', ANY_SECTION);
    expect(spans).toHaveLength(1);
    expect(spans[0].value).toBeCloseTo(89_500_000_000);
    expect(spans[0].context.toLowerCase()).toContain('revenue');
  });

  it('matches multiple percentages: "compressed from 28% to 24%"', () => {
    const spans = extractNumericSpans('Operating margin compressed from 28% to 24%.', ANY_SECTION);
    expect(spans).toHaveLength(2);
    expect(spans[0].value).toBeCloseTo(28);
    expect(spans[1].value).toBeCloseTo(24);
  });

  it('does NOT crash on scientific notation 5.2e-3 (documented unsupported)', () => {
    expect(() => extractNumericSpans('Tracking error of 5.2e-3.', ANY_SECTION)).not.toThrow();
    // matcher MAY pick up "5.2" but not the whole notation — we just assert no crash + at most 1 span.
    const spans = extractNumericSpans('Tracking error of 5.2e-3.', ANY_SECTION);
    expect(spans.length).toBeLessThanOrEqual(2);
  });

  it('does NOT crash on words-as-numbers "one billion"', () => {
    expect(() => extractNumericSpans('Revenue exceeded one billion.', ANY_SECTION)).not.toThrow();
    const spans = extractNumericSpans('Revenue exceeded one billion.', ANY_SECTION);
    expect(spans).toHaveLength(0);
  });

  it('does NOT crash on EU-locale numbers "1.234,56"', () => {
    // Documented limitation — graceful degrade, no throw. Either 0 spans or partial parse OK.
    expect(() => extractNumericSpans('EU price was 1.234,56 euros.', ANY_SECTION)).not.toThrow();
  });
});

// ── inferTier canonical cases (≥10) ────────────────────────────────────────────

describe('inferTier — context-driven tier inference', () => {
  it('classifies "P/E ratio of 23x" as ratio', () => {
    expect(inferTier({ value: 23, suffix: 'x' }, 'P/E ratio of 23x')).toBe('ratio');
  });

  it('classifies "trades at 23x earnings" as ratio', () => {
    expect(inferTier({ value: 23, suffix: 'x' }, 'trades at 23x earnings')).toBe('ratio');
  });

  it('classifies "market cap of $2.4T" as market_cap', () => {
    expect(inferTier({ value: 2_400_000_000_000, suffix: 'T' }, 'market cap of $2.4T')).toBe('market_cap');
  });

  it('classifies "Q3 revenue of $89.5B" as revenue', () => {
    expect(inferTier({ value: 89_500_000_000, suffix: 'B' }, 'Q3 revenue of $89.5B')).toBe('revenue');
  });

  it('classifies "price target of $182.50" as price_target', () => {
    expect(inferTier({ value: 182.50, suffix: '' }, 'price target of $182.50')).toBe('price_target');
  });

  it('classifies "stock is up 5.2%" as percentage', () => {
    expect(inferTier({ value: 5.2, suffix: '%' }, 'stock is up 5.2%')).toBe('percentage');
  });

  it('classifies "16B shares outstanding" as share_count', () => {
    expect(inferTier({ value: 16_000_000_000, suffix: 'B' }, '16B shares outstanding')).toBe('share_count');
  });

  it('percent wins over ratio: "operating margin of 0.5%" → percentage', () => {
    expect(inferTier({ value: 0.5, suffix: '%' }, 'GAAP operating margin of 0.5%')).toBe('percentage');
  });

  it('percent wins over ratio: "ROE of 145%" → percentage', () => {
    expect(inferTier({ value: 145, suffix: '%' }, 'ROE of 145%')).toBe('percentage');
  });

  it('falls back to derived when no signal: "$100 in cash"', () => {
    expect(inferTier({ value: 100, suffix: '' }, '$100 in cash')).toBe('derived');
  });
});

// ── TOLERANCE_SCHEDULE — exact tier values ─────────────────────────────────────

describe('TOLERANCE_SCHEDULE — exact tier values per CONTEXT §S9', () => {
  it('ratio tier is 0.005', () => {
    expect(TOLERANCE_SCHEDULE.ratio).toBe(0.005);
  });

  it('share_count tier is 0 (exact)', () => {
    expect(TOLERANCE_SCHEDULE.share_count).toBe(0);
  });

  it('revenue tier is 0.001', () => {
    expect(TOLERANCE_SCHEDULE.revenue).toBe(0.001);
  });

  it('market_cap tier is 0.001', () => {
    expect(TOLERANCE_SCHEDULE.market_cap).toBe(0.001);
  });

  it('price_target tier is 0.01', () => {
    expect(TOLERANCE_SCHEDULE.price_target).toBe(0.01);
  });

  it('percentage tier is 0.01 (interpreted as absolute pp)', () => {
    expect(TOLERANCE_SCHEDULE.percentage).toBe(0.01);
  });

  it('derived tier is 0.02', () => {
    expect(TOLERANCE_SCHEDULE.derived).toBe(0.02);
  });
});

// ── findClosestSourceValue + numericGroundingCheck ──────────────────────────────

function makePkg(overrides: {
  price?: number | null;
  market_cap?: number | null;
  fifty_two_week_high?: number | null;
  fifty_two_week_low?: number | null;
  pe_ratio?: number | null;
  eps?: number | null;
  revenue?: number | null;
  avg_price_target?: number | null;
  stocktwits_bull_pct?: number | null;
  stocktwits_bear_pct?: number | null;
}): SourcePackage {
  const now = '2026-05-13T00:00:00Z';
  return {
    ticker: 'TEST',
    company_name: 'Test Co',
    exchange: 'NASDAQ',
    security_type: 'equity',
    assembled_at: now,
    market_data: {
      collected_at: now,
      price: overrides.price ?? null,
      volume: null,
      market_cap: overrides.market_cap ?? null,
      fifty_two_week_high: overrides.fifty_two_week_high ?? null,
      fifty_two_week_low: overrides.fifty_two_week_low ?? null,
      percent_change_today: null,
      exchange: 'NASDAQ',
    },
    fundamentals: {
      collected_at: now,
      pe_ratio: overrides.pe_ratio ?? null,
      eps: overrides.eps ?? null,
      revenue: overrides.revenue ?? null,
      debt_to_equity: null,
      profit_margin: null,
    },
    news: { collected_at: now, items: [] },
    analyst_sentiment: {
      collected_at: now,
      consensus: null,
      avg_price_target: overrides.avg_price_target ?? null,
      analyst_count: null,
      recent_changes: [],
    },
    sec_filing_summary: {
      collected_at: now,
      most_recent_10k: null,
      most_recent_10q: null,
      filing_dates: { '10k': null, '10q': null },
    },
    social_sentiment: {
      collected_at: now,
      overall_tone: null,
      signals: [],
      sources_checked: [],
    },
    collection_errors: [],
    supplementary_market_data: { sources: [] },
    sentiment_intelligence: {
      collected_at: now,
      stocktwits_bull_pct: overrides.stocktwits_bull_pct ?? null,
      stocktwits_bear_pct: overrides.stocktwits_bear_pct ?? null,
      stocktwits_message_count: null,
      stocktwits_is_trending: null,
      reddit_tone: null,
      put_call_ratio: null,
      put_call_interpretation: null,
    },
  } as unknown as SourcePackage;
}

describe('findClosestSourceValue — per-tier tolerance', () => {
  it('ratio tier — span 23.4 vs pe_ratio 23.5 (delta ~0.4%) → MATCH', () => {
    const pkg = makePkg({ pe_ratio: 23.5 });
    const [span] = extractNumericSpans('Trading at 23.4x P/E currently.', 'executive_summary');
    expect(span.tier).toBe('ratio');
    const match = findClosestSourceValue(span, pkg, TOLERANCE_SCHEDULE.ratio);
    expect(match).not.toBeNull();
    expect(match!.delta).toBeLessThanOrEqual(TOLERANCE_SCHEDULE.ratio);
    expect(match!.source_path).toBe('fundamentals.pe_ratio');
  });

  it('ratio tier — span 24.0 vs pe_ratio 23.5 (delta ~2.1%) → NO MATCH (over tolerance)', () => {
    const pkg = makePkg({ pe_ratio: 23.5 });
    const [span] = extractNumericSpans('Trading at 24x P/E currently.', 'executive_summary');
    expect(span.tier).toBe('ratio');
    const match = findClosestSourceValue(span, pkg, TOLERANCE_SCHEDULE.ratio);
    expect(match).not.toBeNull();
    expect(match!.delta).toBeGreaterThan(TOLERANCE_SCHEDULE.ratio);
  });

  it('share_count tier — exact required: 15_999_999 vs 16_000_000 → over tolerance', () => {
    const pkg = makePkg({});
    const span = {
      text: '15,999,999',
      value: 15_999_999,
      position: 0,
      context: 'shares outstanding 15,999,999',
      tier: 'share_count' as const,
      section: 'executive_summary' as const,
    };
    // Inject a synthetic shares leaf via market_cap / price.
    pkg.market_data.market_cap = 1_600_000_000;
    pkg.market_data.price = 100;  // → derived:shares_outstanding = 16_000_000
    const match = findClosestSourceValue(span, pkg, TOLERANCE_SCHEDULE.share_count);
    expect(match).not.toBeNull();
    expect(match!.delta).toBeGreaterThan(TOLERANCE_SCHEDULE.share_count);
  });

  it('share_count tier — exact: 16_000_000 vs 16_000_000 → MATCH', () => {
    const pkg = makePkg({});
    pkg.market_data.market_cap = 1_600_000_000;
    pkg.market_data.price = 100;  // → derived:shares_outstanding = 16_000_000
    const span = {
      text: '16,000,000',
      value: 16_000_000,
      position: 0,
      context: 'shares outstanding 16,000,000',
      tier: 'share_count' as const,
      section: 'executive_summary' as const,
    };
    const match = findClosestSourceValue(span, pkg, TOLERANCE_SCHEDULE.share_count);
    expect(match).not.toBeNull();
    expect(match!.delta).toBe(0);
  });

  it('percentage tier — pp comparison: 65 vs 65.5 (|0.5| ≤ 1) → MATCH', () => {
    const pkg = makePkg({ stocktwits_bull_pct: 65.5 });
    const [span] = extractNumericSpans('Bullish sentiment of 65%.', 'executive_summary');
    expect(span.tier).toBe('percentage');
    const match = findClosestSourceValue(span, pkg, TOLERANCE_SCHEDULE.percentage);
    expect(match).not.toBeNull();
    expect(match!.delta).toBeLessThanOrEqual(TOLERANCE_SCHEDULE.percentage * 100 /* not used; absolute delta */);
    // For percentage tier, delta is absolute pp.
    expect(match!.delta).toBeLessThanOrEqual(1);
  });

  it('percentage tier — pp comparison: 65 vs 67 (|2| > 1) → over tolerance', () => {
    const pkg = makePkg({ stocktwits_bull_pct: 67 });
    const [span] = extractNumericSpans('Bullish sentiment of 65%.', 'executive_summary');
    expect(span.tier).toBe('percentage');
    const match = findClosestSourceValue(span, pkg, TOLERANCE_SCHEDULE.percentage);
    expect(match).not.toBeNull();
    expect(match!.delta).toBeGreaterThan(1);
  });

  it('derived tier — span $2.44T vs price × shares = $2.4T (~1.67%) → MATCH', () => {
    // price = $150, shares (derived) = market_cap / price.
    // We synthesize a derived leaf via the synthetic-products in walkNumericLeaves.
    // Easier: use 'derived' on price/eps. price=150, eps=10 → derived = 15. Span 14.7 → delta 2% — MATCH.
    // price=150, eps=10 → derived:price/eps = 15. Span 14.8 → delta = 0.0133 ≤ 0.02 → MATCH.
    const pkg = makePkg({ price: 150, eps: 10 });
    const span = {
      text: '14.8',
      value: 14.8,
      position: 0,
      context: 'derived value of 14.8',
      tier: 'derived' as const,
      section: 'executive_summary' as const,
    };
    const match = findClosestSourceValue(span, pkg, TOLERANCE_SCHEDULE.derived);
    expect(match).not.toBeNull();
    expect(match!.delta).toBeLessThanOrEqual(TOLERANCE_SCHEDULE.derived);
  });
});

describe('numericGroundingCheck — end-to-end on synthetic AnalysisResult', () => {
  it('ungrounded_spans is empty when every span matches', () => {
    const pkg = makePkg({ pe_ratio: 23 });
    const result = numericGroundingCheck(
      { executive_summary: 'Apple trades at 23x P/E.', investment_thesis: '' },
      pkg,
    );
    expect(result.ungrounded_spans).toHaveLength(0);
    expect(result.total_spans).toBeGreaterThan(0);
    expect(result.coverage_pct).toBe(1);
  });

  it('surfaces the offending span when source disagrees', () => {
    const pkg = makePkg({ pe_ratio: 30 });
    const result = numericGroundingCheck(
      { executive_summary: 'Apple trades at 23x P/E.' },
      pkg,
    );
    expect(result.ungrounded_spans.length).toBeGreaterThanOrEqual(1);
    const f = result.ungrounded_spans[0];
    expect(f.span.text).toContain('23');
    expect(f.span.tier).toBe('ratio');
    expect(f.closest?.source_value).toBe(30);
  });

  it('context-preference: when pe_ratio=23 and fifty_two_week_high=23, "23x P/E" picks pe_ratio', () => {
    const pkg = makePkg({ pe_ratio: 23, fifty_two_week_high: 23 });
    const result = numericGroundingCheck(
      { executive_summary: 'Apple trades at 23x P/E.' },
      pkg,
    );
    // Inspect via findClosestSourceValue directly — the test asserts the
    // closest-pick prefers pe_ratio when context contains P/E.
    const [span] = extractNumericSpans('Apple trades at 23x P/E.', 'executive_summary');
    const match = findClosestSourceValue(span, pkg, TOLERANCE_SCHEDULE.ratio);
    expect(match).not.toBeNull();
    expect(match!.source_path).toBe('fundamentals.pe_ratio');
    expect(result.ungrounded_spans).toHaveLength(0);
  });
});
