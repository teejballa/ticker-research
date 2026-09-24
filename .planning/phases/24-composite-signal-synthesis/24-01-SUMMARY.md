---
phase: 24-composite-signal-synthesis
plan: 01
subsystem: composite-signal + pure-math + isotonic-serde
tags: [composite, isotonic, ess-weighted, calibration, pure-function, wave-1, tdd]
dependency_graph:
  requires:
    - "Phase 24 Wave 0 (24-00) — CompositeCalibrationSnapshot Prisma model + HYPERPARAMETERS.md §Phase 24 pins + 11 RED test scaffolds + src/lib/composite/types.ts CorpReliabilityResult re-export"
    - "src/lib/stats/isotonic.ts — isotonicRegression PAV primitive (Phase 20-C-02)"
  provides:
    - "src/lib/composite/compose.ts — composeSignal() pure ESS-weighted composite arithmetic (K=4/3/2/1/0 branches)"
    - "src/lib/composite/weights.ts — widenCi() √(4/K) fallback gate + renormalize() helper"
    - "src/lib/composite/isotonic-serde.ts — fitAndSerialize + deserialize round-trip for CompositeCalibrationSnapshot.isotonic_curves JSON"
    - "src/lib/composite/index.ts — barrel export; downstream waves import via '@/lib/composite'"
    - "8 previously-RED tests turned GREEN (ess-weighted-mean 3/3 + fallback-gate 5/5) + 2 isotonic-fit tests GREEN (monotonicity + round-trip)"
  affects:
    - "Wave 2 (24-02) — src/lib/composite/isotonic-fit.ts imports fitAndSerialize + deserialize from isotonic-serde; look-ahead defense test in isotonic-fit.unit.test.ts still RED (Wave 2 lands the fitPerClassCurves fn)"
    - "Wave 3 (24-03) — engine-context.ts imports { composeSignal, widenCi, deserialize } from '@/lib/composite' to inject calibrated composite + widened CI into report render path"
    - "Wave 4 (24-04) — CompositeHeadline component consumes composeSignal output shape (ComposeResult) via engine-context contract"
tech_stack:
  added: []
  patterns:
    - "Pure-function composite arithmetic — zero I/O, zero Prisma, zero fetch, deterministic; testable via injected identity curves"
    - "ESS-weighted composite over ACTIVE-class subset — weight[c] = ess[c] / Σ ess (D-01); active gating drives class_count + gate_status enum"
    - "√(4/K) CI widening with K=1 suppression — reflects reduction in independent classes; low=high=point at K<=1 (D-03)"
    - "Isotonic serde using unique-x breakpoints + step-function binary search — round-trips bit-identical for breakpoint queries; endpoint clamping"
    - "Barrel export in src/lib/composite/index.ts — downstream Waves 2/3/4 import via '@/lib/composite' single entry point"
key_files:
  created:
    - "src/lib/composite/compose.ts"
    - "src/lib/composite/weights.ts"
    - "src/lib/composite/isotonic-serde.ts"
    - "src/lib/composite/index.ts"
    - ".planning/phases/24-composite-signal-synthesis/deferred-items.md"
  modified:
    - "tests/composite/ess-weighted-mean.unit.test.ts (Rule 1 fix — ESM import instead of require)"
    - "tests/composite/fallback-gate.unit.test.ts (Rule 1 fix — ESM import instead of require)"
    - "tests/composite/isotonic-fit.unit.test.ts (Rule 1 fix — ESM imports for Wave 1 tests; Wave 2 look-ahead test still uses require and stays RED)"
decisions:
  - "Test scaffold require('@/...') was a Wave 0 anti-pattern — Rule 1 fix converted 3 Wave 1 test files to top-of-file ESM imports; vitest's resolve.alias only honors ESM imports, not Node's native require()"
  - "Look-ahead defense test in isotonic-fit.unit.test.ts intentionally left with require() pattern — the fitPerClassCurves function it needs won't exist until Wave 2 lands src/lib/composite/isotonic-fit.ts, so it correctly stays RED"
  - "Pre-existing 27 tsc errors in P22 test files (stale unique-index name signal_class_pattern_key_cap_class_horizon_days) logged to deferred-items.md — out of scope per SCOPE BOUNDARY; Wave 1 introduces zero new tsc errors"
  - "Barrel index.ts uses `export type` for pure-type exports (SignalClass, IsotonicPredictor, ClassInput, ComposeResult, IsotonicCurveJSON) — enables verbatimModuleSyntax compliance"

patterns-established:
  - "Composite pure-math layer at src/lib/composite/{compose,weights,isotonic-serde,index}.ts — zero-dependency ring around isotonic.ts primitive; Wave 3 wraps this in engine-context I/O, Wave 4 consumes ComposeResult shape in UI"
  - "TDD RED→GREEN via ESM imports, not require() — the Wave 0 lazy-require pattern breaks once modules exist because vitest alias only applies to import; standard pattern is top-of-file import"
  - "Deferred-items.md at phase root captures out-of-scope discoveries without derailing the current plan — 2 items logged here (P22 tsc errors, Wave 0 scaffold defect)"

requirements-completed: [REASON-01]

metrics:
  duration_minutes: "~5 (implementation was straightforward; ~half the time went to diagnosing + fixing the Wave 0 require() scaffold defect)"
  completed_date: "2026-09-23"
  tasks_completed: "4 of 4 (all autonomous, no checkpoints)"
  files_created: 5
  files_modified: 3
  loc_added: "~130 (compose.ts 68 + weights.ts 45 + isotonic-serde.ts 35 + index.ts 15 + deferred-items.md 40)"
---

# Phase 24 Plan 01: Wave 1 — Pure-Math Composite Helpers Summary

**Pure-math composite arithmetic core: ESS-weighted composeSignal() + √(4/K) widenCi() fallback gate + isotonic-curve fitAndSerialize/deserialize round-trip + barrel export — 8 previously-RED tests turned GREEN; Wave 3 (engine-context) and Wave 4 (dashboard) now have a callable, tested `@/lib/composite` public surface to consume.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-24T02:43:10Z
- **Completed:** 2026-09-24T02:48:01Z
- **Tasks:** 4 (all autonomous, no checkpoints)
- **Files created:** 5
- **Files modified:** 3

## Accomplishments

- **Composite arithmetic core landed at `src/lib/composite/compose.ts`.** `composeSignal(inputs, curves, opts)` filters to ACTIVE classes with non-null raw_posterior + non-null curve, then either returns ESS-weighted mean of per-class isotonic-calibrated posteriors (K >= minClassesActive → `gate_status='active'`) or suppresses with `insufficient_coverage` (0<K<min) / `insufficient_history` (K=0). Verified against golden fixture: K=4 → composite=0.6875; K=3 EXPLORATORY-drop → 0.6571 with renormalized weights; K=1 → null composite + insufficient_coverage.
- **√(4/K) CI widening + renormalization at `src/lib/composite/weights.ts`.** `widenCi(point, low, high, activeK)` returns unchanged at K>=4, suppresses (low=high=point) at K<=1, otherwise widens by factor √(4/K) with [0,1] clamping. `renormalize(weights, activeKeys)` sums active weights to 1 with uniform-1/K fallback when input sums to 0. All 5 fallback-gate tests GREEN.
- **Isotonic (de)serialization at `src/lib/composite/isotonic-serde.ts`.** `fitAndSerialize(x, y)` calls `isotonicRegression` from `@/lib/stats/isotonic`, anchors x_breakpoints at sorted unique x values, populates y_values via predictor evaluation. `deserialize(json)` binary-searches for largest breakpoint ≤ xq with endpoint clamping. Monotonicity + round-trip tests GREEN against `golden-isotonic.json` fixture.
- **Barrel export at `src/lib/composite/index.ts`.** Wave 3/4 can now `import { composeSignal, widenCi, deserialize, ComposeResult, ... } from '@/lib/composite'` — single entry point per plan `must_haves.artifacts`.
- **8 previously-RED tests turned GREEN.** ess-weighted-mean.unit.test.ts (3 tests), fallback-gate.unit.test.ts (5 tests) both fully GREEN. isotonic-fit.unit.test.ts: 2 Wave 1 tests GREEN (monotonicity, round-trip), 1 Wave 2 test stays RED (look-ahead defense — targets not-yet-landed fitPerClassCurves).

## Task Commits

Each task was committed atomically:

1. **Task 1: composeSignal() ESS-weighted composite arithmetic** — `2ed5968` (feat) — 68 LOC in compose.ts + Rule-1 test fix
2. **Task 2: widenCi() + renormalize() √(4/K) fallback gate** — `46fc674` (feat) — 45 LOC in weights.ts + Rule-1 test fix
3. **Task 3: fitAndSerialize + deserialize isotonic-serde** — `f866a71` (feat) — 35 LOC in isotonic-serde.ts + Rule-1 test fix (Wave 1 tests only)
4. **Task 4: barrel export src/lib/composite/index.ts** — `e05343c` (feat) — 15 LOC

**Plan metadata:** committed in this final metadata pass (SUMMARY.md + STATE.md + ROADMAP.md)

## Files Created/Modified

**Created:**
- `src/lib/composite/compose.ts` (68 LOC) — `composeSignal()` + `SignalClass` + `IsotonicPredictor` + `ClassInput` + `ComposeResult`
- `src/lib/composite/weights.ts` (45 LOC) — `widenCi()` + `renormalize()`
- `src/lib/composite/isotonic-serde.ts` (35 LOC) — `fitAndSerialize()` + `deserialize()` + `IsotonicCurveJSON`
- `src/lib/composite/index.ts` (15 LOC) — barrel re-exports
- `.planning/phases/24-composite-signal-synthesis/deferred-items.md` (40 LOC) — 2 out-of-scope items logged

**Modified:**
- `tests/composite/ess-weighted-mean.unit.test.ts` — Rule 1: replaced `require('@/...')` scaffold with ESM top-of-file import
- `tests/composite/fallback-gate.unit.test.ts` — Rule 1: replaced `require('@/...')` scaffold with ESM top-of-file import
- `tests/composite/isotonic-fit.unit.test.ts` — Rule 1: replaced `require('@/...')` with ESM import for the two Wave 1 tests (monotonicity + round-trip); left Wave 2 look-ahead test's `require()` intact so it correctly stays RED

## Decisions Made

- **Wave 0 test scaffold defect fixed inline per Rule 1.** All Wave 0 scaffolds used `const { X } = require('@/lib/...')` inside `it()` bodies for lazy resolution — a pattern that fails once modules exist because vitest's `resolve.alias` only applies to ESM `import` statements, not Node's native `require()`. Converted the three Wave 1 test files to top-of-file ESM imports.
- **Kept `require()` for the Wave 2 look-ahead defense test.** That test targets `@/lib/composite/isotonic-fit` which doesn't exist yet — the require() failure IS the RED signal Wave 2 will resolve. Converting it now would produce a compile error instead of a runtime error.
- **Pre-existing 27 tsc errors deferred to scope-boundary log.** All 27 errors are in P22-era test files with stale unique-index refs (`signal_class_pattern_key_cap_class_horizon_days` needs `_regime` suffix). Wave 1 introduces zero new tsc errors. Fix belongs in a P22 cleanup plan.
- **Barrel uses `export type` for pure types.** SignalClass, IsotonicPredictor, ClassInput, ComposeResult, IsotonicCurveJSON are all type-only exports; using `export type` ensures verbatimModuleSyntax compliance and prevents unnecessary runtime bindings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wave 0 test scaffolds' `require('@/...')` pattern doesn't resolve in vitest**
- **Found during:** Task 1 (composeSignal verification — vitest run failed with `Cannot find module '@/lib/composite/compose'`)
- **Issue:** Wave 0 scaffolds landed 11 RED tests using `const { X } = require('@/lib/...')` inside `it()` bodies as a lazy-resolution pattern. Vitest's `resolve.alias` only applies to ESM `import` statements. Node's native `require()` bypasses vitest's resolver and reaches for its own resolution, which doesn't know about `@/`. Result: even with modules present, tests fail with `Cannot find module`.
- **Fix:** For the three Wave 1 test files (ess-weighted-mean.unit.test.ts, fallback-gate.unit.test.ts, isotonic-fit.unit.test.ts) converted the `require()` calls to top-of-file ESM imports. Kept the look-ahead defense test's require() intact because it targets a Wave 2 module and MUST stay RED.
- **Files modified:** tests/composite/ess-weighted-mean.unit.test.ts, tests/composite/fallback-gate.unit.test.ts, tests/composite/isotonic-fit.unit.test.ts
- **Verification:** All 8 Wave 1 tests GREEN post-fix; look-ahead defense test correctly stays RED per plan.
- **Committed in:** `2ed5968` (Task 1), `46fc674` (Task 2), `f866a71` (Task 3)

---

**Total deviations:** 1 auto-fixed (1 bug — Rule 1)
**Impact on plan:** Scaffold defect only; zero impact on Wave 1 arithmetic correctness. Same fix will need to be re-applied to remaining scaffolds when Waves 2/3/4 land their corresponding implementations. Documented in `deferred-items.md`.

## Issues Encountered

- **Vitest alias limitation with `require()`.** Diagnosed and fixed in-flight (see Rule-1 auto-fix). Root cause: vitest's `resolve.alias` is set up for its own ESM resolver; Node's native `require()` uses Node's resolver, which doesn't consult vitest's alias map. This is documented behavior in vitest but is easy to miss when translating existing scaffolds.

## User Setup Required

None — pure-math implementation, zero I/O, zero external service configuration, zero new dependencies. All work landed on main working tree via normal commits with hooks.

## Next Phase Readiness

**Wave 2 (24-02-PLAN.md) is unblocked.**

| Wave 2 deliverable | Consumes from Wave 1 |
|--------------------|---------------------|
| `src/lib/composite/isotonic-fit.ts` fitPerClassCurves | imports `fitAndSerialize` from `@/lib/composite/isotonic-serde` |
| `scripts/fit-composite-isotonic.ts` CLI | imports `fitAndSerialize` from `@/lib/composite/isotonic-serde` |
| bootstrap-ci.unit.test.ts | imports `computeCompositeCi` (Wave 2 to land) — no Wave 1 dependency |
| logistic-baseline.unit.test.ts | imports `logistic36Brier` (Wave 2 to land) — no Wave 1 dependency |

**Wave 3 (24-03-PLAN.md) is unblocked.**

| Wave 3 deliverable | Consumes from Wave 1 |
|--------------------|---------------------|
| engine-context.ts extension | imports `{ composeSignal, widenCi, deserialize }` from `@/lib/composite` |
| /api/cron/composite-calibration | imports `fitAndSerialize` for isotonic curve persistence |

**Concerns for Waves 2-4:**
- The scaffold `require('@/...')` defect will re-surface in bootstrap-ci, logistic-baseline, engine-context-composite, schema-negative-shape, reliability-bins, panel-headline, insights-render, and gemini-analysis-composite-overwrite when their target implementations land. Same Rule-1 fix pattern applies: top-of-file ESM import. Documented in `deferred-items.md`.
- Pre-existing 27 P22 tsc errors don't block downstream waves (all in test files that vitest's exclude list already blocks from unit runs; only affect `tsc --noEmit`).

## Threat-Surface Check

No new threat surface beyond what the plan's `<threat_model>` already enumerated. T-24-01-01 (composeSignal tampering) is mitigated by pure-function determinism + caller-side ClassInput.status validation. T-24-01-02 (fitAndSerialize DoS) is accepted — only invoked from Wave 2 cron, not user-callable. No `threat_flags` to record.

## Self-Check: PASSED

Verified all artifacts on disk and all task commits in git history:

```
FOUND: src/lib/composite/compose.ts                         (68 LOC)
FOUND: src/lib/composite/weights.ts                         (45 LOC)
FOUND: src/lib/composite/isotonic-serde.ts                  (35 LOC)
FOUND: src/lib/composite/index.ts                           (15 LOC)
FOUND: .planning/phases/24-composite-signal-synthesis/deferred-items.md (40 LOC)
FOUND: commit 2ed5968 (feat 24-01 Task 1 composeSignal)
FOUND: commit 46fc674 (feat 24-01 Task 2 widenCi + renormalize)
FOUND: commit f866a71 (feat 24-01 Task 3 fitAndSerialize + deserialize)
FOUND: commit e05343c (feat 24-01 Task 4 barrel export)
GREEN: tests/composite/ess-weighted-mean.unit.test.ts       (3/3 passed)
GREEN: tests/composite/fallback-gate.unit.test.ts           (5/5 passed)
GREEN: tests/composite/isotonic-fit.unit.test.ts            (2 passed, 1 look-ahead stays RED as expected)
TSC:   0 composite-related errors (27 pre-existing P22 errors logged to deferred-items.md)
```

---
*Phase: 24-composite-signal-synthesis*
*Completed: 2026-09-23*
