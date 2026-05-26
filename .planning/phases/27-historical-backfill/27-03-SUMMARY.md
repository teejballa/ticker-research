---
phase: 27-historical-backfill
plan: "03"
subsystem: learning
tags: [learning, promotion-gate, cron, hyperparameters, bayesian, backfill]

requires:
  - phase: 27-historical-backfill
    plan: "01"
    provides: SentimentSnapshot.source column + COVERAGE-10 RED stub in backfill-live-gate.test.ts
  - phase: 27-historical-backfill
    plan: "02"
    provides: source propagated into posterior_update delta + enforceLiveOnlyGate applied in recomputeOneCell

provides:
  - D-01 posterior-invariance regression test pinning that 5y-old backfill rows contribute negligible weight (< 1e-10) and shift live posterior by < 1e-6
  - LIVE_OUTCOME_THRESHOLD documented in HYPERPARAMETERS.md with D-10 rationale and D-01 posterior interaction note

affects: [phase-23-lift-gate, learning-engine-cron, insights-dashboard]

tech-stack:
  added: []
  patterns:
    - "D-01 invariant encoded as a pure unit test against decayWeights + updatePosteriorWeighted + posteriorMean"
    - "Decay-zeroing assertion: exp(-1825d/60d) < 1e-10 pins that no posterior exclusion filter is needed for old backfill rows"

key-files:
  created: []
  modified:
    - tests/unit/backfill-live-gate.test.ts
    - HYPERPARAMETERS.md

key-decisions:
  - "D-01 test asserts against decayWeights directly — the invariant is that Phase 18 decay already zeroes 5y-old rows, so no exclusion filter is needed in the posterior path"
  - "LIVE_OUTCOME_THRESHOLD=10 documented as static; recalibration deferred to Phase 23 lift-gate evidence"
  - "Legacy LearningEvents without delta.source count as live (back-compat) — intentional per T-27-13"

patterns-established:
  - "Posterior-invariance tests: directly exercise decayWeights + updatePosteriorWeighted + posteriorMean with fixed timestamps to pin decay semantics"

requirements-completed: [COVERAGE-10]

duration: 7min
completed: "2026-05-26"
---

# Phase 27 Plan 03: Historical Backfill — Live-Gate Summary

**D-01 posterior-invariance regression (backfill rows negligible at lambda=60d) + LIVE_OUTCOME_THRESHOLD=10 documented in HYPERPARAMETERS.md; all 6 tests in backfill-live-gate.test.ts GREEN**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-26T21:42:00Z
- **Completed:** 2026-05-26T21:49:22Z
- **Tasks:** 1 (Task 3 only — Tasks 1+2 were pre-committed)
- **Files modified:** 2

## Accomplishments

- Added `describe('backfill rows do not move the live posterior (D-01)')` block to `tests/unit/backfill-live-gate.test.ts` with two assertions: (1) a 5y-old observation's decay weight is < 1e-10 (exp(-1825/60) ≈ 1.5e-13), and (2) the posterior mean shift from adding a 5y-old row alongside one fresh live hit is < 1e-6 — confirming no exclusion filter is needed
- Appended `live_outcome_gate` section to `HYPERPARAMETERS.md` documenting `LIVE_OUTCOME_THRESHOLD=10`, D-10 rationale, provenance via `delta.source`, D-01 posterior interaction, and recalibration cadence
- Full test suite: 1815 passing, 0 regressions; `npx tsc --noEmit` clean

## Task Commits

1. **Task 1: enforceLiveOnlyGate + LIVE_OUTCOME_THRESHOLD pure helper** - `0fd32d4` (feat)
2. **Task 2: Propagate source into posterior_update delta + apply gate** - `04af524` (feat)
3. **Task 3: D-01 regression test + HYPERPARAMETERS doc** - `5b84cf8` (test)

## Files Created/Modified

- `tests/unit/backfill-live-gate.test.ts` — Added D-01 describe block (2 tests); also updated imports to include `decayWeights`, `updatePosteriorWeighted`, `posteriorMean`
- `HYPERPARAMETERS.md` — Appended `live_outcome_gate` section with LIVE_OUTCOME_THRESHOLD=10 documentation

## Decisions Made

- D-01 test directly exercises the Phase 18 decay primitives (`decayWeights` / `updatePosteriorWeighted` / `posteriorMean`) with a fixed `now` timestamp so the assertion is deterministic and bitwise reproducible across runs
- Threshold documented as static — no calibration cadence defined until Phase 23 lift-gate accumulates enough live evidence to inform a revision
- Legacy events without `delta.source` count as live (back-compat) — this is the T-27-13 intentional accept: pre-Phase-27 events ARE live data

## Deviations from Plan

None — plan executed exactly as written. Function signatures (`decayWeights`, `updatePosteriorWeighted`, `posteriorMean`) matched the plan's code template exactly; no argument-shape adjustments were needed.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 27-03 fully complete: COVERAGE-10 GREEN (Tasks 1+2), D-01 invariant pinned (Task 3), LIVE_OUTCOME_THRESHOLD documented
- Phase 27 Plan 04 (the backfill CLI / historical data ingestion) can proceed — all gate infrastructure is in place
- No blockers

---
*Phase: 27-historical-backfill*
*Completed: 2026-05-26*
