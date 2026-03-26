---
phase: 8
slug: full-public-deployment-vercel-frontend-daytona-container-for-notebooklm-py-fully-live-and-accessible-to-anyone-on-the-web
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (unit/integration) + playwright (e2e) |
| **Config file** | `jest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test && npm run test:e2e` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test && npm run test:e2e`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | Vercel deploy config | integration | `vercel --prod --dry-run` | ✅ / ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 1 | Env vars set on Vercel | manual | Vercel dashboard check | N/A | ⬜ pending |
| 8-02-01 | 02 | 1 | Daytona devcontainer | integration | `daytona workspace info` | ✅ / ❌ W0 | ⬜ pending |
| 8-02-02 | 02 | 1 | notebooklm-py install | integration | `pip show notebooklm-py` | ✅ / ❌ W0 | ⬜ pending |
| 8-03-01 | 03 | 2 | FastAPI SSE server | unit | `npm run test` | ✅ / ❌ W0 | ⬜ pending |
| 8-03-02 | 03 | 2 | Container health check | integration | `curl http://localhost:8000/health` | ✅ / ❌ W0 | ⬜ pending |
| 8-04-01 | 04 | 2 | VNC onboarding flow | manual | Screenshot + playwright | N/A | ⬜ pending |
| 8-04-02 | 04 | 2 | noVNC proxy route | e2e | `npm run test:e2e` | ✅ / ❌ W0 | ⬜ pending |
| 8-05-01 | 05 | 3 | End-to-end ticker run | e2e | `npm run test:e2e` | ✅ / ❌ W0 | ⬜ pending |
| 8-05-02 | 05 | 3 | Multi-user isolation | integration | `npm run test` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/deployment/vercel.test.ts` — stubs for Vercel config validation
- [ ] `tests/deployment/daytona.test.ts` — stubs for Daytona container health
- [ ] `tests/deployment/fastapi-server.test.ts` — stubs for container SSE server
- [ ] `tests/deployment/user-isolation.test.ts` — stubs for multi-user credential isolation
- [ ] `tests/e2e/deployment-flow.spec.ts` — e2e stubs for full deployment flow

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| VNC onboarding flow | notebooklm-py auth | Requires real browser + Google login UI | Open noVNC URL, verify Chrome opens, log into Google, confirm auth.json saved |
| Vercel env vars | Production config | Dashboard configuration | Check Vercel dashboard for all required env vars |
| Daytona sandbox persistence | `auto_stop_interval=0` | Infrastructure check | Verify sandbox doesn't auto-stop after 15 min |
| Cold start time | UX threshold | Real deployment only | Time from research request to first SSE event on cold Daytona start |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
