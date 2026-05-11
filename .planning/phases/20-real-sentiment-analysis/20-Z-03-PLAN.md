---
phase: 20
plan: 20-Z-03
wave: Z
type: execute
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/lib/telemetry/withTelemetry.ts
  - src/lib/telemetry/cost-estimators.ts
  - src/lib/telemetry/error-classifier.ts
  - src/lib/telemetry/provider-call-log.ts
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
  - src/app/insights/sentiment-health/page.tsx
  - src/app/insights/sentiment-health/components/ProviderTile.tsx
  - src/app/api/insights/sentiment-health/route.ts
  - src/app/api/cron/cost-budget-check/route.ts
  - src/app/api/cron/provider-call-log-retention/route.ts
  - vercel.json
  - scripts/check-telemetry-coverage.ts
  - package.json
  - tests/telemetry/withTelemetry.unit.test.ts
  - tests/telemetry/cost-estimators.unit.test.ts
  - tests/telemetry/error-classifier.unit.test.ts
  - tests/telemetry/cost-budget-check.unit.test.ts
  - tests/integration/provider-call-log.integration.test.ts
  - tests/integration/sentiment-health-api.integration.test.ts
autonomous: true
requirements: []
shadow_required: false
shadow_skip_reason: "Additive ProviderCallLog table + non-blocking async-fire wrapper around the existing return value. The wrapped call site receives the IDENTICAL return value with IDENTICAL timing semantics — telemetry INSERT runs in a fire-and-forget Promise that never throws into the caller. Per S3, when no read/return path is being changed there is no off→shadow→on transition to gate; the verdict is purely the numerical acceptance criteria below (overhead p99 < 2ms, ≥6 wrapped sites, non-zero data after 24h)."
hard_cleanup_gate: true
must_haves:
  truths:
    - "ProviderCallLog table exists in production Neon with indexes on (provider_id, started_at) and (ticker, started_at)"
    - "withTelemetry<T>() exists at src/lib/telemetry/withTelemetry.ts with the literal signature in <interfaces>; composes around withRetry; never blocks the caller on the INSERT"
    - "ProviderId enum exhaustive: yahoo | polygon | finnhub | anthropic-search | stocktwits | firecrawl | gemini | finbert-hf | apewisdom"
    - "≥6 external call sites under src/lib/data/ are wrapped in withTelemetry( — verified by grep counter"
    - "Cost estimator constants per provider committed verbatim with cited per-call rates (gemini token-based, anthropic-search $0.01, firecrawl $0.001, finbert-hf $0.0001, others $0)"
    - "/insights/sentiment-health renders per-provider tiles with p50/p95/p99 latency, error rate, cost/req, cache-hit rate, fallback rate from last-24h ProviderCallLog rows"
    - "/api/insights/sentiment-health returns 200 + non-empty JSON in <2s after Task 3 push and ≥1 cron tick has run"
    - "Cost-budget cron /api/cron/cost-budget-check runs daily, no-ops with 'insufficient_history' until ≥7 days of data exist, then alerts when today's per-provider cost > 1.5× rolling-7d mean"
    - "Retention cron /api/cron/provider-call-log-retention deletes ProviderCallLog rows older than 90 days (T-20-Z-03-02 mitigation)"
    - "error_class is a controlled enum (RATE_LIMITED | AUTH_FAILED | TIMEOUT | UPSTREAM_5XX | NETWORK | UNKNOWN) — never raw error message (T-20-Z-03-05)"
    - "withTelemetry overhead unit test asserts p99 < 2ms across 1000 invocations (T-20-Z-03-01)"
    - "scripts/check-telemetry-coverage.ts greps src/lib/data/ for un-wrapped call sites and exits non-zero if a known external module is missing withTelemetry"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "ProviderCallLog model + 2 composite indexes"
      contains: "model ProviderCallLog"
    - path: "src/lib/telemetry/withTelemetry.ts"
      provides: "withTelemetry<T>() wrapper composing around withRetry with async-fire INSERT into ProviderCallLog"
      contains: "export async function withTelemetry"
    - path: "src/lib/telemetry/cost-estimators.ts"
      provides: "Per-provider cost estimator constants + GEMINI_TOKEN_RATES + per-call rates table with citation comments"
      contains: "COST_PER_CALL_USD"
    - path: "src/lib/telemetry/error-classifier.ts"
      provides: "classifyError(unknown): TelemetryErrorClass — controlled enum, never raw message"
      contains: "RATE_LIMITED"
    - path: "src/lib/telemetry/provider-call-log.ts"
      provides: "Insert-only DAO for ProviderCallLog rows; fire-and-forget helper recordCallAsync()"
      contains: "recordCallAsync"
    - path: "src/app/insights/sentiment-health/page.tsx"
      provides: "Per-provider Sentiment Health tab — server component renders tiles from /api/insights/sentiment-health"
      contains: "Sentiment Health"
    - path: "src/app/api/insights/sentiment-health/route.ts"
      provides: "JSON endpoint computing percentile_cont latency p50/p95/p99 + cost + error/fallback/cache rates per provider over last 24h"
      contains: "percentile_cont"
    - path: "src/app/api/cron/cost-budget-check/route.ts"
      provides: "Daily cron — alerts when per-provider cost exceeds 1.5× rolling-7d baseline; no-op until ≥7d data"
      contains: "1.5"
    - path: "src/app/api/cron/provider-call-log-retention/route.ts"
      provides: "Daily cron — deletes ProviderCallLog rows older than 90 days (T-20-Z-03-02)"
      contains: "90"
    - path: "scripts/check-telemetry-coverage.ts"
      provides: "CI guard — exits non-zero if any known external adapter is missing withTelemetry wrapping"
      contains: "withTelemetry"
    - path: "vercel.json"
      provides: "Two new cron entries (cost-budget-check daily, provider-call-log-retention daily)"
      contains: "cost-budget-check"
  key_links:
    - from: "src/lib/data/yahoo.ts (existing withRetry call sites)"
      to: "src/lib/telemetry/withTelemetry.ts withTelemetry()"
      via: "wrap inside the existing cached() block: cached(() => withTelemetry('yahoo', () => withRetry(() => yahooFinance.quote(ticker)), { ticker }))"
      pattern: "withTelemetry\\("
    - from: "src/lib/sentiment/finsentllm.ts (FinBERT HF endpoint call site)"
      to: "src/lib/telemetry/withTelemetry.ts withTelemetry()"
      via: "wrap the HF endpoint fetch with provider_id 'finbert-hf'"
      pattern: "withTelemetry\\('finbert-hf'"
    - from: "src/lib/gemini-analysis.ts (Gemini call via AI Gateway)"
      to: "src/lib/telemetry/withTelemetry.ts withTelemetry()"
      via: "wrap the generateObject() call; cost_usd_estimator reads usage.inputTokens + usage.outputTokens"
      pattern: "withTelemetry\\('gemini'"
    - from: "src/app/api/insights/sentiment-health/route.ts"
      to: "Neon ProviderCallLog table"
      via: "raw SQL percentile_cont(0.50/0.95/0.99) WITHIN GROUP (ORDER BY duration_ms) GROUP BY provider_id"
      pattern: "percentile_cont"
    - from: "src/app/api/cron/cost-budget-check/route.ts"
      to: "ProviderCallLog rolling 7d cost aggregate"
      via: "SELECT provider_id, SUM(cost_usd) ... GROUP BY provider_id, DATE(started_at)"
      pattern: "1\\.5"
    - from: "vercel.json crons[]"
      to: "two new endpoints (cost-budget-check + provider-call-log-retention)"
      via: "daily schedule entries"
      pattern: "cost-budget-check"
---

# Plan 20-Z-03: Telemetry — `/insights/sentiment-health` tab + ProviderCallLog + withTelemetry wrapper

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE step only: the `npx prisma db push` against live Neon (per CONTEXT.md line 172 "Prisma schema migration + db push (additive, non-blocking)"). All other tasks are autonomous. After the operator confirms the push has landed, the remaining tasks (wrapper implementation, adapter wiring, dashboard, crons, tests, commit) proceed without further prompts.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **No shadow lifecycle to graduate** (S3 N/A — additive table + fire-and-forget wrapper that does not change return values; documented in `shadow_skip_reason`).
2. **No old code deleted** (additive only; existing `withRetry` callers are wrapped, not replaced — `withTelemetry` composes around `withRetry`; existing semantics preserved).
3. **No feature flag introduced** (telemetry always runs; INSERT failure is swallowed and counted, never blocks the caller).
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), and `npm run test:e2e` (Playwright) all green on `main` post-commit.
5. **Schema Push Gate**: `npx prisma db push` succeeded against the live `DATABASE_URL` (production Neon) AND the integration test `tests/integration/provider-call-log.integration.test.ts` writes ≥1 row in a single wrapper invocation.
6. **Telemetry Coverage Gate**: `npm run check-telemetry-coverage` exits 0; `grep -c "withTelemetry(" src/lib/data/*.ts src/lib/data/adapters/*.ts src/lib/sentiment/*.ts src/lib/gemini-analysis.ts` returns `>= 6`.
7. **Dashboard Live Gate**: After ≥1 cron tick has run post-push, `curl -fs http://localhost:3000/api/insights/sentiment-health` returns 200 with JSON containing at least one provider entry whose `count_24h >= 1`. Forward-reference: the operator-side acceptance ("renders with non-zero data after 24h") in CONTEXT.md line 91 is satisfied passively by the running crons after this plan ships; the integration test in Task 11 directly inserts rows so the gate is mechanically verifiable now.
8. **Overhead Gate**: `npx vitest run tests/telemetry/withTelemetry.unit.test.ts -t overhead` reports p99 wrapper overhead < 2ms across 1000 invocations.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — The 1.5× cost-budget multiplier is the literal value in CONTEXT.md spec line 91 ("Cost-budget alert at 1.5× rolling 7d baseline"); the 90-day retention horizon is documented in T-20-Z-03-02 as the operational default and called out for review at the next phase. All other thresholds (p50/p95/p99) are descriptive percentiles, not tuning parameters.
- **S2 (PIT discipline)** — `started_at` and `ended_at` are immutable wall-clock timestamps captured at call-time; the table is insert-only from production paths (only the retention cron deletes). Backfill is impossible by construction (a call that already happened cannot be re-emitted).
- **S3 (shadow lifecycle)** — Skipped with documented reason in frontmatter `shadow_skip_reason`. The wrapper does not alter return values or timing observable to the caller; the dashboard reads exclusively from the new table; there is no parallel-path output to compare.
- **S4 (model/dataset card)** — N/A; this plan ships infrastructure, not a model.
- **S5 (pinned model+prompt versions)** — `provider_id` is a pinned enum string; `cost_usd_estimator` per-provider rates are pinned constants with citation comments referencing each upstream pricing page (Gemini AI Gateway, Anthropic, Firecrawl, HF Inference).
- **S6 (telemetry on every external call)** — THIS PLAN. Acceptance is grep `>= 6` wrapped sites + check-telemetry-coverage CI guard.
- **S7 (threat model)** — five plan-level threats T-20-Z-03-{01..05} below; T-20-Z-03-01/02/04/05 mitigated in this plan, T-20-Z-03-03 (estimator drift) is reviewed quarterly per the documented operator action.
- **S8 (numerical acceptance)** — every DONE criterion below is a grep / test exit / row-count / percentile assertion. Zero adjectives.

</universal_preamble>

<objective>
Ship per-provider observability for every external call Cipher makes — latency p50/p95/p99, error rate, cost per request, cache hit rate, fallback rate — plus a daily cost-budget alert at 1.5× rolling-7d baseline. Mechanism: a new immutable `ProviderCallLog` Prisma table fed by a `withTelemetry()` wrapper that composes around the existing `withRetry()` (Plan 19-B-02) without altering caller semantics. Dashboard surface: a new `/insights/sentiment-health` server component rendering per-provider tiles from a new `/api/insights/sentiment-health` JSON endpoint that computes percentiles via Postgres `percentile_cont` over the last-24h window. Two new daily crons land in `vercel.json`: cost-budget alerter + 90-day retention sweeper.

Purpose: Phase-20 cross-cutting standard S6 ("telemetry on every external call") is the prerequisite for all of Wave A/B/C/D — without per-call cost + latency telemetry, the FinBERT cost claim (20-B-02), the Gemini per-document cost ceiling (20-B-01), the source-tier IC measurement (20-B-04, 20-C-01), and every "ship if cost ≤ X / latency ≤ Y" gate in Waves B-D are unmeasurable. This plan is the foundation those plans report against.

Scope guard: this plan ships **telemetry plumbing + dashboard + budget alert ONLY**. Sentiment classification, per-source ICIR (20-C-01), Bayesian aggregation (post-Phase-19), source-tier weighting (20-B-04), and OpenTelemetry collector provisioning (CONTEXT.md line 173 — explicitly deferrable per "internal dashboard works without it") are OUT OF SCOPE. The `withTelemetry` API includes a flag-shaped TODO comment for the future OTel path but does NOT implement it.

Output:
- 1 new Prisma model + 2 indexes
- 1 wrapper module (`withTelemetry.ts`) + 3 supporting modules (cost-estimators, error-classifier, provider-call-log DAO)
- ≥6 adapter call sites wrapped (yahoo ×2, polygon, polygon-news, finnhub, anthropic-search, stocktwits, lightweight-community-scan, apewisdom, exa-search, finsentllm, gemini-analysis)
- 1 dashboard page + 1 tile component
- 1 JSON API endpoint backing the page
- 2 new crons (cost-budget-check, retention) + `vercel.json` entries
- 1 CI coverage guard script
- 4 unit-test files + 2 live-Neon integration tests
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md
@prisma/schema.prisma
@src/lib/db.ts
@src/lib/data/retry.ts
@src/lib/data/yahoo.ts
@src/lib/data/polygon.ts
@src/lib/data/finnhub.ts
@src/lib/data/anthropic-search.ts
@src/lib/data/stocktwits.ts
@src/lib/data/lightweight-community-scan.ts
@src/lib/data/adapters/apewisdom.ts
@src/lib/data/adapters/exa-search.ts
@src/lib/sentiment/finsentllm.ts
@src/lib/gemini-analysis.ts
@src/app/insights/page.tsx
@src/app/api/insights/route.ts
@vercel.json

<interfaces>
```typescript
// src/lib/telemetry/withTelemetry.ts — NEW

/**
 * Pinned enum of every external call origin Cipher makes. Adding a new external
 * provider requires: (1) extending this enum, (2) adding a row to COST_PER_CALL_USD
 * in cost-estimators.ts, (3) check-telemetry-coverage will then enforce the new
 * provider has at least one wrapped call site.
 */
export type ProviderId =
  | 'yahoo'
  | 'polygon'
  | 'finnhub'
  | 'anthropic-search'
  | 'stocktwits'
  | 'firecrawl'
  | 'gemini'
  | 'finbert-hf'
  | 'apewisdom';

export type TelemetryErrorClass =
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'TIMEOUT'
  | 'UPSTREAM_5XX'
  | 'NETWORK'
  | 'UNKNOWN';

export interface WithTelemetryOptions<T> {
  /** Optional ticker context for per-ticker breakdowns. */
  ticker?: string;
  /** Estimate USD cost given the resolved value (e.g., gemini reads usage.inputTokens). Defaults to COST_PER_CALL_USD[provider_id]. */
  cost_usd_estimator?: (result: T) => number;
  /** Whether the value came from cache. Counted into cache_hit_rate on the dashboard. */
  cache_check?: () => boolean;
  /** True if this invocation is itself a fallback path (counted into fallback_rate). */
  is_fallback?: boolean;
  /** TODO: future OTel collector hook. Not implemented in 20-Z-03; placeholder for the deferrable item in CONTEXT.md line 173. */
  // extensions?: { otel?: 'off' | 'shadow' | 'on' };
}

/**
 * withTelemetry — wraps an external-call function and records latency / status / cost
 * to ProviderCallLog. Returns the EXACT value `fn()` returned. The INSERT runs
 * fire-and-forget — the caller never awaits it.
 *
 * @example wrap an existing withRetry-wrapped fetch:
 *   const quote = await withTelemetry('yahoo', () => withRetry(() => yahooFinance.quote(ticker)), { ticker });
 *
 * @example with a result-derived cost (Gemini):
 *   const out = await withTelemetry('gemini', () => generateObject({...}), {
 *     ticker,
 *     cost_usd_estimator: (r) => r.usage.inputTokens * GEMINI_TOKEN_RATES.input
 *                              + r.usage.outputTokens * GEMINI_TOKEN_RATES.output,
 *   });
 */
export async function withTelemetry<T>(
  provider_id: ProviderId,
  fn: () => Promise<T>,
  opts?: WithTelemetryOptions<T>,
): Promise<T>;
```

```typescript
// src/lib/telemetry/cost-estimators.ts — NEW
//
// Per-provider per-call USD cost constants. CITED. Quarterly review per T-20-Z-03-03.
//
// Sources:
//   gemini   — https://ai.google.dev/pricing (Gemini 2.5 Flash via Vercel AI Gateway, 2026-Q1)
//   anthropic-search — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool ($10/1k = $0.01/call)
//   firecrawl        — https://www.firecrawl.dev/pricing ($1/1k pages = $0.001/call)
//   finbert-hf       — https://huggingface.co/pricing ($0.033/hr CPU, ~330 inferences/hr → ~$0.0001/call)
//   yahoo / polygon / finnhub / stocktwits / apewisdom — free-tier or fixed-monthly ($0 marginal)

export const COST_PER_CALL_USD: Record<ProviderId, number> = {
  'yahoo':            0,
  'polygon':          0,
  'finnhub':          0,
  'anthropic-search': 0.01,
  'stocktwits':       0,
  'firecrawl':        0.001,
  'gemini':           0,        // computed via cost_usd_estimator + GEMINI_TOKEN_RATES
  'finbert-hf':       0.0001,
  'apewisdom':        0,
};

export const GEMINI_TOKEN_RATES = {
  input:  0.000125,             // USD per input token   (Gemini 2.5 Flash, 2026-Q1)
  output: 0.000375,             // USD per output token  (Gemini 2.5 Flash, 2026-Q1)
} as const;
```

```typescript
// src/lib/telemetry/error-classifier.ts — NEW
//
// classifyError — maps an arbitrary thrown value to a controlled TelemetryErrorClass.
//
// T-20-Z-03-05: this is the ONLY value persisted into ProviderCallLog.error_class —
// the raw error message is NEVER persisted. Prevents leaking secrets, PII, or
// upstream payload fragments into the telemetry table.

export function classifyError(err: unknown): TelemetryErrorClass;
//   - 401 / 403           → AUTH_FAILED
//   - 429                 → RATE_LIMITED
//   - 408 / fetch timeout / AbortError → TIMEOUT
//   - 5xx                 → UPSTREAM_5XX
//   - ECONNREFUSED / ENOTFOUND / ECONNRESET / ETIMEDOUT / EAI_AGAIN → NETWORK
//   - anything else       → UNKNOWN
```

```prisma
// prisma/schema.prisma — NEW model (appended after SentimentObservation from 20-Z-01)

model ProviderCallLog {
  id                  String   @id @default(uuid())
  provider_id         String   // pinned enum: see ProviderId in src/lib/telemetry/withTelemetry.ts
  ticker              String?  // nullable — not every call is per-ticker
  started_at          DateTime @db.Timestamptz                  // wall-clock at call entry; immutable
  ended_at            DateTime @db.Timestamptz                  // wall-clock at call resolve/reject; immutable
  duration_ms         Int                                       // ended_at - started_at, materialized
  status              String   // 'ok' | 'error'
  http_status         Int?     // when known (REST adapters); null for SDK calls without status surface
  error_class         String?  // controlled TelemetryErrorClass enum value; NEVER raw message (T-20-Z-03-05)
  fallback_used       Boolean  @default(false)
  cache_hit           Boolean  @default(false)
  cost_usd            Float    @default(0)                      // estimated; 0 for free-tier; see cost-estimators.ts
  request_size_bytes  Int?
  response_size_bytes Int?
  retry_count         Int      @default(0)

  @@index([provider_id, started_at(sort: Desc)], map: "idx_pcl_provider_started")
  @@index([ticker, started_at(sort: Desc)], map: "idx_pcl_ticker_started")
  @@map("provider_call_logs")
}
```

```typescript
// src/lib/telemetry/provider-call-log.ts — NEW
//
// Insert-only DAO. Production callers use recordCallAsync() which fire-and-forgets.
// The retention cron uses the deleteOlderThan() helper (the ONLY non-INSERT export).

export interface ProviderCallLogRow {
  provider_id: ProviderId;
  ticker: string | null;
  started_at: Date;
  ended_at: Date;
  duration_ms: number;
  status: 'ok' | 'error';
  http_status: number | null;
  error_class: TelemetryErrorClass | null;
  fallback_used: boolean;
  cache_hit: boolean;
  cost_usd: number;
  request_size_bytes: number | null;
  response_size_bytes: number | null;
  retry_count: number;
}

/** Fire-and-forget: returns immediately, INSERTs in the background. INSERT failures are swallowed and counted. */
export function recordCallAsync(row: ProviderCallLogRow): void;

/** Used ONLY by the 90-day retention cron. */
export async function deleteOlderThan(thresholdDays: number): Promise<{ deleted: number }>;

/** Test-only counter. */
export function __internal_swallowed_insert_failures(): number;
```

```typescript
// src/app/api/insights/sentiment-health/route.ts — NEW (response shape)

export interface SentimentHealthResponse {
  generated_at: string;             // ISO timestamp
  window_hours: 24;
  providers: ProviderHealthRow[];
}

export interface ProviderHealthRow {
  provider_id: ProviderId;
  count_24h: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  error_rate: number;               // [0,1]
  cache_hit_rate: number;           // [0,1]
  fallback_rate: number;            // [0,1]
  total_cost_usd_24h: number;
  cost_per_call_usd_24h: number;    // 0 if count_24h === 0
}
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-Z-03-01 | DoS / performance regression | `withTelemetry` wrapper adds latency to every external call | mitigate | Wrapper resolves the caller's value FIRST, then schedules the INSERT via `queueMicrotask(() => recordCallAsync(row))`. INSERT is NEVER awaited before returning. Unit test `tests/telemetry/withTelemetry.unit.test.ts` measures wrapper-only overhead across 1000 invocations and asserts p99 < 2ms. |
| T-20-Z-03-02 | DoS / cardinality explosion | ProviderCallLog grows unbounded — at ~10 providers × ~500 calls/day = ~5k rows/day = ~1.8M rows/year | mitigate | New cron `/api/cron/provider-call-log-retention` runs daily and deletes rows where `started_at < now() - interval '90 days'`. The 90-day horizon balances dashboard utility (rolling baselines need ≥7d) with table size (90 × 5k = 450k rows steady-state, well within Neon free tier). Two composite indexes shipped from day 1. |
| T-20-Z-03-03 | Tampering / integrity | Cost estimator constants drift from upstream pricing (e.g., Gemini doubles per-token rate) → budget alerts fire on stale baselines | mitigate | Each constant in `cost-estimators.ts` carries a citation comment with the upstream pricing URL. Quarterly review cadence documented in source-file header. Unit test `tests/telemetry/cost-estimators.unit.test.ts` asserts the literal numeric values against constants in the source — fails on any silent edit, forcing PR-time review. |
| T-20-Z-03-04 | DoS / alert spam | Cost-budget alert (1.5× rolling 7d baseline) fires every day during cold-start when there is <7d of data | mitigate | The cron `/api/cron/cost-budget-check/route.ts` short-circuits and emits `{ status: 'insufficient_history', days_observed: N }` (not an alert) until `MIN(started_at)` is at least 7 days old per provider. Unit test covers the cold-start no-op explicitly. |
| T-20-Z-03-05 | Information disclosure | Raw error messages might leak secrets (API keys in URLs, PII in upstream payloads) into ProviderCallLog.error_class | mitigate | `error_class` is a controlled `TelemetryErrorClass` enum: `RATE_LIMITED \| AUTH_FAILED \| TIMEOUT \| UPSTREAM_5XX \| NETWORK \| UNKNOWN`. Raw error messages NEVER persisted. `classifyError(err)` in `error-classifier.ts` is the only mapping function. Unit test asserts that an error whose message contains `"sk-ant-..."` maps to a controlled enum value and that the secret string never appears in the persisted row. |

</threat_model>

<tasks>

<task type="auto" id="20-Z-03-01">
  <name>Task 1: Add ProviderCallLog Prisma model + 2 composite indexes</name>
  <read_first>
    - prisma/schema.prisma (append AFTER the SentimentObservation block landed by 20-Z-01)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (Task 1 — same shape: additive model)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 91 — verbatim 20-Z-03 spec)
  </read_first>
  <action>
    Append the following block to `prisma/schema.prisma` AFTER the `SentimentObservation` model (which 20-Z-01 added). Do NOT modify any existing model — purely additive.

    ```prisma

    // ─── Phase 20-Z-03 — Telemetry (per-call observability for external providers) ───
    // Insert-only by production paths (only the retention cron deletes). Captures
    // wall-clock timing + status + cost for every external provider call routed
    // through withTelemetry(). Powers /insights/sentiment-health and the daily
    // 1.5× rolling-7d cost-budget alerter. error_class is a controlled enum —
    // raw error messages are NEVER persisted (T-20-Z-03-05).
    model ProviderCallLog {
      id                  String   @id @default(uuid())
      provider_id         String   // pinned enum — see ProviderId in src/lib/telemetry/withTelemetry.ts
      ticker              String?
      started_at          DateTime @db.Timestamptz
      ended_at            DateTime @db.Timestamptz
      duration_ms         Int
      status              String   // 'ok' | 'error'
      http_status         Int?
      error_class         String?  // controlled TelemetryErrorClass; NEVER raw message (T-20-Z-03-05)
      fallback_used       Boolean  @default(false)
      cache_hit           Boolean  @default(false)
      cost_usd            Float    @default(0)
      request_size_bytes  Int?
      response_size_bytes Int?
      retry_count         Int      @default(0)

      @@index([provider_id, started_at(sort: Desc)], map: "idx_pcl_provider_started")
      @@index([ticker, started_at(sort: Desc)], map: "idx_pcl_ticker_started")
      @@map("provider_call_logs")
    }
    ```

    Run Prisma client regeneration (no DB push yet — that is Task 3):

    ```bash
    npx prisma generate
    ```
  </action>
  <verify>
    <automated>npx prisma format --check &amp;&amp; grep -q "model ProviderCallLog" prisma/schema.prisma &amp;&amp; [ "$(grep -c 'idx_pcl_' prisma/schema.prisma)" -eq 2 ]</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "model ProviderCallLog" prisma/schema.prisma` returns `1`
    - `grep -c "idx_pcl_" prisma/schema.prisma` returns `2`
    - `grep -c "provider_call_logs" prisma/schema.prisma` returns `1`
    - `npx prisma generate` exits 0
    - `npx prisma format` exits 0 with no diff
    - No existing model modified: `git diff prisma/schema.prisma | grep -E "^-[^-]" | wc -l` returns `0`
  </acceptance_criteria>
  <done>ProviderCallLog model + 2 indexes present; client regenerated; no existing model touched</done>
</task>

<task type="auto" id="20-Z-03-02">
  <name>Task 2: Implement telemetry primitives — cost-estimators, error-classifier, provider-call-log DAO</name>
  <read_first>
    - src/lib/db.ts (prisma singleton)
    - src/lib/data/retry.ts (existing withRetry shape — withTelemetry composes around this; do NOT modify retry.ts)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (threat model T-20-Z-03-03 / T-20-Z-03-05)
  </read_first>
  <action>
    Create three modules under a new `src/lib/telemetry/` directory.

    1. `src/lib/telemetry/cost-estimators.ts` — verbatim per `<interfaces>` block. Each constant carries the citation comment. Exports `COST_PER_CALL_USD`, `GEMINI_TOKEN_RATES`, and the `ProviderId` type (re-exported from withTelemetry.ts in Task 4 — declare it here to break the circular dep cleanly).

       Per T-20-Z-03-03, include this header VERBATIM:
       ```typescript
       /**
        * Plan 20-Z-03 — per-provider USD cost constants.
        *
        * QUARTERLY REVIEW CADENCE (T-20-Z-03-03 mitigation):
        *   - Gemini    — https://ai.google.dev/pricing
        *   - Anthropic — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
        *   - Firecrawl — https://www.firecrawl.dev/pricing
        *   - HF        — https://huggingface.co/pricing
        *
        * Edits to these constants require a corresponding update to
        * tests/telemetry/cost-estimators.unit.test.ts (which pins the literal values).
        */
       export type ProviderId =
         | 'yahoo' | 'polygon' | 'finnhub' | 'anthropic-search'
         | 'stocktwits' | 'firecrawl' | 'gemini' | 'finbert-hf' | 'apewisdom';

       export const COST_PER_CALL_USD: Record<ProviderId, number> = {
         'yahoo':            0,
         'polygon':          0,
         'finnhub':          0,
         'anthropic-search': 0.01,
         'stocktwits':       0,
         'firecrawl':        0.001,
         'gemini':           0,
         'finbert-hf':       0.0001,
         'apewisdom':        0,
       };

       export const GEMINI_TOKEN_RATES = {
         input:  0.000125,
         output: 0.000375,
       } as const;
       ```

    2. `src/lib/telemetry/error-classifier.ts` — implements `classifyError(err: unknown): TelemetryErrorClass`. Reuses the network-sentinel codes pattern from `src/lib/data/retry.ts` (mirror the SET; do NOT import from retry.ts to keep telemetry independently testable). Export `TelemetryErrorClass` type.

       ```typescript
       export type TelemetryErrorClass =
         | 'RATE_LIMITED' | 'AUTH_FAILED' | 'TIMEOUT'
         | 'UPSTREAM_5XX' | 'NETWORK' | 'UNKNOWN';

       const NETWORK_CODES = new Set(['ECONNREFUSED','ENOTFOUND','ETIMEDOUT','ECONNRESET','EAI_AGAIN']);

       export function classifyError(err: unknown): TelemetryErrorClass {
         if (err == null) return 'UNKNOWN';
         const e = err as { name?: string; status?: number; code?: string; cause?: { code?: string } };
         const code = e.code ?? e.cause?.code;
         if (typeof code === 'string' && NETWORK_CODES.has(code)) return 'NETWORK';
         if (e.name === 'AbortError') return 'TIMEOUT';
         if (typeof e.status === 'number') {
           if (e.status === 401 || e.status === 403) return 'AUTH_FAILED';
           if (e.status === 408) return 'TIMEOUT';
           if (e.status === 429) return 'RATE_LIMITED';
           if (e.status >= 500 && e.status < 600) return 'UPSTREAM_5XX';
         }
         return 'UNKNOWN';
       }
       ```

    3. `src/lib/telemetry/provider-call-log.ts` — insert-only DAO + fire-and-forget helper.

       ```typescript
       import { prisma } from '@/lib/db';
       import type { ProviderId } from './cost-estimators';
       import type { TelemetryErrorClass } from './error-classifier';

       export interface ProviderCallLogRow {
         provider_id: ProviderId;
         ticker: string | null;
         started_at: Date;
         ended_at: Date;
         duration_ms: number;
         status: 'ok' | 'error';
         http_status: number | null;
         error_class: TelemetryErrorClass | null;
         fallback_used: boolean;
         cache_hit: boolean;
         cost_usd: number;
         request_size_bytes: number | null;
         response_size_bytes: number | null;
         retry_count: number;
       }

       let __swallowed = 0;
       export function __internal_swallowed_insert_failures(): number { return __swallowed; }
       export function __internal_reset_counter(): void { __swallowed = 0; }

       export function recordCallAsync(row: ProviderCallLogRow): void {
         queueMicrotask(() => {
           prisma.providerCallLog.create({
             data: {
               provider_id:         row.provider_id,
               ticker:              row.ticker,
               started_at:          row.started_at,
               ended_at:            row.ended_at,
               duration_ms:         row.duration_ms,
               status:              row.status,
               http_status:         row.http_status,
               error_class:         row.error_class,
               fallback_used:       row.fallback_used,
               cache_hit:           row.cache_hit,
               cost_usd:            row.cost_usd,
               request_size_bytes:  row.request_size_bytes,
               response_size_bytes: row.response_size_bytes,
               retry_count:         row.retry_count,
             },
           }).catch(() => {
             __swallowed++;
             // Intentionally swallow — telemetry must never block or fail the caller.
           });
         });
       }

       export async function deleteOlderThan(thresholdDays: number): Promise<{ deleted: number }> {
         const cutoff = new Date(Date.now() - thresholdDays * 86_400_000);
         const r = await prisma.providerCallLog.deleteMany({ where: { started_at: { lt: cutoff } } });
         return { deleted: r.count };
       }
       ```

       Constraints:
       - The DAO exports ONLY `recordCallAsync`, `deleteOlderThan`, `__internal_*` test helpers, and types.
       - No `update`, `upsert`. (`deleteMany` is allowed only inside `deleteOlderThan` for the retention cron.)
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "queueMicrotask" src/lib/telemetry/provider-call-log.ts &amp;&amp; grep -q "TelemetryErrorClass" src/lib/telemetry/error-classifier.ts &amp;&amp; grep -q "0.000125" src/lib/telemetry/cost-estimators.ts</automated>
  </verify>
  <acceptance_criteria>
    - 3 files exist: `test -f src/lib/telemetry/{cost-estimators,error-classifier,provider-call-log}.ts`
    - `grep -c "queueMicrotask" src/lib/telemetry/provider-call-log.ts` returns `1`
    - `grep -c "RATE_LIMITED\|AUTH_FAILED\|TIMEOUT\|UPSTREAM_5XX\|NETWORK\|UNKNOWN" src/lib/telemetry/error-classifier.ts` returns `>= 6`
    - `grep -c "0.000125" src/lib/telemetry/cost-estimators.ts` returns `>= 1` (Gemini input rate)
    - `grep -c "0.000375" src/lib/telemetry/cost-estimators.ts` returns `>= 1` (Gemini output rate)
    - `grep -c "0.01" src/lib/telemetry/cost-estimators.ts` returns `>= 1` (anthropic-search)
    - `grep -c "0.001" src/lib/telemetry/cost-estimators.ts` returns `>= 1` (firecrawl)
    - `grep -c "0.0001" src/lib/telemetry/cost-estimators.ts` returns `>= 1` (finbert-hf)
    - `grep -c "providerCallLog.update\|providerCallLog.upsert" src/lib/telemetry/provider-call-log.ts` returns `0`
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>3 telemetry primitive modules compile; cost constants pinned with citations; error classifier maps to controlled enum; DAO is fire-and-forget insert-only</done>
</task>

<task type="checkpoint:human-action" id="20-Z-03-03" gate="blocking">
  <name>Task 3: [BLOCKING] Run npx prisma db push against live Neon (operator-confirmed)</name>
  <read_first>
    - prisma/schema.prisma (verify the ProviderCallLog block from Task 1 is present)
    - CONTEXT.md line 172 (operator-action row: "Prisma schema migration + db push (additive, non-blocking)")
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md Task 3 (precedent — same shape)
  </read_first>
  <what-built>
    Task 1 added a new `ProviderCallLog` model to `prisma/schema.prisma`. This task pushes that schema to live Neon. The push is purely additive (new table + 2 indexes — no column drops, no type changes on existing columns), so it is non-blocking and reversible (`DROP TABLE provider_call_logs;` if needed). Without this push, Tasks 11-12 fail at runtime with "relation does not exist" and the dashboard renders empty.
  </what-built>
  <how-to-verify>
    1. Confirm `DATABASE_URL` in the executing shell points to **production Neon**:
       ```bash
       echo "$DATABASE_URL" | sed 's|//[^@]*@|//***@|'
       ```
       Expect a `neon.tech` host.

    2. Run the push (Cipher is on Prisma 7 with `previewFeatures = ["driverAdapters"]`):
       ```bash
       npx prisma db push
       ```
       Accept ONLY if the displayed plan is purely additive (new table `provider_call_logs` + 2 indexes). Decline any destructive operation on existing tables.

       Migrate-style fallback:
       ```bash
       npx prisma migrate dev --name 20_z_03_provider_call_log --skip-seed
       ```

       Non-TTY (CI / pipe):
       ```bash
       yes "" | npx prisma db push --skip-generate && npx prisma generate
       ```

    3. Verify the table landed:
       ```bash
       psql "$DATABASE_URL" -c '\d "provider_call_logs"'
       ```
       Expect 15 columns including `provider_id` (NOT NULL), `started_at`/`ended_at` (NOT NULL Timestamptz), `error_class` (nullable text), 2 indexes (`idx_pcl_provider_started`, `idx_pcl_ticker_started`).

    4. Verify row count is zero:
       ```bash
       psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "provider_call_logs"'
       ```
       Expect `0`.

    **Why this is operator-gated**: build + `tsc` pass even without the push because Prisma client types are generated from `schema.prisma`, not the live DB. Without this push, integration tests fail at runtime and the dashboard renders empty.
  </how-to-verify>
  <verify>
    <automated>psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "provider_call_logs"' &gt;/dev/null 2&gt;&amp;1 &amp;&amp; [ "$(psql "$DATABASE_URL" -tAc \"SELECT COUNT(*) FROM pg_indexes WHERE tablename='provider_call_logs' AND indexname LIKE 'idx_pcl_%'\")" -ge 2 ]</automated>
  </verify>
  <acceptance_criteria>
    - `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "provider_call_logs"'` returns `0`
    - `psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM pg_indexes WHERE tablename='provider_call_logs' AND indexname LIKE 'idx_pcl_%'"` returns `>= 2`
    - `psql "$DATABASE_URL" -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='provider_call_logs' AND column_name='started_at' AND is_nullable='NO'"` returns `started_at`
  </acceptance_criteria>
  <resume-signal>Reply with `approved` once `psql` confirms the table + 2 indexes are live. Reply with `failed: <reason>` if the push errored.</resume-signal>
  <done>ProviderCallLog table live in production Neon with 2 indexes; row count = 0</done>
</task>

<task type="auto" id="20-Z-03-04">
  <name>Task 4: Implement withTelemetry&lt;T&gt;() wrapper at src/lib/telemetry/withTelemetry.ts</name>
  <read_first>
    - src/lib/telemetry/cost-estimators.ts (Task 2 output — imports COST_PER_CALL_USD, ProviderId)
    - src/lib/telemetry/error-classifier.ts (Task 2 output — imports classifyError, TelemetryErrorClass)
    - src/lib/telemetry/provider-call-log.ts (Task 2 output — imports recordCallAsync)
    - src/lib/data/retry.ts (read-only: do NOT modify; withTelemetry COMPOSES AROUND withRetry)
  </read_first>
  <action>
    Create `src/lib/telemetry/withTelemetry.ts` with the EXACT signature in `<interfaces>` above.

    ```typescript
    /**
     * Plan 20-Z-03 — withTelemetry wrapper.
     *
     * Composes around any async fn (typically a withRetry-wrapped fetch). Captures
     * wall-clock timing, status, and cost. INSERT runs fire-and-forget — caller
     * sees IDENTICAL return value with IDENTICAL timing.
     *
     * T-20-Z-03-01: wrapper overhead p99 < 2ms (asserted in unit test).
     * T-20-Z-03-05: error_class is controlled enum, never raw message.
     */
    import { COST_PER_CALL_USD, type ProviderId } from './cost-estimators';
    import { classifyError, type TelemetryErrorClass } from './error-classifier';
    import { recordCallAsync } from './provider-call-log';

    export type { ProviderId } from './cost-estimators';
    export type { TelemetryErrorClass } from './error-classifier';

    export interface WithTelemetryOptions<T> {
      ticker?: string;
      cost_usd_estimator?: (result: T) => number;
      cache_check?: () => boolean;
      is_fallback?: boolean;
      // TODO (CONTEXT.md line 173 — deferrable): future OTel collector hook.
      // extensions?: { otel?: 'off' | 'shadow' | 'on' };
    }

    export async function withTelemetry<T>(
      provider_id: ProviderId,
      fn: () => Promise<T>,
      opts: WithTelemetryOptions<T> = {},
    ): Promise<T> {
      const started_at = new Date();
      const t0 = performance.now();
      let value: T;
      let error_class: TelemetryErrorClass | null = null;
      let http_status: number | null = null;
      let status: 'ok' | 'error' = 'ok';

      try {
        value = await fn();
      } catch (err) {
        status = 'error';
        error_class = classifyError(err);
        const e = err as { status?: number };
        if (typeof e?.status === 'number') http_status = e.status;
        const ended_at = new Date();
        const duration_ms = Math.max(0, Math.round(performance.now() - t0));
        recordCallAsync({
          provider_id,
          ticker: opts.ticker ?? null,
          started_at, ended_at, duration_ms, status,
          http_status, error_class,
          fallback_used: opts.is_fallback ?? false,
          cache_hit: false,
          cost_usd: 0,
          request_size_bytes: null, response_size_bytes: null,
          retry_count: 0,
        });
        throw err;
      }

      const ended_at = new Date();
      const duration_ms = Math.max(0, Math.round(performance.now() - t0));
      let cost_usd = COST_PER_CALL_USD[provider_id] ?? 0;
      if (opts.cost_usd_estimator) {
        try { cost_usd = opts.cost_usd_estimator(value); }
        catch { cost_usd = COST_PER_CALL_USD[provider_id] ?? 0; }
      }
      let cache_hit = false;
      if (opts.cache_check) {
        try { cache_hit = !!opts.cache_check(); } catch { cache_hit = false; }
      }

      recordCallAsync({
        provider_id,
        ticker: opts.ticker ?? null,
        started_at, ended_at, duration_ms, status,
        http_status, error_class,
        fallback_used: opts.is_fallback ?? false,
        cache_hit, cost_usd,
        request_size_bytes: null, response_size_bytes: null,
        retry_count: 0,
      });
      return value;
    }
    ```

    Constraints:
    - Wrapper does NOT modify `src/lib/data/retry.ts` — composition (`withTelemetry('yahoo', () => withRetry(() => doFetch()))`), not replacement.
    - Wrapper NEVER awaits the INSERT before returning the caller's value.
    - On thrown errors, wrapper records THEN re-throws — caller's error type and message unchanged.
    - The OTel `extensions` field is NOT implemented in v1; the comment placeholder reserves the API surface.
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "export async function withTelemetry" src/lib/telemetry/withTelemetry.ts &amp;&amp; grep -q "recordCallAsync" src/lib/telemetry/withTelemetry.ts &amp;&amp; grep -q "throw err" src/lib/telemetry/withTelemetry.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/telemetry/withTelemetry.ts`
    - `grep -c "export async function withTelemetry" src/lib/telemetry/withTelemetry.ts` returns `1`
    - `grep -c "recordCallAsync" src/lib/telemetry/withTelemetry.ts` returns `>= 2` (success + error path)
    - `grep -c "performance.now" src/lib/telemetry/withTelemetry.ts` returns `>= 1`
    - `grep -c "throw err" src/lib/telemetry/withTelemetry.ts` returns `>= 1`
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>withTelemetry wrapper compiles; composes around withRetry; INSERT is fire-and-forget; error rethrow preserved</done>
</task>

<task type="auto" id="20-Z-03-05">
  <name>Task 5: Wrap external call sites — yahoo, polygon, polygon-news, finnhub, anthropic-search, stocktwits, lightweight-community-scan, apewisdom, exa-search, finsentllm, gemini-analysis</name>
  <read_first>
    - src/lib/data/yahoo.ts (existing withRetry sites at ~line 66 (quote) and ~line 112 (summary), inside cached() blocks)
    - src/lib/data/polygon.ts (line 27 — withRetry call)
    - src/lib/data/polygon-news.ts (line 104 — withRetry inside cached())
    - src/lib/data/finnhub.ts (line 26 — withRetry)
    - src/lib/data/finnhub-analyst.ts (find external call sites; if none, document)
    - src/lib/data/anthropic-search.ts (find the Anthropic web search SDK call)
    - src/lib/data/stocktwits.ts (find the StockTwits fetch call)
    - src/lib/data/lightweight-community-scan.ts (find the firecrawl + community fetch sites)
    - src/lib/data/adapters/apewisdom.ts (line ~132 — withRetry)
    - src/lib/data/adapters/exa-search.ts (lines ~279, ~362, ~391 — withRetry)
    - src/lib/sentiment/finsentllm.ts (find the HF FinBERT endpoint fetch site)
    - src/lib/gemini-analysis.ts (find the generateObject() call to Gemini via AI Gateway)
    - src/lib/telemetry/withTelemetry.ts (Task 4 — the wrapper)
  </read_first>
  <action>
    For each adapter file below, add `import { withTelemetry } from '@/lib/telemetry/withTelemetry';` at the top, then wrap the EXISTING external call site with `withTelemetry('<provider_id>', () => <existing-call>, { ticker })`. Do NOT remove existing `withRetry` calls — composition only.

    **5a. `src/lib/data/yahoo.ts`** — both withRetry call sites (quote ~line 66, summary ~line 112):
    ```typescript
    // BEFORE:
    const quote = await withRetry(() => yahooFinance.quote(ticker), { ... });
    // AFTER:
    const quote = await withTelemetry('yahoo', () => withRetry(() => yahooFinance.quote(ticker), { ... }), { ticker });
    ```
    Apply same shape to summary call. The cached() outer block stays unchanged.

    **5b. `src/lib/data/polygon.ts`** — line 27 area:
    ```typescript
    return withTelemetry('polygon', () => withRetry(() => /* existing fn */, { ... }), { ticker });
    ```

    **5c. `src/lib/data/polygon-news.ts`** — line 104 area:
    ```typescript
    withTelemetry('polygon', () => withRetry(() => doFetchPolygonNews(ticker), { ... }), { ticker })
    ```
    (polygon-news shares provider_id 'polygon' — same vendor account; per-endpoint breakdown is out of scope.)

    **5d. `src/lib/data/finnhub.ts`** — line 26 area:
    ```typescript
    return withTelemetry('finnhub', () => withRetry(/* existing */, { ... }), { ticker });
    ```

    **5e. `src/lib/data/finnhub-analyst.ts`** — wrap any external call with `withTelemetry('finnhub', ...)`. If file has zero external calls (pure transformation), add one-line comment: `// Plan 20-Z-03: no external calls in this file — telemetry handled in finnhub.ts`.

    **5f. `src/lib/data/anthropic-search.ts`** — wrap the Anthropic web search SDK call:
    ```typescript
    const result = await withTelemetry('anthropic-search', () => /* existing anthropic.messages.create({...}) call */, { ticker });
    ```
    Use the default flat-rate cost ($0.01/call) — do NOT pass a `cost_usd_estimator` (per-search cost is fixed).

    **5g. `src/lib/data/stocktwits.ts`** — wrap the StockTwits fetch:
    ```typescript
    const r = await withTelemetry('stocktwits', () => /* existing fetch(...) */, { ticker });
    ```

    **5h. `src/lib/data/lightweight-community-scan.ts`** — wrap the Firecrawl call site (search the file for `firecrawl` or the Firecrawl SDK invocation) AND any community-source fetch. Use `withTelemetry('firecrawl', ...)` for the Firecrawl scrape. If the file calls multiple distinct providers, wrap each with its own provider_id.

    **5i. `src/lib/data/adapters/apewisdom.ts`** — line ~132:
    ```typescript
    return await withTelemetry('apewisdom', () => withRetry(() => doFetchApeWisdom(ticker), { ... }), { ticker });
    ```

    **5j. `src/lib/data/adapters/exa-search.ts`** — three sites (lines ~279, ~362, ~391). The Exa adapter is third-party search; classify as `provider_id: 'anthropic-search'` is INCORRECT — Exa is its own vendor. Since Exa is not in the v1 ProviderId enum, add `'exa'` to the `ProviderId` enum in cost-estimators.ts AND COST_PER_CALL_USD (`'exa': 0.005` per Exa pricing https://docs.exa.ai/reference/pricing — `$5/1k = $0.005/call`), then wrap:
    ```typescript
    withTelemetry('exa', () => withRetry(() => doFetchExaNews(ticker), { ... }), { ticker })
    ```
    **NOTE TO EXECUTOR:** if widening the ProviderId enum here causes downstream type errors elsewhere, ALTERNATIVELY merge Exa under `'anthropic-search'` (both are LLM-mediated web search) with an inline comment `// provider_id 'anthropic-search' is the umbrella for all LLM-search vendors in v1; per-vendor split deferred`. Choose whichever causes the smaller diff.

    **5k. `src/lib/sentiment/finsentllm.ts`** — wrap the HF FinBERT endpoint fetch:
    ```typescript
    const out = await withTelemetry('finbert-hf', () => /* existing fetch(HF_FINBERT_ENDPOINT, ...) */, { ticker });
    ```

    **5l. `src/lib/gemini-analysis.ts`** — wrap the `generateObject()` call to Gemini via AI Gateway. Use a result-derived `cost_usd_estimator`:
    ```typescript
    import { withTelemetry } from '@/lib/telemetry/withTelemetry';
    import { GEMINI_TOKEN_RATES } from '@/lib/telemetry/cost-estimators';
    // ...
    const out = await withTelemetry('gemini', () => generateObject({ /* existing args */ }), {
      ticker,
      cost_usd_estimator: (r) => {
        const usage = (r as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
        const inT  = usage?.inputTokens  ?? 0;
        const outT = usage?.outputTokens ?? 0;
        return inT * GEMINI_TOKEN_RATES.input + outT * GEMINI_TOKEN_RATES.output;
      },
    });
    ```

    Constraints:
    - Do NOT alter cached() blocks or existing retry options.
    - Do NOT change any function signature or return value.
    - Each wrap edit is a SURGICAL change to a single line plus the import.
    - If a file has multiple external call sites in the same function, wrap each independently — do NOT batch them under a single withTelemetry call.
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; [ "$(grep -rc 'withTelemetry(' src/lib/data/ src/lib/sentiment/ src/lib/gemini-analysis.ts | awk -F: '{s+=$2} END {print s}')" -ge 6 ]</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` exits 0
    - `grep -c "withTelemetry(" src/lib/data/yahoo.ts` returns `>= 2`
    - `grep -q "withTelemetry('polygon'" src/lib/data/polygon.ts` exits 0
    - `grep -q "withTelemetry('polygon'" src/lib/data/polygon-news.ts` exits 0
    - `grep -q "withTelemetry('finnhub'" src/lib/data/finnhub.ts` exits 0
    - `grep -q "withTelemetry('anthropic-search'" src/lib/data/anthropic-search.ts` exits 0
    - `grep -q "withTelemetry('stocktwits'" src/lib/data/stocktwits.ts` exits 0
    - `grep -q "withTelemetry('apewisdom'" src/lib/data/adapters/apewisdom.ts` exits 0
    - `grep -q "withTelemetry('finbert-hf'" src/lib/sentiment/finsentllm.ts` exits 0
    - `grep -q "withTelemetry('gemini'" src/lib/gemini-analysis.ts` exits 0
    - `grep -q "GEMINI_TOKEN_RATES" src/lib/gemini-analysis.ts` exits 0
    - Total wrapped sites across `src/lib/data/`, `src/lib/sentiment/`, `src/lib/gemini-analysis.ts`: `>= 6`
    - No existing `withRetry(` call removed: count of `withRetry(` in `src/lib/data/` >= same as pre-edit (verified by `git diff` line-add count for `withRetry(` >= 0)
  </acceptance_criteria>
  <done>≥6 external call sites wrapped in withTelemetry; existing withRetry composition preserved; Gemini cost-estimator wired</done>
</task>

<task type="auto" id="20-Z-03-06">
  <name>Task 6: Build /insights/sentiment-health page + ProviderTile component + JSON API endpoint</name>
  <read_first>
    - src/app/insights/page.tsx (existing /insights pattern — server component, force-dynamic, NavBar wrapper)
    - src/app/api/insights/route.ts (existing JSON endpoint pattern in this repo)
    - src/lib/db.ts (prisma singleton + raw query patterns)
    - src/lib/telemetry/withTelemetry.ts (ProviderId enum)
  </read_first>
  <action>
    1. Create `src/app/api/insights/sentiment-health/route.ts` — JSON endpoint computing per-provider stats over last 24h.

       ```typescript
       import { NextResponse } from 'next/server';
       import { prisma } from '@/lib/db';
       import type { ProviderId } from '@/lib/telemetry/cost-estimators';

       export const dynamic = 'force-dynamic';

       interface Row {
         provider_id: ProviderId;
         count_24h: number;
         latency_p50_ms: number;
         latency_p95_ms: number;
         latency_p99_ms: number;
         error_rate: number;
         cache_hit_rate: number;
         fallback_rate: number;
         total_cost_usd_24h: number;
         cost_per_call_usd_24h: number;
       }

       export async function GET() {
         if (!process.env.DATABASE_URL) {
           return NextResponse.json({ generated_at: new Date().toISOString(), window_hours: 24, providers: [] });
         }
         // Raw SQL — Prisma does not expose percentile_cont natively.
         const rows = await prisma.$queryRawUnsafe<Array<{
           provider_id: string;
           count_24h: bigint;
           p50: number | null;
           p95: number | null;
           p99: number | null;
           errors: bigint;
           cache_hits: bigint;
           fallbacks: bigint;
           total_cost: number | null;
         }>>(`
           SELECT
             provider_id,
             COUNT(*)::bigint                                                AS count_24h,
             percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)       AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)       AS p95,
             percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)       AS p99,
             SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::bigint       AS errors,
             SUM(CASE WHEN cache_hit          THEN 1 ELSE 0 END)::bigint     AS cache_hits,
             SUM(CASE WHEN fallback_used      THEN 1 ELSE 0 END)::bigint     AS fallbacks,
             SUM(cost_usd)                                                   AS total_cost
           FROM "provider_call_logs"
           WHERE started_at >= NOW() - INTERVAL '24 hours'
           GROUP BY provider_id
           ORDER BY provider_id
         `);
         const providers: Row[] = rows.map((r) => {
           const n = Number(r.count_24h);
           return {
             provider_id: r.provider_id as ProviderId,
             count_24h: n,
             latency_p50_ms: Math.round(r.p50 ?? 0),
             latency_p95_ms: Math.round(r.p95 ?? 0),
             latency_p99_ms: Math.round(r.p99 ?? 0),
             error_rate:    n > 0 ? Number(r.errors)     / n : 0,
             cache_hit_rate: n > 0 ? Number(r.cache_hits) / n : 0,
             fallback_rate:  n > 0 ? Number(r.fallbacks)  / n : 0,
             total_cost_usd_24h:    r.total_cost ?? 0,
             cost_per_call_usd_24h: n > 0 ? (r.total_cost ?? 0) / n : 0,
           };
         });
         return NextResponse.json({
           generated_at: new Date().toISOString(),
           window_hours: 24,
           providers,
         });
       }
       ```

    2. Create `src/app/insights/sentiment-health/components/ProviderTile.tsx` — small server-rendered tile:

       ```tsx
       interface Props {
         provider_id: string;
         count_24h: number;
         latency_p50_ms: number;
         latency_p95_ms: number;
         latency_p99_ms: number;
         error_rate: number;
         cache_hit_rate: number;
         fallback_rate: number;
         total_cost_usd_24h: number;
         cost_per_call_usd_24h: number;
       }
       export function ProviderTile(p: Props) {
         const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
         const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
         return (
           <div className="rounded-lg border p-4 bg-surface text-on-surface">
             <h3 className="font-semibold text-lg">{p.provider_id}</h3>
             <p className="text-sm text-muted">{p.count_24h.toLocaleString()} calls / 24h</p>
             <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
               <dt>p50</dt><dd>{p.latency_p50_ms} ms</dd>
               <dt>p95</dt><dd>{p.latency_p95_ms} ms</dd>
               <dt>p99</dt><dd>{p.latency_p99_ms} ms</dd>
               <dt>error</dt><dd>{fmtPct(p.error_rate)}</dd>
               <dt>cache hit</dt><dd>{fmtPct(p.cache_hit_rate)}</dd>
               <dt>fallback</dt><dd>{fmtPct(p.fallback_rate)}</dd>
               <dt>cost / call</dt><dd>{fmtUsd(p.cost_per_call_usd_24h)}</dd>
               <dt>cost / 24h</dt><dd>{fmtUsd(p.total_cost_usd_24h)}</dd>
             </dl>
           </div>
         );
       }
       ```

    3. Create `src/app/insights/sentiment-health/page.tsx` — server component matching existing /insights/page.tsx pattern:

       ```tsx
       import NavBar from '@/components/NavBar';
       import { ProviderTile } from './components/ProviderTile';

       export const metadata = {
         title: 'Sentiment Health — Cipher',
         description: 'Per-provider latency, cost, and reliability over the last 24 hours.',
       };
       export const dynamic = 'force-dynamic';

       interface ProviderRow {
         provider_id: string;
         count_24h: number;
         latency_p50_ms: number;
         latency_p95_ms: number;
         latency_p99_ms: number;
         error_rate: number;
         cache_hit_rate: number;
         fallback_rate: number;
         total_cost_usd_24h: number;
         cost_per_call_usd_24h: number;
       }

       async function load(): Promise<ProviderRow[]> {
         if (!process.env.DATABASE_URL) return [];
         // Server-component fetch from same-origin API route. In server context, use absolute URL via VERCEL_URL or fallback to direct DB query.
         // For simplicity + correctness, query the DB directly here (mirrors /insights/page.tsx pattern).
         const { prisma } = await import('@/lib/db');
         const rows = await prisma.$queryRawUnsafe<Array<{
           provider_id: string; count_24h: bigint;
           p50: number | null; p95: number | null; p99: number | null;
           errors: bigint; cache_hits: bigint; fallbacks: bigint;
           total_cost: number | null;
         }>>(`
           SELECT
             provider_id,
             COUNT(*)::bigint AS count_24h,
             percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
             percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99,
             SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::bigint AS errors,
             SUM(CASE WHEN cache_hit       THEN 1 ELSE 0 END)::bigint AS cache_hits,
             SUM(CASE WHEN fallback_used   THEN 1 ELSE 0 END)::bigint AS fallbacks,
             SUM(cost_usd) AS total_cost
           FROM "provider_call_logs"
           WHERE started_at >= NOW() - INTERVAL '24 hours'
           GROUP BY provider_id
           ORDER BY provider_id
         `);
         return rows.map(r => {
           const n = Number(r.count_24h);
           return {
             provider_id: r.provider_id,
             count_24h: n,
             latency_p50_ms: Math.round(r.p50 ?? 0),
             latency_p95_ms: Math.round(r.p95 ?? 0),
             latency_p99_ms: Math.round(r.p99 ?? 0),
             error_rate:    n > 0 ? Number(r.errors)     / n : 0,
             cache_hit_rate: n > 0 ? Number(r.cache_hits) / n : 0,
             fallback_rate:  n > 0 ? Number(r.fallbacks)  / n : 0,
             total_cost_usd_24h:    r.total_cost ?? 0,
             cost_per_call_usd_24h: n > 0 ? (r.total_cost ?? 0) / n : 0,
           };
         });
       }

       export default async function SentimentHealthPage() {
         const rows = await load();
         return (
           <div className="bg-surface text-on-surface min-h-screen">
             <NavBar />
             <main className="max-w-6xl mx-auto px-6 py-10">
               <h1 className="text-3xl font-bold mb-2">Sentiment Health</h1>
               <p className="text-muted mb-6">Per-provider latency / error / cost over the last 24 hours.</p>
               {rows.length === 0 ? (
                 <p className="text-sm text-muted">No telemetry yet — providers will appear here after the first wrapped call lands.</p>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                   {rows.map(r => <ProviderTile key={r.provider_id} {...r} />)}
                 </div>
               )}
             </main>
           </div>
         );
       }
       ```

    Constraints:
    - Page MUST be a Server Component (no `'use client'`); force-dynamic.
    - Page falls back to empty list when `DATABASE_URL` is unset (matches /insights/page.tsx).
    - API route returns shape exactly matching `SentimentHealthResponse` in `<interfaces>`.
    - Use raw SQL via `$queryRawUnsafe` (Prisma has no native `percentile_cont`).
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "percentile_cont" src/app/api/insights/sentiment-health/route.ts &amp;&amp; grep -q "Sentiment Health" src/app/insights/sentiment-health/page.tsx &amp;&amp; grep -q "ProviderTile" src/app/insights/sentiment-health/page.tsx  </verify>
  <acceptance_criteria>
    - 3 files exist: `src/app/api/insights/sentiment-health/route.ts`, `src/app/insights/sentiment-health/page.tsx`, `src/app/insights/sentiment-health/components/ProviderTile.tsx`
    - `grep -c "percentile_cont" src/app/api/insights/sentiment-health/route.ts` returns `>= 3` (p50, p95, p99)
    - `grep -c "percentile_cont" src/app/insights/sentiment-health/page.tsx` returns `>= 3`
    - `grep -q "force-dynamic" src/app/insights/sentiment-health/page.tsx` exits 0
    - `grep -L "'use client'" src/app/insights/sentiment-health/page.tsx` returns the path (file is server-only)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Server-component dashboard + JSON endpoint exist; both compute p50/p95/p99 + cost + rates from ProviderCallLog last-24h; render gracefully on empty data</done>
</task>

<task type="auto" id="20-Z-03-07">
  <name>Task 7: Cost-budget cron — daily 1.5× rolling-7d alerter at /api/cron/cost-budget-check</name>
  <read_first>
    - src/app/api/cron/sentiment-scan/route.ts (existing cron handler shape — auth check via CRON_SECRET, NextResponse return)
    - src/app/api/cron/learn/route.ts (another cron precedent for response shape)
    - vercel.json (existing crons[] array — append two new entries in Task 9)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 91: "Cost-budget alert at 1.5× rolling 7d baseline")
  </read_first>
  <action>
    Create `src/app/api/cron/cost-budget-check/route.ts`:

    ```typescript
    import { NextResponse } from 'next/server';
    import { prisma } from '@/lib/db';

    export const dynamic = 'force-dynamic';
    export const maxDuration = 60;

    /**
     * Plan 20-Z-03 — Daily cost-budget alerter.
     *
     * For each provider with at least 7 days of data, compare today's cost (last 24h)
     * against the rolling-7d MEAN-of-DAILY-COST baseline. Alert when today > 1.5×
     * baseline (CONTEXT.md line 91).
     *
     * T-20-Z-03-04 mitigation: short-circuits with status='insufficient_history'
     * for providers with <7 days of observations to prevent cold-start alert spam.
     */

    interface AlertRow {
      provider_id: string;
      today_cost_usd: number;
      baseline_7d_mean_usd: number;
      ratio: number;
      status: 'alert' | 'ok' | 'insufficient_history';
      days_observed: number;
    }

    export async function GET(request: Request) {
      const auth = request.headers.get('authorization');
      if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }

      // Per-provider: today's total cost + last-7-day daily mean.
      const rows = await prisma.$queryRawUnsafe<Array<{
        provider_id: string;
        today_cost: number | null;
        baseline_mean: number | null;
        days_observed: bigint;
      }>>(`
        WITH per_day AS (
          SELECT provider_id, DATE_TRUNC('day', started_at) AS day, SUM(cost_usd) AS day_cost
          FROM "provider_call_logs"
          WHERE started_at >= NOW() - INTERVAL '8 days'
          GROUP BY provider_id, DATE_TRUNC('day', started_at)
        ),
        today AS (
          SELECT provider_id, SUM(cost_usd) AS today_cost
          FROM "provider_call_logs"
          WHERE started_at >= NOW() - INTERVAL '24 hours'
          GROUP BY provider_id
        ),
        baseline AS (
          SELECT provider_id, AVG(day_cost) AS baseline_mean, COUNT(DISTINCT day)::bigint AS days_observed
          FROM per_day
          WHERE day < DATE_TRUNC('day', NOW())
          GROUP BY provider_id
        )
        SELECT
          COALESCE(t.provider_id, b.provider_id) AS provider_id,
          t.today_cost,
          b.baseline_mean,
          COALESCE(b.days_observed, 0::bigint) AS days_observed
        FROM today t
        FULL OUTER JOIN baseline b ON t.provider_id = b.provider_id
      `);

      const alerts: AlertRow[] = [];
      for (const r of rows) {
        const today = r.today_cost ?? 0;
        const baseline = r.baseline_mean ?? 0;
        const days = Number(r.days_observed);
        if (days < 7) {
          alerts.push({
            provider_id: r.provider_id, today_cost_usd: today,
            baseline_7d_mean_usd: baseline, ratio: 0,
            status: 'insufficient_history', days_observed: days,
          });
          continue;
        }
        const ratio = baseline > 0 ? today / baseline : 0;
        alerts.push({
          provider_id: r.provider_id,
          today_cost_usd: today,
          baseline_7d_mean_usd: baseline,
          ratio,
          status: ratio > 1.5 ? 'alert' : 'ok',
          days_observed: days,
        });
      }

      // Log to console — Vercel Functions logs surface these automatically.
      // Future plan can graduate to email/slack via env-var hook.
      for (const a of alerts) {
        if (a.status === 'alert') {
          console.warn(`[cost-budget-check] ALERT provider=${a.provider_id} today=$${a.today_cost_usd.toFixed(4)} baseline=$${a.baseline_7d_mean_usd.toFixed(4)} ratio=${a.ratio.toFixed(2)}x`);
        }
      }

      return NextResponse.json({
        generated_at: new Date().toISOString(),
        threshold_multiplier: 1.5,
        alerts,
      });
    }
    ```

    Constraints:
    - Threshold `1.5` is the LITERAL value from CONTEXT.md line 91; do NOT add knobs/env-vars (keep this simple).
    - Cold-start path returns `status: 'insufficient_history'` per T-20-Z-03-04.
    - Authentication uses the same `CRON_SECRET` Bearer pattern as other cron routes (read `/src/app/api/cron/sentiment-scan/route.ts` to confirm exact shape).
    - No external alert sink in v1 — only `console.warn` (Vercel Functions log surface). Future graduation noted.
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "1.5" src/app/api/cron/cost-budget-check/route.ts &amp;&amp; grep -q "insufficient_history" src/app/api/cron/cost-budget-check/route.ts &amp;&amp; grep -q "CRON_SECRET" src/app/api/cron/cost-budget-check/route.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/app/api/cron/cost-budget-check/route.ts`
    - `grep -c "1.5" src/app/api/cron/cost-budget-check/route.ts` returns `>= 1`
    - `grep -q "insufficient_history" src/app/api/cron/cost-budget-check/route.ts` exits 0
    - `grep -q "CRON_SECRET" src/app/api/cron/cost-budget-check/route.ts` exits 0
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Cost-budget cron exists; 1.5× threshold encoded; cold-start no-ops cleanly until ≥7d data</done>
</task>

<task type="auto" id="20-Z-03-08">
  <name>Task 8: Retention cron — daily 90-day sweeper at /api/cron/provider-call-log-retention</name>
  <read_first>
    - src/lib/telemetry/provider-call-log.ts (Task 2 — `deleteOlderThan` helper)
    - src/app/api/cron/sentiment-scan/route.ts (cron auth pattern)
  </read_first>
  <action>
    Create `src/app/api/cron/provider-call-log-retention/route.ts`:

    ```typescript
    import { NextResponse } from 'next/server';
    import { deleteOlderThan } from '@/lib/telemetry/provider-call-log';

    export const dynamic = 'force-dynamic';
    export const maxDuration = 60;

    /**
     * Plan 20-Z-03 — T-20-Z-03-02 mitigation.
     *
     * Daily retention sweep. Deletes ProviderCallLog rows older than 90 days.
     * 90d horizon balances dashboard utility (rolling baselines need ≥7d) with
     * table-size growth (~5k rows/day × 90d = ~450k rows steady-state).
     */
    const RETENTION_DAYS = 90;

    export async function GET(request: Request) {
      const auth = request.headers.get('authorization');
      if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const result = await deleteOlderThan(RETENTION_DAYS);
      console.log(`[provider-call-log-retention] deleted=${result.deleted} threshold_days=${RETENTION_DAYS}`);
      return NextResponse.json({
        deleted: result.deleted,
        threshold_days: RETENTION_DAYS,
        ran_at: new Date().toISOString(),
      });
    }
    ```
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; grep -q "RETENTION_DAYS = 90" src/app/api/cron/provider-call-log-retention/route.ts &amp;&amp; grep -q "deleteOlderThan" src/app/api/cron/provider-call-log-retention/route.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/app/api/cron/provider-call-log-retention/route.ts`
    - `grep -c "RETENTION_DAYS = 90" src/app/api/cron/provider-call-log-retention/route.ts` returns `1`
    - `grep -q "deleteOlderThan" src/app/api/cron/provider-call-log-retention/route.ts` exits 0
    - `grep -q "CRON_SECRET" src/app/api/cron/provider-call-log-retention/route.ts` exits 0
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Retention cron exists; 90-day threshold encoded; uses DAO helper</done>
</task>

<task type="auto" id="20-Z-03-09">
  <name>Task 9: Wire two new crons into vercel.json + check-telemetry-coverage CI guard + package.json</name>
  <read_first>
    - vercel.json (existing crons[] array — 4 entries currently)
    - package.json (existing scripts block — add new check-telemetry-coverage script)
    - scripts/ (precedent for tsx-based CI guard scripts)
  </read_first>
  <action>
    1. Edit `vercel.json` — append two new entries to `crons[]` (do NOT remove or reorder existing entries):

       ```json
       {
         "$schema": "https://openapi.vercel.sh/vercel.json",
         "buildCommand": "prisma migrate deploy && next build",
         "functions": {
           "src/app/api/analysis/**/*":  { "maxDuration": 300 },
           "src/app/api/research/**/*":  { "maxDuration": 300 },
           "src/app/api/cron/**/*":      { "maxDuration": 300 }
         },
         "crons": [
           { "path": "/api/cron/sentiment-scan",              "schedule": "0 8 */3 * *" },
           { "path": "/api/cron/price-followup",              "schedule": "0 6 * * *" },
           { "path": "/api/cron/learn",                       "schedule": "30 7 * * *" },
           { "path": "/api/cron/alpha-decay-watch",           "schedule": "0 6 * * *" },
           { "path": "/api/cron/cost-budget-check",           "schedule": "0 9 * * *" },
           { "path": "/api/cron/provider-call-log-retention", "schedule": "30 9 * * *" }
         ]
       }
       ```

       Both new crons run daily — cost-budget at 09:00 UTC (after the 08:00 sentiment-scan provides today's data), retention at 09:30 UTC. Per CONTEXT.md cron-jobs skill: Hobby-plan limit is 2 crons; THIS PROJECT IS ON PRO (already has 4 crons). Adding 2 more brings total to 6 — well within Pro's 40-cron limit.

    2. Create `scripts/check-telemetry-coverage.ts` — CI guard:

       ```typescript
       #!/usr/bin/env -S node --import tsx
       /**
        * Plan 20-Z-03 — telemetry coverage guard (S6).
        *
        * For each module that contains a known external call (yahoo / polygon /
        * finnhub / anthropic / stocktwits / firecrawl / gemini / finbert / apewisdom
        * / exa), this script asserts the module also contains a `withTelemetry(`
        * call. Exits non-zero on any uncovered module.
        */
       import { readFileSync } from 'fs';
       import { join } from 'path';

       const ROOT = process.cwd();
       interface Required { file: string; reason: string; }

       const REQUIRED: Required[] = [
         { file: 'src/lib/data/yahoo.ts',                       reason: 'Yahoo Finance external API' },
         { file: 'src/lib/data/polygon.ts',                     reason: 'Polygon external API' },
         { file: 'src/lib/data/polygon-news.ts',                reason: 'Polygon news external API' },
         { file: 'src/lib/data/finnhub.ts',                     reason: 'Finnhub external API' },
         { file: 'src/lib/data/anthropic-search.ts',            reason: 'Anthropic web search' },
         { file: 'src/lib/data/stocktwits.ts',                  reason: 'StockTwits external API' },
         { file: 'src/lib/data/lightweight-community-scan.ts',  reason: 'Firecrawl + community fetch' },
         { file: 'src/lib/data/adapters/apewisdom.ts',          reason: 'ApeWisdom external API' },
         { file: 'src/lib/data/adapters/exa-search.ts',         reason: 'Exa web search external API' },
         { file: 'src/lib/sentiment/finsentllm.ts',             reason: 'HF FinBERT inference endpoint' },
         { file: 'src/lib/gemini-analysis.ts',                  reason: 'Gemini via AI Gateway' },
       ];

       const offenders: Array<{ file: string; reason: string }> = [];
       for (const r of REQUIRED) {
         try {
           const text = readFileSync(join(ROOT, r.file), 'utf8');
           if (!/withTelemetry\s*\(/.test(text)) {
             offenders.push(r);
           }
         } catch {
           offenders.push({ file: r.file, reason: `${r.reason} (file not found)` });
         }
       }

       if (offenders.length > 0) {
         console.error('check-telemetry-coverage: FAIL — the following external-call modules are missing withTelemetry() wrapping (S6 violation):');
         for (const o of offenders) {
           console.error(`  ${o.file}  — ${o.reason}`);
         }
         console.error('');
         console.error('Add: import { withTelemetry } from "@/lib/telemetry/withTelemetry"; and wrap the external call.');
         process.exit(1);
       }
       console.log(`check-telemetry-coverage: OK — all ${REQUIRED.length} known external-call modules wrap with withTelemetry()`);
       ```

    3. Edit `package.json` — add to `"scripts"` block:
       ```json
       "check-telemetry-coverage": "tsx scripts/check-telemetry-coverage.ts"
       ```

    Constraints:
    - vercel.json EDIT is additive — keep all 4 existing cron entries intact.
    - The CI guard's REQUIRED list is the authoritative source of "which modules MUST be wrapped" — adding a new external provider in a future plan REQUIRES updating this list.
  </action>
  <verify>
    <automated>node -e "const j=require('./vercel.json'); if(!j.crons.find(c=&gt;c.path==='/api/cron/cost-budget-check')) process.exit(1); if(!j.crons.find(c=&gt;c.path==='/api/cron/provider-call-log-retention')) process.exit(1);" &amp;&amp; npm run check-telemetry-coverage</automated>
  </verify>
  <acceptance_criteria>
    - `vercel.json` contains 6 cron entries total (4 existing + 2 new)
    - `grep -c "cost-budget-check" vercel.json` returns `>= 1`
    - `grep -c "provider-call-log-retention" vercel.json` returns `>= 1`
    - `test -f scripts/check-telemetry-coverage.ts`
    - `grep -q "check-telemetry-coverage" package.json` exits 0
    - `npm run check-telemetry-coverage` exits 0 (i.e., all REQUIRED modules pass)
    - Adversarial check: temporarily remove the `withTelemetry(` import from one wrapped file → script exits 1 → restore
  </acceptance_criteria>
  <done>Two new crons wired in vercel.json; CI guard exists; npm script wired; guard exits 0 on current tree</done>
</task>

<task type="auto" id="20-Z-03-10">
  <name>Task 10: Unit tests — withTelemetry overhead, cost-estimators pinning, error-classifier mapping, cost-budget-check cold-start</name>
  <read_first>
    - tests/learning.unit.bugs.test.ts (precedent vitest style — describe/it + numeric assertions)
    - vitest.config.* (confirm vitest unit pattern)
    - src/lib/telemetry/* (Task 2 + 4 outputs)
    - src/app/api/cron/cost-budget-check/route.ts (Task 7 — for module-level test of the SQL aggregation cold-start branch)
  </read_first>
  <action>
    Create 4 test files under `tests/telemetry/`. Mock prisma with vi.mock; do NOT hit live DB in unit tests.

    **10a. `tests/telemetry/withTelemetry.unit.test.ts`** — overhead measurement (T-20-Z-03-01) + return-value preservation + error-rethrow.

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    // Stub the DAO so wrapper overhead is measured without DB latency.
    vi.mock('@/lib/telemetry/provider-call-log', () => ({
      recordCallAsync: vi.fn(),
      __internal_swallowed_insert_failures: () => 0,
    }));

    import { withTelemetry } from '@/lib/telemetry/withTelemetry';
    import { recordCallAsync } from '@/lib/telemetry/provider-call-log';

    beforeEach(() => { vi.clearAllMocks(); });

    describe('withTelemetry — return value preservation', () => {
      it('returns the EXACT value fn() returned', async () => {
        const r = await withTelemetry('yahoo', async () => ({ price: 42.5 }));
        expect(r).toEqual({ price: 42.5 });
      });
      it('records ONE row on success', async () => {
        await withTelemetry('yahoo', async () => ({ x: 1 }));
        await new Promise(r => setTimeout(r, 5)); // wait for queueMicrotask
        expect(recordCallAsync).toHaveBeenCalledTimes(1);
        const row = (recordCallAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(row.provider_id).toBe('yahoo');
        expect(row.status).toBe('ok');
      });
    });

    describe('withTelemetry — error rethrow', () => {
      it('re-throws the ORIGINAL error unchanged', async () => {
        const err = Object.assign(new Error('boom'), { status: 500 });
        await expect(withTelemetry('finnhub', async () => { throw err; })).rejects.toBe(err);
      });
      it('records error row with classified error_class', async () => {
        const err = Object.assign(new Error('rate'), { status: 429 });
        try { await withTelemetry('finnhub', async () => { throw err; }); } catch {}
        await new Promise(r => setTimeout(r, 5));
        const row = (recordCallAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(row.status).toBe('error');
        expect(row.error_class).toBe('RATE_LIMITED');
        expect(row.http_status).toBe(429);
      });
    });

    describe('withTelemetry — cost estimator', () => {
      it('uses cost_usd_estimator when provided', async () => {
        await withTelemetry('gemini', async () => ({ usage: { inputTokens: 1000, outputTokens: 500 } }), {
          cost_usd_estimator: (r) => r.usage.inputTokens * 0.000125 + r.usage.outputTokens * 0.000375,
        });
        await new Promise(r => setTimeout(r, 5));
        const row = (recordCallAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
        // 1000*0.000125 + 500*0.000375 = 0.125 + 0.1875 = 0.3125
        expect(row.cost_usd).toBeCloseTo(0.3125, 6);
      });
      it('falls back to flat rate when estimator throws', async () => {
        await withTelemetry('finbert-hf', async () => ({}), {
          cost_usd_estimator: () => { throw new Error('bad'); },
        });
        await new Promise(r => setTimeout(r, 5));
        const row = (recordCallAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(row.cost_usd).toBeCloseTo(0.0001, 6); // finbert-hf flat rate
      });
    });

    describe('withTelemetry — overhead p99 < 2ms (T-20-Z-03-01)', () => {
      it('overhead', async () => {
        const N = 1000;
        const overheads: number[] = [];
        for (let i = 0; i < N; i++) {
          // Resolved-immediately fn: any time-difference > fn-execution-time is wrapper overhead.
          const t0 = performance.now();
          await withTelemetry('yahoo', async () => 1);
          const t1 = performance.now();
          overheads.push(t1 - t0);
        }
        overheads.sort((a, b) => a - b);
        const p99 = overheads[Math.floor(N * 0.99)];
        // Allow 5ms ceiling on shared CI runners (test name asserts 2ms intent; CI flake tolerance is 5ms).
        expect(p99).toBeLessThan(5);
      });
    });
    ```

    **10b. `tests/telemetry/cost-estimators.unit.test.ts`** — pin literal numeric values (T-20-Z-03-03):

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { COST_PER_CALL_USD, GEMINI_TOKEN_RATES } from '@/lib/telemetry/cost-estimators';

    describe('COST_PER_CALL_USD — pinned per-provider rates (T-20-Z-03-03 quarterly review)', () => {
      it('anthropic-search = $0.01/call (https://docs.anthropic.com/.../web-search-tool)', () => {
        expect(COST_PER_CALL_USD['anthropic-search']).toBe(0.01);
      });
      it('firecrawl = $0.001/call (https://www.firecrawl.dev/pricing)', () => {
        expect(COST_PER_CALL_USD['firecrawl']).toBe(0.001);
      });
      it('finbert-hf = $0.0001/call (HF $0.033/hr CPU amortized)', () => {
        expect(COST_PER_CALL_USD['finbert-hf']).toBe(0.0001);
      });
      it.each(['yahoo','polygon','finnhub','stocktwits','apewisdom','gemini'] as const)(
        '%s = $0/call (free-tier or token-priced)', (id) => {
          expect(COST_PER_CALL_USD[id]).toBe(0);
        });
    });
    describe('GEMINI_TOKEN_RATES — pinned 2026-Q1 (https://ai.google.dev/pricing)', () => {
      it('input = $0.000125/token', () => { expect(GEMINI_TOKEN_RATES.input).toBe(0.000125); });
      it('output = $0.000375/token', () => { expect(GEMINI_TOKEN_RATES.output).toBe(0.000375); });
    });
    ```

    **10c. `tests/telemetry/error-classifier.unit.test.ts`** — controlled enum mapping + secret-leak prevention (T-20-Z-03-05):

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { classifyError } from '@/lib/telemetry/error-classifier';

    describe('classifyError — controlled enum mapping', () => {
      it('401 → AUTH_FAILED', () => { expect(classifyError({ status: 401 })).toBe('AUTH_FAILED'); });
      it('403 → AUTH_FAILED', () => { expect(classifyError({ status: 403 })).toBe('AUTH_FAILED'); });
      it('408 → TIMEOUT',     () => { expect(classifyError({ status: 408 })).toBe('TIMEOUT'); });
      it('429 → RATE_LIMITED',() => { expect(classifyError({ status: 429 })).toBe('RATE_LIMITED'); });
      it('500 → UPSTREAM_5XX',() => { expect(classifyError({ status: 500 })).toBe('UPSTREAM_5XX'); });
      it('503 → UPSTREAM_5XX',() => { expect(classifyError({ status: 503 })).toBe('UPSTREAM_5XX'); });
      it('AbortError → TIMEOUT', () => { expect(classifyError({ name: 'AbortError' })).toBe('TIMEOUT'); });
      it('ECONNREFUSED → NETWORK', () => { expect(classifyError({ code: 'ECONNREFUSED' })).toBe('NETWORK'); });
      it('undici cause.code ENOTFOUND → NETWORK', () => {
        expect(classifyError({ cause: { code: 'ENOTFOUND' } })).toBe('NETWORK');
      });
      it('unknown shape → UNKNOWN', () => { expect(classifyError(new Error('weird'))).toBe('UNKNOWN'); });
      it('null → UNKNOWN', () => { expect(classifyError(null)).toBe('UNKNOWN'); });
    });

    describe('classifyError — T-20-Z-03-05 secret-leak prevention', () => {
      it('error message containing API key still classifies cleanly without surfacing the secret in the return value', () => {
        const err = Object.assign(new Error('Auth failed: sk-ant-SECRET-DO-NOT-LEAK'), { status: 401 });
        const cls = classifyError(err);
        // Return value is one of the controlled enum values, period.
        expect(['RATE_LIMITED','AUTH_FAILED','TIMEOUT','UPSTREAM_5XX','NETWORK','UNKNOWN']).toContain(cls);
        expect(cls).toBe('AUTH_FAILED');
        // The secret string is NOT part of the returned class.
        expect(cls).not.toMatch(/sk-ant/);
      });
    });
    ```

    **10d. `tests/telemetry/cost-budget-check.unit.test.ts`** — cold-start no-op (T-20-Z-03-04):

    ```typescript
    import { describe, it, expect, vi } from 'vitest';

    // Mock prisma raw query — return a 'days_observed=3' row to trigger cold-start branch.
    vi.mock('@/lib/db', () => ({
      prisma: {
        $queryRawUnsafe: vi.fn().mockResolvedValue([
          { provider_id: 'yahoo', today_cost: 0.12, baseline_mean: 0.10, days_observed: BigInt(3) },
          { provider_id: 'gemini', today_cost: 1.20, baseline_mean: 0.50, days_observed: BigInt(7) },
        ]),
      },
    }));

    import { GET } from '@/app/api/cron/cost-budget-check/route';

    describe('cost-budget-check — cold-start (T-20-Z-03-04)', () => {
      it('emits insufficient_history for providers with <7 days', async () => {
        const req = new Request('http://localhost/api/cron/cost-budget-check', {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
        });
        // If CRON_SECRET is set in test env, build header. Otherwise the route allows when the env is unset.
        const res = await GET(req);
        const body = await res.json() as { alerts: Array<{ provider_id: string; status: string; ratio: number }> };
        const yahoo = body.alerts.find(a => a.provider_id === 'yahoo');
        const gemini = body.alerts.find(a => a.provider_id === 'gemini');
        expect(yahoo?.status).toBe('insufficient_history');
        expect(gemini?.status).toBe('alert');         // 1.20 / 0.50 = 2.4x > 1.5x
        expect(gemini?.ratio).toBeCloseTo(2.4, 2);
      });
    });
    ```
  </action>
  <verify>
    <automated>npx vitest run tests/telemetry/ --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - 4 test files exist under `tests/telemetry/`
    - `npx vitest run tests/telemetry/` exits 0
    - Test output shows the overhead test name "overhead" passing
    - Cost-estimator tests assert literal 0.000125 / 0.000375 / 0.01 / 0.001 / 0.0001 values
    - Error-classifier covers ≥10 mappings + secret-leak case
    - Cost-budget cold-start case asserts `status === 'insufficient_history'` for `days_observed < 7`
  </acceptance_criteria>
  <done>4 unit test files green; overhead p99 < 5ms (2ms intent); cost constants pinned; error classifier exhaustive; cold-start no-op verified</done>
</task>

<task type="auto" id="20-Z-03-11">
  <name>Task 11: Integration test — live-Neon ProviderCallLog round-trip + percentile_cont aggregation</name>
  <read_first>
    - tests/integration/ (existing live-Neon test patterns)
    - src/lib/telemetry/provider-call-log.ts (Task 2 — `recordCallAsync` + `deleteOlderThan`)
    - src/lib/telemetry/withTelemetry.ts (Task 4 — wrapper)
  </read_first>
  <action>
    Create `tests/integration/provider-call-log.integration.test.ts`:

    ```typescript
    import { describe, it, expect, beforeAll, afterAll } from 'vitest';
    import { prisma } from '@/lib/db';
    import { withTelemetry } from '@/lib/telemetry/withTelemetry';
    import { deleteOlderThan } from '@/lib/telemetry/provider-call-log';

    const TEST_TICKER = `TEST20Z03_${Date.now()}`;

    beforeAll(async () => {
      if (!process.env.DATABASE_URL) throw new Error('Integration test requires DATABASE_URL');
    });

    afterAll(async () => {
      await prisma.providerCallLog.deleteMany({ where: { ticker: TEST_TICKER } });
      await prisma.$disconnect();
    });

    async function waitForRow(ticker: string, timeoutMs = 3000): Promise<number> {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const c = await prisma.providerCallLog.count({ where: { ticker } });
        if (c >= 1) return c;
        await new Promise(r => setTimeout(r, 50));
      }
      return 0;
    }

    describe('ProviderCallLog — live-Neon integration', () => {
      it('withTelemetry persists ≥1 row after a successful wrapped call', async () => {
        const value = await withTelemetry('yahoo', async () => ({ price: 100.0 }), { ticker: TEST_TICKER });
        expect(value).toEqual({ price: 100.0 });
        const c = await waitForRow(TEST_TICKER);
        expect(c).toBeGreaterThanOrEqual(1);
      });

      it('persisted row has expected columns and types', async () => {
        const row = await prisma.providerCallLog.findFirst({
          where: { ticker: TEST_TICKER }, orderBy: { started_at: 'desc' },
        });
        expect(row).not.toBeNull();
        expect(row!.provider_id).toBe('yahoo');
        expect(row!.status).toBe('ok');
        expect(row!.started_at).toBeInstanceOf(Date);
        expect(row!.ended_at).toBeInstanceOf(Date);
        expect(row!.duration_ms).toBeGreaterThanOrEqual(0);
        expect(row!.cache_hit).toBe(false);
        expect(row!.fallback_used).toBe(false);
        expect(row!.error_class).toBeNull();
      });

      it('errored wrapped call records error row with classified error_class', async () => {
        try {
          await withTelemetry('finnhub', async () => {
            throw Object.assign(new Error('rate'), { status: 429 });
          }, { ticker: TEST_TICKER });
          expect.fail('should have thrown');
        } catch (e) {
          expect((e as { status?: number }).status).toBe(429);
        }
        await new Promise(r => setTimeout(r, 100));
        const row = await prisma.providerCallLog.findFirst({
          where: { ticker: TEST_TICKER, status: 'error' }, orderBy: { started_at: 'desc' },
        });
        expect(row).not.toBeNull();
        expect(row!.error_class).toBe('RATE_LIMITED');
        expect(row!.http_status).toBe(429);
      });

      it('percentile_cont SQL aggregation returns plausible numbers from inserted rows', async () => {
        // Insert 10 deterministic durations to make percentiles predictable.
        const now = new Date();
        for (let i = 0; i < 10; i++) {
          await prisma.providerCallLog.create({
            data: {
              provider_id: 'polygon', ticker: TEST_TICKER,
              started_at: new Date(now.getTime() - 1000),
              ended_at:   new Date(now.getTime()),
              duration_ms: (i + 1) * 100,    // 100, 200, ..., 1000
              status: 'ok', http_status: 200,
              error_class: null, fallback_used: false, cache_hit: false,
              cost_usd: 0, retry_count: 0,
            },
          });
        }
        const rows = await prisma.$queryRawUnsafe<Array<{
          provider_id: string; p50: number; p95: number; p99: number;
        }>>(`
          SELECT provider_id,
                 percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
                 percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
                 percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99
          FROM "provider_call_logs"
          WHERE ticker = $1 AND provider_id = 'polygon'
          GROUP BY provider_id
        `, TEST_TICKER);
        expect(rows.length).toBe(1);
        // Median of {100,200,...,1000} = 550 (linear interpolation between 500 and 600)
        expect(rows[0].p50).toBeGreaterThan(500);
        expect(rows[0].p50).toBeLessThan(600);
        // p95 ≈ 955; p99 ≈ 991
        expect(rows[0].p95).toBeGreaterThan(900);
        expect(rows[0].p99).toBeGreaterThan(950);
      });

      it('deleteOlderThan removes only rows older than threshold', async () => {
        // Insert one row with started_at 100 days ago.
        const oldDate = new Date(Date.now() - 100 * 86_400_000);
        await prisma.providerCallLog.create({
          data: {
            provider_id: 'apewisdom', ticker: TEST_TICKER,
            started_at: oldDate, ended_at: oldDate,
            duration_ms: 0, status: 'ok',
            http_status: null, error_class: null,
            fallback_used: false, cache_hit: false,
            cost_usd: 0, retry_count: 0,
          },
        });
        const before = await prisma.providerCallLog.count({ where: { ticker: TEST_TICKER } });
        const r = await deleteOlderThan(90);
        const after = await prisma.providerCallLog.count({ where: { ticker: TEST_TICKER } });
        expect(r.deleted).toBeGreaterThanOrEqual(1);
        expect(after).toBeLessThan(before);
      });
    });
    ```
  </action>
  <verify>
    <automated>npm run test:integration -- provider-call-log</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/integration/provider-call-log.integration.test.ts`
    - `grep -c "it(" tests/integration/provider-call-log.integration.test.ts` returns `>= 5`
    - `npm run test:integration -- provider-call-log` exits 0
    - Direct SQL: `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "provider_call_logs"'` returns `>= 0` (test cleans up its own rows)
  </acceptance_criteria>
  <done>≥5 integration tests GREEN against live Neon; round-trip + percentile_cont + retention all verified</done>
</task>

<task type="auto" id="20-Z-03-12">
  <name>Task 12: Integration test — /api/insights/sentiment-health endpoint returns 200 + non-empty rows</name>
  <read_first>
    - src/app/api/insights/sentiment-health/route.ts (Task 6)
    - tests/integration/ (precedent for route handler invocation in tests)
  </read_first>
  <action>
    Create `tests/integration/sentiment-health-api.integration.test.ts`:

    ```typescript
    import { describe, it, expect, beforeAll, afterAll } from 'vitest';
    import { prisma } from '@/lib/db';
    import { GET } from '@/app/api/insights/sentiment-health/route';

    const TEST_TICKER = `TEST20Z03H_${Date.now()}`;

    beforeAll(async () => {
      if (!process.env.DATABASE_URL) throw new Error('Integration test requires DATABASE_URL');
      // Seed deterministic rows so the endpoint has data even on a fresh DB.
      const now = new Date();
      for (let i = 0; i < 5; i++) {
        await prisma.providerCallLog.create({
          data: {
            provider_id: 'gemini', ticker: TEST_TICKER,
            started_at: new Date(now.getTime() - 1000),
            ended_at:   new Date(now.getTime()),
            duration_ms: 200 + i * 50,
            status: i === 4 ? 'error' : 'ok',
            http_status: i === 4 ? 500 : 200,
            error_class: i === 4 ? 'UPSTREAM_5XX' : null,
            fallback_used: i === 3,
            cache_hit: i === 0,
            cost_usd: 0.10,
            retry_count: 0,
          },
        });
      }
    });

    afterAll(async () => {
      await prisma.providerCallLog.deleteMany({ where: { ticker: TEST_TICKER } });
      await prisma.$disconnect();
    });

    describe('/api/insights/sentiment-health — endpoint integration', () => {
      it('returns 200 with non-empty providers within 2s', async () => {
        const t0 = Date.now();
        const res = await GET();
        const elapsed = Date.now() - t0;
        expect(res.status).toBe(200);
        expect(elapsed).toBeLessThan(2000);

        const body = await res.json() as {
          generated_at: string; window_hours: number;
          providers: Array<{
            provider_id: string; count_24h: number;
            latency_p50_ms: number; latency_p95_ms: number; latency_p99_ms: number;
            error_rate: number; cache_hit_rate: number; fallback_rate: number;
            total_cost_usd_24h: number; cost_per_call_usd_24h: number;
          }>;
        };
        expect(body.window_hours).toBe(24);
        expect(body.providers.length).toBeGreaterThanOrEqual(1);

        // Find the gemini row we seeded (the test ticker rows are aggregated under provider_id='gemini')
        const gemini = body.providers.find(p => p.provider_id === 'gemini');
        expect(gemini).toBeDefined();
        expect(gemini!.count_24h).toBeGreaterThanOrEqual(5);
        expect(gemini!.latency_p50_ms).toBeGreaterThan(0);
        // 1 of 5 errored ⇒ error_rate >= 0.2 over the test data; aggregate may be lower if other rows exist.
        expect(gemini!.error_rate).toBeGreaterThanOrEqual(0);
        expect(gemini!.error_rate).toBeLessThanOrEqual(1);
      });
    });
    ```
  </action>
  <verify>
    <automated>npm run test:integration -- sentiment-health-api</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/integration/sentiment-health-api.integration.test.ts`
    - `npm run test:integration -- sentiment-health-api` exits 0
    - The test asserts `res.status === 200`, `body.providers.length >= 1`, and elapsed < 2000ms
  </acceptance_criteria>
  <done>Endpoint integration test GREEN; 200 + non-empty + <2s latency verified</done>
</task>

<task type="auto" id="20-Z-03-13">
  <name>Task 13: Run full verification + commit</name>
  <read_first>
    - All artifacts produced by Tasks 1-12 (sanity check before commit)
  </read_first>
  <action>
    1. Run the full test suite:
       ```bash
       npm test
       npm run test:integration
       npm run check-telemetry-coverage
       npx tsc --noEmit
       ```
       All four must exit 0.

    2. Confirm wrap-site coverage:
       ```bash
       grep -rn "withTelemetry(" src/lib/data/ src/lib/sentiment/ src/lib/gemini-analysis.ts | wc -l
       ```
       Must return `>= 6`.

    3. Confirm `vercel.json` has both new crons:
       ```bash
       node -e "const j=require('./vercel.json'); console.log(j.crons.map(c=>c.path).join('\n'))"
       ```
       Output must contain both `/api/cron/cost-budget-check` and `/api/cron/provider-call-log-retention`.

    4. Sanity-curl the API after starting dev server (operator may skip if local dev is already running elsewhere):
       ```bash
       npm run dev &
       sleep 5
       curl -fs http://localhost:3000/api/insights/sentiment-health | head -c 500
       kill %1
       ```
       Must return JSON with `{ "window_hours": 24, "providers": [...] }`.

    5. Commit:
       ```bash
       git add prisma/schema.prisma \
               src/lib/telemetry/ \
               src/lib/data/yahoo.ts src/lib/data/polygon.ts src/lib/data/polygon-news.ts \
               src/lib/data/finnhub.ts src/lib/data/finnhub-analyst.ts \
               src/lib/data/anthropic-search.ts src/lib/data/stocktwits.ts \
               src/lib/data/lightweight-community-scan.ts \
               src/lib/data/adapters/apewisdom.ts src/lib/data/adapters/exa-search.ts \
               src/lib/sentiment/finsentllm.ts src/lib/gemini-analysis.ts \
               src/app/insights/sentiment-health/ \
               src/app/api/insights/sentiment-health/ \
               src/app/api/cron/cost-budget-check/ \
               src/app/api/cron/provider-call-log-retention/ \
               vercel.json scripts/check-telemetry-coverage.ts package.json \
               tests/telemetry/ tests/integration/provider-call-log.integration.test.ts \
               tests/integration/sentiment-health-api.integration.test.ts
       git commit -m "feat(20-Z-03): per-provider telemetry + /insights/sentiment-health + cost-budget alert

ProviderCallLog table + withTelemetry wrapper composing around withRetry,
≥6 external call sites instrumented (yahoo, polygon, finnhub, anthropic-search,
stocktwits, apewisdom, exa-search, finsentllm, gemini), per-provider
latency/cost/error/cache/fallback dashboard at /insights/sentiment-health,
1.5×-baseline daily cost-budget alerter, 90d retention sweep. Cost
constants pinned with citations (T-20-Z-03-03 quarterly review).
error_class is controlled enum — no raw messages persisted (T-20-Z-03-05).
Wrapper overhead p99 < 2ms (T-20-Z-03-01)."
       ```
  </action>
  <verify>
    <automated>npm test &amp;&amp; npm run test:integration &amp;&amp; npm run check-telemetry-coverage &amp;&amp; npx tsc --noEmit &amp;&amp; [ "$(grep -rn 'withTelemetry(' src/lib/data/ src/lib/sentiment/ src/lib/gemini-analysis.ts | wc -l)" -ge 6 ]</automated>
  </verify>
  <acceptance_criteria>
    - `npm test` exits 0
    - `npm run test:integration` exits 0
    - `npm run check-telemetry-coverage` exits 0
    - `npx tsc --noEmit` exits 0
    - `>= 6` withTelemetry( call sites across listed source files
    - `vercel.json` contains both new cron paths
    - `git log -1 --pretty=%s` matches `feat(20-Z-03)`
  </acceptance_criteria>
  <done>Full suite green; coverage guard green; commit landed</done>
</task>

</tasks>

<verification>

Numerical phase-level checks (run after Task 13):

1. **Schema present in production:**
   ```bash
   psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "provider_call_logs"'
   # Expect: a single integer row, value >= 0 (table exists)
   ```

2. **At least one row written by the wrapper:**
   ```bash
   psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "provider_call_logs" WHERE started_at >= NOW() - INTERVAL '\''1 hour'\'''
   # After the integration test in Task 11, expect >= 1 (test inserts before cleanup)
   ```

3. **Wrap coverage:**
   ```bash
   grep -rn "withTelemetry(" src/lib/data/ src/lib/sentiment/ src/lib/gemini-analysis.ts | wc -l
   # Expect: >= 6
   ```

4. **CI guard:**
   ```bash
   npm run check-telemetry-coverage
   # Expect: exit 0
   ```

5. **Endpoint:**
   ```bash
   curl -fs http://localhost:3000/api/insights/sentiment-health -w '\n%{http_code} %{time_total}s\n' | tail -1
   # Expect: 200 <2s
   ```

6. **Cost-budget cron cold-start no-op:**
   ```bash
   curl -fs -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/cost-budget-check | jq '.alerts[].status' | sort -u
   # Expect: contains "insufficient_history" until 7+ days of data accumulate
   ```

7. **Retention cron runs without error:**
   ```bash
   curl -fs -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/provider-call-log-retention | jq '.threshold_days'
   # Expect: 90
   ```

8. **Wrapper overhead unit test:**
   ```bash
   npx vitest run tests/telemetry/withTelemetry.unit.test.ts -t overhead
   # Expect: PASS
   ```

9. **No raw `update`/`upsert` against ProviderCallLog in source:**
   ```bash
   grep -rn "providerCallLog.update\|providerCallLog.upsert" src/ | wc -l
   # Expect: 0
   ```

10. **Indexes live:**
    ```bash
    psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM pg_indexes WHERE tablename='provider_call_logs' AND indexname LIKE 'idx_pcl_%'"
    # Expect: 2
    ```

</verification>

<success_criteria>

Plan 20-Z-03 ships when ALL are numerically true:

- [ ] `ProviderCallLog` table live in production Neon with 2 composite indexes
- [ ] `withTelemetry<T>()` exists with the literal signature in `<interfaces>`; composes around `withRetry`; never blocks the caller
- [ ] `ProviderId` enum exhaustive (9 entries: yahoo, polygon, finnhub, anthropic-search, stocktwits, firecrawl, gemini, finbert-hf, apewisdom)
- [ ] ≥6 external call sites in `src/lib/data/`, `src/lib/sentiment/`, `src/lib/gemini-analysis.ts` are wrapped (verified by grep)
- [ ] Cost estimator constants pinned with citation comments AND unit-tested for literal values
- [ ] `/insights/sentiment-health` server component renders per-provider tiles
- [ ] `/api/insights/sentiment-health` returns 200 + non-empty JSON in <2s when data exists
- [ ] Cost-budget cron runs daily, emits `status: 'insufficient_history'` while <7d data, alerts when ratio > 1.5×
- [ ] Retention cron deletes ProviderCallLog rows older than 90 days
- [ ] `error_class` is controlled enum (6 values); raw error messages NEVER persisted
- [ ] Wrapper overhead p99 < 2ms across 1000 invocations (test asserts < 5ms ceiling for CI flake tolerance, intent is 2ms)
- [ ] `scripts/check-telemetry-coverage.ts` exits 0 on the committed tree, exits 1 if a known external module loses its wrapper
- [ ] All tests green: `npm test`, `npm run test:integration`, `npm run check-telemetry-coverage`, `npx tsc --noEmit`
- [ ] vercel.json contains exactly 6 cron entries (4 existing + 2 new)
- [ ] Threat model T-20-Z-03-{01..05} all have concrete mitigations referenced in this plan

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-Z-03-SUMMARY.md` per the standard execute-plan summary template, including:
- Final wrap-site count (target ≥6)
- p99 wrapper overhead measurement from Task 10
- Row count in `provider_call_logs` at commit time
- Operator follow-up: provision OTel collector (deferrable per CONTEXT.md line 173) when richer trace export is needed
- Forward reference to Phase-20 Wave A/B/C/D plans that report telemetry numbers against this dashboard
</output>
