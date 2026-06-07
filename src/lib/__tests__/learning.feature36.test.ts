/**
 * Phase 21.1 D-18 — 36-feature space tests.
 *
 * Verifies:
 *   - FEATURE_NAMES_36 has exactly 36 entries
 *   - Positions 0-11 === existing FEATURE_NAMES_12 (back-compat)
 *   - Positions 12-23 are FEATURE_NAMES_12[i] + '_z60d'
 *   - Positions 24-35 are FEATURE_NAMES_12[i] + '_zxs'
 *   - buildFeatureVector36 returns 36 elements
 *   - First 12 of buildFeatureVector36 match buildFeatureVector12 exactly
 *   - With empty history/universe dicts, z-score positions are all 0 (cold-start)
 *   - priorPrecisionForN annealing schedule
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FEATURE_NAMES,
  FEATURE_NAMES_12,
  FEATURE_NAMES_36,
  buildFeatureVector12,
  buildFeatureVector36,
  priorPrecisionForN,
} from '../learning';
import type { TechnicalSnapshot, TechPattern } from '../types';
import type { DiffusionTraceResult } from '../diffusion-trace';

// ─── Fixtures (copied from learning.test.ts pattern) ─────────────────────────

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

const SYNTH_TRACE = makeTrace();
const SYNTH_SNAP = makeTechSnap();
const SYNTH_PATTERN: TechPattern = 'breakout_uptrend';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FEATURE_NAMES_36 structure', () => {
  it('has exactly 36 entries', () => {
    expect(FEATURE_NAMES_36.length).toBe(36);
  });

  it('FEATURE_NAMES_12 is identical to FEATURE_NAMES (back-compat alias)', () => {
    expect(FEATURE_NAMES_12).toBe(FEATURE_NAMES); // same reference, not just deep equal
  });

  it('positions 0-11 equal FEATURE_NAMES_12 verbatim', () => {
    expect([...FEATURE_NAMES_36.slice(0, 12)]).toEqual([...FEATURE_NAMES_12]);
  });

  it('positions 12-23 are FEATURE_NAMES_12[i] + "_z60d"', () => {
    const rolling = [...FEATURE_NAMES_36.slice(12, 24)];
    const expected = [...FEATURE_NAMES_12].map((n) => `${n}_z60d`);
    expect(rolling).toEqual(expected);
  });

  it('positions 24-35 are FEATURE_NAMES_12[i] + "_zxs"', () => {
    const crossSec = [...FEATURE_NAMES_36.slice(24, 36)];
    const expected = [...FEATURE_NAMES_12].map((n) => `${n}_zxs`);
    expect(crossSec).toEqual(expected);
  });

  it('no duplicate names in the 36-feature list', () => {
    const names = [...FEATURE_NAMES_36];
    const unique = new Set(names);
    expect(unique.size).toBe(36);
  });
});

describe('buildFeatureVector36', () => {
  beforeEach(() => {
    // Suppress cold-start warnings from z-score functions
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns a 36-element array', () => {
    const v = buildFeatureVector36(SYNTH_TRACE, SYNTH_SNAP, SYNTH_PATTERN, {}, {});
    expect(v).toHaveLength(36);
  });

  it('all elements are finite numbers (no NaN, no Inf)', () => {
    const v = buildFeatureVector36(SYNTH_TRACE, SYNTH_SNAP, SYNTH_PATTERN, {}, {});
    for (const x of v) {
      expect(typeof x).toBe('number');
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isNaN(x)).toBe(false);
    }
  });

  it('first 12 elements match buildFeatureVector12 exactly', () => {
    const base = buildFeatureVector12(SYNTH_TRACE, SYNTH_SNAP, SYNTH_PATTERN);
    const full = buildFeatureVector36(SYNTH_TRACE, SYNTH_SNAP, SYNTH_PATTERN, {}, {});
    expect(full.slice(0, 12)).toEqual(base);
  });

  it('with empty history/universe dicts, z-score positions 12-35 are all 0 (cold-start)', () => {
    const v = buildFeatureVector36(SYNTH_TRACE, SYNTH_SNAP, SYNTH_PATTERN, {}, {});
    const zScorePortion = v.slice(12);
    expect(zScorePortion).toHaveLength(24);
    for (const x of zScorePortion) {
      expect(x).toBe(0);
    }
  });

  it('z-score positions are non-zero when history/universe provided with enough data', () => {
    // Supply history for rsi_14 (position 6 in base, position 18 in 36-d)
    // rsi_14 base value = 62 (from makeTechSnap)
    // history = [50, 55, 60, 65, 70] → mean=60, std≈7.906, z=(62-60)/7.906≈0.253
    const history60d: Record<string, number[]> = {
      rsi_14: [50, 55, 60, 65, 70],
    };
    const v = buildFeatureVector36(SYNTH_TRACE, SYNTH_SNAP, SYNTH_PATTERN, history60d, {});
    // Position 18 = 12 (base) + 6 (rsi_14 offset in rolling block)
    const rsiRollingZ = v[12 + 6]; // 'rsi_14_z60d' at index 18
    expect(rsiRollingZ).not.toBe(0);
    expect(Number.isFinite(rsiRollingZ)).toBe(true);
    // mean=60, sample std=sqrt(250/4)≈7.906, z=(62-60)/7.906≈0.2530
    expect(rsiRollingZ).toBeCloseTo(0.2530, 3);
  });

  it('cross-sectional z-score positions are non-zero when universe provided', () => {
    // Supply universe for v_niche (position 0, so 36-d cross-sec at position 24)
    // v_niche base = 1.5, universe = [0.5, 1.0, 1.5, 2.0, 2.5]
    // mean=1.5, std=sqrt(2.5/4)≈0.7906, z=(1.5-1.5)/0.7906=0
    // Use asymmetric universe to get non-zero z:
    // universe = [0.1, 0.2, 0.3, 0.4, 0.5] → mean=0.3, std≈0.1581, z=(1.5-0.3)/0.1581≈7.59
    const universe: Record<string, number[]> = {
      v_niche: [0.1, 0.2, 0.3, 0.4, 0.5],
    };
    const v = buildFeatureVector36(SYNTH_TRACE, SYNTH_SNAP, SYNTH_PATTERN, {}, universe);
    // Position 24 = 'v_niche_zxs'
    const vNicheXsZ = v[24];
    expect(vNicheXsZ).not.toBe(0);
    expect(Number.isFinite(vNicheXsZ)).toBe(true);
    // mean=0.3, std=sqrt(0.1/(4))=0.1581, z=(1.5-0.3)/0.1581≈7.589
    expect(vNicheXsZ).toBeCloseTo(7.589, 1);
  });

  it('null techSnap and null techPattern are handled gracefully', () => {
    const v = buildFeatureVector36(SYNTH_TRACE, null, null, {}, {});
    expect(v).toHaveLength(36);
    for (const x of v) {
      expect(Number.isFinite(x)).toBe(true);
    }
  });
});

describe('priorPrecisionForN (D-19 annealing schedule)', () => {
  it('returns 8 when n < 100', () => {
    expect(priorPrecisionForN(0)).toBe(8);
    expect(priorPrecisionForN(1)).toBe(8);
    expect(priorPrecisionForN(50)).toBe(8);
    expect(priorPrecisionForN(99)).toBe(8);
  });

  it('returns 4 when 100 <= n < 500', () => {
    expect(priorPrecisionForN(100)).toBe(4);
    expect(priorPrecisionForN(200)).toBe(4);
    expect(priorPrecisionForN(499)).toBe(4);
  });

  it('returns 1 when n >= 500', () => {
    expect(priorPrecisionForN(500)).toBe(1);
    expect(priorPrecisionForN(1000)).toBe(1);
    expect(priorPrecisionForN(999_999)).toBe(1);
  });

  it('boundary at 100 is inclusive for the 4-precision tier', () => {
    expect(priorPrecisionForN(100)).toBe(4);
    expect(priorPrecisionForN(99)).toBe(8);
  });

  it('boundary at 500 is inclusive for the 1-precision tier', () => {
    expect(priorPrecisionForN(500)).toBe(1);
    expect(priorPrecisionForN(499)).toBe(4);
  });
});
