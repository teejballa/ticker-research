// src/components/__tests__/EngineCalibrationPanel.test.tsx
// Verifies the EngineCalibrationPanel renders authoritative calibration data
// — posterior, logistic score, status badge, drift gauge, alignment text.

// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EngineCalibrationPanel from '../EngineCalibrationPanel';
import type { EngineCalibration } from '@/lib/types';

const ACTIVE_CALIBRATION: EngineCalibration = {
  cycle_count: 47,
  flow_pattern: 'niche_leads',
  cap_class: 'large_cap',
  trace_window_size: 4,
  posterior_mean: 0.71,
  ci_low: 0.51,
  ci_high: 0.86,
  sample_size: 23,
  status: 'ACTIVE',
  brier_in_sample: 0.18,
  brier_null: 0.25,
  drift_z: 0.4,
  logistic_score: 0.68,
  logistic_ci_low: 0.49,
  logistic_ci_high: 0.83,
  logistic_sample_size: 87,
  predicted_at: new Date().toISOString(),
  engine_alignment:
    'Gemini\'s qualitative read of bullish institutional accumulation aligns with the engine\'s high-confidence niche_leads prior (n=23). Confidence: HIGH.',
  engine_disagreement: null,
  diffusion_sparkline: [
    { niche: 2, middle: 0, mainstream: 0, scanned_at: '2026-04-23T15:00:00.000Z' },
    { niche: 6, middle: 2, mainstream: 0, scanned_at: '2026-04-24T15:00:00.000Z' },
    { niche: 9, middle: 4, mainstream: 2, scanned_at: '2026-04-25T15:00:00.000Z' },
    { niche: 12, middle: 6, mainstream: 4, scanned_at: '2026-04-26T15:00:00.000Z' },
  ],
};

describe('EngineCalibrationPanel', () => {
  it('renders cycle count, pattern, cap class, and ACTIVE badge', () => {
    render(<EngineCalibrationPanel calibration={ACTIVE_CALIBRATION} />);
    expect(screen.getByTestId('engine-calibration-panel')).toBeTruthy();
    expect(screen.getByText('Engine Calibration')).toBeTruthy();
    expect(screen.getByText('Cycle 47')).toBeTruthy();
    expect(screen.getByText(/NICHE LEADS/)).toBeTruthy();
    expect(screen.getByText(/LARGE CAP/)).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  it('renders engine prior 71% with credible interval and sample size', () => {
    render(<EngineCalibrationPanel calibration={ACTIVE_CALIBRATION} />);
    expect(screen.getByText('Engine Prior')).toBeTruthy();
    expect(screen.getByText('71%')).toBeTruthy();
    expect(screen.getByText(/\[51% – 86%\] · n=23/)).toBeTruthy();
  });

  it('renders logistic score with its own CI', () => {
    render(<EngineCalibrationPanel calibration={ACTIVE_CALIBRATION} />);
    expect(screen.getByText('Logistic Score')).toBeTruthy();
    expect(screen.getByText('68%')).toBeTruthy();
    expect(screen.getByText(/\[49% – 83%\] · n=87/)).toBeTruthy();
  });

  it('renders adversarial null Brier (real vs null)', () => {
    render(<EngineCalibrationPanel calibration={ACTIVE_CALIBRATION} />);
    expect(screen.getByText('Adversarial Null')).toBeTruthy();
    expect(screen.getByText('0.18')).toBeTruthy();
    expect(screen.getByText(/null 0\.25 · beats chance/)).toBeTruthy();
  });

  it('renders drift gauge with NORMAL label when |z| <= 2', () => {
    render(<EngineCalibrationPanel calibration={ACTIVE_CALIBRATION} />);
    expect(screen.getByText('NORMAL')).toBeTruthy();
    expect(screen.getByText('z = 0.40')).toBeTruthy();
  });

  it('renders DRIFTING label when |z| > 2', () => {
    render(<EngineCalibrationPanel calibration={{ ...ACTIVE_CALIBRATION, drift_z: 2.5, status: 'DEPRECATED' }} />);
    expect(screen.getByText('DRIFTING')).toBeTruthy();
    expect(screen.getByText('z = 2.50')).toBeTruthy();
    expect(screen.getByText('DEPRECATED')).toBeTruthy();
  });

  it('renders engine_alignment block when present', () => {
    render(<EngineCalibrationPanel calibration={ACTIVE_CALIBRATION} />);
    expect(screen.getByText('Engine Alignment')).toBeTruthy();
    expect(screen.getByText(/niche_leads prior \(n=23\)/)).toBeTruthy();
  });

  it('renders engine_disagreement block in error styling when present', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      engine_alignment: null,
      engine_disagreement: 'Despite a 71% prior, the most recent niche thread surfaced a major regulatory disclosure that materially changes the bull case.',
    }} />);
    expect(screen.getByText('Engine Disagreement')).toBeTruthy();
    expect(screen.getByText(/regulatory disclosure/)).toBeTruthy();
    expect(screen.queryByText('Engine Alignment')).toBeNull();
  });

  it('renders gracefully with NO_DATA status (no posterior, no Brier)', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      flow_pattern: null,
      posterior_mean: null,
      ci_low: null,
      ci_high: null,
      sample_size: 0,
      status: 'NO_DATA',
      brier_in_sample: null,
      brier_null: null,
      logistic_score: null,
      logistic_ci_low: null,
      logistic_ci_high: null,
      logistic_sample_size: 0,
      engine_alignment: null,
      engine_disagreement: null,
    }} />);
    expect(screen.getByText('NO DATA')).toBeTruthy();
    expect(screen.getByText(/NO PATTERN/)).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3); // three metric cards display dashes
  });
});
