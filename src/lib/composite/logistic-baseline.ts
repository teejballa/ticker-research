// src/lib/composite/logistic-baseline.ts
// Phase 24 Wave 2 Task 24-02-03 (REASON-10, CLAUDE.md §8).
// Non-LLM logistic-36 baseline for the composite ship gate. IRLS via ml-matrix
// (Iteratively Reweighted Least Squares — the standard MLE solver for logistic
// regression per CS229 "Discriminative Classifiers" + ISL Ch. 4 §Logistic Regression).
//
// Time-series discipline (CLAUDE.md #1): logistic36Brier() takes explicit fit/eval
// window indices and REJECTS overlapping windows. There is no random k-fold path.
//
// Wave 3 cron (/api/cron/composite-calibration) imports logistic36Brier() and
// populates CompositeCalibrationSnapshot.baseline_brier_logistic_36 per cell.
// Wave 4 ship-gate (Gate 5) requires composite_brier < baseline_brier_logistic_36 - 0.005
// as a mandatory gate — no more "skip if null" — because this module produces
// a real numeric baseline for every holdout window with ≥ 1 row.

import { Matrix, inverse } from 'ml-matrix';

export interface LogisticRow {
  features: number[]; // length MUST be 36
  outcome: 0 | 1;
  predicted_at?: Date;
}

export interface LogisticBaselineModel {
  coefficients: number[]; // length 37 = 36 features + intercept (coefficients[0])
  converged: boolean;
  iterations: number;
  log_likelihood: number;
}

const N_FEATURES = 36;
const MAX_ITER = 50;
const TOL = 1e-6;

function sigmoid(z: number): number {
  // Numerically stable: avoid overflow at large |z|.
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

function assertFeatureLength(row: LogisticRow, idx: number): void {
  if (row.features.length !== N_FEATURES) {
    throw new Error(
      `logistic-baseline: row ${idx} has ${row.features.length} features, expected ${N_FEATURES}`,
    );
  }
}

/**
 * Fit logistic regression via IRLS. Returns model with 37 coefficients
 * (intercept at [0], then 36 feature weights). Deterministic on identical
 * input — no random seed needed; IRLS is a closed-form MLE solver.
 *
 * Optional ridge penalty λ on non-intercept coefficients per ISL Ch. 6.
 * Convergence: |Δβ|∞ < 1e-6 OR 50 iterations. Returns model with
 * `converged: false` when hitting iteration cap.
 */
export function fitLogisticBaseline(
  rows: LogisticRow[],
  opts: { ridge?: number } = {},
): LogisticBaselineModel {
  if (rows.length === 0) {
    throw new Error('fitLogisticBaseline: empty rows');
  }
  const ridge = opts.ridge ?? 0;
  const N = rows.length;
  const P = N_FEATURES + 1; // 37: intercept + 36 features
  const Xdata: number[][] = new Array(N);
  const ydata: number[] = new Array(N);
  for (let i = 0; i < N; i++) {
    assertFeatureLength(rows[i], i);
    const row = new Array<number>(P);
    row[0] = 1;
    for (let k = 0; k < N_FEATURES; k++) row[k + 1] = rows[i].features[k];
    Xdata[i] = row;
    ydata[i] = rows[i].outcome;
  }

  // IRLS: β_{t+1} = β_t + (Xᵀ W X + λI)⁻¹ Xᵀ (y − p)
  //   W = diag(p_i (1 − p_i))
  const beta = new Array<number>(P).fill(0);
  let converged = false;
  let iter = 0;
  for (; iter < MAX_ITER; iter++) {
    // p_i = σ(x_iᵀ β)
    const p = new Array<number>(N);
    for (let i = 0; i < N; i++) {
      let z = 0;
      for (let k = 0; k < P; k++) z += Xdata[i][k] * beta[k];
      p[i] = sigmoid(z);
    }
    // W diag entries; clamp p ∈ [1e-6, 1-1e-6] to avoid singular W.
    const wDiag = new Array<number>(N);
    for (let i = 0; i < N; i++) {
      const pi = Math.min(1 - 1e-6, Math.max(1e-6, p[i]));
      wDiag[i] = pi * (1 - pi);
    }
    // XtWX = Xᵀ · diag(w) · X (P × P). Compute directly (avoid materializing diag matrix).
    const XtWX = Matrix.zeros(P, P);
    for (let a = 0; a < P; a++) {
      for (let b = a; b < P; b++) {
        let s = 0;
        for (let i = 0; i < N; i++) s += Xdata[i][a] * wDiag[i] * Xdata[i][b];
        XtWX.set(a, b, s);
        if (b !== a) XtWX.set(b, a, s);
      }
    }
    if (ridge > 0) {
      for (let a = 1; a < P; a++) XtWX.set(a, a, XtWX.get(a, a) + ridge); // no penalty on intercept
    }
    // Xᵀ(y - p) — the gradient (score) vector.
    const grad = new Array<number>(P).fill(0);
    for (let a = 0; a < P; a++) {
      let s = 0;
      for (let i = 0; i < N; i++) s += Xdata[i][a] * (ydata[i] - p[i]);
      grad[a] = s;
    }
    // Newton step: Δβ = (XᵀWX + λI)⁻¹ · grad
    const gradVec = Matrix.columnVector(grad);
    let step: Matrix;
    try {
      step = inverse(XtWX).mmul(gradVec);
    } catch {
      converged = false;
      iter++;
      break;
    }
    let maxAbsDelta = 0;
    for (let k = 0; k < P; k++) {
      const dk = step.get(k, 0);
      beta[k] += dk;
      if (Math.abs(dk) > maxAbsDelta) maxAbsDelta = Math.abs(dk);
    }
    if (maxAbsDelta < TOL) {
      converged = true;
      iter++;
      break;
    }
  }

  // Final log-likelihood on training data.
  let ll = 0;
  for (let i = 0; i < N; i++) {
    let z = 0;
    for (let k = 0; k < P; k++) z += Xdata[i][k] * beta[k];
    const pi = sigmoid(z);
    const eps = 1e-12;
    ll += ydata[i] * Math.log(Math.max(eps, pi)) + (1 - ydata[i]) * Math.log(Math.max(eps, 1 - pi));
  }

  return { coefficients: beta, converged, iterations: iter, log_likelihood: ll };
}

/**
 * Score a single row: σ(β₀ + Σₖ βₖ xₖ) ∈ [0, 1].
 */
export function predictLogisticBaseline(model: LogisticBaselineModel, row: LogisticRow): number {
  assertFeatureLength(row, 0);
  let z = model.coefficients[0];
  for (let k = 0; k < N_FEATURES; k++) z += model.coefficients[k + 1] * row.features[k];
  return sigmoid(z);
}

/**
 * Compute Brier score on eval window for a logistic-36 model fit on the fit window.
 *
 * Time-series discipline (CLAUDE.md #1): fit_end MUST be ≤ eval_start.
 * Random k-fold is NEVER acceptable for time-series labels — the function throws
 * if the two windows overlap.
 *
 * Returns Brier ∈ [0, 1] = mean((p − y)²) over the eval slice.
 */
export function logistic36Brier(
  rows: LogisticRow[],
  fitWindow: { fit_start: number; fit_end: number },
  evalWindow: { eval_start: number; eval_end: number },
): number {
  // Time-series discipline (CLAUDE.md #1): forward-chaining ONLY.
  if (fitWindow.fit_end > evalWindow.eval_start) {
    throw new Error(
      `logistic36Brier: fit_end (${fitWindow.fit_end}) > eval_start (${evalWindow.eval_start}) — forward-chaining required (CLAUDE.md #1). Random k-fold NEVER acceptable for time-series labels.`,
    );
  }
  const fitRows = rows.slice(fitWindow.fit_start, fitWindow.fit_end);
  const evalRows = rows.slice(evalWindow.eval_start, evalWindow.eval_end);
  if (fitRows.length === 0) throw new Error('logistic36Brier: empty fit window');
  if (evalRows.length === 0) throw new Error('logistic36Brier: empty eval window');
  const model = fitLogisticBaseline(fitRows);
  let sse = 0;
  for (const r of evalRows) {
    const p = predictLogisticBaseline(model, r);
    sse += (p - r.outcome) ** 2;
  }
  return sse / evalRows.length;
}
