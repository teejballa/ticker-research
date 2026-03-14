---
phase: 01-data-pipeline
plan: 01
subsystem: testing
tags: [nextjs, typescript, vitest, yahoo-finance2, anthropic-sdk, tailwind, tdd]

# Dependency graph
requires: []
provides:
  - "Next.js 15 + TypeScript project scaffold running on localhost"
  - "SourcePackage canonical type contracts (6 section types + assembled_at)"
  - "Wave 0 TDD test stubs: 4 test files, 13 failing tests covering TICK-01 through DATA-08"
  - "Vitest 3.x test infrastructure operational"
  - "All Phase 1 runtime dependencies installed (yahoo-finance2, @anthropic-ai/sdk, lightweight-charts, use-debounce, zod)"
affects:
  - 01-02-PLAN
  - 01-03-PLAN
  - 01-04-PLAN
  - 01-05-PLAN

# Tech tracking
tech-stack:
  added:
    - next@15.3.9
    - yahoo-finance2@3.13.2
    - "@anthropic-ai/sdk@0.78.0"
    - lightweight-charts@5.1.0
    - use-debounce@10.1.0
    - zod@3.24.2
    - vitest@3.0.9
    - "@vitejs/plugin-react@4.3.4"
    - "@vitest/coverage-v8@3.0.9"
    - tailwindcss@4
  patterns:
    - "Wave 0 TDD stubs: test files use dynamic await import() so runner collects tests before implementation files exist"
    - "SourceSection base interface: all data sections extend SourceSection with collected_at + optional error field"
    - "Graceful degradation: collection_errors array on SourcePackage captures partial failures without halting pipeline"

key-files:
  created:
    - src/lib/types.ts
    - src/lib/data/anthropic-search.test.ts
    - src/lib/data/source-package.test.ts
    - src/app/api/research/route.test.ts
    - vitest.config.ts
    - .env.example
  modified:
    - package.json
    - package-lock.json
    - .gitignore

key-decisions:
  - "Next.js 16.1.6 (latest npm tag) downgraded to 15.3.9 — v16 is an unreleased canary missing index.d.ts type declarations"
  - "Wave 0 stubs use dynamic await import() — allows test runner to collect and fail tests at runtime rather than crashing at parse time"
  - "SourceSection base interface with optional error field enables graceful degradation pattern across all collectors"

patterns-established:
  - "TDD-first: test stubs precede all implementation files — each plan (01-03, 01-04, 01-05) makes its stubs pass"
  - "Timestamp discipline: every section must carry collected_at as ISO 8601 string (requirement DATA-07)"
  - "Null-safe fields: all optional numeric/string data fields typed as T | null, not undefined"

requirements-completed: [DATA-07, DATA-08]

# Metrics
duration: 25min
completed: 2026-03-12
---

# Phase 1 Plan 01: Project Scaffold and Wave 0 Test Stubs Summary

**Next.js 15 + TypeScript scaffold with SourcePackage type contracts and 13 Wave 0 TDD failing stubs covering all Phase 1 requirements (TICK-01 through DATA-08)**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-12T14:11:00Z
- **Completed:** 2026-03-12T21:24:32Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Next.js 15.3.9 + TypeScript project scaffold running on localhost:3000
- Canonical SourcePackage type with 6 section types (MarketData, Fundamentals, News, AnalystSentiment, SecFilingSummary, SocialSentiment) each with collected_at
- 4 test stub files, 13 Wave 0 failing tests discovered and run by vitest (no framework crashes)
- Vitest 3.x configured with path aliases (@/) matching Next.js tsconfig

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Next.js 15 project and install dependencies** - `143f02f` (chore)
2. **Task 2 (prior run): types.ts + yahoo.test.ts** - `9231212` (partial — types.ts and yahoo.test.ts)
3. **Task 2 (completion): remaining Wave 0 test stubs** - `1f93367` (test)
4. **Auto-fix: Next.js 16 downgrade** - `be678c0` (fix)

**Plan metadata:** (docs commit — see below)

_Note: Tasks 1 and partial Task 2 were committed in a prior execution run. This run completed Task 2 with the remaining 3 test stub files._

## Files Created/Modified
- `src/lib/types.ts` - SourcePackage, SourceSection, and all 6 section type interfaces; ChartDataPoint and TickerSearchResult
- `src/lib/data/yahoo.test.ts` - 5 Wave 0 stubs for TICK-01, TICK-02, DATA-01, DATA-02 (searchTickers x2, fetchChartData, fetchMarketData, fetchFundamentals)
- `src/lib/data/anthropic-search.test.ts` - 4 Wave 0 stubs for DATA-03, DATA-04, DATA-05, DATA-06 (fetchNews, fetchAnalystSentiment, fetchSecFilingSummary, fetchSocialSentiment)
- `src/lib/data/source-package.test.ts` - 3 Wave 0 stubs for DATA-07, DATA-08 (collectAllData with 6 sections, graceful degradation)
- `src/app/api/research/route.test.ts` - 1 Wave 0 stub for TICK-03 (400 on unconfirmed ticker)
- `vitest.config.ts` - Vitest config with @vitejs/plugin-react and @/* path alias
- `.env.example` - Documents ANTHROPIC_API_KEY as only required env var
- `package.json` - All Phase 1 runtime + dev dependencies, test/test:watch scripts

## Decisions Made
- Downgraded Next.js from 16.1.6 (the npm `latest` tag) to 15.3.9 stable — v16 is an unreleased canary without `index.d.ts`, causing TS7016 errors across the project
- Wave 0 test stubs use `await import('./module')` inside each `it()` block so the test runner collects and starts tests before failing at the dynamic import — avoids setup crashes
- SourceSection base interface uses `error?: string` (optional) so sections can signal partial collection failure while still carrying their collected_at timestamp

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Downgraded Next.js 16.1.6-canary to Next.js 15.3.9 stable**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** `npm install next` resolved to 16.1.6 (the current `latest` tag on npm). Next 16 is an unreleased canary that ships without `index.d.ts` type declarations, causing TS7016 errors in next.config.ts, app layout, and .next/dev/types/validator.ts
- **Fix:** Ran `npm install next@15.3.9 --save` to pin to the stable Next.js 15 release as specified in the plan objective
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx tsc --noEmit` no longer shows TS7016 errors; only expected Wave 0 TS2307 stub errors remain
- **Committed in:** be678c0

---

**Total deviations:** 1 auto-fixed (Rule 1 - incorrect scaffolded dependency version)
**Impact on plan:** Required for correct TypeScript compilation. No scope creep — replaced canary version with the stable version the plan specified.

## Issues Encountered
- `npm install next@latest` resolved to Next 16 canary — a known gotcha when the npm `latest` tag points to an unreleased major. Always pin the major version when installing Next.js.

## User Setup Required

ANTHROPIC_API_KEY is the only required environment variable. The user must:
1. Copy `.env.example` to `.env.local`
2. Set `ANTHROPIC_API_KEY` from https://console.anthropic.com/

No service dashboards or webhooks need to be configured for this plan.

## Next Phase Readiness
- All downstream plans (01-02 through 01-05) have test stubs to make green
- Type contracts in src/lib/types.ts are locked — implement to these interfaces
- Plan 01-03 (yahoo.ts) makes yahoo.test.ts pass
- Plan 01-04 (anthropic-search.ts) makes anthropic-search.test.ts pass
- Plan 01-05 (source-package.ts + route.ts) makes source-package.test.ts and route.test.ts pass
- No blockers for next plan

## Self-Check

### Files Verified
- [x] src/lib/types.ts — FOUND
- [x] src/lib/data/yahoo.test.ts — FOUND
- [x] src/lib/data/anthropic-search.test.ts — FOUND
- [x] src/lib/data/source-package.test.ts — FOUND
- [x] src/app/api/research/route.test.ts — FOUND
- [x] vitest.config.ts — FOUND
- [x] .env.example — FOUND

### Commits Verified
- [x] 143f02f — scaffold (prior run)
- [x] 9231212 — types + yahoo stub (prior run)
- [x] 1f93367 — remaining Wave 0 stubs
- [x] be678c0 — Next.js downgrade fix

## Self-Check: PASSED

---
*Phase: 01-data-pipeline*
*Completed: 2026-03-12*
