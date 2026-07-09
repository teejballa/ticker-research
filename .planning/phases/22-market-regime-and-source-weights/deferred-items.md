# Phase 22 — Deferred Items

## Discovered during Plan 22-05 execution — pre-existing, out of scope

### 1. `learned-pattern-regime.test.ts` — missing export

- **File:** `src/lib/__tests__/learned-pattern-regime.test.ts:27`
- **Error:** `Module '"@/lib/learning"' has no exported member 'upsertLearnedPatternForRegime'`
- **Origin:** Pre-existing on Wave 5 baseline (`git stash` + `tsc` reproduces on baseline HEAD).
- **Impact:** Vitest `--type-check` fails on this file but plain `vitest run` treats it as a broken test (test does not actually gate CI).
- **Recommended fix:** Either export the helper from `src/lib/learning.ts` or delete the test if the helper was renamed/inlined during earlier Wave work.

### 2. `log-loss.test.ts` — string-vs-number type mismatch

- **File:** `src/lib/evaluation/__tests__/log-loss.test.ts:15-22`
- **Error:** Fixture uses `y_true: string[]` (Buy/Hold/Sell literals) but `LogLossCase.y_true: number[]`.
- **Origin:** Pre-existing on Wave 5 baseline.
- **Recommended fix:** Update `LogLossCase` to `y_true: (number | string)[]` or convert fixture rows to numeric class indices before passing to `computeLogLoss`.

Neither of these blocks the Phase 22 done-gate (Vitest `--reporter=dot` on the regime-done-gate suite passes independently). Both are candidates for a P22.5 tech-debt sweep.
