# Phase 24 — Revision Punch List

> **Status:** 5 plans (00-04) authored. Plan-checker found 2 blockers + 5 warnings. Revision agent timed out twice mid-edit — issues captured here for execute-time application or a follow-up planning pass.

**Created:** 2026-09-17
**Blocker count:** 2 (both must be fixed before or during execute)
**Warning count:** 5 (fix during execute or in a `--gaps` pass)

---

## BLOCKER #1 — `src/lib/gemini-analysis.ts` post-process overwrite missing from every plan

**Symptom:** Plans 03 and 04 each claim the other handles this. Neither does. Without it, the 7 composite fields land on `EngineContext` but never reach `analysis.engine_calibration` — every production report renders "insufficient history" for the composite headline while Wave 4's mock-driven UI test passes green.

**Where to fix:** Plan 03 (belongs with engine-context integration).

**Concrete edits:**
1. Add `src/lib/gemini-analysis.ts` to Plan 03's `files_modified` frontmatter
2. Add new task **24-03-04** with this contract:
   - `<action>`: Extend the post-process block at `src/lib/gemini-analysis.ts:1160-1243` (existing Phase 17-04 pattern) to also copy 7 composite fields from `engineCtx` into the `engine_calibration` object being built. Fields: `composite_prob`, `composite_ci_low`, `composite_ci_high`, `composite_class_count`, `composite_gate_status`, `composite_class_weights`, `composite_per_class_calibrated`
   - `<read_first>`: `src/lib/gemini-analysis.ts` (lines 1150-1250 for pattern), `src/lib/engine-context.ts` (new field definitions from Task 1), `src/lib/types.ts` (EngineCalibration interface)
   - `<acceptance_criteria>`:
     - `grep -c "composite_prob:\s*engineCtx" src/lib/gemini-analysis.ts` returns `>= 1`
     - `grep -c "composite_ci_low:\s*engineCtx" src/lib/gemini-analysis.ts` returns `>= 1` (repeat for all 7 fields)
     - Integration test `tests/composite/gemini-analysis-composite-overwrite.int.test.ts` passes
3. Add RED test scaffold `tests/composite/gemini-analysis-composite-overwrite.int.test.ts` to Wave 0 Task 2's list. Test contract: `expect((await runGeminiAnalysis(ticker, pkg, null)).engine_calibration.composite_prob).toBe(engineCtx.composite_prob)` — asserts the overwrite fires end-to-end.
4. Delete the contradictory prose:
   - Plan 03 (around line 68): "Wave 4 adds the post-process overwrite in gemini-analysis.ts" → replace with "Wave 3 Task 24-03-04 adds the post-process overwrite (this plan)."
   - Plan 04 (around line 88): "This wave does NOT touch `gemini-analysis.ts`" → keep, but add "(Trust boundary overwrite is Wave 3 Task 24-03-04.)"

---

## BLOCKER #2 — `logistic36Brier()` stubbed with TODO — violates CLAUDE.md §8

**User-approved fix (2026-09-17):** "Add real logistic baseline to Wave 2" — create `src/lib/composite/logistic-baseline.ts` from scratch (do not wire to P21.1's baseline).

**Where to fix:** Add new task **24-02-03** to Plan 02.

**Concrete edits:**
1. Add new task 24-02-03 with this contract:
   - `<action>`: Create `src/lib/composite/logistic-baseline.ts` with 3 exports:
     ```typescript
     export function fitLogisticBaseline(rows: CompositeRow[]): LogisticBaselineModel
     export function predictLogisticBaseline(model: LogisticBaselineModel, row: CompositeRow): number
     export function logistic36Brier(rows: CompositeRow[], fitWindow: Range, evalWindow: Range): number
     ```
     Use `ml-matrix` (already in package.json per STATE.md v2.0 stack additions) for IRLS. Same 36 features as P21.1. Time-series CV per CLAUDE.md #1 (forward-chaining, never random k-fold).
   - `<read_first>`: `package.json` (confirm ml-matrix present), `src/lib/composite/perClassIsotonic.ts` (for `CompositeRow` type), any P21.1 logistic reference if `src/lib/backtest/baselines.ts` exists
   - `<acceptance_criteria>`:
     - `test -f src/lib/composite/logistic-baseline.ts`
     - `grep -c "export function fitLogisticBaseline\|export function predictLogisticBaseline\|export function logistic36Brier" src/lib/composite/logistic-baseline.ts` returns `3`
     - `npx vitest run tests/composite/logistic-baseline.unit.test.ts` exits 0
2. Add RED test `tests/composite/logistic-baseline.unit.test.ts` to Wave 0 Task 2 scaffold list. Test contract: fixed 36-feature vector → deterministic coefficients within ε=1e-4; Brier on golden holdout matches expected value.
3. In Plan 03 Task 2 (cron) at lines ~386-391: delete the `TODO` stub, import `logistic36Brier` from `@/lib/composite/logistic-baseline`, populate `baseline_brier_logistic_36` field on the snapshot from the actual return value.
4. In Plan 04 Task 24-04-03 (ship-gate script): remove the "gate 5 skipped when null" branch. Gate 5 becomes mandatory: `composite_brier < baseline_brier_logistic_36 - 0.005` (0.5pp Brier lift over logistic baseline required to ship).
5. REQUIREMENTS.md — add REASON-06: "Composite Brier beats logistic-36 baseline by ≥0.5pp on backfill holdout (CLAUDE.md §8 non-LLM baseline mandate)." Update Plan 02's `requirements` frontmatter to `[REASON-01, REASON-02, REASON-06]`.

---

## Warning #3 — Engine-context cold-start fallback defeated by insufficient_data snapshots

**Where to fix:** Plan 03 Task 1, engine-context Section 14 code (both `findFirst` queries).

**Concrete edits:** Add `status: { not: 'insufficient_data' }` to both `where:` clauses:

```typescript
const compositeSnapshot =
  (await prisma.compositeCalibrationSnapshot.findFirst({
    where: {
      classifier_version: 'cipher-composite-v1',
      regime: regimeForSourceMix,
      cap_class,
      status: { not: 'insufficient_data' },  // ADD
    },
    orderBy: { computed_at: 'desc' },
  })) ??
  (await prisma.compositeCalibrationSnapshot.findFirst({
    where: {
      classifier_version: 'cipher-composite-v1',
      regime: 'ALL',
      cap_class,
      status: { not: 'insufficient_data' },  // ADD
    },
    orderBy: { computed_at: 'desc' },
  }));
```

---

## Warning #4 — HYPERPARAMETERS.md duplicated between Wave 0 and Wave 4

**Where to fix:** Plan 04 Task 24-04-03.

**Concrete edits:**
1. Remove `.planning/HYPERPARAMETERS.md` from Plan 04's `files_modified` frontmatter.
2. Rewrite the HYPERPARAMETERS.md sub-action in 24-04-03: "Verify Wave 0 authored the `## Phase 24 — Composite Signal Synthesis` section with 11 pinned values. No changes needed. Acceptance: `grep -c '## Phase 24 — Composite Signal Synthesis' HYPERPARAMETERS.md` returns exactly `1`."

---

## Warning #5 — Identity-fallback for missing per-class curves violates REASON-01

**Where to fix:** Plan 03 Task 2 (cron), around lines 460-465.

**Concrete edits:** Replace the `identityCurve = x => x` substitution with a status-flag path:

```typescript
// BEFORE:
const curves = {
  diffusion: curvesJson.diffusion ? deserialize(curvesJson.diffusion) : identityCurve,
  // ... same for other classes
};

// AFTER:
for (const c of CLASSES) {
  if (curvesJson[c] === null) {
    input[c].status = 'NO_DATA';  // excluded from composeSignal weighted mean
  } else {
    input[c].calibrated = deserialize(curvesJson[c]).predict(input[c].raw_posterior);
  }
}
```

---

## Warning #6 — ECE computation defaults to 0 silently

**Where to fix:** Plan 00 pre-flight sub-task + Plan 03 Task 2.

**Concrete edits:**
1. Add pre-flight sub-task to Plan 00 Task 1 (or Task 2): read `src/lib/stats/isotonic.ts:169-232`, extract the actual `CorpReliabilityResult` type signature, pin it in the RESEARCH.md interfaces block. Acceptance: `grep -c "CorpReliabilityResult" src/lib/composite/types.ts` returns `>= 1`.
2. In Plan 03 Task 2 cron code (~lines 487-492): delete the `as unknown as { bins?: unknown[] }` cast. Use the real `CorpReliabilityResult` type. If `reliability.bins` is missing at runtime, throw — do not silently default `ece` to 0.

---

## Warning #7 — Wave 3 Task 1 acceptance criteria only checks one field

**Where to fix:** Plan 03 Task 1 acceptance criteria for `src/lib/types.ts`.

**Concrete edits:** Replace the single grep with 7 explicit greps (one per composite field):
```
grep -c "composite_prob:" src/lib/types.ts returns >= 1
grep -c "composite_ci_low:" src/lib/types.ts returns >= 1
grep -c "composite_ci_high:" src/lib/types.ts returns >= 1
grep -c "composite_class_count:" src/lib/types.ts returns >= 1
grep -c "composite_gate_status:" src/lib/types.ts returns >= 1
grep -c "composite_class_weights:" src/lib/types.ts returns >= 1
grep -c "composite_per_class_calibrated:" src/lib/types.ts returns >= 1
```

---

## Info #8 (LOW priority) — Wave 4 tautological test

Wave 4 Task 24-04-02 first assertion `expect(mockPayload.results.some(...)).toBe(true)` is a tautology because the mock is constructed to include the composite entry. The commented-out "Option A/B" in the test suggests upgrading to a real integration; either mark as `.skip()` or upgrade before merge. Non-blocking.

---

## Execute-time playbook

When running `/gsd-execute-phase 24`, the executor should:
1. **Wave 0 first** — apply pre-flight fix from Warning #6 (pin CorpReliabilityResult shape).
2. **Wave 2 second** — implement Blocker #2 fix (new logistic-baseline.ts module + test).
3. **Wave 3 third** — apply Blocker #1 (new Task 24-03-04 for gemini-analysis.ts overwrite) + Warnings #3, #5, #7 during the plan's normal execution.
4. **Wave 4 last** — apply Warning #4 (HYPERPARAMETERS.md verify-only) + gate 5 mandatory ship-gate check.

Alternative: re-run `/gsd-plan-phase 24 --gaps` after a clear-context restart to have the planner apply these fixes as first-class plan updates before execute.
