import { describe, it, expect } from 'vitest';
import { patternStatus } from '../learning';

describe('patternStatus 5-gate (Phase 21.1 D-26)', () => {
  it('returns ACTIVE only when all 5 gates pass', () => {
    const status = patternStatus({
      sample_size: 50,
      brier_in: 0.20,
      brier_out: 0.22,
      brier_null: 0.25,
      drift_z: 0.5,
      effective_sample_size: 35,
      live_outcome_count: 12,
      brier_lift_threshold: 0.005,
      by_fdr_q_value: 0.05,
      dsr: 0.3,
    } as any);
    expect(status).toBe('ACTIVE');
  });

  it('returns EXPLORATORY when BY-FDR q ≥ 0.10', () => {
    const status = patternStatus({
      sample_size: 50,
      brier_in: 0.20, brier_out: 0.22, brier_null: 0.25,
      drift_z: 0.5,
      effective_sample_size: 35,
      live_outcome_count: 12,
      brier_lift_threshold: 0.005,
      by_fdr_q_value: 0.15,
      dsr: 0.3,
    } as any);
    expect(status).not.toBe('ACTIVE');
  });

  it('returns EXPLORATORY when DSR ≤ 0', () => {
    const status = patternStatus({
      sample_size: 50,
      brier_in: 0.20, brier_out: 0.22, brier_null: 0.25,
      drift_z: 0.5,
      effective_sample_size: 35,
      live_outcome_count: 12,
      brier_lift_threshold: 0.005,
      by_fdr_q_value: 0.05,
      dsr: -0.1,
    } as any);
    expect(status).not.toBe('ACTIVE');
  });

  it('respects existing enforceLiveOnlyGate (live_outcome_count < 10 demotes)', () => {
    const status = patternStatus({
      sample_size: 50,
      brier_in: 0.20, brier_out: 0.22, brier_null: 0.25,
      drift_z: 0.5,
      effective_sample_size: 35,
      live_outcome_count: 5,
      brier_lift_threshold: 0.005,
      by_fdr_q_value: 0.05,
      dsr: 0.3,
    } as any);
    expect(status).not.toBe('ACTIVE');
  });
});
