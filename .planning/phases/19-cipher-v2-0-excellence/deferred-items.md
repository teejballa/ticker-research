# Deferred Items — Phase 19 Cipher v2.0 Excellence

Out-of-scope discoveries logged during plan execution. Per the GSD scope
boundary rule, these are NOT fixed by the executing plan because they
were not directly caused by the plan's changes — they are pre-existing
issues to be addressed in a follow-up plan.

## 2026-05-08 — discovered during 19-A-05 execution

### 1. tests/integration/schema-phase-16.test.ts asserts every learned_pattern row has signal_class='diffusion'

**Status:** Failing on live Neon, pre-existed 19-A-05 (confirmed via git stash).

**Cause:** Phase 17 added insider/institutional/technical signal classes
to LearnedPattern. The Phase 16 backfill assertion expected all rows to
be 'diffusion' which was true at commit time but has been falsified by
subsequent ingestion.

**Recommended fix:** Update assertion in schema-phase-16.test.ts to scope
the check to `signal_class: 'diffusion'` rows only, OR retire the test
(Phase 16 backfill is no longer relevant given Phase 17/18 evolution).

### 2. tests/integration/learn-dual-class.test.ts logistic-update expectation drift

**Status:** Failing on live Neon, pre-existed 19-A-05.

**Cause:** Test expects "no logistic update" at horizon=7 but Phase 16-03
behavior was changed to update on horizon ≥ 7d (see comments in
src/app/api/cron/learn/route.ts around line 944-953). Test was not
updated when the implementation was tightened.

**Recommended fix:** Update test expectation OR roll back the horizon ≥
7d change (latter requires careful re-evaluation of cold-start tradeoffs).

### 3. tests/integration/smart-money-affects-reports.test.ts AC5 prompt assertions

**Status:** Failing on live Neon, pre-existed 19-A-05.

**Cause:** buildSystemPrompt no longer references the institutional/insider
labels in the exact shape the test expects.

**Recommended fix:** Update the AC5 grep assertions in the test to match
the current prompt scaffold OR update buildSystemPrompt to restore the
exact label strings.

### 4. tests/integration/backfill-active-rate.test.ts AC3 marker

**Status:** Failing in current run, pre-existed 19-A-05.

**Cause:** scripts/check-active-cell-coverage.ts emits the AC3 marker only
when ≥ 25% of cells in the most-traded cap_class × horizon=7 are ACTIVE.
With all 51 production cells currently EXPLORATORY (post-Phase-18 ESS
gate tightening), the marker is never emitted.

**Recommended fix:** This is a calendar-gated condition, not a code bug.
Once enough resolved outcomes accumulate to flip cells back to ACTIVE,
the test will pass naturally. Track in v1.0 carryover items in STATE.md.

## 2026-05-08 — discovered during 19-C-07 execution (worktree agent-ab1bb1fa)

### 5. Unresolved git merge-conflict markers in worktree

**Status:** Pre-existed 19-C-07 — NOT introduced by this plan.

**Cause:** The worktree `agent-ab1bb1fa` has uncommitted modifications
(after `git stash pop` of the parent worktree's stash) containing
`<<<<<<< Updated upstream / ======= / >>>>>>> Stashed changes` markers in:
  - `src/app/api/cron/learn/route.ts` (lines 448, 453, 471, 472, 952, 991, 996, 1167)
  - `src/lib/data/merge.ts` (lines 148, 240, 241)
  - `src/lib/engine-context.ts` (lines 29, 32, 33, 108, 112, 114, 608, 609, 611)

These cause `npx tsc --noEmit -p tsconfig.json` and `npx vitest run` (full
suite) to fail on files unrelated to 19-C-07's `src/lib/sentiment/`
deliverables. 19-C-07 itself compiles cleanly when scoped to its own files.

**Recommended fix:** A subsequent integration agent must resolve the
conflict markers (likely by accepting either upstream or stashed for
each block based on whichever Wave A/B agent's work is canonical).
Out of scope for 19-C-07.

### 6. tests/lib/reasoning/router.test.ts is in RED state from 19-C-09

**Status:** Pre-existed 19-C-07 — file was committed by `d62f8b1
test(19-c-09): RED tests for routeModel + estimateCost (Task 1)`.

**Cause:** 19-C-09 is mid-execution in a sibling worktree; it has landed
its TDD RED tests but not yet the GREEN implementation
(`src/lib/reasoning/router.ts` exists as untracked but is not yet exporting
`routeModel` / `estimateCost`).

**Recommended fix:** Allow 19-C-09 to complete naturally; out of scope
for 19-C-07.

### 7. tests/lib/data/options-sentiment.term-structure.test.ts missing export

**Status:** Pre-existed 19-C-07 — RED test from sibling 19-C-04 plan.

**Cause:** Sibling 19-C-04 RED test references `fetchOptionsTermStructure`
which has not yet been implemented.

**Recommended fix:** Allow 19-C-04 to complete naturally; out of scope
for 19-C-07.

## 2026-05-08 — discovered during 19-C-10 execution (worktree agent-aaec78be)

### 8. tests/lib/data/stocktwits.reputation.test.ts — `__resetReputationCacheForTests` not exported

**Status:** Pre-existed 19-C-10 — confirmed via git stash on baseline.
7 of 7 cases fail because the test imports a helper that the production
module does not export. Belongs to sibling Plan 19-C-03 (RED tests
landed, GREEN implementation pending).

**Cause:** `tests/lib/data/stocktwits.reputation.test.ts:31` invokes
`__resetReputationCacheForTests()` but `src/lib/data/stocktwits.ts`
does not export that symbol.

**Recommended fix:** Allow 19-C-03 to complete naturally; out of scope
for 19-C-10.
