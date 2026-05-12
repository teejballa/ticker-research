/**
 * Plan 20-Z-03 — classifyError — maps an arbitrary thrown value to a controlled
 * TelemetryErrorClass.
 *
 * T-20-Z-03-05: this is the ONLY value persisted into ProviderCallLog.error_class —
 * the raw error message is NEVER persisted. Prevents leaking secrets, PII, or
 * upstream payload fragments into the telemetry table.
 *
 * Network-sentinel code set mirrors src/lib/data/retry.ts but is duplicated
 * intentionally so this module is independently testable (no import from retry.ts).
 */

export type TelemetryErrorClass =
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'TIMEOUT'
  | 'UPSTREAM_5XX'
  | 'NETWORK'
  | 'UNKNOWN';

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
]);

export function classifyError(err: unknown): TelemetryErrorClass {
  if (err == null) return 'UNKNOWN';
  const e = err as { name?: string; status?: number; code?: string; cause?: { code?: string } };
  const code = e.code ?? e.cause?.code;
  if (typeof code === 'string' && NETWORK_CODES.has(code)) return 'NETWORK';
  if (e.name === 'AbortError') return 'TIMEOUT';
  if (typeof e.status === 'number') {
    if (e.status === 401 || e.status === 403) return 'AUTH_FAILED';
    if (e.status === 408) return 'TIMEOUT';
    if (e.status === 429) return 'RATE_LIMITED';
    if (e.status >= 500 && e.status < 600) return 'UPSTREAM_5XX';
  }
  return 'UNKNOWN';
}
