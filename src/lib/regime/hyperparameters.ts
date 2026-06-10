/**
 * Phase 22 D-03 + D-04 — Regime classifier hyperparameters.
 *
 * Module-load Zod validation per `src/lib/sentiment/source-tier-hyperparameters.ts:46`
 * precedent: malformed defaults fail at import time, NOT silently at runtime.
 *
 * **No env-var override path** — the CI grep guard
 * `.github/workflows/no-hand-curated-tier-weights.yml` extends to fail on
 * any regime-label or threshold hardcoding outside this single file (T-22-01-01).
 *
 * D-04 boundary semantics: VIX threshold uses STRICT `>=` for `'high-vol'`.
 * (A VIX percentile exactly equal to 0.5 classifies as `'high-vol'`, not `'low-vol'`.)
 * Documented here so future readers don't introduce off-by-one drift.
 *
 * D-03 boundary semantics: trend axis is `sign(MA50 − MA200)` with the convention
 * `>= 0 → bull`. An exact zero crossing rounds toward `bull`.
 */

import { z } from 'zod';

export interface RegimeHyperparameters {
  /** D-04 — trailing window in trading days for the VIX percentile rank. */
  vix_window_days: number;
  /** D-04 — percentile cutoff; >= → 'high-vol', < → 'low-vol'. */
  vix_percentile_threshold: number;
  /** D-03 — short MA window in trading days for SPY trend axis. */
  ma_short: number;
  /** D-03 — long MA window in trading days for SPY trend axis. */
  ma_long: number;
}

/**
 * Locked Phase-22 defaults per D-03 + D-04. Changes require a planning round
 * (S1 enforcement; mirrors P20-B-04 source-tier hyperparameter discipline).
 */
export const REGIME_HYPERPARAMETERS: RegimeHyperparameters = {
  vix_window_days: 60,
  vix_percentile_threshold: 0.5,
  ma_short: 50,
  ma_long: 200,
};

const RegimeHyperparametersSchema = z
  .object({
    vix_window_days: z.number().int().positive().finite(),
    vix_percentile_threshold: z.number().min(0).max(1).finite(),
    ma_short: z.number().int().positive().finite(),
    ma_long: z.number().int().positive().finite(),
  })
  .strict()
  .refine((cfg) => cfg.ma_long > cfg.ma_short, {
    message: 'ma_long must be strictly greater than ma_short',
  });

export function validateRegimeHyperparameters(
  input: unknown,
): asserts input is RegimeHyperparameters {
  const result = RegimeHyperparametersSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `REGIME_HYPERPARAMETERS validation failed: ${result.error.issues
        .map((i) => i.path.join('.') + ': ' + i.message)
        .join('; ')}`,
    );
  }
}

// Module-load assertion — fail fast at import time on malformed config (per 19-A-01).
validateRegimeHyperparameters(REGIME_HYPERPARAMETERS);
