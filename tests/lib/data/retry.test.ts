import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, isRetryableError } from '@/lib/data/retry';

/**
 * Per CONTEXT D-25: retry wrapper retries 5xx + network errors only — NOT 4xx
 * (including 401/403/404/408/429). Default: 3 attempts, 100ms base exponential
 * backoff. Misclassifying 401 as retryable burns rate limit; misclassifying 500
 * as terminal loses recoverable requests.
 */
describe('withRetry / isRetryableError (Plan 19-B-02)', () => {
  beforeEach(() => {
    // Real timers for non-timing tests; specific timing tests opt into fake timers.
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: succeeds on first attempt
  // -------------------------------------------------------------------------
  it('succeeds on first attempt — returns value, fn called once', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 2: retries on 500
  // -------------------------------------------------------------------------
  it('retries on 500 status error — fn called 2x then succeeds', async () => {
    const err500 = Object.assign(new Error('Internal Server Error'), { status: 500 });
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(err500)
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { jitter: false, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Test 3: retries on network error (ECONNREFUSED)
  // -------------------------------------------------------------------------
  it('retries on network error (ECONNREFUSED) — fn called 2x', async () => {
    const netErr = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const fn = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(netErr)
      .mockResolvedValueOnce(42);

    const result = await withRetry(fn, { jitter: false, baseDelayMs: 1 });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Test 4: 401 not retried
  // -------------------------------------------------------------------------
  it('does NOT retry on 401 — fn called once, throws', async () => {
    const err401 = Object.assign(new Error('Unauthorized'), { status: 401 });
    const fn = vi.fn().mockRejectedValue(err401);

    await expect(withRetry(fn, { jitter: false, baseDelayMs: 1 })).rejects.toBe(err401);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 5: 404 not retried
  // -------------------------------------------------------------------------
  it('does NOT retry on 404 — fn called once, throws', async () => {
    const err404 = Object.assign(new Error('Not Found'), { status: 404 });
    const fn = vi.fn().mockRejectedValue(err404);

    await expect(withRetry(fn, { jitter: false, baseDelayMs: 1 })).rejects.toBe(err404);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 6: 429 not retried (per D-25 — 4xx never retried)
  // -------------------------------------------------------------------------
  it('does NOT retry on 429 — fn called once, throws (per D-25, 4xx not retried)', async () => {
    const err429 = Object.assign(new Error('Too Many Requests'), { status: 429 });
    const fn = vi.fn().mockRejectedValue(err429);

    await expect(withRetry(fn, { jitter: false, baseDelayMs: 1 })).rejects.toBe(err429);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Test 7: max attempts cap
  // -------------------------------------------------------------------------
  it('retries up to maxAttempts=3 then throws last error', async () => {
    const errs = [
      Object.assign(new Error('e1'), { status: 500 }),
      Object.assign(new Error('e2'), { status: 502 }),
      Object.assign(new Error('e3'), { status: 503 }),
    ];
    const fn = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(errs[0])
      .mockRejectedValueOnce(errs[1])
      .mockRejectedValueOnce(errs[2]);

    await expect(withRetry(fn, { jitter: false, baseDelayMs: 1, maxAttempts: 3 })).rejects.toBe(
      errs[2],
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------------
  // Test 8: exponential backoff timing (no jitter): 100ms, 200ms
  // -------------------------------------------------------------------------
  it('exponential backoff: 100ms, 200ms (verify via fake timers)', async () => {
    vi.useFakeTimers();

    const err500 = Object.assign(new Error('5xx'), { status: 500 });
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(err500)
      .mockRejectedValueOnce(err500)
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { jitter: false, baseDelayMs: 100, maxAttempts: 3 });

    // Attempt 1 fires synchronously, rejects on next microtask. Flush microtasks
    // so the catch block schedules the first setTimeout.
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // First backoff: 100ms (= base * 2^0)
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    // Second backoff: 200ms (= base * 2^1)
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toBe('ok');
  });

  // -------------------------------------------------------------------------
  // Test 9: jitter randomizes delays within ±50% (full jitter ⇒ delay ∈ [exp/2, exp])
  // -------------------------------------------------------------------------
  it('jitter randomizes delays when opts.jitter=true (verify timing within ±50%)', async () => {
    vi.useFakeTimers();
    // Force Math.random = 0 ⇒ delay = exp * 0.5 (lower bound)
    const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    const err500 = Object.assign(new Error('5xx'), { status: 500 });
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(err500)
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { jitter: true, baseDelayMs: 100, maxAttempts: 3 });

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // With Math.random()=0, jittered delay = 100 * (0.5 + 0*0.5) = 50ms.
    // Advance just under 50ms — should NOT fire yet.
    await vi.advanceTimersByTimeAsync(49);
    expect(fn).toHaveBeenCalledTimes(1);

    // Cross 50ms — should fire now.
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    await expect(promise).resolves.toBe('ok');

    randSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Test 10: custom isRetryable override
  // -------------------------------------------------------------------------
  it('custom isRetryable override works (e.g., retry on 404)', async () => {
    const err404 = Object.assign(new Error('Not Found'), { status: 404 });
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(err404)
      .mockResolvedValueOnce('found');

    // Default classification would NOT retry 404; custom override DOES.
    const result = await withRetry(fn, {
      jitter: false,
      baseDelayMs: 1,
      maxAttempts: 3,
      isRetryable: (err: unknown) => (err as { status?: number })?.status === 404,
    });

    expect(result).toBe('found');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Bonus: isRetryableError direct unit checks (covers classifier surface)
  // -------------------------------------------------------------------------
  it('isRetryableError: 5xx ⇒ true, 4xx ⇒ false, network sentinel ⇒ true', () => {
    expect(isRetryableError(Object.assign(new Error(), { status: 500 }))).toBe(true);
    expect(isRetryableError(Object.assign(new Error(), { status: 502 }))).toBe(true);
    expect(isRetryableError(Object.assign(new Error(), { status: 503 }))).toBe(true);
    expect(isRetryableError(Object.assign(new Error(), { status: 504 }))).toBe(true);

    expect(isRetryableError(Object.assign(new Error(), { status: 400 }))).toBe(false);
    expect(isRetryableError(Object.assign(new Error(), { status: 401 }))).toBe(false);
    expect(isRetryableError(Object.assign(new Error(), { status: 403 }))).toBe(false);
    expect(isRetryableError(Object.assign(new Error(), { status: 404 }))).toBe(false);
    expect(isRetryableError(Object.assign(new Error(), { status: 408 }))).toBe(false);
    expect(isRetryableError(Object.assign(new Error(), { status: 429 }))).toBe(false);

    expect(isRetryableError(Object.assign(new Error(), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(isRetryableError(Object.assign(new Error(), { code: 'ENOTFOUND' }))).toBe(true);
    expect(isRetryableError(Object.assign(new Error(), { code: 'ETIMEDOUT' }))).toBe(true);
    expect(isRetryableError(Object.assign(new Error(), { code: 'ECONNRESET' }))).toBe(true);
    expect(isRetryableError(Object.assign(new Error(), { code: 'EAI_AGAIN' }))).toBe(true);

    // undici-style nested cause
    expect(
      isRetryableError(Object.assign(new Error(), { cause: { code: 'ECONNREFUSED' } })),
    ).toBe(true);

    // null / unknown shape
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError(new Error('plain'))).toBe(false);
  });
});
