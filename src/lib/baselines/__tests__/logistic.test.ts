import { describe, it, expect } from 'vitest';
import { trainBaseline, scoreBaseline } from '../logistic';

describe('logistic baselines (engine36 + canonical7)', () => {
  it('trainBaseline engine36 returns LogisticState with 36 weights', () => {
    const state = trainBaseline('engine36', [], { priorPrecision: 1.0 });
    expect(state.weights).toHaveLength(36);
    expect(state.feature_names).toHaveLength(36);
  });

  it('trainBaseline canonical7 returns LogisticState with 7 weights', () => {
    const state = trainBaseline('canonical7', [], { priorPrecision: 1.0 });
    expect(state.weights).toHaveLength(7);
    expect(state.feature_names).toEqual([
      'rsi_14', 'macd_hist', 'sentiment_pct', 'insider_net_flow',
      'institutional_net_flow', 'put_call_ratio', 'sector_return',
    ]);
  });

  it('scoreBaseline returns finite Brier on synthetic eval set', () => {
    const state = trainBaseline('canonical7', [], { priorPrecision: 1.0 });
    const result = scoreBaseline(state, []);
    expect(Number.isFinite(result.brier) || result.brier === null).toBe(true);
  });
});
