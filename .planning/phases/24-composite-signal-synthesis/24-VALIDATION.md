---
phase: 24
slug: composite-signal-synthesis
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-16
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Full validation architecture lives in `24-RESEARCH.md` — this file is the checklist derived from it.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (unit + integration) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/composite/` |
| **Full suite command** | `npm test && npx tsc --noEmit` |
| **Estimated runtime** | ~15s (quick) / ~30s (full) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/composite/` (unit-scoped)
- **After every plan wave:** Run `npm test` (all vitest)
- **Before `/gsd-verify-work`:** Full suite must be green + `npx tsc --noEmit` = 0
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-00-01 | 00 | 0 | REASON-01..05 | — | Schema migration applied | integration | `npx prisma db push --accept-data-loss` | ❌ W0 | ⬜ pending |
| 24-00-02 | 00 | 0 | REASON-01..05 | — | RED test scaffolds fail | unit | `npx vitest run tests/composite/ --reporter=verbose` | ❌ W0 | ⬜ pending |
| 24-01-01 | 01 | 1 | REASON-01 | — | Per-class isotonic curves fit | unit | `npx vitest run tests/composite/isotonic-fit.unit.test.ts` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | REASON-01 | — | ESS-weighted mean composes correctly | unit | `npx vitest run tests/composite/ess-weighted-mean.unit.test.ts` | ❌ W0 | ⬜ pending |
| 24-02-01 | 02 | 2 | REASON-02 | — | BCa bootstrap CI on composite | unit | `npx vitest run tests/composite/bootstrap-ci.unit.test.ts` | ❌ W0 | ⬜ pending |
| 24-02-02 | 02 | 2 | REASON-01, D-03 | — | Fallback gate + √(4/K) widening | unit | `npx vitest run tests/composite/fallback-gate.unit.test.ts` | ❌ W0 | ⬜ pending |
| 24-03-01 | 03 | 3 | REASON-05 | T-24-01 | Engine-context populates 7 new fields | integration | `npx vitest run tests/composite/engine-context-composite.int.test.ts` | ❌ W0 | ⬜ pending |
| 24-03-02 | 03 | 3 | REASON-05 | T-24-01 | Zod schema does NOT expose composite fields to LLM | unit | `npx vitest run tests/composite/schema-negative-shape.unit.test.ts` | ❌ W0 | ⬜ pending |
| 24-03-03 | 03 | 3 | REASON-04 | — | Reliability diagram data emitted | integration | `npx vitest run tests/composite/reliability-bins.int.test.ts` | ❌ W0 | ⬜ pending |
| 24-04-01 | 04 | 4 | REASON-03 | — | EngineCalibrationPanel renders composite headline | unit | `npx vitest run tests/composite/panel-headline.unit.test.tsx` | ❌ W0 | ⬜ pending |
| 24-04-02 | 04 | 4 | REASON-04 | — | Reliability diagram appears in `/insights/calibration` | integration | `npx vitest run tests/composite/insights-render.int.test.tsx` | ❌ W0 | ⬜ pending |
| 24-04-03 | 04 | 4 | D-07 | — | Ship-gate script passes on backfill | integration | `npx tsx scripts/check-composite-ship-gate.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `prisma/schema.prisma` — additive migration for `CompositeCalibrationSnapshot`
- [ ] `tests/composite/` — RED test scaffolds for all 12 tasks above
- [ ] `tests/composite/_fixtures/` — golden vectors for isotonic fit + ESS-weighted mean + BCa bootstrap
- [ ] `tests/composite/_fixtures/coverage-probe.sql` — one-line query to measure `MIN_CLASSES_ACTIVE=2` coverage on live backfill
- [ ] Framework already installed (Vitest 3.x present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reliability curve visually matches diagonal on `/insights/calibration` | REASON-04 | Diagonal-adherence is visual gestalt — automated ECE gate covers threshold but not "looks right" | 1) Deploy to prod 2) Open `/insights/calibration` 3) Confirm `cipher-composite-v1` curve tracks diagonal within CI band 4) Confirm sample-size histogram is non-empty |
| Composite headline copy reads clearly in EngineCalibrationPanel | REASON-03 | Wording is subjective; A/B feel test | 1) Generate 3 reports (AAPL, GME, SPY) 2) Confirm composite tile leads visually 3) Confirm per-class breakdown is clearly a "beneath" section, not competing for attention |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (schema, RED tests, fixtures, coverage probe)
- [ ] No watch-mode flags in any command
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 lands + review)

**Approval:** pending
