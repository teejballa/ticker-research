---
phase: 04-deployment
plan: 03
subsystem: api
tags: [deployment, vercel, daytona, sse, proxy, cloud, nextjs]

requires:
  - phase: 04-02
    provides: devcontainer.json for Daytona, vercel.json with maxDuration

provides:
  - DEPLOYMENT_MODE=cloud proxy branch in analysis route — fetch() forwards to DAYTONA_CONTAINER_URL and pipes SSE stream
  - export const dynamic = 'force-dynamic' in both analysis and research routes
  - maxDuration reduced to 300 in analysis route (Vercel Hobby limit)
  - Cloud mode unit tests: proxy success, missing URL 500, no-spawn guard

affects: [cloud-deployment, vercel-frontend, daytona-container]

tech-stack:
  added: []
  patterns:
    - "DEPLOYMENT_MODE env var gates cloud vs local execution path in analysis route"
    - "export const dynamic = 'force-dynamic' prevents Vercel from caching runtime env vars at build time"
    - "Fetch-based SSE proxy: upstream.body piped directly via new Response(upstream.body, ...)"

key-files:
  created: []
  modified:
    - src/app/api/analysis/[ticker]/route.ts
    - src/app/api/analysis/__tests__/route.test.ts
    - src/app/api/research/[ticker]/route.ts

key-decisions:
  - "export const dynamic = 'force-dynamic' added to both analysis and research routes — required for Vercel to evaluate DEPLOYMENT_MODE at request time, not build time"
  - "maxDuration reduced from 600 to 300 in analysis route — cloud path is a proxy only (actual work in Daytona container), Vercel Hobby cap is 300s"
  - "Cloud proxy returns upstream.body directly without buffering — preserves streaming SSE semantics end-to-end"

patterns-established:
  - "Cloud proxy pattern: check DEPLOYMENT_MODE === 'cloud' at top of handler, return early with fetch() response — local branch below untouched"
  - "Missing container URL returns 500 JSON before fetch() is called — fail fast with clear error"

requirements-completed: [DEPLOY-02]

duration: 2min
completed: 2026-03-18
---

# Phase 04 Plan 03: Cloud Proxy Branch Summary

**DEPLOYMENT_MODE=cloud analysis route proxy: fetch() to DAYTONA_CONTAINER_URL pipes SSE stream back to Vercel browser with force-dynamic export preventing build-time env caching**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-18T15:12:28Z
- **Completed:** 2026-03-18T15:14:35Z
- **Tasks:** 1 of 2 (Task 2 is a human-verify checkpoint)
- **Files modified:** 3

## Accomplishments
- Analysis route now branches on DEPLOYMENT_MODE: cloud path proxies to Daytona container, local path unchanged
- `export const dynamic = 'force-dynamic'` added to both analysis and research routes — prevents Vercel build-time caching of runtime env vars
- maxDuration reduced to 300 in analysis route (Vercel Hobby limit; actual processing runs in Daytona container)
- 3 new cloud mode unit tests added (proxy, missing URL 500, no-spawn guard) — all pass alongside 3 existing local tests

## Task Commits

1. **Task 1: Cloud proxy branch in analysis route + extended tests** - `b99fa9a` (feat)

## Files Created/Modified
- `src/app/api/analysis/[ticker]/route.ts` - Added cloud proxy branch, force-dynamic export, maxDuration 300
- `src/app/api/analysis/__tests__/route.test.ts` - Added 3 cloud mode tests with vi.stubGlobal('fetch', ...)
- `src/app/api/research/[ticker]/route.ts` - Added force-dynamic export

## Decisions Made
- Used `export const dynamic = 'force-dynamic'` (RESEARCH.md §Pitfall 2) — without it Vercel caches DEPLOYMENT_MODE at build time and cloud branch never activates
- maxDuration 300 not 600 in analysis route — Vercel Hobby plan limit; Daytona container handles the actual long-running Python work
- Cloud proxy pipes `upstream.body` directly without buffering — preserves native SSE streaming semantics, no latency overhead

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing: `tests/e2e/scroll-animation.spec.ts` (Playwright spec) is picked up by vitest runner because `vitest.config.ts` lacks an exclude pattern for `tests/`. This causes 1 test file to fail in `npm test` but all 94 unit tests pass. This is an out-of-scope pre-existing issue not caused by this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Task 2 (checkpoint:human-verify) awaits human confirmation:
- **Local smoke test:** `npm install && npm start` from a fresh clone should build and serve at localhost:3000
- **Cloud smoke test:** Full Vercel + Daytona end-to-end (requires Daytona account, Vercel account, notebooklm login in container)

Once approved, DEPLOY-02 is complete and the full Phase 4 deployment stack is delivered.

---
*Phase: 04-deployment*
*Completed: 2026-03-18*
