---
phase: 19
plan: 19-A-05
subsystem: learning-engine
tags: [alpha-decay-monitor, rolling-ic, spearman, vercel-cron, ml-hygiene, d-21]
dependency_graph:
  requires:
    - 19-Z-01  # features.ts (flag wiring; not used by these primitives)
    - 19-Z-02  # LearnedPattern.rolling_ic_20d + ic_decay_flag columns
    - 19-Z-03  # shadow-runner + verdict CLI (parallel infra)
    - 19-Z-04  # model-card-status (consumes ic_decay_flag in punch list)
    - 19-A-01  # HYPERPARAMETERS Zod schema (compatible patterns)
  provides:
    - "rollingSpearmanIC() pure function in src/lib/reasoning/alpha-decay-monitor.ts"
    - "isDecayConfirmed() pure function (5-of-5 below threshold rule)"
    - "isDecayCleared() pure function (3-of-3 above threshold rule)"
    - "/api/cron/alpha-decay-watch route — daily 06:00 UTC cron"
    - "scripts/alpha-decay-cron-benchmark.ts (operator runtime gate)"
    - "tests/integration/alpha-decay-watch.live.test.ts (5 live-DB tests)"
  affects:
    - "LearnedPattern.rolling_ic_20d populated daily across all 4 signal classes"
    - "LearnedPattern.ic_decay_flag toggled per asymmetric state machine"
    - "v2.0 P22 (Composite Signal Synthesis) gains an alpha-decay tripwire input"
    - "EngineCalibrationPanel will surface ic_decay_flag via 19-Z-04 gate"
tech_stack:
  added: []
  patterns:
    - "Spearman rank-IC (Pearson of midranks; ties handled correctly)"
    - "Asymmetric sticky state machine (5-day confirm, 3-day clear)"
    - "Per-signal-class IC broadcast (one IC per class → all class cells)"
    - "Stateless cron derivation (no rolling_ic_history JSONB column needed)"
    - "Bearer ${CRON_SECRET} auth (mirrors /api/cron/learn pattern)"
key_files:
  created:
    - "src/lib/reasoning/alpha-decay-monitor.ts"
    - "src/app/api/cron/alpha-decay-watch/route.ts"
    - "tests/lib/reasoning/alpha-decay-monitor.test.ts"
    - "tests/integration/alpha-decay-watch.live.test.ts"
    - "scripts/alpha-decay-cron-benchmark.ts"
    - ".planning/phases/19-cipher-v2-0-excellence/19-A-05-SUMMARY.md"
    - ".planning/phases/19-cipher-v2-0-excellence/deferred-items.md"
  modified:
    - "vercel.json (registered alpha-decay-watch cron at 0 6 * * *)"
    - "package.json (added alpha-decay-cron-benchmark npm script)"
decisions:
  - "[Rule 1 - Bug] Refactored cron from per-cell IC to per-signal-class IC. Per-cell IC is degenerate: a single cell has only one posterior mean as prediction → Pearson denominator collapses to 0 → IC = 0 always → spurious flag confirmation. Per-class IC uses cross-cell prediction variance, matching CONTEXT.md D-21 (\"per signal class\")."
  - "Stateless derivation chosen over rolling_ic_history JSONB column. Re-binns posterior_update LearningEvents into daily rolling-IC values each cron tick. No 19-Z-02 schema reissue needed."
  - "EXPLORATORY cells excluded from both IC computation AND broadcast updates. Rationale: low ESS = high sampling noise that would thrash the flag. Only cells past first-touch contribute."
  - "ic_decay_flag is sticky on insufficient evidence. If isDecayCleared can't prove 3 consecutive recoveries (e.g. due to data sparsity), flag stays true. Default-true bias is intentional — clearance must be explicit."
  - "Schedule 0 6 * * * (06:00 UTC) chosen over the originally-proposed pre-market timing because /api/cron/price-followup also runs at 06:00 UTC and completes in seconds; no contention risk and both crons settle before /api/cron/learn at 07:30 UTC."
metrics:
  duration: ~17min (single agent, sequential execution)
  tasks_completed: 7 (all of Task 1, 2, 3, 4, 5, 5b, 6)
  files_created: 7
  files_modified: 2
  unit_tests_added: 9 (all GREEN)
  integration_tests_added: 5 (all GREEN against live Neon)
  benchmark_elapsed_ms: 356
  benchmark_verdict: "< 100s — safe within 300s ceiling, ship"
  fallback_activated: "none"
completed_date: "2026-05-08"
---

# Phase 19 Plan 19-A-05: Rolling 20d rank-IC monitor + alpha-decay-watch cron Summary

Daily cron + pure-function alpha-decay tripwire wire up the per-signal-class
rolling 20-day Spearman rank-IC monitor specified in CONTEXT D-21, with
`ic_decay_flag` toggled via an asymmetric (5-day confirm / 3-day clear)
state machine and broadcast to every non-EXPLORATORY cell of the class.

## What Shipped

### Pure-function module — `src/lib/reasoning/alpha-decay-monitor.ts`

Three DB-free numerical primitives, mirroring the `src/lib/learning.ts`
purity rule. Zero imports — no Prisma, no `@/lib/db`, no third-party
math libs:

- `rollingSpearmanIC({predictions, realizedReturns}): number` —
  Spearman rank-IC via midrank-of-ties Pearson. Returns 0 (not NaN) when
  either rank vector has zero variance. Throws on length mismatch.
- `isDecayConfirmed(rollingICs, threshold=0.02, consecutiveDays=5)` —
  D-21: returns true when last 5 ICs all `< threshold`. False on
  insufficient history (we never confirm on too-little evidence).
- `isDecayCleared(rollingICs, threshold=0.02, consecutiveDays=3)` —
  symmetric clearance — last 3 ICs all `>= threshold`. Faster recovery
  than confirmation because false-negative cost is asymmetric (a stuck-
  true flag silently suppresses Engine Calibration).

### Cron route — `/api/cron/alpha-decay-watch`

`maxDuration = 300`. Auth: `Bearer ${process.env.CRON_SECRET}` (mirrors
`/api/cron/learn`). Per signal class:

1. Load all non-EXPLORATORY cells of the class.
2. Build a (pattern_key, cap_class, horizon_days) → `posteriorMean` map
   so each event in the class gets a meaningful prediction.
3. Pull all `posterior_update` LearningEvents within the 30-day history
   window for the class.
4. For each day in the history window, compute the trailing-20-day
   Spearman rank-IC across (prediction, alpha-vs-SPY) pairs. Skip days
   with `< 5` paired observations OR `< 2` distinct prediction values
   (avoids the constant-prediction degeneracy).
5. Run the asymmetric state machine on the IC series.
6. `prisma.learnedPattern.updateMany` writes today's IC + new flag to
   every non-EXPLORATORY cell of the class.

### Vercel cron registration — `vercel.json`

Added entry:
```json
{ "path": "/api/cron/alpha-decay-watch", "schedule": "0 6 * * *" }
```
Runs daily at 06:00 UTC (Pro plan; project already runs 4 crons total).

### Tests

- **9 unit tests** (`tests/lib/reasoning/alpha-decay-monitor.test.ts`) —
  pinned vectors for IC values, midrank tie handling, length-mismatch
  throw, 5/5 confirmation, 3/3 clearance.
- **5 integration tests** (`tests/integration/alpha-decay-watch.live.test.ts`) —
  401 on missing/wrong auth; happy path with 2 cells; confirmation flips
  flag on every class cell; sticky default keeps flag true on
  insufficient recovery evidence; cleanup helper verification. Runs
  against live `DATABASE_URL` from `.env.local`; auto-skips when DB
  unavailable.

### Benchmark — `scripts/alpha-decay-cron-benchmark.ts`

`npm run alpha-decay-cron-benchmark` invokes the route handler against
live Neon. Logs `elapsed_ms` + JSON response. Gates against 200s with
exit-1, warns at 100s, ships green below 100s.

**Live result (2026-05-08 03:44 UTC):**
- `elapsed_ms = 356`
- `status = 200`
- Verdict: `< 100s — safe within 300s ceiling, ship.`

## Task 5b Benchmark Detail

The benchmark hit 356ms — far below the 100s threshold. The current
production Neon universe has 51 LearnedPattern rows, **all
EXPLORATORY** (post-Phase-18 ESS gate tightening pushed every cell back
to EXPLORATORY pending recovery). The cron correctly returns
`reason: 'no-cells'` for every signal class because there are no
non-EXPLORATORY cells to broadcast to.

This means the 356ms reflects **empty-work-path** runtime, not a
realistic worst-case. Stress-test against a populated universe is
deferred until ACTIVE cells repopulate (calendar-gated — first 30d
outcomes from post-Phase-18 ingestion will resolve in late May 2026).

**Plan-documented fallback paths remain available** if a future
benchmark exceeds 100s on a populated universe:
1. Batch + index hints — replace per-class N+1 query pattern with a
   single grouped query plus a `(signal_class, recorded_at)` covering
   index on DiffusionTrace.
2. Add `rolling_ic_history JSONB` to LearnedPattern via a 19-Z-02
   reissue — cron writes the new IC each day; reads only the cell's
   own history (no cross-cell scan).

No fallback was activated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Refactored cron from per-cell IC to per-signal-class IC**
- **Found during:** Task 5 integration test execution
- **Issue:** The plan's pseudocode pulled per-cell IC from
  `DiffusionTrace.predicted_probability`, but that field doesn't exist
  on `DiffusionTrace`. The originally-shipped per-cell implementation
  (Task 3 commit `7dc9236`) used the cell's current posterior mean as a
  constant prediction-proxy across all events of that cell — which
  collapses Pearson denominator to 0, producing IC = 0 always and
  spuriously confirming decay on nearly every cell.
- **Fix:** Compute one rolling-IC **per signal class** across all cells
  of that class. Predictions vary across cells (each cell has its own
  posterior mean) → non-degenerate Pearson. Broadcast the same value to
  every cell of the class via `prisma.learnedPattern.updateMany`.
- **Justification:** CONTEXT.md D-21 explicitly says "rolling 20-day
  Spearman rank-IC computed **per signal class**" — per class, not per
  cell. The per-cell implementation was a misreading of the spec.
- **Files modified:** `src/app/api/cron/alpha-decay-watch/route.ts`,
  `tests/integration/alpha-decay-watch.live.test.ts`
- **Commit:** `15fa0ae`

### Out-of-scope discoveries (logged, not fixed)

Five integration test failures exist in the broader live integration
suite (`tests/integration/learn-dual-class.test.ts`,
`tests/integration/schema-phase-16.test.ts`,
`tests/integration/smart-money-affects-reports.test.ts`,
`tests/integration/backfill-active-rate.test.ts`) — confirmed
pre-existing 19-A-05 via `git stash` test. Documented in
`.planning/phases/19-cipher-v2-0-excellence/deferred-items.md`. Out of
scope per the GSD scope-boundary rule.

## Authentication Gates

None encountered — the cron uses `CRON_SECRET` from `.env.local` and
both unit and integration tests run end-to-end without operator action.

## Verification

- [x] 9 unit tests pass (`npx vitest run tests/lib/reasoning/alpha-decay-monitor.test.ts`)
- [x] 5 integration tests pass against live Neon
  (`npx vitest run --config vitest.integration.config.ts tests/integration/alpha-decay-watch.live.test.ts`)
- [x] Vercel cron configured in `vercel.json` (`0 6 * * *`)
- [x] CRON_SECRET Bearer auth on new route (verified by 401 test)
- [x] LearnedPattern.rolling_ic_20d / ic_decay_flag wired to cron writer
  (verified by happy-path + confirmation tests)
- [x] Benchmark elapsed_ms < 100s on live Neon (356ms; caveat above re:
  empty-work-path)
- [x] Full unit suite green (`npm test`: 505 passed, 3 todo, 0 failed)
- [x] No stubs in code (TODO/FIXME/placeholder grep clean)
- [x] No new ESLint or TypeScript errors (`npx tsc --noEmit` clean)

## Threat Mitigations Verified

| Threat ID | Mitigation | Verification |
|-----------|------------|--------------|
| T-19-A-05-01 | CRON_SECRET Bearer auth | 401 integration test |
| T-19-A-05-02 | Pinned-vector Spearman test | 9 unit tests cover identical / reverse / monotone / ties / length-mismatch |
| T-19-A-05-03 | Benchmark < 100s ceiling | 356ms on live Neon (empty-work caveat documented) |

## Post-Deploy Monitoring (D-04..D-07 Cleanup Gate)

7-day quiet observation will track:
- Daily cron firing in production logs (06:00 UTC)
- `rolling_ic_20d` populating non-null on cells once they exit
  EXPLORATORY status
- `ic_decay_flag` transitions logged via the cron's JSON response

`RollbackLog` should remain empty during this window. If the
populated-universe benchmark exceeds 100s after recovery, activate the
documented batch/index fallback before extending production deployment.

## Self-Check: PASSED

- src/lib/reasoning/alpha-decay-monitor.ts: FOUND
- src/app/api/cron/alpha-decay-watch/route.ts: FOUND
- tests/lib/reasoning/alpha-decay-monitor.test.ts: FOUND
- tests/integration/alpha-decay-watch.live.test.ts: FOUND
- scripts/alpha-decay-cron-benchmark.ts: FOUND
- vercel.json contains alpha-decay-watch: VERIFIED
- package.json contains alpha-decay-cron-benchmark: VERIFIED

Commits (in order):
- bcdda09 — test(19-a-05): RED unit tests
- ab7ce2d — feat(19-a-05): GREEN pure-function impl
- 7dc9236 — feat(19-a-05): cron route (later refactored)
- 07e0a1e — chore(19-a-05): vercel.json cron registration
- 15fa0ae — test(19-a-05): integration test + per-class IC refactor
- bac83ee — feat(19-a-05): benchmark script + result
