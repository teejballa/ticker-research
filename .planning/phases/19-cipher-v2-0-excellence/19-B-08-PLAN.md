---
phase: 19
plan: 19-B-08
wave: B
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-B-06, 19-B-07]
files_modified:
  - shadow-reports/19-B-08.json
  - .planning/phases/19-cipher-v2-0-excellence/19-B-08-SUMMARY.md
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "All Wave B FEATURE_* flags fully graduated (off→shadow→on→removed) per D-09 lifecycle"
    - "Yahoo / Finnhub / Polygon / Anthropic-search adapter files preserved in tree (D-32)"
    - "scripts/model-card-grep-patterns.json updated with Wave B pre-cutover patterns"
    - "Wave B success criteria verified: ≥40% latency drop, ≥80% anthropic-search call drop"
    - "shadow-reports/19-B-08.json verdict PASS with full Wave B summary metrics"
  artifacts:
    - path: "shadow-reports/19-B-08.json"
      provides: "Wave B rollout verdict — composite of B-06 + B-07 metrics"
    - path: ".planning/phases/19-cipher-v2-0-excellence/19-B-08-SUMMARY.md"
      provides: "Wave B done documentation"
  key_links:
    - from: "scripts/model-card-grep-patterns.json"
      to: "model-card-status grep gate"
      via: "Wave B-registered patterns absent post-cutover"
      pattern: "registered_by_plan.*19-B-"
---

# Plan 19-B-08: Feature flag rollout + dual-write verification (process driving plan)

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

This plan is **100% process** — no new code. The agent (Claude) drives the rollout coordination for B-06 and B-07 to completion as a single Wave B "done" gate.

## Hard Cleanup Gate (Definition of Done)

1. All Wave B shadow verdicts PASS (B-06, B-07 individually have their own verdicts)
2. Cutover PRs merged for all Wave B plans
3. 7d post-cutover with zero RollbackLog entries for all Wave B flags
4. All Wave B flag-removal PRs merged: FEATURE_TIINGO_PRIMARY, FEATURE_TWELVEDATA_PRIMARY, FEATURE_EXA_PRIMARY, FEATURE_DATA_CACHE all absent from features.ts
5. `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run model-card-status` (partial — Wave A/C not yet done) all green

</universal_preamble>

<objective>
Per D-31, drive the rollout sequence for Wave B end-to-end as the wave's "done" coordinator. This plan is process-only: no new code is written. It tracks B-06 (merge precedence) and B-07 (Runtime Cache) shadow lifecycles to completion, registers grep patterns in model-card-grep-patterns.json, and produces the Wave B SUMMARY.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@.planning/phases/19-cipher-v2-0-excellence/19-B-06-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-B-07-SUMMARY.md

</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-B-08-01 | Business Logic | rollout coordination drift — B-06 cutover before B-07 ready | mitigate | Sequence: B-06 must complete before B-07 begins shadow (B-07 caches the new merged result, so old merge would cache stale baseline). This plan enforces sequential gate: B-07 shadow flip only after B-06 verdict PASS |
| T-19-B-08-02 | Tampering | yahoo/finnhub/polygon/anthropic-search files accidentally deleted during cutover | mitigate | This plan's verification grep-checks each fallback adapter file exists post-Wave-B; CI rule blocks deletion of these files |

</threat_model>

<tasks>

<task type="auto" id="19-B-08-01">
  <name>Task 1: Verify B-06 verdict PASS before B-07 shadow flip</name>
  <read_first>
    - shadow-reports/19-B-06.json
  </read_first>
  <action>
    Read `shadow-reports/19-B-06.json`. If `verdict.result !== 'PASS'`, STOP. File a blocker plan to address B-06 failure before continuing.

    If PASS:
    - Confirm cutover PR for 19-B-06 merged (`git log --oneline | grep "19-b-06.*cutover"`)
    - Confirm 7d post-cutover with zero RollbackLog entries (`SELECT count(*) FROM "RollbackLog" WHERE feature_flag LIKE 'FEATURE_%PRIMARY%' AND created_at > now() - interval '7 days'` returns 0)
    - Confirm flag-removal PR merged (3 flags absent from features.ts)
    - Then green-light B-07 shadow flip
  </action>
  <acceptance_criteria>
    - `grep -q '"PASS"' shadow-reports/19-B-06.json`
    - `! grep -q "tiingo_primary\|twelvedata_primary\|exa_primary" src/lib/features.ts` (3 flags removed)
  </acceptance_criteria>
  <automated>test -f shadow-reports/19-B-06.json && grep -q '"PASS"' shadow-reports/19-B-06.json</automated>
  <done>B-06 fully complete; B-07 may proceed</done>
</task>

<task type="auto" id="19-B-08-02">
  <name>Task 2: Verify B-07 verdict PASS + cleanup complete</name>
  <read_first>
    - shadow-reports/19-B-07.json
  </read_first>
  <action>
    Same verification as Task 1 but for 19-B-07. Confirm `data_cache` flag removed, cutover merged, 7d hatch clean.
  </action>
  <acceptance_criteria>
    - `grep -q '"PASS"' shadow-reports/19-B-07.json`
    - `! grep -q "data_cache" src/lib/features.ts`
  </acceptance_criteria>
  <automated>test -f shadow-reports/19-B-07.json && grep -q '"PASS"' shadow-reports/19-B-07.json</automated>
  <done>B-07 fully complete</done>
</task>

<task type="auto" id="19-B-08-03">
  <name>Task 3: Verify fallback adapter files preserved (D-32 enforcement)</name>
  <read_first>
    - src/lib/data/yahoo.ts
    - src/lib/data/finnhub.ts
    - src/lib/data/polygon.ts
    - src/lib/data/anthropic-search.ts
  </read_first>
  <action>
    Verify all 4 fallback adapter files still exist:
    ```bash
    test -f src/lib/data/yahoo.ts && \
    test -f src/lib/data/finnhub.ts && \
    test -f src/lib/data/polygon.ts && \
    test -f src/lib/data/anthropic-search.ts
    ```

    Verify they're still imported by source-package.ts (used in fallback ladder rungs):
    ```bash
    grep -E "yahoo|finnhub|polygon|anthropic-search|anthropicSearch" src/lib/data/source-package.ts
    ```

    If any missing or unimported → FAIL this plan; recover by reverting the over-aggressive deletion.
  </action>
  <acceptance_criteria>
    - All 4 adapter files exist
    - All 4 still referenced from source-package.ts (as fallback rungs)
  </acceptance_criteria>
  <automated>test -f src/lib/data/yahoo.ts && test -f src/lib/data/finnhub.ts && test -f src/lib/data/polygon.ts && test -f src/lib/data/anthropic-search.ts && grep -q "yahoo\|finnhub\|polygon" src/lib/data/source-package.ts</automated>
  <done>D-32 fallback invariant verified</done>
</task>

<task type="auto" id="19-B-08-04">
  <name>Task 4: Compute composite Wave B verdict + write 19-B-08.json</name>
  <read_first>
    - shadow-reports/19-B-06.json
    - shadow-reports/19-B-07.json
  </read_first>
  <action>
    Read both verdict files. Compute composite metrics:
    - source_package_latency_p50_drop = from 19-B-06 metrics
    - source_package_latency_p95_drop
    - cache_hit_rate = from 19-B-07 metrics
    - anthropic_search_call_count_drop_pct = from 19-B-06 metrics

    Wave B PASS requires:
    - source_package_latency_p50_drop ≥ 0.40 (Wave B success criterion 1)
    - anthropic_search_call_count_drop ≥ 0.80 (criterion 2)
    - cache_hit_rate ≥ 0.70 (criterion 3)

    Write `shadow-reports/19-B-08.json`:
    ```json
    {
      "plan_id": "19-B-08",
      "verdict": { "result": "PASS|FAIL", "reasons": [...] },
      "composite_metrics": {
        "source_package_latency_p50_drop_pct": ...,
        "anthropic_search_call_count_drop_pct": ...,
        "cache_hit_rate": ...
      },
      "child_plans": ["19-B-06", "19-B-07"],
      "fallback_adapters_preserved": ["yahoo.ts", "finnhub.ts", "polygon.ts", "anthropic-search.ts"],
      "timestamp": "<iso>"
    }
    ```
  </action>
  <acceptance_criteria>
    - File `shadow-reports/19-B-08.json` exists
    - Contains all 3 Wave B success metrics
    - `grep -q '"PASS"' shadow-reports/19-B-08.json`
  </acceptance_criteria>
  <automated>test -f shadow-reports/19-B-08.json && grep -q "fallback_adapters_preserved" shadow-reports/19-B-08.json</automated>
  <done>Composite Wave B verdict recorded</done>
</task>

<task type="auto" id="19-B-08-05">
  <name>Task 5: Run model-card-status partial check + write Wave B SUMMARY</name>
  <action>
    Run `npm run model-card-status`. Expected: still FAIL (Wave A 19-A-07 + Wave C plans incomplete) BUT specific checks now pass:
    - flag-removed-tiingo_primary: ok=true
    - flag-removed-twelvedata_primary: ok=true
    - flag-removed-exa_primary: ok=true
    - flag-removed-data_cache: ok=true

    Write `.planning/phases/19-cipher-v2-0-excellence/19-B-08-SUMMARY.md`:
    - Wave B success metrics (latency drop, anthropic-search call drop, cache hit rate)
    - 4 fallback adapters preserved
    - 4 flags removed from features.ts
    - Composite verdict PASS
    - Reference to child plan SUMMARYs
  </action>
  <acceptance_criteria>
    - `.planning/phases/19-cipher-v2-0-excellence/19-B-08-SUMMARY.md` exists
    - `npm run model-card-status 2>&1 | grep -E "tiingo_primary|twelvedata_primary|exa_primary|data_cache" | grep -c "ok=true\|✓"` returns ≥4 (or alternative passing indicator)
  </acceptance_criteria>
  <automated>test -f .planning/phases/19-cipher-v2-0-excellence/19-B-08-SUMMARY.md</automated>
  <done>Wave B SUMMARY committed; partial model-card-status confirms 4 flags removed</done>
</task>

</tasks>

<verification>
- [ ] All Wave B verdicts PASS
- [ ] All Wave B flags removed from features.ts
- [ ] All 4 fallback adapter files preserved
- [ ] Composite Wave B success metrics: ≥40% latency drop, ≥80% anthropic-search drop, ≥70% cache hit rate
- [ ] Wave B SUMMARY written
</verification>

<success_criteria>
1. Wave B fully complete; data layer modernization shipped
2. Yahoo/Finnhub/Polygon/Anthropic-search retained as fallbacks
3. Cost envelope: Tiingo $30 + Twelve Data $29 + Exa $5 + Upstash $5 = $69/mo (within D-49 budget)
4. Net savings: ~$200/mo Anthropic-search burn → ~$5/mo Exa, gain caching + retries
</success_criteria>

<output>
Update `.planning/phases/19-cipher-v2-0-excellence/19-B-08-SUMMARY.md` with composite metrics + child plan references + Wave B done declaration.
</output>
