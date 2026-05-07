---
phase: 19
plan: 19-Z-01
wave: Z
type: execute
depends_on: []
files_modified:
  - src/lib/features.ts
  - tests/lib/features.test.ts
  - .env.example
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "All 15 Phase 19 feature flags resolve from env to typed Features object"
    - "Each flag has three modes: off | shadow | on"
    - "Unknown env value throws descriptive error mentioning the env var name"
    - "All flags default to 'off' when env unset"
  artifacts:
    - path: "src/lib/features.ts"
      provides: "FEATURES object + resolveFeatures() + FeatureMode type"
      exports: ["FEATURES", "resolveFeatures", "FeatureMode"]
    - path: "tests/lib/features.test.ts"
      provides: "5 unit tests covering parse/default/error/coverage"
    - path: ".env.example"
      contains: "FEATURE_CONFORMAL"
  key_links:
    - from: "src/lib/features.ts"
      to: "process.env.FEATURE_*"
      via: "parseMode()"
      pattern: "process\\.env\\[.*FEATURE"
---

# Plan 19-Z-01: features.ts flag matrix + env wiring

<universal_preamble>

## Autonomous Execution Clause (D-04, D-05, D-06, D-07)

The agent (Claude) executes this plan end-to-end without user authorization between gates:
1. Land new code behind feature flag (default `off`)
2. Flip flag to `shadow` via Vercel CLI/API (when applicable to this plan)
3. Drive shadow workload (≥200 requests OR 3-7 days) (when applicable)
4. Run `npm run shadow-verdict 19-Z-01` — verdict file written to `shadow-reports/19-Z-01.json` (when applicable)
5. PASS → cutover PR (flag ON, old code DELETED in same commit) → 7-day rollback hatch → final flag-removal PR (when applicable)
6. FAIL → file failure report, redesign, re-shadow

User receives status reports at each gate but is NOT in the verdict loop.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until ALL of the following are true:
1. `shadow-reports/19-Z-01.json` exists with `verdict: "PASS"` (N/A — this plan is infra; tests-green-and-committed is the gate)
2. Cutover PR merged with old code deleted in same commit (N/A — this plan creates new code only)
3. 7 days elapsed post-cutover with zero entries in `RollbackLog` table (N/A)
4. Flag-removal PR merged (N/A — this plan creates the flag matrix)
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-cleanup

`/gsd-execute-phase` MUST refuse to mark this plan complete until conditions 5 holds AND the plan-specific success criteria below are satisfied.

</universal_preamble>

<objective>
Deliver the three-mode (`off` | `shadow` | `on`) feature flag matrix in `src/lib/features.ts` for all 15 Phase 19 feature flags per D-09, D-10. Every downstream Wave A/B/C plan reads from this module to gate its new code path.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-design.md
@docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md

<interfaces>
<!-- Public API consumed by every Wave A/B/C plan -->
```typescript
export type FeatureMode = 'off' | 'shadow' | 'on';

export type Features = {
  conformal_intervals_enabled: boolean;
  conformal_intervals_mode: FeatureMode;
  cpcv_enabled: boolean; cpcv_mode: FeatureMode;
  ic_decay_monitor_enabled: boolean; ic_decay_monitor_mode: FeatureMode;
  hierarchical_pooling_enabled: boolean; hierarchical_pooling_mode: FeatureMode;
  data_cache_enabled: boolean; data_cache_mode: FeatureMode;
  tiingo_primary_enabled: boolean; tiingo_primary_mode: FeatureMode;
  twelvedata_primary_enabled: boolean; twelvedata_primary_mode: FeatureMode;
  exa_primary_enabled: boolean; exa_primary_mode: FeatureMode;
  finsentllm_ensemble_enabled: boolean; finsentllm_ensemble_mode: FeatureMode;
  community_supplemental_enabled: boolean; community_supplemental_mode: FeatureMode;
  cove_two_pass_enabled: boolean; cove_two_pass_mode: FeatureMode;
  model_router_enabled: boolean; model_router_mode: FeatureMode;
  contradiction_detector_enabled: boolean; contradiction_detector_mode: FeatureMode;
  options_term_structure_enabled: boolean; options_term_structure_mode: FeatureMode;
  reputation_weighted_stocktwits_enabled: boolean; reputation_weighted_stocktwits_mode: FeatureMode;
};

export function resolveFeatures(): Features;
export const FEATURES: Features;
```
</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| process.env → features.ts | env var values cross from Vercel runtime into typed Features object |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-Z-01-01 | Tampering | parseMode() | mitigate | Reject any value other than `off`/`shadow`/`on`/`true`/`false`/empty with descriptive error including env var name; throw at module load via `FEATURES = resolveFeatures()` so misconfig surfaces at startup, not request time |
| T-19-Z-01-02 | Information Disclosure | Features object | accept | No secret values; flag names are public-knowable; logging Features at startup is acceptable |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-Z-01-01">
  <name>Task 1: Write failing test suite tests/lib/features.test.ts</name>
  <read_first>
    - docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md (lines 122-167 — full TDD test block)
    - vitest.config.ts (test runner config)
  </read_first>
  <behavior>
    - Test 1: `defaults all flags to false when env unset` — delete `process.env.FEATURE_CONFORMAL`, assert `resolveFeatures().conformal_intervals_enabled === false`
    - Test 2: `parses "true" as enabled` — set FEATURE_CONFORMAL=true, assert `_enabled === true`
    - Test 3: `parses "shadow" as shadow mode` — set FEATURE_CONFORMAL=shadow, assert `_mode === 'shadow'`
    - Test 4: `rejects unknown values with descriptive error` — set FEATURE_CONFORMAL=invalid, assert `() => resolveFeatures()` throws matching `/FEATURE_CONFORMAL/`
    - Test 5: `exposes all 15 Phase 19 flags` — iterate the 15 flag names, assert each has `_enabled` AND `_mode` property
  </behavior>
  <action>Create file `tests/lib/features.test.ts` with the EXACT contents from impl-plan lines 122-167. The test imports from `'../../src/lib/features'`. Use `beforeEach`/`afterEach` to snapshot+restore `process.env`. The 15 flag names array is the verbatim list from CONTEXT D-09 / impl-plan line 156-160.</action>
  <acceptance_criteria>
    - File `tests/lib/features.test.ts` exists
    - `grep -c "it(" tests/lib/features.test.ts` returns 5
    - `grep -c "FEATURE_CONFORMAL\|FEATURE_HIERARCHICAL_POOLING\|FEATURE_FINSENTLLM" tests/lib/features.test.ts` returns ≥3
    - Running test FAILS with "Cannot find module '../../src/lib/features'" (red phase)
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/features.test.ts 2>&1 | grep -q "Cannot find module" && echo "RED-OK" || (echo "RED-MISSING" && exit 1)</automated>
  <done>tests/lib/features.test.ts created with 5 failing tests; module-not-found error confirmed</done>
</task>

<task type="auto" tdd="true" id="19-Z-01-02">
  <name>Task 2: Implement src/lib/features.ts to make tests green</name>
  <read_first>
    - docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md (lines 175-225 — full implementation)
    - tests/lib/features.test.ts (just created)
  </read_first>
  <action>
    Create `src/lib/features.ts` with EXACT contents from impl-plan lines 178-225:
    - Export `type FeatureMode = 'off' | 'shadow' | 'on'`
    - Define const `FLAG_NAMES` array of all 15 names: `conformal_intervals`, `cpcv`, `ic_decay_monitor`, `hierarchical_pooling`, `data_cache`, `tiingo_primary`, `twelvedata_primary`, `exa_primary`, `finsentllm_ensemble`, `community_supplemental`, `cove_two_pass`, `model_router`, `contradiction_detector`, `options_term_structure`, `reputation_weighted_stocktwits`
    - Implement `parseMode(envValue, varName)` returning 'off' for `null|undefined|''|'false'`, 'on' for `'true'`, 'shadow' for `'shadow'`, throwing `Error('${varName} must be one of: false, shadow, true (got: ${envValue})')` otherwise
    - Implement `resolveFeatures()` iterating FLAG_NAMES, reading `FEATURE_${NAME.toUpperCase()}`, populating both `${name}_mode` and `${name}_enabled` keys
    - Export `FEATURES = resolveFeatures()` at module load
  </action>
  <acceptance_criteria>
    - File `src/lib/features.ts` exists
    - `grep -c "FLAG_NAMES" src/lib/features.ts` returns ≥1
    - `grep -c "'off' | 'shadow' | 'on'" src/lib/features.ts` returns ≥1
    - All 15 flag names appear in the file: `for f in conformal_intervals cpcv ic_decay_monitor hierarchical_pooling data_cache tiingo_primary twelvedata_primary exa_primary finsentllm_ensemble community_supplemental cove_two_pass model_router contradiction_detector options_term_structure reputation_weighted_stocktwits; do grep -q "$f" src/lib/features.ts || exit 1; done`
    - All 5 tests pass: `npx vitest run tests/lib/features.test.ts` exits 0
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/features.test.ts</automated>
  <done>Module created; all 5 tests pass GREEN; FEATURES exported and importable</done>
</task>

<task type="auto" id="19-Z-01-03">
  <name>Task 3: Append 15 FEATURE_* defaults to .env.example</name>
  <read_first>
    - .env.example (current state — append, do not overwrite)
    - docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md (lines 237-254 — exact env block)
  </read_first>
  <action>
    Append the following 16-line block to `.env.example` (preserving any existing content):
    ```
    # Phase 19 — feature flags (off | shadow | true)
    FEATURE_CONFORMAL=off
    FEATURE_CPCV=off
    FEATURE_IC_DECAY_MONITOR=off
    FEATURE_HIERARCHICAL_POOLING=off
    FEATURE_DATA_CACHE=off
    FEATURE_TIINGO_PRIMARY=off
    FEATURE_TWELVEDATA_PRIMARY=off
    FEATURE_EXA_PRIMARY=off
    FEATURE_FINSENTLLM_ENSEMBLE=off
    FEATURE_COMMUNITY_SUPPLEMENTAL=off
    FEATURE_COVE_TWO_PASS=off
    FEATURE_MODEL_ROUTER=off
    FEATURE_CONTRADICTION_DETECTOR=off
    FEATURE_OPTIONS_TERM_STRUCTURE=off
    FEATURE_REPUTATION_WEIGHTED_STOCKTWITS=off
    ```
  </action>
  <acceptance_criteria>
    - `grep -c "^FEATURE_" .env.example` returns 15
    - `grep -q "FEATURE_HIERARCHICAL_POOLING=off" .env.example`
    - `grep -q "FEATURE_FINSENTLLM_ENSEMBLE=off" .env.example`
    - `grep -q "FEATURE_REPUTATION_WEIGHTED_STOCKTWITS=off" .env.example`
  </acceptance_criteria>
  <automated>test "$(grep -c '^FEATURE_' .env.example)" = "15"</automated>
  <done>.env.example contains 15 FEATURE_* defaults all set to off</done>
</task>

<task type="auto" id="19-Z-01-04">
  <name>Task 4: Run full unit suite to confirm no regression</name>
  <read_first>
    - tests/learning.hyperparameters.test.ts (Plan 18-10 sanity test, MUST stay green per D-54)
  </read_first>
  <action>Run `npx vitest run` (full unit suite). Confirm zero failing tests including `tests/learning.hyperparameters.test.ts`. If any failure exists, STOP and investigate before commit.</action>
  <acceptance_criteria>
    - `npx vitest run` exits 0
    - Output contains "Test Files  N passed" with all green
    - tests/learning.hyperparameters.test.ts shows passed
  </acceptance_criteria>
  <automated>npx vitest run</automated>
  <done>All unit tests green; no Phase 18 regression</done>
</task>

<task type="auto" id="19-Z-01-05">
  <name>Task 5: Commit feature flag matrix</name>
  <read_first>
    - git status (verify only intended files staged)
  </read_first>
  <action>
    Stage only `src/lib/features.ts`, `tests/lib/features.test.ts`, `.env.example`. Commit with message:
    ```
    feat(19-z-01): feature flag matrix for Phase 19

    Three-mode flag (off | shadow | on) with descriptive parse errors.
    Defaults all 15 flags to off — every new path opt-in until verified.
    Foundation for Wave A/B/C shadow A/B → cutover lifecycle (D-09, D-10).

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` returns "feat(19-z-01): feature flag matrix for Phase 19"
    - `git show HEAD --stat | grep -c "src/lib/features.ts\|tests/lib/features.test.ts\|.env.example"` returns 3
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-z-01"</automated>
  <done>Commit landed with three files staged; suite still green</done>
</task>

</tasks>

<verification>
- [ ] All 5 unit tests in `tests/lib/features.test.ts` pass
- [ ] `npx vitest run` (full suite) exits 0; Plan 18-10 sanity test green
- [ ] `src/lib/features.ts` exports `resolveFeatures`, `FEATURES`, `FeatureMode` with correct types
- [ ] `.env.example` contains 15 `FEATURE_*=off` lines
- [ ] Commit landed with subject `feat(19-z-01): feature flag matrix for Phase 19`
- [ ] No edits to existing Phase 18 logic in `src/lib/learning.ts` (D-54)
</verification>

<success_criteria>
Plan 19-Z-01 is complete when:
1. `npx vitest run tests/lib/features.test.ts` exits 0 with 5 passing tests
2. `npx vitest run` (full suite) exits 0 — Phase 18 sanity test still green
3. Module imports clean from any caller: `import { FEATURES, resolveFeatures } from '@/lib/features'`
4. Setting any FEATURE_* env var to an invalid value throws at module load with descriptive error
5. Commit landed; this plan is the foundation for every subsequent Phase 19 cutover
</success_criteria>

<output>
After completion, create `.planning/phases/19-cipher-v2-0-excellence/19-Z-01-SUMMARY.md` with:
- Files created (paths + LOC)
- Test results (5/5 passing)
- Foundation declaration: "Wave A/B/C may now read from `FEATURES` for all flag gating"
</output>
