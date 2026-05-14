/**
 * Phase 30 D-04 / D-05 / D-06 / D-07 — Circuit breaker primitive.
 *
 * Wraps an external provider call and short-circuits when the rolling
 * error-rate budget is exhausted. State is shared across Vercel lambda cold
 * starts via Upstash so concurrent invocations agree on whether a provider is
 * tripped.
 *
 * ─── Composition contract (LOAD-BEARING — see CONTEXT.md D-07 + research R-1) ──
 *
 *   withTelemetry(provider, () =>
 *     withBreaker(provider, () =>
 *       withRetry(() => fn())));
 *
 * - Outermost `withTelemetry` captures every attempt (including BREAKER_OPEN
 *   rows) into `ProviderCallLog`.
 * - Middle `withBreaker` short-circuits BEFORE `withRetry` so a tripped breaker
 *   doesn't consume the retry budget.
 * - Innermost `withRetry` runs only when the breaker is closed or half-open.
 *
 * `BreakerOpenError` is intentionally non-retryable — it carries no `code` and
 * no `status >= 500`, so the existing `isRetryableError` in `retry.ts` returns
 * false. Callers handle the trip by falling through to the next provider in
 * the merge ladder; crons surface it via the `skipped_breaker_open` counter.
 *
 * ─── Upstash key shape ─────────────────────────────────────────────────────
 *
 * - `breaker:{provider_id}:state` — JSON `{ status, opened_at, reason? }`.
 *   1h TTL so a stuck-open breaker self-heals if every probe path stalls.
 * - `breaker:{provider_id}:ring`  — list of last-N outcomes ("ok"|"err"),
 *   maintained via LPUSH + LTRIM. Read with LRANGE.
 * - `breaker:{provider_id}:probe` — SETNX lock for the half-open single
 *   probe. TTL matches `openMs` so a hung probe can't deadlock recovery.
 *
 * ─── Graceful degrade ──────────────────────────────────────────────────────
 *
 * When `getRedis()` returns null (Upstash env vars unset), the breaker is
 * permissively closed — every call passes through. This matches the existing
 * cache helper pattern in `src/lib/data/cache/upstash.ts`.
 */

import { getRedis } from '@/lib/data/cache/upstash';
import type { ProviderId } from '@/lib/telemetry/cost-estimators';

/**
 * Thrown when the breaker is open and a caller attempts to invoke `fn`.
 *
 * Intentionally non-retryable per D-07: carries no HTTP-style `status` or
 * Node-style `code` fields, so `isRetryableError()` in retry.ts returns false
 * without any additional guard. Tests pin this invariant explicitly.
 */
export class BreakerOpenError extends Error {
  readonly name = 'BreakerOpenError';
  constructor(
    public readonly provider_id: ProviderId,
    public readonly opened_at: number,
  ) {
    super(
      `Circuit breaker open for ${provider_id} since ${new Date(opened_at).toISOString()}`,
    );
  }
}

export interface BreakerConfig {
  /** Trailing-window size. D-05 recommends 20. */
  ringSize: number;
  /** Strictly-greater-than threshold on `errored/total`. D-05 recommends 0.5. */
  tripErrorRate: number;
  /** Minimum ring length before the trip rule applies — avoids cold-start trips. */
  minRingForTrip: number;
  /** Wall-clock window the breaker stays fully open before transitioning to half-open. */
  openMs: number;
}

export const DEFAULT_BREAKER_CONFIG: BreakerConfig = {
  ringSize: 20,
  tripErrorRate: 0.5,
  minRingForTrip: 5,
  openMs: 30_000,
};

type BreakerState =
  | { status: 'closed' }
  | { status: 'open'; opened_at: number; reason?: string };

function stateKey(provider_id: ProviderId): string {
  return `breaker:${provider_id}:state`;
}
function ringKey(provider_id: ProviderId): string {
  return `breaker:${provider_id}:ring`;
}
function probeKey(provider_id: ProviderId): string {
  return `breaker:${provider_id}:probe`;
}

async function readState(provider_id: ProviderId): Promise<BreakerState> {
  const r = getRedis();
  if (!r) return { status: 'closed' };
  const raw = await r.get<unknown>(stateKey(provider_id));
  if (raw == null) return { status: 'closed' };
  // The Upstash REST client auto-parses JSON when feasible — `raw` may already
  // be the object. The mock module mirrors this.
  if (typeof raw === 'object') {
    return raw as BreakerState;
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as BreakerState;
    } catch {
      return { status: 'closed' };
    }
  }
  return { status: 'closed' };
}

async function openBreaker(
  provider_id: ProviderId,
  reason?: string,
): Promise<number> {
  const opened_at = Date.now();
  const r = getRedis();
  if (!r) return opened_at;
  await r.set(
    stateKey(provider_id),
    JSON.stringify({ status: 'open', opened_at, reason }),
    { ex: 3600 },
  );
  return opened_at;
}

async function closeBreaker(provider_id: ProviderId): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.del(stateKey(provider_id));
  await r.del(ringKey(provider_id));
}

async function recordOutcome(
  provider_id: ProviderId,
  outcome: 'ok' | 'err',
  cfg: BreakerConfig,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  // LPUSH + LTRIM 0 (ringSize-1) maintains the trailing-N window (D-05).
  await r.lpush(ringKey(provider_id), outcome);
  await r.ltrim(ringKey(provider_id), 0, cfg.ringSize - 1);
  const ring = await r.lrange<string>(ringKey(provider_id), 0, cfg.ringSize - 1);
  if (ring.length < cfg.minRingForTrip) return;
  const errs = ring.filter((o: string) => o === 'err').length;
  const rate = errs / ring.length;
  // Strict > matches D-05: "10/20 = 50% does NOT trip; 11/20 = 55% trips".
  if (rate > cfg.tripErrorRate) {
    await openBreaker(provider_id, 'error_rate');
  }
}

async function tryAcquireProbe(
  provider_id: ProviderId,
  openMs: number,
): Promise<boolean> {
  const r = getRedis();
  if (!r) return true;
  const got = await r.set(probeKey(provider_id), '1', {
    ex: Math.ceil(openMs / 1000),
    nx: true,
  });
  return got === 'OK';
}

/**
 * Compose around `fn` to enforce the per-provider error-rate budget.
 *
 * @param provider_id  The pinned `ProviderId` (see cost-estimators.ts)
 * @param fn           The wrapped call (typically `() => withRetry(() => …)`)
 * @param overrides    Optional config overrides — see {@link DEFAULT_BREAKER_CONFIG}
 *
 * @throws {BreakerOpenError} when the breaker is open and the open window has
 *         not yet elapsed, OR when half-open and the single-probe lock could
 *         not be acquired by this caller.
 */
export async function withBreaker<T>(
  provider_id: ProviderId,
  fn: () => Promise<T>,
  overrides: Partial<BreakerConfig> = {},
): Promise<T> {
  const cfg = { ...DEFAULT_BREAKER_CONFIG, ...overrides };
  const state = await readState(provider_id);

  if (state.status === 'open') {
    const elapsed = Date.now() - state.opened_at;
    if (elapsed < cfg.openMs) {
      throw new BreakerOpenError(provider_id, state.opened_at);
    }
    // Half-open: only ONE caller probes at a time.
    const won = await tryAcquireProbe(provider_id, cfg.openMs);
    if (!won) {
      throw new BreakerOpenError(provider_id, state.opened_at);
    }
    try {
      const value = await fn();
      await closeBreaker(provider_id);
      return value;
    } catch (err) {
      if (err instanceof BreakerOpenError) throw err;
      // Probe failed — refresh opened_at so the next open window starts now.
      await openBreaker(provider_id, 'probe_failed');
      throw err;
    }
  }

  // Closed path: run fn, record outcome, possibly trip.
  try {
    const value = await fn();
    await recordOutcome(provider_id, 'ok', cfg);
    return value;
  } catch (err) {
    if (err instanceof BreakerOpenError) throw err;
    await recordOutcome(provider_id, 'err', cfg);
    throw err;
  }
}
