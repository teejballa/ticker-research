---
phase: 02-research-integration
plan: 01
subsystem: setup-wizard
tags: [setup, api-routes, sse-streaming, python-check, notebooklm-auth, client-component]
dependency_graph:
  requires: []
  provides:
    - GET /api/setup/status — SetupStatus JSON (pythonOk, notebooklmOk, authOk, allOk)
    - POST /api/setup/install — SSE pip install + playwright install chromium
    - POST /api/setup/auth — spawns notebooklm login, polls storage_state.json
    - SetupWizard component — 3-step setup UI consumed by page.tsx
  affects:
    - src/app/page.tsx — now a client component with conditional wizard/search render
tech_stack:
  added: []
  patterns:
    - SSE streaming via ReadableStream + TextEncoder (same pattern as ChartConfirmation)
    - child_process.execSync for synchronous Python checks
    - child_process.spawn for long-running pip/playwright/notebooklm processes
    - setInterval polling for storage_state.json detection (2s interval, 5s notify, 10min timeout)
    - Dynamic import() in vitest stubs for wave-0 TDD pattern
key_files:
  created:
    - src/app/api/setup/status/route.ts
    - src/app/api/setup/install/route.ts
    - src/app/api/setup/auth/route.ts
    - src/components/SetupWizard.tsx
    - src/app/api/setup/__tests__/status.test.ts
    - src/components/__tests__/SetupWizard.test.tsx
  modified:
    - src/app/page.tsx
decisions:
  - "storage_state.json used as auth file path (not auth.json) per RESEARCH.md critical discovery"
  - "page.tsx converted to client component to support useEffect status fetch on mount"
  - "SetupWizard exported as named export (SetupWizard) and default export for flexibility"
  - "Auth step is the only manually-triggered step — install auto-triggers when pythonOk but not notebooklmOk"
  - "On fetch error, page.tsx defaults to allOk=true to avoid blocking users in non-local deployments"
metrics:
  duration: "~3 minutes"
  completed: "2026-03-14"
  tasks_completed: 2
  files_created: 6
  files_modified: 1
---

# Phase 2 Plan 1: Setup Wizard Summary

**One-liner:** Self-bootstrapping setup wizard with Python detection, auto-pip-install, and browser-based Google login — user only touches the Google auth step.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Setup API routes — status, install, auth | 8c75a4c | status/route.ts, install/route.ts, auth/route.ts, __tests__/status.test.ts, SetupWizard.test.tsx |
| 2 | SetupWizard component and home page wiring | 89f26db | SetupWizard.tsx, page.tsx |

## What Was Built

Three Next.js App Router API routes implement the setup pipeline:

- `GET /api/setup/status` — runs synchronous subprocess checks (`execSync`) for Python version, notebooklm import, and file existence of `~/.notebooklm/storage_state.json`. Returns `SetupStatus` JSON.
- `POST /api/setup/install` — spawns `pip3 install -r scripts/requirements.txt` then `playwright install chromium` sequentially, pipes stdout/stderr to SSE progress events.
- `POST /api/setup/auth` — spawns `notebooklm login` (opens browser), then polls every 2 seconds for `storage_state.json`, streaming `waiting` events every 5 seconds and `complete` when the file appears. 10-minute timeout.

The `SetupWizard` client component manages all setup state internally. On mount, it fetches status and auto-triggers the pip install if Python is available but notebooklm-py is missing. The Google auth step is the only step requiring a manual button click.

`page.tsx` was converted from a server component to a client component to support the `useEffect` status fetch. It conditionally renders `SetupWizard` or `TickerSearch` based on `allOk`.

## Verification Results

- `npx tsc --noEmit` — clean (no errors)
- All 53 tests pass (6 setup-specific tests: 3 status route unit tests + 3 SetupWizard stubs)
- `storage_state.json` path used in all auth checks (not `auth.json`)
- Install step auto-triggers without user clicking
- Auth step requires user click (by design — unavoidably manual)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Created files exist:
- [x] src/app/api/setup/status/route.ts
- [x] src/app/api/setup/install/route.ts
- [x] src/app/api/setup/auth/route.ts
- [x] src/components/SetupWizard.tsx
- [x] src/app/api/setup/__tests__/status.test.ts
- [x] src/components/__tests__/SetupWizard.test.tsx

### Commits exist:
- [x] 8c75a4c — feat(02-01): setup API routes — status, install, auth
- [x] 89f26db — feat(02-01): SetupWizard component and home page wiring

## Self-Check: PASSED
