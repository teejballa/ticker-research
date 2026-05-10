---
phase: 19-cipher-v2-0-excellence
plan: 19-B-07
subsystem: data-layer
tags: [vercel-runtime-cache, use-cache-directive, source-package, idempotency, shadow-ab, feature-flags, runWithShadow, next-js-cache-components]

# Dependency graph
requires:
  - phase: 19-cipher-v2-0-excellence/19-Z-01
    provides: Three-mode FeatureMode flag matrix + FEATURES.data_cache_mode
  - phase: 19-cipher-v2-0-excellence/19-Z-02
    provides: ShadowComparison Prisma table — JSONB old/new payloads + per-call latencies
  - phase: 19-cipher-v2-0-excellence/19-Z-03
    provides: runWithShadow<T>() harness — used at the route layer to gate the cache wrapper
  - phase: 19-cipher-v2-0-excellence/19-B-01..05
    provides: Wave-B adapters (Tiingo, Twelve Data, Exa) + Upstash cache + retry — already integrated upstream of collectAllData via 19-B-06
  - phase: 19-cipher-v2-0-excellence/19-B-06
    provides: collectAllData refactored into a runWithShadow('source-package-merge', ...) gate over old + new ladders — both ladders now sit downstream of the runtime-cache wrapper
provides:
  - getCachedSourcePackage(ticker, companyName, exchange, securityType) — Next cache-components wrapper around collectAllData with 10-minute idempotency (D-30)
  - Top-level 'use cache' directive in src/lib/data/cache/runtime-cache.ts (Next 15.5 form; forward-compatible with Next 16's 'use cache: remote' variant)
  - unstable_cacheLife({ revalidate: 600, expire: 600 }) — D-30 cache-life target
  - runWithShadow('runtime-cache', ...) gate in /api/research/[ticker]/route.ts — shadow path is the cached wrapper, canonical path is the existing direct collectAllData call
  - experimental.cacheComponents + experimental.useCache enabled in next.config.ts so the directive compiles
  - 5 unit tests in tests/lib/data/cache/runtime-cache.test.ts guarding wrapper invariants (directive presence, cacheLife TTL = 600/600, assembler import path, parity with collectAllData)
affects: [19-B-08 (rollout driver flips FEATURE_DATA_CACHE → on), 19-Z-04 (model-card-status: no new cutover grep pattern needed — 'use cache' is end-state code, not transition code)]

# Tech tracking
tech-stack:
  added: []                              # no new runtime deps — uses Next.js's built-in cache components
  patterns:
    - "'use cache' top-of-file directive + unstable_cacheLife({revalidate, expire}) — Next 15.5 cache-components surface; framework derives cache key from function arguments (T-19-B-07-01 mitigation: no hand-rolled hashing)"
    - "Cache layer composed OUTSIDE the inner runWithShadow('source-package-merge', ...) gate from 19-B-06, so BOTH old and new ladders share cache hits during the parallel shadow window"
    - "Cache layer wrapped by an OUTER runWithShadow('runtime-cache', ...) at the route layer for canonical-vs-cached parity measurement — the shadow harness writes ShadowComparison rows so verdict CLI can score cache hit rate ≥70% (Wave-B success metric)"
    - "Idempotency key is ticker-only (no user_id) — SourcePackage carries no per-user data; per-user filtering happens AFTER SourcePackage in /api/analysis (T-19-B-07-02 mitigation: no cross-tenant leak surface)"

key-files:
  created:
    - src/lib/data/cache/runtime-cache.ts                 # 'use cache' wrapper around collectAllData with cacheLife(600/600)
    - tests/lib/data/cache/runtime-cache.test.ts         # 5 wrapper-invariant unit tests
    - .planning/phases/19-cipher-v2-0-excellence/19-B-07-SUMMARY.md
  modified:
    - next.config.ts                                       # +experimental.cacheComponents=true + experimental.useCache=true
    - src/app/api/research/[ticker]/route.ts              # +imports + runWithShadow('runtime-cache',...) gate around collectAllData

key-decisions:
  - "Used 'use cache' (not 'use cache: remote') and unstable_cacheLife (not bare cacheLife) because the pinned Next.js version is 15.5.15. The plan's NOTE TO EXECUTOR explicitly anticipated that the directive variant might have shifted from training-data assumptions and authorized adapting the API. The Next 16 'use cache: remote' superset can be swapped in by editing one string when 19-B-08 brings the framework upgrade — no other changes needed in runtime-cache.ts."
  - "Did NOT bump Next.js to 16.x in this plan. That is an architectural change touching every route + adding a Next 16 codemod migration; per Rule 4 it would require user authorization, and the plan's Task 1 explicitly authorized the postpone-or-adapt path. Adapting the API was the lower-risk choice that ships today AND keeps the 19-B-08 rollout simple."
  - "Cache layer wraps OUTSIDE the inner runWithShadow('source-package-merge', ...) gate from 19-B-06. This is intentional: during the 19-B-06 shadow window, BOTH the old ladder (canonical) AND the new ladder (shadow) share cache hits when FEATURE_DATA_CACHE=on. Reverse layering (cache inside merge-shadow) would force the new ladder to refetch even when an identical cached response exists — wasted upstream API calls."
  - "Outer runWithShadow('runtime-cache', ...) at the route layer measures cache-vs-no-cache parity. The shadow harness writes ShadowComparison rows so the verdict CLI can score cache hit rate, latency-p50 reduction, and output disagreement (must be < 1% per plan's PASS criteria) without ever blocking the user-facing path (D-14)."
  - "Reused the existing FEATURES.data_cache_mode flag — already declared in src/lib/features.ts as 'data_cache' and parsed via FEATURE_DATA_CACHE env var. Default mode='off' means zero behavior change for current users."
  - "Wrapper signature includes (ticker, companyName, exchange, securityType) — Next cache components key off the full argument tuple. Including these means the cache distinguishes ticker variants where company-name lookup yielded different results (e.g. exchange suffix changes), avoiding stale-companyname leaks across tickers that share a base symbol on different exchanges."
  - "Tests use a parity-test pattern (per the plan's Task 2 alternative): the 'use cache' directive is a Next-compiler feature that vitest cannot exercise alone, so the test file asserts the wrapper's source-text invariants (directive present, cacheLife TTL = 600/600, delegates to collectAllData, no field transformation) plus a parity smoke test stripping the directive. End-to-end cache-hit verification is operator-driven via the Task 6 shadow lifecycle."
  - "Tasks 6a–6f (env flag flip → 3-7d shadow window → verdict CLI run → cutover PR → 7-day rollback hatch → flag-removal PR) are operator-driven over calendar days, identical to the 19-B-06 lifecycle deferral. This SUMMARY documents code completion through Task 5; Task 6 continues out-of-band."

patterns-established:
  - "Cache-components wrapper pattern for SourcePackage-tier idempotency: top-of-file 'use cache' directive + unstable_cacheLife at function entry + thin delegate to the assembler. Reusable for any future SourcePackage-adjacent reducer (e.g. analysis-result cache if Phase 24+ ever needs one)."
  - "Two-layer shadow wrapping for cache rollouts: inner runWithShadow gates the data-source ladder, outer runWithShadow gates the cache itself. Both layers operate independently, so partial rollouts (cache on but ladder still in shadow, or vice-versa) are safe and measurable."
  - "Defensive forward-compatibility comment in the wrapper itself: 'when we upgrade to Next 16 via Plan 19-B-08, swap the directive string and nothing else needs to change here.' Future agents reading the file know exactly what one-character change unlocks the Next 16 superset."

requirements-completed: []                # frontmatter requirements: [] in PLAN.md

# Metrics
duration: 7min
completed: 2026-05-08
---

# Phase 19 Plan 19-B-07: Vercel Runtime Cache Integration (10min SourcePackage Idempotency) Summary

**D-30 lands the Next.js cache-components 'use cache' wrapper around `collectAllData` with cacheLife({revalidate: 600, expire: 600}) for 10-minute SourcePackage idempotency, gated at the /api/research/[ticker] route layer by runWithShadow('runtime-cache', ...) on FEATURES.data_cache_mode so the cache hit rate ≥70% Wave-B success metric is measurable in shadow before cutover.**

## Performance

- **Duration:** ~7min (Tasks 1–5 code completion)
- **Started:** 2026-05-08T18:37Z
- **Completed (code-side):** 2026-05-08T18:42Z (Task 6 lifecycle Tasks 6a–6f are operator-driven over calendar days)
- **Tasks committed:** 4 atomic commits (Tasks 1, 2 RED, 3 GREEN, 4)
- **Files touched:** 4 (2 modified, 2 created, 0 deleted)
- **Unit suite:** 649 passed | 2 skipped | 3 todo (654) — full project green
- **Project-wide tsc --noEmit:** clean

## Accomplishments

- **`getCachedSourcePackage` wrapper** in `src/lib/data/cache/runtime-cache.ts` — top-of-file `'use cache'` directive + `unstable_cacheLife({ revalidate: 600, expire: 600 })` + thin delegate to `collectAllData`. 10min idempotency per D-30. Cache key compiler-derived from `(ticker, companyName, exchange, securityType)` tuple — no hand-rolled hashing (T-19-B-07-01 mitigation).
- **Route handler wired** in `src/app/api/research/[ticker]/route.ts` via `runWithShadow('runtime-cache', () => collectAllData(...), () => getCachedSourcePackage(...), FEATURES.data_cache_mode, { ticker })`. Shadow harness composed OUTSIDE the cache so cache-vs-no-cache parity is measurable; ShadowComparison rows feed the verdict CLI for the ≥70% hit-rate scoring.
- **`next.config.ts` enabled cache components** — `experimental.cacheComponents = true` + `experimental.useCache = true` so the `'use cache'` directive compiles. Forward-compatible with the Next 16 upgrade tracked in Plan 19-B-08.
- **5 unit tests** in `tests/lib/data/cache/runtime-cache.test.ts` guarding wrapper invariants: directive present (accepts both `'use cache'` and `'use cache: remote'` so the file survives the future 16.x string swap without test churn), cacheLife TTL = 600/600, source-package import path, parity with collectAllData (no field transformation).
- **Two-layer shadow architecture established:** outer `runWithShadow('runtime-cache', ...)` gates the cache itself, inner `runWithShadow('source-package-merge', ...)` from 19-B-06 gates the data-source ladder. Both layers measure independently, so partial rollouts are safe.
- **Zero new runtime dependencies** — Next.js's built-in cache components handle everything.

## Task Commits

Each task was committed atomically (all on `main`):

1. **Task 1: enable cacheComponents + useCache in next.config.ts** — `2850cf6` (feat)
2. **Task 2 (RED): runtime-cache wrapper unit tests** — `a86c597` (test)
3. **Task 3 (GREEN): getCachedSourcePackage runtime-cache wrapper** — `bc96bd3` (feat)
4. **Task 4: wire getCachedSourcePackage behind FEATURE_DATA_CACHE shadow** — `b92d389` (feat)

_Note: Task 5 ("initial commit, flag off") is satisfied by the four atomic per-task commits above — the flag default is `off` per `src/lib/features.ts`, and the route gate honors that. Task 6 (env flip → shadow → verdict → cutover → 7d hatch → flag removal) is operator-driven over calendar days, identical to 19-B-06 Tasks 5b–5g._

## Files Created / Modified

### Created

- **`src/lib/data/cache/runtime-cache.ts`** — 70 lines. Top-of-file `'use cache'` directive; imports `unstable_cacheLife as cacheLife` from `next/cache` and `collectAllData` from `@/lib/data/source-package`. Single exported function `getCachedSourcePackage(ticker, companyName, exchange, securityType)` calls `cacheLife({ revalidate: 600, expire: 600 })` then delegates. Inline comments document the Next 15.5 vs 16 directive variants and the 19-B-08 upgrade swap.
- **`tests/lib/data/cache/runtime-cache.test.ts`** — 5 vitest unit tests under the `'runtime-cache wrapper (Plan 19-B-07)'` describe block. Tests use `vi.mock('@/lib/data/source-package')` to avoid network calls and `fs.readFileSync` to assert source-text invariants. Parity test strips the directive and verifies the body still references `collectAllData`.
- **`.planning/phases/19-cipher-v2-0-excellence/19-B-07-SUMMARY.md`** — this file.

### Modified

- **`next.config.ts`** — added `experimental: { cacheComponents: true, useCache: true }`. Comment header explains why both flags are present (15.5 vs 16 forward-compat) and references this plan + the 19-B-08 upgrade.
- **`src/app/api/research/[ticker]/route.ts`** — added 3 imports (`getCachedSourcePackage`, `FEATURES`, `runWithShadow`) and replaced the direct `collectAllData(...)` call with the runWithShadow gate. Pre-existing functionality (yahoo quote lookup, security-type detection, temp-file write) untouched.

## Decisions Made

1. **Used `'use cache'` (not `'use cache: remote'`) and `unstable_cacheLife` (not bare `cacheLife`).** The plan was authored against the Next 16 cache-components surface. The pinned project version is Next 15.5.15 — verified via `node -p "require('next/package.json').version"`. The plan's Task 1 explicit NOTE TO EXECUTOR authorized adapting the API: "If the API has shifted (e.g., from `'use cache: remote'` to a different directive), update the runtime-cache.ts accordingly." The `'use cache'` directive + `unstable_cacheLife({revalidate, expire})` is the supported 15.5 surface; both compile cleanly with `experimental.cacheComponents + useCache` enabled. When 19-B-08 brings the Next 16 upgrade, the directive becomes a one-character swap (add `: remote`) and the import becomes `cacheLife` (drop the `unstable_` prefix). Test file already accepts both forms via the `(?:: remote)?` regex so the test stays green across the upgrade.

2. **Did NOT bump Next.js to 16.x in this plan.** That is an architectural change touching every route + requiring the Next 16 codemod migration. Per Rule 4 it would require user authorization. The plan explicitly offered "update Next FIRST or postpone" as alternatives; adapting the API was the lower-risk middle path that ships the 10min idempotency feature today AND simplifies the 19-B-08 rollout (which can now batch the framework upgrade with the FEATURE_DATA_CACHE flag flip).

3. **Cache layer wraps OUTSIDE the inner runWithShadow('source-package-merge', ...) gate from 19-B-06.** This is intentional. During the 19-B-06 shadow window (FEATURE_TIINGO/TWELVEDATA/EXA_PRIMARY=shadow), BOTH the old and new ladders run in parallel. Putting the cache OUTSIDE the merge-shadow means a cache hit serves both layers from the SAME cached SourcePackage — old and new ladders see consistent cached input. Reverse layering would force the new ladder to refetch upstream APIs even when an identical cached response exists — wasted API spend during the parallel shadow window.

4. **Outer runWithShadow at the route layer measures cache-vs-no-cache parity.** The shadow harness writes ShadowComparison rows with both old (uncached) and new (cached) outputs + latencies. The verdict CLI can score: (a) cache hit rate ≥70%, (b) latency-p50 reduction, (c) output disagreement < 1% — all three Wave-B PASS criteria. Per D-14, new-path latency tracked but never blocks user response.

5. **Wrapper signature includes `(ticker, companyName, exchange, securityType)`.** Next cache components key off the full argument tuple. Including these means the cache distinguishes (e.g.) `BHP` on NYSE vs `BHP` on ASX where Yahoo's quote lookup yielded different `companyName` / `exchange` values. Reduces the surface for stale-companyname leaks across same-symbol-different-exchange tickers.

6. **Reused existing FEATURES.data_cache_mode flag.** Already declared in `src/lib/features.ts` (FLAG_NAMES → `'data_cache'` → `FEATURE_DATA_CACHE` env var → `data_cache_mode` accessor). Default `off` means zero behavior change for current users until operator flips the flag.

7. **Tests use a parity-test pattern (per plan's Task 2 alternative).** The `'use cache'` directive is a Next-compiler feature; plain vitest cannot exercise it. The test file therefore asserts source-text invariants (directive present, cacheLife TTL = 600/600, source-package import path) + a parity smoke test that strips the directive and verifies the body still delegates to `collectAllData`. End-to-end cache-hit verification is operator-driven via the Task 6 shadow lifecycle.

8. **Task 6 (env flip → shadow → verdict → cutover → 7d hatch → flag removal) is operator-driven over calendar days.** Identical to 19-B-06 Tasks 5b–5g. This SUMMARY documents code completion through Task 5; Task 6 continues out-of-band. No cutover-time grep pattern is registered in `scripts/model-card-grep-patterns.json` because the cache code is end-state — the `'use cache'` directive stays after cutover (unlike 19-B-06 where `buildSourcePackageOldLadder` must be deleted post-cutover).

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3 — Blocking] Next 15.5 vs Next 16 directive surface mismatch.**
   - **Found during:** Task 1 / Task 3 (verifying Next.js version + reading `node_modules/next/dist/server/use-cache/cache-life.d.ts`).
   - **Issue:** Plan was authored against the Next 16 `'use cache: remote'` directive + bare `cacheLife` import. The pinned project version is Next 15.5.15, which exports `unstable_cacheLife` (not `cacheLife`) from `next/cache` and supports `'use cache'` (not `'use cache: remote'`). Using the Next-16-only API as written would have caused the wrapper to fail to compile.
   - **Fix:** Adapted the wrapper to the 15.5 surface — `'use cache'` directive + `import { unstable_cacheLife as cacheLife } from 'next/cache'`. Forward-compatibility comment in the wrapper itself documents the one-character change needed for the Next 16 upgrade. Tests use a regex that accepts both directive forms so they stay green across the upgrade. The plan's Task 1 NOTE TO EXECUTOR explicitly authorized this adaptation.
   - **Files modified:** `src/lib/data/cache/runtime-cache.ts`, `tests/lib/data/cache/runtime-cache.test.ts`, `next.config.ts` (added `experimental.useCache: true` to enable the directive on 15.5).
   - **Commit:** rolled into Task 1 commit `2850cf6` (next.config.ts) + Task 3 commit `bc96bd3` (wrapper) + Task 2 commit `a86c597` (regex-tolerant tests).

### Out-of-Scope Items Logged (Not Auto-Fixed)

1. **Pre-existing `<<<<<<< HEAD` marker at `.planning/ROADMAP.md` line 126.** Discovered while inspecting ROADMAP for the Wave-B plan-progress entries. Marker has no `=======` or closing `>>>>>>>`, so it is NOT a live merge conflict — appears to be cosmetic artifact from a previous merge. Out of scope per executor scope-boundary rules; logged here so a future doc-tidying plan can clean it up. The Plan 19-B-07 ticking edit operates above the marker (line 124), so no interaction.

2. **Vercel-functions observability hook validation suggestion** (route handler line 22 — "no observability instrumentation"). Out of scope — Plan 19-B-07 has no observability requirements, and adding logging / OTel to the research route is an architectural change deserving its own plan. Suggestion logged for a future P28 (Live Engine Performance Dashboard) or dedicated observability plan.

## Threat Surface Scan

The plan's `<threat_model>` listed two threats; both mitigated:

| Threat ID | Mitigation |
|-----------|------------|
| T-19-B-07-01 (stale data served past 10min idempotency) | `cacheLife({ revalidate: 600, expire: 600 })` — both at 600s. Test 3 asserts both numerals in the wrapper source. Cache key compiler-derived from the function-argument tuple — no hand-rolled hashing bugs (per RESEARCH "Don't Hand-Roll" guidance). |
| T-19-B-07-02 (cached SourcePackage cross-tenant leak) | Cache key includes only `(ticker, companyName, exchange, securityType)` — no `user_id` ever flows into the cache key. SourcePackage carries no per-user data; per-user filtering happens AFTER SourcePackage in the /api/analysis flow. Verified by inspection — no user-keyed fields anywhere in the wrapper signature. |

No new threat surface introduced.

## Issues Encountered

None blocking. The Next.js version mismatch (Rule 3) was anticipated by the plan's NOTE TO EXECUTOR and resolved inline by adapting the API surface. The full unit suite ran clean throughout each task gate.

## Self-Check

- [x] `next.config.ts` contains `cacheComponents: true` (verified: `grep -q "cacheComponents" next.config.ts` ✓)
- [x] `src/lib/data/cache/runtime-cache.ts` exists with top-of-file `'use cache'` directive (verified: `head -1` ✓)
- [x] Wrapper imports `unstable_cacheLife` from `next/cache` and `collectAllData` from `@/lib/data/source-package` (verified by inspection)
- [x] Wrapper calls `cacheLife({ revalidate: 600, expire: 600 })` (verified: `grep -q "cacheLife" src/lib/data/cache/runtime-cache.ts` ✓)
- [x] `tests/lib/data/cache/runtime-cache.test.ts` exists and 5/5 pass (`✓ tests/lib/data/cache/runtime-cache.test.ts (5 tests) 24ms`)
- [x] Route handler `src/app/api/research/[ticker]/route.ts` contains `getCachedSourcePackage` import (verified: `grep -q` ✓)
- [x] Route handler contains `runWithShadow.*runtime-cache` (verified: plan's `<automated>` grep ✓)
- [x] Route handler contains `data_cache_mode` (verified: `grep -q` ✓)
- [x] All 4 task commits present: `2850cf6`, `a86c597`, `bc96bd3`, `b92d389` (verified: `git log --oneline | grep "19-b-07"` returns 4 lines ✓)
- [x] Project-wide `npx tsc --noEmit` clean
- [x] Full vitest suite green: `Tests 649 passed | 2 skipped | 3 todo (654)` (5 new tests above the pre-plan baseline of 644 — exactly the 5 added in Task 2)

## Self-Check: PASSED

## User Setup Required

None for code-side work. For Task 6 lifecycle (operator-driven):

- **Task 6a (env flip):** `vercel env add FEATURE_DATA_CACHE shadow production && vercel --prod`
- **Task 6b (drive workload):** ≥3 days OR ≥200 ShadowComparison rows for `path_name='runtime-cache'`. Monitor: `psql $DATABASE_URL -c "SELECT count(*) FROM \"ShadowComparison\" WHERE path_name='runtime-cache';"`
- **Task 6c (verdict):** `npm run shadow-verdict 19-B-07` → must produce `shadow-reports/19-B-07.json` with `"verdict": {"result": "PASS"}` AND cache hit rate ≥0.70 AND latency_p50 reduction observable AND output disagreement <0.01.
- **Task 6d (cutover PR):** flip `FEATURE_DATA_CACHE` to `on`, REMOVE the `runWithShadow` wrapper around the cache call (replace with direct `getCachedSourcePackage(...)` — and keep the canonical fallback path documented as a single-line comment for the 7d hatch).
- **Task 6e (7d hatch):** Watch `RollbackLog WHERE feature_flag = 'FEATURE_DATA_CACHE'`. If non-empty, file failure plan.
- **Task 6f (flag removal):** Remove `'data_cache'` from FLAG_NAMES in `src/lib/features.ts` and from `.env.example`; final commit. _Optionally_ at 19-B-08 time, swap the `'use cache'` directive to `'use cache: remote'` and the import from `unstable_cacheLife` to `cacheLife` once Next 16 lands — single-character + single-import change.

## Next Phase Readiness

- **Ready for 19-B-08** — rollout driver flips FEATURE_DATA_CACHE through shadow → on → flag-removed. The two-layer shadow architecture (cache + merge) means 19-B-08 can flip flags independently or together based on evidence accumulated.
- **Ready for Next 16 upgrade** — runtime-cache.ts and the test file are forward-compatible. The directive-variant comment in the wrapper documents the one-character swap needed.
- **Operational signal:** post-Task-6c verdict report at `shadow-reports/19-B-07.json` will quantify the cache hit rate and the p50 latency drop for the SourcePackage idempotency window.

---
*Phase: 19-cipher-v2-0-excellence*
*Plan: 19-B-07*
*Completed: 2026-05-08 (code-side; Task 6 operator-driven)*
