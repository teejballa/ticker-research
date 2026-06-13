/**
 * PHASE 22 Wave 3 GREEN — D-07 (empirical-Bayes shrinkage toward unconditional
 * `(source, 'ALL')` IC).
 *
 * Wave 0 left this file as `it.todo` placeholders + a sentinel export guard.
 * Wave 3 (this file, after edit) replaces the placeholders with real assertions.
 *
 * Contract under test (22-RESEARCH.md §F + Pattern 3):
 *   shrinkSourceIcEmpiricalBayes({
 *     regime_ic, regime_n, unconditional_ic,
 *     lambda?, lambda_min?, lambda_max?
 *   }) → { shrunk_ic, shrinkage_strength, lambda }
 *
 * Citation: Stein 1956 / Efron-Morris 1973; mirrors hierarchicalPooledPosterior
 * clamp pattern at learning.ts:181 (CLAUDE.md rule #4).
 */

import { describe, it, expect } from 'vitest';
import { shrinkSourceIcEmpiricalBayes } from '../source-tier';
import { SOURCE_TIER_HYPERPARAMETERS } from '../source-tier-hyperparameters';

describe('shrinkSourceIcEmpiricalBayes export — Wave 3 GREEN (D-07)', () => {
  it('Wave 3 exports shrinkSourceIcEmpiricalBayes from source-tier.ts', () => {
    expect(typeof shrinkSourceIcEmpiricalBayes).toBe('function');
  });
});

describe('shrinkSourceIcEmpiricalBayes — Wave 3 contract (D-07)', () => {
  it('shrinks heavily toward unconditional IC when regime_n is small (sparse regime cell)', () => {
    // Sparse cell: only 5 observations on the (reddit, bear-high-vol) slice
    // vs 500 on the unconditional. Force λ near the ceiling so shrinkage_strength
    // > 0.7 (the cron computes λ from n_ALL/var ratio; we pass it explicitly here).
    const { shrunk_ic, shrinkage_strength } = shrinkSourceIcEmpiricalBayes({
      regime_ic: 0.4,
      regime_n: 5,
      unconditional_ic: 0.1,
      lambda: 50, // ceiling — full-strength shrink
    });
    expect(shrinkage_strength).toBeGreaterThan(0.7);
    // shrunk_ic is closer to unconditional (0.1) than to regime_ic (0.4)
    expect(shrunk_ic).toBeGreaterThan(0.1);
    expect(shrunk_ic).toBeLessThan(0.4);
    expect(Math.abs(shrunk_ic - 0.1)).toBeLessThan(Math.abs(shrunk_ic - 0.4));
  });

  it('approaches raw regime_ic when regime_n is large (signal-rich regime cell)', () => {
    // Dense cell: 400 observations vs λ = 0.5 (floor). regime dominates.
    const { shrunk_ic, shrinkage_strength } = shrinkSourceIcEmpiricalBayes({
      regime_ic: 0.4,
      regime_n: 400,
      unconditional_ic: 0.1,
      lambda: 0.5, // floor — minimum shrink
    });
    expect(shrinkage_strength).toBeLessThan(0.3);
    expect(shrinkage_strength).toBeLessThan(0.01); // 0.5/400.5 ≈ 0.00125
    // shrunk_ic ≈ regime_ic
    expect(shrunk_ic).toBeGreaterThan(0.39);
    expect(shrunk_ic).toBeLessThan(0.41);
  });

  it('shrinkage_strength ∈ [0, 1] — bounded ratio per Efron-Morris', () => {
    // Across a wide range of inputs, shrinkage_strength stays in [0, 1].
    const cases = [
      { regime_n: 0, lambda: 1 }, // full pooling → 1
      { regime_n: 1, lambda: 1 }, // 0.5 — symmetric
      { regime_n: 100, lambda: 1 }, // ≈ 0.0099
      { regime_n: 1_000_000, lambda: 50 }, // ≈ 0.00005
    ];
    for (const { regime_n, lambda } of cases) {
      const { shrinkage_strength } = shrinkSourceIcEmpiricalBayes({
        regime_ic: 0.3,
        regime_n,
        unconditional_ic: 0.1,
        lambda,
      });
      expect(shrinkage_strength).toBeGreaterThanOrEqual(0);
      expect(shrinkage_strength).toBeLessThanOrEqual(1);
    }
  });

  it('lambda is clamped to [eb_shrinkage_lambda_min, eb_shrinkage_lambda_max]', () => {
    // Above-ceiling override → clamped to max (default 50).
    const high = shrinkSourceIcEmpiricalBayes({
      regime_ic: 0.4,
      regime_n: 10,
      unconditional_ic: 0.1,
      lambda: 1e6,
    });
    expect(high.lambda).toBe(SOURCE_TIER_HYPERPARAMETERS.eb_shrinkage_lambda_max);

    // Below-floor override → clamped to min (default 0.5).
    const low = shrinkSourceIcEmpiricalBayes({
      regime_ic: 0.4,
      regime_n: 10,
      unconditional_ic: 0.1,
      lambda: 1e-6,
    });
    expect(low.lambda).toBe(SOURCE_TIER_HYPERPARAMETERS.eb_shrinkage_lambda_min);
  });

  it('shrunk_ic = (regime_n × regime_ic + λ × unconditional_ic) / (regime_n + λ) — exact formula', () => {
    // Pick numbers where the closed-form math is verifiable by hand.
    const regime_n = 20;
    const regime_ic = 0.6;
    const unconditional_ic = 0.2;
    const lambda = 10;
    const expected = (20 * 0.6 + 10 * 0.2) / (20 + 10); // (12 + 2) / 30 = 0.4666…
    const expectedStrength = 10 / 30; // 0.333…

    const result = shrinkSourceIcEmpiricalBayes({
      regime_ic,
      regime_n,
      unconditional_ic,
      lambda,
    });

    expect(result.shrunk_ic).toBeCloseTo(expected, 10);
    expect(result.shrinkage_strength).toBeCloseTo(expectedStrength, 10);
    expect(result.lambda).toBe(10);
  });

  it('regime_n = 0 → shrunk_ic === unconditional_ic (full pooling)', () => {
    const { shrunk_ic, shrinkage_strength } = shrinkSourceIcEmpiricalBayes({
      regime_ic: 0.4,
      regime_n: 0,
      unconditional_ic: 0.12345,
      lambda: 5,
    });
    expect(shrunk_ic).toBeCloseTo(0.12345, 12);
    expect(shrinkage_strength).toBe(1);
  });

  it('regime_ic === unconditional_ic → shrunk_ic === regime_ic === unconditional_ic (identity)', () => {
    const { shrunk_ic } = shrinkSourceIcEmpiricalBayes({
      regime_ic: 0.25,
      regime_n: 100,
      unconditional_ic: 0.25,
      lambda: 10,
    });
    expect(shrunk_ic).toBeCloseTo(0.25, 12);
  });

  it('regime_ic === 0 AND unconditional_ic === 0 → shrunk_ic === 0 (no NaN/Infinity)', () => {
    const { shrunk_ic, shrinkage_strength } = shrinkSourceIcEmpiricalBayes({
      regime_ic: 0,
      regime_n: 100,
      unconditional_ic: 0,
      lambda: 5,
    });
    expect(Number.isFinite(shrunk_ic)).toBe(true);
    expect(shrunk_ic).toBe(0);
    expect(Number.isFinite(shrinkage_strength)).toBe(true);
  });

  it('non-finite regime_ic is coerced to 0 — defense-in-depth', () => {
    const { shrunk_ic } = shrinkSourceIcEmpiricalBayes({
      regime_ic: Number.NaN,
      regime_n: 100,
      unconditional_ic: 0.2,
      lambda: 5,
    });
    expect(Number.isFinite(shrunk_ic)).toBe(true);
    // Treated as if regime_ic === 0 → shrunk = (100*0 + 5*0.2) / 105 ≈ 0.00952
    expect(shrunk_ic).toBeCloseTo((5 * 0.2) / 105, 10);
  });

  it('throws on non-finite lambda override (caller bug)', () => {
    expect(() =>
      shrinkSourceIcEmpiricalBayes({
        regime_ic: 0.4,
        regime_n: 10,
        unconditional_ic: 0.1,
        lambda: Number.NaN,
      }),
    ).toThrow();
  });

  it('throws on invalid clamps (e.g. negative or inverted)', () => {
    expect(() =>
      shrinkSourceIcEmpiricalBayes({
        regime_ic: 0.4,
        regime_n: 10,
        unconditional_ic: 0.1,
        lambda_min: -1,
      }),
    ).toThrow();

    expect(() =>
      shrinkSourceIcEmpiricalBayes({
        regime_ic: 0.4,
        regime_n: 10,
        unconditional_ic: 0.1,
        lambda_min: 10,
        lambda_max: 5,
      }),
    ).toThrow();
  });
});
