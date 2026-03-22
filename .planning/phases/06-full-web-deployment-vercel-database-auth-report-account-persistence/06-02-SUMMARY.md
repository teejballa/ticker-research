---
phase: 06-full-web-deployment-vercel-database-auth-report-account-persistence
plan: 02
subsystem: auth-ui
tags: [nextauth, signin-page, nav-identity, deployment-mode, tailwind, playwright]

requires:
  - phase: 06-01
    provides: auth-foundation (authOptions, NextAuth handler, middleware, DEPLOYMENT_MODE gate)

provides:
  - Custom /auth/signin page — terminal aesthetic, amber header, ghost button, Suspense wrapper
  - NavBar nav-identity renders CONNECTED AS {email} truncated at 24 chars
  - setup/status route web-mode branch returning NextAuth session email
  - SetupWizard guarded by NEXT_PUBLIC_DEPLOYMENT_MODE in page.tsx

affects: [06-03, 06-04]

tech-stack:
  added: []
  patterns:
    - NEXT_PUBLIC_DEPLOYMENT_MODE client-side guard for conditional SetupWizard rendering
    - export const dynamic = 'force-dynamic' on routes needing runtime session evaluation
    - Suspense boundary wrapping useSearchParams in client components (Next.js 15 requirement)

key-files:
  created:
    - src/app/auth/signin/page.tsx
    - src/app/auth/signin/layout.tsx
  modified:
    - src/components/NavBar.tsx
    - src/app/api/setup/status/route.ts
    - src/app/page.tsx

key-decisions:
  - "Suspense wrapper required around useSearchParams in Next.js 15 App Router client components to avoid static prerendering error"
  - "NEXT_PUBLIC_DEPLOYMENT_MODE used for client-side SetupWizard guard (DEPLOYMENT_MODE is server-only in Next.js)"
  - "export const dynamic = 'force-dynamic' added to setup/status route so session is evaluated at request time not build time"

requirements-completed: [WEB-SIGNIN-UI, WEB-NAV-IDENTITY]

duration: ~10min
completed: 2026-03-21
---

# Phase 6 Plan 2: Custom Sign-In UI & NavIdentity Summary

**Custom /auth/signin page with terminal aesthetic (amber header, ghost button, flat container), NavBar rendering CONNECTED AS {email}, and DEPLOYMENT_MODE-gated SetupWizard — all 4 Playwright auth tests passing.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-03-21
- **Tasks:** 3 (plus human-verify checkpoint)
- **Files modified:** 5

## Accomplishments

- `/auth/signin` renders at `#080a0f` background with amber "TICKER RESEARCH // AUTHENTICATION REQUIRED" header, `[ CONNECT GOOGLE ACCOUNT ]` ghost button with amber hover, no border-radius — fully matches UI-SPEC terminal aesthetic
- NavBar `data-testid="nav-identity"` span now renders "CONNECTED AS {email}" (truncated at 24 chars with ellipsis) when email is present; falls back to `user@equinfo.io`
- `setup/status` route has web-mode early return: `getServerSession(authOptions)` returns session email; local Python/notebooklm checks fully skipped in web mode
- SetupWizard preserved in codebase per CONTEXT.md locked decision; `NEXT_PUBLIC_DEPLOYMENT_MODE === 'web'` guard suppresses rendering in web mode

## Task Commits

Each task was committed atomically:

1. **Task 1: Custom sign-in page /auth/signin** - `3d29dc8` (feat)
2. **Task 2: NavBar CONNECTED AS email + web-mode session** - `6ff26ba` (feat)
3. **Task 3: Hide SetupWizard in web mode** - `7e84f21` (feat)

## Files Created/Modified

- `src/app/auth/signin/page.tsx` — Custom NextAuth sign-in page; Suspense + useSearchParams; terminal dark background; amber header; ghost outline button; error state for ?error= param
- `src/app/auth/signin/layout.tsx` — Segment layout exporting metadata with `title: 'Equinfo — Sign In'`
- `src/components/NavBar.tsx` — `navIdentityText` derived from `userEmail`; renders "CONNECTED AS {truncated}" or fallback
- `src/app/api/setup/status/route.ts` — Web-mode early return added at top of GET(); `getServerSession(authOptions)`; `export const dynamic = 'force-dynamic'`
- `src/app/page.tsx` — `isWebMode` guard; `showWizard` additionally gates on `!isWebMode`

## Decisions Made

- **Suspense wrapper** — `useSearchParams()` requires a Suspense boundary in Next.js 15 App Router; without it the build fails with a static prerendering error. Solution: outer `SignIn` component wraps `SignInContent` in `<Suspense fallback={null}>`.
- **`NEXT_PUBLIC_DEPLOYMENT_MODE` for client component** — `page.tsx` is `'use client'`, so `process.env.DEPLOYMENT_MODE` (server-only) is not available. Used `NEXT_PUBLIC_DEPLOYMENT_MODE` public env var for the client-side guard. This must be set alongside `DEPLOYMENT_MODE=web` in Vercel environment config.
- **`export const dynamic = 'force-dynamic'`** — Required on setup/status route so the NextAuth session is evaluated per-request, not baked into static build output.

## Deviations from Plan

None — plan executed exactly as written. All implementations matched the specified patterns in the plan actions section.

## Issues Encountered

None — TypeScript clean (only pre-existing preflight.test.ts errors unrelated to this plan), all 4 Playwright auth tests passed on first run, all 2 vitest unit tests passed.

## Next Phase Readiness

- Sign-in page UI complete — ready for Phase 6 Plan 3 (Neon-backed report history)
- `authOptions` available in setup/status route and any future API route needing session
- DEPLOYMENT_MODE guard pattern established for future web-mode branches
- Note: Vercel deployment must set BOTH `DEPLOYMENT_MODE=web` AND `NEXT_PUBLIC_DEPLOYMENT_MODE=web` for SetupWizard to be hidden on the client side

## Self-Check: PASSED

Files confirmed on disk:
- src/app/auth/signin/page.tsx — FOUND
- src/app/auth/signin/layout.tsx — FOUND
- src/components/NavBar.tsx — FOUND
- src/app/api/setup/status/route.ts — FOUND
- src/app/page.tsx — FOUND

Commits confirmed:
- 3d29dc8: feat(06-02): custom sign-in page /auth/signin with terminal aesthetic
- 6ff26ba: feat(06-02): NavBar CONNECTED AS email + web-mode session in setup/status
- 7e84f21: feat(06-02): hide SetupWizard in web mode via DEPLOYMENT_MODE guard

---
*Phase: 06-full-web-deployment-vercel-database-auth-report-account-persistence*
*Completed: 2026-03-21*
