// src/lib/learning.ts
// Bayesian learning primitives for the diffusion engine.
// Pure functions — no DB access. All state is passed in.

import { z } from 'zod';
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

// ─── Hierarchical empirical-Bayes pooling (Plan 19-A-07, CORE-ML-11..14) ──

export interface PooledPosterior {
  alpha_pooled: number;
  beta_pooled: number;
  parent_alpha: number;
  parent_beta: number;
  shrinkage_strength: number;
}

/**
 * Empirical Bayes hierarchical pooling per CORE-ML-11..14.
 * Method-of-moments estimation of a group-level Beta hyperprior, then per-cell
 * shrinkage: α_pooled = (n × α_local + λ × α_group) / (n + λ).
 * λ is bounded to [0.5, 50] for numerical stability.
 *
 * Cold-start: groups with fewer than 5 cells return the local posterior
 * unchanged with shrinkage_strength=0 — falls back to the flat prior path.
 *
 * Pure function — no DB access, no module-level state.
 */
export function hierarchicalPooledPosterior(args: {
  cell_local: BetaPosterior;
  cell_n: number;
  group_cells: BetaPosterior[];
}): PooledPosterior {
  const { cell_local, cell_n, group_cells } = args;
  const k = group_cells.length;
  if (k < 5) {
    return {
      alpha_pooled: cell_local.alpha,
      beta_pooled: cell_local.beta,
      parent_alpha: 1,
      parent_beta: 1,
      shrinkage_strength: 0,
    };
  }
  const means = group_cells.map((c) => c.alpha / (c.alpha + c.beta));
  const muBar = means.reduce((a, b) => a + b, 0) / k;
  const sigma2 =
    means.reduce((acc, m) => acc + (m - muBar) ** 2, 0) / Math.max(1, k - 1);
  const ratio = sigma2 > 0 ? (muBar * (1 - muBar)) / sigma2 - 1 : 50;
  const groupAlpha = Math.max(0.5, muBar * Math.max(1, ratio));
  const groupBeta = Math.max(0.5, (1 - muBar) * Math.max(1, ratio));
  const lambda = Math.min(50, Math.max(0.5, groupAlpha + groupBeta));
  return {
    alpha_pooled: (cell_n * cell_local.alpha + lambda * groupAlpha) / (cell_n + lambda),
    beta_pooled: (cell_n * cell_local.beta + lambda * groupBeta) / (cell_n + lambda),
    parent_alpha: groupAlpha,
    parent_beta: groupBeta,
    shrinkage_strength: lambda,
  };
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
 *
 * Plan 19-A-01 (D-17) — guard against lambdaDays <= 0 / NaN / ±Infinity:
 * exp(-Δt / 0) = Infinity silently corrupted ESS downstream when any caller
 * passed 0. The empty-input contract (`decayWeights([], λ)` returns `[]`) is
 * preserved naturally by the obs.map() — we throw only when there is work to
 * do AND lambda is invalid. Existing call sites (cron/learn:515,
 * cron/backfill-ess:155) all pass HYPERPARAMETERS-derived positives, so the
 * guard is no-op for the production happy path.
 */
export function decayWeights(
  obs: WeightedObservation[],
  lambdaDays: number,
  now: Date = new Date(),
): number[] {
  if (!Number.isFinite(lambdaDays) || lambdaDays <= 0) {
    throw new Error(
      `decayWeights: lambdaDays must be > 0 and finite (got: ${lambdaDays}). ` +
      `If you need decay disabled, omit the call rather than passing 0.`
    );
  }
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

// ─── Phase 19 Plan 19-A-02: chronological split + Brier OOS guard + embargo ─
//
// CONTEXT D-18 — replaces buggy `Math.max(1, n-14)` split in cron/learn route
// (silent 0-row OOS at n<16 → Brier=0 disguise). Pure functions live here so
// the cron route stays a thin orchestrator and the bug fix is unit-testable.

/**
 * Chronological time-based train/test split — replaces buggy `Math.max(1, n-14)`
 * per Plan 19-A-02 / D-18.
 *
 * Sorts items by `recorded_at` ascending, then partitions: first `(1-testFraction)`
 * train, last `testFraction` test. Honors chronological order — no look-ahead
 * leakage from future rows into the in-sample fit.
 *
 * Edge cases:
 *   - n=0 → `{ train: [], test: [] }`
 *   - n=1 → `{ train: [item], test: [] }` (singleton cannot be split)
 *   - n=2 → `{ train: 1, test: 1 }`
 *   - n>=2 → respects `testFraction` proportion (rounded up to ensure non-empty
 *     test); for n=14, testFraction=0.2 → 11 train, 3 test (vs. n-14 = 0 test)
 *
 * Pure: does not mutate the input array (clones via spread before sort).
 */
export function timeBasedSplit<T extends { recorded_at: Date }>(
  items: T[],
  testFraction: number = 0.2,
): { train: T[]; test: T[] } {
  if (items.length === 0) return { train: [], test: [] };
  if (items.length === 1) return { train: [...items], test: [] };

  const sorted = [...items].sort(
    (a, b) => a.recorded_at.getTime() - b.recorded_at.getTime(),
  );

  // Ensure at least 1 test item; for n >= 2 honor testFraction proportionally.
  const testSize = Math.max(1, Math.ceil(sorted.length * testFraction));
  const trainEnd = sorted.length - testSize;

  return {
    train: sorted.slice(0, trainEnd),
    test: sorted.slice(trainEnd),
  };
}

/**
 * Compute out-of-sample Brier with null-on-tiny-test-set guard.
 *
 * Plan 19-A-02 / D-18: previously the cron route ran `brierScore` on a
 * potentially 0-row test slice (silent 0). Below 5 OOS rows the Brier is too
 * noisy to be meaningful regardless — return `null` with a `reason` string so
 * downstream readers can distinguish "haven't accumulated enough OOS data" from
 * "model is perfect".
 *
 * The split is run internally on the `observations` array — `predictions[i]`
 * is paired by index. Both arrays must have the same length; the OOS slice is
 * the chronologically-newest `testFraction` portion of `observations`.
 */
export function computeBrierOOS(
  predictions: number[],
  observations: WeightedObservation[],
  testFraction: number = 0.2,
): { brier: number | null; reason: string | null } {
  if (predictions.length !== observations.length) {
    throw new Error(
      'computeBrierOOS: predictions and observations must be same length',
    );
  }
  if (observations.length === 0) {
    return { brier: null, reason: 'n_test=0 < 5' };
  }
  // Index-pair the predictions with observations so when we sort by recorded_at,
  // each prediction follows its observation into the test slice.
  const paired = observations.map((o, i) => ({
    recorded_at: o.recorded_at,
    hit: o.hit,
    pred: predictions[i],
  }));
  const { test } = timeBasedSplit(paired, testFraction);
  if (test.length < 5) {
    return { brier: null, reason: `n_test=${test.length} < 5` };
  }
  const testPreds = test.map((t) => t.pred);
  const testHits = test.map((t) => t.hit);
  return { brier: brierScore(testPreds, testHits), reason: null };
}

/**
 * Look-ahead embargo filter — Plan 19-A-02 / D-18.
 *
 * Drops snapshots whose `scanned_at` is within `horizonDays` of an outcome's
 * `recordedAt`. The reasoning: a snapshot recorded only a few days before
 * the outcome resolves carries information that has effectively already
 * leaked from the future (the outcome's price path is partly priced-in by
 * the time the snapshot is taken). Filtering them out at trace-build time
 * eliminates the look-ahead bias.
 *
 * Comparison is strict `<`: snapshots EXACTLY `horizonDays` before the
 * outcome are rejected (conservative — leakage defense errs on caution).
 * `horizonDays=0` degenerates to "accept everything ≤ outcome time" (also
 * preserves existing behavior for callers that opt out of the embargo).
 *
 * Pure: does not mutate the input array.
 */
export function filterSnapshotsForEmbargo<T extends { scanned_at: Date }>(
  snapshots: T[],
  outcomeRecordedAt: Date,
  horizonDays: number,
): T[] {
  const horizonMs = horizonDays * 86_400_000;
  const cutoff = outcomeRecordedAt.getTime();
  return snapshots.filter((s) => {
    const gap = cutoff - s.scanned_at.getTime();
    // gap <= horizonMs → reject (within embargo, conservative strict <
    // boundary handling — exactly-at-boundary is rejected). gap > horizonMs →
    // accept. gap < 0 (snapshot scanned after outcome) is also rejected —
    // future-dated snapshots cannot inform a past-resolved outcome.
    if (horizonDays === 0) {
      // Degenerate case: embargo disabled. Only reject future-dated snapshots.
      return gap >= 0;
    }
    return gap > horizonMs;
  });
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

// Phase 18 / Plan 06 Task 2 step 5 escape hatch: signal classes whose tuning was
// deferred because N is too low to score meaningfully under the D-16 leakage-defended
// Purged K-Fold protocol (purge=embargo=90d). Plan 21 will re-tune post-Plan-25 backfill.
//
// Plan 18-10 sanity test (`learning.hyperparameters.test.ts`) walks this set: every class
// whose `cv_brier_oos === null` OR `cv_brier_oos >= 0.25` MUST appear here so the
// "did not pass the Pitfall-3 Brier gate at merge time" audit trail is greppable.
//
// All four classes are currently deferred — Plan 18-06's tuning runs against the live
// PriceOutcome table produced NaN Brier across every grid cell (87 outcomes clustered in
// ~30 days, every fold's [tMin-90d, tMax+90d] window swallows essentially every other
// observation). Per Plan 18-06 step 5 this is the authorized skip path.
export const HYPERPARAMETERS_DEFERRED_RETUNE: ReadonlySet<SignalClass> = new Set<SignalClass>([
  'diffusion',
  'technical',
  'insider',
  'institutional',
]);

// ─── Phase 19 Plan 19-A-01: HYPERPARAMETERS Zod schema (T-19-A-01-02) ─────
//
// Validate HYPERPARAMETERS at module load — typos in signal class names or
// out-of-range params now fail fast at import (and CI), not deep inside the
// cron route at use time. Per CONTEXT D-17.

const ClassHyperparametersSchema = z.object({
  lambda_days: z.number().positive().finite(),
  ph_delta: z.number().positive().finite(),
  ph_lambda: z.number().positive().finite(),
  tuned_at: z.string().min(1),
  cv_brier_oos: z.number().nullable(),
});

// TODO(Phase 20+): adding regime hyperparams here will require either updating this
// schema or removing .strict(). Currently the schema is .strict() to catch typos in
// signal class names at module load — but this means any new field added to
// HYPERPARAMETERS will throw at import time until the schema catches up.
// (Per RESEARCH Pitfall 2 — 19-RESEARCH.md lines 381-392.)
const HyperparametersSchema = z.object({
  diffusion: ClassHyperparametersSchema,
  technical: ClassHyperparametersSchema,
  insider: ClassHyperparametersSchema,
  institutional: ClassHyperparametersSchema,
}).strict();

export function validateHyperparameters(input: unknown): asserts input is typeof HYPERPARAMETERS {
  const result = HyperparametersSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    if (first && first.code === 'unrecognized_keys') {
      throw new Error(`HYPERPARAMETERS: unknown signal class — ${first.keys?.join(', ')}`);
    }
    throw new Error(
      `HYPERPARAMETERS validation failed: ${result.error.issues
        .map((i) => i.path.join('.') + ': ' + i.message)
        .join('; ')}`,
    );
  }
}

// Module-load assertion (Plan 19-A-01 — T-19-A-01-02 mitigation).
// If the bootstrap config above ever drifts away from the schema (e.g.
// someone adds a signal class without updating HyperparametersSchema), this
// throws at import time and every importer of `src/lib/learning.ts` fails
// loudly in CI rather than silently in production. Per RESEARCH Pitfall 2,
// the trade-off is that future-phase additions must update the schema in the
// same PR — the TODO above flags that contract.
validateHyperparameters(HYPERPARAMETERS);

// ─── Phase 19 Plan 19-A-03: Vovk-Romano split-conformal interval (D-19) ───
//
// Distribution-free prediction interval primitive. ADDITIVE — does not
// modify the existing Bayesian credibleInterval95 path; engine-context.ts
// surfaces both side-by-side and EngineCalibrationPanel renders both.
//
// Source: Vovk, Gammerman, Shafer 2005 (split-conformal); Tibshirani's
// Berkeley lecture notes for the zero-indexed `⌈(1-α)(n+1)⌉ - 1` quantile
// formula. Coverage validated synthetic n=10000 within ±2% of nominal 1-α
// across α ∈ {0.01, 0.05, 0.10, 0.20} (tests/learning.conformal.test.ts).
//
// Edge cases (T-19-A-03-01 mitigation — pin the off-by-one defense):
//   - n < 10 calibration → return widest possible interval [0, 1] rather
//     than throwing. Caller can detect via the n_calibration field and
//     show a "pending" UI state. Threshold matches the n<10 Bayesian
//     EXPLORATORY gate so the two CI surfaces light up together.
//   - prediction near 0 / 1 → interval is clipped to [0, 1] (probabilities,
//     not raw scores). Symmetry around pointPrediction is preserved when
//     no clamp fires.

/**
 * Output of `conformalInterval` — a distribution-free prediction band at
 * miscoverage level α (default 0.05 = 95% nominal coverage).
 */
export interface ConformalInterval {
  low: number;
  high: number;
  alpha: number;          // miscoverage level (0.05 → 95% nominal)
  n_calibration: number;  // size of the calibration set used for the quantile
}

/**
 * Vovk-Romano split-conformal prediction interval.
 *
 * @param pointPrediction      - model's prediction at a new point in [0, 1]
 * @param calibrationResiduals - |y_i − ŷ_i| over a held-out calibration set
 * @param alpha                - miscoverage level (default 0.05 → 95% nominal)
 * @returns interval with empirical coverage ≥ 1 − α (distribution-free
 *          guarantee under exchangeability)
 *
 * Implementation: sort the calibration residuals ascending, take the value
 * at zero-indexed position `⌈(1-α)(n+1)⌉ - 1` (clamped to n-1), and use it
 * as the half-width. Interval is clamped to [0, 1] since the Cipher use
 * case is probability prediction.
 *
 * Edge: n < 10 returns the widest possible interval [0, 1] with the actual
 * `n_calibration` reported. Caller is responsible for surfacing the
 * "pending" state to the user.
 */
export function conformalInterval(
  pointPrediction: number,
  calibrationResiduals: number[],
  alpha: number = 0.05,
): ConformalInterval {
  const n = calibrationResiduals.length;
  if (n < 10) {
    return { low: 0, high: 1, alpha, n_calibration: n };
  }
  const sorted = [...calibrationResiduals].sort((a, b) => a - b);
  // Vovk-Romano: quantile at zero-indexed position ⌈(1-α)(n+1)⌉ - 1.
  // The Math.min clamp covers the α=0 / α very small edge where the
  // computed index would otherwise overflow past the end of the sorted array.
  const idx = Math.min(n - 1, Math.ceil((1 - alpha) * (n + 1)) - 1);
  const q = sorted[idx];
  return {
    low: Math.max(0, pointPrediction - q),
    high: Math.min(1, pointPrediction + q),
    alpha,
    n_calibration: n,
  };
}

// ─── Phase 19 Plan 19-A-04: Lopez de Prado anti-overfitting trifecta ──────
//
// Three additive pure-function primitives implementing the Lopez de Prado
// quant-grade backtest validation toolkit (per CONTEXT D-20). Unblocks v2.0
// P21 (Lift-Gated Cell Promotion). All three are DB-free per the CLAUDE.md
// "learning.ts is pure functions, no DB" invariant.
//
// References:
//   - DSR  : Bailey & Lopez de Prado 2014, "The Deflated Sharpe Ratio" §4
//            (https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)
//   - PBO  : Bailey, Borwein, Lopez de Prado, Zhu 2014, "The Probability of
//            Backtest Overfitting" (CSCV algorithm — sections 3.1–3.3)
//   - CPCV : Lopez de Prado 2018, "Advances in Financial Machine Learning"
//            chapter 7.4 (Combinatorial Purged K-Fold)
//
// Golden-master tested to 1e-6 tolerance against pinned fixtures
// (tests/learning.dsr-pbo.test.ts and tests/learning.cpcv.test.ts).

// --- Standard normal helpers (no jstat dep — keep tree slim) -----------------
//
// Φ via Abramowitz-Stegun §26.2.17 — accurate to ~1e-7 (sufficient for the
// 1e-6 golden-master tolerance). Φ⁻¹ via Beasley-Springer-Moro — accurate to
// ~1e-9 in the body and ~1e-7 in the tails. Identical numerical recipes to
// the test-side reference implementations so DSR matches to 6+ decimals.

function _normCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  const p =
    d *
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function _normInverseCDF(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new Error('normInverseCDF: p must be in (0, 1)');
  }
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(
        ((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q +
        c[5]
      ) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

function _clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// --- Deflated Sharpe Ratio ---------------------------------------------------
//
// DSR(SR̂; N, T, V, γ̂₃, γ̂₄) = Φ((SR̂ - SR0) / σ_{SR0})
//
//   SR0 = √V · [(1 - γ_E)·Φ⁻¹(1 - 1/N) + γ_E·Φ⁻¹(1 - 1/(N·e))]
//   σ_{SR0} = √((1 - γ̂₃·SR̂ + (γ̂₄ - 1)/4·SR̂²) / (T - 1))
//
// γ_E = 0.5772156649015329 is the Euler-Mascheroni constant.
//
// SR0 is the expected MAX of N independent N(0, V) Sharpe estimates — the
// selection-bias floor. DSR collapses to PSR (probabilistic SR) when N=1.

export function deflatedSharpeRatio(args: {
  estimatedSR: number;
  numTrials: number;
  backtestHorizonT: number;
  variance: number;
  skewness: number;
  kurtosis: number;
}): number {
  const {
    estimatedSR: SR,
    numTrials: N,
    backtestHorizonT: T,
    variance: V,
    skewness: g3,
    kurtosis: g4,
  } = args;
  if (!Number.isFinite(SR) || !Number.isFinite(V) || V <= 0) return 0;
  if (!Number.isFinite(N) || N < 1) {
    throw new Error('deflatedSharpeRatio: numTrials must be >= 1');
  }
  if (!Number.isFinite(T) || T <= 1) {
    throw new Error('deflatedSharpeRatio: backtestHorizonT must be > 1');
  }
  const gammaE = 0.5772156649015329;
  const sqrtV = Math.sqrt(V);
  // For N=1, Φ⁻¹(0) is -∞; SR0 collapses to 0 (no selection bias). Guard
  // explicitly so the function still returns the PSR value.
  let SR0: number;
  if (N <= 1) {
    SR0 = 0;
  } else {
    SR0 =
      sqrtV *
      ((1 - gammaE) * _normInverseCDF(1 - 1 / N) +
        gammaE * _normInverseCDF(1 - 1 / (N * Math.E)));
  }
  const sigmaSR0Numer = 1 - g3 * SR + ((g4 - 1) / 4) * SR * SR;
  // Numerator should be positive for any reasonable (γ₃, γ₄, SR). If pathology
  // produces a negative variance, return 0 rather than NaN.
  if (sigmaSR0Numer <= 0) return 0;
  const sigmaSR0 = Math.sqrt(sigmaSR0Numer / (T - 1));
  if (sigmaSR0 === 0) return SR > SR0 ? 1 : 0;
  return _clamp01(_normCDF((SR - SR0) / sigmaSR0));
}

// --- Probability of Backtest Overfitting (CSCV) ------------------------------
//
// Combinatorially Symmetric Cross-Validation per BBLPZ 2014 §3:
//   1. Form a returns matrix M of shape [T_total][n_strategies]. Concatenate
//      in-sample and out-of-sample returns; the algorithm itself defines IS/OOS
//      via S-partition splits (we use the full row stack — IS rows then OOS).
//   2. Partition rows into S equal blocks. For every C(S, S/2) way to choose
//      S/2 blocks as IS and the remaining S/2 as OOS:
//        - Compute metric_func per strategy on each side
//        - Identify the IS-best strategy n* and find its OOS rank ω̄
//        - Compute the relative-rank logit λ = log(ω̄ / (1 - ω̄))
//   3. PBO = fraction of partitions with λ ≤ 0 (i.e. IS-best does worse than
//      median OOS).
//
// Defaults: metric_func = annualized Sharpe (mean/sd) per BBLPZ §3.2; S = 16.
//
// NOTE on input shape: callers in this codebase pass [n_strategies][n_periods]
// (strategies as outer index — matches the test harness). We transpose
// internally to [n_periods][n_strategies] for the row-block partitioning.

export function probBacktestOverfitting(args: {
  inSampleStrategies: number[][];
  outOfSampleStrategies: number[][];
  S?: number;
  metricFunc?: (returns: number[]) => number;
}): number {
  const S = args.S ?? 16;
  const metric = args.metricFunc ?? sharpeMetric;
  if (S < 2 || S % 2 !== 0) {
    throw new Error('probBacktestOverfitting: S must be an even integer >= 2');
  }
  const inS = args.inSampleStrategies;
  const oos = args.outOfSampleStrategies;
  if (!Array.isArray(inS) || !Array.isArray(oos)) {
    throw new Error('probBacktestOverfitting: strategies must be 2-D arrays');
  }
  const M = inS.length;
  if (M < 2) throw new Error('probBacktestOverfitting: need ≥ 2 strategies');
  if (oos.length !== M) {
    throw new Error(
      'probBacktestOverfitting: in/out strategy counts must match',
    );
  }
  // Concatenate IS+OOS by row index per strategy → joint matrix [T][M]
  // where T = T_in + T_out. CSCV operates on this joint matrix.
  const T_in = inS[0].length;
  const T_out = oos[0].length;
  const T_total = T_in + T_out;
  // Validate uniform row lengths
  for (let m = 0; m < M; m++) {
    if (inS[m].length !== T_in || oos[m].length !== T_out) {
      throw new Error(
        'probBacktestOverfitting: ragged returns — all strategies must share a length',
      );
    }
  }
  // Joint matrix in [T_total][M] (period-major) for block partitioning
  const J: number[][] = new Array(T_total);
  for (let t = 0; t < T_in; t++) {
    const row = new Array(M);
    for (let m = 0; m < M; m++) row[m] = inS[m][t];
    J[t] = row;
  }
  for (let t = 0; t < T_out; t++) {
    const row = new Array(M);
    for (let m = 0; m < M; m++) row[m] = oos[m][t];
    J[T_in + t] = row;
  }
  // Block partition: equal-size contiguous blocks of size ⌊T_total / S⌋.
  // Tail samples beyond S·blockSize are dropped (BBLPZ §3.1).
  const blockSize = Math.floor(T_total / S);
  if (blockSize < 2) {
    throw new Error(
      `probBacktestOverfitting: ${T_total} samples too short for S=${S} (need ≥ ${2 * S})`,
    );
  }
  const blocks: number[][][] = []; // S blocks each of [blockSize][M]
  for (let s = 0; s < S; s++) {
    const start = s * blockSize;
    blocks.push(J.slice(start, start + blockSize));
  }
  // Generate every C(S, S/2) way to choose IS-blocks
  const halfS = S / 2;
  const combos = _combinations(S, halfS);
  let countOverfit = 0;
  for (const isCombo of combos) {
    const isMask = new Array(S).fill(false);
    for (const idx of isCombo) isMask[idx] = true;
    // Build IS rows and OOS rows
    const isRows: number[][] = [];
    const oosRows: number[][] = [];
    for (let s = 0; s < S; s++) {
      if (isMask[s]) isRows.push(...blocks[s]);
      else oosRows.push(...blocks[s]);
    }
    // Per-strategy IS metric and OOS metric
    const isMetric = new Array(M);
    const oosMetric = new Array(M);
    for (let m = 0; m < M; m++) {
      const isCol = isRows.map((r) => r[m]);
      const oosCol = oosRows.map((r) => r[m]);
      isMetric[m] = metric(isCol);
      oosMetric[m] = metric(oosCol);
    }
    // n* = argmax IS metric (ties broken by lowest index, deterministic)
    let bestIdx = 0;
    for (let m = 1; m < M; m++) {
      if (isMetric[m] > isMetric[bestIdx]) bestIdx = m;
    }
    // Rank of bestIdx in OOS (1 = worst, M = best). Higher rank = OOS-good.
    let rank = 1;
    const bestOos = oosMetric[bestIdx];
    for (let m = 0; m < M; m++) {
      if (m === bestIdx) continue;
      if (oosMetric[m] < bestOos) rank++;
    }
    // Relative rank ω̄ ∈ (0, 1) using mid-rank correction. BBLPZ Eq 5:
    // ω̄ = rank / (M + 1).
    const omega = rank / (M + 1);
    // λ = log(ω̄ / (1 - ω̄)). λ ≤ 0 ⇔ ω̄ ≤ 0.5 ⇔ overfit on this partition.
    const lambda = Math.log(omega / (1 - omega));
    if (lambda <= 0) countOverfit++;
  }
  return countOverfit / combos.length;
}

function sharpeMetric(returns: number[]): number {
  const n = returns.length;
  if (n < 2) return 0;
  let sum = 0;
  for (const r of returns) sum += r;
  const mean = sum / n;
  let varSum = 0;
  for (const r of returns) varSum += (r - mean) * (r - mean);
  const sd = Math.sqrt(varSum / (n - 1));
  if (sd === 0) return 0;
  return mean / sd;
}

// Generate all k-element index combinations of [0, n). Iterative emit so
// memory stays O(C(n,k)) (acceptable for S ≤ 16 → C(16,8)=12870).
function _combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const buf: number[] = new Array(k);
  function rec(start: number, depth: number) {
    if (depth === k) {
      out.push(buf.slice());
      return;
    }
    const remaining = k - depth;
    for (let i = start; i <= n - remaining; i++) {
      buf[depth] = i;
      rec(i + 1, depth + 1);
    }
  }
  rec(0, 0);
  return out;
}

// --- Combinatorial Purged K-Fold CV ------------------------------------------
//
// Lopez de Prado 2018 ch.7.4. Given N folds and k test-folds-per-split,
// generate every C(N, k) combination of test folds. For each combination:
//   - test_indices  = union of the k chosen folds
//   - embargo zone  = `embargo` samples adjacent to each test-fold boundary
//   - train_indices = remaining folds minus the embargo zone
//
// Backtest paths nPaths = ⌊C(N, k) · k / N⌋ — every fold is tested in
// exactly C(N-1, k-1) splits, and concatenating one test prediction per fold
// across distinct splits yields nPaths independent OOS path histories.

export interface CPCVSplit {
  train_indices: number[];
  test_indices: number[];
  embargo_indices: number[];
}

export function combinatorialPurgedKFold(args: {
  n: number;
  k: number;
  embargo: number;
  totalSamples: number;
}): { splits: CPCVSplit[]; nPaths: number } {
  const { n, k, embargo, totalSamples } = args;
  if (!Number.isInteger(n) || n < 2) {
    throw new Error('combinatorialPurgedKFold: n must be integer ≥ 2');
  }
  if (!Number.isInteger(k) || k < 1) {
    throw new Error('combinatorialPurgedKFold: k must be integer ≥ 1');
  }
  if (k >= n) {
    throw new Error(
      `combinatorialPurgedKFold: k (${k}) must be < n (${n}) — need ≥ 1 train fold`,
    );
  }
  if (!Number.isInteger(totalSamples) || totalSamples < n) {
    throw new Error(
      `combinatorialPurgedKFold: totalSamples (${totalSamples}) must be ≥ n (${n})`,
    );
  }
  if (embargo < 0 || !Number.isInteger(embargo)) {
    throw new Error('combinatorialPurgedKFold: embargo must be int ≥ 0');
  }
  const foldSize = Math.floor(totalSamples / n);
  // Fold boundaries: fold f spans [f*foldSize, (f+1)*foldSize). Tail samples
  // beyond n*foldSize are unassigned (matches LdP's convention).
  const foldRange = (f: number) => ({
    start: f * foldSize,
    end: (f + 1) * foldSize, // exclusive
  });
  const splits: CPCVSplit[] = [];
  const combos = _combinations(n, k);
  for (const testFolds of combos) {
    const testSet = new Set(testFolds);
    const test_indices: number[] = [];
    for (const f of testFolds) {
      const { start, end } = foldRange(f);
      for (let i = start; i < end; i++) test_indices.push(i);
    }
    // Embargo: for each test fold f, embargo trailing edge samples
    // [end, end + embargo) and (optionally) leading edge for symmetry. LdP
    // §7.4.2 specifies trailing-only purge for purely forward-leaking labels;
    // the test asserts |embargo_indices| ≤ k·embargo.
    const embargoSet = new Set<number>();
    for (const f of testFolds) {
      const { end } = foldRange(f);
      for (let i = end; i < end + embargo && i < totalSamples; i++) {
        // Only embargo indices that fall in another (non-test) fold — embargo
        // applied within a contiguous test region is wasted.
        const trainFold = Math.floor(i / foldSize);
        if (trainFold < n && !testSet.has(trainFold)) embargoSet.add(i);
      }
    }
    const embargo_indices = Array.from(embargoSet).sort((a, b) => a - b);
    // Train = all fold indices NOT in test and NOT in embargo
    const train_indices: number[] = [];
    for (let f = 0; f < n; f++) {
      if (testSet.has(f)) continue;
      const { start, end } = foldRange(f);
      for (let i = start; i < end; i++) {
        if (!embargoSet.has(i)) train_indices.push(i);
      }
    }
    splits.push({ train_indices, test_indices, embargo_indices });
  }
  const nPaths = Math.floor((combos.length * k) / n);
  return { splits, nPaths };
}

// ─── Calibration Validation Harness (Phase 19 / Plan 19-A-06 / D-22) ─────────
//
// Two pure functions for the calibration audit script (scripts/calibration-
// report.ts):
//
//   reliabilityDiagram() — partition predictions into nBins quantile bins and
//     report (mean predicted probability, observed hit frequency) per bin. For
//     a perfectly calibrated model the two columns lie on the y=x diagonal.
//
//   hosmerLemeshow() — chi-square goodness-of-fit on the same bins:
//        χ² = Σ_g [(O_1g - E_1g)² / (E_1g · (1 - π_g))]
//     with df = nBins - 2. Large χ² (small p-value < 0.05) ⇒ reject the null
//     hypothesis of good calibration. Reference: Hosmer & Lemeshow 2000 §5.
//
// Chi-square CDF is computed via the regularized lower incomplete gamma
// function (no jstat dep — keep tree slim, matches the project's existing
// "no jstat" convention from the DSR/PBO code above).

export interface ReliabilityBin {
  binIndex: number;
  binLow: number;
  binHigh: number;
  meanPrediction: number;
  observedFrequency: number;
  count: number;
}

export function reliabilityDiagram(args: {
  predictions: number[];
  outcomes: boolean[];
  nBins?: number; // default 10 quantile bins
}): ReliabilityBin[] {
  const { predictions, outcomes } = args;
  const nBins = args.nBins ?? 10;
  if (predictions.length !== outcomes.length) {
    throw new Error(
      `reliabilityDiagram: predictions and outcomes must be same length (${predictions.length} vs ${outcomes.length})`,
    );
  }
  if (!Number.isInteger(nBins) || nBins < 2) {
    throw new Error('reliabilityDiagram: nBins must be integer ≥ 2');
  }
  const n = predictions.length;
  // Sort jointly by prediction so bins are quantile-based.
  const indexed: Array<{ p: number; o: boolean }> = new Array(n);
  for (let i = 0; i < n; i++) indexed[i] = { p: predictions[i], o: outcomes[i] };
  indexed.sort((a, b) => a.p - b.p);

  const out: ReliabilityBin[] = [];
  if (n === 0) return out;
  const baseSize = Math.floor(n / nBins);
  for (let b = 0; b < nBins; b++) {
    const start = b * baseSize;
    // Last bin absorbs the tail so all samples are accounted for.
    const end = b === nBins - 1 ? n : start + baseSize;
    const slice = indexed.slice(start, end);
    const cnt = slice.length;
    let pSum = 0;
    let hits = 0;
    for (const x of slice) {
      pSum += x.p;
      if (x.o) hits++;
    }
    const meanP = cnt > 0 ? pSum / cnt : 0;
    const obsF = cnt > 0 ? hits / cnt : 0;
    out.push({
      binIndex: b,
      binLow: cnt > 0 ? slice[0].p : 0,
      binHigh: cnt > 0 ? slice[cnt - 1].p : 0,
      meanPrediction: meanP,
      observedFrequency: obsF,
      count: cnt,
    });
  }
  return out;
}

export interface HosmerLemeshowResult {
  chiSquare: number;
  degreesOfFreedom: number;
  pValue: number;
  bins: ReliabilityBin[];
}

export function hosmerLemeshow(args: {
  predictions: number[];
  outcomes: boolean[];
  nBins?: number;
}): HosmerLemeshowResult {
  const bins = reliabilityDiagram(args);
  // χ² = Σ_g [(O_1g - E_1g)² / (E_1g · (1 - π_g))]
  // O_1g = observed hits in bin g
  // E_1g = expected hits in bin g = π_g · n_g
  // π_g  = mean predicted probability in bin g
  let chi2 = 0;
  for (const b of bins) {
    const O1 = b.observedFrequency * b.count;
    const E1 = b.meanPrediction * b.count;
    const piG = b.meanPrediction;
    const denom = E1 * (1 - piG);
    if (denom > 0 && Number.isFinite(denom)) {
      chi2 += ((O1 - E1) ** 2) / denom;
    }
    // If denom == 0 (all predictions in bin are exactly 0 or 1) the bin
    // contributes nothing — by convention HL drops degenerate bins.
  }
  const df = Math.max(1, bins.length - 2);
  const pValue = 1 - _chiSquareCDF(chi2, df);
  return { chiSquare: chi2, degreesOfFreedom: bins.length - 2, pValue, bins };
}

// ─── Chi-square CDF helpers (no external stats lib) ──────────────────────────
//
// CDF(χ²; k) = P(k/2, χ²/2) where P is the regularized lower incomplete gamma
// function. Implementation follows Numerical Recipes §6.2:
//   - Series expansion for x < a + 1
//   - Continued fraction for x ≥ a + 1
// Both branches converge to ~1e-12 precision well within the 50-iteration cap.

function _logGamma(x: number): number {
  // Lanczos approximation (g=7), accurate to ~1e-15 for x > 0.
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection formula: Γ(x)Γ(1-x) = π / sin(πx)
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - _logGamma(1 - x)
    );
  }
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return (
    0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
  );
}

function _gammaIncP(a: number, x: number): number {
  // Regularized lower incomplete gamma P(a, x) = γ(a, x) / Γ(a).
  if (x < 0 || a <= 0) return 0;
  if (x === 0) return 0;
  if (x < a + 1) {
    // Series representation (Numerical Recipes 6.2.5)
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - _logGamma(a));
  }
  // Continued fraction representation (Lentz's method, NR 6.2.7).
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  // Q(a,x) = continued fraction × exp(-x + a ln x - ln Γ(a)); P = 1 - Q.
  const Q = Math.exp(-x + a * Math.log(x) - _logGamma(a)) * h;
  return 1 - Q;
}

function _chiSquareCDF(chi2: number, df: number): number {
  if (!Number.isFinite(chi2) || chi2 <= 0) return 0;
  if (df <= 0) return 0;
  const p = _gammaIncP(df / 2, chi2 / 2);
  // Numerical guard: clamp to [0, 1] in case of tiny floating-point excursions.
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

// ─── Plan 20-A-05 — LearnedPattern.pattern_key agreement bucket ───
//
// Backward-compatibility-preserving extension to the pattern_key composite
// used by LearnedPattern.findUnique({ signal_class, pattern_key, cap_class,
// horizon_days }) lookups. Per the plan's <interfaces> contract:
//
//   buildPatternKey('echo-chamber-bull', 'mixed')   → 'echo-chamber-bull:agreement=mixed'
//   buildPatternKey('echo-chamber-bull', 'aligned') → 'echo-chamber-bull:agreement=aligned'
//   buildPatternKey('echo-chamber-bull', 'na')      → 'echo-chamber-bull'   (UNCHANGED)
//   buildPatternKey('echo-chamber-bull')            → 'echo-chamber-bull'   (UNCHANGED)
//
// T-20-A-05-03 mitigation: legacy LearnedPattern rows (written before this
// plan) have NO suffix — they continue to be matched by their original
// pattern_key because buildPatternKey('base','na') === 'base'. The 'mixed'
// and 'aligned' buckets start with empty Beta posteriors and re-learn from
// new data per the documented 6-month re-evaluation cadence.

export type AgreementBucket = 'mixed' | 'aligned' | 'na';

const AGREEMENT_SUFFIX_RE = /:agreement=(mixed|aligned)$/;

/**
 * Extend an existing pattern_key with an agreement bucket suffix. Backward-
 * compatible: 'na' OR an absent bucket returns the base key UNCHANGED.
 */
export function buildPatternKey(
  base: string,
  agreement_bucket?: AgreementBucket,
): string {
  if (!agreement_bucket || agreement_bucket === 'na') return base;
  return `${base}:agreement=${agreement_bucket}`;
}

/**
 * Inverse of buildPatternKey. Legacy keys (no ':agreement=' segment) resolve
 * to bucket = 'na'. Used by engine-context read paths and dashboards to
 * surface which agreement regime a learned prior accumulated under.
 */
export function parsePatternKey(
  storedKey: string,
): { base: string; agreement_bucket: AgreementBucket } {
  const m = storedKey.match(AGREEMENT_SUFFIX_RE);
  if (!m || m.index === undefined) {
    return { base: storedKey, agreement_bucket: 'na' };
  }
  return {
    base: storedKey.slice(0, m.index),
    agreement_bucket: m[1] as AgreementBucket,
  };
}

// ─── Plan 20-C-05 — JOINT_FEATURES_MODE + additive pattern-key extension ───
//
// Joint-feature ablation gate (see plan 20-C-05). Four sentiment-interaction
// features are bucketed and hashed into the pattern key when the flag is 'on'.
// Default 'off' on merge — the monthly ablation cron flips to 'shadow' on
// first run, and only the 3-month rolling CI lower-bound > 0 verdict can flip
// 'shadow' → 'on'.
//
// Backward compatibility (T-20-C-05-05): with mode='off', the function
// returns a key BYTE-IDENTICAL to the pre-plan canonical form.

import * as _crypto_jf from 'crypto';

export type JointFeaturesMode = 'off' | 'shadow' | 'on';

/** Reads JOINT_FEATURES_MODE env var; defaults to 'off' (safe default). */
export function getJointFeaturesMode(): JointFeaturesMode {
  const raw = process.env.JOINT_FEATURES_MODE ?? 'off';
  if (raw === 'off' || raw === 'shadow' || raw === 'on') return raw;
  throw new Error(
    `JOINT_FEATURES_MODE: invalid value ${JSON.stringify(raw)} — must be 'off' | 'shadow' | 'on'`,
  );
}

/**
 * Quantile breakpoints for joint-feature bucketing (5 buckets each).
 * These are literature-default seeds — empirical calibration is a follow-up
 * (see HYPERPARAMETERS.md "Joint-feature quantile breakpoints (20-C-05)").
 */
export const JOINT_FEATURE_BUCKETS = {
  sentimentMomentumProduct: [-0.05, -0.01, 0.01, 0.05],
  sentimentVolumeInteraction: [-2, -0.5, 0.5, 2],
  deltaSentiment3d: [-0.3, -0.1, 0.1, 0.3],
  sentimentDispersion: [0.1, 0.2, 0.3, 0.4],
} as const;

function _bucketOf(value: number, breakpoints: readonly number[]): number {
  // returns index in [0, breakpoints.length] (5 buckets for 4 breakpoints)
  let i = 0;
  for (; i < breakpoints.length; i++) {
    if (value < breakpoints[i]) return i;
  }
  return i;
}

export interface JointFeatures {
  sentimentMomentumProduct: number;
  sentimentVolumeInteraction: number;
  deltaSentiment3d: number;
  sentimentDispersion: number;
}

export interface JointFeaturePatternKey {
  primaryKey: string;
  shadowKey?: string;
}

/**
 * Build the (sentiment_type × cap_class × direction) pattern key, optionally
 * extended with joint-feature buckets behind the JOINT_FEATURES_MODE flag.
 *
 *   mode='off'    → primaryKey = '{sentimentType}:{capClass}:{direction}'
 *                   (byte-identical to pre-plan canonical form; no shadowKey)
 *   mode='shadow' → primaryKey unchanged from 'off'; shadowKey adds joint hash
 *                   (parallel evaluation — both buckets receive observations)
 *   mode='on'     → primaryKey includes joint-feature hash (post-3-month gate)
 *
 * Joint features are quantized into 5 fixed-quantile buckets each, then the
 * 4-bucket tuple is sha1-hashed and prefix-12 hexified for log readability.
 * New buckets seed with uniform priors (α=β=1) at the LearnedPattern row level.
 */
export function buildJointFeaturePatternKey(args: {
  sentimentType: string;
  capClass: string;
  direction: 'bull' | 'bear';
  jointFeatures?: JointFeatures;
  mode?: JointFeaturesMode;
}): JointFeaturePatternKey {
  const mode = args.mode ?? getJointFeaturesMode();
  const base = `${args.sentimentType}:${args.capClass}:${args.direction}`;

  if (mode === 'off' || !args.jointFeatures) {
    return { primaryKey: base };
  }

  const jf = args.jointFeatures;
  const buckets = [
    _bucketOf(jf.sentimentMomentumProduct, JOINT_FEATURE_BUCKETS.sentimentMomentumProduct),
    _bucketOf(jf.sentimentVolumeInteraction, JOINT_FEATURE_BUCKETS.sentimentVolumeInteraction),
    _bucketOf(jf.deltaSentiment3d, JOINT_FEATURE_BUCKETS.deltaSentiment3d),
    _bucketOf(jf.sentimentDispersion, JOINT_FEATURE_BUCKETS.sentimentDispersion),
  ];
  const bucketHash = _crypto_jf
    .createHash('sha1')
    .update(buckets.join(','))
    .digest('hex')
    .slice(0, 12);
  const withJoint = `${base}::joint::${bucketHash}`;

  if (mode === 'shadow') {
    return { primaryKey: base, shadowKey: withJoint };
  }
  // mode === 'on'
  return { primaryKey: withJoint };
}
