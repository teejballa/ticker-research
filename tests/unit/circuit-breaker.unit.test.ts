// Phase: 30 — Provider Health Hardening
// Phase 30 D-04, D-05, D-07, D-08
//
// Unit tests for `src/lib/data/circuit-breaker.ts` and its interaction with
// `src/lib/telemetry/error-classifier.ts`. Time-sensitive state-machine
// transitions (open → half-open) live in the integration file.
//
// Mock harness: the in-memory Upstash mock is substituted for the real REST
// client. Each test starts from a fresh store via `beforeEach(__resetMockRedis)`.

import { describe, it, beforeEach, expect, vi } from 'vitest';
import {
  __resetMockRedis,
  getRedis as getMockRedis,
} from '@/lib/data/cache/__mocks__/upstash';

// Substitute the real Upstash module with the in-memory mock for any imports
// inside the production code under test.
vi.mock('@/lib/data/cache/upstash', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

import {
  withBreaker,
  BreakerOpenError,
  DEFAULT_BREAKER_CONFIG,
} from '@/lib/data/circuit-breaker';
import { withRetry } from '@/lib/data/retry';

// Phase-30 D-08 classifier widening + the matching D-08 unit assertions live
// in tests/telemetry/error-classifier.unit.test.ts so the error-classifier
// surface stays the single source of truth for `classifyError` behavior.

beforeEach(() => {
  __resetMockRedis();
});

describe('Phase 30 / D-04: per-provider breaker key shape', () => {
  it('D-04: breaker state stored under key pattern `breaker:{provider_id}:state`', async () => {
    // Seed 11 errors out of 20 so the breaker trips on the next call.
    const r = getMockRedis();
    for (let i = 0; i < 11; i++) await r.lpush('breaker:yahoo:ring', 'err');
    for (let i = 0; i < 9; i++) await r.lpush('breaker:yahoo:ring', 'ok');

    // Trigger one more error to evaluate the trip rule against the seeded ring.
    await expect(
      withBreaker('yahoo', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    const stateRaw = await r.get<unknown>('breaker:yahoo:state');
    expect(stateRaw).not.toBeNull();
    // The stored value is JSON; the mock auto-parses to an object on read.
    expect(typeof stateRaw).toBe('object');
  });

  it('D-04: ring buffer stored under key pattern `breaker:{provider_id}:ring`', async () => {
    await withBreaker('polygon', () => Promise.resolve('ok'));
    const r = getMockRedis();
    const ring = await r.lrange('breaker:polygon:ring', 0, 19);
    expect(ring).toEqual(['ok']);
  });

  it('D-04: state read/write round-trips through Upstash mock', async () => {
    // Manually plant an open state and confirm withBreaker reads it back.
    const r = getMockRedis();
    const opened_at = Date.now();
    await r.set(
      'breaker:finnhub:state',
      JSON.stringify({ status: 'open', opened_at }),
      { ex: 3600 },
    );
    await expect(
      withBreaker('finnhub', () => Promise.resolve('should-not-run')),
    ).rejects.toBeInstanceOf(BreakerOpenError);
  });
});

describe('Phase 30 / D-05: trip rule — rolling 20-call error rate', () => {
  it('D-05: opens breaker after 11 of last 20 calls fail (>50% error rate)', async () => {
    // Seed ring with 10 'err' + 9 'ok'; the next error makes it 11/20 = 55%.
    const r = getMockRedis();
    for (let i = 0; i < 10; i++) await r.lpush('breaker:yahoo:ring', 'err');
    for (let i = 0; i < 9; i++) await r.lpush('breaker:yahoo:ring', 'ok');

    await expect(
      withBreaker('yahoo', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    // Now the breaker is open — the very next call short-circuits with BreakerOpenError.
    await expect(
      withBreaker('yahoo', () => Promise.resolve('never-runs')),
    ).rejects.toBeInstanceOf(BreakerOpenError);
  });

  it('D-05: does not open breaker at 10/20 = 50% (must be strictly >0.5)', async () => {
    // Seed ring with 9 'err' + 10 'ok'; the next error makes it 10/20 = 50%. NOT a trip.
    const r = getMockRedis();
    for (let i = 0; i < 9; i++) await r.lpush('breaker:polygon:ring', 'err');
    for (let i = 0; i < 10; i++) await r.lpush('breaker:polygon:ring', 'ok');

    await expect(
      withBreaker('polygon', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    // 10/20 = 50.0% is NOT strictly greater than 0.5 — breaker stays closed.
    const stateRaw = await r.get('breaker:polygon:state');
    expect(stateRaw).toBeNull();

    // Next call proceeds against the wrapped fn.
    const result = await withBreaker('polygon', () => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('D-05: writes ring entry via lpush + ltrim 0 19 pipeline', async () => {
    const r = getMockRedis();
    const lpushSpy = vi.spyOn(r, 'lpush');
    const ltrimSpy = vi.spyOn(r, 'ltrim');

    await withBreaker('yahoo', () => Promise.resolve('ok'));

    expect(lpushSpy).toHaveBeenCalledWith('breaker:yahoo:ring', 'ok');
    expect(ltrimSpy).toHaveBeenCalledWith(
      'breaker:yahoo:ring',
      0,
      DEFAULT_BREAKER_CONFIG.ringSize - 1,
    );
  });

  it('D-05: ring length is capped at exactly 20 entries after >20 calls', async () => {
    // 25 successful calls — ring buffer must stay at 20.
    for (let i = 0; i < 25; i++) {
      await withBreaker('polygon', () => Promise.resolve('ok'));
    }
    const r = getMockRedis();
    const ring = await r.lrange('breaker:polygon:ring', 0, -1);
    expect(ring.length).toBe(20);
    // All entries should be 'ok' (we only made successful calls).
    expect(ring.every((o) => o === 'ok')).toBe(true);
  });
});

describe('Phase 30 / D-07: BreakerOpenError shape and non-retry semantics', () => {
  it('D-07: throws BreakerOpenError with provider_id and opened_at fields when state.status=open', async () => {
    const r = getMockRedis();
    const opened_at = Date.now();
    await r.set(
      'breaker:yahoo:state',
      JSON.stringify({ status: 'open', opened_at }),
      { ex: 3600 },
    );

    try {
      await withBreaker('yahoo', () => Promise.resolve('nope'));
      throw new Error('expected withBreaker to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BreakerOpenError);
      const boe = err as BreakerOpenError;
      expect(boe.provider_id).toBe('yahoo');
      expect(boe.opened_at).toBe(opened_at);
    }
  });

  it('D-07: BreakerOpenError.name === "BreakerOpenError"', () => {
    const err = new BreakerOpenError('finnhub', Date.now());
    expect(err.name).toBe('BreakerOpenError');
    expect(err).toBeInstanceOf(Error);
  });

  it('D-07: withRetry does NOT retry a BreakerOpenError (treated as non-retryable)', async () => {
    let attemptCount = 0;
    const fn = vi.fn().mockImplementation(() => {
      attemptCount++;
      return Promise.reject(new BreakerOpenError('yahoo', Date.now()));
    });

    await expect(
      withRetry(fn, { jitter: false, baseDelayMs: 1, maxAttempts: 3 }),
    ).rejects.toBeInstanceOf(BreakerOpenError);

    // No retries: BreakerOpenError has no `code` and no `status >= 500` → isRetryableError returns false.
    expect(attemptCount).toBe(1);
  });
});

// Phase 30 / D-08 (error-classifier widening) tests live in
// tests/telemetry/error-classifier.unit.test.ts and are landed by Task 2 of
// this plan alongside the source widening of `TelemetryErrorClass`.
