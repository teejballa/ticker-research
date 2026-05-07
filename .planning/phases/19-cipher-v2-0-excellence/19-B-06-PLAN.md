---
phase: 19
plan: 19-B-06
wave: B
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-B-01, 19-B-02, 19-B-03, 19-B-04, 19-B-05]
files_modified:
  - src/lib/data/source-package.ts
  - src/lib/data/merge.ts
  - tests/integration/source-package.merge.shadow.live.test.ts
  - tests/lib/data/source-package.test.ts
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "New ladder when FEATURE_TIINGO_PRIMARY/TWELVEDATA_PRIMARY/EXA_PRIMARY all on: tiingo → twelvedata → yahoo → finnhub → polygon, then exa → anthropic-search"
    - "Old ladder when flags off (no behavior change for current users)"
    - "FieldOrigin union extended: 'tiingo' | 'twelvedata' | 'exa' added (additive)"
    - "Yahoo / Finnhub / Polygon / Anthropic-search NOT removed (stay as fallbacks per D-32)"
    - "Shadow A/B starts here — runWithShadow('source-package-merge', oldFn, newFn, mode)"
    - "Verdict PASS: SourcePackage Jaccard ≥ 95% AND latency ≤ old AND no field nulls introduced (per RESEARCH Pitfall 5 metric)"
    - "Cutover deletes the old ladder code path from primary call but RETAINS yahoo/finnhub/polygon/anthropic-search adapter files for fallback"
    - "Source-package median latency drops by ≥40% post-cutover (Wave B success criterion)"
    - "combinedMode helper has unit test coverage — 6 input permutations covering 'shadow wins', 'all-on', 'all-off', and the three mixed cases that should resolve to 'off'"
  artifacts:
    - path: "src/lib/data/source-package.ts"
      provides: "Merge precedence reordered behind shadow A/B + combinedMode helper"
      contains: "combinedMode"
    - path: "src/lib/data/merge.ts"
      provides: "Extended FieldOrigin union"
      contains: "type FieldOrigin"
    - path: "tests/lib/data/source-package.test.ts"
      provides: "Unit test coverage for combinedMode helper"
  key_links:
    - from: "src/lib/data/source-package.ts (orchestrator)"
      to: "runWithShadow('source-package-merge', ...)"
      via: "shadow A/B harness"
      pattern: "runWithShadow.*source-package-merge"
---

# Plan 19-B-06: source-package.ts merge precedence reorder + shadow A/B + cutover

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

The agent (Claude) executes this plan end-to-end:
1. Land code with new ladder behind FEATURE_TIINGO_PRIMARY/TWELVEDATA_PRIMARY/EXA_PRIMARY (all default off)
2. Flip flags to `shadow` (all three coordinated — same env flip moment)
3. Drive shadow workload — production research traffic, ≥3-7 days OR ≥200 ShadowComparison rows for `path_name='source-package-merge'`
4. Run `npm run shadow-verdict 19-B-06`
5. PASS → cutover PR: flip flags to `on`, DELETE the call-site code that ran old ladder when flags off (the conditional branch); KEEP yahoo/finnhub/polygon/anthropic-search adapter files (D-32). Register pre-cutover grep pattern in `scripts/model-card-grep-patterns.json`
6. 7-day rollback hatch monitoring `RollbackLog.feature_flag IN ('FEATURE_TIINGO_PRIMARY', 'FEATURE_TWELVEDATA_PRIMARY', 'FEATURE_EXA_PRIMARY')`
7. Final flag-removal PR

## Hard Cleanup Gate (Definition of Done)

1. `shadow-reports/19-B-06.json` verdict=PASS — Jaccard ≥95%, latency non-regression, no field nulls introduced
2. Cutover PR merged — old conditional branch deleted from source-package.ts
3. 7d post-cutover with zero RollbackLog rows for the 3 flags
4. Flag-removal PR merged — FEATURE_TIINGO_PRIMARY, FEATURE_TWELVEDATA_PRIMARY, FEATURE_EXA_PRIMARY absent from features.ts
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green; `npm run model-card-status` reports tiingo_primary/twelvedata_primary/exa_primary flags removed

</universal_preamble>

<objective>
Per D-29, reorder source-package.ts merge ladder so Tiingo → Twelve Data → Yahoo → Finnhub → Polygon (with Exa → anthropic-search for news). Run via shadow A/B against current ladder. Cut over after PASS verdict. Achieve ≥40% median latency drop AND ≥80% reduction in anthropic-search hot path calls. Yahoo/Finnhub/Polygon/Anthropic-search adapters retained as fallbacks (D-32).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-design.md
@.planning/phases/19-cipher-v2-0-excellence/19-B-01-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-B-03-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-B-04-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-B-05-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-Z-03-SUMMARY.md
@src/lib/data/source-package.ts
@src/lib/data/merge.ts

<interfaces>
```typescript
// src/lib/data/merge.ts — extend existing FieldOrigin
export type FieldOrigin =
  | 'yahoo'
  | 'finnhub'
  | 'polygon'
  | 'tiingo'      // NEW (Plan 19-B-06)
  | 'twelvedata'  // NEW
  | 'exa'         // NEW (news/analyst attribution)
  | 'anthropic-search';

// New ladder order in source-package.ts when flags on:
// 1. Quote: tiingo → yahoo → finnhub → polygon (twelvedata is fundamentals only)
// 2. Fundamentals: tiingo → twelvedata → yahoo → finnhub → polygon
// 3. News/Analyst: exa → anthropic-search (fallback per Pitfall 7)

// combinedMode helper — coordinates 3 flags into a single FeatureMode for runWithShadow
import type { FeatureMode } from '@/lib/features';
export function combinedMode(modes: FeatureMode[]): FeatureMode;
//   - if any mode is 'shadow' → 'shadow' (highest-priority signal for measurement)
//   - else if all modes are 'on' → 'on'
//   - else → 'off' (any 'off' or mixed without shadow)
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-B-06-01 | Tampering | new ladder introduces field nulls vs old | mitigate | Shadow verdict computes per-field fill-rate delta; FAIL if ANY field's new fill_rate < old fill_rate (per RESEARCH Pitfall 5 SourcePackage metric) |
| T-19-B-06-02 | Information Disclosure | accidentally delete fallback adapter | mitigate | Cutover PR script grep-checks that yahoo.ts, finnhub.ts, polygon.ts, anthropic-search.ts files still exist post-merge; CI rule blocks deletion of these files |
| T-19-B-06-03 | DoS | new ladder slower on aggregate | mitigate | Latency p95 ratio < 2× gate in verdict; Wave B success criterion requires ≥40% median drop (D-29) |
| T-19-B-06-04 | Tampering | combinedMode helper miscombines flags → wrong path runs | mitigate | Unit-test the helper with 6 input permutations covering all decision branches (shadow-wins, all-on, all-off, three mixed cases); without test coverage a silent miscombination would route shadow workload incorrectly |

</threat_model>

<tasks>

<task type="auto" id="19-B-06-01">
  <name>Task 1: Extend FieldOrigin union in src/lib/data/merge.ts</name>
  <read_first>
    - src/lib/data/merge.ts (existing FieldOrigin)
  </read_first>
  <action>
    Edit `src/lib/data/merge.ts`:
    - Extend `type FieldOrigin = 'yahoo' | 'finnhub' | 'polygon' | 'tiingo' | 'twelvedata' | 'exa' | 'anthropic-search'`
    - The existing field-level merge function continues to work — first non-null wins logic unchanged
    - DO NOT add new merge logic; just extend the union type
  </action>
  <acceptance_criteria>
    - `grep -q "'tiingo'\|'twelvedata'\|'exa'" src/lib/data/merge.ts`
    - `grep -q "'yahoo'\|'finnhub'\|'polygon'" src/lib/data/merge.ts` (existing entries preserved)
    - TypeScript compile clean
  </acceptance_criteria>
  <automated>npx tsc --noEmit && grep -q "tiingo" src/lib/data/merge.ts && grep -q "yahoo" src/lib/data/merge.ts</automated>
  <done>FieldOrigin extended additively</done>
</task>

<task type="auto" id="19-B-06-02">
  <name>Task 2: Edit src/lib/data/source-package.ts — implement new ladder behind flag + combinedMode helper</name>
  <read_first>
    - src/lib/data/source-package.ts (existing ladder)
    - src/lib/data/adapters/tiingo.ts, twelve-data.ts, exa-search.ts (just-built primitives)
    - src/lib/features.ts (FEATURE_TIINGO_PRIMARY etc.)
    - src/lib/shadow/shadow-runner.ts (runWithShadow)
  </read_first>
  <action>
    Edit `src/lib/data/source-package.ts`:

    1. Import primitives:
       ```typescript
       import { fetchTiingoQuote, fetchTiingoFundamentals } from '@/lib/data/adapters/tiingo';
       import { fetchTwelveDataFundamentals } from '@/lib/data/adapters/twelve-data';
       import { fetchExaNews, fetchExaAnalystSentiment } from '@/lib/data/adapters/exa-search';
       import { runWithShadow } from '@/lib/shadow/shadow-runner';
       import { FEATURES } from '@/lib/features';
       import type { FeatureMode } from '@/lib/features';
       ```

    2. Refactor merge orchestration into two named functions:
       ```typescript
       async function buildSourcePackageOldLadder(ticker: string) {
         // existing implementation: yahoo + finnhub + polygon + anthropic-search
         // PRESERVE existing code verbatim; just extract into a function
       }

       async function buildSourcePackageNewLadder(ticker: string) {
         // New ladder:
         // Quote: try tiingo first, fall through to yahoo/finnhub/polygon
         // Fundamentals: tiingo → twelvedata → yahoo → finnhub → polygon
         // News: exa first, fall through to anthropic-search (per RESEARCH Pitfall 7)
         //
         // Each leg uses Promise.allSettled + retry-wrapped + cached primitives
         //
         // Pass results through existing mergeMarketData / mergeFundamentals
         // — extends FieldOrigin discipline preserved (Pattern 4 anti-pattern avoided)
       }
       ```

    3. Implement and export `combinedMode` helper (must be exported so unit tests can import it directly):
       ```typescript
       /**
        * combinedMode — coalesces 3 independent feature flags (tiingo/twelvedata/exa) into a
        * single FeatureMode for runWithShadow.
        *
        * Decision rules:
        *   - if ANY mode is 'shadow' → 'shadow' (highest-priority observation signal)
        *   - else if ALL modes are 'on' → 'on' (full cutover)
        *   - else → 'off' (any explicit off or mixed-without-shadow keeps users on the old ladder)
        */
       export function combinedMode(modes: FeatureMode[]): FeatureMode {
         if (modes.some(m => m === 'shadow')) return 'shadow';
         if (modes.every(m => m === 'on')) return 'on';
         return 'off';
       }
       ```

    4. The hot-path call to assemble SourcePackage wraps in shadow:
       ```typescript
       const mode = combinedMode([
         FEATURES.tiingo_primary_mode,
         FEATURES.twelvedata_primary_mode,
         FEATURES.exa_primary_mode,
       ]);
       return runWithShadow(
         'source-package-merge',
         () => buildSourcePackageOldLadder(ticker),
         () => buildSourcePackageNewLadder(ticker),
         mode,
         { ticker },
       );
       ```
  </action>
  <acceptance_criteria>
    - `grep -q "buildSourcePackageOldLadder\|buildSourcePackageNewLadder" src/lib/data/source-package.ts`
    - `grep -q "fetchTiingoQuote\|fetchTwelveDataFundamentals\|fetchExaNews" src/lib/data/source-package.ts`
    - `grep -q "runWithShadow.*'source-package-merge'" src/lib/data/source-package.ts`
    - `grep -q "export function combinedMode" src/lib/data/source-package.ts`
    - Yahoo / Finnhub / Polygon / Anthropic-search imports preserved (used in old ladder path)
    - TypeScript compile clean
  </acceptance_criteria>
  <automated>grep -q "runWithShadow.*source-package-merge" src/lib/data/source-package.ts && grep -q "fetchTiingoQuote" src/lib/data/source-package.ts && grep -q "anthropicSearch\|anthropic-search\|fetchAnthropicSearch" src/lib/data/source-package.ts && grep -q "export function combinedMode" src/lib/data/source-package.ts && npx tsc --noEmit</automated>
  <done>New ladder behind shadow gate; old ladder preserved; combinedMode exported for unit testing</done>
</task>

<task type="auto" tdd="true" id="19-B-06-2b">
  <name>Task 2b: Unit-test combinedMode helper (6 PASS/FAIL/HOLD-relevant input permutations)</name>
  <read_first>
    - src/lib/data/source-package.ts (combinedMode just exported)
    - src/lib/features.ts (FeatureMode = 'off' | 'shadow' | 'on')
  </read_first>
  <behavior>
    Test cases (6 permutations covering all decision branches):
    - Test 1: `combinedMode(['off', 'off', 'off']) === 'off'` — all off
    - Test 2: `combinedMode(['on', 'on', 'on']) === 'on'` — all on (cutover)
    - Test 3: `combinedMode(['shadow', 'shadow', 'shadow']) === 'shadow'` — all shadow
    - Test 4: `combinedMode(['off', 'shadow', 'off']) === 'shadow'` — any shadow wins (mixed off+shadow)
    - Test 5: `combinedMode(['on', 'shadow', 'on']) === 'shadow'` — any shadow wins (mixed on+shadow)
    - Test 6: `combinedMode(['off', 'on', 'off']) === 'off'` — mixed-without-shadow falls back to off (safe default)

    Why these 6 specifically: they cover the three documented decision rules (shadow-wins, all-on, default-off) AND each "mixed" combination that could plausibly arise during partial flag flips during the shadow lifecycle. Without test 4/5, a regression from "any shadow wins" → "majority wins" would silently route production users to a partially-rolled-out new ladder. Without test 6, a regression from "default off" → "any-on wins" would prematurely cut over before all three flags are flipped.
  </behavior>
  <action>
    Create `tests/lib/data/source-package.test.ts`:
    ```typescript
    import { describe, it, expect } from 'vitest';
    import { combinedMode } from '../../../src/lib/data/source-package';
    import type { FeatureMode } from '../../../src/lib/features';

    describe('combinedMode', () => {
      it('returns off when all modes off', () => {
        expect(combinedMode(['off', 'off', 'off'])).toBe('off');
      });
      it('returns on when all modes on (full cutover state)', () => {
        expect(combinedMode(['on', 'on', 'on'])).toBe('on');
      });
      it('returns shadow when all modes shadow', () => {
        expect(combinedMode(['shadow', 'shadow', 'shadow'])).toBe('shadow');
      });
      it('returns shadow when any mode is shadow even if others off', () => {
        expect(combinedMode(['off', 'shadow', 'off'])).toBe('shadow');
      });
      it('returns shadow when any mode is shadow even if others on', () => {
        expect(combinedMode(['on', 'shadow', 'on'])).toBe('shadow');
      });
      it('returns off for mixed on+off without any shadow (safe default)', () => {
        expect(combinedMode(['off', 'on', 'off'])).toBe('off');
      });
    });
    ```
  </action>
  <acceptance_criteria>
    - File `tests/lib/data/source-package.test.ts` exists
    - `grep -c "it(" tests/lib/data/source-package.test.ts` returns ≥6
    - All 6 tests pass: `npx vitest run tests/lib/data/source-package.test.ts` exits 0
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/data/source-package.test.ts</automated>
  <done>combinedMode helper has explicit 6-permutation unit test coverage; regressions caught immediately</done>
</task>

<task type="auto" tdd="true" id="19-B-06-03">
  <name>Task 3: Live-DB integration test for shadow comparison</name>
  <read_first>
    - tests/integration/learn.ess.live.test.ts (pattern reference)
  </read_first>
  <behavior>
    - Test 1: `with mode=off, only old ladder called; ShadowComparison empty`
    - Test 2: `with mode=shadow, both ladders called; ShadowComparison row created with path_name='source-package-merge', latencies recorded`
    - Test 3: `field-fill rates per-leg recorded for verdict computation`
    - Test 4: `with mode=on, only new ladder called; ShadowComparison empty (cutover state)`
    - Test 5: `new ladder errors do NOT propagate to user (caught in setImmediate)`
  </behavior>
  <action>
    Create `tests/integration/source-package.merge.shadow.live.test.ts`. Seed a test ticker (e.g., 'AAPL'); invoke source-package builder under each mode; assert ShadowComparison rows + non-blocking behavior.
  </action>
  <acceptance_criteria>
    - File exists; ≥5 tests
    - Test passes against live Neon (or skipped if no DATABASE_URL)
  </acceptance_criteria>
  <automated>test -f tests/integration/source-package.merge.shadow.live.test.ts</automated>
  <done>Shadow integration verified live</done>
</task>

<task type="auto" id="19-B-06-04">
  <name>Task 4: Initial commit (flags off; no behavior change)</name>
  <action>
    Run full unit + integration suite. Commit:
    ```
    feat(19-b-06): source-package.ts merge precedence — new ladder behind flag

    Reorders merge to tiingo → twelvedata → yahoo → finnhub → polygon
    (with exa → anthropic-search for news) when FEATURE_TIINGO_PRIMARY,
    FEATURE_TWELVEDATA_PRIMARY, FEATURE_EXA_PRIMARY all on.

    Old ladder retained when any flag off — current users see zero behavior change.
    Yahoo/Finnhub/Polygon/Anthropic-search adapter files NOT touched (D-32 fallbacks).

    combinedMode helper coalesces 3 flags into single FeatureMode for runWithShadow:
      shadow-wins > all-on > default-off (6 permutations unit-tested).

    Shadow A/B harness wired via runWithShadow('source-package-merge', ...).

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-b-06)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-b-06"</automated>
  <done>Initial code landed; ready for shadow flip</done>
</task>

<task type="auto" id="19-B-06-05">
  <name>Task 5: Shadow A/B → verdict → cutover → 7d hatch → flag removal</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-Z-03-SUMMARY.md (shadow lifecycle)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 425-432 — per-path metric for source-package)
  </read_first>
  <action>
    Multi-step lifecycle:

    **a) Flip to shadow (coordinated):**
    ```bash
    vercel env add FEATURE_TIINGO_PRIMARY shadow production
    vercel env add FEATURE_TWELVEDATA_PRIMARY shadow production
    vercel env add FEATURE_EXA_PRIMARY shadow production
    vercel env add FEATURE_DATA_CACHE on production  # cache layer used by shadow
    vercel --prod  # redeploy
    ```

    **b) Drive workload (3-7 days OR ≥200 rows in path_name='source-package-merge'):**
    Real production traffic generates ShadowComparison rows. Monitor:
    `psql $DATABASE_URL -c "SELECT count(*) FROM \"ShadowComparison\" WHERE path_name='source-package-merge';"`

    **c) Run audit + verdict:**
    `npm run shadow-verdict 19-B-06`
    - Computes per-field fill-rate delta (new vs old, per FieldOrigin)
    - Latency p50/p95 (Wave B success criterion: ≥40% median drop)
    - Anthropic-search call count delta (success criterion: ≥80% drop)
    - Disagreement: numeric L∞ per field ≤ 1%
    PASS requires: new fill_rate ≥ old per field AND p95 ≤ 2× old AND median ≤ old × 0.6 AND no fields fully nulled.

    **d) PASS → cutover PR:**
    - Flip flags to `on` in production
    - DELETE the `if (mode === 'off') return buildSourcePackageOldLadder(...)` conditional from source-package.ts
    - REMOVE `buildSourcePackageOldLadder` function (no longer reachable from primary path; old adapter files stay)
    - Verify yahoo.ts / finnhub.ts / polygon.ts / anthropic-search.ts still in tree (D-32 — they're now in `buildSourcePackageNewLadder` as fallback rungs)
    - Register grep patterns in `scripts/model-card-grep-patterns.json`:
      ```json
      {
        "name": "old-source-package-ladder-conditional",
        "pattern": "buildSourcePackageOldLadder",
        "registered_by_plan": "19-B-06",
        "registered_at": "<iso>"
      }
      ```

    **e) 7-day rollback hatch:**
    Watch `RollbackLog WHERE feature_flag LIKE 'FEATURE_%PRIMARY%'`. If non-empty, file failure plan.

    **f) Flag-removal PR:**
    Remove FEATURE_TIINGO_PRIMARY, FEATURE_TWELVEDATA_PRIMARY, FEATURE_EXA_PRIMARY from FLAG_NAMES in src/lib/features.ts. Remove from .env.example. Verify model-card-status reports flags-removed for these three. Note: `combinedMode` helper can stay (now always called with 3× 'on' that simplifies to 'on'); if dead-code-elimination preferred, inline `'on'` and remove the helper as part of the flag-removal PR.

    **g) Final verification:**
    `npm test && npm run test:integration && npm run test:e2e && npm run model-card-status`
  </action>
  <acceptance_criteria>
    - `shadow-reports/19-B-06.json` `"verdict": {"result": "PASS"}` AND latency_p50 reduction ≥40%
    - Post-cutover: `! grep -q "buildSourcePackageOldLadder" src/lib/data/source-package.ts`
    - Yahoo/Finnhub/Polygon/Anthropic-search files preserved
    - 3 flags removed from features.ts after 7d hatch
    - model-card-status reports `flag-removed-tiingo_primary: ok=true` etc.
  </acceptance_criteria>
  <automated>test -f shadow-reports/19-B-06.json && grep -q '"PASS"' shadow-reports/19-B-06.json</automated>
  <done>Shadow lifecycle complete; old ladder removed; fallback adapters preserved</done>
</task>

</tasks>

<verification>
- [ ] FieldOrigin union extended additively
- [ ] runWithShadow wraps merge orchestration
- [ ] combinedMode helper exported AND has 6-permutation unit test coverage (Task 2b)
- [ ] Old ladder preserved while flags off
- [ ] Shadow verdict PASS → cutover → 7d clean → 3 flags removed
- [ ] Yahoo/Finnhub/Polygon/Anthropic-search adapters NOT deleted
- [ ] Median latency drop ≥40% verified in verdict report
</verification>

<success_criteria>
1. Source-package median latency drops ≥40% post-cutover
2. Anthropic-search hot path calls drop ≥80%
3. Tiingo + Twelve Data + Exa primary; Yahoo+Finnhub+Polygon+Anthropic-search fallbacks
4. Hard Cleanup Gate: PASS + cutover + 7d clean + 3 flags removed
5. combinedMode helper: regressions caught at unit-test level (6-permutation coverage)
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-B-06-SUMMARY.md` with verdict metrics, latency before/after, anthropic-search call count delta, confirmation that all 4 fallback adapters preserved in tree, and the 6 combinedMode unit-test pass evidence.
</output>
</content>
</invoke>