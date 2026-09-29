---
phase: 24-composite-signal-synthesis
reviewed: 2026-09-29T21:20:00Z
reviewer: gsd-code-reviewer
depth: standard
status: issues_found
findings:
  blocker: 2
  major: 3
  warning: 3
  info: 8
---

# Phase 24 Code Review Report

## Summary

Phase 24 (composite signal synthesis) ships clean architecture — pure `composeSignal`, proper schema-negative trust boundary (REASON-05 verified), 7-field post-process overwrite (Blocker #1 verified), and correctly gated cron auth. However, three material bugs will block ship-gate passage once organic data arrives:

1. **BL-01** — Holdout window is empty by construction (`HOLDOUT_WINDOW_DAYS == HORIZON_DAYS`).
2. **BL-02** — Cron never populates `baseline_brier_logistic_36` (feature vector missing on `CompositeRow`), yet ship-gate hard-fails on null (self-declared "Blocker #2 partial").
3. **MJ-01** — `deriveStatus()` writes `status='ship-eligible'` without the baseline-lift check the gate later enforces — labeling inconsistency between cron and gate.

BL-01 keeps every cell at `insufficient_data`, so BL-02 and MJ-01 don't fire today. As soon as BL-01 is fixed, BL-02 and MJ-01 will simultaneously prevent any cell from being labeled ship-eligible or passing the gate. Fix all three together.

Blocker #1 (7-field composite overwrite) is fully closed. REASON-05 (schema-negative) is fully closed. CLAUDE.md #1 forward-chaining rule and #6 look-ahead defense are correctly enforced in `logistic-baseline.ts` and `isotonic-fit.ts`.

## Blocker Issues

### BL-01: Holdout window is empty by construction

**File:** `src/lib/composite/isotonic-fit.ts:136-139`

**Issue:** `loadHoldoutDataset` computes `startAt = asOf - windowDays*ms` (30d), then filters rows returned by `loadFitDataset`, which itself filtered on `analyzed_at < asOf - horizonDays*ms` (also 30d). With `HOLDOUT_WINDOW_DAYS = 30` and `HORIZON_DAYS = 30` (`cron/route.ts:49-50`), the two boundaries collapse: holdout requires `predicted_at ∈ [asOf-30d, asOf-30d)` — effectively empty. Every cell falls through to `holdRows.length < MIN_N_HOLDOUT` → `status: 'insufficient_data'`, and no snapshot ever becomes ship-eligible.

**Fix:** Redefine so windows don't collide, and enforce train-test purge per CLAUDE.md #1 / ISL Ch. 5:

```ts
export async function loadHoldoutDataset(opts) {
  const holdoutEnd   = new Date(opts.asOf.getTime() - opts.horizonDays * MS_PER_DAY);
  const holdoutStart = new Date(holdoutEnd.getTime() - opts.windowDays * MS_PER_DAY);
  const rows = await loadFitDataset({ ...opts });
  return rows.filter((r) => r.predicted_at >= holdoutStart && r.predicted_at < holdoutEnd);
}
```

Simultaneously, `loadFitDataset` should NOT overlap the holdout window — enforce `analyzed_at < holdoutStart` at fit time.

### BL-02: Cron always writes `baseline_brier_logistic_36 = null`, but ship-gate hard-fails on null

**File:** `src/app/api/cron/composite-calibration/route.ts:75-100` + `scripts/check-composite-ship-gate.ts:127-131` + `tests/composite/baseline-benchmark.int.test.ts:89-93`

**Issue:** `computeLogisticBaselineBrier()` reads `r.features` off `CompositeRow`, but `CompositeRow` (`isotonic-fit.ts:30-39`) has no `features` field. The `maybeFeatures` guard falls through to `return null` for every row in every cell, so every snapshot gets `baseline_brier_logistic_36: null`. The file header (line 68-74) explicitly labels this "Blocker #2 partial — extend loadHoldoutDataset in follow-up." The ship-gate treats a null baseline as a hard `fail`, and the integration test hard-fails on any null baseline for ship-eligible/shadow snapshots. As soon as the first cell becomes non-`insufficient_data`, Gate 5 fails and the ship gate is un-passable.

**Fix:** Close Blocker #2 for real by extending `CompositeRow` + `loadFitDataset` to project the 36-feature vector (the plan's intended path). Temporary alternative: downgrade `check-composite-ship-gate.ts:127` and `baseline-benchmark.int.test.ts:89-93` to `skip` when the baseline is null — but document Blocker #2 is deferred so the gate isn't a dead assertion.

## Major Issues

### MJ-01: `deriveStatus` labels cells `ship-eligible` without the baseline-lift check the ship-gate later enforces

**File:** `src/app/api/cron/composite-calibration/route.ts:102-109`

**Issue:** `deriveStatus(brier_pt, ece, n_holdout)` returns `'ship-eligible'` when Brier ≤ 0.24 AND ECE ≤ 0.05, ignoring baseline lift gates. The ship-gate script (Gates 4 + 5) then rejects those same cells if they don't beat baselines by ≥ 0.005. The DB `status` column becomes misleading — an operator querying "ship-eligible cells" gets a superset of what the CLI actually approves.

**Fix:** Include baseline-lift in `deriveStatus`:

```ts
function deriveStatus(brier_pt, ece, n_holdout, baseline_naive, baseline_logistic): string {
  if (n_holdout < MIN_N_HOLDOUT) return 'insufficient_data';
  const brierOk = brier_pt <= 0.24;
  const eceOk = ece <= 0.05;
  const naiveLiftOk = baseline_naive == null || (baseline_naive - brier_pt) >= 0.005;
  const logisticLiftOk = baseline_logistic == null
    ? false
    : (baseline_logistic - brier_pt) >= 0.005;
  if (brierOk && eceOk && naiveLiftOk && logisticLiftOk) return 'ship-eligible';
  if ((brierOk || eceOk) && naiveLiftOk) return 'shadow';
  return 'degraded';
}
```

### MJ-02: `computeCompositeCi` can write NaN into non-nullable Float columns

**File:** `src/lib/composite/isotonic-fit.ts:41-44, 189-211` and `src/app/api/cron/composite-calibration/route.ts:286-287`

**Issue:** `brier([])` returns `NaN` (line 42). If a bootstrap resample yields an empty `preds` array, BCa point/CI can be `NaN`. Cron writes into non-nullable `Float` columns (`schema.prisma:753-754`). Neon accepts NaN but downstream `widenCi(NaN, …)` and JSON serialization can silently break the UI.

**Fix:** Guard in `computeCompositeCi` (return `{low: null, high: null, …}` on empty preds) OR in the cron (skip write if `!Number.isFinite(ci.low) || !Number.isFinite(ci.high)`, mark status `insufficient_data`).

### MJ-03: `bootstrap_method` is derived from a nonexistent field

**File:** `src/app/api/cron/composite-calibration/route.ts:288`

**Issue:** `bootstrap_method: (ci as unknown as { method?: string }).method ?? 'bca'` — `bootstrapBCa` return shape doesn't include `.method`. The `?? 'bca'` fallback always fires. The `as unknown as {...}` cast is a red flag.

**Fix:** Hardcode `bootstrap_method: 'bca'`. If future bootstrap variants are planned, thread through `computeCompositeCi` opts explicitly.

## Warnings

### WR-01: `logistic36Brier` runs on singular systems without a sample-size floor

**File:** `src/lib/composite/logistic-baseline.ts:125-131, 190-192`

**Issue:** IRLS wraps `inverse(XtWX)` in try/catch and on failure sets `converged=false`, but `logistic36Brier` still computes Brier from the unconverged model. Fit windows with `N < 37 = P` produce singular systems; returned Brier is meaningless.

**Fix:** Add explicit sample-size floor (`fitRows.length < N_FEATURES + 10`) or refuse to return a Brier when `!model.converged`.

### WR-02: `_alphaResolver` module-level mutable singleton

**File:** `scripts/eval-brier.ts:146-150`

**Issue:** Process-global state. Fine for CLI, but if imported in a Next.js route or parallel test, one caller's `setAlphaResolver(stub)` bleeds into another. Phase 24 extends this file (composite classifier block, 392-452).

**Fix:** For CLI-only, add a runtime assertion or refactor to accept the resolver as an explicit param on `runEvalBrier(opts)`.

### WR-03: `insights/composite-calibration/route.ts` is unauthenticated

**File:** `src/app/api/insights/composite-calibration/route.ts:19-63`

**Issue:** Public read per `/insights/*` convention. Exposes Brier + ECE + baselines publicly. Acceptable per convention; add rate-limiting to avoid Neon quota abuse.

## Info (8 items)

- **IN-01** `CompositeHeadline.tsx:67` — Collapses `insufficient_history` and null-prob branches; add defensive warn log
- **IN-02** `cron/route.ts:112` — Non-constant-time secret comparison (consistent with other Cipher crons)
- **IN-03** `isotonic-fit.ts:154-156` — Generic error for two distinct failure modes
- **IN-04** `bootstrap-ci.unit.test.ts:18-19` — Test uses 100 resamples vs prod 1000
- **IN-05** `engine-context.ts:1183-1186` — Composite resolution errors silently swallowed
- **IN-06** `check-composite-ship-gate.ts:175-179` — `--regime` alone silently ignored without `--cap`
- **IN-07** `eval-brier.ts:441` — Composite block reuses `ece` in `reliability` slot
- **IN-08** `schema.prisma:737-773` — Additive-only compliant (info, not bug)

---

## Cluster Analysis

BL-01, BL-02, and MJ-01 form a dependency chain:
- BL-01 keeps holdout empty → `deriveStatus` never fires anything but `insufficient_data`
- BL-02 means baseline is always null → hidden by BL-01
- MJ-01 means status labeling would be misleading → hidden by BL-01

Fixing BL-01 alone will surface BL-02 (test failure) and MJ-01 (status inconsistency). All three should ship together as a Phase 24.1 gap-closure.

**Reviewed:** 2026-09-29T21:20:00Z
**Reviewer:** Claude (gsd-code-reviewer)
