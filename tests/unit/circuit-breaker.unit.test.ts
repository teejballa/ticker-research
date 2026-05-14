// Phase: 30 — Provider Health Hardening
// Phase 30 D-04, D-05, D-07, D-08
//
// RED-state scaffold. Wave 1/2 implementation will replace `it.todo` entries
// with assertion bodies that drive `src/lib/data/circuit-breaker.ts`
// (`withBreaker`, `BreakerOpenError`) and the widened
// `TelemetryErrorClass.BREAKER_OPEN` value.
//
// Mock harness: tests in this file use the in-memory Upstash mock so the
// trailing-20 ring buffer (D-05) + per-provider state key (D-04) can be
// asserted deterministically. Plan 30-02 introduces `withBreaker`; until then
// all entries are pending todos.

import { describe, it, beforeEach, vi } from 'vitest';
import { __resetMockRedis } from '@/lib/data/cache/__mocks__/upstash';

// Substitute the real Upstash module with the in-memory mock for any imports
// inside the production code under test. Wave 2 tests will rely on this wiring
// being in place at file scope.
vi.mock('@/lib/data/cache/upstash', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

beforeEach(() => {
  __resetMockRedis();
});

describe('Phase 30 / D-04: per-provider breaker key shape', () => {
  it.todo('D-04: breaker state stored under key pattern `breaker:{provider_id}:state`');
  it.todo('D-04: ring buffer stored under key pattern `breaker:{provider_id}:ring`');
  it.todo('D-04: state read/write round-trips through Upstash mock');
});

describe('Phase 30 / D-05: trip rule — rolling 20-call error rate', () => {
  it.todo('D-05: opens breaker after 11 of last 20 calls fail (>50% error rate)');
  it.todo('D-05: does not open breaker at 10/20 = 50% (must be strictly >0.5)');
  it.todo('D-05: writes ring entry via lpush + ltrim 0 19 pipeline');
  it.todo('D-05: ring length is capped at exactly 20 entries after >20 calls');
});

describe('Phase 30 / D-07: BreakerOpenError shape and non-retry semantics', () => {
  it.todo('D-07: throws BreakerOpenError with provider_id and opened_at fields when state.status=open');
  it.todo('D-07: BreakerOpenError.name === "BreakerOpenError"');
  it.todo('D-07: withRetry does NOT retry a BreakerOpenError (treated as non-retryable)');
});

describe('Phase 30 / D-08: error-classifier widening', () => {
  it.todo('D-08: classifyError(new BreakerOpenError("yahoo", 0)) returns "BREAKER_OPEN"');
  it.todo('D-08: TelemetryErrorClass union includes "BREAKER_OPEN"');
});
