---
phase: 19
plan: 19-C-05
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-B-01, 19-B-02]
files_modified:
  - src/lib/data/adapters/swaggystocks.ts
  - src/lib/data/adapters/apewisdom.ts
  - src/lib/data/lightweight-community-scan.ts
  - tests/lib/data/adapters/swaggystocks.test.ts
  - tests/lib/data/adapters/apewisdom.test.ts
  - tests/integration/community-supplemental.shadow.live.test.ts
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "Swaggystocks adapter — supplemental, parses public WSB chatter endpoint OR falls back to Firecrawl scrape"
    - "ApeWisdom adapter — supplemental, parses /api/v1.0/filter/{filter}/page/{n} endpoint"
    - "Both supplemental — Firecrawl REMAINS PRIMARY (D-37)"
    - "Subreddit expansion via Firecrawl: r/wallstreetbets + r/stocks + r/SecurityAnalysis + r/algotrading (D-44 absorbed into this plan)"
    - "Both adapters merged into SentimentSnapshot.community_aggregated JSONB column"
    - "Rate limit on either supplemental does NOT crash primary Firecrawl path (T-19-C-05 mitigation)"
    - "Shadow A/B verdict: with-supplemental vs Firecrawl-only — non-regression on signal strength + report quality"
  artifacts:
    - path: "src/lib/data/adapters/swaggystocks.ts"
      provides: "fetchSwaggyStocks(ticker) — supplemental"
    - path: "src/lib/data/adapters/apewisdom.ts"
      provides: "fetchApeWisdom(ticker) — supplemental"
    - path: "src/lib/data/lightweight-community-scan.ts"
      provides: "Subreddit expansion config (D-44)"
      contains: "wallstreetbets"
  key_links:
    - from: "src/lib/data/lightweight-community-scan.ts"
      to: "Firecrawl primary + Swaggystocks/ApeWisdom supplemental"
      via: "Promise.allSettled merge"
      pattern: "community_aggregated"
---

# Plan 19-C-05: Swaggystocks + ApeWisdom adapters + subreddit Firecrawl expansion

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate

Standard shadow lifecycle. Per D-37 + D-44.

</universal_preamble>

<objective>
Per D-37, deliver Swaggystocks + ApeWisdom adapters as SUPPLEMENTAL community sources (Firecrawl stays primary per user direction 2026-05-07 — "firecrawl is very reliable"). Per D-44 (absorbed into this plan), expand Firecrawl scrape coverage to r/wallstreetbets + r/stocks + r/SecurityAnalysis + r/algotrading.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@src/lib/data/lightweight-community-scan.ts
@src/lib/data/cache/upstash.ts

<interfaces>
```typescript
export async function fetchSwaggyStocks(ticker: string): Promise<CommunitySignal | null>;
export async function fetchApeWisdom(ticker: string): Promise<CommunitySignal | null>;

interface CommunitySignal {
  source: 'swaggystocks' | 'apewisdom';
  mention_count: number;
  bullish_pct: number | null;
  bearish_pct: number | null;
  trending_rank: number | null;
}
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-05-01 | DoS | rate limit poisoning crashes primary | mitigate | Both adapters return null on any error (do not throw); cached() wraps to reduce call frequency; FALLBACK to Firecrawl scrape of swaggystocks.com if API endpoint moves (per RESEARCH Assumption A5) |
| T-19-C-05-02 | Tampering | scraped Reddit/4chan content injection into LLM prompt | mitigate | community_aggregated stored as JSONB but only metadata fields used in prompt; raw_text NOT injected into Gemini prompt without sanitation; Plan 19-C-08 CoVe verifier double-checks any LLM claim against this data |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-C-05-01">
  <name>Task 1: Write tests/lib/data/adapters/{swaggystocks,apewisdom}.test.ts</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (Assumptions A4, A5 — endpoint shapes need verification)
  </read_first>
  <behavior>
    For each adapter, 6 tests:
    - returns null on missing endpoint/API key (or unreachable)
    - returns CommunitySignal-shaped object on success
    - cached on second call within TTL
    - retries 5xx
    - skips 4xx
    - rate limit error returns null without crashing primary path
  </behavior>
  <action>
    Create both test files. Mock fetch globally; provide synthetic ApeWisdom JSON shape per RESEARCH §Sources line 985.
  </action>
  <acceptance_criteria>
    - Both files exist; ≥6 tests each; FAIL RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/adapters/swaggystocks.test.ts tests/lib/data/adapters/apewisdom.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>12 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-05-02">
  <name>Task 2: Implement swaggystocks.ts + apewisdom.ts adapters</name>
  <read_first>
    - src/lib/data/adapters/tiingo.ts (pattern reference)
    - https://apewisdom.io/api/v1.0/filter/wallstreetbets (executor verifies live)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (Assumption A5 — Swaggystocks no official docs; fall back to Firecrawl scrape if needed)
  </read_first>
  <action>
    Create both adapters mirroring Tiingo pattern (cached + withRetry + null sentinel).

    `src/lib/data/adapters/apewisdom.ts`:
    - Endpoint: `https://apewisdom.io/api/v1.0/filter/all-stocks/page/1` (executor verifies)
    - Parse JSON → find ticker entry → map to `CommunitySignal`
    - No auth required

    `src/lib/data/adapters/swaggystocks.ts`:
    - First try API endpoint (executor researches at impl time)
    - On API failure or no public endpoint, fall back to Firecrawl scrape of `https://swaggystocks.com/dashboard/wsb/ticker/{ticker}` per Assumption A5 mitigation
    - Map parsed data to `CommunitySignal`

    NOTE TO EXECUTOR: per RESEARCH Assumptions A4, A5 — endpoint shapes are MEDIUM confidence and need live verification. If shapes have moved, update mappers accordingly.
  </action>
  <acceptance_criteria>
    - Both adapters exist; 12/12 tests pass
    - `grep -q "Promise.allSettled\|graceful\|catch" src/lib/data/adapters/swaggystocks.ts src/lib/data/adapters/apewisdom.ts` (degrade)
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/adapters/swaggystocks.test.ts tests/lib/data/adapters/apewisdom.test.ts</automated>
  <done>Both adapters live</done>
</task>

<task type="auto" id="19-C-05-03">
  <name>Task 3: Subreddit expansion in lightweight-community-scan.ts (D-44)</name>
  <read_first>
    - src/lib/data/lightweight-community-scan.ts (existing Firecrawl call site for community)
  </read_first>
  <action>
    Edit `src/lib/data/lightweight-community-scan.ts`:
    - Find the SUBREDDITS array (or equivalent config)
    - Extend to: `['wallstreetbets', 'stocks', 'SecurityAnalysis', 'algotrading']`
    - All scraped via existing Firecrawl call (no new adapter — D-44 says "no new adapter needed")
    - This is a tiny config edit, not behind a flag; immediate effect for next sentiment-scan cron
  </action>
  <acceptance_criteria>
    - `grep -c "wallstreetbets\|stocks\|SecurityAnalysis\|algotrading" src/lib/data/lightweight-community-scan.ts` returns ≥4
  </acceptance_criteria>
  <automated>grep -q "SecurityAnalysis" src/lib/data/lightweight-community-scan.ts && grep -q "algotrading" src/lib/data/lightweight-community-scan.ts</automated>
  <done>Subreddit list expanded per D-44</done>
</task>

<task type="auto" id="19-C-05-04">
  <name>Task 4: Wire supplemental sources into SentimentSnapshot.community_aggregated behind shadow</name>
  <read_first>
    - src/lib/data/lightweight-community-scan.ts (where Firecrawl is currently called)
    - prisma/schema.prisma (SentimentSnapshot.community_aggregated from 19-Z-02)
  </read_first>
  <action>
    Edit lightweight-community-scan.ts (or new helper):
    ```typescript
    import { fetchSwaggyStocks } from '@/lib/data/adapters/swaggystocks';
    import { fetchApeWisdom } from '@/lib/data/adapters/apewisdom';
    import { runWithShadow } from '@/lib/shadow/shadow-runner';
    import { FEATURES } from '@/lib/features';

    async function communityFirecrawlOnly(ticker: string) {
      // existing implementation
    }

    async function communityWithSupplemental(ticker: string) {
      const [firecrawl, swaggy, ape] = await Promise.allSettled([
        firecrawlScrape(ticker), fetchSwaggyStocks(ticker), fetchApeWisdom(ticker),
      ]);
      return {
        firecrawl: firecrawl.status === 'fulfilled' ? firecrawl.value : null,
        swaggystocks: swaggy.status === 'fulfilled' ? swaggy.value : null,
        apewisdom: ape.status === 'fulfilled' ? ape.value : null,
      };
    }

    export async function communityAggregated(ticker: string) {
      return runWithShadow(
        'community-supplemental',
        () => communityFirecrawlOnly(ticker),
        () => communityWithSupplemental(ticker),
        FEATURES.community_supplemental_mode,
        { ticker },
      );
    }
    ```

    SentimentSnapshot.community_aggregated populated with this object on every cron tick.
  </action>
  <acceptance_criteria>
    - `grep -q "fetchSwaggyStocks\|fetchApeWisdom" src/lib/data/lightweight-community-scan.ts`
    - `grep -q "runWithShadow.*community-supplemental" src/lib/data/lightweight-community-scan.ts`
  </acceptance_criteria>
  <automated>grep -q "community-supplemental" src/lib/data/lightweight-community-scan.ts</automated>
  <done>Supplemental sources merged behind shadow gate</done>
</task>

<task type="auto" id="19-C-05-05">
  <name>Task 5: Initial commit + shadow lifecycle</name>
  <action>
    Initial commit:
    ```
    feat(19-c-05): Swaggystocks + ApeWisdom adapters + subreddit Firecrawl expansion

    Two SUPPLEMENTAL community adapters; Firecrawl REMAINS PRIMARY per D-37
    (user direction 2026-05-07 — "firecrawl is very reliable").

    Subreddit expansion (D-44 absorbed): r/wallstreetbets + r/stocks +
    r/SecurityAnalysis + r/algotrading via existing Firecrawl path.

    Default off — shadow A/B verdict gates cutover.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```

    Shadow lifecycle: flip → drive workload → verdict (verdict requires no regression on signal strength + no rate-limit-induced primary failures) → PASS → cutover (remove off-mode branch) → 7d → flag removal.
  </action>
  <acceptance_criteria>
    - shadow-reports/19-C-05.json PASS
    - FEATURE_COMMUNITY_SUPPLEMENTAL removed post-cutover
    - Subreddit list expanded
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-c-05"</automated>
  <done>Supplemental community sources canonical; Firecrawl still primary</done>
</task>

</tasks>

<verification>
- [ ] 12 unit tests pass for both adapters
- [ ] Subreddit list expanded (4 subreddits)
- [ ] Firecrawl path NOT modified (D-37)
- [ ] Shadow PASS; flag removed
</verification>

<success_criteria>
1. Firecrawl remains primary; Swaggystocks + ApeWisdom supplemental
2. Subreddit coverage expanded
3. Rate limits on either supplemental never crash primary
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-05-SUMMARY.md`.
</output>
