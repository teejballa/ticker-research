// src/components/WatchBadge.tsx
// Phase 18-09 — compact "regime stability: watching" badge surfaced on cells
// in EXPLORATORY-WATCH status (D-09 step 2 / D-11). Used on /insights and
// later on /research per Plan 18-08.

export function WatchBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 border border-tertiary/40 bg-tertiary/10 text-tertiary"
      role="status"
      aria-label="regime stability: watching"
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-60" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-tertiary" />
      </span>
      regime stability: watching
    </span>
  );
}
