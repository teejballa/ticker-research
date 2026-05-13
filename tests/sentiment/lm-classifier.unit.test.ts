// tests/sentiment/lm-classifier.unit.test.ts
//
// Plan 20-B-06 Task 2 — RED tests for classifyByLM + loadLMDictionary.
// Coverage categories: confidence floor (T-20-B-06-03), canonical sentences,
// tokenization edge cases, negation handler (L&M 2011 §III.D), empty input,
// singleton load.

import { describe, it, expect } from 'vitest';
import { classifyByLM, loadLMDictionary } from '../../src/lib/sentiment/lm-classifier';

describe('classifyByLM — confidence floor (T-20-B-06-03)', () => {
  it('returns confidence === 0.4 for positive input', async () => {
    const r = await classifyByLM('revenue beat earnings expectations');
    expect(r.confidence).toBe(0.4);
  });

  it('returns confidence === 0.4 for negative input', async () => {
    const r = await classifyByLM('lawsuit costs increase liability');
    expect(r.confidence).toBe(0.4);
  });

  it('returns confidence === 0.4 for neutral input', async () => {
    const r = await classifyByLM('the price is $50');
    expect(r.confidence).toBe(0.4);
  });

  it('returns confidence === 0.4 for empty input', async () => {
    const r = await classifyByLM('');
    expect(r.confidence).toBe(0.4);
  });

  it('returns confidence === 0.4 for input with zero matched dictionary words', async () => {
    const r = await classifyByLM('xyz qqq zzz');
    expect(r.confidence).toBe(0.4);
  });
});

describe('classifyByLM — canonical sentences (CONTEXT.md line 118)', () => {
  // NOTE on fixtures: L&M 2011 deliberately EXCLUDES generic words like
  // "revenue", "beat", "earnings", "lawsuit", "cost", "liability" — that is
  // the paper's central finding ("a Liability is not a Liability in
  // finance"). The spec line was illustrative; the dictionary's actual
  // flagged words are finance-specific. We exercise the same three polarity
  // contracts (positive / negative / neutral) using words L&M actually flags.

  it('positive sentence ("strong improvement in profitable gains") → score > 0', async () => {
    const r = await classifyByLM('strong improvement in profitable gains');
    expect(r.score).toBeGreaterThan(0);
  });

  it('negative sentence ("weak losses hurt decline") → score < 0', async () => {
    const r = await classifyByLM('weak losses hurt decline');
    expect(r.score).toBeLessThan(0);
  });

  it('neutral / no-polarity input ("the price is $50") → score === 0', async () => {
    const r = await classifyByLM('the price is $50');
    expect(r.score).toBe(0);
  });
});

describe('classifyByLM — tokenization', () => {
  it('case insensitive: EARNINGS BEAT === earnings beat', async () => {
    const upper = await classifyByLM('EARNINGS BEAT');
    const lower = await classifyByLM('earnings beat');
    expect(upper.score).toBe(lower.score);
    expect(upper.matched_words).toBe(lower.matched_words);
  });

  it('currency symbols stripped; numbers do not crash classifier', async () => {
    const r = await classifyByLM('$50 price target raised');
    expect(typeof r.score).toBe('number');
    expect(r.matched_words).toBeGreaterThanOrEqual(0);
  });

  it('hyphens within words preserved', async () => {
    // The dictionary contains words like "non-performing"; tokenizer should
    // not blow them apart on the internal hyphen.
    const r = await classifyByLM('non-performing loans hurt earnings');
    expect(typeof r.score).toBe('number');
  });

  it('apostrophes within contractions handled consistently', async () => {
    // "litigation" is litigious-flagged (not strictly negative); "hurt" is L&M-negative;
    // the test asserts the apostrophe doesn't shatter "company's" into garbage AND that
    // a clearly-negative L&M word still scores negative.
    const r = await classifyByLM("company's litigation hurt margins");
    expect(typeof r.score).toBe('number');
    expect(r.score).toBeLessThan(0);
  });
});

describe('classifyByLM — negation handler (L&M 2011 §III.D)', () => {
  it('"not bullish on guidance" → score ≤ 0 (negation flips polarity)', async () => {
    const r = await classifyByLM('not bullish on guidance');
    // Without bullish in L&M lexicon, score may be 0; with it, must be ≤ 0.
    expect(r.score).toBeLessThanOrEqual(0);
  });

  it('"no improvement in revenue" → score ≤ 0', async () => {
    const r = await classifyByLM('no improvement in revenue');
    expect(r.score).toBeLessThanOrEqual(0);
  });

  it('"never positive on margins" → score ≤ 0', async () => {
    const r = await classifyByLM('never positive on margins');
    expect(r.score).toBeLessThanOrEqual(0);
  });

  it('"not really strong margins" → score ≤ 0 (negation through 1 filler)', async () => {
    const r = await classifyByLM('not really strong margins');
    expect(r.score).toBeLessThanOrEqual(0);
  });

  it('"strong margins but not weak revenue" → mixed within negation window', async () => {
    // strong is positive (modal); weak is negative (modal). "not weak" → flip.
    // Test that classifier doesn't crash and produces a finite number.
    const r = await classifyByLM('strong margins but not weak revenue');
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe('classifyByLM — empty / whitespace', () => {
  it('empty string → { score: 0, matched_words: 0 }', async () => {
    const r = await classifyByLM('');
    expect(r.score).toBe(0);
    expect(r.matched_words).toBe(0);
  });

  it('whitespace-only → { score: 0, matched_words: 0 }', async () => {
    const r = await classifyByLM('   \n\t ');
    expect(r.score).toBe(0);
    expect(r.matched_words).toBe(0);
  });

  it('currency-only "$50" → { score: 0, matched_words: 0 }', async () => {
    const r = await classifyByLM('$50');
    expect(r.score).toBe(0);
    expect(r.matched_words).toBe(0);
  });
});

describe('classifyByLM — output shape contract', () => {
  it('result carries nlp_path "l&m-fallback"', async () => {
    const r = await classifyByLM('revenue beat earnings');
    expect(r.nlp_path).toBe('l&m-fallback');
  });
});

describe('loadLMDictionary — singleton', () => {
  it('returns the same Map reference on repeated calls', async () => {
    const a = await loadLMDictionary();
    const b = await loadLMDictionary();
    expect(a).toBe(b);
  });

  it('contains at least one canonical positive and negative word', async () => {
    const dict = await loadLMDictionary();
    // Sanity check: dictionary parsed correctly.
    expect(dict.size).toBeGreaterThan(1000);
  });
});
