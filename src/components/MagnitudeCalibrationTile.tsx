'use client';

// src/components/MagnitudeCalibrationTile.tsx
// Phase 29 (D-05, DEMO-11). Client island for "Price Forecast Calibration".
// Pure SVG scatter/line + dashed diagonal — mirrors Sparkline pattern in
// EngineCalibrationPanel. No new charting library (D-05).

import { useEffect, useState } from 'react';
import { chartRenderDecision } from '@/lib/magnitude-calibration';

interface Bucket {
  id: string;
  bucket_label: string;
  expected_midpoint: number;
  mean_actual_pct: number;
  n: number;
  computed_at: string;
}

const W = 280;
const H = 140;
const AXIS_MIN = -15;
const AXIS_MAX = 15;
const AXIS_RANGE = AXIS_MAX - AXIS_MIN;

// Clamp + map value to SVG x-coord (Pitfall 4 — extreme values stay in box).
function xCoord(pct: number): number {
  const clamped = Math.max(AXIS_MIN, Math.min(AXIS_MAX, pct));
  return ((clamped - AXIS_MIN) / AXIS_RANGE) * W;
}
// Clamp + map value to SVG y-coord (inverted — positive at top).
function yCoord(pct: number): number {
  const clamped = Math.max(AXIS_MIN, Math.min(AXIS_MAX, pct));
  return H - ((clamped - AXIS_MIN) / AXIS_RANGE) * H;
}

export function MagnitudeCalibrationTile() {
  const [buckets, setBuckets] = useState<Bucket[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/insights/magnitude-calibration')
      .then(r => r.json())
      .then((data: { buckets: Bucket[] }) => {
        if (!cancelled) setBuckets(data.buckets ?? []);
      })
      .catch(() => { if (!cancelled) setBuckets([]); });
    return () => { cancelled = true; };
  }, []);

  // Still loading → render nothing to avoid layout flash.
  if (buckets === null) return null;

  const decision = chartRenderDecision(buckets);
  if (decision === 'insufficient') {
    return (
      <div
        data-testid="magnitude-calibration-tile"
        className="mt-3 bg-surface-container-high p-3 rounded-lg text-[11px] text-on-surface-variant"
      >
        <div className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant mb-1 font-mono">
          PRICE FORECAST CALIBRATION
        </div>
        <div>Insufficient data — forecasts accumulating.</div>
      </div>
    );
  }

  const linePath = buckets
    .map((b, i) => `${i === 0 ? 'M' : 'L'} ${xCoord(b.expected_midpoint)} ${yCoord(b.mean_actual_pct)}`)
    .join(' ');

  return (
    <div
      data-testid="magnitude-calibration-tile"
      className="mt-3 bg-surface-container-high p-3 rounded-lg"
      title="How well the engine's numeric price forecasts match what actually happened. Each dot is a bucket of forecasts binned by predicted %-change. Perfect calibration is the dashed diagonal — a dot above the line means the forecast under-predicted, below means over-predicted."
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant font-mono">
          PRICE FORECAST CALIBRATION
        </span>
        <span className="text-[10px] font-mono text-on-surface-variant tabular-nums">
          {buckets.length} bucket{buckets.length === 1 ? '' : 's'} · n≥20 each
        </span>
      </div>
      <svg
        width={W}
        height={H}
        className="overflow-visible"
        aria-label="Price forecast calibration reliability diagram"
      >
        {/* Perfect calibration diagonal (y = x) */}
        <line
          x1={xCoord(AXIS_MIN)}
          y1={yCoord(AXIS_MIN)}
          x2={xCoord(AXIS_MAX)}
          y2={yCoord(AXIS_MAX)}
          stroke="currentColor"
          strokeDasharray="4 3"
          className="text-outline-variant"
          strokeWidth="1"
        />
        {/* Zero axes */}
        <line x1={0} y1={yCoord(0)} x2={W} y2={yCoord(0)} stroke="currentColor" className="text-outline-variant/40" strokeWidth="0.5" />
        <line x1={xCoord(0)} y1={0} x2={xCoord(0)} y2={H} stroke="currentColor" className="text-outline-variant/40" strokeWidth="0.5" />
        {/* Data connecting line */}
        <path d={linePath} stroke="currentColor" className="text-secondary" strokeWidth="1.5" fill="none" />
        {/* Data points */}
        {buckets.map(b => (
          <circle
            key={b.id}
            cx={xCoord(b.expected_midpoint)}
            cy={yCoord(b.mean_actual_pct)}
            r={3.5}
            className="fill-secondary"
          >
            <title>{`${b.bucket_label}: predicted ${b.expected_midpoint.toFixed(1)}%, actual ${b.mean_actual_pct.toFixed(2)}% (n=${b.n})`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between mt-1 text-[9px] font-mono text-on-surface-variant/70 tracking-wide">
        <span>predicted −15%</span>
        <span>0</span>
        <span>+15%</span>
      </div>
    </div>
  );
}

export default MagnitudeCalibrationTile;
