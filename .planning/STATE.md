---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Learning Engine Excellence
status: executing
last_updated: "2026-05-12T03:14:44.336Z"
last_activity: 2026-05-12
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 30
  completed_plans: 30
  percent: 100
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-03 with v2.0 vision)

**Core value:** Given a ticker, return a clear, evidence-backed research report with transparent reasoning and traceable sources — backed by an industry-standard, auditable, self-improving Bayesian learning engine.

**Current focus:** Phase 20 — real-sentiment-analysis

## Current Position

Milestone: v2.0
Phase: 20 (real-sentiment-analysis) — EXECUTING
Plan: 3 of 29 (next: 20-Z-03 — calibration-quality / telemetry CI guard)
Status: Executing Phase 20
Last activity: 2026-05-12 -- Plan 20-Z-02 complete — model + dataset card scaffold + check-model-cards CI guard live
Last completed: 20-Z-02 → model + dataset card scaffold (Mitchell 2019 + Gebru 2018) + check-model-cards CI guard — 2 templates (`docs/templates/MODEL-CARD-template.md` 12 sections, `DATASET-CARD-template.md` 7 sections) + 3 retroactive model cards (stocktwits-naive, reputation-weighted, finbert with `ProsusAI/finbert@pinned-by-ops-at-deploy` S5 SHA pin + OPS-HANDOFF flag) + 1 canonical dataset card (SentimentObservation, bridged from 20-Z-01 in-phase stub via append-only "Moved to:" pointer); 3 single-line `// @model-card:` annotations on aggregator.ts / finsentllm.ts / ensemble.ts (zero logic changes); `scripts/check-model-cards.ts` (321 LOC, pure `runCardChecks(deps)` exported) + config + `npm run check-model-cards` wiring; 13 unit tests covering all 5 failure modes (missing-annotation / phantom-card / stale-card / placeholder-leak / duplicate-annotation) + parseIsoDurationDays table cases, runs in 14ms; all numerical gates green (cards ≥ 3 / dataset cards ≥ 1 / annotations ≥ 3, tsc 0, npm test 755 passing, check-model-cards 0). 6 atomic commits.
Last completed (prior): 20-Z-01 → SentimentObservation PIT feature store — Prisma model live in Neon (13 cols, 0 NULL fetched_at, 2 composite indexes, 1 composite unique on (ticker, message_id, model_version)); insert-only DAO with SHA-256 body hashing + PII allowlist + typed SentimentObservationDuplicateError on P2002; parallel writer wired into sentiment-scan cron (existing SentimentSnapshot writer untouched); `npm run check-immutability` CI guard; 16 unit + 6 live-Neon integration tests green; dataset card stub forward-references 20-Z-02. 8 atomic commits.
Last completed (prior 2): 19-A-06 → calibration validation harness — `reliabilityDiagram` + `hosmerLemeshow` pure functions + chi-square CDF (no jstat dep) in `learning.ts`; `scripts/calibration-report.ts` writes per-class verdicts to `/tmp/calibration-reports/<date>.md` (CLAUDE.md-compliant); 9/9 calibration tests GREEN; baseline run flagged institutional class miscalibrated (n=39, χ²=15.916, p=0.044)

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
