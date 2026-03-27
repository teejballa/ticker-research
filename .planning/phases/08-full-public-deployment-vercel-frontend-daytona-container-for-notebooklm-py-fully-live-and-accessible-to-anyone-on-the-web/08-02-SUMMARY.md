---
phase: 08-full-public-deployment-vercel-frontend-daytona-container-for-notebooklm-py-fully-live-and-accessible-to-anyone-on-the-web
plan: 02
subsystem: infra
tags: [fastapi, uvicorn, python, sse, daytona, notebooklm-py, container-server]

requires:
  - phase: 08-plan-01
    provides: UserCredential schema, AES-256-GCM credentials lib, devcontainer.json with VNC deps

provides:
  - FastAPI SSE container server (scripts/container_server.py) that wraps notebooklm_research.py
  - POST /analyze/{ticker} — receives sourcePackage + storageState, streams PROGRESS/RESULT/ERROR as SSE
  - GET /health — liveness probe returning {status: ok}
  - Per-request temp file isolation via NOTEBOOKLM_AUTH_JSON env var (no cross-user collision)
  - Updated scripts/requirements.txt with full FastAPI stack

affects:
  - 08-plan-03: VNC session endpoints added to this same container server
  - 08-plan-05: Vercel analysis route extended to call POST /analyze/{ticker} with user credentials
  - 08-plan-06: go-live — FastAPI server started inside Daytona workspace

tech-stack:
  added:
    - fastapi>=0.115.0 — HTTP server with native SSE/StreamingResponse
    - uvicorn[standard]>=0.34.0 — ASGI production server
    - websockify>=0.12.0 — VNC-over-WebSocket bridge (used in Plan 04)
    - pyvirtualdisplay>=3.0 — virtual display for headless Chromium VNC session (Plan 04)
    - python-multipart>=0.0.20 — FastAPI request body parsing
  patterns:
    - "Per-request temp file isolation: write storageState to NamedTemporaryFile, set NOTEBOOKLM_AUTH_JSON, delete in finally block"
    - "Async subprocess streaming: asyncio.create_subprocess_exec with async for line in proc.stdout"
    - "Thin HTTP adapter pattern: container server has zero business logic, only I/O wiring"

key-files:
  created:
    - scripts/container_server.py — FastAPI SSE server wrapping notebooklm_research.py
  modified:
    - scripts/requirements.txt — added fastapi, uvicorn, websockify, pyvirtualdisplay, python-multipart

key-decisions:
  - "NOTEBOOKLM_AUTH_JSON env var (not --path arg) used for per-user storage_state isolation — avoids modifying notebooklm_research.py argv interface"
  - "Container server under 115 lines — no business logic, only HTTP adapter over existing Python script"
  - "DAYTONA_SECRET validated at call time via _check_secret() helper — returns 500 if env var not set, 401 if wrong"
  - "CORS middleware uses ALLOWED_ORIGIN env var (default *) — set to Vercel domain in production"

patterns-established:
  - "Thin container server: receives JSON body, writes temp files, streams subprocess stdout as SSE, cleans up in finally"
  - "async for raw_line in proc.stdout pattern for line-by-line SSE streaming without buffering"

requirements-completed: []

duration: 15min
completed: 2026-03-27
---

# Phase 08 Plan 02: FastAPI Container Server Summary

**Thin FastAPI SSE server wrapping notebooklm_research.py — per-user storage_state isolation via NOTEBOOKLM_AUTH_JSON, temp file cleanup in finally, DAYTONA_SECRET auth on every request**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-03-27
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- FastAPI SSE container server built under 115 lines with zero business logic
- POST /analyze/{ticker} accepts sourcePackage + storageState JSON, streams PROGRESS/RESULT/ERROR lines as SSE with X-Accel-Buffering: no header for unbuffered delivery
- GET /health endpoint for liveness probe
- Per-request temp file isolation prevents cross-user NotebookLM session collisions under concurrent load
- scripts/requirements.txt updated with full FastAPI stack: fastapi, uvicorn[standard], websockify, pyvirtualdisplay, python-multipart

## Task Commits

1. **Task 1: Update scripts/requirements.txt with FastAPI stack** — `0637c19` (chore)
2. **Task 2: Build scripts/container_server.py FastAPI SSE server** — `b41e551` (feat)

## Files Created/Modified

- `scripts/container_server.py` — FastAPI SSE wrapper; POST /analyze/{ticker} + GET /health; DAYTONA_SECRET validation; per-request temp files with finally-block cleanup
- `scripts/requirements.txt` — added fastapi, uvicorn[standard], websockify, pyvirtualdisplay, python-multipart alongside existing notebooklm-py[browser]==0.3.4

## Decisions Made

- Used `NOTEBOOKLM_AUTH_JSON` env var (not a new --path CLI arg) for per-user storage_state isolation — this avoids any modification to the existing `notebooklm_research.py` interface.
- `cryptography` Python package not added — credential encrypt/decrypt is handled in TypeScript (Node.js crypto stdlib) on the Vercel side (Plan 01), not in the container.
- `_check_secret()` returns 500 (not 401) when `DAYTONA_SECRET` env var is absent on the container — distinguishes misconfiguration from an unauthorized caller.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Container server is ready to be deployed to the Daytona workspace (Plan 06)
- Plan 03 (VNC session endpoints) will add POST /vnc-start and GET /vnc-status to this same server
- Plan 05 (Vercel analysis route extension) will call POST /analyze/{ticker} with decrypted per-user storageState from Neon

---
*Phase: 08-full-public-deployment-vercel-frontend-daytona-container-for-notebooklm-py-fully-live-and-accessible-to-anyone-on-the-web*
*Completed: 2026-03-27*
