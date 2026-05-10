---
phase: 19-cipher-v2-0-excellence
plan: 19-C-05
subsystem: data
tags: [community, supplemental, swaggystocks, apewisdom, firecrawl, subreddit-expansion, shadow, supplemental, sentiment-snapshot, vitest]

# Dependency graph
requires:
  - phase: 19-cipher-v2-0-excellence/19-Z-01
    provides: feature-flag matrix (community_supplemental tri-mode flag, default off)
  - phase: 19-cipher-v2-0-excellence/19-Z-02
    provides: SentimentSnapshot.community_aggregated Json column
  - phase: 19-cipher-v2-0-excellence/19-Z-03
    provides: runWithShadow<T>() generic shadow A/B harness
  - phase: 19-cipher-v2-0-excellence/19-B-01
    provides: cached() Upstash Redis wrapper + CACHE_KEYS / TTL_SECONDS
  - phase: 19-cipher-v2-0-excellence/19-B-02
    provides: withRetry() exponential-backoff wrapper (5xx + network only)
provides:
  - fetchApeWisdom(ticker) — supplemental community signal from apewisdom.io free public endpoint
  - fetchSwaggyStocks(ticker) — supplemental community signal from swaggystocks community-discovered JSON endpoint
  - fetchSwaggyStocksViaFirecrawl(ticker) — opt-in Firecrawl-scrape fallback (A5 mitigation, NOT auto-invoked)
  - communityAggregated(ticker) — shadow-gated entry point producing { firecrawl, swaggystocks, apewisdom }
  - 4-subreddit Firecrawl coverage (D-44 absorbed): r/wallstreetbets + r/stocks + r/SecurityAnalysis + r/algotrading
affects: [19-C-08 (CoVe verifier consumes community_aggregated metadata), 19-C-11 (Arctic Shift backfill writes companion CommunityChatter rows), sentiment-scan cron (Task-5 lifecycle wires into route)]

# Tech tracking
tech-stack:
  added: []                          # no new runtime deps — reuses 19-B-01 cache + 19-B-02 retry
  patterns:
    - "Adapter mirrors Tiingo/Twelve-Data pattern: cached() outside, withRetry() inside, null sentinel on every error path (NEVER throws — T-19-C-05-01)"
    - "Promise.allSettled in communityAggregated so a rate-limit on either supplemental cannot crash the canonical Firecrawl primary path"
    - "Optional Firecrawl-scrape fallback exposed but NOT auto-invoked on 4xx (A5 mitigation: avoids silent Firecrawl-credit burn when an endpoint moves)"
    - "Shadow harness reused unchanged from 19-Z-03 — `community-supplemental` path_name; default flag off"

key-files:
  created:
    - src/lib/data/adapters/apewisdom.ts
    - src/lib/data/adapters/swaggystocks.ts
    - tests/lib/data/adapters/apewisdom.test.ts
    - tests/lib/data/adapters/swaggystocks.test.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-C-05-SUMMARY.md
  modified:
    - src/lib/data/lightweight-community-scan.ts   # subreddit expansion + communityAggregated() shadow wrapper
  brought-forward-from-main:
    - src/lib/data/cache/upstash.ts                # 19-B-01 helper (worktree branch lacked it)
    - src/lib/data/cache/cache-keys.ts             # 19-B-01 helper
    - src/lib/data/cache/index.ts                  # 19-B-01 barrel
    - src/lib/data/retry.ts                        # 19-B-02 helper

key-decisions:
  - "Firecrawl REMAINS PRIMARY (D-37 — user direction 2026-05-07: 'firecrawl is very reliable'). Swaggystocks + ApeWisdom are SUPPLEMENTAL — they extend `community_aggregated` JSONB but never replace the existing `community_data` column populated by the existing Firecrawl path."
  - "Swaggystocks Firecrawl-scrape fallback (Assumption A5 mitigation) exported as a separate function `fetchSwaggyStocksViaFirecrawl`. Default `fetchSwaggyStocks` does NOT auto-call it on 4xx, because doing so would silently burn Firecrawl credits when the JSON endpoint moves. Operators wire the fallback explicitly when desired."
  - "ApeWisdom uses the `all-stocks` filter (broad equity universe) rather than `wallstreetbets`-only — supplemental signal benefits from breadth; WSB-only would duplicate the Firecrawl WSB scrape."
  - "Subreddit expansion (D-44 absorbed): replaced r/investing with r/stocks per the D-44 list, added r/SecurityAnalysis (middle/value) + r/algotrading (middle/quant) as additional analytical perspectives. Cost increases from ~3 → ~5 Firecrawl credits per ticker — acceptable per the cost envelope (D-49)."
  - "communityAggregated() uses Promise.allSettled — T-19-C-05-01 mitigation. A rate-limit, 4xx, or unreachable endpoint on either supplemental never crashes the Firecrawl path. Adapters also have their own try/catch belt-and-suspenders inside cached()."
  - "Default feature mode is `off` (flag `community_supplemental_mode`). Cron-route wiring (writing communityAggregated() output into SentimentSnapshot.community_aggregated) is INTENTIONALLY DEFERRED to the shadow lifecycle PR (Task 5 operational step) so this code-landing PR has zero behavioral effect on production."

patterns-established:
  - "CommunitySignal interface as the canonical contract for supplemental social-feed adapters — future Quiver/Arctic-Shift/Stocktwits-reputation adapters can implement the same shape and merge into communityAggregated."
  - "Worktree-branch reconciliation: when a worktree pre-dates a main-branch infra primitive (cache/retry here), bring the helper file forward unchanged + document as `brought-forward-from-main` in SUMMARY rather than recreating from memory."

requirements-completed: []

# Deviations from plan
deviations:
  - rule: "Rule 3 — Auto-fixed blocking issue"
    type: "missing dependency in worktree"
    description: "The worktree branch was missing src/lib/data/cache/ + src/lib/data/retry.ts (19-B-01 / 19-B-02 helpers were on main but not yet in this worktree branch's history). The orchestrator's prompt explicitly stated 'Reuse retry + cache helpers from 19-B-01/19-B-02 — already on main', so I copied the four files unchanged from main into the worktree as part of Task 2. No semantic divergence — bit-identical to the canonical helpers."
    files: ["src/lib/data/cache/upstash.ts", "src/lib/data/cache/cache-keys.ts", "src/lib/data/cache/index.ts", "src/lib/data/retry.ts"]
    commit: "59c90b0"
  - rule: "Rule 3 — Auto-fixed blocking issue"
    type: "missing node_modules in worktree"
    description: "Worktree had an empty node_modules/. Symlinked /Users/tj/Desktop/Cipher/node_modules into the worktree so vitest could resolve @upstash/redis + @mendable/firecrawl-js. Symlink kept untracked (not committed). No package.json change."
    files: []
    commit: "n/a (untracked symlink)"

# Metrics
duration: 10min
completed: 2026-05-10
---

# Phase 19 Plan 19-C-05: Swaggystocks + ApeWisdom adapters + subreddit Firecrawl expansion Summary

**Two SUPPLEMENTAL community-data adapters (Swaggystocks + ApeWisdom) merged into `SentimentSnapshot.community_aggregated` behind a `community_supplemental` shadow flag — Firecrawl REMAINS PRIMARY per D-37 — plus D-44 subreddit Firecrawl expansion (r/wallstreetbets + r/stocks + r/SecurityAnalysis + r/algotrading), 12/12 unit tests GREEN, full suite 490/493 with zero regressions.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-10T01:06:20Z
- **Completed:** 2026-05-10T01:16:17Z
- **Tasks:** 5 (4 code-landing, 1 lifecycle)
- **Files:** 6 created, 1 modified, 4 brought forward from main

## Accomplishments

- **Two supplemental adapters** under `src/lib/data/adapters/` mirror the Tiingo/Twelve-Data pattern (`cached()` 10-min TTL outside, `withRetry()` 3× inside, null sentinel on every error path). Both expose the same `CommunitySignal { source, mention_count, bullish_pct, bearish_pct, trending_rank }` shape.
- **ApeWisdom** hits the free public `https://apewisdom.io/api/v1.0/filter/all-stocks/page/1` endpoint (no auth) and finds the matching ticker row in the trending payload. Maps `mentions` + `sentiment` + `rank` → `CommunitySignal`. Returns null when the ticker is not in the current trending set — that's the correct semantic for "no community signal observed".
- **Swaggystocks** hits the community-discovered `https://api.swaggystocks.com/wsb/ticker/<TICKER>` JSON endpoint. Per RESEARCH Assumption A5 the endpoint has no official SLA, so the adapter exports a separate **opt-in** Firecrawl-scrape fallback (`fetchSwaggyStocksViaFirecrawl`) — default path does NOT auto-call it to avoid silent Firecrawl-credit burn when the JSON endpoint moves.
- **Subreddit expansion (D-44 absorbed)** in `lightweight-community-scan.ts`: now scrapes 4 mainstream/analytical subs (r/wallstreetbets, r/stocks, r/SecurityAnalysis, r/algotrading) plus the per-ticker niche sub via the existing Firecrawl path — no new adapter (D-44 spec). Cost: ~5 Firecrawl credits/ticker (was 3).
- **`communityAggregated(ticker)`** is the new entry point that gates the supplemental path behind `runWithShadow('community-supplemental', ..., FEATURES.community_supplemental_mode)`. Three modes: `off` (Firecrawl-only canonical, default), `shadow` (canonical visible + new path runs in setImmediate + persists ShadowComparison row), `on` (supplemental path populates `community_aggregated`).
- **T-19-C-05-01 mitigation** at three layers: (1) adapters never throw — try/catch around `withRetry`, (2) `Promise.allSettled` in `communityWithSupplemental` collapses any rejection to null, (3) outer try/catch around `cached()` in each adapter as belt-and-suspenders. A rate-limit / 4xx / network failure on either supplemental cannot crash the canonical Firecrawl primary path.
- **12/12 adapter unit tests GREEN; full suite 490 passed / 1 skipped / 3 todo** with zero regressions. `npx tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing tests for both adapters** — `47473ba` (test)
2. **Task 2 (GREEN): implement Swaggystocks + ApeWisdom adapters** — `59c90b0` (feat) — also brought forward 19-B-01 cache + 19-B-02 retry helpers from main as a Rule 3 blocking-issue fix
3. **Task 3: subreddit Firecrawl expansion (D-44 absorbed)** — `b420edf` (feat)
4. **Task 4: communityAggregated() behind shadow + Promise.allSettled** — `420f0b4` (feat)
5. **Task 5: shadow lifecycle gate** — passes via `git log -1 --pretty=%s | grep -q "19-c-05"` (the Task 4 commit). Operational lifecycle (flip → drive → verdict → cutover → 7d → flag-removal) is the standard 19-Z-03 process and runs post-merge per D-05/D-06.

## Files

**Created (6):**
- `src/lib/data/adapters/apewisdom.ts` — fetchApeWisdom(ticker)
- `src/lib/data/adapters/swaggystocks.ts` — fetchSwaggyStocks(ticker) + fetchSwaggyStocksViaFirecrawl(ticker)
- `tests/lib/data/adapters/apewisdom.test.ts` — 6 tests
- `tests/lib/data/adapters/swaggystocks.test.ts` — 6 tests
- `.planning/phases/19-cipher-v2-0-excellence/19-C-05-SUMMARY.md` (this file)

**Modified (1):**
- `src/lib/data/lightweight-community-scan.ts` — subreddit expansion (D-44) + `communityAggregated()` shadow entry point + `CommunityAggregated` interface

**Brought forward from main (4) — Rule 3 blocking-issue fix:**
- `src/lib/data/cache/upstash.ts` (19-B-01 helper)
- `src/lib/data/cache/cache-keys.ts` (19-B-01 helper)
- `src/lib/data/cache/index.ts` (19-B-01 barrel)
- `src/lib/data/retry.ts` (19-B-02 helper)

## Verification

- **Unit suite — adapter-only:** `npx vitest run tests/lib/data/adapters/swaggystocks.test.ts tests/lib/data/adapters/apewisdom.test.ts` → 12/12 pass
- **Unit suite — full:** `npx vitest run` → 490 passed / 1 skipped / 3 todo, zero regressions vs pre-plan baseline
- **Type-check:** `npx tsc --noEmit` clean
- **Plan acceptance gates:**
  - Task 1: `Cannot find` matched RED phase (tests fail without implementation) ✓
  - Task 2: 12/12 pass + `grep -q "Promise.allSettled\|graceful\|catch"` matches both adapters ✓
  - Task 3: `grep -q "SecurityAnalysis"` ✓ + `grep -q "algotrading"` ✓ + `grep -c "wallstreetbets|stocks|SecurityAnalysis|algotrading"` = 19 (≥4) ✓
  - Task 4: `grep -q "fetchSwaggyStocks|fetchApeWisdom"` ✓ + `grep -q "runWithShadow.*community-supplemental"` ✓ + `grep -q "community-supplemental"` ✓
  - Task 5: `git log -1 --pretty=%s | grep -q "19-c-05"` ✓

## Threat Model Status

| Threat ID | Status | Mitigation in code |
|-----------|--------|---------------------|
| T-19-C-05-01 (DoS — rate-limit poisoning crashes primary) | mitigated | (1) adapters never throw — null sentinel on all error paths; (2) cached() reduces call frequency; (3) Promise.allSettled in communityAggregated collapses rejections to null; (4) try/catch belt-and-suspenders in adapter wrappers |
| T-19-C-05-02 (Tampering — scraped content injection into LLM prompt) | mitigated by downstream 19-C-08 (CoVe verifier) | community_aggregated stored as JSONB, only structured metadata fields exposed to prompts; raw_text never injected unsanitized |

## Lifecycle Status

- **Code landed:** flag `community_supplemental_mode` defaults to `off` — zero behavioral effect on production until operator flips to `shadow`.
- **Cron-route wiring (writing communityAggregated() output into SentimentSnapshot.community_aggregated):** intentionally deferred to the shadow-lifecycle PR. The current `sentiment-scan` cron continues writing `community_data` only — exactly canonical behavior.
- **Next steps (operational, post-merge):**
  1. Flip flag to `shadow` in production env
  2. Drive ≥200 sentiment-scan ticks (D-05) — ~3-7 days
  3. Run `npm run shadow-verdict 19-C-05` against ShadowComparison rows
  4. PASS → cutover PR wires `communityAggregated()` output into the cron route + flips flag to `on` + deletes the `off`-mode branch
  5. 7-day rollback hatch
  6. Flag-removal PR (final D-06 closure)

## Self-Check: PASSED

Verified files exist:
- src/lib/data/adapters/apewisdom.ts — FOUND
- src/lib/data/adapters/swaggystocks.ts — FOUND
- tests/lib/data/adapters/apewisdom.test.ts — FOUND
- tests/lib/data/adapters/swaggystocks.test.ts — FOUND
- src/lib/data/lightweight-community-scan.ts — modified, contains all required symbols

Verified commit hashes:
- 47473ba (Task 1 RED) — FOUND in git log
- 59c90b0 (Task 2 GREEN) — FOUND in git log
- b420edf (Task 3 D-44) — FOUND in git log
- 420f0b4 (Task 4 shadow wrap) — FOUND in git log
