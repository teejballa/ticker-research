// Phase: 30 — Provider Health Hardening
// Phase 30 D-19 — Active alerts tile.
//
// Rows from ProviderHealthAlert WHERE resolved_at IS NULL. Operator reads
// this when the on-call check fires; surfaces provider_id, age, breach
// intensity, and dominant_error_class for triage. Empty state is the
// healthy/green default.

interface AlertRow {
  id: string;
  provider_id: string;
  breached_at: Date;
  error_rate: number;
  error_count: number;
  total_count: number;
  dominant_error_class: string | null;
}

function relativeAge(d: Date): string {
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return `${Math.max(0, Math.floor(ms / 1000))}s ago`;
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.floor(ms / 60_000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ActiveAlertsTile({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) {
    return (
      <div
        className="rounded-lg border border-emerald-200 dark:border-emerald-800 p-4 mb-6 bg-emerald-50/50 dark:bg-emerald-950/20"
        data-testid="active-alerts-tile-empty"
      >
        <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Active alerts — per D-19
        </div>
        <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
          No active alerts ✓
        </p>
      </div>
    );
  }
  return (
    <div
      className="rounded-lg border border-red-200 dark:border-red-800 p-4 mb-6 bg-red-50/50 dark:bg-red-950/20"
      data-testid="active-alerts-tile"
    >
      <div className="text-xs uppercase tracking-wide text-red-700 dark:text-red-400 mb-3">
        Active alerts ({alerts.length}) — per D-19
      </div>
      <ul className="text-sm space-y-2">
        {alerts.map((a) => (
          <li key={a.id} data-testid={`alert-row-${a.provider_id}`}>
            <span className="font-semibold">{a.provider_id}</span>
            <span className="text-zinc-500 dark:text-zinc-400">
              {' '}
              — {(a.error_rate * 100).toFixed(1)}% error rate
            </span>
            <span className="text-zinc-400">
              {' '}
              ({a.error_count}/{a.total_count})
            </span>
            {a.dominant_error_class && (
              <span className="ml-2 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                [{a.dominant_error_class}]
              </span>
            )}
            <span className="ml-2 text-xs text-zinc-400">
              {relativeAge(a.breached_at)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
