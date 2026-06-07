import { describe, it, expect } from 'vitest';
import { deflatedSharpeRatio } from '../dsr';
import fixture from '../../../../tests/fixtures/evaluation/dsr-bailey-2014-table2.json';

describe('deflatedSharpeRatio (Bailey & López de Prado 2014)', () => {
  it('matches Table 2 worked example within tolerance', () => {
    const { sample_sharpe, skewness, kurtosis, T, N_trials_attempted } = fixture.input;
    const dsr = deflatedSharpeRatio({
      sampleSharpe: sample_sharpe,
      skewness,
      kurtosis,
      T,
      nTrialsAttempted: N_trials_attempted,
    });
    expect(Math.abs(dsr! - fixture.expected.dsr_value_target)).toBeLessThan(fixture.expected.dsr_value_tolerance);
  });

  it('N=1 collapses to plain Sharpe-significance test', () => {
    const dsr = deflatedSharpeRatio({ sampleSharpe: 1.5, skewness: 0, kurtosis: 3, T: 252, nTrialsAttempted: 1 });
    expect(dsr).toBeGreaterThan(0);
    expect(dsr).toBeLessThanOrEqual(1);
  });

  it('returns null when T < 30 (insufficient sample)', () => {
    const dsr = deflatedSharpeRatio({ sampleSharpe: 1.5, skewness: 0, kurtosis: 3, T: 20, nTrialsAttempted: 100 });
    expect(dsr).toBeNull();
  });
});
