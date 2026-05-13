// tests/eval/claim-merge.unit.test.ts — Plan 20-D-02 Task 1
import { describe, it, expect } from 'vitest';
import { bagOfWords, cosineBagOfWords, mergeClaimSets } from '@/lib/eval/claim-merge';
import type { Claim } from '@/lib/eval/citation-coverage.types';

const mkClaim = (text: string, start: number, src: 'regex' | 'llm'): Claim => ({
  text,
  section: 'investment_thesis',
  start_char: start,
  end_char: start + text.length,
  source_method: src,
  kind: 'qualitative',
});

describe('bagOfWords', () => {
  it('lowercases, strips punctuation, drops stopwords', () => {
    const m = bagOfWords('The Company Is Growing Fast.');
    expect(m.has('the')).toBe(false);
    expect(m.has('is')).toBe(false);
    expect(m.get('company')).toBe(1);
    expect(m.get('growing')).toBe(1);
    expect(m.get('fast')).toBe(1);
  });
});

describe('cosineBagOfWords', () => {
  it('identical inputs → 1.0', () => {
    const a = bagOfWords('Apple announced new iPhone');
    const b = bagOfWords('Apple announced new iPhone');
    expect(cosineBagOfWords(a, b)).toBeCloseTo(1.0, 6);
  });

  it('disjoint vocab → 0', () => {
    const a = bagOfWords('apple revenue');
    const b = bagOfWords('tesla earnings');
    expect(cosineBagOfWords(a, b)).toBe(0);
  });

  it('empty input → 0', () => {
    expect(cosineBagOfWords(new Map(), bagOfWords('apple'))).toBe(0);
  });
});

describe('mergeClaimSets', () => {
  it('dedupes claims with cosine > 0.85, keeps lower start_char', () => {
    // Make them near-identical: only one extra stopword.
    const r = mkClaim('Apple announced new iPhone refresh cycle', 50, 'regex');
    const l = mkClaim('Apple announced new iPhone refresh cycle', 80, 'llm');
    const out = mergeClaimSets([r], [l]);
    expect(out).toHaveLength(1);
    expect(out[0].start_char).toBe(50);
    expect(out[0].source_method).toBe('merged');
  });

  it('preserves disjoint claims', () => {
    const r = mkClaim('Apple announced new iPhone', 10, 'regex');
    const l = mkClaim('Tesla raised earnings guidance materially', 100, 'llm');
    const out = mergeClaimSets([r], [l]);
    expect(out).toHaveLength(2);
    expect(out[0].source_method).toBe('regex');
    expect(out[1].source_method).toBe('llm');
  });

  it('stable-sorts output by (section, start_char)', () => {
    const c1: Claim = { ...mkClaim('Apple thrives', 200, 'regex'), section: 'bullish_signals' };
    const c2: Claim = { ...mkClaim('Apple struggles', 50, 'llm'), section: 'bearish_signals' };
    const c3: Claim = { ...mkClaim('Apple matters', 10, 'llm'), section: 'bullish_signals' };
    const out = mergeClaimSets([c1], [c2, c3]);
    expect(out.map((c) => [c.section, c.start_char])).toEqual([
      ['bearish_signals', 50],
      ['bullish_signals', 10],
      ['bullish_signals', 200],
    ]);
  });

  it('preserves source_method on disjoint claims', () => {
    const r = mkClaim('Apple announced refresh cycle', 10, 'regex');
    const l = mkClaim('Tesla raised guidance materially', 100, 'llm');
    const out = mergeClaimSets([r], [l]);
    expect(out.find((c) => c.text.includes('Apple'))?.source_method).toBe('regex');
    expect(out.find((c) => c.text.includes('Tesla'))?.source_method).toBe('llm');
  });
});
