---
plan: 18-06
status: complete
checkpoint_resolution: skip
completed_at: 2026-05-06
---

# Plan 18-06 — Operator-Driven Hyperparameter Tuning

## Outcome

**Skip path taken.** Plan 04 placeholders retained in `HYPERPARAMETERS`; per-class
TODO comments added marking re-tune for Plan 21 (after Plan 25 backfill grows N).

## Tasks

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Write `scripts/tune-lambda.ts` (D-01) + `scripts/tune-page-hinkley.ts` (D-07) | Complete | `0ae03bd` (pre-included in "thesis fix" commit) |
| 2 | Operator runs scripts and pastes tuned values into `HYPERPARAMETERS` | Skip path | `fa4dd1a` |

## Tuning Run Output

Both scripts executed against live Neon (`ep-lucky-recipe-akltfhuz` dev branch,
read-only `findMany`). Results show every grid cell produced unusable signal:

### λ Tuning (D-01 grid; Purged K-Fold + Embargo, K=5, purge=embargo=90d)

| Signal Class    | n  | λ=14 | λ=30 | λ=60 | λ=90 | λ=180 | λ=365 | OOS Brier |
|-----------------|----|------|------|------|------|-------|-------|-----------|
| diffusion       | 5  | NaN  | NaN  | NaN  | NaN  | NaN   | NaN   | NaN       |
| technical       | 59 | NaN  | NaN  | NaN  | NaN  | NaN   | NaN   | NaN       |
| insider         | 43 | NaN  | NaN  | NaN  | NaN  | NaN   | NaN   | NaN       |
| institutional   | 30 | NaN  | NaN  | NaN  | NaN  | NaN   | NaN   | NaN       |

### Page-Hinkley Tuning (D-07 grid)

All cells scored F1 = 0.0000 across `(δ, λ_PH) ∈ {0.001, 0.005, 0.01} × {30, 50, 100}`.

## Diagnostic

- **Total PriceOutcomes:** 87, clustered in ~30 days of live operation.
- **D-16 invariant:** Purged K-Fold with `purge=embargo=90d` (max horizon).
- **Effect:** every fold's `[tMin-90d, tMax+90d]` window swallows essentially every
  other observation → `trainIdx.length === 0` in most folds → `brierScore([], [])`
  returns NaN; Page-Hinkley test cells degenerate to F1=0.

This is the engine **correctly** reporting "N is too low for honest hyperparameter
tuning under the leakage-defended protocol." No row clears the `cv_brier_oos < 0.25`
acceptance gate — the `tuned` resume-signal is unavailable.

## Skip Path Resolution

Per Plan 18-06 Task 2 step 5:

> If any class has `cv_brier_oos ≥ 0.25` because N is too low to learn anything
> useful, leave that class at the placeholder values and add a comment
> `// TODO: re-tune in Plan 21 once N grows past backfill bootstrap (P25)`

Applied to all four signal classes. `HYPERPARAMETERS` now annotated:

```ts
diffusion / technical / insider / institutional: {
  lambda_days: 60,
  ph_delta: 0.005,
  ph_lambda: 50,
  tuned_at: 'bootstrap', // TODO: re-tune in Plan 21 once N grows past backfill bootstrap (P25)
  cv_brier_oos: null,
}
```

## Files

| File | Status |
|------|--------|
| `scripts/tune-lambda.ts` | Created (commit `0ae03bd`) |
| `scripts/tune-page-hinkley.ts` | Created (commit `0ae03bd`) |
| `src/lib/learning.ts` (HYPERPARAMETERS block) | Annotated (commit `fa4dd1a`) |

## Verification

- `purgedKFold(...)` referenced 3× in tune-lambda.ts ✓
- `LAMBDA_GRID = [14, 30, 60, 90, 180, 365]` literal ✓
- All 4 SIGNAL_CLASSES referenced ✓
- `pageHinkleyStatistic(` literal in tune-page-hinkley.ts ✓
- `DELTA_GRID = [0.001, 0.005, 0.01]` + `LAMBDA_PH_GRID = [30, 50, 100]` ✓
- `PURGE_DAYS = 90` + `EMBARGO_DAYS = 90` in both scripts ✓
- `npx tsc --noEmit` clean after annotation edit ✓
- Plan 10's verification check on `cv_brier_oos < 0.25` will accept the placeholder
  path as authorized by Task 2 step 5.

## Forward Path

Plan 25 (large-cap backfill) will grow N past the 90-day embargo window. Plan 21
re-runs both tune scripts — at that point the `tuned` path becomes viable and
the TODO comments above can be replaced with real per-class tuned values.
