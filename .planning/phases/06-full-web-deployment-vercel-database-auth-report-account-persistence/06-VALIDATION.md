---
phase: 6
slug: full-web-deployment-vercel-database-auth-report-account-persistence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | playwright + jest/vitest |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `npx playwright test --grep @smoke` |
| **Full suite command** | `npx playwright test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test --grep @smoke`
- **After every plan wave:** Run `npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | AUTH-001 | e2e | `npx playwright test --grep @auth` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | AUTH-002 | e2e | `npx playwright test --grep @auth` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | DB-001 | e2e | `npx playwright test --grep @db` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | DEPLOY-001 | e2e | `npx playwright test --grep @deploy` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 2 | PERSIST-001 | e2e | `npx playwright test --grep @persist` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/auth.spec.ts` — Google OAuth sign-in / sign-out / session persistence
- [ ] `tests/e2e/account.spec.ts` — report history CRUD, account page
- [ ] `tests/e2e/deploy.spec.ts` — smoke tests for Vercel deployment endpoints
- [ ] `prisma/schema.prisma` — DB schema stubs for User + Report models

*Wave 0 must be committed before Wave 1 execution begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google OAuth consent screen | AUTH-001 | Requires real Google account + browser | Click "Sign in with Google", verify consent screen, complete flow |
| Vercel deploy preview | DEPLOY-001 | Requires Vercel project connected | Push to branch, verify Vercel auto-deploys preview URL |
| Neon DB connection from Vercel | DB-001 | Requires production env vars | Check Vercel logs for successful DB connection on first request |
| notebooklm-py auth cookie injection | NOTEBOOKLM-001 | Cookie bundles are environment-specific | Verify `NOTEBOOKLM_AUTH_JSON` is set in Daytona container; test one research run end-to-end |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
