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
result: ✅ DONE (2026-05-27) — **121/121 tickers in prod: 26,702 snapshots, 154,971 outcomes**
(137,598 with sector-relative labels), cap-balanced **70 large / 27 small / 25 mid**.
Convergence required riding Yahoo's burst-throttle (per-ticker exponential backoff + sustained-block
pass-abort + shared cooldowns) and swapping **8 universe names that had delisted via 2024–25 M&A**
for live equivalents (their data is gone from Yahoo — the exact survivorship gap D-03 documents):
ATIP→SBH, APPH→WGO, NKLA→SCVL (bankrupt small-caps); HBI→CROX (Gildan acq.), PARA→COLM (→PSKY),
SMAR→BOX (taken private), TPX→HAS (→Somnigroup/SGI), CIVI→MTDR, ZI→GTM (ZoomInfo rebrand). Universe
is `2026-05-27.3`.
notes: Bootstraps N for Phase 23's lift-gate CV pool. The recompute (`/api/cron/learn`) was
triggered and correctly processed 0 of these into the LIVE posterior — per D-01, 5yr-old backfill
rows decay to ~0 live weight; they live in the DB as the raw CV pool that Phase 23 reads directly.

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
