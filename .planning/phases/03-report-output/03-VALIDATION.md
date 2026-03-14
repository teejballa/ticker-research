---
phase: 3
slug: report-output
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (already configured at `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` — environment: node, globals: true |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | REPT-01, REPT-03 | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 0 | REPT-04 | unit | `npm test -- --reporter=verbose formatters` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | REPT-01 | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | REPT-02 | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ W0 | ⬜ pending |
| 3-02-03 | 02 | 1 | REPT-03 | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ W0 | ⬜ pending |
| 3-02-04 | 02 | 1 | REPT-05 | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ W0 | ⬜ pending |
| 3-02-05 | 02 | 1 | REPT-06 | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | REPT-01, REPT-03 | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/__tests__/ResearchReport.test.tsx` — stubs for REPT-01, REPT-02, REPT-03, REPT-05, REPT-06
- [ ] `src/lib/__tests__/formatters.test.ts` — stubs for REPT-04 (`formatTimestamp`, `formatMarketCap`, `formatPercent`)

**Note on test environment:** Existing vitest config uses `environment: node`. React component tests (`ResearchReport.test.tsx`) will need `environment: 'jsdom'` either globally or per-file via `// @vitest-environment jsdom` comment at top of file. Check existing component tests (e.g. `SetupWizard.test.tsx`) to confirm which pattern is used.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual terminal aesthetic fidelity | REPT-01 | Requires visual inspection — jsdom cannot render CSS | Load report in browser, verify Bloomberg dark/amber theme renders correctly |
| Print CSS rendering | REPT-02 | Requires real browser print dialog | Click Download PDF button, verify print preview shows white background, black text |
| PDF filename suggestion | REPT-02 | Browser-controlled behavior, varies by browser | Save PDF, verify suggested filename is `TICKER-YYYY-MM-DD.pdf` |
| Sticky bar scroll behavior | REPT-03 | Requires real browser scroll — not testable in jsdom | Scroll report page, verify top bar remains visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
