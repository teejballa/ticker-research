---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Learning Engine Excellence
status: executing
last_updated: "2026-05-08T04:08:00.000Z"
last_activity: 2026-05-08 -- Phase 19-A-06 complete
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 30
  completed_plans: 10
  percent: 33
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-03 with v2.0 vision)

**Core value:** Given a ticker, return a clear, evidence-backed research report with transparent reasoning and traceable sources — backed by an industry-standard, auditable, self-improving Bayesian learning engine.

**Current focus:** Phase 19 — cipher-v2-0-excellence

## Current Position

Milestone: v2.0
Phase: 19 (cipher-v2-0-excellence) — EXECUTING
Plan: 11 of 30 (next: 19-A-07, OR Wave B/C)
Status: Executing Phase 19
Last activity: 2026-05-08 -- Phase 19-A-06 complete
Last completed: 19-A-06 → calibration validation harness — `reliabilityDiagram` + `hosmerLemeshow` pure functions + chi-square CDF (no jstat dep) in `learning.ts`; `scripts/calibration-report.ts` writes per-class verdicts to `/tmp/calibration-reports/<date>.md` (CLAUDE.md-compliant); 9/9 calibration tests GREEN; baseline run flagged institutional class miscalibrated (n=39, χ²=15.916, p=0.044)
Last completed (prior): 19-A-05 → rolling 20d rank-IC monitor + alpha-decay-watch cron live; 9/9 unit + 5/5 integration tests GREEN; benchmark 356ms (empty-work-path on currently-EXPLORATORY universe)

## Accumulated Context (carried forward from v1.0)

### Roadmap Evolution

- 2026-05-10: Phase 21 added — Sector-Relative Outcome Labels (`alpha-vs-sector-ETF` becomes primary outcome label; SPY-alpha retained as secondary). Driven by 4-agent literature synthesis: DGTW 1997 / Lakonishok-Lee / AQR / Park-Irwin / Quantopian all converge that sector-relative is the right benchmark for the firm-specific signals Cipher tracks. Context doc: `.planning/phases/21-sector-relative-outcome-labels/CONTEXT.md`.

**Architectural commitments preserved:**

- Pure-TypeScript on Vercel — no Python, no containers
- `learning.ts` is "pure functions, no DB" — every v2.0 algorithm follows
- `engine-context.ts` is the single trust boundary for authoritative numerics — composite signals + counterfactuals come from here, never from the LLM
- Prisma schema migrations are additive — never drop columns, never change types
- Vercel cron `maxDuration: 300` (default) suffices through Phase 23; bump to `800` for backfill (P27) and adaptive watchlist (P26) on Pro tier

**v2.0 stack additions (verified May 2026):**

- `jstat` — Beta-CDF quantiles for exact Thompson sampling + CI replacement
- `ml-matrix` (6.12.2) — IRLS for full Bayesian logistic with proper covariance
- `posthog-node` — optional metric collection for Phase 28 dashboard

**Critical defensive mandates (cross-cutting, every phase):**

- Record `n_trials_attempted` (FDR denominator)
- Purged K-Fold + Embargo CV (never random splits, never simple time-split)
- Document operational action per metric (no vanity metrics)
- Show ESS, not raw N, on every posterior surface
- Phase 29 entry gate is "legal counsel engaged"

## v1.0 Carryover Items (calendar-gated, not blocking)

- Phase 17 UAT Test 11: institutional/insider 30d posteriors materialize ~2026-05-26 once first 30d outcomes resolve naturally
- Phase 17 UAT Test 12: dashboard cron-log audit (deploy health verified; runtime log inspection deferred)

## Performance Metrics

**Velocity (v1.0 baseline):**

- Total plans completed: 65
- Average duration: ~0.9 days/plan
- Total execution time: 49 days

**v2.0 Target Cadence:** maintain ~1 plan/day average; estimate 25-35 plans across 10 phases.

---

*Updated after each plan completion via `/gsd-execute-phase` or `/gsd-plan-phase`*
