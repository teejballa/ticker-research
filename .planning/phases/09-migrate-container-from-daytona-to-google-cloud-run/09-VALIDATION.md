---
phase: 9
slug: migrate-container-from-daytona-to-google-cloud-run
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (Python) + Jest/manual (integration) |
| **Config file** | `tests/conftest.py` (Wave 0 creates) |
| **Quick run command** | `pytest tests/test_gcr_container.py -q` |
| **Full suite command** | `pytest tests/ -q` |
| **Estimated runtime** | ~30 seconds (unit); manual integration ~5-15 min |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_gcr_container.py -q`
- **After every plan wave:** Run `pytest tests/ -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | Dockerfile | build | `docker build -t gcr-test .` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 1 | entrypoint | unit | `pytest tests/test_gcr_container.py::test_entrypoint -q` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 1 | VNC WS proxy | integration | manual + curl | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 1 | /health endpoint | unit | `pytest tests/test_gcr_container.py::test_health -q` | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 2 | env var rename | unit | `grep -r "CONTAINER_" src/` | N/A | ⬜ pending |
| 9-03-02 | 03 | 2 | header rename | unit | `grep -r "x-container-secret" src/` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_gcr_container.py` — stubs for Dockerfile, health endpoint, entrypoint
- [ ] `tests/conftest.py` — shared fixtures if needed
- [ ] pytest installed — `pip install pytest` if not present

*Note: Docker build test requires Docker daemon. VNC/WebSocket tests are manual-only due to display server requirement.*

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
