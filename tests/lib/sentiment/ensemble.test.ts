// tests/lib/sentiment/ensemble.test.ts
//
// Phase 19 / Plan 19-C-02 — ensembleSentiment unit tests.
//
// Pin exact mathematical formulas (per threat T-19-C-02-02 mitigation):
//   score        = Σ(score_i × conf_i) / Σ(conf_i) over non-null per_model
//   confidence   = mean(conf_i) over non-null per_model
//   agreement    = 1 - std(score_i) over non-null per_model; null when n<2
//   per_model    = always 3 entries (FinGPT, Mistral-Fin, FinBERT) even on error
//
// All 3 underlying clients are mocked at module boundary (vi.mock) so this
// suite is hermetic — no HF tokens or endpoints required.
//
// vi.hoisted() is the canonical pattern for sharing per-test mock impls with
// the hoisted vi.mock factory; vi.mock() is hoisted above ESM imports, so a
// plain top-level `let` would be `undefined` at factory eval time.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  fingpt: vi.fn(),
  mistral: vi.fn(),
  finbert: vi.fn(),
}));

vi.mock('@/lib/sentiment/finsentllm', () => ({
  classifyFinGPT: (text: string) => mocks.fingpt(text),
  classifyMistralFin: (text: string) => mocks.mistral(text),
  classifyFinBERT: (text: string) => mocks.finbert(text),
}));

import { ensembleSentiment } from '@/lib/sentiment/ensemble';

beforeEach(() => {
  mocks.fingpt.mockReset();
  mocks.mistral.mockReset();
  mocks.finbert.mockReset();
});

describe('ensembleSentiment', () => {
  it('all 3 models return scores → weighted average computed correctly', async () => {
    // Pinned formula: weighted_avg = Σ(score_i × conf_i) / Σ(conf_i)
    // scores=[0.5, 0.3, 0.7], conf=[0.8, 0.9, 0.7]
    // weighted_sum = 0.5*0.8 + 0.3*0.9 + 0.7*0.7 = 0.40 + 0.27 + 0.49 = 1.16
    // total_weight = 0.8 + 0.9 + 0.7 = 2.4
    // expected score = 1.16 / 2.4 = 0.48333...
    mocks.fingpt.mockResolvedValue({ score: 0.5, confidence: 0.8, model: 'fingpt-v3' });
    mocks.mistral.mockResolvedValue({ score: 0.3, confidence: 0.9, model: 'mistral-fin-7b' });
    mocks.finbert.mockResolvedValue({ score: 0.7, confidence: 0.7, model: 'finbert' });

    const r = await ensembleSentiment('AAPL beats earnings');
    expect(r.score).not.toBeNull();
    expect(r.score!).toBeCloseTo(1.16 / 2.4, 10);
  });

  it('2 of 3 null → falls back to non-null weighted average', async () => {
    mocks.fingpt.mockResolvedValue({ score: 0.5, confidence: 0.8, model: 'fingpt-v3' });
    mocks.mistral.mockResolvedValue({ score: null, confidence: null, model: 'mistral-fin-7b', error: 'rate limited' });
    mocks.finbert.mockResolvedValue({ score: null, confidence: null, model: 'finbert', error: 'cold start' });

    const r = await ensembleSentiment('text');
    // single contributor → score == its score (weighted avg of one)
    expect(r.score!).toBeCloseTo(0.5, 10);
    expect(r.confidence!).toBeCloseTo(0.8, 10);
  });

  it('all null → returns null score, null confidence, null agreement', async () => {
    mocks.fingpt.mockResolvedValue({ score: null, confidence: null, model: 'fingpt-v3', error: 'x' });
    mocks.mistral.mockResolvedValue({ score: null, confidence: null, model: 'mistral-fin-7b', error: 'x' });
    mocks.finbert.mockResolvedValue({ score: null, confidence: null, model: 'finbert', error: 'x' });

    const r = await ensembleSentiment('text');
    expect(r.score).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.model_agreement).toBeNull();
    expect(r.per_model).toHaveLength(3);
  });

  it('model_agreement = 1 - std(non-null scores) — pinned formula', async () => {
    // scores = [0.5, 0.3, 0.7]
    // mean = (0.5 + 0.3 + 0.7) / 3 = 0.5
    // variance = ((0.5-0.5)^2 + (0.3-0.5)^2 + (0.7-0.5)^2) / 3
    //          = (0 + 0.04 + 0.04) / 3 = 0.026666...
    // std = sqrt(0.026666...) ≈ 0.163299
    // agreement = 1 - 0.163299 ≈ 0.836700
    mocks.fingpt.mockResolvedValue({ score: 0.5, confidence: 0.8, model: 'fingpt-v3' });
    mocks.mistral.mockResolvedValue({ score: 0.3, confidence: 0.9, model: 'mistral-fin-7b' });
    mocks.finbert.mockResolvedValue({ score: 0.7, confidence: 0.7, model: 'finbert' });

    const r = await ensembleSentiment('text');
    const expectedStd = Math.sqrt((0 + 0.04 + 0.04) / 3);
    expect(r.model_agreement!).toBeCloseTo(1 - expectedStd, 10);
  });

  it('model_agreement = null when only 1 model returned', async () => {
    mocks.fingpt.mockResolvedValue({ score: 0.5, confidence: 0.8, model: 'fingpt-v3' });
    mocks.mistral.mockResolvedValue({ score: null, confidence: null, model: 'mistral-fin-7b', error: 'x' });
    mocks.finbert.mockResolvedValue({ score: null, confidence: null, model: 'finbert', error: 'x' });

    const r = await ensembleSentiment('text');
    expect(r.model_agreement).toBeNull();
  });

  it('per_model array always has 3 entries (even with errors)', async () => {
    mocks.fingpt.mockRejectedValue(new Error('totally borked'));
    mocks.mistral.mockResolvedValue({ score: 0.2, confidence: 0.7, model: 'mistral-fin-7b' });
    mocks.finbert.mockResolvedValue({ score: null, confidence: null, model: 'finbert', error: 'cold' });

    const r = await ensembleSentiment('text');
    expect(r.per_model).toHaveLength(3);
    // Each entry must carry its own model tag for telemetry
    const models = r.per_model.map(s => s.model).sort();
    expect(models).toEqual(['finbert', 'fingpt-v3', 'mistral-fin-7b']);
  });

  it('Promise.allSettled used (not Promise.all) — one rejection does not crash ensemble', async () => {
    mocks.fingpt.mockRejectedValue(new Error('rejected outright'));
    mocks.mistral.mockResolvedValue({ score: 0.4, confidence: 0.6, model: 'mistral-fin-7b' });
    mocks.finbert.mockResolvedValue({ score: 0.6, confidence: 0.8, model: 'finbert' });

    // Must not throw
    const r = await ensembleSentiment('text');
    // With FinGPT rejected, only Mistral + FinBERT contribute:
    // weighted_sum = 0.4*0.6 + 0.6*0.8 = 0.24 + 0.48 = 0.72
    // total_weight = 0.6 + 0.8 = 1.4
    // expected score = 0.72 / 1.4 = 0.514285...
    expect(r.score!).toBeCloseTo(0.72 / 1.4, 10);
    // FinGPT entry must still be present in per_model with rejected sentinel
    const fingpt = r.per_model.find(s => s.model === 'fingpt-v3');
    expect(fingpt).toBeDefined();
    expect(fingpt!.score).toBeNull();
  });

  it('confidence = mean of contributing confidences', async () => {
    // confs = [0.8, 0.9, 0.7] → mean = 2.4 / 3 = 0.8
    mocks.fingpt.mockResolvedValue({ score: 0.5, confidence: 0.8, model: 'fingpt-v3' });
    mocks.mistral.mockResolvedValue({ score: 0.3, confidence: 0.9, model: 'mistral-fin-7b' });
    mocks.finbert.mockResolvedValue({ score: 0.7, confidence: 0.7, model: 'finbert' });

    const r = await ensembleSentiment('text');
    expect(r.confidence!).toBeCloseTo((0.8 + 0.9 + 0.7) / 3, 10);
  });
});
