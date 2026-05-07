---
phase: 19
plan: 19-C-06
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-B-01, 19-B-02]
files_modified:
  - src/lib/data/adapters/quiver.ts
  - tests/lib/data/adapters/quiver.test.ts
  - .env.example
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "fetchQuiverInsider(ticker) returns insider trade data OR null"
    - "fetchQuiverCongressional(ticker) returns congressional trade data OR null"
    - "Both opt-in: only activate when QUIVER_API_KEY env set (D-38)"
    - "When QUIVER_API_KEY missing → return null silently (no errors)"
    - "Cached + retry-wrapped per Wave B pattern"
    - "Data merged into community_aggregated alongside Swaggy/Ape (additive)"
    - "API key NEVER logged"
  artifacts:
    - path: "src/lib/data/adapters/quiver.ts"
      provides: "fetchQuiverInsider + fetchQuiverCongressional"
      exports: ["fetchQuiverInsider", "fetchQuiverCongressional"]
  key_links:
    - from: "src/lib/data/adapters/quiver.ts"
      to: "https://api.quiverquant.com (opt-in $30/mo Hobbyist)"
      via: "Bearer auth header"
      pattern: "QUIVER_API_KEY"
---

# Plan 19-C-06: Quiver adapter (insider + congressional, optional flag)

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate

Per D-38, optional opt-in flag. No shadow needed — purely additive when key set; no-op when key missing.

</universal_preamble>

<objective>
Per D-38, deliver Quiver adapter ($30/mo Hobbyist tier) — insider trade data + congressional trades. OPTIONAL — only activates when QUIVER_API_KEY env var set. No-op fallthrough otherwise. Merges into community_aggregated (additive column populated by Wave C).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@src/lib/data/adapters/tiingo.ts

<interfaces>
```typescript
export async function fetchQuiverInsider(ticker: string): Promise<QuiverInsiderData | null>;
export async function fetchQuiverCongressional(ticker: string): Promise<QuiverCongressionalData | null>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-06-01 | Information Disclosure | API key in logs | mitigate | Bearer header; never URL-interpolated |
| T-19-C-06-02 | Configuration | adapter activates without explicit opt-in | mitigate | `getApiKey()` returns null on missing/empty env; ALL paths return null when getApiKey() === null |

</threat_model>

<tasks>

<task type="auto" id="19-C-06-01">
  <name>Task 1: Add QUIVER_API_KEY env</name>
  <action>
    Append to .env.example:
    ```
    # Phase 19-C-06 — Quiver Hobbyist (insider + congressional; optional, ~$30/mo)
    # Adapter only activates when this is set. Leave blank to skip.
    QUIVER_API_KEY=
    ```
  </action>
  <acceptance_criteria>
    - `grep -q "QUIVER_API_KEY" .env.example`
  </acceptance_criteria>
  <automated>grep -q "QUIVER_API_KEY" .env.example</automated>
  <done>Env documented as opt-in</done>
</task>

<task type="auto" tdd="true" id="19-C-06-02">
  <name>Task 2: Write tests/lib/data/adapters/quiver.test.ts</name>
  <read_first>
    - tests/lib/data/adapters/tiingo.test.ts (pattern reference)
    - https://api.quiverquant.com/docs/ (executor verifies live)
  </read_first>
  <behavior>
    - returns null when QUIVER_API_KEY missing
    - fetchQuiverInsider returns InsiderData on success
    - fetchQuiverCongressional returns CongressionalData on success
    - cache hit on second call
    - retries 5xx, skips 4xx
    - API key never logged
  </behavior>
  <action>
    Create `tests/lib/data/adapters/quiver.test.ts`. Mock fetch globally.
  </action>
  <acceptance_criteria>
    - File exists; ≥6 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/adapters/quiver.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>Tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-06-03">
  <name>Task 3: Implement src/lib/data/adapters/quiver.ts</name>
  <read_first>
    - src/lib/data/adapters/tiingo.ts (parallel structure)
    - https://api.quiverquant.com/docs/ (Quiver API reference — executor verifies)
  </read_first>
  <action>
    Create `src/lib/data/adapters/quiver.ts` mirroring Tiingo pattern. Endpoints:
    - Insider: `https://api.quiverquant.com/beta/historical/insiders/{ticker}` (verify live)
    - Congressional: `https://api.quiverquant.com/beta/historical/congresstrading/{ticker}`

    Auth: `Authorization: Bearer ${QUIVER_API_KEY}` header.

    Cache TTL: 24h for insider/congressional (slow-moving data).
  </action>
  <acceptance_criteria>
    - All 6 tests pass
    - `grep -q "Bearer.*QUIVER_API_KEY\|QUIVER_API_KEY" src/lib/data/adapters/quiver.ts`
    - No-op when key missing
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/adapters/quiver.test.ts</automated>
  <done>Quiver adapter live + opt-in</done>
</task>

<task type="auto" id="19-C-06-04">
  <name>Task 4: Wire into community_aggregated (additive — no flag, no-op when key missing)</name>
  <read_first>
    - src/lib/data/lightweight-community-scan.ts (or wherever community_aggregated is built — see 19-C-05)
  </read_first>
  <action>
    In the `communityWithSupplemental` function (added in 19-C-05), add:
    ```typescript
    const [firecrawl, swaggy, ape, quiverInsider, quiverCongress] = await Promise.allSettled([
      firecrawlScrape(ticker), fetchSwaggyStocks(ticker), fetchApeWisdom(ticker),
      fetchQuiverInsider(ticker), fetchQuiverCongressional(ticker),
    ]);
    return {
      firecrawl, swaggystocks: swaggy, apewisdom: ape,
      quiver_insider: quiverInsider.status === 'fulfilled' ? quiverInsider.value : null,
      quiver_congressional: quiverCongress.status === 'fulfilled' ? quiverCongress.value : null,
    };
    ```

    Per D-38, no flag wrapper — opt-in is via env presence. No shadow needed because additive: rows that previously had no Quiver data continue to have no Quiver data; rows that have it get it populated.
  </action>
  <acceptance_criteria>
    - `grep -q "fetchQuiverInsider\|fetchQuiverCongressional" src/lib/data/lightweight-community-scan.ts`
    - `grep -q "quiver_insider\|quiver_congressional" src/lib/data/lightweight-community-scan.ts`
  </acceptance_criteria>
  <automated>grep -q "fetchQuiverInsider" src/lib/data/lightweight-community-scan.ts</automated>
  <done>Quiver wired as opt-in supplemental</done>
</task>

<task type="auto" id="19-C-06-05">
  <name>Task 5: Commit</name>
  <action>
    Commit:
    ```
    feat(19-c-06): Quiver Hobbyist adapter (insider + congressional, optional)

    Per D-38: opt-in via QUIVER_API_KEY env presence. No-op when missing.
    Adds quiver_insider + quiver_congressional to community_aggregated JSONB.

    No shadow needed — purely additive. Hobbyist tier ~$30/mo.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-c-06)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-c-06"</automated>
  <done>Quiver opt-in committed</done>
</task>

</tasks>

<verification>
- [ ] 6 unit tests pass
- [ ] No-op when QUIVER_API_KEY missing
- [ ] API key never logged
- [ ] Merged into community_aggregated additively
</verification>

<success_criteria>
Quiver insider/congressional data available when key set; no-op fallthrough when missing.
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-06-SUMMARY.md`.
</output>
