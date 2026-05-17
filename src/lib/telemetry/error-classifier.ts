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
 *
 * Phase 30 / D-08: union widened with `'BREAKER_OPEN'` so breaker-tripped
 * attempts have their own controlled enum value in ProviderCallLog rather
 * than being miscounted as `'UNKNOWN'`. The widening is type-only —
 * `error_class` in Prisma is `String?`, so no schema migration is needed
 * (see 30-RESEARCH lines 258-259).
 */

import { BreakerOpenError } from '@/lib/data/circuit-breaker';

export type TelemetryErrorClass =
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'TIMEOUT'
  | 'UPSTREAM_5XX'
  | 'NETWORK'
  | 'UNKNOWN'
  | 'BREAKER_OPEN';

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
]);

export function classifyError(err: unknown): TelemetryErrorClass {
  if (err == null) return 'UNKNOWN';
  // Phase 30 / D-08: BreakerOpenError must be classified by TYPE, not by
  // status/code. It is non-null but has neither, so without this guard it
  // would fall through to 'UNKNOWN' below.
  if (err instanceof BreakerOpenError) return 'BREAKER_OPEN';
  const e = err as { name?: string; status?: number; code?: string; cause?: { code?: string }; message?: string };
  const code = e.code ?? e.cause?.code;
  if (typeof code === 'string' && NETWORK_CODES.has(code)) return 'NETWORK';
  if (e.name === 'AbortError') return 'TIMEOUT';
  // Phase 30.1 pivot — Xpoz SDK errors are typed but carry no .status/.code.
  // Classify by constructor name so telemetry rows aren't all UNKNOWN.
  if (e.name === 'AuthenticationError') return 'AUTH_FAILED';
  if (e.name === 'OperationTimeoutError') return 'TIMEOUT';
  if (e.name === 'XpozConnectionError') return 'NETWORK';
  if (e.name === 'OperationFailedError' || e.name === 'OperationCancelledError') return 'UPSTREAM_5XX';
  if (typeof e.status === 'number') {
    if (e.status === 401 || e.status === 403) return 'AUTH_FAILED';
    if (e.status === 408) return 'TIMEOUT';
    if (e.status === 429) return 'RATE_LIMITED';
    if (e.status >= 500 && e.status < 600) return 'UPSTREAM_5XX';
  }
  return 'UNKNOWN';
}
