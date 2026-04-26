import { describe, it, expect } from 'vitest';
import {
  updatePosterior,
  posteriorMean,
  credibleInterval95,
  brierScore,
  driftZ,
  classifyHit,
  initLogisticState,
  updateLogistic,
  predictLogistic,
  logisticCoefCI,
  adversarialNullBrier,
  patternStatus,
} from '../learning';

describe('updatePosterior', () => {
  it('increments alpha on hit', () => {
    expect(updatePosterior({ alpha: 1, beta: 1 }, true)).toEqual({ alpha: 2, beta: 1 });
  });
  it('increments beta on miss', () => {
    expect(updatePosterior({ alpha: 1, beta: 1 }, false)).toEqual({ alpha: 1, beta: 2 });
  });
  it('converges toward true rate', () => {
    let p = { alpha: 1, beta: 1 };
    for (let i = 0; i < 100; i++) p = updatePosterior(p, i % 4 !== 0);  // 75% hit rate
    expect(posteriorMean(p)).toBeGreaterThan(0.7);
    expect(posteriorMean(p)).toBeLessThan(0.8);
  });
});

describe('credibleInterval95', () => {
  it('shrinks as n grows', () => {
    const small = credibleInterval95({ alpha: 3, beta: 2 });
    const large = credibleInterval95({ alpha: 60, beta: 40 });
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });
  it('is centered on mean', () => {
    const ci = credibleInterval95({ alpha: 50, beta: 50 });
    expect(ci.mean).toBeCloseTo(0.5, 2);
    expect(ci.low).toBeLessThan(0.5);
    expect(ci.high).toBeGreaterThan(0.5);
  });
  it('clips to [0,1]', () => {
    const ci = credibleInterval95({ alpha: 1, beta: 1 });
    expect(ci.low).toBeGreaterThanOrEqual(0);
    expect(ci.high).toBeLessThanOrEqual(1);
  });
});

describe('brierScore', () => {
  it('is 0 for perfect predictions', () => {
    expect(brierScore([1, 0, 1], [true, false, true])).toBe(0);
  });
  it('is 0.25 for chance predictions', () => {
    expect(brierScore([0.5, 0.5, 0.5, 0.5], [true, false, true, false])).toBeCloseTo(0.25, 6);
  });
  it('rewards confident-correct predictions', () => {
    const confident = brierScore([0.9, 0.1], [true, false]);
    const cautious = brierScore([0.6, 0.4], [true, false]);
    expect(confident).toBeLessThan(cautious);
  });
});

describe('driftZ', () => {
  it('returns 0 when rolling matches all-time', () => {
    const z = driftZ({
      rolling: { alpha: 5, beta: 5 },
      allTime: { alpha: 50, beta: 50 },
    });
    expect(z).toBeCloseTo(0, 5);
  });
  it('returns positive z when rolling is higher', () => {
    const z = driftZ({
      rolling: { alpha: 9, beta: 1 },
      allTime: { alpha: 50, beta: 50 },
    });
    expect(z).toBeGreaterThan(2);
  });
});

describe('classifyHit', () => {
  it('hit when ticker beats SPY by >1%', () => {
    expect(classifyHit({ ticker_return_pct: 4, spy_return_pct: 1 })).toBe(true);
  });
  it('miss when ticker only beats SPY by 0.5%', () => {
    expect(classifyHit({ ticker_return_pct: 1.5, spy_return_pct: 1 })).toBe(false);
  });
  it('respects custom threshold', () => {
    expect(classifyHit({ ticker_return_pct: 5, spy_return_pct: 1, threshold_pct: 5 })).toBe(false);
    expect(classifyHit({ ticker_return_pct: 7, spy_return_pct: 1, threshold_pct: 5 })).toBe(true);
  });
});

describe('logistic regression', () => {
  it('learns a simple linear separation', () => {
    let state = initLogisticState(['x1']);
    // Train on a clear linear pattern: x1 > 0 → y=1, x1 < 0 → y=0
    for (let i = 0; i < 200; i++) {
      const x = (i % 2 === 0) ? [1] : [-1];
      const y: 0 | 1 = (i % 2 === 0) ? 1 : 0;
      state = updateLogistic(state, x, y);
    }
    expect(predictLogistic(state, [1])).toBeGreaterThan(0.7);
    expect(predictLogistic(state, [-1])).toBeLessThan(0.3);
    expect(state.weights[0]).toBeGreaterThan(0);
  });

  it('produces credible intervals around coefficients', () => {
    let state = initLogisticState(['x1']);
    for (let i = 0; i < 50; i++) state = updateLogistic(state, [1], 1);
    const ci = logisticCoefCI(state.weights[0], state.weight_vars[0]);
    expect(ci.high).toBeGreaterThan(ci.mean);
    expect(ci.low).toBeLessThan(ci.mean);
  });

  it('coefficient variance shrinks with more data', () => {
    let state = initLogisticState(['x1']);
    state = updateLogistic(state, [1], 1);
    const earlyVar = state.weight_vars[0];
    for (let i = 0; i < 100; i++) state = updateLogistic(state, [1], 1);
    expect(state.weight_vars[0]).toBeLessThan(earlyVar);
  });
});

describe('adversarialNullBrier', () => {
  it('detects real signal vs noise', () => {
    // Predictions correlate with outcomes
    const preds = [0.9, 0.1, 0.85, 0.15, 0.8, 0.2, 0.95, 0.05];
    const outs = [true, false, true, false, true, false, true, false];
    const r = adversarialNullBrier(preds, outs, 200);
    expect(r.real_brier).toBeLessThan(r.mean_null_brier);
    expect(r.p_value).toBeLessThan(0.1);
  });

  it('says noise when predictions are random vs labels', () => {
    const preds = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const outs = [true, false, true, false, true, false];
    const r = adversarialNullBrier(preds, outs, 100);
    // With constant 0.5 predictions, real and shuffled Brier are identical.
    // p_value should be ~1 (every shuffle ≤ real).
    expect(r.p_value).toBeGreaterThan(0.5);
  });
});

describe('patternStatus', () => {
  it('EXPLORATORY when n < 10', () => {
    expect(patternStatus({ sample_size: 5, brier_in: 0.1, brier_out: 0.1, brier_null: 0.25, drift_z: 0 }))
      .toBe('EXPLORATORY');
  });
  it('ACTIVE when in-sample beats null and not drifting', () => {
    expect(patternStatus({ sample_size: 30, brier_in: 0.15, brier_out: 0.18, brier_null: 0.25, drift_z: 0.5 }))
      .toBe('ACTIVE');
  });
  it('DEPRECATED when out-of-sample worse than null', () => {
    expect(patternStatus({ sample_size: 30, brier_in: 0.15, brier_out: 0.30, brier_null: 0.25, drift_z: 0.5 }))
      .toBe('DEPRECATED');
  });
  it('DEPRECATED when drift > 2σ', () => {
    expect(patternStatus({ sample_size: 30, brier_in: 0.15, brier_out: 0.18, brier_null: 0.25, drift_z: 2.5 }))
      .toBe('DEPRECATED');
  });
});
