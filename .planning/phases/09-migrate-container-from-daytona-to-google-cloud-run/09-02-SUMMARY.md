---
phase: 09-migrate-container-from-daytona-to-google-cloud-run
plan: 02
subsystem: api
tags: [env-vars, container, cloud-run, vercel, testing]

requires:
  - phase: 09-migrate-container-from-daytona-to-google-cloud-run
    provides: "Plan 01 renamed container env vars from DAYTONA_* to CONTAINER_* in the container server"

provides:
  - "All three Vercel route files use CONTAINER_URL, CONTAINER_SECRET, CONTAINER_VNC_URL"
  - "All route files send x-container-secret header (not x-daytona-secret)"
  - "Test files updated to match new env var names and DEPLOYMENT_MODE=web"
  - "Full test suite passing (129 tests)"

affects: [09-03, deployment, container-routing]

tech-stack:
  added: []
  patterns:
    - "CONTAINER_URL / CONTAINER_SECRET / CONTAINER_VNC_URL as canonical env var names for container communication"
    - "x-container-secret header for container auth (replaces x-daytona-secret)"

key-files:
  created: []
  modified:
    - src/app/api/analysis/[ticker]/route.ts
    - src/app/api/setup/nbm-auth/route.ts
    - src/app/api/setup/nbm-auth/status/route.ts
    - src/app/api/analysis/__tests__/route.test.ts
    - tests/unit/analysis-web-mode.test.ts

key-decisions:
  - "CONTAINER_URL / CONTAINER_SECRET / CONTAINER_VNC_URL replace DAYTONA_CONTAINER_URL / DAYTONA_SECRET / DAYTONA_VNC_URL across all Vercel route files"
  - "x-container-secret header replaces x-daytona-secret for container auth"
  - "Web-mode tests mock next-auth, @/lib/auth, user-credential-db, credentials, and fs/promises to isolate route logic without external dependencies"

patterns-established:
  - "All container env vars use CONTAINER_ prefix — consistent with Plan 01 container server"
  - "Test files for web-mode routes must mock: next-auth/next, @/lib/auth, @/lib/user-credential-db, @/lib/credentials, fs/promises"

requirements-completed: [GCR-02]

duration: 8min
completed: 2026-04-01
---

# Phase 09 Plan 02: Vercel Route Env Var Rename Summary

**Renamed all DAYTONA_* env vars to CONTAINER_* and x-daytona-secret to x-container-secret across three Vercel route files and two test files, with full test suite passing at 129 tests**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-01T19:56:00Z
- **Completed:** 2026-04-01T19:58:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Renamed DAYTONA_CONTAINER_URL -> CONTAINER_URL in all three Vercel route files (analysis route, nbm-auth, nbm-auth/status)
- Renamed DAYTONA_SECRET -> CONTAINER_SECRET, DAYTONA_VNC_URL -> CONTAINER_VNC_URL, x-daytona-secret -> x-container-secret
- Updated both test files: route.test.ts (DEPLOYMENT_MODE=cloud -> web, DAYTONA_CONTAINER_URL -> CONTAINER_URL, added next-auth/auth/db mocks) and analysis-web-mode.test.ts (same env var renames + header rename)
- Fixed fetch URL assertion in route.test.ts to match actual route path (/analyze/AAPL not /api/analysis/AAPL)
- Full suite: 129 tests pass, 0 failures

## Task Commits

1. **Task 1: Rename DAYTONA_* to CONTAINER_* in all three Vercel route files** - `d3a0e4c` (feat)
2. **Task 2: Update analysis route test — CONTAINER_URL rename + DEPLOYMENT_MODE=web fix** - `35e8ce0` (feat)

## Files Created/Modified

- `src/app/api/analysis/[ticker]/route.ts` - CONTAINER_URL, CONTAINER_SECRET, x-container-secret; updated comment
- `src/app/api/setup/nbm-auth/route.ts` - CONTAINER_URL, CONTAINER_SECRET, CONTAINER_VNC_URL, x-container-secret; updated comment
- `src/app/api/setup/nbm-auth/status/route.ts` - CONTAINER_URL, CONTAINER_SECRET, x-container-secret; updated comment
- `src/app/api/analysis/__tests__/route.test.ts` - DEPLOYMENT_MODE=web, CONTAINER_URL, fixed URL assertion, added 5 vi.mock() blocks
- `tests/unit/analysis-web-mode.test.ts` - CONTAINER_URL, CONTAINER_SECRET, x-container-secret

## Decisions Made

- Mocked next-auth, @/lib/auth, @/lib/user-credential-db, @/lib/credentials, and fs/promises at the top of route.test.ts so web-mode tests can run without Prisma or encryption keys in test environment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed analysis-web-mode.test.ts also using old DAYTONA_* env var names**
- **Found during:** Task 2 (running full npm test after editing route.test.ts)
- **Issue:** `tests/unit/analysis-web-mode.test.ts` had `DAYTONA_CONTAINER_URL`, `DAYTONA_SECRET`, and `x-daytona-secret` assertions — these caused 2 test failures in the full suite since the route no longer reads those names
- **Fix:** Updated all three occurrences in the test's beforeEach env setup and fetch header assertion to match renamed vars
- **Files modified:** tests/unit/analysis-web-mode.test.ts
- **Verification:** `npm test` exits 0, 129 tests pass
- **Committed in:** 35e8ce0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug)
**Impact on plan:** Necessary fix — test file not listed in plan's rename table but referenced old names; fixing it was required for `npm test` to pass.

## Issues Encountered

None beyond the deviation above.

## Known Stubs

None.

## User Setup Required

None — env var renames are documented in Plan 01 (GCR-01) Vercel configuration steps. Operators must update Vercel dashboard: rename `DAYTONA_CONTAINER_URL` to `CONTAINER_URL`, `DAYTONA_SECRET` to `CONTAINER_SECRET`, `DAYTONA_VNC_URL` to `CONTAINER_VNC_URL`.

## Next Phase Readiness

- Plan 03 can proceed: container Dockerfile and Cloud Run deployment configuration
- All Vercel routes now use CONTAINER_* names consistently with the container server (Plan 01)
- Zero DAYTONA_ references remain anywhere under src/app/api/

---
*Phase: 09-migrate-container-from-daytona-to-google-cloud-run*
*Completed: 2026-04-01*
