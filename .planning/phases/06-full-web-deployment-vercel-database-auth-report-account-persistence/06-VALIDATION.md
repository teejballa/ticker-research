---
phase: 6
slug: full-web-deployment-vercel-database-auth-report-account-persistence
status: draft
nyquist_compliant: true
wave_0_complete: true
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
| 06-01-01 | 01 | 1 | WEB-AUTH | unit | `npm run test` | `tests/unit/reports-db.test.ts` | ⬜ pending |
| 06-01-02 | 01 | 1 | WEB-MIDDLEWARE | e2e | `npx playwright test --grep @auth` | `tests/e2e/auth.spec.ts` | ⬜ pending |
| 06-01-03 | 01 | 1 | WEB-MIDDLEWARE | e2e | `npx tsc --noEmit` | n/a (type check) | ⬜ pending |
| 06-02-01 | 02 | 2 | WEB-SIGNIN-UI | e2e | `npx playwright test tests/e2e/auth.spec.ts` | `tests/e2e/auth.spec.ts` | ⬜ pending |
| 06-02-02 | 02 | 2 | WEB-NAV-IDENTITY | unit | `grep -q "CONNECTED AS" src/app/components/NavIdentity.tsx` | n/a (grep) | ⬜ pending |
| 06-03-01 | 03 | 2 | WEB-PERSISTENCE | unit | `npm run test -- reports-db` | `tests/unit/reports-db.test.ts` | ⬜ pending |
| 06-03-02 | 03 | 2 | WEB-HISTORY | unit | `npm run test -- history-route` | `tests/unit/history-route.test.ts` | ⬜ pending |
| 06-04-01 | 04 | 3 | WEB-DEPLOY | e2e | `npx playwright test tests/e2e/auth.spec.ts` | `tests/e2e/auth.spec.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 test files are created by Plan 01 Task 1. The three files below are exactly what Plan 01 creates.

- [x] `tests/e2e/auth.spec.ts` — covers WEB-01 (redirect), WEB-07 (sign-in UI), @auth tag
- [x] `tests/unit/reports-db.test.ts` — covers WEB-03, WEB-04 (placeholder stubs until Plan 03 replaces)
- [x] `tests/unit/history-route.test.ts` — covers WEB-05 DEPLOYMENT_MODE guard (placeholder until Plan 03)

**Note:** VALIDATION.md previously referenced `tests/e2e/account.spec.ts` and `tests/e2e/deploy.spec.ts`. These were misaligned with the actual plan output and have been removed. Account and deploy behaviors are verified via the human checkpoint in Plan 04 and the automated assertions in `tests/e2e/auth.spec.ts`.

*Wave 0 must be committed before Wave 1 execution begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google OAuth consent screen | WEB-AUTH | Requires real Google account + browser | Click "Sign in with Google", verify consent screen, complete flow |
| Vercel deploy preview | WEB-DEPLOY | Requires Vercel project connected | Push to branch, verify Vercel auto-deploys preview URL |
| Neon DB connection from Vercel | WEB-DB | Requires production env vars | Check Vercel logs for successful DB connection on first request |
| notebooklm-py auth cookie injection | WEB-ANALYSIS | Cookie bundles are environment-specific | Verify `NOTEBOOKLM_AUTH_JSON` is set in Daytona container; test one research run end-to-end |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (3 files, created by Plan 01 Task 1)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
