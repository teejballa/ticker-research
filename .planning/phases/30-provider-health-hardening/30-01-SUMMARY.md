---
phase: 30
plan: 01
subsystem: provider-health-hardening
tags: [test-scaffolding, wave-0, nyquist, circuit-breaker, cost-anomaly, upstash-mock]
dependency_graph:
  requires: []
  provides:
    - "In-memory Upstash mock module reusable by every Phase-30 test"
    - "RED-state Vitest shells for D-04/D-05/D-06/D-07/D-08/D-09/D-12/D-13/D-14/D-15/D-17/D-23/D-24"
    - "@ts-expect-error contract marker for the D-18 ProviderHealthAlert migration in Plan 30-02"
  affects:
    - "Plans 30-02, 30-03, 30-04 will replace .todo entries with assertion bodies"
tech_stack:
  added: []
  patterns:
    - "vi.mock('@/lib/data/cache/upstash', async () => import('@/lib/data/cache/__mocks__/upstash')) — substitutes the real Upstash REST client with an in-memory deterministic store"
    - "beforeEach(__resetMockRedis) — clears state between tests so the singleton mock doesn't leak"
    - "__advanceMockTime(ms) instead of vitest fake-timers — async REST paths require module-level mockNow() offset"
    - "Lazy prisma import inside afterAll — integration test files load even when DATABASE_URL is unset during npm test discovery"
key_files:
  created:
    - "src/lib/data/cache/__mocks__/upstash.ts"
    - "tests/unit/circuit-breaker.unit.test.ts"
    - "tests/integration/circuit-breaker.integration.test.ts"
    - "tests/integration/cost-anomaly-breaker.integration.test.ts"
    - "tests/integration/done-gate-sql.integration.test.ts"
    - "tests/unit/source-package.fallback.unit.test.ts"
    - "tests/unit/gemini-analysis.model-pin.unit.test.ts"
    - "tests/integration/provider-error-budget.cron.integration.test.ts"
    - "tests/integration/sentiment-scan.cron.integration.test.ts"
    - "tests/integration/lightweight-community-scan.breaker.integration.test.ts"
  modified: []
decisions:
  - "Mock surface mirrors @upstash/redis directly (get/set/del/incr/expire/lpush/ltrim/lrange) rather than wrapping the project's cached() helper — Phase-30 breaker code calls the raw client methods, so the mock must expose them at the same level"
  - "Singleton MockRedis returned by getRedis() — real getRedis() returns null when env vars are missing, but in tests we want a guaranteed in-memory client; tests that need the null branch can override per-call"
  - "Time-warp via __advanceMockTime(ms) rather than vitest fake-timers — Date.now() reads inside async REST paths don't always interact cleanly with fake-timers, and the D-06 / D-15 windows (30s, 1h) span async boundaries"
  - "NX option on set() returns null when the key exists, 'OK' when it does not — matches real Upstash semantics and supports the D-06 single-probe lock pattern"
  - "lpush prepends in argument order (last value becomes head when multi-pushed) — matches real Redis LPUSH and lets D-05 ring-buffer tests rely on lpush + ltrim 0 19 to maintain a 20-call window"
  - "Used lazy `import('@/lib/db')` inside afterAll() in the provider-error-budget integration file so the unit-test discovery pass can transform the file even when DATABASE_URL is unset"
  - "Kept the @ts-expect-error annotation on prisma.providerHealthAlert as a forward signal — its removal becomes part of Plan 30-02's verify step, signaling the D-18 migration has been applied"
metrics:
  duration_minutes: 12
  completed_date: "2026-05-14"
  tasks_executed: 3
  files_created: 10
  files_modified: 0
  commits: 3
---

# Phase 30 Plan 01: Wave 0 Test Scaffolding Summary

**One-liner:** In-memory Upstash mock + nine RED-state Vitest files covering D-04/D-05/D-06/D-07/D-08/D-09/D-12/D-13/D-14/D-15/D-17/D-23/D-24 so every Wave-1/2/3 plan can drop in assertion bodies without re-inventing test infrastructure.

## What Shipped

### Task 1: Shared in-memory Upstash mock — commit `378dcfc`

`src/lib/data/cache/__mocks__/upstash.ts` (248 LOC) exports:

- `MockRedis` class with `get / set (NX, ex) / del / incr / expire / lpush / ltrim / lrange` methods, all returning Promises to match the real REST client surface
- `getRedis()` returning a singleton MockRedis (never null — tests always want deterministic state)
- `__resetMockRedis()` for `beforeEach` lifecycle
- `__advanceMockTime(ms)` to step past the D-06 30s breaker window and D-15 1h cost-anomaly window without vitest fake-timers
- `__mockNow()` exposing the offset clock for assertion convenience
- `__resetUpstashClientForTests()` aliased to `__resetMockRedis` so callers of the real module's helper still resolve after vi.mock substitution
- `cached() / invalidate() / CacheOptions` mirroring the real module so any module under test that imports those names compiles cleanly when vi.mock is engaged

Lazy expiry: `get` reaps an expired entry and returns null on next access. Negative list indices supported by `lrange`/`ltrim` (real Redis semantics). NX option on `set` returns null when the key exists, `'OK'` otherwise.

### Task 2: Six RED-state Vitest files — commit `58b3d58`

| File | Decisions | Todo count |
|------|-----------|-----------:|
| `tests/unit/circuit-breaker.unit.test.ts` | D-04, D-05, D-07, D-08 | 12 |
| `tests/integration/circuit-breaker.integration.test.ts` | D-06 | 5 |
| `tests/integration/cost-anomaly-breaker.integration.test.ts` | D-15 (Amendment 2026-05-14) | 6 |
| `tests/integration/done-gate-sql.integration.test.ts` | D-24 | 6 |
| `tests/unit/source-package.fallback.unit.test.ts` | D-09 | 6 |
| `tests/unit/gemini-analysis.model-pin.unit.test.ts` | D-14 (Amendment 2026-05-14) | 6 |

Every file has a `// Phase: 30 — Provider Health Hardening` header comment and cites the D-XX decision IDs it covers. Each integration file installs `vi.mock('@/lib/data/cache/upstash', ...)` + `beforeEach(__resetMockRedis)` at top scope so Wave 2/3 implementations can replace `.todo` with assertion bodies without re-wiring mocks.

### Task 3: Three integration test files — commit `eb7d161`

| File | Decisions | Todo count |
|------|-----------|-----------:|
| `tests/integration/provider-error-budget.cron.integration.test.ts` | D-17 (+ forward D-18 dep) | 7 |
| `tests/integration/sentiment-scan.cron.integration.test.ts` | D-12, D-13 | 9 |
| `tests/integration/lightweight-community-scan.breaker.integration.test.ts` | D-23 | 5 |

The `provider-error-budget` file lazy-imports `prisma` inside `afterAll` so its module load succeeds without `DATABASE_URL` during the `npm test` discovery pass. A `@ts-expect-error — Phase 30 D-18 model lands in Plan 02` annotation marks the call site that will compile once the migration is applied — Wave 2's verify step asserts the annotation is removed.

## Verification

| Check | Result |
|-------|--------|
| All 10 files exist on disk | PASS |
| All 10 files contain `Phase: 30` or `Phase 30` header | PASS |
| `npx tsc --noEmit` (project-wide) | exits 0 |
| `npx tsc --noEmit src/lib/data/cache/__mocks__/upstash.ts` | exits 0 |
| `npm test -- --run` | 1570 passed, 27 todos (24 new + 3 pre-existing), 0 new failures |
| Custom config Vitest run on 6 integration files | 38 todos, 6 files skipped (all pending), exit 0 |
| `it.todo` counts vs acceptance minimums | All pass (12≥6, 5≥4, 6≥4, 6≥4, 6≥4, 6≥3, 7≥6, 9≥5, 5≥3) |
| `@ts-expect-error.*Phase 30 D-18` grep on provider-error-budget | 1 match (acceptance ≥1) |

## Deviations from Plan

**None — plan executed exactly as written.**

Three minor in-task adjustments that fall under "Rule 3: Auto-fix blocking issues" but did not require a deviation entry because each fix was within the documented contract of the task:

1. **Task 2 / circuit-breaker.unit.test.ts**: split the D-04 decision into its own `describe` block (separate from D-05's trip rule) for clarity. Total todo count went from the planner's "≥6" minimum to 12 — well over the threshold. No behavior added, just better organization.
2. **Task 3 / provider-error-budget**: deferred the `prisma` import from module scope into `afterAll` via `await import('@/lib/db')`. Reason: under `npm test` (the unit-discovery pass), vitest still transforms files even when they're excluded from execution, and `@/lib/db` throws at module load when `DATABASE_URL` is unset. The existing pattern at `tests/integration/provider-call-log.integration.test.ts` does eagerly import prisma, but those tests are only ever run via `npm run test:integration` which loads `.env.local`. For a Wave-0 RED-state scaffold this lazy pattern is more robust.
3. **Task 3 / provider-error-budget header comment**: reworded the description to avoid the literal token `@ts-expect-error` appearing at the start of a comment line (which TypeScript treats as an unused directive in the file header). The real annotation remains at the call site as required.

## Self-Check: PASSED

Created files verified:
- `src/lib/data/cache/__mocks__/upstash.ts` — FOUND
- `tests/unit/circuit-breaker.unit.test.ts` — FOUND
- `tests/integration/circuit-breaker.integration.test.ts` — FOUND
- `tests/integration/cost-anomaly-breaker.integration.test.ts` — FOUND
- `tests/integration/provider-error-budget.cron.integration.test.ts` — FOUND
- `tests/integration/sentiment-scan.cron.integration.test.ts` — FOUND
- `tests/integration/lightweight-community-scan.breaker.integration.test.ts` — FOUND
- `tests/integration/done-gate-sql.integration.test.ts` — FOUND
- `tests/unit/source-package.fallback.unit.test.ts` — FOUND
- `tests/unit/gemini-analysis.model-pin.unit.test.ts` — FOUND

Commits verified:
- `378dcfc` — FOUND (feat(30-01): in-memory Upstash mock)
- `58b3d58` — FOUND (test(30-01): RED scaffolds — breaker/cost-anomaly/done-gate/source-package/gemini-pin)
- `eb7d161` — FOUND (test(30-01): RED scaffolds — cron-resilience + community-scan-breaker + error-budget)

## Next Plan (30-02) Hand-off Notes

- **Implementing `withBreaker`**: drop bodies into `tests/unit/circuit-breaker.unit.test.ts` and `tests/integration/circuit-breaker.integration.test.ts`. The mock module already exposes `__advanceMockTime` for the 30s state-machine transition; no new mock work needed.
- **D-18 migration**: when `ProviderHealthAlert` Prisma model is added, **delete** the `@ts-expect-error — Phase 30 D-18 model lands in Plan 02` annotation in `tests/integration/provider-error-budget.cron.integration.test.ts` and confirm `tsc --noEmit` still passes. The unused-directive error becomes the build-time signal that the migration was applied successfully.
- **D-09 `fallback_summary`**: extend `SourcePackage` shape in `src/lib/data/source-package.ts` and `src/lib/types.ts`, then replace the 6 todos in `tests/unit/source-package.fallback.unit.test.ts` with real assertions.
- **D-14 model pins**: edit `src/lib/gemini-analysis.ts` per Amendment 2026-05-14 slug values (`google/gemini-3-pro` / `google/gemini-3-flash`) and update `tests/unit/gemini-analysis.model-pin.unit.test.ts` bodies. Confirm `GEMINI_TOKEN_RATES` comment cites the 3.x family.
- The mock module's `lpush`/`ltrim`/`lrange` triple is what the D-05 ring buffer assertions rely on — keep that contract stable if the production code's storage shape changes.
