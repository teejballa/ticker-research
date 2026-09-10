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

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { EngineCalibration, HorizonCalibration, InstitutionalBucket, InsiderBucket } from '@/lib/types';
import { WatchBadge } from './WatchBadge';
import { SourceMixExpanded } from './SourceMixExpanded';
import { MagnitudeCalibrationTile } from './MagnitudeCalibrationTile';

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
  // Phase 19-A-03 (D-19) — Vovk-Romano conformal CI (additive alongside Bayesian)
  conformal_low?: number | null;
  conformal_high?: number | null;
  // Phase 19-C-10 (D-42) — Cross-class contradiction warnings.
  // DETECTION-ONLY mode per D-42 — warnings are informational; report output is NOT gated by them.
  // Upgrading to gating mode requires a separate plan and explicit decision.
  // Optional + back-compat with old persisted reports that lack the field.
  contradiction_warnings?: string[];
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
  const count = ess != null ? Math.round(ess) : n;
  return `${count} example${count === 1 ? '' : 's'}`;
}

const STATUS_BADGE: Record<WatchStatus, string> = {
  ACTIVE: 'bg-secondary/20 text-secondary border-secondary/40',
  EXPLORATORY: 'bg-tertiary/20 text-tertiary border-tertiary/40',
  'EXPLORATORY-WATCH': 'bg-tertiary/30 text-tertiary border-tertiary/50',
  DEPRECATED: 'bg-error/20 text-error border-error/40',
  NO_DATA: 'bg-surface-container-highest text-on-surface-variant border-outline/30',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'TRUSTED',
  EXPLORATORY: 'LEARNING',
  'EXPLORATORY-WATCH': 'WATCHING',
  DEPRECATED: 'OUTDATED',
  NO_DATA: 'NO HISTORY',
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
    text: 'ALL AGREE',
    classes: 'text-secondary border-secondary/40 bg-secondary/10',
    icon: 'check_circle',
    tooltip: 'All active signals point the same direction. This is the strongest confidence state.',
  },
  mixed: {
    text: 'MIXED SIGNALS',
    classes: 'text-tertiary border-tertiary/40 bg-tertiary/10',
    icon: 'compare_arrows',
    tooltip: 'The signals lean the same way but differ in strength. Read all four columns.',
  },
  opposed: {
    text: 'CONFLICTING',
    classes: 'text-error border-error/40 bg-error/10',
    icon: 'error',
    tooltip: 'Some signals are strongly bullish and others are strongly bearish. Read all four columns carefully before drawing a conclusion.',
  },
  unknown: {
    text: 'NOT ENOUGH DATA',
    classes: 'text-outline border-outline-variant bg-surface-container-highest',
    icon: 'help',
    tooltip: 'Fewer than 2 signal types are active yet. Treat the engine\'s read as early-stage.',
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
    <div
      className="flex items-center gap-3 text-[11px] font-mono"
      title={drifting
        ? "The engine is behaving noticeably differently than it used to on this pattern. Treat its confidence with extra caution."
        : "The engine is behaving the same way it has historically on this pattern. Its confidence is on solid ground."}
    >
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
  label, value, subValue, tooltip, plainLine,
}: { label: string; value: string; subValue: string; tooltip: string; plainLine?: string }) {
  return (
    <div className="bg-surface-container-high p-4 rounded-lg flex flex-col gap-1.5" title={tooltip}>
      <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">{label}</span>
      <span className="font-mono text-2xl font-bold text-on-surface tabular-nums">{value}</span>
      <span className="text-[11px] font-mono text-on-surface-variant">{subValue}</span>
      {plainLine && (
        <span className="text-[11px] text-on-surface-variant/90 leading-snug mt-1">
          {plainLine}
        </span>
      )}
    </div>
  );
}

// ── Phase 19-A-03 (D-19) — Conformal CI row, rendered SIDE-BY-SIDE with the
//    Bayesian credible interval (Engine Prior MetricCard above). ADDITIVE —
//    Bayesian display is untouched. Row goes below the diffusion column's
//    metric stack so the user sees both 95% intervals on the same prior.
//
//    Tooltip wording: explains Vovk-Romano coverage guarantee and contrasts
//    it with the Bayesian credible interval. Per CONTEXT D-19 / RESEARCH
//    §State-of-the-Art line 612 — distribution-free ALONGSIDE parametric.
function ConformalCIRow({
  conformalLow,
  conformalHigh,
}: {
  conformalLow: number | null | undefined;
  conformalHigh: number | null | undefined;
}) {
  const pending = conformalLow == null || conformalHigh == null;
  return (
    <div
      data-testid="conformal-ci-row"
      className="mt-3 bg-surface-container-high p-3 rounded-lg flex items-center justify-between gap-2"
      title="A second 95% range for the engine's confidence, computed with a different math method (Vovk-Romano split-conformal). Same idea as the Bayesian range shown in the Engine Prior card above — different statistical guarantee. Shown alongside the Bayesian one, not instead of it."
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">
          Second Confidence Range
        </span>
        <span className="text-[11px] text-on-surface-variant/90 leading-snug">
          A second way of estimating the same range, using a different method — a useful cross-check.
        </span>
      </div>
      <span className="font-mono text-[11px] text-on-surface tabular-nums">
        {pending
          ? <span className="text-on-surface-variant">pending (needs 10+ examples)</span>
          : `[${formatPct(conformalLow)}–${formatPct(conformalHigh)}]`}
      </span>
    </div>
  );
}

// ── Phase 22 Wave 5 (D-17, CORE-ML-27) — Source-mix row ────────────────────
//
// Always-visible row per 22-UI-SPEC.md §Layout & Interaction Contract.
// Reads pre-computed calibration.source_mix from engine-context.ts
// (authoritative numerics boundary — this component does ZERO math).
//
// Placement: between "Concept drift" row and AlignmentDisagreementBlocks.
// Structure: SOURCE MIX eyebrow + regime pill + top-3 source pills (left cluster)
//            + SourceMixExpanded client island (right cluster).
// Empty / cold-start states per UI-SPEC §Empty / null states.

// Per UI-SPEC §Source pill format (verbatim).
const SOURCE_MIX_LABEL: Record<string, string> = {
  stocktwits: 'STOCKTWITS',
  options_term_structure: 'OPTIONS-TS',
  finsentllm_ensemble: 'FINSENT-LLM',
  reddit: 'REDDIT',
  hackernews: 'HACKERNEWS',
  news_analyst: 'NEWS/ANALYST',
  quiver_insider: 'INSIDER (FORM 4)',
  quiver_congressional: 'CONGRESS',
};

// Per UI-SPEC §Color §Accent (regime pill) — 4-bucket color/saturation.
const REGIME_BADGE: Record<string, string> = {
  'bull-low-vol':
    'bg-secondary/10 text-secondary border-secondary/40',
  'bull-high-vol':
    'bg-secondary/25 text-secondary border-secondary/60',
  'bear-low-vol':
    'bg-error/10 text-error border-error/40',
  'bear-high-vol':
    'bg-error/25 text-error border-error/60',
  ALL:
    'bg-surface-container-highest text-on-surface-variant border-outline-variant',
};

// Per UI-SPEC §Copywriting Contract §Regime pill (verbatim copy).
const REGIME_LABEL: Record<string, string> = {
  'bull-low-vol': 'CALM UPTREND',
  'bull-high-vol': 'BUMPY UPTREND',
  'bear-low-vol': 'SLOW DOWNTREND',
  'bear-high-vol': 'ROUGH DOWNTREND',
  ALL: 'ALL CONDITIONS',
};

// Per UI-SPEC §Copywriting Contract §Regime pill tooltip.
const REGIME_TOOLTIP: Record<string, string> = {
  'bull-low-vol':
    'Market is trending up and relatively calm. The engine learned these weights in similar calm uptrend periods.',
  'bull-high-vol':
    'Market is trending up but swinging a lot. The engine adjusts its source weights for choppier conditions.',
  'bear-low-vol':
    'Market is drifting down slowly — not a panic, just a grind. The engine weights sources accordingly.',
  'bear-high-vol':
    'Market is falling with high volatility. The engine is most cautious here and adjusts weights for this.',
  ALL:
    "Not enough market history to pick a specific regime, so the engine is using weights learned across all market conditions combined.",
};

// Per UI-SPEC §Color §Accent — micro-icon by regime.
const REGIME_ICON: Record<string, string> = {
  'bull-low-vol': '',
  'bull-high-vol': 'trending_up',
  'bear-low-vol': '',
  'bear-high-vol': 'warning',
  ALL: 'all_inclusive',
};

// SourceMix type — mirrored locally to avoid pulling the engine-context module
// (which imports Prisma) into a component render path.
interface SourceMixEntry {
  source_id: string;
  weight: number;
  weight_unconditional: number;
  weight_drift_30d: number[];
  drift_direction: 'rising' | 'falling' | 'flat';
  delta_pp_30d: number;
  is_cold_start_fallback: boolean;
}

interface SourceMixData {
  regime: 'bull-low-vol' | 'bull-high-vol' | 'bear-low-vol' | 'bear-high-vol' | 'ALL';
  top_sources: SourceMixEntry[];
}

function formatSourceMixPct(weight: number): string {
  const pct = weight * 100;
  if (pct < 1 && pct > 0) return '<1%';
  return `${Math.round(pct)}%`;
}

function SourceMixRow({ source_mix }: { source_mix: SourceMixData | undefined | null }) {
  // Graceful back-compat per UI-SPEC §Empty / null states: undefined → render nothing.
  if (!source_mix) return null;

  const { regime, top_sources } = source_mix;
  const isColdStartRegime = regime === 'ALL';
  const isEmpty = top_sources.length === 0;

  const regimePillClass = REGIME_BADGE[regime] ?? REGIME_BADGE.ALL;
  const regimeLabel = REGIME_LABEL[regime] ?? REGIME_LABEL.ALL;
  const regimeTooltip = REGIME_TOOLTIP[regime] ?? REGIME_TOOLTIP.ALL;
  const regimeIcon = REGIME_ICON[regime] ?? '';

  // Both regime-pill AND cold-start-banner test IDs carried on the same
  // element when regime === 'ALL' (per UI-SPEC §Test Hooks).
  const regimePillTestIds = isColdStartRegime
    ? { 'data-testid': 'source-mix-regime-pill', 'data-testid-cold': 'source-mix-cold-start-banner' }
    : { 'data-testid': 'source-mix-regime-pill' };

  return (
    <div
      data-testid="source-mix-row"
      className="mt-3 bg-surface-container-high p-3 rounded-lg flex items-center justify-between gap-3 flex-wrap"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant shrink-0 font-mono">
          WHAT THE ENGINE IS READING
        </span>
        <span
          {...regimePillTestIds}
          data-testid={regimePillTestIds['data-testid']}
          title={regimeTooltip}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold tracking-wide font-mono ${regimePillClass}`}
        >
          {regimeIcon && (
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
              {regimeIcon}
            </span>
          )}
          {regimeLabel}
        </span>
        {isColdStartRegime && (
          // Sibling hidden marker so the RTL test can query it distinctly
          // from the regime pill without depending on double-testid trick.
          <span data-testid="source-mix-cold-start-banner" className="sr-only">
            regime-unconditional cold-start
          </span>
        )}

        {isEmpty ? (
          <span data-testid="source-mix-empty" className="text-[11px] text-on-surface-variant">
            No source rankings yet — more will appear after the next nightly engine update.
          </span>
        ) : (
          <>
            <span className="text-on-surface-variant opacity-50" aria-hidden="true">
              ·
            </span>
            {top_sources.slice(0, 3).map((s, i) => (
              <SourceMixPill
                key={s.source_id}
                entry={s}
                rank={i + 1}
                testId={`source-mix-pill-${i + 1}` as const}
              />
            ))}
          </>
        )}
      </div>

      {!isEmpty && (
        <SourceMixExpanded sources={top_sources} regime={regime} />
      )}
    </div>
  );
}

function SourceMixPill({
  entry,
  rank,
  testId,
}: {
  entry: SourceMixEntry;
  rank: number;
  testId: string;
}) {
  const isLeading = rank === 1;
  const label = SOURCE_MIX_LABEL[entry.source_id] ?? entry.source_id.toUpperCase();
  const weightPct = formatSourceMixPct(entry.weight);
  const leadingClass = isLeading ? 'text-primary font-bold border-l-2 border-primary pl-1' : 'text-on-surface';
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 font-mono text-[11px] tabular-nums ${leadingClass}`}
      aria-label={
        isLeading
          ? `${label} · ${weightPct}. Leading source in this regime — the engine is weighting this input hardest.`
          : `${label} · ${weightPct}`
      }
    >
      {isLeading && (
        <span data-testid="source-mix-leading-star" aria-hidden="true">
          ★
        </span>
      )}
      <span>{label}</span>
      <span className="text-on-surface-variant">·</span>
      <span>{weightPct}</span>
    </span>
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
  status,
}: {
  patternLabel: string;
  capLabel: string;
  status: WatchStatus;
}) {
  return (
    <div className="flex items-center justify-end mb-3 gap-2">
      <span
        className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase border ${STATUS_BADGE[status]}`}
      >
        {STATUS_LABEL[status] ?? status}
      </span>
      {status === 'EXPLORATORY-WATCH' && <WatchBadge />}
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
  card1: { label: string; value: string; subValue: string; tooltip: string; plainLine?: string };
  card2: { label: string; value: string; subValue: string; tooltip: string; plainLine?: string };
  card3: { label: string; value: string; subValue: string; tooltip: string; plainLine?: string };
  isNoData?: boolean;
  // Phase 19-A-03 (D-19) — optional extra content below the metric stack
  // (Diffusion column uses this to render the Conformal CI row alongside
  // the Bayesian Engine Prior MetricCard).
  extraBelow?: ReactNode;
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
  extraBelow,
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
      {extraBelow}
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
      <p className="text-[11px] text-on-surface-variant/90 mb-2 leading-snug max-w-2xl">
        <strong className="text-on-surface uppercase tracking-widest text-[10px]">Same four signals across different time windows</strong>
        {' '}— each row shows how confident the engine is that the stock beats its sector over that many days. <strong className="text-on-surface">30 days is the main read</strong> (the starred row); the others are extra context.
      </p>
      <table className="w-full text-xs font-mono" data-testid="horizon-table">
        <thead>
          <tr
            className="bg-surface-container-low text-[10px] tracking-widest uppercase text-on-surface-variant"
            title="POST. = the engine's posterior confidence percentage. CI = the 95% range that confidence could fall in. ESS = how many past examples the engine learned from."
          >
            <th scope="col" className="text-left p-2">HORIZON</th>
            <th scope="col" className="text-right p-2" title="News & social signal — how confident the engine is that this setup beats the sector.">NEWS & SOCIAL</th>
            <th scope="col" className="text-right p-2 hidden xl:table-cell" title="The margin of error on the news/social estimate.">MARGIN</th>
            <th scope="col" className="text-right p-2" title="Chart pattern signal — how confident the engine is that this setup beats the sector.">CHART</th>
            <th scope="col" className="text-right p-2 hidden xl:table-cell" title="The margin of error on the chart estimate.">MARGIN</th>
            <th scope="col" className="text-right p-2" title="Big-fund activity signal — how confident the engine is that this setup beats the sector.">BIG FUNDS</th>
            <th scope="col" className="text-right p-2 hidden xl:table-cell" title="The margin of error on the big-fund estimate.">MARGIN</th>
            <th scope="col" className="text-right p-2" title="Exec/insider trades signal — how confident the engine is that this setup beats the sector.">EXECS</th>
            <th scope="col" className="text-right p-2 hidden xl:table-cell" title="The margin of error on the exec/insider estimate.">MARGIN</th>
            <th scope="col" className="text-right p-2" title="How many past examples the engine learned this row from, and how trustworthy that makes it.">EXAMPLES · STATUS</th>
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
                title={isPrimary ? 'Primary time frame — this is the main read the engine uses for its headline recommendation.' : undefined}
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
    // Phase 19-A-03 (D-19) — Conformal CI fields (additive alongside Bayesian)
    conformal_low,
    conformal_high,
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
          eyebrowLabel="DIFFUSION (NEWS & SOCIAL)"
          eyebrowHint="How news and social media chatter about this stock is spreading — from niche corners to mainstream feeds."
          eyebrowColorClass="text-on-surface-variant"
          patternLabel={diffusionPatternLabel}
          capLabel={capLabel}
          status={status}
          card1={{
            label: 'Track Record',
            value: formatPct(posterior_mean),
            subValue: posterior_mean != null
              ? `range: [${formatPct(ci_low)}–${formatPct(ci_high)}] · ${essOrN(effective_sample_size, sample_size)}`
              : essOrN(effective_sample_size, sample_size),
            plainLine: "How often this type of news-spreading pattern led to the stock beating its sector. Higher = more confident.",
            tooltip: 'Historical win rate: the percentage of past cases where this diffusion pattern × company size led to the stock beating its sector ETF over 7 days. The range below shows the uncertainty given the number of examples.',
          }}
          card2={{
            label: 'All-Signal Score',
            value: formatPct(logistic_score),
            subValue: logistic_score != null
              ? `range: [${formatPct(logistic_ci_low)}–${formatPct(logistic_ci_high)}] · ${essOrN(logistic_ess, logistic_sample_size)}`
              : essOrN(logistic_ess, logistic_sample_size),
            plainLine: "A second check that combines all the news/social features at once. If this agrees with the Track Record above, that's a good sign.",
            tooltip: 'A second model that runs all the news/social features together at once rather than averaging them. Gives a cross-check on the Track Record estimate.',
          }}
          card3={{
            label: 'Beats Random?',
            value: brier_in_sample != null && brier_null != null
              ? (brier_in_sample < brier_null ? '✓ YES' : '✗ NO')
              : '—',
            subValue: brier_null != null
              ? `scores: ${formatBrier(brier_in_sample)} vs ${formatBrier(brier_null)} random`
              : 'n/a',
            plainLine: "Does the engine do better than pure random? ✓ YES means the pattern carries real signal. ✗ NO means it doesn't outperform chance.",
            tooltip: 'Checks whether the engine\'s predictions are better than randomly shuffled outcomes. If YES, the pattern has genuine predictive signal beyond luck.',
          }}
          // Phase 19-A-03 (D-19) — Conformal CI row sits below the diffusion
          // column's metric stack, adjacent to the Bayesian Engine Prior CI
          // shown in card1.subValue. Both 95% intervals visible together.
          extraBelow={<ConformalCIRow conformalLow={conformal_low} conformalHigh={conformal_high} />}
        />

        {/* Column 2 — TECHNICAL */}
        <ClassColumn
          kind="technical"
          eyebrowLabel="TECHNICAL (CHART)"
          eyebrowHint="What the price chart itself is doing right now — momentum, trends, volume, support, resistance."
          eyebrowColorClass="text-on-surface-variant"
          patternLabel={technicalPatternLabel}
          capLabel={capLabel}
          status={techStatus}
          card1={{
            label: 'Chart Track Record',
            value: formatPct(technical_posterior_mean ?? null),
            subValue: technical_posterior_mean != null
              ? `range: ${formatCi(technical_ci ?? null)} · ${essOrN(technical_ess, technical_sample_size ?? 0)}`
              : essOrN(technical_ess, technical_sample_size ?? 0),
            plainLine: "How often this chart pattern led to the stock beating its sector over 30 days. Higher = more confident.",
            tooltip: 'Historical win rate: the percentage of past cases where this chart pattern × company size led to the stock beating its sector ETF over 30 days.',
          }}
          card2={{
            label: 'All-In Score',
            value: combined_logistic_score != null ? formatPct(combined_logistic_score) : '—',
            subValue: `30-day window · ${essOrN(logistic_ess, logistic_sample_size)}`,
            plainLine: "News/social and chart signals blended into one 30-day estimate — the engine's most complete single read.",
            tooltip: 'A model that combines all news/social and chart features together, trained on 30-day outcomes. The most complete blended estimate.',
          }}
          card3={{
            label: 'Examples Used',
            value: essOrN(technical_ess, technical_sample_size ?? 0),
            subValue: STATUS_LABEL[techStatus] ?? techStatus,
            plainLine: "How many past cases of this chart pattern the engine has learned from. More examples = more reliable.",
            tooltip: 'How many past examples of this pattern × company size the engine has seen and learned from. More examples means the track record is on firmer ground.',
          }}
        />

        {/* Column 3 — INSTITUTIONAL (new, UI-SPEC §A — secondary/teal identity) */}
        <ClassColumn
          kind="institutional"
          eyebrowLabel="INSTITUTIONAL (BIG FUNDS)"
          eyebrowHint="What big investors — hedge funds, mutual funds, pension funds — are doing, from 13F filings."
          eyebrowColorClass="text-secondary"
          patternLabel={institutionalPatternLabel}
          capLabel={capLabel}
          status={instStatus}
          isNoData={instIsNoData}
          card1={{
            label: 'Fund Track Record',
            value: formatPct(institutional_posterior_mean ?? null),
            subValue: institutional_posterior_mean != null
              ? `range: ${formatCi(institutional_ci ?? null)} · ${essOrN(institutional_ess, institutional_sample_size ?? 0)}`
              : instIsNoData ? 'No recent filings' : essOrN(institutional_ess, institutional_sample_size ?? 0),
            plainLine: "How often this type of big-fund activity led to the stock beating its sector over 30 days. Higher = more confident.",
            tooltip: 'Historical win rate: the percentage of past cases where this type of institutional fund move × company size led to the stock beating its sector ETF over 30 days.',
          }}
          card2={{
            label: 'Examples Used',
            value: essOrN(institutional_ess, institutional_sample_size ?? 0),
            subValue: STATUS_LABEL[instStatus] ?? instStatus,
            plainLine: "How many past fund filings like this the engine has learned from. More examples = more reliable.",
            tooltip: 'How many past examples of this fund activity pattern × company size the engine has seen and learned from.',
          }}
          card3={{
            label: 'Status',
            value: STATUS_LABEL[instStatus] ?? instStatus,
            subValue: instIsNoData
              ? 'No fund filings yet for this type'
              : `${essOrN(institutional_ess, institutional_sample_size ?? 0)} learned`,
            plainLine: instIsNoData
              ? "The engine hasn't seen any past filings like this for this company size yet."
              : "TRUSTED = the engine has enough examples and the pattern beats random. LEARNING = still collecting examples.",
            tooltip: 'How far along this signal type is in the engine\'s trust pipeline. It must pass 5 checks (enough examples, enough real outcomes, beats random, passes significance, positive drift) before being marked TRUSTED.',
          }}
        />

        {/* Column 4 — INSIDER (new, UI-SPEC §A — tertiary/amber identity) */}
        <ClassColumn
          kind="insider"
          eyebrowLabel="INSIDER (EXECS)"
          eyebrowHint="What execs and directors at this company are doing with their own shares, from Form 4 filings."
          eyebrowColorClass="text-tertiary"
          patternLabel={insiderPatternLabel}
          capLabel={capLabel}
          status={insdStatus}
          isNoData={insdIsNoData}
          card1={{
            label: 'Exec Track Record',
            value: formatPct(insider_posterior_mean ?? null),
            subValue: insider_posterior_mean != null
              ? `range: ${formatCi(insider_ci ?? null)} · ${essOrN(insider_ess, insider_sample_size ?? 0)}`
              : insdIsNoData ? 'No recent filings' : essOrN(insider_ess, insider_sample_size ?? 0),
            plainLine: "How often this type of exec buying or selling led to the stock beating its sector over 30 days.",
            tooltip: 'Historical win rate: the percentage of past cases where this type of exec/insider trade × company size led to the stock beating its sector ETF over 30 days.',
          }}
          card2={{
            label: 'Examples Used',
            value: essOrN(insider_ess, insider_sample_size ?? 0),
            subValue: STATUS_LABEL[insdStatus] ?? insdStatus,
            plainLine: "How many past exec filings like this the engine has learned from. More examples = more reliable.",
            tooltip: 'How many past examples of this exec trading pattern × company size the engine has seen and learned from.',
          }}
          card3={{
            label: 'Status',
            value: STATUS_LABEL[insdStatus] ?? insdStatus,
            subValue: insdIsNoData
              ? 'No exec filings yet for this type'
              : `${essOrN(insider_ess, insider_sample_size ?? 0)} learned`,
            plainLine: insdIsNoData
              ? "The engine hasn't seen any past exec filings like this for this company size yet."
              : "TRUSTED = the engine has enough examples and the pattern beats random. LEARNING = still collecting examples.",
            tooltip: 'How far along this signal type is in the engine\'s trust pipeline. It must pass 5 checks (enough examples, enough real outcomes, beats random, passes significance, positive drift) before being marked TRUSTED.',
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
            All Four Signals Agree
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
    // Phase 19-A-03 (D-19) — Conformal CI fields (additive alongside Bayesian)
    conformal_low, conformal_high,
  } = calibration;
  const patternLabel = flow_pattern ? FLOW_LABEL[flow_pattern] : 'NO PATTERN';
  const capLabel = CAP_LABEL[cap_class];

  return (
    <>
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-surface-container-high">
        <div className="flex items-baseline gap-3">
          <span
            className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant"
            title="The news-spreading pattern the engine recognized on this ticker, paired with its market-cap class. This is the row in the engine's historical table being looked up."
          >
            Pattern detected
          </span>
          <span className="font-mono text-sm font-bold text-on-surface tracking-wide">
            {patternLabel} <span className="text-on-surface-variant mx-1">×</span> {capLabel}
          </span>
        </div>
        <span className="inline-flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${STATUS_BADGE[status]}`}
            title={
              status === 'ACTIVE'              ? 'This pattern has been seen enough times and beats random chance. The engine trusts this track record.' :
              status === 'EXPLORATORY'         ? 'Fewer than 10 confirmed cases. The engine is still learning — treat this as early-stage.' :
              status === 'EXPLORATORY-WATCH'   ? 'The engine noticed this pattern is behaving differently than usual. Still active, but read with extra care.' :
              status === 'DEPRECATED'          ? 'This pattern has drifted or stopped beating random chance. The engine no longer trusts it.' :
                                                 'No history yet for this pattern and company size.'
            }
          >
            {STATUS_LABEL[status]}
          </span>
          {status === 'EXPLORATORY-WATCH' && <WatchBadge />}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <MetricCard
          label="Track Record"
          value={formatPct(posterior_mean)}
          subValue={posterior_mean != null ? `range: [${formatPct(ci_low)} – ${formatPct(ci_high)}] · ${essOrN(effective_sample_size, sample_size)}` : essOrN(effective_sample_size, sample_size)}
          plainLine="How often this type of news-spreading pattern led to the stock beating its sector. Higher = more confident."
          tooltip="Historical win rate: the percentage of past cases where this diffusion pattern × company size led to the stock beating its sector ETF over 7 days. The range shows uncertainty given the number of examples."
        />
        <MetricCard
          label="All-Signal Score"
          value={formatPct(logistic_score)}
          subValue={logistic_score != null ? `range: [${formatPct(logistic_ci_low)} – ${formatPct(logistic_ci_high)}] · ${essOrN(logistic_ess, logistic_sample_size)}` : essOrN(logistic_ess, logistic_sample_size)}
          plainLine="A second check that combines all news/social features at once. If this agrees with the Track Record above, that's a good sign."
          tooltip="A second model that runs all the news/social features together at once rather than averaging them. A cross-check on the Track Record estimate."
        />
        <MetricCard
          label="Beats Random?"
          value={brier_in_sample != null && brier_null != null
            ? (brier_in_sample < brier_null ? '✓ YES' : '✗ NO')
            : '—'}
          subValue={brier_null != null ? `scores: ${formatBrier(brier_in_sample)} vs ${formatBrier(brier_null)} random` : 'n/a'}
          plainLine="Does the engine do better than pure random? ✓ YES means the pattern carries real signal. ✗ NO means it doesn't outperform chance."
          tooltip="Checks whether the engine's predictions are better than randomly shuffled outcomes. If YES, the pattern has genuine predictive signal beyond luck."
        />
      </div>

      {/* Phase 19-A-03 (D-19) — Conformal CI row, sibling to Bayesian Engine
          Prior MetricCard above. ADDITIVE — Bayesian display untouched. */}
      <div className="mb-5">
        <ConformalCIRow conformalLow={conformal_low} conformalHigh={conformal_high} />
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
    // Phase 19-C-10 (D-42) — Cross-class contradiction warnings.
    // DETECTION-ONLY mode per D-42 — warnings are informational; report output is NOT gated by them.
    // Upgrading to gating mode requires a separate plan and explicit decision.
    contradiction_warnings,
    // Phase 21 (21-4-07) — sector-relative headline + SPY-alpha "vs market" diagnostic.
    primarySectorEtf = null,
    primarySectorEtfIsCurrent = false,
    spyAlphaHitRate = null,
  } = {
    ...calibration,
    primarySectorEtf: calibration.primary_sector_etf,
    primarySectorEtfIsCurrent: calibration.primary_sector_etf_is_current,
    spyAlphaHitRate: calibration.spy_alpha_hit_rate,
  };

  // Phase 17 gate: quad-class layout requires populated horizon_calibrations.
  // Old persisted reports (no horizon_calibrations) take the legacy single-column path.
  const showQuadClass = (horizon_calibrations?.length ?? 0) >= 1;
  const agreementState: AgreementState = agreement ?? 'unknown';

  // ── Phase 21 (21-4-07) — headline benchmark resolution ────────────────────
  // The engine now grades calibration against the ticker's SECTOR ETF (Phase 21
  // keystone). The headline names that ETF; SPY-alpha is retained as a smaller
  // "vs market (SPY-alpha, derived)" diagnostic so both framings co-exist during
  // the migration window. When sector data is absent OR the sector resolves to
  // SPY (the fallback sentinel), the headline collapses to the legacy "market
  // (SPY)" wording and the secondary tile is suppressed (no duplicate info).
  const hasSectorBenchmark = !!primarySectorEtf && primarySectorEtf !== 'SPY';
  const headlineBenchmark = hasSectorBenchmark
    ? (primarySectorEtfIsCurrent ? 'sector (current)' : `sector (${primarySectorEtf})`)
    : 'market (SPY)';
  const showSpyAlphaTile = hasSectorBenchmark && spyAlphaHitRate != null;
  // engine-review 2026-06-17 fix #1: when the sector ETF was resolved from
  // TODAY's mapping (cold start, no labeled outcomes yet), the headline
  // "Calibration vs. sector (XYZ)" is honest about the benchmark but
  // misleading about whether the engine has learned against it. Surface
  // it explicitly so the user doesn't read "the engine likes this stock
  // vs XLK" when the engine has literally zero outcomes vs XLK.
  const isColdStartSector = hasSectorBenchmark
    && primarySectorEtfIsCurrent
    && (calibration.sample_size ?? 0) === 0;

  const [expanded, setExpanded] = useState(false);

  // Compact summary line shown when collapsed
  const summaryPct = calibration.posterior_mean != null
    ? `${Math.round(calibration.posterior_mean * 100)}% track record`
    : null;
  const summaryAgreement = agreementState !== 'unknown' ? AGREEMENT_BADGE[agreementState].text : null;
  const summaryStatus = STATUS_LABEL[calibration.status] ?? calibration.status;

  return (
    <section
      data-testid="engine-calibration-panel"
      className="bg-surface-container border border-surface-container-high rounded-lg relative overflow-hidden"
    >
      {/* Always-visible compact header — click to expand */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 gap-4 hover:bg-surface-container-high transition-colors text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-tertiary text-sm shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
          <span className="text-[11px] font-bold tracking-widest uppercase text-tertiary shrink-0">Engine Track Record</span>
          {summaryPct && (
            <span className="text-[11px] font-mono text-on-surface ml-1 shrink-0">{summaryPct}</span>
          )}
          {summaryAgreement && (
            <span className="hidden sm:inline text-[10px] font-bold tracking-widest uppercase text-on-surface-variant border border-outline-variant rounded-full px-2 py-0.5 ml-1 shrink-0">
              {summaryAgreement}
            </span>
          )}
          <span className={`text-[10px] font-black tracking-widest uppercase border rounded-full px-2 py-0.5 ml-1 shrink-0 ${STATUS_BADGE[calibration.status]}`}>
            {summaryStatus}
          </span>
        </div>
        <span className="text-[10px] text-on-surface-variant tracking-widest uppercase shrink-0 flex items-center gap-1">
          {expanded ? 'Hide details' : 'How does the engine work?'}
          <span className="material-symbols-outlined text-sm">{expanded ? 'expand_less' : 'expand_more'}</span>
        </span>
      </button>

      {/* Expandable full panel */}
      {expanded && (
      <div className="px-6 pb-6 pt-2 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-48 h-48 bg-tertiary/5 blur-[100px]" aria-hidden="true" />

      {/* Header row */}
      <div className="flex items-start justify-between mb-5 relative gap-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-tertiary text-base mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
            psychology
          </span>
          <div>
            {/* Phase 21 (21-4-07) — PRIMARY headline names the sector ETF the
                engine grades against. Falls back to "market (SPY)" when no
                sector benchmark is available (old reports / SPY sentinel). */}
            <h3 className="text-[11px] font-bold tracking-widest uppercase text-tertiary">
              Calibration vs. {headlineBenchmark}
            </h3>
            <p className="text-[12px] text-on-surface-variant mt-0.5 leading-snug max-w-xl">
              What the engine has learned from tracking similar setups — four signal types, each with its own track record.
            </p>
            <div className="mt-2 text-[12px] text-on-surface-variant/90 leading-relaxed max-w-2xl space-y-1">
              <p>
                <strong className="text-on-surface">How to read this:</strong> the engine watches four different angles on the stock — news/social buzz, the price chart, big-fund moves, and exec trades — and for each one it shows a percentage. <em>That percentage is the engine&apos;s confidence that this kind of setup beats the sector ETF over the next few weeks.</em> Higher means more confident; the small range next to it shows how much wiggle room.
              </p>
              <p>
                The bigger the sample size next to each number, the more past examples the engine learned from — so trust those rows more.
              </p>
            </div>
            {/* SECONDARY (smaller, dimmer) — legacy SPY-alpha "vs market"
                diagnostic. DERIVED on the fly (BLOCKER-3), never a stored
                column. Both framings co-exist during the migration window;
                suppressed when the sector benchmark already IS SPY. */}
            {showSpyAlphaTile && (
              <div
                data-testid="spy-alpha-diagnostic"
                className="mt-2 flex items-baseline gap-2 text-[10px] font-mono text-on-surface-variant/70 tracking-wide"
                title="Legacy benchmark, retained as a migration diagnostic. Derived on the fly: the ticker's absolute return minus the contemporaneous SPY return over the same window — not a stored column."
              >
                <span className="tracking-widest uppercase">vs market (SPY-alpha, derived)</span>
                <span className="opacity-50">·</span>
                <span className="tabular-nums">Hit rate: {spyAlphaHitRate!.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-on-surface-variant tracking-widest uppercase shrink-0">
          <span>Cycle {cycle_count}</span>
          <span className="opacity-50">·</span>
          <span>{timeAgo(predicted_at)}</span>
        </div>
      </div>

      {/* engine-review 2026-06-17 fix #1: cold-start honesty banner */}
      {isColdStartSector && (
        <div
          data-testid="cold-start-sector-banner"
          className="mb-5 bg-tertiary/10 border-l-2 border-tertiary p-3 rounded-r"
          title="The sector benchmark shown in the headline was resolved from this ticker's current sector mapping, not from any historical outcome. The engine has not yet learned against this benchmark — what you're seeing below are live signals only, not a calibrated prior."
        >
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            <strong className="text-tertiary uppercase tracking-widest text-[10px]">Cold start</strong>
            {' '}— this ticker has no resolved outcomes against {primarySectorEtf} yet. The percentages below come from live signals on this report; the historical prior is still warming up. Treat confidence as exploratory until at least 10 outcomes resolve.
          </p>
        </div>
      )}

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
      <div className="flex flex-col gap-2 mt-5 mb-5 pb-4 border-b border-surface-container-high">
        <p className="text-[11px] text-on-surface-variant/90 leading-snug max-w-2xl">
          <strong className="text-on-surface uppercase tracking-widest text-[10px]">Staying consistent?</strong>
          {' '}— is the engine behaving the same way it used to on this kind of setup? If it&apos;s drifting, trust today&apos;s numbers a little less.
        </p>
        <div className="flex items-center justify-between gap-3">
          <DriftGauge z={drift_z} />
          {diffusion_sparkline && diffusion_sparkline.length >= 2 && (
            <div className="flex items-center gap-3 text-[10px] font-mono text-on-surface-variant tracking-widest uppercase">
              <span className="text-secondary">niche</span>
              <span className="text-tertiary">middle</span>
              <span className="text-outline-variant">mainstream</span>
              <Sparkline data={diffusion_sparkline} />
            </div>
          )}
        </div>
      </div>

      {/* Phase 22 Wave 5 (D-17, CORE-ML-27) — Source-mix row.
          Renders only when calibration.source_mix is populated (old reports
          omit the field and this row hides itself gracefully per UI-SPEC
          §Empty / null states). Numerics arrive pre-computed from
          engine-context.buildSourceMix — this component does zero math. */}
      <SourceMixRow source_mix={calibration.source_mix} />
      {/* Phase 29 (D-05, DEMO-11) — Price Forecast Calibration tile.
          Client island — fetches /api/insights/magnitude-calibration.
          Hides gracefully when fewer than 3 buckets meet N>=20. */}
      <MagnitudeCalibrationTile />

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

      {/* Phase 19-C-10 (D-42) — Cross-class contradiction warnings.
          DETECTION-ONLY mode per D-42 — warnings are informational; report output is NOT
          gated by them. Upgrading to gating mode requires a separate plan and explicit
          decision. Renders only when the detector flag is on/shadow AND severity threshold
          is exceeded. Old persisted reports without the field render nothing (graceful
          back-compat). */}
      {contradiction_warnings && contradiction_warnings.length > 0 && (
        <div
          data-testid="contradiction-warnings"
          className="mt-4 bg-error/5 border-error/40 border-l-2 p-4 rounded-r"
          title="DETECTION-ONLY: cross-class contradiction warnings are informational. The report output (recommendation, sentiment, signals) is NOT gated by these warnings — they are surfaced for user awareness only."
        >
          <h4 className="text-[10px] font-bold tracking-widest uppercase text-error mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">warning</span>
            Cross-class warnings
          </h4>
          <ul className="text-xs text-on-surface-variant leading-relaxed list-disc pl-5 space-y-1">
            {contradiction_warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-on-surface-variant tracking-wide leading-relaxed italic">
            Detection-only — these warnings are informational and do not change the report&apos;s recommendation.
          </p>
        </div>
      )}

      {/* Footer note — verbatim per UI-SPEC (both phases) */}
      <p className="mt-4 text-[10px] text-on-surface-variant tracking-wide leading-relaxed">
        The engine checks how accurate its predictions were at 3, 7, 14, 30, 60, and 90 days later. Its confidence numbers update automatically as real outcomes come in — so re-running this report after the nightly update may show slightly different numbers. <strong className="text-on-surface">30 days is the primary time frame.</strong>
      </p>
      </div>
      )}
    </section>
  );
}

export default EngineCalibrationPanel;
