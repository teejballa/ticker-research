// src/lib/sentiment/fairness-types.ts
//
// Plan 20-C-06 — Fairness audit type taxonomy.
//
// Single source of truth for the GICS-11 sector literal, the cap-class
// re-export from the diffusion engine, and the FairnessReport row shape.
//
// References:
//   • CONTEXT.md line 129 — GICS-1 11-sector verbatim list + Brier > 0.27 /
//     ECE > 0.10 limitation thresholds.
//   • MSCI/S&P Global GICS Standard (Global Industry Classification Standard,
//     2023 revision) — the 11 sectors are an industry-standard taxonomy.
//   • src/lib/learning.ts — owns CapClass; we re-export to avoid parallel
//     taxonomy drift (No-Duplication Gate).
//
// @model-card: docs/cards/MODEL-CARD-finbert.md
// (Fairness audit augments existing classifier cards; no new card is added.)

// CapClass: single source of truth lives in the diffusion engine; we use
// the LearnedPattern.cap_class string-typed convention shipped by Phase 1.
// The diffusion engine itself doesn't export a literal union (it uses
// `string` on the Prisma column), so we declare the 5-bucket literal here
// as the documented taxonomy, matching the values written by the existing
// classifyHit + computeEngineThesis paths in learning.ts.
export type CapClass = 'mega' | 'large' | 'mid' | 'small' | 'micro';

/** GICS Global Industry Classification Standard — sector level (GICS-1). */
export type GICSSector =
  | 'Energy'
  | 'Materials'
  | 'Industrials'
  | 'Consumer Discretionary'
  | 'Consumer Staples'
  | 'Health Care'
  | 'Financials'
  | 'Information Technology'
  | 'Communication Services'
  | 'Utilities'
  | 'Real Estate';

export const GICS_SECTORS: readonly GICSSector[] = [
  'Energy',
  'Materials',
  'Industrials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Health Care',
  'Financials',
  'Information Technology',
  'Communication Services',
  'Utilities',
  'Real Estate',
] as const;

export type Geography = 'US' | 'non-US';

export type TickerAgeBucket = '<1y' | '1-5y' | '>5y';

export interface TickerMetadata {
  cap_class: CapClass;
  sector: GICSSector | 'Unknown';
  country: string | 'Unknown';
  listing_date: Date | null;
  fetched_at: Date;
}

export interface ClassifierPrediction {
  snapshot_id: string;
  ticker: string;
  classifier_version: string;
  /** Predicted probability of the positive class in [0, 1]. */
  predicted_prob: number;
  /** Realized binary outcome: 1 = bullish hit (alpha-vs-SPY > 0.01), 0 = miss. */
  actual_outcome: 0 | 1;
  /** Time the snapshot was scanned (used for windowing audits). */
  snapshot_time: Date;
}

export type FairnessDimension =
  | 'cap_class'
  | 'sector'
  | 'geography'
  | 'ticker_age';

export interface FairnessReport {
  dimension: FairnessDimension;
  segment: string;
  brier: number;
  ece: number;
  n_samples: number;
  /**
   * True iff (brier > 0.27 OR ece > 0.10) AND insufficient_data is false.
   * Raw threshold per CONTEXT.md line 129 spec — BH FDR column below is
   * informational, not gating (T-20-C-06-05).
   */
  is_limitation: boolean;
  /** True iff n_samples < MIN_SEGMENT_SIZE (30, CLT standard). */
  insufficient_data: boolean;
  /** Benjamini-Hochberg-adjusted q-value across all segments (informational). */
  bh_q_value: number;
}
