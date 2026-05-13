// Plan 20-C-04 — Pump-and-dump detector unit tests (TDD RED → GREEN).
//
// Verifies the literal 5-condition AND-predicate cited from Nam/Yang 2023
// (CONTEXT.md line 127). Strict-greater / strict-less semantics enforced at
// every boundary. RULE_VERSION echoed back on every detectManipulation call.
//
// 14 canonical/boundary/null/threshold-injection cases + 2 reproducibility
// cases on the synthetic eval harness.

import { describe, it, expect } from 'vitest';
import {
  detectManipulation,
  isPumpAndDumpPattern,
  PUMP_DUMP_THRESHOLDS,
  RULE_VERSION,
  type PumpDumpFeatures,
} from '@/lib/sentiment/pump-dump-detector';
import { runSyntheticEval } from '../scripts/eval-pump-dump-synthetic';

// Canonical all-trigger features.
const canonical: PumpDumpFeatures = {
  mention_z: 7,
  bull_pct: 98,
  gini: 0.85,
  mean_account_age_days: 45,
  cap_class: 'small_cap',
};

describe('isPumpAndDumpPattern — 5-condition AND-gate', () => {
  it('canonical all-trigger → true', () => {
    expect(isPumpAndDumpPattern(canonical)).toBe(true);
  });

  // Strict-greater semantics — exact threshold values do NOT fire.
  it('boundary 1 — mention_z exact 5.0 → false', () => {
    expect(isPumpAndDumpPattern({ ...canonical, mention_z: 5.0 })).toBe(false);
  });
  it('boundary 2 — bull_pct exact 95.0 → false', () => {
    expect(isPumpAndDumpPattern({ ...canonical, bull_pct: 95.0 })).toBe(false);
  });
  it('boundary 3 — gini exact 0.7 → false', () => {
    expect(isPumpAndDumpPattern({ ...canonical, gini: 0.7 })).toBe(false);
  });
  it('boundary 4 — mean_account_age_days exact 90.0 → false (strict-less)', () => {
    expect(isPumpAndDumpPattern({ ...canonical, mean_account_age_days: 90.0 })).toBe(false);
  });
  it('boundary 5 — cap_class mid_cap → false', () => {
    expect(isPumpAndDumpPattern({ ...canonical, cap_class: 'mid_cap' })).toBe(false);
  });

  it('cap_class large_cap → false', () => {
    expect(isPumpAndDumpPattern({ ...canonical, cap_class: 'large_cap' })).toBe(false);
  });
  it('cap_class unknown → false', () => {
    expect(isPumpAndDumpPattern({ ...canonical, cap_class: 'unknown' })).toBe(false);
  });

  it('null mention_z → false (insufficient data, never default-on)', () => {
    expect(isPumpAndDumpPattern({ ...canonical, mention_z: null })).toBe(false);
  });
  it('null gini → false', () => {
    expect(isPumpAndDumpPattern({ ...canonical, gini: null })).toBe(false);
  });
  it('null mean_account_age_days → false', () => {
    expect(isPumpAndDumpPattern({ ...canonical, mean_account_age_days: null })).toBe(false);
  });

  it('threshold injection — custom mention_z_min=3 allows mention_z=4 to fire', () => {
    expect(
      isPumpAndDumpPattern(
        { ...canonical, mention_z: 4 },
        { ...PUMP_DUMP_THRESHOLDS, mention_z_min: 3 },
      ),
    ).toBe(true);
  });
});

describe('detectManipulation — DetectorResult shape', () => {
  it('canonical → is_warning=true, matched_rules sorted 5-tuple, rule_version echo', () => {
    const r = detectManipulation(canonical);
    expect(r.is_warning).toBe(true);
    expect(r.matched_rules).toEqual(['account_age', 'bull_pct', 'cap_class', 'gini', 'mention_z']);
    expect(r.rule_version).toBe(RULE_VERSION);
    expect(RULE_VERSION).toBe('pdd-v1.0');
  });

  it('partial match — matched_rules excludes failing sub-conditions', () => {
    const r = detectManipulation({
      mention_z: 7,
      bull_pct: 98,
      gini: 0.5,                 // fails (≤ 0.7)
      mean_account_age_days: 200, // fails (≥ 90)
      cap_class: 'small_cap',
    });
    expect(r.is_warning).toBe(false);
    expect(r.matched_rules).toEqual(['bull_pct', 'cap_class', 'mention_z']);
    expect(r.rule_version).toBe('pdd-v1.0');
  });

  it('mention_z=5 exact → matched_rules excludes mention_z, includes other 4', () => {
    const r = detectManipulation({ ...canonical, mention_z: 5.0 });
    expect(r.is_warning).toBe(false);
    expect(r.matched_rules).toEqual(['account_age', 'bull_pct', 'cap_class', 'gini']);
  });
});

describe('Synthetic eval reproducibility (npm run eval:pump-dump-synthetic)', () => {
  it('eval is reproducible to 4 decimal places with fixed seed', async () => {
    const a = await runSyntheticEval({ seed: 20260511, n_per_class: 100, outDir: '/tmp/eval-test-a' });
    const b = await runSyntheticEval({ seed: 20260511, n_per_class: 100, outDir: '/tmp/eval-test-b' });
    expect(a.f1.toFixed(4)).toBe(b.f1.toFixed(4));
    expect(a.specificity.toFixed(4)).toBe(b.specificity.toFixed(4));
  });

  it('eval F1 >= 0.6 and specificity >= 0.95 at default n=500', async () => {
    const r = await runSyntheticEval({ outDir: '/tmp/eval-test-default' });
    expect(r.f1).toBeGreaterThanOrEqual(0.6);
    expect(r.specificity).toBeGreaterThanOrEqual(0.95);
  });
});
