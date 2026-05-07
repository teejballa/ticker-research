---
phase: 19
plan: 19-B-02
wave: B
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04]
files_modified:
  - src/lib/data/retry.ts
  - tests/lib/data/retry.test.ts
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "withRetry retries 5xx + network errors only (NOT 4xx per D-25)"
    - "withRetry: 3 attempts max, 100ms base exponential backoff"
    - "401/403/404/429 NOT retried — surface immediately"
    - "5xx (500/502/503/504) retried with exponential backoff"
    - "Network errors (fetch throws ECONNREFUSED, ENOTFOUND, ETIMEDOUT) retried"
    - "After max attempts, throws the last error"
  artifacts:
    - path: "src/lib/data/retry.ts"
      provides: "withRetry<T>() generic retry wrapper"
      exports: ["withRetry", "isRetryableError", "type RetryOptions"]
    - path: "tests/lib/data/retry.test.ts"
      provides: "Tests for backoff timing, max attempts, retryable classification"
  key_links:
    - from: "src/lib/data/retry.ts"
      to: "isRetryableError(err)"
      via: "internal classification"
      pattern: "isRetryableError"
---

# Plan 19-B-02: Retry + exponential backoff wrapper

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Pure-function wrapper; no shadow needed. Adapters in B-03/04/05 use this wrapper around their fetch calls.

## Hard Cleanup Gate (Definition of Done)

1. (N/A) 2. (N/A) 3. (N/A) 4. (N/A) 5. `npm test` green

</universal_preamble>

<objective>
Per D-25, deliver `withRetry(fn, opts)` — 3 attempts, 100ms base exponential backoff, retries 5xx + network only (NOT 4xx). Misclassifying 401 as retryable burns rate limit; misclassifying 500 as terminal loses recoverable requests (per RESEARCH "Don't Hand-Roll").
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md

<interfaces>
```typescript
export interface RetryOptions {
  maxAttempts?: number;     // default 3
  baseDelayMs?: number;     // default 100
  jitter?: boolean;         // default true
  isRetryable?: (err: unknown) => boolean; // override default classification
}

export function isRetryableError(err: unknown): boolean;

export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-B-02-01 | Tampering | misclassified 4xx burns rate limit | mitigate | isRetryableError checks status code: 4xx (except 408 Request Timeout, 429 Too Many Requests deliberately NOT retried per CONTEXT D-25) → false; 5xx → true; network error sentinel codes → true |
| T-19-B-02-02 | DoS | exponential backoff thunders | mitigate | jitter=true by default (full jitter per AWS architecture blog); max 3 attempts cap |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-B-02-01">
  <name>Task 1: Write tests/lib/data/retry.test.ts (RED)</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md (D-25)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (Don't Hand-Roll table — retry classification)
  </read_first>
  <behavior>
    - Test 1: `succeeds on first attempt — returns value, fn called once`
    - Test 2: `retries on 500 status error — fn called 2x then succeeds`
    - Test 3: `retries on network error (ECONNREFUSED) — fn called 2x`
    - Test 4: `does NOT retry on 401 — fn called once, throws`
    - Test 5: `does NOT retry on 404 — fn called once, throws`
    - Test 6: `does NOT retry on 429 — fn called once, throws (per D-25, 4xx not retried)`
    - Test 7: `retries up to maxAttempts=3 then throws last error`
    - Test 8: `exponential backoff: 100ms, 200ms (verify via vi.useFakeTimers)`
    - Test 9: `jitter randomizes delays when opts.jitter=true (verify timing within ±50%)`
    - Test 10: `custom isRetryable override works`
  </behavior>
  <action>
    Create `tests/lib/data/retry.test.ts` with 10 tests. Use `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for timing. Mock fetch errors as `Object.assign(new Error('5xx'), { status: 500 })` for status-bearing errors and as `Object.assign(new Error('network'), { code: 'ECONNREFUSED' })` for network sentinels.
  </action>
  <acceptance_criteria>
    - File exists; ≥10 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/retry.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>10 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-B-02-02">
  <name>Task 2: Implement src/lib/data/retry.ts</name>
  <read_first>
    - tests/lib/data/retry.test.ts
  </read_first>
  <action>
    Create `src/lib/data/retry.ts`:
    ```typescript
    export interface RetryOptions {
      maxAttempts?: number;
      baseDelayMs?: number;
      jitter?: boolean;
      isRetryable?: (err: unknown) => boolean;
    }

    const NETWORK_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);

    export function isRetryableError(err: unknown): boolean {
      if (err == null) return false;
      const e = err as { status?: number; code?: string; cause?: { code?: string } };
      // Network errors (no HTTP status)
      const code = e.code ?? e.cause?.code;
      if (code && NETWORK_ERROR_CODES.has(code)) return true;
      // HTTP 5xx (502, 503, 504, etc.)
      if (typeof e.status === 'number' && e.status >= 500 && e.status < 600) return true;
      // Per CONTEXT D-25: NOT 4xx — including 408, 429
      return false;
    }

    function delay(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

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
          if (attempt === max - 1 || !retryable(err)) throw err;
          const exp = base * Math.pow(2, attempt);
          const wait = jitter ? exp * (0.5 + Math.random() * 0.5) : exp;
          await delay(wait);
        }
      }
      throw lastErr;
    }
    ```
  </action>
  <acceptance_criteria>
    - All 10 tests pass
    - `grep -q "isRetryableError" src/lib/data/retry.ts`
    - `grep -q "NETWORK_ERROR_CODES" src/lib/data/retry.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/retry.test.ts</automated>
  <done>10/10 GREEN; classification correct per D-25</done>
</task>

<task type="auto" id="19-B-02-03">
  <name>Task 3: Commit</name>
  <action>
    Commit:
    ```
    feat(19-b-02): retry + exponential backoff wrapper (5xx + network only)

    withRetry(fn, opts) — default 3 attempts, 100ms base, full jitter.
    isRetryableError classifies: 5xx + network sentinels yes, 4xx (incl 401/429) no.

    Foundation for Wave B adapters (Tiingo, Twelve Data, Exa).

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-b-02)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-b-02"</automated>
  <done>Retry primitive committed</done>
</task>

</tasks>

<verification>
- [ ] 10 unit tests pass
- [ ] 4xx never retried; 5xx + network always retried
- [ ] Exponential backoff with jitter
</verification>

<success_criteria>
Wave B adapters can wrap their fetch calls in `withRetry(() => doFetch(), { maxAttempts: 3, baseDelayMs: 100 })`.
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-B-02-SUMMARY.md`.
</output>
