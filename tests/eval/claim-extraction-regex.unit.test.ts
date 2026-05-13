// tests/eval/claim-extraction-regex.unit.test.ts — Plan 20-D-02 Task 2
import { describe, it, expect } from 'vitest';
import { extractClaimsRegex } from '@/lib/eval/claim-extraction-regex';

describe('extractClaimsRegex', () => {
  it('returns ≥3 claims on a canonical bull-thesis paragraph', () => {
    const text =
      'The company will accelerate. Management announced a buyback. Insiders disclosed a stake.';
    const out = extractClaimsRegex(text, 'investment_thesis');
    expect(out.length).toBeGreaterThanOrEqual(3);
    for (const c of out) {
      expect(c.kind).toBe('qualitative');
      expect(c.source_method).toBe('regex');
      expect(c.section).toBe('investment_thesis');
    }
  });

  it('returns 0 claims on a pure disclaimer paragraph', () => {
    const text =
      'Disclaimer: this report is informational. Disclaimer: nothing herein is investment advice.';
    expect(extractClaimsRegex(text, 'investment_thesis')).toHaveLength(0);
  });

  it('returns 0 claims on a pure navigation paragraph', () => {
    const text = 'Table of contents. See also: appendix A.';
    expect(extractClaimsRegex(text, 'investment_thesis')).toHaveLength(0);
  });

  it('handles parenthesized + nested clauses without IndexOutOfRange', () => {
    const text =
      'Although guidance was lowered, the company expects margin expansion.';
    const out = extractClaimsRegex(text, 'investment_thesis');
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].text).toMatch(/expects margin expansion/);
  });

  it('start_char / end_char round-trip via text.slice', () => {
    const text =
      'The company will accelerate. Management announced a buyback. Insiders disclosed a stake.';
    const out = extractClaimsRegex(text, 'investment_thesis');
    for (const c of out) {
      const slice = text.slice(c.start_char, c.end_char).trim();
      expect(slice).toBe(c.text);
    }
  });

  it('section attribution: extractor uses the caller-supplied section verbatim', () => {
    const text = 'The company expects strong fundamentals.';
    const out = extractClaimsRegex(text, 'bullish_signals');
    expect(out[0].section).toBe('bullish_signals');
  });

  it('source_method === regex on every output', () => {
    const text = 'The company will accelerate. Management announced a buyback.';
    const out = extractClaimsRegex(text, 'investment_thesis');
    expect(out.every((c) => c.source_method === 'regex')).toBe(true);
  });

  it('sentence with NO claim-language verb returns []', () => {
    const text = 'Apple. Tesla. Nvidia.';
    expect(extractClaimsRegex(text, 'investment_thesis')).toHaveLength(0);
  });

  it('empty input returns []', () => {
    expect(extractClaimsRegex('', 'investment_thesis')).toHaveLength(0);
    expect(extractClaimsRegex('   ', 'investment_thesis')).toHaveLength(0);
  });
});
