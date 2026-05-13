// src/lib/eval/citation-coverage.types.ts
//
// Plan 20-D-02 — citation-coverage metric.
// Closed types + literal constants consumed by:
//   - src/lib/eval/citation-coverage.ts        (evaluator entry-points)
//   - src/lib/eval/claim-extraction-regex.ts   (Algorithm A — regex extractor)
//   - src/lib/eval/claim-extraction-llm.ts     (Algorithm B — LLM-judge extractor)
//   - src/lib/eval/claim-merge.ts              (mergeClaimSets + bag-of-words)
//   - scripts/eval-citation-coverage.ts        (operator + cron CLI)
//   - scripts/eval-claim-extraction-kappa.ts   (Cohen's kappa ship-gate)
//
// Constants pin the policy values surfaced by CONTEXT.md §S8/§S9. Changing any
// constant is a policy change and MUST be reviewed alongside the ship-gate.

import type { Citation } from '@/lib/sentiment/citation-schema';

// ── Policy constants ────────────────────────────────────────────────────────

/** Rule A: claim is supported if any citation anchor is within ±N chars. */
export const ANCHOR_WINDOW_CHARS = 50 as const;
/** Rule B: claim is supported if bag-of-words cosine >= this with any citation. */
export const KEYWORD_OVERLAP_MIN = 0.5 as const;
/** mergeClaimSets dedupes when claim cosine exceeds this threshold. */
export const COSINE_DEDUPE_THRESHOLD = 0.85 as const;
/** CI ship-gate floor for the overall per-ticker coverage_pct. */
export const COVERAGE_OVERALL_MIN = 80 as const;
/** CI ship-gate floor for per_section[s] when total_claims_in_s > 0. */
export const COVERAGE_SECTION_MIN = 60 as const;

// ── Section taxonomy ───────────────────────────────────────────────────────

/** Closed union — every section a Claim can be attributed to. */
export type ReportSection =
  | 'executive_summary'
  | 'investment_thesis'
  | 'bullish_signals'
  | 'bearish_signals'
  | 'key_risks'
  | 'valuation_context'
  | 'future_projection'
  | 'sentiment_intelligence'
  | 'community_intelligence'
  | 'engine_calibration'
  | 'sources_used';

/** Runtime array — match the union exactly. Used by iteration + validation. */
export const REPORT_SECTIONS: readonly ReportSection[] = [
  'executive_summary',
  'investment_thesis',
  'bullish_signals',
  'bearish_signals',
  'key_risks',
  'valuation_context',
  'future_projection',
  'sentiment_intelligence',
  'community_intelligence',
  'engine_calibration',
  'sources_used',
] as const;

// ── Domain types ───────────────────────────────────────────────────────────

export interface Claim {
  text: string;
  section: ReportSection;
  /** Section-local offset where the claim sentence begins. */
  start_char: number;
  /** Section-local offset where the claim sentence ends (exclusive). */
  end_char: number;
  source_method: 'regex' | 'llm' | 'merged';
  /** numeric-only claims are filtered by extractors — those belong to 20-D-01. */
  kind: 'qualitative';
}

export interface CitationAnchor {
  citation: Citation;
  /** Section-local position of the citation's first textual anchor; -1 if not located. */
  anchor_pos: number;
  section: ReportSection;
}

export interface CoverageResult {
  coverage_pct: number;
  per_section: Record<ReportSection, number>;
  unsupported: Claim[];
  totals: {
    total_claims: number;
    supported: number;
    unsupported: number;
    /** Claims surviving merge that only one method (regex XOR llm) tagged. */
    kappa_method_disagreements: number;
  };
}
