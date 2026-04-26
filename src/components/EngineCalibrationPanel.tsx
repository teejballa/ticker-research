'use client';

// src/components/EngineCalibrationPanel.tsx
// Renders the diffusion-engine prior carried inside each report.
// All numbers shown here are authoritative — written by getEngineContextForTicker
// at report-generation time, not by the LLM. The panel hides itself when
// engine_calibration is undefined (old reports) but renders even at NO_DATA so
// the reader can see the engine is aware of the ticker but has no prior yet.

import type { EngineCalibration } from '@/lib/types';

interface EngineCalibrationPanelProps {
  calibration: EngineCalibration;
}

const STATUS_BADGE: Record<EngineCalibration['status'], string> = {
  ACTIVE: 'bg-secondary/20 text-secondary border-secondary/40',
  EXPLORATORY: 'bg-tertiary/20 text-tertiary border-tertiary/40',
  DEPRECATED: 'bg-error/20 text-error border-error/40',
  NO_DATA: 'bg-surface-container-highest text-on-surface-variant border-outline/30',
};

const STATUS_LABEL: Record<EngineCalibration['status'], string> = {
  ACTIVE: 'ACTIVE',
  EXPLORATORY: 'EXPLORATORY',
  DEPRECATED: 'DEPRECATED',
  NO_DATA: 'NO DATA',
};

const FLOW_LABEL: Record<NonNullable<EngineCalibration['flow_pattern']>, string> = {
  niche_leads: 'NICHE LEADS',
  simultaneous: 'SIMULTANEOUS',
  mainstream_first: 'MAINSTREAM FIRST',
  flat: 'FLAT',
};

const CAP_LABEL: Record<EngineCalibration['cap_class'], string> = {
  large_cap: 'LARGE CAP',
  mid_cap: 'MID CAP',
  small_cap: 'SMALL CAP',
  unknown: 'CAP UNKNOWN',
};

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(0)}%`;
}

function formatBrier(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const seconds = Math.max(0, (Date.now() - t) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  return `${Math.round(days)}d ago`;
}

function DriftGauge({ z }: { z: number }) {
  // 10-segment gauge, ±2σ saturates ends.
  const clamped = Math.max(-2, Math.min(2, z));
  const filled = Math.round(((clamped + 2) / 4) * 10);
  const drifting = Math.abs(z) > 2;
  const label = drifting ? 'DRIFTING' : 'NORMAL';
  const labelClass = drifting ? 'text-error' : 'text-secondary';
  return (
    <div className="flex items-center gap-3 text-[11px] font-mono">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className={`inline-block w-2 h-2 rounded-full ${
              i < filled ? (drifting ? 'bg-error' : 'bg-secondary') : 'bg-surface-container-highest'
            }`}
          />
        ))}
      </div>
      <span className={`tracking-widest font-bold ${labelClass}`}>{label}</span>
      <span className="text-on-surface-variant">z = {z.toFixed(2)}</span>
    </div>
  );
}

function Sparkline({ data }: { data: EngineCalibration['diffusion_sparkline'] }) {
  if (!data || data.length < 2) return null;
  const W = 120;
  const H = 32;
  const all = data.flatMap(d => [d.niche, d.middle, d.mainstream]);
  const max = Math.max(1, ...all);
  const xStep = data.length > 1 ? W / (data.length - 1) : W;
  const buildPath = (key: 'niche' | 'middle' | 'mainstream') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${i * xStep} ${H - (d[key] / max) * H}`).join(' ');

  return (
    <svg width={W} height={H} className="overflow-visible" aria-hidden="true">
      <path d={buildPath('mainstream')} stroke="currentColor" className="text-outline-variant" strokeWidth="1.5" fill="none" />
      <path d={buildPath('middle')}     stroke="currentColor" className="text-tertiary"        strokeWidth="1.5" fill="none" />
      <path d={buildPath('niche')}      stroke="currentColor" className="text-secondary"       strokeWidth="2"   fill="none" />
    </svg>
  );
}

function MetricCard({
  label, value, subValue, tooltip,
}: { label: string; value: string; subValue: string; tooltip: string }) {
  return (
    <div className="bg-surface-container-high p-4 rounded-lg flex flex-col gap-1.5" title={tooltip}>
      <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">{label}</span>
      <span className="font-mono text-2xl font-bold text-on-surface tabular-nums">{value}</span>
      <span className="text-[11px] font-mono text-on-surface-variant">{subValue}</span>
    </div>
  );
}

export function EngineCalibrationPanel({ calibration }: EngineCalibrationPanelProps) {
  const {
    cycle_count,
    flow_pattern,
    cap_class,
    posterior_mean,
    ci_low,
    ci_high,
    sample_size,
    status,
    brier_in_sample,
    brier_null,
    drift_z,
    logistic_score,
    logistic_ci_low,
    logistic_ci_high,
    logistic_sample_size,
    predicted_at,
    engine_alignment,
    engine_disagreement,
    diffusion_sparkline,
  } = calibration;

  const patternLabel = flow_pattern ? FLOW_LABEL[flow_pattern] : 'NO PATTERN';
  const capLabel = CAP_LABEL[cap_class];

  return (
    <section
      data-testid="engine-calibration-panel"
      className="bg-surface-container border border-surface-container-high p-6 rounded-lg relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-tertiary/5 blur-[100px]" aria-hidden="true" />

      {/* Header row */}
      <div className="flex items-center justify-between mb-5 relative">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-tertiary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
            psychology
          </span>
          <h3 className="text-[11px] font-bold tracking-widest uppercase text-tertiary">
            Engine Calibration
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-on-surface-variant tracking-widest uppercase">
          <span>Cycle {cycle_count}</span>
          <span className="opacity-50">·</span>
          <span>{timeAgo(predicted_at)}</span>
        </div>
      </div>

      {/* Pattern detected */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-surface-container-high">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">Pattern detected</span>
          <span className="font-mono text-sm font-bold text-on-surface tracking-wide">
            {patternLabel} <span className="text-on-surface-variant mx-1">×</span> {capLabel}
          </span>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${STATUS_BADGE[status]}`}
          title={
            status === 'ACTIVE'      ? 'Pattern beats the adversarial null with n ≥ 10. Engine defers to this prior.' :
            status === 'EXPLORATORY' ? 'Pattern has fewer than 10 confirmed cases. Treat the prior as weak.' :
            status === 'DEPRECATED'  ? 'Pattern has drifted (|z| > 2σ) or is now worse than chance. Prior is not trusted.' :
                                       'No historical posterior available for this pattern × cap class.'
          }
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {/* Three-card metric grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <MetricCard
          label="Engine Prior"
          value={formatPct(posterior_mean)}
          subValue={posterior_mean != null ? `[${formatPct(ci_low)} – ${formatPct(ci_high)}] · n=${sample_size}` : `n=${sample_size}`}
          tooltip="Bayesian Beta-Bernoulli posterior probability that this pattern × cap class produces a 7-day return >1% above SPY. The 95% credible interval shows the engine's uncertainty given sample size n."
        />
        <MetricCard
          label="Logistic Score"
          value={formatPct(logistic_score)}
          subValue={logistic_score != null ? `[${formatPct(logistic_ci_low)} – ${formatPct(logistic_ci_high)}] · n=${logistic_sample_size}` : `n=${logistic_sample_size}`}
          tooltip="Bayesian-logistic forward pass over this report's diffusion features (v_niche, v_middle, v_mainstream, niche_lead_cycles, q_z, qual_z). CI is the 95% interval after propagating coefficient variance through the linear predictor."
        />
        <MetricCard
          label="Adversarial Null"
          value={formatBrier(brier_in_sample)}
          subValue={brier_null != null ? `null ${formatBrier(brier_null)} · ${brier_in_sample != null && brier_in_sample < brier_null ? 'beats' : 'loses to'} chance` : 'n/a'}
          tooltip="Brier score (mean squared error vs outcome) of the real predictor compared with shuffled-outcome nulls. Lower is better; if real < null, the pattern carries real signal beyond chance."
        />
      </div>

      {/* Drift gauge */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-surface-container-high">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">Concept drift</span>
          <DriftGauge z={drift_z} />
        </div>
        {diffusion_sparkline && diffusion_sparkline.length >= 2 && (
          <div className="flex items-center gap-3 text-[10px] font-mono text-on-surface-variant tracking-widest uppercase">
            <span className="text-secondary">niche</span>
            <span className="text-tertiary">middle</span>
            <span className="text-outline-variant">mainstream</span>
            <Sparkline data={diffusion_sparkline} />
          </div>
        )}
      </div>

      {/* Engine alignment / disagreement */}
      {(engine_alignment || engine_disagreement) && (
        <div className="space-y-3">
          {engine_alignment && (
            <div className="bg-secondary/5 border-l-2 border-secondary p-4 rounded-r">
              <h4 className="text-[10px] font-bold tracking-widest uppercase text-secondary mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Engine Alignment
              </h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">{engine_alignment}</p>
            </div>
          )}
          {engine_disagreement && (
            <div className="bg-error/5 border-l-2 border-error p-4 rounded-r">
              <h4 className="text-[10px] font-bold tracking-widest uppercase text-error mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">error</span>
                Engine Disagreement
              </h4>
              <p className="text-xs text-on-surface-variant leading-relaxed">{engine_disagreement}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer note */}
      <p className="mt-4 text-[10px] text-on-surface-variant tracking-wide leading-relaxed">
        ↳ This prediction will be auto-verified at 3, 7, and 14 days. The engine's posterior updates online — re-running this report after the next learning cycle may show different numbers.
      </p>
    </section>
  );
}

export default EngineCalibrationPanel;
