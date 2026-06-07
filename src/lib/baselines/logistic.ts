/**
 * Phase 21.1 D-11/D-12 — logistic baseline head-to-head against the LLM.
 *
 * Two named baselines per D-11:
 *   - engine36   : 36-feature post-z-score space (strongest "LLM beats numeric" claim)
 *   - canonical7 : 7 lit-cited features (strongest "LLM beats lit classics" claim)
 *
 * Both baselines reuse predictLogistic/updateLogistic/LogisticState from
 * src/lib/learning.ts per D-12 (no new ML framework).
 *
 * Ridge precision sweep over a caller-supplied grid per D-13; winner =
 * min OOS Brier on Purged K-Fold + Embargo splits from src/lib/cv.ts.
 *
 * Pure functions — no DB IO. All state is passed in.
 */

import {
  initLogisticState,
  predictLogistic,
  updateLogistic,
  FEATURE_NAMES_36,
  type LogisticState,
} from '@/lib/learning';
import {
  buildCanonicalFeatures,
  CANONICAL_FEATURE_NAMES,
  type CanonicalSnapshot,
} from './canonical-features';
import { informationCoefficient } from '@/lib/evaluation';
import type { Fold } from '@/lib/cv';

export type BaselineName = 'engine36' | 'canonical7';

/**
 * A single training/scoring observation for a named baseline.
 *
 * For engine36: caller pre-builds features36 (36-d vector) using
 * buildFeatureVector36 from learning.ts. Pre-building avoids re-deriving
 * DiffusionTraceResult from a raw DB snapshot at scoring time.
 *
 * For canonical7: caller provides the CanonicalSnapshot; buildCanonicalFeatures
 * is called here so the math stays in one place.
 *
 * @knowable_at  decision time — caller ensures all fields are PIT-correct;
 *               cv.ts purgedKFold enforces temporal ordering on the full row set
 */
export interface TrainingRow {
  /** Pre-built 36-feature vector for engine36 baseline. @knowable_at decision time */
  features36?: number[];
  /** Pre-joined canonical features for canonical7 baseline. @knowable_at decision time */
  canonical?: CanonicalSnapshot;
  /** Primary label: is_sigma_hit_k1 from Wave 2 (D-14). 1=hit, 0=miss. */
  hit: 0 | 1;
  /** sector_relative_pct in percentage-points. Used for IC (Spearman rank corr). */
  forward_return: number;
}

export interface TrainOpts {
  /** Ridge prior precision (1/variance). Higher = stronger shrinkage toward 0. */
  priorPrecision: number;
}

export interface ScoreResult {
  /** Mean squared error of predicted probability vs binary hit label. Null if n=0. */
  brier: number | null;
  /** Binary cross-entropy. Null if n=0. */
  log_loss: number | null;
  /** Spearman IC of predicted probability vs forward_return. NaN if n<10. */
  ic: number;
  /** Number of eval rows scored. */
  n: number;
  /** Raw predicted probabilities (for BCa bootstrap CIs by caller). */
  predictions: number[];
  /** Raw forward returns (parallel to predictions, for IC CI). */
  returns: number[];
}

export interface SweepResult {
  /** Chosen prior precision (minimizes mean OOS Brier). */
  chosen_prior: number;
  /** OOS Brier at chosen prior. */
  best_brier: number;
  /** Full sweep table for HYPERPARAMETERS.md (Wave 6). */
  sweep_table: Array<{
    prior: number;
    mean_oos_brier: number;
    std_oos_brier: number;
  }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function featureVectorFor(row: TrainingRow, name: BaselineName): number[] {
  if (name === 'engine36') {
    if (row.features36 != null) return row.features36;
    // Cold-start fallback: zero vector (caller should pre-build features36)
    console.warn('[logistic baseline] features36 missing on row; using zero vector');
    return new Array(36).fill(0);
  }
  // canonical7
  if (row.canonical == null) {
    console.warn('[logistic baseline] canonical missing on row; using zero vector');
    return new Array(7).fill(0);
  }
  return buildCanonicalFeatures(row.canonical);
}

function initialState(name: BaselineName, priorPrecision: number): LogisticState {
  const featureNames =
    name === 'engine36' ? [...FEATURE_NAMES_36] : [...CANONICAL_FEATURE_NAMES];
  // Rebuild from scratch with the supplied precision (variance = 1/precision).
  // We do NOT call initLogisticState (which uses the module-level PRIOR_PRECISION=1)
  // so the ridge sweep can vary precision freely per D-13.
  return {
    intercept: 0,
    intercept_var: 1 / priorPrecision,
    weights: featureNames.map(() => 0),
    weight_vars: featureNames.map(() => 1 / priorPrecision),
    feature_names: featureNames,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Train a named baseline by iterating online Bayesian updates over rows.
 *
 * opts.priorPrecision overrides the default; varied during the ridge sweep.
 *
 * @param name            'engine36' | 'canonical7'
 * @param rows            Training observations in chronological order (caller's invariant)
 * @param opts            Training options; defaults priorPrecision=1.0
 * @returns               Trained LogisticState with 36 or 7 weights
 *
 * @knowable_at  max(row.decision_time for row in rows) — caller uses purgedKFold
 *               to ensure no future information leaks into the training set
 */
export function trainBaseline(
  name: BaselineName,
  rows: TrainingRow[],
  opts: TrainOpts = { priorPrecision: 1.0 },
): LogisticState {
  let state = initialState(name, opts.priorPrecision);
  for (const row of rows) {
    const x = featureVectorFor(row, name);
    state = updateLogistic(state, x, row.hit);
  }
  return state;
}

/**
 * Score a trained baseline against eval rows.
 *
 * Returns Brier (MSE on binary hit), binary cross-entropy (log-loss), and
 * Spearman IC vs forward_return. All three are proper scoring rules per
 * CLAUDE.md rule #7.
 *
 * @param state     Trained LogisticState (output of trainBaseline)
 * @param rows      Evaluation rows (must NOT overlap training rows)
 * @param name      Which baseline's feature extractor to use
 * @returns         ScoreResult; brier/log_loss are null when n=0
 */
export function scoreBaseline(
  state: LogisticState,
  rows: TrainingRow[],
  name: BaselineName = 'engine36',
): ScoreResult {
  if (rows.length === 0) {
    return { brier: null, log_loss: null, ic: NaN, n: 0, predictions: [], returns: [] };
  }

  const predictions: number[] = [];
  const returns: number[] = [];
  const hits: (0 | 1)[] = [];

  for (const row of rows) {
    const x = featureVectorFor(row, name);
    const p = predictLogistic(state, x);
    predictions.push(p);
    returns.push(row.forward_return);
    hits.push(row.hit);
  }

  // Brier score (MSE on binary label)
  const brier =
    predictions.reduce((acc, p, i) => acc + (p - hits[i]) ** 2, 0) / predictions.length;

  // Binary cross-entropy (proper scoring rule for binary classification)
  const eps = 1e-15;
  const log_loss =
    -predictions.reduce((acc, p, i) => {
      const pc = Math.min(Math.max(p, eps), 1 - eps);
      return acc + (hits[i] === 1 ? Math.log(pc) : Math.log(1 - pc));
    }, 0) / predictions.length;

  // Spearman IC (predicted prob vs forward return)
  const ic = informationCoefficient(predictions, returns, 'spearman');

  return { brier, log_loss, ic, n: predictions.length, predictions, returns };
}

/**
 * Ridge precision sweep per D-13.
 *
 * For each precision value in `grid`, runs train/eval on every Purged K-Fold
 * split from cv.ts, records OOS Brier per fold, then averages. Returns the
 * precision that minimizes the mean OOS Brier.
 *
 * Recommended grids per RESEARCH §9 Q5:
 *   engine36   : [1, 2, 4, 8, 16]
 *   canonical7 : [0.5, 1, 2, 4]
 *
 * @param name      Which baseline to sweep
 * @param rows      Full chronologically-ordered training set
 * @param grid      Precision values to try (all positive)
 * @param cvFolds   Fold split indices from purgedKFold (cv.ts Fold[])
 * @returns         SweepResult with chosen_prior, best_brier, sweep_table
 */
export function sweepPriorPrecision(
  name: BaselineName,
  rows: TrainingRow[],
  grid: number[],
  cvFolds: Fold[],
): SweepResult {
  const sweep_table: SweepResult['sweep_table'] = [];

  for (const prior of grid) {
    const foldBriers: number[] = [];

    for (const fold of cvFolds) {
      const trainRows = fold.trainIdx.map((i) => rows[i]);
      const testRows = fold.testIdx.map((i) => rows[i]);
      if (trainRows.length === 0 || testRows.length === 0) continue;

      const state = trainBaseline(name, trainRows, { priorPrecision: prior });
      const score = scoreBaseline(state, testRows, name);
      if (score.brier != null) foldBriers.push(score.brier);
    }

    if (foldBriers.length === 0) {
      sweep_table.push({ prior, mean_oos_brier: NaN, std_oos_brier: NaN });
      continue;
    }

    const mean =
      foldBriers.reduce((a, b) => a + b, 0) / foldBriers.length;
    const variance =
      foldBriers.reduce((acc, b) => acc + (b - mean) ** 2, 0) /
      Math.max(foldBriers.length - 1, 1);

    sweep_table.push({ prior, mean_oos_brier: mean, std_oos_brier: Math.sqrt(variance) });
  }

  // Pick minimum mean OOS Brier; break ties by choosing smaller prior (less shrinkage)
  const valid = sweep_table.filter((r) => Number.isFinite(r.mean_oos_brier));
  if (valid.length === 0) {
    // Fallback: return first grid value
    return { chosen_prior: grid[0] ?? 1.0, best_brier: NaN, sweep_table };
  }
  const best = valid.reduce((a, b) => (a.mean_oos_brier <= b.mean_oos_brier ? a : b));
  return { chosen_prior: best.prior, best_brier: best.mean_oos_brier, sweep_table };
}
