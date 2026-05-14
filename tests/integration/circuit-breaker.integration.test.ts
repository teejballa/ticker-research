// Phase: 30 — Provider Health Hardening
// Phase 30 D-06
//
// Half-open probe state machine:
//   open → 30s elapsed → SETNX probe lock → success closes / failure reopens
//
// Time semantics: each test plants the breaker state with an `opened_at`
// already shifted by `now - 31s` so the `elapsed >= openMs` branch fires
// without manipulating the real wall clock. This is more robust than
// vitest fake timers across async Upstash-REST paths.

import { describe, it, beforeEach, expect, vi } from 'vitest';
import {
  __resetMockRedis,
  getRedis as getMockRedis,
} from '@/lib/data/cache/__mocks__/upstash';

vi.mock('@/lib/data/cache/upstash', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

import {
  withBreaker,
  BreakerOpenError,
} from '@/lib/data/circuit-breaker';

beforeEach(() => {
  __resetMockRedis();
});

/** Plant an open state whose open window has just elapsed (so the next call enters half-open). */
async function plantExpiredOpenState(provider_id: string) {
  const r = getMockRedis();
  const opened_at = Date.now() - 31_000; // 31s in the past — past the 30s openMs
  await r.set(
    `breaker:${provider_id}:state`,
    JSON.stringify({ status: 'open', opened_at }),
    { ex: 3600 },
  );
  return opened_at;
}

describe('Phase 30 / D-06: half-open probe state machine', () => {
  it('D-06: open → 30s elapsed → next call enters half-open via SETNX probe lock', async () => {
    await plantExpiredOpenState('yahoo');

    // Probe call succeeds — breaker should close + ring reset.
    const result = await withBreaker('yahoo', () => Promise.resolve('probe-ok'));
    expect(result).toBe('probe-ok');

    const r = getMockRedis();
    const stateRaw = await r.get('breaker:yahoo:state');
    expect(stateRaw).toBeNull();
  });

  it('D-06: half-open probe success closes breaker (state.status=closed, ring reset)', async () => {
    await plantExpiredOpenState('polygon');
    const r = getMockRedis();
    // Plant some stale ring entries — they should be wiped on close.
    await r.lpush('breaker:polygon:ring', 'err', 'err', 'err');

    await withBreaker('polygon', () => Promise.resolve('ok'));

    const stateRaw = await r.get('breaker:polygon:state');
    expect(stateRaw).toBeNull();
    const ring = await r.lrange('breaker:polygon:ring', 0, -1);
    expect(ring).toEqual([]);
  });

  it('D-06: half-open probe failure reopens breaker (state.status=open, opened_at refreshed)', async () => {
    const originalOpenedAt = await plantExpiredOpenState('finnhub');

    const before = Date.now();
    await expect(
      withBreaker('finnhub', () => Promise.reject(new Error('still-broken'))),
    ).rejects.toThrow('still-broken');
    const after = Date.now();

    const r = getMockRedis();
    const stateRaw = (await r.get<{
      status: string;
      opened_at: number;
      reason?: string;
    }>('breaker:finnhub:state'))!;
    expect(stateRaw).not.toBeNull();
    expect(stateRaw.status).toBe('open');
    // opened_at refreshed to ~now, not the original (which was 31s ago).
    expect(stateRaw.opened_at).toBeGreaterThan(originalOpenedAt);
    expect(stateRaw.opened_at).toBeGreaterThanOrEqual(before);
    expect(stateRaw.opened_at).toBeLessThanOrEqual(after);
    expect(stateRaw.reason).toBe('probe_failed');
  });

  it('D-06: only ONE caller wins SETNX probe lock; others throw BreakerOpenError immediately', async () => {
    await plantExpiredOpenState('yahoo');

    // Concurrent half-open attempts: one wins the SETNX probe, others throw.
    // Use a delayed-resolution probe so we can fire a second call while the
    // first holds the lock.
    let releaseProbe: (() => void) | null = null;
    const probePromise = new Promise<string>((resolve) => {
      releaseProbe = () => resolve('probe-result');
    });

    const winner = withBreaker('yahoo', () => probePromise);

    // Second concurrent caller — lock is held → BreakerOpenError.
    const loser = withBreaker('yahoo', () => Promise.resolve('loser-runs'));

    await expect(loser).rejects.toBeInstanceOf(BreakerOpenError);

    // Now release the winner's probe.
    releaseProbe!();
    await expect(winner).resolves.toBe('probe-result');
  });

  it('D-06: probe lock TTL prevents permanent half-open deadlock if the probe call hangs', async () => {
    // Plant open state + a stale probe lock with an already-expired TTL.
    // After expiry, the next caller should be able to acquire the lock.
    const r = getMockRedis();
    await plantExpiredOpenState('polygon');
    // Acquire and then manually expire the probe lock by setting it with ex=1
    // and time-warping past it.
    await r.set('breaker:polygon:probe', '1', { ex: 1, nx: true });

    // Advance mock time past the 1s probe TTL.
    const { __advanceMockTime } = await import('@/lib/data/cache/__mocks__/upstash');
    __advanceMockTime(2_000);

    // Now the lock is expired — the next caller should acquire it and run the probe.
    const result = await withBreaker('polygon', () => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
  });
});
