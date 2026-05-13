// src/lib/eval/numeric-grounding.types.ts
//
// Plan 20-D-01 — Type surface for the numeric-grounding matcher.
//
// CONTEXT.md §S9 (failure-mode coverage) specifies these tolerance tiers
// (line 137 of CONTEXT.md). The schedule is the *specification* of required
// report precision — not a tuned hyperparameter — so calibration is N/A.
//
// Threat-model:
//   T-20-D-01-05 (false-fail on price-target rounding): mitigated by 1%
//     analyst-rounding tier. Per-ticker waivers are forbidden.
//   T-20-D-01-02 (arithmetic-derived numbers absent from SourcePackage):
//     mitigated by 'derived' tier at 2% + RUNBOOK escape hatch.

export type ToleranceTier =
  | 'ratio'         // P/E, P/B, profit margin, ROE                  — 0.5%
  | 'share_count'   // shares outstanding, float                      — exact (0)
  | 'revenue'       // revenue, gross profit                          — 0.1%
  | 'market_cap'    // market cap                                     — 0.1%
  | 'price_target'  // analyst price target                           — 1% (analyst rounding)
  | 'percentage'    // bull%/bear%, growth rate, etc.                 — 1 pp ABSOLUTE
  | 'derived';      // arithmetic-derived value (price × shares etc.) — 2%

export interface ToleranceSchedule {
  ratio: number;          // 0.005
  share_count: number;    // 0 (exact match required)
  revenue: number;        // 0.001
  market_cap: number;     // 0.001
  price_target: number;   // 0.01
  percentage: number;     // 0.01 (interpreted as absolute pp, not relative)
  derived: number;        // 0.02
}

/** Authoritative schedule per CONTEXT.md §S9 line 137 — exported as a frozen literal. */
export const TOLERANCE_SCHEDULE: Readonly<ToleranceSchedule> = Object.freeze({
  ratio: 0.005,
  share_count: 0,
  revenue: 0.001,
  market_cap: 0.001,
  price_target: 0.01,
  percentage: 0.01,
  derived: 0.02,
});

export type ReportSection =
  | 'executive_summary'
  | 'investment_thesis'
  | 'key_risks'
  | 'valuation_context'
  | 'future_projection'
  | 'business_description'
  | 'financial_analysis'
  | 'competitive_landscape';

export interface NumericSpan {
  /** Raw matched text, e.g. "$125.50" or "5.2%". */
  text: string;
  /** Parsed numeric value (suffix-resolved: "1.2B" → 1_200_000_000). */
  value: number;
  /** Index in source string. */
  position: number;
  /** ±30 chars surrounding the match. */
  context: string;
  /** Tier inferred from surface form + context. */
  tier: ToleranceTier;
  /** Section the span originated in. */
  section: ReportSection;
}

export interface SourceMatch {
  source_value: number;
  source_path: string;            // e.g. 'fundamentals.pe_ratio'
  field_origin: string | null;    // FieldOrigin from FieldSources metadata, if applicable
  delta: number;                  // |span.value - source_value| (abs for percentage, relative otherwise)
  tier_used: ToleranceTier;
}

export interface GroundingFailure {
  span: NumericSpan;
  closest: SourceMatch | null;
  reason: 'no_match_within_tolerance' | 'no_numeric_leaf_in_source';
}

export interface GroundingResult {
  grounded_count: number;
  ungrounded_spans: GroundingFailure[];
  total_spans: number;
  coverage_pct: number;
}

/** Inputs to inferTier — separated from NumericSpan so the helper is pure. */
export interface NumericFormHint {
  value: number;
  suffix: '' | '%' | 'x' | '×' | 'T' | 'B' | 'M' | 'K' | '％';
}
