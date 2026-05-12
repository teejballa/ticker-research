// src/lib/eval/types.ts
// Plan 20-Z-05 — Types for the LLM-as-judge eval harness.
//
// Five-dimension rubric for baseline-vs-candidate equity-research report
// excerpts. Scores are 0..5 integers; overall is the arithmetic mean in [0,5].
//
// JudgeResult is the per-call output. HumanExemplar is the format of every
// JSON file under tests/golden-tickers/_human_labels/ — used by
// scripts/eval-report.ts to compute per-dimension Pearson correlation between
// judge scores and human ratings.
//
// Threat model: types are pinned (literal unions) so a typo in a dimension
// name, score value, or model id fails at compile time rather than corrupting
// the calibration store. The `judge_model` field is a string literal
// `'claude-opus-4-7'` — the harness MUST NOT support any other model.

export type JudgeDimension =
  | 'numeric_grounding'
  | 'citation_coverage'
  | 'narrative_coherence'
  | 'hedging_quality'
  | 'contradiction_handling';

export const JUDGE_DIMENSIONS: readonly JudgeDimension[] = [
  'numeric_grounding',
  'citation_coverage',
  'narrative_coherence',
  'hedging_quality',
  'contradiction_handling',
] as const;

export type JudgeScoreValue = 0 | 1 | 2 | 3 | 4 | 5;

export interface JudgeScore {
  dimension: JudgeDimension;
  score: JudgeScoreValue;
  rationale: string;
}

export interface JudgeResult {
  /** UUID v4 — uniquely identifies this judge call. */
  run_id: string;
  /** Caller-supplied id for the baseline excerpt (defaults to 'baseline'). */
  baseline_id: string;
  /** Caller-supplied id for the candidate excerpt (defaults to 'candidate'). */
  candidate_id: string;
  /** Length 5 — one per JudgeDimension, in canonical dimension order. */
  scores: JudgeScore[];
  /** Mean of scores, in [0,5]. */
  overall: number;
  /** Aggregate-level Pearson — computed by scripts/eval-report.ts, NOT per-call. */
  pearson_vs_human?: number;
  /** Pinned from the prompt registry (e.g. 'v1'). */
  judge_prompt_version: string;
  /** Pinned literal — the only judge model this harness ever calls. */
  judge_model: 'claude-opus-4-7';
  /** ISO-8601 timestamp when the call completed. */
  ran_at: string;
}

/**
 * Per-exemplar human label. Files under tests/golden-tickers/_human_labels/
 * MUST conform to this shape. 20-D-04 expands the starter set from 5 to 30.
 */
export interface HumanExemplar {
  exemplar_id: string;
  ticker: string;
  /** Short prose note — why this exemplar was selected. */
  notes: string;
  baseline_text: string;
  candidate_text: string;
  /** Required: a score 0..5 for every JudgeDimension. */
  human_scores: Record<JudgeDimension, JudgeScoreValue>;
  /** Who labeled the exemplar. */
  labeler: string;
  /** ISO-8601 timestamp when the labeling completed. */
  labeled_at: string;
}
