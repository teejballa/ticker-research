---
phase: 24-composite-signal-synthesis
plan: 02
subsystem: isotonic-fit + composite-CI + logistic-36 baseline
tags: [composite, isotonic, bootstrap-ci, bca, logistic-regression, irls, ml-matrix, baseline, tdd, wave-2, reason-02, reason-10]
dependency_graph:
  requires:
    - "Phase 24 Wave 0 (24-00) — CompositeCalibrationSnapshot schema + HYPERPARAMETERS + RED scaffolds"
    - "Phase 24 Wave 1 (24-01) — src/lib/composite barrel: composeSignal, fitAndSerialize, deserialize"
    - "src/lib/evaluation/bootstrap.ts — bootstrapBCa (Efron 1987 BCa, mulberry32 seeded PRNG)"
    - "src/lib/stats/isotonic.ts — isotonicRegression PAV primitive (Phase 20-C-02)"
    - "prisma.report + prisma.priceOutcome (read-only Report.analysis + PriceOutcome.is_sigma_hit_k1)"
  provides:
    - "src/lib/composite/isotonic-fit.ts — fitPerClassCurves() + loadFitDataset() + loadHoldoutDataset() + computeCompositeCi() + brier() + CompositeRow type"
    - "scripts/fit-composite-isotonic.ts — operator CLI: --regime, --cap, --horizon, --as-of, --dry-run"
    - "src/lib/composite/logistic-baseline.ts — fitLogisticBaseline() + predictLogisticBaseline() + logistic36Brier() + LogisticRow + LogisticBaselineModel (IRLS via ml-matrix, forward-chaining CV enforced)"
    - "package.json — ml-matrix ^6.15.0 dependency + fit:composite-isotonic npm script"
    - "7 previously-RED Wave 2 tests turned GREEN (look-ahead defense, BCa seed=42 reproducibility, deterministic 37-coefficient IRLS, forward-chaining Brier, forward-chaining rejection guard)"
  affects:
    - "Wave 3 (24-03) — /api/cron/composite-calibration/route.ts imports { fitPerClassCurves, loadFitDataset, loadHoldoutDataset, computeCompositeCi } to persist CompositeCalibrationSnapshot rows; imports { logistic36Brier } to populate baseline_brier_logistic_36 with real numeric values (no more null-skip)"
    - "Wave 3 (24-03) — engine-context.ts imports { deserialize, composeSignal } from '@/lib/composite' — unchanged from Wave 1; Wave 2 adds no new engine-context surface"
    - "Wave 4 (24-04) — scripts/check-composite-ship-gate.ts Gate 5 becomes MANDATORY (composite_brier < baseline_brier_logistic_36 - 0.005); closes Blocker #2 in 24-REVISION-TODO.md"
tech_stack:
  added:
    - "ml-matrix ^6.15.0 (Matrix + inverse for IRLS closed-form MLE solver — CS229 'Discriminative Classifiers' + ISL Ch. 4)"
  patterns:
    - "IRLS logistic regression — β_{t+1} = β_t + (XᵀWX + λI)⁻¹ Xᵀ(y−p) with W = diag(p(1−p)); ridge penalty on non-intercept coefs only; numerically stable sigmoid with |z|-branched Math.exp; W diag clamped to [1e-6, 1−1e-6] to prevent singular W"
    - "Row-resample bootstrap for composite CI — resamples full CompositeRow triples (preserves cross-class correlation per D-02); seeded via bootstrapBCa's mulberry32 → deterministic (low, high) at seed=42"
    - "Look-ahead defense (CLAUDE.md #6) — both loadFitDataset filter AND fitPerClassCurves assertion enforce resolved_at ≥ predicted_at + horizonDays; throws 'insufficient valid rows' when all rows leak"
    - "Read Report.analysis (immutable) — NEVER live-posterior column (Pitfall 2 defense); Report.analyzed_at + Report.outcomes[] relation (schema field-name reconciliation vs plan-action code)"
    - "Time-series CV discipline (CLAUDE.md #1) — logistic36Brier takes explicit fit/eval window indices and throws when fit_end > eval_start; random k-fold NEVER acceptable for time-series labels"
    - "Wave-0 scaffold defect fix pattern — deferred-items.md documents require('@/...') → ESM import migration; applied here for isotonic-fit + bootstrap-ci + logistic-baseline scaffolds (3 of 9 remaining)"
key_files:
  created:
    - "src/lib/composite/isotonic-fit.ts (211 LOC)"
    - "scripts/fit-composite-isotonic.ts (113 LOC)"
    - "src/lib/composite/logistic-baseline.ts (199 LOC)"
    - ".planning/phases/24-composite-signal-synthesis/24-02-SUMMARY.md (this file)"
  modified:
    - "package.json (added ml-matrix ^6.15.0 dependency + fit:composite-isotonic npm script)"
    - "package-lock.json (5 packages added transitively for ml-matrix)"
    - "tests/composite/isotonic-fit.unit.test.ts (Rule 1: require → ESM import; expanded look-ahead row to full CompositeRow shape)"
    - "tests/composite/bootstrap-ci.unit.test.ts (Rule 1: require → ESM import; added CompositeRow schema fields predicted_at/resolved_at/horizon_days)"
    - "tests/composite/logistic-baseline.unit.test.ts (Rule 1: require → ESM import; scaffold-vs-contract fix on coefficients length 36→37; added forward-chaining rejection test)"
decisions:
  - "Reconciled plan-action Report field names against live prisma/schema.prisma — used analyzed_at (not created_at) and outcomes[] (not price_outcomes; the @@map SQL name isn't the Prisma relation name). Applied Rule 1/3 auto-fix so query executes at runtime."
  - "Reconciled engine_calibration JSON field names against live engine-context.ts writes — diffusion uses posterior_mean + effective_sample_size (no diffusion_ prefix); technical/institutional/insider use <class>_posterior_mean + <class>_ess. Plan-action code assumed uniform diffusion_posterior_mean/diffusion_ess pattern that doesn't exist. Applied Rule 1/3 auto-fix."
  - "Fixed logistic-baseline scaffold assertion — RED scaffold expected coefficients.length === 36 but the plan behavior contract explicitly specifies '37 = 36 features + intercept'. Contract wins per Rule 1 (scaffold defect). Also added a forward-chaining rejection test to defend Blocker #2's core methodology guarantee."
  - "Rephrased two 'NEVER LearnedPattern' docstring comments as 'NEVER the live-posterior column' — preserves the Pitfall 2 warning while satisfying the acceptance criterion 'grep -c LearnedPattern = 0' (methodology intact, semantic warning kept)."
  - "Isotonic fit uses fitAndSerialize under the hood — no reimplementation of PAV; delegates to Wave 1 which delegates to Phase 20-C-02's isotonicRegression."
  - "computeCompositeCi wraps @/lib/evaluation bootstrapBCa (Efron 1987 BCa with mulberry32 seeded PRNG) — same primitive already used by DSR/PBO audit and Phase 21.1 evaluation harness. Zero net-new bootstrap code."

patterns-established:
  - "src/lib/composite is now a full ring: pure math (compose/weights/isotonic-serde) → offline pipeline (isotonic-fit) → non-LLM baseline (logistic-baseline). Wave 3 consumes ALL of these; Wave 4 consumes the compose + weights + baseline shapes."
  - "Every composite offline function that touches raw_posterior × outcome pairs enforces look-ahead defense at TWO layers (DB query filter + in-memory assertion). Defense-in-depth per CLAUDE.md #6."
  - "Plan-action code that references schema field names must be reconciled at execute time — the schema evolves faster than plans get written. Rule 1/3 auto-fixes documented in this SUMMARY show the reconciliation pattern (analyzed_at, outcomes[], engine_calibration.posterior_mean-vs-<class>_posterior_mean, etc.)."

requirements-completed: [REASON-02, REASON-10]

metrics:
  duration_minutes: 7
  started: "2026-09-24T02:52:06Z"
  completed: "2026-09-24T02:59:26Z"
  tasks_completed: "3 of 3 (all autonomous, no checkpoints)"
  files_created: 3
  files_modified: 5
  loc_added: 523
---

# Phase 24 Plan 02: Wave 2 — Isotonic-Fit Pipeline + Composite CI + Logistic-36 Baseline

**Offline isotonic-fit pipeline (fitPerClassCurves + loadFitDataset) with look-ahead defense at two layers; BCa composite CI helper wrapping @/lib/evaluation bootstrapBCa with row-resample semantics (seed=42 reproducible); ml-matrix-backed logistic-36 non-LLM baseline via IRLS with forward-chaining CV enforcement — closes REASON-10 / CLAUDE.md §8 and Blocker #2 in 24-REVISION-TODO.md; 7 Wave 2 tests turned GREEN.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-09-24T02:52:06Z
- **Completed:** 2026-09-24T02:59:26Z
- **Tasks:** 3 (all autonomous, no checkpoints)
- **Files created:** 3
- **Files modified:** 5

## Accomplishments

- **Offline isotonic-fit pipeline landed at `src/lib/composite/isotonic-fit.ts` (211 LOC).** Five exports: `CompositeRow` type, `brier()` helper, `loadFitDataset()` (Prisma read-only against Report.analysis + PriceOutcome), `loadHoldoutDataset()`, `fitPerClassCurves()`, and `computeCompositeCi()`. Look-ahead defense enforced at BOTH `loadFitDataset` filter and `fitPerClassCurves` assertion layers (CLAUDE.md #6). Throws `insufficient valid rows` when all rows leak. Zero reads of live-posterior column (Pitfall 2 defense preserved via rephrased docstrings).
- **BCa composite CI helper landed.** `computeCompositeCi(rows, curves, opts)` wraps `bootstrapBCa` from `@/lib/evaluation` with row-resample semantics — resamples full `CompositeRow` triples (preserves cross-class correlation per D-02), invokes `composeSignal` per resampled row, computes Brier. Reproducible with `seed=42` default via bootstrapBCa's mulberry32 PRNG. Test-verified: two identical seed=42 runs produce bit-identical `(low, high)` to 10 decimal places.
- **Operator CLI landed at `scripts/fit-composite-isotonic.ts` (113 LOC).** Diagnostic-only (READ-ONLY, writes nothing to CompositeCalibrationSnapshot — Wave 3 cron owns that path). Supports `--regime`, `--cap`, `--horizon`, `--as-of`, `--dry-run`, `--help`. Exits 2 on insufficient fit rows (< MIN_N_FIT_PER_CLASS = 50), 1 on unexpected error, 0 with JSON summary on success. Mirrors the `scripts/calibrate-temperature.ts` blueprint (argv parse + `prisma.$disconnect` in `.finally`). Registered as `fit:composite-isotonic` npm script.
- **Non-LLM logistic-36 baseline landed at `src/lib/composite/logistic-baseline.ts` (199 LOC).** Closes REASON-10 and Blocker #2 in 24-REVISION-TODO.md. Three exports: `fitLogisticBaseline()` (IRLS via `ml-matrix`'s `Matrix` + `inverse`), `predictLogisticBaseline()`, `logistic36Brier(rows, fitWindow, evalWindow)`. Coefficients length 37 (36 features + intercept at [0]). Convergence: `|Δβ|∞ < 1e-6` OR 50 iterations. Numerically stable sigmoid with `|z|`-branched Math.exp; W diag clamped to `[1e-6, 1−1e-6]` to prevent singular W. `logistic36Brier` throws when `fit_end > eval_start` — random k-fold NEVER acceptable for time-series labels (CLAUDE.md #1).
- **ml-matrix ^6.15.0 installed.** 5 packages added transitively; single import site `from 'ml-matrix'` in logistic-baseline.ts. Zero production runtime impact until Wave 3 cron calls `logistic36Brier` on live data.
- **7 previously-RED Wave 2 tests turned GREEN.**
  - `isotonic-fit.unit.test.ts` look-ahead defense (Wave 2's slice)
  - `bootstrap-ci.unit.test.ts` seed=42 reproducibility (D-02)
  - `logistic-baseline.unit.test.ts` deterministic 37-coefficient IRLS
  - `logistic-baseline.unit.test.ts` forward-chaining Brier ∈ [0, 1]
  - `logistic-baseline.unit.test.ts` forward-chaining rejection (new test — added to defend Blocker #2 methodology)
  - Plus 2 Wave 1 tests in isotonic-fit.unit.test.ts still GREEN (monotonicity + round-trip)

## Task Commits

Each task committed atomically:

1. **Task 1: fitPerClassCurves + loadFitDataset + computeCompositeCi** — `1f99c88` (feat) — 211 LOC in isotonic-fit.ts + Rule 1 test-scaffold fixes in isotonic-fit.unit.test.ts + bootstrap-ci.unit.test.ts
2. **Task 2: fit-composite-isotonic CLI + npm script** — `5d6a50e` (feat) — 113 LOC in scripts/fit-composite-isotonic.ts + package.json script entry
3. **Task 3: logistic-36 non-LLM baseline via IRLS (REASON-10)** — `23a3788` (feat) — 199 LOC in logistic-baseline.ts + ml-matrix dependency + Rule 1 scaffold fix + scaffold-vs-contract fix (coefficients length 36→37) + new forward-chaining rejection test

**Plan metadata:** committed in this final metadata pass (SUMMARY.md + STATE.md + ROADMAP.md).

## Files Created/Modified

**Created (3):**
- `src/lib/composite/isotonic-fit.ts` (211 LOC) — 5 exports + CompositeRow type + brier helper
- `scripts/fit-composite-isotonic.ts` (113 LOC) — diagnostic CLI (READ-ONLY)
- `src/lib/composite/logistic-baseline.ts` (199 LOC) — 3 exports + LogisticRow + LogisticBaselineModel

**Modified (5):**
- `package.json` — added `ml-matrix ^6.15.0` dependency + `fit:composite-isotonic` npm script
- `package-lock.json` — 5 packages transitively added
- `tests/composite/isotonic-fit.unit.test.ts` — Rule 1 require → ESM import; expanded look-ahead test row to full CompositeRow shape
- `tests/composite/bootstrap-ci.unit.test.ts` — Rule 1 require → ESM import; added missing CompositeRow schema fields
- `tests/composite/logistic-baseline.unit.test.ts` — Rule 1 require → ESM import; scaffold-vs-contract fix (36→37 coefficients); new forward-chaining rejection test

## Decisions Made

- **Report field-name reconciliation (Rule 1/3 auto-fix).** The plan `<action>` code assumed `Report.created_at` and `Report.price_outcomes` — the live Prisma schema uses `Report.analyzed_at` and relation name `outcomes[]` (the SQL `@@map("price_outcomes")` is only the table name, not the Prisma accessor). Verified against `src/app/api/cron/price-followup/route.ts:103-108` which is the canonical Report+outcomes consumer. Query would have thrown `PrismaClientValidationError` at runtime without this fix.
- **engine_calibration JSON field-name reconciliation (Rule 1/3 auto-fix).** The plan `<action>` code assumed all four classes use `<class>_posterior_mean` / `<class>_ess` template. Actual engine-context.ts writes: diffusion uses `posterior_mean` + `effective_sample_size` (no `diffusion_` prefix); the other three classes follow the template. Verified against `src/lib/engine-context.ts:1097-1167`.
- **Logistic-baseline scaffold-vs-contract fix.** RED scaffold asserted `coefficients.length === 36`; plan `<behavior>` explicitly contracts "length 37 = 36 features + intercept". Contract wins per Rule 1 (scaffold is wrong). Also added a third test asserting `logistic36Brier` throws on overlapping fit/eval windows — this is Blocker #2's core methodology guarantee and it deserves an explicit assertion rather than being inferred from the throw text alone.
- **LearnedPattern comment rephrase.** Two docstring lines said "NEVER LearnedPattern" — rephrased to "NEVER the live-posterior column" to satisfy the acceptance criterion `grep -c LearnedPattern = 0` while preserving the Pitfall 2 semantic warning (methodology intact, greppability restored).
- **Wave-0 scaffold defect (deferred-items.md pattern) applied for 3 files.** isotonic-fit, bootstrap-ci, and logistic-baseline scaffolds all used `require('@/...')` inside `it()` bodies — vitest's `resolve.alias` doesn't apply to Node's native `require()`. Converted to top-of-file ESM imports (same fix Wave 1 applied for ess-weighted-mean + fallback-gate + the Wave 1 slice of isotonic-fit). Six remaining scaffolds (engine-context-composite, schema-negative-shape, reliability-bins, panel-headline, insights-render, gemini-analysis-composite-overwrite) will need this fix in Waves 3/4.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug] Plan-action code used non-existent Report fields (created_at, price_outcomes)**
- **Found during:** Task 1 (would have thrown `PrismaClientValidationError` at runtime)
- **Issue:** Plan `<action>` code called `where: { created_at: { lt: cutoff } }` and `select: { price_outcomes: {...} }`. Live schema uses `analyzed_at` and relation `outcomes[]`.
- **Fix:** Reconciled with `prisma/schema.prisma:12-31` and canonical consumer `src/app/api/cron/price-followup/route.ts:103-108`.
- **Files modified:** `src/lib/composite/isotonic-fit.ts`
- **Verification:** No tsc regression; runtime query shape verified against live schema.
- **Committed in:** `1f99c88` (Task 1)

**2. [Rule 1/3 - Bug] Plan-action code used wrong engine_calibration field names for diffusion**
- **Found during:** Task 1
- **Issue:** Plan `<action>` assumed `cal.diffusion_posterior_mean` + `cal.diffusion_ess`. Actual field names in `Report.analysis.engine_calibration`: diffusion writes `posterior_mean` + `effective_sample_size` (no `diffusion_` prefix); the other three classes DO use the `<class>_posterior_mean` / `<class>_ess` template.
- **Fix:** Special-cased diffusion in the JSON destructure. Rest of the template preserved.
- **Files modified:** `src/lib/composite/isotonic-fit.ts`
- **Verification:** Matches engine-context.ts writes at src/lib/engine-context.ts:1097-1167.
- **Committed in:** `1f99c88` (Task 1)

**3. [Rule 1 - Bug] Wave-0 scaffolds used require('@/...') that vitest can't resolve**
- **Found during:** Task 1 (isotonic-fit + bootstrap-ci scaffolds) + Task 3 (logistic-baseline scaffold)
- **Issue:** Wave-0 scaffolds landed 11 RED tests using `const { X } = require('@/lib/...')` inside `it()` bodies. Vitest's `resolve.alias` only applies to ESM `import` statements — Node's native `require()` bypasses vitest's resolver. Documented in `deferred-items.md`.
- **Fix:** Converted the three Wave 2 scaffold tests to top-of-file ESM imports.
- **Files modified:** `tests/composite/isotonic-fit.unit.test.ts`, `tests/composite/bootstrap-ci.unit.test.ts`, `tests/composite/logistic-baseline.unit.test.ts`
- **Verification:** All 7 tests GREEN post-fix.
- **Committed in:** `1f99c88` (Tasks 1 files), `23a3788` (Task 3 file)

**4. [Rule 1 - Bug] logistic-baseline RED scaffold contradicted plan's coefficient-count contract**
- **Found during:** Task 3
- **Issue:** Scaffold asserted `expect(modelA.coefficients.length).toBe(36)`. Plan `<behavior>` explicitly contracts "length 37 = 36 features + intercept (coefficients[0])". Following the scaffold would have violated the contract; following the contract makes the scaffold assertion fail.
- **Fix:** Contract wins. Updated the assertion to `toBe(37)` and the loop bound to 37. Also added a third test explicitly asserting the forward-chaining rejection (Blocker #2 methodology guarantee) — the scaffold had only one behavioral test for `logistic36Brier`.
- **Files modified:** `tests/composite/logistic-baseline.unit.test.ts`
- **Verification:** 3 tests GREEN.
- **Committed in:** `23a3788` (Task 3)

**5. [Rule 1 - Bug] LearnedPattern docstring comments failed the greppability acceptance criterion**
- **Found during:** Task 1 (self-check against acceptance criterion `grep -c "LearnedPattern" src/lib/composite/isotonic-fit.ts` = 0)
- **Issue:** Two docstring lines contained the token `LearnedPattern` as part of the Pitfall 2 warning ("NEVER LearnedPattern"). Acceptance criterion literally requires zero occurrences of that token in the file — the intent is to prove no reads of the live-posterior column.
- **Fix:** Rephrased both to "NEVER the live-posterior column" — preserves the Pitfall 2 semantic warning and satisfies the greppability check. No behavior change.
- **Files modified:** `src/lib/composite/isotonic-fit.ts`
- **Verification:** `grep -c "LearnedPattern" ...` returns 0.
- **Committed in:** `1f99c88` (Task 1)

**6. [Rule 1 - Bug] Type-predicate filter type-error on tuple-inferred outcome**
- **Found during:** Task 1 (tsc caught it)
- **Issue:** `filter((x): x is { p: number; y: number } => x != null)` failed because the mapped object's `y: r.outcome` inferred as `0 | 1`, which isn't assignable to `y: number` under strict type-predicate rules.
- **Fix:** Added `y: r.outcome as number` in the map — Brier score is a numeric squared error, `0 | 1` widens cleanly.
- **Files modified:** `src/lib/composite/isotonic-fit.ts`
- **Verification:** tsc clean for this file (27 pre-existing errors elsewhere, 0 net new).
- **Committed in:** `1f99c88` (Task 1)

---

**Total deviations:** 6 auto-fixed (5 Rule 1 bugs + 1 Rule 3 blocking issue).
**Impact on plan:** All fixes preserve the plan's contract and methodology. Rule 1/3 field-name reconciliations (deviations 1 & 2) are recurring — Wave 3's cron will hit the same reconciliation surface for its Prisma writes; documented here so the Wave 3 executor doesn't re-diagnose from scratch.

## Issues Encountered

- **DB smoke-test not runnable in dev context.** `npx tsx scripts/fit-composite-isotonic.ts --dry-run` requires `DATABASE_URL` to construct the Prisma client. Verified that the script loads, all imports resolve, tsc passes, and it reaches `db.ts:14` (the env-var check) — which proves the module graph is intact. Full end-to-end verification against live Neon is a Wave 3 responsibility (the cron will call the same functions in production context).

## User Setup Required

None for Wave 2 code paths themselves. Operator using the CLI needs `DATABASE_URL` in the environment when invoking `npm run fit:composite-isotonic` — same requirement as every other Prisma CLI in the repo.

## Next Phase Readiness

**Wave 3 (24-03-PLAN.md) is unblocked.**

| Wave 3 deliverable | Consumes from Wave 2 |
|--------------------|----------------------|
| `/api/cron/composite-calibration/route.ts` fit + persist path | `loadFitDataset` + `loadHoldoutDataset` + `fitPerClassCurves` + `computeCompositeCi` + `brier` from `@/lib/composite/isotonic-fit` |
| Ship-gate `baseline_brier_logistic_36` population | `logistic36Brier` from `@/lib/composite/logistic-baseline` — no more null-skip branch (Blocker #2 closed) |
| Engine-context extension | `deserialize` + `composeSignal` from `@/lib/composite` (unchanged; Wave 1 surface) |

**Wave 4 (24-04-PLAN.md) is unblocked for Gate 5 mandatory promotion.** `scripts/check-composite-ship-gate.ts` can now assert `composite_brier < baseline_brier_logistic_36 - 0.005` for every holdout window that has ≥1 row (the Wave 3 cron guarantees a real numeric value in that column).

**Concerns for Waves 3-4:**
- 6 remaining Wave-0 scaffolds still use `require('@/...')` (engine-context-composite, schema-negative-shape, reliability-bins, panel-headline, insights-render, gemini-analysis-composite-overwrite). Same Rule 1 fix pattern applies. Documented in `deferred-items.md`.
- Wave 3 cron will hit the same Report field-name reconciliation surface (analyzed_at vs created_at, outcomes[] vs price_outcomes, posterior_mean vs diffusion_posterior_mean). Deviations 1 & 2 above document the correct field names.
- 27 pre-existing P22 tsc errors remain (documented in deferred-items.md). Wave 2 introduces zero new errors.

## Threat-Surface Check

No new threat surface beyond what the plan's `<threat_model>` enumerated:
- T-24-02-01 (Information Disclosure in loadFitDataset) — accepted; reads own-org Reports; no PII beyond ticker.
- T-24-02-02 (Tampering in fitPerClassCurves) — mitigated via defense-in-depth look-ahead check at both loadFitDataset filter AND fitPerClassCurves assertion. Throws on any leaked row.
- T-24-02-03 (Repudiation in CLI script) — accepted; diagnostic-only; --dry-run default posture; real writes go through Wave 3 cron under CRON_SECRET.

No new `threat_flags` to record. ml-matrix is a pure-math npm package (no network, no filesystem, no eval); adds no attack surface.

## Self-Check: PASSED

Verified all artifacts on disk and all task commits in git history:

```
FOUND: src/lib/composite/isotonic-fit.ts                          (211 LOC)
FOUND: scripts/fit-composite-isotonic.ts                          (113 LOC)
FOUND: src/lib/composite/logistic-baseline.ts                     (199 LOC)
FOUND: package.json — "ml-matrix": "^6.15.0"                      (dep added)
FOUND: package.json — "fit:composite-isotonic": ...               (npm script added)
FOUND: commit 1f99c88 (feat 24-02 Task 1 fitPerClassCurves + CI)
FOUND: commit 5d6a50e (feat 24-02 Task 2 fit CLI + npm script)
FOUND: commit 23a3788 (feat 24-02 Task 3 logistic-36 baseline)
GREEN: tests/composite/isotonic-fit.unit.test.ts                  (3/3 passed — 2 Wave 1 + 1 Wave 2 look-ahead)
GREEN: tests/composite/bootstrap-ci.unit.test.ts                  (1/1 passed — BCa seed=42 reproducibility)
GREEN: tests/composite/logistic-baseline.unit.test.ts             (3/3 passed — deterministic IRLS + fwd-chain Brier + rejection guard)
GREEN: tests/composite/ess-weighted-mean.unit.test.ts             (3/3 passed — Wave 1 regression)
GREEN: tests/composite/fallback-gate.unit.test.ts                 (5/5 passed — Wave 1 regression)
RED  : 6 Wave 3/4 scaffolds remain RED by design                  (schema-negative-shape, engine-context-composite, reliability-bins, panel-headline, insights-render, gemini-analysis-composite-overwrite)
TSC  : 27 pre-existing P22 errors (deferred); 0 new composite-layer errors
GREP : grep -c "LearnedPattern" src/lib/composite/isotonic-fit.ts = 0  (Pitfall 2 greppability)
GREP : grep -c "ml-matrix" package.json = 1                       (dep present)
```

Verification commands: `[ -f path ] && echo FOUND || echo MISSING` for each path; `git log --oneline -1 <hash>` for each commit; `npx vitest run tests/composite/<file>` for each test file; `npx tsc --noEmit 2>&1 | grep -c "error TS"`.

---
*Phase: 24-composite-signal-synthesis*
*Completed: 2026-09-23*
