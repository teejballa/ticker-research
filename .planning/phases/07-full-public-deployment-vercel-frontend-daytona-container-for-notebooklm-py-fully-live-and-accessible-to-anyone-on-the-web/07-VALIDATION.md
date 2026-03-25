---
phase: 7
slug: full-public-deployment-vercel-frontend-daytona-container-for-notebooklm-py-fully-live-and-accessible-to-anyone-on-the-web
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | RQ-01, RQ-02, RQ-03 | unit | `npm test -- security-type` | ❌ W0 | ⬜ pending |
| 7-02-01 | 02 | 1 | RQ-01, RQ-02, RQ-03 | unit | `npm test -- anthropic-search-branching` | ❌ W0 | ⬜ pending |
| 7-02-02 | 02 | 1 | RQ-01, RQ-04 | unit | `npm test -- source-package` | ❌ W0 | ⬜ pending |
| 7-03-01 | 03 | 2 | RQ-01, RQ-02 | manual | Run `ETHM` and `QQQ` research, inspect preamble | — | ⬜ pending |
| 7-04-01 | 04 | 2 | RQ-04 | e2e | `npx playwright test -- security-badge` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/security-type.test.ts` — unit tests for `detectSecurityType()` with mocked Anthropic client; tests quoteType mapping (`'ETF'` → `etf`, `'EQUITY'` → run web-search), name-based SPAC detection, web-search fallback returning `spac`, default equity fallback. Covers RQ-01, RQ-02, RQ-03.
- [ ] `tests/unit/anthropic-search-branching.test.ts` — verifies prompt text and `max_uses` differ by security type; verifies ETF analyst sentinel return shape (`"Not applicable — ETF"`); confirms equity news/analyst bumped to `max_uses: 5`. Covers RQ-01, RQ-02, RQ-03.
- [ ] `tests/e2e/security-badge.spec.ts` — Playwright test that loads a mocked research report with `security_type: 'spac'` and confirms badge renders with correct text; confirms no badge for `security_type: 'equity'`. Covers RQ-04.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ETHM report mentions merger target, vote date, trust NAV | RQ-01 | Real SPAC — can't mock full notebooklm-py pipeline | Run full research on `ETHM`; inspect report for merger details, vote/close date, trust NAV value |
| QQQ report mentions holdings, expense ratio, tracking index | RQ-02 | Real ETF — requires live notebooklm pipeline | Run full research on `QQQ`; inspect report for AUM, expense ratio, top holdings, tracking index |
| AAPL/NVDA research quality not regressed | RQ-03 | Qualitative comparison | Run research on `AAPL` or `NVDA`; confirm output depth ≥ Phase 6 baseline |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
