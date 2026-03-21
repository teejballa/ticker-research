---
phase: 06-full-web-deployment-vercel-database-auth-report-account-persistence
plan: 03
subsystem: database
tags: [prisma, neon, nextauth, nextjs, api, persistence, sse]

# Dependency graph
requires:
  - phase: 06-01
    provides: Prisma client singleton (db.ts), NextAuth authOptions, Report schema with user_id index

provides:
  - Neon-backed report persistence layer (reports-db.ts) with writeReportToDb, listReportsFromDb, readReportFromDb
  - DEPLOYMENT_MODE-switched /api/history route (web=Neon, local=filesystem)
  - GET /api/history/[id] route for fetching single reports by ID in web mode
  - DEPLOYMENT_MODE-switched /api/analysis/[ticker] RESULT handler persisting to Neon in web mode
  - Real unit tests for WEB-03, WEB-04, WEB-05 (replacing Wave 0 placeholders)

affects: [06-04, web-frontend-history, report-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dynamic import for Prisma in web-mode branches prevents loading @prisma/client in local mode (no DATABASE_URL)
    - user_id is always session.user.email — private per-user data isolation at DB query level
    - readReportFromDb throws on null (not found or user_id mismatch) — treated identically as 404 for security
    - IIFE async pattern in SSE stdout callback enables await for DB persist without changing event emitter signature

key-files:
  created:
    - src/lib/reports-db.ts
    - src/app/api/history/[id]/route.ts
    - tests/unit/reports-db.test.ts (replaced Wave 0 placeholder)
    - tests/unit/history-route.test.ts (replaced Wave 0 placeholder)
  modified:
    - src/app/api/history/route.ts
    - src/app/api/analysis/[ticker]/route.ts

key-decisions:
  - "Dynamic import for @/lib/reports-db in history route ensures Prisma never loads in local mode (safe for users with no DATABASE_URL)"
  - "readReportFromDb throws when user_id mismatches — caller returns 404, preventing report enumeration attacks"
  - "Analysis route RESULT handler: web mode uses dynamic imports for reports-db + next-auth to avoid loading Prisma in local builds"

patterns-established:
  - "DEPLOYMENT_MODE guard pattern: if (DEPLOYMENT_MODE === 'web') { dynamic import + Neon } else { existing local path }"
  - "Per-user data isolation: all DB queries include user_id from session.user.email in WHERE clause"

requirements-completed: [WEB-PERSISTENCE, WEB-HISTORY]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 06 Plan 03: Neon Report Persistence Layer Summary

**Neon-backed report CRUD (writeReportToDb/listReportsFromDb/readReportFromDb) with DEPLOYMENT_MODE-gated history API and per-user data isolation via session email**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T18:24:28Z
- **Completed:** 2026-03-21T18:27:00Z
- **Tasks:** 3 completed
- **Files modified:** 6

## Accomplishments

- Implemented `reports-db.ts` with three Prisma-backed functions scoped to `user_id`
- Switched `/api/history` to read from Neon in web mode using dynamic import (safe for local mode)
- Extended `/api/analysis/[ticker]` RESULT handler to persist reports to Neon in web mode
- Created `GET /api/history/[id]` route gated by DEPLOYMENT_MODE and NextAuth session
- Replaced all Wave 0 placeholder tests with real unit tests (9 total passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/lib/reports-db.ts with Neon persistence functions** - `ad16d1d` (feat + test TDD)
2. **Task 2: Switch history route and analysis route to Neon in web mode** - `381ab65` (feat)
3. **Task 3: Create GET /api/history/[id] route** - `ecbec14` (feat)

## Files Created/Modified

- `src/lib/reports-db.ts` - Neon report persistence: writeReportToDb, listReportsFromDb, readReportFromDb (all user_id-scoped)
- `src/app/api/history/route.ts` - DEPLOYMENT_MODE-switched history list endpoint
- `src/app/api/analysis/[ticker]/route.ts` - RESULT handler extended with web mode Neon persist branch
- `src/app/api/history/[id]/route.ts` - New: single report fetch (web mode only, session-gated, user-scoped)
- `tests/unit/reports-db.test.ts` - Real assertions for WEB-03/WEB-04 (6 tests, all green)
- `tests/unit/history-route.test.ts` - Real assertions for WEB-05 DEPLOYMENT_MODE guard (3 tests, all green)

## Decisions Made

- **Dynamic import for reports-db in history route:** Using `await import('@/lib/reports-db')` instead of a top-level static import ensures Prisma is never loaded when DEPLOYMENT_MODE is not `web`. Static import would crash local users with no DATABASE_URL.
- **readReportFromDb throws on null:** Security choice — user_id mismatch and genuine not-found are treated identically (both return 404), preventing report enumeration attacks.
- **Analysis route dynamic imports:** The RESULT handler in the SSE stream uses dynamic imports for both `reports-db` and `next-auth` to avoid loading Prisma in local builds where it would fail.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `src/lib/__tests__/preflight.test.ts` (SpawnSync env type issues) — confirmed pre-existing before our changes, out of scope per deviation rules. Deferred to `deferred-items.md`.

## Next Phase Readiness

- Report persistence layer complete for web mode
- Authenticated users will have reports stored in Neon and retrievable at `/api/history`
- Individual reports accessible at `GET /api/history/[id]` in web mode
- Plan 06-04 can build on these endpoints for the frontend history/account page

---
*Phase: 06-full-web-deployment-vercel-database-auth-report-account-persistence*
*Completed: 2026-03-21*
