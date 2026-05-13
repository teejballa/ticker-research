// tests/integration/per-aspect-aggregate.integration.test.ts
// Plan 20-B-05 — integration test for the per-aspect aggregator end-to-end:
// PerDocResult[] → aggregateByAspect → PerAspectResult[] → contract assertions.
//
// Skipped when DATABASE_URL is absent — this suite belongs to the
// `npm run test:integration` profile (vitest.integration.config.ts) and the
// unit suite (`npm test`) runs without a live DB. The aggregator itself is
// pure-functions and has no DB dep, but the integration profile is the right
// home for end-to-end contract validation of the 20-B-01 → 20-B-05 wire.

import { describe, it, expect } from 'vitest';
import {
  aggregateByAspect,
  ASPECT_TAXONOMY,
  N_DOCS_MIN,
  BETA_ALPHA,
  BETA_BETA,
  type PerDocResult,
} from '@/lib/sentiment/per-aspect-aggregate';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d('per-aspect-aggregate integration — contract end-to-end', () => {
  it('returns one entry per ASPECT_TAXONOMY in fixed order, even on empty input', () => {
    const out = aggregateByAspect([]);
    expect(out.length).toBe(ASPECT_TAXONOMY.length);
    expect(out.map((e) => e.aspect)).toEqual([...ASPECT_TAXONOMY]);
    for (const e of out) {
      expect(e.bull_pct).toBeNull();
      expect(e.n_docs).toBe(0);
      expect(e.confidence_mean).toBe(0);
    }
  });

  it('insufficient-signal sentinel: n_docs < N_DOCS_MIN ⇒ bull_pct === null', () => {
    const docs: PerDocResult[] = [
      { doc_id: 'd1', polarity: +1, confidence: 0.9, aspects: ['earnings'] },
      { doc_id: 'd2', polarity: +1, confidence: 0.9, aspects: ['earnings'] },
    ]; // 2 < N_DOCS_MIN(3)
    const out = aggregateByAspect(docs);
    const earnings = out.find((e) => e.aspect === 'earnings')!;
    expect(earnings.n_docs).toBe(2);
    expect(earnings.bull_pct).toBeNull();
    expect(N_DOCS_MIN).toBe(3); // pin the constant
  });

  it('inter-aspect overlap: a multi-aspect doc contributes to BOTH aspects (T-20-B-05-02)', () => {
    const docs: PerDocResult[] = [
      { doc_id: 'd1', polarity: +0.8, confidence: 0.9, aspects: ['earnings', 'guidance'] },
      { doc_id: 'd2', polarity: +0.8, confidence: 0.9, aspects: ['earnings', 'guidance'] },
      { doc_id: 'd3', polarity: +0.8, confidence: 0.9, aspects: ['earnings', 'guidance'] },
    ];
    const out = aggregateByAspect(docs);
    const earnings = out.find((e) => e.aspect === 'earnings')!;
    const guidance = out.find((e) => e.aspect === 'guidance')!;
    expect(earnings.n_docs).toBe(3);
    expect(guidance.n_docs).toBe(3);
    expect(earnings.bull_pct).toBeGreaterThan(50);
    expect(guidance.bull_pct).toBeGreaterThan(50);
    // Same contribution → same bull_pct.
    expect(earnings.bull_pct).toBeCloseTo(guidance.bull_pct!, 6);
  });

  it('all-neutral input → bull_pct = α/(α+β) = 50% (Beta prior dominates)', () => {
    const docs: PerDocResult[] = Array.from({ length: 5 }).map((_, i): PerDocResult => ({
      doc_id: `d${i}`,
      polarity: 0,
      confidence: 0.9,
      aspects: ['macro'],
    }));
    const out = aggregateByAspect(docs);
    const macro = out.find((e) => e.aspect === 'macro')!;
    // Prior-only expectation: posterior = α/(α+β) = 5/10 = 0.5 → 50%.
    const expectedPriorPct = (BETA_ALPHA / (BETA_ALPHA + BETA_BETA)) * 100;
    expect(macro.bull_pct).toBeCloseTo(expectedPriorPct, 6);
    expect(expectedPriorPct).toBe(50);
  });

  it('confidence_mean averages contributing-doc confidences (NOT global)', () => {
    const docs: PerDocResult[] = [
      { doc_id: 'd1', polarity: +0.5, confidence: 0.4, aspects: ['product'] },
      { doc_id: 'd2', polarity: +0.5, confidence: 0.6, aspects: ['product'] },
      { doc_id: 'd3', polarity: +0.5, confidence: 0.8, aspects: ['product'] },
      // 'macro' below should NOT pull product's confidence_mean.
      { doc_id: 'd4', polarity: -0.5, confidence: 1.0, aspects: ['macro'] },
    ];
    const out = aggregateByAspect(docs);
    const product = out.find((e) => e.aspect === 'product')!;
    expect(product.n_docs).toBe(3);
    expect(product.confidence_mean).toBeCloseTo((0.4 + 0.6 + 0.8) / 3, 6);
  });

  it('clamps bull_pct to [0, 100] under adversarial weight ratios', () => {
    const docs: PerDocResult[] = Array.from({ length: 100 }).map((_, i): PerDocResult => ({
      doc_id: `d${i}`,
      polarity: +1,
      confidence: 1,
      aspects: ['regulatory'],
    }));
    const out = aggregateByAspect(docs);
    const reg = out.find((e) => e.aspect === 'regulatory')!;
    expect(reg.bull_pct).toBeGreaterThanOrEqual(0);
    expect(reg.bull_pct).toBeLessThanOrEqual(100);
  });
});
