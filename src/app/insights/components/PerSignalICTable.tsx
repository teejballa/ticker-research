// src/app/insights/components/PerSignalICTable.tsx
// Phase 21.1 Wave 5 — Surface 4: Per-signal-class IC table.
//
// Small table with 4 UPPERCASE-mono column heads (SIGNAL · IC · 95% CI · n)
// matching the existing PatternsTable aesthetic. Default sort: by |IC| desc.
//
// Data source: getPerSignalIC() from engine-context.ts (D-30 trust boundary).
// Server component — no 'use client'.
//
// Per UI-SPEC §Surface 4:
//   - SIGNAL_LABELS map reused from PatternsTable (DIFFUSION/TECHNICAL/etc.)
//   - Empty state: if n < 10, row shows IC=— and CI=— but still renders the row
//   - Wrapper: rounded-lg border border-outline-variant bg-surface p-6
//   - Heading: text-[10px] tracking-[0.3em] uppercase font-mono text-outline

import { getPerSignalIC } from '@/lib/engine-context';
import { MetricTooltip } from './MetricTooltip';

// Mirrors PatternsTable.tsx SIGNAL_LABELS (single source of truth for display labels)
const SIGNAL_LABELS: Record<string, string> = {
  diffusion: 'DIFFUSION',
  technical: 'TECHNICAL',
  insider: 'INSIDER',
  institutional: 'INSTITUTIONAL',
};

function fmtIC(v: number): string {
  if (isNaN(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(3);
}

function fmtBound(v: number): string {
  if (isNaN(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(3);
}

export async function PerSignalICTable() {
  let rows;
  try {
    rows = await getPerSignalIC();
  } catch (err) {
    console.error('[PerSignalICTable] getPerSignalIC failed:', err);
    return (
      <section
        className="rounded-lg border border-error bg-surface p-6"
        aria-label="IC by signal class — error"
      >
        <h2 className="text-[10px] tracking-[0.3em] uppercase font-mono text-outline">
          IC by signal class
        </h2>
        <p className="mt-2 text-sm text-error">
          Could not load metrics. The dashboard reads through engine-context.ts; check the most
          recent /api/cron/learn run on the deployment.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-outline-variant bg-surface p-6"
      aria-label="IC by signal class"
    >
      <h2 className="text-[10px] tracking-[0.3em] uppercase font-mono text-outline">
        IC by signal class
      </h2>

      {rows.length === 0 ? (
        <div className="mt-4 text-sm text-on-surface-variant">
          <p className="font-medium text-on-surface">No signal class has enough data yet</p>
          <p className="mt-1">
            Each signal class needs n&nbsp;≥&nbsp;10 graded predictions in the last 30 days before
            its IC is reported. The table populates as the engine accumulates outcomes.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase border-b border-outline-variant/30">
                <th className="text-left font-medium px-3 py-3" scope="col">
                  Signal
                </th>
                <th className="text-right font-medium px-3 py-3" scope="col">
                  IC
                  <MetricTooltip metric="ic" />
                </th>
                <th className="text-right font-medium px-3 py-3" scope="col">
                  95% CI
                  <MetricTooltip metric="ci_95" />
                </th>
                <th className="text-right font-medium px-3 py-3" scope="col">
                  n
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const insufficient = row.n < 10;
                return (
                  <tr
                    key={row.signal_class}
                    className="border-b border-outline-variant/10"
                    aria-label={`${SIGNAL_LABELS[row.signal_class] ?? row.signal_class}: IC = ${fmtIC(row.ic)}, n = ${row.n}`}
                  >
                    <td className="px-3 py-3 font-mono text-xs text-on-surface">
                      {SIGNAL_LABELS[row.signal_class] ?? row.signal_class.toUpperCase()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-mono text-xs">
                      {insufficient ? (
                        <span className="text-outline" title="Insufficient data (n < 10)">
                          —
                        </span>
                      ) : (
                        <span
                          className={
                            !isNaN(row.ic) && row.ci[0] > 0
                              ? 'text-secondary'
                              : !isNaN(row.ic) && row.ci[1] < 0
                                ? 'text-error'
                                : 'text-on-surface'
                          }
                        >
                          {fmtIC(row.ic)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-mono text-xs text-on-surface-variant">
                      {insufficient ? (
                        <span className="text-outline">—</span>
                      ) : (
                        <span>
                          [{fmtBound(row.ci[0])}, {fmtBound(row.ci[1])}]
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-mono text-xs text-on-surface-variant">
                      {row.n}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-[10px] font-mono text-outline">
        IC = Spearman rank correlation (Grinold &amp; Kahn §3). BCa 95% CI, B=5,000. Efron 1987.
      </p>
    </section>
  );
}
