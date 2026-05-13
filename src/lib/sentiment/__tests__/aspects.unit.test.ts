// src/lib/sentiment/__tests__/aspects.unit.test.ts
// Plan 20-B-01 Task 2 — RED→GREEN tests for the fixed 7-element AspectTag taxonomy.

import { describe, it, expect } from 'vitest';
import { ASPECT_TAGS, isAspectTag, type AspectTag } from '@/lib/sentiment/aspects';

describe('ASPECT_TAGS — fixed 7-element taxonomy (CONTEXT.md line 113)', () => {
  it('has exactly 7 entries', () => {
    expect(ASPECT_TAGS.length).toBe(7);
  });

  it('contains exactly the expected aspects in order', () => {
    expect([...ASPECT_TAGS]).toEqual([
      'earnings',
      'guidance',
      'regulatory',
      'M&A',
      'macro',
      'product',
      'management',
    ]);
  });

  it('AspectTag covers every element (compile-time typeof derivation)', () => {
    // typeof-derived union — these MUST typecheck as AspectTag.
    const earnings: AspectTag = 'earnings';
    const guidance: AspectTag = 'guidance';
    const regulatory: AspectTag = 'regulatory';
    const ma: AspectTag = 'M&A';
    const macro: AspectTag = 'macro';
    const product: AspectTag = 'product';
    const management: AspectTag = 'management';
    expect([earnings, guidance, regulatory, ma, macro, product, management].length).toBe(7);
  });
});

describe('isAspectTag — runtime type guard', () => {
  it('accepts every literal in ASPECT_TAGS', () => {
    for (const a of ASPECT_TAGS) {
      expect(isAspectTag(a)).toBe(true);
    }
  });

  it('rejects unknown strings', () => {
    expect(isAspectTag('marketing')).toBe(false);
    expect(isAspectTag('sentiment')).toBe(false);
    expect(isAspectTag('')).toBe(false);
    expect(isAspectTag('Earnings')).toBe(false); // case-sensitive
  });

  it('rejects non-string types', () => {
    expect(isAspectTag(42)).toBe(false);
    expect(isAspectTag(null)).toBe(false);
    expect(isAspectTag(undefined)).toBe(false);
    expect(isAspectTag({})).toBe(false);
    expect(isAspectTag([])).toBe(false);
    expect(isAspectTag(true)).toBe(false);
  });
});
