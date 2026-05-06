'use client';

// src/components/WatchBadge.tsx
//
// Phase 18 / D-11: small badge rendered next to STATUS_BADGE when a cell is in
// 'EXPLORATORY-WATCH'. Copy is locked verbatim per CONTEXT D-11:
//
//     "regime stability: watching"
//
// No additional text is permitted in the headline — Phase 26 will surface
// drift-history detail (z-history, recent-Brier delta, last_active_at) on the
// dashboard. The aria-label expands the meaning for assistive tech without
// adding visual noise.
//
// D-09 invariant: a 'EXPLORATORY-WATCH' cell stays calibrated (the panel still
// renders posterior, ESS, CI). The watch badge is informational, not a
// silencer — it tells the reader "the drift detector flagged this cell, the
// engine is still reporting it but trust it less for now".
//
// Implementation notes:
//   - Stateless presentational component — no hooks, no effects, no client state.
//   - 'use client' is required only because the parent (EngineCalibrationPanel)
//     is already a client component; rendering as a server component would also
//     work but co-locates with the parent's lifecycle.
//   - The dot icon is a simple inline SVG — avoids pulling in material-symbols
//     for a single 12px glyph.

interface WatchBadgeProps {
  className?: string;
}

export function WatchBadge({ className = '' }: WatchBadgeProps) {
  return (
    <span
      role="status"
      aria-label="regime stability: watching — drift detector has confirmed unstable behavior on this cell; calibration injection still active"
      className={`inline-flex items-center gap-1 rounded border border-tertiary/50 bg-tertiary/10 px-2 py-0.5 text-[10px] font-medium text-tertiary tracking-wide ${className}`}
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current" aria-hidden="true">
        <circle cx="6" cy="6" r="2.5" />
      </svg>
      regime stability: watching
    </span>
  );
}

export default WatchBadge;
