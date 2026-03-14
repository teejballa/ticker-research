---
phase: 01-data-pipeline
plan: 04
subsystem: api
tags: [anthropic, web-search, typescript, vitest, mocking]

# Dependency graph
requires:
  - phase: 01-data-pipeline/01-01
    provides: "Project scaffold, types.ts with NewsSection, AnalystSentimentSection, SecFilingSummarySection, SocialSentimentSection"
provides:
  - "fetchNews(ticker) — returns NewsSection with recent news headlines via Anthropic web search"
  - "fetchAnalystSentiment(ticker) — returns AnalystSentimentSection with consensus and price targets"
  - "fetchSecFilingSummary(ticker) — returns SecFilingSummarySection with 10-K and 10-Q summaries"
  - "fetchSocialSentiment(ticker) — returns SocialSentimentSection with overall tone and signals"
affects:
  - 01-data-pipeline/01-05 (source-package assembler imports all four functions)
  - 02-research-integration (research brief formats data from these sections)

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk (already installed)", "web_search_20250305 tool type"]
  patterns:
    - "Anthropic SDK auto-reads ANTHROPIC_API_KEY from environment — no manual key passing"
    - "max_uses: 3 on every web_search tool call to cap cost"
    - "parseJsonFromResponse strips markdown code fences before JSON.parse"
    - "All functions catch errors and return typed fallback objects with error field"
    - "vi.mock('@anthropic-ai/sdk') at top of test file with mockResolvedValue for mocked client"

key-files:
  created:
    - src/lib/data/anthropic-search.ts
  modified:
    - src/lib/data/anthropic-search.test.ts

key-decisions:
  - "claude-3-5-haiku-latest chosen for cost efficiency on data extraction tasks (not claude-3-5-sonnet)"
  - "max_uses: 3 per function = max 12 web searches per full research run = ~$0.04/request estimate"
  - "Graceful fallback pattern: catch all errors, return typed object with error field — no unhandled rejections"
  - "vi.mock hoisting ensures Anthropic SDK is mocked before module imports in test files"
  - "parseJsonFromResponse handles markdown code fences that models sometimes wrap JSON in"

patterns-established:
  - "extractTextContent: filters response.content for text blocks, returns last one"
  - "parseJsonFromResponse<T>: strips code fences, JSON.parse with type assertion, returns null on failure"
  - "Error handling: catch(err) returns typed section with all fields as null/empty + error message"

requirements-completed: [DATA-03, DATA-04, DATA-05, DATA-06]

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 1 Plan 04: Anthropic Web Search Data Collection Summary

**Four Anthropic web search functions (fetchNews, fetchAnalystSentiment, fetchSecFilingSummary, fetchSocialSentiment) covering DATA-03 through DATA-06 using claude-3-5-haiku-latest with max_uses: 3 cost control**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-13T00:50:00Z
- **Completed:** 2026-03-13T00:51:01Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Implemented all four Anthropic web search data collection functions with full type safety
- All 4 Vitest tests pass using mocked Anthropic SDK — zero real API calls during test suite
- Every function caps web searches at max_uses: 3, controlling cost to ~$0.04/full research request
- ANTHROPIC_API_KEY appears only in server-side code, read automatically by SDK from environment

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Anthropic web search functions with mocked tests** - `c206ab6` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `src/lib/data/anthropic-search.ts` - Four exported async functions for DATA-03 through DATA-06
- `src/lib/data/anthropic-search.test.ts` - Four mocked tests, all passing

## Decisions Made
- **claude-3-5-haiku-latest** used for all four functions for cost efficiency (Haiku vs Sonnet for structured data extraction)
- **max_uses: 3** on every `web_search_20250305` tool definition — 4 functions × 3 max searches = 12 max web calls per research run, estimated ~$0.04/request
- **Graceful fallback pattern** applied consistently: all functions catch errors and return typed objects with `error` field set, no unhandled rejections reach callers
- **parseJsonFromResponse utility** strips markdown code fences before JSON.parse — handles cases where the model wraps JSON in triple-backtick blocks
- **vi.mock hoisting**: `vi.mock('@anthropic-ai/sdk')` at module top ensures the SDK is mocked before the module under test is imported; `vi.resetModules()` in `beforeEach` provides isolation between describe blocks that use dynamic `await import()`

## Deviations from Plan

None — the implementation and test files were pre-staged as Wave 0 stubs and exactly matched the plan's specified code. Tests passed on first run.

## Issues Encountered
- Pre-existing TypeScript errors in other files (yahoo.ts, source-package.test.ts, route files) were detected during `npx tsc --noEmit`. These are out-of-scope for this plan — zero TS errors exist in `anthropic-search.ts`. Deferred to their respective plan executions.

## User Setup Required
None — no external service configuration required. ANTHROPIC_API_KEY must be set in environment at runtime but is not needed for the test suite.

## Next Phase Readiness
- All four Anthropic search functions ready to be imported by `src/lib/data/source-package.ts` (plan 01-05)
- Import pattern expected by 01-05: `import { fetchNews, fetchAnalystSentiment, fetchSecFilingSummary, fetchSocialSentiment } from './anthropic-search'`
- Functions compose with yahoo.ts functions (fetchMarketData, fetchFundamentals) to form the complete SourcePackage

## Self-Check: PASSED
- src/lib/data/anthropic-search.ts: FOUND
- src/lib/data/anthropic-search.test.ts: FOUND
- commit c206ab6: FOUND

---
*Phase: 01-data-pipeline*
*Completed: 2026-03-12*
