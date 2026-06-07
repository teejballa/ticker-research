import { describe, it, expect } from 'vitest';
import { categoricalLogLoss } from '../log-loss';
import fixture from '../../../../tests/fixtures/evaluation/log-loss-sklearn-reference.json';

describe('categoricalLogLoss (3-way Buy/Hold/Sell)', () => {
  it('matches sklearn.metrics.log_loss on calibrated fixture', () => {
    const c = fixture.cases[0];
    const ll = categoricalLogLoss(c.y_true, c.y_pred);
    expect(Math.abs(ll - (c as any).expected_log_loss)).toBeLessThan(c.tolerance);
  });

  it('clips at ε=1e-15 — wrong-prediction edge case', () => {
    const c = fixture.cases[1];
    const ll = categoricalLogLoss(c.y_true, c.y_pred);
    expect(Math.abs(ll - (c as any).expected_log_loss_approx)).toBeLessThan(c.tolerance);
  });
});
