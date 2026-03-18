---
phase: 5
slug: user-identity-report-history
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright `^1.58.2` (e2e) + Vitest `^3.0.9` (unit) |
| **Config file** | `playwright.config.ts` (e2e), `vitest.config.ts` (unit) |
| **Quick run command** | `npx playwright test tests/e2e/phase5-history.spec.ts --headed=false` |
| **Full suite command** | `npx playwright test tests/e2e/ --headed=false` |
| **Estimated runtime** | ~30 seconds (excluding pipeline tests) |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test tests/e2e/phase5-history.spec.ts --headed=false`
- **After every plan wave:** Run `npx playwright test tests/e2e/ --headed=false`
- **Before `/gsd:verify-work`:** Full suite must be green (excluding pipeline tests that require live NotebookLM)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | HIST-01 | unit | `npx vitest run src/lib/reports.test.ts` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | HIST-01 | e2e | `npx playwright test tests/e2e/phase5-history.spec.ts -g "report file written"` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 1 | AUTH-01 | e2e | `npx playwright test tests/e2e/phase5-history.spec.ts -g "nav shows email"` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 1 | AUTH-01 | e2e | `npx playwright test tests/e2e/phase5-history.spec.ts -g "nav shows NOT CONNECTED"` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 2 | HIST-02 | e2e | `npx playwright test tests/e2e/phase5-history.spec.ts -g "history section visible"` | ❌ W0 | ⬜ pending |
| 5-03-02 | 03 | 2 | HIST-02 | e2e | `npx playwright test tests/e2e/phase5-history.spec.ts -g "OPEN loads saved report"` | ❌ W0 | ⬜ pending |
| 5-03-03 | 03 | 2 | HIST-02 | e2e | `npx playwright test tests/e2e/phase5-history.spec.ts -g "empty state"` | ❌ W0 | ⬜ pending |
| 5-04-01 | 04 | 3 | HIST-03 | e2e | `npx playwright test tests/e2e/phase5-history.spec.ts -g "REGENERATE navigates"` | ❌ W0 | ⬜ pending |
| 5-04-02 | 04 | 3 | HIST-03 | e2e | `npx playwright test tests/e2e/phase5-history.spec.ts -g "regenerate creates new entry"` | ❌ W0 (slow) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/phase5-history.spec.ts` — stubs for AUTH-01, HIST-01, HIST-02, HIST-03 (all Phase 5 e2e tests); REGENERATE + new entry test uses `test.setTimeout(8 * 60 * 1000)` consistent with `full-flow.spec.ts`
- [ ] `src/lib/reports.ts` — report read/write helpers (needed before unit tests can import); must export `writeReport()`, `listReports()`, `readReport()`, `StoredReport` type
- [ ] `src/lib/reports.test.ts` — unit tests for `writeReport()`, `StoredReport` type shape, filename sanitization (colons → dashes)
- [ ] `scripts/get_email.py` — email extraction script using Playwright + stored auth context to navigate to myaccount.google.com; needed by `setup/status/route.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email displays correctly for connected Google account | AUTH-01 | Requires real `~/.notebooklm/storage_state.json` with valid session | Run app, check nav bar shows correct email |
| Full regenerate produces new report entry | HIST-03 | Requires live NotebookLM + ~5min pipeline run | Click REGENERATE on any past report, confirm new entry in history |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
