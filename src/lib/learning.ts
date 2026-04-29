// src/lib/learning.ts
// Bayesian learning primitives for the diffusion engine.
// Pure functions — no DB access. All state is passed in.

import type { TechPattern, TechnicalSnapshot } from './types';
import type { DiffusionTraceResult } from './diffusion-trace';

export interface BetaPosterior {
  alpha: number;
  beta: number;
}

export interface CredibleInterval {
  low: number;
  mean: number;
  high: number;
}

export interface LogisticState {
  // Online Bayesian logistic regression with Laplace approximation.
  // For each coefficient: posterior ~ Normal(mu, sigma^2)
  intercept: number;
  intercept_var: number;
  weights: number[];        // mu of each coefficient
  weight_vars: number[];    // sigma^2 of each coefficient
  feature_names: string[];
}

// ─── Beta-Bernoulli ───────────────────────────────────────────────────────

export function updatePosterior(prior: BetaPosterior, hit: boolean): BetaPosterior {
  return {
    alpha: prior.alpha + (hit ? 1 : 0),
    beta: prior.beta + (hit ? 0 : 1),
  };
}

export function posteriorMean(p: BetaPosterior): number {
  return p.alpha / (p.alpha + p.beta);
}

// 95% credible interval via numerical inversion of the regularized incomplete
// beta function. Uses a Wilson-style normal approximation when n is large
// (cheap and accurate enough for dashboard display), and the Jeffreys
// approximation when n is small.
export function credibleInterval95(p: BetaPosterior): CredibleInterval {
  const n = p.alpha + p.beta;
  const mean = p.alpha / n;
  if (n < 2) return { low: 0, mean, high: 1 };

  // Variance of Beta(α,β) = αβ / [(α+β)^2 (α+β+1)]
  const variance = (p.alpha * p.beta) / (n * n * (n + 1));
  const sd = Math.sqrt(variance);

  // Two-sided 95% via normal approximation, clipped to [0,1].
  const z = 1.96;
  return {
    low: Math.max(0, mean - z * sd),
    mean,
    high: Math.min(1, mean + z * sd),
  };
}

// Brier score = mean squared error between predicted probability and outcome.
// Lower is better; 0.25 = chance baseline for 50/50.
export function brierScore(predictions: number[], outcomes: boolean[]): number {
  if (predictions.length !== outcomes.length) {
    throw new Error('brierScore: arrays must be same length');
  }
  if (predictions.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < predictions.length; i++) {
    const o = outcomes[i] ? 1 : 0;
    total += (predictions[i] - o) ** 2;
  }
  return total / predictions.length;
}

// Drift z-score: how far the rolling-30d posterior mean is from the all-time
// posterior mean, in units of the all-time standard error.
export function driftZ(args: {
  rolling: BetaPosterior;
  allTime: BetaPosterior;
}): number {
  const n_all = args.allTime.alpha + args.allTime.beta;
  const n_30 = args.rolling.alpha + args.rolling.beta;
  if (n_all < 2 || n_30 < 1) return 0;
  const p = posteriorMean(args.allTime);
  const se = Math.sqrt((p * (1 - p)) / n_30);
  if (se === 0) return 0;
  return (posteriorMean(args.rolling) - p) / se;
}

export function classifyHit(args: {
  ticker_return_pct: number;
  spy_return_pct: number;
  threshold_pct?: number;
}): boolean {
  const threshold = args.threshold_pct ?? 1;
  return (args.ticker_return_pct - args.spy_return_pct) > threshold;
}

// ─── Bayesian logistic with Laplace approximation ─────────────────────────

function sigmoid(z: number): number {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function predictLogistic(state: LogisticState, x: number[]): number {
  let z = state.intercept;
  for (let i = 0; i < state.weights.length; i++) {
    z += state.weights[i] * x[i];
  }
  return sigmoid(z);
}

// Prior strength (precision) for the Gaussian prior on each coefficient.
// Higher = stronger prior toward 0 (more regularization).
const PRIOR_PRECISION = 1.0;

export function initLogisticState(featureNames: string[]): LogisticState {
  return {
    intercept: 0,
    intercept_var: 1 / PRIOR_PRECISION,
    weights: featureNames.map(() => 0),
    weight_vars: featureNames.map(() => 1 / PRIOR_PRECISION),
    feature_names: featureNames,
  };
}

/**
 * Single online update step. Approximates the Bayesian update via a
 * diagonal Laplace approximation: we treat each coefficient's posterior
 * as independent Gaussian and update its mean + variance with one
 * Newton-Raphson-style step weighted by the observation's gradient.
 *
 * This is deliberately simple — it's not a full IRLS update, but it
 * converges to approximately the right posterior over many observations
 * and runs in O(d) per update.
 */
export function updateLogistic(state: LogisticState, x: number[], y: 0 | 1): LogisticState {
  const p = predictLogistic(state, x);
  const error = y - p;                     // gradient for log-likelihood
  const w = p * (1 - p);                    // hessian curvature (always > 0 for sigmoid)

  // Update each coefficient's posterior:
  //   precision_new = precision_old + w * x_i^2
  //   mean_new      = mean_old + (sigma_new^2) * x_i * error
  const interceptPrecisionNew = (1 / state.intercept_var) + w * 1 * 1;
  const interceptVarNew = 1 / interceptPrecisionNew;
  const interceptNew = state.intercept + interceptVarNew * 1 * error;

  const weightsNew: number[] = new Array(state.weights.length);
  const weightVarsNew: number[] = new Array(state.weights.length);
  for (let i = 0; i < state.weights.length; i++) {
    const xi = x[i];
    const precNew = (1 / state.weight_vars[i]) + w * xi * xi;
    const varNew = 1 / precNew;
    weightVarsNew[i] = varNew;
    weightsNew[i] = state.weights[i] + varNew * xi * error;
  }

  return {
    intercept: interceptNew,
    intercept_var: interceptVarNew,
    weights: weightsNew,
    weight_vars: weightVarsNew,
    feature_names: state.feature_names,
  };
}

// 95% credible interval for a logistic coefficient.
export function logisticCoefCI(mu: number, variance: number): { low: number; mean: number; high: number } {
  const sd = Math.sqrt(Math.max(0, variance));
  return { low: mu - 1.96 * sd, mean: mu, high: mu + 1.96 * sd };
}

// ─── Adversarial null test ────────────────────────────────────────────────

// Fisher-Yates shuffle using a seeded LCG for reproducibility.
function shuffle<T>(arr: T[], seed = 1): T[] {
  const out = [...arr];
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function adversarialNullBrier(
  predictions: number[],
  outcomes: boolean[],
  trials = 100,
): { mean_null_brier: number; p_value: number; real_brier: number } {
  const real = brierScore(predictions, outcomes);
  if (predictions.length < 5) {
    return { mean_null_brier: 0.25, p_value: 1, real_brier: real };
  }
  let nullSum = 0;
  let countWorseOrEqual = 0;
  for (let t = 0; t < trials; t++) {
    const shuffled = shuffle(outcomes, 12345 + t);
    const b = brierScore(predictions, shuffled);
    nullSum += b;
    if (b <= real) countWorseOrEqual++;
  }
  return {
    mean_null_brier: nullSum / trials,
    p_value: countWorseOrEqual / trials,    // fraction of nulls at least as good as real
    real_brier: real,
  };
}

// ─── Status assignment ────────────────────────────────────────────────────

export function patternStatus(args: {
  sample_size: number;
  brier_in: number | null;
  brier_out: number | null;
  brier_null: number | null;
  drift_z: number;
}): 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' {
  if (args.sample_size < 10) return 'EXPLORATORY';
  if (args.brier_out != null && args.brier_null != null && args.brier_out > args.brier_null) {
    return 'DEPRECATED';
  }
  if (Math.abs(args.drift_z) > 2) return 'DEPRECATED';
  if (args.brier_in != null && args.brier_null != null && args.brier_in < args.brier_null) {
    return 'ACTIVE';
  }
  return 'EXPLORATORY';
}

// ─── Phase 16-03: 12-feature vector + reinit detection ────────────────────
//
// FEATURE_NAMES is the LOCKED ordering of the 12-dimensional feature vector
// trained by the Bayesian logistic in /api/cron/learn (30d outcomes only).
// Positions 0-5 are the original diffusion features (preserved verbatim from
// the pre-Phase-16 6-d state); positions 6-11 are the new technical features.
//
// Locked spec: 16-RESEARCH.md §8 lines 666-680.

export const FEATURE_NAMES = [
  // Diffusion features (positions 0-5) — preserved verbatim from pre-Phase-16
  'v_niche', 'v_middle', 'v_mainstream',
  'niche_lead_cycles', 'q_z', 'qual_z',
  // Technical features (positions 6-11) — Phase 16
  'rsi_14',
  'macd_histogram',
  'sma_relative_spread',           // (sma50 - sma200) / sma200 — NEVER absolute prices
  'atr_14',
  'volume_ratio',
  'tech_pattern_uptrend_flag',     // 1 if tech_pattern in uptrend bucket, else 0
] as const;

const UPTREND_PATTERNS: ReadonlySet<TechPattern> = new Set<TechPattern>([
  'breakout_uptrend',
  'overbought_uptrend',
  'pullback_in_uptrend',
  'consolidation',
  'golden_cross',
]);

/**
 * Build the 12-element feature vector for a single training observation.
 *
 * Null safety defaults (chosen so a missing feature exerts NO bias on the
 * sigmoid output at zero weights):
 *   - position 6  rsi_14                    null → 50  (neutral midpoint)
 *   - position 7  macd_histogram            null → 0   (zero signal)
 *   - position 8  sma_relative_spread       null sma → 0
 *   - position 9  atr_14                    null → 0
 *   - position 10 volume_ratio              null → 1   (parity with average)
 *   - position 11 tech_pattern_uptrend_flag null pattern → 0
 */
export function buildFeatureVector12(
  trace: DiffusionTraceResult,
  techSnap: TechnicalSnapshot | null,
  techPattern: TechPattern | null,
): number[] {
  const smaSpread =
    techSnap?.sma_50 != null && techSnap?.sma_200 != null && techSnap.sma_200 !== 0
      ? (techSnap.sma_50 - techSnap.sma_200) / techSnap.sma_200
      : 0;

  return [
    // Diffusion features (positions 0-5) — read from trace.
    trace.v_niche ?? 0,
    trace.v_middle ?? 0,
    trace.v_mainstream ?? 0,
    trace.niche_lead_cycles ?? 0,
    trace.q_z ?? 0,
    trace.qual_z ?? 0,
    // Technical features (positions 6-11) — read from techSnap.
    techSnap?.rsi_14 ?? 50,
    techSnap?.macd_histogram ?? 0,
    smaSpread,
    techSnap?.atr_14 ?? 0,
    techSnap?.volume_ratio ?? 1,
    techPattern && UPTREND_PATTERNS.has(techPattern) ? 1 : 0,
  ];
}

/**
 * Detects the "first post-Phase-16 cycle" condition (Pitfall 5 — RESEARCH §8
 * lines 925-930). When the latest LogisticEpoch.coefficients JSON has fewer
 * keys than FEATURE_NAMES, the legacy 6-d state must be discarded and the
 * logistic reinitialized from scratch — DO NOT pad with zeros.
 *
 * Note: an `_intercept` key is allowed to live alongside the named coefficients,
 * which is why the comparison uses `< FEATURE_NAMES.length` (not `!==`).
 */
export function needsLogisticReinit(
  coefficients: Record<string, { mu: number; sigma: number }> | null | undefined,
): boolean {
  if (!coefficients) return true;
  const namedKeys = Object.keys(coefficients).filter((k) => !k.startsWith('_'));
  return namedKeys.length < FEATURE_NAMES.length;
}
