/**
 * Plan 20-A-03 — Per-source-class decay hyperparameters.
 *
 * Literature seeds (overwritten by scripts/tune-decay.ts after first calibration):
 *   - retail        : t½ = 24h  → λ ≈ 0.693/day  (Tetlock 2007 J. Finance)
 *   - news          : t½ = 72h  → λ ≈ 0.231/day  (Loughran-McDonald 2011 JF)
 *   - sec           : t½ = 168h → λ ≈ 0.099/day  (10-K market efficiency studies)
 *   - analyst       : t½ = 120h → λ ≈ 0.139/day  (analyst-revision drift literature)
 *   - social-other  : t½ = 96h  → λ ≈ 0.173/day  (between retail and news; calibration overrides)
 *
 * t½ = ln(2) / λ → λ = ln(2) / t½(in days).
 *
 * tuned_at = "bootstrap" → flagged so consumers know these are pre-calibration
 * literature seeds. After tune-decay runs, tuned_at becomes ISO-8601 timestamp
 * AND icir_uplift_vs_no_decay + n_observations_at_tune get populated.
 */
import { z } from 'zod';
import type { SourceClass } from './source-class';

export interface SourceClassDecayConfig {
  lambda_per_day: number;
  half_life_days: number;
  literature_seed_half_life_days: number;
  literature_citation: string;
  tuned_at: string;
  icir_uplift_vs_no_decay: number | null;
  n_observations_at_tune: number | null;
}

const LN2 = Math.LN2;
const halfLifeToLambda = (h: number): number => LN2 / h;
const halfLifeFromLambda = (l: number): number => LN2 / l;

// Literature seeds — these are SEED values for the grid in scripts/tune-decay.ts.
// Calibrated values overwrite the row but literature_seed_half_life_days is preserved.
export const DECAY_HYPERPARAMETERS: Record<SourceClass, SourceClassDecayConfig> = {
  retail: {
    lambda_per_day: halfLifeToLambda(1), // 24h
    half_life_days: 1,
    literature_seed_half_life_days: 1,
    literature_citation:
      'Tetlock 2007 — J. Finance — pessimism predicts next-day returns then mean-reverts within 5 trading days',
    tuned_at: 'bootstrap',
    icir_uplift_vs_no_decay: null,
    n_observations_at_tune: null,
  },
  news: {
    lambda_per_day: halfLifeToLambda(3), // 72h
    half_life_days: 3,
    literature_seed_half_life_days: 3,
    literature_citation:
      'Loughran-McDonald 2011 J. Finance — news effects survive 1-2 weeks',
    tuned_at: 'bootstrap',
    icir_uplift_vs_no_decay: null,
    n_observations_at_tune: null,
  },
  sec: {
    lambda_per_day: halfLifeToLambda(7), // 168h
    half_life_days: 7,
    literature_seed_half_life_days: 7,
    literature_citation:
      'Loughran-McDonald 2011 — 10-K market response decays over 7-30d',
    tuned_at: 'bootstrap',
    icir_uplift_vs_no_decay: null,
    n_observations_at_tune: null,
  },
  analyst: {
    lambda_per_day: halfLifeToLambda(5), // 120h
    half_life_days: 5,
    literature_seed_half_life_days: 5,
    literature_citation:
      'Womack 1996 / Stickel 1992 — analyst-revision drift survives 1-2 weeks',
    tuned_at: 'bootstrap',
    icir_uplift_vs_no_decay: null,
    n_observations_at_tune: null,
  },
  'social-other': {
    lambda_per_day: halfLifeToLambda(4), // 96h
    half_life_days: 4,
    literature_seed_half_life_days: 4,
    literature_citation:
      'Bridging seed between retail (1d) and news (3d); calibration to override',
    tuned_at: 'bootstrap',
    icir_uplift_vs_no_decay: null,
    n_observations_at_tune: null,
  },
};

const ConfigSchema = z
  .object({
    lambda_per_day: z.number().positive().finite(),
    half_life_days: z.number().positive().finite(),
    literature_seed_half_life_days: z.number().positive().finite(),
    literature_citation: z.string().min(10),
    tuned_at: z.string().min(1),
    icir_uplift_vs_no_decay: z.number().nullable(),
    n_observations_at_tune: z.number().int().nonnegative().nullable(),
  })
  .strict();

const HyperparametersSchema = z
  .object({
    retail: ConfigSchema,
    news: ConfigSchema,
    sec: ConfigSchema,
    analyst: ConfigSchema,
    'social-other': ConfigSchema,
  })
  .strict();

export function validateDecayHyperparameters(
  input: unknown,
): asserts input is typeof DECAY_HYPERPARAMETERS {
  HyperparametersSchema.parse(input);
}

// Module-load assertion — fails fast at import time on a malformed config.
validateDecayHyperparameters(DECAY_HYPERPARAMETERS);

// Cross-check: half_life_days MUST equal ln(2)/lambda_per_day within float tolerance.
for (const [cls, cfg] of Object.entries(DECAY_HYPERPARAMETERS)) {
  const expected = halfLifeFromLambda(cfg.lambda_per_day);
  if (Math.abs(expected - cfg.half_life_days) > 1e-9) {
    throw new Error(
      `decay-hyperparameters: ${cls} half_life_days=${cfg.half_life_days} ` +
        `does not match ln(2)/lambda=${expected}. Re-derive both from the same source.`,
    );
  }
}
