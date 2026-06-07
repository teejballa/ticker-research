import { describe, it, expect } from 'vitest';
import { bootstrapBCa } from '../bootstrap';
import fixture from '../../../../tests/fixtures/evaluation/bca-efron-1987-reference.json';

describe('bootstrapBCa (Efron 1987)', () => {
  it('matches Efron 1987 Table 2 mean-of-mice within tolerance', () => {
    const { samples, n_resamples, alpha, rng_seed } = fixture.input;
    const result = bootstrapBCa(samples, (s) => s.reduce((a, b) => a + b, 0) / s.length, {
      nResamples: n_resamples,
      alpha,
      seed: rng_seed,
    });
    expect(Math.abs(result.low - fixture.expected.bca_ci_low_target)).toBeLessThan(fixture.expected.bca_ci_low_tolerance);
    expect(Math.abs(result.high - fixture.expected.bca_ci_high_target)).toBeLessThan(fixture.expected.bca_ci_high_tolerance);
  });

  it('falls back to percentile method when n < 50', () => {
    const small = [1, 2, 3, 4, 5];
    const result = bootstrapBCa(small, (s) => s.reduce((a, b) => a + b, 0) / s.length, { nResamples: 1000 });
    expect(result.method).toBe('percentile');
    expect(result.warning).toMatch(/n < 50/i);
  });

  it('flags degenerate=true when all resamples are identical', () => {
    const constant = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    const result = bootstrapBCa(constant, (s) => s[0], { nResamples: 1000 });
    expect(result.degenerate).toBe(true);
  });
});
