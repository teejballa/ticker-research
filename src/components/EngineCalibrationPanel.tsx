'use client';

// src/components/EngineCalibrationPanel.tsx
// Renders the diffusion-engine prior carried inside each report.
// All numbers shown here are authoritative — written by getEngineContextForTicker
// at report-generation time, not by the LLM. The panel hides itself when
// engine_calibration is undefined (old reports) but renders even at NO_DATA so
// the reader can see the engine is aware of the ticker but has no prior yet.
//
// Phase 16 (16-04) — DUAL-CLASS layout (now superseded by Phase 17-04 QuadClassPanel):
//   - When `horizon_calibrations.length >= 1`: render QuadClassPanel (4-col grid)
//   - Otherwise: graceful fallback to the existing diffusion-only layout
//     (old persisted reports never partially render the quad-class shell)
//
// Phase 17 (17-04) — QUAD-CLASS layout:
//   - QuadClassPanel: 4-column responsive grid (1 col mobile / 2 cols md / 4 cols lg)
//   - HorizonTable: 8 numeric columns (4 posteriors + 4 CIs), CI hidden ≤xl
//   - AgreementBadge: N-way tooltip copy (UI-SPEC §C locked)
//   - AlignmentDisagreementBlocks: extended to 4 classes × 2 prose strings each
//   - Pattern type mismatch resolved — InstitutionalBucket/InsiderBucket unions used throughout
//
// All locked copy + classNames are verbatim per 17-UI-SPEC.md §A, §B, §C, §D.

import type { EngineCalibration, HorizonCalibration, InstitutionalBucket, InsiderBucket } from '@/lib/types';
import { WatchBadge } from './WatchBadge';

// ── Phase 18 (Plan 18-08) — local type widening ────────────────────────────
//
// Plan 18-07 (Wave 3, parallel) extends EngineCalibration / HorizonCalibration
// with optional ESS fields and adds 'EXPLORATORY-WATCH' to every status union.
// This file ships in Wave 3 too — to keep tsc green BEFORE the Plan 18-07
// worktree merges, we widen the prop type locally with the exact same fields
// the upstream plan promises (CONTEXT D-10 / D-11 / D-12 contract). Once
// Plan 18-07 lands these become redundant aliases of the upstream definitions
// (the optional fields will simply collapse together).
type WatchStatus = EngineCalibration['status'] | 'EXPLORATORY-WATCH';
type ClassWatchStatus = WatchStatus | null | undefined;

interface EngineCalibrationESSExtensions {
  effective_sample_size?: number;
  technical_ess?: number;
  institutional_ess?: number;
  insider_ess?: number;
  logistic_ess?: number;
  // Status unions widened to include 'EXPLORATORY-WATCH' (D-11)
  status: WatchStatus;
  technical_status?: WatchStatus;
  institutional_status?: WatchStatus | null;
  insider_status?: WatchStatus | null;
}

type EngineCalibrationWithESS = Omit<
  EngineCalibration,
  'status' | 'technical_status' | 'institutional_status' | 'insider_status'
> & EngineCalibrationESSExtensions;

type HorizonCalibrationWithESS = Omit<HorizonCalibration, 'status'> & {
  effective_sample_size?: number;
  status: WatchStatus;
};

interface EngineCalibrationPanelProps {
  calibration: EngineCalibrationWithESS;
}

// Helper: prefer ESS as the user-facing currency (D-10), fall back to raw N
// for old persisted reports that lack the field (graceful back-compat).
function essOrN(ess: number | undefined, n: number): string {
  return ess != null ? `ESS=${ess.toFixed(1)}` : `n=${n}`;
}

const STATUS_BADGE: Record<WatchStatus, string> = {
  ACTIVE: 'bg-secondary/20 text-secondary border-secondary/40',
  EXPLORATORY: 'bg-tertiary/20 text-tertiary border-tertiary/40',
  'EXPLORATORY-WATCH': 'bg-tertiary/30 text-tertiary border-tertiary/50',
  DEPRECATED: 'bg-error/20 text-error border-error/40',
  NO_DATA: 'bg-surface-container-highest text-on-surface-variant border-outline/30',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'ACTIVE',
  EXPLORATORY: 'EXPLORATORY',
  'EXPLORATORY-WATCH': 'WATCHING',
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

// Phase 17-04: InstitutionalBucket → display label (UI-SPEC §A Pattern label maps)
const INST_PATTERN_LABEL: Record<InstitutionalBucket, string> = {
  net_accumulation:          'NET ACCUMULATION',
  net_distribution:          'NET DISTRIBUTION',
  new_initiation:            'NEW INITIATION',
  complete_exit:             'COMPLETE EXIT',
  smart_money_concentration: 'SMART MONEY CONC.',
  smart_money_dispersion:    'SMART MONEY DISP.',
  contrarian_inflow:         'CONTRARIAN INFLOW',
  contrarian_outflow:        'CONTRARIAN OUTFLOW',
};

// Phase 17-04: InsiderBucket → display label (UI-SPEC §A Pattern label maps)
const INSIDER_PATTERN_LABEL: Record<InsiderBucket, string> = {
  cluster_buying:       'CLUSTER BUYING',
  lone_buy:             'LONE BUY',
  ceo_buy:              'CEO BUY',
  cfo_buy:              'CFO BUY',
  director_buy:         'DIRECTOR BUY',
  cluster_selling:      'CLUSTER SELLING',
  planned_sell_10b5_1:  '10b5-1 PLAN SELL',
  lone_sell:            'LONE SELL',
};

// Phase 17-04: N-way AgreementBadge (UI-SPEC §C — N-way tooltip copy locked)
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
    tooltip: 'All ACTIVE classes point the same direction at 30d. Highest conviction state.',
  },
  mixed: {
    text: 'MIXED',
    classes: 'text-tertiary border-tertiary/40 bg-tertiary/10',
    icon: 'compare_arrows',
    tooltip: 'ACTIVE classes lean the same general direction but differ in magnitude. Read all 4 columns.',
  },
  opposed: {
    text: 'OPPOSED',
    classes: 'text-error border-error/40 bg-error/10',
    icon: 'error',
    tooltip: 'At least one strong-bullish class AND one strong-bearish class are ACTIVE at 30d. Read every alignment/disagreement block.',
  },
  unknown: {
    text: 'UNKNOWN',
    classes: 'text-outline border-outline-variant bg-surface-container-highest',
    icon: 'help',
    tooltip: 'Fewer than 2 classes are ACTIVE. Treat the calibration as exploratory.',
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

// ── Agreement Badge (N-way, UI-SPEC §C) ──────────────────────────────────

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

// ── Pattern + cap pill (per column) ─────────────────────────────────────

function PatternCapRow({
  patternLabel,
  capLabel,
  status,
}: {
  patternLabel: string;
  capLabel: string;
  status: WatchStatus;
}) {
  return (
    <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
      <span className="font-mono text-xs font-bold text-on-surface tracking-wide">
        {patternLabel} <span className="text-on-surface-variant mx-1">×</span> {capLabel}
      </span>
      <span className="inline-flex items-center gap-2 flex-wrap justify-end">
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase border ${STATUS_BADGE[status]}`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
        {status === 'EXPLORATORY-WATCH' && <WatchBadge />}
      </span>
    </div>
  );
}

// ── Phase 17-04: ClassColumn — single signal class column ─────────────────
// Used as a local sub-component inside QuadClassPanel. Encapsulates the
// eyebrow, PatternCapRow, and 3 MetricCards for one signal class.

interface ClassColumnProps {
  kind: 'diffusion' | 'technical' | 'institutional' | 'insider';
  eyebrowLabel: string;
  eyebrowHint: string;
  eyebrowColorClass: string;
  patternLabel: string;
  capLabel: string;
  status: WatchStatus;
  card1: { label: string; value: string; subValue: string; tooltip: string };
  card2: { label: string; value: string; subValue: string; tooltip: string };
  card3: { label: string; value: string; subValue: string; tooltip: string };
  isNoData?: boolean;
}

function ClassColumn({
  kind,
  eyebrowLabel,
  eyebrowHint,
  eyebrowColorClass,
  patternLabel,
  capLabel,
  status,
  card1,
  card2,
  card3,
  isNoData,
}: ClassColumnProps) {
  return (
    <div data-column={kind} className={isNoData ? 'opacity-60' : ''}>
      <div className="mb-3">
        <div className={`text-[10px] tracking-widest uppercase font-bold ${eyebrowColorClass}`}>
          {eyebrowLabel}
        </div>
        <div className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
          {eyebrowHint}
        </div>
      </div>
      <PatternCapRow patternLabel={patternLabel} capLabel={capLabel} status={status} />
      <div className="grid grid-cols-1 gap-3">
        <MetricCard {...card1} />
        <MetricCard {...card2} />
        <MetricCard {...card3} />
      </div>
    </div>
  );
}

// ── Phase 17-04: 4-class HorizonTable (UI-SPEC §B) ────────────────────────
// 9 header columns: HORIZON + 4 posteriors + 4 CIs.
// CI columns hidden at ≤xl (< 1280px) via `hidden xl:table-cell`.
// Posterior columns always visible with title=CI for hover disclosure.

function HorizonTable({ rows }: { rows: HorizonCalibrationWithESS[] }) {
  // 3d intentionally omitted (UI-SPEC §B — too noisy for thesis horizons).
  const visibleRows = rows.filter((r) => r.horizon_days !== 3);

  return (
    <div className="pt-4 mt-4 border-t border-surface-container-high overflow-x-auto">
      <table className="w-full text-xs font-mono" data-testid="horizon-table">
        <thead>
          <tr className="bg-surface-container-low text-[10px] tracking-widest uppercase text-on-surface-variant">
            <th scope="col" className="text-left p-2">HORIZON</th>
            <th scope="col" className="text-right p-2">DIFFUSION POST.</th>
            <th scope="col" className="text-right p-2 hidden xl:table-cell">DIFFUSION CI</th>
            <th scope="col" className="text-right p-2">TECHNICAL POST.</th>
            <th scope="col" className="text-right p-2 hidden xl:table-cell">TECHNICAL CI</th>
            <th scope="col" className="text-right p-2">INST. POST.</th>
            <th scope="col" className="text-right p-2 hidden xl:table-cell">INST. CI</th>
            <th scope="col" className="text-right p-2">INSIDER POST.</th>
            <th scope="col" className="text-right p-2 hidden xl:table-cell">INSIDER CI</th>
            <th scope="col" className="text-right p-2">ESS · STATUS</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => {
            const isPrimary = r.horizon_days === 30;
            const isExploratory = r.status === 'EXPLORATORY';
            const isWatch = r.status === 'EXPLORATORY-WATCH';
            const isNoData = r.status === 'NO_DATA';
            const rowClasses = [
              'bg-surface-container-high',
              isPrimary ? 'border-l-2 border-primary bg-primary/5' : '',
              isExploratory ? 'opacity-60' : '',
              isWatch ? 'border-l-2 border-tertiary/50' : '',
            ].filter(Boolean).join(' ');
            return (
              <tr
                key={r.horizon_days}
                className={rowClasses}
                title={isPrimary ? 'Primary horizon — drives the 12-feature Bayesian logistic and the engine\'s headline conviction.' : undefined}
              >
                <th scope="row" className="text-left p-2 font-mono">
                  {isPrimary
                    ? <><span className="text-primary" aria-label="primary horizon">★</span><span className="ml-1">30d</span></>
                    : `${r.horizon_days}d`}
                </th>
                {/* Diffusion posterior — always visible; CI visible only at xl+ */}
                <td className="text-right p-2" title={formatCi(r.diffusion_ci)}>
                  {isNoData ? <span className="text-on-surface-variant">—</span> : formatPct(r.diffusion_posterior)}
                </td>
                <td className="text-right p-2 hidden xl:table-cell">
                  {isNoData ? <span className="text-on-surface-variant">—</span> : formatCi(r.diffusion_ci)}
                </td>
                {/* Technical posterior */}
                <td className="text-right p-2" title={formatCi(r.technical_ci)}>
                  {isNoData ? <span className="text-on-surface-variant">—</span> : formatPct(r.technical_posterior)}
                </td>
                <td className="text-right p-2 hidden xl:table-cell">
                  {isNoData ? <span className="text-on-surface-variant">—</span> : formatCi(r.technical_ci)}
                </td>
                {/* Institutional posterior */}
                <td className="text-right p-2" title={formatCi(r.institutional_ci)}>
                  {(isNoData || r.institutional_posterior == null)
                    ? <span className="text-on-surface-variant">—</span>
                    : formatPct(r.institutional_posterior)}
                </td>
                <td className="text-right p-2 hidden xl:table-cell">
                  {(isNoData || r.institutional_ci == null)
                    ? <span className="text-on-surface-variant">—</span>
                    : formatCi(r.institutional_ci)}
                </td>
                {/* Insider posterior */}
                <td className="text-right p-2" title={formatCi(r.insider_ci)}>
                  {(isNoData || r.insider_posterior == null)
                    ? <span className="text-on-surface-variant">—</span>
                    : formatPct(r.insider_posterior)}
                </td>
                <td className="text-right p-2 hidden xl:table-cell">
                  {(isNoData || r.insider_ci == null)
                    ? <span className="text-on-surface-variant">—</span>
                    : formatCi(r.insider_ci)}
                </td>
                {/* ESS · STATUS — Phase 18 D-10: ESS is the user-facing currency.
                    Falls back to n=<int> when effective_sample_size is undefined
                    (old persisted reports), preserving the legacy display verbatim. */}
                <td className="text-right p-2">
                  {isNoData
                    ? <span className="text-on-surface-variant">{essOrN(r.effective_sample_size, 0)} · NO DATA</span>
                    : (
                      <span className="text-on-surface-variant inline-flex items-center gap-1.5 justify-end flex-wrap">
                        <span>{essOrN(r.effective_sample_size, r.sample_size)} · {STATUS_LABEL[r.status] ?? r.status}</span>
                        {isWatch && <WatchBadge />}
                      </span>
                    )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Phase 17-04: QuadClassPanel — 4-column grid (UI-SPEC §A) ─────────────
// Phase 17-04 replacement for the Phase 16 dual-class panel. Responsive: 1 col (mobile) → 2 cols (md) → 4 cols (lg).
// AgreementBadge centered above the grid (not between columns).

function QuadClassPanel({
  calibration,
  agreement,
}: {
  calibration: EngineCalibrationWithESS;
  agreement: AgreementState;
}) {
  const {
    flow_pattern, cap_class, posterior_mean, ci_low, ci_high, sample_size, status,
    logistic_score, logistic_ci_low, logistic_ci_high, logistic_sample_size,
    brier_in_sample, brier_null,
    technical_pattern, technical_posterior_mean, technical_ci, technical_sample_size, technical_status,
    combined_logistic_score,
    institutional_pattern, institutional_posterior_mean, institutional_ci,
    institutional_sample_size, institutional_status,
    insider_pattern, insider_posterior_mean, insider_ci, insider_sample_size, insider_status,
    // Phase 18 — ESS fields (Plan 18-07 contract; optional for back-compat with old reports)
    effective_sample_size,
    technical_ess,
    institutional_ess,
    insider_ess,
    logistic_ess,
  } = calibration;

  const capLabel = CAP_LABEL[cap_class];

  const diffusionPatternLabel = flow_pattern ? FLOW_LABEL[flow_pattern] : 'NO PATTERN';
  const technicalPatternLabel = technical_pattern
    ? (TECH_PATTERN_LABEL[technical_pattern] ?? technical_pattern.toUpperCase())
    : 'NO PATTERN';
  const institutionalPatternLabel = institutional_pattern
    ? (INST_PATTERN_LABEL[institutional_pattern] ?? institutional_pattern.toUpperCase())
    : 'NO PATTERN';
  const insiderPatternLabel = insider_pattern
    ? (INSIDER_PATTERN_LABEL[insider_pattern] ?? insider_pattern.toUpperCase())
    : 'NO PATTERN';

  const techStatus: WatchStatus = (technical_status as ClassWatchStatus) ?? 'NO_DATA';
  const instStatus: WatchStatus = (institutional_status as ClassWatchStatus) ?? 'NO_DATA';
  const insdStatus: WatchStatus = (insider_status as ClassWatchStatus) ?? 'NO_DATA';

  const instIsNoData = instStatus === 'NO_DATA';
  const insdIsNoData = insdStatus === 'NO_DATA';

  return (
    <>
      {/* AgreementBadge centered above the 4-column grid (UI-SPEC §A step 3) */}
      <div className="flex flex-col items-center mb-4 gap-1.5">
        <AgreementBadge state={agreement} />
        <p className="text-[11px] text-on-surface-variant text-center max-w-2xl leading-snug px-4">
          {AGREEMENT_BADGE[agreement].tooltip}
        </p>
      </div>

      {/* 4-column grid: 1 col mobile / 2 cols md / 4 cols lg (UI-SPEC §A step 2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* Column 1 — DIFFUSION */}
        <ClassColumn
          kind="diffusion"
          eyebrowLabel="DIFFUSION"
          eyebrowHint="How news & social chatter is spreading."
          eyebrowColorClass="text-on-surface-variant"
          patternLabel={diffusionPatternLabel}
          capLabel={capLabel}
          status={status}
          card1={{
            label: 'Engine Prior',
            value: formatPct(posterior_mean),
            subValue: posterior_mean != null
              ? `[${formatPct(ci_low)}–${formatPct(ci_high)}] · ${essOrN(effective_sample_size, sample_size)}`
              : essOrN(effective_sample_size, sample_size),
            tooltip: 'Bayesian Beta-Bernoulli posterior probability that this diffusion pattern × cap class produces a 7-day return >1% above SPY.',
          }}
          card2={{
            label: 'Logistic Score',
            value: formatPct(logistic_score),
            subValue: logistic_score != null
              ? `[${formatPct(logistic_ci_low)}–${formatPct(logistic_ci_high)}] · ${essOrN(logistic_ess, logistic_sample_size)}`
              : essOrN(logistic_ess, logistic_sample_size),
            tooltip: 'Bayesian-logistic forward pass over this report\'s diffusion features.',
          }}
          card3={{
            label: 'Adversarial Null',
            value: formatBrier(brier_in_sample),
            subValue: brier_null != null
              ? `null ${formatBrier(brier_null)} · ${brier_in_sample != null && brier_in_sample < brier_null ? 'beats' : 'loses to'} chance`
              : 'n/a',
            tooltip: 'Brier score (mean squared error vs outcome) of the real predictor compared with shuffled-outcome nulls. Lower is better.',
          }}
        />

        {/* Column 2 — TECHNICAL */}
        <ClassColumn
          kind="technical"
          eyebrowLabel="TECHNICAL"
          eyebrowHint="What the price chart is doing — momentum, trends, volume."
          eyebrowColorClass="text-on-surface-variant"
          patternLabel={technicalPatternLabel}
          capLabel={capLabel}
          status={techStatus}
          card1={{
            label: 'Tech Prior',
            value: formatPct(technical_posterior_mean ?? null),
            subValue: technical_posterior_mean != null
              ? `${formatCi(technical_ci ?? null)} · ${essOrN(technical_ess, technical_sample_size ?? 0)}`
              : essOrN(technical_ess, technical_sample_size ?? 0),
            tooltip: 'Bayesian Beta-Bernoulli posterior probability that this technical pattern × cap class produces a 30d return >1% above SPY.',
          }}
          card2={{
            label: 'Combined Logistic',
            value: combined_logistic_score != null ? formatPct(combined_logistic_score) : '—',
            subValue: `30d-trained, ${essOrN(logistic_ess, logistic_sample_size)}`,
            tooltip: 'Bayesian-logistic forward pass over the full 12-d feature vector (6 diffusion + 6 technical), trained on 30d outcomes only.',
          }}
          card3={{
            label: 'Tech Sample',
            value: essOrN(technical_ess, technical_sample_size ?? 0),
            subValue: techStatus,
            tooltip: 'Adversarial null Brier score vs chance for the technical signal class.',
          }}
        />

        {/* Column 3 — INSTITUTIONAL (new, UI-SPEC §A — secondary/teal identity) */}
        <ClassColumn
          kind="institutional"
          eyebrowLabel="INSTITUTIONAL"
          eyebrowHint="What big funds are doing — 13F filings, fund flows."
          eyebrowColorClass="text-secondary"
          patternLabel={institutionalPatternLabel}
          capLabel={capLabel}
          status={instStatus}
          isNoData={instIsNoData}
          card1={{
            label: 'Inst. Prior',
            value: formatPct(institutional_posterior_mean ?? null),
            subValue: institutional_posterior_mean != null
              ? `${formatCi(institutional_ci ?? null)} · ${essOrN(institutional_ess, institutional_sample_size ?? 0)}`
              : instIsNoData ? 'No recent filings' : essOrN(institutional_ess, institutional_sample_size ?? 0),
            tooltip: 'Bayesian Beta-Bernoulli posterior probability that this institutional pattern × cap class produces a 30d return >1% above SPY.',
          }}
          card2={{
            label: 'Inst. Sample',
            value: essOrN(institutional_ess, institutional_sample_size ?? 0),
            subValue: instStatus,
            tooltip: 'Number of resolved 30d outcome observations for this institutional bucket × cap class.',
          }}
          card3={{
            label: 'Diffusion Null',
            value: formatBrier(brier_in_sample),
            subValue: brier_null != null ? `null ${formatBrier(brier_null)}` : 'n/a',
            tooltip: 'Diffusion class Brier score (institutional class Brier not yet surfaced in this view).',
          }}
        />

        {/* Column 4 — INSIDER (new, UI-SPEC §A — tertiary/amber identity) */}
        <ClassColumn
          kind="insider"
          eyebrowLabel="INSIDER"
          eyebrowHint="What execs & directors are doing — Form 4 buys & sells."
          eyebrowColorClass="text-tertiary"
          patternLabel={insiderPatternLabel}
          capLabel={capLabel}
          status={insdStatus}
          isNoData={insdIsNoData}
          card1={{
            label: 'Insider Prior',
            value: formatPct(insider_posterior_mean ?? null),
            subValue: insider_posterior_mean != null
              ? `${formatCi(insider_ci ?? null)} · ${essOrN(insider_ess, insider_sample_size ?? 0)}`
              : insdIsNoData ? 'No recent filings' : essOrN(insider_ess, insider_sample_size ?? 0),
            tooltip: 'Bayesian Beta-Bernoulli posterior probability that this insider pattern × cap class produces a 30d return >1% above SPY.',
          }}
          card2={{
            label: 'Insider Sample',
            value: essOrN(insider_ess, insider_sample_size ?? 0),
            subValue: insdStatus,
            tooltip: 'Number of resolved 30d outcome observations for this insider bucket × cap class.',
          }}
          card3={{
            label: 'Diffusion Null',
            value: formatBrier(brier_in_sample),
            subValue: brier_null != null ? `null ${formatBrier(brier_null)}` : 'n/a',
            tooltip: 'Diffusion class Brier score (insider class Brier not yet surfaced in this view).',
          }}
        />
      </div>
    </>
  );
}

// ── Alignment / Disagreement prose blocks (extended to 4 classes, UI-SPEC §D) ──

function AlignmentPanel({
  text,
  variant,
  label,
  icon,
  dataClass,
}: {
  text: string;
  variant: 'aligned' | 'disagreement';
  label: string;
  icon: string;
  dataClass: string;
}) {
  const isAligned = variant === 'aligned';
  return (
    <div
      className={`${isAligned ? 'bg-secondary/5 border-secondary' : 'bg-error/5 border-error'} border-l-2 p-4 rounded-r`}
      data-class={dataClass}
    >
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
  institutionalAlignment,
  institutionalDisagreement,
  insiderAlignment,
  insiderDisagreement,
  agreement,
}: {
  engineAlignment: string | null;
  engineDisagreement: string | null;
  technicalAlignment: string | null | undefined;
  technicalDisagreement: string | null | undefined;
  institutionalAlignment: string | null | undefined;
  institutionalDisagreement: string | null | undefined;
  insiderAlignment: string | null | undefined;
  insiderDisagreement: string | null | undefined;
  agreement: AgreementState;
}) {
  const anyText = engineAlignment || engineDisagreement || technicalAlignment || technicalDisagreement
    || institutionalAlignment || institutionalDisagreement || insiderAlignment || insiderDisagreement;
  if (!anyText) return null;

  // Consolidation rule (UI-SPEC §D): when agreement === 'aligned' AND all 4 alignment
  // prose strings are present, consolidate into ONE "Quad-Class Engine Alignment" block.
  // Per W5 mitigation: each paragraph MUST be wrapped in <div data-class="..."> so
  // per-class attribution is preserved in the DOM even when visually consolidated.
  if (
    agreement === 'aligned' &&
    engineAlignment &&
    technicalAlignment &&
    institutionalAlignment &&
    insiderAlignment
  ) {
    return (
      <div className="space-y-3">
        <div className="bg-secondary/5 border-secondary border-l-2 p-4 rounded-r">
          <h4 className="text-[10px] font-bold tracking-widest uppercase text-secondary mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            Quad-Class Engine Alignment
          </h4>
          <div className="space-y-2">
            <div data-class="diffusion" className="text-xs text-on-surface-variant leading-relaxed">{engineAlignment}</div>
            <div data-class="technical" className="text-xs text-on-surface-variant leading-relaxed">{technicalAlignment}</div>
            <div data-class="institutional" className="text-xs text-on-surface-variant leading-relaxed">{institutionalAlignment}</div>
            <div data-class="insider" className="text-xs text-on-surface-variant leading-relaxed">{insiderAlignment}</div>
          </div>
        </div>
      </div>
    );
  }

  // Otherwise: render each prose block independently.
  return (
    <div className="space-y-3">
      {engineAlignment && (
        <AlignmentPanel text={engineAlignment} variant="aligned" label="Engine Alignment" icon="check_circle" dataClass="diffusion" />
      )}
      {engineDisagreement && (
        <AlignmentPanel text={engineDisagreement} variant="disagreement" label="Engine Disagreement" icon="error" dataClass="diffusion" />
      )}
      {technicalAlignment && (
        <AlignmentPanel text={technicalAlignment} variant="aligned" label="Technical Alignment" icon="check_circle" dataClass="technical" />
      )}
      {technicalDisagreement && (
        <AlignmentPanel text={technicalDisagreement} variant="disagreement" label="Technical Disagreement" icon="error" dataClass="technical" />
      )}
      {institutionalAlignment && (
        <AlignmentPanel text={institutionalAlignment} variant="aligned" label="Institutional Alignment" icon="account_balance" dataClass="institutional" />
      )}
      {institutionalDisagreement && (
        <AlignmentPanel text={institutionalDisagreement} variant="disagreement" label="Institutional Disagreement" icon="error" dataClass="institutional" />
      )}
      {insiderAlignment && (
        <AlignmentPanel text={insiderAlignment} variant="aligned" label="Insider Alignment" icon="person_search" dataClass="insider" />
      )}
      {insiderDisagreement && (
        <AlignmentPanel text={insiderDisagreement} variant="disagreement" label="Insider Disagreement" icon="error" dataClass="insider" />
      )}
    </div>
  );
}

// ── Legacy diffusion-only layout (graceful fallback) ───────────────────

function DiffusionOnlyPanel({ calibration }: { calibration: EngineCalibrationWithESS }) {
  const {
    flow_pattern, cap_class,
    posterior_mean, ci_low, ci_high, sample_size, status,
    logistic_score, logistic_ci_low, logistic_ci_high, logistic_sample_size,
    brier_in_sample, brier_null,
    // Phase 18 — ESS fields (optional; falls back to n= for old reports)
    effective_sample_size, logistic_ess,
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
        <span className="inline-flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${STATUS_BADGE[status]}`}
            title={
              status === 'ACTIVE'              ? 'Pattern beats the adversarial null with n ≥ 10. Engine defers to this prior.' :
              status === 'EXPLORATORY'         ? 'Pattern has fewer than 10 confirmed cases. Treat the prior as weak.' :
              status === 'EXPLORATORY-WATCH'   ? 'Drift detector has confirmed unstable behavior on this cell. Calibration injection still active — read with care.' :
              status === 'DEPRECATED'          ? 'Pattern has drifted (|z| > 2σ) or is now worse than chance. Prior is not trusted.' :
                                                 'No historical posterior available for this pattern × cap class.'
            }
          >
            {STATUS_LABEL[status]}
          </span>
          {status === 'EXPLORATORY-WATCH' && <WatchBadge />}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <MetricCard
          label="Engine Prior"
          value={formatPct(posterior_mean)}
          subValue={posterior_mean != null ? `[${formatPct(ci_low)} – ${formatPct(ci_high)}] · ${essOrN(effective_sample_size, sample_size)}` : essOrN(effective_sample_size, sample_size)}
          tooltip="Bayesian Beta-Bernoulli posterior probability that this pattern × cap class produces a 7-day return >1% above SPY. The 95% credible interval shows the engine's uncertainty given effective sample size."
        />
        <MetricCard
          label="Logistic Score"
          value={formatPct(logistic_score)}
          subValue={logistic_score != null ? `[${formatPct(logistic_ci_low)} – ${formatPct(logistic_ci_high)}] · ${essOrN(logistic_ess, logistic_sample_size)}` : essOrN(logistic_ess, logistic_sample_size)}
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
    institutional_alignment,
    institutional_disagreement,
    insider_alignment,
    insider_disagreement,
  } = calibration;

  // Phase 17 gate: quad-class layout requires populated horizon_calibrations.
  // Old persisted reports (no horizon_calibrations) take the legacy single-column path.
  const showQuadClass = (horizon_calibrations?.length ?? 0) >= 1;
  const agreementState: AgreementState = agreement ?? 'unknown';

  return (
    <section
      data-testid="engine-calibration-panel"
      className="bg-surface-container border border-surface-container-high p-6 rounded-lg relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-tertiary/5 blur-[100px]" aria-hidden="true" />

      {/* Header row */}
      <div className="flex items-start justify-between mb-5 relative gap-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-tertiary text-base mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
            psychology
          </span>
          <div>
            <h3 className="text-[11px] font-bold tracking-widest uppercase text-tertiary">
              Engine Calibration
            </h3>
            <p className="text-[12px] text-on-surface-variant mt-0.5 leading-snug max-w-xl">
              Four independent signal sources on this stock and how confident the engine is in each one.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-on-surface-variant tracking-widest uppercase shrink-0">
          <span>Cycle {cycle_count}</span>
          <span className="opacity-50">·</span>
          <span>{timeAgo(predicted_at)}</span>
        </div>
      </div>

      {/* Phase 17: quad-class panel + horizon table OR legacy single-column */}
      {showQuadClass ? (
        <>
          <QuadClassPanel calibration={calibration} agreement={agreementState} />
          <HorizonTable rows={horizon_calibrations as HorizonCalibrationWithESS[]} />
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

      {/* Engine + Technical + Institutional + Insider alignment / disagreement prose */}
      <AlignmentDisagreementBlocks
        engineAlignment={engine_alignment}
        engineDisagreement={engine_disagreement}
        technicalAlignment={technical_alignment}
        technicalDisagreement={technical_disagreement}
        institutionalAlignment={institutional_alignment}
        institutionalDisagreement={institutional_disagreement}
        insiderAlignment={insider_alignment}
        insiderDisagreement={insider_disagreement}
        agreement={agreementState}
      />

      {/* Footer note — verbatim per UI-SPEC (both phases) */}
      <p className="mt-4 text-[10px] text-on-surface-variant tracking-wide leading-relaxed">
        ↳ This prediction will be auto-verified at 3, 7, 14, 30, 60, and 90 days. The engine&apos;s posterior updates online — re-running this report after the next learning cycle may show different numbers. <strong className="text-on-surface">30 days is the primary horizon.</strong>
      </p>
    </section>
  );
}

export default EngineCalibrationPanel;
