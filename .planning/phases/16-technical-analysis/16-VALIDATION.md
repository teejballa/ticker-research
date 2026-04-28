---
phase: 16
slug: technical-analysis
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x (units + integration), Playwright 1.x (e2e) |
| **Config file** | `vitest.config.ts` (units), `vitest.integration.config.ts` (live-DB), `playwright.config.ts` (e2e) |
| **Quick run command** | `npm test -- --run <pattern>` |
| **Full suite command** | `npm test && npm run test:integration` |
| **Estimated runtime** | ~30s units, ~60s integration (skips when DATABASE_URL absent) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run <changed-spec>` (≤10s)
- **After every plan wave:** Run `npm test` (full unit suite)
- **Before `/gsd-verify-work`:** `npm test && npm run test:integration` must be green
- **Max feedback latency:** ~30 seconds for unit signal

---

## Per-Task Verification Map

> Filled in during execution. Each PLAN.md task has its own `<automated>` verify command.

| Task ID | Plan | Wave | Acceptance Criterion | Test Type | Automated Command | File Exists | Status |
|---------|------|------|---------------------|-----------|-------------------|-------------|--------|
| 16-01-* | 01 | 0 | TechPattern classification + indicator math | unit | `npm test -- --run tests/lib/data/technical.test.ts` | ❌ W0 | ⬜ pending |
| 16-02-* | 02 | 1 | Migration + multi-horizon outcomes | integration | `npm run test:integration -- --run tests/integration/multi-horizon-outcomes.test.ts` | ❌ W0 | ⬜ pending |
| 16-03-* | 03 | 2 | Snapshot writer + dual-class learn loop | integration | `npm run test:integration -- --run tests/integration/dual-class-learn.test.ts` | ❌ W0 | ⬜ pending |
| 16-04-* | 04 | 3 | Engine context + prompt + UI render | unit + e2e | `npm test -- --run tests/lib/engine-context.test.ts && npx playwright test tests/e2e/engine-calibration-panel.spec.ts` | ❌ W0 | ⬜ pending |
| 16-05-* | 05 | 4 | Backfill + insights + AC2/AC4/AC5 | integration | `npm run test:integration -- --run tests/integration/technical-affects-reports.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/data/technical.test.ts` — RSI/MACD/SMA/ATR math + 8 TechPattern classification edge cases (truncated-array warmup gotcha)
- [ ] `tests/integration/multi-horizon-outcomes.test.ts` — price-followup writes 30/60/90 outcomes when window matches
- [ ] `tests/integration/dual-class-learn.test.ts` — single learn cycle updates one diffusion + one technical Beta cell per outcome row, transactional
- [ ] `tests/integration/technical-affects-reports.test.ts` — analog of `engine-affects-reports.test.ts`: same ticker pre/post `learn` cycle changes `technical_*` calibration block; Gemini output (or fixture) cites tech pattern + 30d horizon
- [ ] `tests/e2e/engine-calibration-panel.spec.ts` — Playwright: panel renders DIFFUSION + TECHNICAL columns + horizon table for a seeded ticker; degrades gracefully to diffusion-only when `horizon_calibrations` absent
- [ ] `scripts/check-active-cell-coverage.ts` — post-backfill assertion that ≥25% of cells in most-traded cap_class @ 7d have `status='ACTIVE'` (AC3)
- [ ] `scripts/compare-horizon-brier.ts` — print Brier(7d) vs Brier(30d) for ACTIVE patterns; integration test parses output and asserts ≥1 pattern with Brier(30d) ≤ Brier(7d) (AC4)

---

## Manual-Only Verifications

| Behavior | Acceptance Criterion | Why Manual | Test Instructions |
|----------|---------------------|------------|-------------------|
| Visual quality of EngineCalibrationPanel side-by-side layout, agreement badge styling, horizon table density | AC1 | Visual subjective — Playwright DOM checks pass but visual polish needs eyeballs | Run `npm run dev`, open `/research/AAPL` after seeding, screenshot panel, confirm columns balanced + badge readable + horizon rows ≤6 with star marker on 30d |
| Technical Signals card placement and density in ResearchReport | AC1 + Plan 04 | Information design — competing for space with existing cards | Open seeded report, scroll to Technical Signals card, confirm RSI gauge + MACD direction + MA stack + volume ratio render in compact form |
| `/insights` Technical Pattern Library + Horizon Brier tabs render correctly | Plan 05 | Dashboard composition is visual | Open `/insights`, click new tabs, confirm pattern grid populates + Brier chart renders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (7 files listed above)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s for unit signal
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
