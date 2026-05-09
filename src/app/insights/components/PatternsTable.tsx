// src/app/insights/components/PatternsTable.tsx
// Phase 18-09 — surfaces ESS-based credible intervals (CORE-ML-03) on /insights.
// Renders one row per LearnedPattern cell with:
//   - effective_sample_size column (1 decimal) ← Plan 04 cron writes weighted α/β
//   - raw N debug column (D-12 — kept for forensic comparison vs ESS)
//   - 95% credible interval [low%, high%] computed via credibleInterval95 from
//     the now-weighted α/β columns (sparse-but-recent cells visibly tighten —
//     CORE-ML-03 acceptance bar)
//   - recovery counter for cells in EXPLORATORY-WATCH: counts `event_type: 'drift_clear'`
//     LearningEvent rows in the last 14 days; when recoveryCount >= 14 && cell.effective_sample_size >= 30
//     a "Recovery ready" hint surfaces (D-09 step 4 / D-17 operational action)
//
// Server component — no 'use client' directive; renders inside the server-side
// /insights page that already runs Prisma queries.

import { credibleInterval95 } from '@/lib/learning';
import { FEATURES } from '@/lib/features';
import { WatchBadge } from '@/components/WatchBadge';

export interface PatternRow {
  signal_class: string;
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
  alpha: number;
  beta: number;
  sample_size: number;
  effective_sample_size: number;
  status: string;
  recoveryCount: number; // count of `drift_clear` events in last 14d (from groupBy on signal_class+pattern_key+cap_class+horizon_days)
  // Phase 19 Plan 19-A-07 — empirical-Bayes pooling fields (nullable; cron writes them).
  parent_alpha?: number | null;
  parent_beta?: number | null;
  shrinkage_strength?: number | null;
}

// Plan 19-A-07: read-time pooled (α, β) when flag is on AND parent is set.
function pooledBeta(cell: PatternRow): { alpha: number; beta: number } {
  if (
    !FEATURES.hierarchical_pooling_enabled ||
    cell.parent_alpha == null ||
    cell.parent_beta == null ||
    cell.shrinkage_strength == null
  ) {
    return { alpha: cell.alpha, beta: cell.beta };
  }
  const n = cell.alpha + cell.beta;
  const lambda = cell.shrinkage_strength;
  return {
    alpha: (n * cell.alpha + lambda * cell.parent_alpha) / (n + lambda),
    beta: (n * cell.beta + lambda * cell.parent_beta) / (n + lambda),
  };
}

const SIGNAL_LABELS: Record<string, string> = {
  diffusion: 'DIFFUSION',
  technical: 'TECHNICAL',
  insider: 'INSIDER',
  institutional: 'INSTITUTIONAL',
};

const CAP_LABELS: Record<string, string> = {
  large_cap: 'LARGE',
  mid_cap: 'MID',
  small_cap: 'SMALL',
};

export function PatternsTable({ rows }: { rows: PatternRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-[10px] tracking-[0.4em] text-outline uppercase font-mono py-12 text-center">
        No learned patterns yet — the engine writes its first row after the first 7-day outcome resolves.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="ess-patterns-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase border-b border-outline-variant/30">
            <th className="text-left font-medium px-3 py-3">Signal × Pattern</th>
            <th className="text-left font-medium px-3 py-3">Cap</th>
            <th className="text-right font-medium px-3 py-3">Horizon</th>
            <th className="text-right font-medium px-3 py-3">ESS</th>
            <th className="text-right font-medium px-3 py-3">95% CI</th>
            <th className="text-left font-medium px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((cell) => {
            const ci = credibleInterval95(pooledBeta(cell));
            const ciLowPct = (ci.low * 100).toFixed(1);
            const ciHighPct = (ci.high * 100).toFixed(1);
            const recoveryCount = cell.recoveryCount;
            // D-09 step 4: 14 consecutive clear days AND ESS≥30 → eligible to flip back to ACTIVE.
            const recoveryReady = cell.status === 'EXPLORATORY-WATCH'
              && recoveryCount >= 14 && cell.effective_sample_size >= 30;
            const rowKey = `${cell.signal_class}-${cell.pattern_key}-${cell.cap_class}-${cell.horizon_days}`;
            return (
              <tr
                key={rowKey}
                data-testid={`ess-row-${rowKey}`}
                className="border-b border-outline-variant/10"
              >
                <td className="px-3 py-3 font-mono text-xs text-on-surface">
                  <div className="text-[9px] text-outline tracking-[0.3em] uppercase">
                    {SIGNAL_LABELS[cell.signal_class] ?? cell.signal_class.toUpperCase()}
                  </div>
                  <div className="text-on-surface">{cell.pattern_key.replace(/_/g, ' ')}</div>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-on-surface-variant">
                  {CAP_LABELS[cell.cap_class] ?? cell.cap_class}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-on-surface-variant text-right tabular-nums">
                  {cell.horizon_days}d
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-mono text-xs">
                  <span className="text-on-surface" data-testid="ess-value">
                    {cell.effective_sample_size.toFixed(1)}
                  </span>
                  <span
                    className="ml-2 text-[10px] text-outline"
                    data-testid="ess-raw-n"
                    title="Raw trial count — debug column per D-12"
                  >
                    (N={cell.sample_size})
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-mono text-xs text-on-surface">
                  [
                  <span data-testid="ess-ci-low">{ciLowPct}</span>
                  %–
                  <span data-testid="ess-ci-high">{ciHighPct}</span>
                  %]
                </td>
                <td className="px-3 py-3">
                  {cell.status === 'EXPLORATORY-WATCH' ? (
                    <div className="flex flex-col gap-1">
                      <WatchBadge />
                      <span className="text-[10px] font-mono text-outline" data-testid="ess-recovery-count">
                        {recoveryCount}/14 clear days
                        {recoveryReady ? ' · ACTION: re-flip to ACTIVE on next cron tick' : ''}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 border border-outline-variant/30 bg-surface-container-low text-on-surface-variant">
                      {cell.status}
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
