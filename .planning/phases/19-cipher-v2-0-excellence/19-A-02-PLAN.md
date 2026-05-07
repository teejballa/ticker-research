---
phase: 19
plan: 19-A-02
wave: A
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-A-01]
files_modified:
  - src/app/api/cron/learn/route.ts
  - src/lib/learning.ts
  - tests/cron-learn.unit.bugs.test.ts
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "Brier OOS split honors chronological order at all n (no random partitioning, no max(1,n-14) bug)"
    - "Time-based 80/20 split: first 80% of observations chronologically train, last 20% test"
    - "n=14 case produces non-empty test set (≥2 rows for OOS Brier; if n<5 then OOS Brier returns null with reason)"
    - "buildTraceForOutcome rejects snapshots within prediction_horizon of outcome (embargo)"
    - "All existing cron-learn integration tests stay green"
  artifacts:
    - path: "src/app/api/cron/learn/route.ts"
      provides: "fixed Brier OOS split + embargo enforcement"
      contains: "chronological 80/20 split"
    - path: "src/lib/learning.ts"
      provides: "extracted timeBasedSplit() pure helper"
      exports: ["timeBasedSplit"]
    - path: "tests/cron-learn.unit.bugs.test.ts"
      provides: "Tests for split bug fix + embargo enforcement"
  key_links:
    - from: "src/app/api/cron/learn/route.ts (Brier OOS computation)"
      to: "src/lib/learning.ts timeBasedSplit"
      via: "function call"
      pattern: "timeBasedSplit\\("
---

# Plan 19-A-02: Brier OOS split bug fix + look-ahead audit

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Pure-function bug fix in cron route + new helper in learning.ts. No shadow needed (mathematical correctness fix). Land → tests → commit.

## Hard Cleanup Gate (Definition of Done)

1. (N/A — no shadow)
2. (N/A — fix replaces buggy slice, no flag-gated old path retained)
3. (N/A)
4. (N/A)
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green

</universal_preamble>

<objective>
Replace `max(1, n-14)` Brier OOS split (bug for n<16 — produces 0-row OOS) with a chronological 80/20 time-based split per D-18. Add embargo enforcement on `buildTraceForOutcome` so snapshots within `prediction_horizon` of outcome resolution are rejected (eliminates look-ahead bias).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md
@src/app/api/cron/learn/route.ts
@src/lib/learning.ts
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-SUMMARY.md

<interfaces>
```typescript
// New export in learning.ts:
export function timeBasedSplit<T extends { recorded_at: Date }>(
  items: T[],
  testFraction: number = 0.2,
): { train: T[]; test: T[] };
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-A-02-01 | Tampering | look-ahead leakage in OOS Brier | mitigate | timeBasedSplit sorts by recorded_at ascending, takes last `testFraction` chronologically; embargo enforced in buildTraceForOutcome filter |
| T-19-A-02-02 | Business Logic | n=14 produces 0-row OOS → silent NaN Brier | mitigate | Test for n=14 asserts test set has ≥2 rows; for n<5 returns null with reason rather than NaN |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-A-02-01">
  <name>Task 1: Write failing tests in tests/cron-learn.unit.bugs.test.ts</name>
  <read_first>
    - src/app/api/cron/learn/route.ts (lines 519-522 — current Brier split, lines 227-232 — buildTraceForOutcome)
    - src/lib/learning.ts (existing testFn references, types like WeightedObservation)
    - .planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md (D-18)
  </read_first>
  <behavior>
    - Test 1: `timeBasedSplit honors chronological order` — feed 10 items shuffled by date, verify train.recorded_at all < test.recorded_at min
    - Test 2: `timeBasedSplit at n=14 produces ≥2 test rows` — split with testFraction=0.2 → 11 train, 3 test (or close)
    - Test 3: `timeBasedSplit at n=5 produces ≥1 test row` — edge case
    - Test 4: `timeBasedSplit at n=0 returns empty arrays`
    - Test 5: `timeBasedSplit at n=2 produces 1 train + 1 test`
    - Test 6: `Brier OOS computation returns null when test set < 5` — instead of NaN/Infinity
    - Test 7: `buildTraceForOutcome rejects snapshot within prediction_horizon of outcome` — embargo test: snapshot 3 days before outcome with horizon=7d → rejected
    - Test 8: `buildTraceForOutcome accepts snapshot more than prediction_horizon before outcome` — snapshot 10d before, horizon=7d → accepted
  </behavior>
  <action>
    Create `tests/cron-learn.unit.bugs.test.ts`. Import `timeBasedSplit` from learning.ts (will fail RED initially since helper not yet extracted). For embargo test, import or reconstruct `buildTraceForOutcome` from cron route — may need to refactor to extract pure helper for testability. If extraction is too invasive, write integration-style test invoking the cron handler with seeded data.
  </action>
  <acceptance_criteria>
    - File `tests/cron-learn.unit.bugs.test.ts` exists
    - `grep -c "it(" tests/cron-learn.unit.bugs.test.ts` returns ≥8
    - Test FAILS — timeBasedSplit not exported / split bug still present
  </acceptance_criteria>
  <automated>npx vitest run tests/cron-learn.unit.bugs.test.ts 2>&1 | grep -qE "FAIL|Cannot find|timeBasedSplit"</automated>
  <done>8 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-A-02-02">
  <name>Task 2: Extract timeBasedSplit pure helper in src/lib/learning.ts</name>
  <read_first>
    - src/lib/learning.ts (existing exports — find a good location for new helper)
    - tests/cron-learn.unit.bugs.test.ts (just written)
  </read_first>
  <action>
    Add to `src/lib/learning.ts` (in the CV/split section near other splitting helpers):
    ```typescript
    /**
     * Chronological time-based train/test split — replaces buggy max(1, n-14) per Plan 19-A-02.
     * Sorts items by recorded_at ascending, then partitions: first (1-testFraction) train, last testFraction test.
     * Honors chronological order — no look-ahead leakage.
     *
     * Edge cases:
     *   - n=0 → { train: [], test: [] }
     *   - n=1 → { train: [item], test: [] }
     *   - n=2 → { train: 1, test: 1 }
     *   - n>=5 → respects testFraction proportion (rounded up to ensure non-empty test when n>=5)
     */
    export function timeBasedSplit<T extends { recorded_at: Date }>(
      items: T[],
      testFraction: number = 0.2,
    ): { train: T[]; test: T[] } {
      if (items.length === 0) return { train: [], test: [] };
      if (items.length === 1) return { train: items, test: [] };

      const sorted = [...items].sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());

      // Ensure at least 1 test item; for n >= 5 honor testFraction proportionally
      const testSize = Math.max(1, Math.ceil(sorted.length * testFraction));
      const trainEnd = sorted.length - testSize;

      return {
        train: sorted.slice(0, trainEnd),
        test: sorted.slice(trainEnd),
      };
    }
    ```
  </action>
  <acceptance_criteria>
    - `grep -q "export function timeBasedSplit" src/lib/learning.ts`
    - First 5 timeBasedSplit tests pass: `npx vitest run tests/cron-learn.unit.bugs.test.ts -t "timeBasedSplit"` exits 0
  </acceptance_criteria>
  <automated>npx vitest run tests/cron-learn.unit.bugs.test.ts -t "timeBasedSplit"</automated>
  <done>timeBasedSplit exported; 5 unit tests GREEN</done>
</task>

<task type="auto" id="19-A-02-03">
  <name>Task 3: Replace max(1, n-14) split bug in cron/learn/route.ts</name>
  <read_first>
    - src/app/api/cron/learn/route.ts (find the line with `max(1, n-14)` or equivalent — likely lines 515-525 in Brier computation)
    - .planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md (D-18)
  </read_first>
  <action>
    Find the buggy split inside the Brier OOS computation. Replace with:
    ```typescript
    import { timeBasedSplit } from '@/lib/learning';
    // ...
    // OLD: const splitIdx = Math.max(1, observations.length - 14);
    //      const trainSet = observations.slice(0, splitIdx);
    //      const testSet = observations.slice(splitIdx);
    // NEW:
    const { train: trainSet, test: testSet } = timeBasedSplit(observations, 0.2);
    if (testSet.length < 5) {
      // not enough OOS rows for meaningful Brier — record null and continue
      brierOOS = null;
      brierOOSReason = `n_test=${testSet.length} < 5`;
    } else {
      brierOOS = brierScore(trainPredictionsForTestRows, testSet.map(o => o.hit));
    }
    ```

    Update any other location that uses `n-14`-style splits in this file similarly. Audit `buildTraceForOutcome` (around line 227) to ensure embargo: filter out snapshots where `outcome_at - snapshot_at < prediction_horizon_days`.
  </action>
  <acceptance_criteria>
    - `grep -q "n - 14\|max(1, n-14)\|n-14" src/app/api/cron/learn/route.ts` returns NOTHING (bug removed)
    - `grep -q "timeBasedSplit" src/app/api/cron/learn/route.ts`
    - Embargo logic exists: `grep -q "prediction_horizon" src/app/api/cron/learn/route.ts`
  </acceptance_criteria>
  <automated>! grep -E "max\(1, n-14\)|n - 14" src/app/api/cron/learn/route.ts && grep -q "timeBasedSplit" src/app/api/cron/learn/route.ts</automated>
  <done>Bug replaced with chronological split; embargo enforced</done>
</task>

<task type="auto" id="19-A-02-04">
  <name>Task 4: Full suite green + commit</name>
  <read_first>
    - tests/learning.hyperparameters.test.ts (D-54)
    - tests/integration/learn.ess.live.test.ts (Phase 18-04 — must stay green)
  </read_first>
  <action>
    Run `npx vitest run` and (with DATABASE_URL set) `npm run test:integration`. Confirm zero regressions on Phase 18 tests.

    Commit:
    ```
    fix(19-a-02): Brier OOS split chronological + embargo on buildTraceForOutcome

    Replaced max(1, n-14) split (silent 0-row OOS at n<16) with timeBasedSplit
    helper that honors chronological order. Added embargo on
    buildTraceForOutcome — snapshots within prediction_horizon of outcome
    rejected (D-18, eliminates look-ahead leakage).

    Phase 18 cron-learn integration tests still green.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `npx vitest run` exits 0
    - `git log -1 --pretty=%s` matches "fix(19-a-02)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-a-02"</automated>
  <done>Bug fix + embargo committed; no regression</done>
</task>

</tasks>

<verification>
- [ ] timeBasedSplit pure helper exported from learning.ts
- [ ] n-14 bug removed from cron/learn route
- [ ] Embargo enforced on buildTraceForOutcome
- [ ] 8 unit tests green
- [ ] Phase 18 ESS tests green
</verification>

<success_criteria>
1. Brier OOS computed only on chronologically-future test rows
2. n=14 case produces meaningful OOS Brier instead of 0-row silent NaN
3. buildTraceForOutcome cannot include snapshots that resolved before prediction_horizon (no look-ahead)
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-A-02-SUMMARY.md`.
</output>
