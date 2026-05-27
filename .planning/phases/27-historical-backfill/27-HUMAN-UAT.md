---
status: partial
phase: 27-historical-backfill
source: [27-VERIFICATION.md]
started: 2026-05-26
updated: 2026-05-26
---

## Current Test

[awaiting human action]

## Tests

### 1. Composite done-gate confirmation
expected: `npm run phase-27-status` exits 0 in an adequately-resourced environment (or CI).
result: [pending]
notes: All deterministic checks (schema, universe, single-path, live-gate, docs, tsc) pass.
All 21 Phase 27 tests pass in isolation (confirmed this run). The gate's full-suite
`npx vitest run` step can flake LOCALLY on pre-existing CPU-contention 5s-timeout tests
(`engine-context`, `api/analysis/route`) — see MEMORY.md; not a Phase 27 regression.

### 2. Operator live backfill run
expected: full `npx tsx scripts/backfill-historical.ts` populates `source='backfill'` weekly
snapshots + 3-label PriceOutcome rows for the 121-ticker universe.
result: PARTIAL (2026-05-27) — **24/121 tickers in prod: 4,906 snapshots, 29,436 outcomes.**
The backfill mechanism is fully verified (clean data, 3 labels, sector-relative). The remaining
~97 tickers could NOT be fetched from the agent environment: Yahoo aggressively rate-limits the
chart endpoint from this (datacenter/cloud) IP — each run netted only ~3–13 tickers before a hard
burst-block, regardless of throttle (tried 1s/3s/10s). NOT a code bug: the CLI is fully resumable
and self-healing (failed tickers retry cleanly — no checkpoint/cache poisoning).
**TO FINISH (run from a residential IP / your own machine):**
`npx tsx scripts/backfill-historical.ts` — skips the 24 already done, fetches the rest. Tune with
`BACKFILL_THROTTLE_MS=8000` if you still hit throttling. Re-run until `distinct_tickers` stops
growing; it converges (resumable). Then trigger the recompute: `curl -H "Authorization: Bearer
$CRON_SECRET" https://ciphersearch.app/api/cron/learn` (or just let the daily `learn` cron at
07:30 UTC pick it up automatically).
notes: Bootstraps N for Phase 23's lift-gate CV pool. The daily `learn` cron will fold the
existing 24-ticker backfill outcomes into LearnedPattern automatically — no manual trigger needed
for what's already in prod.

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
