'use client';

// src/components/SourceMixExpanded.tsx
//
// Phase 22 Wave 5 (D-17, CORE-ML-27) — Client-island expand panel for the
// "Source mix" row inside EngineCalibrationPanel per 22-UI-SPEC.
//
// Responsibilities (per UI-SPEC §Render Boundaries):
//   - Owns the disclosure state (`expanded` boolean).
//   - Renders the disclosure button ("Show / Hide full ranking" + chevron).
//   - When expanded, renders the 5-column ranking table with a hand-rolled
//     SVG sparkline per source (mirroring the existing Sparkline primitive at
//     EngineCalibrationPanel.tsx:233-250 — NO chart library).
//   - Full 8-source ordering (Rank / Source / Weight / 30d Drift / Δ vs 30d).
//   - #1 leading source gets the ★ marker + `border-l-2 border-primary` stripe
//     (indigo primary reserved for this element only per UI-SPEC §Color).
//   - Cold-start row treatment per UI-SPEC §Cold-start row.
//
// Contract (from engine-context.buildSourceMix — authoritative numerics):
//   - `sources`: already sorted DESC by weight, up to 8 entries.
//   - `regime`: label at the report's PIT; 'ALL' when the classifier fell back.
//   - This component does ZERO math. Reads delta / direction as-computed.

import { useState, useCallback, useId } from 'react';

// Per UI-SPEC §Source pill format (verbatim) — display labels for the 8 sources.
// Keyed by string (not the strict SourceMixSourceId union) so the client bundle
// does not have to import engine-context.ts (which pulls Prisma into the graph).
const SOURCE_LABEL: Record<string, string> = {
  stocktwits: 'STOCKTWITS',
  options_term_structure: 'OPTIONS-TS',
  finsentllm_ensemble: 'FINSENT-LLM',
  reddit: 'REDDIT',
  hackernews: 'HACKERNEWS',
  news_analyst: 'NEWS/ANALYST',
  quiver_insider: 'INSIDER (FORM 4)',
  quiver_congressional: 'CONGRESS',
};

// Local mirror of the SourceMix contract from engine-context.ts / types.ts.
// Kept as a widened string source_id so the client bundle stays server-clean.
export interface SourceMixExpandedEntry {
  source_id: string;
  weight: number;
  weight_unconditional: number;
  weight_drift_30d: number[];
  drift_direction: 'rising' | 'falling' | 'flat';
  delta_pp_30d: number;
  is_cold_start_fallback: boolean;
}

export type SourceMixRegime =
  | 'bull-low-vol'
  | 'bull-high-vol'
  | 'bear-low-vol'
  | 'bear-high-vol'
  | 'ALL';

interface SourceMixExpandedProps {
  sources: SourceMixExpandedEntry[];
  regime: SourceMixRegime;
}

export function SourceMixExpanded({ sources, regime }: SourceMixExpandedProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  // Region aria-label per UI-SPEC §Focus management.
  const regionLabel =
    regime === 'ALL'
      ? 'Source ranking and 30d weight drift, regime-unconditional fallback'
      : `Source ranking and 30d weight drift in ${regime}`;

  return (
    <div className="flex flex-col items-end gap-2 print:items-stretch print:w-full">
      <button
        type="button"
        data-testid="source-mix-disclosure"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={toggle}
        // Print stylesheet per UI-SPEC §Print / PDF behavior — hidden in print.
        className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant hover:text-on-surface focus-visible:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded px-2 py-1 min-h-[44px] print:hidden"
      >
        <span>{expanded ? 'Hide full ranking' : 'Show full ranking'}</span>
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {/* Expanded panel — visible on click AND always visible when printing. */}
      <div
        id={panelId}
        data-testid="source-mix-expanded"
        role="region"
        aria-label={regionLabel}
        // max-h transition per UI-SPEC §Expand panel animation (200ms ease-out).
        // NEVER taller than 320px before scrolling.
        className={`w-full overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
          expanded
            ? 'max-h-[320px] opacity-100 delay-[60ms]'
            : 'max-h-0 opacity-0 pointer-events-none'
        } print:max-h-none print:opacity-100 print:overflow-visible`}
      >
        <div className="bg-surface-container-high rounded-lg mt-2 overflow-y-auto max-h-[320px] print:max-h-none print:overflow-visible">
          <table className="w-full text-[11px] font-mono tabular-nums">
            <thead>
              <tr className="text-[10px] tracking-widest uppercase text-on-surface-variant border-b border-outline-variant">
                <th className="text-left px-3 py-2 font-normal w-10">Rank</th>
                <th className="text-left px-3 py-2 font-normal">Source</th>
                <th className="text-right px-3 py-2 font-normal w-16">Weight</th>
                <th className="text-left px-3 py-2 font-normal w-20">30d Drift</th>
                <th className="text-right px-3 py-2 font-normal w-28">Δ vs 30d</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((entry, i) => (
                <SourceRow key={entry.source_id} entry={entry} rank={i + 1} regime={regime} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface SourceRowProps {
  entry: SourceMixExpandedEntry;
  rank: number;
  regime: SourceMixRegime;
}

function SourceRow({ entry, rank, regime }: SourceRowProps) {
  const isLeading = rank === 1;
  const label = SOURCE_LABEL[entry.source_id] ?? entry.source_id.toUpperCase();
  const weightPct = formatWeightPct(entry.weight);
  const deltaText = formatDelta(entry.delta_pp_30d);

  // Cold-start row treatment per UI-SPEC §Cold-start row.
  const isColdStart = entry.is_cold_start_fallback;

  return (
    <tr
      className={`border-b border-outline-variant/40 last:border-b-0 ${
        isLeading ? 'border-l-2 border-l-primary' : ''
      }`}
      title={
        isColdStart
          ? `Falling back to (source, 'ALL') — this (source × ${regime}) cell has not yet accumulated enough IC observations to support regime-conditional weights (D-09 cold-start).`
          : undefined
      }
    >
      <td className="text-left px-3 py-1.5 text-on-surface">
        {isLeading ? (
          <span data-testid="source-mix-leading-star" className="text-primary" aria-hidden="true">
            {'★'}
          </span>
        ) : (
          <span className="text-on-surface-variant">{rank}</span>
        )}
      </td>
      <td className={`text-left px-3 py-1.5 ${isLeading ? 'text-primary font-bold' : 'text-on-surface'}`}>
        {label}
      </td>
      <td className="text-right px-3 py-1.5 text-on-surface">{weightPct}</td>
      <td className="text-left px-3 py-1.5">
        <DriftSparkline
          data={entry.weight_drift_30d}
          direction={entry.drift_direction}
          weightUnconditional={entry.weight_unconditional}
          sourceLabel={label}
          deltaPp={entry.delta_pp_30d}
          isColdStart={isColdStart}
          testId={`source-mix-sparkline-${entry.source_id}`}
        />
      </td>
      <td className="text-right px-3 py-1.5">
        {isColdStart ? (
          <span className="text-[10px] text-on-surface-variant italic tracking-wide">
            regime-unconditional
          </span>
        ) : (
          <span className={deltaColorClass(entry.drift_direction)}>{deltaText}</span>
        )}
      </td>
    </tr>
  );
}

// ── Hand-rolled SVG sparkline — mirrors EngineCalibrationPanel.tsx:233-250 ──
// NO chart library. Renders per-source 30-trading-day weight-drift line plus a
// dashed horizontal baseline at the (source, 'ALL') unconditional weight.
interface DriftSparklineProps {
  data: number[];
  direction: 'rising' | 'falling' | 'flat';
  weightUnconditional: number;
  sourceLabel: string;
  deltaPp: number;
  isColdStart: boolean;
  testId: string;
}

function DriftSparkline({
  data,
  direction,
  weightUnconditional,
  sourceLabel,
  deltaPp,
  isColdStart,
  testId,
}: DriftSparklineProps) {
  if (!data || data.length < 2) {
    return <span className="text-on-surface-variant/50">—</span>;
  }
  const W = 60;
  const H = 16;
  // Normalize against the max of data + unconditional so the baseline is
  // always inside the viewport.
  const maxVal = Math.max(...data, weightUnconditional, 0.01);
  const xStep = W / (data.length - 1);
  const y = (v: number) => H - (v / maxVal) * H;
  const path = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * xStep).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(' ');
  const baselineY = y(weightUnconditional).toFixed(2);

  // Cold-start rows render neutral stroke per UI-SPEC (visually flat).
  const strokeClass = isColdStart
    ? 'text-outline-variant'
    : direction === 'rising'
    ? 'text-secondary'
    : direction === 'falling'
    ? 'text-error'
    : 'text-on-surface-variant';

  const weightNowPct = (data[data.length - 1] * 100).toFixed(1);
  const weightAllPct = (weightUnconditional * 100).toFixed(1);
  const sign = deltaPp > 0 ? '+' : '';
  const titleBody = `${sourceLabel}: ${sign}${deltaPp.toFixed(1)}pp over 30d (regime weight ${weightNowPct}% vs (source, 'ALL') reference ${weightAllPct}%).`;

  return (
    <svg
      width={W}
      height={H}
      className="overflow-visible"
      role="img"
      aria-label={titleBody}
      data-testid={testId}
    >
      <title>{titleBody}</title>
      {/* Dashed baseline at unconditional weight — UI-SPEC §Drift sparkline colors. */}
      <line
        x1={0}
        y1={baselineY}
        x2={W}
        y2={baselineY}
        stroke="currentColor"
        className="text-outline-variant"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <path d={path} stroke="currentColor" className={strokeClass} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// ── Formatters ─────────────────────────────────────────────────────────────
// Per UI-SPEC: weights render as tabular-nums integers; <1 shows "<1%".
function formatWeightPct(weight: number): string {
  const pct = weight * 100;
  if (pct < 1 && pct > 0) return '<1%';
  return `${Math.round(pct)}%`;
}

function formatDelta(deltaPp: number): string {
  if (Math.abs(deltaPp) < 0.5) return 'flat';
  const sign = deltaPp > 0 ? '+' : '−';
  return `${sign}${Math.abs(deltaPp).toFixed(1)}pp`;
}

function deltaColorClass(direction: 'rising' | 'falling' | 'flat'): string {
  if (direction === 'rising') return 'text-secondary';
  if (direction === 'falling') return 'text-error';
  return 'text-on-surface-variant';
}

export default SourceMixExpanded;
