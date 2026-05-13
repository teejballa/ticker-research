// src/lib/sentiment/calibration-hyperparameters.ts
// Plan 20-B-03 — Temperature scaling bootstrap seed + bounds.
//
// CALIBRATION_BOUNDS encodes the L-BFGS / golden-section search bounds, the
// ECE bin count, the k-fold CV settings, and the ship-gate numerical thresholds.
// Module-load Zod assertion mirrors the 19-A-01 hyperparameters pattern: any
// malformed config fails the build at import time.
//
// References:
//   Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017).
//   "On Calibration of Modern Neural Networks." ICML 2017.
//   https://arxiv.org/abs/1706.04599
//
// All values trace to a CONTEXT.md acceptance criterion or Guo 2017 default.

import { z } from 'zod';

// L-BFGS / golden-section optimiser bounds; see Guo et al. 2017 §3.1.
// We widen the typical published [1, 5] range to [0.1, 10] to admit BOTH
// severe overconfidence (T >> 1) AND underconfidence (T < 1) corrections.
export const CALIBRATION_BOUNDS = Object.freeze({
  T_MIN: 0.1,
  T_MAX: 10.0,
  T_INITIAL: 1.0, // identity at start; fit moves from here
  CONVERGENCE_TOL: 1e-6,
  MAX_ITER: 100,
  N_BINS_ECE: 10, // Guo 2017 default
  N_FOLDS_CV: 5, // standard k-fold for small validation sets
  CV_SEED: 42, // determinism for repro
  PRODUCTION_LABELS_FLOOR: 500, // CONTEXT.md line 115 verbatim
  SHIP_GATE_ECE: 0.05, // CONTEXT.md line 115 verbatim
  SHIP_GATE_BRIER: 0.24, // T-20-B-03-05 — Brier co-gate; vs 0.25 random
} as const);

// Bootstrap seed T per classifier_version BEFORE first calibration run.
// Identity = uncalibrated. Runtime always prefers the latest DB row when present.
// Unknown classifier_versions fall back to T=1.0 + a logged warning.
export const BOOTSTRAP_T = Object.freeze({
  // populated at first calibrate-temperature run; until then, runtime uses T=1.0.
} as const);

const CalibrationConfigSchema = z
  .object({
    T_MIN: z.number().positive().max(1),
    T_MAX: z.number().min(1).max(100),
    T_INITIAL: z.number().positive(),
    CONVERGENCE_TOL: z.number().positive().lt(1),
    MAX_ITER: z.number().int().positive(),
    N_BINS_ECE: z.number().int().min(2).max(100),
    N_FOLDS_CV: z.number().int().min(2).max(20),
    CV_SEED: z.number().int(),
    PRODUCTION_LABELS_FLOOR: z.number().int().positive(),
    SHIP_GATE_ECE: z.number().positive().lt(1),
    SHIP_GATE_BRIER: z.number().positive().lt(1),
  })
  .strict()
  .refine((c) => c.T_MIN < c.T_MAX, {
    message: 'T_MIN must be strictly less than T_MAX',
  })
  .refine((c) => c.T_INITIAL >= c.T_MIN && c.T_INITIAL <= c.T_MAX, {
    message: 'T_INITIAL must be inside [T_MIN, T_MAX]',
  });

export function validateCalibrationBounds(
  bounds: Record<string, unknown> = CALIBRATION_BOUNDS,
): void {
  CalibrationConfigSchema.parse(bounds);
}

// Module-load assertion (mirrors 19-A-01 pattern).
validateCalibrationBounds();
