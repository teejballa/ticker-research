// tests/eval/citation-coverage.unit.test.ts — Plan 20-D-02 Task 4
import { describe, it, expect, vi } from 'vitest';
import {
  citationCoverage,
  extractCitationAnchors,
} from '@/lib/eval/citation-coverage';
import type {
  Claim,
  CitationAnchor,
  ReportSection,
} from '@/lib/eval/citation-coverage.types';

const mkClaim = (
  text: string,
  start: number,
  section: ReportSection = 'investment_thesis',
  src: 'regex' | 'llm' | 'merged' = 'regex',
): Claim => ({
  text,
  section,
  start_char: start,
  end_char: start + text.length,
  source_method: src,
  kind: 'qualitative',
});

const mkAnchor = (
  pos: number,
  url: string,
  title = '',
  section: ReportSection = 'investment_thesis',
): CitationAnchor => ({
  citation: {
    source: 'news',
    url,
    title,
    sentiment: 'neutral',
  } as never,
  anchor_pos: pos,
  section,
});

describe('citationCoverage', () => {
  it('empty claims input returns coverage_pct=100 + warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = citationCoverage([], []);
    expect(r.coverage_pct).toBe(100);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('Rule A: anchor within ±50 chars marks claim supported', () => {
    const c = mkClaim('Apple will accelerate', 100);
    const a = mkAnchor(130, 'https://example.com/random');
    const r = citationCoverage([c], [a]);
    expect(r.coverage_pct).toBe(100);
    expect(r.totals.supported).toBe(1);
  });

  it('Rule A boundary: anchor at exactly +50 → supported (inclusive)', () => {
    const c = mkClaim('Apple will accelerate', 100);
    const a = mkAnchor(150, 'https://example.com/random');
    const r = citationCoverage([c], [a]);
    expect(r.coverage_pct).toBe(100);
  });

  it('Rule A miss: anchor at +51 → falls through to Rule B', () => {
    const c = mkClaim('xxx yyy zzz', 100);
    const a = mkAnchor(151, 'https://example.com/random-disclaimer');
    const r = citationCoverage([c], [a]);
    // Rule A misses (51 > 50), Rule B misses (disjoint vocab) → unsupported.
    expect(r.coverage_pct).toBe(0);
    expect(r.unsupported).toHaveLength(1);
  });

  it('Rule B: keyword cosine ≥ 0.5 marks claim supported with no anchor', () => {
    const c = mkClaim('Apple announced new chip yesterday', 10);
    const a = mkAnchor(-1, 'https://example.com/apple-chip-news', 'apple new chip announced');
    const r = citationCoverage([c], [a]);
    expect(r.totals.supported).toBe(1);
  });

  it('Rule B miss: disjoint vocab keeps claim unsupported', () => {
    const c = mkClaim('Company will triple revenue', 10);
    const a = mkAnchor(-1, 'https://example.com/random-disclaimer', 'unrelated jargon');
    const r = citationCoverage([c], [a]);
    expect(r.totals.unsupported).toBe(1);
  });

  it('Rule A wins over Rule B when both fire (still supported)', () => {
    const c = mkClaim('Apple iPhone refresh cycle', 100);
    const a = mkAnchor(110, 'https://example.com/apple-iphone-refresh-cycle');
    const r = citationCoverage([c], [a]);
    expect(r.totals.supported).toBe(1);
  });

  it('cross-section: claim in investment_thesis never matches anchor in sources_used', () => {
    const c = mkClaim('Apple grew', 100, 'investment_thesis');
    const a = mkAnchor(110, 'https://example.com/apple', '', 'sources_used');
    const r = citationCoverage([c], [a]);
    expect(r.totals.unsupported).toBe(1);
  });

  it('per_section[s] = 100 when all claims in s are supported', () => {
    const c1 = mkClaim('Apple will rise', 100);
    const a1 = mkAnchor(110, 'https://x.com/y');
    const r = citationCoverage([c1], [a1]);
    expect(r.per_section.investment_thesis).toBe(100);
  });

  it('coverage_pct = supported / total × 100 (2-decimal)', () => {
    const claims = [
      mkClaim('a a a a', 0),
      mkClaim('b b b b', 100),
      mkClaim('c c c c', 200),
    ];
    const anchors = [mkAnchor(0, 'https://x.com/no-match', '')];
    const r = citationCoverage(claims, anchors);
    expect(r.totals.total_claims).toBe(3);
    // Only the first claim hits Rule A; coverage = 33.33%.
    expect(r.coverage_pct).toBeCloseTo(33.33, 2);
  });

  it('kappa_method_disagreements counts single-method claims', () => {
    const c1 = { ...mkClaim('a b c', 0), source_method: 'regex' as const };
    const c2 = { ...mkClaim('d e f', 100), source_method: 'llm' as const };
    const c3 = { ...mkClaim('g h i', 200), source_method: 'merged' as const };
    const r = citationCoverage([c1, c2, c3], []);
    expect(r.totals.kappa_method_disagreements).toBe(2);
  });
});

describe('extractCitationAnchors', () => {
  it('locates url substring', () => {
    const rendered = 'see https://example.com/news for details';
    const anchors = extractCitationAnchors(
      rendered,
      [{ source: 'news', url: 'https://example.com/news', sentiment: 'neutral' } as never],
      'investment_thesis',
    );
    expect(anchors[0].anchor_pos).toBe(4);
  });

  it('falls back to bare domain when full URL is not present', () => {
    const rendered = 'visit example.com for more';
    const anchors = extractCitationAnchors(
      rendered,
      [{ source: 'news', url: 'https://example.com/news', sentiment: 'neutral' } as never],
      'investment_thesis',
    );
    expect(anchors[0].anchor_pos).toBe(6);
  });

  it('emits anchor_pos = -1 when neither url nor domain located', () => {
    const anchors = extractCitationAnchors(
      'unrelated body text',
      [{ source: 'news', url: 'https://nonmatching.example/path', sentiment: 'neutral' } as never],
      'investment_thesis',
    );
    expect(anchors[0].anchor_pos).toBe(-1);
  });
});
