// src/app/insights/calibration/components/BrierTile.tsx
//
// Phase 20-C-02: Per-classifier_version Brier tile. Renders:
//   • classifier_version + n + base_rate
//   • Big Brier number with ship-gate badge:
//       green ≤ 0.24 / yellow 0.24–0.25 / red > 0.25 / grey insufficient_data
//   • Stacked Reliability / Resolution / Uncertainty bar (Murphy 1973 partition)
//   • Help-text footer noting T-20-C-02-04 multimodal limitation

import type { EvalBrierResult } from '../../../../../scripts/eval-brier';

const SHIP_GATE = 0.24;

function tone(result: EvalBrierResult): {
  bg: string;
  border: string;
  label: string;
  text: string;
} {
  if (result.status === 'insufficient_data') {
    return {
      bg: 'bg-zinc-800/40',
      border: 'border-zinc-600',
      label: 'COLLECTING DATA',
      text: 'text-zinc-300',
    };
  }
  if (result.brier <= SHIP_GATE) {
    return {
      bg: 'bg-emerald-950/60',
      border: 'border-emerald-700',
      label: 'SHIP GATE: MET',
      text: 'text-emerald-300',
    };
  }
  if (result.brier <= 0.25) {
    return {
      bg: 'bg-amber-950/50',
      border: 'border-amber-700',
      label: 'SHIP GATE: MARGINAL',
      text: 'text-amber-300',
    };
  }
  return {
    bg: 'bg-rose-950/50',
    border: 'border-rose-700',
    label: 'SHIP GATE: FAILED',
    text: 'text-rose-300',
  };
}

export function BrierTile({ result }: { result: EvalBrierResult }) {
  const t = tone(result);
  const insufficient = result.status === 'insufficient_data';
  // Stacked-bar widths scaled so |Reliability| + |Resolution| + |Uncertainty|
  // fills 100%. Resolution is subtracted in the identity so we display its
  // absolute magnitude with a "−" prefix in the label.
  const r = Math.abs(result.reliability);
  const res = Math.abs(result.resolution);
  const u = Math.abs(result.uncertainty);
  const total = r + res + u;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  return (
    <div
      className={`rounded-lg border ${t.border} ${t.bg} p-4 text-zinc-200`}
      data-testid={`brier-tile-${result.classifier_version}`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-100">
          {result.classifier_version}
        </h3>
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${t.text}`}
          aria-label={t.label}
        >
          {t.label}
        </span>
      </header>

      {insufficient ? (
        <p className="mt-3 text-sm text-zinc-400">
          n = {result.n} (below the n = 100 minimum). Ship gate skipped per
          T-20-C-02-02 (isotonic regression overfit defense). Awaiting more
          observations from the weekly cron.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-semibold tabular-nums text-zinc-50">
              {result.brier.toFixed(3)}
            </span>
            <span className="text-xs text-zinc-400">
              Brier score · ship gate ≤ {SHIP_GATE.toFixed(2)}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3 text-xs text-zinc-300">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">
                n
              </dt>
              <dd className="tabular-nums text-zinc-100">{result.n}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">
                base rate
              </dt>
              <dd className="tabular-nums text-zinc-100">
                {result.base_rate.toFixed(3)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">
                bs_check
              </dt>
              <dd className="tabular-nums text-zinc-100">
                {result.bs_check.toFixed(4)}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
              <span>Reliability − Resolution + Uncertainty (Murphy 1973)</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded bg-zinc-800">
              <div
                className="bg-rose-500"
                style={{ width: `${pct(r)}%` }}
                title={`Reliability ${result.reliability.toFixed(4)}`}
              />
              <div
                className="bg-sky-500"
                style={{ width: `${pct(res)}%` }}
                title={`-Resolution ${result.resolution.toFixed(4)}`}
              />
              <div
                className="bg-zinc-500"
                style={{ width: `${pct(u)}%` }}
                title={`Uncertainty ${result.uncertainty.toFixed(4)}`}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-zinc-500 tabular-nums">
              <span className="text-rose-400">
                R {result.reliability.toFixed(4)}
              </span>
              <span className="text-sky-400">
                −Res {result.resolution.toFixed(4)}
              </span>
              <span className="text-zinc-400">
                U {result.uncertainty.toFixed(4)}
              </span>
            </div>
          </div>

          {result.ship_gate.remediation_recommendation && (
            <p className="mt-4 rounded border border-zinc-700 bg-zinc-900/60 p-2 text-[11px] text-zinc-300">
              <span className="font-semibold text-zinc-100">
                Remediation:{' '}
              </span>
              {result.ship_gate.remediation_recommendation}
              {result.ship_gate.dominant_failure_mode && (
                <>
                  {' '}
                  <span className="text-zinc-500">
                    (dominant: {result.ship_gate.dominant_failure_mode})
                  </span>
                </>
              )}
            </p>
          )}
        </>
      )}

      <footer className="mt-4 text-[10px] text-zinc-500">
        Murphy 1973 identity holds within 1e-9. CORP method per
        Dimitriadis-Gneiting-Jordan PNAS 2021. Reliability diagrams can mislead
        on multimodal prediction distributions (T-20-C-02-04) — the histogram
        below the curve shows where data actually lives.
      </footer>
    </div>
  );
}
