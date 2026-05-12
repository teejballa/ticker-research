import { describe, it, expect } from 'vitest';
import {
  decayWeight,
  decayLambdaForClass,
  halfLifeDays,
  ageDaysSince,
} from '@/lib/sentiment/decay';
import { DECAY_HYPERPARAMETERS } from '@/lib/sentiment/decay-hyperparameters';

describe('decayWeight', () => {
  it('age=0 → weight = 1.0 exactly', () => {
    expect(decayWeight(0, 0.5)).toBe(1);
  });

  it('age large → weight approaches 0', () => {
    expect(decayWeight(1000, 1)).toBeLessThan(1e-100);
  });

  it('half-life formula t½ = ln(2)/λ → weight at t½ is exactly 0.5', () => {
    const lambda = 0.231; // news literature seed
    const t_half = Math.LN2 / lambda;
    expect(decayWeight(t_half, lambda)).toBeCloseTo(0.5, 12);
  });

  it('throws on negative age (programmer bug — clock skew or tampered fetched_at)', () => {
    expect(() => decayWeight(-1, 0.5)).toThrowError(/ageDays must be >= 0/);
  });

  it('throws on lambda = 0', () => {
    expect(() => decayWeight(1, 0)).toThrowError(/lambdaPerDay must be > 0/);
  });

  it('throws on lambda < 0', () => {
    expect(() => decayWeight(1, -0.5)).toThrowError(/lambdaPerDay must be > 0/);
  });

  it('throws on non-finite lambda', () => {
    expect(() => decayWeight(1, Infinity)).toThrowError(
      /lambdaPerDay must be > 0/,
    );
    expect(() => decayWeight(1, NaN)).toThrowError(/lambdaPerDay must be > 0/);
  });

  it('throws on non-finite age', () => {
    expect(() => decayWeight(NaN, 0.5)).toThrowError(/ageDays must be finite/);
  });
});

describe('decayLambdaForClass', () => {
  it.each(['retail', 'news', 'sec', 'analyst', 'social-other'] as const)(
    'returns positive finite λ for %s',
    (cls) => {
      const l = decayLambdaForClass(cls);
      expect(Number.isFinite(l)).toBe(true);
      expect(l).toBeGreaterThan(0);
      expect(l).toBe(DECAY_HYPERPARAMETERS[cls].lambda_per_day);
    },
  );
});

describe('halfLifeDays', () => {
  it('inverts decayWeight: decayWeight(halfLifeDays(λ), λ) ≈ 0.5', () => {
    for (const lambda of [0.1, 0.5, 1.0, 2.5]) {
      expect(decayWeight(halfLifeDays(lambda), lambda)).toBeCloseTo(0.5, 12);
    }
  });

  it('throws on lambda <= 0 or non-finite', () => {
    expect(() => halfLifeDays(0)).toThrowError(/lambdaPerDay must be > 0/);
    expect(() => halfLifeDays(-1)).toThrowError(/lambdaPerDay must be > 0/);
    expect(() => halfLifeDays(NaN)).toThrowError(/lambdaPerDay must be > 0/);
  });
});

describe('ageDaysSince', () => {
  it('computes fractional days correctly', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const fetched = new Date('2026-05-09T12:00:00Z');
    expect(ageDaysSince(fetched, now)).toBe(1);
  });

  it('half-day fractional', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const fetched = new Date('2026-05-10T00:00:00Z');
    expect(ageDaysSince(fetched, now)).toBe(0.5);
  });
});

describe('DECAY_HYPERPARAMETERS module-load assertion', () => {
  it('half_life_days matches ln(2)/lambda for every class', () => {
    for (const cfg of Object.values(DECAY_HYPERPARAMETERS)) {
      expect(Math.LN2 / cfg.lambda_per_day).toBeCloseTo(cfg.half_life_days, 9);
    }
  });

  it('all 5 expected source classes present', () => {
    expect(Object.keys(DECAY_HYPERPARAMETERS).sort()).toEqual(
      ['analyst', 'news', 'retail', 'sec', 'social-other'].sort(),
    );
  });
});
