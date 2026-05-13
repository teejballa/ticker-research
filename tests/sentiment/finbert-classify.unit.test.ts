// tests/sentiment/finbert-classify.unit.test.ts
//
// Plan 20-B-02 — classifyFinBERT unit suite. Mocks @huggingface/inference and
// @/lib/telemetry/withTelemetry. Asserts:
//   (1) reduceLabels reduction (pos − neg) for pos/neutral/neg cases
//   (2) Missing env returns null sentinel (no throw — D-33 contract)
//   (3) withTelemetry invoked exactly once with provider_id='finbert-hf' and
//       cost_usd_estimator that returns 0.0001
//   (4) SDK throws → null sentinel with sanitized error; endpoint URL never
//       appears in error message (T-19-C-01-01).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────

const textClassificationMock = vi.fn();

vi.mock('@huggingface/inference', () => ({
  HfInference: vi.fn().mockImplementation(() => ({
    textClassification: textClassificationMock,
  })),
}));

const withTelemetrySpy = vi.fn(
  async <T,>(
    _provider: string,
    fn: () => Promise<T>,
    _opts?: { cost_usd_estimator?: (r: T) => number },
  ): Promise<T> => fn(),
);

vi.mock('@/lib/telemetry/withTelemetry', () => ({
  withTelemetry: (provider: string, fn: () => Promise<unknown>, opts: unknown) =>
    withTelemetrySpy(provider, fn, opts as { cost_usd_estimator?: (r: unknown) => number }),
}));

// Now import the SUT (after mocks are wired)
import { classifyFinBERT, FINBERT_PINNED_SHA8 } from '@/lib/sentiment/finsentllm';

beforeEach(() => {
  textClassificationMock.mockReset();
  withTelemetrySpy.mockClear();
  process.env.HF_INFERENCE_TOKEN = 'hf_test_token';
  process.env.HF_FINBERT_ENDPOINT = 'https://example.us-east-1.aws.endpoints.huggingface.cloud/4556d13015211d73dccd3fdd39d39232506f3e43';
});

describe('FINBERT_PINNED_SHA8', () => {
  it('is the 8-hex prefix of the verified ProsusAI/finbert main SHA (2026-05-13)', () => {
    expect(FINBERT_PINNED_SHA8).toBe('4556d130');
    expect(FINBERT_PINNED_SHA8).toMatch(/^[a-f0-9]{8}$/);
  });
});

describe('classifyFinBERT — label reduction', () => {
  it('positive-dominant → score = pos − neg, confidence = max', async () => {
    textClassificationMock.mockResolvedValueOnce([
      { label: 'positive', score: 0.92 },
      { label: 'neutral', score: 0.05 },
      { label: 'negative', score: 0.03 },
    ]);
    const r = await classifyFinBERT('AAPL crushed earnings');
    expect(r.model).toBe('finbert');
    expect(r.score).toBeCloseTo(0.89, 5);
    expect(r.confidence).toBeCloseTo(0.92, 5);
    expect(r.error).toBeUndefined();
  });

  it('all-neutral → score = 0, confidence = max', async () => {
    textClassificationMock.mockResolvedValueOnce([
      { label: 'neutral', score: 0.95 },
      { label: 'positive', score: 0.03 },
      { label: 'negative', score: 0.02 },
    ]);
    const r = await classifyFinBERT('Fed holds rates steady');
    expect(r.score).toBeCloseTo(0.01, 5); // 0.03 − 0.02
    expect(r.confidence).toBeCloseTo(0.95, 5);
  });

  it('negative-dominant → score < 0', async () => {
    textClassificationMock.mockResolvedValueOnce([
      { label: 'negative', score: 0.88 },
      { label: 'neutral', score: 0.10 },
      { label: 'positive', score: 0.02 },
    ]);
    const r = await classifyFinBERT('recall impacts 1.2M units');
    expect(r.score).toBeCloseTo(-0.86, 5);
    expect(r.confidence).toBeCloseTo(0.88, 5);
  });
});

describe('classifyFinBERT — null sentinel contract', () => {
  it('missing HF_FINBERT_ENDPOINT → null sentinel (no throw)', async () => {
    delete process.env.HF_FINBERT_ENDPOINT;
    const r = await classifyFinBERT('hello');
    expect(r.score).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.model).toBe('finbert');
    expect(r.error).toMatch(/HF_FINBERT_ENDPOINT/);
  });

  it('HF SDK throws → null sentinel; endpoint URL never appears in error', async () => {
    const endpoint = process.env.HF_FINBERT_ENDPOINT!;
    textClassificationMock.mockRejectedValueOnce(new Error('upstream 503'));
    const r = await classifyFinBERT('hello');
    expect(r.score).toBeNull();
    expect(r.error).toBe('upstream 503');
    expect(r.error).not.toContain(endpoint);
  });
});

describe('classifyFinBERT — telemetry wrapping (S6)', () => {
  it('invokes withTelemetry exactly once with provider_id=finbert-hf', async () => {
    textClassificationMock.mockResolvedValueOnce([{ label: 'positive', score: 0.5 }]);
    await classifyFinBERT('hello');
    expect(withTelemetrySpy).toHaveBeenCalledTimes(1);
    expect(withTelemetrySpy.mock.calls[0][0]).toBe('finbert-hf');
  });

  it('cost_usd_estimator returns 0.0001 USD/call regardless of input', async () => {
    textClassificationMock.mockResolvedValueOnce([{ label: 'positive', score: 0.5 }]);
    await classifyFinBERT('hello');
    const opts = withTelemetrySpy.mock.calls[0][2] as { cost_usd_estimator?: (r: unknown) => number };
    expect(opts).toBeDefined();
    expect(opts.cost_usd_estimator).toBeDefined();
    expect(opts.cost_usd_estimator!({ ignored: 'value' })).toBeCloseTo(0.0001, 10);
    expect(opts.cost_usd_estimator!(null)).toBeCloseTo(0.0001, 10);
  });
});
