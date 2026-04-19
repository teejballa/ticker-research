---
phase: 13-deep-sentiment-intelligence
plan: 01
subsystem: data
tags: [stocktwits, options, put-call-ratio, sentiment, yahoo-finance2, vitest]

# Dependency graph
requires:
  - phase: 12-intelligence-pipeline-rebuild-replace-notebooklm-with-polygo
    provides: SourcePackage type and collectAllData() pipeline this plan extends
provides:
  - SentimentIntelligenceSection type with 7 fields per D-14
  - fetchStockTwitsSentiment() — StockTwits API wrapper (no auth, per-message bull/bear)
  - fetchOptionsSentiment() — yahoo-finance2 options put/call ratio with D-11 thresholds
  - 9-way parallel collectAllData() with sentiment_intelligence in SourcePackage
  - Unit tests (17 passing) for both new modules covering null paths and computation logic
affects:
  - 13-02 (Gemini prompt extension uses sentiment_intelligence from SourcePackage)
  - 13-03 (UI plan renders sentiment_intelligence fields from AnalysisResult)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StockTwits public API: no auth, AbortSignal.timeout(5000), per-message sentiment label counting"
    - "options chain put/call ratio: sum openInterest across all chains, D-11 thresholds (>1.0 bearish, <0.5 bullish)"
    - "yahoo-finance2 default export used as object (not new constructor) for vitest mockability"
    - "null vs 0 distinction: null means no data, 0 would mean 0% — enforced throughout"

key-files:
  created:
    - src/lib/data/stocktwits.ts
    - src/lib/data/options-sentiment.ts
    - src/lib/data/__tests__/stocktwits.test.ts
    - src/lib/data/__tests__/options-sentiment.test.ts
  modified:
    - src/lib/types.ts
    - src/lib/data/source-package.ts
    - src/lib/__tests__/research-brief.test.ts

key-decisions:
  - "null (not 0) returned for bull/bear pct when zero messages have sentiment labels — null signals no data"
  - "is_trending derived from Math.abs(sentiment_change) > 0.5 — StockTwits API has no is_trending flag"
  - "yahoo-finance2 used as default export object (not new YahooFinance()) to enable clean vitest mocking"
  - "options-sentiment.ts uses (yahooFinance as any).options() — .options() exists on default export but TypeScript types don't expose it directly"
  - "reddit_tone: null in SentimentIntelligenceSection — set qualitatively by Gemini in Plan 02, not fetched here"
  - "AnalysisResult extensions all optional for backward compat with persisted StoredReport files"

patterns-established:
  - "fetchSentimentIntelligence() aggregator pattern: parallel sub-fetches merged into SentimentIntelligenceSection"
  - "Test stubs use vitest (vi.fn, vi.mock, vi.clearAllMocks) — not jest globals — matching project test framework"

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-04-19
---

# Phase 13 Plan 01: Deep Sentiment Intelligence Data Foundation Summary

**StockTwits bull/bear API wrapper + yahoo-finance2 options put/call ratio wired as 9th parallel source in collectAllData(), with SentimentIntelligenceSection type contract and 17 passing vitest unit tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-19T15:40:31Z
- **Completed:** 2026-04-19T15:49:56Z
- **Tasks:** 5 (Task 0 + Tasks 1-4)
- **Files modified:** 7

## Accomplishments

- `SentimentIntelligenceSection` interface with 7 fields per D-14 added to types.ts; SourcePackage gains required field; AnalysisResult gains 3 optional backward-compat fields including `community_sources_scraped` (D-18)
- `fetchStockTwitsSentiment()`: per-message bull/bear label counting (null not 0 when no labels), is_trending from sentiment_change magnitude, encodeURIComponent for T-13-01-01, AbortSignal.timeout(5000) for T-13-01-02
- `fetchOptionsSentiment()`: sums openInterest across all chains, D-11 thresholds, null on zero callOI or any error — graceful for small-caps/ETFs/crypto
- `collectAllData()` extended from 8 to 9 parallel Promise.allSettled entries; `fetchSentimentIntelligence()` aggregator merges both sub-fetches
- 17 vitest unit tests passing: 8 for stocktwits (null paths, bull/bear computation, is_trending, URL encoding), 9 for options (null paths, put/call ratio sums, D-11 boundary conditions)

## Task Commits

Each task was committed atomically:

1. **Task 0: Create unit test stubs** - `ad337ad` (test)
2. **Task 1: SentimentIntelligenceSection type + extend SourcePackage/AnalysisResult** - `ad97340` (feat)
3. **Task 2: stocktwits.ts StockTwits API wrapper** - `1f9a59b` (feat)
4. **Task 3: options-sentiment.ts put/call ratio** - `4065fa7` (feat)
5. **Task 4: Wire into source-package.ts** - `7720864` (feat)
6. **Fix: options-sentiment vitest mock compatibility** - `e043352` (fix)

## Files Created/Modified

- `src/lib/types.ts` — SentimentIntelligenceSection interface, SourcePackage.sentiment_intelligence (required), AnalysisResult optional extensions
- `src/lib/data/stocktwits.ts` — StockTwits public API wrapper, no auth, AbortSignal.timeout(5000), per-message bull/bear, is_trending derivation
- `src/lib/data/options-sentiment.ts` — yahoo-finance2 options put/call ratio, D-11 thresholds, null on zero callOI or error
- `src/lib/data/source-package.ts` — fetchSentimentIntelligence() aggregator, 9th Promise.allSettled entry, settle() fallback
- `src/lib/data/__tests__/stocktwits.test.ts` — 8 vitest tests covering null paths, computation, is_trending, URL encoding
- `src/lib/data/__tests__/options-sentiment.test.ts` — 9 vitest tests covering null paths, ratio computation, D-11 thresholds
- `src/lib/__tests__/research-brief.test.ts` — basePackage fixture updated with sentiment_intelligence field

## Decisions Made

- `null` (not `0`) returned for bull/bear pct when zero messages have sentiment labels — null signals "no data available", 0 would imply "0% bullish" which is incorrect
- `is_trending` derived from `Math.abs(sentiment_change) > 0.5` since the StockTwits API has no dedicated is_trending flag (verified from live API test against GME)
- yahoo-finance2 used via default export as object (`yahooFinance as any).options()`) rather than `new YahooFinance()` constructor to enable clean vitest module mocking — `.options()` exists on the default export function object at runtime
- `reddit_tone: null` in SentimentIntelligenceSection — this field is set qualitatively by Gemini analysis in Plan 02, not fetched from any API in Plan 01

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] research-brief.test.ts fixture broke when SourcePackage gained required sentiment_intelligence field**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** Existing `basePackage` fixture in research-brief.test.ts was missing the new required `sentiment_intelligence` field — TypeScript error TS2741
- **Fix:** Added null-populated `sentiment_intelligence` object to the fixture
- **Files modified:** src/lib/__tests__/research-brief.test.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** ad97340 (Task 1 commit)

**2. [Rule 1 - Bug] Test stubs used jest globals instead of vitest**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** Plan-specified test stubs used `jest.fn()`, `jest.mock()`, `jest.clearAllMocks()` — project uses vitest (`vi.fn()`, `vi.mock()`, `vi.clearAllMocks()`)
- **Fix:** Rewrote both test stubs using `import { describe, it, expect, beforeEach, vi } from 'vitest'`; replaced all `jest.*` calls with `vi.*`
- **Files modified:** src/lib/data/__tests__/stocktwits.test.ts, src/lib/data/__tests__/options-sentiment.test.ts
- **Verification:** `npx vitest run` 17 tests pass
- **Committed in:** ad97340 (Task 1 commit)

**3. [Rule 1 - Bug] options-sentiment.ts constructor pattern prevented vitest mock from working**
- **Found during:** Task 4 verification (running tests)
- **Issue:** `const yahooFinance = new YahooFinance(...)` at module level (or inside function) executed before vitest replaced the module mock — `new` on the mocked plain object `{ options: vi.fn() }` threw TypeError, causing all non-null tests to hit the catch block and return null
- **Fix:** Changed to import yahoo-finance2 default export directly and call `(yahooFinance as any).options(ticker)` — the default export has `.options()` as a method accessible without `new` (confirmed via Node.js introspection)
- **Files modified:** src/lib/data/options-sentiment.ts
- **Verification:** 9 options-sentiment tests GREEN
- **Committed in:** e043352 (fix commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs in test setup, 1 Rule 1 bug in module-level instantiation blocking tests)
**Impact on plan:** All auto-fixes necessary for correctness and test infrastructure. No scope creep. Implementation logic unchanged from plan spec.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required. StockTwits API is public (no key). yahoo-finance2 uses existing project dependency.

## Known Stubs

- `reddit_tone: null` in `SentimentIntelligenceSection` — intentional placeholder. This field is set qualitatively by Gemini in Plan 02 after analyzing community content. It is not null because of missing implementation — the value is Gemini-derived and does not come from a direct API call.

## Next Phase Readiness

- `SentimentIntelligenceSection` type contract is established — Plan 02 (Gemini prompt extension) and Plan 03 (UI) can import and use it
- `collectAllData()` now always returns `sentiment_intelligence` — downstream consumers get the field without any conditional checks
- 17 tests GREEN — behavioral contracts for null paths and computation logic are verified
- TypeScript compiles clean with 0 errors

---
*Phase: 13-deep-sentiment-intelligence*
*Completed: 2026-04-19*

## Self-Check: PASSED

- All 7 key files exist on disk
- All 6 task commits verified in git log (ad337ad, ad97340, 1f9a59b, 4065fa7, 7720864, e043352)
- `npx tsc --noEmit` exits 0
- 17 vitest tests passing
