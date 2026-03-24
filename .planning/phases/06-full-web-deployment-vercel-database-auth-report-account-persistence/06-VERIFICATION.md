---
phase: 06-full-web-deployment-vercel-database-auth-report-account-persistence
verified: 2026-03-23T04:09:28Z
status: gaps_found
score: 23/24 must-haves verified
re_verification: false
gaps:
  - truth: "SetupWizard is hidden in web mode"
    status: partial
    reason: "page.tsx guards on NEXT_PUBLIC_DEPLOYMENT_MODE, but .env.local.example only documents DEPLOYMENT_MODE=web — NEXT_PUBLIC_DEPLOYMENT_MODE is absent from the env template, so a deployer following the template will not set it and SetupWizard will show in web mode"
    artifacts:
      - path: "src/app/page.tsx"
        issue: "Uses NEXT_PUBLIC_DEPLOYMENT_MODE for client-side guard (correct), but env template does not document this var"
      - path: ".env.local.example"
        issue: "Documents DEPLOYMENT_MODE=web but is missing NEXT_PUBLIC_DEPLOYMENT_MODE=web — deployers following this template will not set the public var, leaving SetupWizard visible in web mode"
    missing:
      - "Add NEXT_PUBLIC_DEPLOYMENT_MODE=web entry to .env.local.example (and .env.example) in the Phase 6 section, alongside DEPLOYMENT_MODE=web"
human_verification:
  - test: "Google OAuth sign-in completes successfully in web mode"
    expected: "User is redirected to / after approving Google OAuth consent, session email appears in NavBar as 'CONNECTED AS user@gmail.com'"
    why_human: "Google OAuth requires real credentials and browser interaction — cannot be automated without live OAuth tokens"
  - test: "Report persists to Neon and appears in history after analysis completes in web mode"
    expected: "After running analysis in web mode, visiting / shows the new report in the report history list"
    why_human: "Requires live Neon database connection, real analysis pipeline, and authenticated session — integration flow cannot be verified statically"
  - test: "SetupWizard is absent on / in web mode after fix is applied"
    expected: "With both DEPLOYMENT_MODE=web and NEXT_PUBLIC_DEPLOYMENT_MODE=web set, the SetupWizard component does not render on the home page"
    why_human: "Client-side conditional rendering depends on runtime env var; visual confirmation needed"
---

# Phase 6: Full Web Deployment — Verification Report

**Phase Goal:** Full web deployment — Vercel, Database, Auth, Report & Account Persistence
**Verified:** 2026-03-23T04:09:28Z
**Status:** gaps_found (1 gap)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Unauthenticated requests in web mode redirect to /auth/signin | VERIFIED | `src/middleware.ts` line 11: `DEPLOYMENT_MODE !== 'web'` returns `NextResponse.next()`; web mode calls `withAuth({ pages: { signIn: '/auth/signin' } })`. Playwright WEB-01 test passing. |
| 2 | Authenticated users can access all routes without redirection | ? HUMAN | Local mode passthrough confirmed in code; full OAuth session flow requires human testing |
| 3 | Prisma client connects to Neon via serverless adapter | VERIFIED | `src/lib/db.ts`: `PrismaNeon({ connectionString: process.env.DATABASE_URL! })` singleton pattern. Migration in `prisma/migrations/20260323015956_init/` applied against live Neon. |
| 4 | NextAuth Google OAuth session exposes user email server-side | VERIFIED | `src/lib/auth.ts`: GoogleProvider + JWT strategy; `getServerSession(authOptions)` used correctly in `history/route.ts`, `setup/status/route.ts`, `history/[filename]/route.ts` |
| 5 | Local mode is completely unaffected by all new code | VERIFIED | Middleware returns `NextResponse.next()` when `DEPLOYMENT_MODE !== 'web'`. History route uses dynamic import for Prisma. All 106 vitest tests pass (local mode paths exercise). |
| 6 | Sign-in page renders at /auth/signin with terminal aesthetic | VERIFIED | `src/app/auth/signin/page.tsx` contains "TICKER RESEARCH // AUTHENTICATION REQUIRED", "[ CONNECT GOOGLE ACCOUNT ]", `backgroundColor: '#080a0f'`. 4 Playwright auth tests pass. |
| 7 | NavIdentity renders 'CONNECTED AS {email}' in web mode | VERIFIED | `src/components/NavBar.tsx` line 42: `` `CONNECTED AS ${displayEmail}` `` with 24-char truncation. `setup/status/route.ts` returns `userEmail` from `getServerSession` in web mode. |
| 8 | SetupWizard is hidden in web mode | PARTIAL | Code guards on `NEXT_PUBLIC_DEPLOYMENT_MODE`, which is correct for a client component. However, `.env.local.example` only documents `DEPLOYMENT_MODE=web` — `NEXT_PUBLIC_DEPLOYMENT_MODE=web` is absent from the template. A deployer following the template will not set the public var, leaving SetupWizard visible in web mode. |
| 9 | writeReportToDb persists a StoredReport to Neon per authenticated user | VERIFIED | `src/lib/reports-db.ts` exports `writeReportToDb(result, userId)` calling `prisma.report.create` with `user_id`. 6 unit tests pass including `expect(mockCreate).toHaveBeenCalledOnce()`. |
| 10 | listReportsFromDb returns only the user's reports, newest first | VERIFIED | `listReportsFromDb(userId)` calls `prisma.report.findMany({ where: { user_id: userId }, orderBy: { analyzed_at: 'desc' } })`. Unit tests verify scoping and ordering. |
| 11 | readReportFromDb returns a single report scoped to user_id | VERIFIED | `readReportFromDb(id, userId)` uses `prisma.report.findFirst({ where: { id, user_id: userId } })` — mismatch throws, caller returns 404. Security test confirmed. |
| 12 | In web mode, /api/history reads from Neon for the authenticated user | VERIFIED | `src/app/api/history/route.ts` line 14: DEPLOYMENT_MODE guard; dynamic import of `listReportsFromDb`; getServerSession guard returns 401 if no session. history-route unit tests pass (3 tests). |
| 13 | In local mode, /api/history is completely unchanged | VERIFIED | Dynamic import ensures Prisma never loads in local mode. Static import of `listReports` from `@/lib/reports` unchanged at top of file. History-route test verifies no static Prisma import. |
| 14 | In web mode, /api/analysis/[ticker] persists AnalysisResult to Neon | VERIFIED | `src/app/api/analysis/[ticker]/route.ts` line 105: RESULT handler has `if (DEPLOYMENT_MODE === 'web')` branch calling `writeReportToDb`. Dynamic imports prevent Prisma loading in local mode. |
| 15 | GET /api/history/[id] returns the report for the authenticated owner | VERIFIED | `src/app/api/history/[filename]/route.ts` (merged route): DEPLOYMENT_MODE guard, getServerSession, `readReportFromDb(filename, session.user.email)`. Returns 404 on local mode or user mismatch. |
| 16 | vercel.json documents build command with prisma migrate deploy | VERIFIED | `vercel.json` line 3: `"buildCommand": "prisma migrate deploy && next build"` |
| 17 | .env.local.example includes all Phase 6 env vars | PARTIAL/GAP | Contains GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL, DATABASE_URL, DIRECT_URL, DEPLOYMENT_MODE. Missing: `NEXT_PUBLIC_DEPLOYMENT_MODE`. |
| 18 | A Prisma migration exists so prisma migrate deploy has something to apply | VERIFIED | `prisma/migrations/20260323015956_init/migration.sql` contains `CREATE TABLE "reports"`. `migration_lock.toml` committed. |
| 19 | Full test suite exits 0 | VERIFIED | 16 vitest test files, 106 tests: all pass. 4 Playwright auth tests: all pass. TypeScript: `npx tsc --noEmit` exits 0. |

**Score:** 23/24 truths verified (1 partial gap, 2 human-only items all automated checks passed)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | reports table definition | VERIFIED | `model Report` with all required fields, composite index on `(user_id, analyzed_at)` |
| `src/lib/auth.ts` | NextAuth authOptions with Google provider and JWT strategy | VERIFIED | GoogleProvider, JWT strategy, `/auth/signin` page, jwt+session callbacks for accessToken |
| `src/lib/db.ts` | Prisma client singleton with Neon adapter | VERIFIED | `PrismaNeon({ connectionString })` singleton; global guard prevents hot-reload duplication |
| `src/middleware.ts` | DEPLOYMENT_MODE-gated NextAuth middleware | VERIFIED | Two-branch design: local no-op, web mode withAuth |
| `src/types/next-auth.d.ts` | Session type augmentation adding accessToken | VERIFIED | `accessToken?: string` on both Session and JWT interfaces |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth App Router handler | VERIFIED | `export { handler as GET, handler as POST }` |
| `src/app/auth/signin/page.tsx` | Custom NextAuth sign-in page matching terminal aesthetic | VERIFIED | Amber header, ghost button, Suspense wrapper, `data-testid="signin-root"` |
| `src/app/auth/signin/layout.tsx` | Segment layout setting 'Cipher — Sign In' page title | VERIFIED | `title: 'Cipher — Sign In'` |
| `src/components/NavBar.tsx` | NavBar with CONNECTED AS {email} in web mode | VERIFIED | `navIdentityText` with truncation logic, `data-testid="nav-identity"` span updated |
| `src/app/api/setup/status/route.ts` | Web-mode branch returning NextAuth session email | VERIFIED | `getServerSession(authOptions)` in web-mode early return; `export const dynamic = 'force-dynamic'` |
| `src/app/page.tsx` | SetupWizard hidden in web mode via DEPLOYMENT_MODE guard | PARTIAL | Guard present (`NEXT_PUBLIC_DEPLOYMENT_MODE`) but env template doesn't document the var |
| `src/lib/reports-db.ts` | Neon-backed report persistence functions | VERIFIED | All three functions exported, user_id-scoped, security throw on mismatch |
| `src/app/api/history/route.ts` | DEPLOYMENT_MODE-switched history API | VERIFIED | Dynamic import for Prisma, local mode fallback preserved |
| `src/app/api/history/[filename]/route.ts` | Merged dual-mode route (local filename + web Neon) | VERIFIED | DEPLOYMENT_MODE guard, readReportFromDb, session check, 404 on local mode |
| `src/app/api/analysis/[ticker]/route.ts` | Extended analysis route persisting to Neon in web mode | VERIFIED | writeReportToDb called in RESULT handler, web-mode branch with dynamic import |
| `vercel.json` | Vercel deployment config with build command | VERIFIED | `prisma migrate deploy && next build`, preserved function timeouts |
| `.env.local.example` | Template for all required env vars including Phase 6 additions | PARTIAL | Missing `NEXT_PUBLIC_DEPLOYMENT_MODE=web` — required for SetupWizard client-side guard |
| `prisma/migrations/` | Initial migration file for prisma migrate deploy | VERIFIED | `20260323015956_init/migration.sql` with `CREATE TABLE "reports"` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/middleware.ts` | `/auth/signin` | withAuth redirect when session missing | VERIFIED | `pages: { signIn: '/auth/signin' }` in withAuth call (line 17) |
| `src/lib/auth.ts` | GoogleProvider | NextAuthOptions providers array | VERIFIED | `import GoogleProvider` + providers array line 9 |
| `src/lib/db.ts` | PrismaNeon | adapter constructor | VERIFIED | `PrismaNeon({ connectionString: process.env.DATABASE_URL! })` |
| `src/app/auth/signin/page.tsx` | `signIn('google', { callbackUrl })` | button onClick handler | VERIFIED | Line 35: `onClick={() => signIn('google', { callbackUrl })}` |
| `src/components/NavBar.tsx` | `CONNECTED AS` | nav-identity span | VERIFIED | Line 42: template literal `CONNECTED AS ${displayEmail}` |
| `src/app/api/setup/status/route.ts` | `getServerSession(authOptions)` | web mode branch | VERIFIED | Line 115: `getServerSession(authOptions)` in `DEPLOYMENT_MODE === 'web'` branch |
| `src/app/page.tsx` | SetupWizard | DEPLOYMENT_MODE guard | PARTIAL | Guard uses `NEXT_PUBLIC_DEPLOYMENT_MODE` (correct for client component) but env template only documents `DEPLOYMENT_MODE=web` |
| `src/app/api/analysis/[ticker]/route.ts` | `src/lib/reports-db.ts` | writeReportToDb call in RESULT event | VERIFIED | Line 105: dynamic import + `writeReportToDb(data, sess.user.email)` |
| `src/app/api/history/route.ts` | `src/lib/reports-db.ts` | listReportsFromDb call in web mode branch | VERIFIED | Line 21: dynamic import + `listReportsFromDb(session.user.email)` |
| `src/app/api/history/[filename]/route.ts` | `src/lib/reports-db.ts` | readReportFromDb scoped to session user_id | VERIFIED | Line 21: dynamic import + `readReportFromDb(filename, session.user.email)` |
| `src/lib/reports-db.ts` | `src/lib/db.ts` | prisma client import | VERIFIED | Line 4: `import { prisma } from '@/lib/db'` |
| `vercel.json` | `prisma/migrations/` | prisma migrate deploy applies committed migrations | VERIFIED | buildCommand contains `prisma migrate deploy`; migration file exists |
| `.env.local.example` | `src/lib/auth.ts` | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL | VERIFIED | All four vars present in env template |

---

## Requirements Coverage

The PLAN files for Phase 6 use internal requirement IDs (WEB-AUTH, WEB-DB, etc.) that are not tracked in `.planning/REQUIREMENTS.md`. REQUIREMENTS.md's traceability table ends at Phase 5 — Phase 6 requirements are defined entirely within the PLAN frontmatter. The following table maps plan-level IDs to verification status:

| Requirement ID | Source Plan | Description | Status | Evidence |
|----------------|-------------|-------------|--------|----------|
| WEB-AUTH | 06-01 | NextAuth Google OAuth with JWT sessions | SATISFIED | `src/lib/auth.ts` + NextAuth handler verified |
| WEB-DB | 06-01 | Prisma/Neon database with reports schema | SATISFIED | `prisma/schema.prisma`, `src/lib/db.ts` verified |
| WEB-MIDDLEWARE | 06-01 | DEPLOYMENT_MODE-gated auth middleware | SATISFIED | `src/middleware.ts` local no-op + web withAuth verified |
| WEB-SIGNIN-UI | 06-02 | Custom terminal aesthetic /auth/signin page | SATISFIED | Sign-in page verified; 4 Playwright tests pass |
| WEB-NAV-IDENTITY | 06-02 | NavBar renders 'CONNECTED AS {email}' in web mode | SATISFIED | NavBar updated; setup/status returns session email |
| WEB-PERSISTENCE | 06-03 | Neon-backed report persistence (CRUD functions) | SATISFIED | `reports-db.ts` all three functions verified with unit tests |
| WEB-HISTORY | 06-03 | History and analysis routes switch to Neon in web mode | SATISFIED | Both routes verified; WEB-05 unit tests pass |
| WEB-DEPLOY | 06-04 | Vercel deployment config with prisma migrate deploy | SATISFIED | `vercel.json` verified |
| WEB-ENV | 06-04 | Environment variable documentation for web mode | PARTIAL | `.env.local.example` missing `NEXT_PUBLIC_DEPLOYMENT_MODE=web` |

**REQUIREMENTS.md coverage note:** REQUIREMENTS.md traceability table does not include Phase 6. The Phase 6 requirement IDs (WEB-*) are internal to the plan files and not orphaned — they are fully claimed by plans 01–04. No orphaned requirements detected.

---

## Anti-Patterns Found

No blocking anti-patterns found. No TODO/FIXME/placeholder comments in Phase 6 files. No empty stub implementations. No Wave 0 placeholder assertions remain (`expect(true).toBe(true)` not present in either test file).

---

## Human Verification Required

### 1. Google OAuth sign-in end-to-end

**Test:** With `DEPLOYMENT_MODE=web`, `NEXT_PUBLIC_DEPLOYMENT_MODE=web`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` all set — visit `http://localhost:3000` in a browser, confirm redirect to `/auth/signin`, click `[ CONNECT GOOGLE ACCOUNT ]`, complete the Google OAuth flow.
**Expected:** Successful sign-in redirects to `/`, NavBar shows `CONNECTED AS {your-email}` with email truncated to 24 chars.
**Why human:** Google OAuth requires real credentials, browser interaction, and a running dev server with valid OAuth redirect URIs.

### 2. Report persists to Neon and appears in history

**Test:** While authenticated (from test 1), run an analysis on a ticker in web mode. After the SSE stream completes, return to `/` and look at the report history list.
**Expected:** New report appears in history list for the authenticated user. Reloading the page (new session) should still show the report (confirmed Neon persistence).
**Why human:** Requires live Neon database, real analysis pipeline execution, authenticated session — cannot be verified statically.

### 3. SetupWizard absent in web mode (after gap fix)

**Test:** After adding `NEXT_PUBLIC_DEPLOYMENT_MODE=web` to `.env.local.example` and setting it in the environment, run `npm run dev` and visit `http://localhost:3000` while authenticated.
**Expected:** SetupWizard is not rendered. Home page shows ticker input and report history only.
**Why human:** Client-side conditional rendering on runtime env var; visual confirmation needed to distinguish SetupWizard absence.

---

## Gaps Summary

**1 gap found** — deployment documentation gap for `NEXT_PUBLIC_DEPLOYMENT_MODE`.

`page.tsx` correctly uses `NEXT_PUBLIC_DEPLOYMENT_MODE` (the public Next.js env var) for its client-side SetupWizard guard, because `DEPLOYMENT_MODE` (server-only) is not accessible in client components. This was correctly identified and implemented in Plan 02. However, the `.env.local.example` template only documents `DEPLOYMENT_MODE=web` — it is missing the companion `NEXT_PUBLIC_DEPLOYMENT_MODE=web` entry.

The 06-02-SUMMARY.md explicitly called out: "Vercel deployment must set BOTH `DEPLOYMENT_MODE=web` AND `NEXT_PUBLIC_DEPLOYMENT_MODE=web` for SetupWizard to be hidden on the client side." This warning was not propagated to the env template file, which is the authoritative deployment reference for users.

**Impact:** A deployer following `.env.local.example` as their Vercel env var checklist will set `DEPLOYMENT_MODE=web` but not `NEXT_PUBLIC_DEPLOYMENT_MODE=web`. Result: SetupWizard renders for authenticated web users, prompting them to install Python/notebooklm-py which is irrelevant (and impossible) in web mode. This is a UX defect, not a security issue.

**Fix:** One-line addition to `.env.local.example` in the Phase 6 section, immediately after `DEPLOYMENT_MODE=web`:
```
NEXT_PUBLIC_DEPLOYMENT_MODE=web
```

All other phase goals are fully achieved. The auth foundation (WEB-AUTH, WEB-DB, WEB-MIDDLEWARE), sign-in UI (WEB-SIGNIN-UI, WEB-NAV-IDENTITY), persistence layer (WEB-PERSISTENCE, WEB-HISTORY), and deployment config (WEB-DEPLOY) are complete and verified. The gap is isolated to the env var documentation for WEB-ENV.

---

_Verified: 2026-03-23T04:09:28Z_
_Verifier: Claude (gsd-verifier)_
