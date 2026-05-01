---
phase: 17-institutional-insider-intelligence
plan: "03"
subsystem: learning-engine
tags:
  - cron
  - learning
  - quad-class
  - insider
  - institutional
  - smart-money
dependency_graph:
  requires:
    - 17-01  # types + fetchers + classifiers
    - 17-02  # schema columns (insider_data, institutional_data on SentimentSnapshot and Report)
  provides:
    - insider/institutional Beta cells written per resolved outcome
    - 4-sensor Promise.all in sentiment-scan cron
    - 4-sensor cold-start in engine-context
    - coldStartInsiderSnap + coldStartInstitutionalSnap variables for plan 17-04
  affects:
    - src/app/api/cron/learn/route.ts
    - src/app/api/cron/sentiment-scan/route.ts
    - src/lib/engine-context.ts
tech_stack:
  added: []
  patterns:
    - quad-class CellKey union ('diffusion' | 'technical' | 'insider' | 'institutional')
    - 4-element Promise.all parallel sensor pattern
    - per-class hit booleans in LearningEvent.delta
key_files:
  created:
    - tests/integration/sentiment-scan-smart-money.test.ts
    - tests/integration/learn-quad-class.test.ts
  modified:
    - src/app/api/cron/learn/route.ts
    - src/app/api/cron/sentiment-scan/route.ts
    - src/lib/engine-context.ts
decisions:
  - D-21: quad-class upsert gated on `&& resolvedCap` matching existing technical-cell semantics
  - D-22: 12-feature Bayesian logistic stays 30d-only; insider/institutional NOT added as logistic features
  - D-19: asymmetric coverage writes Prisma.JsonNull for missing class (same as community_data null handling)
  - "insider > institutional > technical > diffusion" precedence for primary signal_class on LearningEvent
metrics:
  duration: ~30 minutes
  completed: "2026-04-30"
  tasks: 8
  files: 5
---

# Phase 17 Plan 03: Quad-Class Learn + Cold-Start Extension Summary

Wave-2 cron + cold-start extension wiring the fetchers (17-01) and schema columns (17-02) into the daily learning loop. Three files extended, two integration tests added.

## Changes by File

### `src/app/api/cron/learn/route.ts`

**Lines modified (approximate post-edit line numbers):**

| Change | Location |
|--------|----------|
| `import type` extended to include `InsiderBucket`, `InstitutionalBucket` | lines 51–56 |
| `INSIDER_PATTERNS` array (8 buckets, D-10 verbatim) | lines 77–85 |
| `INSTITUTIONAL_PATTERNS` array (8 buckets, D-11 verbatim) | lines 86–94 |
| Cell-space comment updated (504 cells) | line 99 |
| `readInsiderBucketForOutcome` helper | lines 270–283 |
| `readInstitutionalBucketForOutcome` helper | lines 285–298 |
| `CellKey.signal_class` union extended to 4 values | line 305 |
| `insiderBucket` + `institutionalBucket` reads in transaction body | after `techPattern` |
| Upsert block 2a (insider cell) | after technical block |
| Upsert block 2b (institutional cell) | after 2a |
| `LearningEvent.delta` extended to 4 hit booleans | in `tx.learningEvent.create` |
| `signal_class` precedence: insider > institutional > technical > diffusion | in `tx.learningEvent.create` |
| `pattern_key` fallback chain includes insider/institutional | in `tx.learningEvent.create` |
| `SIGNAL_CLASSES` extended to 4 in `recomputePerSignalClassPatternMetrics` | ~line 360 |
| Pattern selector branches on `insider`/`institutional` in recompute loop | ~lines 365–369 |
| Both `recomputeOneCell` hit-extraction blocks updated to 4-class form | ~lines 415–435, 449–465 |

**D-22 lock preserved:** The logistic gate `if (horizon === 30 && trace && techSnap)` is UNCHANGED. `FEATURE_NAMES.length === 12`. No insider/institutional feature in the 12-d vector.

### `src/app/api/cron/sentiment-scan/route.ts`

- Added imports: `fetchInsiderData` from `@/lib/data/insider`, `fetchInstitutionalData` from `@/lib/data/institutional`
- Promise.all grows from 2 → 4 elements: `[communityData, technicalData, insiderData, institutionalData]`
- All-null guard generalized to all 4 sensors
- `prisma.sentimentSnapshot.create` writes `insider_data` and `institutional_data` (Prisma.JsonNull when null)

### `src/lib/engine-context.ts`

- Added `import { Prisma } from '@prisma/client'`
- Added `import { fetchInsiderData }` and `import { fetchInstitutionalData }`
- Added `import type { InsiderSnapshot, InstitutionalSnapshot }` from `@/lib/types`
- Cold-start block (`if (snaps.length === 0)`) extended from 2 → 4 sensor Promise.all
- `coldStartTechSnap`: already present; now written from `techResult`
- `coldStartInsiderSnap: InsiderSnapshot | null`: declared and populated from `insiderResult`
- `coldStartInstitutionalSnap: InstitutionalSnapshot | null`: declared and populated from `institutionalResult`
- Cold-start snapshot create writes all 4 Json columns
- `void coldStartInsiderSnap; void coldStartInstitutionalSnap;` preserves variables for plan 17-04

## LearningEvent.delta Shape (Post-Phase-17)

```ts
delta: {
  // Per-class hit booleans
  diffusion_hit: boolean | null;       // null when no trace or flow_pattern === 'flat'
  tech_hit: boolean | null;            // null when no tech_pattern
  insider_hit: boolean | null;         // null when no insider_bucket at snapshot time
  institutional_hit: boolean | null;   // null when no institutional_bucket at snapshot time

  // Legacy compatibility
  hit: boolean;

  // Outcome numerics
  ticker_return_pct: number;
  spy_return_pct: number;
  horizon: number;

  // Pattern names for audit trail
  tech_pattern: TechPattern | null;
  flow_pattern: FlowPattern | null;
  insider_bucket: InsiderBucket | null;
  institutional_bucket: InstitutionalBucket | null;
}
```

**Recompute pass hit-extraction:** insider/institutional classes do NOT fall back to legacy `hit` — pre-Phase-17 events never had those snapshots, so the fallback would produce false positives.

## D-22 Confirmation

- `FEATURE_NAMES.length === 12` — verified by unit test assertion in `learn-quad-class.test.ts`
- Logistic gate: `if (horizon === 30 && trace && techSnap)` — UNCHANGED
- No `insiderBucket` or `institutionalBucket` appears inside the logistic gate body
- `buildFeatureVector12(trace, techSnap, techPattern)` call is UNCHANGED — 12 features only

## coldStartInsiderSnap / coldStartInstitutionalSnap Status

Both variables are **declared and populated** in `src/lib/engine-context.ts` but **unused** in this plan. The two `void` no-ops at the end of the cold-start block document the handoff:

```ts
void coldStartInsiderSnap;       // plan 17-04 reads this in §6.5 calibration resolution
void coldStartInstitutionalSnap; // plan 17-04 reads this in §6.5 calibration resolution
```

Plan 17-04 will replace these `void` lines with real reads when implementing the engine-context calibration resolution and `EngineContext` Smart Money fields.

## Integration Test Coverage

### `tests/integration/sentiment-scan-smart-money.test.ts`

4 test cases, all skipped without `DATABASE_URL`:

1. **Both fetchers succeed** — both columns populated as JSON objects
2. **Asymmetric coverage** (insider only) — `insider_data` non-null, `institutional_data` null (D-19)
3. **Both new fetchers null** — community+technical succeed; both new columns written as `null`
4. **All 4 fetchers null** — all-null guard fires; no snapshot created, `results.failed++`

### `tests/integration/learn-quad-class.test.ts`

4 test cases, all skipped without `DATABASE_URL`:

1. **Quad-class upsert** — 30d outcome with all 4 sensor data → technical + insider + institutional cells upserted (diffusion skipped — single snapshot, ≥2 required for trace)
2. **Idempotent retry** — two GET calls produce exactly 1 LearningEvent (outcome_id dedup preserved)
3. **4-key delta** — `diffusion_hit`, `tech_hit`, `insider_hit`, `institutional_hit` all present on `LearningEvent.delta`
4. **D-22 lock** — `FEATURE_NAMES.length === 12` asserted directly; LogisticEpoch coefficients verified 12-named if epoch exists

## Engine State Post-Plan

Cell-space has grown from 216 to 504 cells (at 3 traded cap_classes):
- Diffusion: 4 patterns × 3 × 6 = 72
- Technical: 8 patterns × 3 × 6 = 144
- Insider: 8 patterns × 3 × 6 = 144
- Institutional: 8 patterns × 3 × 6 = 144

New cells will only be populated when resolved outcomes with insider/institutional snapshots exist. Plan 17-05's backfill script will seed historical data to bootstrap these cells.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `momentum_regime: 'bullish'` in test fixture**

- **Found during:** Task 7 typecheck
- **Issue:** `TechnicalSnapshot.momentum_regime` only accepts `'unknown' | 'overbought' | 'oversold' | 'neutral'`; the plan's sample fixture used `'bullish'`
- **Fix:** Changed to `'neutral'` in `SAMPLE_TECHNICAL` fixture
- **Files modified:** `tests/integration/sentiment-scan-smart-money.test.ts`
- **Commit:** 7db2b74

**2. [Rule 2 - Missing functionality] Added `Prisma` import to engine-context.ts**

- **Found during:** Task 6 typecheck
- **Issue:** `engine-context.ts` used `Prisma.JsonNull` but had no `@prisma/client` import
- **Fix:** Added `import { Prisma } from '@prisma/client'`
- **Files modified:** `src/lib/engine-context.ts`
- **Commit:** f19b166

### Changed from Plan Template

The plan's `<action>` for Task 7 showed `vi.doMock` with dynamic imports. The existing project pattern (as seen in `sentiment-scan-technical.test.ts`) uses top-level `vi.mock` with `vi.mocked(...).mockResolvedValueOnce(...)` per test. The top-level `vi.mock` approach is more reliable and consistent with project conventions. All 4 behavior assertions are covered identically.

## Threat Surface Scan

No new security-relevant surfaces introduced. All 6 STRIDE mitigations from the plan's threat register are satisfied:

- T-17-03-01: CRON_SECRET gate preserved verbatim in both cron routes
- T-17-03-02: LearningEvent.delta written by cron only — no client-supplied path; pre-17 events fall through to `null` safely
- T-17-03-03: Finnhub public-record data (Form 4/13F) — no PII
- T-17-03-04: All 4 fetchers return null on failure; all-null guard fires before snapshot create
- T-17-03-05: Each cold-start fetcher uses `.catch(() => null)` — one failing sensor cannot block snapshot creation
- T-17-03-06: New signal_class values live within existing composite unique key — no schema change

## Self-Check: PASSED

All files verified present. All 8 task commits verified in git log.

| Check | Status |
|-------|--------|
| `src/app/api/cron/learn/route.ts` | FOUND |
| `src/app/api/cron/sentiment-scan/route.ts` | FOUND |
| `src/lib/engine-context.ts` | FOUND |
| `tests/integration/sentiment-scan-smart-money.test.ts` | FOUND |
| `tests/integration/learn-quad-class.test.ts` | FOUND |
| `.planning/phases/17-institutional-insider-intelligence/17-03-SUMMARY.md` | FOUND |
| Commit 6b5e50e (Task 1) | FOUND |
| Commit 02aaeda (Task 2) | FOUND |
| Commit e396c74 (Task 3) | FOUND |
| Commit 476b3a3 (Task 4) | FOUND |
| Commit 6bb2206 (Task 5) | FOUND |
| Commit f19b166 (Task 6) | FOUND |
| Commit 7db2b74 (Task 7) | FOUND |
| Commit e8c22c2 (Task 8) | FOUND |
| `npx tsc --noEmit` | PASSED |
| Unit tests (335) | PASSED |
