// Phase 18 Wave 0/1: pageHinkleyStatistic primitive — CORE-ML-04 / D-06.
// Activated assertions per Plan 18-01 §<behavior>.

import { describe, it, expect } from 'vitest';
import { pageHinkleyStatistic } from '../learning';

describe('pageHinkleyStatistic (Phase 18 — drift detector)', () => {
  it('returns ≤ 0 on a stationary all-zero stream', () => {
    const ph = pageHinkleyStatistic(new Array(100).fill(0), 0.005, 0.05);
    expect(ph).toBeLessThanOrEqual(0);
  });

  it('returns ≤ 0 on a stationary mean-zero noisy stream below δ', () => {
    // Symmetric noise smaller than δ should never advance either accumulator.
    const noise: number[] = [];
    for (let i = 0; i < 100; i++) noise.push(i % 2 === 0 ? 0.001 : -0.001);
    const ph = pageHinkleyStatistic(noise, 0.005, 0.05);
    expect(ph).toBeLessThanOrEqual(0);
  });

  it('fires positive on a sustained upward shift of magnitude 0.5 over 30 obs', () => {
    const shift = new Array(30).fill(0.5);
    const ph = pageHinkleyStatistic(shift, 0.005, 0.05);
    expect(ph).toBeGreaterThan(0);
  });

  it('fires positive on a sustained downward shift (tracks both directions)', () => {
    const shift = new Array(30).fill(-0.5);
    const ph = pageHinkleyStatistic(shift, 0.005, 0.05);
    expect(ph).toBeGreaterThan(0);
  });

  it('larger λ_PH threshold suppresses borderline shifts', () => {
    // Same input, higher threshold → smaller (or negative) statistic.
    const shift = new Array(20).fill(0.1);
    const lowThreshold = pageHinkleyStatistic(shift, 0.005, 0.05);
    const highThreshold = pageHinkleyStatistic(shift, 0.005, 5.0);
    expect(highThreshold).toBeLessThan(lowThreshold);
    expect(highThreshold).toBeLessThan(0);
  });

  it('larger δ tolerance suppresses small persistent drift', () => {
    // Persistent shift of 0.01 with δ=0.005 advances; with δ=0.1 does not.
    const shift = new Array(50).fill(0.01);
    const tightDelta = pageHinkleyStatistic(shift, 0.005, 0.05);
    const looseDelta = pageHinkleyStatistic(shift, 0.1, 0.05);
    expect(looseDelta).toBeLessThan(tightDelta);
  });

  it('returns -λ_PH on empty input', () => {
    expect(pageHinkleyStatistic([], 0.005, 0.05)).toBe(-0.05);
  });
});
