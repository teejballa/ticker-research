import { describe, it, expect } from 'vitest';
import { informationCoefficient } from '../ic';
import fixture from '../../../../tests/fixtures/evaluation/spearman-scipy-reference.json';

describe('informationCoefficient (Spearman with tie correction)', () => {
  fixture.cases.forEach((c: any) => {
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
