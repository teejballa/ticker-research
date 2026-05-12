/**
 * Plan 20-A-03 — Sentiment-message exponential time decay.
 *
 * Pure module — no DB, no I/O. Consumers:
 *   - scripts/backfill-decay-weights.ts → computes decay_weight per row at backfill time
 *   - src/lib/sentiment/aggregator.ts → applies persisted decay_weight in the
 *     decayed branch
 *   - scripts/tune-decay.ts → uses decayWeight at every grid candidate λ
 *
 * Why a separate module from src/lib/learning.ts decayWeights():
 *   src/lib/learning.ts decays Bayesian-engine observations by SIGNAL CLASS
 *   (diffusion / technical / insider / institutional) for the LearnedPattern
 *   posterior update. λ there is per signal class with t½ ≈ 60d.
 *
 *   This module decays sentiment MESSAGES by SOURCE CLASS (retail / news /
 *   sec / analyst / social-other) for the cross-source aggregator. λ here
 *   is per source class with t½ ≈ 1-7d.
 *
 *   Different domain, different calibration target (engine α/β posteriors
 *   vs intra-day weighted-mean), different update cadence (monthly vs
 *   quarterly), different time scale. Sharing the table would conflate
 *   them; we explicitly do not.
 *
 * Half-life formula: t½ = ln(2) / λ. Inverted: λ = ln(2) / t½.
 *
 * Tetlock 2007 (J. Finance, 62(3): 1139-1168) — "Giving Content to Investor
 * Sentiment: The Role of Media in the Stock Market" — pessimism predicts
 * next-day returns then mean-reverts within ~5 trading days. This is the
 * empirical anchor for retail half-life ≈ 24h.
 */
import {
  DECAY_HYPERPARAMETERS,
  type SourceClassDecayConfig,
} from './decay-hyperparameters';
import type { SourceClass } from './source-class';

/**
 * w = exp(-λ × age_days). λ in (1/day).
 *
 * Throws on:
 *   - ageDays < 0 — programmer bug. A persisted observation should have
 *     fetched_at <= now() (DB clock); a negative age means clock skew or
 *     tampered timestamps. We throw rather than clamp because clamping
 *     would weight a future-dated row at 1.0 (max), which is the opposite
 *     of safe — silently up-weighting a row that bypassed PIT discipline.
 *     Note: this is a deliberate departure from src/lib/learning.ts
 *     decayWeights() which clamps Δt < 0 → 0; that function takes
 *     `recorded_at` from a curated outcomes table, this one takes
 *     `fetched_at` from an upstream-message table where clock skew is real.
 *   - lambdaPerDay <= 0 or non-finite — would yield Infinity / NaN weights.
 */
export function decayWeight(ageDays: number, lambdaPerDay: number): number {
  if (!Number.isFinite(ageDays)) {
    throw new Error(`decayWeight: ageDays must be finite (got: ${ageDays})`);
  }
  if (ageDays < 0) {
    throw new Error(
      `decayWeight: ageDays must be >= 0 (got: ${ageDays}). ` +
        `Negative age implies clock skew or tampered fetched_at — refusing to weight a future-dated observation. ` +
        `If this fires in production, investigate the SentimentObservation row before clamping.`,
    );
  }
  if (!Number.isFinite(lambdaPerDay) || lambdaPerDay <= 0) {
    throw new Error(
      `decayWeight: lambdaPerDay must be > 0 and finite (got: ${lambdaPerDay}). ` +
        `If you need decay disabled, use SENTIMENT_DECAY_MODE=off rather than passing 0.`,
    );
  }
  return Math.exp(-lambdaPerDay * ageDays);
}

/** Pure lookup; no DB hit. */
export function decayLambdaForClass(cls: SourceClass): number {
  const cfg: SourceClassDecayConfig = DECAY_HYPERPARAMETERS[cls];
  return cfg.lambda_per_day;
}

/** t½ = ln(2) / λ. For human-readable display. */
export function halfLifeDays(lambdaPerDay: number): number {
  if (!Number.isFinite(lambdaPerDay) || lambdaPerDay <= 0) {
    throw new Error(
      `halfLifeDays: lambdaPerDay must be > 0 and finite (got: ${lambdaPerDay})`,
    );
  }
  return Math.LN2 / lambdaPerDay;
}

/** Convenience: age in days from a fetched_at Date. */
export function ageDaysSince(fetched_at: Date, now: Date = new Date()): number {
  const ms = now.getTime() - fetched_at.getTime();
  return ms / 86_400_000;
}
