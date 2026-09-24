---
phase: 24-composite-signal-synthesis
plan: 00
subsystem: schema-migration + test-scaffolding
tags: [prisma, composite-signal, isotonic, red-stubs, wave-0, hyperparameters]
dependency_graph:
  requires:
    - "Phase 21.1 ship (2026-06-08 — evaluation primitives, 5-gate patternStatus)"
    - "Phase 22 ship (2026-09-01 — regime axis on LearnedPattern + SourceMixRow)"
  provides:
    - "prisma/schema.prisma — CompositeCalibrationSnapshot model (15 fields + 2 indexes) live in Neon"
    - "HYPERPARAMETERS.md — Phase 24 section pinning 11 composite hyperparameters (D-01..D-07 + CLAUDE.md §8)"
    - "src/lib/composite/types.ts — CorpReliabilityResult re-export pin (kills the silent ECE=0 default)"
    - "tests/composite/ — 11 RED test scaffolds + 3 fixtures (2 golden JSON + 1 coverage-probe SQL)"
    - "24-DISCUSSION-LOG.md Wave 0 coverage probe: 0.333 recorded, ship gate deferred (option b)"
  affects:
    - "Wave 1 (24-01) — src/lib/composite/{compose,weights,isotonic-serde}.ts turn ess-weighted-mean + fallback-gate + isotonic-fit RED tests GREEN"
    - "Wave 2 (24-02) — src/lib/composite/isotonic-fit.ts + fit-composite-isotonic.ts CLI turn bootstrap-ci + logistic-baseline GREEN"
    - "Wave 3 (24-03) — EngineContext + /api/cron/composite-calibration + gemini-analysis.ts post-process overwrite turn schema-negative-shape + engine-context + gemini-analysis-composite-overwrite + reliability-bins GREEN"
    - "Wave 4 (24-04) — CompositeHeadline component + /insights/calibration integration turn panel-headline + insights-render GREEN; scripts/check-composite-ship-gate.ts enforces the 0.50 coverage threshold once organic ACTIVE cells accumulate"
tech_stack:
  added: []
  patterns:
    - "additive Prisma migration (CompositeCalibrationSnapshot mirrors TemperatureCalibration blueprint at schema.prisma:199-219; zero drops)"
    - "RED-scaffold-first — 11 test files import not-yet-existing Wave 1-4 modules; vitest exits 1 by design"
    - "type-boundary pin — src/lib/composite/types.ts re-exports CorpReliabilityResult so Wave 3 cron cannot silently `as unknown as { bins?: unknown[] }` its way to ECE=0"
    - "operator-gated schema push — [BLOCKING] checkpoint for `npx prisma db push --accept-data-loss` (mirrors P22-00 Task 3 and P27-01 pattern)"
    - "Pitfall 5 coverage probe as ship gate — measured on live Neon before Wave 4 promotion, not asserted in unit tests"
key_files:
  created:
    - "src/lib/composite/types.ts"
    - "tests/composite/isotonic-fit.unit.test.ts"
    - "tests/composite/ess-weighted-mean.unit.test.ts"
    - "tests/composite/bootstrap-ci.unit.test.ts"
    - "tests/composite/fallback-gate.unit.test.ts"
    - "tests/composite/engine-context-composite.int.test.ts"
    - "tests/composite/schema-negative-shape.unit.test.ts"
    - "tests/composite/reliability-bins.int.test.ts"
    - "tests/composite/panel-headline.unit.test.tsx"
    - "tests/composite/insights-render.int.test.tsx"
    - "tests/composite/gemini-analysis-composite-overwrite.int.test.ts"
    - "tests/composite/logistic-baseline.unit.test.ts"
    - "tests/composite/_fixtures/golden-isotonic.json"
    - "tests/composite/_fixtures/golden-ess-weighted.json"
    - "tests/composite/_fixtures/coverage-probe.sql"
  modified:
    - "prisma/schema.prisma"
    - "HYPERPARAMETERS.md"
    - ".planning/phases/24-composite-signal-synthesis/24-DISCUSSION-LOG.md"
decisions:
  - "D-07 ship gate DEFERRED not RELAXED — coverage=0.333 on live Neon today (< 0.50 threshold). MIN_CLASSES_ACTIVE=2 stays pinned; Wave 4's scripts/check-composite-ship-gate.ts will refuse promotion until organic P21.1-promoted ACTIVE cells rise. This is the gate doing its job, not a defect."
  - "Coverage-probe scaffold defect corrected in-flight — original SQL used non-existent LearnedPattern.patternStatus; live Prisma column is `status` (P21.1 5-gate promotion values land there). Fixed in 8d65470."
  - "12 validation targets from 24-VALIDATION.md all have RED scaffolds landed — Wave 1-4 executors turn them GREEN one-by-one."
  - "CLAUDE.md §8 non-LLM baseline scaffold present at scaffold level (logistic-baseline.unit.test.ts) — Wave 2 will land the actual logistic36Brier implementation."
  - "Wave 3 REASON-05 trust-boundary defense pre-armed — schema-negative-shape.unit.test.ts asserts analysisResultSchema.shape does NOT contain composite_prob; gemini-analysis-composite-overwrite.int.test.ts asserts the post-process overwrites all 7 composite fields."
patterns-established:
  - "Composite-signal type pin — src/lib/composite/types.ts is the single import site for CorpReliabilityResult across all downstream waves; Wave 3 cron must import from here, not @/lib/stats/isotonic directly"
  - "RED-scaffold-first with operator coverage gate — schema + hyperparameters + tests land in one plan; live-DB coverage probe records the ship-gate threshold before any implementation code exists"
  - "Deferred-not-relaxed ship gate — when a measured coverage falls below the pinned threshold, HYPERPARAMETERS.md and ship-gate script both stay honest; the gate simply blocks promotion until organic data catches up"

requirements-completed: [REASON-01, REASON-02, REASON-03, REASON-04, REASON-05]

metrics:
  duration_minutes: "~90 (multi-session, spanning 2026-09-18 through 2026-09-23 to accommodate operator-run BLOCKING db push + coverage probe)"
  completed_date: "2026-09-23"
  tasks_completed: "6 of 6 (2 [BLOCKING] operator-run checkpoints resolved: Task 2 db push, Task 6 coverage probe)"
  files_created: 15
  files_modified: 3
  loc_added: "~490 (63 hyperparameters + ~330 test scaffolds + ~55 schema + 3 types.ts + fixtures)"
---

# Phase 24 Plan 00: Wave 0 — Schema + Hyperparameters + RED Scaffolds Summary

**Additive `CompositeCalibrationSnapshot` model (15 fields + 2 indexes) live in Neon; HYPERPARAMETERS.md pins all 11 Phase 24 knobs (D-01..D-07 + CLAUDE.md §8); 11 RED test scaffolds + 3 fixtures import not-yet-existing Wave 1-4 modules so downstream waves have a machine-checkable contract to turn GREEN against; Pitfall-5 coverage probe recorded on live Neon (0.333) — ship gate deferred not relaxed.**

## Performance

- **Duration:** ~90 min across sessions (multi-session to accommodate 2 [BLOCKING] operator checkpoints)
- **Started:** 2026-09-18T12:21:00Z
- **Completed:** 2026-09-23T19:33:00Z
- **Tasks:** 6 (4 auto + 2 [BLOCKING] operator-run)
- **Files created:** 15
- **Files modified:** 3

## Accomplishments

- **Persistence surface for the composite pipeline live in Neon.** `CompositeCalibrationSnapshot` (15 fields + 2 indexes: `idx_ccs_classifier_computed`, `idx_ccs_computed_at`) mirrors the `TemperatureCalibration` blueprint. Operator confirmed `npx prisma db push --accept-data-loss` → "in sync"; `npx prisma generate` produced 452 references to the new type in `.prisma/client/index.d.ts`.
- **All 11 Phase 24 hyperparameters pinned in `HYPERPARAMETERS.md` §Phase 24 — Composite Signal Synthesis.** MIN_CLASSES_ACTIVE=2, CI_WIDEN_FACTOR=√(4/K), MIN_N_FIT_PER_CLASS=50, MIN_N_HOLDOUT=100, BOOTSTRAP_N_RESAMPLES=1000, CI_CRON_SCHEDULE='0 3 * * *', CIPHER_COMPOSITE_CLASSIFIER_VERSION='cipher-composite-v1', SHIP_GATE_BRIER_MAX=0.24, SHIP_GATE_ECE_MAX=0.05, SHIP_GATE_COVERAGE_MIN=0.50, SHIP_GATE_BASELINE_LIFT_MIN=0.005.
- **11 RED test scaffolds + 3 fixtures landed in `tests/composite/`.** All 12 validation targets from `24-VALIDATION.md` covered; RED confirmed via `vitest` → exit 1, 11 files failed, 21 tests failed (expected — imports point at not-yet-existing Wave 1-4 modules).
- **CorpReliabilityResult type boundary pinned** at `src/lib/composite/types.ts` — kills the silent-ECE=0-default footgun the punch list flagged. Wave 3 cron must import from this single site.
- **Pitfall-5 coverage probe executed on live Neon.** Result: `coverage_fraction = 0.3333333333333333` (below D-07 ship gate threshold of 0.50). Decision option (b): defer ship gate enforcement, keep methodology intact. Recorded in `24-DISCUSSION-LOG.md`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CompositeCalibrationSnapshot to Prisma schema + pin CorpReliabilityResult type** — `958694a` (feat)
2. **Task 2: [BLOCKING] Push schema to Neon** — operator-run (no commit; `npx prisma db push --accept-data-loss` → "in sync"; `npx prisma generate` → v7.7.0; 452 references to `CompositeCalibrationSnapshot` in generated client)
3. **Task 3: Append Phase 24 section to HYPERPARAMETERS.md** — `3a93dc7` (docs) — 63 lines pinning 11 hyperparameters
4. **Task 4: Create 11 RED test scaffolds + 3 fixtures** — `f564f13` (test)
5. **Task 5: Confirm RED state** — no commit (`vitest` → exit 1, 11 files failed, 21 tests failed as designed)
6. **Task 6: [BLOCKING] Coverage probe on Neon (Pitfall 5 gate)** — `8d65470` (test) — fixed scaffold column-name defect (`status` not `patternStatus`); recorded `coverage_fraction=0.333` in DISCUSSION-LOG with decision-option-(b) rationale

**Plan metadata:** committed in this final metadata pass (SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified

- `prisma/schema.prisma` — Added `CompositeCalibrationSnapshot` model (15 fields + 2 indexes)
- `HYPERPARAMETERS.md` — Appended `## Phase 24 — Composite Signal Synthesis` section (63 lines pinning 11 hyperparameters with rationale)
- `src/lib/composite/types.ts` — Re-exports `CorpReliabilityResult` from `@/lib/stats/isotonic` (pins the type boundary Wave 3 must import through)
- `tests/composite/isotonic-fit.unit.test.ts` — RED scaffold for Wave 1 isotonic-fit + serde (33 lines)
- `tests/composite/ess-weighted-mean.unit.test.ts` — RED scaffold for Wave 1 `composeSignal()` (68 lines)
- `tests/composite/bootstrap-ci.unit.test.ts` — RED scaffold for Wave 2 BCa composite CI (21 lines)
- `tests/composite/fallback-gate.unit.test.ts` — RED scaffold for Wave 1/2 `widenCi()` K∈{1,2,3,4} + K<2 suppression (38 lines)
- `tests/composite/engine-context-composite.int.test.ts` — RED scaffold for Wave 3 EngineContext extension (16 lines)
- `tests/composite/schema-negative-shape.unit.test.ts` — RED scaffold for Wave 3 REASON-05 trust-boundary assertion (14 lines; `analysisResultSchema.shape` must NOT contain `composite_prob`)
- `tests/composite/reliability-bins.int.test.ts` — RED scaffold for Wave 3 CORP reliability-bin persistence (10 lines)
- `tests/composite/panel-headline.unit.test.tsx` — RED scaffold for Wave 4 `CompositeHeadline` component (18 lines)
- `tests/composite/insights-render.int.test.tsx` — RED scaffold for Wave 4 `/insights/calibration` cipher-composite-v1 card (9 lines)
- `tests/composite/gemini-analysis-composite-overwrite.int.test.ts` — RED scaffold for Wave 3 Task 24-03-04 post-process overwrite of 7 composite fields (33 lines) — directly defends Blocker #1 from the punch list
- `tests/composite/logistic-baseline.unit.test.ts` — RED scaffold for Wave 2 Task 24-02-03 `logistic36Brier` non-LLM baseline per CLAUDE.md §8 (40 lines)
- `tests/composite/_fixtures/golden-isotonic.json` — Golden fit vector for `isotonic-fit.unit.test.ts`
- `tests/composite/_fixtures/golden-ess-weighted.json` — Golden weighted-mean vector for `ess-weighted-mean.unit.test.ts`
- `tests/composite/_fixtures/coverage-probe.sql` — SQL that measures % of tickers with ≥2 ACTIVE distinct signal_classes at horizon_days=30, regime='ALL' (Pitfall 5 gate)
- `.planning/phases/24-composite-signal-synthesis/24-DISCUSSION-LOG.md` — Appended "Wave 0 coverage probe" section with result + rationale for option (b)

## Decisions Made

- **D-07 ship gate deferred, not relaxed.** Live Neon returns `coverage_fraction=0.333` today (below 0.50). Wave 4's `scripts/check-composite-ship-gate.ts` will build the 0.50 threshold enforcement and correctly refuse promotion until organic P21.1-promoted ACTIVE cells accumulate across cap_class dimensions. Currently 1 of 3 cap_class cells has ≥2 ACTIVE distinct signal_class rows at horizon_days=30 / regime='ALL'.
- **Coverage-probe scaffold defect corrected in-flight.** Original SQL used non-existent LearnedPattern.`patternStatus` column; live Prisma-generated column is `status` (P21.1 5-gate promotion values `NOT_ENOUGH_DATA` / `CANDIDATE` / `ACTIVE` / `RETIRED` land there). Fix committed in `8d65470`.
- **Rejected: (a) drop MIN_CLASSES_ACTIVE to 1.** Defeats the point of "composite" — a single-signal composite is definitionally not a composite.
- **Rejected: (c) widen regime slice in the coverage probe.** The LIVE `engine-context.ts` reads `regime='ALL'` at report time; widening the probe would misrepresent what production actually sees.
- **CorpReliabilityResult type pin at `src/lib/composite/types.ts` is mandatory.** The punch list flagged that Wave 3 cron previously used `as unknown as { bins?: unknown[] }` casts that silently defaulted ECE to 0 when the shape drifted. This module makes drift a compile-time error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Coverage-probe SQL referenced non-existent column `patternStatus`**
- **Found during:** Task 6 ([BLOCKING] coverage probe against live Neon)
- **Issue:** Original scaffold SQL in `tests/composite/_fixtures/coverage-probe.sql` referenced `LearnedPattern.patternStatus`, which does not exist. The P21.1 5-gate promotion values land in the Prisma-generated column named `status`. Running the SQL as-committed produced a Postgres error `column "patternStatus" does not exist`.
- **Fix:** Renamed all references from `patternStatus` to `status` in the SQL scaffold. Re-ran probe against live Neon, got clean `coverage_fraction=0.3333333333333333`.
- **Files modified:** `tests/composite/_fixtures/coverage-probe.sql`
- **Verification:** Operator ran the fixed SQL against live Neon; numeric result recorded in `24-DISCUSSION-LOG.md` § Wave 0 coverage probe.
- **Committed in:** `8d65470` (Task 6 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — Rule 1)
**Impact on plan:** Scaffold defect only; no impact on downstream waves. The probe still ran to completion once fixed, and the resulting 0.333 measurement is the load-bearing input for the D-07 ship gate decision.

## Issues Encountered

- **Coverage below D-07 ship-gate threshold (0.333 vs 0.50).** Not an execution defect — this is the measured state of live Neon and reflects P21.1 5-gate promotion having only produced ≥2 ACTIVE distinct signal_classes for 1 of 3 cap_class cells at horizon_days=30. Resolved via decision option (b): defer ship gate enforcement (Wave 4 script will do the blocking); do not relax MIN_CLASSES_ACTIVE (methodology intact). Coverage will improve organically as more cells promote.

## User Setup Required

None — no new external service configuration. The [BLOCKING] `prisma db push --accept-data-loss` was executed by the operator during Task 2 against the existing Neon connection (no new credentials); the SQL coverage probe (Task 6) ran through the same connection.

## Next Phase Readiness

**Wave 1 (24-01-PLAN.md) is unblocked.** The RED scaffolds in `tests/composite/` are the machine-checkable contract Wave 1 turns GREEN:

| Wave 1 deliverable | Turns GREEN |
|--------------------|-------------|
| `src/lib/composite/compose.ts` exporting `composeSignal()` (ESS-weighted mean) | `ess-weighted-mean.unit.test.ts` |
| `src/lib/composite/weights.ts` exporting `widenCi()` (√(4/K) + renormalize) + K<2 suppression | `fallback-gate.unit.test.ts` |
| `src/lib/composite/isotonic-serde.ts` (isotonic fit persistence) | `isotonic-fit.unit.test.ts` |
| `src/lib/composite/index.ts` barrel re-exporting the three | (import-resolution for downstream waves) |

**Concerns for Wave 4:**
- Ship-gate coverage is 0.333 today — organic promotion of P21.1 5-gate `ACTIVE` patterns needs to lift ≥2 more cap_class cells to hit ≥2 distinct signal_classes before `scripts/check-composite-ship-gate.ts` will let promotion through. This is the gate doing its job; no action required in Wave 1-3.

## Threat-Surface Check

No new threat surface beyond what the plan's threat model already enumerated:

- Operator-gated DDL push (Task 2) — [BLOCKING] checkpoint enforced this.
- Type-boundary pin at `src/lib/composite/types.ts` — reduces the "silent ECE=0" attack surface Wave 3 would otherwise inherit.
- Coverage-probe SQL is read-only against Neon (no writes, no DDL); credentials operator-held.
- RED scaffolds import not-yet-existing modules; no runtime side-effects.

No `threat_flags` to record.

## Self-Check: PASSED

Verified all artifacts on disk and all task commits in git history:

```
FOUND: prisma/schema.prisma                                              (modified — CompositeCalibrationSnapshot present)
FOUND: HYPERPARAMETERS.md                                                (modified — ## Phase 24 section at L878)
FOUND: src/lib/composite/types.ts                                        (created)
FOUND: tests/composite/isotonic-fit.unit.test.ts                         (33 lines)
FOUND: tests/composite/ess-weighted-mean.unit.test.ts                    (68 lines)
FOUND: tests/composite/bootstrap-ci.unit.test.ts                         (21 lines)
FOUND: tests/composite/fallback-gate.unit.test.ts                        (38 lines)
FOUND: tests/composite/engine-context-composite.int.test.ts              (16 lines)
FOUND: tests/composite/schema-negative-shape.unit.test.ts                (14 lines)
FOUND: tests/composite/reliability-bins.int.test.ts                      (10 lines)
FOUND: tests/composite/panel-headline.unit.test.tsx                      (18 lines)
FOUND: tests/composite/insights-render.int.test.tsx                      (9 lines)
FOUND: tests/composite/gemini-analysis-composite-overwrite.int.test.ts   (33 lines)
FOUND: tests/composite/logistic-baseline.unit.test.ts                    (40 lines)
FOUND: tests/composite/_fixtures/golden-isotonic.json                    (created)
FOUND: tests/composite/_fixtures/golden-ess-weighted.json                (created)
FOUND: tests/composite/_fixtures/coverage-probe.sql                      (21 lines)
FOUND: commit 958694a (feat 24-00 Prisma schema + type pin)
FOUND: commit 3a93dc7 (docs 24-00 Phase 24 hyperparameters section)
FOUND: commit f564f13 (test 24-00 11 RED scaffolds + 3 fixtures)
FOUND: commit 8d65470 (test 24-00 coverage-probe column fix + result 0.333)
```

(self-check commands: `[ -f path ] && echo FOUND || echo MISSING` for each path; `git log --oneline -1 <hash>` for each commit hash; `grep -n "Phase 24" HYPERPARAMETERS.md` for section presence; `grep -c "CompositeCalibrationSnapshot" prisma/schema.prisma` for schema presence)

---
*Phase: 24-composite-signal-synthesis*
*Completed: 2026-09-23*
