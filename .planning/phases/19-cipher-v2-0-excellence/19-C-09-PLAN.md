---
phase: 19
plan: 19-C-09
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-A-05]
files_modified:
  - src/lib/reasoning/router.ts
  - src/lib/gemini-analysis.ts
  - tests/lib/reasoning/router.test.ts
  - tests/integration/router.shadow.live.test.ts
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "routeModel({ ticker, controversy, ic_decay_flag }) returns 'haiku' | 'gemini-flash' | 'gemini-pro' per D-41"
    - "Decision tree per design §4 step 6c: low-stakes → haiku, standard → gemini-flash, high-stakes (large_cap OR controversy>threshold OR ic_decay_flag=true) → haiku draft → gemini-pro"
    - "Cost telemetry written to existing LearningEvent table — no schema change required (audit confirmed: existing `delta Json` + `event_type` + `ticker` columns suffice)"
    - "Shadow A/B verdict: decision agreement ≥70% with Flash-only baseline AND cost reduction AND Brier non-regression"
    - "router decisions logged + cost telemetry visible in /insights (Wave C success criterion 6)"
  artifacts:
    - path: "src/lib/reasoning/router.ts"
      provides: "routeModel + cost-telemetry helper"
      exports: ["routeModel", "estimateCost", "type ModelChoice"]
    - path: "src/lib/gemini-analysis.ts"
      provides: "Wires router decision into model invocation"
      contains: "routeModel"
  key_links:
    - from: "src/lib/reasoning/router.ts"
      to: "LearnedPattern.ic_decay_flag (from Plan 19-A-05)"
      via: "high-stakes detection input"
      pattern: "ic_decay_flag"
    - from: "src/lib/gemini-analysis.ts"
      to: "prisma.learningEvent.create (existing table; uses existing `delta` JSONB + `event_type` columns)"
      via: "event_type='model_router_decision'; delta={model, tokens, estimated_cost_usd}; ticker populated"
      pattern: "learningEvent\\.create"
---

# Plan 19-C-09: Model cascade router + cost telemetry

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate

Standard shadow lifecycle. Per D-41.

### Schema audit — no new columns required

LearningEvent schema audit (prisma/schema.prisma lines 119-135) confirms:
```
model LearningEvent {
  id           String   @id @default(uuid())
  occurred_at  DateTime @default(now()) @db.Timestamptz
  event_type   String                        ← used: 'model_router_decision'
  ticker       String?                       ← used: pkg.ticker
  outcome_id   String?
  signal_class String?
  pattern_key  String?
  horizon_days Int?
  cap_class    String?
  delta        Json                          ← used: {model, tokens, estimated_cost_usd}
  message      String   @db.Text             ← used: human-readable summary
  ...
}
```

The existing `delta Json` column accepts arbitrary JSONB payload — perfect for `{model, tokens, estimated_cost_usd}` which is event-shaped. The `event_type` discriminator string + `ticker` foreign-key column are also reused.

**Conclusion: 19-Z-02 schema bundle does NOT need a new LearningEvent column for cost telemetry.** Reusing existing structure per checker recommendation. No additional ALTER TABLE statements added to 19-Z-02.

</universal_preamble>

<objective>
Per D-41, deliver model cascade router. `routeModel({ticker, controversy, ic_decay_flag}) → 'haiku' | 'gemini-flash' | 'gemini-pro'`. Cost telemetry logged per report into the EXISTING LearningEvent table (event_type='model_router_decision', delta={model, tokens, estimated_cost_usd}, ticker populated). /insights surfaces "Model Router" section reading those LearningEvent rows.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-design.md
@.planning/phases/19-cipher-v2-0-excellence/19-A-05-SUMMARY.md
@src/lib/gemini-analysis.ts
@prisma/schema.prisma

<interfaces>
```typescript
export type ModelChoice = 'haiku' | 'gemini-flash' | 'gemini-pro';

export function routeModel(args: {
  ticker: string;
  controversy: number;       // 0-1 — engine-context controversy score
  ic_decay_flag: boolean;
  market_cap_class?: 'mega' | 'large' | 'mid' | 'small' | 'unknown';
}): ModelChoice;

export function estimateCost(model: ModelChoice, tokens: number): number;

// LearningEvent payload contract for cost telemetry (uses EXISTING schema):
//   prisma.learningEvent.create({
//     data: {
//       event_type: 'model_router_decision',     // existing column
//       ticker: pkg.ticker,                       // existing column
//       message: `routed ${ticker} to ${model}`,  // existing column (human-readable)
//       delta: {                                  // existing JSONB column
//         model: 'haiku' | 'gemini-flash' | 'gemini-pro',
//         tokens: number,
//         estimated_cost_usd: number,
//         controversy: number,
//         ic_decay_flag: boolean,
//         market_cap_class: string,
//       }
//     }
//   })
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-09-01 | Tampering | router decision agreement <70% with Flash-only baseline | mitigate | Verdict gate D-11 — PASS requires agreement ≥70% AND Brier non-regression on resolved tickers |
| T-19-C-09-02 | Business Logic | router routes everything to Pro (cost blowup) | mitigate | Default for "standard" stakes is Flash; Pro only triggered when ANY of (market_cap=mega, controversy>0.7, ic_decay_flag=true); cost cap in env var with hard ceiling |
| T-19-C-09-03 | Information Disclosure | LearningEvent.delta JSONB stores raw tokens/cost | mitigate | LearningEvent is admin-only (no public surface); /insights reads aggregates only (avg cost, count by model); per-row JSON not exposed |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-C-09-01">
  <name>Task 1: Write tests/lib/reasoning/router.test.ts</name>
  <read_first>
    - docs/plans/2026-05-07-cipher-v2-excellence-design.md (lines 200-211 — decision tree spec)
  </read_first>
  <behavior>
    - Test 1: `low-stakes (small cap, low controversy, no decay) → 'haiku'`
    - Test 2: `standard (mid cap, controversy=0.3) → 'gemini-flash'`
    - Test 3: `high-stakes mega-cap → 'gemini-pro'`
    - Test 4: `ic_decay_flag=true → 'gemini-pro' regardless of cap`
    - Test 5: `controversy>0.7 → 'gemini-pro'`
    - Test 6: `controversy=0.7 boundary → 'gemini-pro'` (≥ rule)
    - Test 7: `estimateCost('haiku', 10000) returns lower than estimateCost('gemini-pro', 10000)`
    - Test 8: `routeModel deterministic — same input always returns same output`
  </behavior>
  <action>
    Create `tests/lib/reasoning/router.test.ts` with 8 tests pinning the decision tree.
  </action>
  <acceptance_criteria>
    - File exists; ≥8 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/reasoning/router.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>8 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-09-02">
  <name>Task 2: Implement src/lib/reasoning/router.ts</name>
  <read_first>
    - tests/lib/reasoning/router.test.ts
  </read_first>
  <action>
    Create `src/lib/reasoning/router.ts`:
    ```typescript
    export type ModelChoice = 'haiku' | 'gemini-flash' | 'gemini-pro';

    // Cost per 1M tokens (USD) — pin from current Vercel AI Gateway pricing
    const COST_PER_M_TOKENS: Record<ModelChoice, number> = {
      'haiku': 0.25,
      'gemini-flash': 0.30,
      'gemini-pro': 1.25,
    };

    export function routeModel(args: {
      ticker: string;
      controversy: number;
      ic_decay_flag: boolean;
      market_cap_class?: 'mega' | 'large' | 'mid' | 'small' | 'unknown';
    }): ModelChoice {
      const { controversy, ic_decay_flag, market_cap_class } = args;
      // High-stakes triggers
      if (ic_decay_flag) return 'gemini-pro';
      if (controversy >= 0.7) return 'gemini-pro';
      if (market_cap_class === 'mega') return 'gemini-pro';
      // Low-stakes: small cap + low controversy
      if (market_cap_class === 'small' && controversy < 0.3) return 'haiku';
      // Default: standard
      return 'gemini-flash';
    }

    export function estimateCost(model: ModelChoice, tokens: number): number {
      return (tokens / 1_000_000) * COST_PER_M_TOKENS[model];
    }
    ```
  </action>
  <acceptance_criteria>
    - All 8 tests pass
    - `grep -q "ic_decay_flag" src/lib/reasoning/router.ts`
    - `grep -q "controversy >= 0.7" src/lib/reasoning/router.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/reasoning/router.test.ts</automated>
  <done>Router 8/8 GREEN</done>
</task>

<task type="auto" id="19-C-09-03">
  <name>Task 3: Wire router into gemini-analysis.ts + LearningEvent cost telemetry (existing schema reuse)</name>
  <read_first>
    - src/lib/gemini-analysis.ts (current Gemini call site)
    - src/lib/engine-context.ts (controversy + ic_decay_flag source)
    - prisma/schema.prisma lines 119-135 (LearningEvent table — verify event_type, ticker, delta JSONB, message columns exist)
  </read_first>
  <action>
    **Pre-flight schema audit:** Confirm via `grep -A 15 "model LearningEvent" prisma/schema.prisma` that the table has at minimum: `event_type String`, `ticker String?`, `delta Json`, `message String`. These already exist (no schema change needed). If audit fails (columns missing or renamed), STOP and escalate — do NOT add new columns to 19-Z-02 without re-checking; the existing structure is the agreed-upon contract.

    Edit `src/lib/gemini-analysis.ts`:
    ```typescript
    import { routeModel, estimateCost } from '@/lib/reasoning/router';
    import { runWithShadow } from '@/lib/shadow/shadow-runner';
    import { FEATURES } from '@/lib/features';
    import { prisma } from '@/lib/db';

    // existing flash-only path:
    async function geminiFlashOnly(pkg: SourcePackage) { /* ... existing */ }

    async function geminiRouted(pkg: SourcePackage) {
      const ctx = await getEngineContext(pkg.ticker);
      const choice = routeModel({
        ticker: pkg.ticker,
        controversy: ctx.controversy_score ?? 0,
        ic_decay_flag: ctx.ic_decay_flag ?? false,
        market_cap_class: ctx.cap_class,
      });

      // Invoke chosen model
      const result = await invokeModel(choice, pkg);

      // Telemetry — REUSE existing LearningEvent schema (no new columns)
      // event_type discriminator: 'model_router_decision'
      // delta JSONB: arbitrary payload {model, tokens, estimated_cost_usd, controversy, ic_decay_flag, market_cap_class}
      // ticker, message: existing columns
      const estimatedCost = estimateCost(choice, result.tokens_used);
      await prisma.learningEvent.create({
        data: {
          event_type: 'model_router_decision',
          ticker: pkg.ticker,
          message: `routed ${pkg.ticker} to ${choice} (${result.tokens_used} tokens, $${estimatedCost.toFixed(5)})`,
          delta: {
            model: choice,
            tokens: result.tokens_used,
            estimated_cost_usd: estimatedCost,
            controversy: ctx.controversy_score ?? 0,
            ic_decay_flag: ctx.ic_decay_flag ?? false,
            market_cap_class: ctx.cap_class ?? 'unknown',
          },
        },
      });

      return result;
    }

    // Shadow:
    return runWithShadow(
      'model-router',
      () => geminiFlashOnly(pkg),
      () => geminiRouted(pkg),
      FEATURES.model_router_mode,
      { ticker: pkg.ticker },
    );
    ```

    Note: The cost telemetry write happens INSIDE geminiRouted (the new path) so when mode='off', no telemetry is written (we have no router decision to log). When mode='shadow' or 'on', the new path runs and writes its row. The existing flash-only baseline doesn't write router telemetry — that's expected, since there's no routing decision happening.
  </action>
  <acceptance_criteria>
    - `grep -q "routeModel\|estimateCost" src/lib/gemini-analysis.ts`
    - `grep -q "runWithShadow.*'model-router'" src/lib/gemini-analysis.ts`
    - `grep -q "learningEvent.create" src/lib/gemini-analysis.ts` (cost telemetry)
    - `grep -q "event_type.*'model_router_decision'" src/lib/gemini-analysis.ts`
    - `grep -q "estimated_cost_usd" src/lib/gemini-analysis.ts` (writes to delta JSONB)
    - **No schema changes**: `! git diff prisma/schema.prisma | grep -q "LearningEvent"` (if anything in this plan would change LearningEvent schema, STOP — that work belongs in 19-Z-02 if truly needed)
  </acceptance_criteria>
  <automated>grep -q "model-router" src/lib/gemini-analysis.ts && grep -q "learningEvent.create" src/lib/gemini-analysis.ts && grep -q "model_router_decision" src/lib/gemini-analysis.ts</automated>
  <done>Router wired + cost telemetry persisted via existing LearningEvent schema (no new columns)</done>
</task>

<task type="auto" id="19-C-09-04">
  <name>Task 4: Initial commit + shadow lifecycle</name>
  <action>
    Commit then shadow:
    a) Initial commit (flag off)
    b) Flip FEATURE_MODEL_ROUTER to shadow
    c) Drive workload (3-7d)
    d) `npm run shadow-verdict 19-C-09`:
       - Decision agreement: how often router-choice == flash-baseline-implicit (when both would have produced same Brier on resolved); ≥70% (RESEARCH Pitfall 5 router metric)
       - Cost reduction: avg(estimated_cost) for routed < flash-only baseline cost. CLI averages new_cost_usd / old_cost_usd from ShadowComparison.ctx (populated via runWithShadow ctx) and verdict() applies the ratio rule (cost ratio > 1.5 → FAIL)
       - Brier non-regression on resolved tickers
    e) PASS → cutover; remove flash-only branch
    f) 7d hatch
    g) Flag removal

    Aggregation query for /insights cost panel (read-only, uses existing LearningEvent shape):
    ```sql
    SELECT
      delta->>'model' as model,
      COUNT(*) as n,
      AVG((delta->>'estimated_cost_usd')::float) as avg_cost,
      SUM((delta->>'estimated_cost_usd')::float) as total_cost
    FROM "learning_events"
    WHERE event_type = 'model_router_decision'
      AND occurred_at >= NOW() - INTERVAL '7 days'
    GROUP BY delta->>'model';
    ```
  </action>
  <acceptance_criteria>
    - shadow-reports/19-C-09.json PASS
    - FEATURE_MODEL_ROUTER removed
    - LearningEvent rows with event_type='model_router_decision' visible after shadow window
    - No prisma/schema.prisma changes in this plan's commits (telemetry uses existing schema)
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-c-09"</automated>
  <done>Router canonical with cost telemetry via existing LearningEvent schema</done>
</task>

</tasks>

<verification>
- [ ] 8 unit tests pass
- [ ] Decision tree pinned per design §4 step 6c
- [ ] Cost telemetry visible in LearningEvent (event_type='model_router_decision', delta JSONB populated)
- [ ] No new columns added to LearningEvent (existing schema sufficient — confirmed by audit)
- [ ] Shadow PASS: agreement ≥70%, cost down, Brier non-regression
</verification>

<success_criteria>
1. Router live; cost telemetry visible in /insights via aggregate query on existing LearningEvent shape
2. ic_decay_flag=true reliably routes to Pro
3. No schema additions to 19-Z-02 LearningEvent (existing columns suffice per audit)
4. Hard Cleanup Gate satisfied
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-09-SUMMARY.md` documenting:
- Schema audit confirmation (LearningEvent existing columns sufficient; no 19-Z-02 changes)
- Sample LearningEvent.delta payload structure
- Aggregation SQL pattern for /insights consumption
</output>
</content>
</invoke>