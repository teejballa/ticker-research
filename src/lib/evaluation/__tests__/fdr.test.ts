import { describe, it, expect } from 'vitest';
import { benjaminiYekutieli } from '../fdr';
import fixture from '../../../../tests/fixtures/evaluation/by-fdr-statsmodels-reference.json';

describe('benjaminiYekutieli (BY 2001)', () => {
  it('matches statsmodels reject set on Efron-like fixture', () => {
    const result = benjaminiYekutieli(fixture.input.p_values, fixture.input.q);
    const rejectIdx = result.decisions
      .map((d, i) => (d === 'REJECT' ? i : -1))
      .filter((i) => i >= 0);
    expect(rejectIdx).toEqual(fixture.expected.reject_indices);
    expect(rejectIdx.length).toBe(fixture.expected.n_rejected);
  });

  it('handles m=0 (empty), m=1 (single), all-p=0 (all reject)', () => {
    expect(benjaminiYekutieli([], 0.1).decisions).toEqual([]);
    expect(benjaminiYekutieli([0.5], 0.1).decisions).toEqual(['ACCEPT']);
    expect(benjaminiYekutieli([0, 0, 0], 0.1).decisions).toEqual(['REJECT', 'REJECT', 'REJECT']);
  });

  it('computes harmonic correction c(m) correctly', () => {
    const result = benjaminiYekutieli(fixture.input.p_values, fixture.input.q);
    expect(Math.abs(result.harmonic_sum - fixture.expected.harmonic_sum_m20_approx)).toBeLessThan(1e-3);
  });
});
