---
phase: 13
slug: deep-sentiment-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest / next build / TypeScript compiler |
| **Config file** | `jest.config.ts` (or project default) |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | Community scraping rework | — | N/A | compile | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 13-01-02 | 01 | 1 | StockTwits API integration | — | Null return on failure | compile | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 13-01-03 | 01 | 1 | Options put/call ratio | — | Null return on failure | compile | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 2 | Type extensions (SourcePackage + AnalysisResult) | — | N/A | compile | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 13-02-02 | 02 | 2 | Gemini prompt + schema extension | — | N/A | compile | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 13-03-01 | 03 | 3 | Sentiment Intelligence card UI | — | N/A | build | `npm run build` | ✅ | ⬜ pending |
| 13-03-02 | 03 | 3 | Forward Outlook section UI | — | N/A | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing TypeScript + Next.js infrastructure covers all phase requirements.

*All new files (`stocktwits.ts`, `options-sentiment.ts`) follow existing patterns in `src/lib/data/` — no new test infrastructure needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| StockTwits API returns real bull/bear data | D-05, D-07 | Live API, no sandbox | Run research on AAPL/GME, verify `stocktwits_bull_pct` and `stocktwits_bear_pct` are non-null |
| Haiku discovers 10 candidate URLs | D-02, D-03 | Live Anthropic API call | Check console logs during research run for discovered URLs |
| Firecrawl scrapes top 5 URLs | D-03 | Live Firecrawl API | Check source package output for 5 community sources |
| Options data returns null for small-cap | D-13 | Requires specific ticker | Run research on a small-cap with no options chain, verify null fields |
| Sentiment Intelligence card renders correctly | D-18 | Visual inspection | Open report for AAPL, verify 3 stat chips visible with correct colors |
| Forward Outlook section renders | D-19 | Visual inspection | Verify `future_projection` text appears as the last report section |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
