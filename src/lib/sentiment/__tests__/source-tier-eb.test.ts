/**
 * PHASE 22 Wave 0 RED stub — Wave 3 delivers GREEN.
 * Covers: D-07 (empirical-Bayes shrinkage toward unconditional `(source, 'ALL')` IC)
 *         per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Intentionally imports the Wave 3 `shrinkSourceIcEmpiricalBayes` helper
 * from `../source-tier` (or the dedicated `../source-tier-eb` module if Wave 3
 * splits it out — RED today either way). Vitest reports a missing-export error
 * until Wave 3 lands.
 *
 * Reference implementation contract (22-RESEARCH.md §F + Pattern 3):
 *   export function shrinkSourceIcEmpiricalBayes(args: {
 *     regime_ic: number;       // mean IC over the (source, regime) slice
 *     regime_n: number;        // observation count in the slice
 *     unconditional_ic: number; // mean IC over (source, 'ALL') — the EB prior
 *     lambda_min?: number;     // default eb_shrinkage_lambda_min from hyperparameters
 *     lambda_max?: number;     // default eb_shrinkage_lambda_max
 *   }): { shrunk_ic: number; shrinkage_strength: number }
 *
 * Citation: Stein 1956 / Efron-Morris 1973; mirrors hierarchicalPooledPosterior
 * clamp pattern at learning.ts:181 (CLAUDE.md rule #4 — Beta-Binomial conjugate
 * shrinkage as ridge analog for sparse cells).
 */

import { describe, it, expect } from 'vitest';
// Intentionally probes the Wave 3 EB helper so the file fails until it lands.
import * as sourceTierModule from '../source-tier';

// Module-level RED guard: assert the Wave 3 EB shrinkage helper exists.
// Until Wave 3 lands `shrinkSourceIcEmpiricalBayes`, this assertion fires
// with a meaningful error that points at the missing implementation.
describe('shrinkSourceIcEmpiricalBayes export — Wave 3 RED guard', () => {
  it('Wave 3 must export shrinkSourceIcEmpiricalBayes from src/lib/sentiment/source-tier.ts (D-07)', () => {
    expect(
      typeof (sourceTierModule as Record<string, unknown>).shrinkSourceIcEmpiricalBayes,
      'shrinkSourceIcEmpiricalBayes is not exported — Wave 3 has not landed (D-07 EB shrinkage toward unconditional)',
    ).toBe('function');
  });
});

describe('shrinkSourceIcEmpiricalBayes — Wave 3 contract (D-07)', () => {
  it.todo('shrinks toward unconditional IC when regime_n is small (sparse regime cell)');
  it.todo('approaches raw regime_ic when regime_n is large (signal-rich regime cell)');
  it.todo('shrinkage_strength ∈ [lambda_min, lambda_max] (S1 bounded weighting per source-tier-hyperparameters)');
  it.todo('shrunk_ic = (regime_n * regime_ic + lambda * unconditional_ic) / (regime_n + lambda)');
  it.todo('regime_n = 0 → shrunk_ic === unconditional_ic (full pooling)');
  it.todo('regime_ic === unconditional_ic → shrunk_ic === regime_ic === unconditional_ic (identity)');
  it.todo('produces no NaN/Infinity even when both regime_ic and unconditional_ic are 0');
});
