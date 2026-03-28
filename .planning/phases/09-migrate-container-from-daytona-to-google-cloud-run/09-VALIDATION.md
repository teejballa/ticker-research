---
phase: 9
slug: migrate-container-from-daytona-to-google-cloud-run
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | grep (file inspection) + npm test (Jest) + manual smoke test |
| **Config file** | N/A — no new test files; existing Jest suite covers route changes |
| **Quick run command** | `npm test -- src/app/api/analysis/__tests__/route.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (automated); manual integration ~5-15 min |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` verify command
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green + manual smoke test passed
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 9-01-T1 | 01 | 1 | Dockerfile multi-stage | grep | `grep -q "AS builder" Dockerfile && grep -q "AS runtime" Dockerfile && grep -q "Xvfb :99" entrypoint.sh && echo PASS` | pending |
| 9-01-T2 | 01 | 1 | CONTAINER_SECRET rename in container_server.py | grep | `grep -c "DAYTONA_SECRET\|x_daytona_secret\|x-daytona-secret" scripts/container_server.py && echo FAIL \|\| echo PASS` | pending |
| 9-02-T1 | 02 | 1 | DAYTONA_ rename in Vercel routes | grep | `grep -rn "DAYTONA_" src/app/api/ && echo FAIL \|\| echo PASS` | pending |
| 9-02-T2 | 02 | 1 | Tests pass with CONTAINER_URL | npm test | `npm test -- src/app/api/analysis/__tests__/route.test.ts 2>&1 \| tail -20` | pending |
| 9-03-T1 | 03 | 2 | Runbook + .env.local.example | grep + file check | `test -f docs/DEPLOY-GCR.md && grep -q "gcloud run deploy" docs/DEPLOY-GCR.md && grep -q "CONTAINER_URL" .env.local.example && echo PASS` | pending |
| 9-03-T2 | 03 | 2 | End-to-end smoke test | manual | checkpoint:human-verify — manual smoke test per task instructions | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

None. All automated verify commands in Plans 01 and 02 use grep-based file inspection or npm test against an already-existing test file (`src/app/api/analysis/__tests__/route.test.ts`). No new test files need to be created before execution can begin.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| notebooklm login auth flow | Auth persistence | Requires browser UI interaction | Run `notebooklm login` inside container, verify `~/.notebooklm/auth.json` created |
| VNC stream visible in browser | react-vnc integration | Requires display server + browser | Open `/account` page, click "Launch Research Environment", verify VNC screen renders |
| Research run end-to-end | Full pipeline | Requires Google account + NotebookLM access | Submit ticker, verify SSE streams progress, result JSON returned |
| Cloud Run URL reachable | Network/routing | Requires deployed GCR instance | `curl https://SERVICE.run.app/health` returns `{"status":"ok"}` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or explicit N/A marker (checkpoint:human-verify tasks are exempt)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none exist — no MISSING markers in any plan)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
