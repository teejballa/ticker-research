---
phase: 18
slug: time-decayed-bayesian-updates-ess
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source of truth for test mapping is `18-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (units + live-DB integration), Playwright (e2e) |
| **Config files** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Live-DB integration** | `npm run test:integration` |
| **E2E command** | `npm run test:e2e` |
| **Full suite command** | `npm test -- --run && npm run test:integration && npm run test:e2e` |
| **Estimated runtime (full)** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run` (units only — fast)
- **After every plan wave:** Run `npm run test:integration` against live Neon dev branch
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (units) / 90 seconds (integration)

---

## Per-Task Verification Map

> Populated by gsd-planner from PLAN.md frontmatter and acceptance_criteria.
> Each task in every PLAN.md must map to a row here before `nyquist_compliant: true`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _pending — gsd-planner fills_ | | | | | | | | | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Tests-first scaffolding before any implementation task in Wave 1+:

- [ ] `src/lib/__tests__/learning.decay.test.ts` — stubs for CORE-ML-01 (decayWeights, computeESS)
- [ ] `src/lib/__tests__/learning.ess.test.ts` — stubs for CORE-ML-01 (Kish ESS)
- [ ] `src/lib/__tests__/learning.ph.test.ts` — stubs for CORE-ML-04 (Page-Hinkley)
- [ ] `src/lib/__tests__/learning.drift.test.ts` — stubs for CORE-ML-04 (confirmedDrift two-of-two)
- [ ] `src/lib/__tests__/cv.purgedkfold.test.ts` — stubs for D-16 (purged K-fold)
- [ ] `src/app/api/cron/learn/__tests__/learn.ess.live.test.ts` — stub for CORE-ML-02 (cron applies decay)
- [ ] `src/app/api/cron/learn/__tests__/learn.drift.live.test.ts` — stubs for CORE-ML-04 (drift_alert event + EXPLORATORY-WATCH flip)
- [ ] `src/app/api/cron/backfill-ess/__tests__/backfill.live.test.ts` — stub for D-13 (idempotency)
- [ ] `tests/e2e/engine-calibration-ess.spec.ts` — stub for CORE-ML-05 (ESS column + watch badge)
- [ ] `tests/e2e/insights-ess-ci.spec.ts` — stub for CORE-ML-03 (CI widths reflect ESS)

Existing infrastructure (`vitest`, `@playwright/test`, live-DB harness) covers these — no new framework install.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| λ tuning script: pick winning λ per signal class | CORE-ML-02 / D-01 | Tuning is operator-driven; output is a constant committed to git, not a runtime decision | Run `npx tsx scripts/tune-lambda.ts`, inspect OOS Brier table, paste winning λ into `HYPERPARAMETERS` constant in `learning.ts` |
| Page-Hinkley parameter tuning: pick (δ, λ_PH) per signal class | CORE-ML-04 / D-07 | Same — operator pastes winning params into `HYPERPARAMETERS` | Run `npx tsx scripts/tune-page-hinkley.ts`, inspect injected-drift F1 table, commit constants |
| Backfill cron one-time invocation in production | CORE-ML-01 / D-13 | Production-side env flag flip + manual trigger; idempotency makes accidental re-run safe | `vercel env add ENABLE_BACKFILL_ESS production`, hit `/api/cron/backfill-ess` once with CRON_SECRET, verify `ess_backfill_complete` LearningEvent written |
| `/research/AAPL` visual sanity: ESS column reads naturally, watch badge unobtrusive | CORE-ML-05 / D-10/D-11 | Visual UX judgment — Playwright catches presence not aesthetics | Open in browser, compare to UI-SPEC if present |

---

## Validation Sign-Off

- [ ] All tasks have `<acceptance_criteria>` referencing one of the test paths above OR a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (10 stubs above)
- [ ] No watch-mode flags in commands
- [ ] Feedback latency < 30s for unit layer
- [ ] `nyquist_compliant: true` set in frontmatter once gsd-planner populates the per-task map

**Approval:** pending — set to `approved YYYY-MM-DD` after the plan-checker pass that flips `nyquist_compliant: true`.
