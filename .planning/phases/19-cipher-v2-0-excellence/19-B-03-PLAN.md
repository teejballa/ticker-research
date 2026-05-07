---
phase: 19
plan: 19-B-03
wave: B
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-B-01, 19-B-02]
files_modified:
  - src/lib/data/adapters/tiingo.ts
  - tests/lib/data/adapters/tiingo.test.ts
  - .env.example
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "fetchTiingoQuote(ticker) returns MarketDataSection-compatible shape OR null on error"
    - "fetchTiingoFundamentals(ticker) returns FundamentalsSection-compatible shape OR null"
    - "Both wrapped in cached() with TTL_SECONDS.quote (5min) / TTL_SECONDS.fundamentals (24h)"
    - "Both wrapped in withRetry({maxAttempts:3, baseDelayMs:100})"
    - "TIINGO_API_KEY missing → adapter returns null (graceful degrade per D-32 fallback)"
    - "API key NEVER logged (T-19-B-03 mitigation)"
    - "Mocked HTTP unit tests + 1 live integration test (skipped by default, runs with RUN_LIVE_INTEGRATION=true)"
  artifacts:
    - path: "src/lib/data/adapters/tiingo.ts"
      provides: "fetchTiingoQuote + fetchTiingoFundamentals"
      exports: ["fetchTiingoQuote", "fetchTiingoFundamentals"]
    - path: "tests/lib/data/adapters/tiingo.test.ts"
      provides: "Mocked HTTP + live integration test"
  key_links:
    - from: "src/lib/data/adapters/tiingo.ts"
      to: "src/lib/data/cache/upstash.ts cached"
      via: "wraps doFetchTiingo with cached + withRetry"
      pattern: "cached\\(CACHE_KEYS\\."
---

# Plan 19-B-03: Tiingo adapter (point-in-time fundamentals + EOD)

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Land adapter (flag-off; not yet wired into source-package.ts) → tests green → commit. Adapter is dormant primitive used by 19-B-06 merge precedence reorder.

## Hard Cleanup Gate (Definition of Done)

1. (N/A — primitive only) 2-4. (N/A) 5. `npm test` green; live integration smoke test against Tiingo sandbox

</universal_preamble>

<objective>
Per D-26, deliver the Tiingo adapter ($30/mo) — point-in-time fundamentals + EOD market data. Adapter is dormant until 19-B-06 wires it into source-package.ts merge ladder. Cached + retry-wrapped per RESEARCH Pattern 2.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md
@src/lib/data/yahoo.ts
@src/lib/data/cache/upstash.ts

<interfaces>
```typescript
// Match existing MarketDataSection / FundamentalsSection shapes from src/lib/data/types.ts
export async function fetchTiingoQuote(ticker: string): Promise<MarketDataSection | null>;
export async function fetchTiingoFundamentals(ticker: string): Promise<FundamentalsSection | null>;

// Returns null when TIINGO_API_KEY missing OR API errors after retry exhaustion
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-B-03-01 | Information Disclosure | API key in logs | mitigate | Token attached as Bearer header; never interpolated into URL strings; error logging strips Authorization headers via wrapper |
| T-19-B-03-02 | DoS | Tiingo rate limit | mitigate | withRetry only retries 5xx + network (not 429); cache 5min/24h reduces call frequency |

</threat_model>

<tasks>

<task type="auto" id="19-B-03-01">
  <name>Task 1: Add TIINGO_API_KEY env + read existing data types</name>
  <read_first>
    - src/lib/data/yahoo.ts (existing adapter shape — MarketDataSection/FundamentalsSection signatures)
    - src/lib/data/types.ts (or wherever MarketDataSection is declared)
    - https://www.tiingo.com/documentation/end-of-day (executor reads at impl time; RESEARCH §Sources Tertiary line 998 flags this)
  </read_first>
  <action>
    Append to `.env.example`:
    ```
    # Phase 19-B-03 — Tiingo (point-in-time fundamentals + EOD; $30/mo)
    TIINGO_API_KEY=
    ```

    Read existing `MarketDataSection` and `FundamentalsSection` type definitions from `src/lib/data/types.ts` (or wherever they live). The Tiingo adapter MUST output these exact shapes so the merge ladder in 19-B-06 can use them with the existing field-level merge.
  </action>
  <acceptance_criteria>
    - `grep -q "TIINGO_API_KEY" .env.example`
  </acceptance_criteria>
  <automated>grep -q "TIINGO_API_KEY" .env.example</automated>
  <done>Env documented; existing types audited</done>
</task>

<task type="auto" tdd="true" id="19-B-03-02">
  <name>Task 2: Write tests/lib/data/adapters/tiingo.test.ts</name>
  <read_first>
    - tests/lib/data/cache/upstash.test.ts (mocking pattern reference)
    - src/lib/data/yahoo.ts (existing adapter test reference if any)
  </read_first>
  <behavior>
    - Test 1: `returns null when TIINGO_API_KEY missing`
    - Test 2: `fetchTiingoQuote returns MarketDataSection-shaped object on success` — vi.fn fetch returns Tiingo JSON; assert returned object has `last_price`, `volume`, `previous_close` fields
    - Test 3: `fetchTiingoFundamentals returns FundamentalsSection-shaped object on success` — assert `pe_ratio`, `eps`, `revenue`, `market_cap` populated where Tiingo provides
    - Test 4: `falls through to Redis cache on second call` — first call hits API, second call hits cache (verified via vi.fn call count = 1)
    - Test 5: `retries 5xx error then succeeds`
    - Test 6: `does NOT retry 401 — surfaces immediately as null`
    - Test 7: `API key NEVER appears in any logged string` — spy on console.log/error; throw mock 500; assert no log call contains the test API key value
    - Test 8: `returns null when fetch throws after maxAttempts retries`
    - Test 9 (live, skipped by default): `live API call returns valid quote for AAPL` — guarded by `process.env.RUN_LIVE_INTEGRATION === 'true'`
  </behavior>
  <action>
    Create `tests/lib/data/adapters/tiingo.test.ts`. Mock `fetch` globally. Mock `@/lib/data/cache/upstash` to expose cache hit/miss control. The "API key never logged" test uses a unique sentinel value (e.g., `TIINGO_API_KEY=tk_phase19_test_sentinel_xyz`) and asserts no console call contained that string.
  </action>
  <acceptance_criteria>
    - File exists; ≥9 tests
    - FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/adapters/tiingo.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>9 failing tests written; security test for T-19-B-03 included</done>
</task>

<task type="auto" tdd="true" id="19-B-03-03">
  <name>Task 3: Implement src/lib/data/adapters/tiingo.ts</name>
  <read_first>
    - src/lib/data/cache/upstash.ts (cached + CACHE_KEYS + TTL_SECONDS)
    - src/lib/data/retry.ts (withRetry)
    - src/lib/data/yahoo.ts (output shape reference)
    - https://www.tiingo.com/documentation/end-of-day + https://www.tiingo.com/documentation/fundamentals (executor verifies live endpoints + JSON shape)
  </read_first>
  <action>
    Create `src/lib/data/adapters/tiingo.ts`:
    ```typescript
    import { cached } from '@/lib/data/cache/upstash';
    import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';
    import { withRetry } from '@/lib/data/retry';
    import type { MarketDataSection, FundamentalsSection } from '@/lib/data/types';

    const TIINGO_BASE = 'https://api.tiingo.com';

    function getApiKey(): string | null {
      const k = process.env.TIINGO_API_KEY;
      return k && k.length > 0 ? k : null;
    }

    async function doFetchTiingoQuote(ticker: string): Promise<MarketDataSection | null> {
      const key = getApiKey();
      if (!key) return null;
      const url = `${TIINGO_BASE}/iex/${ticker}`;
      const res = await fetch(url, {
        headers: { Authorization: `Token ${key}` },
      });
      if (!res.ok) {
        const err = new Error(`tiingo quote ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      const json = await res.json() as Array<{ last: number; tngoLast: number; prevClose: number; volume: number; ... }>;
      // Verify shape against live Tiingo response at impl time; map to MarketDataSection
      // Per RESEARCH "Tertiary confidence" — implementer MUST verify exact field names live
      return {
        last_price: json[0]?.last ?? json[0]?.tngoLast ?? null,
        previous_close: json[0]?.prevClose ?? null,
        volume: json[0]?.volume ?? null,
        // ... per MarketDataSection shape
      };
    }

    async function doFetchTiingoFundamentals(ticker: string): Promise<FundamentalsSection | null> {
      const key = getApiKey();
      if (!key) return null;
      const url = `${TIINGO_BASE}/tiingo/fundamentals/${ticker}/statements`;
      const res = await fetch(url, { headers: { Authorization: `Token ${key}` } });
      if (!res.ok) {
        const err = new Error(`tiingo fundamentals ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      const json = await res.json();
      // Map to FundamentalsSection — verify live response shape
      return {
        pe_ratio: json?.pe ?? null,
        eps: json?.eps ?? null,
        revenue: json?.revenue ?? null,
        market_cap: json?.marketCap ?? null,
      };
    }

    export async function fetchTiingoQuote(ticker: string): Promise<MarketDataSection | null> {
      try {
        return await cached(
          CACHE_KEYS.quote(ticker) + ':tiingo',
          () => withRetry(() => doFetchTiingoQuote(ticker), { maxAttempts: 3, baseDelayMs: 100 }),
          { ttlSeconds: TTL_SECONDS.quote },
        );
      } catch (err) {
        // SECURITY: NEVER log API key. err.message may contain status; safe to log.
        console.warn(`[tiingo] quote(${ticker}) failed:`, err instanceof Error ? err.message : err);
        return null;
      }
    }

    export async function fetchTiingoFundamentals(ticker: string): Promise<FundamentalsSection | null> {
      try {
        return await cached(
          CACHE_KEYS.fundamentals(ticker) + ':tiingo',
          () => withRetry(() => doFetchTiingoFundamentals(ticker), { maxAttempts: 3, baseDelayMs: 100 }),
          { ttlSeconds: TTL_SECONDS.fundamentals },
        );
      } catch (err) {
        console.warn(`[tiingo] fundamentals(${ticker}) failed:`, err instanceof Error ? err.message : err);
        return null;
      }
    }
    ```

    NOTE TO EXECUTOR: Per RESEARCH §Sources Tertiary, the live Tiingo JSON shape needs verification at impl time. Open https://www.tiingo.com/documentation/end-of-day with valid TIINGO_API_KEY, run `curl -H "Authorization: Token $TIINGO_API_KEY" https://api.tiingo.com/iex/AAPL` and copy actual response shape into the mapping code.
  </action>
  <acceptance_criteria>
    - All 9 tests pass (live test only when RUN_LIVE_INTEGRATION=true)
    - `grep -q "Authorization.*Token" src/lib/data/adapters/tiingo.ts`
    - `grep -q "console.warn\|console.log" src/lib/data/adapters/tiingo.ts | xargs -I{} grep -L "TIINGO_API_KEY\|process.env.TIINGO" {}` — token never logged
    - `grep -q "cached\(.*tiingo" src/lib/data/adapters/tiingo.ts`
    - `grep -q "withRetry" src/lib/data/adapters/tiingo.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/adapters/tiingo.test.ts</automated>
  <done>Tiingo adapter implemented + tested; API key safety verified</done>
</task>

<task type="auto" id="19-B-03-04">
  <name>Task 4: Commit</name>
  <action>
    Commit:
    ```
    feat(19-b-03): Tiingo adapter (point-in-time fundamentals + EOD)

    fetchTiingoQuote + fetchTiingoFundamentals — both cached (5min/24h TTL)
    and retry-wrapped (5xx + network only). API key never logged.

    Adapter is dormant primitive — wired into source-package.ts merge ladder
    by Plan 19-B-06. Per D-32, Yahoo/Finnhub/Polygon stay as fallbacks.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-b-03)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-b-03"</automated>
  <done>Tiingo adapter committed</done>
</task>

</tasks>

<verification>
- [ ] 9 unit tests pass; security test for API key non-leak passes
- [ ] Adapter outputs MarketDataSection / FundamentalsSection shapes
- [ ] cached + withRetry wrappers verified
- [ ] API key never logged
</verification>

<success_criteria>
1. fetchTiingoQuote/Fundamentals callable; null on missing key or after retries
2. Plan 19-B-06 can use these as primary tier in merge ladder
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-B-03-SUMMARY.md`.
</output>
