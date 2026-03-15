---
phase: 4
slug: deployment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.0.9 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npm test -- --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --reporter=verbose`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green + manual local smoke test (`npm install && npm start` on fresh clone) + manual cloud smoke test
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | DEPLOY-01 | unit | `npm test -- src/lib/__tests__/preflight.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | DEPLOY-01 | smoke/manual | Manual: `npm install && npm start` on fresh clone | manual-only | ⬜ pending |
| 4-02-01 | 02 | 2 | DEPLOY-02 | unit | `npm test -- src/app/api/analysis/__tests__/route.test.ts` | ✅ extend | ⬜ pending |
| 4-02-02 | 02 | 2 | DEPLOY-02 | unit | `npm test -- src/app/api/analysis/__tests__/route.test.ts` | ✅ extend | ⬜ pending |
| 4-03-01 | 03 | 3 | DEPLOY-02 | e2e/manual | Manual production smoke test (Vercel → Daytona → SSE result) | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/preflight.test.ts` — unit tests for pre-flight validation logic (DEPLOY-01 env var checks, Python version check error paths)
- [ ] Extend `src/app/api/analysis/__tests__/route.test.ts` — add cases for `DEPLOYMENT_MODE=cloud` branch: proxy to container, error on missing `DAYTONA_CONTAINER_URL`, SSE passthrough

*Existing Vitest infrastructure covers the full setup; no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm install && npm start` succeeds on fresh clone | DEPLOY-01 | Requires real filesystem + OS env; can't mock `npm install` meaningfully | Clone to temp dir, run `npm install && npm start`, verify setup wizard appears at localhost:3000 |
| `setup.sh` exits non-zero when Python 3.10+ absent | DEPLOY-01 | PATH mocking too brittle in CI; behavior is a shell script | Run `PATH=/usr/bin bash scripts/setup.sh` without Python in path, verify error message and exit code |
| Full end-to-end Vercel → Daytona → SSE result | DEPLOY-02 | Requires live Daytona container with real notebooklm auth | Deploy to Vercel, start Daytona container, run full ticker research, verify report renders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
