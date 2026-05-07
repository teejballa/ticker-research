---
phase: 19
plan: 19-B-05
wave: B
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-B-01, 19-B-02]
files_modified:
  - src/lib/data/adapters/exa-search.ts
  - tests/lib/data/adapters/exa-search.test.ts
  - .env.example
  - package.json
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "fetchExaNews(ticker) returns news/analyst-style results compatible with anthropic-search.ts output shape"
    - "Wrapped in cached() with TTL_SECONDS.news (30min)"
    - "Wrapped in withRetry({maxAttempts:3, baseDelayMs:100})"
    - "EXA_API_KEY missing → returns null (graceful degrade per D-32)"
    - "API key NEVER logged"
    - "exa-js v2.12.1 pinned (RESEARCH-verified)"
    - "Auto-fallback to anthropic-search on Exa null/error (per RESEARCH Pitfall 7)"
  artifacts:
    - path: "src/lib/data/adapters/exa-search.ts"
      provides: "fetchExaNews + fetchExaAnalystSentiment + dual-source wrapper"
      exports: ["fetchExaNews", "fetchExaAnalystSentiment"]
    - path: "tests/lib/data/adapters/exa-search.test.ts"
      provides: "Mocked exa-js + null-fallback tests"
  key_links:
    - from: "src/lib/data/adapters/exa-search.ts"
      to: "exa-js"
      via: "Exa neural search client"
      pattern: "from 'exa-js'"
---

# Plan 19-B-05: Exa 2.0 adapter + Anthropic-search fallback wiring

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate
Same pattern as 19-B-03/04. Primitive adapter only — wired into hot path by 19-B-06.

</universal_preamble>

<objective>
Per D-28, deliver Exa 2.0 adapter (~$5/mo) — semantic news/analyst search. Replaces Anthropic-search hot path when 19-B-06 cuts over (~$200/mo → ~$5/mo savings). Per D-32 + RESEARCH Pitfall 7, anthropic-search.ts STAYS in tree as fallback for niche tickers where Exa underperforms.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@src/lib/data/anthropic-search.ts

<interfaces>
```typescript
export async function fetchExaNews(ticker: string): Promise<NewsResults | null>;
export async function fetchExaAnalystSentiment(ticker: string): Promise<AnalystResults | null>;
// Output shape MUST match anthropic-search.ts so callers can swap transparently
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-B-05-01 | Information Disclosure | API key in logs | mitigate | exa-js SDK handles auth header internally; wrapper never logs raw key |
| T-19-B-05-02 | Tampering | Exa returns lower quality on niche tickers | accept (with mitigation) | Per RESEARCH Pitfall 7: dual-source for first 30 days; auto-fallback to anthropic-search on Exa null; D-32 KEEPS anthropic-search.ts in tree |

</threat_model>

<tasks>

<task type="auto" id="19-B-05-01">
  <name>Task 1: Install exa-js@2.12.1 + add EXA_API_KEY env</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (line 153 — exa-js 2.12.1 verified 2026-04-22)
  </read_first>
  <action>
    `npm install exa-js@^2.12.1`. Append to .env.example:
    ```
    # Phase 19-B-05 — Exa 2.0 (semantic news/analyst search; ~$5/mo)
    EXA_API_KEY=
    ```
  </action>
  <acceptance_criteria>
    - `grep -q '"exa-js"' package.json`
    - `node -e "require('exa-js')"` does not throw
    - `grep -q "EXA_API_KEY" .env.example`
  </acceptance_criteria>
  <automated>node -e "require('exa-js')"</automated>
  <done>Dep + env wired</done>
</task>

<task type="auto" tdd="true" id="19-B-05-02">
  <name>Task 2: Write tests/lib/data/adapters/exa-search.test.ts</name>
  <read_first>
    - src/lib/data/anthropic-search.ts (existing output shape)
    - https://docs.exa.ai/reference/getting-started (executor verifies SDK methods + response shape)
  </read_first>
  <behavior>
    - returns null when EXA_API_KEY missing
    - fetchExaNews returns NewsResults-shaped object on success
    - response shape compatible with anthropic-search output (callers can swap)
    - retries 5xx
    - skips 401
    - cache hit on second call
    - API key never logged
    - **fallback test**: when Exa returns null → caller should use anthropic-search (this is tested at the merge ladder level in 19-B-06; here we test that the adapter cleanly returns null on error rather than throwing)
  </behavior>
  <action>
    Create `tests/lib/data/adapters/exa-search.test.ts`. Mock `exa-js` Exa class via vi.mock. Pin output shape against existing anthropic-search return type.
  </action>
  <acceptance_criteria>
    - File exists; ≥8 tests
    - FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/adapters/exa-search.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>Tests written</done>
</task>

<task type="auto" tdd="true" id="19-B-05-03">
  <name>Task 3: Implement src/lib/data/adapters/exa-search.ts</name>
  <read_first>
    - tests/lib/data/adapters/exa-search.test.ts
    - src/lib/data/anthropic-search.ts (output shape — copy interface)
    - https://docs.exa.ai/reference/searchandcontents (Exa SDK reference — executor verifies live)
  </read_first>
  <action>
    Create `src/lib/data/adapters/exa-search.ts`:
    ```typescript
    import Exa from 'exa-js';
    import { cached } from '@/lib/data/cache/upstash';
    import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';
    import { withRetry } from '@/lib/data/retry';
    // Reuse types from anthropic-search.ts so callers can swap
    import type { NewsResults, AnalystResults } from '@/lib/data/anthropic-search';

    let exaClient: Exa | null = null;
    function getClient(): Exa | null {
      if (exaClient) return exaClient;
      const key = process.env.EXA_API_KEY;
      if (!key) return null;
      exaClient = new Exa(key);
      return exaClient;
    }

    async function doFetchExaNews(ticker: string): Promise<NewsResults | null> {
      const client = getClient();
      if (!client) return null;
      const result = await client.searchAndContents(
        `${ticker} stock news earnings analyst`,
        { numResults: 10, useAutoprompt: true, type: 'neural', startPublishedDate: new Date(Date.now() - 30 * 86_400_000).toISOString() },
      );
      // Map Exa result.results to NewsResults shape (matches anthropic-search.ts output exactly)
      return {
        articles: result.results.map(r => ({
          title: r.title ?? '',
          url: r.url,
          published_at: r.publishedDate ?? null,
          summary: r.text?.slice(0, 500) ?? null,
        })),
      };
    }

    async function doFetchExaAnalyst(ticker: string): Promise<AnalystResults | null> {
      const client = getClient();
      if (!client) return null;
      const result = await client.searchAndContents(
        `${ticker} analyst recommendation price target rating`,
        { numResults: 10, useAutoprompt: true, type: 'neural' },
      );
      return {
        analyst_commentary: result.results.map(r => ({ source: r.url, text: r.text ?? '' })),
      };
    }

    export async function fetchExaNews(ticker: string): Promise<NewsResults | null> {
      try {
        return await cached(
          CACHE_KEYS.news(ticker) + ':exa',
          () => withRetry(() => doFetchExaNews(ticker), { maxAttempts: 3, baseDelayMs: 100 }),
          { ttlSeconds: TTL_SECONDS.news },
        );
      } catch (err) {
        // Per RESEARCH Pitfall 7: caller should fallback to anthropic-search on null
        console.warn(`[exa] news(${ticker}) failed:`, err instanceof Error ? err.message : err);
        return null;
      }
    }

    export async function fetchExaAnalystSentiment(ticker: string): Promise<AnalystResults | null> {
      try {
        return await cached(
          CACHE_KEYS.news(ticker) + ':exa-analyst',
          () => withRetry(() => doFetchExaAnalyst(ticker), { maxAttempts: 3, baseDelayMs: 100 }),
          { ttlSeconds: TTL_SECONDS.news },
        );
      } catch (err) {
        console.warn(`[exa] analyst(${ticker}) failed:`, err instanceof Error ? err.message : err);
        return null;
      }
    }
    ```

    NOTE TO EXECUTOR: Exa SDK method signatures may have changed since RESEARCH (2026-05-06). Use `mcp__context7__*` if available to fetch latest docs, OR `npm view exa-js@^2.12.1` and read the .d.ts file. The cited methods (`searchAndContents`, `numResults`, `useAutoprompt`) match SDK v2.12.1; verify before commit.
  </action>
  <acceptance_criteria>
    - All 8 tests pass
    - `grep -q "from 'exa-js'" src/lib/data/adapters/exa-search.ts`
    - Output types imported from anthropic-search.ts (interchangeable shape)
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/adapters/exa-search.test.ts</automated>
  <done>Exa adapter wired with anthropic-compatible output</done>
</task>

<task type="auto" id="19-B-05-04">
  <name>Task 4: Commit</name>
  <action>
    Commit:
    ```
    feat(19-b-05): Exa 2.0 adapter — neural news/analyst search

    fetchExaNews + fetchExaAnalystSentiment — output shapes interchangeable
    with anthropic-search.ts so callers swap transparently. Cached 30min,
    retry-wrapped. exa-js@2.12.1 pinned.

    Per D-32 + RESEARCH Pitfall 7: anthropic-search.ts STAYS as fallback
    for niche tickers; auto-fallback path wired by Plan 19-B-06.

    Replaces ~$200/mo Anthropic-search burn → ~$5/mo Exa.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-b-05)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-b-05"</automated>
  <done>Exa adapter committed</done>
</task>

</tasks>

<verification>
- [ ] 8 unit tests pass
- [ ] Output shape compatible with anthropic-search.ts
- [ ] API key never logged
- [ ] anthropic-search.ts NOT modified (stays as fallback per D-32)
</verification>

<success_criteria>
fetchExaNews and fetchExaAnalystSentiment ready; 19-B-06 wires fallback ladder.
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-B-05-SUMMARY.md`.
</output>
