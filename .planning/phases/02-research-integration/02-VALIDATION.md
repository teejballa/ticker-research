---
phase: 2
slug: research-integration
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-12
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (TypeScript) + pytest (Python script) |
| **Config file** | `jest.config.ts` (existing) / `scripts/requirements.txt` |
| **Quick run command** | `npm test -- --testPathPattern="setup\|SetupWizard\|research-brief\|analysis\|analysis-result\|ResearchProgress"` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="setup\|SetupWizard\|research-brief\|analysis\|analysis-result\|ResearchProgress"`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-setup-status | 02-01 | 1 | RSRCH-01 | unit | `npm test -- --testPathPattern="setup"` | ❌ W0 | ⬜ pending |
| 02-01-setup-install | 02-01 | 1 | RSRCH-01 | integration | `npm test -- --testPathPattern="setup"` | ❌ W0 | ⬜ pending |
| 02-01-setup-auth | 02-01 | 1 | RSRCH-01 | integration | `npm test -- --testPathPattern="setup"` | ❌ W0 | ⬜ pending |
| 02-01-wizard-component | 02-01 | 1 | RSRCH-01 | unit | `npm test -- --testPathPattern="SetupWizard"` | ❌ W0 | ⬜ pending |
| 02-02-format-brief | 02-02 | 1 | RSRCH-01 | unit | `npm test -- --testPathPattern="research-brief"` | ❌ W0 | ⬜ pending |
| 02-02-extract-urls | 02-02 | 1 | RSRCH-01 | unit | `npm test -- --testPathPattern="research-brief"` | ❌ W0 | ⬜ pending |
| 02-03-python-script | 02-03 | 2 | RSRCH-02,03,04,05,06,07 | integration | `npm test -- --testPathPattern="analysis"` | ❌ W0 | ⬜ pending |
| 02-03-sse-protocol | 02-03 | 2 | RSRCH-02 | unit | `npm test -- --testPathPattern="analysis"` | ❌ W0 | ⬜ pending |
| 02-04-analysis-route | 02-04 | 2 | RSRCH-02 | integration | `npm test -- --testPathPattern="analysis"` | ❌ W0 | ⬜ pending |
| 02-04-analysis-result-types | 02-04 | 2 | RSRCH-04,05,06,07 | unit | `npm test -- --testPathPattern="analysis-result"` | ❌ W0 | ⬜ pending |
| 02-04-progress-component | 02-04 | 2 | RSRCH-02 | unit | `npm test -- --testPathPattern="ResearchProgress"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/setup/__tests__/status.test.ts` — stubs for setup status checks (02-01 Task 1)
- [ ] `src/components/__tests__/SetupWizard.test.tsx` — stubs for SetupWizard component (02-01 Task 1)
- [ ] `src/lib/__tests__/research-brief.test.ts` — stubs for formatResearchBrief + extractNewsUrls (02-02 TDD plan)
- [ ] `src/app/api/analysis/__tests__/route.test.ts` — stubs for SSE streaming + mock spawn (02-03 Task 2)
- [ ] `src/lib/__tests__/analysis-result.test.ts` — AnalysisResult schema validation stubs (02-04 Task 1)
- [ ] `src/components/__tests__/ResearchProgress.test.tsx` — ResearchProgress component stubs (02-04 Task 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser opens for Google login | RSRCH-01 | Requires real browser interaction | Run `notebooklm login`, verify browser opens, complete login, verify `~/.notebooklm/storage_state.json` created |
| Full NotebookLM query run | RSRCH-02–07 | Requires real NotebookLM auth + network | Run `python3 scripts/notebooklm_research.py <fixture-path>`, verify RESULT: JSON contains all required fields |
| Rate limit error display | RSRCH-02 | Requires exhausted daily quota | Manually mock ERROR: line with rate limit text, verify UI shows correct message |
| Progress display animation | RSRCH-02 | Visual verification | Run analysis, observe step-by-step progress display in browser |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
