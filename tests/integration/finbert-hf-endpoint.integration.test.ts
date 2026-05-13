// tests/integration/finbert-hf-endpoint.integration.test.ts
//
// Plan 20-B-02 Task 8 — gated live integration test against the operator-
// provisioned ProsusAI/finbert HF Inference Endpoint.
//
// Runs ONLY when `RUN_LIVE_FINBERT=true` (and `HF_FINBERT_ENDPOINT` +
// `HF_INFERENCE_TOKEN` are set). Default `npm run test:integration` skips this
// suite, so CI cost stays at zero unless the operator explicitly opts in:
//
//     RUN_LIVE_FINBERT=true npm run test:integration -- finbert-hf-endpoint
//
// Coverage:
//   - 5 sample messages classified within 10s wall-clock total (p95 ≤ 2s
//     amortized; cold-start excluded by the 10s ceiling)
//   - Directional sanity: earnings beat → score > 0; recall → score < 0
//   - All results return non-null score in [-1, +1] and confidence in [0, 1]

import { describe, it, expect } from 'vitest';
import { classifyFinBERT } from '@/lib/sentiment/finsentllm';

const RUN =
  process.env.RUN_LIVE_FINBERT === 'true' &&
  !!process.env.HF_FINBERT_ENDPOINT &&
  !!process.env.HF_INFERENCE_TOKEN;

describe.skipIf(!RUN)('FinBERT HF endpoint — live integration', () => {
  const samples = [
    'AAPL crushed earnings, revenue up 18% YoY',
    'TSLA recall affects 1.2M vehicles; brake software defect',
    'NVDA announces new GPU; benchmarks pending',
    'Fed holds rates steady at 5.25%',
    'GME up 50% on no news; volume spike on options expiry',
  ];

  it('classifies 5 messages within 10s wall-clock total', async () => {
    const start = Date.now();
    const results = await Promise.all(samples.map((s) => classifyFinBERT(s)));
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(10_000);
    for (const r of results) {
      expect(r.model).toBe('finbert');
      expect(r.score).not.toBeNull();
      expect(r.confidence).not.toBeNull();
      expect(r.score!).toBeGreaterThanOrEqual(-1);
      expect(r.score!).toBeLessThanOrEqual(1);
      expect(r.confidence!).toBeGreaterThanOrEqual(0);
      expect(r.confidence!).toBeLessThanOrEqual(1);
    }
  });

  it('directional sanity: positive earnings beat scores > 0; recall scores < 0', async () => {
    const [pos, neg] = await Promise.all([
      classifyFinBERT(samples[0]), // beat
      classifyFinBERT(samples[1]), // recall
    ]);
    expect(pos.score).not.toBeNull();
    expect(neg.score).not.toBeNull();
    expect(pos.score!).toBeGreaterThan(0);
    expect(neg.score!).toBeLessThan(0);
  });
});
