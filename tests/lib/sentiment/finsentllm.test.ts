// tests/lib/sentiment/finsentllm.test.ts
import { describe, it, expect, vi } from 'vitest';
import { classifyFinGPT, classifyMistralFin, classifyFinBERT, type SentimentScore } from '../../../src/lib/sentiment/finsentllm';

vi.mock('@huggingface/inference', () => ({
  HfInference: vi.fn(() => ({
    textClassification: vi.fn(async ({ inputs }) => [
      { label: 'positive', score: 0.85 },
      { label: 'negative', score: 0.10 },
      { label: 'neutral', score: 0.05 },
    ]),
  })),
}));

describe('finsentllm clients', () => {
  it('classifyFinGPT returns score in [-1,1] with confidence in [0,1]', async () => {
    const r = await classifyFinGPT('AAPL beats earnings, revenue up 12%');
    expect(r.score).toBeGreaterThanOrEqual(-1);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(r.model).toBe('fingpt-v3');
  });

  it('classifyMistralFin returns same shape', async () => {
    const r = await classifyMistralFin('AAPL down 3%, analysts cautious');
    expect(r).toHaveProperty('score');
    expect(r).toHaveProperty('confidence');
    expect(r.model).toBe('mistral-fin-7b');
  });

  it('classifyFinBERT returns same shape', async () => {
    const r = await classifyFinBERT('AAPL stable, no major moves');
    expect(r).toHaveProperty('score');
    expect(r.model).toBe('finbert');
  });

  it('returns null sentinel on API error (does not throw)', async () => {
    vi.doMock('@huggingface/inference', () => ({
      HfInference: vi.fn(() => ({
        textClassification: vi.fn(async () => { throw new Error('rate limited'); }),
      })),
    }));
    const mod = await import('../../../src/lib/sentiment/finsentllm');
    const r = await mod.classifyFinGPT('test');
    expect(r).toEqual({ score: null, confidence: null, model: 'fingpt-v3', error: 'rate limited' });
  });
});
