---
status: partial
phase: 30-provider-health-hardening
source: [30-VERIFICATION.md]
started: 2026-05-14T16:00:00Z
updated: 2026-05-14T16:00:00Z
---

## Current Test

[awaiting prod traffic + operator gesture]

## Tests

### 1. Done-gate 1 — Per-provider error rate < 10% over rolling 24h
expected: After deploying Phase 30 to production and waiting ~24h, run `npm run provider-health-report` and confirm every provider EXCEPT `firecrawl` reports `pass` or `insufficient_history`. Firecrawl is EXPECTED to report `fail` until sub-phase 30.1 ships — that's the deferred Firecrawl migration, not a Phase-30 gap.
result: [pending]

### 2. Done-gate 2 — Gemini avg cost/call < $0.50 over rolling 24h
expected: Same CLI run as test 1. Gemini cost gate verdict should be `pass`. This validates D-14 (explicit `google/gemini-3-pro` pinning) and D-15 (cost-anomaly trip line at $1+/call). If `fail`, investigate which call sites are still routing to expensive models via AI-Gateway fuzzy routing.
result: [pending]

### 3. Done-gate 3 — Crons return HTTP 200 under single-provider outage
expected: Manually trip a provider's breaker via Upstash (`SET breaker:yahoo:state '{"state":"open","opened_at":<now>}' EX 60`), then trigger `/api/cron/sentiment-scan` and confirm HTTP 200 with `skipped_breaker_open > 0` in the response body. Repeat for Firecrawl and Anthropic. Restore breaker state with `DEL breaker:<provider>:state` after testing.
result: [pending]

### 4. Visual check of new `/insights/sentiment-health` tiles
expected: After deploy, visit `/insights/sentiment-health` and confirm two new tiles render: "Fallback Heatmap" (per-provider fallback_used rate) and "Active Alerts" (rows from ProviderHealthAlert WHERE resolved_at IS NULL). Layout matches the existing tile style.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

(none yet — populated if a test fails)

## Known Deferrals (NOT gaps)

- D-20 (webhook/Slack/email alerting) — deferred per CONTEXT.md original plan.
- D-21 (Firecrawl key rotation) — deferred 2026-05-14; full migration scoped as Phase 30.1.
- D-22 (Exa migration) — trigger no longer applies; 30.1 reopens.
