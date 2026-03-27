---
phase: 08
plan: 04
subsystem: web-onboarding
tags: [vnc, notebooklm, setup, react-vnc, daytona, credential-storage]
dependency_graph:
  requires: [08-01, 08-02, 08-03]
  provides: [web-mode NbLM onboarding page, nbm-auth API route, container VNC stubs]
  affects: [src/app/setup/page.tsx, src/app/api/setup/nbm-auth/route.ts, scripts/container_server.py]
tech_stack:
  added: [react-vnc, "@novnc/novnc"]
  patterns: [VNC stream embed, polling status check, OAuth passthrough fallback, AES-256-GCM credential write]
key_files:
  created:
    - src/app/setup/page.tsx
    - src/app/api/setup/nbm-auth/route.ts
  modified:
    - scripts/container_server.py
    - package.json
    - package-lock.json
decisions:
  - react-vnc VncScreen used directly — no wrapper needed; scaleViewport handles sizing
  - Card width expands from w-96 to max-w-xl when VNC active to fit 480px stream
  - typing.Any added to container_server.py imports — required for dict[str, Any] return types on new endpoints
  - OAuth passthrough attempt uses 5s AbortController timeout before falling through to VNC
metrics:
  duration: 156s
  completed: "2026-03-27"
  tasks: 2
  files: 5
---

# Phase 8 Plan 4: NbLM Onboarding Page + VNC Auth Flow Summary

**One-liner:** Browser-embedded VNC stream for one-time NbLM Google login with per-user encrypted credential write to Neon on capture.

## What Was Built

### Task 1: react-vnc + API route + container VNC stubs

Installed `react-vnc` and `@novnc/novnc` as production dependencies. Created `src/app/api/setup/nbm-auth/route.ts` with two handlers:

- **POST**: Accepts `{mode: 'oauth' | 'vnc'}`, requires NextAuth session, proxies to `DAYTONA_CONTAINER_URL/vnc-start` with `x-daytona-secret` header. Returns `{streamUrl}` from container.
- **GET**: Requires NextAuth session, polls `DAYTONA_CONTAINER_URL/vnc-status`. When `{captured: true, encryptedState}` returned: calls `encrypt(encryptedState)` then `upsertCredential(email, encrypted)` — writing to Neon via Prisma. Returns `{captured: boolean}` to frontend.

Appended `/vnc-start` and `/vnc-status` stub endpoints to `scripts/container_server.py`. Added `from typing import Any` import. All 4 endpoint functions (`health`, `analyze`, `vnc_start`, `vnc_status`) present; Python syntax check passed.

### Task 2: /setup onboarding page

Created `src/app/setup/page.tsx` — a `'use client'` component that:

- Renders full-page centered card matching `/auth/signin` layout (`#10141a` background, `1px solid #1a2d42` border, `font-mono`)
- Amber overline: `CIPHER // NOTEBOOKLM AUTHENTICATION REQUIRED` (11px, tracking-widest, #f59e0b)
- 3-step list using `StepIndicator` pattern from `SetupWizard.tsx` (pending/active/complete/error)
- State machine: `oauth-checking` → `oauth-attempting` → `vnc-active` → `complete`
- On mount: checks status (skip if already captured) → attempts OAuth passthrough (5s timeout, expected to fail) → triggers VNC session → renders `VncScreen` at 480px
- Polls `/api/setup/nbm-auth/status` every 3s; on `{captured: true}` clears interval, sets complete, redirects to `/` after 2s
- Card width conditionally expands to `max-w-xl` when `vnc-active` to fit the VNC stream
- No NavBar rendered (same pattern as `/auth/signin`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added `typing.Any` import to container_server.py**
- **Found during:** Task 1, Step 3
- **Issue:** The new `/vnc-start` and `/vnc-status` endpoints use `dict[str, Any]` return type annotations but `Any` was not imported in the existing file.
- **Fix:** Added `from typing import Any` to the imports block in `scripts/container_server.py`.
- **Files modified:** scripts/container_server.py
- **Commit:** 5de81b3

## Self-Check: PASSED

- [x] `src/app/setup/page.tsx` — FOUND
- [x] `src/app/api/setup/nbm-auth/route.ts` — FOUND
- [x] `scripts/container_server.py` — FOUND (vnc_start + vnc_status appended)
- [x] Task 1 commit: 5de81b3
- [x] Task 2 commit: 504034f
- [x] TypeScript: no errors on setup/page or nbm-auth
- [x] Python syntax: SYNTAX OK
- [x] container_server.py has 4 endpoint functions: health, analyze, vnc_start, vnc_status
