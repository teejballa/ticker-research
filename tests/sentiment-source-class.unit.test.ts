import { describe, it, expect } from 'vitest';
import {
  sourceToClass,
  sourceToClassUnsafe,
  SourceClassUnknownError,
  type CipherSource,
} from '@/lib/sentiment/source-class';

describe('sourceToClass — exhaustive mapping per CONTEXT line 105', () => {
  const cases: Array<[CipherSource, string]> = [
    ['stocktwits', 'retail'],
    ['apewisdom', 'retail'],
    ['swaggystocks', 'retail'],
    ['firecrawl-reddit', 'retail'],
    ['x', 'retail'],
    ['anthropic-search-news', 'news'],
    ['finnhub-analyst', 'analyst'],
    ['firecrawl-forums', 'social-other'],
    ['sec', 'sec'],
    // Plan 30.1 — direct Reddit OAuth + HackerNews ingestion (D-15, D-16)
    ['reddit', 'retail'],
    ['hackernews', 'social-other'],
  ];

  it.each(cases)('%s → %s', (source, expected) => {
    expect(sourceToClass(source)).toBe(expected);
  });

  it('rejects unknown source via Unsafe variant', () => {
    expect(() => sourceToClassUnsafe('unknown-vendor')).toThrowError(
      SourceClassUnknownError,
    );
  });
});

describe('sourceToClassUnsafe — legacy DB strings', () => {
  it.each([
    ['reddit', 'retail'],
    ['news', 'news'],
    ['firecrawl', 'social-other'],
    ['hackernews', 'social-other'], // Plan 30.1 D-16 — historic DB string callers
  ] as const)('legacy %s → %s', (source, expected) => {
    expect(sourceToClassUnsafe(source)).toBe(expected);
  });
});

describe('SourceClassUnknownError carries the offending source', () => {
  it('preserves source on err.source', () => {
    try {
      sourceToClassUnsafe('mystery-vendor');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SourceClassUnknownError);
      expect((e as SourceClassUnknownError).source).toBe('mystery-vendor');
    }
  });
});
