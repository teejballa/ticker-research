---
phase: 08
plan: 05
subsystem: frontend-ux
tags: [account-page, navbar, error-states, env-vars, notebooklm-session]
dependency_graph:
  requires: [08-03, 08-04]
  provides: [account-page, navbar-account-link, cloud-error-states, env-var-docs]
  affects: [src/components/NavBar.tsx, src/components/ResearchProgress.tsx, src/app/account/page.tsx, src/app/api/setup/status/route.ts]
tech_stack:
  added: []
  patterns: [inline-error-classification, nbm-session-check-via-credential-db, cloud-error-cta-routing]
key_files:
  created:
    - src/app/account/page.tsx
  modified:
    - src/components/NavBar.tsx
    - src/app/api/setup/status/route.ts
    - src/components/ResearchProgress.tsx
    - .env.local.example
decisions:
  - "Account page fetches /api/setup/status on mount for nbmSessionActive — no separate endpoint needed"
  - "ResearchProgress tracks errorMessage state internally, classifies via classifyError(), renders inline"
  - "ALLOWED_ORIGIN documented only in Daytona container section — not in Vercel checklist to prevent operator error"
metrics:
  duration_minutes: 6
  completed_date: "2026-03-27T02:58:16Z"
  tasks_completed: 2
  files_modified: 5
---

# Phase 08 Plan 05: Account Page, NavBar ACCOUNT Link, Cloud Error States Summary

**One-liner:** Account settings page with NbLM session status/reconnect flow, NavBar ACCOUNT link, 4-type cloud error classification in ResearchProgress, and complete Phase 8 env var documentation.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Account page, NavBar ACCOUNT link, status route nbmSessionActive | b0e5bfa | src/app/account/page.tsx (new), src/components/NavBar.tsx, src/app/api/setup/status/route.ts |
| 2 | Cloud error states in ResearchProgress + .env.local.example | 307205d | src/components/ResearchProgress.tsx, .env.local.example |

---

## What Was Built

### Task 1

**src/app/account/page.tsx** — New client component. On mount fetches `GET /api/setup/status` to read `userEmail` and `nbmSessionActive`. Renders three sections:
- `CONNECTED ACCOUNT` — user email in JetBrains Mono
- `NOTEBOOKLM SESSION` — `SESSION ACTIVE` (teal) or `SESSION EXPIRED` (amber-400) + `RECONNECT NOTEBOOKLM →` button navigating to `/setup`
- `END SESSION` ghost button — calls `signOut({ callbackUrl: '/auth/signin' })` with destructive hover styling

**src/components/NavBar.tsx** — Added `ACCOUNT` Link (`href="/account"`) in the right cluster before the "Analyze a Ticker" button. Styled `text-sm font-bold text-on-surface/50 hover:bg-surface-container` matching NYSE/NASDAQ nav labels.

**src/app/api/setup/status/route.ts** — Extended web-mode branch to compute `nbmSessionActive: boolean`. Dynamically imports `getCredential` from `@/lib/user-credential-db`, checks whether a `UserCredential` row exists for the session user. Returns `false` on any error or missing session.

### Task 2

**src/components/ResearchProgress.tsx** — Added:
- `onRetry?: () => void` prop
- `classifyError(message)` function — classifies into `session-expired | container-unreachable | timeout | unknown` via substring matching
- `ERROR_COPY` map with exact UI-SPEC message and CTA label/href for each type
- `errorMessage` state — set on SSE error events, fetch failure, and catch path
- Inline error render block below the step list: shows classified message (`text-xs text-error/70`) and CTA button/link (`text-[10px] font-bold tracking-widest`)
  - `RECONNECT ACCOUNT →` links to `/account`
  - `RETRY ANALYSIS →` calls `onRetry`

**.env.local.example** — Appended Phase 8 section:
- `DAYTONA_CONTAINER_URL`, `DAYTONA_SECRET`, `CREDENTIAL_ENCRYPTION_KEY` as Vercel env vars
- Go-live checklist: 11 items for Vercel dashboard
- Separate "Daytona Container Env Vars" section: `DAYTONA_SECRET` + `ALLOWED_ORIGIN` — clearly labelled as container-only to prevent operator error

---

## Verification Results

- TypeScript: clean (0 errors)
- Unit tests: 32 passed, 3 todo, 1 file skipped (all green)
- Grep checks: all required strings present in all target files

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Self-Check: PASSED

- [x] `src/app/account/page.tsx` — created and committed in b0e5bfa
- [x] `src/components/NavBar.tsx` — contains `href="/account"` and `ACCOUNT`
- [x] `src/app/api/setup/status/route.ts` — contains `nbmSessionActive`
- [x] `src/components/ResearchProgress.tsx` — contains `classifyError`, `RECONNECT ACCOUNT`, `RETRY ANALYSIS`, `session-expired`
- [x] `.env.local.example` — contains `DAYTONA_CONTAINER_URL`, `DAYTONA_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `ALLOWED_ORIGIN`
- [x] Commits b0e5bfa and 307205d confirmed in git log
