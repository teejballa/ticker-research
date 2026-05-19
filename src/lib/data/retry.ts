/**
 * Plan 19-B-02 — Retry + exponential backoff wrapper.
 *
 * Per CONTEXT D-25: retry 5xx + network errors only — NEVER 4xx (including
 * 401 / 403 / 404 / 408 / 429). Misclassifying 401 as retryable burns rate
 * limit; misclassifying 500 as terminal loses recoverable requests.
 *
 * Default: 3 attempts, 100ms base exponential backoff, full-jitter on by
 * default (per AWS architecture blog "exponential-backoff-and-jitter" — full
 * jitter is the right choice for thundering-herd avoidance).
 *
 * Foundation for Wave B adapters (Tiingo / Twelve Data / Exa).
 */

export interface RetryOptions {
  /** Total attempts including the first one. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms. Backoff = base * 2^attempt. Default 100. */
  baseDelayMs?: number;
  /** When true, applies full jitter: delay = exp * (0.5 + random*0.5). Default true. */
  jitter?: boolean;
  /** Override default classification. */
  isRetryable?: (err: unknown) => boolean;
}

/**
 * Network-layer sentinel codes Node/undici raise when DNS / TCP / TLS fail
 * before any HTTP status is observed. These are always retryable.
 */
const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
]);

/**
 * Default retryability classifier.
 *
 *   - 5xx (500/502/503/504/...) ⇒ true
 *   - Network sentinel code ⇒ true (also probes `cause.code` for undici)
 *   - 4xx (incl. 401 / 403 / 404 / 408 / 429) ⇒ false (per D-25)
 *   - Anything else ⇒ false
 */
export function isRetryableError(err: unknown): boolean {
  if (err == null) return false;
  const e = err as { name?: string; status?: number; code?: string; cause?: { code?: string } };

  // Network sentinel code (direct or undici-style nested)
  const code = e.code ?? e.cause?.code;
  if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) return true;

  // HTTP 5xx
  if (typeof e.status === 'number' && e.status >= 500 && e.status < 600) return true;

  // Phase 30.1 pivot — Xpoz transient errors (connection drop, server-side
  // operation timeout) should retry. AuthenticationError and OperationFailedError
  // stay terminal (consistent with 4xx / 5xx semantics).
  if (e.name === 'XpozConnectionError' || e.name === 'OperationTimeoutError') return true;

  // Per D-25: 4xx (incl. 408, 429) explicitly NOT retried
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * withTimeout — races an async fn against a hard deadline.
 *
 * Rejects with a `[timeout]` Error if `fn` does not settle within `ms`. The
 * underlying call is NOT cancelled (most SDKs expose no abort handle) — it is
 * abandoned; the serverless function reclaims it on completion. Use this to
 * bound third-party SDK calls (Xpoz, etc.) that have no native timeout, so a
 * single hung upstream cannot stall a whole `Promise.all` fan-out.
 *
 * Pair with the adapter's existing try/catch: a timeout rejection then
 * degrades to the adapter's empty-result fallback exactly like any other
 * upstream failure, and `withBreaker` records it so repeated hangs trip the
 * breaker.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[timeout] ${label} exceeded ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * withRetry — wraps an async fn with classified retries + exponential backoff.
 *
 * @example
 *   const data = await withRetry(() => fetch(url).then(parseOrThrow));
 *
 * @example with overrides
 *   const data = await withRetry(() => doFetch(), { maxAttempts: 5, baseDelayMs: 200 });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 100;
  const jitter = opts.jitter ?? true;
  const retryable = opts.isRetryable ?? isRetryableError;

  let lastErr: unknown;
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Last attempt or non-retryable ⇒ throw immediately
      if (attempt === max - 1 || !retryable(err)) throw err;
      const exp = base * Math.pow(2, attempt);
      // Full jitter: delay ∈ [exp/2, exp]
      const wait = jitter ? exp * (0.5 + Math.random() * 0.5) : exp;
      await delay(wait);
    }
  }
  // Unreachable — loop either returns or throws — but keeps TS happy.
  throw lastErr;
}
