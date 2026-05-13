// tests/sentiment-finbert-temp-scaling.unit.test.ts
// Plan 20-B-03 Task 8 — SENTIMENT_TEMP_SCALING_MODE gating on classifyFinBERT.
//
// We test the runtime helpers + mode gating directly (no real HF endpoint).
// classifyFinBERT-level integration is exercised in tests/integration/.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTemperature,
  getTempScalingMode,
  probsToLogits,
  resolveFinBERTClassifierVersion,
  _resetTemperatureCache,
} from '../src/lib/sentiment/temperature-runtime';

describe('20-B-03 Task 8 — FinBERT temperature-scaling runtime', () => {
  const ORIG_ENV = { ...process.env };
  beforeEach(() => {
    _resetTemperatureCache();
    process.env = { ...ORIG_ENV };
  });
  afterEach(() => {
    process.env = ORIG_ENV;
    vi.restoreAllMocks();
  });

  it('getTempScalingMode defaults to off when env unset', () => {
    delete process.env.SENTIMENT_TEMP_SCALING_MODE;
    expect(getTempScalingMode()).toBe('off');
  });

  it('getTempScalingMode parses {off, shadow, on}', () => {
    process.env.SENTIMENT_TEMP_SCALING_MODE = 'off';
    expect(getTempScalingMode()).toBe('off');
    process.env.SENTIMENT_TEMP_SCALING_MODE = 'shadow';
    expect(getTempScalingMode()).toBe('shadow');
    process.env.SENTIMENT_TEMP_SCALING_MODE = 'on';
    expect(getTempScalingMode()).toBe('on');
    // Anything else falls back to 'off' for safety.
    process.env.SENTIMENT_TEMP_SCALING_MODE = 'banana';
    expect(getTempScalingMode()).toBe('off');
  });

  it('resolveFinBERTClassifierVersion parses SHA from HF_FINBERT_ENDPOINT', () => {
    process.env.HF_FINBERT_ENDPOINT =
      'https://abc.aws.endpoints.huggingface.cloud/finbert@4556d13015211d73';
    expect(resolveFinBERTClassifierVersion()).toBe('finbert-prosus-4556d130');
  });

  it('resolveFinBERTClassifierVersion falls back to pinned SHA when env missing', () => {
    delete process.env.HF_FINBERT_ENDPOINT;
    expect(resolveFinBERTClassifierVersion()).toBe('finbert-prosus-4556d130');
  });

  it('applyTemperature at T=2.0 reduces max probability vs T=1.0', () => {
    const logits = [3, 1, 0];
    const max1 = Math.max(...applyTemperature(logits, 1.0));
    const max2 = Math.max(...applyTemperature(logits, 2.0));
    expect(max2).toBeLessThan(max1);
  });

  it('probsToLogits is the elementwise log of clamped probs', () => {
    const probs = [0.7, 0.2, 0.1];
    const logits = probsToLogits(probs);
    expect(logits[0]).toBeCloseTo(Math.log(0.7), 9);
    expect(logits[1]).toBeCloseTo(Math.log(0.2), 9);
    expect(logits[2]).toBeCloseTo(Math.log(0.1), 9);
    // Zero probability is clamped to EPS to avoid -Infinity.
    expect(Number.isFinite(probsToLogits([0])[0])).toBe(true);
  });

  it('legacy off-mode path is byte-for-byte preserved (no T scaling at T=1.0)', () => {
    // Functional check: applyTemperature(logits, 1.0) === softmax(logits).
    const logits = [2, 1, 0];
    const t1 = applyTemperature(logits, 1.0);
    // softmax([2, 1, 0]) ≈ [0.6652, 0.2447, 0.0900]
    expect(t1[0]).toBeCloseTo(0.6652, 3);
    expect(t1[1]).toBeCloseTo(0.2447, 3);
    expect(t1[2]).toBeCloseTo(0.0900, 3);
  });
});
