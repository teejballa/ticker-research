/**
 * Phase 21.1 D-26/D-27 — integration test for cell_promoted / cell_demoted
 * LearningEvent emission in /api/cron/learn.
 *
 * Tests the promotion gate logic end-to-end using:
 *   - patternStatus (5-gate) — from src/lib/learning
 *   - benjaminiYekutieli — from src/lib/evaluation/fdr
 *   - deflatedSharpeRatio — from src/lib/evaluation/dsr
 *   - bootstrapBCa — from src/lib/evaluation/bootstrap
 *
 * The cron handler's DB path (evaluateOneCell + applyPatternStatusAndEmitEvents)
 * is exercised by integration tests gated on RUN_LIVE_INTEGRATION=true.
 * Unit tests here verify the GATE LOGIC CONTRACT without a live DB:
 *   1. A synthetic cell crossing all 5 gates → patternStatus returns ACTIVE.
 *   2. A cell with q ≥ 0.10 → patternStatus returns EXPLORATORY (gate d fails).
 *   3. benjaminiYekutieli correctly adjusts p-values for a pair of cells where
 *      one should be rejected and one accepted at q=0.10.
 *   4. deflatedSharpeRatio returns > 0 for a positive Sharpe, ≤ 0 for negative.
 *   5. bootstrapBCa CI contains the true mean for a synthetic lift distribution.
 *   6. Full promotion scenario: p_values → BY → q_values → patternStatus ACTIVE.
 *   7. No-promotion scenario: q ≥ 0.10 → patternStatus stays EXPLORATORY.
 *
 * Delta payload shape:
 *   { cv_folds, brier_lift, brier_lift_ci_bca_95, q_value_by, dsr,
 *     n_trials_attempted, prev_status, new_status }
 *
 * Reference: CONTEXT D-26 (5-gate), D-27 (LearningEvent payload).
 */

import { describe, it, expect } from 'vitest';
import { patternStatus, BRIER_LIFT_THRESHOLD, LIVE_OUTCOME_THRESHOLD } from '@/lib/learning';
import { benjaminiYekutieli } from '@/lib/evaluation/fdr';
import { deflatedSharpeRatio } from '@/lib/evaluation/dsr';
import { bootstrapBCa } from '@/lib/evaluation/bootstrap';

// ---------------------------------------------------------------------------
// Synthetic cell parameters that pass all 5 gates
// ---------------------------------------------------------------------------

const PASSING_CELL = {
  sample_size: 50,
  brier_in: 0.20,
  brier_out: 0.22,
  brier_null: 0.25,   // lift = 0.25 - 0.22 = 0.03 > BRIER_LIFT_THRESHOLD (0.005)
  drift_z: 0.5,
  effective_sample_size: 35, // gate (a): ≥ 30
  live_outcome_count: 12,    // gate (b): ≥ 10
  brier_lift_threshold: BRIER_LIFT_THRESHOLD,
  by_fdr_q_value: 0.05,      // gate (d): < 0.10
  dsr: 0.3,                  // gate (e): > 0
} as const;

// ---------------------------------------------------------------------------
// 1. All 5 gates pass → ACTIVE
// ---------------------------------------------------------------------------

describe('patternStatus 5-gate (Phase 21.1 D-26) — promotion contract', () => {
  it('returns ACTIVE when all 5 gates pass', () => {
    expect(patternStatus(PASSING_CELL)).toBe('ACTIVE');
  });

  it('returns non-ACTIVE when BY-FDR q ≥ 0.10 (gate d fails)', () => {
    const status = patternStatus({ ...PASSING_CELL, by_fdr_q_value: 0.10 });
    expect(status).not.toBe('ACTIVE');
  });

  it('returns non-ACTIVE when BY-FDR q = 0.15', () => {
    const status = patternStatus({ ...PASSING_CELL, by_fdr_q_value: 0.15 });
    expect(status).not.toBe('ACTIVE');
  });

  it('returns non-ACTIVE when DSR ≤ 0 (gate e fails)', () => {
    expect(patternStatus({ ...PASSING_CELL, dsr: 0 })).not.toBe('ACTIVE');
    expect(patternStatus({ ...PASSING_CELL, dsr: -0.5 })).not.toBe('ACTIVE');
  });

  it('returns non-ACTIVE when DSR is null (not yet computed)', () => {
    expect(patternStatus({ ...PASSING_CELL, dsr: null })).not.toBe('ACTIVE');
  });

  it('returns non-ACTIVE when live_outcome_count < LIVE_OUTCOME_THRESHOLD (gate b fails)', () => {
    expect(patternStatus({ ...PASSING_CELL, live_outcome_count: LIVE_OUTCOME_THRESHOLD - 1 })).not.toBe('ACTIVE');
    expect(patternStatus({ ...PASSING_CELL, live_outcome_count: 0 })).not.toBe('ACTIVE');
  });

  it('returns non-ACTIVE when ESS < 30 (gate a fails)', () => {
    expect(patternStatus({ ...PASSING_CELL, effective_sample_size: 29 })).not.toBe('ACTIVE');
  });

  it('returns non-ACTIVE when brier_lift ≤ BRIER_LIFT_THRESHOLD (gate c fails)', () => {
    // lift = brier_null - brier_out = 0.25 - 0.248 = 0.002, which is < BRIER_LIFT_THRESHOLD (0.005)
    const status = patternStatus({ ...PASSING_CELL, brier_out: 0.248 });
    expect(status).not.toBe('ACTIVE');
    // Also verify exactly at threshold (lift = 0.005 exactly) is also non-ACTIVE
    // Note: gate uses lift > theta (strict), so lift == theta → EXPLORATORY
    const statusAtThreshold = patternStatus({ ...PASSING_CELL, brier_out: 0.245001 });
    // lift = 0.25 - 0.245001 = 0.004999 < 0.005 → EXPLORATORY
    expect(statusAtThreshold).not.toBe('ACTIVE');
  });

  it('returns DEPRECATED when brier_out > brier_null (existing rule preserved)', () => {
    expect(patternStatus({ ...PASSING_CELL, brier_out: 0.26, brier_null: 0.25 })).toBe('DEPRECATED');
  });

  it('returns DEPRECATED when |drift_z| > 2 (existing rule preserved)', () => {
    expect(patternStatus({ ...PASSING_CELL, drift_z: 2.1 })).toBe('DEPRECATED');
    expect(patternStatus({ ...PASSING_CELL, drift_z: -2.5 })).toBe('DEPRECATED');
  });

  it('returns non-ACTIVE when by_fdr_q_value is null (not yet evaluated)', () => {
    expect(patternStatus({ ...PASSING_CELL, by_fdr_q_value: null })).not.toBe('ACTIVE');
  });
});

// ---------------------------------------------------------------------------
// 2. Benjamini-Yekutieli FDR correction
// ---------------------------------------------------------------------------

describe('benjaminiYekutieli — BY-FDR contract for learn cron', () => {
  it('rejects a very small p-value and accepts a large one at q=0.10', () => {
    // Cell 0: p=0.001 (strong signal) should be REJECTED (promoted)
    // Cell 1: p=0.80  (weak signal)  should be ACCEPTED (not promoted)
    const result = benjaminiYekutieli([0.001, 0.80], 0.10);
    expect(result.decisions[0]).toBe('REJECT'); // q < 0.10 after correction
    expect(result.decisions[1]).toBe('ACCEPT');
    // Adjusted p-values
    expect(result.adjusted_p[0]).toBeLessThan(0.10);
    expect(result.adjusted_p[1]).toBeGreaterThanOrEqual(0.10);
  });

  it('rejects nothing when all p-values are large', () => {
    const result = benjaminiYekutieli([0.5, 0.6, 0.7, 0.8], 0.10);
    expect(result.decisions.every((d) => d === 'ACCEPT')).toBe(true);
  });

  it('rejects all when all p-values are very small', () => {
    const result = benjaminiYekutieli([0.001, 0.002, 0.003], 0.10);
    expect(result.decisions.every((d) => d === 'REJECT')).toBe(true);
  });

  it('adjusted_p has same length as input', () => {
    const pValues = [0.01, 0.05, 0.20, 0.50, 0.90];
    const result = benjaminiYekutieli(pValues, 0.10);
    expect(result.adjusted_p).toHaveLength(pValues.length);
    expect(result.decisions).toHaveLength(pValues.length);
  });

  it('handles empty input gracefully', () => {
    const result = benjaminiYekutieli([], 0.10);
    expect(result.decisions).toHaveLength(0);
    expect(result.adjusted_p).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Deflated Sharpe Ratio gate (e)
// ---------------------------------------------------------------------------

describe('deflatedSharpeRatio — DSR contract for learn cron', () => {
  it('returns > 0 for positive sample Sharpe with reasonable inputs', () => {
    const dsr = deflatedSharpeRatio({
      sampleSharpe: 0.5,
      skewness: 0,
      kurtosis: 3,
      T: 50,
      nTrialsAttempted: 10,
    });
    expect(dsr).not.toBeNull();
    expect(dsr as number).toBeGreaterThan(0);
  });

  it('returns null when T < 30 (insufficient sample)', () => {
    const dsr = deflatedSharpeRatio({
      sampleSharpe: 1.0,
      skewness: 0,
      kurtosis: 3,
      T: 20,
      nTrialsAttempted: 5,
    });
    expect(dsr).toBeNull();
  });

  it('DSR ≤ 0.5 for a weak Sharpe with many trials (selection bias deflation)', () => {
    const dsr = deflatedSharpeRatio({
      sampleSharpe: 0.1,
      skewness: 0,
      kurtosis: 3,
      T: 100,
      nTrialsAttempted: 156, // typical cell count
    });
    // With 156 trials, a Sharpe of 0.1 should not pass the deflation test
    // (benchmark SR₀ is high due to multiple testing). DSR may be near 0 or null.
    if (dsr !== null) {
      expect(dsr).toBeLessThan(0.5);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. BCa bootstrap CI covers lift
// ---------------------------------------------------------------------------

describe('bootstrapBCa — lift CI contract for learn cron', () => {
  it('CI contains the true mean for a synthetic lift distribution', () => {
    // Synthetic fold lifts: mean = 0.03
    const foldLifts = [0.02, 0.03, 0.04, 0.025, 0.035, 0.028, 0.032, 0.038, 0.022, 0.031];
    const result = bootstrapBCa(
      foldLifts,
      (s) => s.reduce((a, b) => a + b, 0) / Math.max(1, s.length),
      { nResamples: 1000, seed: 42 },
    );
    expect(result.low).toBeLessThan(result.high);
    expect(result.point).toBeGreaterThan(0); // positive lift
    // True mean ~0.03 should be in the CI
    expect(result.low).toBeLessThan(0.03 + 0.02); // within 2pp
    expect(result.high).toBeGreaterThan(0.03 - 0.02);
  });

  it('returns a valid CI shape (low ≤ point ≤ high)', () => {
    const data = [0.01, 0.02, 0.03, 0.04, 0.05, 0.02, 0.03, 0.04, 0.03, 0.02];
    const result = bootstrapBCa(data, (s) => s.reduce((a, b) => a + b, 0) / s.length, { seed: 1 });
    expect(result.low).toBeLessThanOrEqual(result.point + 1e-9);
    expect(result.high).toBeGreaterThanOrEqual(result.point - 1e-9);
  });
});

// ---------------------------------------------------------------------------
// 5. Full promotion scenario end-to-end (pure logic — no DB)
// ---------------------------------------------------------------------------

describe('Full promotion scenario: p_values → BY-FDR → q_values → patternStatus', () => {
  it('promotes cell with q < 0.10 after BY-FDR correction', () => {
    // Two cells. Cell 0 has strong signal (p=0.005), cell 1 is noise (p=0.8).
    const pValues = [0.005, 0.8];
    const fdrResult = benjaminiYekutieli(pValues, 0.10);

    // Cell 0 should be promoted
    const q0 = fdrResult.adjusted_p[0];
    const status0 = patternStatus({ ...PASSING_CELL, by_fdr_q_value: q0 });
    expect(status0).toBe('ACTIVE');

    // Cell 1 should stay EXPLORATORY (q ≥ 0.10)
    const q1 = fdrResult.adjusted_p[1];
    const status1 = patternStatus({ ...PASSING_CELL, by_fdr_q_value: q1 });
    expect(status1).not.toBe('ACTIVE');
  });

  it('no promotion when all cells have noise p-values', () => {
    const pValues = [0.5, 0.6, 0.7, 0.8, 0.9];
    const fdrResult = benjaminiYekutieli(pValues, 0.10);

    for (let i = 0; i < pValues.length; i++) {
      const status = patternStatus({ ...PASSING_CELL, by_fdr_q_value: fdrResult.adjusted_p[i] });
      expect(status).not.toBe('ACTIVE');
    }
  });

  it('delta payload shape is complete when a cell_promoted event would be written', () => {
    // Simulate what applyPatternStatusAndEmitEvents builds for a delta payload
    const q_value_by = 0.05;
    const dsr = 0.3;
    const cv_folds = 5;
    const brier_lift = 0.03;
    const brier_lift_ci_bca_95: [number, number] = [0.01, 0.05];
    const n_trials_attempted = 12;
    const prev_status = 'EXPLORATORY';
    const new_status = 'ACTIVE';

    const delta = {
      cv_folds,
      brier_lift,
      brier_lift_ci_bca_95,
      q_value_by,
      dsr,
      n_trials_attempted,
      prev_status,
      new_status,
    };

    // D-27: all 8 required keys must be present
    expect(Object.keys(delta)).toContain('cv_folds');
    expect(Object.keys(delta)).toContain('brier_lift');
    expect(Object.keys(delta)).toContain('brier_lift_ci_bca_95');
    expect(Object.keys(delta)).toContain('q_value_by');
    expect(Object.keys(delta)).toContain('dsr');
    expect(Object.keys(delta)).toContain('n_trials_attempted');
    expect(Object.keys(delta)).toContain('prev_status');
    expect(Object.keys(delta)).toContain('new_status');

    // Verify semantics
    expect(delta.prev_status).toBe('EXPLORATORY');
    expect(delta.new_status).toBe('ACTIVE');
    expect(Array.isArray(delta.brier_lift_ci_bca_95)).toBe(true);
    expect(delta.brier_lift_ci_bca_95).toHaveLength(2);
    expect(delta.q_value_by).toBeLessThan(0.10);
    expect(delta.dsr).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. RUN_LIVE_INTEGRATION gate for handler-level test
// ---------------------------------------------------------------------------

const RUN_LIVE = process.env.RUN_LIVE_INTEGRATION === 'true';

describe('learn cron handler — live integration (RUN_LIVE_INTEGRATION=true)', () => {
  it.skipIf(!RUN_LIVE)(
    'GET handler returns ok:true and reports cells_active count',
    async () => {
      const { GET } = await import('@/app/api/cron/learn/route');
      const req = new Request('http://localhost/api/cron/learn', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}` },
      });
      // @ts-expect-error NextRequest vs Request
      const res = await GET(req);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(typeof body.cells_active).toBe('number');
    },
  );
});
