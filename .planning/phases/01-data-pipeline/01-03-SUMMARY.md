---
phase: 01-data-pipeline
plan: 03
subsystem: api
tags: [yahoo-finance2, typescript, financial-data, market-data, fundamentals]

# Dependency graph
requires:
  - phase: 01-data-pipeline plan 01
    provides: "Next.js scaffold, src/lib/types.ts with TickerSearchResult, ChartDataPoint, MarketDataSection, FundamentalsSection"
provides:
  - "searchTickers(query): TickerSearchResult[] — equity-filtered autocomplete search via yahoo-finance2"
  - "fetchChartData(ticker): ChartDataPoint[] — 1-month daily OHLCV data (YYYY-MM-DD / close price)"
  - "fetchMarketData(ticker): MarketDataSection — price, volume, 52-week range, market cap, exchange"
  - "fetchFundamentals(ticker): FundamentalsSection — P/E, EPS, revenue, debt-to-equity, profit margin"
affects: [01-data-pipeline plan 05 (source-package assembler), 01-data-pipeline plan 04 (API routes)]

# Tech tracking
tech-stack:
  added: [yahoo-finance2@3.13.2 (already installed in 01-01)]
  patterns:
    - "yahoo-finance2 v3 requires instantiation: new YahooFinance({ suppressNotices: [...] })"
    - "All data functions return typed objects with collected_at ISO 8601 timestamps (DATA-07)"
    - "Graceful error handling: catch blocks return null-filled objects with error field set"
    - "Use ?? null not || null — 0 and false are valid financial values"

key-files:
  created:
    - src/lib/data/yahoo.ts
  modified:
    - src/lib/data/yahoo.test.ts

key-decisions:
  - "yahoo-finance2 v3 typeDisp returns lowercase 'equity' not title-case 'Equity' — comparison must use .toLowerCase()"
  - "DefaultKeyStatistics interface has [key: string]: unknown index signature — trailingPE/trailingEps must be cast to (number | undefined)"
  - "debtToEquity type from financialData is {} | number in TS — cast required for assignment to number | null"
  - "suppressNotices: ['yahooSurvey'] added to suppress survey prompt in test output"

patterns-established:
  - "Pattern: data functions never throw — all errors are caught and returned as { ...nullFields, error: message }"
  - "Pattern: ?? null used throughout to preserve 0 and false as valid financial values"
  - "Pattern: data functions are server-only lib — never imported from client-side components"

requirements-completed: [DATA-01, DATA-02, TICK-01, TICK-02]

# Metrics
duration: 15min
completed: 2026-03-12
---

# Phase 1 Plan 3: Yahoo Finance Data Layer Summary

**Four yahoo-finance2 data functions (searchTickers, fetchChartData, fetchMarketData, fetchFundamentals) with typed returns, graceful error handling, and ISO 8601 timestamps on every object**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-12T17:50:00Z
- **Completed:** 2026-03-12T17:52:45Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- All 4 data functions implemented and exported from `src/lib/data/yahoo.ts`
- All 5 Wave 0 test stubs turned green (live network calls against yahoo-finance2)
- TypeScript type errors in yahoo.ts resolved (two type assertion issues discovered and fixed)
- yahoo-finance2 v3 API quirks documented: lowercase typeDisp, index-signature on DefaultKeyStatistics

## Task Commits

1. **Task 1: Implement yahoo-finance2 data functions** - `4d87b57` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `src/lib/data/yahoo.ts` — Four exported data collection functions with typed returns and graceful error handling
- `src/lib/data/yahoo.test.ts` — 5 live-network integration tests, all passing (previously stubs with dynamic imports)

## Decisions Made
- Used `new YahooFinance({ suppressNotices: ['yahooSurvey'] })` — v3 requires instantiation, not default export usage
- `typeDisp` comparison uses `.toLowerCase()` — yahoo-finance2 v3 returns lowercase string values
- Cast `trailingPE` and `trailingEps` to `(number | undefined)` — `DefaultKeyStatistics` has index signature `[key: string]: unknown` which overrides named property types in TS
- Cast `debtToEquity` to `(number | undefined)` for same reason

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed case-sensitive typeDisp equity filter**
- **Found during:** Task 1 (test run revealed searchTickers returning empty array)
- **Issue:** Plan used `q.typeDisp === 'Equity'` but yahoo-finance2 v3 returns lowercase `'equity'`
- **Fix:** Changed filter to `q.typeDisp?.toLowerCase() === 'equity'`
- **Files modified:** src/lib/data/yahoo.ts
- **Verification:** Both searchTickers tests now pass (AAPL found in "Apple" and "AAPL" searches)
- **Committed in:** 4d87b57 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed TypeScript type assertions for DefaultKeyStatistics index signature**
- **Found during:** Task 1 (tsc --noEmit revealed type errors)
- **Issue:** `DefaultKeyStatistics` interface has `[key: string]: unknown` which widens all property accesses to `unknown`. TS infers `unknown ?? null` as `{} | null`, not `number | null`
- **Fix:** Cast `trailingPE`, `trailingEps`, and `debtToEquity` to `(number | undefined)` before the `?? null` operator
- **Files modified:** src/lib/data/yahoo.ts
- **Verification:** `tsc --noEmit` reports zero errors in yahoo.ts
- **Committed in:** 4d87b57 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs in plan's code templates)
**Impact on plan:** Both fixes necessary for correct runtime behavior and TypeScript compliance. No scope creep.

## Issues Encountered

**yahoo-finance2 v3 API differences from plan's code sample:**
- Plan showed `import yahooFinance from 'yahoo-finance2'` (default import, direct usage). v3 requires `new YahooFinance()` instantiation.
- `typeDisp` values are lowercase in v3 (plan assumed title-case from older docs).
- `DefaultKeyStatistics` index signature causes TS type widening — not documented in yahoo-finance2 types.

No rate limiting observed during testing. All 5 live network tests completed in under 2 seconds total.

**debtToEquity field availability:** AAPL returned a numeric value for `debtToEquity` during testing. The field may be null for companies with no debt — this is handled correctly by the `?? null` pattern.

## User Setup Required
None - no external service configuration required. yahoo-finance2 is free and requires no API key.

## Next Phase Readiness
- `searchTickers` is ready for import in `src/app/api/ticker/search/route.ts` (plan 01-04)
- `fetchMarketData` and `fetchFundamentals` are ready for import in `src/lib/data/source-package.ts` (plan 01-05)
- All functions follow the graceful error pattern expected by `Promise.allSettled` in the source package assembler

---
*Phase: 01-data-pipeline*
*Completed: 2026-03-12*
