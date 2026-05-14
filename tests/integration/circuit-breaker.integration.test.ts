// Phase: 30 — Provider Health Hardening
// Phase 30 D-06
//
// RED-state scaffold for the half-open probe state machine:
//   open → 30s elapsed → SETNX probe lock → success closes / failure reopens
//
// Time semantics: tests advance the mock Upstash clock via
// `__advanceMockTime(31_000)` to step past the 30s open window rather than
// relying on vitest fake-timers, which don't always cover async REST paths
// cleanly. The real breaker reads expiry from Upstash, so the mock's
// `mockNow()` is the single source of truth for state transitions.
//
// Plan 30-02 implements the half-open machinery; until then every entry is a
// pending todo.

import { describe, it, beforeEach, vi } from 'vitest';
import {
  __resetMockRedis,
  // Time-warp helper imported for Wave 2 — currently unused, suppress lint via no-op reference below.
} from '@/lib/data/cache/__mocks__/upstash';

vi.mock('@/lib/data/cache/upstash', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

beforeEach(() => {
  __resetMockRedis();
});

describe('Phase 30 / D-06: half-open probe state machine', () => {
  it.todo('D-06: open → 30s elapsed → next call enters half-open via SETNX probe lock');
  it.todo('D-06: half-open probe success closes breaker (state.status=closed, ring reset)');
  it.todo('D-06: half-open probe failure reopens breaker (state.status=open, opened_at refreshed)');
  it.todo('D-06: only ONE caller wins SETNX probe lock; others throw BreakerOpenError immediately');
  it.todo('D-06: probe lock TTL prevents permanent half-open deadlock if the probe call hangs');
});
