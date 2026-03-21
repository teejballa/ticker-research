---
phase: 06-full-web-deployment-vercel-database-auth-report-account-persistence
plan: 01
subsystem: auth-database-foundation
tags: [nextauth, prisma, neon, middleware, google-oauth, jwt]
dependency_graph:
  requires: []
  provides: [auth-foundation, prisma-schema, neon-adapter, deployment-mode-middleware]
  affects: [06-02, 06-03, 06-04]
tech_stack:
  added: [next-auth@4.24.13, prisma@7.5.0, @prisma/client@7.5.0, @prisma/adapter-neon@7.5.0, @neondatabase/serverless@1.0.2]
  patterns: [JWT-session-strategy, Prisma-7-config-file, PrismaNeon-PoolConfig, DEPLOYMENT_MODE-gate]
key_files:
  created:
    - prisma/schema.prisma
    - prisma.config.ts
    - src/lib/auth.ts
    - src/lib/db.ts
    - src/middleware.ts
    - src/types/next-auth.d.ts
    - src/app/api/auth/[...nextauth]/route.ts
    - tests/e2e/auth.spec.ts
    - tests/unit/reports-db.test.ts
    - tests/unit/history-route.test.ts
  modified:
    - package.json (added postinstall: prisma generate; new deps)
    - .planning/phases/06-full-web-deployment-vercel-database-auth-report-account-persistence/06-CONTEXT.md (Option C decision)
decisions:
  - "Option C dual-login adopted: NextAuth Google OAuth for app auth + separate notebooklm login per user for analysis identity"
  - "Prisma 7 breaking change: url/directUrl moved from schema datasource to prisma.config.ts"
  - "PrismaNeon@7 adapter takes PoolConfig not Pool instance"
  - "user_id = session.user.email (stable string, no sub ID)"
  - "middleware DEPLOYMENT_MODE guard: !== 'web' returns NextResponse.next() — local mode is complete no-op"
metrics:
  duration: "279s (~5 min)"
  completed: "2026-03-21"
  tasks: 3
  files: 10
---

# Phase 6 Plan 1: Auth & Database Foundation Summary

**One-liner:** NextAuth Google OAuth with JWT sessions, Prisma 7 Neon adapter singleton, and DEPLOYMENT_MODE-gated middleware — complete auth/db foundation for web deployment.

## What Was Built

### Decision: Option C Dual-Login (Checkpoint resolved)

The plan opened with a `checkpoint:decision` about the notebooklm-py identity model. User chose **Option C**: users log in twice — first with Google OAuth via NextAuth for app authentication, then a separate `notebooklm login` (browser cookie capture) for their own NotebookLM identity. CONTEXT.md was updated to supersede the locked "one sign-in covers both" decision.

### Task 1: Dependencies + Wave 0 Test Stubs

Installed:
- `next-auth@4.24.13` — Google OAuth for app authentication
- `prisma@7.5.0`, `@prisma/client@7.5.0`, `@prisma/adapter-neon@7.5.0`, `@neondatabase/serverless@1.0.2` — Neon serverless database

Added `postinstall: prisma generate` to `package.json` — ensures Prisma client is generated on Vercel builds.

Created Wave 0 test stubs (all passing):
- `tests/e2e/auth.spec.ts` — WEB-01 unauthenticated redirect, WEB-07 terminal sign-in page aesthetics
- `tests/unit/reports-db.test.ts` — WEB-03/04 placeholder for Plan 03 implementation
- `tests/unit/history-route.test.ts` — WEB-05 placeholder for Plan 03 DEPLOYMENT_MODE guard

### Task 2: Foundation Files

Five new files establishing the auth/db foundation:

**`prisma/schema.prisma`** — `Report` model: UUID id, user_id text, ticker, company_name, analyzed_at (Timestamptz), market_sentiment, confidence_level, analysis (Json). Compound index on `(user_id, analyzed_at DESC)`.

**`prisma.config.ts`** — Prisma 7 config (connection URLs moved here from schema per Prisma 7 API). Uses `datasource.url = env('DIRECT_URL')` for migrations.

**`src/lib/auth.ts`** — `authOptions` with Google provider, `jwt` strategy, custom `/auth/signin` page, `jwt`+`session` callbacks to thread `accessToken` through for Daytona proxy.

**`src/lib/db.ts`** — Prisma singleton using `PrismaNeon({ connectionString })` (Prisma 7 `PoolConfig` API). Global singleton prevents hot-reload duplication.

**`src/types/next-auth.d.ts`** — Module augmentation adding `accessToken?: string` to both `Session` and `JWT` interfaces.

**`src/app/api/auth/[...nextauth]/route.ts`** — NextAuth App Router catch-all handler.

### Task 3: DEPLOYMENT_MODE-Gated Middleware

`src/middleware.ts` with explicit two-branch design:
- `DEPLOYMENT_MODE !== 'web'` → `NextResponse.next()` — complete no-op, local users always unaffected
- `DEPLOYMENT_MODE === 'web'` → `withAuth({ pages: { signIn: '/auth/signin' } })` — all routes gate on active session

Matcher excludes `/api/auth/*`, `/_next/static`, `/_next/image`, `favicon.ico`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma 7 schema datasource URL fields removed**
- **Found during:** Task 2 (`prisma generate` failure)
- **Issue:** Prisma 7 no longer supports `url`/`directUrl` in the `datasource` block of `schema.prisma`. Plan's schema used the Prisma 6 pattern.
- **Fix:** Removed `url` and `directUrl` from `datasource db {}` in schema. Created `prisma.config.ts` with `defineConfig({ datasource: { url: env('DIRECT_URL') } })`.
- **Files modified:** `prisma/schema.prisma`, `prisma.config.ts` (new)
- **Commit:** 82e2cbd

**2. [Rule 1 - Bug] PrismaNeon@7 constructor accepts PoolConfig not Pool instance**
- **Found during:** Task 2 (TypeScript compilation error)
- **Issue:** `@prisma/adapter-neon@7.5.0` changed the `PrismaNeon` constructor signature from accepting a `Pool` instance (v6 pattern) to accepting a `PoolConfig` object directly.
- **Fix:** Updated `src/lib/db.ts` to pass `{ connectionString: process.env.DATABASE_URL! }` directly to `PrismaNeon()` instead of creating a `Pool` first.
- **Files modified:** `src/lib/db.ts`
- **Commit:** 82e2cbd

### Decision Change

**Option C adoption** — user chose per-user dual-login instead of plan's Option A recommendation. CONTEXT.md updated to document the new approach. No code impact in this plan; Option C affects Plan 02 (sign-in page UX/messaging) and Plan 03 (per-user cookie storage in Neon).

## Verification Results

- `npx vitest run tests/unit/` — 2 tests passed (Wave 0 stubs)
- `npx tsc --noEmit` — no errors in any new files (pre-existing preflight.test.ts errors unrelated)
- `prisma generate` — Prisma Client v7.5.0 generated successfully
- `grep DEPLOYMENT_MODE src/middleware.ts` — guard confirmed
- `grep NextResponse.next() src/middleware.ts` — local passthrough confirmed

## Self-Check: PASSED

Files confirmed on disk:
- prisma/schema.prisma — FOUND
- prisma.config.ts — FOUND
- src/lib/auth.ts — FOUND
- src/lib/db.ts — FOUND
- src/middleware.ts — FOUND
- src/types/next-auth.d.ts — FOUND
- src/app/api/auth/[...nextauth]/route.ts — FOUND
- tests/e2e/auth.spec.ts — FOUND
- tests/unit/reports-db.test.ts — FOUND
- tests/unit/history-route.test.ts — FOUND

Commits confirmed:
- adf6811: decision(06-01): adopt Option C dual-login
- 3bf5625: feat(06-01): install deps + Wave 0 stubs
- 82e2cbd: feat(06-01): Prisma schema, NextAuth config, Prisma singleton, session types, handler
- 61b90b7: feat(06-01): DEPLOYMENT_MODE-gated middleware
