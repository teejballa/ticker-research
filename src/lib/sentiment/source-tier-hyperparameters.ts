/**
 * Plan 20-B-04 — Source-tier weighting hyperparameters.
 *
 * S1 enforcement: cap bounds, n_min_observations, validation_window_days, and
 * cron schedule are configurable here so changes are reviewable in PRs and
 * surfaced in HYPERPARAMETERS.md. There is INTENTIONALLY no env-var override
 * path — see threat T-20-B-04-04 and the CI grep guard at
 * .github/workflows/no-hand-curated-tier-weights.yml.
 *
 * Module-load Zod validation per 19-A-01 precedent: any malformed default here
 * fails at import time, NOT silently at runtime.
 */
import { z } from 'zod';

export interface SourceTierConfig {
  cap_min: number;
  cap_max: number;
  n_min_observations: number;
  validation_window_days: number;
  cron_schedule: string;
  weight_diff_display_threshold: number;
}

export const SOURCE_TIER_HYPERPARAMETERS: SourceTierConfig = {
  // CONTEXT.md §20-B-04 spec: capped softmax at [0.5, 5.0]
  cap_min: 0.5,
  cap_max: 5.0,
  // CONTEXT.md §20-B-04 spec: ≥30d of measured IC before softmax bucket entry
  n_min_observations: 30,
  // CONTEXT.md §20-B-04 spec: rolling-90d IC against forward 7d alpha-vs-SPY
  validation_window_days: 90,
  // Monthly cron, 1h after 20-A-03 tune-decay (06:00 UTC) to avoid simultaneous Neon load
  cron_schedule: '0 7 1 * *',
  // UI shows 'wt: X.XX' only when |w-1.0| >= this; default 0.01 hides cold-start visual noise
  weight_diff_display_threshold: 0.01,
};

const SourceTierConfigSchema = z
  .object({
    cap_min: z.number().positive().finite(),
    cap_max: z.number().positive().finite(),
    n_min_observations: z.number().int().positive(),
    validation_window_days: z.number().int().positive(),
    cron_schedule: z.string().min(1),
    weight_diff_display_threshold: z.number().nonnegative().finite(),
  })
  .strict()
  .refine((cfg) => cfg.cap_max > cfg.cap_min, {
    message: 'cap_max must be strictly greater than cap_min',
  });

export function validateSourceTierHyperparameters(
  input: unknown,
): asserts input is SourceTierConfig {
  const result = SourceTierConfigSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `SOURCE_TIER_HYPERPARAMETERS validation failed: ${result.error.issues
        .map((i) => i.path.join('.') + ': ' + i.message)
        .join('; ')}`,
    );
  }
}

// Module-load assertion — fail fast at import time on malformed config (per 19-A-01).
validateSourceTierHyperparameters(SOURCE_TIER_HYPERPARAMETERS);
