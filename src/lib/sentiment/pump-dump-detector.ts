// @model-card: docs/cards/MODEL-CARD-pump-dump-detector.md
//
// Plan 20-C-04 — Pump-and-dump cluster detector (Nam/Yang 2023 baseline).
//
// Pure-math, deterministic 5-condition AND-predicate. NO Prisma imports — this
// module is consumable from scripts/eval-pump-dump-synthetic.ts and aggregator
// alike. The aggregator owns DB IO; this module owns ONLY the predicate.
//
// Thresholds cited from Nam/Yang 2023 (https://arxiv.org/pdf/2301.11403):
//   F1 = 0.67, sensitivity 85%, specificity 99% on confirmed P&D events.
// CONTEXT.md §20-C-04 line 127 enumerates the predicate verbatim. RULE_VERSION
// bumps on every threshold change so historical ManipulationWarning rows
// remain attributable to the threshold set in force at write-time.
//
// Cipher's CapClass enum is `large_cap | mid_cap | small_cap | unknown`
// (src/lib/diffusion-trace.ts:5). Nam/Yang's "{micro, small}" maps to
// `{small_cap}` per HYPERPARAMETERS.md — cited choice, not a silent override.

import type { CapClass } from '@/lib/diffusion-trace';

/**
 * Rule-version constant. Format: `pdd-v{major}.{minor}`. BUMP this whenever
 * PUMP_DUMP_THRESHOLDS changes so historical ManipulationWarning rows remain
 * attributable to the threshold set in force at write-time.
 */
export const RULE_VERSION = 'pdd-v1.0' as const;

export interface PumpDumpThresholds {
  /** mention_z strict-greater (Nam/Yang 2023). */
  mention_z_min: number;
  /** bull_pct strict-greater (Nam/Yang 2023). */
  bull_pct_min: number;
  /** gini strict-greater (Nam/Yang 2023; gini from 20-A-04). */
  gini_min: number;
  /** mean_account_age_days strict-less (Nam/Yang 2023; from 20-Z-01 author_features_snapshot). */
  account_age_max_days: number;
  /** cap_class membership — Cipher's `small_cap` covers spec's {micro, small}. */
  cap_class_set: ReadonlySet<CapClass>;
}

export const PUMP_DUMP_THRESHOLDS: PumpDumpThresholds = {
  mention_z_min: 5,
  bull_pct_min: 95,
  gini_min: 0.7,
  account_age_max_days: 90,
  cap_class_set: new Set<CapClass>(['small_cap']),
};

/** Feature snapshot at detection time. Nulls are insufficient-data signals
 *  (NEVER default-on fires). */
export interface PumpDumpFeatures {
  mention_z: number | null;             // from 20-A-02 mentionZScore
  bull_pct: number;                     // from existing aggregator (0–100)
  gini: number | null;                  // from 20-A-04 computeAuthorConcentration
  mean_account_age_days: number | null; // from 20-Z-01 author_features_snapshot.account_age_days
  cap_class: CapClass;                  // from diffusion-trace.classifyCapClass
}

/**
 * Pure 5-condition AND-gate predicate. Returns false when ANY input is null
 * (insufficient data → no warning, NEVER a default-on fire).
 *
 *   return f.mention_z > t.mention_z_min            // > 5
 *       && f.bull_pct > t.bull_pct_min              // > 95
 *       && f.gini > t.gini_min                      // > 0.7
 *       && f.mean_account_age_days < t.account_age_max_days  // < 90
 *       && t.cap_class_set.has(f.cap_class);
 */
export function isPumpAndDumpPattern(
  f: PumpDumpFeatures,
  t: PumpDumpThresholds = PUMP_DUMP_THRESHOLDS,
): boolean {
  if (f.mention_z == null || f.gini == null || f.mean_account_age_days == null) return false;
  return f.mention_z > t.mention_z_min
    && f.bull_pct > t.bull_pct_min
    && f.gini > t.gini_min
    && f.mean_account_age_days < t.account_age_max_days
    && t.cap_class_set.has(f.cap_class);
}

export interface DetectorResult {
  is_warning: boolean;
  /** Subset of `['account_age','bull_pct','cap_class','gini','mention_z']`,
   *  sorted lexicographically. Each entry indicates that its corresponding
   *  sub-condition fired (independent of the AND-gate verdict) — used for
   *  per-rule telemetry + explainability in the surveillance dashboard. */
  matched_rules: string[];
  rule_version: string;
}

/**
 * Run detectManipulation on a feature snapshot. Always returns a stable
 * { is_warning, matched_rules, rule_version } shape — the matched_rules
 * array is populated even when is_warning=false, enabling FP-rate review
 * over the 30d shadow gate.
 */
export function detectManipulation(
  f: PumpDumpFeatures,
  t: PumpDumpThresholds = PUMP_DUMP_THRESHOLDS,
): DetectorResult {
  const matched: string[] = [];
  if (f.mention_z != null && f.mention_z > t.mention_z_min) matched.push('mention_z');
  if (f.bull_pct > t.bull_pct_min) matched.push('bull_pct');
  if (f.gini != null && f.gini > t.gini_min) matched.push('gini');
  if (f.mean_account_age_days != null && f.mean_account_age_days < t.account_age_max_days) {
    matched.push('account_age');
  }
  if (t.cap_class_set.has(f.cap_class)) matched.push('cap_class');
  matched.sort();
  return {
    is_warning: isPumpAndDumpPattern(f, t),
    matched_rules: matched,
    rule_version: RULE_VERSION,
  };
}
