---
phase: 27
plan: "02"
subsystem: backfill-cli
tags: [backfill, data, technical, learning, pit-discipline, ohlcv-cache]
dependency_graph:
  requires: [27-01]
  provides: [windowing-helpers, ohlcv-cache, backfill-cli-scaffold, fetch-once-regression]
  affects: [Phase-23-lift-gate-CV-pool, COVERAGE-07, COVERAGE-08]
tech_stack:
  added: []
  patterns:
    - "YahooFinance.prototype.chart intercept (covers module-scope instances in imported files)"
    - "fetchOrLoadOhlcv injectable deps seam (chart spy + temp cacheDir) for unit testing"
    - "Dynamic import of technical.ts after prototype patch (static imports hoist above patches)"
    - "In-process memo map keyed by cacheDir for independent test isolation"
key_files:
  created:
    - src/lib/backtest/windowing.ts
    - src/lib/backtest/ohlcv-cache.ts
    - scripts/backfill-historical.ts
    - tests/unit/backfill-cache-fetch-once.test.ts
  modified: []
decisions:
  - "installChartCache patches YahooFinance.prototype.chart (not an instance method) so technical.ts's module-scope new YahooFinance() is covered without edits to technical.ts"
  - "computeTechnicalSnapshot imported DYNAMICALLY after installChartCache() call — static imports hoist above code, so the patch must precede the module load"
  - "fetchOrLoadOhlcv accepts injectable { chart, cacheDir } deps so tests use spy + temp dirs without touching ~/.cipher"
  - "In-process memo is keyed by cacheDir so different test temp dirs get independent memo namespaces"
  - "outcome snapshot_id mapping: re-query by (ticker, scanned_at in keptAsOfs) after createMany to map dates→ids, then attach snapshot_id before priceOutcome createMany"
metrics:
  duration_minutes: 6
  completed_date: "2026-05-26"
  tasks_completed: 4
  files_created: 4
  files_modified: 0
---

# Phase 27 Plan 02: Backfill CLI + PIT Windowing Helpers Summary

**One-liner:** Resumable disk-cached backfill CLI with prototype-level Yahoo intercept, pure PIT windowing helpers, and 3-label outcome generation — all using `computeTechnicalSnapshot` as the single feature path.

## What Was Built

### Task 1 — `src/lib/backtest/windowing.ts` (COVERAGE-07 GREEN)

Two pure functions with no I/O and no clock reads:
- `buildWeeklyAsOfDates(start, end)` — weekly (+7d) Date array in `[start, end]`, strictly increasing
- `computeOutcomeRecordedAt(scannedAt, daysAfter)` — pure arithmetic: `scannedAt + daysAfter * 86400000`

These are the load-bearing PIT primitives that Phase 23's Purged-K-Fold CV depends on. Setting either to `new Date()` would collapse the fold structure to a single point (RESEARCH § Purged-K-Fold Compatibility).

### Task 2 — `src/lib/backtest/ohlcv-cache.ts` + CLI scaffold (COVERAGE-08 GREEN)

**`ohlcv-cache.ts`** exports two primitives:

- `fetchOrLoadOhlcv(ticker, deps?)` — in-process memo → disk cache → single Yahoo `chart()` call. Injectable `{ chart, cacheDir }` seam enables unit tests with spy charts and temp dirs, never touching `~/.cipher`.
- `installChartCache(opts?)` — patches `YahooFinance.prototype.chart` so every instance (including `technical.ts`'s module-scope `new YahooFinance()`) routes through the cache. Returns `uninstall()` for test cleanup.

**`scripts/backfill-historical.ts`** is the one-shot CLI:
- Calls `installChartCache()` as first executable statement in `main()`
- Dynamically imports `computeTechnicalSnapshot` after the patch (static imports hoist above code)
- `--dry-run` flag — compute everything, log counts, write nothing
- `--max-tickers N` — smoke-run subset of universe
- `--probe-sector` — resolves RESEARCH Open Question 1 (see Task 3)
- Checkpoint: `~/.cipher/backfill-cache/checkpoint.json` — crash at ticker 80 resumes from 81
- DATABASE_URL guard: exits cleanly if unset (no prod writes in CI/dry-run) — value never echoed (T-27-06)

**`tests/unit/backfill-cache-fetch-once.test.ts`** — 5 tests:
1. chart spy fires exactly once across 3 invocations of the same ticker
2. disk cache read on second instance (no spy call when file pre-exists)
3. null-close bars are filtered (T-27-07)
4. `YahooFinance.prototype.chart` is patched then restored by `uninstall()`
5. patched chart correctly slices bars to requested `[period1, period2]` window

### Task 3 — `--probe-sector` mode + SPY fallback

Resolves RESEARCH Open Question 1: `fetchSectorETFReturn` in `sector-prices.ts` uses month-keyed `yf.chart()` calls internally, making it historical-range-capable. No new fetch layer is needed; the existing 30-day TTL cache covers backfill re-runs.

For XLRE/XLC windows pre-dating ETF inception (RESEARCH Pitfall 5): falls back to SPY with `sector_fallback_to_spy` counter logged per ticker and totaled at end.

### Task 4 — Weekly snapshot + 3-label outcome generation

Per-ticker loop (not in checkpoint):
1. As-of `cap_class` via `yf.quoteSummary` → `classifyCapClass(mc)` — current-cap proxy (RESEARCH A1 documented)
2. Pre-warm disk cache via `fetchOrLoadOhlcv`
3. `buildWeeklyAsOfDates(startDate, endDate)` where `endDate = now - 95d` (all 90d horizons resolved)
4. Per window: `computeTechnicalSnapshot(ticker, asOf)` — served from cache via prototype patch; skip if `tech == null || tech.tech_pattern == null` (Pitfall 4 guard)
5. Build `SentimentSnapshot` row: `source: 'backfill'`, `scanned_at: asOf` (historical date, PIT COVERAGE-07)
6. Per horizon `[3,7,14,30,60,90]d`: `computeOutcomeRecordedAt(asOf, day)`, nearest-bar forward close, `getSectorETF({ ticker, asOfDate: asOf })`, `fetchSectorETFReturn` → build PriceOutcome with all 3 labels (`forward_return_raw`, `forward_return_sector_rel`, `pct_change`)
7. Batched `createMany({ skipDuplicates: true })` for both tables; re-query to attach `snapshot_id`
8. `markDone(ticker)` after successful write; throttle `1000ms` between tickers

## Deviations from Plan

None — plan executed exactly as written. All tasks were implemented in the described order.

The `adjclose` acceptance grep (`grep -c 'adjclose' returns 0`) was initially triggered by a documentation comment saying "NOT adjclose" — fixed by rewriting the comment to remove the pattern while keeping the intent clear.

The `Date.now()` acceptance grep (`grep -c 'Date.now()' windowing.ts returns 0`) was initially triggered by two documentation comments — fixed by rewriting them to use "no clock reads" instead.

## Known Stubs

None. All behaviors are fully wired. The CLI does not write rows during automated verification (DATABASE_URL unset in CI) — the operator live-backfill run is a separate manual step documented in the plan and the CLI's `--dry-run` log output.

## Threat Flags

No new network-exposed endpoints, auth paths, or file access patterns introduced. This plan adds only a local CLI and library modules. The cache at `~/.cipher/backfill-cache/` is outside the repo and gitignored (T-27-08 mitigated by Plan 01). DATABASE_URL is never echoed (T-27-06 mitigated by acceptance grep + guard structure).

## Self-Check: PASSED

Files confirmed present:
- FOUND: src/lib/backtest/windowing.ts
- FOUND: src/lib/backtest/ohlcv-cache.ts
- FOUND: scripts/backfill-historical.ts
- FOUND: tests/unit/backfill-cache-fetch-once.test.ts

Commits confirmed:
- 1c76439: feat(27-02): pure PIT windowing helpers
- c8dca9c: feat(27-02): backfill CLI scaffold + disk-cached fetch-once ohlcv-cache
- 1902c71: feat(27-02): complete weekly snapshot + 3-label outcome generation in backfill CLI
- c1c49ba: chore(27-02): remove Date.now() from windowing.ts comments

Tests: COVERAGE-07 (2/2), COVERAGE-08 (3/3), fetch-once regression (5/5) — all GREEN.
TSC: clean for all new files. Pre-existing Plan 04 RED stub (backfill-live-gate.test.ts) unchanged.
