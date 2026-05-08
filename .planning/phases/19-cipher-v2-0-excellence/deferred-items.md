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
