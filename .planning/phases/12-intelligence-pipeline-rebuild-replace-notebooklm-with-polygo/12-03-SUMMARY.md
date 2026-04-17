---
phase: 12-intelligence-pipeline-rebuild-replace-notebooklm-with-polygo
plan: "03"
subsystem: infrastructure-decommission
tags: [decommission, cleanup, setup-route, typescript]

# Dependency graph
requires:
  - "12-02: Gemini analysis engine live — no more Python subprocess or container proxy"
provides:
  - "All NotebookLM + container files deleted from repo"
  - "setup/status/route.ts simplified — session-based only, no Python checks"
  - "CONTAINER_URL not referenced anywhere in src/ TypeScript files"
  - "npm run build exits 0 after all deletions"
affects:
  - "src/app/api/setup/status/route.ts — consumers get simplified response (backward-compat fields retained)"
  - "NavBar.tsx, dashboard/page.tsx — still receive userEmail from status route in web mode"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import inside DEPLOYMENT_MODE branch — prevents Prisma/NextAuth loading in local mode"

key-files:
  created: []
  modified:
    - "src/app/api/setup/status/route.ts — rewritten: 32 lines, session-only, no Python checks"
    - "src/app/page.tsx — removed SetupWizard import and setup state polling"
    - "src/components/ResearchProgress.tsx — /setup links redirected to /dashboard"
    - "src/app/research/[ticker]/page.tsx — RECONNECT link points to /dashboard"
    - "src/components/NavBar.tsx — no change needed (already clean)"
    - "src/app/terminal/page.tsx — no change needed (already clean)"
    - "src/app/auth/signin/page.tsx — no change needed (already clean)"
    - "src/app/dashboard/page.tsx — no change needed (already clean)"
  deleted:
    - "scripts/notebooklm_research.py"
    - "scripts/container_server.py"
    - "scripts/notebooklm_auth.py"
    - "scripts/setup.sh"
    - "scripts/requirements.txt"
    - "scripts/get_email.py"
    - "Dockerfile"
    - "Dockerfile.daytona"
    - ".dockerignore"
    - "src/app/api/setup/nbm-auth/route.ts"
    - "src/app/api/setup/nbm-auth/status/route.ts"
    - "src/app/api/setup/install/route.ts"
    - "src/app/api/setup/auth/route.ts"
    - "src/app/api/setup/__tests__/status.test.ts"
    - "src/app/setup/page.tsx"
    - "src/app/setup/vnc/page.tsx"
    - "src/app/setup/nbm-oauth-complete/page.tsx"
    - "src/components/SetupWizard.tsx"
    - "src/components/__tests__/SetupWizard.test.tsx"
    - "src/lib/__tests__/preflight.test.ts"

key-decisions:
  - "status route retains pythonOk/notebooklmOk/authOk fields (always true) for backward compat with any frontend reading these fields"
  - "DEPLOYMENT_MODE=web branching retained in status route — web mode checks NextAuth session for userEmail; local mode returns allOk:true unconditionally"
  - "Stale worktree test files (status.test.ts, preflight.test.ts, old route.test.ts) cleaned up from agent-a4f0272e worktree to restore unit test suite to green"

requirements-completed:
  - INTEL-08
  - INTEL-09

# Metrics
duration: 15min
completed: 2026-04-17
---

# Phase 12 Plan 03: Container and NotebookLM Infrastructure Decommission Summary

**Pure subtraction: 20 files deleted, setup/status route simplified to 32 lines — no Python checks, no execSync, no container references anywhere in TypeScript source**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-17
- **Tasks:** 2
- **Files deleted:** 20
- **Files modified:** 4 (setup/status route + 3 UI files with stale /setup links)

## Accomplishments

- Deleted all Python scripts: `notebooklm_research.py`, `container_server.py`, `notebooklm_auth.py`, `setup.sh`, `requirements.txt`, `get_email.py`
- Deleted all Dockerfiles: `Dockerfile`, `Dockerfile.daytona`, `.dockerignore`
- Deleted VNC auth API routes: `nbm-auth/`, `nbm-auth/status/`
- Deleted NotebookLM setup routes: `install/`, `auth/` (under `src/app/api/setup/`)
- Deleted setup UI pages: `setup/page.tsx`, `setup/vnc/page.tsx`, `setup/nbm-oauth-complete/page.tsx`
- Deleted `SetupWizard.tsx` component and its test
- Deleted stale test files: `status.test.ts` (Python-check tests), `preflight.test.ts` (setup.sh tests)
- Rewrote `setup/status/route.ts` to 32 lines — session-based only, `allOk: true` in both modes, `userEmail` returned for NavIdentity display
- Updated `page.tsx`: removed `SetupWizard` import and `fetchSetupStatus` polling
- Updated `ResearchProgress.tsx` + research page: `/setup` links redirected to `/dashboard`
- `CONTAINER_URL` not referenced in any `src/` TypeScript file (comment in test only)
- `npm run build` exits 0 with clean route table
- All 20 main project unit test files pass (132 tests + 3 todo)

## Task Commits

1. **Task 1 + Task 2: decommission all container/NotebookLM files and simplify setup/status route** — `465ee77` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Worktree contained stale test files from pre-Phase-12 state**

- **Found during:** Task 2 verification (npm test)
- **Issue:** The git working tree deletions (`D` prefix in git status) had been applied to the main project directory, but the `.claude/worktrees/agent-a4f0272e/` directory retained its own copies of `status.test.ts`, `preflight.test.ts`, and an old `route.test.ts` that tested container-proxy behavior. Vitest picked these up and ran them, producing failures against deleted infrastructure.
- **Fix:** Deleted `status.test.ts` and `preflight.test.ts` from the worktree. Synced the updated `route.test.ts` and `analysis-web-mode.test.ts` (already rewritten in Plan 02) from the main project directory into the worktree.
- **Files modified:** `.claude/worktrees/agent-a4f0272e/src/app/api/setup/__tests__/status.test.ts` (deleted), `.claude/worktrees/agent-a4f0272e/src/lib/__tests__/preflight.test.ts` (deleted), `.claude/worktrees/agent-a4f0272e/src/app/api/analysis/__tests__/route.test.ts` (synced), `.claude/worktrees/agent-a4f0272e/tests/unit/analysis-web-mode.test.ts` (synced)
- **Commit:** Not separately committed — worktree working directory files, not tracked by main repo

**2. [Note] Remaining test failures are pre-existing and out of scope**

- All remaining `npm test` failures are from: (a) E2E tests requiring a live server (all exclude patterns cover only `tests/e2e/**`, not `.claude/worktrees/*/tests/e2e/**`), and (b) the `agent-af4e75b9` worktree which retains pre-Phase-12 test files. Neither set is caused by this plan's changes and both pre-date this execution.

## Known Stubs

None — this plan is pure deletion. No new stubs introduced.

## Threat Flags

No new threat surface introduced. Attack surface is reduced: 4 API routes deleted (`nbm-auth/`, `nbm-auth/status/`, `install/`, `auth/`). Matches T-12-03-02 disposition: `accept` (routes deleted, not shifted).

## Self-Check: PASSED

- FOUND: src/app/api/setup/status/route.ts (32 lines, simplified)
- DELETED: scripts/notebooklm_research.py — NOT FOUND (correct)
- DELETED: Dockerfile — NOT FOUND (correct)
- DELETED: src/app/api/setup/nbm-auth — NOT FOUND (correct)
- grep CONTAINER_URL src/ (TS files): NOT FOUND (correct)
- grep execSync src/app/api/setup/status/route.ts: NOT FOUND (correct)
- grep allOk src/app/api/setup/status/route.ts: FOUND in both branches (correct)
- grep notebooklmOk src/app/api/setup/status/route.ts: FOUND (backward-compat field)
- npx tsc --noEmit: exits 0
- npm run build: exits 0
- Unit tests (main project): 132 passed, 0 failed, 3 todo
- FOUND commit: 465ee77

---
*Phase: 12-intelligence-pipeline-rebuild-replace-notebooklm-with-polygo*
*Completed: 2026-04-17*
