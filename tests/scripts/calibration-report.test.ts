// tests/scripts/calibration-report.test.ts
//
// Phase 19 / Plan 19-A-06 / Task 1 — calibration validation harness tests.
//
// Per CONTEXT D-22 + RESEARCH §"calibration drift detection", the harness
// must produce:
//   1. A reliability diagram — predictions partitioned into n quantile bins,
//      with each bin reporting (mean predicted probability, observed hit
//      frequency). For a perfectly calibrated model these two columns lie on
//      the y=x diagonal across all bins.
//   2. A Hosmer-Lemeshow chi-square goodness-of-fit test:
//        χ² = Σ_g [(O_1g - E_1g)² / (E_1g · (1 - π_g))]
//      with df = nBins - 2. Large χ² (small p-value < 0.05) ⇒ reject the null
//      of good calibration. Reference: Hosmer & Lemeshow 2000 §5.
//
// All synthetic fixtures use a deterministic seedable PRNG (mulberry32) so
// the chi-square verdicts are reproducible — no flaky tests.

import { describe, it, expect } from 'vitest';
import {
  reliabilityDiagram,
  hosmerLemeshow,
  type ReliabilityBin,
  type HosmerLemeshowResult,
} from '../../src/lib/learning';

// ── Deterministic PRNG (mulberry32) ────────────────────────────────────────
// Pinned so synthetic outcomes are reproducible across machines & CI runs.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Fixture builders ───────────────────────────────────────────────────────

/**
 * Perfectly calibrated synthetic data: predictions are uniform on [0,1] and
 * outcome[i] is Bernoulli(predictions[i]). With n large the per-bin
 * observed frequency hugs the per-bin mean prediction.
 */
function buildCalibrated(n: number, seed: number): {
  predictions: number[];
  outcomes: boolean[];
} {
  const rng = mulberry32(seed);
  const predictions: number[] = new Array(n);
  const outcomes: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = rng();
    predictions[i] = p;
    outcomes[i] = rng() < p;
  }
  return { predictions, outcomes };
}

/**
 * Over-confident synthetic data: predictions cluster near 0.9 (model is sure)
 * but actual outcomes are 50/50 — the prototypical miscalibrated regime that
 * Hosmer-Lemeshow must reject.
 */
function buildMiscalibrated(n: number, seed: number): {
  predictions: number[];
  outcomes: boolean[];
} {
  const rng = mulberry32(seed);
  const predictions: number[] = new Array(n);
  const outcomes: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // Predictions uniformly between 0.85 and 0.95 — "very confident"
    predictions[i] = 0.85 + 0.1 * rng();
    // But true outcome is independent coin flip — pure miscalibration
    outcomes[i] = rng() < 0.5;
  }
  return { predictions, outcomes };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('reliabilityDiagram', () => {
  it('Test 1: perfectly calibrated synthetic produces near-diagonal bins (|mean_pred - obs_freq| < 0.05)', () => {
    const { predictions, outcomes } = buildCalibrated(10000, 42);
    const bins = reliabilityDiagram({ predictions, outcomes });
    for (const b of bins) {
      const gap = Math.abs(b.meanPrediction - b.observedFrequency);
      expect(gap).toBeLessThan(0.05);
    }
  });

  it('Test 2: over-confident synthetic produces bins where observed frequency is near 0.5 (well below mean predictions ~0.9)', () => {
    const { predictions, outcomes } = buildMiscalibrated(10000, 99);
    const bins = reliabilityDiagram({ predictions, outcomes });
    // Every bin's mean prediction is near 0.9, but observed frequency ~0.5
    for (const b of bins) {
      expect(b.meanPrediction).toBeGreaterThan(0.84);
      expect(b.meanPrediction).toBeLessThan(0.96);
      expect(b.observedFrequency).toBeGreaterThan(0.4);
      expect(b.observedFrequency).toBeLessThan(0.6);
    }
  });

  it('Test 3: bin counts sum to total samples', () => {
    const { predictions, outcomes } = buildCalibrated(1000, 7);
    const bins = reliabilityDiagram({ predictions, outcomes });
    const total = bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(1000);
  });

  it('Test 7: nBins=10 default produces 10 bins', () => {
    const { predictions, outcomes } = buildCalibrated(500, 1);
    const bins = reliabilityDiagram({ predictions, outcomes });
    expect(bins.length).toBe(10);
  });

  it('Test 8: predictions array length must match outcomes array length (throws otherwise)', () => {
    expect(() =>
      reliabilityDiagram({
        predictions: [0.1, 0.5, 0.9],
        outcomes: [true, false],
      }),
    ).toThrow(/same length/i);
  });
});

describe('hosmerLemeshow', () => {
  it('Test 4: calibrated data — p-value > 0.05 (cannot reject null of good fit)', () => {
    const { predictions, outcomes } = buildCalibrated(10000, 42);
    const result: HosmerLemeshowResult = hosmerLemeshow({ predictions, outcomes });
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  it('Test 5: miscalibrated data — p-value < 0.05 (reject null of good fit)', () => {
    const { predictions, outcomes } = buildMiscalibrated(10000, 99);
    const result: HosmerLemeshowResult = hosmerLemeshow({ predictions, outcomes });
    expect(result.pValue).toBeLessThan(0.05);
    // Chi-square should be large for an obviously miscalibrated model
    expect(result.chiSquare).toBeGreaterThan(50);
  });

  it('Test 6: chi-square ≥ 0 and df = nBins - 2', () => {
    const { predictions, outcomes } = buildCalibrated(2000, 13);
    const result = hosmerLemeshow({ predictions, outcomes, nBins: 10 });
    expect(result.chiSquare).toBeGreaterThanOrEqual(0);
    expect(result.degreesOfFreedom).toBe(8);
    expect(result.bins.length).toBe(10);

    // Custom nBins also obeys df = nBins - 2
    const result5 = hosmerLemeshow({ predictions, outcomes, nBins: 5 });
    expect(result5.degreesOfFreedom).toBe(3);
  });

  it('returns ReliabilityBin shape from bins field', () => {
    const { predictions, outcomes } = buildCalibrated(500, 4);
    const result = hosmerLemeshow({ predictions, outcomes });
    const first: ReliabilityBin = result.bins[0];
    expect(first).toHaveProperty('binIndex');
    expect(first).toHaveProperty('binLow');
    expect(first).toHaveProperty('binHigh');
    expect(first).toHaveProperty('meanPrediction');
    expect(first).toHaveProperty('observedFrequency');
    expect(first).toHaveProperty('count');
  });
});
