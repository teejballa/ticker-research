// @vitest-environment jsdom
// tests/composite/panel-headline.unit.test.tsx
// Phase 24 Wave 4 Task 24-04-01 (REASON-03).
//
// Direct-props tests (Wave 0 scaffold contract preserved):
//   - CompositeHeadline renders "X%" + CI range when gate_status = 'active'
//   - CompositeHeadline renders "insufficient signal coverage" when gate_status = 'insufficient_coverage'
//   - CompositeHeadline renders "insufficient history" when gate_status = 'insufficient_history'
//
// Panel-integration tests (plan spec):
//   - CompositeHeadline mounts inside EngineCalibrationPanel with correct copy per gate state
//   - PER-CLASS BREAKDOWN eyebrow appears above QuadClassPanel
//   - SourceMixRow (Phase 22) still renders in its historical position (D-04 coexistence)
//
// Rule 1 (Wave 0 scaffold defect fix) — top-of-file ESM imports; no require().

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompositeHeadline } from '@/components/CompositeHeadline';
import { EngineCalibrationPanel } from '@/components/EngineCalibrationPanel';
import type { EngineCalibration } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────
// Section 1: Direct-props CompositeHeadline tests (Wave 0 scaffold contract)
// ─────────────────────────────────────────────────────────────────────────

describe('CompositeHeadline (direct props — REASON-03)', () => {
  it('renders "X%" and CI range when gate_status = active', () => {
    render(
      <CompositeHeadline
        prob={0.72}
        ciLow={0.64}
        ciHigh={0.79}
        classCount={3}
        gateStatus="active"
      />,
    );
    const headline = screen.getByTestId('composite-headline');
    expect(headline.textContent).toContain('72%');
    expect(headline.textContent).toMatch(/64/);
    expect(headline.textContent).toMatch(/79/);
    expect(headline.textContent).toMatch(/3 of 4/);
  });

  it('renders "insufficient signal coverage" when gate_status = insufficient_coverage', () => {
    render(
      <CompositeHeadline
        prob={null}
        ciLow={null}
        ciHigh={null}
        classCount={1}
        gateStatus="insufficient_coverage"
      />,
    );
    const headline = screen.getByTestId('composite-headline');
    expect(headline.textContent).toMatch(/insufficient signal coverage/i);
    expect(headline.textContent).toContain('fewer than 2 signal classes are TRUSTED yet.');
    expect(headline.textContent).not.toMatch(/\d+%/);
  });

  it('renders "insufficient history" copy when gate_status = insufficient_history', () => {
    render(
      <CompositeHeadline
        prob={null}
        ciLow={null}
        ciHigh={null}
        classCount={0}
        gateStatus="insufficient_history"
      />,
    );
    const headline = screen.getByTestId('composite-headline');
    expect(headline.textContent).toContain('insufficient history');
    expect(headline.textContent).toContain('warming up');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Section 2: EngineCalibrationPanel integration tests (plan spec)
// ─────────────────────────────────────────────────────────────────────────

/** Build a minimally valid EngineCalibration for panel mount. Only composite_* +
 *  the smallest set of required fields are populated; all other fields default
 *  to null/0/[] since the tests only assert on composite / eyebrow / source-mix. */
function makeCalibration(overrides: Partial<EngineCalibration> = {}): EngineCalibration {
  const base: EngineCalibration = {
    // Core diffusion fields (required, non-optional)
    cycle_count: 0,
    flow_pattern: null,
    cap_class: 'large_cap',
    trace_window_size: 0,
    posterior_mean: null,
    ci_low: null,
    ci_high: null,
    sample_size: 0,
    status: 'NO_DATA',
    brier_in_sample: null,
    brier_null: null,
    drift_z: 0,
    logistic_score: null,
    logistic_ci_low: null,
    logistic_ci_high: null,
    logistic_sample_size: 0,
    predicted_at: new Date().toISOString(),
    engine_alignment: null,
    engine_disagreement: null,
    diffusion_sparkline: [],
    // Composite (Phase 24 Wave 3) — default to insufficient_history
    composite_prob: null,
    composite_ci_low: null,
    composite_ci_high: null,
    composite_class_count: 0,
    composite_gate_status: 'insufficient_history',
    composite_class_weights: { diffusion: 0, technical: 0, institutional: 0, insider: 0 },
    composite_per_class_calibrated: { diffusion: null, technical: null, institutional: null, insider: null },
  };
  return { ...base, ...overrides };
}

// Expand panel by default so composite headline + per-class breakdown are visible.
// Panel is collapsed-by-default (Sep 10 UI overhaul). We click the expand toggle first.
// Use fireEvent (react-testing-library helper) so React state updates flush before
// the assertion runs — plain `.click()` doesn't trigger the React event system in jsdom.
function renderExpanded(calibration: EngineCalibration) {
  const utils = render(<EngineCalibrationPanel calibration={calibration} />);
  const toggle = utils.getByRole('button', { name: /how does the engine work/i });
  fireEvent.click(toggle);
  return utils;
}

describe('EngineCalibrationPanel — composite headline slot (Phase 24 D-04, REASON-03)', () => {
  it('renders composite prob + CI + K-of-4 subline when gate_status=active', () => {
    const calibration = makeCalibration({
      composite_gate_status: 'active',
      composite_prob: 0.72,
      composite_ci_low: 0.64,
      composite_ci_high: 0.79,
      composite_class_count: 3,
    });
    renderExpanded(calibration);
    const headline = screen.getByTestId('composite-headline');
    expect(headline.textContent).toContain('Cipher Composite Signal');
    expect(headline.textContent).toContain('72%');
    expect(headline.textContent).toMatch(/64/);
    expect(headline.textContent).toMatch(/79/);
    expect(headline.textContent).toMatch(/3 of 4/);
  });

  it('renders "insufficient signal coverage" copy in the panel when gate_status=insufficient_coverage', () => {
    const calibration = makeCalibration({
      composite_gate_status: 'insufficient_coverage',
      composite_prob: null,
      composite_class_count: 1,
    });
    renderExpanded(calibration);
    const headline = screen.getByTestId('composite-headline');
    expect(headline.textContent).toContain('insufficient signal coverage');
    expect(headline.textContent).toContain('fewer than 2 signal classes are TRUSTED yet.');
    expect(headline.textContent).not.toMatch(/\d+%/);
  });

  it('renders "insufficient history" copy in the panel when gate_status=insufficient_history', () => {
    const calibration = makeCalibration({
      composite_gate_status: 'insufficient_history',
      composite_prob: null,
      composite_class_count: 0,
    });
    renderExpanded(calibration);
    const headline = screen.getByTestId('composite-headline');
    expect(headline.textContent).toContain('insufficient history');
    expect(headline.textContent).toContain('warming up');
  });

  it('renders PER-CLASS BREAKDOWN eyebrow above the quad/diffusion panel', () => {
    const calibration = makeCalibration({
      composite_gate_status: 'active',
      composite_prob: 0.5,
      composite_ci_low: 0.4,
      composite_ci_high: 0.6,
      composite_class_count: 4,
    });
    renderExpanded(calibration);
    const eyebrow = screen.getByTestId('per-class-breakdown-eyebrow');
    expect(eyebrow.textContent).toMatch(/per-class breakdown/i);
  });

  it('preserves SourceMixRow when source_mix is populated (D-04 coexistence)', () => {
    const calibration = makeCalibration({
      composite_gate_status: 'active',
      composite_prob: 0.5,
      composite_ci_low: 0.4,
      composite_ci_high: 0.6,
      composite_class_count: 4,
      source_mix: {
        regime: 'ALL',
        top_sources: [
          {
            source_id: 'stocktwits',
            weight: 0.4,
            weight_unconditional: 0.35,
            weight_drift_30d: [0.3, 0.35, 0.4],
            drift_direction: 'rising',
            delta_pp_30d: 5,
            is_cold_start_fallback: false,
          },
        ],
      },
    });
    renderExpanded(calibration);
    expect(screen.queryByTestId('source-mix-row')).not.toBeNull();
  });
});
