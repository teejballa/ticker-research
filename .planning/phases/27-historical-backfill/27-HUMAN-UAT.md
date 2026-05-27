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
expected: `npx tsx scripts/backfill-historical.ts --dry-run --max-tickers 3` (with DATABASE_URL set)
runs clean, then a full `npx tsx scripts/backfill-historical.ts` populates `source='backfill'`
weekly snapshots + 3-label PriceOutcome rows for the 121-ticker universe (~15–45 min). After it
finishes, trigger `/api/cron/learn` with $CRON_SECRET for the recompute pass.
result: [pending]
notes: This is the actual data-generation step (intentionally NOT run by the autonomous executor —
the CLI exits cleanly without a live run). It bootstraps N for Phase 23's lift-gate CV pool.

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
