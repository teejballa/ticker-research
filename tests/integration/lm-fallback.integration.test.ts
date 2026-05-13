// tests/integration/lm-fallback.integration.test.ts
//
// Plan 20-B-06 Task 6 — forced-failure integration test.
//
// Forces both upstream NLP paths to fail (FinBERT HF endpoint mocked null;
// @xenova local mocked to throw) and asserts:
//   1. classifyMessages returns L&M-tagged results (confidence=0.4,
//      classifier_version='loughran-mcdonald-2011', finite score)
//   2. ProviderCallLog row written with provider_id='lm-fallback',
//      status='ok', cost_usd=0
//
// Requires DATABASE_URL (live Neon). Skipped via top-level conditional when
// not present so CI without DB credentials does not flake.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Mock the upstream classifiers BEFORE importing per-message-pass.
vi.mock('../../src/lib/sentiment/finsentllm', () => ({
  classifyFinBERT: vi.fn().mockResolvedValue({
    score: null,
    confidence: null,
    model: 'finbert',
    error: 'mocked HF outage',
  }),
  FINBERT_PINNED_SHA8: '4556d130',
}));

// pipeline-providers may export classifyXenovaLocal in the future; mock it to throw
// so tryXenovaLocal returns null and the chain falls through to L&M.
vi.mock('../../src/lib/sentiment/pipeline-providers', () => ({
  classifyXenovaLocal: vi.fn().mockRejectedValue(new Error('mocked @xenova OOM')),
}));

// local-finbert-fallback is the dynamic-import target inside per-message-pass.
// Mock it to throw so tryXenovaLocal (which awaits import + call) propagates the
// failure → upstream considered null → chain falls through to L&M.
vi.mock('../../src/lib/sentiment/local-finbert-fallback', () => ({
  classifyFinBERTLocal: vi.fn().mockRejectedValue(new Error('mocked @xenova OOM')),
}));

const RUN = !!process.env.DATABASE_URL;

describe.skipIf(!RUN)(
  '20-B-06 integration — L&M fallback fires when upstream paths fail',
  () => {
    let beforeCount = 0;
    let prisma: typeof import('../../src/lib/db').prisma;
    let classifyMessages: typeof import('../../src/lib/sentiment/per-message-pass').classifyMessages;

    beforeAll(async () => {
      // Late-import so the vi.mock declarations above apply to the import graph.
      prisma = (await import('../../src/lib/db')).prisma;
      classifyMessages = (await import('../../src/lib/sentiment/per-message-pass'))
        .classifyMessages;
      beforeCount = await prisma.providerCallLog.count({
        where: { provider_id: 'lm-fallback' },
      });
    });

    it('returns L&M results when FinBERT mock-nulls AND @xenova mock-throws', async () => {
      const results = await classifyMessages([
        { id: 'msg-test-20-B-06-pos', text: 'strong improvement in profitable gains' },
        { id: 'msg-test-20-B-06-neg', text: 'weak losses hurt decline' },
      ]);

      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r.nlp_path).toBe('l&m-fallback');
        expect(r.confidence).toBe(0.4);
        expect(r.classifier_version).toBe('loughran-mcdonald-2011');
        expect(r.score).not.toBeNull();
        expect(Number.isFinite(r.score as number)).toBe(true);
      }

      // Positive sentence should score > 0, negative < 0.
      expect(results[0].score as number).toBeGreaterThan(0);
      expect(results[1].score as number).toBeLessThan(0);
    });

    it('writes ProviderCallLog rows with provider_id="lm-fallback"', async () => {
      // withTelemetry fires recordCallAsync fire-and-forget — wait a tick.
      await new Promise((r) => setTimeout(r, 300));

      const after = await prisma.providerCallLog.count({
        where: { provider_id: 'lm-fallback' },
      });
      expect(after).toBeGreaterThan(beforeCount);

      const recent = await prisma.providerCallLog.findFirst({
        where: { provider_id: 'lm-fallback' },
        orderBy: { started_at: 'desc' },
      });
      expect(recent).not.toBeNull();
      expect(recent?.status).toBe('ok');
      expect(recent?.cost_usd).toBe(0);
    });

    afterAll(async () => {
      // Cleanup: delete rows we inserted in this test run (last 60s window).
      await prisma.providerCallLog.deleteMany({
        where: {
          provider_id: 'lm-fallback',
          started_at: { gt: new Date(Date.now() - 60_000) },
        },
      });
    });
  },
);
