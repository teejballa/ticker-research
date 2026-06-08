// src/app/insights/baselines/components/BaselinesComparisonTable.tsx
// Phase 21.1 Wave 5 — Surface 1: 3-way comparison table component.
//
// Pure presentation — receives already-computed rows (no DB access).
// Renders 3 metric rows (Brier / IC / Log-loss) × 4 model columns
// (LLM / Logistic-24 / Logistic-canonical / Null).
//
// Each cell is a 3-line cluster:
//   1. Value (12px JetBrains Mono tabular-nums)
//   2. BCa CI on the next line (10px mono outline)
//   3. FDR glyph + q-value or em-dash
//
// Color per UI-SPEC §Color semantic usage:
//   - teal (↑) when LLM CI fully above comparator CI + FDR q < 0.10
//   - rose (↓) when LLM CI fully below comparator CI + FDR q < 0.10
//   - ink (─) when CIs overlap (most cells — honest baseline-pessimist)
//
// No hardcoded hex. No external chart library.

import { MetricTooltip } from '../../components/MetricTooltip';
import type { BaselineComparisonRow } from '@/lib/engine-context';

interface BaselinesComparisonTableProps {
  rows: BaselineComparisonRow[];
  n_trials_attempted: number;
  last_updated: Date | null;
  horizon: string;
}

const METRIC_LABELS: Record<BaselineComparisonRow['metric'], string> = {
  brier: 'Brier',
  ic: 'IC',
  log_loss: 'Log-loss',
};

// Lower Brier/log_loss = better. Higher IC = better.
// For "beat the baseline": LLM lower than comparator on Brier/log_loss,
// LLM higher than comparator on IC.
type Direction = 'lower_better' | 'higher_better';
const METRIC_DIRECTION: Record<BaselineComparisonRow['metric'], Direction> = {
  brier: 'lower_better',
  ic: 'higher_better',
  log_loss: 'lower_better',
};

function fmtVal(v: number, metric: BaselineComparisonRow['metric']): string {
  if (isNaN(v)) return '—';
  if (metric === 'ic') return (v >= 0 ? '+' : '') + v.toFixed(3);
  return v.toFixed(3);
}

function fmtBound(v: number, metric: BaselineComparisonRow['metric']): string {
  if (isNaN(v)) return '—';
  if (metric === 'ic') return (v >= 0 ? '+' : '') + v.toFixed(3);
  return v.toFixed(3);
}

/**
 * Compare LLM vs a comparator cell.
 * Returns: 'wins' (teal ↑), 'loses' (rose ↓), or 'overlap' (─)
 * based on CI overlap after FDR correction.
 */
function compareLLM(
  llm: { value: number; ci: [number, number]; q_value: number | null },
  comparator: { value: number; ci: [number, number]; q_value: number | null },
  direction: Direction,
): 'wins' | 'loses' | 'overlap' {
  const [llmLo, llmHi] = llm.ci;
  const [cmpLo, cmpHi] = comparator.ci;

  // If either CI has NaN bounds, treat as overlap
  if ([llmLo, llmHi, cmpLo, cmpHi].some(isNaN)) return 'overlap';

  // CI overlap check: CIs don't overlap iff one is fully above the other
  const llmAbove = llmLo > cmpHi;
  const llmBelow = llmHi < cmpLo;

  if (direction === 'lower_better') {
    if (llmAbove) return 'loses'; // LLM CI fully above comparator = LLM higher = worse for Brier/log_loss
    if (llmBelow) return 'wins';  // LLM CI fully below comparator = LLM lower = better for Brier/log_loss
  } else {
    if (llmAbove) return 'wins';  // LLM CI fully above comparator = LLM higher = better for IC
    if (llmBelow) return 'loses'; // LLM CI fully below comparator = LLM lower = worse for IC
  }

  return 'overlap';
}

interface CellProps {
  value: number;
  ci: [number, number];
  q_value: number | null;
  metric: BaselineComparisonRow['metric'];
  vsLLM?: 'wins' | 'loses' | 'overlap'; // only on LLM column vs itself = n/a
}

function ValueCell({ value, ci, q_value, metric, vsLLM }: CellProps) {
  const colorCls =
    vsLLM === 'wins'
      ? 'text-secondary'
      : vsLLM === 'loses'
        ? 'text-error'
        : 'text-on-surface';
  const glyph =
    vsLLM === 'wins' ? '↑' : vsLLM === 'loses' ? '↓' : '─';

  return (
    <td className="px-4 py-3 text-right align-top">
      <div className={`tabular-nums font-mono text-xs font-medium ${colorCls}`}>
        {vsLLM && vsLLM !== 'overlap' ? (
          <span aria-label={vsLLM === 'wins' ? 'beats LLM' : 'below LLM'}>
            {glyph}&nbsp;
          </span>
        ) : null}
        {fmtVal(value, metric)}
      </div>
      <div className="mt-0.5 text-[10px] font-mono text-outline tabular-nums">
        [{fmtBound(ci[0], metric)}, {fmtBound(ci[1], metric)}]
      </div>
      {q_value != null && (
        <div className="mt-0.5 text-[10px] font-mono text-outline tabular-nums">
          q={q_value.toFixed(3)}
        </div>
      )}
    </td>
  );
}

function NullCell({ value, metric }: { value: number; metric: BaselineComparisonRow['metric'] }) {
  return (
    <td className="px-4 py-3 text-right align-top">
      <div className="tabular-nums font-mono text-xs text-outline">
        {fmtVal(value, metric)}
      </div>
      <div className="mt-0.5 text-[10px] font-mono text-outline">—</div>
    </td>
  );
}

export function BaselinesComparisonTable({
  rows,
  n_trials_attempted,
  last_updated,
  horizon,
}: BaselinesComparisonTableProps) {
  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-outline-variant bg-surface p-6">
        <p className="text-sm font-medium text-on-surface">Baselines training</p>
        <p className="mt-1 text-sm text-on-surface-variant">
          Both logistic baselines need n&nbsp;≥&nbsp;100 graded predictions before their
          out-of-sample Brier and IC are reported. The table populates as the engine accumulates
          outcomes.
        </p>
      </div>
    );
  }

  // Check for stale data (> 36h)
  const staleHours =
    last_updated
      ? Math.round((Date.now() - last_updated.getTime()) / (60 * 60 * 1000))
      : null;
  const isStale = staleHours != null && staleHours > 36;

  return (
    <div>
      {isStale && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-tertiary-fixed px-3 py-1 text-[10px] font-mono text-on-tertiary-fixed">
          Last refreshed {staleHours}h ago — baseline-eval cron has not run since{' '}
          {last_updated?.toLocaleString()}
        </div>
      )}

      <section
        className="rounded-lg border border-outline-variant bg-surface p-6"
        aria-label={`Baselines comparison — ${horizon} forecast horizon`}
      >
        <h2 className="text-[10px] tracking-[0.3em] uppercase font-mono text-outline">
          Comparison — {horizon} forecast
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-outline-variant/30 text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
                <th className="text-left font-medium px-4 py-3" scope="col">
                  Metric
                </th>
                <th className="text-right font-medium px-4 py-3" scope="col">
                  LLM
                  <MetricTooltip metric="ic" />
                </th>
                <th className="text-right font-medium px-4 py-3" scope="col">
                  Logistic-24
                </th>
                <th className="text-right font-medium px-4 py-3" scope="col">
                  Logistic-canonical
                </th>
                <th className="text-right font-medium px-4 py-3" scope="col">
                  Null
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const dir = METRIC_DIRECTION[row.metric];
                const vs24 = compareLLM(row.llm, row.logistic24, dir);
                const vsCanonical = compareLLM(row.llm, row.logisticCanonical, dir);

                return (
                  <tr
                    key={row.metric}
                    className="border-b border-outline-variant/15"
                    aria-label={`${METRIC_LABELS[row.metric]} row`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="text-[10px] tracking-[0.3em] font-mono uppercase text-outline font-medium">
                        {METRIC_LABELS[row.metric]}
                        {row.metric === 'brier' && <MetricTooltip metric="brier" />}
                        {row.metric === 'log_loss' && <MetricTooltip metric="log_loss" />}
                      </div>
                    </td>
                    {/* LLM column — always ink for its own value */}
                    <ValueCell
                      value={row.llm.value}
                      ci={row.llm.ci}
                      q_value={row.llm.q_value}
                      metric={row.metric}
                    />
                    {/* Logistic-24: colored relative to LLM */}
                    <ValueCell
                      value={row.logistic24.value}
                      ci={row.logistic24.ci}
                      q_value={row.logistic24.q_value}
                      metric={row.metric}
                      vsLLM={vs24 === 'wins' ? 'loses' : vs24 === 'loses' ? 'wins' : 'overlap'}
                    />
                    {/* Logistic-canonical: colored relative to LLM */}
                    <ValueCell
                      value={row.logisticCanonical.value}
                      ci={row.logisticCanonical.ci}
                      q_value={row.logisticCanonical.q_value}
                      metric={row.metric}
                      vsLLM={vsCanonical === 'wins' ? 'loses' : vsCanonical === 'loses' ? 'wins' : 'overlap'}
                    />
                    <NullCell value={row.null.value} metric={row.metric} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {n_trials_attempted > 0 && (
          <p className="mt-4 text-[10px] font-mono uppercase tracking-[0.2em] text-outline">
            q-values use Benjamini–Yekutieli over n_trials_attempted = {n_trials_attempted} cells.
            <MetricTooltip metric="q_value" />
          </p>
        )}
      </section>
    </div>
  );
}
