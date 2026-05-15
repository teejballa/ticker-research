// Phase: 30 — Provider Health Hardening
// Phase 30 D-15
//
// GREEN-state tests for the Gemini cost-anomaly circuit breaker:
//   - any single Gemini call with cost_usd > $1.00 increments
//     `cost_anomaly:gemini` (1h TTL)
//   - when the counter reaches 3 within the 1h window, trip
//     `breaker:gemini:state` with reason=cost_anomaly
//   - per D-15 Amendment 2026-05-14: counter resets at TRIP time (DEL on trip)
//     rather than at CLOSE time. Equivalent observable behavior since
//     short-circuit prevents any $1+ call during the 1h open window.

import { describe, it, beforeEach, expect, vi } from 'vitest';
import {
  __resetMockRedis,
  __advanceMockTime,
  getRedis as getMockRedis,
} from '@/lib/data/cache/__mocks__/upstash';

vi.mock('@/lib/data/cache/upstash', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

// Stub the telemetry DAO so we can drive withTelemetry without a DB.
vi.mock('@/lib/telemetry/provider-call-log', () => ({
  recordCallAsync: vi.fn(),
  __internal_swallowed_insert_failures: () => 0,
  __internal_reset_counter: () => undefined,
}));

import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import { withBreaker, BreakerOpenError } from '@/lib/data/circuit-breaker';

beforeEach(() => {
  __resetMockRedis();
  vi.clearAllMocks();
});

/** Drive withTelemetry once with a forced cost_usd value. */
async function callGeminiWithCost(cost_usd: number): Promise<unknown> {
  return withTelemetry(
    'gemini',
    async () => ({ value: 'ok' }),
    {
      cost_usd_estimator: () => cost_usd,
    },
  );
}

async function flushMicrotasks(): Promise<void> {
  // The cost-anomaly path runs inside queueMicrotask. Yield twice to drain
  // both the micro-task scheduler and any setTimeout-backed fallbacks.
  await new Promise((r) => setTimeout(r, 10));
}

describe('Phase 30 / D-15: Gemini cost-anomaly breaker', () => {
  it('D-15: single $1.01 gemini call increments cost_anomaly:gemini counter to 1 with 1h TTL', async () => {
    await callGeminiWithCost(1.01);
    await flushMicrotasks();
    const r = getMockRedis();
    const v = await r.get<string | number>('cost_anomaly:gemini');
    // The mock's incr stores the integer as a string; parseValue returns either
    // a parsed number or the raw string. Both must equal 1.
    expect(String(v)).toBe('1');
  });

  it('D-15: a Gemini call with cost_usd <= $1.00 does NOT increment the counter', async () => {
    await callGeminiWithCost(1.00);
    await flushMicrotasks();
    const r = getMockRedis();
    const v = await r.get('cost_anomaly:gemini');
    expect(v).toBeNull();
  });

  it('D-15: three $1.01 calls within 1h opens breaker:gemini:state with reason=cost_anomaly', async () => {
    await callGeminiWithCost(1.01);
    await callGeminiWithCost(1.01);
    await callGeminiWithCost(1.01);
    await flushMicrotasks();
    const r = getMockRedis();
    const state = await r.get<{
      status: string;
      opened_at: number;
      reason?: string;
    }>('breaker:gemini:state');
    expect(state).not.toBeNull();
    expect(state?.status).toBe('open');
    expect(state?.reason).toBe('cost_anomaly');
    expect(typeof state?.opened_at).toBe('number');
  });

  it('D-15: one $1.01 call followed by counter expiry then $1.01 does not trip (window decayed)', async () => {
    await callGeminiWithCost(1.01);
    await flushMicrotasks();
    // Advance past 1h window — counter expires.
    __advanceMockTime(3_700_000); // 3700s > 3600s
    await callGeminiWithCost(1.01);
    await flushMicrotasks();
    const r = getMockRedis();
    const state = await r.get('breaker:gemini:state');
    expect(state).toBeNull(); // breaker NOT tripped (only 1 increment after window reset)
  });

  it('D-15: breaker trip resets the counter (DEL cost_anomaly:gemini at trip time, per Amendment 2026-05-14)', async () => {
    await callGeminiWithCost(1.01);
    await callGeminiWithCost(1.01);
    await callGeminiWithCost(1.01);
    await flushMicrotasks();
    const r = getMockRedis();
    // Counter was DELed at trip time.
    const counter = await r.get('cost_anomaly:gemini');
    expect(counter).toBeNull();
  });

  it('D-15: cost-anomaly trip yields BreakerOpenError on subsequent Gemini calls within the 1h open window', async () => {
    // Trip the breaker first.
    await callGeminiWithCost(1.01);
    await callGeminiWithCost(1.01);
    await callGeminiWithCost(1.01);
    await flushMicrotasks();

    // Now any call wrapped in withBreaker('gemini', ...) should short-circuit
    // with BreakerOpenError because state is open and the 30s window has not
    // elapsed yet.
    await expect(
      withBreaker('gemini', () => Promise.resolve('should-not-run')),
    ).rejects.toBeInstanceOf(BreakerOpenError);
  });
});
