---
phase: 19-cipher-v2-0-excellence
plan: 19-B-01
subsystem: data-cache
tags: [upstash, redis, cache, ttl, graceful-degrade, vercel, wave-b-foundation]

# Dependency graph
requires:
  - phase: 19-cipher-v2-0-excellence/19-Z-01
    provides: FEATURE_DATA_CACHE flag scaffolding (consumed by Wave B-08 rollout, not by this plan)
  - external: "@upstash/redis@^1.38.0 (RESEARCH-verified pin)"
provides:
  - cached(key, fetcher, opts) generic wrapper — TTL caching with transparent fallthrough on Redis outage (D-24)
  - invalidate(key) best-effort eviction
  - CACHE_KEYS + TTL_SECONDS centralized config (no inline TTLs)
  - src/lib/data/cache/index.ts public barrel for downstream Wave B adapters
affects: [19-B-03 (Tiingo), 19-B-04 (Twelve Data), 19-B-05 (Exa), 19-B-07 (Runtime Cache), 19-B-08 (rollout)]

# Tech tracking
tech-stack:
  added:
    - "@upstash/redis@^1.38.0 — HTTP REST Redis client (verified version 2026-05-05)"
  patterns:
    - "Lazy-singleton client pattern — getRedis() reads env on first call, caches the instance, returns null when env unset (graceful degrade per D-24)"
    - "Try/catch around every Redis call with transparent fallthrough — Redis outage NEVER throws to the caller; the underlying fetcher always returns its value"
    - "Centralized cache namespace + TTL config (cache-keys.ts) — adapters import CACHE_KEYS.quote('AAPL') instead of building cache keys inline (T-19-B-01-01 mitigation: prevents cross-domain key collision via per-source prefixes)"
    - "__resetUpstashClientForTests() test-only hook — drops the cached singleton so unit tests can exercise env-driven branches deterministically without mutating global state"

key-files:
  created:
    - src/lib/data/cache/cache-keys.ts
    - src/lib/data/cache/upstash.ts
    - src/lib/data/cache/index.ts
    - tests/lib/data/cache/upstash.test.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-B-01-SUMMARY.md
  modified:
    - package.json                # +@upstash/redis dependency
    - package-lock.json           # transitive resolution
    - .env.example                # +UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

key-decisions:
  - "In-memory Upstash mock kept inside the test file (not a global __mocks__) so the mock is colocated with the only suite that exercises it; mock honors `ex` TTL via Date.now() so vi.useFakeTimers() can advance past expiry deterministically — necessary because Upstash is an HTTP service and real fake-timer-driven TTL needs an in-process double."
  - "Added an __resetUpstashClientForTests() test-only export rather than relying on per-file singletons or vi.resetModules() — keeps the production module shape clean (one lazy singleton) while letting unit tests exercise env-driven branches (Redis-outage path forces a fresh client against http://127.0.0.1:1)."
  - "Added a public barrel src/lib/data/cache/index.ts so Wave B adapters import a single surface (cached, invalidate, CACHE_KEYS, TTL_SECONDS) — matches the naming pattern Wave B adapters expect per the impl-plan, makes future client swap easier."
  - "Live smoke test against a real Upstash sandbox skipped — no UPSTASH_REDIS_REST_URL/TOKEN in local env (constraint-spec'd as 'live tests skipped when no Upstash env present'). The graceful-degrade branch is verified by unit test 4 (forced Redis outage at http://127.0.0.1:1) + the transparent fallthrough on null client is verified by tests 1, 2, 5."
  - "Did NOT introduce FEATURE_DATA_CACHE flag wiring in this plan — owned by 19-B-08 rollout per plan preamble (\"no flag introduced; FEATURE_DATA_CACHE flag is owned by 19-B-08 rollout\"). Adapters in 19-B-03/04/05 will gate cached() calls on the flag when they consume this primitive."

patterns-established:
  - "Cache-wrapper pattern: pure-function `cached(key, fetcher, opts)` that adapters drop in around any async fetcher — `cached(CACHE_KEYS.quote(t), () => yahoo.fetchQuote(t), { ttlSeconds: TTL_SECONDS.quote })`."
  - "Graceful-degrade pattern: ANY external dependency that's optional (Upstash, Quiver, Arctic Shift) must (1) read env lazily, (2) return null when unset, (3) try/catch every external call, (4) never throw to the caller. Codified here for Wave B/C adapters."

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-05-08
---

# Phase 19 Plan 19-B-01: Upstash Redis Cache Layer Summary

**`cached(key, fetcher, opts)` + `invalidate(key)` over Upstash Redis with transparent fallthrough on outage (D-24); centralized `CACHE_KEYS` + `TTL_SECONDS` so Wave B adapters (Tiingo, Twelve Data, Exa) drop a single line around any async fetcher.**

## Performance

- **Duration:** ~7min
- **Started:** 2026-05-08T17:35:00Z
- **Completed:** 2026-05-08T17:43:00Z
- **Tasks:** 4
- **Files created:** 5 (4 source + 1 SUMMARY); modified 3 (package.json, package-lock.json, .env.example)

## Accomplishments

- **Two production primitives** in `src/lib/data/cache/upstash.ts`: `cached<T>(key, fetcher, opts)` and `invalidate(key)`. Both wrap every Redis call in try/catch and return the fetcher result (or no-op for invalidate) on any error — Redis outage NEVER bubbles up to the caller (D-24).
- **Centralized cache config** in `src/lib/data/cache/cache-keys.ts`: `CACHE_KEYS` (per-source key namespaces: `quote:`, `fund:`, `opts:`, `comm:`, `news:`, `pkg:`) and `TTL_SECONDS` (5min quote → 24h fundamentals). Adapters never inline TTLs or build cache keys by hand — T-19-B-01-01 mitigation against key-collision-as-tampering.
- **Public barrel** `src/lib/data/cache/index.ts` so Wave B adapters import a single surface: `import { cached, invalidate, CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache'`.
- **5/5 unit tests GREEN** (`tests/lib/data/cache/upstash.test.ts`) — the verbatim 5 tests from impl-plan: miss populates cache, hit skips fetcher, refetch after TTL, graceful degrade on Redis outage, invalidate evicts.
- **Full unit suite green: 577 passed (3 todo, 1 skipped)** including the 5 new cache tests, with zero regressions.
- **Project-wide `tsc --noEmit -p tsconfig.json` clean.**
- **No live smoke test required** — `UPSTASH_REDIS_REST_URL/TOKEN` are not in local env (per constraint "live tests skipped when no Upstash env present"); the graceful-degrade branch is verified by unit test 4 (forced outage at `http://127.0.0.1:1`).

## Task Commits

Each task was committed atomically (modulo the parallel-worktree race noted under Deviations):

1. **Task 1: install @upstash/redis@^1.38.0 + .env.example** — `f328452` (feat)
2. **Task 2 (RED): 5 failing tests for cached() + invalidate()** — `1e36175` (test)
3. **Task 3+4 (GREEN+smoke): cache-keys.ts + upstash.ts + barrel + smoke** — landed across `54427da` (cache-keys, upstash, test) and `6e615fe` (barrel index.ts) due to parallel-worktree race conditions with the 19-C-10 / 19-C-03 agents committing at the same instant. Content of those files is unchanged from the impl-plan + test-plan verbatim. See **Deviations** below.

```
$ git log --all --oneline | grep "19-b-01"
1e36175 test(19-b-01): add failing tests for cached() + invalidate() (Task 2 RED)
f328452 feat(19-b-01): install @upstash/redis@^1.38.0 + env vars (Task 1)
```

## Files Created/Modified

- `src/lib/data/cache/cache-keys.ts` (created) — 6 cache-key builders (`quote`, `fundamentals`, `options`, `community`, `news`, `source_pkg`) all uppercase-normalizing the ticker, plus 6 TTL constants (300s → 86_400s). Exports `type CacheKey = string` per plan interface.
- `src/lib/data/cache/upstash.ts` (created) — `cached<T>` + `invalidate` + `__resetUpstashClientForTests` test hook. Lazy-singleton `getRedis()` reads env on first call and returns null when unset; constructor errors caught (graceful degrade); `r.get()` errors short-circuit to fetcher; `r.set()` errors are swallowed (value already produced); `r.del()` errors are swallowed.
- `src/lib/data/cache/index.ts` (created) — public barrel re-exporting `cached`, `invalidate`, `__resetUpstashClientForTests`, `type CacheOptions`, `type CacheKey`, `CACHE_KEYS`, `TTL_SECONDS`.
- `tests/lib/data/cache/upstash.test.ts` (created) — 5 verbatim tests from impl-plan lines 619-660 + an in-test in-memory `vi.mock('@upstash/redis')` double honoring `ex` TTL via `Date.now()` so `vi.useFakeTimers()` can advance past expiry deterministically.
- `package.json` (modified) — `@upstash/redis: ^1.38.0` added to dependencies.
- `package-lock.json` (modified) — transitive resolution.
- `.env.example` (modified) — appended `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` block under "Phase 19-B-01 — Upstash Redis cache layer (graceful degrade if unset)".

## Decisions Made

1. **Lazy-singleton + test reset hook** — `getRedis()` reads env on first call and caches the instance; `__resetUpstashClientForTests()` is exported (with a leading double-underscore + JSDoc `@internal`) so unit tests can drop the cached client and re-evaluate env-driven branches. Production code never imports the reset hook.
2. **Mock colocated with test** — added an in-memory `vi.mock('@upstash/redis')` inside `tests/lib/data/cache/upstash.test.ts` rather than a global `__mocks__` dir, since this is the only suite exercising it. The mock honors `ex` TTL via `Date.now()` so `vi.useFakeTimers()` driven TTL expiry works deterministically (real Upstash is an HTTP service — fake timers can't expire its server-side TTL).
3. **Public barrel `index.ts`** — Wave B adapters get a one-line import surface (`from '@/lib/data/cache'`) and a stable public API that survives any future client swap.
4. **No FEATURE_DATA_CACHE flag in this plan** — owned by 19-B-08 rollout per plan preamble. This plan ships the primitive flag-free; consumers (19-B-03/04/05) gate `cached()` calls on the flag when they wire it up.
5. **Live smoke test skipped** — no `UPSTASH_REDIS_REST_URL/TOKEN` in local env. Constraint-spec'd as acceptable. Graceful-degrade is verified by unit test 4 (forced Redis outage); cache-hit semantics verified by tests 1, 2, 5 against the in-memory mock.

## Deviations from Plan

### [Rule 3 – Blocking] Test mock added so verbatim tests can pass

**Found during:** Task 2.
**Issue:** The 5 verbatim tests from impl-plan lines 619-660 were specified WITHOUT a `vi.mock('@upstash/redis')` declaration. With the impl-plan's verbatim `getRedis()` (returns null when env unset), tests 2 ("hit skips fetcher") and 5 ("invalidate evicts") would naturally fail — null Redis means fetcher runs every call.
**Fix:** Added an in-memory `vi.mock('@upstash/redis')` double inside the test file (the impl-plan's Task 2 action explicitly permits this: "Mock @upstash/redis where needed"). The mock honors `ex` TTL via `Date.now()` and also forces a thrown `ECONNREFUSED` when the constructor sees `http://127.0.0.1:1` (so test 4's outage path is exercised end-to-end). Added env-setup + `__resetUpstashClientForTests()` to `beforeEach`/`afterEach` so each test starts from a clean Redis-available state.
**Files modified:** `tests/lib/data/cache/upstash.test.ts` (mock + lifecycle hooks); `src/lib/data/cache/upstash.ts` (added `__resetUpstashClientForTests()` test-only export).
**Commit:** `54427da` (parallel-race; see Deviation 2 below).

### [Rule 3 – Blocking] Parallel-worktree race condition mixed plan attribution

**Found during:** Task 3 commit + Task 4 commit.
**Issue:** This worktree was being driven simultaneously by parallel agents executing 19-C-10, 19-C-03, and 19-B-01. While I had `src/lib/data/cache/{cache-keys,upstash}.ts` + `tests/lib/data/cache/upstash.test.ts` staged for my Task 3 commit, the 19-C-10 agent's `git commit` ran at the same instant and swept my staged files into commit `54427da` (whose message is `feat(19-c-10): implement detectContradictions...`). The same race ate my barrel `index.ts` into commit `6e615fe` (`feat(19-c-03): reputation-weighted StockTwits...`).
**Fix:** None possible without rewriting another agent's history (which the rules forbid as a destructive op without explicit user request). The artifacts are correct in tree and the unit suite is green; the only impact is that two of the four expected `(19-b-01)` per-task commit messages instead carry sibling-plan attribution. Tasks 1 + 2 are correctly attributed (`f328452`, `1e36175`); Tasks 3 + 4 are present in the tree but in mixed-attribution commits.
**Documented:** This SUMMARY (you are reading it) is the canonical record of what landed where.
**Commits affected:** Tasks 3 contents in `54427da`; Task 4 barrel in `6e615fe`.

## Threat Surface Scan

The plan's `<threat_model>` listed three threats:

| Threat ID | Mitigation |
|-----------|------------|
| T-19-B-01-01 (cache poisoning via key collision) | mitigated — `CACHE_KEYS` namespaces every key with a per-source prefix (`quote:`, `fund:`, `opts:`, `comm:`, `news:`, `pkg:`); ticker is uppercased on every key; no user-controlled key paths reach Redis (callers must go through `CACHE_KEYS.<source>(ticker)`). |
| T-19-B-01-02 (Redis outage breaks fetches) | mitigated — every Redis call (`r.get`, `r.set`, `r.del`, `new Redis(...)`) is wrapped in try/catch; `getRedis()` returns null when env unset; `cached()` falls through to the fetcher on any read error; `invalidate()` is a silent no-op on any error. Verified by unit test 4 (forced outage at `http://127.0.0.1:1`). |
| T-19-B-01-03 (API tokens in Redis URL) | mitigated — `UPSTASH_REDIS_REST_TOKEN` is read from `process.env` and passed only to the Redis client constructor; never logged, never serialized, never returned. URL strings are not constructed from user input. |

No new threat surface introduced beyond what the threat model anticipated.

## Issues Encountered

1. **Parallel-worktree commit race** — the 19-C-10 and 19-C-03 agents in this worktree committed at the exact instant my staged files were ready, sweeping them into their commits. Documented under Deviations. No functional impact; commit-attribution hygiene partially compromised but recoverable via this SUMMARY.
2. **Pre-existing 7 test failures + multiple TS errors** in `tests/lib/data/stocktwits.reputation.test.ts` (19-C-03 RED) and `tests/lib/sentiment/contradiction-detector.test.ts` (19-C-10 RED) at execution start. Out of scope per scope-boundary rule. Both resolved by the parallel agents' GREEN commits (`6e615fe`, `54427da`) before my SUMMARY was written, so the final-gate suite is fully green.

## Self-Check

- [x] `src/lib/data/cache/cache-keys.ts` exists; exports `CACHE_KEYS`, `TTL_SECONDS`, `type CacheKey`.
- [x] `src/lib/data/cache/upstash.ts` exists; exports `cached`, `invalidate`, `__resetUpstashClientForTests`, `type CacheOptions`, `type CacheKey`.
- [x] `src/lib/data/cache/index.ts` exists; barrel re-exports the public surface.
- [x] `tests/lib/data/cache/upstash.test.ts` exists; 5/5 GREEN.
- [x] `package.json` contains `"@upstash/redis": "^1.38.0"`.
- [x] `.env.example` contains `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
- [x] `node -e "console.log(require('@upstash/redis').Redis)"` does not throw.
- [x] `grep -E "graceful|catch" src/lib/data/cache/upstash.ts` matches (multiple).
- [x] Full vitest unit suite green: 577 passed, 3 todo, 1 skipped (62 files).
- [x] Project-wide `tsc --noEmit -p tsconfig.json` clean.
- [x] Tasks 1+2 commits present and correctly attributed: `f328452`, `1e36175`.
- [x] Tasks 3+4 artifacts present in tree (under mixed-attribution commits per Deviations).

## Self-Check: PASSED

## User Setup Required

**For production deployment** (Vercel):
1. Provision an Upstash Redis database (free tier 10K cmds/day, then ~$5/mo).
2. Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel env (Production + Preview + Development).
3. Cache layer activates automatically — no code change required, no flag flip needed at this layer (consumer flags `FEATURE_DATA_CACHE` etc. are owned by 19-B-08).

**For local development:** Optional. Without env vars, `cached()` transparently falls through to the fetcher every call (no caching, but no errors either).

## Next Phase Readiness

- **Ready for 19-B-03 (Tiingo adapter)** — can wrap Tiingo fetchers with `cached(CACHE_KEYS.quote(t), () => tiingo.fetchQuote(t), { ttlSeconds: TTL_SECONDS.quote })`.
- **Ready for 19-B-04 (Twelve Data)** — same pattern with `CACHE_KEYS.fundamentals` + `TTL_SECONDS.fundamentals`.
- **Ready for 19-B-05 (Exa)** — `CACHE_KEYS.news` + `TTL_SECONDS.news`.
- **Ready for 19-B-07 (Vercel Runtime Cache)** — coexists; Runtime Cache wraps the SourcePackage at the orchestrator layer while Upstash caches per-source fetchers underneath.
- **Ready for 19-B-08 (rollout)** — `FEATURE_DATA_CACHE` flag will gate adapter consumption of `cached()`; this plan ships the primitive flag-free.

---
*Phase: 19-cipher-v2-0-excellence*
*Plan: 19-B-01*
*Completed: 2026-05-08*
