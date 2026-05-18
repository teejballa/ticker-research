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
      bg: 'bg-surface-container/40',
      border: 'border-outline',
      label: 'COLLECTING DATA',
      text: 'text-on-surface',
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
      className={`rounded-lg border ${t.border} ${t.bg} p-4 text-on-surface`}
      data-testid={`brier-tile-${result.classifier_version}`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-on-surface">
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
        <p className="mt-3 text-sm text-on-surface-variant">
          n = {result.n} (below the n = 100 minimum). Ship gate skipped per
          T-20-C-02-02 (isotonic regression overfit defense). Awaiting more
          observations from the weekly cron.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-semibold tabular-nums text-on-surface">
              {result.brier.toFixed(3)}
            </span>
            <span className="text-xs text-on-surface-variant">
              Brier score · ship gate ≤ {SHIP_GATE.toFixed(2)}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3 text-xs text-on-surface">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                n
              </dt>
              <dd className="tabular-nums text-on-surface">{result.n}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                base rate
              </dt>
              <dd className="tabular-nums text-on-surface">
                {result.base_rate.toFixed(3)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                bs_check
              </dt>
              <dd className="tabular-nums text-on-surface">
                {result.bs_check.toFixed(4)}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-on-surface-variant">
              <span>Reliability − Resolution + Uncertainty (Murphy 1973)</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded bg-surface-container">
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
                className="bg-surface-container-highest"
                style={{ width: `${pct(u)}%` }}
                title={`Uncertainty ${result.uncertainty.toFixed(4)}`}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-on-surface-variant tabular-nums">
              <span className="text-rose-400">
                R {result.reliability.toFixed(4)}
              </span>
              <span className="text-sky-400">
                −Res {result.resolution.toFixed(4)}
              </span>
              <span className="text-on-surface-variant">
                U {result.uncertainty.toFixed(4)}
              </span>
            </div>
          </div>

          {result.ship_gate.remediation_recommendation && (
            <p className="mt-4 rounded border border-outline-variant bg-surface/60 p-2 text-[11px] text-on-surface">
              <span className="font-semibold text-on-surface">
                Remediation:{' '}
              </span>
              {result.ship_gate.remediation_recommendation}
              {result.ship_gate.dominant_failure_mode && (
                <>
                  {' '}
                  <span className="text-on-surface-variant">
                    (dominant: {result.ship_gate.dominant_failure_mode})
                  </span>
                </>
              )}
            </p>
          )}
        </>
      )}

      <footer className="mt-4 text-[10px] text-on-surface-variant">
        Murphy 1973 identity holds within 1e-9. CORP method per
        Dimitriadis-Gneiting-Jordan PNAS 2021. Reliability diagrams can mislead
        on multimodal prediction distributions (T-20-C-02-04) — the histogram
        below the curve shows where data actually lives.
      </footer>
    </div>
  );
}
