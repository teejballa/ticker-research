---
phase: 30
plan: 03
subsystem: provider-health-hardening
tags: [wave-2, adapter-wiring, merge-cascade-reverse, model-pinning, cost-anomaly, fallback-summary]
dependency_graph:
  requires:
    - "30-01 (Wave 0 — in-memory Upstash mock + RED-state test scaffolds)"
    - "30-02 (Wave 1 — withBreaker primitive, BreakerOpenError, FieldOrigin += 'unavailable', ProviderHealthAlert model migrated)"
  provides:
    - "Every adapter in src/lib/data/*.ts wraps external calls with withTelemetry → withBreaker → withRetry → fn"
    - "merge.ts cascade for shared fields reversed to polygon → finnhub → yahoo (Yahoo demoted per D-01); yahoo-only fields keep yahoo-primary"
    - "SourcePackage.fallback_summary populated by buildSourcePackageOldLadder and buildSourcePackageNewLadder"
    - "Yahoo quote cache TTL tightened to 60s (was 300s) per D-02"
    - "Gemini main analysis hard-pinned to google/gemini-3-pro; per-doc classifier verified at google/gemini-3.1-flash-lite"
    - "withTelemetry post-success cost-anomaly trip line — 3 calls > $1.00 in 1h opens breaker:gemini:state for 1h with reason='cost_anomaly'"
    - "Firecrawl breaker integration in lightweight-community-scan — cron pipeline continues with empty markdown on a Firecrawl outage"
  affects:
    - "Plan 30-04 (Wave 3): /api/cron/provider-error-budget will read ProviderHealthAlert rows populated by the now-wired adapter telemetry"
    - "All downstream consumers of SourcePackage (research-brief, gemini-analysis, /insights/sentiment-health) see _field_sources/_fallback_summary metadata"
tech_stack:
  added: []
  patterns:
    - "Composition order: withTelemetry(provider, () => withBreaker(provider, () => withRetry(() => fn()))) — the breaker short-circuits BEFORE entering withRetry so a tripped breaker doesn't consume retry budget"
    - "Sequential short-circuit per-field cascade: tried[] reflects providers consulted until first non-null value (or full cascade on all-null), NOT the full cascade roster"
    - "Yahoo-only field set (price, volume, percent_change_today) → only yahoo cascade; shared fields → polygon → finnhub → yahoo"
    - "queueMicrotask for cost-anomaly counter writes — never blocks the original Gemini return"
    - "Fire-and-forget cost-anomaly tracking — getRedis() returns null when Upstash env unset, the block bails silently"
    - "Phase 30 D-14 model pinning: every generateText/generateObject call site has explicit `model:` string literal, no fuzzy AI-Gateway routing, no dynamic template literal"
key_files:
  created:
    - "tests/unit/source-package.fallback.unit.test.ts (was RED stub)"
    - "tests/unit/gemini-analysis.model-pin.unit.test.ts (was RED stub)"
    - "tests/integration/cost-anomaly-breaker.integration.test.ts (was RED stub)"
    - "tests/integration/lightweight-community-scan.breaker.integration.test.ts (was RED stub)"
    - ".planning/phases/30-provider-health-hardening/deferred-items.md"
    - ".planning/phases/30-provider-health-hardening/30-03-SUMMARY.md"
  modified:
    - "src/lib/data/yahoo.ts (2 sites withBreaker-wrapped)"
    - "src/lib/data/polygon.ts (fetchOk withBreaker-wrapped)"
    - "src/lib/data/finnhub.ts (fetchOk withBreaker-wrapped)"
    - "src/lib/data/anthropic-search.ts (all 4 sites withBreaker-wrapped: news, analyst, sec, social)"
    - "src/lib/data/lightweight-community-scan.ts (scrapeOne's Firecrawl call withBreaker-wrapped per D-23)"
    - "src/lib/data/cache/cache-keys.ts (TTL_SECONDS.quote 300 → 60 per D-02)"
    - "src/lib/data/merge.ts (D-01 cascade reverse + D-09 fallback_summary emission + D-11 'unavailable' emission)"
    - "src/lib/data/source-package.ts (both ladders attach fallback_summary)"
    - "src/lib/types.ts (MarketDataSection._fallback_summary, FundamentalsSection._fallback_summary, SourcePackage.fallback_summary all optional)"
    - "src/components/ResearchReport.tsx (sourceLabel handles 'unavailable')"
    - "src/lib/research-brief.ts (fmtUnavailable helper guards all market_data + fundamentals brief lines)"
    - "src/lib/gemini-analysis.ts (hard-pin to google/gemini-3-pro; haiku ternary branch removed)"
    - "src/lib/sentiment/per-doc-classifier.ts (Phase 30 D-14 comment; verified slug)"
    - "src/lib/telemetry/withTelemetry.ts (D-15 cost-anomaly trip line in queueMicrotask)"
    - "src/lib/data/__tests__/merge.test.ts (existing tests updated for D-01 cascade reverse; +7 new Phase-30 tests)"
    - "tests/integration/provider-error-budget.cron.integration.test.ts (removed @ts-expect-error — D-18 migration applied)"
decisions:
  - "merge.ts kept as a synchronous pure function (no architectural change). Sequential short-circuit semantics apply at the cascade-SELECTION layer (per-field tried[] reflects which providers were consulted) — the network short-circuit story belongs to withBreaker (D-04..D-07 from Wave 1). This avoids restructuring source-package.ts's parallel-fan-out into lazy adapter calls, which would have been a much larger refactor"
  - "FallbackSummaryEntry lives on each MarketDataSection / FundamentalsSection as `_fallback_summary` (private convention prefix), then is flattened into SourcePackage.fallback_summary by both buildSourcePackageOldLadder and buildSourcePackageNewLadder. This keeps merge.ts unaware of SourcePackage and lets either ladder attach the aggregate without coupling"
  - "ResearchReport.tsx em-dash rendering: instead of an explicit `'—'` branch in sourceLabel(), the existing per-stat formatters (formatPrice, formatPercent, formatMarketCapLib) already return `'—'` on null input. The merge.ts change ensures that whenever FieldOrigin is 'unavailable', the field VALUE is also null, so the existing formatters render the em-dash naturally. The sourceLabel helper handles the 'unavailable' badge case (no badge)"
  - "research-brief.ts uses 'fmtUnavailable' helper that emits '(no source available)' for the LLM input — verbatim wording that's intentionally distinct from 'N/A' (which means 'we never asked'). The LLM benefits from the semantic distinction during reasoning"
  - "gemini-analysis.ts modelString is a hard-pinned single string literal, not via routerCtx.modelOverride. Per R-12, the router module is NOT deleted — its LearningEvent + usage write are preserved. The haiku branch removal comment explains the rationale: it was a fuzzy-routing artifact, never a product decision"
  - "Cost-anomaly trip writes to the SAME breaker:gemini:state key the regular withBreaker reads. No second breaker class. The 'reason' field distinguishes 'cost_anomaly' from 'error_rate' for operator visibility. Per Amendment 2026-05-14, counter resets at TRIP time (DEL on trip) rather than CLOSE time — equivalent observable behavior since the 30s open window prevents any $1+ call from reaching the counter"
  - "Existing merge.test.ts tests had to be updated, not just extended — the D-01 cascade reverse is a behavior change. The new tests document the new contract: shared fields prioritize polygon, yahoo-only fields stay yahoo-primary, all-null emits 'unavailable' FieldOrigin"
  - "Removed @ts-expect-error from tests/integration/provider-error-budget.cron.integration.test.ts because the D-18 Prisma migration applied in Wave 1 Task 4 regenerated the client with providerHealthAlert. The unused-directive error became the build-time signal Wave 2 was looking for"
metrics:
  duration_minutes: 65
  completed_date: "2026-05-14"
  tasks_executed: 3
  files_created: 6
  files_modified: 16
  commits: 3
---

# Phase 30 Plan 03: Wave 2 — Adapter Integration Summary

**One-liner:** Wires Wave-1 primitives into every external call site in `src/lib/data/`; reverses the merge cascade to Polygon-primary for shared fields; pins Gemini main analysis to `google/gemini-3-pro` with explicit per-call-site slugs; installs the cost-anomaly trip line that reuses the regular breaker key.

## What Shipped

### Task 1: Adapter wrap + Yahoo TTL tighten — commit `7210c5e`

Every external adapter in `src/lib/data/` now composes `withTelemetry → withBreaker → withRetry → fn`:

| File | Sites wrapped | Provider id |
|------|--------------:|-------------|
| `src/lib/data/yahoo.ts` | 2 (quote, fundamentals) | `'yahoo'` |
| `src/lib/data/polygon.ts` | 1 (`fetchOk`) | `'polygon'` |
| `src/lib/data/finnhub.ts` | 1 (`fetchOk`) | `'finnhub'` |
| `src/lib/data/anthropic-search.ts` | 4 (news, analyst, sec, social) | `'anthropic-search'` |
| `src/lib/data/lightweight-community-scan.ts` | 1 (`scrapeOne` Firecrawl wrap) | `'firecrawl'` |

`TTL_SECONDS.quote` tightened from 300s → 60s (D-02). Fundamentals stays at 86400s with explicit comment.

**Tests:** 5 GREEN integration tests in `lightweight-community-scan.breaker.integration.test.ts` covering composition, short-circuit, error swallowing, ProviderCallLog BREAKER_OPEN visibility, and recovery on the next sweep.

Also removed `@ts-expect-error` from `provider-error-budget.cron.integration.test.ts` — the D-18 migration in Wave 1 Task 4 regenerated the Prisma client with the `providerHealthAlert` delegate.

### Task 2: Merge cascade reverse + fallback_summary + unavailable rendering — commit `6728227`

`src/lib/data/merge.ts`:
- **D-01** — `SHARED_CASCADE_ORDER = ['polygon', 'finnhub', 'yahoo']` for shared fields (market_cap, exchange, 52w_high/low, pe_ratio, eps, revenue, debt_to_equity, profit_margin). `YAHOO_ONLY_CASCADE_ORDER = ['yahoo']` for yahoo-only fields (price, volume, percent_change_today).
- **D-09** — Every cascade resolution emits a `FallbackSummaryEntry` into the merged section's `_fallback_summary`. `tried[]` reflects providers consulted until first non-null (short-circuit) or full cascade on all-null.
- **D-11** — When every cascade source returned null, FieldOrigin = `'unavailable'` (NOT null). Legacy persisted records with null are still respected via the OR check in renderers.

`src/lib/data/source-package.ts`: both `buildSourcePackageOldLadder` and `buildSourcePackageNewLadder` aggregate the per-section `_fallback_summary` arrays into one flat `SourcePackage.fallback_summary`.

`src/lib/types.ts`: `MarketDataSection._fallback_summary`, `FundamentalsSection._fallback_summary`, `SourcePackage.fallback_summary` all added as optional fields (back-compat for persisted JSONB).

`src/components/ResearchReport.tsx`: `sourceLabel()` widened to handle `'unavailable'` → no badge. The em-dash render of the VALUE is automatic via existing `formatPrice/Percent/MarketCap` helpers (they already return `'—'` on null input — merge.ts ensures value is null whenever FieldOrigin is `'unavailable'`).

`src/lib/research-brief.ts`: `fmtUnavailable()` helper renders `"(no source available)"` for `'unavailable'`/`null` origin on all market_data + fundamentals brief lines. `"N/A"` is reserved for "we never asked" (legacy records without merge metadata).

**Tests:** 22 GREEN tests in `merge.test.ts` (existing 15 updated for the reverse cascade + 7 new Phase-30 D-01/D-09/D-11 tests). 6 GREEN tests in `source-package.fallback.unit.test.ts` covering the shape contract.

### Task 3: Gemini model pins + cost-anomaly trip line — commit `b6e3fc1`

`src/lib/gemini-analysis.ts`:
- Replaced the pre-Phase-30 ternary `routerCtx == null ? 'flash' : routerCtx.modelOverride === 'gemini-pro' ? 'pro' : routerCtx.modelOverride === 'haiku' ? 'haiku' : 'flash'` with a hard-pinned single string literal: `const modelString = 'google/gemini-3-pro';`
- Per R-12, the `src/lib/reasoning/router.ts` module is NOT deleted — its `LearningEvent` row + token usage write are preserved. Only the model-selection output is ignored.

`src/lib/sentiment/per-doc-classifier.ts`: verified already pinned to `'google/gemini-3.1-flash-lite'`; added `// Phase 30 D-14` inline comment.

`src/lib/telemetry/withTelemetry.ts`: post-success cost-anomaly trip line in `queueMicrotask`. When `provider_id === 'gemini'` AND `cost_usd > 1.00`:
1. INCR `cost_anomaly:gemini` (counter)
2. on count==1: EXPIRE 3600s (1h window)
3. on count>=3: SET `breaker:gemini:state` to `{ status: 'open', opened_at, reason: 'cost_anomaly' }` (1h TTL), then DEL the counter (Amendment 2026-05-14 trip-time reset)

The trip writes to the **same** `breaker:gemini:state` key the regular withBreaker reads — no second breaker class. The `reason` field distinguishes `'cost_anomaly'` from `'error_rate'` for operator visibility.

**Tests:** 6 GREEN tests in `gemini-analysis.model-pin.unit.test.ts` (slug pinning, no haiku ternary, no dynamic model template literal, per-doc classifier propagation). 6 GREEN tests in `cost-anomaly-breaker.integration.test.ts` (single-call increment, sub-$1 no-op, 3-call trip, window decay, trip-time DEL, BreakerOpenError on subsequent gemini calls).

## Composition Contract (load-bearing, encoded in module JSDoc + acceptance grep)

```ts
withTelemetry(provider, () =>
  withBreaker(provider, () =>
    withRetry(() => fn())));
```

The cost-anomaly trip line reuses the same `breaker:gemini:state` key as the regular breaker. When the cost-anomaly path trips, all subsequent gemini calls short-circuit through `withBreaker` with `BreakerOpenError` — including the analysis call site, which is now hard-pinned to `'google/gemini-3-pro'`.

## Verification

| Check | Result |
|-------|--------|
| `grep -c withBreaker src/lib/data/yahoo.ts` | 5 (≥2 acceptance) |
| `grep -c withBreaker src/lib/data/polygon.ts` | 3 (≥1) |
| `grep -c withBreaker src/lib/data/finnhub.ts` | 3 (≥1) |
| `grep -c withBreaker src/lib/data/anthropic-search.ts` | 9 (≥4) |
| `grep -c withBreaker src/lib/data/lightweight-community-scan.ts` | 2 (≥1) |
| `grep "quote: 60" src/lib/data/cache/cache-keys.ts` | 1 match |
| `grep "Phase 30 D-02" src/lib/data/cache/cache-keys.ts` | 2 matches (≥2) |
| `grep "Phase 30 D-01" src/lib/data/merge.ts` | 1+ |
| `grep "fallback_summary" src/lib/data/merge.ts` | 12 matches (≥3) |
| `grep "FallbackSummaryEntry" src/lib/data/merge.ts` | 2+ |
| `grep "fallback_summary" src/lib/data/source-package.ts` | 4 matches (≥2) |
| `grep "'unavailable'" src/lib/data/merge.ts` | 2+ matches |
| `grep "Phase 30 D-11" src/components/ResearchReport.tsx` | 1+ |
| `grep "Phase 30 D-11" src/lib/research-brief.ts` | 1+ |
| `grep "google/gemini-3-pro" src/lib/gemini-analysis.ts` | 1 |
| `grep "Phase 30 D-14" src/lib/gemini-analysis.ts` | 1 |
| `grep "Phase 30 D-14" src/lib/sentiment/per-doc-classifier.ts` | 1 |
| `grep "google/gemini-3.1-flash-lite" src/lib/sentiment/per-doc-classifier.ts` | 1 |
| `grep "cost_anomaly:gemini" src/lib/telemetry/withTelemetry.ts` | 2 |
| `grep "Phase 30 D-15" src/lib/telemetry/withTelemetry.ts` | 2 |
| `grep "queueMicrotask" src/lib/telemetry/withTelemetry.ts` | 1 |
| `grep "breaker:gemini:state" src/lib/telemetry/withTelemetry.ts` | 3 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run src/lib/data/__tests__/merge.test.ts` | 22/22 ✓ |
| `npx vitest run tests/unit/source-package.fallback.unit.test.ts` | 6/6 ✓ |
| `npx vitest run tests/unit/gemini-analysis.model-pin.unit.test.ts` | 6/6 ✓ |
| `npx vitest run --config vitest.integration.config.ts tests/integration/cost-anomaly-breaker.integration.test.ts` | 6/6 ✓ |
| `npx vitest run --config vitest.integration.config.ts tests/integration/lightweight-community-scan.breaker.integration.test.ts` | 5/5 ✓ |
| `npm test -- --run` baseline pre-Plan-03 failures | 6 failed / 1588 passed / 15 todo |
| `npm test -- --run` post-Plan-03 | 4 failed / 1610 passed / 3 todo |

**Net change:** -2 pre-existing failures (the @ts-expect-error removal fixed the unused-directive error in `provider-error-budget.cron.integration.test.ts` and the new GREEN tests turned 12 todos into passing assertions). No new failures introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Worktree HEAD was at 8508ed5 (BEFORE expected base 210f2ab)**
- **Found during:** Initial context loading — `.planning/phases/30-provider-health-hardening/30-03-PLAN.md` not visible.
- **Issue:** Worktree was created from a pre-Wave-1 ancestor; Wave 1 primitives (`circuit-breaker.ts`, RED scaffolds, prisma migration) were not present.
- **Fix:** `git merge --ff-only 210f2ab288de961ed022fa50e9b7548a34a0bcf3` brought HEAD forward cleanly (no conflicts because the worktree had no in-flight Phase-30 changes).
- **Files modified:** none (git state only)

**2. [Rule 3 — Test contract update] Pre-existing merge.test.ts assertions clashed with D-01 reverse cascade**
- **Found during:** Task 2 verification — `npx vitest run src/lib/data/__tests__/merge.test.ts` reported 6 failures after the merge.ts refactor.
- **Issue:** 6 existing tests asserted `_field_sources?.X === 'yahoo'` for shared fields under the pre-Phase-30 yahoo-first cascade. D-01 reverses the order to polygon-first.
- **Fix:** Rewrote those 6 tests to assert the new contract (polygon-first for shared fields, yahoo-only for price/volume/percent_change_today). Added 7 new Phase-30-specific tests in a separate `describe('Phase 30 / D-01 + D-09 + D-11', ...)` block. Total merge.test.ts test count went from 14 → 22.
- **Files modified:** `src/lib/data/__tests__/merge.test.ts`
- **Commit:** `6728227`

### Path correction (no behavior change)

**3. [Rule 3 — Spec-vs-reality] URL-discovery + community-scan Gemini call sites do not exist**
- **Plan called out:** "URL-discovery Gemini call passes model 'google/gemini-3-flash'" + "lightweight-community-scan summarization passes model 'google/gemini-3-flash'"
- **Actual project state:** Grep on `src/` finds Gemini call sites only in `gemini-analysis.ts` (main analysis, now pinned to `google/gemini-3-pro`) and `per-doc-classifier.ts` (already pinned to `google/gemini-3.1-flash-lite`). The other Gemini call sites mentioned in the plan were deprecated by earlier phases. The remaining `claude-haiku-4.5` call sites in `gemini-analysis.ts` (lines ~412, 430, 528) use the Anthropic SDK directly — they are NOT Gemini AI Gateway calls and are out of D-14 scope.
- **Action:** Updated the model-pin test to reflect only the 2 live call sites + a guard-test ensuring no fuzzy routing artifacts (no haiku ternary, no dynamic model template literal). The plan's `'google/gemini-3-flash'` requirement is satisfied by the absence of any non-pinned Gemini call site in the codebase.

### Validator-flagged out-of-scope items (deferred)

**4. [Rule 4 — Architectural decision deferred]** Logged in `.planning/phases/30-provider-health-hardening/deferred-items.md`:
- Direct Anthropic SDK import on `gemini-analysis.ts` line 12 (out of Phase-30 scope; would require migration to `@ai-sdk/anthropic` via AI Gateway with OIDC auth)
- Hyphenated model slug pattern in `gemini-analysis.ts` (validator suggests dots; D-14 Amendment 2026-05-14 explicitly pins the hyphen form `google/gemini-3-pro` per live AI Gateway slug verification)

## Known Stubs

None. Every interface added is wired:
- `_fallback_summary` on each merged section is read by `source-package.ts` to populate the flat `SourcePackage.fallback_summary`.
- The cost-anomaly trip line writes to the same `breaker:gemini:state` key the regular `withBreaker` already reads — no second breaker class to wire.

## Threat Flags

None. No new client-facing surface introduced. The new `cost_anomaly:gemini` Upstash key is server-only and namespaced; the trip writes to an existing breaker key namespace (T-30-03-03 disposition `accept` — `cost_usd` is not sensitive).

## Self-Check: PASSED

Created files verified:
- `tests/unit/source-package.fallback.unit.test.ts` — FOUND (converted RED → GREEN)
- `tests/unit/gemini-analysis.model-pin.unit.test.ts` — FOUND (converted RED → GREEN)
- `tests/integration/cost-anomaly-breaker.integration.test.ts` — FOUND (converted RED → GREEN)
- `tests/integration/lightweight-community-scan.breaker.integration.test.ts` — FOUND (converted RED → GREEN)
- `.planning/phases/30-provider-health-hardening/deferred-items.md` — FOUND
- `.planning/phases/30-provider-health-hardening/30-03-SUMMARY.md` — FOUND (this file)

Modified files verified (sample):
- `src/lib/data/yahoo.ts` — contains 5x `withBreaker` markers — VERIFIED
- `src/lib/data/anthropic-search.ts` — contains 9x `withBreaker` markers — VERIFIED
- `src/lib/data/cache/cache-keys.ts` — contains `quote: 60` — VERIFIED
- `src/lib/gemini-analysis.ts` — contains 1x `google/gemini-3-pro` pin — VERIFIED
- `src/lib/telemetry/withTelemetry.ts` — contains `cost_anomaly:gemini` + `queueMicrotask` + `breaker:gemini:state` — VERIFIED
- `src/lib/data/merge.ts` — contains `fallback_summary` (12x) + `Phase 30 D-01` — VERIFIED

Commits verified:
- `7210c5e` — FOUND (`feat(30-03): wrap data adapters with withBreaker; tighten Yahoo quote TTL`)
- `6728227` — FOUND (`feat(30-03): reverse merge cascade to Polygon→Finnhub→Yahoo; emit fallback_summary`)
- `b6e3fc1` — FOUND (`feat(30-03): pin Gemini model slugs and install cost-anomaly trip line`)

## Next Plan (30-04) Hand-off Notes

- **`/api/cron/provider-error-budget`** can now ship without any blockers — the `ProviderHealthAlert` Prisma model is migrated (Wave 1), the `withBreaker` adapter wraps are live on every external call (this plan), and `ProviderCallLog` rows now carry `BREAKER_OPEN` classifications from the trip events. The cron's done-gate SQL pattern from `/api/cron/cost-budget-check` is the canonical template.
- **`/insights/sentiment-health`** Fallback heatmap tile (D-10) can read `SourcePackage.fallback_summary` directly — the field is now populated by both ladders. Each entry has `{ field, tried, resolved_by }` for per-provider fallback-rate aggregation.
- **`/insights/sentiment-health`** Active alerts tile (D-19) reads `ProviderHealthAlert WHERE resolved_at IS NULL`. The cron writes the rows; the tile renders them.
- **Cost-anomaly trip is operationally observable** via:
  - `console.warn('[withTelemetry] gemini cost_anomaly breaker tripped:', { cost_usd, count })` in Vercel logs
  - `breaker:gemini:state` key in Upstash with `reason: 'cost_anomaly'`
  - Subsequent `BREAKER_OPEN` rows in `ProviderCallLog` with `provider_id='gemini'`
- **Composition order is the load-bearing invariant.** Any new adapter added to `src/lib/data/` MUST follow `withTelemetry → withBreaker → withRetry → fn`. The acceptance grep on `withBreaker` count per adapter file is the enforcement signal for code review.
- **Yahoo-only field set** (price, volume, percent_change_today) is now codified in `merge.ts` as `YAHOO_ONLY_MARKET_KEYS`. If Polygon or Finnhub ever start exposing one of these fields, update the set + the cascade accordingly.
