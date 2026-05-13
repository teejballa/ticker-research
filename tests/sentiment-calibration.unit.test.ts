// tests/sentiment-calibration.unit.test.ts
// Plan 20-B-03 Task 3 — ECE + Brier + softmax + temperatureScale primitives.

import { describe, expect, it } from 'vitest';
import {
  brierScore,
  expectedCalibrationError,
  softmax,
  temperatureScale,
  type ConfidencePrediction,
} from '../src/lib/sentiment/calibration';

describe('20-B-03 Task 3 — ECE + Brier + softmax + temperatureScale', () => {
  it('expectedCalibrationError on perfectly-calibrated synthetic predictions returns < 0.02', () => {
    // Synthetic: bin midpoints from 0.05 to 0.95; in each bin, correctness fraction
    // equals bin midpoint exactly. N=1000.
    const predictions: ConfidencePrediction[] = [];
    for (let bin = 0; bin < 10; bin++) {
      const mid = (bin + 0.5) / 10;
      for (let i = 0; i < 100; i++) {
        predictions.push({
          confidence: mid,
          correct: i / 100 < mid, // exact fraction = mid
        });
      }
    }
    const ece = expectedCalibrationError(predictions);
    expect(ece).toBeLessThan(0.02);
  });

  it('expectedCalibrationError on uniform-overconfident (conf=0.99, all wrong) returns ≈ 0.99', () => {
    const predictions: ConfidencePrediction[] = Array.from({ length: 500 }, () => ({
      confidence: 0.99,
      correct: false,
    }));
    const ece = expectedCalibrationError(predictions);
    expect(ece).toBeGreaterThan(0.95);
    expect(ece).toBeLessThan(1);
  });

  it('expectedCalibrationError handles empty input → returns 0', () => {
    expect(expectedCalibrationError([])).toBe(0);
  });

  it('brierScore on hard correct (1.0,true)→0; hard wrong (1.0,false)→1; uniform 0.5 mixed → 0.25', () => {
    expect(brierScore([{ confidence: 1.0, correct: true }])).toBe(0);
    expect(brierScore([{ confidence: 1.0, correct: false }])).toBe(1);
    const mixed: ConfidencePrediction[] = [
      { confidence: 0.5, correct: true },
      { confidence: 0.5, correct: false },
    ];
    expect(brierScore(mixed)).toBeCloseTo(0.25, 10);
  });

  it('softmax handles zero input + numerical stability for large positive logit', () => {
    const equal = softmax([0, 0, 0]);
    expect(equal).toHaveLength(3);
    for (const p of equal) expect(p).toBeCloseTo(1 / 3, 9);
    const sharp = softmax([1000, 0, 0]);
    expect(sharp[0]).toBeCloseTo(1, 9);
    expect(sharp[1]).toBeCloseTo(0, 9);
    expect(sharp[2]).toBeCloseTo(0, 9);
    expect(Number.isFinite(sharp[0])).toBe(true);
  });

  it('temperatureScale(logits, 1.0) equals softmax(logits) (identity at T=1)', () => {
    const logits = [3, 1, 0];
    const t1 = temperatureScale(logits, 1.0);
    const sm = softmax(logits);
    for (let i = 0; i < logits.length; i++) {
      expect(t1[i]).toBeCloseTo(sm[i], 12);
    }
  });

  it('temperatureScale(logits, 2.0) softens (strictly lower max prob) than T=1.0', () => {
    const logits = [3, 1, 0];
    const max1 = Math.max(...temperatureScale(logits, 1.0));
    const max2 = Math.max(...temperatureScale(logits, 2.0));
    expect(max2).toBeLessThan(max1);
  });

  it('temperatureScale(logits, 0.5) sharpens (strictly higher max prob) than T=1.0', () => {
    const logits = [3, 1, 0];
    const max1 = Math.max(...temperatureScale(logits, 1.0));
    const maxHalf = Math.max(...temperatureScale(logits, 0.5));
    expect(maxHalf).toBeGreaterThan(max1);
  });

  it('expectedCalibrationError n_bins=10 vs n_bins=20 both finite and in [0,1]', () => {
    const predictions: ConfidencePrediction[] = Array.from({ length: 200 }, (_, i) => ({
      confidence: (i + 1) / 200,
      correct: i % 2 === 0,
    }));
    const e10 = expectedCalibrationError(predictions, 10);
    const e20 = expectedCalibrationError(predictions, 20);
    expect(Number.isFinite(e10)).toBe(true);
    expect(Number.isFinite(e20)).toBe(true);
    expect(e10).toBeGreaterThanOrEqual(0);
    expect(e10).toBeLessThanOrEqual(1);
    expect(e20).toBeGreaterThanOrEqual(0);
    expect(e20).toBeLessThanOrEqual(1);
  });

  it('temperatureScale throws on T <= 0', () => {
    expect(() => temperatureScale([1, 2, 3], 0)).toThrow();
    expect(() => temperatureScale([1, 2, 3], -1)).toThrow();
  });
});
