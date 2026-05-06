---
phase: 18-time-decayed-bayesian-updates-ess
plan: 00
subsystem: testing
tags: [vitest, playwright, tdd, wave-0, learning-engine, ess, page-hinkley, purged-kfold, drift-detection]

# Dependency graph
requires:
  - phase: 15-diffusion-learning-engine
    provides: existing learning.ts pure-function module + LearnedPattern Prisma table this phase will extend
  - phase: 16-technical-analysis
    provides: existing test conventions for src/lib/__tests__/ + tests/e2e/
provides:
  - 5 vitest unit-test stubs (RED on import) for Wave 1 learning.ts/cv.ts primitives
  - 3 live-DB integration stubs (one per cron route directory) for Wave 2 cron behavior
  - 2 Playwright e2e stubs (skipped) for Wave 3 EngineCalibrationPanel + /insights surfaces
  - vitest.config.ts exclude rule for src/app/api/**/__tests__/**/*.live.test.ts so unit run stays clean
affects: [18-01, 18-02, 18-03, 18-04, 18-05, 18-08, 18-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 RED-stub convention: 1 active expect() that imports the not-yet-existing symbol + N it.todo entries enumerating pass criteria from RESEARCH §Validation Architecture"
    - "Live-DB cron tests live at src/app/api/cron/<name>/__tests__/<name>.live.test.ts and are excluded from npm test via *.live.test.ts glob (mirrors existing tests/integration/ exclusion)"

key-files:
  created:
    - src/lib/__tests__/learning.decay.test.ts
    - src/lib/__tests__/learning.ess.test.ts
    - src/lib/__tests__/learning.ph.test.ts
    - src/lib/__tests__/learning.drift.test.ts
    - src/lib/__tests__/cv.purgedkfold.test.ts
    - src/app/api/cron/learn/__tests__/learn.ess.live.test.ts
    - src/app/api/cron/learn/__tests__/learn.drift.live.test.ts
    - src/app/api/cron/backfill-ess/__tests__/backfill.live.test.ts
    - tests/e2e/engine-calibration-ess.spec.ts
    - tests/e2e/insights-ess-ci.spec.ts
  modified:
    - vitest.config.ts

key-decisions:
  - "Active assertion in each unit stub directly imports the not-yet-existing symbol so the suite goes RED at import time — Wave 1 implementers cannot accidentally claim victory on greppable code that isn't actually exercised."
  - "Live-DB cron stubs colocated with the route they exercise (src/app/api/cron/<name>/__tests__/) per the plan's prescribed paths. Added exclusion glob in vitest.config.ts so the unit suite stays distinguishable from integration stubs."
  - "Playwright stubs use test.skip(true, 'Wave N Plan ZZ fills this in') so the e2e CI suite stays GREEN until the rendering is real — RED in the e2e layer would falsely block unrelated PRs."
  - "D-08 raw N=30 floor and T-18-05 numeric-only contract literally encoded in test names + literal raw strings (rawN: 29, EXPLORATORY-WATCH, ess_backfill_complete, ENABLE_BACKFILL_ESS) so Wave 1+ implementers cannot misread the contract."

patterns-established:
  - "RED-on-import unit stub: import { newSymbol } from '@/lib/<module-not-yet-touched>' triggers a typed import failure, providing fail-fast feedback and a discoverable tombstone."
  - "Skipped-but-discoverable e2e stub: test.skip(true, '...') keeps the suite green while leaving a self-documenting marker for the implementing wave."
  - "Live-DB integration stubs naming convention: *.live.test.ts (excluded from unit run, includable by future cron-specific integration config)."

requirements-completed: [CORE-ML-01, CORE-ML-02, CORE-ML-03, CORE-ML-04, CORE-ML-05]

# Metrics
duration: 6min
completed: 2026-05-05
---

# Phase 18 Plan 00: Wave 0 Test Stubs Summary

**10 RED-or-skipped test stub files (5 unit + 3 live-DB cron + 2 Playwright e2e) wired to the symbols Wave 1+ will land — ESS, decayWeights, computeESS, pageHinkleyStatistic, confirmedDrift, purgedKFold — with D-08 N=30 floor and T-18-05 numeric-only contract encoded as literals.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-06T04:28:34Z
- **Completed:** 2026-05-06T04:34:42Z
- **Tasks:** 2 / 2
- **Files modified:** 11 (10 created + 1 vitest.config.ts edit)

## Accomplishments

- All 10 Wave 0 stubs from `18-VALIDATION.md` §"Wave 0 Requirements" exist on disk and pass acceptance.
- Five unit-test files RED on import — vitest discovers them and reports `5 failed | 4 failed | 16 todo (20)` exactly matching the plan's `<verification>` claim.
- Three live-DB cron stubs colocated with their routes (`src/app/api/cron/{learn,backfill-ess}/__tests__/`); each contains the exact literals (`effective_sample_size`, `EXPLORATORY-WATCH`, `raw N=29`, `ess_backfill_complete`, `ENABLE_BACKFILL_ESS`) the verifier will grep for.
- Two Playwright e2e stubs (`engine-calibration-ess.spec.ts`, `insights-ess-ci.spec.ts`) skip cleanly via `test.skip(true, ...)` so the e2e suite stays green until Waves 3-08/09 fill the bodies.
- No new dependencies, no production code touched (only `vitest.config.ts` exclusion rule adjusted).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write 5 unit-test stubs for learning.ts and cv.ts primitives** — `c38b12d` (test)
2. **Task 2: Write 3 live-DB integration test stubs and 2 Playwright e2e stubs** — `7016766` (test)
3. **Deviation: exclude *.live.test.ts colocated stubs from unit suite** — `add24d4` (chore — auto-fix per Rule 3, see Deviations section)

## Files Created/Modified

### Unit-test stubs (`src/lib/__tests__/`)
- `learning.decay.test.ts` — 1 active RED assert + 4 it.todo for CORE-ML-01 (`decayWeights`, D-03 e^-Δt/λ shape)
- `learning.ess.test.ts` — 1 active RED assert + 4 it.todo for CORE-ML-01 (Kish ESS = (Σw)²/Σw²)
- `learning.ph.test.ts` — 1 active RED assert + 4 it.todo for CORE-ML-04 (`pageHinkleyStatistic`, D-07 PH params)
- `learning.drift.test.ts` — 1 active RED assert + 4 it.todo for CORE-ML-04 (`confirmedDrift`, D-06 two-of-two + D-08 N=29 floor literally encoded)
- `cv.purgedkfold.test.ts` — 1 active RED assert + 4 it.todo for D-16 (`purgedKFold`, default purge=embargo=90)

### Live-DB integration stubs (`src/app/api/cron/.../__tests__/`)
- `learn/__tests__/learn.ess.live.test.ts` — 1 active RED assert (`@ts-expect-error` against `effective_sample_size` column) + 3 it.todo for CORE-ML-02
- `learn/__tests__/learn.drift.live.test.ts` — 1 placeholder pass + 4 it.todo for CORE-ML-04 drift_alert + EXPLORATORY-WATCH flip + N=29 floor + D-09 no-flap
- `backfill-ess/__tests__/backfill.live.test.ts` — 1 placeholder pass + 4 it.todo for D-13 idempotency + T-18-01/T-18-03 auth gates

### Playwright e2e stubs (`tests/e2e/`)
- `engine-calibration-ess.spec.ts` — 3 tests skipped via `test.skip(true, ...)` for CORE-ML-05 (ESS column + `regime stability: watching` badge + ≥4 ESS= count)
- `insights-ess-ci.spec.ts` — 1 test skipped via `test.skip(true, ...)` for CORE-ML-03 (sparse-recent vs sparse-old CI width comparison — LOOKS-DONE-BUT-ISN'T defence)

### Test infrastructure
- `vitest.config.ts` — added `'src/app/api/**/__tests__/**/*.live.test.ts'` to exclude list (mirrors existing `tests/integration/**` rule)

## Decisions Made

- **Active assertion in each unit stub** — prefer 1 RED assert over all-todo so the suite has a fail-fast tombstone Wave 1 implementers cannot ignore. This aligns with plan-author intent ("Tests-first prevents the executors from declaring victory on greppable code that isn't actually exercised").
- **Drift stub D-08 floor encoded with `rawN: 29`** — chosen over `30` to make the boundary defensive: `< 30` fails, so `29` documents the floor and exercises the strict-less-than path Wave 1 must implement.
- **Live-DB stubs use `void prisma`** to keep import live without triggering an unused-import lint warning while the file body is still placeholder. Wave 2 will replace `void prisma` with real query setup.
- **e2e skip via `test.skip(true, '...')` not `test.fixme`** — `skip(true, reason)` keeps the suite GREEN and surfaces the reason in test output, where `fixme` would mark them as expected-fail and pollute red-build signal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excluded `*.live.test.ts` colocated stubs from default vitest unit run**
- **Found during:** Verification after Task 2 commit
- **Issue:** Plan prescribed live-DB stubs at `src/app/api/cron/<name>/__tests__/<name>.live.test.ts`. The default `vitest.config.ts` include glob picks up everything in `src/**/__tests__/`, so all three stubs ran under `npm test` and failed at module load: `Error: DATABASE_URL environment variable is required but not set` (from `@/lib/db` `createPrismaClient`). This created an indistinguishable mix of "intended Wave 0 RED" + "unintended infrastructure RED" — verifier would treat both as failures.
- **Fix:** Added `'src/app/api/**/__tests__/**/*.live.test.ts'` as a fifth entry in `vitest.config.ts` `exclude` list, mirroring the pre-existing `'tests/integration/**'` rule. Added inline comment documenting the convention.
- **Files modified:** `vitest.config.ts`
- **Verification:** Re-ran `npm test -- --run`. Result: `Test Files: 5 failed | 36 passed | 1 skipped (42)` — exactly the 5 Wave 0 unit stubs RED, all pre-existing tests stable (36 pass, 1 skip). Matches plan's `<verification>` claim "discovers the 5 unit-test files and reports them as red".
- **Committed in:** `add24d4` (separate commit `chore(18-00): exclude *.live.test.ts colocated stubs from unit suite`)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary correctness fix to make `npm test` distinguishable for the verifier. No scope creep — additive single-line glob change. Future Waves remain unaffected; the live-DB stubs become reachable once a `vitest.cron-integration.config.ts` (or similar) is added in Plan 18-04 / 18-05.

## Issues Encountered

- During the deviation diagnosis I ran `git stash push vitest.config.ts && git stash pop` which inadvertently popped a pre-existing stash (`stash@{0}: WIP on worktree-agent-ab4d6528`) leftover from another worktree, polluting the working tree with merge conflicts across 18 unrelated files (edgar.ts, insider.ts, schema.prisma, etc.). Recovered cleanly with `git checkout HEAD -- . && git clean -fd`. No commits were affected; both Task 1 and Task 2 commits remained intact at HEAD. The lesson — favor a non-destructive read-only diagnostic flow on shared worktrees that may carry pre-existing stashes from other agents.

## User Setup Required

None — no external service configuration required. All stubs run against existing Vitest + Playwright infrastructure with no new env vars or dashboards.

## Next Phase Readiness

Wave 1 (Plans 18-01 + 18-02) can now begin. The 10 stubs serve as the verifier's contract:

- **Plan 18-01 must export from `src/lib/learning.ts`:** `WeightedObservation`, `decayWeights`, `computeESS`, `updatePosteriorWeighted`, `pageHinkleyStatistic`, `confirmedDrift`, `STATUS_VALUES`, `LearnedStatus`. The 4 unit stubs (`learning.decay/ess/ph/drift.test.ts`) flip to GREEN when these symbols + their pass criteria land.
- **Plan 18-02 must create `src/lib/cv.ts`** exporting `Observation`, `Fold`, `purgedKFold`. The `cv.purgedkfold.test.ts` stub flips to GREEN when this lands.
- **Plan 18-04 fills in `learn.ess.live.test.ts` + `learn.drift.live.test.ts`** assertions and migration adds `effective_sample_size` column to `LearnedPattern`.
- **Plan 18-05 creates `src/app/api/cron/backfill-ess/route.ts`** and fills in `backfill.live.test.ts`.
- **Plans 18-08 + 18-09 remove `test.skip(true, ...)`** from the two Playwright stubs once `EngineCalibrationPanel` renders ESS and `/insights` shows the CI-width comparison.

No blockers carried into Wave 1. The vitest exclude rule in `vitest.config.ts` is forward-compatible with any future `vitest.cron-integration.config.ts` whose `include` glob explicitly captures `**/*.live.test.ts`.

## Self-Check: PASSED

- `src/lib/__tests__/learning.decay.test.ts` — FOUND
- `src/lib/__tests__/learning.ess.test.ts` — FOUND
- `src/lib/__tests__/learning.ph.test.ts` — FOUND
- `src/lib/__tests__/learning.drift.test.ts` — FOUND
- `src/lib/__tests__/cv.purgedkfold.test.ts` — FOUND
- `src/app/api/cron/learn/__tests__/learn.ess.live.test.ts` — FOUND
- `src/app/api/cron/learn/__tests__/learn.drift.live.test.ts` — FOUND
- `src/app/api/cron/backfill-ess/__tests__/backfill.live.test.ts` — FOUND
- `tests/e2e/engine-calibration-ess.spec.ts` — FOUND
- `tests/e2e/insights-ess-ci.spec.ts` — FOUND
- Commit `c38b12d` — FOUND
- Commit `7016766` — FOUND
- Commit `add24d4` — FOUND

---
*Phase: 18-time-decayed-bayesian-updates-ess*
*Completed: 2026-05-05*
