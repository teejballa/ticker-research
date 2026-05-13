// src/lib/sentiment/fairness-audit.ts
//
// Plan 20-C-06 — Stratification primitives + auditFairness().
//
// Stratifies classifier predictions across 4 dimensions:
//   • cap_class (mega / large / mid / small / micro) — diffusion-engine taxonomy
//   • sector (GICS-1 11-literal)
//   • geography (US / non-US)
//   • ticker_age (<1y / 1-5y / >5y)
//
// For each segment with n ≥ MIN_SEGMENT_SIZE, computes Brier (imported from
// the 20-C-02-owned src/lib/stats/brier.ts primitive) and ECE (imported from
// the 20-B-03-owned src/lib/sentiment/calibration.ts primitive). NEVER
// reimplements either — No-Duplication Gate enforced via grep at the
// hard-cleanup-gate check.
//
// Limitation flag (CONTEXT.md line 129 verbatim):
//
//     is_limitation = !insufficient_data
//                       && (brier > BRIER_LIMITATION_THRESHOLD = 0.27
//                           || ece > ECE_LIMITATION_THRESHOLD = 0.10)
//
// Benjamini-Hochberg FDR q-value is computed across all returned segments
// for telemetry (T-20-C-06-05) but is_limitation uses the raw threshold per
// CONTEXT.md spec. Rationale: false negatives (missed real bias) are higher-
// cost than false positives (mistaken limitation).
//
// 'Unknown' buckets are tracked but excluded from the FairnessReport[]
// returned by auditFairness — they appear in standalone audit reports
// under "Unclassified" but do not gate is_limitation.
//
// @model-card: docs/cards/MODEL-CARD-finbert.md

import { brierScore } from '@/lib/stats/brier';
import { expectedCalibrationError, type ConfidencePrediction } from './calibration';
import type {
  CapClass,
  GICSSector,
  Geography,
  TickerAgeBucket,
  ClassifierPrediction,
  FairnessReport,
  FairnessDimension,
} from './fairness-types';
import { GICS_SECTORS } from './fairness-types';

/**
 * CONTEXT.md line 129 spec absolute — NOT calibrated, NOT user-tunable.
 * Brier > 0.27 → flagged as a known limitation (strict greater-than).
 */
export const BRIER_LIMITATION_THRESHOLD = 0.27;

/**
 * CONTEXT.md line 129 spec absolute — NOT calibrated, NOT user-tunable.
 * ECE > 0.10 → flagged as a known limitation (strict greater-than).
 */
export const ECE_LIMITATION_THRESHOLD = 0.1;

/**
 * Central Limit Theorem standard minimum-sample floor. Segments below this
 * are still computed but flagged as low-confidence (insufficient_data=true)
 * and the is_limitation gate is FORCED to false regardless of Brier/ECE.
 */
export const MIN_SEGMENT_SIZE = 30;

// ─── Stratification primitives ────────────────────────────────────────────

export function stratifyByCapClass<T>(
  rows: T[],
  getCapClass: (r: T) => CapClass | null,
): Map<CapClass | 'Unknown', T[]> {
  const out = new Map<CapClass | 'Unknown', T[]>();
  for (const r of rows) {
    const key: CapClass | 'Unknown' = getCapClass(r) ?? 'Unknown';
    const arr = out.get(key);
    if (arr) arr.push(r);
    else out.set(key, [r]);
  }
  return out;
}

export function stratifyBySector<T>(
  rows: T[],
  getSector: (r: T) => GICSSector | null,
): Map<GICSSector | 'Unknown', T[]> {
  const out = new Map<GICSSector | 'Unknown', T[]>();
  for (const r of rows) {
    const s = getSector(r);
    const key: GICSSector | 'Unknown' =
      s && (GICS_SECTORS as readonly string[]).includes(s) ? s : 'Unknown';
    const arr = out.get(key);
    if (arr) arr.push(r);
    else out.set(key, [r]);
  }
  return out;
}

export function stratifyByGeography<T>(
  rows: T[],
  getGeo: (r: T) => Geography | null,
): Map<Geography | 'Unknown', T[]> {
  const out = new Map<Geography | 'Unknown', T[]>();
  for (const r of rows) {
    const g = getGeo(r);
    const key: Geography | 'Unknown' = g === 'US' || g === 'non-US' ? g : 'Unknown';
    const arr = out.get(key);
    if (arr) arr.push(r);
    else out.set(key, [r]);
  }
  return out;
}

export function stratifyByTickerAge<T>(
  rows: T[],
  getAge: (r: T) => number | null,
): Map<TickerAgeBucket | 'Unknown', T[]> {
  const out = new Map<TickerAgeBucket | 'Unknown', T[]>();
  for (const r of rows) {
    const a = getAge(r);
    let key: TickerAgeBucket | 'Unknown';
    if (a == null || !Number.isFinite(a)) {
      key = 'Unknown';
    } else if (a < 1.0) {
      key = '<1y';
    } else if (a <= 5.0) {
      key = '1-5y';
    } else {
      key = '>5y';
    }
    const arr = out.get(key);
    if (arr) arr.push(r);
    else out.set(key, [r]);
  }
  return out;
}

// ─── Stratifier wiring ───────────────────────────────────────────────────

export interface Stratifiers {
  getCapClass: (p: ClassifierPrediction) => CapClass | null;
  getSector: (p: ClassifierPrediction) => GICSSector | null;
  getGeo: (p: ClassifierPrediction) => Geography | null;
  getAge: (p: ClassifierPrediction) => number | null;
}

// ─── BH FDR procedure ─────────────────────────────────────────────────────

/**
 * Benjamini-Hochberg FDR adjustment over a vector of raw p-values.
 * Returns q-values in the SAME ORDER as the input. Monotone-in-rank:
 *
 *     q_(i) = min_{k >= i} ( p_(k) × m / k )
 *
 * where (i) denotes ascending-p ordering. m = total tests.
 *
 * Reference: Benjamini & Hochberg (1995) JRSS-B 57(1):289-300.
 */
function bhFdr(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);
  // Raw q-values in ascending p order
  const rawQ = indexed.map((entry, rank) => (entry.p * m) / (rank + 1));
  // Monotonize from the right: q_(i) = min_{k >= i} rawQ_(k)
  const monoQ = new Array<number>(m);
  let runningMin = Infinity;
  for (let k = m - 1; k >= 0; k--) {
    if (rawQ[k] < runningMin) runningMin = rawQ[k];
    monoQ[k] = Math.min(runningMin, 1);
  }
  // Unpermute back to original order
  const out = new Array<number>(m);
  for (let k = 0; k < m; k++) {
    out[indexed[k].i] = monoQ[k];
  }
  return out;
}

/**
 * Derive a raw two-sided p-value for the null "this segment's Brier is no
 * worse than the random baseline 0.25". Use a normal-approx z-test on the
 * mean squared error, with σ ≈ sqrt(Var((p − o)²) / n) approximated by the
 * sample-variance of (p − o)² across the segment.
 *
 * NOTE: This p-value is purely informational — it feeds bh_q_value which
 * is NOT gating per T-20-C-06-05. The is_limitation flag uses the raw
 * Brier > 0.27 / ECE > 0.10 thresholds per CONTEXT.md spec.
 */
function brierPValue(predictions: number[], outcomes: number[], brier: number): number {
  const n = predictions.length;
  if (n < 2) return 1;
  const residuals = predictions.map((p, i) => (p - outcomes[i]) ** 2);
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  let varAcc = 0;
  for (const r of residuals) varAcc += (r - mean) ** 2;
  const sampleVar = varAcc / (n - 1);
  const se = Math.sqrt(sampleVar / n);
  if (!Number.isFinite(se) || se === 0) return 1;
  const z = (brier - 0.25) / se;
  // Two-sided p via erf approximation
  return 2 * (1 - normCdf(Math.abs(z)));
}

function normCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 erf approx
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * ax);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * erf);
}

// ─── Audit core ──────────────────────────────────────────────────────────

function toConfidencePredictions(
  predictions: number[],
  outcomes: number[],
): ConfidencePrediction[] {
  // ECE (20-B-03) operates on (confidence, correct) pairs. Map a binary
  // positive-class probability p_i + outcome o_i ∈ {0,1} as:
  //   confidence = max(p_i, 1 - p_i)  (predicted class probability)
  //   correct    = (predicted class) == o_i, where predicted = (p_i >= 0.5 ? 1 : 0)
  const out: ConfidencePrediction[] = [];
  for (let i = 0; i < predictions.length; i++) {
    const p = predictions[i];
    const o = outcomes[i];
    const predictedClass = p >= 0.5 ? 1 : 0;
    const confidence = Math.max(p, 1 - p);
    out.push({ confidence, correct: predictedClass === o });
  }
  return out;
}

/**
 * Evaluate one segment slice; produce a FairnessReport row.
 * The bh_q_value is populated by the caller after BH FDR runs across all rows.
 */
function evaluateSegment(
  dimension: FairnessDimension,
  segment: string,
  slice: ClassifierPrediction[],
): { row: FairnessReport; pValue: number } {
  const preds = slice.map((s) => s.predicted_prob);
  const outs = slice.map((s) => s.actual_outcome as number);
  const n = preds.length;
  const insufficient = n < MIN_SEGMENT_SIZE;
  // Brier from 20-C-02-owned primitive
  const brier = brierScore(preds, outs);
  // ECE from 20-B-03-owned primitive
  const ece = expectedCalibrationError(toConfidencePredictions(preds, outs));
  const is_limitation =
    !insufficient && (brier > BRIER_LIMITATION_THRESHOLD || ece > ECE_LIMITATION_THRESHOLD);
  const pValue = brierPValue(preds, outs, brier);
  return {
    row: {
      dimension,
      segment,
      brier,
      ece,
      n_samples: n,
      is_limitation,
      insufficient_data: insufficient,
      bh_q_value: 1, // placeholder; filled after BH FDR across all rows
    },
    pValue,
  };
}

/**
 * Stratify predictions across all 4 dimensions, evaluate every non-Unknown
 * segment, and apply BH FDR across all returned rows.
 *
 * 'Unknown' buckets are EXCLUDED from the returned array (they appear in the
 * standalone Markdown report under an "Unclassified" appendix but do NOT
 * gate is_limitation per CONTEXT.md spec).
 */
export function auditFairness(
  predictions: ClassifierPrediction[],
  stratifiers: Stratifiers,
): FairnessReport[] {
  const stages: Array<{
    dimension: FairnessDimension;
    buckets: Map<string, ClassifierPrediction[]>;
  }> = [
    {
      dimension: 'cap_class',
      buckets: new Map(stratifyByCapClass(predictions, stratifiers.getCapClass) as Map<string, ClassifierPrediction[]>),
    },
    {
      dimension: 'sector',
      buckets: new Map(stratifyBySector(predictions, stratifiers.getSector) as Map<string, ClassifierPrediction[]>),
    },
    {
      dimension: 'geography',
      buckets: new Map(stratifyByGeography(predictions, stratifiers.getGeo) as Map<string, ClassifierPrediction[]>),
    },
    {
      dimension: 'ticker_age',
      buckets: new Map(stratifyByTickerAge(predictions, stratifiers.getAge) as Map<string, ClassifierPrediction[]>),
    },
  ];

  const rowsAndP: Array<{ row: FairnessReport; pValue: number }> = [];
  for (const stage of stages) {
    for (const [segment, slice] of stage.buckets.entries()) {
      if (segment === 'Unknown') continue;
      if (slice.length === 0) continue;
      rowsAndP.push(evaluateSegment(stage.dimension, segment, slice));
    }
  }

  // BH FDR across ALL rows from ALL dimensions (per CONTEXT.md telemetry note).
  const qs = bhFdr(rowsAndP.map((r) => r.pValue));
  for (let i = 0; i < rowsAndP.length; i++) {
    rowsAndP[i].row.bh_q_value = qs[i];
  }
  return rowsAndP.map((r) => r.row);
}
