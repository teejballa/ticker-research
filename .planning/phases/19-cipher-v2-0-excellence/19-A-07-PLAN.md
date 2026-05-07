---
phase: 19
plan: 19-A-07
wave: A
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04, 19-A-01, 19-A-04, 19-A-06]
files_modified:
  - src/lib/learning.ts
  - src/app/api/cron/learn/route.ts
  - src/lib/engine-context.ts
  - tests/learning.hierarchical.test.ts
  - tests/integration/hierarchical-pooling.live.test.ts
  - tests/integration/hierarchical-pooling.convergence.test.ts
  - tests/integration/pruning.live.test.ts
  - tests/e2e/insights-pooling.spec.ts
  - scripts/hierarchical-sweep-report.ts
  - scripts/hierarchical-pooling-audit.ts
autonomous: true
requirements: [CORE-ML-11, CORE-ML-12, CORE-ML-13, CORE-ML-14]
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "hierarchicalPooledPosterior pure function pools α/β across cells in same (signal_class, cap_class) group via empirical Bayes method-of-moments"
    - "λ shrinkage strength learned per group, bounded [0.5, 50]"
    - "Cold-start safety: group n<5 → returns local posterior unchanged with shrinkage_strength=0"
    - "≥30% faster median convergence on n_local<10 cells vs no-pool control (CORE-ML-11..14 acceptance preserved from absorbed P19)"
    - "engine-context.ts computes α_pooled at READ time from local α/β + parent_alpha/parent_beta — cron does NOT overwrite local α/β (per RESEARCH Pitfall 3 safe rollout pattern)"
    - "Cell-space pruning: cells with raw N=0 AND no observations in last 90 days NOT allocated LearnedPattern rows (CORE-ML-14)"
    - "Cron writes parent_alpha + parent_beta + shrinkage_strength to LearnedPattern (per cell)"
    - "2-level vs 3-level hierarchy sweep documented in scripts/hierarchical-sweep-report.ts output (CORE-ML-12)"
    - "/insights renders differential CI widths (sparse cells wider than rich cells, but pooled tighter than no-pool — CORE-ML-13)"
    - "shadow A/B path_name='hierarchical-pooling' captures per-cron-run latency_delta only (per-request comparison metric); the convergence-speed-delta verdict (which is LONGITUDINAL — measured across 90 days of resolved DiffusionTrace, NOT per cron run) is computed by scripts/hierarchical-pooling-audit.ts and written to shadow-reports/19-A-07-audit.json"
    - "shadow-verdict CLI for 19-A-07 reads shadow-reports/19-A-07-audit.json (NOT raw ShadowComparison rows) for quality_delta — speedup field is the convergence-speed delta. ShadowComparison rows still provide latency_delta. This bridging is explicit in 19-Z-03 STRATEGIES['hierarchical-pooling']"
  artifacts:
    - path: "src/lib/learning.ts"
      provides: "hierarchicalPooledPosterior pure function + PooledPosterior type"
      exports: ["hierarchicalPooledPosterior", "PooledPosterior"]
    - path: "src/app/api/cron/learn/route.ts"
      provides: "Wired hierarchical pooling — writes parent_alpha/parent_beta/shrinkage_strength per cell"
      contains: "hierarchicalPooledPosterior"
    - path: "src/lib/engine-context.ts"
      provides: "Read-time α_pooled computation when FEATURE_HIERARCHICAL_POOLING enabled"
      contains: "α_pooled"
    - path: "scripts/hierarchical-sweep-report.ts"
      provides: "2-level vs 3-level vs no-pool sweep — outputs to /tmp/calibration-reports/hierarchical-sweep-<date>.md (CORE-ML-12)"
    - path: "scripts/hierarchical-pooling-audit.ts"
      provides: "Convergence speed comparison — produces shadow-reports/19-A-07-audit.json with speedup field; this is the longitudinal quality_delta input for shadow-verdict"
  key_links:
    - from: "src/app/api/cron/learn/route.ts:582-620 (status decision + persist)"
      to: "src/lib/learning.ts hierarchicalPooledPosterior"
      via: "compute parent + shrinkage, persist parent_alpha/parent_beta"
      pattern: "hierarchicalPooledPosterior\\("
    - from: "src/lib/engine-context.ts"
      to: "LearnedPattern.parent_alpha + LearnedPattern.alpha"
      via: "α_pooled = (n × α_local + λ × α_group) / (n + λ) at READ time"
      pattern: "α_pooled\\b"
    - from: "scripts/hierarchical-pooling-audit.ts"
      to: "shadow-reports/19-A-07-audit.json"
      via: "writeFileSync of {pooled_median, control_median, speedup}"
      pattern: "19-A-07-audit\\.json"
    - from: "scripts/shadow-verdict.ts (19-Z-03 STRATEGIES['hierarchical-pooling'])"
      to: "shadow-reports/19-A-07-audit.json"
      via: "readFileSync; audit.speedup → quality_delta"
      pattern: "19-A-07-audit"
---

# Plan 19-A-07: Hierarchical Bayesian pooling (absorbed v2.0 P19, CORE-ML-11..14)

<universal_preamble>

## Autonomous Execution Clause (D-04..D-07)

The agent (Claude) executes this plan end-to-end:
1. Land code behind FEATURE_HIERARCHICAL_POOLING=off
2. Flip flag to `shadow` via Vercel CLI
3. Run shadow workload — daily learn cron, ≥3 days OR ≥200 ShadowComparison rows for path_name='hierarchical-pooling'
4. Run scripts/hierarchical-pooling-audit.ts to produce shadow-reports/19-A-07-audit.json (longitudinal convergence-speed metric — NOT extractable from per-request shadow rows)
5. Run `npm run shadow-verdict 19-A-07` — STRATEGIES['hierarchical-pooling'] in 19-Z-03's CLI bridges per-request shadow (latency_delta) with audit JSON (quality_delta = audit.speedup). Verdict file `shadow-reports/19-A-07.json`
6. PASS → cutover PR (flag default `on`, old flat-prior path retained but no longer called from primary; behind permanent FALLBACK label NOT a feature flag) → 7-day hatch → final removal of `FEATURE_HIERARCHICAL_POOLING` from features.ts
7. FAIL → file failure plan (likely tweaking method-of-moments → MLE EM step per Assumption A7 mitigation), re-shadow

### Per-request shadow vs longitudinal verdict — explicit bridging

The `runWithShadow('hierarchical-pooling', ...)` wrapper in `recomputeAllCells` runs the no-pool vs pool path once per cron run. ShadowComparison rows it produces have meaningful `latency_delta` (per-cron timing) but NO meaningful per-request `quality_delta` — convergence speed is measured ACROSS 90 days of resolved DiffusionTrace outcomes, NOT inside any single cron invocation.

The bridging mechanism (formalized in 19-Z-03):
- `scripts/hierarchical-pooling-audit.ts` reads 90 days of resolved traces, computes median outcomes-to-ESS-30 for pooled vs control cells, writes `shadow-reports/19-A-07-audit.json` `{ pooled_median, control_median, speedup }`
- `19-Z-03 STRATEGIES['hierarchical-pooling']` reads that audit JSON and feeds `audit.speedup` as `quality_delta` into `verdict()`
- ShadowComparison rows still feed `latency_p50/p95_old/new` into `verdict()`

This is the canonical pattern for plans whose "quality" metric is longitudinal rather than per-request. It is documented in 19-Z-03's STRATEGIES map.

## Hard Cleanup Gate (Definition of Done)

1. `shadow-reports/19-A-07.json` verdict=PASS — convergence speed delta ≥30% (from audit.speedup), OOS Brier non-regression, calibration non-regression
2. Cutover PR merged with FEATURE_HIERARCHICAL_POOLING set to default `on`; flag-removal PR scheduled
3. 7d post-cutover with zero RollbackLog rows for `FEATURE_HIERARCHICAL_POOLING`
4. Flag-removal PR merged (FEATURE_HIERARCHICAL_POOLING absent from features.ts)
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green

</universal_preamble>

<objective>
Per D-23 + CORE-ML-11..14 (absorbed from original v2.0 P19): empirical Bayes hierarchical pooling. Pool α/β across cells in same `(signal_class, cap_class)` group via method-of-moments. Per-cell shrinkage `α_pooled = (n × α_local + λ × α_group) / (n + λ)`. Falls back to flat prior when group n<5. Shadow verdict gates cutover on ≥30% faster median convergence on n_local<10 cells vs no-pool control.
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
@.planning/REQUIREMENTS.md
@src/lib/learning.ts
@src/app/api/cron/learn/route.ts
@src/lib/engine-context.ts
@.planning/phases/19-cipher-v2-0-excellence/19-A-04-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-A-06-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-Z-03-SUMMARY.md

<interfaces>
```typescript
// src/lib/learning.ts — additive export per RESEARCH Example 3
export interface PooledPosterior {
  alpha_pooled: number;
  beta_pooled: number;
  parent_alpha: number;
  parent_beta: number;
  shrinkage_strength: number;
}

export function hierarchicalPooledPosterior(args: {
  cell_local: BetaPosterior;
  cell_n: number;
  group_cells: BetaPosterior[];
}): PooledPosterior;

// scripts/hierarchical-pooling-audit.ts — produces JSON consumed by 19-Z-03 STRATEGIES['hierarchical-pooling']
// Output schema: shadow-reports/19-A-07-audit.json
// {
//   "pooled_median":  number,   // median outcomes-to-ESS-30 for pooled cells
//   "control_median": number,   // median outcomes-to-ESS-30 for no-pool control
//   "speedup":        number,   // (control_median - pooled_median) / control_median  — fed as quality_delta to verdict()
//   "n_pooled":       number,
//   "n_control":      number,
//   "audited_at":     string    // ISO timestamp
// }
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-A-07-01 | Tampering | unstable parent_α from method-of-moments on small group | mitigate | Bound λ ∈ [0.5, 50]; fall back to flat prior when group_cells.length < 5; Assumption A7 → fallback to EBMLE if MoM diverges |
| T-19-A-07-02 | Business Logic | sudden EXPLORATORY → ACTIVE flip on cells with no new outcomes (per RESEARCH Pitfall 3) | mitigate | Persist BOTH local α/β AND parent_α/β; engine-context computes α_pooled at READ time; cron NEVER overwrites local α/β with pooled values |
| T-19-A-07-03 | DoS | combinatorial blowup of unallocated cells (lake-of-cells per CORE-ML-14) | mitigate | Pruning policy: cells with raw N=0 AND no observations last 90d NOT allocated; existing recomputeAllCells iterates only 3 traded cap classes (precedent at learn/route.ts:79-80) |
| T-19-A-07-04 | Business Logic | per-request shadow rows mistakenly used as quality_delta source | mitigate | 19-Z-03 STRATEGIES['hierarchical-pooling'] explicitly reads `shadow-reports/19-A-07-audit.json` `speedup` field instead of computing from ShadowComparison rows; ShadowComparison rows feed latency only |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-A-07-01">
  <name>Task 1: Write tests/learning.hierarchical.test.ts pure-function tests</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 519-578 — Example 3 reference impl)
    - src/lib/learning.ts (BetaPosterior type)
  </read_first>
  <behavior>
    - Test 1: `cold-start (group_cells.length < 5) returns local unchanged + shrinkage_strength=0`
    - Test 2: `pooled posterior shrinks toward parent — sparse cell (cell_n=2) closer to group mean than rich cell (cell_n=100)`
    - Test 3: `parent_alpha + parent_beta computed via method-of-moments from group means`
    - Test 4: `lambda bounded [0.5, 50]`
    - Test 5: `alpha_pooled = (cell_n × cell_local.alpha + λ × parent_alpha) / (cell_n + λ)` exact formula
    - Test 6: `pooled posterior is DB-free pure function (no @/lib/db import)`
    - Test 7: `group with all identical cells → parent ≈ each cell's posterior`
    - Test 8: `group with high variance → larger lambda (less shrinkage)`
    - Test 9: `n_local=0 → alpha_pooled = parent_alpha` (full pool to parent)
    - Test 10: `n_local→∞ → alpha_pooled → cell_local.alpha` (no pool)
  </behavior>
  <action>
    Create `tests/learning.hierarchical.test.ts`. 10 tests with deterministic synthetic groups.
  </action>
  <acceptance_criteria>
    - File exists; ≥10 tests
    - Test FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/learning.hierarchical.test.ts 2>&1 | grep -qE "Cannot find|hierarchicalPooledPosterior"</automated>
  <done>10 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-A-07-02">
  <name>Task 2: Implement hierarchicalPooledPosterior in src/lib/learning.ts</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 519-578 — verbatim impl)
    - tests/learning.hierarchical.test.ts (just written)
  </read_first>
  <action>
    Add to `src/lib/learning.ts` per RESEARCH Example 3 (lines 519-578) verbatim. The implementation:
    ```typescript
    export interface PooledPosterior {
      alpha_pooled: number;
      beta_pooled: number;
      parent_alpha: number;
      parent_beta: number;
      shrinkage_strength: number;
    }

    /**
     * Empirical Bayes hierarchical pooling per CORE-ML-11..14.
     * Method of moments estimation of group-level Beta hyperprior.
     * Per-cell shrinkage: α_pooled = (n × α_local + λ × α_group) / (n + λ).
     * λ bounded [0.5, 50] for stability.
     * Cold-start: group_cells.length < 5 → returns local unchanged.
     */
    export function hierarchicalPooledPosterior(args: {
      cell_local: BetaPosterior;
      cell_n: number;
      group_cells: BetaPosterior[];
    }): PooledPosterior {
      const { cell_local, cell_n, group_cells } = args;
      const k = group_cells.length;
      if (k < 5) {
        return {
          alpha_pooled: cell_local.alpha,
          beta_pooled: cell_local.beta,
          parent_alpha: 1,
          parent_beta: 1,
          shrinkage_strength: 0,
        };
      }
      const means = group_cells.map(c => c.alpha / (c.alpha + c.beta));
      const muBar = means.reduce((a, b) => a + b, 0) / k;
      const sigma2 = means.reduce((acc, m) => acc + (m - muBar) ** 2, 0) / Math.max(1, k - 1);
      const ratio = sigma2 > 0 ? (muBar * (1 - muBar)) / sigma2 - 1 : 50;
      const groupAlpha = Math.max(0.5, muBar * Math.max(1, ratio));
      const groupBeta = Math.max(0.5, (1 - muBar) * Math.max(1, ratio));
      const lambda = Math.min(50, Math.max(0.5, groupAlpha + groupBeta));
      return {
        alpha_pooled: (cell_n * cell_local.alpha + lambda * groupAlpha) / (cell_n + lambda),
        beta_pooled: (cell_n * cell_local.beta + lambda * groupBeta) / (cell_n + lambda),
        parent_alpha: groupAlpha,
        parent_beta: groupBeta,
        shrinkage_strength: lambda,
      };
    }
    ```
  </action>
  <acceptance_criteria>
    - All 10 tests pass
    - DB-free
    - `grep -q "export function hierarchicalPooledPosterior" src/lib/learning.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/learning.hierarchical.test.ts && ! grep -A 30 "hierarchicalPooledPosterior" src/lib/learning.ts | grep -q "prisma"</automated>
  <done>10/10 tests GREEN; pure function</done>
</task>

<task type="auto" tdd="true" id="19-A-07-03">
  <name>Task 3: Convergence test — ≥30% faster on n_local<10 cells (CORE-ML-11..14 acceptance)</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 700-724 — exact convergence test design)
    - .planning/REQUIREMENTS.md (CORE-ML-11..14 acceptance criteria)
  </read_first>
  <behavior>
    - Test 1: `hierarchical pooling accelerates sparse-cell convergence by ≥30% (median, n_local<10 cells)` — full simulation per RESEARCH lines 707-724
  </behavior>
  <action>
    Create `tests/integration/hierarchical-pooling.convergence.test.ts` — implement RESEARCH §"19-A-07 pooling convergence" lines 700-724 verbatim. Use seed=42, N_GROUPS=4, N_CELLS_PER_GROUP=8, N_TRIALS=100, PARENT_ALPHA=5, PARENT_BETA=3. Simulate cells with sparse evidence (n<10), measure outcomes-to-ESS-30 for both pool vs nopool, compute median convergence speedup, assert > 0.30.

    Note: This is a stochastic test. Use a sufficient N_TRIALS to ensure stable median; if flake-prone, run 3 seeded trials and require all 3 > 0.30.
  </action>
  <acceptance_criteria>
    - File exists
    - Test passes: `npx vitest run --config vitest.integration.config.ts tests/integration/hierarchical-pooling.convergence.test.ts` exits 0
    - Speedup > 0.30 reported
  </acceptance_criteria>
  <automated>npx vitest run --config vitest.integration.config.ts tests/integration/hierarchical-pooling.convergence.test.ts</automated>
  <done>CORE-ML-11..14 acceptance criterion verified by integration test</done>
</task>

<task type="auto" id="19-A-07-04">
  <name>Task 4: Wire hierarchicalPooledPosterior into /api/cron/learn (writes parent_α/β/λ)</name>
  <read_first>
    - src/app/api/cron/learn/route.ts (recomputeOneCell at lines 490-577, recomputeAllCells iteration logic)
    - prisma/schema.prisma (LearnedPattern.parent_alpha + parent_beta + shrinkage_strength columns from 19-Z-02)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 393-404 — Pitfall 3 safe rollout pattern)
  </read_first>
  <action>
    Edit `src/app/api/cron/learn/route.ts`:

    1. Add `import { hierarchicalPooledPosterior, FEATURES } from ...` near top
    2. In `recomputeAllCells` (or equivalent), after computing each cell's local α/β, GROUP cells by `(signal_class, cap_class)` and call `hierarchicalPooledPosterior` once per group
    3. For each cell, write `parent_alpha`, `parent_beta`, `shrinkage_strength` (NOT alpha/beta — preserve local) per Pitfall 3 safe rollout
    4. **Cell-space pruning** (CORE-ML-14): in cell allocation loop, skip cells with `raw_N === 0 AND no DiffusionTrace in last 90 days`. Existing logic at line 79-80 already iterates only 3 traded cap classes — extend that pattern
    5. **Shadow A/B** wiring: wrap recompute logic with `runWithShadow('hierarchical-pooling', oldRecompute, newRecompute, FEATURES.hierarchical_pooling_mode)` — old path = no pooling (writes parent_α=null, parent_β=null), new path = pooled. NOTE: this captures per-cron-run latency_delta only; convergence-speed metric is computed by audit script (Task 8) and bridged via 19-Z-03 STRATEGIES['hierarchical-pooling']
  </action>
  <acceptance_criteria>
    - `grep -q "hierarchicalPooledPosterior" src/app/api/cron/learn/route.ts`
    - `grep -q "parent_alpha\|parent_beta\|shrinkage_strength" src/app/api/cron/learn/route.ts`
    - `grep -q "runWithShadow.*hierarchical-pooling" src/app/api/cron/learn/route.ts`
    - Cron writes parent_alpha but does NOT overwrite alpha/beta with pooled values: `grep -B 5 -A 15 "parent_alpha" src/app/api/cron/learn/route.ts | grep -v "alpha_pooled" || true` — pooled values not assigned to alpha column
    - Pruning condition exists: `grep -q "90.*day\|raw_N.*0" src/app/api/cron/learn/route.ts`
  </acceptance_criteria>
  <automated>grep -q "hierarchicalPooledPosterior" src/app/api/cron/learn/route.ts && grep -q "parent_alpha" src/app/api/cron/learn/route.ts && grep -q "runWithShadow" src/app/api/cron/learn/route.ts</automated>
  <done>Cron wired; safe rollout pattern enforced; pruning live; per-request shadow captures latency_delta only</done>
</task>

<task type="auto" id="19-A-07-05">
  <name>Task 5: Surface α_pooled at READ time in engine-context.ts</name>
  <read_first>
    - src/lib/engine-context.ts (existing posterior surface)
    - src/lib/features.ts
  </read_first>
  <action>
    Edit `src/lib/engine-context.ts`:
    - When loading LearnedPattern row, ALSO read parent_alpha + parent_beta + shrinkage_strength
    - When `FEATURES.hierarchical_pooling_enabled === true` AND parent_alpha != null, compute:
      ```typescript
      const n = pattern.alpha + pattern.beta;
      const alpha_pooled = (n * pattern.alpha + pattern.shrinkage_strength * pattern.parent_alpha) / (n + pattern.shrinkage_strength);
      const beta_pooled = (n * pattern.beta + pattern.shrinkage_strength * pattern.parent_beta) / (n + pattern.shrinkage_strength);
      // surface posterior_mean = alpha_pooled / (alpha_pooled + beta_pooled)
      ```
    - When flag off OR parent_alpha null, surface local α/β unchanged (fallback)
    - This is the "α_pooled at READ time, NEVER overwrite local α/β in cron" pattern from RESEARCH Pitfall 3
  </action>
  <acceptance_criteria>
    - `grep -q "alpha_pooled\|α_pooled" src/lib/engine-context.ts`
    - `grep -q "FEATURES.hierarchical_pooling_enabled\|hierarchical_pooling_mode" src/lib/engine-context.ts`
    - `grep -q "parent_alpha" src/lib/engine-context.ts`
  </acceptance_criteria>
  <automated>grep -q "alpha_pooled\|parent_alpha" src/lib/engine-context.ts</automated>
  <done>READ-time pooled posterior implemented per safe rollout pattern</done>
</task>

<task type="auto" id="19-A-07-06">
  <name>Task 6: Live-DB integration test + pruning test + e2e /insights</name>
  <read_first>
    - tests/integration/learn.ess.live.test.ts (Phase 18 reference)
  </read_first>
  <action>
    Create:
    1. `tests/integration/hierarchical-pooling.live.test.ts` — seed cells in same (signal_class, cap_class) group; run cron; assert parent_alpha + parent_beta populated; assert ≥80% of allocated cells have parent_alpha ≠ null (CORE-ML-13 acceptance)
    2. `tests/integration/pruning.live.test.ts` — seed cells with raw_N=0 + last_observed > 90d ago; run cron; assert these cells NOT allocated rows (CORE-ML-14)
    3. `tests/e2e/insights-pooling.spec.ts` — Playwright; navigate to /insights; assert per-cell CI widths visible; sparse cells (low ESS) wider, rich cells (high ESS) tighter (CORE-ML-13 visual check)
  </action>
  <acceptance_criteria>
    - All 3 test files exist
    - Integration tests pass against live Neon
    - E2E test passes with screenshot saved
  </acceptance_criteria>
  <automated>npx vitest run --config vitest.integration.config.ts tests/integration/hierarchical-pooling.live.test.ts tests/integration/pruning.live.test.ts</automated>
  <done>CORE-ML-13 + CORE-ML-14 acceptance verified</done>
</task>

<task type="auto" id="19-A-07-07">
  <name>Task 7: Implement scripts/hierarchical-sweep-report.ts (CORE-ML-12)</name>
  <read_first>
    - .planning/REQUIREMENTS.md (CORE-ML-12 — 2-level vs 3-level sweep)
    - scripts/calibration-report.ts (pattern reference — also writes to /tmp)
    - CLAUDE.md ("Never store generated research artifacts inside the repository")
  </read_first>
  <action>
    Create `scripts/hierarchical-sweep-report.ts`:
    - Run no-pool / 2-level pool / 3-level pool on existing LearnedPattern data (or simulated data)
    - 2-level: group by (signal_class, cap_class); 3-level: add (horizon, regime) child layer
    - Compute for each: median convergence to ESS=30, OOS Brier, calibration p-value
    - Output `/tmp/calibration-reports/hierarchical-sweep-<date>.md` with comparison table + verdict on chosen structure (NOT committed to repo per CLAUDE.md)
    - This produces the CORE-ML-12 documentation artifact

    Add `"hierarchical-sweep-report": "tsx scripts/hierarchical-sweep-report.ts"` to package.json.
  </action>
  <acceptance_criteria>
    - File exists
    - `grep -q "/tmp/calibration-reports" scripts/hierarchical-sweep-report.ts`
    - `grep -q '"hierarchical-sweep-report"' package.json`
    - Manual run produces report under /tmp
  </acceptance_criteria>
  <automated>test -f scripts/hierarchical-sweep-report.ts && grep -q "hierarchical-sweep-report" package.json && grep -q "/tmp/calibration-reports" scripts/hierarchical-sweep-report.ts</automated>
  <done>CORE-ML-12 documentation artifact produced (in /tmp, not repo)</done>
</task>

<task type="auto" id="19-A-07-08">
  <name>Task 8: Implement scripts/hierarchical-pooling-audit.ts (longitudinal verdict input)</name>
  <action>
    Create `scripts/hierarchical-pooling-audit.ts` — this is the BRIDGE between per-request shadow and longitudinal convergence-speed metric (formalized in 19-Z-03 STRATEGIES['hierarchical-pooling']):

    - Read last 90 days of resolved DiffusionTrace + PriceOutcome from Neon
    - Group by cell; compute median outcomes-to-ESS-30 for cells where pool was applied vs cells where pool was off (or simulated control via re-running the no-pool path against the same trace history)
    - Output JSON to `shadow-reports/19-A-07-audit.json` with EXACT schema:
      ```json
      {
        "pooled_median": <number>,
        "control_median": <number>,
        "speedup": <(control_median - pooled_median) / control_median>,
        "n_pooled": <int>,
        "n_control": <int>,
        "audited_at": "<iso>"
      }
      ```
    - 19-Z-03 STRATEGIES['hierarchical-pooling'] reads this file's `speedup` field as `quality_delta` for the verdict.

    Add `"hierarchical-pooling-audit": "tsx scripts/hierarchical-pooling-audit.ts"` to package.json.

    Note: shadow-reports/ is at the repo root (per 19-Z-03 — it's a small operator-facing artifacts dir). The audit JSON IS committed since it's the verdict input the operator inspects to decide cutover. CLAUDE.md "no generated research artifacts" applies to research-output PDFs/reports per @CLAUDE.md, not shadow verdict artifacts.
  </action>
  <acceptance_criteria>
    - File exists; produces valid JSON output at shadow-reports/19-A-07-audit.json
    - JSON contains required fields: pooled_median, control_median, speedup, n_pooled, n_control, audited_at
    - `grep -q '"hierarchical-pooling-audit"' package.json`
  </acceptance_criteria>
  <automated>test -f scripts/hierarchical-pooling-audit.ts && grep -q "hierarchical-pooling-audit" package.json && grep -q "speedup" scripts/hierarchical-pooling-audit.ts</automated>
  <done>Longitudinal verdict input script ready; bridges to 19-Z-03 STRATEGIES['hierarchical-pooling']</done>
</task>

<task type="auto" id="19-A-07-09">
  <name>Task 9: Initial commit (flag off) + unit suite green</name>
  <read_first>
    - tests/learning.hyperparameters.test.ts (D-54 sanity)
  </read_first>
  <action>
    Run full unit + integration suite. Stage all modified files. Commit:
    ```
    feat(19-a-07): hierarchical Bayesian pooling — empirical Bayes (CORE-ML-11..14)

    Absorbed from original v2.0 P19. Pure function hierarchicalPooledPosterior
    in learning.ts pools α/β across cells in same (signal_class, cap_class)
    group via method-of-moments. λ ∈ [0.5, 50]. Cold-start: group n<5 → flat prior.

    Cron writes parent_alpha/parent_beta/shrinkage_strength but does NOT
    overwrite local α/β (RESEARCH Pitfall 3 safe rollout pattern).

    engine-context.ts computes α_pooled at READ time when
    FEATURE_HIERARCHICAL_POOLING enabled (pooled view; local α/β remain
    canonical).

    Cell-space pruning: cells with raw_N=0 AND last observation > 90d ago
    NOT allocated (CORE-ML-14 lake-of-cells defense).

    Sweep report (scripts/hierarchical-sweep-report.ts) backs CORE-ML-12.
    Convergence test confirms ≥30% faster median on n_local<10 cells.

    Per-request runWithShadow('hierarchical-pooling') captures latency_delta;
    longitudinal convergence-speed delta computed by
    scripts/hierarchical-pooling-audit.ts → shadow-reports/19-A-07-audit.json.
    19-Z-03 STRATEGIES['hierarchical-pooling'] bridges them in the verdict CLI.

    Flag default off — shadow A/B follows.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `npx vitest run` exits 0
    - Phase 18 sanity test still green
    - `git log -1 --pretty=%s` matches "feat(19-a-07)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-a-07"</automated>
  <done>Initial commit landed (flag off); ready for shadow lifecycle</done>
</task>

<task type="auto" id="19-A-07-10">
  <name>Task 10: Shadow A/B → audit → verdict → cutover → rollback hatch → flag removal</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-Z-03-SUMMARY.md (shadow lifecycle + STRATEGIES['hierarchical-pooling'] bridging)
  </read_first>
  <action>
    Multi-step shadow lifecycle (each step is an autonomous gate):

    **Step a) Flip to shadow:**
    `vercel env add FEATURE_HIERARCHICAL_POOLING shadow production`
    Trigger redeploy; verify cron route imports new env value.

    **Step b) Drive workload (3-7 days OR ≥200 ShadowComparison rows for path_name='hierarchical-pooling'):**
    Daily learn cron runs naturally. Monitor via `prisma.shadowComparison.count({where: {path_name: 'hierarchical-pooling'}})`. These rows capture per-cron-run latency_delta only.

    **Step c) Run longitudinal audit (provides the quality_delta input):**
    `npm run hierarchical-pooling-audit` → writes `shadow-reports/19-A-07-audit.json` `{ speedup, pooled_median, control_median, ... }`. This is the convergence-speed metric the verdict needs.

    **Step d) Run verdict (bridges per-request shadow + audit):**
    `npm run shadow-verdict 19-A-07`
    The 19-Z-03 STRATEGIES['hierarchical-pooling'] entry reads:
    - latency_p50/p95 from ShadowComparison rows (per-request)
    - quality_delta = audit.speedup from shadow-reports/19-A-07-audit.json (longitudinal)
    Verdict PASS requires:
    - convergence speedup ≥ 0.30 (CORE-ML-11..14 acceptance via audit.speedup → quality_delta)
    - latency non-regression (per-cron from ShadowComparison)
    - disagreement < 5% (output_disagreement_rate=0 since pooling is additive at READ time; per-request output unchanged)
    - OOS Brier non-regression (separately verified by 19-A-06 calibration harness)

    **Step e) PASS → cutover PR:**
    Open PR that:
    - Sets `FEATURE_HIERARCHICAL_POOLING=on` default in `.env.example` and Vercel prod env
    - Removes the `runWithShadow` wrapper around recomputeAllCells (replaces with direct call to new path)
    - Deletes the `oldRecompute` (no-pool) helper if it's not also reused as fallback (per D-32 it CAN be reused as a permanent fallback when group n<5; in that case, KEEP it but rename to `flatPriorRecompute` to make permanence explicit)
    - Registers grep pattern in `scripts/model-card-grep-patterns.json` for any pre-cutover sentinel string

    **Step f) 7-day rollback hatch:**
    Monitor `RollbackLog` daily. If any row with `feature_flag='FEATURE_HIERARCHICAL_POOLING'`, file failure plan; else proceed.

    **Step g) Flag-removal PR (after 7d clean):**
    Remove `'hierarchical_pooling'` from `FLAG_NAMES` in src/lib/features.ts. Remove FEATURE_HIERARCHICAL_POOLING from `.env.example`. Verify `npm run model-card-status` reports `flag-removed-hierarchical_pooling: ok=true`.

    **Step h) Final verification:**
    `npm test && npm run test:integration && npm run test:e2e && npm run model-card-status` — all green.
  </action>
  <acceptance_criteria>
    - `shadow-reports/19-A-07-audit.json` exists with `speedup` field ≥ 0.30
    - `shadow-reports/19-A-07.json` contains `"verdict": {"result": "PASS"}` AND `metrics.quality_delta >= 0.30`
    - Cutover PR merged; FEATURE_HIERARCHICAL_POOLING removed from features.ts post-7d
    - `npm run model-card-status` returns `pooled: ok=true` (≥80% of cells have parent_alpha)
    - All 5 Hard Cleanup Gate conditions satisfied
  </acceptance_criteria>
  <automated>test -f shadow-reports/19-A-07-audit.json && test -f shadow-reports/19-A-07.json && grep -q '"PASS"' shadow-reports/19-A-07.json && ! grep -q "hierarchical_pooling" src/lib/features.ts</automated>
  <done>Shadow lifecycle complete; flag removed; CORE-ML-11..14 acceptance verified in production via per-request shadow + longitudinal audit bridge</done>
</task>

</tasks>

<verification>
- [ ] hierarchicalPooledPosterior pure function (10 unit tests pass)
- [ ] Convergence speedup ≥30% on n_local<10 (CORE-ML-11..14 acceptance test passes)
- [ ] Cron writes parent_alpha/parent_beta/shrinkage_strength per cell
- [ ] engine-context computes α_pooled at READ time
- [ ] Cell-space pruning enforced (CORE-ML-14)
- [ ] /insights renders differential CI widths (CORE-ML-13 e2e)
- [ ] 2-level vs 3-level sweep report committed (CORE-ML-12, output to /tmp)
- [ ] hierarchical-pooling-audit.ts produces shadow-reports/19-A-07-audit.json with `speedup` field
- [ ] 19-Z-03 STRATEGIES['hierarchical-pooling'] reads audit JSON's speedup as quality_delta (per-request shadow → longitudinal verdict bridge documented)
- [ ] Shadow verdict PASS → cutover → 7d hatch clean → flag removed
- [ ] `npm run model-card-status` shows `pooled: ok=true`
</verification>

<success_criteria>
1. CORE-ML-11: cron computes pooled (parent_alpha, parent_beta) per parent group ✓
2. CORE-ML-12: 2-level vs 3-level sweep documented in /tmp/calibration-reports/hierarchical-sweep-<date>.md ✓
3. CORE-ML-13: differential CIs visible in /insights (sparse wider, rich tighter, pooled tightens both) ✓
4. CORE-ML-14: cells with raw_N=0 + idle 90d not allocated ✓
5. ≥30% faster median convergence on n_local<10 cells (preserved P19 acceptance) ✓
6. Hard Cleanup Gate satisfied: PASS verdict + cutover + 7d clean + flag removed
7. Per-request shadow ↔ longitudinal audit bridging is explicit (audit JSON + STRATEGIES['hierarchical-pooling'])
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-A-07-SUMMARY.md` documenting:
- All 4 CORE-ML acceptance criteria with evidence (test names + SQL queries + Playwright screenshots)
- Shadow verdict PASS metrics (latency from ShadowComparison rows; quality_delta from audit.speedup)
- Cutover PR + flag-removal PR links
- 7d post-cutover RollbackLog: empty
- Confirmation that audit JSON ↔ verdict CLI bridge worked end-to-end
</output>
</content>
</invoke>