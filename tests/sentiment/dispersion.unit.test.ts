/**
 * Plan 20-A-01 — Unit tests for dispersion module (pure functions).
 *
 * ≥10 cases covering shannonEntropy, bullPctStd, authorDiversityGini.
 * Verifies formulas literally against closed-form expected values.
 */

import { describe, it, expect } from 'vitest';
import {
  shannonEntropy,
  bullPctStd,
  authorDiversityGini,
} from '@/lib/sentiment/dispersion';

describe('shannonEntropy', () => {
  it('returns log₂(3) ≈ 1.585 for uniform {1,1,1}', () => {
    const H = shannonEntropy({ bull: 1, bear: 1, neutral: 1 });
    expect(H).toBeCloseTo(Math.log2(3), 9);
  });

  it('returns 0 for fully-concentrated {100, 0, 0}', () => {
    expect(shannonEntropy({ bull: 100, bear: 0, neutral: 0 })).toBe(0);
  });

  it('returns 1 for binary-uniform {50, 50, 0}', () => {
    expect(shannonEntropy({ bull: 50, bear: 50, neutral: 0 })).toBeCloseTo(1, 9);
  });

  it('handles non-uniform {80, 10, 10}', () => {
    // H = -(0.8 log2 0.8 + 0.1 log2 0.1 + 0.1 log2 0.1)
    const expected =
      -(0.8 * Math.log2(0.8) + 0.1 * Math.log2(0.1) + 0.1 * Math.log2(0.1));
    expect(shannonEntropy({ bull: 80, bear: 10, neutral: 10 })).toBeCloseTo(expected, 9);
  });

  it('throws on negative count', () => {
    expect(() => shannonEntropy({ bull: -1, bear: 0, neutral: 0 })).toThrow();
  });

  it('throws on NaN count', () => {
    expect(() => shannonEntropy({ bull: NaN, bear: 0, neutral: 0 })).toThrow();
  });

  it('throws on Infinity count', () => {
    expect(() => shannonEntropy({ bull: Infinity, bear: 0, neutral: 0 })).toThrow();
  });

  it('throws on all-zero counts', () => {
    expect(() => shannonEntropy({ bull: 0, bear: 0, neutral: 0 })).toThrow();
  });
});

describe('bullPctStd', () => {
  it('returns 0 for single source', () => {
    expect(bullPctStd([{ source: 'a', bull_pct: 50 }])).toBe(0);
  });

  it('returns 50 for two sources at 0 and 100 (population stdev)', () => {
    expect(
      bullPctStd([
        { source: 'a', bull_pct: 0 },
        { source: 'b', bull_pct: 100 },
      ]),
    ).toBe(50);
  });

  it('returns 0 for empty array', () => {
    expect(bullPctStd([])).toBe(0);
  });

  it('returns 0 when all sources agree', () => {
    expect(
      bullPctStd([
        { source: 'a', bull_pct: 70 },
        { source: 'b', bull_pct: 70 },
        { source: 'c', bull_pct: 70 },
      ]),
    ).toBe(0);
  });

  it('matches closed-form population stdev for {20, 50, 80}', () => {
    // mean = 50; variance = ((30)² + 0 + (30)²)/3 = 1800/3 = 600; sqrt(600) ≈ 24.495
    expect(
      bullPctStd([
        { source: 'a', bull_pct: 20 },
        { source: 'b', bull_pct: 50 },
        { source: 'c', bull_pct: 80 },
      ]),
    ).toBeCloseTo(Math.sqrt(600), 9);
  });
});

describe('authorDiversityGini', () => {
  it('returns 0 for empty map', () => {
    expect(authorDiversityGini(new Map())).toBe(0);
  });

  it('returns 0 for single-author trivially equal case', () => {
    expect(authorDiversityGini(new Map([['x', 5]]))).toBe(0);
  });

  it('returns 0 for perfectly equal 3-author distribution', () => {
    expect(
      authorDiversityGini(new Map([['x', 1], ['y', 1], ['z', 1]])),
    ).toBe(0);
  });

  it('returns ≈ 0.667 for {100, 0, 0} (closed-form mean-difference)', () => {
    // sumDiff (all i,j) = 2*(100+100+0) = 400; mean = 100/3; n=3
    // G = 400 / (2 * 9 * 100/3) = 400 / 600 ≈ 0.6667
    const g = authorDiversityGini(
      new Map([['x', 100], ['y', 0], ['z', 0]]),
    );
    expect(g).toBeCloseTo(2 / 3, 3);
  });

  it('rises toward 1 as one author dominates further', () => {
    const g1 = authorDiversityGini(new Map([['x', 10], ['y', 1]]));
    const g2 = authorDiversityGini(new Map([['x', 100], ['y', 1]]));
    expect(g2).toBeGreaterThan(g1);
    expect(g2).toBeLessThan(1);
  });

  it('throws on negative counts', () => {
    expect(() =>
      authorDiversityGini(new Map([['x', -1], ['y', 2]])),
    ).toThrow();
  });
});
