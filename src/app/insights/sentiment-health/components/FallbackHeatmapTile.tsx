// Phase: 30 — Provider Health Hardening
// Phase 30 D-10 — Fallback heatmap tile.
//
// Per-provider fallback_used rate from ProviderCallLog over last 24h.
// Mirrors ProviderTile.tsx server-component conventions (server component,
// Tailwind dark: variants, <dl> for label/value pairs).
//
// Color thresholds:
//   green  if rate <= 5%
//   amber  if rate <= 20%
//   red    if rate >  20%

interface FallbackRow {
  provider_id: string;
  fallback_rate: number; // 0..1
  count_24h: number;
}

function colorFor(rate: number): string {
  if (rate <= 0.05) return 'text-emerald-600 dark:text-emerald-400';
  if (rate <= 0.20) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function FallbackHeatmapTile({ rows }: { rows: FallbackRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border border-outline-variant dark:border-outline-variant p-4 mb-6"
        data-testid="fallback-heatmap-tile-empty"
      >
        <div className="text-xs uppercase tracking-wide text-on-surface-variant dark:text-on-surface-variant">
          Fallback heatmap (last 24h) — per D-10
        </div>
        <p className="text-sm text-on-surface-variant dark:text-on-surface-variant mt-2">
          No provider data yet.
        </p>
      </div>
    );
  }
  return (
    <div
      className="rounded-lg border border-outline-variant dark:border-outline-variant p-4 mb-6"
      data-testid="fallback-heatmap-tile"
    >
      <div className="text-xs uppercase tracking-wide text-on-surface-variant dark:text-on-surface-variant mb-3">
        Fallback heatmap (last 24h) — per D-10
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {rows.map((r) => (
          <FallbackEntry key={r.provider_id} row={r} />
        ))}
      </dl>
    </div>
  );
}

function FallbackEntry({ row }: { row: FallbackRow }) {
  const pct = (row.fallback_rate * 100).toFixed(1);
  return (
    <>
      <dt className="text-on-surface-variant dark:text-on-surface-variant">{row.provider_id}</dt>
      <dd
        className={colorFor(row.fallback_rate)}
        data-testid={`fallback-rate-${row.provider_id}`}
      >
        {pct}%{' '}
        <span className="text-xs text-on-surface-variant">
          ({row.count_24h.toLocaleString()})
        </span>
      </dd>
    </>
  );
}
