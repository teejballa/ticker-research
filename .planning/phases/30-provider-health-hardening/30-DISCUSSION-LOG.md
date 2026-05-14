# Phase 30: Provider Health Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `30-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-14
**Phase:** 30-provider-health-hardening
**Areas discussed:** Yahoo IP rate-limit fix, Circuit breaker design, Fallback chain semantics, Gemini cost anomaly fix, Error budget alerting, Firecrawl repair vs replace, Done-gate measurement

---

## Yahoo IP Rate-Limit Fix

### Q1: Primary approach for Yahoo throttling?

| Option | Description | Selected |
|--------|-------------|----------|
| Demote Yahoo to fallback | Make Polygon primary, Finnhub secondary, Yahoo tertiary. Eliminates 90.7% error rate immediately via field-level merge ordering. | ✓ |
| Route Yahoo through Edge runtime | Move yahoo.ts calls into a non-iad1 Edge function. No evidence sfo1 IPs aren't also throttled. | |
| Third-party proxy (Bright Data) | Residential proxy. New $/month + dependency + ToS risk. | |
| Accept and rely on fallback | No code change; done-gate <10% fails. | |

**User's choice:** Demote Yahoo to fallback.
**Rationale:** Aligns with existing `merge.ts` field-level merge mechanism; minimal code change; eliminates the IP-wide throttle as the failure mode.

### Q2: Add aggressive caching on Yahoo paths?

| Option | Description | Selected |
|--------|-------------|----------|
| 60s Upstash cache TTL on quote | At most 60 calls/hour/ticker; aligns with Polygon caching pattern. | ✓ |
| 5min TTL | Cuts call volume but stale quotes may confuse the sentiment-scan cron. | |
| No cache — demotion alone is enough | Yahoo traffic drops ~95% naturally as a fallback. | |

**User's choice:** 60s Upstash cache.
**Rationale:** Defense in depth even after demotion; protects future paths where Yahoo IS the primary for non-overlapping fields.

---

## Circuit Breaker Design

### Q1: Breaker scope and state storage?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-provider, Upstash-shared | One key per provider_id. Survives lambda cold starts. ~1ms overhead. | ✓ |
| Per-provider, in-memory per-lambda | Module-level Map. Zero latency overhead, fragmented across lambdas. | |
| Per-(provider, ticker), Upstash-shared | Isolates bad tickers; high key cardinality. | |

**User's choice:** Per-provider Upstash-shared.
**Rationale:** Yahoo's throttle is IP-wide not ticker-specific; cross-lambda agreement matters more than zero overhead.

### Q2: Trip rule?

| Option | Description | Selected |
|--------|-------------|----------|
| Rolling error rate over N calls | Last 20 calls; >50% errors → trip. Tunable per-provider. | ✓ |
| N consecutive failures | 5 in a row → open. Simple but flaky under bursty traffic. | |
| Both (either trips) | Belt-and-suspenders. | |

**User's choice:** Rolling error rate over last 20 calls.

### Q3: Half-open recovery?

| Option | Description | Selected |
|--------|-------------|----------|
| 30s open → 1 probe → close on success | Classic Hystrix. | ✓ |
| 60s open → 3 probe calls in 10s | More tolerant; longer degraded window. | |
| Exponential reopen (30s → 60s → 120s, capped 600s) | Best for rolling outages; more state. | |

**User's choice:** 30s → 1 probe → close.

---

## Fallback Chain Semantics

### Q1: Visibility of mid-chain fallback to consumers?

| Option | Description | Selected |
|--------|-------------|----------|
| Track on SourcePackage + warn in /insights | `fallback_summary` field + Fallback heatmap tile. Reports stay clean. | ✓ |
| Silent — telemetry only | ProviderCallLog.fallback_used only. No surfacing. | |
| Bubble into report metadata | "Data quality" line on the report itself. Exposes plumbing to users. | |

**User's choice:** Track on SourcePackage + warn in /insights.
**Rationale:** Plumbing telemetry belongs on the operator dashboard, not in the user-facing report.

### Q2: All providers fail for one field — what state?

| Option | Description | Selected |
|--------|-------------|----------|
| null + FieldOrigin='unavailable' | Extend FieldOrigin union. Engine continues with partial data. | ✓ |
| Throw — invalidate the scan | Cleanest data but single flaky provider kills the cron. | |
| Synthesize from last good value | Risky for prices; stale data worse than nulls. | |

**User's choice:** null + FieldOrigin='unavailable'.

### Q3: All-providers-down on one ticker in a batch — cron behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip + log, continue batch | Matches existing "6 scanned / 13 skipped" pattern. Watchlist rotates. | ✓ |
| Skip + alert if >20% of batch skipped | Same + anomaly alert. | |
| Abort the cron run | Loud failure; blocks downstream learning entirely. | |

**User's choice:** Skip + log + continue.

---

## Gemini Cost Anomaly Fix

### Q1: How to pin model routing?

| Option | Description | Selected |
|--------|-------------|----------|
| Fork analysis tier (Pro) from triage tier (Flash) | Per-call-site explicit model. Pro only for the main analysis call. | ✓ |
| Hard-pin ALL calls to Flash | Cheapest; analysis quality risk. | |
| Force model header via AI Gateway | Less invasive; depends on Gateway honoring override. | |

**User's choice:** Fork tiers per call site.
**Rationale:** The reasoning-heavy analysis call legitimately benefits from Pro; everything else should be Flash. Per-site pins are the source-of-truth, not a gateway header.

### Q2: Cost-ceiling circuit breaker?

| Option | Description | Selected |
|--------|-------------|----------|
| Trip on cost_usd > $1 single call | Post-hoc check in withTelemetry; >3 in 1h → 1h breaker. | ✓ |
| Trip on rolling avg > expected band | 7-day moving window; more principled, more state. | |
| No — model pin is enough | Trust the pin. | |

**User's choice:** Single-call cost-ceiling breaker.
**Rationale:** Catches future config-drift regressions where the wrong model leaks in.

### Q3: How to verify end-to-end?

| Option | Description | Selected |
|--------|-------------|----------|
| ProviderCallLog cost band assertion in done-gate | AVG(cost_usd) over 24h < $0.50 SQL probe. | ✓ |
| Integration test asserting model id in response metadata | Live Gemini call in CI; ~$0.001/run. | |
| Both | Belt-and-suspenders. | |

**User's choice:** Done-gate SQL assertion.

---

## Error Budget Alerting

| Option | Description | Selected |
|--------|-------------|----------|
| Extend cost-budget-check cron pattern | New /api/cron/provider-error-budget + ProviderHealthAlert table. | ✓ |
| Console.error only (Vercel runtime logs) | No new state; operator-watch-the-logs. | |
| Webhook push (Slack/Discord) | Real alerting; SLACK_WEBHOOK_URL + idempotency + snooze. | |

**User's choice:** Extend cost-budget-check pattern + new alert table.

---

## Firecrawl Repair vs Replace

| Option | Description | Selected |
|--------|-------------|----------|
| Rotate key + audit usage, keep Firecrawl primary | Quickest path; escalate to migration if it dies again within a week. | ✓ |
| Migrate community-scan to Exa | Exa already wired into anthropic-search; bigger refactor. | |
| Keep Firecrawl but mark community-scan best-effort | SourcePackage omits community if Firecrawl fails. | |

**User's choice:** Rotate + keep + conditional escalation deferred.

---

## Done-Gate Measurement

| Option | Description | Selected |
|--------|-------------|----------|
| Rolling 24h per provider + cold-start guard | insufficient_history when total_calls < 50; single number per provider. | ✓ |
| 24h AND 7d (both must pass) | Catches slow degradation; more state. | |
| Per-(provider, error_class) breakdown | Richest diagnostic; gate becomes 6 numbers/provider. | |

**User's choice:** Rolling 24h with cold-start guard.

---

## Claude's Discretion

- Upstash key naming conventions (breaker, cost-anomaly counters, Yahoo cache)
- Yahoo fundamentals cache TTL (likely longer than quote)
- Initial counter ring window size (20 is the recommendation)
- Specific column types in the new `ProviderHealthAlert` Prisma model
- Whether to add an optional integration test asserting model id in Gemini response metadata
- Naming + location of `BreakerOpenError` class

## Deferred Ideas

- Slack / Discord / email alerting for health breaches
- Migration of community-scan from Firecrawl to Exa (conditional on key re-failure)
- Per-(provider, http_status) done-gate breakdown
- 7-day rolling error rate alongside 24h
- Cost-ceiling rolling-average alert
- Bright Data / residential proxy for Yahoo
- Edge-runtime regional routing for Yahoo
