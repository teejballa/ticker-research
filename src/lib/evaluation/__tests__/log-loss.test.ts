import { describe, it, expect } from 'vitest';
import { categoricalLogLoss } from '../log-loss';
import fixture from '../../../../tests/fixtures/evaluation/log-loss-sklearn-reference.json';

interface LogLossCase {
  y_true: number[];
  y_pred: number[][];
  expected_log_loss?: number;
  expected_log_loss_approx?: number;
  tolerance: number;
}

describe('categoricalLogLoss (3-way Buy/Hold/Sell)', () => {
  it('matches sklearn.metrics.log_loss on calibrated fixture', () => {
    const c = fixture.cases[0] as LogLossCase;
    const ll = categoricalLogLoss(c.y_true, c.y_pred);
    expect(Math.abs(ll - (c.expected_log_loss as number))).toBeLessThan(c.tolerance);
  });

  it('clips at ε=1e-15 — wrong-prediction edge case', () => {
    const c = fixture.cases[1] as LogLossCase;
    const ll = categoricalLogLoss(c.y_true, c.y_pred);
    expect(Math.abs(ll - (c.expected_log_loss_approx as number))).toBeLessThan(c.tolerance);
  });
});
