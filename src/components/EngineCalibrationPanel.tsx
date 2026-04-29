'use client';

// src/components/EngineCalibrationPanel.tsx
// Renders the diffusion-engine prior carried inside each report.
// All numbers shown here are authoritative — written by getEngineContextForTicker
// at report-generation time, not by the LLM. The panel hides itself when
// engine_calibration is undefined (old reports) but renders even at NO_DATA so
// the reader can see the engine is aware of the ticker but has no prior yet.
//
// Phase 16 (16-04) — DUAL-CLASS layout:
//   - When `horizon_calibrations.length >= 1`: render side-by-side
//     DIFFUSION × TECHNICAL columns + Agreement Badge + Horizon Table
//   - Otherwise: graceful fallback to the existing diffusion-only layout
//     (old persisted reports never partially render the dual-class shell)
// All locked copy + classNames are verbatim per UI-SPEC §A and §C.

import type { EngineCalibration, HorizonCalibration } from '@/lib/types';

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

// Phase 16: TechPattern → display label (UI-SPEC Copywriting Contract lines 350-359)
const TECH_PATTERN_LABEL: Record<string, string> = {
  breakout_uptrend: 'BREAKOUT UPTREND',
  overbought_uptrend: 'OVERBOUGHT UPTREND',
  pullback_in_uptrend: 'PULLBACK IN UPTREND',
  consolidation: 'CONSOLIDATION',
  breakdown: 'BREAKDOWN',
  oversold_downtrend: 'OVERSOLD DOWNTREND',
  death_cross: 'DEATH CROSS',
  golden_cross: 'GOLDEN CROSS',
};

// Phase 16: Agreement Badge state → classes/label/icon/tooltip (UI-SPEC §C lines 226-243)
type AgreementState = 'aligned' | 'mixed' | 'opposed' | 'unknown';
const AGREEMENT_BADGE: Record<AgreementState, {
  text: string;
  classes: string;
  icon: string;
  tooltip: string;
}> = {
  aligned: {
    text: 'ALIGNED',
    classes: 'text-secondary border-secondary/40 bg-secondary/10',
    icon: 'check_circle',
    tooltip: 'Diffusion and technical priors agree on direction at 30d. Conviction compounds.',
  },
  mixed: {
    text: 'MIXED',
    classes: 'text-tertiary border-tertiary/40 bg-tertiary/10',
    icon: 'compare_arrows',
    tooltip: 'Signal classes lean the same direction but differ in magnitude. Read both columns.',
  },
  opposed: {
    text: 'OPPOSED',
    classes: 'text-error border-error/40 bg-error/10',
    icon: 'error',
    tooltip: 'Diffusion and technical priors point opposite directions at 30d. This is intentional surfacing — read engine_alignment AND technical_disagreement.',
  },
  unknown: {
    text: 'UNKNOWN',
    classes: 'text-outline border-outline-variant bg-surface-container-highest',
    icon: 'help',
    tooltip: 'Engine has insufficient data on one or both signal classes. Treat the calibration block as exploratory.',
  },
};

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(0)}%`;
}

function formatBrier(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function formatCi(ci: [number, number] | null | undefined): string {
  if (!ci) return '—';
  return `[${formatPct(ci[0])}–${formatPct(ci[1])}]`;
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

// ── Phase 16 — Agreement Badge (UI-SPEC §C) ────────────────────────────

function AgreementBadge({ state }: { state: AgreementState }) {
  const cfg = AGREEMENT_BADGE[state];
  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-[10px] tracking-widest uppercase font-bold ${cfg.classes}`}
      title={cfg.tooltip}
      data-testid="agreement-badge"
    >
      <span className="material-symbols-outlined text-[12px]" aria-hidden="true">{cfg.icon}</span>
      {cfg.text}
    </span>
  );
}

// ── Phase 16 — Pattern + cap pill (per column) ─────────────────────────

function PatternCapRow({
  patternLabel,
  capLabel,
  status,
}: {
  patternLabel: string;
  capLabel: string;
  status: EngineCalibration['status'];
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="font-mono text-xs font-bold text-on-surface tracking-wide">
        {patternLabel} <span className="text-on-surface-variant mx-1">×</span> {capLabel}
      </span>
      <span
        className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase border ${STATUS_BADGE[status]}`}
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}

// ── Phase 16 — Horizon Table (UI-SPEC §A step 5) ───────────────────────

function HorizonTable({ rows }: { rows: HorizonCalibration[] }) {
  // 3d intentionally omitted from the table (UI-SPEC §A line 150 — too noisy for thesis horizons).
  const visibleRows = rows.filter((r) => r.horizon_days !== 3);

  return (
    <div className="pt-4 mt-4 border-t border-surface-container-high">
      <table className="w-full text-xs font-mono" data-testid="horizon-table">
        <thead>
          <tr className="bg-surface-container-low text-[10px] tracking-widest uppercase text-on-surface-variant">
            <th scope="col" className="text-left p-2">HORIZON</th>
            <th scope="col" className="text-right p-2">DIFFUSION POST.</th>
            <th scope="col" className="text-right p-2">DIFFUSION CI</th>
            <th scope="col" className="text-right p-2">TECHNICAL POST.</th>
            <th scope="col" className="text-right p-2">TECHNICAL CI</th>
            <th scope="col" className="text-right p-2">N · STATUS</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => {
            const isPrimary = r.horizon_days === 30;
            const isExploratory = r.status === 'EXPLORATORY';
            const isNoData = r.status === 'NO_DATA';
            const rowClasses = [
              'bg-surface-container-high',
              isPrimary ? 'border-l-2 border-primary bg-primary/5' : '',
              isExploratory ? 'opacity-60' : '',
            ].filter(Boolean).join(' ');
            const horizonLabel = isPrimary ? '30d★' : `${r.horizon_days}d`;
            return (
              <tr
                key={r.horizon_days}
                className={rowClasses}
                title={isPrimary ? 'Primary horizon — drives the 12-feature Bayesian logistic and the engine\'s headline conviction.' : undefined}
              >
                <th scope="row" className="text-left p-2 font-mono">
                  {isPrimary
                    ? <><span className="text-primary" aria-label="primary horizon">★</span><span className="ml-1">30d</span></>
                    : horizonLabel}
                </th>
                <td className="text-right p-2">{isNoData ? <span className="text-on-surface-variant">—</span> : formatPct(r.diffusion_posterior)}</td>
                <td className="text-right p-2">{isNoData ? <span className="text-on-surface-variant">—</span> : formatCi(r.diffusion_ci)}</td>
                <td className="text-right p-2">{isNoData ? <span className="text-on-surface-variant">—</span> : formatPct(r.technical_posterior)}</td>
                <td className="text-right p-2">{isNoData ? <span className="text-on-surface-variant">—</span> : formatCi(r.technical_ci)}</td>
                <td className="text-right p-2">
                  {isNoData
                    ? <span className="text-on-surface-variant">n=0 · NO DATA</span>
                    : <span className="text-on-surface-variant">n={r.sample_size} · {STATUS_LABEL[r.status]}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Phase 16 — Dual-class side-by-side panel (UI-SPEC §A steps 2-4) ────

function DualClassPanel({
  calibration,
  agreement,
}: {
  calibration: EngineCalibration;
  agreement: AgreementState;
}) {
  const {
    flow_pattern, cap_class, posterior_mean, ci_low, ci_high, sample_size, status,
    logistic_score, logistic_ci_low, logistic_ci_high, logistic_sample_size,
    brier_in_sample, brier_null,
    technical_pattern, technical_posterior_mean, technical_ci, technical_sample_size, technical_status,
    combined_logistic_score,
  } = calibration;

  const diffusionPatternLabel = flow_pattern ? FLOW_LABEL[flow_pattern] : 'NO PATTERN';
  const technicalPatternLabel = technical_pattern ? (TECH_PATTERN_LABEL[technical_pattern] ?? technical_pattern.toUpperCase()) : 'NO PATTERN';
  const capLabel = CAP_LABEL[cap_class];
  const techStatus: EngineCalibration['status'] = technical_status ?? 'NO_DATA';

  return (
    <>
      {/* Eyebrow row + agreement badge centered between columns */}
      <div className="flex items-center mb-4">
        <div className="flex-1">
          <span className="text-[10px] tracking-widest text-on-surface-variant uppercase">DIFFUSION</span>
        </div>
        <div className="px-4">
          <AgreementBadge state={agreement} />
        </div>
        <div className="flex-1 text-right">
          <span className="text-[10px] tracking-widest text-on-surface-variant uppercase">TECHNICAL</span>
        </div>
      </div>

      {/* Two-column body, 1px vertical divider */}
      <div className="flex gap-6 items-stretch">
        {/* Left column — DIFFUSION */}
        <div className="flex-1">
          <PatternCapRow patternLabel={diffusionPatternLabel} capLabel={capLabel} status={status} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MetricCard
              label="Engine Prior"
              value={formatPct(posterior_mean)}
              subValue={posterior_mean != null ? `[${formatPct(ci_low)}–${formatPct(ci_high)}] · n=${sample_size}` : `n=${sample_size}`}
              tooltip="Bayesian Beta-Bernoulli posterior probability that this diffusion pattern × cap class produces a 7-day return >1% above SPY."
            />
            <MetricCard
              label="Logistic Score"
              value={formatPct(logistic_score)}
              subValue={logistic_score != null ? `[${formatPct(logistic_ci_low)}–${formatPct(logistic_ci_high)}] · n=${logistic_sample_size}` : `n=${logistic_sample_size}`}
              tooltip="Bayesian-logistic forward pass over this report's diffusion features."
            />
            <MetricCard
              label="Adversarial Null"
              value={formatBrier(brier_in_sample)}
              subValue={brier_null != null ? `null ${formatBrier(brier_null)} · ${brier_in_sample != null && brier_in_sample < brier_null ? 'beats' : 'loses to'} chance` : 'n/a'}
              tooltip="Brier score (mean squared error vs outcome) of the real predictor compared with shuffled-outcome nulls. Lower is better."
            />
          </div>
        </div>

        <div className="w-px self-stretch bg-outline-variant/30" aria-hidden="true" />

        {/* Right column — TECHNICAL */}
        <div className="flex-1">
          <PatternCapRow patternLabel={technicalPatternLabel} capLabel={capLabel} status={techStatus} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MetricCard
              label="Tech Prior"
              value={formatPct(technical_posterior_mean ?? null)}
              subValue={technical_posterior_mean != null ? `${formatCi(technical_ci ?? null)} · n=${technical_sample_size ?? 0}` : `n=${technical_sample_size ?? 0}`}
              tooltip="Bayesian Beta-Bernoulli posterior probability that this technical pattern × cap class produces a 30d return >1% above SPY."
            />
            <MetricCard
              label="Combined Logistic"
              value={combined_logistic_score != null ? formatPct(combined_logistic_score) : '—'}
              subValue={`30d-trained, n=${logistic_sample_size}`}
              tooltip="Bayesian-logistic forward pass over the full 12-d feature vector (6 diffusion + 6 technical), trained on 30d outcomes only."
            />
            <MetricCard
              label="Tech Adversarial Null"
              value={formatBrier(brier_in_sample)}
              subValue={brier_null != null ? `null ${formatBrier(brier_null)} · vs chance` : 'n/a'}
              tooltip="Adversarial null Brier score vs chance for the technical signal class."
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Phase 16 — Alignment / Disagreement prose blocks (UI-SPEC §A step 7) ──

function AlignmentPanel({
  text,
  variant,
  label,
  icon,
}: {
  text: string;
  variant: 'aligned' | 'disagreement';
  label: string;
  icon: string;
}) {
  const isAligned = variant === 'aligned';
  return (
    <div className={`${isAligned ? 'bg-secondary/5 border-secondary' : 'bg-error/5 border-error'} border-l-2 p-4 rounded-r`}>
      <h4 className={`text-[10px] font-bold tracking-widest uppercase ${isAligned ? 'text-secondary' : 'text-error'} mb-2 flex items-center gap-2`}>
        <span className="material-symbols-outlined text-sm">{icon}</span>
        {label}
      </h4>
      <p className="text-xs text-on-surface-variant leading-relaxed">{text}</p>
    </div>
  );
}

function AlignmentDisagreementBlocks({
  engineAlignment,
  engineDisagreement,
  technicalAlignment,
  technicalDisagreement,
  agreement,
}: {
  engineAlignment: string | null;
  engineDisagreement: string | null;
  technicalAlignment: string | null | undefined;
  technicalDisagreement: string | null | undefined;
  agreement: AgreementState;
}) {
  const anyText = engineAlignment || engineDisagreement || technicalAlignment || technicalDisagreement;
  if (!anyText) return null;

  // When BOTH signal classes agree (aligned) AND both prose blocks exist,
  // consolidate into ONE labeled block: "Dual-Class Engine Alignment".
  if (
    agreement === 'aligned' &&
    engineAlignment &&
    technicalAlignment
  ) {
    const consolidated = `${engineAlignment}\n\n${technicalAlignment}`;
    return (
      <div className="space-y-3">
        <AlignmentPanel
          text={consolidated}
          variant="aligned"
          label="Dual-Class Engine Alignment"
          icon="check_circle"
        />
      </div>
    );
  }

  // Otherwise: render both halves independently.
  return (
    <div className="space-y-3">
      {engineAlignment && (
        <AlignmentPanel text={engineAlignment} variant="aligned" label="Engine Alignment" icon="check_circle" />
      )}
      {engineDisagreement && (
        <AlignmentPanel text={engineDisagreement} variant="disagreement" label="Engine Disagreement" icon="error" />
      )}
      {technicalAlignment && (
        <AlignmentPanel text={technicalAlignment} variant="aligned" label="Technical Alignment" icon="check_circle" />
      )}
      {technicalDisagreement && (
        <AlignmentPanel text={technicalDisagreement} variant="disagreement" label="Technical Disagreement" icon="error" />
      )}
    </div>
  );
}

// ── Legacy diffusion-only layout (graceful fallback) ───────────────────

function DiffusionOnlyPanel({ calibration }: { calibration: EngineCalibration }) {
  const {
    flow_pattern, cap_class,
    posterior_mean, ci_low, ci_high, sample_size, status,
    logistic_score, logistic_ci_low, logistic_ci_high, logistic_sample_size,
    brier_in_sample, brier_null,
  } = calibration;
  const patternLabel = flow_pattern ? FLOW_LABEL[flow_pattern] : 'NO PATTERN';
  const capLabel = CAP_LABEL[cap_class];

  return (
    <>
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
    </>
  );
}

// ── Top-level component ────────────────────────────────────────────────

export function EngineCalibrationPanel({ calibration }: EngineCalibrationPanelProps) {
  const {
    cycle_count,
    drift_z,
    predicted_at,
    engine_alignment,
    engine_disagreement,
    diffusion_sparkline,
    horizon_calibrations,
    agreement,
    technical_alignment,
    technical_disagreement,
  } = calibration;

  // Phase 16 gate: dual-class layout requires populated horizon_calibrations.
  // Old persisted reports (no horizon_calibrations) take the legacy single-column path.
  const showDualClass = (horizon_calibrations?.length ?? 0) >= 1;
  const agreementState: AgreementState = agreement ?? 'unknown';

  return (
    <section
      data-testid="engine-calibration-panel"
      className="bg-surface-container border border-surface-container-high p-6 rounded-lg relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-tertiary/5 blur-[100px]" aria-hidden="true" />

      {/* Header row — UNCHANGED */}
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

      {/* Phase 16: dual-class panel + horizon table OR legacy single-column */}
      {showDualClass ? (
        <>
          <DualClassPanel calibration={calibration} agreement={agreementState} />
          <HorizonTable rows={horizon_calibrations!} />
        </>
      ) : (
        <DiffusionOnlyPanel calibration={calibration} />
      )}

      {/* Drift gauge — UNCHANGED (diffusion-only) */}
      <div className="flex items-center justify-between mt-5 mb-5 pb-4 border-b border-surface-container-high">
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

      {/* Engine + Technical alignment / disagreement prose */}
      <AlignmentDisagreementBlocks
        engineAlignment={engine_alignment}
        engineDisagreement={engine_disagreement}
        technicalAlignment={technical_alignment}
        technicalDisagreement={technical_disagreement}
        agreement={agreementState}
      />

      {/* Phase 16 footer note — REPLACED (UI-SPEC §A step 8 — verbatim including markdown bold) */}
      <p className="mt-4 text-[10px] text-on-surface-variant tracking-wide leading-relaxed">
        ↳ This prediction will be auto-verified at 3, 7, 14, 30, 60, and 90 days. The engine&apos;s posterior updates online — re-running this report after the next learning cycle may show different numbers. <strong className="text-on-surface">30 days is the primary horizon.</strong>
      </p>
    </section>
  );
}

export default EngineCalibrationPanel;
