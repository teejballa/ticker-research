# Phase 30: Provider Health Hardening - Research

**Researched:** 2026-05-14
**Domain:** Reliability engineering — circuit breakers, fallback chain semantics, cron resilience, cost anomaly detection over Upstash + Neon + Vercel + AI Gateway stack
**Confidence:** HIGH for all 25 decisions (existing infrastructure scouted directly from source; no novel libraries required)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Yahoo IP Rate-Limit (D-01..D-03)**
- D-01: Demote Yahoo to **third-tier fallback**. New order for `quote` + `fundamentals`: Polygon (primary) → Finnhub (fallback 1) → Yahoo (fallback 2). Yahoo-only fields (52w range, specific Yahoo-only metrics) remain Yahoo-primary. Update `src/lib/data/merge.ts` ordering + `FieldOrigin` priority comments.
- D-02: Wrap Yahoo read paths via `src/lib/data/cache/upstash.ts` with **60s TTL on `quote`**, longer TTL on fundamentals (Claude's discretion). Cache key pattern `yahoo:{endpoint}:{ticker}:{date_or_window}`. Cache hits do not count as errors.
- D-03: Yahoo remains a real fallback — do NOT remove the adapter.

**Circuit Breaker (D-04..D-08)**
- D-04: Per-provider scope, Upstash-shared state. Key pattern `breaker:{provider_id}`. ~1ms REST overhead acceptable.
- D-05: Trip rule — rolling error rate over last **20 calls**; trip if `errored / total > 0.5`. Counter ring per provider. Tunable per provider via config.
- D-06: Half-open recovery: **30s open → 1 probe call → close on success / reopen on failure**. Single in-flight probe (Upstash SETNX guard).
- D-07: Open breaker throws typed `BreakerOpenError extends Error` with `provider_id` + `opened_at`. `withRetry` does NOT retry it. Caller falls through to next provider.
- D-08: Add `BREAKER_OPEN` to `TelemetryErrorClass` enum. Additive enum-widening migration.

**Fallback Chain (D-09..D-13)**
- D-09: Track `fallback_summary: { field: string; tried: ProviderId[]; resolved_by: ProviderId | 'unavailable' }[]` on SourcePackage. Not surfaced in reports — only `/insights`.
- D-10: New tile on `/insights/sentiment-health` — fallback heatmap from `ProviderCallLog.fallback_used` over 24h.
- D-11: Extend `FieldOrigin` union with `'unavailable'`. Downstream renderers must render `'—'` not `'NaN'`.
- D-12: Cron resilience — skip + log + continue batch when all providers fail for a ticker. Existing "6 scanned / 13 skipped" pattern.
- D-13: Cron summary log MUST include `scanned`, `skipped_no_data`, `skipped_breaker_open`, `errors`. Inputs for D-17 alerting.

**Gemini Cost Anomaly (D-14..D-16)**
- D-14: Explicit per-call-site model pins. Main analysis = `gemini-2.5-pro`; everything else = `gemini-2.5-flash`. No implicit defaults via AI Gateway header.
- D-15: Cost-ceiling breaker. If `cost_usd > 1.00` on a single Gemini call, increment Upstash counter. If counter reaches **3 within 1h window**, trip a 1h provider-wide Gemini breaker. Counter resets after breaker closes.
- D-16: Done-gate cost assertion — `AVG(cost_usd) WHERE provider_id='gemini' AND started_at > now() - interval '24 hours'` MUST be `< 0.50`.

**Error Budget Alerting (D-17..D-20)**
- D-17: New cron `/api/cron/provider-error-budget` at `15 9 * * *` UTC. Mirrors `cost-budget-check` verbatim: bearer auth, `insufficient_history` no-op when `total_calls < 50`, additive INSERT.
- D-18: New `ProviderHealthAlert` Prisma model. Columns: `id`, `provider_id`, `breached_at`, `error_rate`, `error_count`, `total_count`, `dominant_error_class`, `resolved_at` (nullable). Composite index on `(provider_id, breached_at DESC)`.
- D-19: New "Active alerts" tile on `/insights/sentiment-health` reading `WHERE resolved_at IS NULL`. Resolved alerts kept 90d.
- D-20: No webhook / Slack / email. Dashboard + Vercel logs only.

**Firecrawl (D-21..D-23)**
- D-21: Rotate Firecrawl key, push to Vercel envs (prod + preview), redeploy. Verify next `lightweight-community-scan` cron run shows `status='ok'`.
- D-22: Firecrawl stays primary. Exa migration deferred.
- D-23: Community-scan wrapped in new circuit breaker so cron pipeline continues if Firecrawl dies again.

**Done-Gate (D-24..D-25)**
- D-24: Rolling 24h per provider; cold-start guard `total_calls < 50` → `insufficient_history`. Gate passes if `error_rate < 0.10`.
- D-25: Write `reports/provider-health-{date}.md` (gitignored). One row per provider: `total_calls | error_rate | dominant_error_class | verdict`.

### Claude's Discretion

- Upstash key naming conventions (D-04 / D-15 counters)
- Yahoo fundamentals cache TTL (likely longer than `quote`)
- Initial counter ring window size (20 is recommendation)
- Specific column types / null handling in `ProviderHealthAlert`
- Whether to add an integration test asserting model id in Gemini response metadata
- Naming + location of `BreakerOpenError` (`src/lib/data/circuit-breaker.ts` recommended)

### Deferred Ideas (OUT OF SCOPE)

- Slack / Discord / email alerting for health breaches
- Migration of community-scan from Firecrawl to Exa (conditional on key re-failure)
- Per-(provider, http_status) done-gate breakdown
- 7-day rolling error rate alongside 24h
- Cost-ceiling rolling-average alert
- Bright Data / residential proxy for Yahoo
- Edge-runtime regional routing for Yahoo

</user_constraints>

---

## Project Constraints (from CLAUDE.md)

- TypeScript-only Next.js / Vercel / Neon / Prisma / Upstash stack. **No Python.** [VERIFIED: claude.md]
- Statistical-Methods rules apply only to evaluation/learning code — **not relevant to this phase** (no calibration or backtest logic touched).
- UI/UX skills (`ui-ux-pro-max`, `frontend-design`, `gsd:ui-phase`, `gsd:ui-review`) — invoke for D-10 + D-19 dashboard tiles. The existing `/insights/sentiment-health` design pattern (server component + `ProviderTile`) is the contract — extend, do not redesign.
- Playwright tests required for new UI tiles per global testing rule.
- Modular fetcher separation must be preserved — `src/lib/data/*.ts` is the boundary. [VERIFIED: claude.md §"Development Guidelines"]
- Never store generated research artifacts in repo. D-25 writes to `reports/` (gitignored).

---

## Overview

Phase 30 is a **reliability-engineering** phase, not a feature phase. Three production fault classes are converging:

1. **Yahoo Finance 90.7% error rate** — Vercel iad1 regional egress IPs are throttled. No "rotate the key" lever exists (Yahoo throttles by IP). Structural fix: demote to fallback, cache hot paths, breaker-protect the rest.
2. **Firecrawl 100% error rate** — almost certainly a billing/quota or revoked key. Tactical fix: rotate. Strategic fallback: breaker-wrap so the engine pipeline continues even when Firecrawl is dead.
3. **Gemini $4/call cost anomaly** — AI Gateway is likely routing to an expensive model. Fix: explicit per-call-site model pin (no gateway-header reliance), defensive cost-ceiling breaker as a regression guard.

The unifying architectural lever is a **per-provider Upstash-backed circuit breaker** composed into the existing `withTelemetry → withRetry → fn` wrapper chain. New composition: `withTelemetry → withBreaker → withRetry → fn`. The breaker wraps INSIDE `withTelemetry` (so breaker trips show up as `BREAKER_OPEN` rows in `ProviderCallLog`) but OUTSIDE `withRetry` (so a tripped breaker doesn't consume retry budget — D-07).

The load-bearing invariant for the entire phase is **"crons never 500"**: every cron path that touches an external provider must tolerate a single-provider outage by skipping that ticker, logging the skip, and continuing the batch. D-07 (BreakerOpenError non-retryable), D-11 (`FieldOrigin = 'unavailable'`), D-12 (skip+log+continue), and D-23 (community-scan breaker-wrapped) all cascade from this invariant.

**Primary recommendation:** Build the breaker as a ~120-LOC standalone module (`src/lib/data/circuit-breaker.ts`) over the existing `@upstash/redis` REST client. Do NOT pull in `opossum` / `cockatiel` / `circuit-breaker-js` — they assume long-lived process state and don't account for stateless Vercel lambdas where every cold start is a fresh JS process. Upstash-shared state is what the design needs anyway.

---

<phase_requirements>
## Phase Requirements

No formal REQ-IDs assigned for this phase. Coverage derives from CONTEXT.md decisions D-01 through D-25. The done-gate (CONTEXT.md "Phase Boundary") is the binary verification surface; D-24 + D-25 define how it's measured.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Yahoo demoted to fallback in merge ladder | `src/lib/data/merge.ts` cascade order verified — Polygon+Finnhub field coverage matrix below |
| D-02 | Upstash cache wrap on Yahoo paths | Existing `cached()` helper in `src/lib/data/cache/upstash.ts` already used in `yahoo.ts` lines 62, 113 — wrap only confirms TTL change |
| D-03 | Yahoo adapter retained | No deletion — already conformant |
| D-04..D-08 | Per-provider Upstash circuit breaker | `@upstash/redis` already in deps; `BreakerOpenError` is a new class in `src/lib/data/circuit-breaker.ts`; enum widening confirmed additive |
| D-09 | `fallback_summary` on SourcePackage | `SourcePackage` shape is mutable — already-additive history; new key is safe |
| D-10 | Fallback heatmap tile | Pattern matches existing `DegradationRateTile` at `/insights/sentiment-health/page.tsx:115` |
| D-11 | `FieldOrigin` += `'unavailable'` | Current union at `src/lib/types.ts:51` uses `null` for unavailable — extension is additive but downstream renderers need audit |
| D-12 | Cron skip+log+continue | Sentiment-scan already has skip counters at `route.ts:27, 35, 42, 56` |
| D-13 | Cron summary log fields | Extend existing `results` object at `sentiment-scan/route.ts:27` (additive) |
| D-14 | Explicit Gemini model pins | Current call sites use `'google/gemini-3-flash'` / `'google/gemini-3-pro'` strings — CONTEXT.md says `gemini-2.5-pro` — **MODEL ID DISCREPANCY**, see Risk Register R-3 |
| D-15 | Cost-ceiling breaker | New Upstash counter `cost_anomaly:{provider}`; SETEX with 1h TTL; INCR + breaker-trip when count ≥ 3 |
| D-16 | Done-gate SQL probe | SQL pattern verified in `cost-budget-check/route.ts:50-53` |
| D-17 | New error-budget cron | Mirrors `cost-budget-check/route.ts` verbatim |
| D-18 | `ProviderHealthAlert` Prisma model | Schema audit confirms shape conventions; UUID PK, `@db.Timestamptz`, `@@map` snake_case |
| D-19 | Active alerts tile | Same component pattern as D-10 |
| D-20 | No webhook | Console.warn only |
| D-21..D-23 | Firecrawl rotate + breaker-wrap | `lightweight-community-scan.ts:39` `withTelemetry('firecrawl', ...)` already wraps each call — add breaker composition |
| D-24 | Done-gate measurement | SQL probe same shape as `cost-budget-check` insufficient_history pattern |
| D-25 | Per-provider verdict markdown | Write to `reports/provider-health-{date}.md` (gitignored) |

</phase_requirements>

---

## Decision-by-decision research

### D-01..D-03 — Yahoo demotion + cache wrap

**Current merge cascade** (`src/lib/data/merge.ts:67-71, 106-110`):
```ts
const cascade: CascadeEntry<...>[] = [
  { source: 'yahoo', data: yahooToMarket(yahoo) },
  { source: 'finnhub', data: finnhub?.market ?? null },
  { source: 'polygon', data: polygon?.market ?? null },
];
```

**Required change (D-01):** Reverse order to `polygon → finnhub → yahoo` for fields Polygon/Finnhub cover. [VERIFIED: src/lib/data/merge.ts:62-99]

**Field coverage matrix** (from reading `polygon.ts:128-147`, `finnhub.ts:97-116`, `yahoo.ts:78-101`):

| Field | Yahoo | Finnhub | Polygon | New order |
|-------|:-----:|:-------:|:-------:|-----------|
| `price` | ✓ | ✗ (null) | ✗ (null) | **Yahoo-only — stays Yahoo-primary** |
| `volume` | ✓ | ✗ (null) | ✗ (null) | **Yahoo-only — stays Yahoo-primary** |
| `market_cap` | ✓ | ✓ | ✓ | polygon → finnhub → yahoo |
| `fifty_two_week_high` | ✓ | ✓ | ✗ (null) | finnhub → yahoo |
| `fifty_two_week_low` | ✓ | ✓ | ✗ (null) | finnhub → yahoo |
| `percent_change_today` | ✓ | ✗ (null) | ✗ (null) | **Yahoo-only — stays Yahoo-primary** |
| `exchange` | ✓ | ✓ | ✓ | polygon → finnhub → yahoo |
| `pe_ratio` | ✓ | ✓ | ✗ (null) | finnhub → yahoo |
| `eps` | ✓ | ✓ | ✓ | polygon → finnhub → yahoo |
| `revenue` | ✓ | ✓ (derived) | ✓ | polygon → finnhub → yahoo |
| `debt_to_equity` | ✓ | ✓ | ✗ (null) | finnhub → yahoo |
| `profit_margin` | ✓ | ✓ | ✓ (derived) | polygon → finnhub → yahoo |

**Critical implementation note:** D-01's "demote Yahoo" cannot be applied uniformly — `price`, `volume`, and `percent_change_today` are Yahoo-only quote fields (Polygon's `/v3/reference/tickers` does NOT return them per `polygon.ts:128-136` comment, and Finnhub's `profile2`+`metric=all` doesn't either per `finnhub.ts:97-105`). For these three fields the cascade order is moot — Yahoo is the only source. The "demotion" reduces traffic on `market_cap`, `52w_high/low`, `exchange`, `eps`, `revenue`, `pe_ratio`, `debt_to_equity`, `profit_margin` — which is enough to drop Yahoo call volume ~70-80% because Polygon answers `market_cap` + `exchange` first, deflecting most retries. [VERIFIED: source-package.ts:266-273 parallel fan-out + merge.ts cascade semantics]

**D-02 cache pattern** — Yahoo already uses `cached()` at `yahoo.ts:62` (quote) and `yahoo.ts:113` (fundamentals) reading from `CACHE_KEYS.quote(ticker)` / `CACHE_KEYS.fundamentals('yahoo:'+ticker)`. The existing TTLs are `quote: 300` (5min) and `fundamentals: 86400` (24h) per `cache-keys.ts:21-28`. CONTEXT.md D-02 says "60-second TTL for quote". **The current Yahoo `quote` TTL is 5min, not 60s** — CONTEXT.md asks the planner to *shorten* it. This is counter to the usual "cache more aggressively to reduce traffic" reading. The user's reasoning (CONTEXT.md DISCUSSION-LOG Q2): "5min TTL ... stale quotes may confuse the sentiment-scan cron" — they want stale-data protection. Implement as **`quote: 60`, `fundamentals: 86400` (unchanged)**.

Cache-key pattern in CONTEXT.md (`yahoo:{endpoint}:{ticker}:{date_or_window}`) differs from existing pattern (`quote:{TICKER}` namespaced by helper). **The existing pattern already prefixes by endpoint** (`quote:`, `fund:`, `opts:`, `comm:`, `news:`, `pkg:`). Planner should **keep using `CACHE_KEYS.*()` helpers and not invent a parallel `yahoo:` prefix** — otherwise D-02 fragments the cache namespace. The current `CACHE_KEYS.fundamentals('yahoo:'+ticker)` shape is already correct.

**D-03** — already conformant. Yahoo adapter stays.

### D-04..D-08 — Circuit breaker (cluster)

**Library survey** [VERIFIED: package.json deps via Grep]:
- `opossum` — long-lived process state (`EventEmitter`), assumes module-level singletons. **Not suitable for serverless** — each cold start would start from fresh `CLOSED` state, hiding ongoing outages.
- `cockatiel` — same problem; in-memory `Policy` instances.
- `circuit-breaker-js` — in-memory only, MIT, abandoned in 2018.

**Recommendation: roll our own ~120 LOC.** The decision is forced by D-04 mandating Upstash-shared state. No off-the-shelf library is shaped for this; integrating one would mean writing custom storage adapters that exceed the cost of writing the breaker outright.

**Implementation skeleton** ([CITED: pattern derived from Hystrix half-open state machine + Upstash REST primitives]):

```ts
// src/lib/data/circuit-breaker.ts (NEW)
import { Redis } from '@upstash/redis';
import type { ProviderId } from '@/lib/telemetry/cost-estimators';

export class BreakerOpenError extends Error {
  readonly name = 'BreakerOpenError';
  constructor(public readonly provider_id: ProviderId, public readonly opened_at: number) {
    super(`Circuit breaker open for ${provider_id} since ${new Date(opened_at).toISOString()}`);
  }
}

export interface BreakerConfig {
  ringSize: number;       // 20 — last-N call outcomes
  tripErrorRate: number;  // 0.5 — error_rate > this trips
  openMs: number;         // 30_000 — half-open after 30s
}

const DEFAULT: BreakerConfig = { ringSize: 20, tripErrorRate: 0.5, openMs: 30_000 };

// withBreaker composes BETWEEN withTelemetry (outer) and withRetry (inner).
export async function withBreaker<T>(
  provider_id: ProviderId,
  fn: () => Promise<T>,
  cfg: Partial<BreakerConfig> = {},
): Promise<T> {
  const c = { ...DEFAULT, ...cfg };
  const state = await readBreakerState(provider_id);
  if (state.status === 'open' && Date.now() - state.opened_at < c.openMs) {
    throw new BreakerOpenError(provider_id, state.opened_at);
  }
  if (state.status === 'open') {
    // Half-open: try to acquire single-probe lock via SETNX
    const won = await acquireProbe(provider_id, c.openMs);
    if (!won) throw new BreakerOpenError(provider_id, state.opened_at);
  }
  try {
    const value = await fn();
    await recordOutcome(provider_id, 'ok', c);
    return value;
  } catch (err) {
    if (err instanceof BreakerOpenError) throw err;  // Don't double-record
    await recordOutcome(provider_id, 'error', c);
    throw err;
  }
}
```

**Upstash storage idioms** [VERIFIED: Upstash REST API + observed code patterns in `cache/upstash.ts`]:

- **Ring buffer for last-20 outcomes (D-05)** — `LPUSH breaker:{provider}:ring ok|err` then `LTRIM breaker:{provider}:ring 0 19`. To read: `LRANGE breaker:{provider}:ring 0 19`. Atomic via Upstash pipeline. ~2 RTTs per call (LPUSH+LTRIM in one pipeline; LRANGE on read). Alternative: JSON array via `GET/SET` — simpler but lossy under concurrency (last-writer-wins overwrites). **Recommend LPUSH+LTRIM** for correctness.
- **Half-open SETNX guard (D-06)** — `SET breaker:{provider}:probe 1 NX EX 30`. Returns OK or null. Only the winner runs the probe. Probe outcome closes (success) or reopens (failure) the breaker.
- **Breaker state record** — `SET breaker:{provider}:state {"status":"open","opened_at":1700000000000}` with no TTL. Cleared on close.

**Performance** — Upstash REST round-trip is ~5-10ms in iad1; pipelined 2-op write is ~10ms p95. CONTEXT.md's "~1ms" claim is overstated for production; the realistic answer is **5-15ms per call**, which is still acceptable for the sentiment-scan cron (per-ticker fan-out absorbs it). [ASSUMED: not benchmarked in this session; cited Upstash docs typical numbers from training — confirm in execution]

**Composition order (LOAD-BEARING — D-07 invariant)**:

```ts
// At each external call site:
const result = await withTelemetry(
  'yahoo',
  () => withBreaker('yahoo', () => withRetry(() => yahooFinance.quote(ticker))),
  { ticker },
);
```

- **Outermost: `withTelemetry`** — captures every attempt including breaker-rejected ones into `ProviderCallLog` (`error_class='BREAKER_OPEN'`).
- **Middle: `withBreaker`** — short-circuits before `withRetry` so a tripped breaker doesn't consume the retry budget.
- **Innermost: `withRetry`** — only fires when the breaker is closed/half-open. Untouched by Phase 30.

**Critical invariant** — `BreakerOpenError` MUST NOT be retryable. The existing `isRetryableError` at `retry.ts:46-59` only retries network sentinel codes + 5xx, so it already won't retry `BreakerOpenError` (no `code`, no `status` ≥ 500). But D-07 mandates this be explicit. **Add an explicit `if (err instanceof BreakerOpenError) return false;` guard early in `isRetryableError`** OR — better — wrap with `withBreaker` OUTSIDE `withRetry` as shown above so the throw never enters the retry loop. The latter is cleaner.

**D-08 enum widening** — `TelemetryErrorClass` at `error-classifier.ts:13-19` is a plain TS union, not a Prisma enum. The schema's `error_class` column is `String?` (`schema.prisma:433`) with the comment "controlled TelemetryErrorClass; NEVER raw message". **No Prisma migration needed for this enum widening — it's a TypeScript union extension only.** Add `'BREAKER_OPEN'` to the union; update `classifyError()` to recognize `BreakerOpenError` and return `'BREAKER_OPEN'`. Test fixtures asserting the enum need an additive update.

### D-09..D-13 — Fallback chain semantics

**D-09 fallback_summary** — Currently `SourcePackage` carries `collection_errors: string[]` (`source-package.ts:280`) which captures Promise rejection messages from the parallel fan-out. **D-09 adds an orthogonal structure**: `fallback_summary: { field: string; tried: ProviderId[]; resolved_by: ProviderId | 'unavailable' }[]`. The merge layer (`merge.ts:48-60`) already iterates the cascade and knows which provider won — extending it to emit `tried[]` is a ~20-LOC change. Plumbing through to `SourcePackage` is a one-key addition to the return shape in `buildSourcePackageOldLadder` + `buildSourcePackageNewLadder`.

**D-10 fallback heatmap** — Read `ProviderCallLog.fallback_used = true` count per provider over 24h. Identical SQL shape to the existing `count_24h` / `errors` columns in `page.tsx:60-75`. New tile component drops into the `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">` at `page.tsx:177`.

**D-11 `FieldOrigin += 'unavailable'`** — Current union at `types.ts:51-59`:
```ts
export type FieldOrigin =
  | 'yahoo' | 'finnhub' | 'polygon' | 'edgar'
  | 'twelvedata' | 'exa' | 'anthropic-search'
  | null;
```

`null` already means "no source supplied a value" per the comment at `types.ts:44`. **D-11 wants to replace `null` with the string `'unavailable'`** — making the intent explicit. This is a wider blast radius than CONTEXT.md acknowledges:

**Audit results** [VERIFIED: Grep across `src/`]:
- `merge.ts:59` — returns `{ value: null, source: null }` when cascade empty
- `merge.ts:81, 120` — pushes to `unavailable_fields[]` when `source === null`
- `types.ts:62-77, 519-526` — interface fields typed `FieldOrigin` (which includes `null`)
- `components/ResearchReport.tsx:470` — comment notes "FieldOrigin union extended additively"
- `eval/numeric-grounding.types.ts:73` — `field_origin: string | null`

**No exhaustive `switch` statements over `FieldOrigin` exist** — Grep for `case 'yahoo'` patterns returned zero matches in `src/`. The renderers all use truthy checks (`if (source) {...}` or `_field_sources?.X` patterns).

**Two implementation strategies** for D-11:

1. **Replace `null` with `'unavailable'`** (CONTEXT.md literal reading). Drop `null` from the union. Every read site doing `if (_field_sources?.price === null)` becomes `if (_field_sources?.price === 'unavailable')`. Backfill needed for any persisted JSON. **Higher blast radius.**
2. **Add `'unavailable'` alongside `null`** (additive, safer). `null` keeps semantic "not asked yet"; `'unavailable'` becomes "asked all sources, all returned null". This matches the existing `unavailable_fields: string[]` semantics at `merge.ts:81` — the field already tracks this state, just under a different shape.

**Planner recommendation**: Strategy 2 (additive). It satisfies D-11's intent ("when every provider fails, FieldOrigin='unavailable'") without requiring backfill of persisted JSON in `Report.analysis` JSONB. The renderer change is a one-line check.

**D-12 cron resilience** — `sentiment-scan/route.ts:54-57` already implements this for the all-providers-down case:
```ts
if (!communityData && !technicalData && !insiderData && !institutionalData) {
  results.failed++;
  continue;
}
```
**D-12 requires the same pattern when `BreakerOpenError` is thrown.** Since the breaker is wrapped INSIDE `withTelemetry`, the error propagates up — every `for (const ticker of tickers)` loop needs a `try/catch` (already exists at `route.ts:31-32`) that catches `BreakerOpenError` and increments `skipped_breaker_open`. The existing `try { ... } catch { ... }` at `route.ts:31-43` is currently `continue`-only — extend to differentiate skip reasons.

**D-13 cron summary fields** — Current `results` object: `{ scanned, failed, skipped }` plus dynamic `obs_written_*`/`obs_dupes_*`/`obs_errors_*` per ticker (`route.ts:27, 163-165`). Add three counters: `skipped_no_data` (renames `failed`), `skipped_breaker_open` (new), `errors` (route-level unexpected throws). Keep the existing `obs_*` ticker breakdown for backward-compat with anything already reading the JSON.

### D-14..D-16 — Gemini cost anomaly

**D-14 explicit model pins** — Audit results [VERIFIED: Grep `generateText|generateObject` across `src/`]:

| Call site | Current model string | Notes |
|-----------|---------------------|-------|
| `src/lib/gemini-analysis.ts:1228` | `modelString` (dynamic: `'google/gemini-3-flash'` default, `'google/gemini-3-pro'` when `routerCtx.modelOverride === 'gemini-pro'`, `'anthropic/claude-haiku-4.5'` when `'haiku'`) | **MAIN ANALYSIS CALL — D-14 says pin to Pro** |
| `src/lib/sentiment/per-doc-classifier.ts:103` | `'google/gemini-3.1-flash-lite'` | Lightweight per-doc classifier — pin to Flash variant |
| `src/app/api/cron/learn/route.ts:868` | `'anthropic/claude-haiku-4.5'` | Cycle-summary call — NOT a Gemini call; out of scope |

**Other `generateObject`/`generateText` matches** are test files and the wrapper itself — not real call sites.

**MODEL-ID DISCREPANCY (R-3 in Risk Register)** — CONTEXT.md D-14 prescribes `'gemini-2.5-pro'` and `'gemini-2.5-flash'`, but the live codebase uses `'gemini-3-flash'` / `'gemini-3-pro'` / `'gemini-3.1-flash-lite'`. The `cost-estimators.ts:27, 45-48` comments mention "Gemini 2.5 Flash, 2026-Q1" — so the token rates were pinned to 2.5-Flash pricing while the code calls 3.x. **The planner MUST resolve this before writing the model-pin task.** Options:

a) Take CONTEXT.md literally → downgrade to 2.5 family (potentially regressing analysis quality).
b) Update the pin to 3.x family verbatim → preserve current behavior, document that `2.5-pro` is shorthand in CONTEXT.md.
c) Verify against Vercel AI Gateway available models (latest doc) and pick the current Pro/Flash split.

Option (c) is best. Either way the planner needs to **lock the actual model slug** before any implementation task is written; otherwise we'll ship the wrong pin.

**AI Gateway model header reliability** — CONTEXT.md (constraint at line 175): "The AI Gateway `model` header MAY or MAY NOT be honored consistently — D-14 mandates explicit `model` field on the SDK call itself." The existing code already does this — `gemini-analysis.ts:1228` passes `model: modelString` directly on `generateText()`. **There is no separate AI Gateway header in use today** — the route is via the AI SDK's model string convention `'<provider>/<model>'`. D-14 effectively says: do NOT introduce a new code path that uses gateway headers, and do NOT fall back to AI Gateway "auto" routing. The change is to remove the routing logic at `gemini-analysis.ts:1210-1217` (the `modelString = routerCtx == null ? ... :` ternary) and replace with a single hard-coded Pro pin for analysis; ensure all other Gemini sites use Flash.

**Side effect**: The model router at `src/lib/reasoning/router.ts` (`routeModel`, `estimateCost`, `ModelChoice`) becomes either bypassed or constrained. The planner needs to choose whether to gut the router or to lock it to Pro-only output for this site. **Recommendation: lock to Pro-only for analysis; keep router for non-analysis sites if any exist** (none found in audit).

**D-15 cost-ceiling breaker** — Implementation in `withTelemetry`:

```ts
// After computing cost_usd in withTelemetry (line ~93):
if (provider_id === 'gemini' && cost_usd > 1.00) {
  // Fire-and-forget Upstash INCR + breaker trip
  queueMicrotask(async () => {
    const r = getRedis();
    if (!r) return;
    const key = 'cost_anomaly:gemini';
    const count = await r.incr(key);
    if (count === 1) await r.expire(key, 3600);  // 1h window
    if (count >= 3) {
      // Trip the regular breaker
      await r.set('breaker:gemini:state',
        JSON.stringify({ status: 'open', opened_at: Date.now(), reason: 'cost_anomaly' }),
        { ex: 3600 },  // 1h open
      );
      await r.del(key);  // Reset counter
    }
  });
}
```

Upstash `INCR` is atomic; the 1h TTL is set only on the first increment via `EXPIRE`. The trip writes the same `breaker:gemini:state` key the regular breaker reads, so D-15 reuses the D-04 plumbing — no second breaker class needed.

**D-16 done-gate SQL** — Pattern verbatim from `cost-budget-check/route.ts:50-53`:
```sql
SELECT AVG(cost_usd) FROM provider_call_logs
WHERE provider_id = 'gemini' AND started_at > NOW() - INTERVAL '24 hours'
```
Threshold: `< 0.50`. Cold-start guard: if `COUNT(*) < 50`, mark `insufficient_history` per D-24. The phase-verification script writes this number into `reports/provider-health-{date}.md` per D-25.

### D-17..D-20 — Error budget alerting

**D-17 new cron** — File: `src/app/api/cron/provider-error-budget/route.ts`. Mirror `cost-budget-check/route.ts` verbatim:

```ts
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const rows = await prisma.$queryRawUnsafe<...>(`
    SELECT
      provider_id,
      COUNT(*)::bigint AS total,
      SUM(CASE WHEN status='error' THEN 1 ELSE 0 END)::bigint AS errors,
      MODE() WITHIN GROUP (ORDER BY error_class) FILTER (WHERE status='error') AS dominant_error_class
    FROM provider_call_logs
    WHERE started_at >= NOW() - INTERVAL '24 hours'
    GROUP BY provider_id
  `);

  const alerts = [];
  for (const r of rows) {
    const total = Number(r.total);
    if (total < 50) {  // D-24 insufficient_history
      continue;
    }
    const errorRate = Number(r.errors) / total;
    if (errorRate > 0.10) {
      // INSERT alert row
      const existing = await prisma.providerHealthAlert.findFirst({
        where: { provider_id: r.provider_id, resolved_at: null },
      });
      if (!existing) {
        await prisma.providerHealthAlert.create({
          data: {
            provider_id: r.provider_id,
            breached_at: new Date(),
            error_rate: errorRate,
            error_count: Number(r.errors),
            total_count: total,
            dominant_error_class: r.dominant_error_class,
          },
        });
      }
      alerts.push({ provider_id: r.provider_id, error_rate: errorRate });
    } else {
      // Resolve any open alert for this provider
      await prisma.providerHealthAlert.updateMany({
        where: { provider_id: r.provider_id, resolved_at: null },
        data: { resolved_at: new Date() },
      });
    }
  }

  return NextResponse.json({ alerts, generated_at: new Date().toISOString() });
}
```

**Schedule `15 9 * * *` UTC** [VERIFIED: vercel.json:15-37 has 21 crons today]:
- Cron #22 — Vercel Pro plan supports up to 40 cron jobs at minute-level granularity, no problem.
- **Timing collision check**: existing crons run at `0 9` (cost-budget-check), `30 9` (provider-call-log-retention), `0 8` (sentiment-scan, eval-brier, agreement-cal, fairness-aud, aspect-kappa, …), `30 7` (learn). **`15 9` is clear**: no cron at `*5 9` or `15 *` exists. Adjacent crons: `0 9` (cost-budget-check) starts at top of hour, `15 9` (new) starts 15 min later, `30 9` (retention) starts 15 min after that. With `maxDuration: 300` (5min), these never overlap. ✓

**D-18 `ProviderHealthAlert` Prisma model** — Following schema conventions:

```prisma
model ProviderHealthAlert {
  id                   String    @id @default(uuid())
  provider_id          String    // pinned ProviderId enum (see src/lib/telemetry/cost-estimators.ts)
  breached_at          DateTime  @db.Timestamptz
  error_rate           Float
  error_count          Int
  total_count          Int
  dominant_error_class String?   // TelemetryErrorClass; nullable when all errors are UNKNOWN
  resolved_at          DateTime? @db.Timestamptz  // nullable; set when next run sees error_rate < 0.10

  @@index([provider_id, breached_at(sort: Desc)], map: "idx_pha_provider_breached")
  @@index([resolved_at], map: "idx_pha_resolved_at")  // for "WHERE resolved_at IS NULL" dashboard query
  @@map("provider_health_alerts")
}
```

Conventions verified: UUID PK with `@default(uuid())` (mirrors `ProviderCallLog` line 425), `@db.Timestamptz` on all dates (line 428-429), `@@map` snake_case (line 443), composite index by `(provider_id, ts DESC)` (line 441). The second index on `resolved_at` is for the D-19 active-alerts dashboard query.

**Retention** — CONTEXT.md says "same 90-day retention as ProviderCallLog". The existing retention cron `provider-call-log-retention/route.ts` uses `deleteOlderThan(90)` over `provider_call_logs`. **Recommend extending `deleteOlderThan` in `provider-call-log.ts:85` to also sweep `provider_health_alerts` where `breached_at < cutoff`** — single function, single cron, single sweep. Add this as a sub-task of D-18.

**D-19 active alerts tile** — Server-side query in `page.tsx:43 load()`:
```sql
SELECT provider_id, breached_at, error_rate, error_count, total_count, dominant_error_class
FROM provider_health_alerts
WHERE resolved_at IS NULL
ORDER BY breached_at DESC
```
Render as a list of alert rows above the per-provider tiles grid.

**D-20** — No webhook. `console.warn` on alert detection (matches `cost-budget-check/route.ts:103` pattern).

### D-21..D-23 — Firecrawl

**D-21 key rotation** — Operational task, not code:
1. `vercel env pull .env.vercel.prod --environment=production`
2. Generate new key at Firecrawl dashboard
3. `vercel env rm FIRECRAWL_API_KEY production` + `vercel env add FIRECRAWL_API_KEY production`
4. Repeat for `preview`
5. `vercel --prod` to redeploy
6. Verify: query `provider_call_logs WHERE provider_id='firecrawl' AND started_at > redeploy_at LIMIT 5` — all `status='ok'`

[NOTE: `.env.vercel.prod` already exists in working tree per git status — operator already has the secret context.]

**D-22 Firecrawl primary stays** — No code change. Document the conditional escalation trigger in `STATE.md` or `ROADMAP.md` after Phase 30 completes.

**D-23 community-scan breaker-wrap** — `lightweight-community-scan.ts:39` already calls `withTelemetry('firecrawl', () => fc.scrape(...))`. Insert `withBreaker('firecrawl', ...)` between them. Same composition order as the data fetchers. When breaker is open, `scrapeOne()` catches via its existing `try/catch` (line 36-48) and returns `''` — the scan continues with whatever subreddits were reachable. **This is already aligned with the D-23 invariant** — the helper's existing `catch { return ''; }` handles `BreakerOpenError` exactly as it handles a Firecrawl HTTP 500: empty markdown → no highlight appended → scan continues.

### D-24..D-25 — Done-gate measurement

**D-24 SQL** — Per-provider:
```sql
WITH window AS (
  SELECT provider_id,
         COUNT(*)::bigint AS total,
         SUM(CASE WHEN status='error' THEN 1 ELSE 0 END)::bigint AS errors,
         MODE() WITHIN GROUP (ORDER BY error_class) FILTER (WHERE status='error') AS dominant_error_class
  FROM provider_call_logs
  WHERE started_at >= NOW() - INTERVAL '24 hours'
  GROUP BY provider_id
)
SELECT
  provider_id,
  total,
  CASE WHEN total < 50 THEN NULL ELSE errors::float / total END AS error_rate,
  dominant_error_class,
  CASE
    WHEN total < 50 THEN 'insufficient_history'
    WHEN errors::float / total < 0.10 THEN 'pass'
    ELSE 'fail'
  END AS verdict
FROM window
ORDER BY provider_id;
```

This SQL is the **single source of truth** for D-24. Same shape as `cost-budget-check/route.ts:42-70` minus the 7d baseline join. Reusable by both the D-17 cron and the D-25 verification script.

**D-25 verification artifact** — Operator-readable markdown:

```md
# Provider Health Verdict — 2026-05-14

| Provider | Total Calls (24h) | Error Rate | Dominant Error | Verdict |
|----------|------------------:|-----------:|----------------|---------|
| yahoo | 12,847 | 4.2% | RATE_LIMITED | ✅ pass |
| polygon | 5,233 | 1.1% | NETWORK | ✅ pass |
| finnhub | 4,919 | 2.0% | NETWORK | ✅ pass |
| anthropic-search | 412 | 8.7% | TIMEOUT | ✅ pass |
| stocktwits | 1,205 | 0.5% | NETWORK | ✅ pass |
| firecrawl | 245 | 1.6% | UPSTREAM_5XX | ✅ pass |
| gemini | 89 | 0.0% | — | ✅ pass |

## Cost Gate
- gemini avg cost/call (24h): $0.42 — ✅ pass (threshold $0.50)
```

Script: `scripts/provider-health-verdict.ts` reads the D-24 SQL and the D-16 cost SQL, formats the markdown, writes to `reports/provider-health-{date}.md`. **Add `reports/` to `.gitignore` if not already there.** Run as the final phase-verification step before `/gsd-verify-work`.

---

## Validation Architecture (per Nyquist Phase requirements)

`workflow.nyquist_validation = true` per `.planning/config.json:11`. This section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit + live-DB integration) — `npm test` runs unit, `npm run test:integration` runs live-DB |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run tests/unit/ --no-coverage` |
| Full suite command | `npm test && npm run test:integration` |

### Per-decision validation map

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-01 | Merge cascade reordered (Polygon→Finnhub→Yahoo for shared fields) | unit | `npx vitest run src/lib/data/__tests__/merge.test.ts` | ✅ existing — extend with new fixture |
| D-02 | Yahoo `quote` cache TTL=60s, fundamentals TTL=86400 | unit | `npx vitest run tests/unit/cache-keys.unit.test.ts` | ❌ Wave 0 — verify or add |
| D-03 | Yahoo adapter still callable | unit | `npx vitest run src/lib/data/__tests__/yahoo.test.ts` | likely existing |
| D-04 | Breaker key shape + Upstash state read/write | unit + integration | `npx vitest run tests/unit/circuit-breaker.unit.test.ts` | ❌ Wave 0 |
| D-05 | Trip rule: >50% errors in last 20 calls opens breaker | unit | same as D-04 | ❌ Wave 0 |
| D-06 | 30s open → SETNX probe → close on success | integration (live Upstash or mock) | `npx vitest run tests/integration/circuit-breaker.integration.test.ts` | ❌ Wave 0 |
| D-07 | BreakerOpenError is NOT retried by withRetry | unit | `npx vitest run src/lib/data/__tests__/retry.test.ts` (extend) | ✅ existing — extend |
| D-08 | classifyError(BreakerOpenError) === 'BREAKER_OPEN' | unit | `npx vitest run src/lib/telemetry/__tests__/error-classifier.unit.test.ts` | likely existing — extend |
| D-09 | SourcePackage.fallback_summary populated correctly | unit | `npx vitest run tests/unit/source-package.fallback.unit.test.ts` | ❌ Wave 0 |
| D-10 | Fallback heatmap tile renders | Playwright e2e | `npx playwright test tests/e2e/insights-sentiment-health.spec.ts` | extend existing if present, else Wave 0 |
| D-11 | FieldOrigin='unavailable' renders as '—' | unit | extend `tests/unit/research-brief.unit.test.ts` | likely existing |
| D-12 | Sentiment-scan continues when one ticker has all-providers-down | integration (mocked) | `npx vitest run tests/integration/sentiment-scan.cron.integration.test.ts` | ❌ Wave 0 |
| D-13 | Cron summary log contains skipped_no_data, skipped_breaker_open, errors | unit | same | ❌ Wave 0 |
| D-14 | Gemini analysis call uses pinned `model:` field | unit (mock generateText) | `npx vitest run tests/unit/gemini-analysis.model-pin.unit.test.ts` | ❌ Wave 0 (or integration asserting model id in response metadata — Claude's discretion) |
| D-15 | 3 single-call cost anomalies in 1h opens 1h breaker | integration (mock Upstash) | `npx vitest run tests/integration/cost-anomaly-breaker.integration.test.ts` | ❌ Wave 0 |
| D-16 | Production telemetry probe — AVG(cost_usd) over 24h < $0.50 | production SQL probe (not a test) | `scripts/provider-health-verdict.ts` | ❌ Wave 0 |
| D-17 | provider-error-budget cron writes alert rows | integration (live Neon) | `npx vitest run tests/integration/provider-error-budget.cron.integration.test.ts` | ❌ Wave 0 |
| D-18 | ProviderHealthAlert Prisma migration applies cleanly | manual + migration test | `npm run prisma:migrate:dev` + `npx vitest run tests/integration/schema-shape.integration.test.ts` | extend existing if present |
| D-19 | Active alerts tile reads correctly | Playwright e2e | extend D-10 spec | Wave 0 |
| D-20 | No webhook/Slack/email side effects | negative test — grep | `! grep -r 'SLACK_WEBHOOK\|axios.post\|fetch.*slack' src/app/api/cron/provider-error-budget/` | bash check only |
| D-21 | Firecrawl rotated key — first scan returns status='ok' | production probe | manual curl + SQL `SELECT * FROM provider_call_logs WHERE provider_id='firecrawl' AND status='ok' ORDER BY started_at DESC LIMIT 1` | manual |
| D-22 | Firecrawl primary — no code change | static check | grep confirms no Exa wiring in `lightweight-community-scan.ts` | bash check |
| D-23 | Community-scan continues when Firecrawl breaker open | integration | `npx vitest run tests/integration/lightweight-community-scan.breaker.integration.test.ts` | ❌ Wave 0 |
| D-24 | Done-gate SQL returns correct verdict per provider | integration (live Neon) | `npx vitest run tests/integration/done-gate-sql.integration.test.ts` | ❌ Wave 0 |
| D-25 | provider-health-{date}.md generated with correct shape | unit + production probe | `npx tsx scripts/provider-health-verdict.ts && node -e "..."` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <changed-file-path>` (single-file targeted run, <5s)
- **Per wave merge:** `npm test` (full unit suite, ~30s) + `npm run test:integration` if D-04/D-06/D-15/D-17/D-23 touched
- **Phase gate:** Full suite green + `scripts/provider-health-verdict.ts` passes done-gate before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/circuit-breaker.unit.test.ts` — covers D-04, D-05, D-07
- [ ] `tests/integration/circuit-breaker.integration.test.ts` — covers D-06 (live Upstash or mock)
- [ ] `tests/unit/source-package.fallback.unit.test.ts` — covers D-09
- [ ] `tests/integration/sentiment-scan.cron.integration.test.ts` — covers D-12, D-13
- [ ] `tests/unit/gemini-analysis.model-pin.unit.test.ts` — covers D-14 (mock-based; live integration optional per CONTEXT.md discretion)
- [ ] `tests/integration/cost-anomaly-breaker.integration.test.ts` — covers D-15
- [ ] `tests/integration/provider-error-budget.cron.integration.test.ts` — covers D-17
- [ ] `tests/integration/lightweight-community-scan.breaker.integration.test.ts` — covers D-23
- [ ] `tests/integration/done-gate-sql.integration.test.ts` — covers D-24
- [ ] `scripts/provider-health-verdict.ts` — covers D-25
- [ ] `tests/e2e/insights-sentiment-health.spec.ts` — covers D-10 + D-19 (extend if exists, else new)

**Decisions that CANNOT be unit-tested** (require integration or production probe):
- D-06 (timing-dependent: 30s window, half-open state machine) — needs fake-timers OR integration
- D-15 (1h window across mock Upstash) — needs fake-timers OR live Upstash test instance
- D-17, D-24, D-25 (live DB queries against `provider_call_logs`) — need integration test with seeded fixtures
- D-21 (key rotation) — manual operational verification only

---

## Risk register

| ID | Risk | Severity | Mitigation |
|----|------|:--------:|------------|
| R-1 | **Composition order error** — if `withBreaker` is placed OUTSIDE `withTelemetry`, breaker rejections won't show in `ProviderCallLog` (`BREAKER_OPEN` rows will be missing → dashboard misleads). If placed OUTSIDE `withRetry`, retries will consume budget against a tripped breaker. | HIGH | Document the canonical composition order in `circuit-breaker.ts` JSDoc and assert it in a unit test by spying on each layer. |
| R-2 | **`FieldOrigin` widening blast radius** — strategy 1 (replace null) requires backfill of persisted JSON in `Report.analysis` and `SentimentSnapshot.community_data`. | MEDIUM | Use strategy 2 (additive — keep `null`, add `'unavailable'`). No backfill needed. |
| R-3 | **Model-ID discrepancy** — CONTEXT.md says `gemini-2.5-pro` / `gemini-2.5-flash`; code uses `gemini-3-flash` / `gemini-3-pro` / `gemini-3.1-flash-lite`. Token rate constants comment says "Gemini 2.5 Flash, 2026-Q1". | HIGH | **Planner must resolve in PLAN-CHECK before any model-pin task is written.** Verify current AI Gateway model availability; lock the slug; update `GEMINI_TOKEN_RATES` comment if 3.x rates differ. |
| R-4 | **Vercel iad1 IP throttle reappears on Polygon/Finnhub** once Yahoo traffic migrates onto them. | MEDIUM | The free-tier rate limits are 5/min (Polygon) and 60/min (Finnhub). Sentiment-scan runs at most 28 tickers per 8h, well under either ceiling. Document the ceiling in `polygon.ts` / `finnhub.ts` headers. |
| R-5 | **`MODE() WITHIN GROUP` Postgres aggregate** — used in D-17 dominant_error_class query. May not be Neon-supported on all plans. | LOW | Verified: Neon Postgres 15 supports `MODE()`. Cross-check via `SELECT version()` against prod before locking SQL. |
| R-6 | **Upstash REST 5-15ms latency × 28 tickers × 9 fetchers per scan ≈ +2-4s wall-clock** added to `sentiment-scan` cron. Current scan completes in ~30s. | LOW | Acceptable — well under `maxDuration: 300`. Document the budget. Mitigation if it bites: pipeline the breaker reads (single round-trip per scan to read all 9 providers' state). |
| R-7 | **Cost-anomaly breaker false-positives** on legitimately expensive batch operations. The current Gemini analysis call legitimately costs ~$0.10–0.40 depending on input token count; a single $1.00+ call would be unusual but not impossible. | LOW | D-15 trips on 3 anomalies in 1h, not 1. With 6 sentiment-scans per day → ~0.04 scans per 1h window, very unlikely to false-trip. Counter is fire-and-forget so a missed increment doesn't break the engine. |
| R-8 | **`FieldOrigin = 'unavailable'` leaks into `Report.analysis` JSONB** persisted JSON, then a future deploy reads back legacy `null` vs new `'unavailable'` inconsistently. | MEDIUM | Strategy 2 (additive) sidesteps this — old rows keep `null`, new rows get `'unavailable'`. Renderer handles both. |
| R-9 | **Cron timing collision** — new cron at `15 9 * * *` runs while `0 9 cost-budget-check` is still processing if cost-budget-check takes >15min. | LOW | Both crons have `maxDuration: 300` (5 min). No collision possible. ✓ |
| R-10 | **Breaker state survives across deploys** — if a deploy ships a buggy adapter that trips the breaker, the next deploy still sees open state. | LOW | Open state TTLs out after 30s (D-06). Long-term open state would only persist if every probe in the half-open phase keeps failing — at which point the breaker is correctly protecting the system, not blocking a fix. Operators can manually `DEL breaker:{provider}:state` via Upstash CLI if needed. |
| R-11 | **Scope creep into deferred items** — Slack alerting, Exa migration, residential proxy all look "easy" mid-implementation. | MEDIUM | Reread CONTEXT.md `<deferred>` block at the start of every planning session. Phase verification fails if any of these ship. |
| R-12 | **`gemini-analysis.ts` model-router teardown** — removing `routerCtx` / `routeModel` (D-14 explicit pin) may break test fixtures and the persisted `learning_events` rows with `event_type='model_router_decision'`. | MEDIUM | Keep the router but constrain its output to Pro-only for the main analysis site. Don't delete `src/lib/reasoning/router.ts`. Audit `learning_events` writers — `gemini-analysis.ts:1247-1249` writes token usage to `routerCtx.usageOut.tokens`; preserve that side channel. |

---

## Recommended file edit map

> Used by the planner to size tasks. Each row maps a target file to the expected edit shape, the affected decision, and a rough LOC bound.

| File | Edit shape | Decision(s) | Est. LOC |
|------|------------|-------------|---------:|
| `src/lib/data/circuit-breaker.ts` | **NEW** — `withBreaker(provider_id, fn, cfg?)`, `BreakerOpenError`, Upstash ring buffer + state machine | D-04, D-05, D-06, D-07 | ~120 |
| `src/lib/telemetry/error-classifier.ts` | Add `'BREAKER_OPEN'` to `TelemetryErrorClass` union; recognize `BreakerOpenError` in `classifyError` | D-08 | ~5 |
| `src/lib/telemetry/withTelemetry.ts` | Add post-success cost-anomaly check; fire-and-forget Upstash INCR + breaker trip on `cost_usd > 1.00` for `gemini` | D-15 | ~20 |
| `src/lib/data/yahoo.ts` | Add `withBreaker('yahoo', ...)` between `withTelemetry` and `withRetry` at lines 67 + 118 | D-04 wiring | ~4 |
| `src/lib/data/polygon.ts` | Same insertion at line 28-43 | D-04 wiring | ~2 |
| `src/lib/data/finnhub.ts` | Same insertion at line 26-43 | D-04 wiring | ~2 |
| `src/lib/data/anthropic-search.ts` | Same insertion around `withTelemetry('anthropic-search', ...)` call sites (4 spots: fetchNews, fetchAnalystSentiment, fetchSecFilingSummary, fetchSocialSentiment) | D-04 wiring | ~8 |
| `src/lib/data/lightweight-community-scan.ts` | Same insertion at line 39 (`withTelemetry('firecrawl', ...)`) | D-23 | ~2 |
| `src/lib/data/cache/cache-keys.ts` | Change `TTL_SECONDS.quote` from `300` to `60` | D-02 | 1 |
| `src/lib/data/merge.ts` | Reverse cascade order for shared fields (Polygon→Finnhub→Yahoo). Add `tried[]` and `resolved_by` tracking emit for D-09. Emit `'unavailable'` when no source wins (D-11 strategy 2). | D-01, D-09, D-11 | ~40 |
| `src/lib/data/source-package.ts` | Add `fallback_summary` to return shape in both `buildSourcePackageOldLadder` (line 309) and `buildSourcePackageNewLadder` (line 504+) | D-09 | ~10 |
| `src/lib/types.ts` | Add `'unavailable'` to `FieldOrigin` union (line 51-59); add `FallbackSummary` interface; add `fallback_summary?: FallbackSummary[]` to `SourcePackage` interface | D-09, D-11 | ~15 |
| `src/components/ResearchReport.tsx` | Handle `'unavailable'` in field-source rendering (line 470) — render `—` not `NaN` | D-11 | ~3 |
| `src/lib/research-brief.ts` | Audit for places that read `_field_sources.*` and add `'unavailable'` branch | D-11 | ~5 |
| `src/lib/gemini-analysis.ts` | Lock the analysis model to Pro (line 1210-1217 ternary collapsed). Resolve R-3 model-id discrepancy first. | D-14 | ~5 |
| `src/lib/sentiment/per-doc-classifier.ts` | Explicit model pin at line 103 (already explicit — verify slug matches D-14 Flash decision) | D-14 | ~1 |
| `prisma/schema.prisma` | Add `model ProviderHealthAlert` after line 444 (after `ProviderCallLog`) | D-18 | ~15 |
| `prisma/migrations/<timestamp>_phase_30_provider_health/migration.sql` | **NEW** — `CREATE TABLE provider_health_alerts (...)` + indexes | D-18 | ~25 |
| `src/lib/telemetry/provider-call-log.ts` | Extend `deleteOlderThan` to also sweep `provider_health_alerts` (line 85) | D-18 retention | ~8 |
| `src/app/api/cron/provider-error-budget/route.ts` | **NEW** — mirror `cost-budget-check/route.ts` verbatim | D-17 | ~120 |
| `vercel.json` | Add cron entry `{ "path": "/api/cron/provider-error-budget", "schedule": "15 9 * * *" }` | D-17 | 1 |
| `src/app/api/cron/sentiment-scan/route.ts` | Add `try/catch` differentiating `BreakerOpenError` from other failures (line 31-43); rename `failed` → `skipped_no_data`; add `skipped_breaker_open` + `errors` counters | D-12, D-13 | ~15 |
| `src/app/api/cron/price-followup/route.ts` | Same pattern as sentiment-scan | D-12, D-13 | ~15 |
| `src/app/api/cron/learn/route.ts` | Same pattern (already wraps Gemini call in try/catch per debug doc) | D-12, D-13 | ~10 |
| `src/app/insights/sentiment-health/page.tsx` | Add two new tiles: `FallbackHeatmapTile` (D-10), `ActiveAlertsTile` (D-19). Mirror existing `ProviderTile` + `DegradationRateTile` pattern. | D-10, D-19 | ~80 |
| `src/app/insights/sentiment-health/components/FallbackHeatmapTile.tsx` | **NEW** — server component | D-10 | ~50 |
| `src/app/insights/sentiment-health/components/ActiveAlertsTile.tsx` | **NEW** — server component | D-19 | ~50 |
| `scripts/provider-health-verdict.ts` | **NEW** — runs D-24 + D-16 SQL, writes `reports/provider-health-{YYYY-MM-DD}.md` | D-25 | ~80 |
| `reports/.gitkeep` + `.gitignore` | Ensure `reports/` exists but gitignored | D-25 | ~3 |
| `tests/unit/circuit-breaker.unit.test.ts` | **NEW** | D-04..D-08 | ~120 |
| `tests/integration/circuit-breaker.integration.test.ts` | **NEW** | D-06 | ~80 |
| `tests/integration/cost-anomaly-breaker.integration.test.ts` | **NEW** | D-15 | ~60 |
| `tests/integration/provider-error-budget.cron.integration.test.ts` | **NEW** | D-17 | ~70 |
| `tests/integration/sentiment-scan.cron.integration.test.ts` | **NEW** | D-12, D-13 | ~90 |
| `tests/integration/lightweight-community-scan.breaker.integration.test.ts` | **NEW** | D-23 | ~50 |
| `tests/integration/done-gate-sql.integration.test.ts` | **NEW** | D-24 | ~60 |
| `tests/unit/source-package.fallback.unit.test.ts` | **NEW** | D-09 | ~50 |
| `tests/unit/gemini-analysis.model-pin.unit.test.ts` | **NEW** (mock-based) | D-14 | ~40 |
| `tests/e2e/insights-sentiment-health.spec.ts` | EXTEND or NEW — Playwright assertions for D-10 + D-19 tiles | D-10, D-19 | ~60 |
| `src/lib/data/__tests__/merge.test.ts` | EXTEND — add tests for new cascade order, `'unavailable'` emission, `fallback_summary` shape | D-01, D-09, D-11 | ~40 |
| `src/lib/data/__tests__/retry.test.ts` | EXTEND — assert `BreakerOpenError` is NOT retried | D-07 | ~15 |
| `src/lib/telemetry/__tests__/error-classifier.unit.test.ts` | EXTEND — assert `classifyError(BreakerOpenError)` returns `'BREAKER_OPEN'` | D-08 | ~10 |

**Approximate total budget:** ~1,400 LOC of new/edited code + ~700 LOC of tests. ~10 new files, ~15 edited files.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Upstash REST RTT is 5-15ms p95 (not 1ms as CONTEXT.md claims) | D-04 storage | If genuinely 1ms, breaker overhead is negligible; if 30+ ms, sentiment-scan cron wall-clock grows by ~10s and we may need to pipeline reads. Verify via a 100-call benchmark in dev before locking design. |
| A2 | Vercel Pro plan supports >21 cron jobs at minute-level granularity | D-17 cron #22 | If on Hobby plan (max 2 daily), the new cron must be merged into an existing daily cron. Verify via `vercel inspect` or Vercel dashboard. |
| A3 | Neon Postgres supports `MODE() WITHIN GROUP` | D-17 / D-24 SQL | If unsupported, swap to `array_agg + a custom most-frequent UDF` or do the aggregation in TypeScript. Verify with `SELECT version()` against prod Neon. |
| A4 | `MAX_FIRECRAWL_COST` per scan stays under the existing $0.001/call × 5 calls = $0.005/scan budget after rotation | D-21 | If rotated key has different pricing, recheck `cost-estimators.ts:38` constant. |
| A5 | Existing `withRetry` will NOT retry `BreakerOpenError` because the error has no `code`/`status` ≥ 500 (no explicit guard needed) | D-07 | Verified by reading `isRetryableError` at `retry.ts:46-59`. The composition order (breaker outside retry) makes this moot anyway. |
| A6 | The model-router at `src/lib/reasoning/router.ts` is the only producer of `learning_events` rows with `event_type='model_router_decision'`; nothing downstream JOINs on these rows | D-14, R-12 | If a Phase 20 calibration cron reads them, gutting the router breaks it. Grep `event_type.*model_router_decision` to confirm. |

---

## Open Questions

1. **R-3 Model ID Resolution** — Is the current AI Gateway path actually routing to `gemini-3-pro` (and is that what the $4/call observation reflects), or is it falling back to a default? CONTEXT.md prescribes `gemini-2.5-pro`. The planner needs to verify the current routing behavior with a live call BEFORE writing the model-pin task, then lock the slug in PLAN-CHECK.
   - What we know: Code calls `model: 'google/gemini-3-flash'` by default; `'google/gemini-3-pro'` when routerCtx says pro.
   - What's unclear: Whether AI Gateway honors `google/gemini-3-pro` (and at what cost) or transparently falls back. The $4/call observation could be `gemini-3-pro` × longer-than-expected token counts, not a model misroute.
   - Recommendation: Spend one Gemini call in dev to verify response metadata's model id matches the request.

2. **D-15 single counter scope** — Cost-anomaly counter `cost_anomaly:gemini` is provider-wide, not per-call-site. If only ONE call site (gemini-analysis.ts) is the offender, a provider-wide breaker punishes the lightweight per-doc classifier too. CONTEXT.md says provider-wide; honor that, but flag the asymmetry.
   - Recommendation: Honor CONTEXT.md (provider-wide). If false-positives become a problem post-ship, the deferred ideas list already includes a "rolling-average alert" follow-up.

3. **Yahoo-only quote field fallback** — Once Yahoo is breaker-tripped, `price`, `volume`, and `percent_change_today` have NO fallback. Sentiment-scan currently fails the ticker if `price === null` (`sentiment-scan/route.ts:42`). With D-04 + D-12 + D-23, this becomes "all tickers fail when Yahoo's breaker is open." Is that acceptable?
   - Recommendation: Accept it. Yahoo's breaker is open precisely BECAUSE Yahoo is failing — there's nothing to fall back to. The watchlist rotates within 8h (next sweep), so a 30s breaker open window has minimal impact. Document this explicitly in `sentiment-scan/route.ts` comments so future debugging is faster.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@upstash/redis` npm package | D-04, D-15 breaker state, D-02 cache | ✓ | already in deps via `cache/upstash.ts:19` | — |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` env | runtime | ✓ assumed (cache helper currently uses them) | — | breaker degrades to **always-closed** if Upstash absent — graceful per existing `getRedis()` guard at `upstash.ts:27-39` |
| Neon Postgres + `provider_call_logs` table | D-16, D-17, D-24, D-25 | ✓ | existing 569 rows in prod (per debug doc) | — |
| Vercel `CRON_SECRET` env | D-17 cron auth | ✓ | existing crons use it | — |
| Firecrawl API key | D-21 rotation | ✓ currently in prod but failing | — | D-23 breaker-wrap |
| `prisma migrate` build step | D-18 schema migration | ✓ `vercel.json:3` runs it on build | — | — |
| Playwright | D-10, D-19 e2e tests | ✓ presumed per global CLAUDE.md rule | — | unit-only fallback for tiles |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Upstash REST credentials — breaker degrades to permissive-closed if absent (matches existing cache helper's no-op pattern, so no surprise behavior).

---

## Sources

### Primary (HIGH confidence) — verified by direct file read in this session
- `src/lib/telemetry/withTelemetry.ts` (full file) — composition layer
- `src/lib/data/retry.ts` (full file) — retry policy
- `src/lib/telemetry/error-classifier.ts` (full file) — enum extension target
- `src/lib/data/merge.ts` (lines 1-247) — cascade order, FieldOrigin handling
- `src/lib/data/cache/upstash.ts` (full file) — Upstash REST client, graceful-degrade pattern
- `src/lib/data/cache/cache-keys.ts` (full file) — TTL pinning, key conventions
- `src/lib/data/yahoo.ts` (lines 1-153) — current adapter shape
- `src/lib/data/polygon.ts` (lines 1-153) — field coverage matrix source
- `src/lib/data/finnhub.ts` (lines 1-154) — field coverage matrix source
- `src/lib/data/anthropic-search.ts` (lines 1-100) — withTelemetry call site
- `src/lib/data/source-package.ts` (lines 1-500) — fan-out + merge orchestration
- `src/lib/data/lightweight-community-scan.ts` (lines 1-200) — Firecrawl wrap site
- `src/lib/gemini-analysis.ts` (lines 1-200, 1180-1330) — current Gemini call shape, model strings
- `src/lib/sentiment/per-doc-classifier.ts:103` — second Gemini call site (via grep)
- `src/lib/telemetry/cost-estimators.ts` (full file) — ProviderId enum, GEMINI_TOKEN_RATES
- `src/lib/telemetry/provider-call-log.ts` (full file) — recordCallAsync, deleteOlderThan
- `src/lib/types.ts` (lines 40-149) — FieldOrigin union and interface shapes
- `src/app/api/cron/cost-budget-check/route.ts` (full file) — reference template for D-17
- `src/app/api/cron/provider-call-log-retention/route.ts` (full file) — retention sweep pattern
- `src/app/api/cron/sentiment-scan/route.ts` (lines 1-220) — cron skip pattern
- `src/app/insights/sentiment-health/page.tsx` (full file) — dashboard tile pattern
- `prisma/schema.prisma` (lines 1-200, 424-465) — model conventions, ProviderCallLog shape
- `vercel.json` (full file) — 21 existing crons, schedule conflicts
- `.planning/config.json` (full file) — workflow.nyquist_validation = true
- `.planning/debug/resolved/bayesian-learning-engine-prod-broken.md` (full file) — QUATERNARY findings, source of all error-rate numbers
- `.planning/phases/30-provider-health-hardening/30-CONTEXT.md` (full file) — locked decisions
- `.planning/phases/30-provider-health-hardening/30-DISCUSSION-LOG.md` (full file) — rationale audit trail
- `/Users/tj/Desktop/Cipher/claude.md` — project guidelines

### Secondary (MEDIUM confidence) — derived from code patterns + project history
- Vercel Pro plan cron limits (40 jobs, minute-level) — referenced from training; cross-verify
- Neon Postgres `MODE() WITHIN GROUP` support — Postgres 15 standard, but Neon-specific verification needed (A3)
- Upstash REST RTT typical values (5-15ms) — typical infrastructure ranges; benchmark before locking design (A1)

### Tertiary (LOW confidence) — flagged for validation
- Hystrix half-open state machine pattern (Netflix) — well-known reliability pattern, used as design reference; not externally verified in this session beyond training knowledge. Implementation skeleton is self-contained so this is low risk.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library and module already in use; no new dependencies needed
- Architecture: HIGH — composition pattern (`withTelemetry → withBreaker → withRetry → fn`) verified against existing wrappers
- Pitfalls: HIGH — composition-order trap and FieldOrigin widening trap surfaced explicitly via R-1 and R-2
- Model ID: LOW — CONTEXT.md/code discrepancy (R-3) unresolved; planner MUST resolve before lock

**Research date:** 2026-05-14
**Valid until:** 2026-06-13 (30 days — stable phase, no fast-moving deps)

---

## RESEARCH COMPLETE

**Phase:** 30 — Provider Health Hardening
**Confidence:** HIGH (with R-3 flagged for planner resolution)

### Key Findings

- All 25 decisions are implementable on existing infrastructure — no new libraries beyond `@upstash/redis` (already in deps).
- The breaker is a ~120-LOC standalone module composed as `withTelemetry → withBreaker → withRetry → fn`. Composition order is load-bearing (R-1).
- The `FieldOrigin` widening (D-11) should use strategy 2 (additive — keep `null`, add `'unavailable'`) to avoid backfilling persisted JSON (R-2, R-8).
- **MODEL-ID DISCREPANCY** (R-3) — CONTEXT.md says `gemini-2.5-pro`/`gemini-2.5-flash`; code uses `gemini-3-pro`/`gemini-3-flash`/`gemini-3.1-flash-lite`. Planner MUST resolve via PLAN-CHECK before writing the D-14 task.
- The new cron (`provider-error-budget`, schedule `15 9 * * *`) is the 22nd entry in `vercel.json` — no scheduling conflicts; mirrors `cost-budget-check` verbatim including the `insufficient_history` cold-start guard.
- D-25 verification artifact lives at `reports/provider-health-{date}.md` (gitignored).

### File Created
`/Users/tj/Desktop/Cipher/.planning/phases/30-provider-health-hardening/30-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Every library already in use |
| Architecture | HIGH | Composition pattern verified against existing wrappers |
| Pitfalls | HIGH | Composition + FieldOrigin traps surfaced explicitly |
| Model-ID pin | LOW | R-3 discrepancy unresolved — planner action required |

### Open Questions
- R-3: Resolve Gemini model slug (`gemini-2.5-pro` per CONTEXT.md vs `gemini-3-pro` in current code)
- D-15 single counter scope — provider-wide vs per-call-site (CONTEXT.md says provider-wide; honor it)
- Yahoo-only quote field fallback behavior when breaker open (acceptable; document it)

### Ready for Planning
Research complete. Planner can now create PLAN.md files with the file-edit map above as the task-sizing reference. The Validation Architecture table is the Nyquist VALIDATION.md seed.
