---
phase: 22
slug: market-regime-and-source-weights
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-08
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Full per-task verification map is fleshed out in 22-RESEARCH.md §Validation Architecture; this file is the runbook for the executor.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (existing) + Playwright (existing for E2E) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npm test && npm run check-prompts && npm run check-immutability && npm run check-lookahead && npm run check-telemetry-coverage && npm run check-feature-asof` |
| **Estimated runtime** | ~120s (full); ~8s (changed-file quick) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <affected-test-file>` (quick changed-file)
- **After every plan wave:** Run `npx vitest run` (full unit suite)
- **Before `/gsd-verify-work`:** Full suite + `npx tsc --noEmit` + Playwright e2e for Wave 5 (source-mix UI)
- **Max feedback latency:** 120s

---

## Per-Task Verification Map

> Per 22-RESEARCH.md wave decomposition (6 plans across 6 waves). Filled in by planner during plan generation.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-00-* | 00 | 0 | schema (CORE-ML-06, CORE-ML-08) | live-DB | `npx prisma db pull && grep -E 'regime\|shrinkage_strength' prisma/schema.prisma` | ⬜ pending | ⬜ pending |
| 22-01-* | 01 | 1 | CORE-ML-07 (regime classifier) | unit | `npx vitest run src/lib/regime/__tests__/` | ⬜ pending | ⬜ pending |
| 22-02-* | 02 | 2 | CORE-ML-08, CORE-ML-09 (backfill cron + transition exclusion) | integration | `npx vitest run src/app/api/cron/backfill-regime/__tests__/` | ⬜ pending | ⬜ pending |
| 22-03-* | 03 | 3 | CORE-ML-20, CORE-ML-22 (regime-conditional SourceTier weights + aggregator wiring) | integration | `npx vitest run src/lib/sentiment/__tests__/source-tier-regime.test.ts src/lib/sentiment/__tests__/aggregator-regime.test.ts` | ⬜ pending | ⬜ pending |
| 22-04-* | 04 | 4 | CORE-ML-10, CORE-ML-21 (learn cron hierarchical FDR + per-regime evaluation) | integration | `npx vitest run src/app/api/cron/learn/__tests__/learn-regime.test.ts src/lib/evaluation/__tests__/hierarchical-fdr.test.ts` | ⬜ pending | ⬜ pending |
| 22-05-* | 05 | 5 | done-gate + cutover + source-mix UI | composite + E2E | `npm run phase-22-status && npx playwright test tests/e2e/source-mix-row.spec.ts` | ⬜ pending | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Per 22-RESEARCH.md §Wave 0 Gaps + §Validation Architecture:

- [ ] `src/lib/regime/__tests__/classify.test.ts` — RED stub for regime classifier (D-02..D-05 — VIX percentile + SPY MA cross + transition exclusion)
- [ ] `src/lib/evaluation/__tests__/hierarchical-fdr.test.ts` — RED stub for hierarchical BY → meta-BH (D-15)
- [ ] `src/lib/sentiment/__tests__/source-tier-regime.test.ts` — RED stub for `getWeightForSource(source_id, regime, asOf)` extension + fallback chain (D-06, D-09)
- [ ] `src/lib/sentiment/__tests__/aggregator-regime.test.ts` — RED stub for per-row regime read at aggregation (D-08)
- [ ] `src/app/api/cron/backfill-regime/__tests__/route.test.ts` — RED stub for one-shot checkpoint pattern + Yahoo+Polygon fallback (D-10, D-12)
- [ ] `src/app/api/cron/learn/__tests__/learn-regime.test.ts` — RED stub for two-pass extension with per-regime evaluation + hierarchical FDR (D-15)
- [ ] `tests/e2e/source-mix-row.spec.ts` — RED stub for EngineCalibrationPanel "Source mix" row render (D-17)
- [ ] `scripts/phase-22-status.ts` — composite done-gate (D-14 Brier-lift BCa CI + soak duration + gate-clearance counts)
- [ ] `tests/fixtures/regime/` — synthetic VIX + SPY history fixtures for deterministic classifier tests

*Wave 0 plan (22-00) must include creating these RED stubs before any GREEN implementation work begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 14-day soak observation between relearn and unique-constraint flip | D-13 | Requires wall-clock elapsed time — cannot be unit-tested | Operator runs `npm run phase-22-status --soak-elapsed` once per learn cron cycle; gate passes only when 14 calendar days elapsed AND ≥2 learn cron cycles produced stable posteriors |
| EngineCalibrationPanel "Source mix" row visual quality (D-17) | CORE-ML-22 | Visual hierarchy, density, sparkline subjective | Open `/research/[ticker]` for a high-vol-regime ticker in dev; confirm top-3 sources row visible above the fold; click-to-expand reveals full ranking + 30d sparkline |
| ROADMAP.md 4-bucket update to match REQUIREMENTS CORE-ML-07 | D-02 | Bookkeeping change captured in Wave 5 plan | `grep -E '4-bucket\|bull/bear × low-vol/high-vol' .planning/ROADMAP.md` returns the resolution note |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (see 22-RESEARCH.md §Validation Architecture for full per-task map)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (8 RED stubs above)
- [ ] No watch-mode flags (use `--reporter=dot` not `--watch`)
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter after planner backfills task IDs

**Approval:** pending — set to approved {YYYY-MM-DD} after gsd-planner backfills per-task rows and gsd-plan-checker passes Dimension 8.
