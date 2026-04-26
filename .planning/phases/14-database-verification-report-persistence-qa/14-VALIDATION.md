---
phase: 14
slug: database-verification-report-persistence-qa
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 (unit) + Playwright 1.58.2 (e2e) |
| **Config file** | `vitest.config.ts` (root) · `playwright.config.ts` (root) |
| **Quick run command** | `npx vitest run tests/unit/reports-db.test.ts tests/unit/history-route.test.ts` |
| **Full suite command** | `npm test` (all vitest unit tests) |
| **e2e command** | `npm run test:e2e -- --grep "db-persistence"` |
| **Estimated runtime** | ~10s (unit) · ~60s (e2e) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/reports-db.test.ts tests/unit/history-route.test.ts`
- **After every plan wave:** Run `npm test` (full unit suite must be green)
- **Before `/gsd-verify-work`:** Full unit suite green + `npm run test:e2e -- --grep "db-persistence"` green
- **Max feedback latency:** ~10 seconds (unit)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | DB-QA-01, DB-QA-02 | — | id field exposed for web-mode navigation | unit | `npx vitest run tests/unit/reports-db.test.ts` | ✅ (extend) | ⬜ pending |
| 14-01-02 | 01 | 1 | DB-QA-02 | — | ReportHistory uses report.id in web mode | unit | `npx vitest run tests/unit/history-route.test.ts` | ✅ (extend) | ⬜ pending |
| 14-02-01 | 02 | 1 | DB-QA-01, DB-QA-03 | — | Phase 12/13 fields survive write/read round-trip | unit | `npx vitest run tests/unit/reports-db.test.ts` | ✅ (extend) | ⬜ pending |
| 14-02-02 | 02 | 1 | DB-QA-05 | — | Pre-Phase 12 report renders without crash | unit | `npx vitest run src/components/__tests__/ResearchReport.test.tsx` | ✅ (extend) | ⬜ pending |
| 14-02-03 | 02 | 1 | DB-QA-06 | Cross-user access | readReportFromDb throws for wrong userId | unit | `npx vitest run tests/unit/reports-db.test.ts` | ✅ exists | ⬜ pending |
| 14-03-01 | 03 | 1 | — | — | Fix failing extractCommunityHighlights mock (6 tests) | unit | `npm test` | ✅ (fix) | ⬜ pending |
| 14-04-01 | 04 | 2 | DB-QA-07 | — | prisma migrate deploy — no pending migrations | manual | `npx dotenv -e .env.local -- npx prisma migrate status` | ❌ manual only | ⬜ pending |
| 14-05-01 | 05 | 2 | DB-QA-02, DB-QA-04, DB-QA-08 | — | Full sign-in → run → sign-out → sign-in → history → open flow | e2e | `npm run test:e2e -- --grep "db-persistence"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/db-persistence.spec.ts` — new Playwright e2e spec covering DB-QA-02, DB-QA-08
- [ ] Extend `tests/unit/reports-db.test.ts` — add id field + Phase 12/13 round-trip tests (DB-QA-01, DB-QA-03)
- [ ] Extend `src/components/__tests__/ResearchReport.test.tsx` — add pre-Phase 12 backward-compat test (DB-QA-05)

*Note: Unit test infrastructure is already installed — only new test files/cases needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `prisma migrate deploy` in production | DB-QA-07 | Requires live Neon connection; DIRECT_URL env var must be set in shell | Run: `npx dotenv -e .env.local -- npx prisma migrate status`. Expected: "All migrations have been applied." |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s (unit suite)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
