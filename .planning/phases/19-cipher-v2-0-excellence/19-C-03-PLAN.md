---
phase: 19
plan: 19-C-03
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04]
files_modified:
  - src/lib/data/stocktwits.ts
  - tests/lib/data/stocktwits.reputation.test.ts
  - tests/integration/stocktwits-reputation.shadow.live.test.ts
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "stocktwits.ts gains a reputation-weighted aggregation mode"
    - "Score formula: Σ(message_sentiment × user_reputation) / Σ(user_reputation) per D-35"
    - "User reputation derived from follower count + post history; cached per user 24h"
    - "Old naive count mode preserved when FEATURE_REPUTATION_WEIGHTED_STOCKTWITS=off"
    - "Shadow A/B verdict on Brier of resolved tickers (RESEARCH per-path metric: weighted Brier ≤ naive Brier)"
  artifacts:
    - path: "src/lib/data/stocktwits.ts"
      provides: "reputation-weighted mode added behind flag (additive)"
      contains: "reputation_weight"
  key_links:
    - from: "src/lib/data/stocktwits.ts"
      to: "stocktwits user-info endpoint + Upstash cache"
      via: "cached(`user:${id}:reputation`, fetcher, { ttlSeconds: 86400 })"
      pattern: "reputation_weight"
---

# Plan 19-C-03: Reputation-weighted StockTwits aggregation

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate
Same pattern: shadow → verdict → cutover → 7d hatch → flag removal. Per D-35.

## Hard Cleanup Gate
1. shadow-reports/19-C-03.json PASS — weighted Brier ≤ naive Brier on resolved tickers
2. Cutover PR: naive count code path removed from primary; reputation-weighted is canonical
3. 7d clean hatch
4. FEATURE_REPUTATION_WEIGHTED_STOCKTWITS removed
5. Full suite green

</universal_preamble>

<objective>
Per D-35, replace naive count-of-bullish-vs-bearish StockTwits aggregation with reputation-weighted score: `Σ(message_sentiment × user_reputation) / Σ(user_reputation)`. Reputation = function of follower count + post history; cached per user 24h.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@src/lib/data/stocktwits.ts
@src/lib/data/cache/upstash.ts

<interfaces>
```typescript
// Existing public API in stocktwits.ts (preserved):
export async function fetchStocktwitsSentiment(ticker: string): Promise<StocktwitsSentiment>;

// Internal new helper added (additive, behind flag):
function reputationWeight(user: StocktwitsUser): number;
async function reputationWeightedSentiment(messages: StocktwitsMessage[]): Promise<number>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-03-01 | Tampering | extreme reputation users skew score | mitigate | Cap reputation at percentile-95 of group (winsorize); test with synthetic edge cases |
| T-19-C-03-02 | DoS | per-user API call burns rate limit | mitigate | Cache per-user reputation 24h via cached() — same user reused across messages within 24h |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-C-03-01">
  <name>Task 1: Write tests/lib/data/stocktwits.reputation.test.ts</name>
  <read_first>
    - src/lib/data/stocktwits.ts (existing aggregation function)
  </read_first>
  <behavior>
    - Test 1: `reputationWeight derives from follower_count + post_history` — pin formula (e.g., `log10(followers + 1) + log10(post_count + 1)`)
    - Test 2: `reputationWeight winsorized at percentile-95 of group`
    - Test 3: `reputationWeightedSentiment formula: Σ(s_i × r_i) / Σ(r_i)`
    - Test 4: `falls back to naive count when all users have null reputation`
    - Test 5: `single high-reputation bullish post outweighs many low-reputation bearish posts`
    - Test 6: `cache hit on second call for same user within 24h (vi.fn called once)`
    - Test 7: `cache miss after 24h TTL`
  </behavior>
  <action>
    Create `tests/lib/data/stocktwits.reputation.test.ts` with 7 tests + deterministic synthetic users.
  </action>
  <acceptance_criteria>
    - File exists; ≥7 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/stocktwits.reputation.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>7 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-03-02">
  <name>Task 2: Add reputation-weighted mode to src/lib/data/stocktwits.ts</name>
  <read_first>
    - src/lib/data/stocktwits.ts (existing public API)
    - src/lib/features.ts (FEATURE_REPUTATION_WEIGHTED_STOCKTWITS)
    - src/lib/data/cache/upstash.ts
  </read_first>
  <action>
    Edit `src/lib/data/stocktwits.ts`:
    - Add internal helpers `reputationWeight(user)` + `reputationWeightedSentiment(messages)`
    - Cache reputation per user via `cached('stocktwits:user:reputation:' + userId, fetcher, { ttlSeconds: 86_400 })`
    - In `fetchStocktwitsSentiment`, branch on `FEATURES.reputation_weighted_stocktwits_mode`:
      - 'off' → existing naive count path
      - 'shadow' → run BOTH paths via runWithShadow
      - 'on' → reputation-weighted only
    - Public API unchanged
  </action>
  <acceptance_criteria>
    - All 7 tests pass
    - `grep -q "reputationWeight\|reputation_weight" src/lib/data/stocktwits.ts`
    - `grep -q "FEATURES.reputation_weighted_stocktwits" src/lib/data/stocktwits.ts`
    - `grep -q "runWithShadow" src/lib/data/stocktwits.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/stocktwits.reputation.test.ts</automated>
  <done>7/7 GREEN; flag-gated additive mode</done>
</task>

<task type="auto" id="19-C-03-03">
  <name>Task 3: Initial commit + shadow lifecycle</name>
  <action>
    Initial commit:
    ```
    feat(19-c-03): reputation-weighted StockTwits aggregation behind shadow

    Σ(message_sentiment × user_reputation) / Σ(user_reputation) per D-35.
    Reputation cached per user 24h via Upstash.

    Default off — naive count path retained until shadow verdict PASS.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```

    Shadow lifecycle:
    a) Flip flag to shadow
    b) Drive workload (sentiment-scan cron generates ShadowComparison rows)
    c) `npm run shadow-verdict 19-C-03` — verdict requires Brier(weighted) ≤ Brier(naive) on resolved tickers
    d) PASS → cutover: remove the `if mode==='off' return naivePath()` branch from stocktwits.ts
    e) 7d hatch
    f) Flag removal
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-c-03)"
    - shadow-reports/19-C-03.json PASS (post-shadow)
    - FEATURE_REPUTATION_WEIGHTED_STOCKTWITS removed (post-7d)
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-c-03"</automated>
  <done>Reputation-weighted is canonical; naive count removed</done>
</task>

</tasks>

<verification>
- [ ] 7 unit tests pass
- [ ] Reputation cached 24h
- [ ] Shadow PASS — weighted Brier ≤ naive Brier
- [ ] Flag removed post-cutover
</verification>

<success_criteria>
StockTwits sentiment now reputation-weighted; verified Brier non-regression on resolved tickers.
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-03-SUMMARY.md`.
</output>
