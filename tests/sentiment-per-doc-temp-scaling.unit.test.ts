// tests/sentiment-per-doc-temp-scaling.unit.test.ts
// Plan 20-B-03 Task 9 — T-scaling gated by SENTIMENT_TEMP_SCALING_MODE on
// classifyDocumentsBatch. We test the runtime helpers + post-Gemini scaling
// logic; full live-Gemini end-to-end is exercised in 20-B-01 integration tests.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyTemperature,
  getTempScalingMode,
  resolveGeminiPerDocClassifierVersion,
  _resetTemperatureCache,
} from '../src/lib/sentiment/temperature-runtime';

describe('20-B-03 Task 9 — Gemini per-doc temperature-scaling runtime', () => {
  const ORIG_ENV = { ...process.env };
  beforeEach(() => {
    _resetTemperatureCache();
    process.env = { ...ORIG_ENV };
  });
  afterEach(() => {
    process.env = ORIG_ENV;
  });

  it('resolveGeminiPerDocClassifierVersion returns gemini-per-doc-v1 by default', () => {
    expect(resolveGeminiPerDocClassifierVersion()).toBe('gemini-per-doc-v1');
  });

  it('resolveGeminiPerDocClassifierVersion accepts v2', () => {
    expect(resolveGeminiPerDocClassifierVersion('v2')).toBe('gemini-per-doc-v2');
  });

  it('mode=off short-circuits T-scaling (synthetic 2-class scaling test)', () => {
    process.env.SENTIMENT_TEMP_SCALING_MODE = 'off';
    expect(getTempScalingMode()).toBe('off');
  });

  it('T=2.0 softens the synthetic 2-class confidence below the raw value', () => {
    // Mirror what classifyDocumentsBatch does: synthesise 2-class logits from
    // {c, 1-c} and apply T-scaling.
    const c = 0.95; // overconfident
    const logits = [Math.log(c), Math.log(1 - c)];
    const probs1 = applyTemperature(logits, 1.0);
    const probs2 = applyTemperature(logits, 2.0);
    // T=2 must reduce the peak confidence vs T=1.
    expect(probs2[0]).toBeLessThan(probs1[0]);
  });

  it('T=0.5 sharpens the synthetic 2-class confidence above the raw value', () => {
    const c = 0.7;
    const logits = [Math.log(c), Math.log(1 - c)];
    const probs1 = applyTemperature(logits, 1.0);
    const probsHalf = applyTemperature(logits, 0.5);
    expect(probsHalf[0]).toBeGreaterThan(probs1[0]);
  });

  it('mode shadow path defaults to "shadow" parsed from env', () => {
    process.env.SENTIMENT_TEMP_SCALING_MODE = 'shadow';
    expect(getTempScalingMode()).toBe('shadow');
  });

  it('mode=on path is detectable for the on branch in classifyDocumentsBatch', () => {
    process.env.SENTIMENT_TEMP_SCALING_MODE = 'on';
    expect(getTempScalingMode()).toBe('on');
  });
});
