// tests/lib/shadow/verdict.test.ts
//
// Phase 19 / Plan 19-Z-03 / Task 1 — verdict() pure-function tests.
//
// verdict() implements D-11/12/13 thresholds:
//   PASS  — new ≥ old quality AND (latency OR cost) AND disagreement < 5%
//   FAIL  — quality regression OR p95 ≥ 2× old OR cost ratio > 1.5× old OR disagreement ≥ 5%
//   HOLD  — n_rows < 200 AND quality unmeasurable
//
// Cost regression is RATIO-based (cost_new / cost_old > 1.5 per D-12),
// computed internally by verdict(). Rule is skipped when either cost is null
// OR old <= 0 (cannot compute ratio safely).

import { describe, it, expect } from 'vitest';
import { verdict, type VerdictMetrics } from '../../../src/lib/shadow/verdict';

function baseline(overrides: Partial<VerdictMetrics> = {}): VerdictMetrics {
  return {
    n_rows: 300,
    latency_p50_old_ms: 50,
    latency_p95_old_ms: 100,
    latency_p50_new_ms: 50,
    latency_p95_new_ms: 100,
    cost_old_baseline_usd_per_request: 0.01,
    cost_new_usd_per_request: 0.01,
    output_disagreement_rate: 0.02,
    quality_delta: 0,
    quality_measurable: true,
    ...overrides,
  };
}

describe('verdict() — D-11/12/13 thresholds', () => {
  it('Test 1: PASS — new better quality, equal latency, low disagreement', () => {
    const m = baseline({ quality_delta: 0.05 });
    const r = verdict(m);
    expect(r.result).toBe('PASS');
  });

  it('Test 2: PASS — new equal quality, lower cost', () => {
    const m = baseline({ quality_delta: 0, cost_new_usd_per_request: 0.009 });
    const r = verdict(m);
    expect(r.result).toBe('PASS');
  });

  it('Test 3: FAIL — new worse quality (negative delta)', () => {
    const m = baseline({ quality_delta: -0.05 });
    const r = verdict(m);
    expect(r.result).toBe('FAIL');
    expect(r.reasons.some((s) => s.toLowerCase().includes('quality'))).toBe(true);
  });

  it('Test 4: FAIL — new latency p95 ≥ 2× old', () => {
    const m = baseline({ latency_p95_new_ms: 300, latency_p95_old_ms: 100 });
    const r = verdict(m);
    expect(r.result).toBe('FAIL');
    expect(r.reasons.some((s) => s.toLowerCase().includes('latency'))).toBe(true);
  });

  it('Test 5: FAIL — new cost > 1.5× old (ratio-based, D-12)', () => {
    const m = baseline({
      cost_old_baseline_usd_per_request: 0.01,
      cost_new_usd_per_request: 0.016, // ratio = 1.6×
    });
    const r = verdict(m);
    expect(r.result).toBe('FAIL');
    expect(r.reasons.some((s) => s.toLowerCase().includes('cost'))).toBe(true);
  });

  it('Test 5b: PASS — cost exactly 1.5× old (boundary, rule is strictly >)', () => {
    const m = baseline({
      cost_old_baseline_usd_per_request: 0.01,
      cost_new_usd_per_request: 0.015, // ratio = 1.5× exactly
    });
    const r = verdict(m);
    expect(r.result).toBe('PASS');
  });

  it('Test 5c: PASS — both costs null, cost rule skipped', () => {
    const m = baseline({
      cost_old_baseline_usd_per_request: null,
      cost_new_usd_per_request: null,
    });
    const r = verdict(m);
    expect(r.result).toBe('PASS');
    // No FAIL on cost
    expect(r.reasons.every((s) => !s.toLowerCase().includes('cost'))).toBe(true);
  });

  it('Test 5d: PASS — old cost 0 or negative, cost rule skipped', () => {
    const m = baseline({
      cost_old_baseline_usd_per_request: 0,
      cost_new_usd_per_request: 0.5,
    });
    const r = verdict(m);
    // Cost rule skipped — should not FAIL on cost
    expect(r.reasons.every((s) => !s.toLowerCase().includes('cost'))).toBe(true);
    expect(r.result).toBe('PASS');
  });

  it('Test 6: FAIL — disagreement ≥ 5%', () => {
    const m = baseline({ output_disagreement_rate: 0.07 });
    const r = verdict(m);
    expect(r.result).toBe('FAIL');
    expect(r.reasons.some((s) => s.toLowerCase().includes('disagreement'))).toBe(true);
  });

  it('Test 7: HOLD — n_rows < 200 AND quality unmeasurable', () => {
    const m = baseline({ n_rows: 50, quality_measurable: false, quality_delta: null });
    const r = verdict(m);
    expect(r.result).toBe('HOLD');
  });

  it('Test 8: PASS — n_rows < 200 BUT quality measurable AND all metrics good', () => {
    const m = baseline({ n_rows: 50, quality_measurable: true, quality_delta: 0.02 });
    const r = verdict(m);
    expect(r.result).toBe('PASS');
  });

  it('Test 9: boundary — latency p95 exactly 2× old → FAIL (rule is ≥)', () => {
    const m = baseline({ latency_p95_new_ms: 200, latency_p95_old_ms: 100 });
    const r = verdict(m);
    expect(r.result).toBe('FAIL');
    expect(r.reasons.some((s) => s.toLowerCase().includes('latency'))).toBe(true);
  });

  it('Test 10: reasons array non-empty on FAIL', () => {
    const m = baseline({ quality_delta: -0.5 });
    const r = verdict(m);
    expect(r.result).toBe('FAIL');
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.reasons.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
  });

  it('Test 11: reasons array non-empty on PASS too (success message)', () => {
    const r = verdict(baseline());
    expect(r.result).toBe('PASS');
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('Test 12: HOLD reasons mention insufficient rows', () => {
    const m = baseline({ n_rows: 50, quality_measurable: false, quality_delta: null });
    const r = verdict(m);
    expect(r.result).toBe('HOLD');
    expect(r.reasons.some((s) => /50|row|window|extend/i.test(s))).toBe(true);
  });

  it('Test 13: multiple FAILs aggregated in reasons', () => {
    const m = baseline({
      quality_delta: -0.1,
      latency_p95_new_ms: 250,
      latency_p95_old_ms: 100,
      output_disagreement_rate: 0.1,
    });
    const r = verdict(m);
    expect(r.result).toBe('FAIL');
    // All three failure conditions should appear in reasons
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
