# Phase 30: Provider Health Hardening - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Every external data fetcher in `src/lib/data/` returns useful data under prod conditions.

**Hard done-gate (binary):**
1. `ProviderCallLog.error_rate < 10%` per `provider_id` over rolling 24h (with `insufficient_history` cold-start guard when `total_calls < 50`).
2. `AVG(ProviderCallLog.cost_usd) WHERE provider_id='gemini'` over rolling 24h `< $0.50`.
3. Sentiment-scan / price-followup / learn cron pipeline tolerates single-provider outages without HTTP 500.

**Out of scope:** New data sources, new sentiment models, schema redesign, dashboard redesign, Phase 20 follow-ups not on the QUATERNARY list, any work on phases 21-29.

</domain>

<decisions>
## Implementation Decisions

### Yahoo IP Rate-Limit (highest-impact fix)

- **D-01:** Demote Yahoo to **third-tier fallback** in the merge chain. New primary order for `quote` and `fundamentals` fields:
  1. Polygon (primary)
  2. Finnhub (fallback 1)
  3. Yahoo (fallback 2)
  Update `src/lib/data/merge.ts` ordering + `FieldOrigin` priority comments. Fields Polygon/Finnhub don't cover (52-week range, specific Yahoo-only metrics) remain Yahoo-primary.
- **D-02:** Wrap Yahoo read paths in `src/lib/data/cache/upstash.ts` with **60-second TTL** for `quote`, longer for fundamentals (Claude's discretion). Cache key pattern: `yahoo:{endpoint}:{ticker}:{date_or_window}`. Cache hits do NOT count as Yahoo errors (already handled by `withTelemetry.cache_check`).
- **D-03:** Yahoo remains a real fallback — do NOT remove the adapter or `yahoo.ts`. The error rate falls because Yahoo traffic drops ~95%, not because Yahoo is bypassed.

### Circuit Breaker

- **D-04:** **Per-provider scope, Upstash-shared state.** Breaker key pattern: `breaker:{provider_id}`. State survives lambda cold starts so concurrent invocations agree on whether a provider is open. ~1ms Upstash REST overhead is acceptable.
- **D-05:** **Trip rule: rolling error rate over last 20 calls.** If `errored / total > 0.5` on the trailing window, trip. Counter ring lives in Upstash (one key per provider, list of last-20 outcomes). Tunable per-provider via config.
- **D-06:** **Half-open recovery: 30s open → 1 probe call → close on success / reopen on failure.** Classic Hystrix pattern. Single probe in flight at a time (Upstash SETNX guard).
- **D-07:** When breaker is open, the adapter throws a typed `BreakerOpenError extends Error` (with `provider_id` + `opened_at` fields). `withRetry` does NOT retry it (treat as non-retryable). Caller code falls through to the next provider in the chain.
- **D-08:** Breaker trips are recorded as a separate `error_class` value `BREAKER_OPEN` added to the `TelemetryErrorClass` enum in `src/lib/telemetry/error-classifier.ts`. Schema migration is additive (enum widening only).

### Fallback Chain Semantics

- **D-09:** **Track partial-data signal on `SourcePackage`.** Add `fallback_summary: { field: string; tried: ProviderId[]; resolved_by: ProviderId | 'unavailable' }[]` to the `SourcePackage` shape (`src/lib/data/source-package.ts`). Reports themselves do NOT show this — it's plumbing telemetry surfaced in `/insights/sentiment-health`.
- **D-10:** Add a **"Fallback heatmap" tile** to `/insights/sentiment-health` showing per-provider `fallback_used` rate from `ProviderCallLog` over the last 24h.
- **D-11:** **Extend `FieldOrigin` union** (currently `'yahoo' | 'finnhub' | 'polygon'`) to add `'unavailable'`. When every provider for a field fails, `merge.ts` sets the field to `null` and `FieldOrigin` to `'unavailable'`. Downstream renderers (`research-brief.ts`, the report page, the engine-context lookup) must handle this gracefully — render `'—'` not `'NaN'`.
- **D-12:** **Cron resilience: skip + log + continue batch.** When all providers fail for a ticker in a sentiment-scan batch, increment a `ticker_skipped` counter on the cron summary, log a warning, move to the next ticker. The rotating watchlist will retry on the next sweep. Matches the existing "6 scanned / 13 skipped" pattern.
- **D-13:** Cron summary written to logs MUST include per-batch counts: `scanned`, `skipped_no_data`, `skipped_breaker_open`, `errors`. These become inputs for the Phase-30 done-gate alerting (D-17).

### Gemini Cost Anomaly

- **D-14:** **Fork analysis tier (Pro) from triage tier (Flash) via explicit per-call-site model pins.** No more AI-Gateway fuzzy routing.
  - `src/lib/gemini-analysis.ts` (main analysis call): explicit `model: 'gemini-2.5-pro'` — Pro is justified for the reasoning-heavy analysis call.
  - All other Gemini call sites (URL-discovery, lightweight community summarization, prompt-routing, anything else): explicit `model: 'gemini-2.5-flash'`.
  - Audit all `generateObject(` / `generateText(` call sites and add the explicit `model` field; no implicit defaults.
- **D-15:** **Cost-ceiling circuit breaker.** Add a post-hoc check in `withTelemetry`: if `cost_usd > 1.00` on a single Gemini call, increment a `cost_anomaly_count` counter in Upstash. If counter reaches 3 within a 1h window, trip a 1h provider-wide Gemini breaker. Counter resets after the breaker closes.
- **D-16:** **Done-gate cost assertion (binary, grep-verifiable).** Phase 30 verification includes a live SQL probe: `SELECT AVG(cost_usd) FROM "ProviderCallLog" WHERE provider_id = 'gemini' AND started_at > now() - interval '24 hours'` must be `< 0.50`. Same SQL pattern used in cost-budget-check (T-20-Z-03-04).

### Error Budget Alerting

- **D-17:** **New cron: `/api/cron/provider-error-budget`** at `15 9 * * *` UTC (between the existing 09:00 cost-budget-check and 09:30 retention sweeper). Mirrors the cost-budget-check pattern verbatim:
  - Bearer `CRON_SECRET` auth
  - `insufficient_history` no-op when `total_calls < 50` per provider over the 24h window
  - For each `provider_id` in `ProviderCallLog`: compute 24h `error_rate`. If `> 0.10`, INSERT one row into a new `ProviderHealthAlert` table.
- **D-18:** **New Prisma model `ProviderHealthAlert`** — additive migration. Columns: `id`, `provider_id`, `breached_at`, `error_rate`, `error_count`, `total_count`, `dominant_error_class`, `resolved_at` (nullable; set on the next run when the breach clears). Composite index on `(provider_id, breached_at DESC)`.
- **D-19:** **Surface in `/insights/sentiment-health`.** Add an "Active alerts" tile reading from `ProviderHealthAlert WHERE resolved_at IS NULL`. Resolved alerts are kept in the table for the same 90-day retention window as `ProviderCallLog`.
- **D-20:** **No webhook / no Slack / no email** in Phase 30. Alert surface = dashboard + Vercel logs only. Deferred (see Deferred Ideas).

### Firecrawl

- **D-21:** **Rotate the Firecrawl key and audit usage.** Pull current key via `vercel env`, generate new key via Firecrawl dashboard, push to Vercel envs (production + preview), redeploy. Verify in `ProviderCallLog` that the next `lightweight-community-scan` cron run shows `status='ok'`.
- **D-22:** Firecrawl stays primary for community-scan. **Migration to Exa is explicitly deferred.** Trigger condition: if the rotated key dies again within one week of rotation, the planner of the NEXT relevant phase migrates community-scan to Exa.
- **D-23:** Community-scan is wrapped in the new circuit breaker (D-04) so if Firecrawl dies again mid-phase-30, the cron pipeline continues to scan even with no community data.

### Done-Gate Measurement

- **D-24:** **Rolling 24h per provider with cold-start guard.** For each `provider_id` in `ProviderCallLog`:
  - `error_rate = SUM(status='error') / COUNT(*)` over `started_at > now() - interval '24h'`
  - If `COUNT(*) < 50`: report `insufficient_history` (gate passes as "no signal yet")
  - Otherwise: gate passes if `error_rate < 0.10`
  - Single number per provider; no per-`http_status` breakdown for the gate (per-`error_class` breakdown lives in the dashboard for diagnosis).
- **D-25:** **Per-provider gate verdict table** must be written to `reports/provider-health-{date}.md` (gitignored) as part of phase verification. Operator-readable summary: one row per provider, columns `total_calls | error_rate | dominant_error_class | verdict`.

### Claude's Discretion

- Exact Upstash key naming conventions (D-04 / D-15 counters)
- Cache TTL for Yahoo fundamentals (D-02) — likely longer than `quote`, planner picks
- Initial counter ring window size (D-05) — 20 is the recommendation, planner may justify a different number with citation
- Specific column types / null handling in the new `ProviderHealthAlert` Prisma model
- Whether to add an integration test asserting model id in Gemini response metadata (not on the done-gate, but a defensible regression guard)
- Naming of the new `BreakerOpenError` class and where it lives (`src/lib/data/circuit-breaker.ts` recommended)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 30 trigger doc

- `.planning/debug/resolved/bayesian-learning-engine-prod-broken.md` — QUATERNARY findings that surfaced the provider error rates and Gemini cost anomaly. Source of the 90.7% / 100% / 86.3% / $4.01 numbers.

### Existing infrastructure (consume, do not rewrite)

- `src/lib/data/retry.ts` — `withRetry` (5xx + network only, never 4xx, full jitter, 3 attempts). Phase 19-B-02 / D-25. Compose around it; do not replace.
- `src/lib/telemetry/withTelemetry.ts` — `withTelemetry<T>(provider_id, fn, opts)` wraps every external call. Phase 20-Z-03. New circuit-breaker code goes INSIDE this wrap (between `withTelemetry` and `withRetry`).
- `src/lib/telemetry/error-classifier.ts` — `TelemetryErrorClass` enum. Phase 30 widens it with `BREAKER_OPEN`.
- `src/lib/telemetry/provider-call-log.ts` — fire-and-forget INSERT. Do NOT change its contract.
- `src/lib/data/merge.ts` — field-level merge. D-01 changes the order, not the mechanism.
- `src/lib/data/cache/upstash.ts` — existing Upstash REST client. D-02 caching and D-04/D-05/D-15 breaker state both reuse this.
- `src/lib/data/source-package.ts` — D-09 extends this shape with `fallback_summary`.

### Adapter modules to harden

- `src/lib/data/yahoo.ts` (D-01, D-02)
- `src/lib/data/polygon.ts` (becomes primary)
- `src/lib/data/finnhub.ts` (stays secondary)
- `src/lib/data/lightweight-community-scan.ts` (D-21, D-23)
- `src/lib/data/anthropic-search.ts` (86.3% error rate — investigate as part of phase scope even though not enumerated above; circuit breaker applies)
- `src/lib/gemini-analysis.ts` (D-14)

### Cron + dashboard surfaces

- `vercel.json` — register new `/api/cron/provider-error-budget` cron (D-17), schedule `15 9 * * *`.
- Existing `/api/cron/cost-budget-check` — REFERENCE pattern for D-17. Mirror exactly: bearer auth, insufficient_history guard, additive INSERT.
- Existing `/api/cron/provider-call-log-retention` — already sweeps 90d; the new `ProviderHealthAlert` table inherits the same retention (extend the sweep script, do not add a parallel cron).
- `/insights/sentiment-health` server component — D-10 (Fallback heatmap), D-19 (Active alerts).

### Project standards

- `claude.md` §"Statistical-Methods Reference" — no statistical claims in this phase; cite if any error-rate threshold derivation needs justification.
- `.planning/STATE.md` — Phase 30 entry under "Roadmap Evolution"; rationale for the phase scope.
- `.planning/ROADMAP.md` — Phase 30 goal + "depends on Phase 20" relationship.

### Hard rules from prior phases (do not violate)

- Prisma migrations are additive (never drop, never change types) — `ProviderHealthAlert` is additive; `TelemetryErrorClass` enum widening is additive.
- `withRetry` does NOT retry 4xx including 408 / 429 — Phase 19-B-02 D-25. Breaker integration must respect this.
- `error_class` in `ProviderCallLog` is controlled enum, never raw error message — T-20-Z-03-05.
- Vercel cron `maxDuration: 300` (default) suffices for this phase (no backfill).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`withTelemetry`** (`src/lib/telemetry/withTelemetry.ts`) — composition layer. Circuit breaker wraps INSIDE this (`withTelemetry → breakerCheck → withRetry → fn`). No new telemetry plumbing needed.
- **`withRetry`** (`src/lib/data/retry.ts`) — already does 5xx + network with full jitter. Breaker integration: when breaker is open, throw `BreakerOpenError` BEFORE entering `withRetry` so the retry budget isn't consumed.
- **Upstash client** (`src/lib/data/cache/upstash.ts`) — REST-based, already in stack. Breaker state (D-04, D-15) and Yahoo cache (D-02) both reuse it.
- **`/api/cron/cost-budget-check`** — reference template for `/api/cron/provider-error-budget` (D-17). Identical structure: bearer auth, insufficient-history guard, additive INSERT.
- **`/insights/sentiment-health`** — server component with per-provider tiles already shipped. Two new tiles to add (D-10 fallback heatmap, D-19 active alerts).
- **`FieldOrigin`** union (`merge.ts`) — already shape-stable; widening with `'unavailable'` (D-11) is a one-line union edit + downstream nullability handling.

### Established Patterns

- **Additive Prisma migrations** — every schema addition in v2.0 has been additive. `ProviderHealthAlert` (D-18) and `TelemetryErrorClass` widening (D-08) both follow this rule.
- **Cron pattern**: bearer `CRON_SECRET` auth, `insufficient_history` cold-start no-op, idempotent INSERT, log a structured summary line per run.
- **Composition order**: external call sites wrap with `withTelemetry(provider, () => withRetry(() => fn()))`. After Phase 30, sites become `withTelemetry(provider, () => withBreaker(provider, () => withRetry(() => fn())))`.
- **No raw error messages persisted** — `classifyError` maps to controlled enum. New `BREAKER_OPEN` value follows this.
- **Fire-and-forget INSERTs** — `recordCallAsync` returns immediately, doesn't block caller timing. New breaker / alert writes follow the same pattern.

### Integration Points

- All adapters in `src/lib/data/*.ts` and `src/lib/data/adapters/*.ts` already wrap with `withTelemetry` (per the Phase 20-Z-03 audit). Phase 30 inserts `withBreaker` into the same wrappers — no new call sites discovered.
- `/insights/sentiment-health` page already does SQL aggregation over `ProviderCallLog`. New tiles slot into the existing layout.
- `vercel.json` already has 21 cron jobs; the new error-budget cron is the 22nd.
- `gemini-analysis.ts` is the canonical Gemini call site for the main analysis; explicit-model pins in D-14 are localized changes.

### Constraints

- Vercel lambda module-level state is fragmented across cold starts — that's WHY D-04 mandates Upstash-shared breaker state. Do not propose in-memory-only breakers for production.
- Yahoo throttles by IP, not by API key — there is no "rotate the Yahoo key" lever. Hence D-01 demotion as the structural fix.
- The AI Gateway `model` header MAY or MAY NOT be honored consistently — D-14 mandates explicit `model` field on the SDK call itself, not via gateway header. Verify the SDK path is the source of truth.

</code_context>

<specifics>
## Specific Ideas

- The phrase **"crons never 500"** is load-bearing. Several decisions (D-12, D-23, BreakerOpenError as non-retryable) cascade from this. Treat as a hard invariant during planning.
- The cost-budget-check cron is the **canonical pattern** the user wants mirrored for the new error-budget cron. Read it before writing the new one.
- The user specifically wants the **fallback signal visible in `/insights`** but NOT in the rendered report — keep plumbing telemetry on the dashboard side.
- The user explicitly chose **per-provider scope** for the breaker (not per-(provider, ticker)) on the grounds that the Yahoo throttle is IP-wide. Do not silently change to ticker-scoped during planning.
- The 1h cost-anomaly window (D-15) and the 30s breaker open window (D-06) are intentionally different — different decay rates for different failure types. Do not collapse them.

</specifics>

<deferred>
## Deferred Ideas

- **Slack / Discord / email alerting** for provider health breaches (raised in Area 5; user chose dashboard + logs only for now). Trigger condition: first time the dashboard alert is missed because nobody was looking.
- **Migrating community-scan to Exa** (raised in Area 6). Trigger condition: rotated Firecrawl key dies again within one week — at that point the next phase planner adopts the Exa migration. Until then Firecrawl stays primary.
- **Per-(provider, http_status) done-gate breakdown** (raised in Area 7). Trigger condition: if a single provider sits at 9% error rate but with concerning mix (e.g. 8% AUTH_FAILED + 1% UPSTREAM_5XX), revisit.
- **7-day rolling error rate** in addition to 24h (raised in Area 7). Trigger condition: a future incident where a provider degrades slowly enough that the 24h gate keeps passing but the trend is bad.
- **Cost-ceiling rolling-average alert** (raised in Area 4 alternative). Trigger condition: cost-ceiling single-call breaker (D-15) misses a class of slow-cost-drift regressions.
- **Bright Data / residential proxy for Yahoo** (raised in Area 1 alternative). Trigger condition: Polygon paid tier becomes insufficient AND Yahoo fields become irreplaceable. Tracked but not pursued.
- **Edge-runtime regional routing for Yahoo** (raised in Area 1 alternative). Same trigger as proxy option.

</deferred>

---

*Phase: 30-provider-health-hardening*
*Context gathered: 2026-05-14*
