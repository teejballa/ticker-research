import { describe, it, expect } from 'vitest';
import { informationCoefficient } from '../ic';
import fixture from '../../../../tests/fixtures/evaluation/spearman-scipy-reference.json';

interface IcCase {
  label: string;
  x: number[];
  y: number[];
  expected_rho: number | 'NaN';
  tolerance: number;
}

describe('informationCoefficient (Spearman with tie correction)', () => {
  (fixture.cases as IcCase[]).forEach((c) => {
    it(`matches scipy.stats.spearmanr — ${c.label}`, () => {
      const ic = informationCoefficient(c.x, c.y, 'spearman');
      if (c.expected_rho === 'NaN') {
        expect(Number.isNaN(ic)).toBe(true);
      } else {
        expect(Math.abs(ic - c.expected_rho)).toBeLessThan(c.tolerance);
      }
    });
  });

  it('returns NaN with warning when n < 10', () => {
    const result = informationCoefficient([1, 2, 3], [4, 5, 6], 'spearman');
    expect(Number.isNaN(result)).toBe(true);
  });
});
