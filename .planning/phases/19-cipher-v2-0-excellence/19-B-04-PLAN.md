---
phase: 19
plan: 19-B-04
wave: B
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-B-01, 19-B-02]
files_modified:
  - src/lib/data/adapters/twelve-data.ts
  - tests/lib/data/adapters/twelve-data.test.ts
  - .env.example
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "fetchTwelveDataFundamentals(ticker) returns FundamentalsSection-compatible OR null"
    - "Wrapped in cached() with TTL_SECONDS.fundamentals (24h)"
    - "Wrapped in withRetry({maxAttempts:3, baseDelayMs:100})"
    - "TWELVEDATA_API_KEY missing → null (graceful degrade)"
    - "API key NEVER logged (T-19-B-04 mitigation)"
  artifacts:
    - path: "src/lib/data/adapters/twelve-data.ts"
      provides: "fetchTwelveDataFundamentals (and fetchTwelveDataQuote optional)"
      exports: ["fetchTwelveDataFundamentals"]
    - path: "tests/lib/data/adapters/twelve-data.test.ts"
      provides: "Mocked HTTP tests"
  key_links:
    - from: "src/lib/data/adapters/twelve-data.ts"
      to: "src/lib/data/cache/upstash.ts cached"
      via: "cached + withRetry wrappers"
      pattern: "cached\\(CACHE_KEYS"
---

# Plan 19-B-04: Twelve Data adapter (fundamentals)

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate
Same pattern as 19-B-03 (verbatim Universal Preamble). Primitive adapter; not yet wired.

</universal_preamble>

<objective>
Per D-27, deliver Twelve Data adapter ($29/mo) — fundamentals (PE, EPS, revenue, market cap, etc.). Same shape as Tiingo adapter (MarketDataSection/FundamentalsSection compatible).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@.planning/phases/19-cipher-v2-0-excellence/19-B-03-SUMMARY.md
@src/lib/data/adapters/tiingo.ts

<interfaces>
```typescript
export async function fetchTwelveDataFundamentals(ticker: string): Promise<FundamentalsSection | null>;
export async function fetchTwelveDataQuote(ticker: string): Promise<MarketDataSection | null>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-B-04-01 | Information Disclosure | API key in logs | mitigate | Same as T-19-B-03 — token in header param `apikey`, never URL-interpolated; logs strip Authorization headers |
| T-19-B-04-02 | DoS | rate limit | mitigate | withRetry skips 429; cache 24h |

</threat_model>

<tasks>

<task type="auto" id="19-B-04-01">
  <name>Task 1: Add TWELVEDATA_API_KEY env</name>
  <action>
    Append to `.env.example`:
    ```
    # Phase 19-B-04 — Twelve Data (fundamentals; $29/mo)
    TWELVEDATA_API_KEY=
    ```
  </action>
  <acceptance_criteria>
    - `grep -q "TWELVEDATA_API_KEY" .env.example`
  </acceptance_criteria>
  <automated>grep -q "TWELVEDATA_API_KEY" .env.example</automated>
  <done>Env var documented</done>
</task>

<task type="auto" tdd="true" id="19-B-04-02">
  <name>Task 2: Write tests/lib/data/adapters/twelve-data.test.ts</name>
  <read_first>
    - tests/lib/data/adapters/tiingo.test.ts (just-written reference template)
    - https://twelvedata.com/docs (executor verifies live endpoint)
  </read_first>
  <behavior>
    Same 9 test pattern as 19-B-03 substituting twelve-data:
    - returns null when TWELVEDATA_API_KEY missing
    - fetchTwelveDataFundamentals returns FundamentalsSection on success
    - cache hit on second call
    - retries 5xx
    - skips 401/429
    - API key never appears in any logged string
    - returns null after retry exhaustion
    - live integration (skipped by default)
  </behavior>
  <action>
    Create `tests/lib/data/adapters/twelve-data.test.ts` mirroring tiingo.test.ts pattern. Twelve Data passes API key as `?apikey=...` query param (per their docs); ensure URL string is sanitized in error messages.
  </action>
  <acceptance_criteria>
    - File exists; ≥8 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/adapters/twelve-data.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>Tests written</done>
</task>

<task type="auto" tdd="true" id="19-B-04-03">
  <name>Task 3: Implement src/lib/data/adapters/twelve-data.ts</name>
  <read_first>
    - src/lib/data/adapters/tiingo.ts (parallel structure)
    - https://twelvedata.com/docs/api/fundamentals
  </read_first>
  <action>
    Create `src/lib/data/adapters/twelve-data.ts` mirroring tiingo.ts structure but with Twelve Data endpoints:
    - Base: `https://api.twelvedata.com`
    - Fundamentals: `/statistics?symbol={ticker}&apikey={key}` (verify live)
    - Quote: `/quote?symbol={ticker}&apikey={key}`

    SECURITY: Twelve Data uses `?apikey=` query param. The error logging path MUST sanitize the URL:
    ```typescript
    function sanitizeUrl(url: string): string {
      return url.replace(/apikey=[^&]+/g, 'apikey=***');
    }
    ```

    Each error log line that includes the URL must apply `sanitizeUrl(url)`.

    Same cached/withRetry wrappers as Tiingo. Cache TTL: TTL_SECONDS.fundamentals (24h).
  </action>
  <acceptance_criteria>
    - All 8 tests pass
    - `grep -q "sanitizeUrl\|apikey=\\*\\*\\*" src/lib/data/adapters/twelve-data.ts` (sanitization present)
    - `grep -q "cached.*twelve" src/lib/data/adapters/twelve-data.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/adapters/twelve-data.test.ts</automated>
  <done>8/8 GREEN; URL sanitization for query-param key</done>
</task>

<task type="auto" id="19-B-04-04">
  <name>Task 4: Commit</name>
  <action>
    Commit:
    ```
    feat(19-b-04): Twelve Data adapter (fundamentals)

    fetchTwelveDataFundamentals — cached 24h, retry-wrapped (5xx + net only).
    URL query-param API key sanitized in error logs (T-19-B-04 mitigation).

    Dormant primitive — wired by Plan 19-B-06 merge precedence.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-b-04)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-b-04"</automated>
  <done>Twelve Data adapter committed</done>
</task>

</tasks>

<verification>
- [ ] 8 unit tests pass
- [ ] API key never logged (URL sanitized)
- [ ] Cached + retry-wrapped
</verification>

<success_criteria>
fetchTwelveDataFundamentals callable; ready for 19-B-06 merge ladder.
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-B-04-SUMMARY.md`.
</output>
