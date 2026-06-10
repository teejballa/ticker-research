---
phase: 22-market-regime-and-source-weights
plan: 01
subsystem: regime-classifier + cron-wiring
tags: [regime, vix, spy, ma-cross, yahoo-finance2, polygon, cron, sentiment-snapshot, knowable-at, wave-1]
dependency_graph:
  requires:
    - "Phase 22 Wave 0 (22-00): additive Prisma columns (regime, regime_vix_level, regime_vix_pctile, regime_ma_diff on SentimentSnapshot) + 11 RED stubs"
    - "Phase 21.1 Wave 2 pattern: src/lib/labels/compute.ts pure-functional asOf-keyed helper with @knowable_at JSDoc"
    - "P30 Yahoo + Polygon fallback pattern: src/lib/data/sector-mapping.ts getSectorSigma60d cache + retry semantics"
  provides:
    - "src/lib/regime/classify.ts — SINGLE source of truth for 4-bucket regime label (CORE-ML-07)"
    - "src/lib/regime/{vix-percentile,ma-cross}.ts — Yahoo primary + Polygon fallback helpers per D-12"
    - "src/lib/regime/{types,hyperparameters}.ts — frozen RegimeLabel union + Zod-validated hyperparameters"
    - "src/app/api/cron/sentiment-scan/route.ts: classifyRegimeAndPersistForScan helper + per-cycle regime hoisting (CORE-ML-08 forward path)"
    - "scripts/check-feature-asof.ts: 4 new regime entries in FEATURE_ASOF_REGISTRY (W-2 plan-checker fix)"
  affects:
    - "Wave 2 (22-02) — /api/cron/backfill-regime reuses classifyRegimeAt verbatim for historical PIT classification"
    - "Wave 3 (22-03) — aggregator reads SentimentSnapshot.regime per-row per D-08"
    - "Wave 4 (22-04) — learn cron extends two-pass evaluation per regime"
    - "Wave 5 (22-05) — done-gate Brier-lift per regime"
tech_stack:
  added: []
  patterns:
    - "pure-functional asOf-keyed classifier (mirrors src/lib/labels/compute.ts) — caller supplies PIT date, no DB writes inside helpers, @knowable_at JSDoc on every exported function"
    - "Yahoo-primary + Polygon-fallback for VIX (^VIX/I:VIX) and SPY (^GSPC/SPY) — same merge semantics as getSectorSigma60d (D-12)"
    - "cache namespace: vix_60d:{YYYY-MM-DD} + spy_ma_cross:{YYYY-MM-DD} both with 24h TTL — historical closes don't change intraday"
    - "module-load Zod assertion on REGIME_HYPERPARAMETERS — mis-tuned config fails at import time, not silently at runtime (mirrors source-tier-hyperparameters.ts)"
    - "per-cron-cycle classification hoisting — classifyRegimeAt called ONCE outside per-ticker loop, NOT 121x"
    - "extracted classifyRegimeAndPersistForScan helper — keeps the cron's existing surface unchanged while making the regime-write contract unit-testable"
key_files:
  created:
    - "src/lib/regime/types.ts — RegimeLabel 5-literal union + RegimeInputs/RegimeResult + ACTIVE_REGIME_LABELS audit array"
    - "src/lib/regime/hyperparameters.ts — Zod-validated REGIME_HYPERPARAMETERS frozen at {vix_window_days:60, vix_percentile_threshold:0.5, ma_short:50, ma_long:200}"
    - "src/lib/regime/vix-percentile.ts — getVix60dPercentile(asOf): Yahoo ^VIX + Polygon I:VIX fallback, trailing-60d self-excluded percentile rank"
    - "src/lib/regime/ma-cross.ts — getSpyMaCross(asOf): Yahoo ^GSPC + Polygon SPY fallback, mean(last 50) - mean(last 200)"
    - "src/lib/regime/classify.ts — classifyRegimeAt({asOf}): Promise.all over both helpers, D-09 cold-start fail-open to 'ALL'"
    - "src/lib/regime/__tests__/classify.test.ts — 10 cases, mocked input helpers, boundary semantics (D-04 pctile==0.5 → high-vol; D-03 MA50==MA200 → bull)"
    - "src/lib/regime/__tests__/vix-percentile.test.ts — 8 cases driven by tests/fixtures/regime/vix-history.json"
    - "src/lib/regime/__tests__/ma-cross.test.ts — 8 cases (NEW, no Wave 0 stub) driven by spy-history.json"
    - "src/lib/regime/__tests__/classify.live.test.ts — RUN_LIVE_INTEGRATION=true gated smoke test against real Yahoo for asOf=2024-01-15"
  modified:
    - "src/app/api/cron/sentiment-scan/route.ts — added classifyRegimeAndPersistForScan helper + per-cycle regime hoisting"
    - "src/app/api/cron/__tests__/sentiment-scan-regime.test.ts — Wave 0 RED stub turned GREEN with 6 cases"
    - "scripts/check-feature-asof.ts — 4 new regime registry entries (W-2 plan-checker fix)"
decisions:
  - "D-02..D-04 wired verbatim: 4-bucket regime via sign(MA50-MA200) × (VIX vs 60d 50th-pct), strict-`>=` semantics for both axes"
  - "D-09 cold-start fail-open: any null input → regime='ALL', all 3 audit fields → null. Cron still writes the row."
  - "D-12 Yahoo-primary + Polygon-fallback for both inputs. Returns null only when BOTH fail AND no prior-trading-day close resolves within 14 calendar days."
  - "Per-cycle classification hoisted to GET handler scope — single Yahoo ^VIX + ^GSPC call per cron invocation, not 121x"
  - "classifyRegimeAndPersistForScan extracted as exported helper — keeps unit-testability without coupling the test to the cron's full per-ticker pipeline (StockTwits, Cresci, FinBERT, etc.)"
  - "Live integration test gated on RUN_LIVE_INTEGRATION=true — asserts result membership in 5-literal union without asserting WHICH label (vendor-revision tolerance)"
metrics:
  duration_minutes: "~25"
  completed_date: "2026-06-10"
  tasks_completed: "2 of 2"
  files_created: 9
  files_modified: 3
  loc_added: "~1318"
  tests_added: 32
  tests_skipped_live: 1
---

# Phase 22 Plan 1: Wave 1 — Regime Classifier + Sentiment-Scan Write Path Summary

**One-liner:** Pure-functional 4-bucket regime classifier (`src/lib/regime/`) with Yahoo + Polygon fallback per D-12, wired into `/api/cron/sentiment-scan` so every new SentimentSnapshot lands with `regime`, `regime_vix_level`, `regime_vix_pctile`, `regime_ma_diff` populated at scan time per CORE-ML-08.

---

## What Shipped

### 1. `src/lib/regime/` module (Task 1)

| File | Exports | Purpose |
|------|---------|---------|
| `types.ts` | `RegimeLabel`, `RegimeInputs`, `RegimeResult`, `ACTIVE_REGIME_LABELS` | 5-literal union (4 buckets + 'ALL' cold-start) + audit-input interfaces |
| `hyperparameters.ts` | `REGIME_HYPERPARAMETERS`, `validateRegimeHyperparameters` | Frozen `{vix_window_days:60, vix_percentile_threshold:0.5, ma_short:50, ma_long:200}` with Zod module-load assertion |
| `vix-percentile.ts` | `getVix60dPercentile` | `^VIX` primary + Polygon `I:VIX` fallback; trailing-60d window self-excludes `asOf` for PIT correctness |
| `ma-cross.ts` | `getSpyMaCross` | `^GSPC` primary + Polygon `SPY` fallback; `mean(last 50) - mean(last 200)` in price units |
| `classify.ts` | `classifyRegimeAt` | `Promise.all` over both helpers; D-09 fail-open to `'ALL'` when either returns null |

**Pattern mirror:** `src/lib/labels/compute.ts:1-22` (P21.1 Wave 2). Every exported function carries `@knowable_at asOf` JSDoc. There is NO parallel/forked regime logic — train/serve skew defense per CLAUDE.md rule #6.

### 2. Cache namespace + TTL (consistency with `getSectorSigma60d`)

- `vix_60d:{YYYY-MM-DD}` — 24h TTL (historical VIX closes don't change intraday)
- `spy_ma_cross:{YYYY-MM-DD}` — 24h TTL (historical SPY closes don't change intraday)

Both keys mirror `sector_sigma_60d:{etf}:{dateKey}` (`src/lib/data/sector-mapping.ts:175`). Cache wrapper degrades gracefully when Upstash is unset — no error path, no retry-budget consumption.

### 3. Sentiment-scan cron wiring (Task 2)

Two surgical changes to `src/app/api/cron/sentiment-scan/route.ts`:

1. **Per-cycle hoisting** of `classifyRegimeAt({ asOf: scanCycleStart })` BEFORE the `for (const ticker of tickers)` loop. Single regime classification per cron invocation. Single `console.log('[cron:sentiment-scan] regime', ...)` line per cycle (investigation-mode skill: every async boundary logs).
2. **Per-ticker insert replacement**: `prisma.sentimentSnapshot.create({data: {...existing fields}})` swapped for `classifyRegimeAndPersistForScan({...existing fields, regimeResult})`. The 4 regime columns thread through verbatim.

New exported helper: `classifyRegimeAndPersistForScan(args)`. Caller hoists `regimeResult`; helper consumes it. Helper does NOT call `classifyRegimeAt` itself (PIT-by-construction — the test proves this in case #6).

D-09 cold-start: when `regimeResult.regime === 'ALL'`, the row still writes. The column DEFAULT is 'ALL' so this is a semantic no-op, but it documents that the classifier RAN at scan time (forensics value).

### 4. Wave 0 RED stubs → GREEN

| RED stub (Wave 0) | Wave 1 implementation | Result |
|-------------------|------------------------|--------|
| `src/lib/regime/__tests__/classify.test.ts` | `src/lib/regime/classify.ts` | 10 tests GREEN |
| `src/lib/regime/__tests__/vix-percentile.test.ts` | `src/lib/regime/vix-percentile.ts` | 8 tests GREEN |
| `src/app/api/cron/__tests__/sentiment-scan-regime.test.ts` | `classifyRegimeAndPersistForScan` export | 6 tests GREEN |

### 5. New Wave 1 tests (no Wave 0 stub seeded)

| File | Tests | Notes |
|------|-------|-------|
| `src/lib/regime/__tests__/ma-cross.test.ts` | 8 | Bear→bull trend-flip detection across fixture crossover region (idx 199 → idx 209) |
| `src/lib/regime/__tests__/classify.live.test.ts` | 1 (skipped by default) | RUN_LIVE_INTEGRATION=true gate; hits real Yahoo for `asOf=2024-01-15` |

### 6. W-2 plan-checker fix: `scripts/check-feature-asof.ts`

Extended `FEATURE_ASOF_REGISTRY` with 4 new regime fields per plan body. Verification: `grep -E "^  regime" scripts/check-feature-asof.ts` returns 4 lines. `npm run check-feature-asof` exits 0 with all 43 features annotated (36 engine + 7 canonical).

---

## Commits

| Commit | Type | Files | What |
|--------|------|-------|------|
| `a25ce75` | feat | 9 source/test + 1 script | Build `src/lib/regime/` module (5 source files + 4 test files) + W-2 fix to `check-feature-asof.ts` |
| `f2c3126` | feat | 2 (route + test) | Wire sentiment-scan cron with `classifyRegimeAndPersistForScan` helper + per-cycle regime hoisting |

---

## Verification (per plan `<verification>` block)

| Gate | Command | Result |
|------|---------|--------|
| 1. Wave 1 test suite | `npx vitest run src/lib/regime/__tests__/ src/app/api/cron/__tests__/sentiment-scan-regime.test.ts --reporter=dot` | **32 passed | 1 skipped (live)** ✓ |
| 2. Feature-asof audit | `npm run check-feature-asof` | **43/43 features annotated ✓** |
| 3. TypeScript clean | `npx tsc --noEmit` | **0 new errors** (4 pre-existing Wave 0 RED stubs remain, target Waves 2-5) ✓ |
| 4. Manual live smoke (optional) | `RUN_LIVE_INTEGRATION=true npx vitest run src/lib/regime/__tests__/classify.live.test.ts` | Skipped by default ⏸ |
| 5. Wave 0 RED → GREEN | `classify.test.ts` + `vix-percentile.test.ts` + `sentiment-scan-regime.test.ts` | **All 3 stubs now GREEN** ✓ |

---

## Deviations from Plan

None of the auto-fix rules (Rule 1/2/3) fired. Three minor design choices worth recording:

1. **Helper signature** — `classifyRegimeAndPersistForScan` takes `regimeResult` as an argument rather than calling `classifyRegimeAt` internally. The plan's `<action>` block says "hoist `const regimeResult = await classifyRegimeAt(...)` OUTSIDE the per-ticker loop" — making the regime input explicit to the helper enforces that contract structurally (and the unit test #6 asserts the helper does NOT re-classify). The plan's intent is preserved verbatim.

2. **New `ma-cross.test.ts` file** — Wave 0 did not seed a RED stub for the SPY MA-cross helper (the plan's `files_modified:` field calls for `ma-cross.test.ts` explicitly), so Wave 1 added it greenfield. Mirrors `vix-percentile.test.ts` structure for consistency.

3. **Type predicate refactor** — `yahoo-finance2`'s `chart()` quote type has `close: number | null`, so the original `.filter((q): q is {date: Date; close: number} => ...)` pattern hit TS2677 ("type predicate's type must be assignable to its parameter's type"). Refactored to a `for ... of` loop with inline narrowing — same runtime behavior, type-safe. Rule 3 (auto-fix blocking issue): YES (TS would not compile otherwise; Wave 1 cannot complete with TS errors).

---

## Threat-Surface Check

The plan's `<threat_model>` enumerates T-22-01-01..T-22-01-05. All mitigations land in this wave:

| Threat | Disposition | This Wave |
|--------|-------------|-----------|
| T-22-01-01 (hand-curated regime threshold) | mitigate | `hyperparameters.ts` uses Zod-validated module-load constants; no env override path |
| T-22-01-02 (lookahead bias) | mitigate | Every exported helper carries `@knowable_at asOf`; `npm run check-feature-asof` passes; trailing-60d window self-excludes `asOf` |
| T-22-01-03 (silent wrong regime) | mitigate | `console.log('[cron:sentiment-scan] regime', ...)` emitted once per cycle |
| T-22-01-04 (Yahoo `^VIX` deprecation) | mitigate | D-12 Polygon `I:VIX` fallback; D-09 fail-open to `'ALL'` ensures cron continues |
| T-22-01-05 (cron called without CRON_SECRET) | accept | Pre-existing Bearer guard untouched |

No new threat surface beyond what the plan already enumerated.

---

## Known Stubs

None. Every file added or modified in this wave is production-ready:
- The 5 `src/lib/regime/` source files are pure-functional with deterministic semantics.
- The cron edit threads real values from real upstream APIs.
- No placeholder text, no hardcoded mock values, no "coming soon" comments.

---

## Hand-off to Wave 2

> **Wave 2's `/api/cron/backfill-regime` cron reuses `classifyRegimeAt` verbatim for historical PIT classification.** No parallel/forked regime logic per CLAUDE.md rule #6 — Wave 2 calls `classifyRegimeAt({ asOf: snapshot.scanned_at })` for each historical SentimentSnapshot row and threads the same 4-column update payload. The Yahoo + Polygon fallback + cache + holiday-gap fallback are all reused for free.

Wave 2's implementation surface:

| Wave 2 deliverable | Reuses Wave 1 |
|--------------------|---------------|
| `src/app/api/cron/backfill-regime/route.ts` (NEW) | `classifyRegimeAt` from `src/lib/regime/classify.ts` |
| Historical SentimentSnapshot regime backfill | Same 4-column write contract as Wave 1's `classifyRegimeAndPersistForScan` (Wave 2 uses `update` instead of `create`) |
| P27-style checkpoint pattern | Wave 2 owns; Wave 1 does not bootstrap this |
| Transition-zone exclusion (D-05) | Wave 4 (NOT Wave 2) |

---

## Self-Check: PASSED

Verified all artifacts on disk and all commits in git history:

```
FOUND: src/lib/regime/types.ts
FOUND: src/lib/regime/hyperparameters.ts
FOUND: src/lib/regime/vix-percentile.ts
FOUND: src/lib/regime/ma-cross.ts
FOUND: src/lib/regime/classify.ts
FOUND: src/lib/regime/__tests__/classify.test.ts
FOUND: src/lib/regime/__tests__/vix-percentile.test.ts
FOUND: src/lib/regime/__tests__/ma-cross.test.ts
FOUND: src/lib/regime/__tests__/classify.live.test.ts
FOUND: src/app/api/cron/sentiment-scan/route.ts (modified)
FOUND: src/app/api/cron/__tests__/sentiment-scan-regime.test.ts (modified)
FOUND: scripts/check-feature-asof.ts (modified)
FOUND: commit a25ce75 (feat 22-01 Task 1)
FOUND: commit f2c3126 (feat 22-01 Task 2)
```

(self-check commands: `[ -f path ] && echo FOUND || echo MISSING` for each path; `git log --oneline --all | grep -q <hash>` for each commit hash)
