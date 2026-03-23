---
phase: 06-full-web-deployment-vercel-database-auth-report-account-persistence
plan: "04"
subsystem: infra
tags: [prisma, neon, postgres, vercel, nextauth, google-oauth, migrations, env-vars]

requires:
  - phase: 06-01
    provides: NextAuth auth config, Prisma schema, middleware, prisma.config.ts
  - phase: 06-02
    provides: sign-in page UI, NavIdentity component
  - phase: 06-03
    provides: Neon persistence functions (writeReportToDb, listReportsFromDb, readReportFromDb)

provides:
  - Initial Prisma migration committed to repo (prisma/migrations/20260323015956_init/)
  - vercel.json with prisma migrate deploy && next build build command
  - .env.local.example documenting all Phase 6 env vars with sourcing instructions
  - Merged /api/history/[filename] route handling both local and web modes
  - vitest configured to exclude tests/e2e/ so Playwright specs don't pollute unit runs
  - Full test suite green: TypeScript clean, 106 vitest tests passing, 4 Playwright auth tests

affects: [vercel-deployment, neon-database, google-oauth]

tech-stack:
  added: []
  patterns:
    - "Prisma 7 migrate dev requires env vars loaded from .env.local before running (no dotenv auto-load)"
    - "Single dynamic route [filename] handles dual-mode (local filesystem + web Neon) via DEPLOYMENT_MODE guard"
    - "vitest exclude pattern required to prevent Playwright spec files being collected as unit tests"

key-files:
  created:
    - prisma/migrations/20260323015956_init/migration.sql
    - prisma/migrations/migration_lock.toml
  modified:
    - vercel.json
    - .env.local.example
    - .env.example
    - src/app/api/history/[filename]/route.ts
    - src/lib/__tests__/preflight.test.ts
    - vitest.config.ts

key-decisions:
  - "Prisma 7 migrate dev requires DATABASE_URL/DIRECT_URL in process.env — must export from .env.local before running migration, not rely on dotenv auto-loading"
  - "Merged [id] and [filename] routes into single [filename]/route.ts — Next.js 15 rejects two dynamic segments at same path level with different names"
  - "vitest exclude: ['tests/e2e/**'] required — Playwright test.describe() causes 'not expected here' error when collected by vitest runner"
  - "preflight.test.ts BASE_ENV uses spread process.env as base so NODE_ENV satisfies TypeScript ProcessEnv type"

requirements-completed: [WEB-DEPLOY, WEB-ENV]

duration: 21min
completed: "2026-03-22"
---

# Phase 6 Plan 04: Deployment Config & Migration Summary

**Prisma migration generated against Neon, vercel.json configured with prisma migrate deploy build command, full test suite green (106 unit + 4 Playwright auth tests)**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-03-22T06:54:44Z
- **Completed:** 2026-03-22T07:15:00Z
- **Tasks:** 2 auto tasks + 2 checkpoint approvals
- **Files modified:** 7

## Accomplishments

- Generated initial Prisma migration (`prisma/migrations/20260323015956_init/migration.sql`) against live Neon database — `CREATE TABLE "reports"` with composite index committed to repo so `prisma migrate deploy` on Vercel has something to apply
- Configured `vercel.json` with `buildCommand: "prisma migrate deploy && next build"` and preserved existing 300s function timeouts for analysis and research routes
- Updated `.env.local.example` with full Phase 6 env var documentation: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL, DATABASE_URL, DIRECT_URL, DEPLOYMENT_MODE — each with sourcing instructions
- Fixed three auto-discovered issues blocking test suite: route slug conflict, TypeScript ProcessEnv type, vitest collecting Playwright files

## Task Commits

Each task was committed atomically:

1. **Task 1: Generate Prisma migration, create vercel.json, update .env.local.example** - `5af0a5e` (feat)
2. **Task 2: Full test suite — TypeScript + vitest + Playwright; fix failures** - `0c87a34` (fix)

## Files Created/Modified

- `prisma/migrations/20260323015956_init/migration.sql` - Initial CREATE TABLE reports DDL
- `prisma/migrations/migration_lock.toml` - Prisma migration lock file
- `vercel.json` - Added buildCommand: "prisma migrate deploy && next build"
- `.env.local.example` - Phase 6 env vars section with Google OAuth, NextAuth, Neon instructions
- `.env.example` - Aligned with .env.local.example Phase 6 additions
- `src/app/api/history/[filename]/route.ts` - Merged [filename] + [id] routes into one dual-mode handler
- `src/lib/__tests__/preflight.test.ts` - Fixed BASE_ENV type using spread process.env
- `vitest.config.ts` - Added exclude: ['tests/e2e/**'] to prevent Playwright spec collection

## Decisions Made

- **Prisma 7 env loading:** `npx prisma migrate dev` doesn't auto-load `.env.local` — must `export $(grep -v '^#' .env.local ...)` before running. This is a Prisma 7 behavior change from prior versions.
- **Route merge strategy:** Rather than rename `[id]` to `[filename]`, merged both handlers into the existing `[filename]/route.ts` with DEPLOYMENT_MODE guard. Local mode keeps filename validation regex; web mode does Neon + auth lookup.
- **vitest isolation:** e2e tests in `tests/e2e/` now excluded from vitest glob. They are run only via `npx playwright test`. This prevents the "test.describe() not expected here" error that occurs when vitest tries to execute Playwright API calls.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma 7 env loading requires explicit export before migrate dev**
- **Found during:** Task 1 (Prisma migration)
- **Issue:** `npx prisma migrate dev` failed with `PrismaConfigEnvError: Cannot resolve environment variable: DIRECT_URL` — prisma.config.ts uses `env('DIRECT_URL')` but Prisma 7 reads process.env directly, not .env.local
- **Fix:** Loaded .env.local vars into environment with `export $(grep -v '^#' .env.local | xargs)` before running migration
- **Files modified:** None (runtime fix, no file change needed)
- **Verification:** Migration ran successfully, `prisma/migrations/20260323015956_init/` created
- **Committed in:** 5af0a5e (Task 1 commit)

**2. [Rule 3 - Blocking] Next.js 15 rejects two dynamic segments at same path level**
- **Found during:** Task 2 (Playwright test — dev server failed to start)
- **Issue:** `src/app/api/history/[filename]/` and `src/app/api/history/[id]/` coexisted — Next.js 15 throws "You cannot use different slug names for the same dynamic path ('filename' !== 'id')"
- **Fix:** Merged `[id]/route.ts` (web/Neon mode) into `[filename]/route.ts` (local mode) with DEPLOYMENT_MODE guard; deleted `[id]/route.ts`
- **Files modified:** `src/app/api/history/[filename]/route.ts` (merged), `src/app/api/history/[id]/route.ts` (deleted)
- **Verification:** Dev server starts cleanly; Playwright auth tests pass
- **Committed in:** 0c87a34 (Task 2 commit)

**3. [Rule 1 - Bug] TypeScript ProcessEnv type error in preflight test**
- **Found during:** Task 2 (TypeScript compile)
- **Issue:** `preflight.test.ts` BASE_ENV typed as `Record<string, string>` — `spawnSync` requires `ProcessEnv` which requires `NODE_ENV`, TypeScript error TS2769
- **Fix:** Changed BASE_ENV to spread `process.env` as base (`{ ...process.env, PATH: ..., ANTHROPIC_API_KEY: ... }`) typed as `NodeJS.ProcessEnv`
- **Files modified:** `src/lib/__tests__/preflight.test.ts`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 0c87a34 (Task 2 commit)

**4. [Rule 1 - Bug] vitest collecting Playwright spec files**
- **Found during:** Task 2 (vitest run)
- **Issue:** vitest glob picked up `tests/e2e/*.spec.ts` — Playwright `test.describe()` call throws "Playwright Test did not expect test.describe() to be called here" inside vitest runner; 6 test file failures
- **Fix:** Added `exclude: ['tests/e2e/**', 'node_modules/**']` to vitest.config.ts test options
- **Files modified:** `vitest.config.ts`
- **Verification:** `npm run test` runs 16 test files (106 tests), all passing, no e2e files collected
- **Committed in:** 0c87a34 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 blocking env issue, 1 blocking route conflict, 2 bugs)
**Impact on plan:** All fixes necessary for deployment correctness and test suite validity. No scope creep.

## Issues Encountered

- Prisma 7 changed how env vars are resolved — `env()` helper reads process.env directly rather than auto-loading .env files. This is documented in the decision log.
- The `[filename]`/`[id]` route conflict was introduced during Plan 03 execution when the `[id]` route was added alongside the existing `[filename]` route. Merged cleanly with no behavior change.

## Next Phase Readiness

Phase 6 is fully complete. The project is ready for Vercel deployment:

1. Push to GitHub (`git push origin main`)
2. Create Vercel project → import repo
3. Set env vars in Vercel (see `.env.local.example` Phase 6 section + `NEXT_PUBLIC_DEPLOYMENT_MODE=web`)
4. Add production redirect URI to Google OAuth: `https://your-app.vercel.app/api/auth/callback/google`
5. Deploy — Vercel runs `prisma migrate deploy && next build` automatically

No blockers. All Phase 6 requirements met.

---
*Phase: 06-full-web-deployment-vercel-database-auth-report-account-persistence*
*Completed: 2026-03-22*
