---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Learning Engine Excellence
status: executing
last_updated: "2026-05-07T17:26:27.268Z"
last_activity: 2026-05-07
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 30
  completed_plans: 6
  percent: 20
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-03 with v2.0 vision)

**Core value:** Given a ticker, return a clear, evidence-backed research report with transparent reasoning and traceable sources — backed by an industry-standard, auditable, self-improving Bayesian learning engine.

**Current focus:** Phase 19 — Cipher v2.0 Excellence

## Current Position

Milestone: v2.0
Phase: 19 (Cipher v2.0 Excellence) — EXECUTING
Plan: 7 of 30
Status: Ready to execute
Last activity: 2026-05-07
Last completed: 19-Z-04 → npm run model-card-status now exits 1 with 24-line punch list (correct pre-cutover state)

## Accumulated Context (carried forward from v1.0)

**Architectural commitments preserved:**

- Pure-TypeScript on Vercel — no Python, no containers
- `learning.ts` is "pure functions, no DB" — every v2.0 algorithm follows
- `engine-context.ts` is the single trust boundary for authoritative numerics — composite signals + counterfactuals come from here, never from the LLM
- Prisma schema migrations are additive — never drop columns, never change types
- Vercel cron `maxDuration: 300` (default) suffices through Phase 21; bump to `800` for backfill (P25) and adaptive watchlist (P24) on Pro tier

**v2.0 stack additions (verified May 2026):**

- `jstat` — Beta-CDF quantiles for exact Thompson sampling + CI replacement
- `ml-matrix` (6.12.2) — IRLS for full Bayesian logistic with proper covariance
- `posthog-node` — optional metric collection for Phase 26 dashboard

**Critical defensive mandates (cross-cutting, every phase):**

- Record `n_trials_attempted` (FDR denominator)
- Purged K-Fold + Embargo CV (never random splits, never simple time-split)
- Document operational action per metric (no vanity metrics)
- Show ESS, not raw N, on every posterior surface
- Phase 27 entry gate is "legal counsel engaged"

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
