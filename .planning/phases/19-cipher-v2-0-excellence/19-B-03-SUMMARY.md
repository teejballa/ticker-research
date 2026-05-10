---
phase: 19-cipher-v2-0-excellence
plan: 19-B-03
subsystem: data-layer
tags: [tiingo, market-data, fundamentals, eod, adapter, cache, retry, vitest, threat-model, dormant-primitive]

# Dependency graph
requires:
  - phase: 19-cipher-v2-0-excellence/19-Z-01
    provides: features.ts FEATURE_TIINGO_PRIMARY flag (default off)
  - phase: 19-cipher-v2-0-excellence/19-B-01
    provides: cached() wrapper + CACHE_KEYS + TTL_SECONDS
  - phase: 19-cipher-v2-0-excellence/19-B-02
    provides: withRetry() — 5xx + network only, 4xx never retried (D-25)
provides:
  - fetchTiingoQuote(ticker)        → MarketDataSection | null
  - fetchTiingoFundamentals(ticker) → FundamentalsSection | null
  - Cached + retry-wrapped Tiingo IEX + daily-fundamentals client
  - Threat-mitigated logging (API key never reaches console)
affects: [19-B-04, 19-B-06, 19-B-08]

# Tech tracking
tech-stack:
  added: []                                # no new runtime deps — uses native fetch + existing cache/retry primitives
  patterns:
    - "Wave B adapter shape — cached(KEY:source, () => withRetry(doFetch...)) per RESEARCH Pattern 2"
    - "Authorization header carries the API key; URL never templates the key (T-19-B-03-01 mitigation)"
    - "doFetch* throws { status } error → withRetry classifier → cached() boundary; outer try/catch returns null on exhaustion"
    - "Cache keys namespace per source: `quote:AAPL:tiingo`, `fund:AAPL:tiingo` — prevents Twelve Data / Yahoo collision"

key-files:
  created:
    - src/lib/data/adapters/tiingo.ts
    - tests/lib/data/adapters/tiingo.test.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-B-03-SUMMARY.md
  modified:
    - .env.example                         # +TIINGO_API_KEY scaffold

key-decisions:
  - "API key delivery via Authorization: Token <k> header (Tiingo's documented scheme), never URL-templated. Error messages contain only HTTP status. console.warn logs err.message only — no stack, no headers, no key. Verified by sentinel-key spy test (Test 7)."
  - "Used Tiingo IEX endpoint /iex/<ticker> for the quote primitive (last/prevClose/volume) — matches the MarketDataSection contract more closely than the daily endpoint, and keeps the call small. market_cap / 52w high/low surface as null from this endpoint; field-level merge in 19-B-06 will fill them from Yahoo or Tiingo /tiingo/daily as needed."
  - "Used Tiingo /tiingo/fundamentals/<ticker>/daily for fundamentals — ratios endpoint that overlaps cleanly with FundamentalsSection (peRatio, eps, revenue, debtToEquity, profitMargin)."
  - "Cache namespace ':tiingo' suffix on CACHE_KEYS.quote/fundamentals — same primitive will be reused by Twelve Data (':twelvedata') and Exa, eliminating cross-source key collisions per T-19-B-01-01."
  - "withRetry default ({maxAttempts:3, baseDelayMs:100}) preserved per Wave B convention — 5xx + network retried, 4xx (incl. 401/403/404/429) surfaced immediately. Test 6 asserts 401 → null after exactly 1 fetch call."
  - "Live integration test gated behind RUN_LIVE_INTEGRATION=true (matches existing project convention) — keeps the unit suite hermetic and runnable without TIINGO_API_KEY."

patterns-established:
  - "Wave B adapter file layout — src/lib/data/adapters/<source>.ts + tests/lib/data/adapters/<source>.test.ts. Reused by 19-B-04 (Twelve Data) and 19-B-05 (Exa)."
  - "API-key-non-leak test pattern — sentinel-string + spy on console.{log,warn,error} + assert no aggregated string contains the sentinel. Reused by every Wave B adapter test."

requirements-completed: []

# Metrics
duration: ~6min
completed: 2026-05-08
---

# Phase 19 Plan 19-B-03: Tiingo Adapter Summary

**Cached + retry-wrapped Tiingo client (point-in-time fundamentals + EOD market data, $30/mo) shipping `fetchTiingoQuote` and `fetchTiingoFundamentals` returning canonical `MarketDataSection` / `FundamentalsSection` shapes — dormant primitive consumed by Plan 19-B-06's merge-ladder reorder.**

## Performance

- **Duration:** ~6 minutes
- **Started:** 2026-05-08
- **Completed:** 2026-05-08
- **Tasks:** 4
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **Two new adapter functions** in `src/lib/data/adapters/tiingo.ts`:
  - `fetchTiingoQuote(ticker)` — Tiingo IEX endpoint, 5min TTL.
  - `fetchTiingoFundamentals(ticker)` — Tiingo daily-fundamentals endpoint, 24h TTL.
- **Both wrap the underlying fetch in:**
  - `cached()` (Plan 19-B-01) for graceful Redis pass-through (`quote:AAPL:tiingo`, `fund:AAPL:tiingo`).
  - `withRetry({ maxAttempts: 3, baseDelayMs: 100 })` (Plan 19-B-02) for 5xx + network retry only — 4xx incl. 401/403/404/429 surfaces immediately as null per D-25.
- **API-key safety verified by spy test** (T-19-B-03-01 mitigation) — sentinel `tk_phase19_test_sentinel_xyz` is asserted absent from every `console.{log,warn,error}` call after a forced 5xx triple-retry failure.
- **Both functions return null** (not throw) on missing `TIINGO_API_KEY`, 4xx, or retry exhaustion — matches D-32 fallback semantics so the merge ladder in 19-B-06 can treat Tiingo as just another tier.
- **8 unit tests + 1 live smoke test (skipped) all green; full project unit suite 589 passed | 1 skipped | 3 todo.**
- **Project-wide `tsc --noEmit` clean.**

## Task Commits

Each task was committed atomically:

1. **Task 1: TIINGO_API_KEY env scaffold** — `044fb55` (feat)
2. **Task 2 (TDD RED): 9 failing tests** — `3403288` (test)
3. **Task 3 (TDD GREEN): adapter implementation + type fix** — `508360d` (feat)
4. **Task 4: commit (folded into Task 3 commit per TDD GREEN convention)** — `508360d`

## Files Created/Modified

- `src/lib/data/adapters/tiingo.ts` (created) — 206 lines: env-key reader, `doFetchTiingoQuote` / `doFetchTiingoFundamentals` (raw fetch + status-throwing on 4xx/5xx), exported `fetchTiingoQuote` / `fetchTiingoFundamentals` wrapped in `cached() + withRetry()` with outer try/catch returning null on exhaustion.
- `tests/lib/data/adapters/tiingo.test.ts` (created) — 319 lines, 9 tests:
  1. Returns null when TIINGO_API_KEY missing
  2. fetchTiingoQuote returns MarketDataSection-shaped object on success
  3. fetchTiingoFundamentals returns FundamentalsSection-shaped object on success
  4. Falls through to Redis cache on second call (fetch invoked once)
  5. Retries 5xx error then succeeds
  6. Does NOT retry 401 — surfaces immediately as null
  7. API key NEVER appears in any logged string (T-19-B-03-01 spy test)
  8. Returns null when fetch throws after maxAttempts retries
  9. (Live, skipped unless `RUN_LIVE_INTEGRATION=true`) live API call returns valid AAPL quote
- `.env.example` (modified) — appended `# Phase 19-B-03 — Tiingo (point-in-time fundamentals + EOD; $30/mo)` section + `TIINGO_API_KEY=`.

## Decisions Made

1. **Authorization header, never URL-templated key.** Per Tiingo's documented auth scheme `Authorization: Token <k>`. URL templates with `?token=` are explicitly avoided to keep keys out of any HTTP access log, error log, or stack frame. Error messages constructed via `statusError(prefix, status)` contain only the HTTP status code; `console.warn` logs `err.message` only.

2. **Tiingo IEX endpoint for quote, daily-fundamentals for fundamentals.** `/iex/<ticker>` gives `last/prevClose/volume` (the MarketDataSection-overlapping subset) cheaply; `/tiingo/fundamentals/<ticker>/daily` is the fundamentals ratios endpoint that surfaces `peRatio/eps/revenue/debtToEquity/profitMargin` directly. Other Tiingo paths (statements, defined-meta, ticker meta) are not in scope for this primitive — 19-B-06 may extend if needed.

3. **`market_cap` and `fifty_two_week_*` left null from the IEX endpoint.** The IEX endpoint doesn't surface these. Field-level merge in `merge.ts` (Phase 10) already handles null fields by falling back to the next tier — so leaving them null here is the correct shape for the merge contract. A future tier reorder could add a second Tiingo `/tiingo/daily` call if these become Tiingo-primary fields.

4. **Cache key suffix `:tiingo`.** Per Wave B convention from CACHE_KEYS — namespacing per data source prevents Twelve Data and Tiingo from clobbering each other's cache lines for the same ticker. Reused unchanged in 19-B-04 (`:twelvedata`).

5. **Live test gated behind `RUN_LIVE_INTEGRATION=true`.** Matches the project pattern in `tests/integration/*.live.test.ts` — unit suite runs hermetically without `TIINGO_API_KEY`. Operators can run `RUN_LIVE_INTEGRATION=true TIINGO_API_KEY=... npx vitest run tests/lib/data/adapters/tiingo.test.ts` for a smoke check before merging downstream Plan 19-B-06.

## Deviations from Plan

None — plan executed exactly as written. All 4 tasks completed in order; per-task TDD/automated acceptance criteria all passed.

One minor mid-flight type fix in `tiingo.test.ts`: initial spy variable types (`ReturnType<typeof vi.spyOn>`) failed `tsc --noEmit` because `vi.spyOn(globalThis, 'fetch')` produces a more specific overloaded MockInstance shape that TS won't widen to the bare type. Replaced with eslint-disabled `any` annotations on the four spy locals (this is a test-only ergonomic patch, not a runtime change) — same convention several other adapter tests in the project use. Folded into the Task 3 GREEN commit so the diff stays self-contained.

## Threat Surface Scan

The plan's `<threat_model>` listed two threats:

| Threat ID | Mitigation |
|-----------|------------|
| T-19-B-03-01 (API key in logs) | mitigated — token attached as `Authorization: Token <k>` header in `doFetchTiingoQuote` and `doFetchTiingoFundamentals`; never interpolated into URL strings; error path uses `statusError(prefix, status)` which contains only HTTP status; `console.warn` logs `err.message` only. Verified by Test 7 — sentinel key absent from every console call across the failure path. |
| T-19-B-03-02 (Tiingo rate limit) | mitigated — `withRetry` only retries 5xx + network, never 429; Test 6 asserts a 401 hits exactly 1 fetch call. Cache TTLs (5min quote, 24h fundamentals) keep call frequency well below the 500/hr Hobbyist quota. |

No new threat surface introduced.

## Issues Encountered

- The worktree branch was behind `main`; resolved by merging `main` into `worktree-agent-a175daad` to pick up the cache + retry primitives from 19-B-01 / 19-B-02 (clean merge, no conflicts).
- Initial `vi.spyOn` typing tripped `tsc --noEmit` — fixed by widening spy locals to `any` (test-only).

## Self-Check

- [x] `src/lib/data/adapters/tiingo.ts` exists; exports `fetchTiingoQuote` and `fetchTiingoFundamentals`
- [x] `tests/lib/data/adapters/tiingo.test.ts` exists with 9 tests (8 active + 1 live-gated)
- [x] `.env.example` contains `TIINGO_API_KEY=`
- [x] `grep -q "Authorization.*Token" src/lib/data/adapters/tiingo.ts` ✓
- [x] `grep -q "cached(" src/lib/data/adapters/tiingo.ts` ✓
- [x] `grep -q "withRetry" src/lib/data/adapters/tiingo.ts` ✓
- [x] `grep -q ":tiingo" src/lib/data/adapters/tiingo.ts` ✓
- [x] All 8 unit tests pass: `Tests 8 passed | 1 skipped (9)`
- [x] Project-wide `npx tsc --noEmit` clean
- [x] Full vitest unit suite green: `Tests 589 passed | 1 skipped | 3 todo (593)`
- [x] All 3 task commits present: `044fb55` (Task 1), `3403288` (Task 2 RED), `508360d` (Task 3 GREEN / Task 4 commit)
- [x] No commit logs the API key sentinel (`! git log --all -S "tk_phase19_test_sentinel_xyz" -- src/` ✓ — sentinel only appears in test fixture)

## Self-Check: PASSED

## User Setup Required

None for this plan to land. To exercise the live integration test or any consumer that opts into Tiingo-primary mode, the operator needs to:

1. Obtain a Tiingo API key from https://api.tiingo.com (Hobbyist tier $30/mo).
2. Set `TIINGO_API_KEY=<key>` in `.env.local`.
3. (Optional) `FEATURE_TIINGO_PRIMARY=shadow` once Plan 19-B-06 wires the merge ladder.

The adapter is dormant otherwise — no `source-package.ts` consumer is wired yet, so missing the key has zero impact on production behavior.

## Next Phase Readiness

- **Ready for 19-B-04 (Twelve Data adapter)** — same shape, same `cached() + withRetry()` pattern, same key-non-leak test convention. The patterns established here are directly reusable.
- **Ready for 19-B-06 (merge precedence reorder)** — `fetchTiingoQuote` and `fetchTiingoFundamentals` are MarketDataSection / FundamentalsSection-shaped, so they slot into the existing merge ladder with no `merge.ts` change beyond extending the `FieldOrigin` union.
- **Operational signal:** none yet — adapter is dormant. Live smoke test in CI will only run with `RUN_LIVE_INTEGRATION=true`.

---
*Phase: 19-cipher-v2-0-excellence*
*Plan: 19-B-03*
*Completed: 2026-05-08*
