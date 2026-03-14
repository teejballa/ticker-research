---
phase: 1
slug: data-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (integrates with Next.js/Vite toolchain) |
| **Config file** | `vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `npx vitest run src/lib/data/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/data/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01-01 | 0 | - | setup | `npx vitest run` | ❌ W0 | ⬜ pending |
| 1-02-01 | 01-02 | 1 | TICK-01 | unit | `npx vitest run src/lib/data/yahoo.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-02 | 01-02 | 1 | TICK-02 | unit | `npx vitest run src/lib/data/yahoo.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-03 | 01-02 | 1 | TICK-03 | integration | `npx vitest run src/app/api/research/route.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-01 | 01-03 | 2 | DATA-01 | unit | `npx vitest run src/lib/data/yahoo.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-02 | 01-03 | 2 | DATA-02 | unit | `npx vitest run src/lib/data/yahoo.test.ts` | ❌ W0 | ⬜ pending |
| 1-04-01 | 01-04 | 2 | DATA-03 | unit (mocked) | `npx vitest run src/lib/data/anthropic-search.test.ts` | ❌ W0 | ⬜ pending |
| 1-04-02 | 01-04 | 2 | DATA-04 | unit (mocked) | `npx vitest run src/lib/data/anthropic-search.test.ts` | ❌ W0 | ⬜ pending |
| 1-04-03 | 01-04 | 2 | DATA-05 | unit (mocked) | `npx vitest run src/lib/data/anthropic-search.test.ts` | ❌ W0 | ⬜ pending |
| 1-04-04 | 01-04 | 2 | DATA-06 | unit (mocked) | `npx vitest run src/lib/data/anthropic-search.test.ts` | ❌ W0 | ⬜ pending |
| 1-05-01 | 01-05 | 3 | DATA-07 | unit | `npx vitest run src/lib/data/source-package.test.ts` | ❌ W0 | ⬜ pending |
| 1-05-02 | 01-05 | 3 | DATA-08 | integration | `npx vitest run src/lib/data/source-package.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/data/yahoo.test.ts` — stubs for TICK-01, TICK-02, DATA-01, DATA-02
- [ ] `src/lib/data/anthropic-search.test.ts` — stubs for DATA-03, DATA-04, DATA-05, DATA-06 (mocked Anthropic SDK)
- [ ] `src/lib/data/source-package.test.ts` — stubs for DATA-07, DATA-08
- [ ] `src/app/api/research/route.test.ts` — stubs for TICK-03 (pipeline confirmation gate)
- [ ] `vitest.config.ts` — framework config
- [ ] Framework install: `npm install -D vitest @vitejs/plugin-react` — if not already present

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Autocomplete dropdown appears as user types | TICK-01 | Visual/interactive UI behavior | Type "Apple" into search input, verify dropdown shows within 300ms with ticker + name + price |
| Invalid ticker shows shake animation | TICK-01 | CSS animation, visual | Enter "XXXXINVALID", verify shake animation plays and inline error appears |
| Chart confirmation view renders correctly | TICK-02 | Visual component render | After selecting AAPL, verify line chart shows 1-month OHLCV data with company details sidebar |
| Source package temp file is created and deleted | DATA-08 | File system lifecycle, timing | Run pipeline, verify file exists in os.tmpdir() during collection, then is deleted after completion |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
