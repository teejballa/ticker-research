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
  effective_sample_size?: number;
}): 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' {
  // CONTEXT D-04: ESS<30 supersedes raw sample_size<10 when ESS provided.
  if (args.effective_sample_size != null) {
    if (args.effective_sample_size < 30) return 'EXPLORATORY';
  } else if (args.sample_size < 10) {
    return 'EXPLORATORY';
  }
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

// ─── Phase 18: Status enum poisoning mitigation (T-18-04) ─────────────────
//
// Centralized union of allowed `LearnedPattern.status` values. The status
// column is a free-form `String` in Prisma — without this const, typos in
// downstream code can silently write garbage into the DB. Plan 18-04 (cron
// rewire) will type-cast through `LearnedStatus` whenever it writes status,
// closing the tampering surface (T-18-04 mitigation).
//
// Note: 'EXPLORATORY-WATCH' is reachable only via the cron drift state
// machine (CONTEXT D-09), never from the pure `patternStatus` primitive.

export const STATUS_VALUES = ['ACTIVE', 'EXPLORATORY', 'EXPLORATORY-WATCH', 'DEPRECATED'] as const;
export type LearnedStatus = typeof STATUS_VALUES[number];

// ─── Phase 18: Time-decay primitives (D-03 Kish ESS, D-18 pure functions) ─

export interface WeightedObservation {
  hit: boolean;
  recorded_at: Date;
}

/**
 * Exponential decay weights w_i = exp(-Δt_i / λ). λ in days.
 * Future-dated observations (Δt < 0) are clamped to weight 1.0 — they cannot
 * be "more recent than now" so we treat them as just-recorded.
 */
export function decayWeights(
  obs: WeightedObservation[],
  lambdaDays: number,
  now: Date = new Date(),
): number[] {
  const t0 = now.getTime();
  const dayMs = 86_400_000;
  return obs.map(o => {
    const dtDays = Math.max(0, (t0 - o.recorded_at.getTime()) / dayMs);
    return Math.exp(-dtDays / lambdaDays);
  });
}

/**
 * Kish effective sample size: ESS = (Σw)² / Σw².
 * Returns 0 for empty / all-zero input (no NaN — keeps DB writes safe).
 */
export function computeESS(weights: number[]): number {
  if (weights.length === 0) return 0;
  let sum = 0;
  let sumSq = 0;
  for (const w of weights) {
    sum += w;
    sumSq += w * w;
  }
  return sumSq === 0 ? 0 : (sum * sum) / sumSq;
}

/**
 * Weighted Beta-Bernoulli posterior: replaces +1 / +0 increments with
 * +w_i on the hit side / +w_i on the miss side. Equivalent to integrating
 * the prior over per-observation likelihoods scaled by w_i.
 */
export function updatePosteriorWeighted(
  prior: BetaPosterior,
  obs: WeightedObservation[],
  weights: number[],
): BetaPosterior {
  if (obs.length !== weights.length) {
    throw new Error('updatePosteriorWeighted: obs and weights must be same length');
  }
  let a = prior.alpha;
  let b = prior.beta;
  for (let i = 0; i < obs.length; i++) {
    if (obs[i].hit) a += weights[i];
    else b += weights[i];
  }
  return { alpha: a, beta: b };
}

// ─── Phase 18: Page-Hinkley + two-of-two confirmation (D-06, D-08) ────────

/**
 * Page-Hinkley accumulator over per-observation deltas (residuals from a
 * running mean). Tracks both upward and downward shift accumulators so
 * sustained shifts in either direction are caught. Returns
 *   max(MUp, MDown) - λ_PH
 * which is positive iff the worst-case accumulator has crossed the
 * configured threshold — i.e. a candidate alert.
 *
 * - δ is a magnitude tolerance: per-step shift below δ does not advance
 *   the accumulator (filters noise).
 * - λ_PH is the alert threshold: how much accumulated shift we require
 *   before calling drift.
 *
 * On a stationary stream the accumulators stay near 0 and the return
 * value is ≤ 0 (silent). On a sustained shift larger than δ, the
 * accumulator grows linearly until it exceeds λ_PH (positive return).
 */
export function pageHinkleyStatistic(
  deltas: number[],
  delta: number,
  lambdaPH: number,
): number {
  let mUp = 0;
  let mDown = 0;
  let MUp = 0;
  let MDown = 0;
  for (const d of deltas) {
    mUp = Math.max(0, mUp + d - delta);
    mDown = Math.max(0, mDown - d - delta);
    if (mUp > MUp) MUp = mUp;
    if (mDown > MDown) MDown = mDown;
  }
  return Math.max(MUp, MDown) - lambdaPH;
}

/**
 * Two-of-two drift confirmation per CONTEXT D-06:
 *   fires iff
 *     (raw N ≥ 30 — D-08 floor)        AND
 *     (|drift_z| > 2 — z-test)         AND
 *     (pageHinkleyStatistic > 0 — PH)
 *
 * Returns the four numeric fields the cron route persists into the
 * `drift_alert` LearningEvent.delta payload. All numeric — no string
 * injection surface (T-18-05 mitigation).
 *
 * Pure function: no DB access, no I/O, no side effects (D-18 invariant).
 * Status flip to 'EXPLORATORY-WATCH' is intentionally NOT done here — it
 * is a cron-level state machine decision (D-09), not a pure-primitive one.
 */
export function confirmedDrift(args: {
  rolling: BetaPosterior;
  allTime: BetaPosterior;
  perObsDeltas: number[];
  delta: number;
  lambdaPH: number;
  rawN: number;
}): { fired: boolean; drift_z: number; ph_stat: number; ph_threshold: number } {
  const drift_z = driftZ({ rolling: args.rolling, allTime: args.allTime });
  const ph_stat = pageHinkleyStatistic(args.perObsDeltas, args.delta, args.lambdaPH);
  const fired = args.rawN >= 30 && Math.abs(drift_z) > 2 && ph_stat > 0;
  return { fired, drift_z, ph_stat, ph_threshold: args.lambdaPH };
}

// ─── Phase 18: Per-class hyperparameter config (CONTEXT D-01, D-07; RESEARCH §Q4) ─
//
// Per-class λ (decay half-life days) + Page-Hinkley (δ, λ_PH) parameters live
// here as a typed config constant. Per RESEARCH §Q4 this is the recommended
// storage shape: type-checked, version-controlled, reviewable in PR — re-tunes
// leave a git diff. Per CONTEXT D-19 keeps schema additive-only by avoiding a
// LearningHyperparameters table until P21.
//
// CURRENT VALUES are conservative bootstrap defaults pending the empirical
// grid search in Plan 18-06 (`scripts/tune-decay.ts` + `scripts/tune-page-hinkley.ts`):
//   - lambda_days = 60 → median of the CONTEXT D-01 grid {14,30,60,90,180,365}.
//                        Half-life of 60d means observations from ~2 months
//                        ago carry ~50% the weight of today's. Defensible
//                        midpoint for thin-N (N=87) until tuning runs.
//   - ph_delta    = 0.005 → midpoint of the D-07 grid {0.001, 0.005, 0.01}.
//   - ph_lambda   = 50    → midpoint of the D-07 grid {30, 50, 100}.
//   - tuned_at    = "bootstrap" → flagged so consumers know these are pre-tuning.
//   - cv_brier_oos = null → no CV result yet; Plan 18-06 will populate.
//
// Plan 18-05 (this plan, backfill cron) needs `lambda_days` to compute decayWeights
// for each cell during the one-time replay. Bootstrap defaults are reversible:
// re-running the backfill with a different λ post-Plan-18-06 just rewrites α/β/ESS
// from the same raw outcomes (CONTEXT D-14 — outcomes table is the source of truth).
//
// signal_class union locked to the four values written by the daily learn cron
// (`processOneOutcome` writes diffusion + technical + insider + institutional posterior_update events).

export type SignalClass = 'diffusion' | 'technical' | 'insider' | 'institutional';

export interface ClassHyperparameters {
  lambda_days: number;
  ph_delta: number;
  ph_lambda: number;
  tuned_at: string;          // ISO-8601 timestamp OR "bootstrap" sentinel
  cv_brier_oos: number | null;
}

// Plan 18-06 low-N escape hatch: tune-lambda + tune-page-hinkley scripts run against the
// live PriceOutcome table produced NaN Brier / F1=0 across every grid cell. Root cause: 87
// outcomes clustered in ~30 days, and the D-16 leakage-defended Purged K-Fold (purge=embargo=90)
// excludes essentially every training fold. Plan 18-06 Task 2 step 5 explicitly authorizes
// keeping bootstrap placeholders when no row clears `cv_brier_oos < 0.25` — Plan 10 verification
// allows that path. Re-tune in Plan 21 once Plan 25 backfill grows N past the embargo window.
export const HYPERPARAMETERS: Record<SignalClass, ClassHyperparameters> = {
  diffusion: {
    lambda_days: 60,
    ph_delta: 0.005,
    ph_lambda: 50,
    tuned_at: 'bootstrap', // TODO: re-tune in Plan 21 once N grows past backfill bootstrap (P25)
    cv_brier_oos: null,
  },
  technical: {
    lambda_days: 60,
    ph_delta: 0.005,
    ph_lambda: 50,
    tuned_at: 'bootstrap', // TODO: re-tune in Plan 21 once N grows past backfill bootstrap (P25)
    cv_brier_oos: null,
  },
  insider: {
    lambda_days: 60,
    ph_delta: 0.005,
    ph_lambda: 50,
    tuned_at: 'bootstrap', // TODO: re-tune in Plan 21 once N grows past backfill bootstrap (P25)
    cv_brier_oos: null,
  },
  institutional: {
    lambda_days: 60,
    ph_delta: 0.005,
    ph_lambda: 50,
    tuned_at: 'bootstrap', // TODO: re-tune in Plan 21 once N grows past backfill bootstrap (P25)
    cv_brier_oos: null,
  },
};
