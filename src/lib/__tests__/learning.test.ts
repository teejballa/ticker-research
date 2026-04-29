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
  FEATURE_NAMES,
  buildFeatureVector12,
  needsLogisticReinit,
} from '../learning';
import type { TechnicalSnapshot, TechPattern } from '../types';
import type { DiffusionTraceResult } from '../diffusion-trace';

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

// ─── Phase 16-03: 12-feature vector + reinit detection ─────────────────────

describe('FEATURE_NAMES (Phase 16-03)', () => {
  it('contains exactly 12 entries in the locked order', () => {
    expect(FEATURE_NAMES).toHaveLength(12);
    expect([...FEATURE_NAMES]).toEqual([
      'v_niche', 'v_middle', 'v_mainstream',
      'niche_lead_cycles', 'q_z', 'qual_z',
      'rsi_14',
      'macd_histogram',
      'sma_relative_spread',
      'atr_14',
      'volume_ratio',
      'tech_pattern_uptrend_flag',
    ]);
  });
});

function makeTrace(overrides: Partial<DiffusionTraceResult> = {}): DiffusionTraceResult {
  return {
    v_niche: 1.5,
    v_middle: 0.5,
    v_mainstream: 0,
    niche_lead_cycles: 2,
    flow_pattern: 'niche_leads',
    q_z: 0.7,
    qual_z: -0.2,
    cap_class: 'large_cap',
    source_count: 4,
    ...overrides,
  };
}

function makeTechSnap(overrides: Partial<TechnicalSnapshot> = {}): TechnicalSnapshot {
  return {
    rsi_14: 62,
    macd_line: 0.4,
    macd_signal: 0.2,
    macd_histogram: 0.2,
    sma_50: 110,
    sma_200: 100,
    atr_14: 1.5,
    avg_volume_20d: 1_000_000,
    volume_ratio: 1.2,
    trend_regime: 'uptrend',
    momentum_regime: 'neutral',
    cross_state: 'none',
    tech_pattern: 'breakout_uptrend',
    bar_count: 250,
    computed_at: '2026-04-28T00:00:00Z',
    data_source: 'yahoo',
    ...overrides,
  };
}

describe('buildFeatureVector12', () => {
  it('returns a 12-element number array', () => {
    const v = buildFeatureVector12(makeTrace(), makeTechSnap(), 'breakout_uptrend');
    expect(v).toHaveLength(12);
    for (const x of v) expect(typeof x).toBe('number');
  });

  it('positions 0-5 are the diffusion features in order', () => {
    const trace = makeTrace({ v_niche: 9, v_middle: 8, v_mainstream: 7, niche_lead_cycles: 6, q_z: 5, qual_z: 4 });
    const v = buildFeatureVector12(trace, makeTechSnap(), 'breakout_uptrend');
    expect(v[0]).toBe(9);
    expect(v[1]).toBe(8);
    expect(v[2]).toBe(7);
    expect(v[3]).toBe(6);
    expect(v[4]).toBe(5);
    expect(v[5]).toBe(4);
  });

  it('position 8 (sma_relative_spread) computes (sma_50 - sma_200) / sma_200', () => {
    const v = buildFeatureVector12(makeTrace(), makeTechSnap({ sma_50: 110, sma_200: 100 }), 'breakout_uptrend');
    expect(v[8]).toBeCloseTo(0.1, 6);
  });

  it('position 8 returns 0 when sma_50 is null', () => {
    const v = buildFeatureVector12(makeTrace(), makeTechSnap({ sma_50: null }), 'breakout_uptrend');
    expect(v[8]).toBe(0);
  });

  it('position 8 returns 0 when sma_200 is null', () => {
    const v = buildFeatureVector12(makeTrace(), makeTechSnap({ sma_200: null }), 'breakout_uptrend');
    expect(v[8]).toBe(0);
  });

  it('position 8 returns 0 when sma_200 is exactly 0 (avoid division by zero)', () => {
    const v = buildFeatureVector12(makeTrace(), makeTechSnap({ sma_200: 0 }), 'breakout_uptrend');
    expect(v[8]).toBe(0);
  });

  it('position 11 (uptrend flag) is 1 for each uptrend pattern', () => {
    const uptrend: TechPattern[] = [
      'breakout_uptrend',
      'overbought_uptrend',
      'pullback_in_uptrend',
      'consolidation',
      'golden_cross',
    ];
    for (const tp of uptrend) {
      const v = buildFeatureVector12(makeTrace(), makeTechSnap(), tp);
      expect(v[11]).toBe(1);
    }
  });

  it('position 11 (uptrend flag) is 0 for non-uptrend patterns', () => {
    const downtrend: TechPattern[] = ['breakdown', 'oversold_downtrend', 'death_cross'];
    for (const tp of downtrend) {
      const v = buildFeatureVector12(makeTrace(), makeTechSnap(), tp);
      expect(v[11]).toBe(0);
    }
  });

  it('null safety: rsi_14 null → 50; macd_histogram null → 0; atr_14 null → 0; volume_ratio null → 1; techPattern null → flag 0', () => {
    const techSnap = makeTechSnap({
      rsi_14: null,
      macd_histogram: null,
      atr_14: null,
      volume_ratio: null,
    });
    const v = buildFeatureVector12(makeTrace(), techSnap, null);
    expect(v[6]).toBe(50);   // rsi_14 default
    expect(v[7]).toBe(0);    // macd_histogram default
    expect(v[9]).toBe(0);    // atr_14 default
    expect(v[10]).toBe(1);   // volume_ratio default
    expect(v[11]).toBe(0);   // null tech pattern → flag 0
  });

  it('null safety: techSnap entirely null → all technical positions use defaults', () => {
    const v = buildFeatureVector12(makeTrace(), null, null);
    expect(v[6]).toBe(50);
    expect(v[7]).toBe(0);
    expect(v[8]).toBe(0);
    expect(v[9]).toBe(0);
    expect(v[10]).toBe(1);
    expect(v[11]).toBe(0);
  });
});

describe('needsLogisticReinit', () => {
  it('returns true when coefficients is null', () => {
    expect(needsLogisticReinit(null)).toBe(true);
  });

  it('returns true when coefficients is undefined', () => {
    expect(needsLogisticReinit(undefined)).toBe(true);
  });

  it('returns true when coefficients has fewer than 12 keys (legacy 6-d state)', () => {
    const legacy = {
      v_niche: { mu: 0, sigma: 1 },
      v_middle: { mu: 0, sigma: 1 },
      v_mainstream: { mu: 0, sigma: 1 },
      niche_lead_cycles: { mu: 0, sigma: 1 },
      q_z: { mu: 0, sigma: 1 },
      qual_z: { mu: 0, sigma: 1 },
    };
    expect(needsLogisticReinit(legacy)).toBe(true);
  });

  it('returns false when coefficients has 12 keys (post-Phase-16 state)', () => {
    const fresh: Record<string, { mu: number; sigma: number }> = {};
    for (const name of FEATURE_NAMES) fresh[name] = { mu: 0, sigma: 1 };
    expect(needsLogisticReinit(fresh)).toBe(false);
  });

  it('returns false when coefficients has more than 12 keys (e.g. _intercept extra key)', () => {
    const withIntercept: Record<string, { mu: number; sigma: number }> = { _intercept: { mu: 0, sigma: 1 } };
    for (const name of FEATURE_NAMES) withIntercept[name] = { mu: 0, sigma: 1 };
    expect(needsLogisticReinit(withIntercept)).toBe(false);
  });
});
