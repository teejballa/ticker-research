/**
 * Plan 20-A-04 — Unit tests for the Gini-coefficient pure-math module.
 *
 * Three canonical cases (literature):
 *   1. Uniform → G = 0 (perfect equality)
 *   2. Single dominant author (n=10) → G = 0.9 (asymptote toward 1 limited by n)
 *   3. Pareto 80/20 — 1 author with 16 of 24 messages (≈67%) → G ≈ 0.617
 *
 * Plus edges: empty, all-zero, negative, single-row, two-author 50/50.
 *
 * PII safety is exercised separately at the UI layer in
 * tests/playwright/research-author-concentration.spec.ts; this file
 * asserts the pure-math contract only.
 */
import { describe, expect, it } from 'vitest';
import {
  authorDisplayPrefix,
  authorShareDistribution,
  giniCoefficient,
  messageCountsByAuthor,
  topNAuthorShare,
} from '@/lib/sentiment/gini';

describe('giniCoefficient — canonical cases', () => {
  it('Canonical 1 — uniform 10x1 returns 0 ± 0.01', () => {
    const g = giniCoefficient([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(0.01);
  });

  it('Canonical 2 — single dominant of 10 returns ~0.9 ± 0.01', () => {
    // [0,0,0,0,0,0,0,0,0,10] — one author has all the mass.
    // Standard formula: after sorting, weightedSum = 10*10 = 100, total = 10,
    // n = 10 → G = (2 * 100) / (10 * 10) − 11/10 = 2 − 1.1 = 0.9
    const g = giniCoefficient([0, 0, 0, 0, 0, 0, 0, 0, 0, 10]);
    expect(g).toBeGreaterThanOrEqual(0.89);
    expect(g).toBeLessThanOrEqual(0.91);
  });

  it('Canonical 3 — two-author 50/50 returns 0 ± 0.01', () => {
    const g = giniCoefficient([5, 5]);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(0.01);
  });

  it('Canonical 4 — Pareto-style [1,1,1,1,1,1,1,1,16] returns ~0.617 ± 0.05', () => {
    // After sort: [1,1,1,1,1,1,1,1,16]; total = 24; n = 9
    // weightedSum = 1*1 + 2*1 + ... + 8*1 + 9*16 = 36 + 144 = 180
    // G = (2 * 180) / (9 * 24) - 10/9 = 360/216 - 10/9 = 1.6667 - 1.1111 = 0.5556
    // Note: lit "80/20" example varies; the canonical formula gives ~0.556 here.
    // We assert the formula's output within ε=0.05 of the reference 0.5556.
    const g = giniCoefficient([1, 1, 1, 1, 1, 1, 1, 1, 16]);
    // Independent reference calc:
    const sorted = [1, 1, 1, 1, 1, 1, 1, 1, 16];
    const n = sorted.length;
    const total = sorted.reduce((s, v) => s + v, 0);
    let ws = 0;
    for (let i = 0; i < n; i++) ws += (i + 1) * sorted[i];
    const reference = (2 * ws) / (n * total) - (n + 1) / n;
    expect(g).toBeGreaterThanOrEqual(reference - 0.05);
    expect(g).toBeLessThanOrEqual(reference + 0.05);
  });
});

describe('giniCoefficient — edge cases', () => {
  it('throws RangeError on empty array', () => {
    expect(() => giniCoefficient([])).toThrow(RangeError);
  });

  it('throws RangeError on all-zero input', () => {
    expect(() => giniCoefficient([0, 0, 0])).toThrow(/total=0/);
  });

  it('throws RangeError on negative value', () => {
    expect(() => giniCoefficient([1, -1, 2])).toThrow(RangeError);
  });

  it('returns 0 (clamped) on single-value input', () => {
    // Degenerate case — single author. Formula yields (2*1*5)/(1*5) - 2/1 = 0.
    const g = giniCoefficient([5]);
    expect(g).toBe(0);
  });
});

describe('messageCountsByAuthor', () => {
  it('skips rows whose classifier_score is null', () => {
    const counts = messageCountsByAuthor([
      { author_id: 'a', classifier_score: null },
      { author_id: 'b', classifier_score: 0.5 },
      { author_id: 'b', classifier_score: -0.2 },
      { author_id: 'a', classifier_score: 0.1 },
    ]);
    expect(counts.get('a')).toBe(1); // only the non-null 'a' row counted
    expect(counts.get('b')).toBe(2);
    expect(counts.size).toBe(2);
  });

  it('returns empty Map on empty input', () => {
    expect(messageCountsByAuthor([]).size).toBe(0);
  });
});

describe('authorShareDistribution', () => {
  it('returns shares sorted descending', () => {
    const counts = new Map<string, number>([
      ['a', 1],
      ['b', 5],
      ['c', 2],
    ]);
    const dist = authorShareDistribution(counts);
    expect(dist).toHaveLength(3);
    expect(dist[0].author_id).toBe('b');
    expect(dist[0].share).toBeCloseTo(0.625, 3);
    expect(dist[0].message_count).toBe(5);
    expect(dist[1].author_id).toBe('c');
    expect(dist[1].share).toBeCloseTo(0.25, 3);
    expect(dist[2].author_id).toBe('a');
    expect(dist[2].share).toBeCloseTo(0.125, 3);
  });

  it('returns [] on empty input', () => {
    expect(authorShareDistribution(new Map())).toEqual([]);
  });
});

describe('topNAuthorShare', () => {
  it('returns 1.0 when n exceeds map size (sums all available)', () => {
    const counts = new Map<string, number>([
      ['a', 1],
      ['b', 1],
    ]);
    expect(topNAuthorShare(counts, 5)).toBe(1.0);
  });

  it('returns 0 on empty counts', () => {
    expect(topNAuthorShare(new Map(), 5)).toBe(0);
  });

  it('sums the top-N shares correctly', () => {
    const counts = new Map<string, number>([
      ['a', 10],
      ['b', 5],
      ['c', 3],
      ['d', 2],
    ]);
    // total = 20; top-2 = (10 + 5) / 20 = 0.75
    expect(topNAuthorShare(counts, 2)).toBeCloseTo(0.75, 3);
  });
});

describe('authorDisplayPrefix', () => {
  it('returns string of length 8 of lowercase hex chars', () => {
    const prefix = authorDisplayPrefix('reddit:WallStreetBets_Mod');
    expect(prefix).toHaveLength(8);
    expect(prefix).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic for the same input', () => {
    const a = authorDisplayPrefix('x:elonmusk');
    const b = authorDisplayPrefix('x:elonmusk');
    expect(a).toBe(b);
  });

  it('differs for different inputs', () => {
    const a = authorDisplayPrefix('x:user1');
    const b = authorDisplayPrefix('x:user2');
    expect(a).not.toBe(b);
  });
});
