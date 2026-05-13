// src/lib/sentiment/calibration.ts
// Plan 20-B-03 — Pure calibration primitives.
//
// All functions are dependency-free (no prisma, no fs, no network). Consumed
// by scripts/calibrate-temperature.ts at fit time and by classifier modules at
// runtime via temperature-runtime.ts.
//
// References:
//   Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017).
//     "On Calibration of Modern Neural Networks." ICML 2017.
//     https://arxiv.org/abs/1706.04599
//   Brier, G. W. (1950). "Verification of forecasts expressed in terms of
//     probability." Monthly Weather Review, 78(1), 1-3.
//   Brent, R. P. (1973). "Algorithms for Minimization without Derivatives."
//     Prentice-Hall.
//
// IMPLEMENTATION NOTE — fitTemperature uses bounded golden-section search,
// NOT a multivariate L-BFGS implementation. Scalar T is a 1-D problem; the
// published references (Guo et al. 2017 §3.1) cite L-BFGS for the multi-class
// fit but in practice scipy.optimize.minimize_scalar(method='bounded') —
// Brent / golden-section internally — is the standard implementation. We
// adopt that here with zero deps.

import { CALIBRATION_BOUNDS } from './calibration-hyperparameters';

// ─── Types ───────────────────────────────────────────────────────────────

export interface ConfidencePrediction {
  /** Predicted probability of the predicted class (max softmax value). */
  confidence: number;
  /** Whether the prediction matched the label. */
  correct: boolean;
}

export interface LogitPrediction {
  /** Raw classifier logits (length = num_classes). */
  logits: number[];
  /** Integer class index of the ground truth. */
  label: number;
}

// ─── Softmax / temperature scaling ───────────────────────────────────────

/**
 * Numerically-stable softmax. Subtracts max(logits) before exponentiating to
 * avoid overflow on large positive logits.
 *
 *   softmax(z_i) = exp(z_i - max(z)) / Σ_j exp(z_j - max(z))
 */
export function softmax(logits: number[]): number[] {
  if (logits.length === 0) return [];
  let max = -Infinity;
  for (const l of logits) if (l > max) max = l;
  const exps = logits.map((l) => Math.exp(l - max));
  let sum = 0;
  for (const e of exps) sum += e;
  if (sum === 0) {
    // Degenerate fallback — equiprobable.
    return logits.map(() => 1 / logits.length);
  }
  return exps.map((e) => e / sum);
}

/**
 * Temperature-scaled softmax: returns softmax(logits / T).
 * T = 1 is the identity; T > 1 softens (entropy↑); T < 1 sharpens (entropy↓).
 *
 * Rejects T <= 0 with a descriptive throw — defends against caller passing 0.
 */
export function temperatureScale(logits: number[], T: number): number[] {
  if (!Number.isFinite(T) || T <= 0) {
    throw new Error(`temperatureScale: T must be positive and finite (got ${T})`);
  }
  if (T === 1) return softmax(logits);
  return softmax(logits.map((l) => l / T));
}

// ─── ECE / Brier ─────────────────────────────────────────────────────────

/**
 * Standard expected calibration error with equal-width binning over [0,1].
 *
 *     ECE = Σᵢ (|Bᵢ| / N) × | conf_i - acc_i |
 *
 * Where Bᵢ is the i-th bin of confidences, conf_i is the mean confidence in
 * bin i, and acc_i is the empirical accuracy in bin i. Standard reference:
 * Guo, Pleiss, Sun & Weinberger 2017 §2 (https://arxiv.org/abs/1706.04599).
 *
 * Lower is better calibrated. 0 = perfectly calibrated.
 */
export function expectedCalibrationError(
  predictions: ConfidencePrediction[],
  n_bins: number = CALIBRATION_BOUNDS.N_BINS_ECE,
): number {
  if (predictions.length === 0) return 0;
  if (n_bins <= 0 || !Number.isInteger(n_bins)) {
    throw new Error(`expectedCalibrationError: n_bins must be a positive integer (got ${n_bins})`);
  }
  const bins: { confSum: number; correctSum: number; count: number }[] = Array.from(
    { length: n_bins },
    () => ({ confSum: 0, correctSum: 0, count: 0 }),
  );
  const N = predictions.length;
  for (const p of predictions) {
    // Clamp confidence into [0, 1] and pick bin index. confidence=1.0 → last bin.
    const c = Math.min(Math.max(p.confidence, 0), 1);
    let idx = Math.floor(c * n_bins);
    if (idx >= n_bins) idx = n_bins - 1;
    bins[idx].confSum += c;
    bins[idx].correctSum += p.correct ? 1 : 0;
    bins[idx].count += 1;
  }
  let ece = 0;
  for (const b of bins) {
    if (b.count === 0) continue;
    const meanConf = b.confSum / b.count;
    const meanAcc = b.correctSum / b.count;
    ece += (b.count / N) * Math.abs(meanConf - meanAcc);
  }
  return ece;
}

/**
 * Standard Brier score for the predicted-class probability against the
 * binary correct/incorrect indicator.
 *
 *     B = (1/N) Σᵢ (p_i − y_i)²
 *
 * Lower is better. Random binary classifier ≈ 0.25; ship-gate < 0.24.
 *
 * Empty input returns 0; callers should avoid invoking on empty sets.
 */
export function brierScore(predictions: ConfidencePrediction[]): number {
  if (predictions.length === 0) return 0;
  let acc = 0;
  for (const p of predictions) {
    const y = p.correct ? 1 : 0;
    const d = p.confidence - y;
    acc += d * d;
  }
  return acc / predictions.length;
}

// ─── L-BFGS-equivalent (bounded golden-section) for scalar T ─────────────

/**
 * Negative log-likelihood at temperature T on a set of logit predictions.
 *
 *   NLL(T) = -Σᵢ log( softmax(logits_i / T)[label_i] )
 *
 * Adds a tiny epsilon to the probability before log to defend against
 * numerical zero (overflow in the wrong direction).
 */
function nllAtT(predictions: LogitPrediction[], T: number): number {
  if (predictions.length === 0) return 0;
  const EPS = 1e-12;
  let nll = 0;
  for (const p of predictions) {
    const probs = temperatureScale(p.logits, T);
    const py = probs[p.label] ?? EPS;
    nll -= Math.log(Math.max(py, EPS));
  }
  return nll;
}

/**
 * Fit single scalar temperature T minimising NLL on a held-out set via
 * bounded golden-section search (the standard 1-D analog of L-BFGS-B; see
 * scipy.optimize.minimize_scalar(method='bounded')).
 *
 * Bounds [T_MIN, T_MAX] from CALIBRATION_BOUNDS. Initial T=1.0.
 * Convergence: bracket width < CONVERGENCE_TOL × (T_MAX - T_MIN).
 * On non-convergence within MAX_ITER: return T=1.0 (identity, safe) and log
 * a warning to stderr (caller may surface to TemperatureCalibration.status).
 *
 * Reference: Guo et al. 2017 §3.1; Brent 1973 §5.
 */
export function fitTemperature(predictions: LogitPrediction[]): number {
  if (predictions.length === 0) {
    // No data — identity is the only safe choice.
    return CALIBRATION_BOUNDS.T_INITIAL;
  }

  const { T_MIN, T_MAX, CONVERGENCE_TOL, MAX_ITER } = CALIBRATION_BOUNDS;
  const phi = (1 + Math.sqrt(5)) / 2;
  const resphi = 2 - phi; // ≈ 0.381966

  let a: number = T_MIN;
  let b: number = T_MAX;
  const span = b - a;
  let x1 = a + resphi * span;
  let x2 = b - resphi * span;
  let f1 = nllAtT(predictions, x1);
  let f2 = nllAtT(predictions, x2);

  let iter = 0;
  while (iter < MAX_ITER) {
    if (Math.abs(b - a) < CONVERGENCE_TOL * span) break;
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = a + resphi * (b - a);
      f1 = nllAtT(predictions, x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = b - resphi * (b - a);
      f2 = nllAtT(predictions, x2);
    }
    iter++;
  }

  if (iter >= MAX_ITER) {
    console.warn(
      '[calibration] fitTemperature non-convergent within MAX_ITER; returning T=1.0',
    );
    return CALIBRATION_BOUNDS.T_INITIAL;
  }

  const T = (a + b) / 2;
  // Clamp into bounds (defensive — golden-section preserves them by construction).
  if (T <= T_MIN) return T_MIN;
  if (T >= T_MAX) return T_MAX;
  return T;
}

// ─── k-fold CV for ECE-after-scaling ─────────────────────────────────────

/**
 * Mulberry32 — small deterministic PRNG (32 lines worth of state).
 * Same seed → same sequence; used for reproducible fold partitions.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDet<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 5-fold cross-validation of fitTemperature + ECE-after-scaling. Returns
 * mean ± std of post-scaling ECE across folds. Defends against overfit T on
 * small validation sets (T-20-B-03-02). Folds are deterministic — same input
 * and seed produce identical (cv_ece_mean, cv_ece_std).
 */
export function kFoldCalibrationECE(
  predictions: LogitPrediction[],
  k: number = CALIBRATION_BOUNDS.N_FOLDS_CV,
  seed: number = CALIBRATION_BOUNDS.CV_SEED,
): { cv_ece_mean: number; cv_ece_std: number; per_fold: { T: number; ece_post: number }[] } {
  if (predictions.length < k || k < 2) {
    return { cv_ece_mean: 0, cv_ece_std: 0, per_fold: [] };
  }
  const shuffled = shuffleDet(predictions, seed);
  const per_fold: { T: number; ece_post: number }[] = [];

  for (let fold = 0; fold < k; fold++) {
    const valStart = Math.floor((fold * shuffled.length) / k);
    const valEnd = Math.floor(((fold + 1) * shuffled.length) / k);
    const val: LogitPrediction[] = shuffled.slice(valStart, valEnd);
    const train: LogitPrediction[] = [
      ...shuffled.slice(0, valStart),
      ...shuffled.slice(valEnd),
    ];
    const T = fitTemperature(train);
    // Reduce val predictions to ConfidencePrediction at scaled T.
    const confPreds: ConfidencePrediction[] = val.map((p) => {
      const probs = temperatureScale(p.logits, T);
      let maxIdx = 0;
      let maxP = probs[0] ?? 0;
      for (let i = 1; i < probs.length; i++) {
        if ((probs[i] ?? 0) > maxP) {
          maxP = probs[i];
          maxIdx = i;
        }
      }
      return { confidence: maxP, correct: maxIdx === p.label };
    });
    const ece_post = expectedCalibrationError(confPreds);
    per_fold.push({ T, ece_post });
  }

  const mean = per_fold.reduce((s, f) => s + f.ece_post, 0) / per_fold.length;
  const variance =
    per_fold.reduce((s, f) => s + (f.ece_post - mean) * (f.ece_post - mean), 0) /
    per_fold.length;
  return {
    cv_ece_mean: mean,
    cv_ece_std: Math.sqrt(variance),
    per_fold,
  };
}
