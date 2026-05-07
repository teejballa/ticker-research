---
phase: 19
plan: 19-A-01
subsystem: ml-hygiene
tags: [phase-19, wave-a, ml, learning, decay-weights, hyperparameters, zod, defensive-guard]
dependency_graph:
  requires:
    - 19-Z-01 (features.ts FLAG_NAMES — Wave Z infra prereq)
    - 19-Z-02 (Prisma additive Phase 19 schema)
    - 19-Z-03 (shadow infra)
    - 19-Z-04 (model-card-status gate)
  provides:
    - "decayWeights now throws descriptive error on lambdaDays <= 0 or non-finite (D-17 mitigation)"
    - "validateHyperparameters: asserts function exported from src/lib/learning.ts"
    - "Module-load assertion at bottom of learning.ts — typos in HYPERPARAMETERS surface at import time, not at use time (T-19-A-01-02 mitigation)"
  affects:
    - "src/app/api/cron/learn/route.ts:515 — call site unchanged, lambdaDays = HYPERPARAMETERS[…].lambda_days ?? 60 (all values 60, safe under guard)"
    - "src/app/api/cron/backfill-ess/route.ts:155 — same fallback pattern, safe under guard"
    - "src/lib/__tests__/learning.decay.test.ts — passes literal positives, all 7 still green"
    - "Every importer of src/lib/learning.ts now indirectly runs validateHyperparameters(HYPERPARAMETERS) at module load — failure here would block the entire Cipher app from booting (intentional fail-fast)"
tech-stack:
  added: []
  patterns:
    - "Defensive guard at function entry (decayWeights) — catches misconfig that previously produced silent Infinity weights and corrupted ESS"
    - "Zod .strict() schema for typed config constants — catches typos in signal class names at module load via unrecognized_keys discrimination"
    - "Module-load assertion (`validateHyperparameters(HYPERPARAMETERS)` at bottom of file) — fail-fast import contract"
    - "Empty-input contract preservation — guard runs BEFORE obs.map(), so decayWeights([], λ) still returns [] for any positive λ (RESEARCH Pitfall 1 honored)"
    - "Error-message-as-API — guard error message includes the exact bad value (`got: ${lambdaDays}`) so downstream debugging knows whether it was 0, NaN, or Infinity"
key-files:
  created:
    - tests/learning.unit.bugs.test.ts (9 tests)
  modified:
    - src/lib/learning.ts (added: zod import, decayWeights guard, ClassHyperparametersSchema, HyperparametersSchema, validateHyperparameters export, module-load assertion, TODO(Phase 20+) comment)
decisions:
  - "Two-commit TDD split: RED commit (test file) → GREEN commit (implementation). Plan 19-A-01 task 1 spec was 'TDD true' so tests-fail-then-pass is the required ordering"
  - "Used .strict() on HyperparametersSchema rather than the default permissive z.object(). RESEARCH Pitfall 2 explicitly authorized this trade-off — typo detection at module load is worth the future-proofing tax of having to update the schema when adding regime hyperparams in Phase 20+"
  - "TODO(Phase 20+) comment placed inline directly above the .strict() call — most discoverable location for the future agent who hits the import-time throw after adding a new field to HYPERPARAMETERS"
  - "Module-load assertion placed at the bottom of learning.ts (after HYPERPARAMETERS_DEFERRED_RETUNE) rather than top — semantic ordering: HYPERPARAMETERS must be defined before it can be validated. Top-of-file would require forward-referencing the const"
  - "Did NOT add a separate `validateHyperparameters` export to src/lib/index.ts (no such barrel) — direct named import from `src/lib/learning` is the existing convention (e.g., the new test imports `decayWeights, HYPERPARAMETERS, validateHyperparameters` together)"
  - "Did NOT modify the existing exp(-Δt / lambdaDays) math — D-54 sanity contract requires zero edits to existing pure-function logic. Only the guard insertion is new"
  - "Empty-input test added to the decayWeights describe block (5 tests total there: rejects 0, rejects negative, rejects NaN, accepts 0.001, returns [] for empty input). Plan spec called for ≥9 tests; total is 9"
  - "Did NOT add a guard for lambdaDays = +Infinity even though Number.isFinite(Infinity) === false catches it — the test suite per plan spec asks for NaN coverage; Infinity is incidentally caught by the same Number.isFinite check"
metrics:
  duration: ~15min
  completed_date: 2026-05-07
  tasks_completed: 3
  files_created: 1 (tests/learning.unit.bugs.test.ts)
  files_modified: 1 (src/lib/learning.ts)
  vitest_unit_pass_count: 457
  vitest_unit_skip_count: 1
  vitest_unit_failed: 0
  plan_18_10_sanity_test: green (5/5 — D-54 honored)
  new_tests_passing: 9/9
---

# Phase 19 Plan 19-A-01: decayWeights lambda guard + HYPERPARAMETERS Zod schema — Summary

One-liner: `decayWeights` now rejects `lambdaDays <= 0` / NaN / non-finite with a descriptive error (preventing silent ESS corruption from `exp(-Δt/0) = Infinity`), and `HYPERPARAMETERS` is Zod-validated at module load via a `.strict()` schema, catching signal-class typos and out-of-range params at import time rather than deep inside the cron route.

## What Shipped

### Guard at decayWeights entry (D-17, RESEARCH Pitfall 1)
- Added top-of-function check: throws `decayWeights: lambdaDays must be > 0 and finite (got: ${lambdaDays}).` when the input is `<= 0` or `!Number.isFinite()`.
- Empty-input contract preserved: `decayWeights([], λ)` for any positive `λ` still returns `[]` (the `obs.map()` handles it naturally; the guard runs first but only rejects the lambda, not the empty array).
- Existing exp(-Δt / lambdaDays) math is byte-identical to the pre-Plan-19 implementation (D-54 sanity contract).

### Zod schema + validator (T-19-A-01-02, RESEARCH Pitfall 2)
- New (un-exported) `ClassHyperparametersSchema` covers the 5 fields per signal class (`lambda_days`, `ph_delta`, `ph_lambda`, `tuned_at`, `cv_brier_oos`). All numeric fields require `.positive().finite()`; `cv_brier_oos` is `.nullable()` per the Plan 18-06 escape hatch.
- New (un-exported) `HyperparametersSchema` shapes the four-class object (`diffusion`, `technical`, `insider`, `institutional`) with `.strict()` — unknown signal classes throw at validate time.
- New exported `validateHyperparameters(input: unknown): asserts input is typeof HYPERPARAMETERS` runs `safeParse`, then discriminates on the first issue: `unrecognized_keys` → "unknown signal class — bogus" message; everything else → "validation failed" with full path-and-message join.
- Module-load assertion `validateHyperparameters(HYPERPARAMETERS)` at file bottom — every importer of `src/lib/learning.ts` now transitively runs the validator. If the bootstrap config drifts away from the schema, the entire app fails to boot in CI rather than silently in production.

### TODO(Phase 20+) future-proofing comment
- Placed directly above the `.strict()` call in `HyperparametersSchema`. Flags that adding regime hyperparams or new signal classes in Phase 20+ requires either updating the schema or removing `.strict()` — otherwise import-time throws will block the entire app.

## Audit of Existing Call Sites (3 known per RESEARCH Pitfall 1)

| File | Line | Pattern | Verdict under new guard |
|------|------|---------|-------------------------|
| `src/app/api/cron/learn/route.ts` | 515 | `decayWeights(weightedObs, lambdaDays, now)` where `lambdaDays = HYPERPARAMETERS[key.signal_class]?.lambda_days ?? 60` | SAFE — bootstrap values are all 60 (Plan 18-06); `?? 60` fallback also positive |
| `src/app/api/cron/backfill-ess/route.ts` | 155 | `decayWeights(obs, lambdaDays, now)` — same fallback pattern | SAFE — bootstrap values 60 |
| `src/lib/__tests__/learning.decay.test.ts` | 18, 24, 35, 47, 59, 66, 78 | Literal positives (30, 60, varies); also asserts `decayWeights([], 30) === []` | SAFE — empty-input case still returns `[]`; all 7 tests green post-change |

Module-load assertion verified working: 457 unit tests passed, including every test that imports learning.ts directly or transitively (engine-context, learn cron tests, ess tests, ph tests, drift tests, decay tests).

## Tests

### New file: `tests/learning.unit.bugs.test.ts` (9 tests, all GREEN)

`decayWeights — Phase 19 guard (Plan 19-A-01)`:
1. rejects `lambdaDays = 0` with `/lambdaDays must be > 0/`
2. rejects negative `lambdaDays`
3. rejects `NaN lambdaDays`
4. accepts `lambdaDays = 0.001` (smallest positive)
5. returns `[]` for empty input regardless of lambda (RESEARCH Pitfall 1 contract)

`HYPERPARAMETERS — Zod schema (Plan 19-A-01)`:
6. validates current bootstrap config (no throw)
7. rejects `lambda_days = 0` with message containing `lambda_days`
8. rejects negative `ph_lambda` with message containing `ph_lambda`
9. rejects unknown signal class with message containing `signal class`

### Plan 18-10 sanity test (D-54): GREEN
- `src/lib/__tests__/learning.hyperparameters.test.ts` — 5/5 still passing.
- Confirms no regression to Plan 18-10's nyquist_compliant: true sign-off.

### Full unit suite: 457 passed, 1 skipped, 0 failed

### Integration suite: 71 passed, 1 skipped, 3 failed (pre-existing, out of scope)

The 3 failing integration tests are Phase 16 dual-class / schema / active-rate tests that fail on the current `main` HEAD before any of my changes — verified by running them against the prior commit. None touch `decayWeights` or `HYPERPARAMETERS`. Logged as out-of-scope per SCOPE BOUNDARY rule.

## Deviations from Plan

None — plan executed exactly as written. The plan called for "8 new tests" in the must-haves block but the action explicitly added the empty-input test as a 9th, which was reflected in the acceptance criterion `grep -c "it(" tests/learning.unit.bugs.test.ts >= 9`. Final count: 9 tests, all green.

## Commits

| Task | Commit | Type | Files |
|------|--------|------|-------|
| 1 (RED) | `7d35c36` | test | tests/learning.unit.bugs.test.ts (9 tests) |
| 2 (GREEN) | `649b492` | feat | src/lib/learning.ts (guard + Zod schema + module-load assertion + TODO) |
| 3 (verify + final) | combined into final metadata commit | docs | this SUMMARY.md, STATE.md, ROADMAP.md |

Plan-level final metadata commit follows.

## Threat Coverage

| Threat ID | Status |
|-----------|--------|
| T-19-A-01-01 (silent ESS corruption via lambda=0) | MITIGATED — guard throws `decayWeights: lambdaDays must be > 0 and finite` |
| T-19-A-01-02 (HYPERPARAMETERS typo breaks cron silently) | MITIGATED — `.strict()` schema + module-load assertion fails fast at import |
| T-19-A-01-03 (Phase 20+ additions break .strict() validation) | MITIGATED via documentation — TODO(Phase 20+) comment flags the contract |

No new security-relevant surface introduced (no new endpoints, no new auth paths, no new file access patterns, no new schema fields). Pure-function defensive guard + module-load validator only.

## Self-Check: PASSED

- File `tests/learning.unit.bugs.test.ts` — FOUND
- File `src/lib/learning.ts` modifications — FOUND (zod import, guard, schema, validator, assertion, TODO)
- Commit `7d35c36` — FOUND in git log
- Commit `649b492` — FOUND in git log
- 9/9 new tests passing
- 5/5 Plan 18-10 sanity tests passing (D-54 honored)
- 457/457 unit tests passing (1 todo skipped)
- 4/4 acceptance grep checks passing (`lambdaDays must be > 0`, `validateHyperparameters`, `TODO(Phase 20+)`, `validateHyperparameters(HYPERPARAMETERS)`)
- All 3 known existing call sites verified safe under new guard
