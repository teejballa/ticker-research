// Plan 20-B-05 — per-aspect-aggregate unit tests.
//
// Locks the Beta-smoothing constants, the fixed taxonomy, the inter-aspect
// overlap contract (T-20-B-05-02), and the insufficient-signal null sentinel
// (T-20-B-05-03 — UI renders '—' not '0%').

import { describe, it, expect } from 'vitest';
import {
  aggregateByAspect,
  betaSmoothedBullPct,
  ASPECT_TAXONOMY,
  N_DOCS_MIN,
  BETA_ALPHA,
  BETA_BETA,
  type PerDocResult,
} from '@/lib/sentiment/per-aspect-aggregate';

describe('20-B-05 — constants', () => {
  it('N_DOCS_MIN === 3 && BETA_ALPHA === 5 && BETA_BETA === 5', () => {
    expect(N_DOCS_MIN).toBe(3);
    expect(BETA_ALPHA).toBe(5);
    expect(BETA_BETA).toBe(5);
  });

  it('ASPECT_TAXONOMY locked to the 7-element 20-B-01 taxonomy', () => {
    expect([...ASPECT_TAXONOMY]).toEqual([
      'earnings', 'guidance', 'regulatory', 'M&A', 'macro', 'product', 'management',
    ]);
  });
});

describe('20-B-05 — betaSmoothedBullPct', () => {
  it('empty input returns null (empty sentinel)', () => {
    expect(betaSmoothedBullPct([])).toBeNull();
  });

  it('10 unit-weight bull docs → ≈ 75% (Beta(5,5) posterior with 10 bull observations)', () => {
    // (α + 10) / (α + β + 10 + 0) = 15/20 = 0.75 → 75%
    const scores = Array(10).fill(0).map(() => ({ polarity: 1, weight: 1 }));
    const out = betaSmoothedBullPct(scores);
    expect(out).not.toBeNull();
    expect(out!).toBeCloseTo(75, 0);
  });

  it('100 unit-weight bull docs → ≥ 90 (asymptotic bull)', () => {
    const scores = Array(100).fill(0).map(() => ({ polarity: 1, weight: 1 }));
    const out = betaSmoothedBullPct(scores);
    expect(out).not.toBeNull();
    expect(out!).toBeGreaterThanOrEqual(90);
  });

  it('100 unit-weight bear docs → ≤ 10 (asymptotic bear, mirror of bull)', () => {
    const scores = Array(100).fill(0).map(() => ({ polarity: -1, weight: 1 }));
    const out = betaSmoothedBullPct(scores);
    expect(out).not.toBeNull();
    expect(out!).toBeLessThanOrEqual(10);
  });

  it('balanced 5 bull / 5 bear → ≈ 50% (symmetric)', () => {
    const scores = [
      ...Array(5).fill(0).map(() => ({ polarity: 1, weight: 1 })),
      ...Array(5).fill(0).map(() => ({ polarity: -1, weight: 1 })),
    ];
    const out = betaSmoothedBullPct(scores);
    expect(out).not.toBeNull();
    expect(out!).toBeCloseTo(50, 0);
  });

  it('single neutral doc → 50% (neither bull nor bear contribution)', () => {
    expect(betaSmoothedBullPct([{ polarity: 0, weight: 1 }])).toBeCloseTo(50, 5);
  });
});

describe('20-B-05 — aggregateByAspect', () => {
  it('empty input → 7 entries, all bull_pct: null, n_docs: 0, taxonomy completeness', () => {
    const out = aggregateByAspect([]);
    expect(out).toHaveLength(ASPECT_TAXONOMY.length);
    for (const entry of out) {
      expect(entry.bull_pct).toBeNull();
      expect(entry.n_docs).toBe(0);
      expect(entry.confidence_mean).toBe(0);
    }
  });

  it('returns entries in fixed ASPECT_TAXONOMY order', () => {
    const out = aggregateByAspect([]);
    expect(out.map(e => e.aspect)).toEqual([...ASPECT_TAXONOMY]);
  });

  it("doc with two aspects contributes to both", () => {
    // T-20-B-05-02 mitigation — inter-aspect overlap is INTENTIONAL.
    const docs: PerDocResult[] = [
      { doc_id: 'd1', polarity: 1, confidence: 0.9, aspects: ['earnings', 'guidance'] },
    ];
    const out = aggregateByAspect(docs);
    const earnings = out.find(e => e.aspect === 'earnings')!;
    const guidance = out.find(e => e.aspect === 'guidance')!;
    const regulatory = out.find(e => e.aspect === 'regulatory')!;

    // Overlap: BOTH aspects record n_docs=1.
    expect(earnings.n_docs).toBe(1);
    expect(guidance.n_docs).toBe(1);
    // n=1 < N_DOCS_MIN=3 → insufficient-signal sentinel.
    expect(earnings.bull_pct).toBeNull();
    expect(guidance.bull_pct).toBeNull();
    // Other aspects untouched.
    expect(regulatory.n_docs).toBe(0);
    // Confidence mean propagated.
    expect(earnings.confidence_mean).toBeCloseTo(0.9);
    expect(guidance.confidence_mean).toBeCloseTo(0.9);
  });

  it('5 earnings-only bull docs (confidence=1) → earnings bull_pct ≈ 66.67% (Beta(5,5) posterior), guidance null', () => {
    // (α + 5) / (α + β + 5 + 0) = 10/15 = 0.6667 → 66.67%
    const docs: PerDocResult[] = Array(5).fill(0).map((_, i): PerDocResult => ({
      doc_id: `d${i}`, polarity: 1, confidence: 1, aspects: ['earnings'],
    }));
    const out = aggregateByAspect(docs);
    const earnings = out.find(e => e.aspect === 'earnings')!;
    const guidance = out.find(e => e.aspect === 'guidance')!;

    expect(earnings.n_docs).toBe(5);
    expect(earnings.bull_pct).not.toBeNull();
    expect(earnings.bull_pct!).toBeGreaterThanOrEqual(60);
    expect(earnings.bull_pct!).toBeLessThanOrEqual(75);
    expect(guidance.n_docs).toBe(0);
    expect(guidance.bull_pct).toBeNull();
  });

  it('null sentinel when n_docs < N_DOCS_MIN even with high confidence', () => {
    const docs: PerDocResult[] = [
      { doc_id: 'd1', polarity: 1, confidence: 0.99, aspects: ['regulatory'] },
      { doc_id: 'd2', polarity: 1, confidence: 0.99, aspects: ['regulatory'] },
    ];
    const out = aggregateByAspect(docs);
    const regulatory = out.find(e => e.aspect === 'regulatory')!;
    expect(regulatory.n_docs).toBe(2);
    expect(regulatory.bull_pct).toBeNull(); // 2 < N_DOCS_MIN=3 → sentinel
  });

  it('handles non-array aspects + non-finite confidence gracefully', () => {
    // Defensive — bad input should not crash; doc just gets dropped per-aspect.
    const bad = [
      { doc_id: 'b1', polarity: 1, confidence: NaN, aspects: ['earnings'] as never },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { doc_id: 'b2', polarity: 1, confidence: 0.5, aspects: null as any },
    ] as PerDocResult[];
    const out = aggregateByAspect(bad);
    const earnings = out.find(e => e.aspect === 'earnings')!;
    // b1 contributes (aspects array OK), b2 dropped (aspects not an array).
    expect(earnings.n_docs).toBe(1);
    expect(earnings.bull_pct).toBeNull(); // still < N_DOCS_MIN
  });
});
