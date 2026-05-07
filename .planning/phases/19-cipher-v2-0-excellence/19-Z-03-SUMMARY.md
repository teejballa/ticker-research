---
phase: 19
plan: 19-Z-03
subsystem: shadow-infrastructure
tags: [shadow-ab, verdict, cli, phase-19, wave-z, pure-function, td-prevention]
dependency_graph:
  requires:
    - 19-Z-01 (FeatureMode type 'off' | 'shadow' | 'on')
    - 19-Z-02 (prisma.shadowComparison table)
  provides:
    - "src/lib/shadow/shadow-runner.ts → runWithShadow<T>(pathName, oldFn, newFn, mode, ctx)"
    - "src/lib/shadow/verdict.ts → verdict(metrics): {result, reasons}"
    - "scripts/shadow-verdict.ts → CLI: npm run shadow-verdict <plan-id>"
    - "shadow-reports/<plan-id>.json artifact contract"
    - "PASS/FAIL/HOLD exit-code contract (0/1/2)"
  affects:
    - "All Wave A plans (19-A-01..07) — quant primitives can shadow vs canonical"
    - "All Wave B plans (19-B-01..08) — data layer cutovers shadow before atomic flip"
    - "All Wave C plans (19-C-01..11) — sentiment + reasoning paths shadow before flip"
    - "/gsd-execute-phase orchestrator — reads shadow-reports/<plan>.json to gate plan completion (D-07)"
tech-stack:
  added: []
  patterns:
    - "setImmediate() background discipline — old returns first, new runs after-the-fact (D-14)"
    - "vi.hoisted() pattern for vi.mock factories that reference top-level mocks"
    - "Per-plan STRATEGIES registry — plug-in disagreement + quality_delta math per output type"
    - "Audit-JSON bridge for longitudinal metrics (19-A-07 hierarchical-pooling speedup)"
    - "Recursive sanitize() on output graph — strips embedded user:pass@ from URL strings (V7 ASVS)"
key-files:
  created:
    - src/lib/shadow/shadow-runner.ts
    - scripts/shadow-verdict.ts
    - tests/lib/shadow/shadow-runner.test.ts (already in tree from Task 3)
  modified:
    - tests/lib/shadow/shadow-runner.test.ts (vi.hoisted fix)
    - package.json (scripts."shadow-verdict")
    - .gitignore (shadow-reports/)
  pre-existing:
    - src/lib/shadow/verdict.ts (Task 2 committed before this session as 3b0f709)
    - tests/lib/shadow/verdict.test.ts (Task 1 committed as b85c6b3)
decisions:
  - "Cost-regression rule is RATIO-based per D-12 — verdict() computes cost_new / cost_old internally and FAILs when ratio > 1.5. Skips rule when either cost is null OR old <= 0 (cannot compute ratio safely). VerdictMetrics has separate cost_old_baseline_usd_per_request AND cost_new_usd_per_request fields, NOT a single delta."
  - "STRATEGIES['hierarchical-pooling'] is the audit-JSON bridge: convergence-speed is longitudinal, not per-request. ShadowComparison rows track latency_delta only. Quality_delta read from shadow-reports/19-A-07-audit.json `speedup` field (produced separately by scripts/hierarchical-pooling-audit.ts in Plan 19-A-07)."
  - "shadow-verdict CLI uses local PrismaClient with dotenv.config({path:'.env.local'}) loaded BEFORE PrismaClient construction — matches scripts/tune-lambda.ts pattern. The src/lib/db.ts singleton evaluates DATABASE_URL at module-load, before dotenv can populate it from CLI invocation."
  - "Persistence errors in shadow mode are logged but never retry — old result already returned to user; ShadowComparison row loss is acceptable degradation."
  - "Default strategy = JSON deep-equal-rate. Plan-specific strategies override per RESEARCH §Pitfall 5: source-package-merge=Jaccard, finsentllm-ensemble=1-Pearson, citations-v2=URL-coverage, model-router=decision-agreement."
  - "Used npx tsx (not direct tsx) in package.json scripts — tsx is not in devDependencies but resolves through npx on demand. Matches the convention used elsewhere in the project."
metrics:
  duration: ~25min
  completed_date: 2026-05-07
  tasks_completed: 7
  files_created: 2
  files_modified: 3
  vitest_pass_count: 437
  vitest_skip_count: 1
  vitest_todo_count: 3
---

# Phase 19 Plan Z-03: shadow-runner + shadow-verdict CLI Summary

Shipped the canonical shadow A/B harness primitives — `runWithShadow<T>()`, `verdict()`, and the operator-facing `npm run shadow-verdict <plan-id>` CLI — that drive every Phase 19 cutover lifecycle (D-05). Wave A/B/C plans now have a stable, type-safe shadow + verdict + report contract.

## What was built

### 1. `runWithShadow<T>()` generic harness (src/lib/shadow/shadow-runner.ts)

Three-mode contract per `FeatureMode` (D-09):

| Mode     | Behavior |
|----------|----------|
| `off`    | Returns `oldFn()`; `newFn` never called |
| `on`     | Returns `newFn()`; `oldFn` never called |
| `shadow` | Returns `oldFn()` FIRST; `newFn` runs in `setImmediate` background; persists `ShadowComparison` row |

**Critical invariants enforced:**
- **D-14:** Shadow-mode `newFn` runs in `setImmediate()` AFTER `oldFn` resolves the user request. New-path latency is measured but never injected into the user-facing path.
- **T-19-Z-03-02:** New-path errors are caught + logged + persisted as `new_output_json={error: <msg>}`, NEVER re-thrown to caller.
- **T-19-Z-03-03:** Output graph recursively sanitized before persist — `https?://user:pass@host` patterns rewritten to `https?://***@host` (V7 ASVS).
- Persistence errors logged but not retried (old result already returned; row loss is acceptable degradation).

### 2. `verdict()` pure function (src/lib/shadow/verdict.ts)

Implements D-11/12/13 thresholds as branchless pure-function math:

| Rule | D-XX | Trigger | Reason in output |
|------|------|---------|------------------|
| Quality regression | D-12 | `quality_measurable && quality_delta < 0` | `"quality regressed: delta=…"` |
| Latency p95 regression | D-12 | `new_p95 / old_p95 ≥ 2.0` | `"latency p95 regression …× old"` |
| Cost regression (RATIO) | D-12 | `cost_new / cost_old > 1.5` (skip if either null OR old ≤ 0) | `"cost regression: new=… old=… ratio=…× > 1.5×"` |
| Disagreement | D-11 | `output_disagreement_rate ≥ 0.05` | `"disagreement …% ≥ 5%"` |
| HOLD | D-13 | `n_rows < 200 && !quality_measurable` | `"only … rows … quality unmeasurable — extend window"` |
| PASS | D-11 | None of the above | `"all gates green"` |

**Cost rule specifics (iteration-1 fix from plan-checker):**
- `VerdictMetrics` carries SEPARATE `cost_old_baseline_usd_per_request` AND `cost_new_usd_per_request` fields (not a single delta).
- Ratio computed internally: `costRatio = cost_new / cost_old`; FAIL when ratio > 1.5.
- Rule skipped (no FAIL on cost) when EITHER cost is null OR `cost_old ≤ 0`.
- Boundary: `ratio === 1.5` exactly is PASS (rule is strict `>`).

### 3. `npm run shadow-verdict <plan-id>` CLI (scripts/shadow-verdict.ts)

Operator-facing verdict gate. Pipeline:

1. Map `plan-id` → `path_name` via `PLAN_TO_PATH` (12 entries: 19-A-07 + 19-B-06/07/08 + 19-C-02..05/07..10). Plan IDs not in map fall through to using the plan-id as the path_name (handy for `noop-plan` smoke test).
2. Query `prisma.shadowComparison.findMany({ where: { path_name }, take: 5000, orderBy: created_at desc })`.
3. Compute aggregates:
   - `latency_p50/p95` — percentile from arrays of `old_latency_ms` / `new_latency_ms`.
   - `cost_old_baseline_usd_per_request` — average of non-null `old_cost_usd` rows.
   - `cost_new_usd_per_request` — average of non-null `new_cost_usd` rows.
4. Run per-plan `STRATEGIES[path_name]` (or `defaultStrategy`) for `output_disagreement_rate` + `quality_delta` + `quality_measurable`.
5. Call `verdict(metrics)`.
6. Write `shadow-reports/<plan-id>.json` with `{plan_id, path_name, verdict, reasons, metrics, timestamp}`.
7. Exit `0` (PASS) / `1` (FAIL) / `2` (HOLD) / `3` (operator error: missing arg, DB unreachable).

### 4. Per-plan STRATEGIES registry

Maps `path_name` → `(rows, planId) → StrategyResult`:

| path_name | Strategy | Source (RESEARCH §Pitfall 5) |
|-----------|----------|------------------------------|
| `source-package-merge` | Field-fill-rate Jaccard distance per row | row 1 |
| `finsentllm-ensemble` | `1 - Pearson(old_score, new_score)` | row 2 |
| `citations-v2` | URL coverage delta (old URLs ⊂ new URLs) | row 3 |
| `cove-two-pass` | JSON deep-equal-rate (default) | row 4 |
| `model-router` | Decision agreement rate on `decision` field | row 5 |
| `hierarchical-pooling` | **AUDIT-JSON BRIDGE** — reads `shadow-reports/19-A-07-audit.json` `speedup` as `quality_delta`; `output_disagreement_rate=0` (pooling is additive, per-request output unchanged) | row 6 |
| `contradiction-detector` | JSON deep-equal-rate (default) | — |
| `stocktwits-reputation-weighted` | JSON deep-equal-rate (default) | — |
| `options-term-structure` | JSON deep-equal-rate (default) | — |
| `community-supplemental` | JSON deep-equal-rate (default) | — |
| `runtime-cache` | JSON deep-equal-rate (default) | — |
| `rollout-driver` | JSON deep-equal-rate (default) | — |

**The 19-A-07 audit-JSON bridge is the explicit accommodation for longitudinal vs per-request metric asymmetry:** convergence-speed (median number of outcomes for a cell to leave EXPLORATORY at ESS≥30) is a *longitudinal* property of the learning engine, not a per-request property of any single cron run. ShadowComparison rows therefore track only `latency_delta` for hierarchical pooling; the actual quality signal (`speedup`) is computed by `scripts/hierarchical-pooling-audit.ts` (deliverable of Plan 19-A-07) and persisted separately to `shadow-reports/19-A-07-audit.json`. The CLI reads that audit file and surfaces `speedup` as `quality_delta` so verdict() can score it.

### 5. Test suite (≥23 tests)

| File | Tests | Status |
|------|-------|--------|
| `tests/lib/shadow/verdict.test.ts` | 16 | ✅ all GREEN |
| `tests/lib/shadow/shadow-runner.test.ts` | 7 | ✅ all GREEN |

Verdict tests cover the full D-11/12/13 truth table including:
- Test 5: `cost_old=0.01, cost_new=0.016 → ratio=1.6× → FAIL` (the explicit iteration-1 example)
- Test 5b: `ratio=1.5 exactly → PASS` (boundary, rule is strictly `>`)
- Test 5c: `both costs null → cost rule SKIPPED → PASS` (no false FAIL)
- Test 5d: `cost_old=0, cost_new=0.5 → cost rule SKIPPED → PASS` (cannot compute ratio, do not gate)
- Test 9: `latency p95 ratio=2.0 exactly → FAIL` (boundary, rule is `≥`)
- Test 13: multiple FAILs aggregated in reasons array

Shadow-runner tests cover the 3-mode contract, error swallowing, sanitization, and ctx propagation.

## Verification

| Gate | Result |
|------|--------|
| `npx vitest run` | ✅ 437 passed, 1 skipped, 3 todo, 0 failed |
| `npx vitest run tests/lib/shadow/verdict.test.ts` | ✅ 16/16 |
| `npx vitest run tests/lib/shadow/shadow-runner.test.ts` | ✅ 7/7 |
| Plan 18-10 sanity (`learning.hyperparameters.test.ts`) | ✅ 5/5 — `nyquist_compliant: true` preserved |
| `npm run shadow-verdict noop-plan` smoke test | ✅ exit 2 (HOLD) + writes `shadow-reports/noop-plan.json` |
| `cat shadow-reports/noop-plan.json` | ✅ valid JSON with `verdict='HOLD'`, `n_rows=0`, full metrics object |
| `git check-ignore shadow-reports/noop-plan.json` | ✅ ignored (per Task 7 note: do NOT commit shadow reports) |
| `grep -q "PLAN_TO_PATH" scripts/shadow-verdict.ts` | ✅ 12 entries |
| `grep -q "speedup\|19-A-07-audit" scripts/shadow-verdict.ts` | ✅ audit-JSON bridge present |
| `grep -q "VERDICT_THRESHOLDS\|costRatio\|cost_new.*cost_old" src/lib/shadow/verdict.ts` | ✅ ratio-based cost rule |
| `grep -q "setImmediate\|sanitize" src/lib/shadow/shadow-runner.ts` | ✅ background-isolation + URL sanitizer |

## Commits (chronological)

| Hash | Type | Subject |
|------|------|---------|
| `b85c6b3` | test | add failing tests for verdict() pure function (Task 1) |
| `3b0f709` | feat | implement verdict() pure function (D-11/12/13) (Task 2) |
| `dae43bb` | test | add failing tests for runWithShadow<T>() harness (Task 3) |
| `77c38c1` | feat | implement runWithShadow<T>() generic shadow harness (Task 4) |
| `97b81cc` | feat | shadow-verdict CLI with per-plan strategy registry (Task 5) |
| `c85d9d5` | chore | register npm shadow-verdict script + gitignore reports (Task 6) |

(Note: Tasks 1–3 were committed before this session began as part of an earlier execution attempt; Tasks 4–6 were committed during this session.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] vi.mock factory hoisting issue in shadow-runner.test.ts**

- **Found during:** Task 4 (running `npx vitest run tests/lib/shadow/shadow-runner.test.ts`)
- **Issue:** The pre-existing test file used `const mockCreate = vi.fn()` followed by `vi.mock('@/lib/db', () => ({...}))` referencing `mockCreate`. Vitest hoists `vi.mock` calls to the top of the file (before any top-level `const`), so `mockCreate` was undefined when the factory ran, producing `ReferenceError: Cannot access 'mockCreate' before initialization`.
- **Fix:** Wrapped `mockCreate` in `vi.hoisted(() => ({ mockCreate: vi.fn().mockResolvedValue({}) }))` — `vi.hoisted` ensures the mock is created BEFORE the hoisted `vi.mock` factory runs.
- **Verification:** All 7 tests pass after the fix.
- **Files modified:** `tests/lib/shadow/shadow-runner.test.ts`
- **Commit:** `77c38c1`

**2. [Rule 3 — Blocking] tsx not directly invokable in package.json scripts**

- **Found during:** Task 6 (smoke test `npm run shadow-verdict noop-plan`)
- **Issue:** `package.json` initially registered `"shadow-verdict": "tsx scripts/shadow-verdict.ts"`, but `tsx` is not bundled into `node_modules/.bin/`. Direct invocation produced `sh: tsx: command not found` (exit 127).
- **Fix:** Changed script to `"shadow-verdict": "npx tsx scripts/shadow-verdict.ts"`. `npx` resolves `tsx@4.21.0` on demand without adding it to `devDependencies`. The shebang `#!/usr/bin/env tsx` in `scripts/shadow-verdict.ts` (matching `scripts/tune-lambda.ts` convention) remains harmless.
- **Verification:** `npm run shadow-verdict noop-plan` exits 2 with full HOLD verdict reasoning + JSON report written.
- **Files modified:** `package.json`
- **Commit:** `c85d9d5`

**3. [Rule 3 — Blocking] shadow-reports/ not gitignored**

- **Found during:** Task 6 (after smoke test produced `shadow-reports/noop-plan.json`)
- **Issue:** Task 7's action note explicitly said "do NOT commit `shadow-reports/.gitkeep`", and `shadow-reports/` is conceptually a runtime-output directory like `playwright-report/`. The `.gitignore` file did not have a rule for it.
- **Fix:** Added `shadow-reports/` to `.gitignore` under a "Phase 19 shadow A/B verdict artifacts (runtime output, never commit)" comment block.
- **Verification:** `git check-ignore shadow-reports/noop-plan.json` exits 0.
- **Files modified:** `.gitignore`
- **Commit:** `c85d9d5`

## Authentication gates

None — `DATABASE_URL` already in `.env.local`; tsx/dotenv handle env loading transparently.

## Hard Cleanup Gate (per universal_preamble)

The standard 5-condition Hard Cleanup Gate is **N/A** for this plan because the plan IS the shadow infrastructure (per PLAN.md universal_preamble: gates 1-4 marked N/A). The single applicable gate — "vitest green AND smoke test of `npm run shadow-verdict noop-plan` produces a verdict file" — is verified above.

## What unblocks

**All Wave A/B/C plans with `shadow_required: true`** can now:
1. Wire their candidate code path behind a feature flag from 19-Z-01 using `runWithShadow(pathName, oldFn, newFn, flagMode, ctx)`.
2. After accumulating `≥200` ShadowComparison rows (or 3-7 days), run `npm run shadow-verdict <plan-id>` to receive a deterministic PASS/FAIL/HOLD verdict.
3. The orchestrator (`/gsd-execute-phase`) reads `shadow-reports/<plan-id>.json` to gate plan completion per D-07.

**Plan 19-Z-04 (rollback hatch)** can now consume the verdict artifact contract and the `RollbackLog` table from 19-Z-02 to implement the 7-day rollback window.

**Plan 19-A-07 (hierarchical pooling)** has a defined contract for surfacing its longitudinal `speedup` metric to the verdict gate via `shadow-reports/19-A-07-audit.json`.

## Self-Check: PASSED

- ✅ FOUND: `src/lib/shadow/shadow-runner.ts`
- ✅ FOUND: `src/lib/shadow/verdict.ts` (pre-existing from Task 2 commit `3b0f709`)
- ✅ FOUND: `scripts/shadow-verdict.ts`
- ✅ FOUND: `tests/lib/shadow/verdict.test.ts` (16 tests, all green)
- ✅ FOUND: `tests/lib/shadow/shadow-runner.test.ts` (7 tests, all green)
- ✅ FOUND: `package.json` `"shadow-verdict"` script
- ✅ FOUND: `.gitignore` `shadow-reports/` rule
- ✅ FOUND: commit `77c38c1` (Task 4)
- ✅ FOUND: commit `97b81cc` (Task 5)
- ✅ FOUND: commit `c85d9d5` (Task 6)
- ✅ FOUND: pre-existing commits `b85c6b3` (Task 1), `3b0f709` (Task 2), `dae43bb` (Task 3)
