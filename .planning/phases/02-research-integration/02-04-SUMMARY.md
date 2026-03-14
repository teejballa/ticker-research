---
phase: 02-research-integration
plan: "04"
subsystem: api
tags: [sse, streaming, python-subprocess, nextjs, typescript, analysisresult]

# Dependency graph
requires:
  - phase: 02-research-integration
    provides: "02-02: Python notebooklm_research.py script with PROGRESS/RESULT/ERROR stdout protocol"
  - phase: 02-research-integration
    provides: "02-03: Setup wizard, research brief formatter, analysis route stubs"
provides:
  - AnalysisResult, AnalysisSignal, BuySellBreakdown, AnalysisSource TypeScript interfaces in types.ts
  - POST /api/analysis/[ticker] SSE route spawning notebooklm_research.py and streaming events
  - ResearchProgress client component with 6-step progress list and auto-transition
  - Research page client-side state machine (idle/analyzing/complete/error)
  - Full test coverage for analysis route (3 passing), AnalysisResult schema (3 passing), ResearchProgress stubs (3 passing)
affects:
  - 03-report-output (AnalysisResult interface, research page complete state are Phase 3 integration points)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SSE streaming: child_process.spawn stdout line reader → ReadableStream with text/event-stream content type"
    - "Wave 0 TDD stubs: dynamic import in it() blocks so vitest collects before failing at runtime"
    - "Client state machine: useParams/useSearchParams for URL-driven state in Next.js App Router client component"
    - "beforeunload warning: addEventListener in useEffect with cleanup on state change"

key-files:
  created:
    - src/app/api/analysis/[ticker]/route.ts
    - src/components/ResearchProgress.tsx
    - src/app/api/analysis/__tests__/route.test.ts
    - src/lib/__tests__/analysis-result.test.ts
    - src/components/__tests__/ResearchProgress.test.tsx
  modified:
    - src/lib/types.ts
    - src/app/research/[ticker]/page.tsx

key-decisions:
  - "Research page converted from async server component to 'use client' component to support URL-driven analysis state machine"
  - "ResearchProgress step matching uses lowercase substring match on PROGRESS: messages for loose coupling to Python script output format"
  - "Analysis route closes stream on RESULT or ERROR, emits error event on non-zero exit code"
  - "Rate limit error message shown verbatim per CONTEXT.md spec: 'NotebookLM daily limit reached. Resets at midnight PST — try again tomorrow.'"

patterns-established:
  - "SSE route pattern: spawn Python script → buffer stdout → split on newlines → parse PROGRESS/RESULT/ERROR prefixes → enqueue encoded SSE events"
  - "ResearchProgress: onComplete/onError callback props for parent-controlled state transitions"

requirements-completed:
  - RSRCH-02
  - RSRCH-03
  - RSRCH-04
  - RSRCH-05
  - RSRCH-06
  - RSRCH-07

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 2 Plan 04: Research Integration Layer Summary

**Next.js SSE analysis route with Python subprocess spawning, ResearchProgress 6-step streaming UI, and client-side state machine wiring SourcePackage file to AnalysisResult for Phase 3 rendering**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-13T18:43:47Z
- **Completed:** 2026-03-13T18:46:47Z
- **Tasks:** 3 of 3 complete
- **Files modified:** 7

## Accomplishments

- AnalysisResult TypeScript interfaces added to types.ts — all 4 types exported
- POST /api/analysis/[ticker] streams SSE events from Python stdout with 10-minute maxDuration
- ResearchProgress component renders 6 named steps with check/spinner/pending icons, auto-calls onComplete
- Research page state machine: loading → idle (chart) / analyzing → complete (AnalysisResult) / error
- 62 total tests passing (analysis route: 3, schema stubs: 3, ResearchProgress stubs: 3)

## Task Commits

Each task was committed atomically:

1. **Task 1: AnalysisResult types, analysis API route, Wave 0 test stubs** - `7bb185e` (feat)
2. **Task 2: ResearchProgress component and research page wiring** - `2b401e0` (feat)
3. **Task 3: Human verification — end-to-end Phase 2 flow confirmed** - `4dd9478` (docs)

**Plan metadata:** `de283cf` (docs: complete research integration layer plan)

_Note: Task 1 used TDD pattern — types and implementation were created together with tests._

## Files Created/Modified

- `src/lib/types.ts` - Added AnalysisSignal, BuySellBreakdown, AnalysisSource, AnalysisResult interfaces
- `src/app/api/analysis/[ticker]/route.ts` - POST SSE route: spawns Python script, streams PROGRESS/RESULT/ERROR events
- `src/components/ResearchProgress.tsx` - 6-step streaming progress component with onComplete/onError callbacks
- `src/app/research/[ticker]/page.tsx` - Converted to client component with full idle/analyzing/complete/error state machine
- `src/app/api/analysis/__tests__/route.test.ts` - 3 passing tests: progress, result, error SSE events (mocked spawn)
- `src/lib/__tests__/analysis-result.test.ts` - 3 passing schema stubs with inline fixture JSON
- `src/components/__tests__/ResearchProgress.test.tsx` - 3 stubs (pass after Task 2 creates component)

## Decisions Made

- Research page converted from async server component to `'use client'` to support `useParams`/`useSearchParams` + analysis state machine
- ResearchProgress uses substring matching on PROGRESS: messages (case-insensitive) for loose coupling
- Analysis route tracks `closed` boolean to guard against double-close of ReadableStream controller
- Rate limit error shown verbatim per CONTEXT.md locked decision
- beforeunload warning fires only during `analyzing` state, removed on state change

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled clean on first attempt. All tests passed as expected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AnalysisResult interface is the input contract for Phase 3 report rendering
- Research page `complete` state renders a `<pre>` JSON block as placeholder — Phase 3 replaces this with the formatted report
- Human verification (Task 3) approved — full end-to-end Phase 2 flow confirmed working
- All SSE plumbing and type contracts are stable for Phase 3 to build on

---
*Phase: 02-research-integration*
*Completed: 2026-03-13*
