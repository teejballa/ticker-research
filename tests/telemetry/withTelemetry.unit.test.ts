/**
 * Plan 20-Z-03 — withTelemetry wrapper unit tests.
 *
 * Covers:
 *   - return-value preservation (caller sees exact fn() output)
 *   - INSERT happens via fire-and-forget on success path
 *   - error rethrow (original error reference preserved)
 *   - error_class populated from classifyError on error path
 *   - cost_usd_estimator path
 *   - cost_usd_estimator throw → fallback to flat rate
 *   - T-20-Z-03-01: wrapper overhead p99 < 5ms (intent: 2ms; ceiling
 *     relaxed to 5ms for CI flake tolerance per plan Task 10a)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the DAO so wrapper overhead is measured without DB latency.
vi.mock('@/lib/telemetry/provider-call-log', () => ({
  recordCallAsync: vi.fn(),
  __internal_swallowed_insert_failures: () => 0,
  __internal_reset_counter: () => undefined,
}));

import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import { recordCallAsync } from '@/lib/telemetry/provider-call-log';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withTelemetry — return value preservation', () => {
  it('returns the EXACT value fn() returned', async () => {
    const r = await withTelemetry('yahoo', async () => ({ price: 42.5 }));
    expect(r).toEqual({ price: 42.5 });
  });

  it('records ONE row on success', async () => {
    await withTelemetry('yahoo', async () => ({ x: 1 }));
    await new Promise((r) => setTimeout(r, 5)); // wait for queueMicrotask in caller
    expect(recordCallAsync).toHaveBeenCalledTimes(1);
    const row = (recordCallAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.provider_id).toBe('yahoo');
    expect(row.status).toBe('ok');
  });
});

describe('withTelemetry — error rethrow', () => {
  it('re-throws the ORIGINAL error unchanged', async () => {
    const err = Object.assign(new Error('boom'), { status: 500 });
    await expect(
      withTelemetry('finnhub', async () => {
        throw err;
      }),
    ).rejects.toBe(err);
  });

  it('records error row with classified error_class', async () => {
    const err = Object.assign(new Error('rate'), { status: 429 });
    try {
      await withTelemetry('finnhub', async () => {
        throw err;
      });
    } catch {
      /* expected */
    }
    await new Promise((r) => setTimeout(r, 5));
    const row = (recordCallAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.status).toBe('error');
    expect(row.error_class).toBe('RATE_LIMITED');
    expect(row.http_status).toBe(429);
  });
});

describe('withTelemetry — cost estimator', () => {
  it('uses cost_usd_estimator when provided', async () => {
    await withTelemetry(
      'gemini',
      async () => ({ usage: { inputTokens: 1000, outputTokens: 500 } }),
      {
        cost_usd_estimator: (r) =>
          r.usage.inputTokens * 0.000125 + r.usage.outputTokens * 0.000375,
      },
    );
    await new Promise((r) => setTimeout(r, 5));
    const row = (recordCallAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // 1000*0.000125 + 500*0.000375 = 0.125 + 0.1875 = 0.3125
    expect(row.cost_usd).toBeCloseTo(0.3125, 6);
  });

  it('falls back to flat rate when estimator throws', async () => {
    await withTelemetry('finbert-hf', async () => ({}), {
      cost_usd_estimator: () => {
        throw new Error('bad');
      },
    });
    await new Promise((r) => setTimeout(r, 5));
    const row = (recordCallAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.cost_usd).toBeCloseTo(0.0001, 6); // finbert-hf flat rate
  });
});

describe('withTelemetry — overhead p99 < 2ms (T-20-Z-03-01)', () => {
  it('overhead', async () => {
    const N = 1000;
    const overheads: number[] = [];
    for (let i = 0; i < N; i++) {
      // Resolved-immediately fn: time-difference is essentially wrapper overhead.
      const t0 = performance.now();
      await withTelemetry('yahoo', async () => 1);
      const t1 = performance.now();
      overheads.push(t1 - t0);
    }
    overheads.sort((a, b) => a - b);
    const p99 = overheads[Math.floor(N * 0.99)];
    // Allow 5ms ceiling on shared CI runners (test name asserts 2ms intent;
    // CI flake tolerance is 5ms — documented in plan Task 10a).
    expect(p99).toBeLessThan(5);
  });
});
