---
phase: 19-cipher-v2-0-excellence
plan: 19-C-06
subsystem: data
tags: [quiver, insider-trades, congressional-trades, opt-in, community-aggregated, vercel-functions, bearer-auth, upstash-cache]

# Dependency graph
requires:
  - phase: 19-cipher-v2-0-excellence/19-Z-01
    provides: feature flag scaffolding (Phase 19 contract; D-38 opts out of flag in favor of env-presence gate)
  - phase: 19-cipher-v2-0-excellence/19-Z-02
    provides: SentimentSnapshot.community_aggregated JSONB column (target storage for quiver_insider / quiver_congressional)
  - phase: 19-cipher-v2-0-excellence/19-B-01
    provides: cached() Upstash wrapper + CACHE_KEYS / TTL_SECONDS namespaces
  - phase: 19-cipher-v2-0-excellence/19-B-02
    provides: withRetry() classifier + isRetryableError() (5xx + network only, never 4xx)
provides:
  - fetchQuiverInsider(ticker) → QuiverInsiderData | null
  - fetchQuiverCongressional(ticker) → QuiverCongressionalData | null
  - Additive quiver_insider / quiver_congressional fields on EnrichedSnapshot (lightweight-community-scan)
affects: [19-C-05, future SentimentSnapshot.community_aggregated writers, /research/[ticker] future Quiver-derived signals]

# Tech tracking
tech-stack:
  added: []                                # no new runtime deps — reuses cached() + withRetry()
  patterns:
    - "Opt-in adapter pattern: getApiKey() returns null on missing env; all public fetchers short-circuit to null BEFORE the cache key is computed (T-19-C-06-02 belt-and-suspender)."
    - "Bearer-auth via Authorization header — key never URL-interpolated, never logged (T-19-C-06-01)."
    - "Canonical projection: upstream wire shapes (PascalCase) mapped to internal snake_case fields so DB JSONB column shape stays stable across upstream API drift."

key-files:
  created:
    - src/lib/data/adapters/quiver.ts
    - tests/lib/data/adapters/quiver.test.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-C-06-SUMMARY.md
  modified:
    - .env.example                                # +QUIVER_API_KEY block
    - src/lib/data/lightweight-community-scan.ts  # +quiver_insider / quiver_congressional Promise.all branches
    - .planning/ROADMAP.md                        # 19-C-06 ticked

key-decisions:
  - "D-38 opt-in is enforced by env-presence, not by a feature flag. getApiKey() returns null on unset/empty env; both public fetchers short-circuit BEFORE touching the cache or the network. This is belt-and-suspender against T-19-C-06-02 (adapter accidentally activates without explicit opt-in)."
  - "Cache TTL = 24h (TTL_SECONDS.fundamentals namespace). Insider Form 4 filings + congressional STOCK Act disclosures are slow-moving — daily granularity is more than sufficient for the diffusion engine."
  - "Cache key namespace = `comm:${TICKER}:quiver:insider` and `:quiver:congressional` — uses CACHE_KEYS.community() prefix per 19-B-01 convention, with explicit `:quiver:<endpoint>` suffix to prevent collision with future supplemental sources (Swaggystocks, ApeWisdom from 19-C-05)."
  - "Wired directly into lightweightCommunityScan instead of into a (not-yet-existing) communityWithSupplemental wrapper from 19-C-05. Plan Task 4 referenced the wrapper as if 19-C-05 were already shipped; since it isn't, the additive direct-wire preserves the plan's spirit (no flag, no shadow, no-op when key missing) and stays forward-compatible — 19-C-05 can lift this into the supplemental wrapper when it lands."
  - "Both fetchers wrapped with .catch(() => null) inside the Promise.all — defense in depth: even though both already return null on any failure, an unexpected throw from a future code path can never crash the primary Firecrawl/StockTwits scan."

patterns-established:
  - "Opt-in env-presence gate (no feature flag) for cost-bearing optional data sources — pattern reusable for future $X/mo adapters that should be no-op by default in dev/preview."
  - "Defensive Promise.all wrapping for already-null-safe fetchers when fanned out alongside critical-path sources."

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-05-10
---

# Phase 19 Plan 19-C-06: Quiver Adapter (Insider + Congressional, Optional Flag) Summary

**Quiver Hobbyist ($30/mo) insider + congressional trade adapter, opt-in via `QUIVER_API_KEY` env presence per D-38 — both fetchers no-op silently when key is unset; cached 24h, retry 3x on 5xx, never logs the API key.**

## Performance

- **Duration:** ~6min (2026-05-10T01:06Z → 2026-05-10T01:12Z)
- **Tasks:** 5 (5/5 acceptance gates passed)
- **Files:** 3 created, 3 modified
- **Tests:** 7/7 GREEN; full unit suite 618 passed (no regressions)

## Accomplishments

- **Two new public exports** in `src/lib/data/adapters/quiver.ts`: `fetchQuiverInsider(ticker)` and `fetchQuiverCongressional(ticker)`. Both return canonical projection types (`QuiverInsiderData` / `QuiverCongressionalData`) — null when `QUIVER_API_KEY` unset, on any 4xx, after exhausted 5xx retries, or on network failure.
- **Opt-in gate is double-locked**: `getApiKey()` returns null when env is unset/empty; in addition to `doFetchInsider/Congressional` short-circuiting on null, the public wrappers `fetchQuiverInsider/Congressional` themselves short-circuit BEFORE the `cached(...)` call so an unconfigured deploy never even touches Redis (T-19-C-06-02 belt-and-suspender).
- **Bearer auth via header only** — key carried as `Authorization: Bearer <token>`, never URL-interpolated. `statusError()` builds error messages from the HTTP status only — verified by Test 7 that the sentinel key value never appears in any console.warn/log/error output even on the exhausted-retry failure path (T-19-C-06-01).
- **Reuses Wave B helpers** — `cached()` (Upstash) wraps `withRetry({ maxAttempts: 3, baseDelayMs: 100 })` exactly like Tiingo and Twelve Data. 4xx (incl. 401/403/404) surfaces immediately without retry (D-25); 5xx + network errors retry with full-jitter exponential backoff.
- **Wired additively into `lightweightCommunityScan`** — `EnrichedSnapshot` gains `quiver_insider: QuiverInsiderData | null` and `quiver_congressional: QuiverCongressionalData | null`. `Promise.all` extended by two `.catch(() => null)` branches so even an unexpected throw from a future Quiver code path cannot crash the primary Firecrawl + StockTwits scan.
- **No shadow needed** — purely additive. Rows that previously had no Quiver data continue to have no Quiver data (when `QUIVER_API_KEY` is unset); rows that have it get it populated. No change to existing primary path semantics, no flag gate (per D-38).

## Task Commits

Each task was committed atomically (per-commit hashes):

1. **Tasks 1+2 (RED): QUIVER_API_KEY env + 7 failing tests** — `a8b2888` (test) — Added `.env.example` block + `tests/lib/data/adapters/quiver.test.ts` mirroring Tiingo's test layout (in-memory Redis double + sentinel-key log check); confirmed RED with `Cannot find module '@/lib/data/adapters/quiver'`.
2. **Task 3 (GREEN): implement Quiver adapter** — `714706b` (feat) — Built `src/lib/data/adapters/quiver.ts` with the canonical projection types + Bearer-auth header + `cached(... TTL_SECONDS.fundamentals)` + `withRetry(... maxAttempts: 3, baseDelayMs: 100)`. 7/7 tests GREEN; project-wide `tsc --noEmit` clean.
3. **Task 4: wire Quiver into lightweightCommunityScan** — `e8ef0e3` (feat) — Extended `EnrichedSnapshot` with `quiver_insider` + `quiver_congressional`, threaded both through the `Promise.all` fan-out with `.catch(() => null)` defensive wrappers, and surfaced both in the return object. Full unit suite 618 passed.

_Note: Task 5 (final commit) is satisfied by the per-task atomic commits above — `git log -1 --pretty=%s` matches "19-c-06" via commit `e8ef0e3`._

## Files Created/Modified

- **`src/lib/data/adapters/quiver.ts`** (created, 254 lines) — Two public exports `fetchQuiverInsider` + `fetchQuiverCongressional` with internal `getApiKey()`, `statusError()`, `doFetchInsider/Congressional()` upstream wire-shape parsers, and canonical projection types (`QuiverInsiderTrade`, `QuiverInsiderData`, `QuiverCongressionalTrade`, `QuiverCongressionalData`). Threat-model annotations inline.
- **`tests/lib/data/adapters/quiver.test.ts`** (created, 286 lines) — 7 vitest tests using sentinel API key `qv_phase19_c06_test_sentinel_xyz`, in-memory Redis double matching Tiingo's test pattern, fetch globally spied. Covers: opt-in null path (no fetch issued), insider/congressional happy paths, cache hit on second call, 5xx retry, 4xx no-retry, key-never-logged exhausted-retry path.
- **`.env.example`** (modified) — Appended `QUIVER_API_KEY=` block with explanatory comment ("Adapter only activates when this is set. Leave blank to skip.").
- **`src/lib/data/lightweight-community-scan.ts`** (modified, +39 / -1 lines) — Imported `fetchQuiverInsider`, `fetchQuiverCongressional` + canonical types from `./adapters/quiver`. Extended `EnrichedSnapshot` interface with two new fields. Extended `Promise.all` with two defensive `.catch(() => null)` branches. Threaded both through the return object.
- **`.planning/ROADMAP.md`** (modified) — Ticked `[x] 19-C-06` with completion narrative.

## Decisions Made

1. **Env-presence gate, not feature flag.** D-38 specifies the adapter is opt-in via `QUIVER_API_KEY` presence — no `FEATURE_QUIVER` triple-mode flag. Rationale: the cost-bearing nature ($30/mo) means accidental activation is a real risk; tying activation to the literal presence of the upstream credential is the strongest possible config-time gate (you can't activate it without paying for it).

2. **Cache TTL = 24h.** Form 4 insider filings settle once per day (T+1 reporting deadline); congressional STOCK Act disclosures publish weekly. Refreshing more often than daily is wasted spend.

3. **Cache key suffix `:quiver:insider` / `:quiver:congressional`.** Uses `CACHE_KEYS.community(ticker)` prefix per 19-B-01 convention, with explicit `:quiver:<endpoint>` suffix to leave room for future supplemental sources (Swaggystocks, ApeWisdom) under the same `comm:` namespace without collision.

4. **Direct wire into `lightweightCommunityScan` instead of `communityWithSupplemental` wrapper.** Plan Task 4 referenced a `communityWithSupplemental` function from 19-C-05, which is not yet implemented (19-C-05 is still in `incomplete_plans`). Wiring directly into `lightweightCommunityScan` (the actual orchestrator that builds `EnrichedSnapshot` per project context line 131) preserves the plan's stated intent (additive, no flag, no shadow, no-op when key missing) and stays forward-compatible — when 19-C-05 lands its `communityWithSupplemental` wrapper, this wiring lifts cleanly into it. See Deviations below.

5. **Defensive `.catch(() => null)` on Quiver branches in `Promise.all`.** Both fetchers already return null on any failure, but an unexpected throw from a future Quiver code path (e.g., a JSON parse error before our null-handler runs) would otherwise reject the whole `Promise.all` and crash the primary scan. The defensive wrappers are belt-and-suspender against that.

## Deviations from Plan

### Auto-fixed Blocking Issue

**1. [Rule 3 - Blocking] Plan Task 4 referenced communityWithSupplemental from 19-C-05; that function does not exist yet**

- **Found during:** Task 4
- **Issue:** Plan Task 4 specified editing a `communityWithSupplemental` helper introduced by 19-C-05. That plan is still on the incomplete list (`incomplete_plans` includes `19-C-05-PLAN.md`); no such function exists in the tree.
- **Fix:** Wired Quiver fetchers directly into `lightweightCommunityScan` itself — the actual community-data orchestrator per project context — by extending its `Promise.all` fan-out and adding two fields to `EnrichedSnapshot`. This preserves the plan's stated intent (additive, no flag, no shadow, no-op when key missing) and matches D-38 ("no shadow needed because additive: rows that previously had no Quiver data continue to have no Quiver data; rows that have it get it populated"). When 19-C-05 lands later, its `communityWithSupplemental` wrapper can lift this wiring cleanly without touching the Quiver adapter itself.
- **Files modified:** `src/lib/data/lightweight-community-scan.ts`
- **Commit:** `e8ef0e3`

## Threat Surface Scan

The plan's `<threat_model>` listed two threats:

| Threat ID | Mitigation |
|-----------|------------|
| T-19-C-06-01 (API key in logs) | mitigated — Bearer header only; `statusError()` includes only the HTTP status in the message; Test 7 verifies the sentinel key never appears in any `console.warn/log/error` output even on the exhausted-retry failure path. |
| T-19-C-06-02 (adapter activates without explicit opt-in) | mitigated — `getApiKey()` returns null on unset/empty env; public fetchers short-circuit BEFORE `cached()` is called (so an unconfigured deploy never touches Redis); `doFetchInsider/Congressional` also short-circuit (defense in depth). Test 1 verifies `fetchSpy` is not called when env is unset. |

No new threat surface introduced.

## Issues Encountered

None blocking. The single deviation (direct-wire in lieu of the not-yet-existing `communityWithSupplemental` wrapper) was a Rule 3 auto-fix and is documented above.

## Self-Check

- [x] `src/lib/data/adapters/quiver.ts` exists and exports `fetchQuiverInsider`, `fetchQuiverCongressional` — found
- [x] `tests/lib/data/adapters/quiver.test.ts` exists with 7 tests — `Tests 7 passed (7)` ✓
- [x] `.env.example` contains `QUIVER_API_KEY` — `grep -q` ✓
- [x] `src/lib/data/lightweight-community-scan.ts` references `fetchQuiverInsider`, `fetchQuiverCongressional`, `quiver_insider`, `quiver_congressional` — all four greps ✓
- [x] Commit `a8b2888` (Tasks 1+2 RED) found in `git log` — ✓
- [x] Commit `714706b` (Task 3 GREEN) found in `git log` — ✓
- [x] Commit `e8ef0e3` (Task 4 wiring) found in `git log` — ✓
- [x] `npx tsc --noEmit -p tsconfig.json` clean (no errors emitted)
- [x] Full vitest unit suite 618 passed | 2 skipped | 3 todo (623) — no regressions
- [x] ROADMAP.md tick `[x] 19-C-06` present — ✓

## Self-Check: PASSED

## User Setup Required

- **Optional:** Set `QUIVER_API_KEY` in production env vars (Vercel project settings) ONLY if the operator chooses to subscribe to Quiver Hobbyist ($30/mo, https://www.quiverquant.com/). Without the env, both fetchers no-op silently and `EnrichedSnapshot.quiver_insider` / `quiver_congressional` always come through as `null` — fully expected default behavior per D-38.

## Next Phase Readiness

- **Ready for downstream consumption** — `quiver_insider` + `quiver_congressional` are now part of `EnrichedSnapshot`. Future plans (e.g., 19-C-08 CoVe verification, 19-C-10 contradiction detection) can read these fields directly without touching the Quiver adapter.
- **Forward-compat with 19-C-05** — when Swaggystocks + ApeWisdom land and introduce `communityWithSupplemental`, this wiring can lift into that wrapper with a one-import refactor; the Quiver adapter itself needs no changes.
- **Operational signal** — when an operator opts in by setting `QUIVER_API_KEY`, the diffusion engine immediately gains a new institutional + congressional cross-validation signal alongside StockTwits + Reddit chatter, with no further deploys required.

---
*Phase: 19-cipher-v2-0-excellence*
*Plan: 19-C-06*
*Completed: 2026-05-10*
