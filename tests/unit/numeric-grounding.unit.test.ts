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
} from '@/lib/eval/numeric-grounding';
import { TOLERANCE_SCHEDULE } from '@/lib/eval/numeric-grounding.types';

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
