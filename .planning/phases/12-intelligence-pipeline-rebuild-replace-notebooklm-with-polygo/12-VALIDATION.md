---
phase: 12
slug: intelligence-pipeline-rebuild-replace-notebooklm-with-polygo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (existing) |
| **Config file** | `jest.config.js` or `package.json` jest section |
| **Quick run command** | `npm test -- --testPathPattern=analysis` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=analysis`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 0 | Package install | — | N/A | build | `npm run build 2>&1 \| grep -v error` | ✅ | ⬜ pending |
| 12-02-01 | 02 | 1 | Schema evolution | — | N/A | unit | `npm test -- --testPathPattern=types` | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 1 | Gemini integration | — | No API keys in logs | unit | `npm test -- --testPathPattern=gemini` | ❌ W0 | ⬜ pending |
| 12-04-01 | 04 | 1 | Firecrawl scraping | — | Graceful skip if no key | unit | `npm test -- --testPathPattern=firecrawl` | ❌ W0 | ⬜ pending |
| 12-05-01 | 05 | 2 | Analysis route | — | SSE events emitted correctly | unit | `npm test -- --testPathPattern=analysis` | ❌ W0 | ⬜ pending |
| 12-06-01 | 06 | 3 | Decommission cleanup | — | N/A | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/gemini-analysis.test.ts` — Vitest tests for `scrapeCommunitySentiment` and `buildUserPrompt` (5 behavior stubs; created in 12-02 Task 1)
- [ ] `tests/unit/analysis-schema.test.ts` — covers D-09 (5 bullish/bearish signals), D-10 (`price_target` optional field)
- [ ] `src/app/api/analysis/__tests__/route.test.ts` — rewritten to mock `ai` module, assert no `spawn()`, verify SSE events (updated in 12-02 Task 2)
- [ ] `tests/unit/analysis-web-mode.test.ts` — remove `CONTAINER_URL` references (updated in 12-03 decommission plan)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end ticker research | Full pipeline | Requires live Gemini + Firecrawl API keys | Enter ticker in UI, verify report renders with 5 bullish/5 bearish signals and price_target field |
| SSE progress stepper | ResearchProgress UI | Requires running dev server | Run `npm run dev`, enter ticker, verify each progress step advances in the UI |
| Container env vars removed | D-14 | Requires Vercel dashboard access | Verify CONTAINER_URL, CONTAINER_SECRET, CONTAINER_VNC_URL are absent from Vercel project |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
