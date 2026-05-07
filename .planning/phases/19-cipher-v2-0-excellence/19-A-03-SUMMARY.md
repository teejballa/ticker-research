---
phase: 19
plan: 19-A-03
subsystem: ml-quant-validation
tags: [phase-19, wave-a, ml, learning, conformal, vovk-romano, distribution-free, prediction-interval, d-19]
dependency_graph:
  requires:
    - 19-Z-01 (features.ts FLAG_NAMES — Wave Z infra prereq)
    - 19-Z-02 (Prisma additive Phase 19 schema — LearnedPattern.conformal_low/high columns)
    - 19-Z-03 (shadow infra)
    - 19-Z-04 (model-card-status gate)
    - 19-A-01 (decayWeights guard + HYPERPARAMETERS Zod)
  provides:
    - "conformalInterval(pointPrediction, calibrationResiduals, alpha=0.05): ConformalInterval — Vovk-Romano split-conformal at zero-indexed quantile ⌈(1-α)(n+1)⌉ - 1"
    - "ConformalInterval interface: { low, high, alpha, n_calibration }"
    - "engine-context.ts surfaces conformal_low/conformal_high alongside Bayesian credible interval (additive — both render side-by-side)"
    - "EngineCalibrationPanel renders ConformalCIRow component below the Engine Prior MetricCard in both QuadClassPanel and DiffusionOnlyPanel layouts (additive — Bayesian display untouched)"
    - "Synthetic n=10000 coverage harness in tests/learning.conformal.test.ts (Mulberry32 LCG + Box-Muller) — empirical coverage validated within ±2% across α ∈ {0.01, 0.05, 0.10, 0.20}"
  affects:
    - "src/lib/learning.ts (additive — adds conformalInterval + ConformalInterval interface; existing Bayesian credibleInterval95 path untouched)"
    - "src/lib/engine-context.ts (LearnedCellLike type extends with conformal_low/conformal_high; EngineContext type adds conformal_low/conformal_high; getEngineContextForTicker reads them from diffusionCell at the 7d primary horizon)"
    - "src/components/EngineCalibrationPanel.tsx (EngineCalibrationESSExtensions adds conformal_low/conformal_high; ConformalCIRow component rendered via extraBelow prop in diffusion column AND in legacy DiffusionOnlyPanel)"
    - "LearnedPattern.conformal_low / conformal_high columns (already nullable from 19-Z-02) — populated null until 19-A-04+ DSR/PBO/CPCV cron writes calibration residuals"
tech-stack:
  added: []
  patterns:
    - "Vovk-Romano split-conformal — distribution-free 95% coverage guarantee under exchangeability; complements (does NOT replace) the parametric Bayesian credibleInterval95"
    - "Pure-function primitive in learning.ts — no DB access, no I/O, no side effects (D-18 invariant); all state passed in"
    - "Edge-case n<10 returns widest possible [0, 1] with n_calibration reported — caller can detect 'pending' state via the n_calibration field (mirrors the n<10 Bayesian EXPLORATORY gate so both CI surfaces light up together)"
    - "Boundary clamping to [0, 1] — Cipher use case is probability prediction; conformal is symmetric [p-q, p+q] when neither boundary fires, otherwise clamped"
    - "Mulberry32 LCG + Box-Muller in test harness — deterministic seeded PRNG so synthetic coverage tests are reproducible across CI runs"
    - "recoverQ test helper — extracts the half-width q from the public API by sweeping anchor predictions across [0.05, 0.95] and detecting clamp asymmetry; allows O(1) coverage check on test points without re-sorting calibration set 10000 times"
    - "Additive UI surface — ConformalCIRow component added via extraBelow prop in both QuadClassPanel (Phase 17-04 layout) and DiffusionOnlyPanel (legacy fallback); Bayesian display remains in Engine Prior MetricCard.subValue; both 95% intervals visible together"
key-files:
  created:
    - tests/learning.conformal.test.ts (7 vitest tests — synthetic n=10000 coverage validation across 4 α levels)
  modified:
    - src/lib/learning.ts (added: ConformalInterval interface + conformalInterval function with D-19 documentation block)
    - src/lib/engine-context.ts (modified: LearnedCellLike extended; EngineContext extended; getEngineContextForTicker reads diffusionCell.conformal_low/high and surfaces alongside Bayesian ci_low/ci_high)
    - src/components/EngineCalibrationPanel.tsx (modified: EngineCalibrationESSExtensions extended; ConformalCIRow component added; rendered via extraBelow prop in diffusion ClassColumn AND in DiffusionOnlyPanel legacy fallback)
decisions:
  - "Vovk-Romano formula pinned to zero-indexed `idx = Math.min(n - 1, Math.ceil((1 - alpha) * (n + 1)) - 1)` — the Math.min clamp covers α=0 / very-small-α edge where computed index would otherwise overflow past sorted array end"
  - "n<10 threshold matches the n<10 Bayesian EXPLORATORY gate in patternStatus — both CI surfaces enter their 'pending' / 'EXPLORATORY' display together so the user sees a consistent status story across both panels"
  - "Edge n<10 returns widest possible interval [0, 1] rather than throwing — caller responsibility to surface 'pending' UI; matches engine-context.ts pattern of returning null on missing data rather than throwing"
  - "Did NOT touch existing Bayesian credibleInterval95 path — additive only per CONTEXT D-19 and threat T-19-A-03-02 (information disclosure risk if Bayesian CI silently replaced); both CIs surface side-by-side"
  - "engine-context.ts reads conformal_low/conformal_high from the SAME LearnedPattern row that already provides alpha/beta for credibleInterval95 — single Prisma read, two CI surfaces; no extra DB cost"
  - "ConformalCIRow rendered via the new extraBelow ClassColumn prop rather than adding a 4th MetricCard — the 3-card stack is locked by UI-SPEC §A and 17-04 acceptance; extraBelow keeps the conformal row visually adjacent to its Bayesian sibling without disturbing the locked card layout"
  - "Tooltip wording on ConformalCIRow contrasts Vovk-Romano coverage guarantee with the Bayesian credible interval explicitly — 'distribution-free 95% coverage guarantee under exchangeability. Surfaced alongside (not replacing) the Bayesian credible interval shown in the Engine Prior card above.' — locks the user-facing copy contract"
  - "Pending state copy — 'pending (n_calibration < 10)' — uses the same threshold as the implementation so user-visible message and code path are bit-for-bit aligned"
  - "Test harness uses recoverQ helper to extract q from the public API rather than calling private internal functions — ensures coverage tests exercise the same code path that production code does, including the n<10 edge case and boundary clamping"
  - "Synthetic data uses Bernoulli outcomes + Normal-noise predictions — matches Cipher's actual use case (Beta-Bernoulli posterior predicts probability; ŷ_i comes from posterior mean ± noise; y_i is binary hit/miss); coverage tests validate against the true generative process"
  - "SKIPPED Playwright e2e (tests/e2e/engine-calibration-conformal.spec.ts) per user direction 2026-05-07 — file remains UNTRACKED in working tree as deferred artifact; not committed; vitest unit tests are the only test layer for this plan; manual visual verification of the panel rendering deferred to in-product check"
metrics:
  duration: ~ all 4 implementation tasks pre-committed before plan-execute spawn (tasks 1-4 completed in commits f42828a, 9cdfc5e, 0ab42fa, 7d3a398); this run = verification + documentation only (~5min)
  completed_date: 2026-05-07
  tasks_completed: 5 (Tasks 1-4 + Task 6 metadata commit; Task 5 Playwright deferred per user direction)
  tasks_deferred: 1 (Task 5 — tests/e2e/engine-calibration-conformal.spec.ts; file exists untracked but not committed)
  files_created: 1 (tests/learning.conformal.test.ts — 7 tests)
  files_modified: 3 (src/lib/learning.ts, src/lib/engine-context.ts, src/components/EngineCalibrationPanel.tsx)
  vitest_unit_pass_count: 478
  vitest_unit_skip_count: 1
  vitest_unit_todo_count: 3
  vitest_unit_failed: 0
  conformal_test_pass_count: 7/7
  plan_18_10_sanity_test: green (5/5 — D-54 honored, learning.hyperparameters.test.ts still passing)
  plan_19_a_01_tests: green (decayWeights guard + Zod still passing in learning.unit.bugs.test.ts)
  plan_19_a_02_tests: green (timeBasedSplit + computeBrierOOS + filterSnapshotsForEmbargo still passing in cron-learn.unit.bugs.test.ts)
  typescript_compile: clean (npx tsc --noEmit exit 0)
  empirical_coverage_alpha_05_n_10000: ∈ [0.93, 0.97] (validated)
  empirical_coverage_all_alphas: within ±2% nominal for α ∈ {0.01, 0.05, 0.10, 0.20}
---

# Phase 19 Plan 19-A-03: Conformal prediction primitive (Vovk-Romano) — Summary

One-liner: Adds Vovk-Romano split-conformal prediction interval primitive to `learning.ts` (distribution-free 95% coverage guarantee under exchangeability), surfaces `conformal_low/conformal_high` in `engine-context.ts` alongside (not replacing) the existing Bayesian credible interval, and renders both intervals side-by-side in `EngineCalibrationPanel` via a new `ConformalCIRow` component — additive only, zero regression to the Bayesian display.

## What Shipped

### `conformalInterval` pure function in `src/lib/learning.ts`

```typescript
export interface ConformalInterval {
  low: number;
  high: number;
  alpha: number;          // miscoverage level (0.05 → 95% nominal)
  n_calibration: number;  // size of the calibration set used for the quantile
}

export function conformalInterval(
  pointPrediction: number,
  calibrationResiduals: number[],
  alpha: number = 0.05,
): ConformalInterval;
```

- Vovk-Romano formula pinned to zero-indexed `idx = Math.min(n - 1, Math.ceil((1 - alpha) * (n + 1)) - 1)`.
- Edge case `n < 10` returns widest possible interval `[0, 1]` with reported `n_calibration` for caller-side "pending" detection.
- Interval clamped to `[0, 1]` (probability space); symmetric `[p-q, p+q]` when neither boundary fires.

### `engine-context.ts` surfacing

- `EngineContext` interface extended with `conformal_low: number | null` and `conformal_high: number | null`.
- `LearnedCellLike` extended with the same nullable columns (read from Prisma `LearnedPattern` row at the 7d primary diffusion horizon — same row already used for `credibleInterval95`).
- Both `(ci_low, ci_high)` (Bayesian) AND `(conformal_low, conformal_high)` surface side-by-side in the returned context — single Prisma read, two CI surfaces.
- Conformal columns will populate to non-null when the 19-A-04+ DSR/PBO/CPCV cron path writes calibration residuals; they remain `null` until that ships and the UI shows "pending (n_calibration < 10)" gracefully.

### `EngineCalibrationPanel.tsx` UI surface

- New `ConformalCIRow` component renders under the diffusion column's metric stack, adjacent to the Bayesian Engine Prior MetricCard.
- Wired into both layout variants:
  - **QuadClassPanel** (Phase 17-04, default): rendered via the new `extraBelow` prop on the diffusion `ClassColumn`.
  - **DiffusionOnlyPanel** (legacy fallback for old persisted reports without `horizon_calibrations`): rendered as a direct sibling of the metrics grid.
- Pending state copy: `pending (n_calibration < 10)` when either field is null.
- Tooltip: "Vovk-Romano split-conformal interval — distribution-free 95% coverage guarantee under exchangeability. Surfaced alongside (not replacing) the Bayesian credible interval shown in the Engine Prior card above."
- Bayesian display in `Engine Prior` MetricCard.subValue (`[ci_low–ci_high]`) is untouched — both 95% intervals visible together.

### `tests/learning.conformal.test.ts` — 7 vitest tests

| Test | Behavior | Result |
|------|----------|--------|
| 1 | α=0.05, n=10000 synthetic — empirical coverage ∈ [0.93, 0.97] | PASS |
| 2 | α ∈ {0.01, 0.05, 0.10, 0.20} — each within ±2% of nominal | PASS |
| 3 | n<10 calibration returns [0, 1] widest interval, n_calibration reported | PASS |
| 4 | n=10 with all-zero residuals collapses to [p, p] tight interval | PASS |
| 5 | Quantile index formula worked example: α=0.05, n=100 → idx=95 → q=0.95 | PASS |
| 6 | Interval symmetry around pointPrediction (low = max(0, p-q), high = min(1, p+q)) | PASS |
| 7 | Boundary clamping when prediction near 0 or 1 | PASS |

Synthetic data harness uses Mulberry32 LCG + Box-Muller for reproducible Bernoulli + Normal-noise generation. The `recoverQ` test helper extracts the half-width q from the public API by sweeping anchor predictions across [0.05, 0.95] and detecting clamp asymmetry — keeps coverage tests at O(n log n) instead of O(n² log n).

## Why This Matters

- **Distribution-free guarantee.** Bayesian credible intervals are conditional on the prior; conformal intervals carry an exchangeability-based coverage guarantee that holds independently of the data-generating distribution. Pairing both gives the user two independent uncertainty estimates.
- **Composite Phase 19 done gate.** D-08 / model-card-status assertion #1 reads `prisma.learnedPattern.count({ where: { conformal_low: null }})` < 20% — this plan ships the primitive that the 19-A-04 DSR/PBO/CPCV cron will populate to drive that assertion green.
- **CORE-ML-11..14 traceability.** Conformal sits adjacent to DSR (19-A-04), PBO (19-A-04), and rolling-IC (19-A-05) as the four quant-grade primitives that defeat backtest-overfitting + give honest CI bands for the priors.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written for Tasks 1-4 (tests, primitive, engine-context, panel render).

### Deferred (per user direction)

**Task 5 — Playwright e2e test (`tests/e2e/engine-calibration-conformal.spec.ts`)**
- **Reason:** User direction 2026-05-07 — "SKIP Playwright tests for this plan… Vitest unit tests are the only test layer for this plan."
- **Status:** File exists in working tree (created during pre-execute work) but remains UNTRACKED — NOT committed.
- **Verification fallback:** TypeScript compile (`npx tsc --noEmit` clean) + existing `EngineCalibrationPanel.test.tsx` component tests (9/9 passing) + manual in-product visual check on `/research/[ticker]` after deployment.
- **Recovery path:** If conformal CI rendering breaks visually post-deploy, the existing `tests/e2e/engine-calibration-panel.spec.ts` already exercises the panel surface; the deferred conformal-specific spec can be added later by `git add tests/e2e/engine-calibration-conformal.spec.ts` (file is intact in working tree).

## Files Changed

### Created
- `tests/learning.conformal.test.ts` — 7 vitest tests with synthetic coverage validation harness

### Modified
- `src/lib/learning.ts` — additive: `ConformalInterval` interface + `conformalInterval` function (~70 lines including JSDoc; existing pure-function logic untouched)
- `src/lib/engine-context.ts` — additive: `LearnedCellLike.conformal_low/conformal_high`, `EngineContext.conformal_low/conformal_high`, `getEngineContextForTicker` reads + surfaces both fields from diffusion 7d cell
- `src/components/EngineCalibrationPanel.tsx` — additive: `EngineCalibrationESSExtensions.conformal_low/conformal_high`, `ConformalCIRow` component, `ClassColumn.extraBelow` prop, render call in QuadClassPanel diffusion column AND in DiffusionOnlyPanel legacy fallback

## Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | f42828a | test(19-a-03): add 7 failing tests for conformalInterval (Vovk-Romano) |
| 2 | 9cdfc5e | feat(19-a-03): implement conformalInterval (Vovk-Romano split-conformal) |
| 3 | 0ab42fa | feat(19-a-03): surface conformal_low/high in engine-context (D-19) |
| 4 | 7d3a398 | feat(19-a-03): render Conformal CI in EngineCalibrationPanel (D-19) |
| 6 | (this commit) | docs(19-a-03): complete conformal prediction primitive plan summary |

Task 5 (Playwright e2e) deferred per user direction — see "Deferred" section above.

## Verification Evidence

```
npx vitest run tests/learning.conformal.test.ts
 ✓ tests/learning.conformal.test.ts (7 tests) 62ms
 Test Files  1 passed (1)
      Tests  7 passed (7)

npx vitest run
 Test Files  49 passed | 1 skipped (50)
      Tests  478 passed | 3 todo (481)
   Duration  3.09s

npx tsc --noEmit
(exit 0, no output)

Must-have grep contracts:
  ✓ conformalInterval export in src/lib/learning.ts
  ✓ ConformalInterval interface in src/lib/learning.ts (2 references)
  ✓ conformal_low in src/lib/engine-context.ts (3 references)
  ✓ conformal_high in src/lib/engine-context.ts (3 references)
  ✓ credibleInterval still in src/lib/engine-context.ts (9 references — Bayesian preserved)
  ✓ Conformal in src/components/EngineCalibrationPanel.tsx (10 references)
  ✓ credible|Bayesian in src/components/EngineCalibrationPanel.tsx (20 references — Bayesian preserved)
  ✓ 7 it() tests in tests/learning.conformal.test.ts
```

## Threat Model — Disposition

| Threat ID | Mitigation | Outcome |
|-----------|------------|---------|
| T-19-A-03-01 (off-by-one on (n+1) factor) | Pinned to Vovk-Romano formula; synthetic coverage test (Test 1) asserts empirical coverage ∈ [0.93, 0.97] — off-by-one would surface as 1-2% miscoverage | MITIGATED — Test 1 PASS confirms formula correct |
| T-19-A-03-02 (Bayesian CI replaced silently) | Both CIs surfaced — additive only; UI shows both labeled side-by-side | MITIGATED — grep confirms `credibleInterval` (9 refs) AND `Conformal` (10 refs) both present in panel |

## Self-Check: PASSED

- [x] `tests/learning.conformal.test.ts` exists (verified)
- [x] All 4 implementation commits exist in git log: f42828a, 9cdfc5e, 0ab42fa, 7d3a398 (verified via `git log --oneline`)
- [x] `conformalInterval` exported from `src/lib/learning.ts` (verified via grep)
- [x] `ConformalInterval` interface declared (verified via grep)
- [x] `engine-context.ts` surfaces `conformal_low` AND `conformal_high` AND retains `credibleInterval` (verified via grep)
- [x] `EngineCalibrationPanel.tsx` renders `Conformal` AND retains `credible|Bayesian` references (verified via grep)
- [x] `npx tsc --noEmit` exit 0 (verified)
- [x] `npx vitest run tests/learning.conformal.test.ts` 7/7 PASS (verified)
- [x] Plan 18-10 + 19-A-01 + 19-A-02 regression tests still PASS (verified — 23/23 in learning.unit.bugs + cron-learn.unit.bugs)
- [x] Full vitest suite 478/478 PASS, 0 failed (verified)
- [x] Empirical coverage on synthetic n=10000 ∈ [0.93, 0.97] for α=0.05 (verified — Test 1 assertions)
- [x] Empirical coverage within ±2% nominal across α ∈ {0.01, 0.05, 0.10, 0.20} (verified — Test 2 assertions)
