// tests/lib/sentiment/citation-schema.test.ts
//
// Phase 19 / Plan 19-C-07 / Task 1 — RED tests for the structured citation
// schema. Implementation lives in src/lib/sentiment/citation-schema.ts (Task 2).
//
// Per D-39:
//   Citation = { source, url, confidence, date_retrieved }
//   - URL is mandatory at Zod validation time when source ∈ {analyst, news}.
//   - URL is optional for social/community/options/sec_filing/price_data/other.
// Per T-19-C-07-03 (info-disclosure mitigation):
//   - URLs are sanitized — embedded `user:pass@` is rewritten to `***@`.

import { describe, it, expect } from 'vitest';
import {
  CitationSchema,
  CitationsArraySchema,
} from '@/lib/sentiment/citation-schema';

describe('CitationSchema', () => {
  it('parses a valid analyst citation with URL, confidence, and ISO timestamp', () => {
    const result = CitationSchema.safeParse({
      source: 'analyst',
      url: 'https://example.com/research/AAPL',
      confidence: 0.8,
      date_retrieved: '2026-05-06T10:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.source).toBe('analyst');
      expect(result.data.url).toBe('https://example.com/research/AAPL');
      expect(result.data.confidence).toBe(0.8);
    }
  });

  it('rejects an analyst citation that is missing a URL with a "mandatory" message', () => {
    const result = CitationSchema.safeParse({
      source: 'analyst',
      url: null,
      confidence: 0.8,
      date_retrieved: '2026-05-06T10:00:00Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i: { message: string }) => i.message).join(' | ');
      expect(messages).toMatch(/mandatory/i);
    }
  });

  it('rejects a news citation that is missing a URL', () => {
    const result = CitationSchema.safeParse({
      source: 'news',
      url: null,
      confidence: 0.7,
      date_retrieved: '2026-05-06T10:00:00Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i: { message: string }) => i.message).join(' | ');
      expect(messages).toMatch(/mandatory/i);
    }
  });

  it('accepts a social citation with url=null (URL optional for social)', () => {
    const result = CitationSchema.safeParse({
      source: 'social',
      url: null,
      confidence: 0.5,
      date_retrieved: '2026-05-06T10:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects confidence values outside [0,1]', () => {
    const tooLow = CitationSchema.safeParse({
      source: 'news',
      url: 'https://example.com/a',
      confidence: -0.1,
      date_retrieved: '2026-05-06T10:00:00Z',
    });
    const tooHigh = CitationSchema.safeParse({
      source: 'news',
      url: 'https://example.com/a',
      confidence: 1.1,
      date_retrieved: '2026-05-06T10:00:00Z',
    });
    expect(tooLow.success).toBe(false);
    expect(tooHigh.success).toBe(false);
  });

  it('rejects an invalid source enum value', () => {
    const result = CitationSchema.safeParse({
      source: 'rumor', // not a valid enum
      url: 'https://example.com/a',
      confidence: 0.5,
      date_retrieved: '2026-05-06T10:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('CitationsArraySchema accepts an empty array', () => {
    const result = CitationsArraySchema.safeParse([]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it('sanitizes URLs that embed user:pass@ auth into ***@ (T-19-C-07-03)', () => {
    const result = CitationSchema.safeParse({
      source: 'news',
      url: 'https://user:pass@example.com/article',
      confidence: 0.6,
      date_retrieved: '2026-05-06T10:00:00Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe('https://***@example.com/article');
      expect(result.data.url).not.toMatch(/user:pass@/);
    }
  });
});
