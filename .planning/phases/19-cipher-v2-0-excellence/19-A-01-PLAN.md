---
phase: 19
plan: 19-A-01
wave: A
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04]
files_modified:
  - src/lib/learning.ts
  - tests/learning.unit.bugs.test.ts
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "decayWeights throws descriptive error on lambdaDays <= 0 or NaN"
    - "decayWeights still returns [] for empty input regardless of lambda"
    - "validateHyperparameters Zod schema rejects malformed config at module load"
    - "All existing decayWeights call sites still work (HYPERPARAMETERS bootstrap config valid)"
    - "Plan 18-10 hyperparameter sanity test stays green (D-54)"
    - "TODO comment flags that future signal class additions require schema update OR removal of .strict()"
  artifacts:
    - path: "src/lib/learning.ts"
      provides: "guarded decayWeights + validateHyperparameters export + module-load assertion"
      contains: "lambdaDays must be > 0"
    - path: "tests/learning.unit.bugs.test.ts"
      provides: "8 unit tests covering guard + Zod schema"
  key_links:
    - from: "src/lib/learning.ts (module top-level)"
      to: "validateHyperparameters(HYPERPARAMETERS)"
      via: "module-load assertion"
      pattern: "validateHyperparameters\\(HYPERPARAMETERS\\)"
---

# Plan 19-A-01: decayWeights lambda guard + HYPERPARAMETERS Zod schema

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

Land guard + Zod schema → tests green → commit. No shadow lifecycle (additive defensive guard on existing pure function; no behavior change for valid configs).

## Hard Cleanup Gate (Definition of Done)

1. (N/A — no shadow)
2. (N/A — no old code deleted; this hardens existing code)
3. (N/A)
4. (N/A — no flag introduced)
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-commit
6. Plan 18-10 hyperparameter sanity test (`tests/learning.hyperparameters.test.ts`) explicitly verified green (D-54)

</universal_preamble>

<objective>
Add a lambda-days guard to `decayWeights` (D-17) and validate `HYPERPARAMETERS` via Zod schema at module load. Catches the silent ESS-corruption bug where `decayWeights(obs, 0)` returns `exp(-Δt/0) = Infinity` and corrupts ESS computation downstream.
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
@tests/learning.hyperparameters.test.ts

<interfaces>
```typescript
// Existing (must preserve signature):
export function decayWeights(obs: WeightedObservation[], lambdaDays: number, now?: Date): number[];

// New exports:
export function validateHyperparameters(input: unknown): asserts input is typeof HYPERPARAMETERS;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-A-01-01 | Tampering | silent ESS corruption via lambda=0 | mitigate | Guard at function entry throws descriptive error rather than silently returning Infinity weights |
| T-19-A-01-02 | Configuration | typo in HYPERPARAMETERS signal class breaks cron silently | mitigate | Zod `.strict()` schema catches unknown signal class at module load → fails fast at import, surfaces in CI |
| T-19-A-01-03 | Future-proofing | adding regime hyperparams in Phase 22 breaks `.strict()` validation | mitigate | TODO comment flagging that future-phase additions require schema update OR removal of .strict() (per RESEARCH Pitfall 2) |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-A-01-01">
  <name>Task 1: Write failing tests for decayWeights guard + Zod schema</name>
  <read_first>
    - docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md (lines 339-385 — verbatim test block)
    - src/lib/learning.ts (existing decayWeights at line 360, HYPERPARAMETERS at line 519)
    - tests/learning.hyperparameters.test.ts (D-54 — sanity test, MUST stay green)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 368-392 — Pitfalls 1+2)
  </read_first>
  <behavior>
    8 tests per impl-plan lines 339-385:
    - decayWeights rejects lambdaDays = 0 with /lambdaDays must be > 0/
    - decayWeights rejects negative lambdaDays
    - decayWeights rejects NaN lambdaDays
    - decayWeights accepts lambdaDays = 0.001 (smallest positive)
    - decayWeights returns [] for empty input regardless of lambda (preserve existing contract per RESEARCH Pitfall 1)
    - validateHyperparameters validates current bootstrap config (no throw)
    - validateHyperparameters rejects lambda_days = 0 with message containing "lambda_days"
    - validateHyperparameters rejects negative ph_lambda
    - validateHyperparameters rejects unknown signal class with message mentioning "signal class"
  </behavior>
  <action>
    Create `tests/learning.unit.bugs.test.ts` with EXACT contents from impl-plan lines 339-385 (two describe blocks: 'decayWeights — Phase 19 guard (Plan 19-A-01)' and 'HYPERPARAMETERS — Zod schema (Plan 19-A-01)'). Add the empty-input test:
    ```ts
    it('returns [] for empty input regardless of lambda', () => {
      expect(decayWeights([], 30)).toEqual([]);
      expect(decayWeights([], 60)).toEqual([]);
    });
    ```
  </action>
  <acceptance_criteria>
    - File `tests/learning.unit.bugs.test.ts` exists
    - `grep -c "it(" tests/learning.unit.bugs.test.ts` returns ≥9
    - Test FAILS — `validateHyperparameters` not exported, `decayWeights` accepts 0 silently
  </acceptance_criteria>
  <automated>npx vitest run tests/learning.unit.bugs.test.ts 2>&1 | grep -qE "validateHyperparameters|FAIL"</automated>
  <done>9 failing tests written; verified RED</done>
</task>

<task type="auto" tdd="true" id="19-A-01-02">
  <name>Task 2: Implement guard + Zod schema in src/lib/learning.ts</name>
  <read_first>
    - src/lib/learning.ts (current decayWeights at ~line 360, HYPERPARAMETERS at ~line 519)
    - docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md (lines 397-449 — verbatim implementation)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 381-392 — Pitfall 2 TODO requirement)
  </read_first>
  <action>
    Edit `src/lib/learning.ts`:

    1. **Top of file** — add `import { z } from 'zod';` (already in tree, just import)

    2. **Replace decayWeights** (preserves empty-input contract per RESEARCH Pitfall 1):
       ```typescript
       export function decayWeights(
         obs: WeightedObservation[],
         lambdaDays: number,
         now: Date = new Date(),
       ): number[] {
         if (!Number.isFinite(lambdaDays) || lambdaDays <= 0) {
           throw new Error(
             `decayWeights: lambdaDays must be > 0 and finite (got: ${lambdaDays}). ` +
             `If you need decay disabled, omit the call rather than passing 0.`
           );
         }
         const t0 = now.getTime();
         const dayMs = 86_400_000;
         return obs.map(o => {
           const dtDays = Math.max(0, (t0 - o.recorded_at.getTime()) / dayMs);
           return Math.exp(-dtDays / lambdaDays);
         });
       }
       ```

    3. **After HYPERPARAMETERS const** — add Zod schema + validator:
       ```typescript
       const ClassHyperparametersSchema = z.object({
         lambda_days: z.number().positive().finite(),
         ph_delta: z.number().positive().finite(),
         ph_lambda: z.number().positive().finite(),
         tuned_at: z.string().min(1),
         cv_brier_oos: z.number().nullable(),
       });

       // TODO(Phase 22+): adding regime hyperparams here will require either updating this
       // schema or removing .strict(). Currently the schema is .strict() to catch typos in
       // signal class names at module load — but this means any new field added to
       // HYPERPARAMETERS will throw at import time until the schema catches up.
       // (Per RESEARCH Pitfall 2)
       const HyperparametersSchema = z.object({
         diffusion: ClassHyperparametersSchema,
         technical: ClassHyperparametersSchema,
         insider: ClassHyperparametersSchema,
         institutional: ClassHyperparametersSchema,
       }).strict();

       export function validateHyperparameters(input: unknown): asserts input is typeof HYPERPARAMETERS {
         const result = HyperparametersSchema.safeParse(input);
         if (!result.success) {
           const first = result.error.issues[0];
           if (first && first.code === 'unrecognized_keys') {
             throw new Error(`HYPERPARAMETERS: unknown signal class — ${first.keys?.join(', ')}`);
           }
           throw new Error(`HYPERPARAMETERS validation failed: ${result.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; ')}`);
         }
       }
       ```

    4. **At very bottom of file** — module-load assertion:
       ```typescript
       validateHyperparameters(HYPERPARAMETERS);
       ```

    Do NOT modify any other existing code in learning.ts (D-54 — no regression).
  </action>
  <acceptance_criteria>
    - All 9 tests pass: `npx vitest run tests/learning.unit.bugs.test.ts` exits 0
    - Plan 18-10 sanity test still green: `npx vitest run tests/learning.hyperparameters.test.ts` exits 0
    - `grep -q "lambdaDays must be > 0" src/lib/learning.ts`
    - `grep -q "validateHyperparameters" src/lib/learning.ts`
    - `grep -q "TODO(Phase 22+)" src/lib/learning.ts` (future-proofing comment per RESEARCH Pitfall 2)
    - `grep -q "validateHyperparameters(HYPERPARAMETERS)" src/lib/learning.ts` (module-load assertion at bottom)
  </acceptance_criteria>
  <automated>npx vitest run tests/learning.unit.bugs.test.ts && npx vitest run tests/learning.hyperparameters.test.ts</automated>
  <done>Guard + Zod live; 9 unit tests GREEN; D-54 sanity test still GREEN</done>
</task>

<task type="auto" id="19-A-01-03">
  <name>Task 3: Run full unit + integration suite + commit</name>
  <read_first>
    - All test files (verify zero regression)
  </read_first>
  <action>
    Run `npx vitest run` and `npx vitest run --config vitest.integration.config.ts` (skip the latter if no DATABASE_URL — note explicitly).

    Stage `src/lib/learning.ts`, `tests/learning.unit.bugs.test.ts`. Commit:
    ```
    fix(19-a-01): guard decayWeights against lambda<=0 + Zod-validate HYPERPARAMETERS

    decayWeights threw exp(-Δt/0) = Infinity on misconfig (silent ESS corruption).
    Now throws descriptive error. Empty-input contract preserved.

    HYPERPARAMETERS validated at module load via Zod .strict() — typos in
    signal class name or out-of-range params caught at startup, not at use.
    TODO comment flags Phase 22+ additions requiring schema update.

    Plan 18-10 hyperparameter sanity test (D-54) still green.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `npx vitest run` exits 0
    - `git log -1 --pretty=%s` matches "fix(19-a-01): guard decayWeights"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-a-01"</automated>
  <done>Pure-function guard committed; no regression</done>
</task>

</tasks>

<verification>
- [ ] decayWeights now throws descriptive error on lambda<=0/NaN
- [ ] HYPERPARAMETERS Zod-validated at module load
- [ ] TODO(Phase 22+) comment present
- [ ] Plan 18-10 sanity test still green (D-54 enforced)
- [ ] No edits to existing pure-function logic beyond the guard insertion
</verification>

<success_criteria>
1. Lambda<=0 misconfig surfaces at startup, not silently in ESS
2. HYPERPARAMETERS typos caught at import time
3. All existing call sites (cron/learn:515, cron/backfill-ess:155, decay test:18+) work unchanged
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-A-01-SUMMARY.md` documenting guard + schema + audit of 3 known call sites verified clean.
</output>
