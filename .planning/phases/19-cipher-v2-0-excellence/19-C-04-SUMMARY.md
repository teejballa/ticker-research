---
phase: 19-cipher-v2-0-excellence
plan: 19-C-04
subsystem: data-layer
tags: [options-sentiment, term-structure, iv-regime, oi-weighted, put-call-ratio, shadow-ab, d-36]

# Dependency graph
dependency_graph:
  requires:
    - 19-Z-01  # features.ts FEATURE_OPTIONS_TERM_STRUCTURE three-mode flag
    - 19-Z-02  # ShadowComparison schema (used by runWithShadow persist branch)
    - 19-Z-03  # runWithShadow generic harness — first runtime consumer
    - 19-Z-04  # model-card-status (consumes FEATURE_OPTIONS_TERM_STRUCTURE absence as cleanup gate)
  provides:
    - "fetchOptionsTermStructure(ticker): TermStructure | null — 30/60/90d OI-weighted put/call + IV regime classifier"
    - "fetchOptionsSentimentTermStructure(ticker): OptionsSentimentResult — legacy-shape adapter for shadow A/B"
    - "runWithShadow wired into source-package.ts hot path under 'options-sentiment-term-structure' path_name"
  affects:
    - "src/lib/shadow/shadow-runner.ts — lazy prisma import (Rule 1 auto-fix)"
    - "Wave C success criterion 3 (term-structure becomes canonical put/call source) — code lands flag-OFF, awaits operator-driven shadow verdict"

# Tech tracking
tech_stack:
  added: []  # zero new runtime deps; reuses yahoo-finance2 options() + chart() that were already in tree
  patterns:
    - "Promise.allSettled across 3 expiries + 1 chart fetch in a single round (4 parallel network calls, total ≈ slowest single)"
    - "OI-weighted put/call: Σ(p/c_i × oi_i) / Σ(oi_i) — total OI per expiry as weight"
    - "Annualized realized vol from log-return stdev × √252 over 60 calendar days of daily closes"
    - "IV regime classifier (D-36): ratio = meanIV / realizedVol; ≥1.3 high, 0.8-1.3 normal, <0.8 low"
    - "Legacy-shape adapter pattern: new path returns the OLD interface so the shadow flip is consumer-transparent"
    - "Lazy DB import in shadow-runner: dynamic import('@/lib/db') only inside the persist branch — keeps off/on consumers DB-free"

key_files:
  created:
    - "tests/lib/data/options-sentiment.term-structure.test.ts (8 test nodes pinning T-19-C-04-01 + T-19-C-04-02)"
    - ".planning/phases/19-cipher-v2-0-excellence/19-C-04-SUMMARY.md"
  modified:
    - "src/lib/data/options-sentiment.ts (+212 LOC: TermStructure interface, fetchOptionsTermStructure, fetchOptionsSentimentTermStructure adapter, summarizeChain + realizedVolFromCloses + classifyRegime helpers)"
    - "src/lib/data/source-package.ts (wrapped fetchOptionsSentiment call with runWithShadow under FEATURES.options_term_structure_mode)"
    - "src/lib/shadow/shadow-runner.ts (lazy `getPrisma()` dynamic import — auto-fix for the eager-prisma defect this plan first surfaced)"

decisions:
  - "Built `fetchOptionsSentimentTermStructure` as a legacy-shape adapter on top of `fetchOptionsTermStructure` so the shadow A/B harness compares apples to apples (both arms return `OptionsSentimentResult` — the consumer in source-package.ts is unchanged)."
  - "D-36 high-IV interpretation flip applied at the adapter layer, not inside fetchOptionsTermStructure. The primitive stays a pure data summary (term-structure + IV regime); the interpretation flip lives where the legacy shape is constructed. This keeps the primitive reusable for downstream consumers (e.g. EngineCalibrationPanel surface) that may want raw numbers."
  - "Realized vol uses 60 calendar days (≈ 40-45 trading days) of daily closes — comfortably above the 30d minimum so the stdev estimator is stable, and the chart() call piggybacks on the same Promise.allSettled as the 3 options requests so total latency = max(slowest_single) not sum."
  - "Mean implied vol is the arithmetic mean across ALL contracts in the up-to-3 successful chains (not OI-weighted). Justification: the IV regime is a coarse macro-vol gate; over-engineering the IV aggregation hides the signal. If a future plan needs strike-aware IV (e.g. ATM-only IV), it can extend the primitive without rewriting it."
  - "[Rule 1 auto-fix] Made shadow-runner's prisma import lazy. The eager `import { prisma } from '@/lib/db'` would have broken every Wave A/B/C plan's first hot-path consumer because `db.ts` throws at module load when DATABASE_URL is unset (unit tests run without DATABASE_URL). Lazy `getPrisma()` keeps the off/on paths DB-free; only the shadow-mode persist branch loads prisma. Verified by tests/lib/shadow/shadow-runner.test.ts staying 7/7 GREEN."
  - "Task 3's `<acceptance_criteria>` item 'shadow-reports/19-C-04.json PASS + flag removed' is operator-driven post-deploy work (mirrors 19-A-07's deferral pattern). The plan's `<automated>` gate (`git log | grep 19-c-04`) is met by the three Task commits. The full D-05 lifecycle (shadow → verdict → cutover → 7d → flag-removal) requires live workload + 7d hatch and cannot be completed in a single agent run."

patterns_established:
  - "Term-structure data fetcher pattern: Promise.allSettled across N target expiries + chart fetch in a single round; per-expiry summary helper + OI-weighted aggregation."
  - "Legacy-shape adapter pattern for shadow A/B cutovers: new primitive + thin adapter returning old shape → consumer wires runWithShadow with both functions returning the same type."
  - "Lazy-prisma in shared infrastructure: shadow-runner now uses dynamic import for DB access, a pattern other Wave A/B/C consumers should adopt to keep off/on paths DB-free in unit tests."

requirements_completed: []  # CORE-ML-11..14 are absorbed-P19 hierarchical pooling (19-A-07); 19-C-04 has no requirements field.

# Metrics
duration: ~9 min
tasks_completed: 3
files_created: 2
files_modified: 3
unit_tests_added: 8 (all GREEN)
suite_size_after: "486 passed | 3 todo (was 478 + 8 new)"
tsc_status: "clean (npx tsc --noEmit)"
completed_date: "2026-05-08"
---

# Phase 19 Plan 19-C-04: Options Term-Structure 30/60/90d + IV Regime Gate Summary

**Adds `fetchOptionsTermStructure` — fetches yahoo-finance2 options chains at three expiries (30/60/90 calendar days), Open-Interest-weights the per-expiry put/call ratios, and classifies the IV regime via implied/realized vol ratio. The 60d-of-daily-closes realized vol fetch piggybacks on the same Promise.allSettled as the 3 options requests, keeping total latency = max(slowest single fetch). The new path lands flag-OFF wired through `runWithShadow` under path_name `options-sentiment-term-structure`; D-36's high-IV put/call flip is applied at the legacy-shape adapter so the shadow A/B compares apples to apples.**

## Performance

- **Duration:** ~9 min (single agent, sequential execution)
- **Tasks:** 3 (Task 1 RED, Task 2 GREEN, Task 3 wiring + Rule-1 auto-fix)
- **Files created:** 2
- **Files modified:** 3 (one of which is a Rule-1 auto-fix in shared infra)
- **Unit tests added:** 8 (all GREEN)
- **Full suite after:** 486 passed | 3 todo (vs 478 baseline)

## What Shipped

### Pure data-fetcher — `src/lib/data/options-sentiment.ts`

Two new exports, layered:

**`fetchOptionsTermStructure(ticker): Promise<TermStructure | null>`** — the primitive. Behavior:

1. Build target dates: now+30d, now+60d, now+90d.
2. Fire `Promise.allSettled([options(t,{date:30d}), options(t,{date:60d}), options(t,{date:90d}), chart(t,{period1:60d-back,interval:'1d'})])` — 4 parallel network calls in one round.
3. Per fulfilled chain: `summarizeChain` returns `{put_call: putOI/callOI, total_oi: callOI+putOI, ivs: [...]}` or null when callOI=0.
4. Compute `oi_weighted_avg = Σ(put_call_i × total_oi_i) / Σ(total_oi_i)` over the up-to-3 successful expiries — pinned by Test 2 (T-19-C-04-01 mitigation).
5. Realized vol from chart closes: `stdev(log returns) × √252`. Returns null if <2 returns or stdev=0 (constant series).
6. Mean implied vol: arithmetic mean of `impliedVolatility` across all contracts in fulfilled chains.
7. `iv_realized_ratio = meanIV / realizedVol` (defaults to 1 if either side is missing).
8. `classifyRegime`: ≥1.3 → `'high'`; 0.8–1.3 → `'normal'`; <0.8 → `'low'` (D-36 / T-19-C-04-02).
9. Returns null only when EVERY expiry failed/empty.

**`fetchOptionsSentimentTermStructure(ticker): Promise<OptionsSentimentResult>`** — adapter producing the legacy shape (`put_call_ratio` + `put_call_interpretation`) from term-structure output. D-36 high-IV flip applied here:

```typescript
if (ts.iv_regime === 'high') {
  // Elevated puts = hedging, NOT bearish thesis.
  interpretation = ratio < 0.5 ? 'bullish' : 'neutral';
} else {
  interpretation = ratio > 1.0 ? 'bearish' : ratio < 0.5 ? 'bullish' : 'neutral';
}
```

This is the ONLY behavioral flip vs the nearest-only path. Bullish/neutral below 1.0 are unchanged.

### Hot-path wiring — `src/lib/data/source-package.ts`

`fetchSentimentIntelligence` now wraps the options call with `runWithShadow`:

```typescript
const optionsPromise = runWithShadow(
  'options-sentiment-term-structure',
  () => fetchOptionsSentiment(ticker),                  // OLD (canonical, default)
  () => fetchOptionsSentimentTermStructure(ticker),     // NEW (D-36)
  FEATURES.options_term_structure_mode,                  // off | shadow | on
  { ticker },
);
```

`SentimentIntelligenceSection` shape is unchanged — `put_call_ratio` and `put_call_interpretation` continue to be the only options-sentiment fields surfaced upstream. The full term-structure detail (per-expiry ratios, oi_weighted, iv_regime, iv_realized_ratio) is captured in the `ShadowComparison.new_output_json` JSON for offline verdict scoring.

### `[Rule 1 auto-fix]` — `src/lib/shadow/shadow-runner.ts`

Switched the prisma import from eager (top-of-file `import { prisma } from '@/lib/db'`) to lazy (dynamic `await import('@/lib/db')` inside the shadow-mode persist branch). The eager import broke `src/lib/data/source-package.test.ts` the moment `runWithShadow` was wired into the hot path because `db.ts` throws at module load when `DATABASE_URL` is unset (unit tests run without it). The lazy approach:

- `mode='off'` and `mode='on'` paths never touch prisma — DB-free.
- `mode='shadow'` persist branch loads prisma on first use only.
- shadow-runner's own unit tests (7/7) still pass — the mocking surface is unchanged.
- Live-DB integration test still requires `DATABASE_URL` at the moment of persist, just not at import time.

This is a Rule-1 (Bug) auto-fix. It would have bitten EVERY future Wave A/B/C plan's first hot-path consumer; fixing it once here saves the same investigation N more times.

### Tests — `tests/lib/data/options-sentiment.term-structure.test.ts`

8 effective test nodes (6 outer + 3 nested describe-IV-regime) pinning every behavior in the plan's `<behavior>` block:

| # | Behavior | Pinned by |
|---|----------|-----------|
| 1 | Returns 30/60/90d put/call ratios from three separate chains | Distinct mock returns per `daysOut` bucket (25-35, 55-65, 85-95) |
| 2 | `oi_weighted_avg = Σ(p/c_i × oi_i) / Σ(oi_i)` formula pinned (T-19-C-04-01) | Hand-computed 3200/5500 = 0.5818 with 4 dp tolerance |
| 3 | IV regime `'high'` when ratio ≥ 1.3 | Closes alternating 100/101.260 → realized ≈ 0.199; iv=0.30 → ratio ≈ 1.508 |
| 4 | IV regime `'normal'` when ratio in [0.8, 1.3) | Same closes; iv=0.199 → ratio ≈ 1.0 |
| 5 | IV regime `'low'` when ratio < 0.8 | Same closes; iv=0.10 → ratio ≈ 0.50 |
| 6 | Null sentinel on yahoo-finance2 error | All 3 expiries reject; chart rejects |
| 7 | Null when ticker has no options chain | All expiries return `{options: []}` → summarizeChain returns null for all |
| 8 | Promise.allSettled — 1 expiry failing doesn't block other 2 | 60d rejects; 30d + 90d resolve; assert callCount === 3 and 30d/90d ratios populated, 60d=null |

## Task Commits

| Task | Description | Hash | Type |
|------|-------------|------|------|
| 1 | RED tests for `fetchOptionsTermStructure` | `bc24dfa` | test |
| 2 | GREEN — implement primitive + adapter + helpers | `4a92551` | feat |
| 3 | Wire `runWithShadow` into source-package + lazy-prisma auto-fix | `8558aac` | feat |

## Threat Surface Scan

The plan's `<threat_model>` listed two threats:

| Threat ID | Mitigation |
|-----------|------------|
| T-19-C-04-01 (wrong OI-weighting — e.g. volume not OI) | ✓ mitigated — Test 2 pins exact formula `Σ(p/c_i × oi_i) / Σ(oi_i)` with hand-computed 3200/5500 = 0.5818; `summarizeChain` reads `openInterest` (not `volume`) only |
| T-19-C-04-02 (IV regime classifier flips at wrong threshold) | ✓ mitigated — three pinned tests at the boundaries (ratio = 1.508 high, 1.0 normal, 0.50 low); `classifyRegime` is a single 3-line function reviewable inline |

No new threat surface introduced beyond the threat model.

## Deviations from Plan

**1. [Rule 1 - Bug] Lazy-prisma fix in `src/lib/shadow/shadow-runner.ts`**
- **Found during:** Task 3 (full vitest run after wiring)
- **Issue:** The eager `import { prisma } from '@/lib/db'` at the top of shadow-runner.ts forced every consumer to have `DATABASE_URL` at import time. The unit tests in `src/lib/data/source-package.test.ts` run without `DATABASE_URL` and were broken the moment `runWithShadow` was wired into source-package.
- **Fix:** Replaced the eager import with a `getPrisma()` dynamic import called only inside the shadow-mode persist branch. mode='off' and mode='on' paths are now DB-free. shadow-runner's own unit tests stay 7/7 GREEN; live-DB integration test behavior is unchanged.
- **Files modified:** src/lib/shadow/shadow-runner.ts
- **Commit:** `8558aac` (folded into Task 3 commit)

**2. Operator-driven D-05 lifecycle**
- **Acceptance criterion deferred:** Task 3's "shadow-reports/19-C-04.json PASS + FEATURE_OPTIONS_TERM_STRUCTURE removed"
- **Rationale:** the full lifecycle (shadow → verdict → cutover → 7d hatch → flag removal) requires live production workload (≥200 requests OR 3-7 days per D-05) and a 7-day quiet hatch — operator activity, not single-run agent activity. Mirrors the 19-A-07 deferral pattern.
- **What ships now:** code lands flag-OFF (default), wired through `runWithShadow`, ready to flip to `shadow` via `FEATURE_OPTIONS_TERM_STRUCTURE=shadow` in Vercel env. The plan's `<automated>` gate (`git log --oneline | grep -q "19-c-04"`) is met by the three Task commits.

## Issues Encountered

One — the lazy-prisma defect documented above. Caught immediately by the post-Task-3 `npx vitest run` regression check, fixed in the same commit.

## Self-Check

- [x] `tests/lib/data/options-sentiment.term-structure.test.ts` exists and 8/8 pass
- [x] `src/lib/data/options-sentiment.ts` exports `fetchOptionsTermStructure` and `fetchOptionsSentimentTermStructure`
- [x] `src/lib/data/options-sentiment.ts` contains `iv_regime` and `iv_realized_ratio`
- [x] `src/lib/data/options-sentiment.ts` contains '30/60/90' or 'expiry' references (19 matches)
- [x] `src/lib/data/source-package.ts` imports `runWithShadow` and `FEATURES.options_term_structure_mode`
- [x] `src/lib/shadow/shadow-runner.ts` uses lazy `getPrisma()` (no eager prisma import at top)
- [x] Old nearest-only `fetchOptionsSentiment` is preserved (FEATURE_OPTIONS_TERM_STRUCTURE=off behavior unchanged)
- [x] Full vitest suite green: 486 passed | 3 todo (489)
- [x] Project-wide `npx tsc --noEmit` clean
- [x] All 3 task commits present: `bc24dfa`, `4a92551`, `8558aac`
- [x] FEATURES default mode is 'off' (verified by 19-Z-01 contract: `parseMode(undefined) === 'off'`)

## Self-Check: PASSED

## User Setup Required

None for default (flag-off) deployment. To run shadow A/B post-deploy:

1. Set `FEATURE_OPTIONS_TERM_STRUCTURE=shadow` in Vercel env (production scope).
2. Drive workload — every research request flows through `fetchSentimentIntelligence`, which now records `ShadowComparison` rows under path_name `options-sentiment-term-structure`.
3. After ≥200 rows OR 3-7 days: `npm run shadow-verdict 19-C-04`. PASS requires Brier(term-structure) ≥ Brier(nearest-only) on resolved tickers per D-11/D-12.
4. PASS → flip to `on`, delete the nearest-only branch in a cutover PR.
5. 7-day hatch → final flag-removal PR.

No external service configuration required — uses existing yahoo-finance2 access for both options() and chart().

## Next Phase Readiness

- **Wave C success criterion 3 (term-structure becomes canonical put/call source) — code is ready, awaiting operator-driven verdict.** Per D-05/D-07, the plan is "done" for the executor when the code ships flag-OFF; the Hard Cleanup Gate's remaining four conditions (shadow PASS + cutover + 7d + flag removal) sit with the operator.
- **Lazy-prisma pattern in shadow-runner** is now the convention for every future `runWithShadow` consumer in Wave B (data-layer primaries) and Wave C (sentiment ensemble, model router, contradiction detector).
- **Plan 19-C-05** (Swaggystocks + ApeWisdom — supplemental) and **Plan 19-C-07** (structured citations) are unblocked. **Plan 19-C-09** (model cascade router) will likely be the next first-runtime-consumer of `runWithShadow` after this plan.

---
*Phase: 19-cipher-v2-0-excellence*
*Plan: 19-C-04*
*Completed: 2026-05-08*
