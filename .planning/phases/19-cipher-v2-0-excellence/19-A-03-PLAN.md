---
phase: 19
plan: 19-A-03
wave: A
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-A-01]
files_modified:
  - src/lib/learning.ts
  - src/lib/engine-context.ts
  - src/components/EngineCalibrationPanel.tsx
  - tests/learning.conformal.test.ts
  - tests/e2e/engine-calibration-conformal.spec.ts
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "conformalInterval(pointPrediction, calibrationResiduals, alpha) implements Vovk-Romano split-conformal at index ⌈(1-α)(n+1)⌉ - 1"
    - "Empirical coverage on synthetic n=10000 calibration ∈ [0.93, 0.97] for nominal α=0.05"
    - "Empirical coverage within ±2% of nominal for α ∈ {0.01, 0.05, 0.10, 0.20}"
    - "n<10 calibration set returns widest possible interval [0,1] with warning"
    - "engine-context.ts surfaces conformal_low/high alongside Bayesian credible interval (additive)"
    - "EngineCalibrationPanel renders conformal CI alongside Bayesian CI without UI regression"
  artifacts:
    - path: "src/lib/learning.ts"
      provides: "conformalInterval pure function + ConformalInterval interface"
      exports: ["conformalInterval", "ConformalInterval"]
    - path: "src/lib/engine-context.ts"
      provides: "conformal_low/high surfaced in engine context"
      contains: "conformal_low"
    - path: "src/components/EngineCalibrationPanel.tsx"
      provides: "Conformal CI rendered alongside Bayesian CI (additive)"
    - path: "tests/learning.conformal.test.ts"
      provides: "Synthetic n=10000 coverage validation tests"
    - path: "tests/e2e/engine-calibration-conformal.spec.ts"
      provides: "Playwright test confirming conformal CI renders"
  key_links:
    - from: "engine-context.ts"
      to: "learning.ts conformalInterval"
      via: "pure function call with calibration residuals"
      pattern: "conformalInterval\\("
---

# Plan 19-A-03: Conformal prediction primitive (Vovk-Romano)

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Land conformal primitive + engine-context surfacing + UI panel update → tests green → e2e screenshot diff confirms no regression → commit. Additive only — Bayesian CI stays.

## Hard Cleanup Gate (Definition of Done)

1. (N/A — additive primitive, no shadow)
2. (N/A — no old code deleted)
3. (N/A)
4. (N/A — no flag introduced)
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green

</universal_preamble>

<objective>
Add Vovk-Romano split-conformal prediction interval primitive to learning.ts (D-19). Surface `conformal_low/high` in engine-context.ts alongside existing Bayesian CI. Render in EngineCalibrationPanel without removing Bayesian CI display.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md
@src/lib/learning.ts
@src/lib/engine-context.ts
@src/components/EngineCalibrationPanel.tsx

<interfaces>
```typescript
// New export in learning.ts:
export interface ConformalInterval {
  low: number;
  high: number;
  alpha: number;
  n_calibration: number;
}

export function conformalInterval(
  pointPrediction: number,
  calibrationResiduals: number[],
  alpha?: number,
): ConformalInterval;

// Surfaced in engine-context return type:
interface EngineContext {
  // ... existing fields
  conformal_low: number | null;
  conformal_high: number | null;
}
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-A-03-01 | Tampering | off-by-one on (n+1) factor in quantile lookup | mitigate | Pin to Vovk-Romano formula `⌈(1-α)(n+1)⌉ - 1` zero-indexed; synthetic n=10000 coverage test asserts empirical coverage within ±2% — off-by-one would surface as 1-2% miscoverage |
| T-19-A-03-02 | Information Disclosure | Bayesian CI replaced by conformal silently | mitigate | Both CIs surfaced — additive only; UI shows both labeled |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-A-03-01">
  <name>Task 1: Write tests/learning.conformal.test.ts with synthetic coverage validation</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 685-695 — exact test design + golden numbers)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 454-487 — code example for conformalInterval)
    - src/lib/learning.ts (existing pattern for type/interface declarations)
  </read_first>
  <behavior>
    - Test 1: `conformal at α=0.05 with n=10000 synthetic — empirical coverage ∈ [0.93, 0.97]` per RESEARCH §"19-A-03 conformal" lines 685-695
    - Test 2: `repeats for α ∈ {0.01, 0.05, 0.10, 0.20} — each within ±2% of nominal`
    - Test 3: `n<10 calibration returns [0, 1] widest interval with warning indicator`
    - Test 4: `n=10 with calibrationResiduals all 0 returns tight interval around pointPrediction`
    - Test 5: `quantile index formula: ⌈(1-α)(n+1)⌉-1` — verify against worked example (α=0.05, n=100 → idx = ⌈0.95×101⌉-1 = 96-1 = 95)
    - Test 6: `interval is symmetric around pointPrediction (low = max(0, p-q), high = min(1, p+q))`
    - Test 7: `interval clipped to [0,1] when prediction near boundary`

    Use deterministic seed for synthetic data: `Math.seedrandom('phase19-conformal')` if seedrandom available, else `vi.stubGlobal('Math.random', () => deterministic_lcg())`.
  </behavior>
  <action>
    Create `tests/learning.conformal.test.ts`. Synthetic generation:
    ```typescript
    function syntheticCalibration(n: number, p = 0.5, sigma = 0.05, seed = 42): { residuals: number[]; predictions: number[]; outcomes: number[] } {
      const rng = mulberry32(seed); // deterministic LCG
      const predictions = Array.from({ length: n }, () => p + (rng() - 0.5) * 2 * sigma);
      const outcomes = Array.from({ length: n }, () => rng() < p ? 1 : 0);
      const residuals = predictions.map((p_i, i) => Math.abs(outcomes[i] - p_i));
      return { residuals, predictions, outcomes };
    }
    ```
    For coverage test: split n=20000 into 10000 cal + 10000 test; compute interval per test point; count fraction where outcome ∈ [low, high].

    Pin all 7 tests.
  </action>
  <acceptance_criteria>
    - File `tests/learning.conformal.test.ts` exists
    - `grep -c "it(" tests/learning.conformal.test.ts` returns ≥7
    - Test FAILS — conformalInterval not exported
  </acceptance_criteria>
  <automated>npx vitest run tests/learning.conformal.test.ts 2>&1 | grep -qE "Cannot find|conformalInterval"</automated>
  <done>7 failing coverage validation tests written</done>
</task>

<task type="auto" tdd="true" id="19-A-03-02">
  <name>Task 2: Implement conformalInterval in src/lib/learning.ts</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 459-487 — verbatim implementation)
    - tests/learning.conformal.test.ts (just written)
  </read_first>
  <action>
    Add to `src/lib/learning.ts` (additive — do not modify existing code):
    ```typescript
    /**
     * Vovk-Romano split-conformal prediction interval.
     * Source: Vovk, Gammerman, Shafer 2005; Tibshirani / Berkeley lecture notes.
     *
     * @param pointPrediction - model's prediction at a new point in [0, 1]
     * @param calibrationResiduals - |y_i - ŷ_i| over a held-out calibration set
     * @param alpha - miscoverage level (default 0.05 = 95% nominal coverage)
     * @returns interval with empirical coverage ≥ 1-α (distribution-free guarantee)
     */
    export interface ConformalInterval {
      low: number;
      high: number;
      alpha: number;
      n_calibration: number;
    }

    export function conformalInterval(
      pointPrediction: number,
      calibrationResiduals: number[],
      alpha: number = 0.05,
    ): ConformalInterval {
      const n = calibrationResiduals.length;
      if (n < 10) {
        return { low: 0, high: 1, alpha, n_calibration: n };
      }
      const sorted = [...calibrationResiduals].sort((a, b) => a - b);
      // Vovk-Romano: quantile at zero-indexed position ⌈(1-α)(n+1)⌉ - 1
      const idx = Math.min(n - 1, Math.ceil((1 - alpha) * (n + 1)) - 1);
      const q = sorted[idx];
      return {
        low: Math.max(0, pointPrediction - q),
        high: Math.min(1, pointPrediction + q),
        alpha,
        n_calibration: n,
      };
    }
    ```
  </action>
  <acceptance_criteria>
    - All 7 tests pass: `npx vitest run tests/learning.conformal.test.ts` exits 0
    - `grep -q "export function conformalInterval" src/lib/learning.ts`
    - `grep -q "ConformalInterval" src/lib/learning.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/learning.conformal.test.ts</automated>
  <done>conformalInterval exported; 7/7 tests GREEN; coverage validated synthetic</done>
</task>

<task type="auto" id="19-A-03-03">
  <name>Task 3: Surface conformal_low/high in engine-context.ts</name>
  <read_first>
    - src/lib/engine-context.ts (existing pattern for surfacing posterior data)
    - prisma/schema.prisma (verify conformal_low/conformal_high columns exist post 19-Z-02)
  </read_first>
  <action>
    Edit `src/lib/engine-context.ts`:
    1. Import `ConformalInterval` from learning.ts (signature only — caller already has residuals or reads from LearnedPattern.conformal_low/high)
    2. Extend the engine-context return type with `conformal_low: number | null` and `conformal_high: number | null`
    3. In the lookup function, read `conformal_low` and `conformal_high` from the matched LearnedPattern row (these will be populated by 19-A-04+ DSR/PBO/CPCV cron path; for now they may be null until 19-A-04 ships and writes them)
    4. Pass through to caller — DO NOT replace `credible_interval_95` (Bayesian CI). Both surface side-by-side.
  </action>
  <acceptance_criteria>
    - `grep -q "conformal_low" src/lib/engine-context.ts`
    - `grep -q "conformal_high" src/lib/engine-context.ts`
    - `grep -q "credible_interval_95\|credibleInterval" src/lib/engine-context.ts` (Bayesian CI still present)
    - TypeScript compile clean: `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <automated>npx tsc --noEmit && grep -q "conformal_low" src/lib/engine-context.ts && grep -q "credibleInterval\|credible_interval_95" src/lib/engine-context.ts</automated>
  <done>engine-context surfaces both CI types — additive</done>
</task>

<task type="auto" id="19-A-03-04">
  <name>Task 4: Render Conformal CI in EngineCalibrationPanel.tsx</name>
  <read_first>
    - src/components/EngineCalibrationPanel.tsx (existing layout — find Bayesian CI render section)
  </read_first>
  <action>
    Edit `src/components/EngineCalibrationPanel.tsx`:
    - Where Bayesian CI is currently rendered (likely as "95% CI: [low, high]"), add a sibling row labeled "Conformal CI (95%): [conformal_low, conformal_high]"
    - When `conformal_low === null || conformal_high === null`, render "Conformal CI: pending (n_calibration < 10)" instead
    - Use the same numeric formatting as Bayesian CI
    - Do NOT remove or visually de-emphasize the Bayesian CI

    Reference user's UI/UX skills: the addition is a labeled row; no animations; keep typography consistent with surrounding panel.
  </action>
  <acceptance_criteria>
    - `grep -q "Conformal CI\|conformal_low" src/components/EngineCalibrationPanel.tsx`
    - `grep -q "credible\|Bayesian CI\|credible_interval" src/components/EngineCalibrationPanel.tsx` (Bayesian still present)
    - TypeScript compile clean
  </acceptance_criteria>
  <automated>grep -q "Conformal" src/components/EngineCalibrationPanel.tsx && npx tsc --noEmit</automated>
  <done>UI renders both CIs side-by-side</done>
</task>

<task type="auto" id="19-A-03-05">
  <name>Task 5: Add Playwright e2e test for EngineCalibrationPanel rendering</name>
  <read_first>
    - tests/e2e/ (existing Playwright pattern reference)
    - playwright.config.ts
  </read_first>
  <action>
    Create `tests/e2e/engine-calibration-conformal.spec.ts`:
    - Navigate to `/research/AAPL` (assume seed report exists in test env, OR mock the engine-context lookup at API level)
    - Take screenshot of EngineCalibrationPanel area
    - Assert text "Conformal CI" appears in DOM
    - Assert text "95% CI" or "Bayesian CI" or `credible` also appears (no regression)
    - Save screenshot to `test-results/conformal-ci.png` for manual inspection
  </action>
  <acceptance_criteria>
    - File exists
    - `npm run test:e2e -- engine-calibration-conformal.spec.ts` exits 0 (assuming dev server up + seeded ticker)
    - If no seed available, skip with `test.skip` and document in plan SUMMARY
  </acceptance_criteria>
  <automated>test -f tests/e2e/engine-calibration-conformal.spec.ts</automated>
  <done>E2E coverage for new UI surface</done>
</task>

<task type="auto" id="19-A-03-06">
  <name>Task 6: Full suite green + commit</name>
  <action>
    Run `npx vitest run`, `npx tsc --noEmit`, optionally `npm run test:e2e`. Commit:
    ```
    feat(19-a-03): conformal prediction primitive (Vovk-Romano) + UI surface

    Adds conformalInterval(pointPrediction, calibrationResiduals, alpha) — distribution-free
    prediction intervals at ⌈(1-α)(n+1)⌉-1 quantile of |y - ŷ| residuals.

    Empirical coverage validated within ±2% of nominal on synthetic n=10000 across
    α ∈ {0.01, 0.05, 0.10, 0.20}.

    engine-context.ts surfaces conformal_low/high alongside Bayesian credible interval —
    both render in EngineCalibrationPanel (additive, no UI regression).

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `npx vitest run` exits 0
    - `git log -1 --pretty=%s` matches "feat(19-a-03)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-a-03"</automated>
  <done>Conformal primitive + UI surface live</done>
</task>

</tasks>

<verification>
- [ ] conformalInterval implements Vovk-Romano formula correctly
- [ ] Synthetic coverage ∈ [0.93, 0.97] at α=0.05 across 10000 trials
- [ ] engine-context surfaces both Bayesian and conformal CIs
- [ ] EngineCalibrationPanel renders both
- [ ] No edits to existing pure-function logic
</verification>

<success_criteria>
1. conformalInterval pure function exported with golden-master coverage
2. Both Bayesian + Conformal CI visible in /research/[ticker] without UI regression
3. Phase 18 sanity test still green
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-A-03-SUMMARY.md`.
</output>
