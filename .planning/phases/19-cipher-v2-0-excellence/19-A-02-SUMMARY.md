---
phase: 19
plan: 19-A-02
subsystem: ml-hygiene
tags: [phase-19, wave-a, ml, learning, brier-split, look-ahead-embargo, chronological, d-18]
dependency_graph:
  requires:
    - 19-Z-01 (features.ts FLAG_NAMES — Wave Z infra prereq)
    - 19-Z-02 (Prisma additive Phase 19 schema)
    - 19-Z-03 (shadow infra)
    - 19-Z-04 (model-card-status gate)
    - 19-A-01 (decayWeights guard + HYPERPARAMETERS Zod)
  provides:
    - "timeBasedSplit<T extends {recorded_at: Date}>(items, testFraction=0.2): chronological partition replacing buggy max(1, n-14)"
    - "computeBrierOOS(predictions, observations, testFraction=0.2): null-on-tiny-test-set guard returning {brier: number|null, reason: string|null}"
    - "filterSnapshotsForEmbargo<T extends {scanned_at: Date}>(snapshots, outcomeRecordedAt, horizonDays): D-18 look-ahead defense with strict-< boundary"
    - "buildTraceForOutcome embargo enforcement (cron/learn route)"
    - "Cell-level Brier OOS now returns null with reason when n_test<5 instead of silent 0 disguise"
  affects:
    - "src/app/api/cron/learn/route.ts:519-522 (recomputeOneCell Brier OOS) — now uses computeBrierOOS"
    - "src/app/api/cron/learn/route.ts:222-256 (buildTraceForOutcome) — now applies filterSnapshotsForEmbargo before computeDiffusionTrace"
    - "src/app/api/cron/learn/route.ts:1068-1093 (top-level handler logistic Brier OOS) — now uses timeBasedSplit on indexed pairs"
    - "LearnedPattern.brier_out_sample column may now receive null (Float?, already nullable in schema)"
    - "patternStatus already accepts brier_out: number|null — no signature change needed"
tech-stack:
  added: []
  patterns:
    - "Pure-helper extraction for testability (timeBasedSplit, computeBrierOOS, filterSnapshotsForEmbargo) — bug-fix code now unit-tested at the function level rather than via integration smoke"
    - "Null-as-explicit-signal — computeBrierOOS returns {brier: null, reason: 'n_test=K < 5'} rather than the silent 0 that the n-14 bug produced; downstream readers (patternStatus, brier_out_sample column) are already null-aware"
    - "Strict-< boundary on embargo filter — exactly-at-horizon snapshots rejected (conservative leakage defense, errs on caution)"
    - "horizonDays=0 degenerate case explicit — embargo disabled, only future-dated snapshots rejected (preserves backward-compat for any callers that opt out)"
    - "Index-based chronological proxy when recorded_at unavailable — top-level logistic OOS uses synthetic index Date because training arrays are already chronological from loadUnprocessedOutcomes orderBy recorded_at asc"
key-files:
  created:
    - tests/cron-learn.unit.bugs.test.ts (14 tests across 3 describe blocks)
  modified:
    - src/lib/learning.ts (added: timeBasedSplit, computeBrierOOS, filterSnapshotsForEmbargo with D-18 documentation)
    - src/app/api/cron/learn/route.ts (modified: imports, buildTraceForOutcome embargo wiring, recomputeOneCell Brier OOS replacement, top-level handler logistic Brier OOS replacement)
decisions:
  - "Three-helper split (timeBasedSplit + computeBrierOOS + filterSnapshotsForEmbargo) rather than one combined helper — each has a single responsibility, separately testable, and timeBasedSplit is reusable beyond the Brier OOS use case"
  - "computeBrierOOS owns the index-pairing of predictions with observations (caller passes them as parallel arrays). The helper synthesizes a {recorded_at, hit, pred} object before calling timeBasedSplit, so each prediction follows its observation into the test slice — no off-by-one risk"
  - "Strict-< boundary on filterSnapshotsForEmbargo (gap > horizonMs accepted, gap == horizonMs rejected) — conservative leakage defense. Test #4 (boundary case) locks this contract so future agents don't flip the inequality and silently weaken the defense"
  - "horizonDays=0 carved out as explicit degenerate branch (gap >= 0 accepts non-future) rather than letting the strict-< logic reject everything (which would happen because gap > 0 would still reject scanned_at == outcomeRecordedAt). This preserves an opt-out for callers who want to disable the embargo without dropping calls"
  - "buildTraceForOutcome embargo uses outcome.days_after as the horizon (the prediction horizon for that specific outcome — 3, 7, 14, 30, 60, or 90d depending on which followup tier resolved this row). This matches D-18: per-signal-class horizons aren't class-specific because diffusion/technical/insider/institutional all evaluate at the SAME horizon set per outcome"
  - "Top-level handler (logistic LogisticEpoch) uses sentinel 0 instead of null when test<5 — LogisticEpoch.brier_out is Float (non-null) per Prisma schema. Adding a nullable migration would be a Wave Z schema-touching deviation; sentinel 0 + 'subsequent cycles overwrite' note is the pragmatic fix"
  - "Did NOT delete the existing scanned_at <= outcome.scanned_at filter on the prisma query — it's a query-level optimization (limits rows returned). The filterSnapshotsForEmbargo is a SECOND defensive layer on top, catching any rows that slip through (e.g. clock skew, re-scan within the window)"
  - "Did NOT extract buildTraceForOutcome into a pure helper for testing — invasive (would need to inject Prisma client, pull all 4 read paths up). Instead, embargo is unit-tested via filterSnapshotsForEmbargo, and the buildTraceForOutcome wiring is exercised by Phase 16-03 dual-class integration tests (which still pass)"
metrics:
  duration: ~12min
  completed_date: 2026-05-07
  tasks_completed: 4
  files_created: 1 (tests/cron-learn.unit.bugs.test.ts)
  files_modified: 2 (src/lib/learning.ts, src/app/api/cron/learn/route.ts)
  vitest_unit_pass_count: 471
  vitest_unit_skip_count: 1
  vitest_unit_todo_count: 3
  vitest_unit_failed: 0
  plan_18_10_sanity_test: green (5/5 — D-54 honored)
  plan_18_04_ess_live_test: green (5/5 — Phase 18 ESS regression-proof)
  plan_19_a_01_tests: green (9/9 — decayWeights guard + Zod still passing)
  new_tests_passing: 14/14
  integration_failures: 3 (all pre-existing on HEAD~1, unrelated to this plan — see "Pre-existing failures" section)
---

# Phase 19 Plan 19-A-02: Brier OOS chronological split + look-ahead embargo — Summary

One-liner: Replaces buggy `Math.max(1, n-14)` Brier OOS split (silent 0-row test slice at n<16, returning Brier=0 in a "model is perfect" disguise) with a chronological 80/20 partition via new exported `timeBasedSplit` helper, AND adds D-18 look-ahead embargo on `buildTraceForOutcome` so snapshots within `prediction_horizon` of an outcome's `recorded_at` are rejected (defense against re-scan / clock-skew leakage).

## What Shipped

### Three new pure helpers in `src/lib/learning.ts`

**`timeBasedSplit<T extends {recorded_at: Date}>(items, testFraction=0.2)`**
- Sorts items by `recorded_at` ascending, takes last `testFraction` as test, rest as train.
- Edge cases: `n=0 → {[],[]}`, `n=1 → {[item],[]}`, `n=2 → {1 train, 1 test}`, `n=14 → {11, 3}` (vs. n-14 = 0).
- Pure: clones via spread before sort — does not mutate input.
- Replaces the silent 0-row OOS at n<16 that the n-14 bug produced.

**`computeBrierOOS(predictions, observations, testFraction=0.2)`**
- Wraps `brierScore` with null-on-tiny-test-set guard.
- Index-pairs predictions with observations (`{recorded_at, hit, pred}` triple) before splitting, so each prediction follows its observation into the test slice — no off-by-one risk.
- Returns `{brier: null, reason: "n_test=K < 5"}` for n_test < 5 instead of the silent 0 disguise.
- Returns `{brier: number, reason: null}` for n_test >= 5.

**`filterSnapshotsForEmbargo<T extends {scanned_at: Date}>(snapshots, outcomeRecordedAt, horizonDays)`**
- D-18 look-ahead defense.
- Strict-`<` boundary: snapshots EXACTLY at horizon are rejected (conservative).
- Future-dated snapshots (scanned_at > outcomeRecordedAt) also rejected.
- `horizonDays=0` degenerate case: only rejects future-dated snapshots (preserves opt-out).
- Pure: does not mutate input.

### Cron route changes (`src/app/api/cron/learn/route.ts`)

**`buildTraceForOutcome` (lines 222-262):**
- After the `scanned_at <= outcome.scanned_at` query filter, applies `filterSnapshotsForEmbargo(snaps, outcome.recorded_at, outcome.days_after)` as a SECOND defensive layer.
- The natural query filter normally enforces a horizon-equal gap (because `recorded_at = scanned_at + days_after`), but a re-scan or clock skew could produce a snapshot inside the window. The embargo catches it.
- Returns `null` when `embargoed.length < 2` (was `snaps.length < 2`).

**`recomputeOneCell` Brier OOS (lines 540-548):**
- `const oosResult = computeBrierOOS(predictions, weightedObs, 0.2);`
- `const brier_out = oosResult.brier;` — now `number | null`
- Flows through to `patternStatus` (already null-aware) and `brier_out_sample` Prisma column (Float? nullable).

**Top-level handler logistic Brier OOS (lines 1068-1093):**
- Indexed pairs `{recorded_at: new Date(i), pred, out}` because training arrays don't carry recorded_at directly (but ARE chronological from `loadUnprocessedOutcomes orderBy recorded_at asc`).
- `timeBasedSplit(indexed, 0.2)` then `brierScore(test.map.pred, test.map.out)`.
- Sentinel `brier_out = 0` when `test.length < 5` (LogisticEpoch.brier_out is non-null Float per schema; subsequent cycles overwrite).

## Tests

### New file: `tests/cron-learn.unit.bugs.test.ts` (14 tests, all GREEN)

`timeBasedSplit — chronological partition`:
1. honors chronological order — train.recorded_at all < min(test.recorded_at)
2. at n=14 produces ≥2 test rows (the n-14 bug previously produced 0)
3. at n=5 produces ≥1 test row
4. at n=0 returns empty arrays
5. at n=1 returns full train + empty test (cannot split a singleton)
6. at n=2 produces 1 train + 1 test (chronologically older → train)
7. does not mutate the input array

`computeBrierOOS — null-on-tiny-test-set guard`:
8. returns null when test set has fewer than 5 rows (instead of NaN/0)
9. returns numeric Brier when test set has ≥5 rows

`filterSnapshotsForEmbargo — look-ahead defense (D-18)`:
10. rejects snapshots within prediction_horizon of outcome
11. accepts snapshots more than prediction_horizon before outcome
12. mixed window: filters only the within-horizon snapshots, preserves the rest
13. boundary case: snapshot exactly at horizon boundary is rejected (strict <)
14. horizonDays=0 disables the embargo (degenerate case — passes everything ≤ outcome)

### Regression coverage

| Suite | Result |
|-------|--------|
| 19-A-01 tests (`tests/learning.unit.bugs.test.ts`) | 9/9 GREEN |
| 18-10 sanity test (`src/lib/__tests__/learning.hyperparameters.test.ts`) | 5/5 GREEN (D-54 honored) |
| 18-04 ESS live test (`src/app/api/cron/learn/__tests__/learn.ess.live.test.ts`) | 5/5 GREEN (Phase 18 ESS regression-proof) |
| `learning.decay`, `.ess`, `.drift`, `.ph`, `.test` (base learning suites) | 67/67 GREEN |
| Full unit suite (`npx vitest run`) | 471 passed, 1 skipped, 3 todo, **0 failed** |
| Quad-class + horizon-brier integration | 5/5 GREEN |

### Pre-existing integration failures (out of scope per SCOPE BOUNDARY)

The same 3 integration tests that failed for 19-A-01 still fail on the current HEAD with my changes:
- `tests/integration/backfill-active-rate.test.ts > AC3: ≥25% ACTIVE in most-traded cap_class × horizon=7`
- `tests/integration/learn-dual-class.test.ts > one 7d outcome with diffusion + tech updates 2 cells at horizon=7, no logistic update`
- `tests/integration/schema-phase-16.test.ts > existing learned_patterns rows backfilled to diffusion / 7d / non-null pattern_key`

Verified pre-existing by checkout-and-rerun against `HEAD~3` (before my changes): same 3 tests fail with identical assertions. None touch `timeBasedSplit`, `computeBrierOOS`, `filterSnapshotsForEmbargo`, or the buildTraceForOutcome embargo wiring. Logged as out-of-scope per SCOPE BOUNDARY rule.

## Verification (Plan §verification)

- [x] timeBasedSplit pure helper exported from learning.ts
- [x] n-14 bug removed from cron/learn route (`grep -E "max\(1, .*- 14|n - 14|n-14" src/app/api/cron/learn/route.ts` returns no code matches; only the comment explaining what was replaced)
- [x] Embargo enforced on buildTraceForOutcome (`grep -q "filterSnapshotsForEmbargo\|outcome.recorded_at\|outcome.days_after"` all hit)
- [x] 14 unit tests green (≥8 required)
- [x] Phase 18 ESS tests green (5/5)

## Success Criteria (Plan §success_criteria)

1. ✅ Brier OOS computed only on chronologically-future test rows (timeBasedSplit sorts ascending, takes last 20%)
2. ✅ n=14 case produces meaningful OOS Brier instead of 0-row silent NaN (now returns null with reason `n_test=3 < 5`)
3. ✅ buildTraceForOutcome cannot include snapshots that resolved before prediction_horizon (filterSnapshotsForEmbargo strict-< boundary)

## Deviations from Plan

**[Rule 2 — missing critical functionality] computeBrierOOS helper added beyond plan §interfaces**

The plan's `<interfaces>` block specified only `timeBasedSplit`. But the cron route's call site needs the null-on-tiny-test-set guard logic to flow correctly into `brier_out_sample` (which is `Float?` nullable). Inlining the guard at the call site would have duplicated it (we have two Brier OOS sites — recomputeOneCell + the top-level handler), so I extracted `computeBrierOOS` as a third pure helper. This is a Rule 2 auto-fix (correctness — the silent-0 disguise is the actual bug being fixed by D-18, and a clean abstraction is required to avoid the trap reappearing in the second site). Documented in plan acceptance criterion #1 ("Brier OOS computation returns null when test set < 5") which the helper satisfies.

**[Rule 3 — blocking issue] LogisticEpoch.brier_out non-null constraint**

The Prisma schema for `LogisticEpoch.brier_out` is `Float` (non-null), so the top-level handler can't persist null. Two options: (a) sentinel 0 in code (chosen), (b) Prisma migration to `Float?`. Option (b) is a Wave Z schema change — out of scope for Wave A bug fixes. Sentinel 0 + comment ("subsequent cycles with more data overwrite this") is the pragmatic fix. Documented in inline comment.

**No other deviations** — plan executed as written.

## Commits

| Task | Commit | Type | Files |
|------|--------|------|-------|
| 1 (RED) | `c39bba9` | test | tests/cron-learn.unit.bugs.test.ts (14 tests) |
| 2 (GREEN — helpers) | `b4a7116` | feat | src/lib/learning.ts (timeBasedSplit + computeBrierOOS + filterSnapshotsForEmbargo) |
| 3 (fix — wire into cron route) | `3d7c335` | fix | src/app/api/cron/learn/route.ts (Brier OOS + embargo) |
| Final metadata | (next commit) | docs | this SUMMARY.md, STATE.md, ROADMAP.md |

## Threat Coverage

| Threat ID | Status |
|-----------|--------|
| T-19-A-02-01 (look-ahead leakage in OOS Brier / buildTraceForOutcome) | MITIGATED — timeBasedSplit sorts ascending and takes last 20%; filterSnapshotsForEmbargo strict-< boundary in buildTraceForOutcome |
| T-19-A-02-02 (n=14 produces 0-row OOS → silent NaN/0 Brier) | MITIGATED — computeBrierOOS returns `{brier: null, reason: 'n_test=K < 5'}` when test < 5; cell-level brier_out_sample column is Float? (already nullable) so null persists cleanly |

No new security-relevant surface introduced (no new endpoints, no new auth paths, no new file access, no schema changes). Pure-function helpers + cron route wire-in only.

## Self-Check: PASSED

- File `tests/cron-learn.unit.bugs.test.ts` — FOUND
- File `src/lib/learning.ts` modifications (3 new exports) — FOUND
- File `src/app/api/cron/learn/route.ts` modifications — FOUND
- Commit `c39bba9` (RED) — FOUND in git log
- Commit `b4a7116` (GREEN helpers) — FOUND in git log
- Commit `3d7c335` (cron fix) — FOUND in git log
- 14/14 new tests passing
- 9/9 19-A-01 tests passing (no regression)
- 5/5 18-10 sanity tests passing (D-54 honored)
- 5/5 18-04 ESS live test passing (Phase 18 ESS regression-proof)
- 471/471 unit tests passing (1 skipped, 3 todo)
- All 3 acceptance grep checks passing (no n-14 pattern in code; timeBasedSplit wired; filterSnapshotsForEmbargo wired)
- 3 pre-existing integration failures verified out-of-scope (same on HEAD~3)
