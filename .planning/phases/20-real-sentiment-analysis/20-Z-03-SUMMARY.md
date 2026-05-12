---
phase: 20
plan: 20-Z-03
subsystem: telemetry
tags: [telemetry, observability, providers, dashboard, crons, cost-budget, retention]
requires: [20-Z-01-PLAN]
provides:
  - withTelemetry-wrapper
  - ProviderCallLog-table
  - sentiment-health-dashboard
  - cost-budget-alerter
  - 90d-retention-sweep
  - check-telemetry-coverage-ci-guard
affects:
  - src/lib/data/yahoo.ts
  - src/lib/data/polygon.ts
  - src/lib/data/polygon-news.ts
  - src/lib/data/finnhub.ts
  - src/lib/data/finnhub-analyst.ts
  - src/lib/data/anthropic-search.ts
  - src/lib/data/stocktwits.ts
  - src/lib/data/lightweight-community-scan.ts
  - src/lib/data/adapters/apewisdom.ts
  - src/lib/data/adapters/exa-search.ts
  - src/lib/sentiment/finsentllm.ts
  - src/lib/gemini-analysis.ts
tech-stack:
  added:
    - "@/lib/telemetry/withTelemetry (fire-and-forget wrapper composing around withRetry)"
    - "Postgres percentile_cont aggregation (raw SQL via $queryRawUnsafe)"
  patterns:
    - "queueMicrotask fire-and-forget INSERT (T-20-Z-03-01)"
    - "controlled enum error classification — never raw message (T-20-Z-03-05)"
    - "cold-start short-circuit via insufficient_history sentinel (T-20-Z-03-04)"
    - "lazy @/lib/db import to keep telemetry module-load safe in env without DATABASE_URL"
key-files:
  created:
    - src/lib/telemetry/withTelemetry.ts
    - src/lib/telemetry/cost-estimators.ts
    - src/lib/telemetry/error-classifier.ts
    - src/lib/telemetry/provider-call-log.ts
    - src/app/insights/sentiment-health/page.tsx
    - src/app/insights/sentiment-health/components/ProviderTile.tsx
    - src/app/api/insights/sentiment-health/route.ts
    - src/app/api/cron/cost-budget-check/route.ts
    - src/app/api/cron/provider-call-log-retention/route.ts
    - scripts/check-telemetry-coverage.ts
    - tests/telemetry/withTelemetry.unit.test.ts
    - tests/telemetry/cost-estimators.unit.test.ts
    - tests/telemetry/error-classifier.unit.test.ts
    - tests/telemetry/cost-budget-check.unit.test.ts
    - tests/integration/provider-call-log.integration.test.ts
    - tests/integration/sentiment-health-api.integration.test.ts
  modified:
    - prisma/schema.prisma  # +ProviderCallLog model + 2 composite indexes
    - vercel.json  # +2 crons (cost-budget-check, provider-call-log-retention)
    - package.json  # +check-telemetry-coverage script
    - 12 adapter / sentiment / reasoning files (wrap edits — see affects[])
decisions:
  - "Exa adapter wrapped under provider_id 'anthropic-search' as the umbrella for LLM-search vendors in v1 (per plan deviation note line 870) — keeps ProviderId enum at 9 entries with zero downstream type churn"
  - "Lazy-import @/lib/db inside recordCallAsync/deleteOlderThan so wrapped adapters' unit tests that don't stub DATABASE_URL no longer crash on module load — T-20-Z-03-01 still holds (queueMicrotask still runs)"
  - "Dashboard page queries Postgres directly via dynamic @/lib/db import (matches /insights/page.tsx pattern) — empty state when DATABASE_URL unset"
metrics:
  duration_minutes: 30
  completed_date: "2026-05-11"
  tasks_total: 13
  tasks_completed: 13
  wrap_sites_total: 21
  wrapper_overhead_p99_ms_target: 5  # plan ceiling; intent is 2ms; measured well under in unit test
  provider_call_logs_indexes: 2
  provider_call_logs_row_count_at_commit: 0  # tests clean up their own rows
  unit_tests_added: 31
  integration_tests_added: 6
---

# Phase 20 Plan Z-03: Telemetry (`/insights/sentiment-health` + ProviderCallLog + withTelemetry wrapper) Summary

## Self-Check: PASSED

- All 16 created files exist on disk (verified via Read tool prior to commit)
- All 5 commits present in git history (a36c987, 0108043, a725076, 8665ba5, 4361bc3)
- ProviderCallLog table live in production Neon with 2 composite indexes
- `npm run check-telemetry-coverage` exits 0 (11 modules wrapped)
- `npx tsc --noEmit` exits 0
- `npm test` — 786 passed, 1 skipped, 3 todo (87 suites)
- `npx vitest run tests/telemetry/` — 31/31 pass
- `npx vitest run --config vitest.integration.config.ts tests/integration/provider-call-log.integration.test.ts tests/integration/sentiment-health-api.integration.test.ts` — 6/6 pass
- Wrap-site count 21 >= 6 plan target
- Wrapper overhead p99 measured well under the 5ms CI ceiling

## One-liner

Per-provider observability for every external call Cipher makes — latency p50/p95/p99, error rate, cost-per-request, cache-hit rate, fallback rate, plus a daily 1.5x rolling-7d cost-budget alerter and 90-day retention sweep — via a `withTelemetry<T>()` wrapper composing around `withRetry()` with fire-and-forget INSERTs into a new immutable `ProviderCallLog` Prisma table.

## What landed

### Schema (Task 1, commit `a36c987`)

- `ProviderCallLog` model added to `prisma/schema.prisma` (purely additive — zero touches to existing models)
- 2 composite indexes: `idx_pcl_provider_started` and `idx_pcl_ticker_started` (both DESC on `started_at`)
- Pushed to production Neon (Task 3 — confirmed via psql; table exists, row count 0 at commit)

### Telemetry primitives (Task 2, commit `0108043`)

- `cost-estimators.ts` — pinned per-provider USD constants with citation comments + `GEMINI_TOKEN_RATES` (input $0.000125/token, output $0.000375/token — 2026-Q1)
- `error-classifier.ts` — `classifyError(unknown) -> TelemetryErrorClass` — controlled enum mapping (RATE_LIMITED | AUTH_FAILED | TIMEOUT | UPSTREAM_5XX | NETWORK | UNKNOWN); raw error messages NEVER returned (T-20-Z-03-05)
- `provider-call-log.ts` — insert-only DAO with `recordCallAsync` (fire-and-forget via queueMicrotask) + `deleteOlderThan(N)` for the retention cron

### withTelemetry wrapper (Task 4, commit `a725076`)

- Composes around any async function; the wrapped withRetry call stays untouched
- Captures `started_at`, `ended_at`, `duration_ms` from `performance.now()`
- Cost: defaults to `COST_PER_CALL_USD[provider_id]`; overridable via `cost_usd_estimator(result)` — Gemini uses `usage.inputTokens * INPUT + usage.outputTokens * OUTPUT`
- INSERT NEVER awaited before caller's value returns
- Error path: classifies → records → rethrows the ORIGINAL error reference (verified by unit test)

### Adapter wrap edits (Task 5, commit `8665ba5`)

| File | Provider | Sites |
|------|----------|-------|
| `src/lib/data/yahoo.ts` | `yahoo` | 2 |
| `src/lib/data/polygon.ts` | `polygon` | 1 |
| `src/lib/data/polygon-news.ts` | `polygon` | 1 |
| `src/lib/data/finnhub.ts` | `finnhub` | 1 |
| `src/lib/data/finnhub-analyst.ts` | `finnhub` | 3 |
| `src/lib/data/anthropic-search.ts` | `anthropic-search` | 4 |
| `src/lib/data/stocktwits.ts` | `stocktwits` | 2 |
| `src/lib/data/lightweight-community-scan.ts` | `firecrawl` | 1 |
| `src/lib/data/adapters/apewisdom.ts` | `apewisdom` | 1 |
| `src/lib/data/adapters/exa-search.ts` | `anthropic-search` (umbrella) | 3 |
| `src/lib/sentiment/finsentllm.ts` | `finbert-hf` | 1 |
| `src/lib/gemini-analysis.ts` | `gemini` | 1 |
| **Total** | | **21** |

Existing `withRetry()` composition preserved at every site — the wrapper layer wraps the retry layer (`withTelemetry(...) -> withRetry(...) -> doFetch(...)`).

### Dashboard, crons, CI guard, tests (Tasks 6-12, commit `4361bc3`)

- `/insights/sentiment-health` — server component, force-dynamic, NavBar-wrapped, queries Postgres directly via dynamic `@/lib/db` import (matches `/insights/page.tsx` pattern). Empty state when DATABASE_URL unset.
- `/api/insights/sentiment-health` — JSON endpoint computing per-provider `percentile_cont(0.50/0.95/0.99)` + error/cache/fallback/cost rates over last-24h `provider_call_logs`
- `/api/cron/cost-budget-check` — daily alerter at 1.5x rolling-7d MEAN-of-DAILY-COST baseline; emits `status: 'insufficient_history'` until 7 days of data exist (T-20-Z-03-04 mitigation); auth via Bearer `CRON_SECRET`
- `/api/cron/provider-call-log-retention` — daily sweep deleting rows older than 90 days (T-20-Z-03-02 mitigation)
- `vercel.json` — 6 crons total (4 existing + cost-budget at 09:00 UTC + retention at 09:30 UTC). Well within Pro's 40-cron limit.
- `scripts/check-telemetry-coverage.ts` — CI guard greps 11 required external-call modules for `withTelemetry(`; exits 1 on any uncovered module. `npm run check-telemetry-coverage` script wired.

## Tests

| Suite | Tests | Status |
|-------|-------|--------|
| `tests/telemetry/withTelemetry.unit.test.ts` | 7 | PASS |
| `tests/telemetry/cost-estimators.unit.test.ts` | 11 | PASS |
| `tests/telemetry/error-classifier.unit.test.ts` | 12 | PASS |
| `tests/telemetry/cost-budget-check.unit.test.ts` | 1 | PASS |
| `tests/integration/provider-call-log.integration.test.ts` | 5 | PASS (live Neon) |
| `tests/integration/sentiment-health-api.integration.test.ts` | 1 | PASS (live Neon) |
| `npm test` (full unit suite — 87 files) | 786 | PASS (no regressions) |

Notable coverage:

- **Wrapper overhead**: 1000-invocation harness measures wrapper p99 well under the 5ms CI ceiling (intent: 2ms per T-20-Z-03-01)
- **Return-value preservation**: caller sees the EXACT object reference fn() returned
- **Error rethrow**: re-throws the ORIGINAL error reference; preserves `.status` for caller inspection
- **Secret-leak prevention**: `classifyError(Error("Auth failed: sk-ant-SECRET..."))` returns `'AUTH_FAILED'` only; the secret never enters the persisted row (T-20-Z-03-05)
- **Cost-estimator throw safety**: thrown estimator falls back to the flat-rate constant
- **Cold-start no-op**: providers with `days_observed < 7` emit `insufficient_history` (T-20-Z-03-04)
- **Live Neon round-trip**: `withTelemetry('yahoo', ...)` → row appears within 3s; columns + types validated
- **percentile_cont aggregation**: 10 deterministic duration rows → p50 in (500,600); p95 > 900; p99 > 950
- **Retention sweep**: 100-day-old row gets deleted by `deleteOlderThan(90)`
- **Dashboard endpoint**: returns 200 + non-empty providers + p50 > 0 + error_rate in [0,1] in < 2s

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @/lib/db top-level import crashed wrapped adapters' unit tests**

- **Found during:** Task 11 (running full `npm test` after wrap edits)
- **Issue:** `provider-call-log.ts` had `import { prisma } from '@/lib/db'` at the top of the module. `@/lib/db` throws at import time when `DATABASE_URL` is unset (the standard unit-test environment). Every adapter that now imports `withTelemetry` (yahoo, polygon, finnhub, etc.) transitively imports `provider-call-log.ts`, so 10 previously-passing unit suites broke with `DATABASE_URL environment variable is required but not set.`
- **Fix:** Defer the `@/lib/db` import to inside the function bodies. `recordCallAsync` short-circuits with `__swallowed++` when DATABASE_URL is unset (telemetry must never block or fail the caller — same invariant as INSERT failures). `deleteOlderThan` (only called by the retention cron, which runs only with DATABASE_URL set) uses `await import('@/lib/db')`.
- **Files modified:** `src/lib/telemetry/provider-call-log.ts`
- **Commit:** `4361bc3` (Task 6-12 bundle)
- **Why this is Rule 1**: bug directly caused by my wrap edits — pre-existing adapter unit tests passed before the wrap, broke after, pass again after the lazy-import fix.

**2. [Rule 1 - Scope deviation] Exa adapter wrapped under `anthropic-search` umbrella**

- **Plan said:** either widen `ProviderId` enum to add `'exa'` OR fall back to `anthropic-search` (line 870 — choose smaller diff).
- **Choice:** Used `anthropic-search` umbrella. Inline comment in `exa-search.ts` documents the choice. Keeps ProviderId enum at 9 entries; zero downstream type churn; one less line in `COST_PER_CALL_USD`.

### Pre-existing issues NOT auto-fixed (documented in deferred-items.md)

- Posttooluse validator flagged 4 pre-existing issues in `src/lib/gemini-analysis.ts` (direct Anthropic SDK import at line 12, model-slug format at lines 34/686, provider-key path at line 44). All pre-date this plan. The file's own comment block (lines 9-11) explains why the direct Anthropic SDK is used — Pool B niche discovery requires the `web_search_20250305` tool which is not yet routed through the AI Gateway. Migrating is a Wave-B-scope plan, not 20-Z-03. Logged in `.planning/phases/20-real-sentiment-analysis/deferred-items.md`.

### Pre-existing integration test failures (out of scope)

- 6 integration tests in `tests/integration/backfill-active-rate`, `learn-dual-class`, `learn-quad-class`, `schema-phase-16`, `backfill-ess`, `learn.ess.live` fail (timeouts running real watchlist scans against Neon). Confirmed pre-existing by stashing my changes — they fail on the pre-edit tree as well. Not caused by 20-Z-03. No action taken per SCOPE BOUNDARY rule.

## Auth Gates Encountered

None. Task 3 (Prisma db push) was already complete in production Neon at session start (committed in `a36c987` ancestry); verified via `psql` that the table + 2 indexes exist.

## Known Stubs

None. The dashboard render path correctly degrades to an empty state when `DATABASE_URL` is unset (matches the existing `/insights/page.tsx` pattern); when the database is reachable, rows flow from real wrapped calls within minutes. The cost-budget cron correctly returns the `insufficient_history` sentinel for the first 7 days of data.

## Operator follow-up

- **OTel collector** (deferrable per CONTEXT.md line 173 — "internal dashboard works without it"): the `WithTelemetryOptions` interface reserves an `// extensions?: { otel?: 'off' | 'shadow' | 'on' }` comment placeholder for the future hook. Provision when richer trace export is needed (multi-region tracing, cross-service correlation).
- **Quarterly cost-estimator review** (T-20-Z-03-03): re-fetch upstream pricing pages every 90 days and update `src/lib/telemetry/cost-estimators.ts` constants. The pinning unit test (`tests/telemetry/cost-estimators.unit.test.ts`) will fail on silent edits, forcing a PR-time review.
- **Cost-budget alerts** are currently `console.warn` only (visible in Vercel Function logs). Graduate to email / Slack via an env-var hook in a future plan when the engine has accumulated enough history to make alerts actionable.

## Forward references

This plan is the foundation Wave A/B/C/D plans report their telemetry numbers against:

- **20-B-01** Gemini per-document cost ceiling — read `cost_per_call_usd_24h` from this dashboard for `provider_id='gemini'`
- **20-B-02** FinBERT cost claim — read `total_cost_usd_24h` from `provider_id='finbert-hf'`
- **20-B-04 / 20-C-01** source-tier IC measurement — the per-provider `count_24h` + `error_rate` will tell us which sources have sufficient signal to compute IC
- Any future Wave A/B/C/D plan with a `ship if cost <= X / latency <= Y` gate reports against the dashboard's per-provider tiles

## Decisions made

1. **Exa under anthropic-search umbrella** — keeps `ProviderId` enum at 9 entries; smaller diff per plan deviation note (line 870)
2. **Lazy @/lib/db import in provider-call-log.ts** — makes the telemetry module load-safe in environments without DATABASE_URL (CI unit tests, local-mode dev); preserves T-20-Z-03-01 (queueMicrotask still runs; INSERT still fire-and-forget)
3. **Dashboard direct DB query** — page.tsx imports prisma dynamically and runs the same `percentile_cont` SQL as the API route; mirrors `/insights/page.tsx` pattern; avoids same-origin fetch awkwardness in server components
4. **Cost-budget alerts via console.warn only** — Vercel Functions log surface is enough for v1; graduate to email/Slack in a future plan

## Commits (5 total, including the Task 13 metadata-bundle commit landed below)

| Commit | Message |
|--------|---------|
| `a36c987` | feat(20-Z-03): add ProviderCallLog Prisma model + 2 composite indexes |
| `0108043` | feat(20-Z-03): telemetry primitives — cost-estimators + error-classifier + DAO |
| `a725076` | feat(20-Z-03): add withTelemetry<T>() wrapper composing around withRetry |
| `8665ba5` | feat(20-Z-03): wrap external call sites with withTelemetry |
| `4361bc3` | feat(20-Z-03): /insights/sentiment-health dashboard + cost-budget & retention crons + tests |
