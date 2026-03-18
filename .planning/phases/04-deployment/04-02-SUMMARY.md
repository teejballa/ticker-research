---
phase: 04-deployment
plan: 02
subsystem: deployment
tags: [daytona, devcontainer, vercel, notebooklm-py, chromium, sse]
dependency_graph:
  requires: []
  provides: [daytona-container-spec, vercel-sse-config]
  affects: [cloud-deployment-mode]
tech_stack:
  added: []
  patterns: [devcontainer-spec, vercel-functions-config]
key_files:
  created:
    - .devcontainer/devcontainer.json
    - .devcontainer/README.md
    - vercel.json
  modified: []
decisions:
  - "Use mcr.microsoft.com/devcontainers/python:3.12 (Ubuntu/glibc) — not Alpine; Playwright requires glibc"
  - "playwright install --with-deps chromium required (not bare playwright install chromium) — installs OS-level libs (libnss3, libgbm) needed for headless Chromium on Linux"
  - "maxDuration=300 applied only to analysis and research routes — not globally — to avoid disabling cold-start optimization on fast routes"
metrics:
  duration: "3 minutes"
  completed: "2026-03-18"
  tasks_completed: 2
  files_created: 3
---

# Phase 4 Plan 2: Daytona Container Spec and Vercel Config Summary

**One-liner:** Daytona devcontainer spec with Python 3.12 + Node 18 + `--with-deps chromium` and Vercel SSE timeout config set to 300s on analysis/research routes.

## What Was Built

Two deployment configuration files that together enable the cloud execution mode described in the architecture:

**.devcontainer/devcontainer.json** — Daytona container specification. Specifies the `mcr.microsoft.com/devcontainers/python:3.12` base image (Ubuntu-based, required for Playwright), installs Node 18 via the devcontainer feature registry, and runs a `postCreateCommand` that installs `notebooklm-py` (via `scripts/requirements.txt`), Chromium with all OS-level dependencies (`playwright install --with-deps chromium`), and Node modules (`npm install`). Forwards port 3000 (Next.js) and 8080. Maps `ANTHROPIC_API_KEY` from the host environment into the container.

**.devcontainer/README.md** — Documents the one-time post-creation steps: running `notebooklm login` to save `~/.notebooklm/storage_state.json`, copying the Daytona-provided port 3000 URL as `DAYTONA_CONTAINER_URL` on Vercel, and starting the server with `npm start`. Also documents the Vercel Hobby plan 300s limit and the option to raise to 800s on Pro.

**vercel.json** — Sets `maxDuration=300` on `src/app/api/analysis/**/*` and `src/app/api/research/**/*` routes only. These are the long-running SSE proxy routes that stream `notebooklm-py` progress to the frontend. A research run takes 3–5 minutes; 300s is the Hobby plan maximum. No other routes are configured, preserving cold-start optimization on fast routes.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files created:
- .devcontainer/devcontainer.json — FOUND
- .devcontainer/README.md — FOUND
- vercel.json — FOUND

Commits:
- a53004f — chore(04-02): add Daytona devcontainer spec and setup README
- 7b8db56 — chore(04-02): add vercel.json with maxDuration=300 on SSE routes

Verification: All 9 automated checks passed (devcontainer image, node feature, --with-deps flag, pip install, npm install, port 3000, remoteEnv, vercel analysis 300, vercel research 300).

## Self-Check: PASSED
