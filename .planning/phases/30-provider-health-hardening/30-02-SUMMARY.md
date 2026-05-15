---
phase: 30
plan: 02
subsystem: provider-health-hardening
tags: [wave-1, circuit-breaker, upstash, telemetry-enum, field-origin, prisma-migration]
dependency_graph:
  requires:
    - "30-01 (in-memory Upstash mock + RED-state Vitest scaffolds for D-04..D-08)"
  provides:
    - "withBreaker primitive — composes around withRetry per D-04..D-07"
    - "BreakerOpenError — non-retryable typed error carrying provider_id + opened_at"
    - "BreakerConfig + DEFAULT_BREAKER_CONFIG (ringSize=20, tripErrorRate=0.5, openMs=30s)"
    - "TelemetryErrorClass widened with 'BREAKER_OPEN' value"
    - "FieldOrigin widened additively with 'unavailable' (null kept for back-compat)"
    - "FallbackSummaryEntry interface (D-09 telemetry shape)"
    - "ProviderHealthAlert Prisma model + additive migration applied to dev Neon DB (Task 4 ✓ — 2026-05-14, migration 20260514170000_phase30_provider_health applied via prisma migrate deploy, client regenerated)"
  affects:
    - "Plan 30-03 (Wave 2): adapter wiring, merge.ts emission of 'unavailable', research-brief '—' rendering"
    - "Plan 30-04 (Wave 3): /api/cron/provider-error-budget + dashboard tiles consume ProviderHealthAlert"
tech_stack:
  added: []
  patterns:
    - "Upstash-shared circuit breaker (~190 LOC): LPUSH+LTRIM ring buffer, SETNX probe lock, 1h state TTL"
    - "Type-only Prisma client lookahead — @ts-expect-error annotation in tests/integration/provider-error-budget.cron.integration.test.ts will be removed in Wave 3 after migrate dev applies the table"
    - "Composition order encoded in JSDoc: withTelemetry > withBreaker > withRetry > fn — breaker short-circuits BEFORE retry budget is consumed"
    - "Strict > on trip threshold: 10/20 = 50% does NOT trip; 11/20 = 55% trips (D-05)"
key_files:
  created:
    - "src/lib/data/circuit-breaker.ts"
    - "prisma/migrations/20260514170000_phase30_provider_health/migration.sql"
    - ".planning/phases/30-provider-health-hardening/30-02-SUMMARY.md"
  modified:
    - "src/lib/data/cache/upstash.ts (export getRedis)"
    - "src/lib/telemetry/error-classifier.ts (BREAKER_OPEN union + BreakerOpenError type guard)"
    - "src/lib/types.ts (FieldOrigin += 'unavailable'; FallbackSummaryEntry interface)"
    - "src/components/ResearchReport.tsx (sourceLabel param accepts 'unavailable')"
    - "prisma/schema.prisma (+ProviderHealthAlert model)"
    - "tests/unit/circuit-breaker.unit.test.ts (10 GREEN unit tests)"
    - "tests/integration/circuit-breaker.integration.test.ts (5 GREEN integration tests)"
    - "tests/telemetry/error-classifier.unit.test.ts (+8 D-08 cases)"
    - "tests/lib/data/retry.test.ts (+2 D-07 cases)"
decisions:
  - "Hand-rolled breaker (~190 LOC) over opossum/cockatiel/circuit-breaker-js — none of the off-the-shelf libraries match D-04's mandate for Upstash-shared state across lambda cold starts; integrating one would require writing a custom storage adapter that exceeds the cost of writing the breaker outright"
  - "openMs window storage: 1h hard TTL (ex: 3600) on the state key so a stuck-open breaker self-heals if every probe stalls — operator can also DEL via Upstash CLI per threat T-30-02-04"
  - "Half-open probe lock TTL matches openMs (30s) — single SETNX winner runs the probe; losers throw BreakerOpenError immediately"
  - "FieldOrigin widening uses Strategy 2 from research R-2 (additive — keep null in the union) rather than Strategy 1 (replace null with 'unavailable'). Strategy 2 avoids backfill of persisted JSONB in Report.analysis._field_sources while still satisfying D-11's intent — renderers in Plan 30-03 treat null and 'unavailable' as the same '—' case"
  - "Migration uses 14-digit timestamp prefix (20260514170000) so it sorts AFTER existing 20260514_phase_20_consolidate lexicographically (Prisma applies migrations in sort order); 8-digit-date convention would collide and sort-order would be wrong"
  - "Task 4 is checkpoint:human-action — Claude prepared the migration artifacts but does NOT run npx prisma migrate dev; the operator does so against the live Neon dev DSN and types 'continue' to resume"
metrics:
  duration_minutes: 18
  completed_date: "2026-05-14"
  tasks_executed: 3
  files_created: 3
  files_modified: 9
  commits: 3
---

# Phase 30 Plan 02: Wave 1 — Breaker + Prisma Schema Summary

**One-liner:** Per-provider Upstash-shared circuit breaker (`withBreaker` + `BreakerOpenError`), TelemetryErrorClass widened with `BREAKER_OPEN`, FieldOrigin extended additively with `'unavailable'`, and the `ProviderHealthAlert` Prisma model + hand-written migration file — staged, not yet applied (Task 4 = checkpoint).

## What Shipped

### Task 1: `withBreaker` primitive with Upstash-shared state — commit `78302b2`

`src/lib/data/circuit-breaker.ts` (~190 LOC) exports:

- **`BreakerOpenError`** — non-retryable typed error with `provider_id: ProviderId` and `opened_at: number` public fields. `name === 'BreakerOpenError'`. Carries no `status` or `code` so `isRetryableError()` returns false without any explicit guard (D-07).
- **`BreakerConfig` + `DEFAULT_BREAKER_CONFIG`** — `{ ringSize: 20, tripErrorRate: 0.5, minRingForTrip: 5, openMs: 30_000 }` (D-05, D-06).
- **`withBreaker<T>(provider_id, fn, overrides?)`** — composes BETWEEN `withTelemetry` and `withRetry` per CONTEXT D-07.

**Upstash key shape (D-04):**

| Key                              | Type          | Purpose                                                                |
|----------------------------------|---------------|------------------------------------------------------------------------|
| `breaker:{provider}:state`       | string (JSON) | `{ status, opened_at, reason? }` with 1h TTL                          |
| `breaker:{provider}:ring`        | list          | Last 20 outcomes (`'ok'`/`'err'`), maintained via LPUSH + LTRIM 0 19  |
| `breaker:{provider}:probe`       | string        | SETNX lock for the single half-open probe; TTL = `openMs`             |

**State machine (D-06):**

```
closed → trip rule → open
open → 30s elapsed → SETNX probe → success closes / failure reopens (opened_at refreshed)
```

**Graceful degrade:** `getRedis() === null` (Upstash env unset) → permissively closed; every call passes through. Matches existing `cached()` helper contract.

**Tests:** 10 unit + 5 integration, all GREEN. Covers D-04 key shape, D-05 trip rule (including strict-> at 50% boundary), D-05 ring length cap at 20 after >20 calls, D-06 single-probe SETNX semantics, D-06 probe lock TTL recovery, D-07 non-retry invariant, D-07 BreakerOpenError shape.

### Task 2: TelemetryErrorClass widening + FieldOrigin extension — commit `36a4856`

**`src/lib/telemetry/error-classifier.ts`:**
- Added `'BREAKER_OPEN'` to the union (D-08)
- `classifyError()` now type-checks `BreakerOpenError` FIRST (before the null/status/code checks) and returns `'BREAKER_OPEN'`. Necessary because BreakerOpenError is non-null but has neither `status` nor `code` — without this branch it would fall through to `'UNKNOWN'`.

**`src/lib/types.ts`:**
- `FieldOrigin` extended additively: `... | 'tiingo-was-removed' | 'unavailable' | null` (D-11, research R-2 strategy 2). `null` preserved for back-compat with persisted `Report.analysis._field_sources` JSONB.
- New interface `FallbackSummaryEntry` (D-09) — shape `{ field: string; tried: ProviderId[]; resolved_by: ProviderId | 'unavailable' }`. Uses `import('./telemetry/cost-estimators').ProviderId` inline since types.ts had no existing ProviderId import.

**`src/lib/data/cache/upstash.ts`:** Exported the previously-private `getRedis()` so circuit-breaker can read/write breaker:* keys with the same graceful-degrade contract as `cached()`.

**`src/components/ResearchReport.tsx`:** The `sourceLabel()` helper's parameter union widened to accept `'unavailable'` (renders no badge — em-dash rendering case lands in Plan 30-03 alongside merge.ts emission).

**Tests:** +8 cases in `tests/telemetry/error-classifier.unit.test.ts` (D-08 coverage + regression coverage of every existing classification path). +2 cases in `tests/lib/data/retry.test.ts` (D-07: `attemptCount === 1` on BreakerOpenError; `isRetryableError(boe) === false`). Total: 43 unit cases + 5 integration cases — all GREEN. `npx tsc --noEmit` exits 0.

### Task 3: ProviderHealthAlert Prisma model + migration file — commit `edc4774`

**`prisma/schema.prisma`** — appended `ProviderHealthAlert` model after `ProviderCallLog`:

```prisma
model ProviderHealthAlert {
  id                   String    @id @default(uuid())
  provider_id          String
  breached_at          DateTime  @db.Timestamptz
  error_rate           Float
  error_count          Int
  total_count          Int
  dominant_error_class String?
  resolved_at          DateTime? @db.Timestamptz

  @@index([provider_id, breached_at(sort: Desc)], map: "idx_pha_provider_breached")
  @@index([resolved_at], map: "idx_pha_resolved_at")
  @@map("provider_health_alerts")
}
```

**`prisma/migrations/20260514170000_phase30_provider_health/migration.sql`** — hand-written CREATE TABLE with explicit index names matching the schema map values. Additive only — never drops or alters anything.

Validation: `npx prisma validate` reports "schema is valid 🚀".

## Composition Contract (load-bearing, encoded in module JSDoc)

```ts
withTelemetry(provider, () =>
  withBreaker(provider, () =>
    withRetry(() => fn())));
```

- Outermost `withTelemetry` captures every attempt (including BREAKER_OPEN rows) into `ProviderCallLog`.
- Middle `withBreaker` short-circuits BEFORE `withRetry` so a tripped breaker doesn't consume retry budget.
- Innermost `withRetry` runs only when the breaker is closed/half-open.

Wave 2 (Plan 30-03) will wire this into every adapter in `src/lib/data/`.

## Verification

| Check                                                                                                                    | Result |
|--------------------------------------------------------------------------------------------------------------------------|:------:|
| `npx vitest run tests/unit/circuit-breaker.unit.test.ts`                                                                  | 10/10 ✓ |
| `npx vitest run tests/telemetry/error-classifier.unit.test.ts`                                                            | 20/20 ✓ |
| `npx vitest run tests/lib/data/retry.test.ts`                                                                              | 13/13 ✓ |
| `npx vitest run --config vitest.integration.config.ts tests/integration/circuit-breaker.integration.test.ts`              | 5/5 ✓ |
| `npx tsc --noEmit` (project-wide)                                                                                          | exit 0 |
| `npx prisma validate`                                                                                                      | valid 🚀 |
| `grep -E "export (async function withBreaker\|class BreakerOpenError\|interface BreakerConfig\|const DEFAULT_BREAKER_CONFIG)" src/lib/data/circuit-breaker.ts` | 4 matches |
| `grep "breaker:.*:(state\|ring\|probe)" src/lib/data/circuit-breaker.ts`                                                   | 6 matches (≥3) |
| `grep "getRedis()" src/lib/data/circuit-breaker.ts`                                                                        | 6 matches (≥1) |
| `grep "BREAKER_OPEN" src/lib/telemetry/error-classifier.ts`                                                                | 3 matches (≥2) |
| `grep "BreakerOpenError" src/lib/telemetry/error-classifier.ts`                                                            | 3 matches (≥2) |
| `grep "'unavailable'" src/lib/types.ts`                                                                                    | 4 matches (≥1) |
| `grep "interface FallbackSummaryEntry" src/lib/types.ts`                                                                   | 1 match |
| `grep "model ProviderHealthAlert" prisma/schema.prisma`                                                                    | 1 match |
| `grep '@@map("provider_health_alerts")' prisma/schema.prisma`                                                              | 1 match |
| `grep "idx_pha_provider_breached\|idx_pha_resolved_at" prisma/schema.prisma`                                               | 2 matches |
| `ls prisma/migrations/*_phase30_provider_health/migration.sql`                                                             | 1 path |
| `grep "CREATE TABLE \"provider_health_alerts\"" prisma/migrations/*_phase30_provider_health/migration.sql`                  | 1 match |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `getRedis` was module-private in `src/lib/data/cache/upstash.ts`**
- **Found during:** Task 1 — `npx tsc --noEmit` after writing `circuit-breaker.ts` reported `TS2459: Module '@/lib/data/cache/upstash' declares 'getRedis' locally, but it is not exported.`
- **Issue:** The plan's Task 1 source skeleton imports `getRedis` from the real Upstash module (D-04 graceful-degrade contract requires the breaker to honor the same null → pass-through semantics as `cached()`). The real module had `getRedis()` as a private internal — only `cached()` and `invalidate()` were exported.
- **Fix:** Exported `getRedis()` with a JSDoc block explaining Phase-30 callers + the shared graceful-degrade contract.
- **Files modified:** `src/lib/data/cache/upstash.ts`
- **Commit:** `36a4856` (rolled into Task 2's commit since Task 1's tests use the in-memory mock and don't exercise this codepath; the real production import surfaces only at tsc time)

**2. [Rule 3 — Blocking] `ResearchReport.tsx` `sourceLabel()` param type rejected `'unavailable'`**
- **Found during:** Task 2 — `npx tsc --noEmit` after widening `FieldOrigin` reported `TS2345: Type '"unavailable"' is not assignable to parameter type ...`
- **Issue:** The `sourceLabel()` helper at `src/components/ResearchReport.tsx:474` has a hand-typed parameter union (older, narrower copy of `FieldOrigin`) that does not include `'unavailable'`. Widening `FieldOrigin` in `types.ts` (mandatory per D-11) caused 8 call-site type errors.
- **Fix:** Widened the helper's parameter union with `'unavailable'`; the branch returns `null` (no badge) since the em-dash rendering case lands in Plan 30-03 alongside the merge.ts emission of `'unavailable'`. Comment cites D-11 + Plan 30-03.
- **Files modified:** `src/components/ResearchReport.tsx`
- **Commit:** `36a4856`

**3. [Rule 3 — Blocking] `lrange` filter parameter implicit-any under strict TS**
- **Found during:** Task 2 typecheck — `TS7006: Parameter 'o' implicitly has an 'any' type` at `ring.filter((o) => o === 'err')` in `src/lib/data/circuit-breaker.ts:150`.
- **Issue:** The `@upstash/redis` `lrange` method is generic `<TResult = string>` returning `Promise<TResult[]>`. Without explicit `<string>` type arg, strict-mode infers a wider type that flows into `filter`'s callback param as implicit-any.
- **Fix:** Passed explicit type argument `r.lrange<string>(...)` + typed the filter callback parameter `(o: string)`.
- **Files modified:** `src/lib/data/circuit-breaker.ts`
- **Commit:** `36a4856`

### Path correction (no behavior change)

**4. [Rule 3 — Path mismatch] Plan-cited test paths don't exist; actual paths used**
- **Plan called out:** `src/lib/telemetry/__tests__/error-classifier.unit.test.ts`, `src/lib/data/__tests__/retry.test.ts`
- **Actual project convention:** tests live under `tests/...`, not colocated `__tests__/` directories. The real files are `tests/telemetry/error-classifier.unit.test.ts` and `tests/lib/data/retry.test.ts`.
- **Action:** Extended the actual files. No new test files created at the plan's cited paths. Acceptance greps run against the actual paths and pass.

### Worktree-base correction

**5. [Rule 3 — Setup] Worktree HEAD was at 8508ed5 (BEFORE the expected base 770333fc)**
- **Found during:** First test run — `Cannot find module '@/lib/data/cache/__mocks__/upstash'` (file did not exist on disk because the worktree was created from a pre-30-01 ancestor).
- **Fix:** Stashed in-flight Task 1 work, `git merge --ff-only 770333fc` to bring HEAD forward, restored work from stash blobs (since `pop` conflicted with the now-existing RED test files from 30-01, the GREEN versions were extracted from `stash@{0}^3` and written directly).
- **No behavior or content change** — purely a worktree-state correction so the 30-01 mock module + RED scaffolds were visible to the test runner.

## Known Stubs

None. Every interface added is wired:
- `FallbackSummaryEntry` is a type-only contract consumed in Plan 30-03 — declaring it here lets Wave 2's adapter wiring import the shape from `@/lib/types` without a circular dep on `merge.ts`.
- `'unavailable'` in `FieldOrigin` and the matching `sourceLabel` branch are wired (the branch returns `null` for no badge); merge.ts emission of `'unavailable'` lands in Plan 30-03 along with the report renderer's em-dash case.

## Threat Flags

None. The new `ProviderHealthAlert` table introduces no new client-facing surface and adds no PII columns (provider_id is a public service name, error counts are integers, error_class is a controlled enum). The new `breaker:*` Upstash keys are server-only and namespaced.

## Self-Check: PENDING TASK 4

Self-verification of Tasks 1-3:

Created files verified:
- `src/lib/data/circuit-breaker.ts` — FOUND
- `prisma/migrations/20260514170000_phase30_provider_health/migration.sql` — FOUND
- `.planning/phases/30-provider-health-hardening/30-02-SUMMARY.md` — FOUND (this file)

Commits verified:
- `78302b2` — FOUND (feat(30-02): withBreaker primitive with Upstash-shared state)
- `36a4856` — FOUND (feat(30-02): widen TelemetryErrorClass with BREAKER_OPEN; extend FieldOrigin additively)
- `edc4774` — FOUND (feat(30-02): ProviderHealthAlert Prisma model + additive migration)

**Task 4 (`prisma migrate dev`) is `checkpoint:human-action` — pending operator action.** This SUMMARY will be amended by the continuation agent after the operator confirms `continue`.

## Next Plan (30-03) Hand-off Notes

- **Composition wire-in:** Plan 30-03 inserts `withBreaker` between every existing `withTelemetry → withRetry` pair across `src/lib/data/*.ts`. The breaker module is import-stable; just add the wrap.
- **`'unavailable'` emission:** `src/lib/data/merge.ts:59` currently returns `{ value: null, source: null }` when the cascade is empty — change to `{ value: null, source: 'unavailable' }`. Renderer changes in `src/lib/research-brief.ts` + `src/components/ResearchReport.tsx` handle the em-dash case (already accepts `'unavailable'` per the Task-2 sourceLabel widening; just add the em-dash render branch).
- **Active `@ts-expect-error` annotation:** `tests/integration/provider-error-budget.cron.integration.test.ts` has `// @ts-expect-error — Phase 30 D-18 model lands in Plan 02` at the call site that touches `prisma.providerHealthAlert`. **After Task 4 applies the migration and `npx prisma generate` regenerates the client, REMOVE this annotation** — the unused-directive error becomes the build-time signal that the migration was applied successfully.
- **Cost-anomaly breaker (D-15) trip writes to `breaker:gemini:state` directly** — reuses this Task-1 plumbing. No new breaker class. See research lines 328-352.
