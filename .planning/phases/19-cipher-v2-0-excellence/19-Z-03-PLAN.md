---
phase: 19
plan: 19-Z-03
wave: Z
type: execute
depends_on: [19-Z-02]
files_modified:
  - src/lib/shadow/shadow-runner.ts
  - src/lib/shadow/verdict.ts
  - scripts/shadow-verdict.ts
  - tests/lib/shadow/shadow-runner.test.ts
  - tests/lib/shadow/verdict.test.ts
  - package.json
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "runWithShadow(name, oldFn, newFn, mode='off') returns oldFn() result, never calls newFn"
    - "runWithShadow(name, oldFn, newFn, mode='on') returns newFn() result, never calls oldFn"
    - "runWithShadow(name, oldFn, newFn, mode='shadow') returns oldFn() result FIRST, runs newFn in setImmediate background, persists ShadowComparison row"
    - "Shadow newFn errors NEVER propagate to user (caught + logged + persisted)"
    - "verdict() returns PASS when new ≥ old on quality AND (latency OR cost) AND disagreement < 5%"
    - "verdict() returns FAIL when new < old quality OR p95 ≥ 2× old OR (cost_new_usd_per_request / cost_old_baseline_usd_per_request) > 1.5"
    - "verdict() returns HOLD when row count < 200 AND quality unmeasurable"
    - "shadow-verdict CLI exits 0/1/2 for PASS/FAIL/HOLD"
    - "verdict report written to shadow-reports/<plan-id>.json"
    - "shadow-verdict CLI for plan 19-A-07 reads shadow-reports/19-A-07-audit.json (NOT raw ShadowComparison rows) for quality_delta — ShadowComparison rows provide latency_delta only; convergence-speed is longitudinal not per-request"
  artifacts:
    - path: "src/lib/shadow/shadow-runner.ts"
      provides: "runWithShadow<T>() generic shadow harness"
      exports: ["runWithShadow"]
    - path: "src/lib/shadow/verdict.ts"
      provides: "Pure verdict() function over ShadowComparison aggregates"
      exports: ["verdict", "type Verdict", "type VerdictMetrics"]
    - path: "scripts/shadow-verdict.ts"
      provides: "CLI: npm run shadow-verdict <plan-id>"
    - path: "package.json"
      contains: "\"shadow-verdict\":"
  key_links:
    - from: "src/lib/shadow/shadow-runner.ts"
      to: "prisma.shadowComparison.create"
      via: "setImmediate background persist"
      pattern: "shadowComparison\\.create"
    - from: "scripts/shadow-verdict.ts"
      to: "shadow-reports/"
      via: "writeFileSync"
      pattern: "shadow-reports/"
---

# Plan 19-Z-03: shadow-runner + shadow-verdict CLI

<universal_preamble>

## Autonomous Execution Clause (D-04, D-05, D-06, D-07)

The agent (Claude) executes this plan end-to-end. Land code → unit tests green → smoke test against ShadowComparison table from 19-Z-02 → commit. No shadow lifecycle for the shadow infra itself.

## Hard Cleanup Gate (Definition of Done)

1. (N/A — plan IS the shadow infra)
2. (N/A)
3. (N/A)
4. (N/A)
5. `npm test` green; smoke test of `npm run shadow-verdict noop-plan` produces a verdict file

</universal_preamble>

<objective>
Deliver the shadow A/B harness primitives (`runWithShadow<T>`, `verdict()`) and the `shadow-verdict` CLI that drive every Phase 19 cutover lifecycle (D-05, D-11/12/13/14). Defines the PASS/FAIL/HOLD contract that `/gsd-execute-phase` enforces.
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
@.planning/phases/19-cipher-v2-0-excellence/19-Z-02-SUMMARY.md
@src/lib/db.ts

<interfaces>
```typescript
// src/lib/shadow/shadow-runner.ts
import type { FeatureMode } from '@/lib/features';

export async function runWithShadow<T>(
  pathName: string,
  oldFn: () => Promise<T>,
  newFn: () => Promise<T>,
  mode: FeatureMode,
  ctx?: { ticker?: string; cost_old_usd?: number; cost_new_usd?: number },
): Promise<T>;

// src/lib/shadow/verdict.ts
export type VerdictResult = 'PASS' | 'FAIL' | 'HOLD';

/**
 * VerdictMetrics — both old AND new cost passed in absolute USD/request.
 * verdict() computes the ratio internally per D-12: "cost > 1.5× old".
 *
 * If either cost is null OR old <= 0, the cost regression rule is SKIPPED
 * (cannot compute ratio safely; do not gate).
 */
export interface VerdictMetrics {
  n_rows: number;
  latency_p50_old_ms: number;
  latency_p95_old_ms: number;
  latency_p50_new_ms: number;
  latency_p95_new_ms: number;
  cost_old_baseline_usd_per_request: number | null;  // absolute USD/request from old path (avg over rows)
  cost_new_usd_per_request: number | null;           // absolute USD/request from new path (avg over rows)
  output_disagreement_rate: number;
  quality_delta: number | null;       // Brier-lift, IC delta, or field-fill delta
  quality_measurable: boolean;
}

export function verdict(metrics: VerdictMetrics): { result: VerdictResult; reasons: string[] };
```
</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user request → shadow-runner | shadow path runs in setImmediate background, isolated from user-facing latency (D-14) |
| shadow-verdict CLI → DB | reads ShadowComparison rows, writes verdict file to local fs |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-Z-03-01 | Tampering | verdict thresholds | mitigate | Pure-function verdict — thresholds hardcoded constants matching D-11/12/13; no caller can override; unit-tested with golden inputs |
| T-19-Z-03-02 | DoS | new path crashes propagate to user | mitigate | runWithShadow wraps newFn in try/catch in setImmediate; never re-throws; logs + persists to ShadowComparison.new_output_json={error: ...} |
| T-19-Z-03-03 | Information Disclosure | API keys in shadow-comparison logs | mitigate | shadow-runner sanitizes any URL string field before persist (regex strip `:[^/@]+@` from URLs) per ASVS V7 |
| T-19-Z-03-04 | Business Logic | verdict gate too lenient → bad cutover | mitigate | PASS rule requires non-regression on EVERY metric (not average) per RESEARCH risk register |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-Z-03-01">
  <name>Task 1: Write failing tests for verdict.ts (pure function math)</name>
  <read_first>
    - docs/plans/2026-05-07-cipher-v2-excellence-design.md (lines 339-377 — verdict spec)
    - docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md (lines 297-305 — verdict acceptance criteria)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 423-434 — per-path metrics)
  </read_first>
  <behavior>
    Test cases for `verdict(metrics: VerdictMetrics): { result, reasons }`. Note: D-12 specifies cost regression is RATIO-based ("cost > 1.5× old"), NOT absolute. verdict() computes the ratio = cost_new / cost_old internally.

    - Test 1: `PASS — new better quality, equal latency, low disagreement` — quality_delta=+0.05, latency_p95_new_ms=100, latency_p95_old_ms=100, output_disagreement_rate=0.02, n_rows=300, cost_old=0.01, cost_new=0.01 → result === 'PASS'
    - Test 2: `PASS — new equal quality, lower cost` — quality_delta=0, cost_old=0.01, cost_new=0.009, n_rows=300 → PASS
    - Test 3: `FAIL — new worse quality` — quality_delta=-0.05, n_rows=300 → FAIL with reason mentioning "quality"
    - Test 4: `FAIL — new latency p95 ≥ 2× old` — latency_p95_new_ms=300, latency_p95_old_ms=100, n_rows=300 → FAIL with reason mentioning "latency"
    - Test 5: `FAIL — new cost > 1.5× old (ratio-based)` — cost_old_baseline_usd_per_request=0.01, cost_new_usd_per_request=0.016 (ratio=1.6×) → FAIL with reason mentioning "cost"
    - Test 5b: `PASS — new cost exactly 1.5× old (boundary, not strictly greater)` — cost_old=0.01, cost_new=0.015 → PASS (rule is `> 1.5`, equal is allowed)
    - Test 5c: `PASS — both costs null (cost rule skipped)` — cost_old=null, cost_new=null → no FAIL on cost (other gates determine outcome)
    - Test 5d: `PASS — old cost 0 or negative (cost rule skipped — cannot compute ratio)` — cost_old=0, cost_new=0.5 → no FAIL on cost (skip rule)
    - Test 6: `FAIL — disagreement ≥ 5%` — output_disagreement_rate=0.07, others fine → FAIL with reason "disagreement"
    - Test 7: `HOLD — n_rows < 200 AND quality unmeasurable` — n_rows=50, quality_measurable=false → HOLD
    - Test 8: `PASS — n_rows < 200 BUT quality measurable AND all metrics good` — n_rows=50, quality_measurable=true, quality_delta=+0.02 → PASS
    - Test 9: `boundary: latency_p95_new_ms exactly 2× old → FAIL` — exactly 200 vs 100 → FAIL (≥ rule)
    - Test 10: `reasons array non-empty on FAIL` — every FAIL must include at least one reason string
  </behavior>
  <action>
    Create `tests/lib/shadow/verdict.test.ts`:
    ```typescript
    import { describe, it, expect } from 'vitest';
    import { verdict, type VerdictMetrics } from '../../../src/lib/shadow/verdict';

    function baseline(overrides: Partial<VerdictMetrics> = {}): VerdictMetrics {
      return {
        n_rows: 300,
        latency_p50_old_ms: 50, latency_p95_old_ms: 100,
        latency_p50_new_ms: 50, latency_p95_new_ms: 100,
        cost_old_baseline_usd_per_request: 0.01,
        cost_new_usd_per_request: 0.01,
        output_disagreement_rate: 0.02,
        quality_delta: 0,
        quality_measurable: true,
        ...overrides,
      };
    }
    // ... 13 tests using baseline() with overrides (10 + 5b/5c/5d)
    ```
    Implement all test cases per the behavior list above. Ratio computed internally as `cost_new / cost_old`; FAIL when ratio > 1.5 AND both costs are non-null AND old > 0.
  </action>
  <acceptance_criteria>
    - File `tests/lib/shadow/verdict.test.ts` exists
    - `grep -c "it(" tests/lib/shadow/verdict.test.ts` returns ≥13
    - Test FAILS with "Cannot find module '../../../src/lib/shadow/verdict'"
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/shadow/verdict.test.ts 2>&1 | grep -q "Cannot find module" && echo "RED-OK"</automated>
  <done>≥13 failing tests written; module-not-found confirmed</done>
</task>

<task type="auto" tdd="true" id="19-Z-03-02">
  <name>Task 2: Implement src/lib/shadow/verdict.ts to make tests green</name>
  <read_first>
    - tests/lib/shadow/verdict.test.ts (just written)
    - docs/plans/2026-05-07-cipher-v2-excellence-design.md (lines 354-356 — exact PASS/FAIL/HOLD rules)
  </read_first>
  <action>
    Create `src/lib/shadow/verdict.ts`:
    ```typescript
    export type VerdictResult = 'PASS' | 'FAIL' | 'HOLD';

    /**
     * VerdictMetrics — caller passes BOTH old + new absolute cost (USD/request).
     *
     * Cost regression rule (D-12): FAIL when cost_new / cost_old > 1.5
     *   - Skipped (no cost gate fired) when EITHER cost is null OR old <= 0.
     *   - The CLI in scripts/shadow-verdict.ts is responsible for averaging
     *     per-row cost into these aggregate fields.
     */
    export interface VerdictMetrics {
      n_rows: number;
      latency_p50_old_ms: number;
      latency_p95_old_ms: number;
      latency_p50_new_ms: number;
      latency_p95_new_ms: number;
      cost_old_baseline_usd_per_request: number | null;
      cost_new_usd_per_request: number | null;
      output_disagreement_rate: number;
      quality_delta: number | null;
      quality_measurable: boolean;
    }

    export const VERDICT_THRESHOLDS = {
      LATENCY_P95_REGRESSION_RATIO: 2.0,    // FAIL if new_p95 >= old_p95 * 2.0 (D-12)
      COST_REGRESSION_RATIO: 1.5,           // FAIL if new_cost / old_cost > 1.5 (D-12, strict ratio)
      DISAGREEMENT_THRESHOLD: 0.05,         // FAIL if disagreement >= 0.05 (D-11)
      MIN_ROWS_FOR_VERDICT: 200,            // HOLD if n_rows < this AND quality_measurable=false (D-13)
    } as const;

    export function verdict(m: VerdictMetrics): { result: VerdictResult; reasons: string[] } {
      const reasons: string[] = [];

      // FAIL rules (D-12) — any one trips
      if (m.quality_measurable && m.quality_delta !== null && m.quality_delta < 0) {
        reasons.push(`quality regressed: delta=${m.quality_delta}`);
      }
      const p95Ratio = m.latency_p95_old_ms > 0 ? m.latency_p95_new_ms / m.latency_p95_old_ms : 1;
      if (p95Ratio >= VERDICT_THRESHOLDS.LATENCY_P95_REGRESSION_RATIO) {
        reasons.push(`latency p95 regression ${p95Ratio.toFixed(2)}× old`);
      }

      // Cost regression rule (D-12) — strictly ratio-based.
      // Skip rule when ratio cannot be computed safely.
      if (
        m.cost_old_baseline_usd_per_request !== null &&
        m.cost_new_usd_per_request !== null &&
        m.cost_old_baseline_usd_per_request > 0
      ) {
        const costRatio = m.cost_new_usd_per_request / m.cost_old_baseline_usd_per_request;
        if (costRatio > VERDICT_THRESHOLDS.COST_REGRESSION_RATIO) {
          reasons.push(
            `cost regression: new=${m.cost_new_usd_per_request} old=${m.cost_old_baseline_usd_per_request} ratio=${costRatio.toFixed(2)}× > 1.5×`
          );
        }
      }

      if (m.output_disagreement_rate >= VERDICT_THRESHOLDS.DISAGREEMENT_THRESHOLD) {
        reasons.push(`disagreement ${(m.output_disagreement_rate * 100).toFixed(1)}% ≥ 5%`);
      }

      if (reasons.length > 0) return { result: 'FAIL', reasons };

      // HOLD rule (D-13)
      if (m.n_rows < VERDICT_THRESHOLDS.MIN_ROWS_FOR_VERDICT && !m.quality_measurable) {
        return {
          result: 'HOLD',
          reasons: [`only ${m.n_rows} rows AND quality unmeasurable — extend window`],
        };
      }

      // PASS rule (D-11): non-regression on every metric
      return { result: 'PASS', reasons: ['all gates green'] };
    }
    ```
  </action>
  <acceptance_criteria>
    - File `src/lib/shadow/verdict.ts` exists
    - All tests pass: `npx vitest run tests/lib/shadow/verdict.test.ts` exits 0
    - `grep -q "VERDICT_THRESHOLDS" src/lib/shadow/verdict.ts`
    - `grep -q "cost_new.*cost_old\|costRatio" src/lib/shadow/verdict.ts` (ratio computed internally)
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/shadow/verdict.test.ts</automated>
  <done>verdict.ts pure function implemented; all tests GREEN; cost rule is ratio-based per D-12</done>
</task>

<task type="auto" tdd="true" id="19-Z-03-03">
  <name>Task 3: Write failing tests for shadow-runner.ts</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 257-298 — runWithShadow reference impl)
    - src/lib/db.ts (Prisma client singleton import path)
  </read_first>
  <behavior>
    - Test 1: `mode=off returns oldFn result, newFn never called` — vi.fn for both; assert old called once, new never called
    - Test 2: `mode=on returns newFn result, oldFn never called`
    - Test 3: `mode=shadow returns oldFn result, newFn called in setImmediate` — assert returned value is from old; await flush of setImmediate; assert new was called
    - Test 4: `mode=shadow persists ShadowComparison row with old/new outputs + latencies` — mock prisma.shadowComparison.create; verify call args
    - Test 5: `mode=shadow swallows newFn errors (does NOT throw to caller)` — newFn throws; old returns; assert no throw propagated; assert error logged + persisted with new_output_json containing {error: '...'}
    - Test 6: `path_name and ticker propagated to ShadowComparison row`
    - Test 7: `cost_old_usd/cost_new_usd propagated when ctx provided`
  </behavior>
  <action>
    Create `tests/lib/shadow/shadow-runner.test.ts`:
    - Mock `@/lib/db` to expose `prisma.shadowComparison.create` as a vi.fn
    - Use `vi.useFakeTimers()` + `vi.runAllTimersAsync()` to flush setImmediate
    - Each test calls `runWithShadow('test-path', oldFn, newFn, mode, ctx)` and asserts behavior

    Note: `setImmediate` may need `new Promise(r => setImmediate(r))` await pattern to flush.
  </action>
  <acceptance_criteria>
    - File `tests/lib/shadow/shadow-runner.test.ts` exists
    - `grep -c "it(" tests/lib/shadow/shadow-runner.test.ts` returns 7
    - Test FAILS with module-not-found
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/shadow/shadow-runner.test.ts 2>&1 | grep -q "Cannot find module" && echo "RED-OK"</automated>
  <done>7 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-Z-03-04">
  <name>Task 4: Implement src/lib/shadow/shadow-runner.ts</name>
  <read_first>
    - tests/lib/shadow/shadow-runner.test.ts (just written)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 257-298 — reference impl)
    - src/lib/db.ts (Prisma client export)
  </read_first>
  <action>
    Create `src/lib/shadow/shadow-runner.ts`:
    ```typescript
    import { prisma } from '@/lib/db';
    import type { FeatureMode } from '@/lib/features';

    export interface ShadowContext {
      ticker?: string;
      cost_old_usd?: number;
      cost_new_usd?: number;
    }

    /**
     * Sanitize URL strings to strip embedded auth (per V7 ASVS).
     * Recursively walks objects.
     */
    function sanitize(value: unknown): unknown {
      if (typeof value === 'string') {
        return value.replace(/(https?:\/\/)([^@\/]+@)/g, '$1***@');
      }
      if (Array.isArray(value)) return value.map(sanitize);
      if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          out[k] = sanitize(v);
        }
        return out;
      }
      return value;
    }

    export async function runWithShadow<T>(
      pathName: string,
      oldFn: () => Promise<T>,
      newFn: () => Promise<T>,
      mode: FeatureMode,
      ctx: ShadowContext = {},
    ): Promise<T> {
      if (mode === 'off') return oldFn();
      if (mode === 'on') return newFn();

      // shadow mode
      const oldStart = Date.now();
      const oldResult = await oldFn();
      const oldLatency = Date.now() - oldStart;

      setImmediate(async () => {
        const newStart = Date.now();
        let newResult: T | null = null;
        let errorMsg: string | null = null;
        try {
          newResult = await newFn();
        } catch (err) {
          errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[shadow] ${pathName} new-path error:`, errorMsg);
        }
        const newLatency = Date.now() - newStart;

        try {
          await prisma.shadowComparison.create({
            data: {
              path_name: pathName,
              ticker: ctx.ticker ?? null,
              old_output_json: sanitize(oldResult) as object,
              new_output_json: errorMsg
                ? { error: errorMsg }
                : (sanitize(newResult) as object),
              old_latency_ms: oldLatency,
              new_latency_ms: newLatency,
              old_cost_usd: ctx.cost_old_usd ?? null,
              new_cost_usd: ctx.cost_new_usd ?? null,
            },
          });
        } catch (persistErr) {
          console.error(`[shadow] ${pathName} persist error:`, persistErr);
        }
      });

      return oldResult;
    }
    ```
  </action>
  <acceptance_criteria>
    - File `src/lib/shadow/shadow-runner.ts` exists
    - All 7 tests pass: `npx vitest run tests/lib/shadow/shadow-runner.test.ts` exits 0
    - `grep -q "setImmediate" src/lib/shadow/shadow-runner.ts`
    - `grep -q "sanitize" src/lib/shadow/shadow-runner.ts` (URL auth-stripping mitigation T-19-Z-03-03)
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/shadow/shadow-runner.test.ts</automated>
  <done>shadow-runner.ts implemented; 7/7 tests GREEN; setImmediate background isolation verified</done>
</task>

<task type="auto" id="19-Z-03-05">
  <name>Task 5: Implement scripts/shadow-verdict.ts CLI with per-plan strategies</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 423-434 — per-path metrics map)
    - src/lib/shadow/verdict.ts (just created)
    - package.json (existing scripts pattern — match `"tune-lambda": "tsx scripts/tune-lambda.ts"`)
  </read_first>
  <action>
    Create `scripts/shadow-verdict.ts` that:
    1. Accepts CLI arg: `<plan-id>` (e.g., `19-B-06`)
    2. Maps plan-id → path_name (table in code: `{ '19-B-06': 'source-package-merge', '19-C-09': 'model-router', '19-A-07': 'hierarchical-pooling', ... }`)
    3. Queries `prisma.shadowComparison.findMany({ where: { path_name } })` (or skips DB query for plans whose strategy reads an audit JSON file — see 19-A-07 strategy below)
    4. Computes VerdictMetrics:
       - n_rows: count
       - latency_p50/p95: percentile of `old_latency_ms` and `new_latency_ms` arrays
       - cost_old_baseline_usd_per_request: avg(old_cost_usd) for non-null rows
       - cost_new_usd_per_request: avg(new_cost_usd) for non-null rows
       - output_disagreement_rate: per-plan-specific metric (Jaccard for SourcePackage, Pearson<0.85 means disagree for sentiment, URL-coverage delta for citations) — pluggable per-plan strategy
       - quality_delta: where outcomes resolved (join PriceOutcome by ticker+ts), compute Brier-lift; else null
       - quality_measurable: true if ≥10 rows have resolved outcomes
    5. Calls `verdict(metrics)`
    6. Writes `shadow-reports/<plan-id>.json` with `{ verdict, reasons, metrics, timestamp }`
    7. Exits with 0 (PASS) / 1 (FAIL) / 2 (HOLD)

    Implementation skeleton:
    ```typescript
    #!/usr/bin/env tsx
    import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
    import { prisma } from '../src/lib/db';
    import { verdict, type VerdictMetrics } from '../src/lib/shadow/verdict';

    const PLAN_TO_PATH: Record<string, string> = {
      '19-B-06': 'source-package-merge',
      '19-C-02': 'finsentllm-ensemble',
      '19-C-03': 'stocktwits-reputation-weighted',
      '19-C-04': 'options-term-structure',
      '19-C-05': 'community-supplemental',
      '19-C-07': 'citations-v2',
      '19-C-08': 'cove-two-pass',
      '19-C-09': 'model-router',
      '19-C-10': 'contradiction-detector',
      '19-A-07': 'hierarchical-pooling',
      '19-B-07': 'runtime-cache',
      '19-B-08': 'rollout-driver',
    };

    /**
     * STRATEGIES: per-plan disagreement + quality_delta computation.
     * Each strategy returns partial VerdictMetrics fields.
     *
     * Convention: strategies that derive quality_delta from a longitudinal
     * audit JSON (e.g., 19-A-07 convergence speedup) read the audit file
     * directly; ShadowComparison rows still provide latency_delta. This
     * bridges per-request shadow comparison with longitudinal audit metrics.
     */
    type StrategyResult = {
      output_disagreement_rate: number;
      quality_delta: number | null;
      quality_measurable: boolean;
    };

    type Strategy = (rows: any[], planId: string) => Promise<StrategyResult> | StrategyResult;

    const STRATEGIES: Record<string, Strategy> = {
      'source-package-merge': (rows) => ({ /* Jaccard over field-level non-null sets per RESEARCH §"Pitfall 5" */
        output_disagreement_rate: computeJaccardDisagreement(rows),
        quality_delta: null,
        quality_measurable: false,
      }),
      'finsentllm-ensemble': (rows) => ({ /* 1 - Pearson corr between scores */ }),
      'citations-v2': (rows) => ({ /* URL-coverage rate delta */ }),
      'cove-two-pass': (rows) => ({ /* field equality + embedding cosine */ }),
      'model-router': (rows) => ({ /* decision agreement rate */ }),
      'contradiction-detector': (rows) => ({ /* false-positive rate */ }),
      // 19-A-07 special: convergence-speed is longitudinal, NOT per-request.
      // ShadowComparison rows track per-cron-run latency_delta only.
      // quality_delta read from shadow-reports/19-A-07-audit.json (produced by scripts/hierarchical-pooling-audit.ts).
      'hierarchical-pooling': async (rows, planId) => {
        const auditPath = `shadow-reports/${planId}-audit.json`;
        if (!existsSync(auditPath)) {
          return {
            output_disagreement_rate: 0,
            quality_delta: null,
            quality_measurable: false,
          };
        }
        const audit = JSON.parse(readFileSync(auditPath, 'utf-8'));
        // audit.speedup is the convergence-speed delta (e.g., 0.32 = 32% faster median)
        return {
          output_disagreement_rate: 0, // pooling is additive; per-request output unchanged
          quality_delta: audit.speedup ?? null,
          quality_measurable: typeof audit.speedup === 'number',
        };
      },
    };

    async function main() {
      const planId = process.argv[2];
      if (!planId) { console.error('Usage: shadow-verdict <plan-id>'); process.exit(3); }
      const pathName = PLAN_TO_PATH[planId] ?? planId;

      const rows = await prisma.shadowComparison.findMany({
        where: { path_name: pathName },
        orderBy: { created_at: 'desc' },
        take: 5000,
      });

      // Compute latency percentiles from rows
      const latencyOldP50 = percentile(rows.map(r => r.old_latency_ms ?? 0), 0.5);
      const latencyOldP95 = percentile(rows.map(r => r.old_latency_ms ?? 0), 0.95);
      const latencyNewP50 = percentile(rows.map(r => r.new_latency_ms ?? 0), 0.5);
      const latencyNewP95 = percentile(rows.map(r => r.new_latency_ms ?? 0), 0.95);

      // Cost: avg of non-null per-row costs
      const costOldRows = rows.filter(r => r.old_cost_usd != null);
      const costNewRows = rows.filter(r => r.new_cost_usd != null);
      const costOldAvg = costOldRows.length > 0
        ? costOldRows.reduce((s, r) => s + r.old_cost_usd, 0) / costOldRows.length : null;
      const costNewAvg = costNewRows.length > 0
        ? costNewRows.reduce((s, r) => s + r.new_cost_usd, 0) / costNewRows.length : null;

      const strategy = STRATEGIES[pathName] ?? defaultStrategy;
      const strategyResult = await strategy(rows, planId);

      const metrics: VerdictMetrics = {
        n_rows: rows.length,
        latency_p50_old_ms: latencyOldP50,
        latency_p95_old_ms: latencyOldP95,
        latency_p50_new_ms: latencyNewP50,
        latency_p95_new_ms: latencyNewP95,
        cost_old_baseline_usd_per_request: costOldAvg,
        cost_new_usd_per_request: costNewAvg,
        ...strategyResult,
      };
      const result = verdict(metrics);

      mkdirSync('shadow-reports', { recursive: true });
      const out = { plan_id: planId, path_name: pathName, ...result, metrics, timestamp: new Date().toISOString() };
      writeFileSync(`shadow-reports/${planId}.json`, JSON.stringify(out, null, 2));

      console.log(`Verdict: ${result.result}`);
      for (const r of result.reasons) console.log(`  - ${r}`);

      process.exit(result.result === 'PASS' ? 0 : result.result === 'FAIL' ? 1 : 2);
    }
    main().catch(e => { console.error(e); process.exit(3); });
    ```

    Per-plan metric strategies (encoded in STRATEGIES map):
    - 'source-package-merge': Jaccard over field-level non-null sets per RESEARCH §"Pitfall 5"
    - 'finsentllm-ensemble': 1 - Pearson correlation between scores
    - 'citations-v2': URL-coverage rate delta (old URLs ⊂ new URLs check)
    - 'cove-two-pass': field-by-field equality + embedding cosine on free-text
    - 'model-router': decision agreement rate (1 - agreement)
    - 'contradiction-detector': false-positive rate
    - 'hierarchical-pooling': **AUDIT-JSON strategy** — reads `shadow-reports/19-A-07-audit.json` `speedup` field as quality_delta; ShadowComparison rows provide latency_delta only. Bridges per-request shadow with longitudinal convergence-speed metric.

    Default fallback = element-wise JSON deep-equal-rate.
  </action>
  <acceptance_criteria>
    - File `scripts/shadow-verdict.ts` exists
    - File contains shebang `#!/usr/bin/env tsx` (or runs via `tsx scripts/shadow-verdict.ts`)
    - File contains `PLAN_TO_PATH` map with at least 12 entries (one per shadow_required plan)
    - File contains `STRATEGIES` map with explicit entries for: source-package-merge, finsentllm-ensemble, citations-v2, cove-two-pass, model-router, hierarchical-pooling, contradiction-detector
    - **`hierarchical-pooling` strategy explicitly reads `shadow-reports/19-A-07-audit.json` and uses `speedup` field as quality_delta**
    - File writes to `shadow-reports/<plan-id>.json` with valid JSON
    - File exits 0/1/2 based on verdict
  </acceptance_criteria>
  <automated>test -f scripts/shadow-verdict.ts && grep -q "PLAN_TO_PATH" scripts/shadow-verdict.ts && grep -q "shadow-reports/" scripts/shadow-verdict.ts && grep -q "19-A-07-audit\|hierarchical-pooling" scripts/shadow-verdict.ts && grep -q "speedup" scripts/shadow-verdict.ts && grep -c "source-package-merge\|finsentllm-ensemble\|citations-v2\|cove-two-pass\|model-router\|hierarchical-pooling\|contradiction-detector" scripts/shadow-verdict.ts | awk '$1>=7 {exit 0} {exit 1}'</automated>
  <done>shadow-verdict CLI implemented with per-plan strategies including 19-A-07 audit-JSON bridge + exit code contract</done>
</task>

<task type="auto" id="19-Z-03-06">
  <name>Task 6: Add npm script + smoke-test verdict CLI against empty path</name>
  <read_first>
    - package.json (scripts section)
  </read_first>
  <action>
    Add to `package.json` "scripts":
    ```json
    "shadow-verdict": "tsx scripts/shadow-verdict.ts"
    ```

    Smoke test: `npm run shadow-verdict noop-plan` should:
    - Query ShadowComparison where path_name='noop-plan' (zero rows expected)
    - Compute metrics with n_rows=0, quality_measurable=false
    - Verdict result: HOLD (n<200, unmeasurable)
    - Exit code 2
    - File `shadow-reports/noop-plan.json` exists with `verdict.result === 'HOLD'`

    Run the smoke test and verify both the file and exit code.
  </action>
  <acceptance_criteria>
    - `grep -q '"shadow-verdict"' package.json`
    - `npm run shadow-verdict noop-plan` exits 2
    - File `shadow-reports/noop-plan.json` exists
    - `cat shadow-reports/noop-plan.json | grep -q 'HOLD'`
  </acceptance_criteria>
  <automated>npm run shadow-verdict noop-plan; CODE=$?; test "$CODE" = "2" && test -f shadow-reports/noop-plan.json && grep -q "HOLD" shadow-reports/noop-plan.json</automated>
  <done>npm script registered; smoke test produces HOLD verdict for empty path</done>
</task>

<task type="auto" id="19-Z-03-07">
  <name>Task 7: Run full unit suite + commit</name>
  <read_first>
    - tests/learning.hyperparameters.test.ts (D-54 sanity)
  </read_first>
  <action>
    Run `npx vitest run`. Confirm green.
    Stage `src/lib/shadow/`, `tests/lib/shadow/`, `scripts/shadow-verdict.ts`, `package.json`. Note: shadow-reports/ is in /tmp; do NOT commit shadow-reports/.gitkeep.
    Commit:
    ```
    feat(19-z-03): shadow-runner + shadow-verdict CLI

    runWithShadow<T>() generic shadow harness — old returns first, new runs in
    setImmediate background, persists ShadowComparison row. Errors swallowed.
    URL auth strings sanitized before persist (V7 ASVS).

    verdict() pure function over ShadowComparison aggregates implements D-11/12/13:
      PASS  → new ≥ old quality AND (latency OR cost) AND disagreement < 5%
      FAIL  → quality regression OR p95 ≥ 2× old OR cost ratio > 1.5× old
      HOLD  → n_rows < 200 AND quality unmeasurable

    Cost regression rule is RATIO-based (cost_new / cost_old > 1.5 per D-12),
    NOT absolute. Verdict computes ratio internally; rule skipped when either
    cost null or old <= 0.

    shadow-verdict CLI exits 0/1/2 per verdict; writes shadow-reports/<plan>.json.
    Per-plan STRATEGIES map: 19-A-07 hierarchical-pooling reads
    shadow-reports/19-A-07-audit.json speedup field as quality_delta
    (bridges per-request shadow with longitudinal convergence-speed metric).

    Foundation for every Phase 19 cutover lifecycle (D-05).

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `npx vitest run` exits 0
    - `git log -1 --pretty=%s` returns "feat(19-z-03): shadow-runner + shadow-verdict CLI"
  </acceptance_criteria>
  <automated>npx vitest run && git log -1 --pretty=%s | grep -q "19-z-03"</automated>
  <done>All Wave Z primitives committed; shadow lifecycle infra live</done>
</task>

</tasks>

<verification>
- [ ] verdict.test.ts: ≥13 tests GREEN (incl. ratio-based cost rule + boundary + null-skip cases)
- [ ] shadow-runner.test.ts: 7/7 GREEN
- [ ] `npm run shadow-verdict noop-plan` exits 2 and writes `shadow-reports/noop-plan.json` with HOLD
- [ ] STRATEGIES map includes explicit 19-A-07 audit-JSON entry
- [ ] Phase 18 sanity test still green
- [ ] No edits to existing learning.ts logic
</verification>

<success_criteria>
Plan 19-Z-03 is complete when:
1. `runWithShadow` is the canonical entry point for any Wave A/B/C cutover that needs shadow A/B
2. `verdict()` enforces D-11/12/13 thresholds as pure-function math (cost rule = ratio > 1.5, NOT absolute)
3. `npm run shadow-verdict <plan-id>` is the operator-facing verdict gate
4. `shadow-reports/<plan-id>.json` is the artifact `/gsd-execute-phase` reads to mark a plan PASS
5. setImmediate background discipline verified — new path NEVER injects latency into user-facing path (D-14)
6. STRATEGIES map bridges per-request shadow with longitudinal audit-JSON metrics (19-A-07 hierarchical-pooling)
</success_criteria>

<output>
After completion, create `.planning/phases/19-cipher-v2-0-excellence/19-Z-03-SUMMARY.md`:
- runWithShadow signature + 3-mode contract
- verdict thresholds table (cost rule clarified as ratio-based)
- CLI smoke test result
- Per-plan strategy registry (which Wave A/B/C plans use which metric, including 19-A-07 audit-JSON bridge)
</output>
</content>
</invoke>