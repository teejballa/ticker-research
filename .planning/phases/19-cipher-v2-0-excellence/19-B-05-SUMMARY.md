---
phase: 19-cipher-v2-0-excellence
plan: 19-B-05
subsystem: data-layer
tags: [exa, neural-search, news, analyst, fallback, adapter, wave-b, cached, retry, exa-js, dormant]

# Dependency graph
requires:
  - phase: 19-cipher-v2-0-excellence/19-Z-01
    provides: feature-flag scaffolding (ambient — adapter ships flag-free; FEATURE_EXA_PRIMARY default off; flag is consumed by Plan 19-B-06 merge ladder)
  - phase: 19-cipher-v2-0-excellence/19-Z-02
    provides: shadow infra (ambient — not consumed by this plan)
  - phase: 19-cipher-v2-0-excellence/19-Z-03
    provides: shadow-runner CLI (ambient)
  - phase: 19-cipher-v2-0-excellence/19-Z-04
    provides: model-card-status gate (ambient)
  - phase: 19-cipher-v2-0-excellence/19-B-01
    provides: cached() + invalidate() + CACHE_KEYS.news + TTL_SECONDS.news (30min) — Upstash-backed cache wrapper with graceful Redis-outage fallthrough
  - phase: 19-cipher-v2-0-excellence/19-B-02
    provides: withRetry({ maxAttempts: 3, baseDelayMs: 100 }) + isRetryableError classifier (5xx + network sentinels retried, 4xx never retried per D-25)
provides:
  - fetchExaNews(ticker) — async (NewsSection | null) — Exa neural search → 30-day news + analyst headlines mapped to canonical NewsSection
  - fetchExaAnalystSentiment(ticker) — async (AnalystSentimentSection | null) — analyst-style search mapped to AnalystSentimentSection.recent_changes
  - __resetExaClientForTests() — internal test hook to drop the cached SDK client between cases
  - isExaRetryable() — internal classifier accepting both e.status (default) and e.statusCode (ExaError) shapes
affects: [19-B-06, 19-B-07, 19-B-08]  # 19-B-06 wires this primitive into the merge ladder + auto-fallback to anthropic-search per RESEARCH Pitfall 7

# Tech tracking
tech-stack:
  added:
    - exa-js@^2.12.1                       # official Exa neural-search TypeScript SDK (RESEARCH-verified pin)
  patterns:
    - "Adapter-as-primitive in src/lib/data/adapters/exa-search.ts — two exported functions, NewsSection / AnalystSentimentSection-shaped returns, null on every failure mode (matches Wave B contract for 19-B-06's merge ladder)"
    - "Cache key namespace `news:TICKER:exa` + `news:TICKER:exa-analyst` — keeps Exa's response distinct from anthropic-search.fetchNews caching (which doesn't use the news: namespace today) and from any future provider in the same Redis store"
    - "Custom isExaRetryable classifier accepts both e.status (withRetry default) AND e.statusCode (ExaError) — first Wave-B adapter where the upstream SDK uses a non-standard status field"
    - "Output-type re-use across adapters — fetchExaNews returns the same NewsSection that fetchNews returns, so merge-ladder fallback in 19-B-06 is `fetchExaNews(t) ?? fetchNews(t)` (no per-leg shape coercion)"
    - "Test-only client reset hook — __resetExaClientForTests() mirrors __resetUpstashClientForTests() so per-test env mutation is deterministic"

key-files:
  created:
    - src/lib/data/adapters/exa-search.ts                    # 318 lines — fetchExaNews + fetchExaAnalystSentiment + lazy SDK client + isExaRetryable + result mappers
    - tests/lib/data/adapters/exa-search.test.ts             # 359 lines — 8 unit tests with vi.mock('exa-js') + in-memory Redis double
    - .planning/phases/19-cipher-v2-0-excellence/19-B-05-SUMMARY.md
  modified:
    - .env.example                                           # add EXA_API_KEY documentation entry (Phase 19-B-05 block)
    - package.json                                           # +exa-js@^2.12.1 dep
    - package-lock.json                                      # transitive resolution for exa-js
    - .planning/ROADMAP.md                                   # tick 19-B-05 [x]

key-decisions:
  - "SDK migration: exa-js v2.12.1 marks `searchAndContents` @deprecated. The PLAN.md template called searchAndContents but the canonical replacement is `search()` — same options (numResults, useAutoprompt, type, startPublishedDate), same response shape, text contents returned by default. Verified live against node_modules/exa-js/dist/index.d.ts:3839+ before writing the GREEN implementation. Documented inline in the adapter module-doc as a deviation note so future readers don't try to 'fix' it back."
  - "Output types pinned to NewsSection / AnalystSentimentSection (canonical from src/lib/types.ts) rather than the PLAN.md interface comment's NewsResults / AnalystResults shapes (which don't exist in anthropic-search.ts). The plan's intent — 'output shape MUST match anthropic-search.ts so callers can swap transparently' — is satisfied by reusing the exact types fetchNews / fetchAnalystSentiment already return."
  - "Custom isExaRetryable classifier instead of the default isRetryableError. ExaError surfaces HTTP status as `statusCode: number` (per node_modules/exa-js/dist/index.d.ts:3230); the default classifier in src/lib/data/retry.ts probes `e.status` only. The shim accepts either field so 5xx ExaErrors retry correctly while 4xx (incl. 401) still surface immediately. Network-sentinel codes are mirrored verbatim from the default classifier so behavior is identical for non-Exa-shaped errors."
  - "Cache key uses `:exa` + `:exa-analyst` suffixes inside the existing `news:TICKER` namespace (matches the Wave-B convention established by Tiingo's `quote:TICKER:tiingo` and Twelve Data's `fund:twelve:TICKER`). Keeps the news cache slot available for whatever 19-B-06 wires as the canonical news source while still letting Exa's response live independently in Redis."
  - "Analyst mapping is intentionally sparse — `analyst: 'Exa'`, `firm: hostnameOf(url)`, `action: title`, `date: isoDateOnly(publishedDate)`. Exa's neural search surfaces analyst-style URLs but doesn't parse out structured analyst/firm/action fields; that would require an LLM extraction pass, which is explicitly NOT in this adapter's scope per the plan's 'primitive only — wired into hot path by 19-B-06' note. Downstream reasoning passes (research-brief.ts, gemini-analysis.ts) can re-extract from the populated rows."
  - "Lazy SDK client init via getClient() (matches the @upstash/redis getRedis() pattern in cache/upstash.ts) so process.env mutations between tests are observable. Paired with __resetExaClientForTests() so unit tests can flip EXA_API_KEY between cases without leaking state."
  - "TDD RED commit (Task 2) intentionally lands tsc-failing — the test file imports the not-yet-existing adapter, satisfying the plan's `<automated>` gate `grep -qE 'Cannot find|FAIL'`. This matches the established repo precedent (19-A-06's commit 7dbffe1 is the same pattern). HEAD compiles after Task 3's GREEN commit."

patterns-established:
  - "Wave-B adapter convention now covers all four providers (Tiingo, Twelve Data, Exa, anthropic-search-as-fallback): src/lib/data/adapters/<provider>.ts + tests/lib/data/adapters/<provider>.test.ts + null-on-failure contract + cached() + withRetry() envelope."
  - "Custom isRetryable classifier per provider when the upstream SDK uses a non-standard status field. Pattern is now reusable for any future adapter where the SDK throws a custom error class with its own status convention."
  - "Output-type reuse for swap-ready adapters — when an adapter is destined to replace a legacy fetcher, its return type SHOULD be the legacy fetcher's exact return type, not a parallel shape. Lets the merge ladder use `?? fallback()` instead of conversion code."

requirements-completed: []

# Metrics
duration: ~5min
completed: 2026-05-10
---

# Phase 19 Plan 19-B-05: Exa 2.0 Adapter + Anthropic-search Fallback Wiring Summary

**`fetchExaNews(ticker)` + `fetchExaAnalystSentiment(ticker)` — Exa neural search → canonical `NewsSection` / `AnalystSentimentSection`. Cached 30min via `cached(news:TICKER:exa[-analyst], 1800s)`, retry-wrapped via `withRetry({maxAttempts:3, baseDelayMs:100})` with a custom `isExaRetryable` classifier accepting both `e.status` (default) and `e.statusCode` (ExaError). Per D-32 + RESEARCH Pitfall 7, `anthropic-search.ts` STAYS in tree — auto-fallback wiring lives in Plan 19-B-06.**

## Performance

- **Duration:** ~5min (Task 1 install ~30s, Task 2 RED tests ~90s, Task 3 GREEN ~150s, Task 4 gate satisfied by Task 3 HEAD)
- **Started:** 2026-05-10T01:08:31Z
- **Completed:** 2026-05-10T01:13:40Z
- **Tasks:** 4 (env+dep, RED tests, GREEN impl, commit gate)
- **Files modified:** 6 (`exa-search.ts` created, `exa-search.test.ts` created, `.env.example` modified, `package.json` modified, `package-lock.json` modified, `ROADMAP.md` ticked, plus this SUMMARY)
- **Test surface:** 8 unit tests; full unit suite 626 passing | 2 skipped | 3 todo (631 total)

## Accomplishments

- **`fetchExaNews(ticker)`** in `src/lib/data/adapters/exa-search.ts` — calls Exa's neural `search()` endpoint with a 30-day `startPublishedDate` window, maps the SDK results array to `NewsSection.items` (each result becomes `{ headline, url, published_date, source }`). 30-min Redis TTL via `cached(news:TICKER:exa)`; 3 retries on 5xx + network errors via `withRetry`. Returns null on missing key, 4xx, or post-retry exhaustion — never throws.
- **`fetchExaAnalystSentiment(ticker)`** — same envelope but a separate query (`<TICKER> analyst recommendation price target rating`), no date filter, separate cache key `news:TICKER:exa-analyst`. Maps each Exa result to one `AnalystChange` row with `analyst: 'Exa'`, `firm: hostnameOf(url)`, `action: title`, `date: isoDateOnly(publishedDate)`. Consensus / avg_price_target / analyst_count are surfaced as null per the spec — structured-field extraction is downstream's job.
- **`isExaRetryable(err)`** internal classifier — accepts both withRetry's default `e.status` field and ExaError's `e.statusCode` field, plus undici-shaped `cause.code` network sentinels. First Wave-B adapter to need the shim.
- **`mapNewsResults` / `mapAnalystResults`** — pure mappers from Exa's `{ results: [{ id, title, url, publishedDate, text }] }` envelope to canonical `NewsItem` / `AnalystChange` rows. `hostnameOf(url)` extracts the publisher; `isoDateOnly(d)` truncates Exa's full ISO timestamp to YYYY-MM-DD per the existing NewsItem.published_date convention.
- **8-test vitest suite** — covers all eight behaviors listed in `<must_haves.truths>`: missing key (null + no SDK call), success (NewsSection / AnalystSentimentSection shapes), cache hit (single search call across two invocations), 5xx retry (eventually GREEN), 401 not retried (single SDK call, null), API key never logged (sentinel-key spy assertion), retry-exhaustion (null after 3 attempts on persistent network error), and the never-throw contract that the merge-ladder fallback in 19-B-06 will rely on. Mocks `exa-js`'s Exa class via `vi.mock` with a module-level spy so each `new Exa()` call shares the same mock; in-memory Redis double mirrors the Tiingo / Twelve Data test pattern.
- **`.env.example`** — adds `EXA_API_KEY=` (default empty, fail-closed per D-32) under a Phase 19-B-05 block.
- **Full unit suite 626 passing | 2 skipped | 3 todo** vs. baseline 618/623 — exactly +8 active exa-search tests, no regressions to any sibling test.
- **Project-wide `npx tsc --noEmit -p tsconfig.json` clean** at HEAD (Task 3 GREEN commit).

## Task Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | `ad6e356` | `feat(19-b-05): install exa-js@2.12.1 + add EXA_API_KEY env (Task 1)` |
| 2 | `8ebfd3a` | `test(19-b-05): RED — failing tests for Exa adapter (Task 2)` |
| 3 | `56e7e87` | `feat(19-b-05): GREEN — Exa 2.0 adapter wired with anthropic-compatible output (Task 3)` |
| 4 | (satisfied by Task 3 HEAD) | gate `git log -1 --pretty=%s \| grep -q "19-b-05"` → PASS |

The plan specifies Task 4 as a single combined commit gate; per the user's per-task atomic-commit rule (`Each task: gate + npx vitest run + atomic commit`), Task 4's gate is satisfied by the Task 3 HEAD subject. This matches the precedent from 19-B-04's SUMMARY.

## Files Created/Modified

- `src/lib/data/adapters/exa-search.ts` (created, 318 lines) — `fetchExaNews`, `fetchExaAnalystSentiment`, internal `getClient`, `__resetExaClientForTests`, `isExaRetryable`, internal `mapNewsResults` / `mapAnalystResults` / `hostnameOf` / `isoDateOnly`. Module-doc enumerates threat-model mitigations + the cache+retry contract + the SDK-migration deviation note.
- `tests/lib/data/adapters/exa-search.test.ts` (created, 359 lines) — 8 vitest tests under one `describe`. Reuses the in-memory Redis double pattern. Module-level `exaSearchSpy` shared across `vi.mock('exa-js')` instances so per-test mock-control works without rebuilding the SDK class. Captures `console.{warn,log,error}` for Test 7's secret-leak assertion and asserts the captured strings contain neither the literal sentinel key.
- `.env.example` (modified) — adds the `# Phase 19-B-05 — Exa 2.0` block + `EXA_API_KEY=`.
- `package.json` (modified) — adds `"exa-js": "^2.12.1"` to dependencies.
- `package-lock.json` (modified) — transitive resolution for exa-js.
- `.planning/phases/19-cipher-v2-0-excellence/19-B-05-SUMMARY.md` (created) — this file.
- `.planning/ROADMAP.md` (modified) — tick `[x] 19-B-05` with completion annotation.

## Decisions Made

1. **`search()` not `searchAndContents()`.** exa-js v2.12.1 marks `searchAndContents` `@deprecated` (per node_modules/exa-js/dist/index.d.ts:3892). The canonical replacement is `client.search(query, options)` — same options (`numResults`, `useAutoprompt`, `type: 'neural'`, `startPublishedDate`), same response shape (`{ results: SearchResult<T>[] }`), and text contents are returned by default. The PLAN.md template called the deprecated method; verifying live against the SDK type definitions caught it before commit. Documented inline in the adapter module-doc.

2. **Output types pinned to NewsSection / AnalystSentimentSection (canonical).** The PLAN.md interface comment refers to `NewsResults` and `AnalystResults` types — neither exists in `anthropic-search.ts`. The plan's intent — "output shape MUST match anthropic-search.ts so callers can swap transparently" — is satisfied by reusing the exact types `fetchNews` / `fetchAnalystSentiment` return. This makes the 19-B-06 merge ladder a one-liner: `fetchExaNews(t) ?? fetchNews(t)`.

3. **Custom `isExaRetryable` classifier.** ExaError extends Error with `statusCode: number` (not `status`). The default `isRetryableError` in `src/lib/data/retry.ts` probes `e.status` only — without the shim, ExaError-503 would fall through as "non-retryable" and 5xx errors wouldn't be retried. The shim accepts both fields plus the undici-style `cause.code` network sentinels, mirroring the default classifier's behavior for non-Exa errors.

4. **Cache key segmentation: `news:TICKER:exa` + `news:TICKER:exa-analyst`.** Matches the Wave-B convention (Tiingo's `quote:TICKER:tiingo`, Twelve Data's `fund:twelve:TICKER`). Keeps the canonical `news:TICKER` slot available for whatever 19-B-06 designates as the primary news source, while still letting Exa's response live independently in Redis.

5. **Analyst rows are sparse on purpose.** Exa's neural search surfaces analyst-style URLs (price-target articles, rating-change posts) but doesn't parse out structured analyst/firm/action fields. Adding an LLM extraction pass here would explode this primitive's scope — and the plan explicitly says "primitive only — wired into hot path by 19-B-06". Downstream reasoning (research-brief.ts, gemini-analysis.ts) is the right place to re-extract structured fields.

6. **TDD RED commit (Task 2) intentionally lands tsc-failing.** The test imports `@/lib/data/adapters/exa-search` which doesn't exist yet — that's the whole point of the RED gate (`grep -qE "Cannot find|FAIL"`). The user's "each commit compiles" rule conflicts with TDD-RED commits as written; resolved by following established repo precedent (19-A-06's `7dbffe1` is the same pattern) and ensuring HEAD compiles after Task 3 lands. Documented as Deviation #1 below.

7. **Lazy SDK client + test reset hook.** `getClient()` reads `process.env.EXA_API_KEY` on first call; `__resetExaClientForTests()` drops the cached instance so per-test env mutation is deterministic. Mirrors the `getRedis()` + `__resetUpstashClientForTests()` pattern in `src/lib/data/cache/upstash.ts`.

## Deviations from Plan

**One: Task 2 RED commit intentionally tsc-fails.** The plan's `<automated>` gate for Task 2 is `grep -qE "Cannot find|FAIL"` — i.e. the gate REQUIRES the test commit to fail compilation because the adapter under test doesn't yet exist. The user's stated rule "Each commit compiles + unit suite green" conflicts with this gate as written. Resolution: followed established repo precedent (19-A-06's commit `7dbffe1` is the same TDD-RED pattern), kept atomic per-task commits, and verified HEAD (Task 3 GREEN) compiles cleanly with the full vitest suite green. The plan's gate semantics are preserved; the user's compile-each-commit rule is interpreted as "HEAD must compile" rather than "every commit in isolation must compile" — same posture every prior TDD plan in this phase has taken. **Rule 3 — auto-fix blocking issues** (the plan's gate is incompatible with strict per-commit compile, but the gate's intent — verify the test imports the not-yet-existing module — is preserved).

**Two: SDK API surface — `search()` not `searchAndContents()`.** The PLAN.md task 3 template calls `client.searchAndContents(...)`; that method is `@deprecated` in exa-js v2.12.1 (the version the plan pins). The canonical replacement is `client.search()` with the same options + response shape per the SDK's deprecation guidance. Verified live against `node_modules/exa-js/dist/index.d.ts:3839-3905`. **Rule 1 — auto-fix bugs** (calling a deprecated method that may emit deprecation warnings is a correctness/forward-compat issue; the deprecation note explicitly says future versions will remove it). Documented inline in the adapter module-doc + Decision #1 above.

**Three: PLAN.md interface-comment type names.** The plan's `<interfaces>` block refers to `NewsResults` / `AnalystResults` — neither type exists in `anthropic-search.ts` (which exports functions returning `NewsSection` / `AnalystSentimentSection` from `@/lib/types`). Adapter uses the actual canonical types so the "callers swap transparently" intent is satisfied. **Rule 1 — auto-fix bugs** (wrong type names in the plan; fixed to actual types).

## Threat Surface Scan

The plan's `<threat_model>` listed two threats:

| Threat ID | Mitigation |
|-----------|------------|
| T-19-B-05-01 — API key in logs | ✓ mitigated — SDK reads `EXA_API_KEY` once at construction (`new Exa(key)`) and attaches it as `Authorization: Bearer` internally; wrapper never sees the key after `getClient()` returns. Test 7 stubs `console.{warn,log,error}`, drives a persistent 5xx that triggers all three error-log paths (per-call + retry exhaustion), and asserts none of the captured output contains the sentinel `EXA_API_KEY` value (`exa_phase19_test_sentinel_12345`). Pass. |
| T-19-B-05-02 — Exa weaker on niche tickers | ✓ accepted (with mitigation) per plan — adapter's null-on-error contract IS the contract that 19-B-06's `fetchExaNews(t) ?? fetchNews(t)` fallback consumes. anthropic-search.ts STAYS in tree per D-32. |

No new threat surface introduced beyond what the plan enumerated.

## Issues Encountered

1. **PLAN.md called the deprecated `searchAndContents()` SDK method.** Resolved by verifying live against `node_modules/exa-js/dist/index.d.ts` and migrating to `client.search()`. Documented inline + as Deviation #2 above.
2. **PLAN.md interface-comment references `NewsResults` / `AnalystResults` types that don't exist.** Resolved by using the actual canonical `NewsSection` / `AnalystSentimentSection` types from `@/lib/types`. Documented inline + as Deviation #3.
3. **`isRetryableError` default classifier wouldn't catch ExaError.** Resolved by adding a custom `isExaRetryable` classifier that accepts both `e.status` and `e.statusCode`. First Wave-B adapter to need this. Documented inline + Decision #3.
4. **Stray pre-existing `tests/lib/data/adapters/quiver.test.ts` from a parallel 19-C-06 agent worktree.** Out of scope per the deviation-rules scope boundary. Verified the only tsc errors before my changes were in that file; my Task-3 GREEN commit resolves them coincidentally because the missing-adapter file was already in the worktree (untracked). No action taken; logged here for completeness.
5. **No real bugs surfaced during implementation.** All 8 tests went from RED to GREEN on the first GREEN write.

## Self-Check

- [x] `src/lib/data/adapters/exa-search.ts` exists, exports `fetchExaNews` + `fetchExaAnalystSentiment` + `__resetExaClientForTests`
- [x] `tests/lib/data/adapters/exa-search.test.ts` exists with 8 tests; all GREEN at HEAD
- [x] `grep -q '"exa-js"' package.json` → PASS
- [x] `node -e "require('exa-js')"` does not throw → PASS
- [x] `grep -q "EXA_API_KEY" .env.example` → PASS
- [x] `grep -q "from 'exa-js'" src/lib/data/adapters/exa-search.ts` → PASS
- [x] `grep -q "from '@/lib/types'" src/lib/data/adapters/exa-search.ts` → PASS (output types imported from canonical module — interchangeable with anthropic-search.ts)
- [x] Output shape compatible with anthropic-search.ts — fetchExaNews returns `NewsSection`, same as `fetchNews`; fetchExaAnalystSentiment returns `AnalystSentimentSection`, same as `fetchAnalystSentiment` ✓
- [x] anthropic-search.ts NOT modified (`git log --oneline src/lib/data/anthropic-search.ts` shows no commits in this plan) ✓
- [x] `npx vitest run tests/lib/data/adapters/exa-search.test.ts` → 8 passed (8)
- [x] Full vitest unit suite: `Tests 626 passed | 2 skipped | 3 todo (631)` (no regressions vs baseline 618/623; +8 new exa-search tests)
- [x] `npx tsc --noEmit -p tsconfig.json` clean at HEAD
- [x] Commit `ad6e356` (`feat(19-b-05)…Task 1`) present in `git log`
- [x] Commit `8ebfd3a` (`test(19-b-05)…Task 2`) present in `git log`
- [x] Commit `56e7e87` (`feat(19-b-05)…Task 3`) present in `git log`
- [x] `git log -1 --pretty=%s | grep -q "19-b-05"` → PASS (Task 4 gate; Task 3 HEAD)
- [x] `.planning/ROADMAP.md` 19-B-05 ticked `[x]`

## Self-Check: PASSED

## User Setup Required

To activate the adapter in production:

1. Sign up for Exa at <https://exa.ai/> (~$5/mo for the volumes Cipher needs per D-49).
2. Set `EXA_API_KEY` in the Vercel project's env vars (Production + Preview).
3. Plan 19-B-06 will flip `FEATURE_EXA_PRIMARY=on` to wire the adapter into the merge ladder + auto-fallback to `anthropic-search.ts`. Until then this primitive is dormant — `fetchExaNews` / `fetchExaAnalystSentiment` are callable from a Node REPL or test but no production code path consumes them.

If the key is unset, the adapter returns null (fail closed). No 500s; the missing-key branch is silent — operator-visible only via the merge ladder noticing this leg returned null and falling back to anthropic-search.

## Next Phase Readiness

- **Ready for 19-B-06 (merge ladder + cutover)** — `fetchExaNews(t) ?? fetchNews(t)` is the one-liner that wires the auto-fallback per RESEARCH Pitfall 7. Same pattern for analyst (`fetchExaAnalystSentiment(t) ?? fetchAnalystSentiment(t)`). The cached() + withRetry() envelope means 19-B-06 doesn't need to add any caching or retry logic of its own at the merge layer.
- **Three Wave-B adapter primitives now in tree** — Tiingo (19-B-03), Twelve Data (19-B-04), Exa (this plan). 19-B-06 has all three to compose the new merge ladder: `tiingo → twelvedata → yahoo → finnhub → polygon` for market data + fundamentals, and `exa → anthropic-search` for news + analyst.
- **No coupling to feature flags in this primitive** — `FEATURE_EXA_PRIMARY` is read by 19-B-06's wiring code, not by this adapter. Keeps the adapter testable as a unit and lets 19-B-06 own the on/off decision.
- **Cost envelope tracking** — per D-49 the total infra envelope is ≤ $135/mo; with Exa's ~$5/mo this plan keeps Wave B at ~$64/mo (Tiingo $30 + Twelve Data $29 + Exa $5), well under budget. Replaces ~$200/mo Anthropic-search burn per D-50, giving net savings ~$135/mo when 19-B-06 cuts over.

---
*Phase: 19-cipher-v2-0-excellence*
*Plan: 19-B-05*
*Completed: 2026-05-10*
