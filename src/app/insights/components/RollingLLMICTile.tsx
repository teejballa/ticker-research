// src/app/insights/components/RollingLLMICTile.tsx
// Phase 21.1 Wave 5 — Surface 2: Rolling 30-day LLM IC headline tile.
//
// IS-paper headline figure. Publication-grade tile with:
//   - Display number (36px Inter Tight 600 tabular-nums) — the IC point estimate
//   - BCa 95% CI metadata (10px JetBrains Mono outline)
//   - Status badge (4 states: EDGE DETECTED / NEGATIVE EDGE / INCONCLUSIVE / COLLECTING DATA)
//   - Inline SVG sparkline with CI band (indigo @ 10% opacity) and zero reference line
//
// Data source: getLLMICRolling(30) from engine-context.ts (D-30 trust boundary).
// Per UI-SPEC §Surface 2 Component spec: server component, no useClient.
//
// Typography per UI-SPEC §Typography:
//   - Display 36px: `font-display text-4xl font-semibold tabular-nums`
//   - Label/metric 10px: `text-[10px] font-mono uppercase tracking-[0.15em]`
// Color per UI-SPEC §Color (semantic tokens only, no hardcoded hex).

import {
  getLLMICRolling,
  type LLMICVerdict,
} from '@/lib/engine-context';

// Badge styles per UI-SPEC §"Status badges" (Surface 2 state variants)
const VERDICT_BADGES: Record<
  LLMICVerdict,
  { label: string; cls: string; ariaDesc: string }
> = {
  EDGE_DETECTED: {
    label: 'EDGE DETECTED',
    cls: 'bg-secondary-fixed text-on-secondary-fixed',
    ariaDesc: 'Edge detected — 95% confidence interval excludes zero on the positive side',
  },
  NEGATIVE_EDGE: {
    label: 'NEGATIVE EDGE',
    cls: 'bg-error-container text-on-error-container',
    ariaDesc: 'Negative edge — 95% confidence interval excludes zero on the negative side',
  },
  INCONCLUSIVE: {
    label: 'INCONCLUSIVE',
    cls: 'bg-tertiary-fixed text-on-tertiary-fixed',
    ariaDesc: 'Inconclusive — 95% confidence interval spans zero',
  },
  COLLECTING_DATA: {
    label: 'COLLECTING DATA',
    cls: 'bg-surface-container text-outline',
    ariaDesc: 'Collecting data — fewer than 30 resolved predictions in the rolling window',
  },
};

// Render +0.064 or -0.012 with explicit sign per UI-SPEC §Surface 2
function fmtIC(v: number): string {
  if (isNaN(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(3);
}

function fmtCIBound(v: number): string {
  if (isNaN(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(3);
}

export async function RollingLLMICTile() {
  let data;
  try {
    data = await getLLMICRolling(30);
  } catch (err) {
    console.error('[RollingLLMICTile] getLLMICRolling failed:', err);
    return (
      <section
        className="rounded-lg border border-error bg-surface p-6"
        aria-label="Rolling 30-day LLM IC — error loading metrics"
      >
        <h2 className="text-base font-semibold text-on-surface">LLM rolling IC — last 30 days</h2>
        <p className="mt-2 text-sm text-error">
          Could not load metrics. The dashboard reads through engine-context.ts; check the most
          recent /api/cron/learn run on the deployment.
        </p>
      </section>
    );
  }

  const badge = VERDICT_BADGES[data.verdict];
  const cur = data.current;
  const ic = cur?.ic;
  const ciLow = cur?.ci_low;
  const ciHigh = cur?.ci_high;
  const n = cur?.n ?? 0;

  // SVG sparkline geometry (viewBox 600×180)
  const W = 600;
  const H = 180;
  let pathLine = '';
  let pathBand = '';
  let dateStart = '';
  let dateEnd = '';

  if (data.series.length > 1) {
    const pts = data.series;

    // Y-axis range: auto-fit, always include 0
    const allLow = Math.min(0, ...pts.map((p) => p.ci_low));
    const allHigh = Math.max(0, ...pts.map((p) => p.ci_high));
    const range = Math.max(allHigh - allLow, 1e-6);
    const yFn = (v: number) => H - ((v - allLow) / range) * H;
    const xs = pts.map((_, i) => (i / (pts.length - 1)) * W);

    // IC center line
    pathLine = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${yFn(p.ic).toFixed(1)}`)
      .join(' ');

    // CI band: upper arc + reverse lower arc
    const upper = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${yFn(p.ci_high).toFixed(1)}`)
      .join(' ');
    const lower = [...pts]
      .reverse()
      .map((p, idx) => {
        const ri = pts.length - 1 - idx;
        return `L${xs[ri].toFixed(1)},${yFn(p.ci_low).toFixed(1)}`;
      })
      .join(' ');
    pathBand = `${upper} ${lower} Z`;

    // X-axis date labels
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dateStart = fmt(pts[0].t);
    dateEnd = fmt(pts[pts.length - 1].t);
  }

  const ariaLabel =
    data.verdict === 'COLLECTING_DATA'
      ? `Rolling 30-day LLM IC: collecting data, n = ${n} / 30 required; ${badge.ariaDesc}`
      : `Rolling 30-day LLM IC: ${fmtIC(ic ?? NaN)}, BCa 95% CI [${fmtCIBound(ciLow ?? NaN)}, ${fmtCIBound(ciHigh ?? NaN)}], n = ${n}; ${badge.ariaDesc}`;

  return (
    <section
      className="rounded-lg border border-outline-variant bg-surface p-6"
      aria-label={ariaLabel}
    >
      {/* Header row: title + badge */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-on-surface">LLM rolling IC — last 30 days</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Spearman rank correlation between the report&rsquo;s confidence-weighted directional
            score and forward sector-relative return. BCa 95% CI band.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-[0.2em] ${badge.cls}`}
          aria-label={badge.ariaDesc}
        >
          {badge.label}
        </span>
      </div>

      {/* Display number + CI metadata */}
      {data.verdict === 'COLLECTING_DATA' ? (
        <div className="mt-6">
          <div className="font-display text-4xl font-semibold tabular-nums text-on-surface">—</div>
          <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.15em] text-outline">
            n = {n} / 30 required
          </div>
          <p className="mt-3 text-sm text-on-surface-variant">
            The rolling 30-day window has n&nbsp;=&nbsp;{n} predictions. The tile activates once
            n&nbsp;≥&nbsp;30. Cipher&rsquo;s daily LLM-IC cron writes one row per report.
          </p>
          {/* Skeleton sparkline area */}
          <div
            className="mt-6 h-[180px] w-full animate-pulse rounded bg-surface-container"
            aria-hidden="true"
          />
        </div>
      ) : (
        <>
          <div className="mt-6 font-display text-4xl font-semibold tabular-nums text-on-surface">
            {fmtIC(ic ?? NaN)}
          </div>
          <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.15em] text-outline">
            BCa 95% CI [{fmtCIBound(ciLow ?? NaN)}, {fmtCIBound(ciHigh ?? NaN)}] · n = {n}
          </div>

          {/* SVG sparkline */}
          {pathLine && (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="mt-6 w-full"
              role="img"
              aria-label={`Sparkline of rolling IC over the last 30 days, currently ${fmtIC(ic ?? NaN)}`}
              preserveAspectRatio="none"
            >
              {/* CI band */}
              <path d={pathBand} fill="var(--indigo)" fillOpacity="0.10" />
              {/* Zero reference line */}
              <line
                x1={0}
                x2={W}
                y1={H * 0.5}
                y2={H * 0.5}
                stroke="var(--rule)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              {/* IC center line */}
              <path
                d={pathLine}
                stroke="var(--indigo)"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* X-axis date labels */}
              {dateStart && (
                <text
                  x={4}
                  y={H - 4}
                  fontSize="10"
                  fontFamily="var(--mono)"
                  fill="var(--ink-3)"
                >
                  {dateStart}
                </text>
              )}
              {dateEnd && (
                <text
                  x={W - 4}
                  y={H - 4}
                  fontSize="10"
                  fontFamily="var(--mono)"
                  fill="var(--ink-3)"
                  textAnchor="end"
                >
                  {dateEnd}
                </text>
              )}
            </svg>
          )}
        </>
      )}

      {/* Footer citation */}
      <p className="mt-4 text-[10px] font-mono text-outline">
        Methodology: BCa bootstrap, B=10,000. Spearman tie-correction. Reference: Efron
        1987&nbsp;/&nbsp;Grinold &amp; Kahn §3.
      </p>
    </section>
  );
}
