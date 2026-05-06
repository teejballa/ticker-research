---
phase: 18-time-decayed-bayesian-updates-ess
plan: 01
subsystem: learning-engine
tags: [bayesian, time-decay, ess, page-hinkley, drift-detection, pure-functions]

# Dependency graph
requires:
  - phase: 18-time-decayed-bayesian-updates-ess
    provides: Wave 0 unit-test stub files (intended — Plan 18-00 not pre-run in this worktree, stubs created in this plan as fully-active assertions)
provides:
  - decayWeights pure function (exponential time decay, λ in days)
  - computeESS pure function (Kish formula, NaN-safe)
  - updatePosteriorWeighted pure function (weighted Beta-Bernoulli)
  - pageHinkleyStatistic pure function (bidirectional drift accumulator)
  - confirmedDrift composer (two-of-two D-06 + N≥30 D-08 floor)
  - STATUS_VALUES const + LearnedStatus literal type (T-18-04 mitigation)
  - patternStatus extended with optional effective_sample_size? param (back-compat)
affects:
  - 18-02 (Prisma migration — STATUS_VALUES informs status column documentation)
  - 18-03 (CV utilities — computeESS used by Brier scoring under decay)
  - 18-04 (cron rewire — consumes decayWeights, computeESS, confirmedDrift, STATUS_VALUES)
  - 18-05 (backfill cron — consumes decayWeights/computeESS/updatePosteriorWeighted)
  - 18-06+ (engine-context, UI surfaces — consume ESS-tightened CIs through existing credibleInterval95)

# Tech tracking
tech-stack:
  added: []  # zero new dependencies (per success criteria)
  patterns:
    - "Phase 18 pure-function module: decay/ESS/PH/drift primitives appended to learning.ts (D-18 invariant preserved — no DB imports)"
    - "Numeric-only LearningEvent.delta payload shape: {fired, drift_z, ph_stat, ph_threshold} — no string injection surface (T-18-05)"
    - "Centralized STATUS_VALUES literal-tuple const for typo-proof status writes (T-18-04)"
    - "Optional effective_sample_size? param pattern for back-compat extension of patternStatus (call sites without it keep working)"

key-files:
  created:
    - src/lib/__tests__/learning.decay.test.ts
    - src/lib/__tests__/learning.ess.test.ts
    - src/lib/__tests__/learning.ph.test.ts
    - src/lib/__tests__/learning.drift.test.ts
  modified:
    - src/lib/learning.ts

key-decisions:
  - "Wave 0 stubs were not pre-created (Plan 18-00 not yet executed in this worktree). Plan 18-01's <action> Step 1 said 'replace it.todo placeholders with full assertions' — interpreted as creating the test files directly with full assertions, achieving the same end state without blocking on Wave 0."
  - "decayWeights clamps Δt<0 (future-dated obs) to weight 1.0 — defensive against clock skew between Vercel runtime and Postgres, per behavior contract."
  - "computeESS returns 0 (not NaN) for empty/zero-vector inputs — keeps DB writes safe when a cell has no observations yet."
  - "patternStatus return type intentionally remains 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' — 'EXPLORATORY-WATCH' is a cron-state-machine flip per D-09, never a pure-primitive decision."

patterns-established:
  - "Pure-function discipline: every Phase 18 primitive lives in learning.ts with zero DB/I/O imports (D-18). Cron route handlers will compose them."
  - "Threat-mitigation through type narrowing: T-18-04 (status enum poisoning) closed via const tuple + literal type that downstream call sites cast through."

requirements-completed: [CORE-ML-01, CORE-ML-04]

# Metrics
duration: 4min
completed: 2026-05-05
---

# Phase 18 Plan 01: Time-Decay Math Kernel Summary

**Five new exported pure functions (decayWeights, computeESS, updatePosteriorWeighted, pageHinkleyStatistic, confirmedDrift) plus STATUS_VALUES const and back-compat patternStatus extension — the math kernel of v2.0 keystone Phase 18, all 28 new unit assertions green, learning.ts stays DB-free.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-06T04:28:41Z
- **Completed:** 2026-05-06T04:32:35Z
- **Tasks:** 1/1
- **Files modified:** 1 (`src/lib/learning.ts`)
- **Files created:** 4 (the four Wave 0 unit-test files, fully active)

## Accomplishments

- **5 new pure primitives** added to `src/lib/learning.ts`:
  - `decayWeights(obs, λ, now?)` — exponential weights `w_i = exp(-Δt/λ)` with Δt clamped to ≥0 (D-03)
  - `computeESS(weights)` — Kish `(Σw)²/Σw²`, returns 0 for empty / all-zero (no NaN)
  - `updatePosteriorWeighted(prior, obs, weights)` — weighted Beta-Bernoulli replaces +1/+0 with +w_i
  - `pageHinkleyStatistic(deltas, δ, λ_PH)` — bidirectional accumulator returning `max(M_up,M_down)−λ_PH`
  - `confirmedDrift(args)` — two-of-two: fires iff `rawN≥30 ∧ |drift_z|>2 ∧ ph>0` (D-06, D-08)
- **1 new const + 1 new type:** `STATUS_VALUES = ['ACTIVE','EXPLORATORY','EXPLORATORY-WATCH','DEPRECATED'] as const` + `LearnedStatus = typeof STATUS_VALUES[number]` (T-18-04 mitigation)
- **patternStatus extended back-compat** with optional `effective_sample_size?: number` — when present, `ESS<30 → EXPLORATORY` supersedes `sample_size<10`; when absent, behavior is byte-identical to pre-P18 (verified by the existing 4 patternStatus tests in `learning.test.ts` passing unchanged).
- **28 new test assertions** across 4 files (decay/ess/ph/drift), all green. Existing 39 `learning.test.ts` assertions unchanged and still green.
- **D-18 invariant preserved:** `learning.ts` still has zero DB/Prisma imports.

## Task Commits

1. **Task 1: Add decay/ESS/PH/drift primitives + STATUS_VALUES const + patternStatus extension** — `650c7ac` (feat)

_Note: This is a single-task plan; no separate test/feat split — the test files and implementation landed atomically because Plan 18-01 explicitly bundles test activation with primitive addition._

## Files Created/Modified

- `src/lib/learning.ts` — appended 5 pure functions + STATUS_VALUES const + LearnedStatus type; modified `patternStatus` signature to accept optional `effective_sample_size?` arg (back-compat preserved).
- `src/lib/__tests__/learning.decay.test.ts` — 7 assertions: empty input, Δt=0 → 1.0 exact, Δt=λ → e⁻¹, monotonicity, future-date clamp, default `now`, half-life sanity.
- `src/lib/__tests__/learning.ess.test.ts` — 7 assertions: empty → 0, uniform N → N, scale invariance, single-spike collapse to 1.04, all-zero → 0 (no NaN), mixed zero/non-zero, half-decayed cluster.
- `src/lib/__tests__/learning.ph.test.ts` — 7 assertions: stationary zero stream, stationary noise below δ, upward shift fires, downward shift fires, λ_PH suppression, δ tolerance, empty input edge case.
- `src/lib/__tests__/learning.drift.test.ts` — 7 assertions: all-three-trip fires, **rawN: 29 NEVER fires (D-08 floor — literal grep-verified)**, only-z-trips silent, only-PH-trips silent, numeric-only payload (T-18-05), fully-stationary cell silent, ph_threshold round-trip.

## Decisions Made

- Created the four Wave 0 test files directly (with full assertions) rather than waiting on Plan 18-00 — Plan 18-01's `<action>` Step 1 explicitly contemplates "replace `it.todo(...)` placeholders with full active assertions"; in a worktree where 18-00 hasn't run, the same end state is "create the file with full assertions." End-state is identical.
- `decayWeights` future-date clamp uses `Math.max(0, dt)` — defensive against any clock-skew between Vercel runtime and Postgres `recorded_at` timestamps.
- `computeESS` early-returns 0 for `weights.length === 0` and for `sumSq === 0` separately — both produce 0 NaN-free.
- `updatePosteriorWeighted` throws on length mismatch (caller bug, not silent degradation).
- `confirmedDrift` returns `{fired, drift_z, ph_stat, ph_threshold}` — all primitive — exactly the four numeric fields Plan 18-04 will serialize into `LearningEvent.delta` (T-18-05 zero string-injection surface).
- `patternStatus` return type intentionally **does not** add `'EXPLORATORY-WATCH'` — that flip is a cron-level state-machine decision per D-09, not a pure-primitive concern.

## Deviations from Plan

### Auto-handled discrepancies

**1. [Rule 3 — Blocking] Wave 0 stub files did not exist on disk; created them directly with full assertions**

- **Found during:** Task 1 Step 1 ("Activate Wave 0 stubs")
- **Issue:** Plan 18-00 (the Wave 0 stub-creation plan) had not been executed in this worktree, so the four `it.todo(...)` placeholder files referenced by Plan 18-01 Step 1 did not exist.
- **Fix:** Created the four files directly in `src/lib/__tests__/` with the full active assertions matching Plan 18-01's `<behavior>` block. End-state is identical to "create stubs in 18-00, then activate in 18-01" — the assertions exist, they exercise the new primitives, they all pass.
- **Files modified:** `src/lib/__tests__/learning.{decay,ess,ph,drift}.test.ts` (4 new files)
- **Verification:** All 28 new assertions pass + all 39 pre-existing learning.test.ts assertions pass = 67/67 green via `npm test -- --run src/lib/__tests__/learning*.test.ts`.
- **Committed in:** `650c7ac`

---

**Total deviations:** 1 auto-handled (Rule 3 blocking — Wave 0 stub absence)
**Impact on plan:** Zero scope creep — same files, same assertions, same green state. The deviation is procedural (which agent creates the file) not substantive (what the file contains).

## Issues Encountered

None — `npm test` run was green on first execution; `npx tsc --noEmit` exited 0.

## Verification Results

```
$ npm test -- --run src/lib/__tests__/learning.test.ts \
                    src/lib/__tests__/learning.decay.test.ts \
                    src/lib/__tests__/learning.ess.test.ts \
                    src/lib/__tests__/learning.ph.test.ts \
                    src/lib/__tests__/learning.drift.test.ts

 ✓ src/lib/__tests__/learning.ph.test.ts    (7 tests)
 ✓ src/lib/__tests__/learning.decay.test.ts (7 tests)
 ✓ src/lib/__tests__/learning.test.ts       (39 tests)
 ✓ src/lib/__tests__/learning.drift.test.ts (7 tests)
 ✓ src/lib/__tests__/learning.ess.test.ts   (7 tests)

 Test Files  5 passed (5)
      Tests  67 passed (67)

$ npx tsc --noEmit && echo $?
0

$ grep -E "import.*(db|prisma)" src/lib/learning.ts
(no matches — D-18 invariant holds)
```

All success criteria met:
- 5 new exported primitives + 1 new exported const + 1 new exported type ✓
- All Wave 0 unit-test stubs green (full assertions activated) ✓
- Existing learning.test.ts still green (no regression on patternStatus back-compat) ✓
- learning.ts grew by ~3,200 chars (5 functions + const + type + JSDoc) ✓
- Zero new package dependencies ✓
- All 8 acceptance criteria literals grep-verified ✓
- D-18 pure-function invariant preserved ✓
- T-18-04 mitigated via STATUS_VALUES centralization ✓
- T-18-05 mitigated via numeric-only confirmedDrift return shape ✓

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready for downstream Phase 18 plans:**
- **18-02 (Prisma migration):** Can land `effective_sample_size Float NOT NULL DEFAULT 0` knowing `computeESS` is the source of values.
- **18-03 (CV utilities):** Can use `computeESS` to weight Brier scoring.
- **18-04 (cron rewire):** Can import `decayWeights`, `computeESS`, `updatePosteriorWeighted`, `confirmedDrift`, `STATUS_VALUES`, `LearnedStatus` directly. The optional `effective_sample_size?` param on `patternStatus` lets the cron pass ESS without breaking older call sites.
- **18-05 (backfill cron):** Same as 18-04 — primitives are pure and stateless, safe to call inside `prisma.$transaction`.

**No blockers.**

## Self-Check: PASSED

- File `src/lib/learning.ts` modified — VERIFIED via `grep -E "^export (function|const|interface|type) (decayWeights|computeESS|updatePosteriorWeighted|pageHinkleyStatistic|confirmedDrift|STATUS_VALUES|LearnedStatus|WeightedObservation)"` returning 8 matches at lines 345, 346, 350, 360, 377, 393, 429, 462.
- File `src/lib/__tests__/learning.decay.test.ts` exists — VERIFIED via `git log` showing creation in `650c7ac`.
- File `src/lib/__tests__/learning.ess.test.ts` exists — VERIFIED.
- File `src/lib/__tests__/learning.ph.test.ts` exists — VERIFIED.
- File `src/lib/__tests__/learning.drift.test.ts` exists — VERIFIED.
- Commit `650c7ac` exists in git log — VERIFIED.
- D-18 invariant: NO DB/Prisma imports in `src/lib/learning.ts` — VERIFIED via `grep` returning no matches.
- D-08 floor: literal `rawN: 29` exists in drift test — VERIFIED at line 43.
- T-18-04 mitigation: `STATUS_VALUES` array literally contains `'EXPLORATORY-WATCH'` — VERIFIED at line 345.

---
*Phase: 18-time-decayed-bayesian-updates-ess*
*Plan: 01*
*Completed: 2026-05-05*
