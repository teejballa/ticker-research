// src/app/insights/calibration/components/ReliabilityDiagram.tsx
//
// Phase 20-C-02: CORP reliability diagram (Dimitriadis-Gneiting-Jordan,
// PNAS 2021). Pure SVG — no chart-library dependency (Cipher convention
// per /insights/sentiment-sources pattern).
//
// Renders:
//   • identity diagonal y = x (dashed reference line)
//   • isotonic-fit recalibration curve (the CORP fit)
//   • frequency histogram of predictions along the bottom
//     (T-20-C-02-04 multimodal-defense: shows where data lives so the
//     operator can't be misled by smooth curve in a data-empty gap)

import type { EvalBrierResult } from '../../../../../scripts/eval-brier';

const W = 360;
const H = 240;
const PAD = 28;
const HIST_H = 36;
const PLOT_W = W - 2 * PAD;
const PLOT_H = H - 2 * PAD - HIST_H;

function x2px(x: number): number {
  return PAD + x * PLOT_W;
}
function y2px(y: number): number {
  return PAD + PLOT_H - y * PLOT_H;
}

export function ReliabilityDiagram({ result }: { result: EvalBrierResult }) {
  if (result.status === 'insufficient_data') {
    return (
      <div
        className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4 text-xs text-zinc-500"
        data-testid={`reliability-diagram-${result.classifier_version}`}
      >
        Reliability diagram unavailable — n = {result.n} below the
        100-observation minimum (T-20-C-02-02).
      </div>
    );
  }

  const curve = result.corp.recalibrated_curve;
  const hist = result.corp.bin_counts;
  const histMax = hist.reduce((m, v) => (v > m ? v : m), 0) || 1;
  const histW = PLOT_W / hist.length;

  let pathD = '';
  for (let i = 0; i < curve.x.length; i++) {
    const px = x2px(curve.x[i]);
    const py = y2px(curve.y[i]);
    pathD += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
  }

  return (
    <figure
      className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-4"
      data-testid={`reliability-diagram-${result.classifier_version}`}
    >
      <figcaption className="mb-2 text-xs text-zinc-400">
        CORP reliability — {result.classifier_version}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`CORP reliability diagram for ${result.classifier_version}`}
        className="w-full"
      >
        {/* axes */}
        <line
          x1={PAD}
          y1={PAD + PLOT_H}
          x2={PAD + PLOT_W}
          y2={PAD + PLOT_H}
          stroke="#52525b"
          strokeWidth={1}
        />
        <line
          x1={PAD}
          y1={PAD}
          x2={PAD}
          y2={PAD + PLOT_H}
          stroke="#52525b"
          strokeWidth={1}
        />
        {/* identity diagonal */}
        <line
          x1={x2px(0)}
          y1={y2px(0)}
          x2={x2px(1)}
          y2={y2px(1)}
          stroke="#71717a"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        {/* CORP recalibrated curve (isotonic fit) */}
        <path
          d={pathD}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={2}
        />
        {/* histogram of predictions along the bottom */}
        {hist.map((c, i) => {
          const h = (c / histMax) * (HIST_H - 4);
          return (
            <rect
              key={i}
              x={PAD + i * histW}
              y={PAD + PLOT_H + 8 + (HIST_H - 4 - h)}
              width={Math.max(1, histW - 1)}
              height={h}
              fill="#3f3f46"
            />
          );
        })}
        {/* labels */}
        <text x={PAD} y={PAD - 8} fill="#71717a" fontSize={9}>
          empirical frequency
        </text>
        <text
          x={PAD + PLOT_W}
          y={PAD + PLOT_H + 14}
          fill="#71717a"
          fontSize={9}
          textAnchor="end"
        >
          predicted P(beats SPY)
        </text>
      </svg>
    </figure>
  );
}
