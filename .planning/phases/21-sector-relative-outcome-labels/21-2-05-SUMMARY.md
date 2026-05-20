---
phase: 21
plan: 21-2-05
subsystem: cron
tags: [forward-path, sector-relative, four-column-write, back-compat, integration-test]
requires: [21-1-02, 21-1-03]
provides:
  - price-followup writes all four PriceOutcome columns on every new outcome
  - computeSectorLabels helper (sector ETF resolution + SPY fallback ladder)
  - sector_fallback_to_spy counter in cron response JSON
  - Live-DB integration test gated by RUN_LIVE_INTEGRATION
affects: [src/app/api/cron/price-followup/route.ts, tests/integration/price-followup-sector-labels.integration.test.ts]
tech-stack:
  added: []
  patterns: [helper-extraction-for-loop-reuse, percentage-points-unit-lock, skip-if-env-gated-integration-test]
key-files:
  created:
    - tests/integration/price-followup-sector-labels.integration.test.ts
  modified:
    - src/app/api/cron/price-followup/route.ts
key-decisions:
  - "Extracted computeSectorLabels helper at module scope (not inline) so both the report loop AND the snapshot loop use the same SPY-fallback ladder verbatim. Reduces drift risk across the two near-identical write sites."
  - "BLOCKER-3 unit lock — percentage-points throughout. pct_change formula `((price - price_at_X) / price_at_X) * 100` unchanged; forward_return_raw assigned from the same local variable (`absoluteReturnPct`). Both write sites now carry an inline `percentage-points unit: 2.34 means +2.34%` comment to lock the unit semantics."
  - "SPY-alpha NOT stored. It continues to be derived at read time in classifyHit (Wave 3 plan 21-3-06 will widen classifyHit to also read forward_return_sector_rel). This keeps the schema additive and avoids a fourth percent-column that would invite unit-drift bugs."
  - "Both-fails edge case: when sector AND SPY return fetches both fail, write sector_etf='SPY' + forward_return_sector_rel=null. relabel cron's primary filter (WHERE sector_etf IS NULL) won't pick this row back up — a v1.1 follow-up could add a WHERE forward_return_sector_rel IS NULL AND sector_etf='SPY' retry path, but in steady state yahoo-finance2 outages of TTL duration are extremely rare. Acceptable v1 risk per T-21-2-05-05."
  - "Integration test gated via describe.skipIf(!ENV_GATE) checking RUN_LIVE_INTEGRATION || CI_INTEGRATION. Default unit test suite (npm test) ignores tests/integration/** entirely via the vitest config's exclude pattern; operator runs the test explicitly via npm run test:integration (or RUN_LIVE_INTEGRATION=true npx vitest run tests/integration/...)."
  - "Test seed Report uses minimum required fields per prisma/schema.prisma: user_id ('test-21-2-05-integration' sentinel), ticker (AAPL), company_name, analyzed_at (7 days ago), market_sentiment, confidence_level, analysis (Json {test:true, plan:'21-2-05'}), price_at_report=100. afterAll cleans up the seed Report and any PriceOutcome rows it produces."
requirements-completed: []
duration: 4 min
completed: 2026-05-20
---

# Phase 21 Plan 21-2-05: Forward-Path Sector-Label Writer Summary

`/api/cron/price-followup` now writes the four-column tuple — `pct_change`, `sector_etf`, `forward_return_raw`, `forward_return_sector_rel` — on every new `PriceOutcome` row. Existing back-compat invariants (95-day window, 0.6-day horizon tolerance, zero-price skip, `pct_change` value unchanged) preserved verbatim. `computeSectorLabels` helper consolidates the SPY-fallback ladder used by both the report and snapshot loops. A live-DB integration test pins the BLOCKER-3 byte-equal invariant (`forward_return_raw === pct_change`) so the unit-points lock can't drift unnoticed.

## Execution

| Metric | Value |
|---|---|
| Duration | ~4 min |
| Tasks | 2 |
| Files created | 1 (integration test) |
| Files modified | 1 (`price-followup/route.ts`) |
| Commits | 2 atomic |
| Test delta | + 1 integration test (skip-by-default) |

## Tasks

### Task 1: Forward-path writer rewrite — commit `52819f3`

Modifications to `src/app/api/cron/price-followup/route.ts`:

1. **Imports added** — `getSectorETF` from `@/lib/data/sector-mapping`, `fetchSectorETFReturn` from `@/lib/data/sector-prices`.

2. **`computeSectorLabels` helper extracted** above `export async function GET`:
   - Calls `getSectorETF({ ticker, asOfDate: fromDate })` — honors 21-1-03's reconstitution override on backfill-like windows; today's classification on forward writes.
   - Calls `fetchSectorETFReturn(sectorEtf, fromDate, toDate)` for the ETF's pct return over the same window.
   - **Fallback ladder**: sector return null → fetch SPY return; SPY return also null → write `sector_etf='SPY'` + `forward_return_sector_rel=null` and let the relabel cron retry on the next sweep.
   - Returns `{ sector_etf, forward_return_raw, forward_return_sector_rel, fallback }` — caller increments `sector_fallback_to_spy` when `fallback: true`.

3. **`results` counter** widened to include `sector_fallback_to_spy: 0`. Response JSON shape `{ ok: true, ...results }` surfaces it automatically via spread.

4. **Both write sites updated**: report loop (line ~45–56 pre-edit) and snapshot loop (line ~75–87 pre-edit) now each:
   - Compute `absoluteReturnPct = ((price - price_at_X) / price_at_X) * 100` into a local.
   - Call `computeSectorLabels({ ticker, fromDate: analyzed_at | scanned_at, toDate: new Date(), absoluteReturnPct })`.
   - Increment `results.sector_fallback_to_spy` if `sectorLabels.fallback`.
   - `prisma.priceOutcome.create({ data: { ...existing, pct_change: absoluteReturnPct, sector_etf, forward_return_raw, forward_return_sector_rel } })`.
   - Inline `// percentage-points unit: 2.34 means +2.34%. pct_change and forward_return_raw share this exact value.` comment locks the BLOCKER-3 unit semantics at the call site.

5. **Existing guards untouched**: `Math.abs(age - day) > 0.6` horizon tolerance, `report.outcomes.some(o => o.days_after === day)` skip-existing, `!price || !price_at_report` failure path, `price_at_scan === 0` cold-start guard. All `grep -q` acceptance checks confirm preservation.

### Task 2: Live-DB integration test — commit `cb72c2c`

Created `tests/integration/price-followup-sector-labels.integration.test.ts`:

- **Env gate**: `describe.skipIf(!ENV_GATE)` where `ENV_GATE = process.env.RUN_LIVE_INTEGRATION === 'true' || process.env.CI_INTEGRATION === 'true'`. Skip-by-default so `npm test` is untouched.
- **Lazy import**: `GET` and `prisma` imported inside `beforeAll` after `dotenv` has loaded `.env.local` — prevents the Prisma client from instantiating against a missing `DATABASE_URL` during default unit-test runs.
- **Seed**: minimum Report row (user_id, ticker=AAPL, company_name, analyzed_at=7-days-ago, market_sentiment, confidence_level, analysis JSON, price_at_report=100). Captured `createdReportId` for cleanup.
- **Assertions**:
  - `body.ok === true` and `typeof body.sector_fallback_to_spy === 'number'`
  - `outcomes.length >= 1` for `(report_id, days_after=7)`
  - `outcome.sector_etf` matches `/^(XLK|XLF|XLE|XLV|XLY|XLP|XLI|XLU|XLB|XLRE|XLC|SPY)$/`
  - `outcome.forward_return_raw` not null
  - **BLOCKER-3 lock**: `expect(o.forward_return_raw).toBeCloseTo(o.pct_change, 9)` — 9-decimal precision is effectively byte-equal for the IEEE-754 doubles after the same arithmetic
  - `outcome.forward_return_sector_rel` either number or null (yahoo-outage path)
- **Cleanup**: `afterAll` deletes the PriceOutcome rows by `report_id` then the Report itself.

## Verifications

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `getSectorETF` + `fetchSectorETFReturn` imported | PASS |
| `computeSectorLabels` defined as `async function` | PASS |
| `sector_etf: sectorLabels.sector_etf` literal count | 2 (one per loop) |
| `pct_change:` literal count | 2 (one per loop, value preserved) |
| Unit choice documented at write site | PASS (`percentage-points unit` in both inline comments) |
| `forward_return_raw:` + `forward_return_sector_rel:` both present | PASS |
| `sector_fallback_to_spy` counter present | PASS |
| `price_at_scan === 0` guard preserved | PASS |
| `Math.abs(age - day) > 0.6` tolerance preserved | PASS |
| BLOCKER-3 equality enforced (write-site grep) | PASS — both assigned from `absoluteReturnPct` |
| Integration test file exists | PASS |
| Test gated by `RUN_LIVE_INTEGRATION` | PASS |
| `toBeCloseTo(o.pct_change, 9)` assertion present | PASS |
| `deleteMany` cleanup present | PASS |
| Default `vitest run integration/price-followup...` | "No test files found" — expected; default unit config excludes `tests/integration/**` (operator runs via `npm run test:integration` or explicit env override) |

## Deviations from Plan

**[Rule 1 — Bug] Lazy-import inside `beforeAll`** — Found during: Task 2 design. Issue: importing `prisma` at module top would run the Prisma singleton constructor even when the test would be skipped (default CI / no DATABASE_URL). That constructor throws when `DATABASE_URL` is empty. Fix: defer `import('@/lib/db')` and `import('@/app/api/cron/price-followup/route')` to inside `beforeAll`, after `dotenv` has loaded `.env.local`. The `describe.skipIf` already guards the test execution; the lazy import prevents the module-load-time crash even if a future test runner doesn't honor `skipIf` before running module-level imports. Files modified: `tests/integration/price-followup-sector-labels.integration.test.ts`. Verification: `npx tsc --noEmit` exit 0; default `npx vitest run` skips the file (because `tests/integration/**` is excluded from the unit config). Commit: `cb72c2c`.

**[Rule 2 — Missing Critical] Plan pseudocode used non-existent describe.skipIf import** — The plan's example pseudocode used `describe.skipIf` which IS valid Vitest 1.x+ syntax but isn't explicitly imported. Vitest's `describe` already has `.skipIf` as a method — no extra import needed. Verified by `npx tsc --noEmit` exit 0. Not really a deviation from plan; documented here for clarity.

**Total deviations:** 1 (Rule 1 lazy-import). Auto-fixed. **Impact:** test infrastructure is more robust against env-loading races; no behavioral change to the route.

## Authentication Gates

None. CRON_SECRET sourced from `.env.local` at integration-test runtime; route's Bearer check unchanged.

## Issues Encountered

None blocking.

## Operator Post-Deploy Tasks

1. **Monitor `sector_fallback_to_spy` counter** in the daily price-followup response JSON for 1 week. Expected to converge toward ~0 after the sector ETF chart cache warms (12 ETFs × 12 months on the rolling window). Sustained > 5/day indicates a yahoo-finance2 issue or a cache-key miss bug.
2. **Run the integration test against staging once before production rollout**:
   ```
   RUN_LIVE_INTEGRATION=true npx vitest run tests/integration/price-followup-sector-labels.integration.test.ts
   ```
   Should pass against the same Neon connection that hosts production data (seed row is scoped to `user_id: 'test-21-2-05-integration'` and cleaned up).
3. **Optional Wave 3 prep**: query Neon `SELECT sector_etf, forward_return_raw, forward_return_sector_rel FROM price_outcomes ORDER BY recorded_at DESC LIMIT 5;` to spot-check that newly-arrived rows from the next price-followup fire have non-null new columns.

## Next Phase Readiness

**Wave 2 complete: 2 of 2 plans shipped (5/8 phase plans done).**

Phase 21 columns are now populated on both code paths:
- Historical backfill via `/api/cron/relabel` (21-2-04) on rows where `sector_etf IS NULL`.
- Forward-path writes via `/api/cron/price-followup` (21-2-05) on every new `PriceOutcome` row created.

Ready for **Wave 3 — Plan 21-3-06** (the keystone): flip `classifyHit` to use `forward_return_sector_rel` as the primary hit signal, falling back to the legacy `(ticker - spy) > threshold` only when the sector column is null. This is `autonomous: false` — requires user checkpoint per the phase plan.
