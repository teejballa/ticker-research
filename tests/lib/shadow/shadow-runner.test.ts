// tests/lib/shadow/shadow-runner.test.ts
//
// Phase 19 / Plan 19-Z-03 / Task 3 — runWithShadow<T>() generic harness tests.
//
// Behavior under each FeatureMode:
//   off    → returns oldFn() result; newFn never called
//   on     → returns newFn() result; oldFn never called
//   shadow → returns oldFn() result FIRST; newFn runs in setImmediate background;
//            persists ShadowComparison row with old/new outputs + latencies
//
// Critical invariants (D-14, T-19-Z-03-02):
//   - shadow mode never injects new-path latency into user-facing path
//   - new-path errors NEVER propagate to caller (caught + logged + persisted)
//   - URL auth strings sanitized before persist (T-19-Z-03-03)

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the prisma client BEFORE importing the unit under test.
// `vi.hoisted()` ensures `mockCreate` is created before vi.mock factory runs
// (vi.mock is hoisted to the top of the file by Vitest's transform).
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    shadowComparison: {
      create: mockCreate,
    },
  },
}));

import { runWithShadow } from '../../../src/lib/shadow/shadow-runner';

/** Flush queued setImmediate callbacks. */
function flushSetImmediate(): Promise<void> {
  // setImmediate callbacks run in the check phase; awaiting a setImmediate
  // promise puts our continuation behind any already-scheduled callbacks.
  return new Promise((resolve) => setImmediate(resolve));
}

describe('runWithShadow<T>()', () => {
  beforeEach(() => {
    mockCreate.mockClear();
  });

  it('Test 1: mode=off — returns oldFn result, newFn never called', async () => {
    const oldFn = vi.fn().mockResolvedValue('old-result');
    const newFn = vi.fn().mockResolvedValue('new-result');

    const result = await runWithShadow('test-path', oldFn, newFn, 'off');

    expect(result).toBe('old-result');
    expect(oldFn).toHaveBeenCalledTimes(1);
    expect(newFn).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('Test 2: mode=on — returns newFn result, oldFn never called', async () => {
    const oldFn = vi.fn().mockResolvedValue('old-result');
    const newFn = vi.fn().mockResolvedValue('new-result');

    const result = await runWithShadow('test-path', oldFn, newFn, 'on');

    expect(result).toBe('new-result');
    expect(newFn).toHaveBeenCalledTimes(1);
    expect(oldFn).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('Test 3: mode=shadow — returns oldFn result; newFn called in setImmediate background', async () => {
    const oldFn = vi.fn().mockResolvedValue('old-result');
    const newFn = vi.fn().mockResolvedValue('new-result');

    const result = await runWithShadow('test-path', oldFn, newFn, 'shadow');

    // Old returned first
    expect(result).toBe('old-result');
    expect(oldFn).toHaveBeenCalledTimes(1);

    // newFn has not yet been called (it's queued in setImmediate)
    // After flush, it should be called.
    await flushSetImmediate();
    // Drain microtasks once more to allow the inner async to complete
    await new Promise((r) => setImmediate(r));
    expect(newFn).toHaveBeenCalledTimes(1);
  });

  it('Test 4: mode=shadow — persists ShadowComparison row with old/new outputs + latencies', async () => {
    const oldFn = vi.fn().mockResolvedValue({ value: 'old', count: 1 });
    const newFn = vi.fn().mockResolvedValue({ value: 'new', count: 2 });

    await runWithShadow('test-path', oldFn, newFn, 'shadow', { ticker: 'AAPL' });
    await flushSetImmediate();
    await new Promise((r) => setImmediate(r));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data.path_name).toBe('test-path');
    expect(callArg.data.ticker).toBe('AAPL');
    expect(callArg.data.old_output_json).toEqual({ value: 'old', count: 1 });
    expect(callArg.data.new_output_json).toEqual({ value: 'new', count: 2 });
    expect(typeof callArg.data.old_latency_ms).toBe('number');
    expect(typeof callArg.data.new_latency_ms).toBe('number');
    expect(callArg.data.old_latency_ms).toBeGreaterThanOrEqual(0);
    expect(callArg.data.new_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('Test 5: mode=shadow — newFn errors swallowed, persisted as {error}, NEVER thrown to caller', async () => {
    const oldFn = vi.fn().mockResolvedValue('old-result');
    const newFn = vi.fn().mockRejectedValue(new Error('boom'));

    // Spy on console.error to verify error is logged
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});

    let result: string | undefined;
    let thrown: unknown = null;
    try {
      result = await runWithShadow('test-path', oldFn, newFn, 'shadow');
    } catch (e) {
      thrown = e;
    }

    // Caller receives oldFn result, NEVER the new-path error
    expect(thrown).toBeNull();
    expect(result).toBe('old-result');

    await flushSetImmediate();
    await new Promise((r) => setImmediate(r));

    // Error logged to console
    expect(consoleErr).toHaveBeenCalled();

    // Persisted with error payload
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data.new_output_json).toMatchObject({ error: expect.any(String) });
    expect(String(callArg.data.new_output_json.error)).toContain('boom');

    consoleErr.mockRestore();
  });

  it('Test 6: path_name and ticker propagated to ShadowComparison row', async () => {
    const oldFn = vi.fn().mockResolvedValue({});
    const newFn = vi.fn().mockResolvedValue({});

    await runWithShadow('source-package-merge', oldFn, newFn, 'shadow', { ticker: 'TSLA' });
    await flushSetImmediate();
    await new Promise((r) => setImmediate(r));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data.path_name).toBe('source-package-merge');
    expect(callArg.data.ticker).toBe('TSLA');
  });

  it('Test 7: cost_old_usd / cost_new_usd propagated when ctx provided', async () => {
    const oldFn = vi.fn().mockResolvedValue({});
    const newFn = vi.fn().mockResolvedValue({});

    await runWithShadow('test-path', oldFn, newFn, 'shadow', {
      ticker: 'NVDA',
      cost_old_usd: 0.012,
      cost_new_usd: 0.008,
    });
    await flushSetImmediate();
    await new Promise((r) => setImmediate(r));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.data.old_cost_usd).toBe(0.012);
    expect(callArg.data.new_cost_usd).toBe(0.008);
  });
});
