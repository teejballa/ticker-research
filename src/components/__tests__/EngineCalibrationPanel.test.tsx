// src/components/__tests__/EngineCalibrationPanel.test.tsx
// Verifies the EngineCalibrationPanel renders authoritative calibration data
// — posterior, logistic score, status badge, drift gauge, alignment text.

// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    expect(screen.getByText(/Calibration vs\. (sector|market)/i)).toBeTruthy();
    expect(screen.getByText('Cycle 47')).toBeTruthy();
    expect(screen.getByText(/NICHE LEADS/)).toBeTruthy();
    expect(screen.getByText(/LARGE CAP/)).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  // ── Phase 21 (21-4-07) — sector-relative headline + SPY-alpha diagnostic ──

  it('renders headline "Calibration vs. market (SPY)" when no sector data is present', () => {
    render(<EngineCalibrationPanel calibration={ACTIVE_CALIBRATION} />);
    expect(screen.getByText(/Calibration vs\. market \(SPY\)/i)).toBeTruthy();
  });

  it('shows anchored label "sector (XLK)" when primary_sector_etf_is_current is false', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      primary_sector_etf: 'XLK',
      primary_sector_etf_is_current: false,
      spy_alpha_hit_rate: 0.54,
    }} />);
    expect(screen.getByText(/sector \(XLK\)/)).toBeTruthy();
  });

  it('shows cold-start honesty label "sector (current)" when primary_sector_etf_is_current is true', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      primary_sector_etf: 'XLK',
      primary_sector_etf_is_current: true,
    }} />);
    expect(screen.getByText(/sector \(current\)/i)).toBeTruthy();
  });

  it('renders secondary "vs market (SPY-alpha, derived)" tile when sector is non-SPY', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      primary_sector_etf: 'XLK',
      primary_sector_etf_is_current: false,
      spy_alpha_hit_rate: 0.54,
    }} />);
    expect(screen.getByText(/SPY-alpha, derived/i)).toBeTruthy();
    expect(screen.getByText(/0\.54/)).toBeTruthy();
  });

  it('omits the secondary SPY-alpha tile when sector resolves to SPY (fallback case)', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      primary_sector_etf: 'SPY',
      spy_alpha_hit_rate: 0.54,
    }} />);
    expect(screen.queryByText(/SPY-alpha, derived/i)).toBeNull();
    // Headline collapses to the legacy "market (SPY)" wording when sector === SPY.
    expect(screen.getByText(/Calibration vs\. market \(SPY\)/i)).toBeTruthy();
  });

  it('omits the secondary SPY-alpha tile when spy_alpha_hit_rate is null even for a non-SPY sector', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      primary_sector_etf: 'XLK',
      primary_sector_etf_is_current: false,
      spy_alpha_hit_rate: null,
    }} />);
    expect(screen.getByText(/sector \(XLK\)/)).toBeTruthy();
    expect(screen.queryByText(/SPY-alpha, derived/i)).toBeNull();
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

  // ── Phase 22 Wave 5 (D-17, CORE-ML-27) — Source-mix row ─────────────────
  // Contract per 22-UI-SPEC §Test Hooks. Numerics arrive pre-computed from
  // engine-context.buildSourceMix — this component does zero math.

  const POPULATED_SOURCE_MIX = {
    regime: 'bear-high-vol' as const,
    top_sources: [
      {
        source_id: 'stocktwits' as const,
        weight: 0.34,
        weight_unconditional: 0.28,
        weight_drift_30d: Array.from({ length: 30 }, (_, i) => 0.28 + (i / 29) * 0.06),
        drift_direction: 'rising' as const,
        delta_pp_30d: 6,
        is_cold_start_fallback: false,
      },
      {
        source_id: 'options_term_structure' as const,
        weight: 0.28,
        weight_unconditional: 0.30,
        weight_drift_30d: Array.from({ length: 30 }, () => 0.28),
        drift_direction: 'flat' as const,
        delta_pp_30d: 0,
        is_cold_start_fallback: false,
      },
      {
        source_id: 'reddit' as const,
        weight: 0.19,
        weight_unconditional: 0.22,
        weight_drift_30d: Array.from({ length: 30 }, (_, i) => 0.22 - (i / 29) * 0.03),
        drift_direction: 'falling' as const,
        delta_pp_30d: -3,
        is_cold_start_fallback: false,
      },
      {
        source_id: 'hackernews' as const,
        weight: 0.10,
        weight_unconditional: 0.10,
        weight_drift_30d: Array.from({ length: 30 }, () => 0.10),
        drift_direction: 'flat' as const,
        delta_pp_30d: 0,
        is_cold_start_fallback: false,
      },
      {
        source_id: 'news_analyst' as const,
        weight: 0.09,
        weight_unconditional: 0.10,
        weight_drift_30d: Array.from({ length: 30 }, () => 0.10),
        drift_direction: 'flat' as const,
        delta_pp_30d: 0,
        is_cold_start_fallback: true,
      },
    ],
  };

  it('renders source-mix row with regime pill and top-3 source pills (populated)', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      source_mix: POPULATED_SOURCE_MIX,
    }} />);

    // Row shell present + eyebrow.
    expect(screen.getByTestId('source-mix-row')).toBeTruthy();
    expect(screen.getByText('SOURCE MIX')).toBeTruthy();

    // Regime pill with the verbatim UI-SPEC label.
    const pill = screen.getByTestId('source-mix-regime-pill');
    expect(pill).toBeTruthy();
    expect(pill.textContent).toContain('BEAR · HIGH-VOL');

    // Top-3 source pills — DOM order = sorted DESC by weight (engine-context guarantee).
    expect(screen.getByTestId('source-mix-pill-1').textContent).toContain('STOCKTWITS');
    expect(screen.getByTestId('source-mix-pill-1').textContent).toContain('34%');
    expect(screen.getByTestId('source-mix-pill-2').textContent).toContain('OPTIONS-TS');
    expect(screen.getByTestId('source-mix-pill-3').textContent).toContain('REDDIT');

    // #1 leading source carries the ★ marker + indigo primary treatment.
    // Rendered in both the collapsed top-3 pill AND the expanded panel's
    // rank-1 row — assert at least one exists.
    expect(screen.getAllByTestId('source-mix-leading-star').length).toBeGreaterThanOrEqual(1);
  });

  it('toggles the SourceMixExpanded panel on disclosure click', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      source_mix: POPULATED_SOURCE_MIX,
    }} />);

    const disclosure = screen.getByTestId('source-mix-disclosure');
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure.textContent).toContain('Show full ranking');

    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure.textContent).toContain('Hide full ranking');

    // Expand panel is present (rendered eagerly, animated via max-height).
    expect(screen.getByTestId('source-mix-expanded')).toBeTruthy();
  });

  it('renders REGIME-UNCONDITIONAL cold-start banner when regime is ALL', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      source_mix: {
        regime: 'ALL' as const,
        top_sources: POPULATED_SOURCE_MIX.top_sources.map((s) => ({
          ...s,
          is_cold_start_fallback: true,
        })),
      },
    }} />);

    // Both the regime pill and the sibling cold-start marker exist per UI-SPEC.
    const pill = screen.getByTestId('source-mix-regime-pill');
    expect(pill.textContent).toContain('REGIME-UNCONDITIONAL');
    expect(screen.getByTestId('source-mix-cold-start-banner')).toBeTruthy();
  });

  it('renders source-mix-empty state when top_sources is empty', () => {
    render(<EngineCalibrationPanel calibration={{
      ...ACTIVE_CALIBRATION,
      source_mix: {
        regime: 'bull-low-vol' as const,
        top_sources: [],
      },
    }} />);

    expect(screen.getByTestId('source-mix-empty')).toBeTruthy();
    // Disclosure is suppressed when there is nothing to reveal.
    expect(screen.queryByTestId('source-mix-disclosure')).toBeNull();
  });

  it('renders NOTHING for source-mix row on legacy reports (source_mix undefined)', () => {
    render(<EngineCalibrationPanel calibration={ACTIVE_CALIBRATION} />);
    // No source_mix means the row hides itself entirely — graceful back-compat.
    expect(screen.queryByTestId('source-mix-row')).toBeNull();
  });
});
