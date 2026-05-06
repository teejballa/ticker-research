---
phase: 18-time-decayed-bayesian-updates-ess
plan: 02
subsystem: learning-engine
tags: [cross-validation, bayesian, lopez-de-prado, purged-kfold, embargo, hyperparameter-tuning]

# Dependency graph
requires:
  - phase: 18-time-decayed-bayesian-updates-ess
    provides: Wave 0 stub conventions (cv.purgedkfold.test.ts contract from 18-00)
provides:
  - "src/lib/cv.ts — pure-function module exporting purgedKFold + Observation + Fold"
  - "Purged K-Fold + Embargo CV utility with default purge=embargo=90 days (D-16)"
  - "Active Vitest spec at src/lib/__tests__/cv.purgedkfold.test.ts (5 live cases, no .todo)"
affects: [18-06-tuning-scripts, 18-tune-lambda, 18-tune-page-hinkley, phase-21-lift-gating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function CV module (no DB, no I/O) — D-18 invariant extended from learning.ts"
    - "Hyperparameter tuning isolated to offline scripts (never loaded by cron)"

key-files:
  created:
    - src/lib/cv.ts
    - src/lib/__tests__/cv.purgedkfold.test.ts
  modified: []

key-decisions:
  - "Adopted CONTEXT D-16 defaults verbatim: purgeDays=90, embargoDays=90 (max horizon)"
  - "CV utility lives in src/lib/cv.ts — separate from learning.ts so cron paths never load it"
  - "Embargo predicate uses strict less-than (ti < tMax + embargoMs) consistent with López de Prado §7.4"

patterns-established:
  - "Per-fold contiguous test slice + asymmetric purge/embargo training filter"
  - "Empty-input safety: purgedKFold(obs=[], k>0) returns [] (no crash, no NaN)"

requirements-completed: [CORE-ML-02, CORE-ML-04]

# Metrics
duration: ~3min
completed: 2026-05-05
---

# Phase 18 Plan 02: Purged K-Fold + Embargo CV utility Summary

**New `src/lib/cv.ts` module exporting `purgedKFold` per López de Prado §7.4, with default 90-day purge + 90-day embargo per CONTEXT D-16, ready for offline λ and Page-Hinkley parameter tuning in Plan 18-06.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-06T04:29:00Z
- **Completed:** 2026-05-06T04:32:09Z
- **Tasks:** 1
- **Files modified:** 2 (both created)

## Accomplishments

- New pure-function module `src/lib/cv.ts` (83 lines) with `purgedKFold`, `Observation`, `Fold`
- Defaults match CONTEXT D-16 verbatim: `purgeDays = 90`, `embargoDays = 90`
- Zero DB imports, zero side effects — D-18 invariant extended from `learning.ts`
- Vitest stub `src/lib/__tests__/cv.purgedkfold.test.ts` flipped fully green with 5 live assertions:
  1. Non-empty folds for synthetic 50-obs input (5 folds, each with non-empty test set)
  2. Train ∩ Test = ∅ for every fold
  3. Purge correctness: training rows whose `[t, t+horizon]` window overlaps the test fold range are excluded
  4. Embargo correctness: training rows within `embargoDays` AFTER `tMax` are excluded
  5. Default `k=5` invocation matches explicit `(k=5, 90, 90)` invocation (D-16 default verification)

## Task Commits

1. **Task 1: Create src/lib/cv.ts with purgedKFold + Observation + Fold** — `073b0bf` (feat)

## Files Created/Modified

- `src/lib/cv.ts` (CREATED) — Pure-function CV module: `purgedKFold(obs, k, purgeDays=90, embargoDays=90): Fold[]`, plus `Observation` and `Fold` interfaces. Header comment names López de Prado §7.4 and lists the two consumer scripts (Plan 18-06).
- `src/lib/__tests__/cv.purgedkfold.test.ts` (CREATED) — 5-case Vitest spec covering all behaviors from the plan's `<behavior>` block.

## Decisions Made

- **Wave 0 stub absent in this worktree.** The plan's instruction was to "activate Wave 0 stub" by replacing `it.todo` with live assertions. Since no stub existed in this worktree, I created the test file directly with all 5 active assertions (matching the it.todo case names from Plan 18-00). End state matches the plan's acceptance criteria exactly.
- **Test data choices to isolate purge vs embargo:** Two of the assertion tests deliberately use non-default `purgeDays`/`embargoDays` (0 and 3) so they can pinpoint each rule's effect independently. The fifth test confirms the 90/90 defaults match an explicit invocation, satisfying the D-16 verification requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created Wave 0 stub file in this worktree**
- **Found during:** Task 1 setup
- **Issue:** The plan instructs "activate Wave 0 stub `src/lib/__tests__/cv.purgedkfold.test.ts`" but the stub file did not exist in this worktree (Plan 18-00 was not executed in this branch). Without the stub, there was nothing to "activate" and Task 1's verify step would fail.
- **Fix:** Created `src/lib/__tests__/cv.purgedkfold.test.ts` directly with all 5 live assertions matching the `it.todo` case names defined in Plan 18-00. The end state — a fully green spec with 5 live tests — is identical whether arrived at via stub-then-activate or direct-create.
- **Files modified:** src/lib/__tests__/cv.purgedkfold.test.ts (created)
- **Verification:** `npx vitest run src/lib/__tests__/cv.purgedkfold.test.ts` → 5 passed, 0 failed
- **Committed in:** `073b0bf`

**2. [Rule 1 - Bug] Corrected initial purge-overlap test assertion**
- **Found during:** Task 1 verification (first test run)
- **Issue:** My first draft of the "purges training obs whose [t, t+horizon] window overlaps test fold range" test asserted `trainIdx.length === 0` for all 5 folds with `purgeDays=0`. This was wrong: the purge rule requires BOTH `tiOutcomeEnd >= tMin - purgeMs` AND `ti <= tMax + purgeMs`, so a future training obs (ti > tMax) is not purged by the outcome-overlap rule alone. Test failed on fold 0.
- **Fix:** Rewrote the assertion to check the LAST fold (where all earlier obs are training and their outcome windows DO overlap the test) plus the FIRST fold (where all later obs are training and survive the purge) — gives a precise behavioral pin without ambiguity.
- **Files modified:** src/lib/__tests__/cv.purgedkfold.test.ts
- **Verification:** All 5 tests pass after fix
- **Committed in:** `073b0bf` (single Task 1 commit; fix happened pre-commit)

---

**Total deviations:** 2 auto-fixed (1 blocking environment fix, 1 test-correctness fix)
**Impact on plan:** Both fixes essential to satisfy `<acceptance_criteria>` and `<verify>`. No scope creep — production module `src/lib/cv.ts` matches the plan's literal code block byte-for-byte.

## Issues Encountered

- **Worktree base mismatch.** `git merge-base` returned `e089a2a` instead of expected `c8876b3`. Resolved by `git reset --hard c8876b35a0014eb3bef6a3585927a24162d4a604` to align this worktree with the orchestrator's wave base. Working tree was clean before reset.

## Verification Results

- `npx vitest run src/lib/__tests__/cv.purgedkfold.test.ts` → **5 passed**
- `grep -E "import.*(db|prisma)" src/lib/cv.ts` → **no matches** (D-18 satisfied)
- `npx tsc --noEmit` → **exit 0** (no type errors)
- `wc -l src/lib/cv.ts` → **83 lines** (≥ 60 required)
- `grep -c "export function purgedKFold" src/lib/cv.ts` → **1**
- `grep -c "export interface Observation" src/lib/cv.ts` → **1**
- `grep -c "export interface Fold" src/lib/cv.ts` → **1**
- `grep -c "purgeDays = 90" src/lib/cv.ts` → **1**
- `grep -c "embargoDays = 90" src/lib/cv.ts` → **2** (signature + JSDoc)
- `grep -c "López de Prado" src/lib/cv.ts` → **1**

## User Setup Required

None — no external service configuration required. CV utility loads only in offline tuning scripts (Plan 18-06).

## Next Phase Readiness

- `src/lib/cv.ts` ready for import by `scripts/tune-lambda.ts` and `scripts/tune-page-hinkley.ts` (Plan 18-06)
- D-18 invariant ("learning.ts has no DB imports") successfully extended to the new sibling module
- No blockers for downstream Wave 1 plans (18-01, 18-03, 18-04, 18-05) — this plan only adds a new file and does not touch any existing module

## Self-Check: PASSED

- FOUND: src/lib/cv.ts
- FOUND: src/lib/__tests__/cv.purgedkfold.test.ts
- FOUND commit: 073b0bf

---
*Phase: 18-time-decayed-bayesian-updates-ess*
*Completed: 2026-05-05*
