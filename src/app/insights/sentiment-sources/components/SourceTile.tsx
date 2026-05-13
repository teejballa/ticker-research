// src/app/insights/sentiment-sources/components/SourceTile.tsx
//
// Phase 20-C-01: Single per-source × horizon tile. Renders ICIR + significance
// asterisks, n_observations, NW lag, and conditionally a BELOW THRESHOLD or
// AUTO-DOWN-WEIGHT badge.

import type { SourceHorizonTile } from '@/app/api/insights/sentiment-sources/route';

interface SourceTileProps {
  source_id: string;
  horizon: 7 | 30;
  tile: SourceHorizonTile | null;
}

export function SourceTile({ source_id, horizon, tile }: SourceTileProps) {
  if (tile === null) {
    return (
      <section
        className="rounded-md border border-zinc-800 bg-zinc-950 p-4 text-zinc-300"
        aria-label={`${source_id} ${horizon}d cold start`}
      >
        <header className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
            {source_id} · {horizon}d
          </h2>
          <span className="rounded-sm bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wider text-zinc-300">
            COLD START
          </span>
        </header>
        <p className="mt-2 text-xs text-zinc-500">
          Insufficient data — n &lt; 20 days of cross-sectional observations.
        </p>
      </section>
    );
  }

  const icirText =
    tile.icir_20d == null
      ? '—'
      : `${tile.icir_20d.toFixed(2)}${tile.significance ? ' ' + tile.significance : ''}`;

  const belowThreshold =
    tile.icir_20d != null && tile.icir_20d < 0.3 && !tile.auto_down_weight;

  return (
    <section
      className="rounded-md border border-zinc-800 bg-zinc-950 p-4 text-zinc-300"
      aria-label={`${source_id} ${horizon}d ICIR ${icirText}`}
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
          {source_id} · {horizon}d
        </h2>
        {tile.auto_down_weight ? (
          <span
            data-testid="auto-down-weight-badge"
            aria-label="auto down weight triggered — ICIR below 0.3 for 2 consecutive 20-day windows"
            className="rounded-sm bg-amber-900/80 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-100"
          >
            AUTO-DOWN-WEIGHT TRIGGERED
          </span>
        ) : belowThreshold ? (
          <span
            data-testid="below-threshold-badge"
            aria-label="ICIR below 0.3 single window"
            className="rounded-sm bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wider text-amber-200"
          >
            BELOW THRESHOLD
          </span>
        ) : null}
      </header>

      <div className="mt-3 flex items-baseline gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">ICIR</div>
          <div className="text-2xl font-mono text-zinc-100">{icirText}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">IC 20d</div>
          <div className="text-base font-mono text-zinc-300">
            {tile.ic_20d.toFixed(3)}
          </div>
        </div>
      </div>

      <footer className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>n = {tile.n_observations}</span>
        <span>NW lag = {tile.nw_lag}</span>
        <span>
          p<sub>BH</sub> = {tile.ic_p_value_bh_fdr.toFixed(3)}
        </span>
      </footer>
    </section>
  );
}
