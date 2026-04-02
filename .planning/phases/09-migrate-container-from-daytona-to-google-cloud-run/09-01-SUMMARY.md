---
phase: 09-migrate-container-from-daytona-to-google-cloud-run
plan: "01"
subsystem: container
tags: [docker, cloud-run, fastapi, vnc, websocket]
dependency_graph:
  requires: []
  provides: [Dockerfile, entrypoint.sh, container_server.py]
  affects: [scripts/container_server.py]
tech_stack:
  added: []
  patterns: [multi-stage Docker build, WebSocket proxy, exec-form ENTRYPOINT]
key_files:
  created:
    - Dockerfile
    - entrypoint.sh
  modified:
    - scripts/container_server.py
decisions:
  - "Multi-stage Dockerfile: builder stage installs Python deps + Playwright browser binary, runtime stage copies them — keeps final image lean while preserving Chromium"
  - "ENTRYPOINT exec form instead of CMD so uvicorn inherits PID 1 and receives SIGTERM directly from Cloud Run"
  - "Xvfb :99 pre-warmed in entrypoint.sh; pyvirtualdisplay in /vnc-start allocates its own display number dynamically — no conflict"
  - "/vnc-ws accepts x-container-secret via header OR query param — WebSocket upgrade requests cannot always set custom headers in all clients"
  - "websockify stays on internal port 6080; /vnc-ws proxies through 8080 — Cloud Run single-port constraint resolved without changing VNC stack"
metrics:
  duration_seconds: 110
  completed_date: "2026-04-02T02:57:04Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 09 Plan 01: Container Cloud Run Migration Summary

Multi-stage Dockerfile + entrypoint.sh + CONTAINER_SECRET rename + /vnc-ws WebSocket proxy — makes the container buildable and runnable on Google Cloud Run's single-port (8080) constraint.

## Objective

Update the container so it builds and runs correctly on Google Cloud Run: write a multi-stage Dockerfile (replacing the single-stage Dockerfile.daytona), add entrypoint.sh for Xvfb startup, update container_server.py with CONTAINER_SECRET rename, $PORT binding, and the /vnc-ws WebSocket proxy endpoint that routes VNC traffic through Cloud Run's single exposed port.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Dockerfile (multi-stage) + entrypoint.sh | 8b14ed7 | Dockerfile, entrypoint.sh |
| 2 | container_server.py — CONTAINER_SECRET + $PORT + /vnc-ws | f923c9f | scripts/container_server.py |

## What Was Built

### Dockerfile (multi-stage)

- **Stage 1 (builder):** `python:3.12-slim` — installs Python deps to `/install` prefix, installs Playwright and downloads Chromium binary to `/root/.cache/ms-playwright`
- **Stage 2 (runtime):** `python:3.12-slim` — installs Xvfb, x11vnc, Node.js 18 from apt; copies Python packages and Playwright browser binary from builder; reinstalls `playwright` pip package in runtime to register CLI/API; copies `scripts/` and `entrypoint.sh`
- Exposes only port 8080 (Cloud Run single-port requirement; 6080 removed)
- `ENTRYPOINT ["./entrypoint.sh"]` — exec form so Python process inherits PID 1 and receives SIGTERM

### entrypoint.sh

- Starts `Xvfb :99 -screen 0 1280x960x24` in background
- Polls for `/tmp/.X99-lock` up to 10 seconds (20 × 0.5s) before continuing
- Exports `DISPLAY=:99` and `PORT=${PORT:-8080}`
- `exec python3 scripts/container_server.py` — replaces bash process so Python is the direct SIGTERM target

### container_server.py changes

- Module docstring updated: "Daytona container server" → "Google Cloud Run container server"; added /vnc-ws description
- `FastAPI` import line: added `WebSocket, WebSocketDisconnect`
- `SECRET = os.environ.get("CONTAINER_SECRET", "")` — replaces `DAYTONA_SECRET`
- `_check_secret(x_container_secret)` — parameter and error message updated throughout
- All four route handlers (`/analyze/{ticker}`, `/vnc-start`, `/vnc-status`, `/vnc-stop`): `x_daytona_secret` → `x_container_secret`
- `/vnc-ws` WebSocket endpoint added: validates secret via header or query param, proxies bytes bidirectionally between browser and `localhost:6080` (websockify), passes through `sec-websocket-protocol` subprotocol
- `uvicorn.run()` reads `int(os.environ.get("PORT", "8080"))` instead of hardcoded 8080

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all changes are functional rewrites with no placeholder values.

## Self-Check: PASSED

- Dockerfile exists: FOUND
- entrypoint.sh exists: FOUND
- scripts/container_server.py modified: FOUND
- Commit 8b14ed7 exists: FOUND
- Commit f923c9f exists: FOUND
- Zero DAYTONA_ references in container_server.py: VERIFIED
- /vnc-ws endpoint present: VERIFIED
- $PORT binding present: VERIFIED
