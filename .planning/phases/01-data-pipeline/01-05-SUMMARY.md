---
phase: 01-data-pipeline
plan: 05
subsystem: api
tags: [source-package, promise-allsettled, temp-file, next-api-route, ticker-research]

# Dependency graph
requires:
  - phase: 01-data-pipeline plan 03
    provides: fetchMarketData, fetchFundamentals from yahoo-finance2
  - phase: 01-data-pipeline plan 04
    provides: fetchNews, fetchAnalystSentiment, fetchSecFilingSummary, fetchSocialSentiment from Anthropic search
provides:
  - collectAllData() — parallel data collection returning SourcePackage (DATA-08)
  - writeSourcePackage/readSourcePackage/cleanupSourcePackage — temp file lifecycle
  - POST /api/research/[ticker] — pipeline trigger, returns { ticker, assembled_at, filePath, collection_errors }
  - ChartConfirmation wired to API — Confirm button triggers real pipeline
affects:
  - 02-notebooklm (reads source package from filePath returned by this route)
  - report output phase (collection_errors visible in UI for Phase 2 awareness)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Promise.allSettled for parallel data collection with graceful degradation
    - Temp file in os.tmpdir() — never in project directory; path returned via JSON response
    - TICK-03 enforcement at server level — confirmed: true required before pipeline runs

key-files:
  created:
    - src/lib/data/source-package.ts
    - src/lib/temp-file.ts
    - src/app/api/research/[ticker]/route.ts
  modified:
    - src/lib/data/source-package.test.ts
    - src/app/api/research/route.test.ts
    - src/components/ChartConfirmation.tsx

key-decisions:
  - "collectAllData() makes companyName and exchange optional (defaults to ticker and null) so Wave 0 stubs calling collectAllData('AAPL') with one arg continue to work"
  - "Route instantiates YahooFinance via new YahooFinance() (matching yahoo.ts pattern) rather than using default export — avoids TypeScript Property does not exist on type 'never' errors"
  - "ChartConfirmation disables Confirm button after success (no re-run) and shows filePath in a code block as the Phase 2 handoff point"

patterns-established:
  - "Promise.allSettled + settle() helper: parallel execution with per-source fallback and error accumulation in collection_errors[]"
  - "Temp file path format: os.tmpdir()/ticker-research-XXXX/{TICKER}-{timestamp}.json"
  - "Pipeline route pattern: confirm check → company metadata lookup (non-fatal) → collectAllData → writeSourcePackage → return JSON"

requirements-completed: [DATA-07, DATA-08, TICK-03]

# Metrics
duration: 4min
completed: 2026-03-13
---

# Phase 1 Plan 05: Pipeline Assembly and API Wiring Summary

**Parallel 6-source data collection pipeline (Promise.allSettled) writing timestamped SourcePackage JSON to os.tmpdir(), exposed via POST /api/research/[ticker] with TICK-03 enforcement and ChartConfirmation wired end-to-end**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T01:19:08Z
- **Completed:** 2026-03-13T01:22:47Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- collectAllData() runs all 6 data fetchers in parallel using Promise.allSettled; single-source failures are recorded in collection_errors[] and don't abort the pipeline
- All 6 SourcePackage sections carry collected_at ISO 8601 timestamps (DATA-07)
- POST /api/research/[ticker] enforces confirmed: true (TICK-03) and writes source package to os.tmpdir() — never to the project directory
- ChartConfirmation Confirm button sends POST with { confirmed: true }, shows loading/success/error states in-component
- All 13 Phase 1 tests pass: 5 yahoo + 4 anthropic-search + 3 source-package + 1 research route

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement parallel data collection and temp file assembly** - `556ff18` (feat)
2. **Task 2: Build POST /api/research/[ticker] pipeline route** - `6d4e73e` (feat)
3. **Task 3: Wire ChartConfirmation Confirm button** - `e14f74c` (feat)

**Plan metadata:** (docs commit — this summary)

## Files Created/Modified
- `src/lib/data/source-package.ts` - collectAllData() using Promise.allSettled; fallback sections for each source
- `src/lib/temp-file.ts` - writeSourcePackage, readSourcePackage, cleanupSourcePackage
- `src/app/api/research/[ticker]/route.ts` - POST pipeline route with TICK-03 enforcement
- `src/lib/data/source-package.test.ts` - 3 passing tests with full mocks (replaced Wave 0 stubs)
- `src/app/api/research/route.test.ts` - 1 passing test with mocks (replaced Wave 0 stub)
- `src/components/ChartConfirmation.tsx` - Confirm button wired to fetch pipeline API with loading/success/error states

## Decisions Made

- collectAllData() makes companyName and exchange optional (default to ticker and null) — Wave 0 stubs calling with one arg remain valid
- Route uses `new YahooFinance()` constructor (matching yahoo.ts pattern) instead of the default export, avoiding TypeScript errors where `quote()` return type resolves to `never`
- Test mock for yahoo-finance2 updated to `vi.fn().mockImplementation(() => ({ quote: mockFn }))` to match the constructor pattern
- ChartConfirmation disables and relabels Confirm button after success (no re-run); filePath displayed in code block as visible Phase 2 handoff point

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed yahoo-finance2 import in route to use constructor pattern**
- **Found during:** Task 2 (TypeScript check after creating route)
- **Issue:** `import yahooFinance from 'yahoo-finance2'` followed by `yahooFinance.quote()` produced TypeScript error "Property 'longName' does not exist on type 'never'" — default export is the class, not an instance
- **Fix:** Changed to `import YahooFinance from 'yahoo-finance2'` + `const yf = new YahooFinance(...)` matching the pattern in yahoo.ts; updated route.test.ts mock to use a constructor mock
- **Files modified:** src/app/api/research/[ticker]/route.ts, src/app/api/research/route.test.ts
- **Verification:** `npx tsc --noEmit` clean; route test passes
- **Committed in:** 6d4e73e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug)
**Impact on plan:** Fix was necessary for TypeScript correctness and consistent instantiation pattern. No scope creep.

## Issues Encountered

- Wave 0 test stubs called `collectAllData('AAPL')` with a single argument. The plan's implementation had `(ticker, companyName, exchange)` as required args. Made `companyName` and `exchange` optional with defaults so existing call signatures remain valid without any test changes needed.

## Source Package Details (for Phase 2)

**Temp file path format:** `{os.tmpdir()}/ticker-research-XXXX/{TICKER}-{timestamp}.json`

Example: `/var/folders/.../ticker-research-abc123/AAPL-1700000000000.json`

**How filePath reaches frontend:** Returned in POST /api/research/[ticker] JSON response body as `{ ticker, assembled_at, filePath, collection_errors }`. ChartConfirmation displays it in a `<code>` block on success.

**collection_errors behavior:** Array of strings, one per failed source. Format: `"section_label: error message"`. Empty array `[]` when all 6 sources succeed. Phase 2 should check this array and may surface warnings for sources that partially failed.

**Promise.allSettled behavior:** All 6 fetches run concurrently. If any reject, the settle() helper records the error message and returns the typed fallback section (with `items: []`, `consensus: null`, etc.). The assembled SourcePackage is always returned — never throws.

**Timing:** Data collection typically completes in 10-30 seconds (dependent on Anthropic web search API latency for 4 concurrent calls).

## ChartConfirmation Loading/Success/Error Design (for Phase 2 UI continuity)

- **Loading:** Button shows "Running..." text, disabled, `bg-blue-300` color
- **Success:** Green `bg-emerald-50` panel above buttons; `filePath` in `<code>` block; button shows "Data Collected", disabled
- **Error:** Red `bg-red-50` panel with error message; button re-enabled for retry
- **Search Again:** Always enabled, routes to `/` via router.push

## Next Phase Readiness

Phase 2 can read the SourcePackage from the filePath returned by this route. The source package includes:
- Structured market data and fundamentals (yahoo-finance2)
- News items with URLs (ready for add_url() in notebooklm-py)
- Analyst sentiment, SEC filing summaries, social sentiment

Phase 2 pre-conditions still pending: Python 3.10+ check, notebooklm-py install, Google auth setup wizard.

## Self-Check: PASSED

- FOUND: src/lib/data/source-package.ts
- FOUND: src/lib/temp-file.ts
- FOUND: src/app/api/research/[ticker]/route.ts
- FOUND: src/components/ChartConfirmation.tsx
- FOUND: .planning/phases/01-data-pipeline/01-05-SUMMARY.md
- FOUND commit: 556ff18 (Task 1)
- FOUND commit: 6d4e73e (Task 2)
- FOUND commit: e14f74c (Task 3)

---
*Phase: 01-data-pipeline*
*Completed: 2026-03-13*
