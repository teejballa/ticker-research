---
phase: 18-time-decayed-bayesian-updates-ess
plan: 04
subsystem: learning-engine
tags: [bayesian, time-decay, ess, page-hinkley, drift-detection, cron-rewire]

# Dependency graph
requires:
  - phase: 18-time-decayed-bayesian-updates-ess
    provides: decayWeights, computeESS, updatePosteriorWeighted, confirmedDrift, STATUS_VALUES, HYPERPARAMETERS, LearnedStatus, WeightedObservation
  - phase: 18-time-decayed-bayesian-updates-ess
    provides: LearnedPattern.effective_sample_size + LearnedPattern.n_trials_attempted columns (Plan 18-03)
provides:
  - decay-aware recomputeOneCell that writes effective_sample_size every cron tick
  - confirmedDrift two-of-two wiring (raw N≥30 ∧ |drift_z|>2 ∧ ph_stat>0)
  - EXPLORATORY-WATCH status flip on drift fire (D-09)
  - drift_alert LearningEvent with numeric-only payload (T-18-05 mitigation)
  - drift_clear LearningEvent rows for the Plan 09 recovery counter
  - data-driven recompute pass that processes any extant LearnedPattern row
    (forward-looking for Plan 20 regime keys; unblocks test isolation)
affects:
  - 18-05 (backfill cron — same primitives, identical write path)
  - 18-07 (engine-context — reads effective_sample_size from cells)
  - 18-09 (drift recovery state machine — reads drift_alert + drift_clear rows)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cron-level wiring of pure primitives (D-18 invariant preserved — primitives stay in src/lib/learning.ts; route.ts composes them)"
    - "Numeric-only LearningEvent.delta payload for drift_alert: {drift_z, ph_stat, ph_threshold, raw_n, ess} — Zod-validatable on the read side"
    - "STATUS_VALUES.includes('EXPLORATORY-WATCH') runtime guard at write time — fails fast if Plan 01 const drifted"
    - "perObsDeltas built from chronological residuals (obs - running_posterior_mean_before_i) for Page-Hinkley accumulation"
    - "Recompute pass discover-and-process: cartesian enumeration UNION any extant LearnedPattern rows (excluding 'unknown' cap_class) so future schema-axes (Plan 20 regime) and test fixtures both get recomputed"

key-files:
  created:
    - .planning/phases/18-time-decayed-bayesian-updates-ess/deferred-items.md
  modified:
    - src/app/api/cron/learn/route.ts
    - src/app/api/cron/learn/__tests__/learn.ess.live.test.ts
    - src/app/api/cron/learn/__tests__/learn.drift.live.test.ts

key-decisions:
  - "Recompute pass extended to discover any extant LearnedPattern row (Rule 2 auto-add — CONTEXT D-13 explicitly contemplates evolving cell space; the static cartesian was brittle to test isolation and to Plan 20's planned regime axis). Deduplicated via Set on `signal_class|pattern_key|cap_class|horizon_days`."
  - "drift_alert emission gated by `prevStatus !== 'EXPLORATORY-WATCH'` so the alert is idempotent across cron retries on a stationary regime — D-09 step 3."
  - "drift_clear LearningEvent rows are emitted ONLY when (drift.fired === false AND cell.status === 'EXPLORATORY-WATCH') — they exist as the row-set Plan 09 will count to derive the 14-consecutive-day recovery threshold (D-09 step 4)."
  - "Drift integration test seeds N=200 (100 miss + 100 hit) rather than the plan-suggested N=60 because the Plan 01 HYPERPARAMETERS placeholder ph_lambda=50 is much higher than the 0.05 used in the unit-test fixtures. Plan 18-06 will retune ph_lambda empirically against the real outcomes table; until then the integration test must seed enough events to overcome the placeholder threshold. The N=29 floor case is unaffected (it tests the D-08 minimum, not Page-Hinkley)."

patterns-established:
  - "Cron-side wiring of Phase 18 primitives lands inside the existing recomputeOneCell prisma update — single trust point for LearnedPattern writes preserved."
  - "Threat T-18-04 mitigation pattern: STATUS_VALUES.includes() runtime guard PLUS LearnedStatus type cast at write site catches both the const-drift and the typo-write surfaces."

requirements-completed: [CORE-ML-02, CORE-ML-04]

# Metrics
duration: ~25min
completed: 2026-05-06
---

# Phase 18 Plan 04: Cron Wave 2 — Decay/ESS/Drift Wiring Summary

**recomputeOneCell now consumes decayWeights + computeESS + updatePosteriorWeighted + confirmedDrift from Plan 18-01; effective_sample_size and n_trials_attempted are written every cron tick; drift detection upgraded to two-of-two confirmation with EXPLORATORY-WATCH status flip and numeric-only drift_alert payload; both Wave 0 cron stubs (`learn.ess.live`, `learn.drift.live`) are now fully active and green (5+4=9 assertions).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-06T08:51:00Z
- **Completed:** 2026-05-06T09:15:00Z
- **Tasks:** 2/2
- **Files modified:** 3 (route.ts + 2 cron stub tests)
- **Files created:** 1 (deferred-items.md)

## Accomplishments

### Task 1 — Wire decay+ESS into `recomputeOneCell` (commit `c255e38`)

- Imports added from `@/lib/learning`: `decayWeights`, `computeESS`,
  `updatePosteriorWeighted`, `confirmedDrift`, `HYPERPARAMETERS`,
  `STATUS_VALUES`, `WeightedObservation`, `LearnedStatus`.
- Inside `recomputeOneCell`, build a `WeightedObservation[]` from the events
  query (per-class hit booleans), apply `decayWeights(obs, λ, now)` with
  per-class λ from `HYPERPARAMETERS[signal_class].lambda_days`, compute
  Kish ESS, and produce a decay-weighted Beta posterior via
  `updatePosteriorWeighted({alpha:1, beta:1}, obs, weights)`.
- `prisma.learnedPattern.update.data` now writes:
  - `effective_sample_size: ess` (D-04 ESS gate source of truth)
  - `n_trials_attempted: { increment: events.length }` (D-15 — populates
    the P21 FDR denominator going forward)
  - `alpha: weightedPosterior.alpha`, `beta: weightedPosterior.beta`
    (overwrites raw +1/+0 with decayed sums)
- `patternStatus(...)` now passes the new `effective_sample_size` arg so the
  D-04 `ESS<30 → EXPLORATORY` gate supersedes the legacy `sample_size<10` gate.
- `recomputePerSignalClassPatternMetrics` extended to discover-and-process
  any extant `LearnedPattern` row outside the cartesian enumeration, deduped
  via Set on the cell key (CONTEXT D-13 forward-looking; unblocks test
  isolation via throwaway cap_class values).
- `learn.ess.live.test.ts` activated with 5 assertions:
  1. Every recomputed cell row has `effective_sample_size > 0`.
  2. **LOOKS-DONE-BUT-ISN'T**: identical raw N=20 cells, recent vs wide-spread
     old → ESS_recent > 2 × ESS_old (RESEARCH §Pitfalls Defended bar).
  3. credibleInterval95 width is narrower on the recent cell.
  4. Hand-calc parity within 1e-3 (cron-written ESS matches local
     `computeESS(decayWeights(...))`).
  5. Idempotency: second cron run produces identical ESS within 1e-3.

### Task 2 — Replace single-test drift with confirmedDrift two-of-two (commit `f52dbc2`)

- Build `perObsDeltas` array from chronological events: residual at index i
  is `(hit_i ? 1 : 0) − running_posterior_mean_before_i`.
- Replace the legacy `Math.abs(drift_z) > 2 && prevStatus !== status`
  branch with `confirmedDrift({rolling, allTime, perObsDeltas, delta,
  lambdaPH, rawN})` — two-of-two AND raw N≥30 (CONTEXT D-06, D-08).
- On `drift.fired`: `status` becomes `'EXPLORATORY-WATCH'` (D-09 step 2).
  STATUS_VALUES runtime guard via `STATUS_VALUES.includes(...)` fails
  fast if Plan 01 const drifted (T-18-04 mitigation).
- Cells already in `'EXPLORATORY-WATCH'` whose drift signals clear get a
  `drift_clear` LearningEvent row emitted; Plan 09 will derive the
  14-consecutive-day recovery counter from these rows (D-09 step 4).
- `drift_alert` emission is gated by `prevStatus !== 'EXPLORATORY-WATCH'`
  so subsequent cron retries on a stationary regime don't emit duplicate
  alerts (D-09 step 3 idempotency).
- `drift_alert.delta` payload is numeric-only:
  `{ drift_z, ph_stat, ph_threshold, raw_n, ess }` (T-18-05 closure).
- `learn.drift.live.test.ts` activated with 4 assertions:
  1. Synthetic injected drift (100 misses → 100 sustained hits, raw N=200)
     fires exactly 1 `drift_alert` AND status flips to `'EXPLORATORY-WATCH'`.
  2. **D-08 floor**: cell with raw N=29 + same shift → 0 `drift_alert` rows.
  3. **T-18-05**: drift_alert.delta parses against
     `z.object({drift_z, ph_stat, ph_threshold, raw_n, ess})` — no string fields.
  4. **D-09 no-auto-demote**: cell already in `'EXPLORATORY-WATCH'` that
     fires again stays in `'EXPLORATORY-WATCH'` (never flips to DEPRECATED).

## Task Commits

1. **Task 1** — `c255e38` (feat) — wire decay+ESS into recomputeOneCell + activate ess.live
2. **Task 2** — `f52dbc2` (feat) — replace single-test drift with confirmedDrift + activate drift.live

## Files Created/Modified

- `src/app/api/cron/learn/route.ts` — modified (added Phase 18 imports;
  injected decay/ESS/posterior block before Brier compute; replaced single-test
  drift block with confirmedDrift two-of-two + EXPLORATORY-WATCH; added
  drift_clear emission for recovery counter; extended recompute pass to
  discover extant cells).
- `src/app/api/cron/learn/__tests__/learn.ess.live.test.ts` — modified
  (replaced placeholder + 3 it.todo with 5 active assertions).
- `src/app/api/cron/learn/__tests__/learn.drift.live.test.ts` — modified
  (replaced placeholder + 4 it.todo with 4 active assertions covering all
  drift behaviour including N=29 floor and EXPLORATORY-WATCH idempotency).
- `.planning/phases/18-time-decayed-bayesian-updates-ess/deferred-items.md` —
  created (logs pre-existing learn-dual-class test failure).

## Decisions Made

- **Discover-and-process recompute pass**: Plan said to wire decay/ESS into
  `recomputeOneCell`, but the parent function `recomputePerSignalClassPatternMetrics`
  iterates a static cartesian product of `(SIGNAL_CLASSES × PATTERNS × CAP_CLASSES × HORIZONS)`.
  Cells outside this product (test fixtures with throwaway cap_class; future
  Plan 20 regime keys) would never have their ESS recomputed despite Plan 04
  promising "every cell's recomputeOneCell call writes effective_sample_size".
  Extended the parent function to also iterate any LearnedPattern rows that
  exist in the table (excluding the 'unknown' cap_class fallback), deduped
  via a Set on the composite key. This is forward-looking (CONTEXT D-13
  explicitly contemplates the cell space evolving) and makes the test
  isolation in the live integration tests work without polluting production
  cells. Tracked as Rule 2 deviation below.
- **Drift integration test uses N=200, not N=60**: HYPERPARAMETERS placeholder
  ph_lambda=50 (from Plan 01) is much higher than the 0.05 used in unit-test
  fixtures. With residuals of magnitude ~0.5, you need ~100+ events worth of
  accumulator before crossing the threshold. Plan 06 will retune ph_lambda
  empirically; until then the integration test must seed enough events that
  ph_stat > 0 under the bootstrap config. The N=29 floor test is unaffected
  (it tests the D-08 minimum, not Page-Hinkley itself).
- **drift_alert emission gated on transition**: `prevStatus !== 'EXPLORATORY-WATCH'`
  ensures the alert is idempotent across cron retries on a stationary regime.
  This matches D-09 step 3 (no flap, no spam) without requiring a separate
  per-day dedup mechanism.

## Deviations from Plan

### Auto-handled discrepancies

**1. [Rule 2 — Critical functionality] Recompute pass extended to discover extant cells**

- **Found during:** Task 1 — running the integration test against TESTP18ESS
  cap_class produced effective_sample_size=0 because the static cartesian
  enumeration in `recomputePerSignalClassPatternMetrics` only iterates
  `large_cap | mid_cap | small_cap`.
- **Issue:** Plan 04's behavior contract says "every cell's recomputeOneCell
  call writes effective_sample_size every cron tick" — but cells with cap_class
  values outside the static `CAP_CLASSES` const are silently skipped. This
  is a real correctness gap not just for tests: CONTEXT D-13 explicitly
  notes the cell space evolves, and Plan 20 will add a regime axis that the
  static cartesian cannot anticipate.
- **Fix:** Added a discovery pass: after the cartesian enumeration, query
  the LearnedPattern table for rows whose `(signal_class, pattern_key,
  cap_class, horizon_days)` tuple isn't already in the work queue (deduped
  via Set), excluding `cap_class === 'unknown'`. Both passes feed the same
  `recomputeOneCell` call.
- **Files modified:** `src/app/api/cron/learn/route.ts`
- **Verification:** `learn.ess.live.test.ts` assertion 1 ("every recomputed
  cell row has ESS > 0") passes; pre-existing `learn-quad-class.test.ts` and
  the green portions of `learn-dual-class.test.ts` still pass (no regression).
- **Committed in:** `c255e38`

### Out-of-scope items logged for follow-up

**1. Pre-existing failure: `learn-dual-class.test.ts` "one 7d outcome ... no logistic update"**

- **Status:** Failing on the worktree base commit `0ae03bd`, before any
  Plan 18-04 changes. Verified via `git stash && npm run test:integration --
  --run tests/integration/learn-dual-class.test.ts`, which reproduces the
  failure on a clean baseline. Stash popped immediately after.
- **Out of scope:** Not introduced by 18-04. Logged in `deferred-items.md`
  for triage in a future cleanup pass.

---

**Total deviations:** 1 auto-handled (Rule 2 — discover-and-process recompute).
**Out-of-scope items:** 1 pre-existing test failure logged for later.

## Issues Encountered

- Initial drift integration test (RED phase) confirmed the legacy single-test
  branch was firing with the old payload shape, validating the test was
  actually exercising the wired code path. After Task 2's GREEN edit, all
  4 drift assertions pass. The N=60 → N=200 seed bump was diagnosed against
  the HYPERPARAMETERS placeholder values (documented as a key decision).

## Threat Mitigations Realized

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-18-01 (CRON_SECRET spoofing) | Unchanged | `grep` at line 989 of route.ts: `if (request.headers.get('authorization') !== \`Bearer ${process.env.CRON_SECRET}\`)` returns one match — same line, same shape as before this plan. |
| T-18-04 (status enum poisoning) | Newly enforced | Cron now writes status only through `LearnedStatus` typed cast; `STATUS_VALUES.includes('EXPLORATORY-WATCH')` runtime guard at line 591 fails fast if Plan 01 const drifted. |
| T-18-05 (DoS via drift_alert.delta deserialization) | Newly enforced | Cron writes only `{drift_z, ph_stat, ph_threshold, raw_n, ess}` — five numeric fields, zero strings. Live integration test 3 Zod-parses against `z.object({drift_z: z.number(), ph_stat: z.number(), ph_threshold: z.number(), raw_n: z.number(), ess: z.number()})` and asserts `parsed.success === true`. |

## Verification Results

```
$ npm test -- --run src/lib/__tests__/learning.test.ts \
                    src/lib/__tests__/learning.decay.test.ts \
                    src/lib/__tests__/learning.ess.test.ts \
                    src/lib/__tests__/learning.ph.test.ts \
                    src/lib/__tests__/learning.drift.test.ts

 Test Files  5 passed (5)
      Tests  67 passed (67)

$ npm run test:integration -- --run \
    src/app/api/cron/learn/__tests__/learn.ess.live.test.ts \
    src/app/api/cron/learn/__tests__/learn.drift.live.test.ts

 ✓ src/app/api/cron/learn/__tests__/learn.drift.live.test.ts (4 tests)
 ✓ src/app/api/cron/learn/__tests__/learn.ess.live.test.ts   (5 tests)
 Test Files  2 passed (2)
      Tests  9 passed (9)

$ npx tsc --noEmit && echo $?
0
```

All Plan 04 acceptance criteria met:
- `decayWeights(weightedObs, lambdaDays, now)` — line 515 ✓
- `computeESS(weights)` — line 516 ✓
- `updatePosteriorWeighted(...)` — line 517 ✓
- `effective_sample_size: ess` inside Prisma update — line 621 ✓
- `n_trials_attempted: { increment: events.length }` — line 622 ✓
- `effective_sample_size: ess` inside patternStatus args — line 581 ✓
- `confirmedDrift({` — line 569 ✓
- `'EXPLORATORY-WATCH'` literal — multiple sites ✓
- `STATUS_VALUES.includes` runtime guard — line 591 ✓
- `event_type: 'drift_clear'` — line 659 ✓
- T-18-01 CRON_SECRET literal at line 989 unchanged ✓

## Self-Check: PASSED

- File `src/app/api/cron/learn/route.ts` modified — VERIFIED via `git log -p f52dbc2 -- src/app/api/cron/learn/route.ts` showing the diff hunks.
- File `src/app/api/cron/learn/__tests__/learn.ess.live.test.ts` modified — VERIFIED.
- File `src/app/api/cron/learn/__tests__/learn.drift.live.test.ts` modified — VERIFIED.
- File `.planning/phases/18-time-decayed-bayesian-updates-ess/deferred-items.md` exists — VERIFIED.
- Commit `c255e38` exists in git log — VERIFIED.
- Commit `f52dbc2` exists in git log — VERIFIED.
- All 9 live integration assertions green — VERIFIED above.
- All 67 unit-test assertions still green — VERIFIED (no regression on Plan 01 primitives).
- `npx tsc --noEmit` exits 0 — VERIFIED.

---
*Phase: 18-time-decayed-bayesian-updates-ess*
*Plan: 04*
*Completed: 2026-05-06*
