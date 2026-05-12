/**
 * Plan 20-Z-03 — Insert-only DAO for ProviderCallLog.
 *
 * Production callers use recordCallAsync() which fire-and-forgets via
 * queueMicrotask — the caller's value/timing is unaffected. The retention
 * cron is the only non-INSERT consumer (deleteOlderThan).
 *
 * T-20-Z-03-01: INSERT NEVER awaited before returning caller's value.
 * T-20-Z-03-02: deleteOlderThan() backs the 90-day retention sweep.
 */
// NOTE — @/lib/db throws at import time when DATABASE_URL is unset (unit-test
// env, local-mode dev, etc). The telemetry wrapper must remain a safe no-op in
// those environments — the wrapped adapters' previous unit tests do not stub
// DATABASE_URL and would crash on first import. We therefore import the prisma
// singleton LAZILY inside recordCallAsync / deleteOlderThan only.
import type { ProviderId } from './cost-estimators';
import type { TelemetryErrorClass } from './error-classifier';

export interface ProviderCallLogRow {
  provider_id: ProviderId;
  ticker: string | null;
  started_at: Date;
  ended_at: Date;
  duration_ms: number;
  status: 'ok' | 'error';
  http_status: number | null;
  error_class: TelemetryErrorClass | null;
  fallback_used: boolean;
  cache_hit: boolean;
  cost_usd: number;
  request_size_bytes: number | null;
  response_size_bytes: number | null;
  retry_count: number;
}

let __swallowed = 0;
/** Test-only counter — number of INSERT failures swallowed since process start (or last reset). */
export function __internal_swallowed_insert_failures(): number {
  return __swallowed;
}
/** Test-only — reset the swallowed-insert counter. */
export function __internal_reset_counter(): void {
  __swallowed = 0;
}

/** Fire-and-forget: returns immediately, INSERTs in the background. INSERT failures are swallowed and counted. */
export function recordCallAsync(row: ProviderCallLogRow): void {
  queueMicrotask(() => {
    // Lazy import — bail cleanly when DATABASE_URL is unset (unit-test env).
    // The telemetry path must NEVER throw into the caller, including via
    // module-load errors.
    if (!process.env.DATABASE_URL) {
      __swallowed++;
      return;
    }
    import('@/lib/db')
      .then(({ prisma }) =>
        prisma.providerCallLog.create({
          data: {
            provider_id: row.provider_id,
            ticker: row.ticker,
            started_at: row.started_at,
            ended_at: row.ended_at,
            duration_ms: row.duration_ms,
            status: row.status,
            http_status: row.http_status,
            error_class: row.error_class,
            fallback_used: row.fallback_used,
            cache_hit: row.cache_hit,
            cost_usd: row.cost_usd,
            request_size_bytes: row.request_size_bytes,
            response_size_bytes: row.response_size_bytes,
            retry_count: row.retry_count,
          },
        }),
      )
      .catch(() => {
        __swallowed++;
        // Intentionally swallow — telemetry must never block or fail the caller.
      });
  });
}

/** Used ONLY by the 90-day retention cron (T-20-Z-03-02). */
export async function deleteOlderThan(thresholdDays: number): Promise<{ deleted: number }> {
  const { prisma } = await import('@/lib/db');
  const cutoff = new Date(Date.now() - thresholdDays * 86_400_000);
  const r = await prisma.providerCallLog.deleteMany({ where: { started_at: { lt: cutoff } } });
  return { deleted: r.count };
}
