---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Learning Engine Excellence
status: executing
last_updated: "2026-05-18T17:21:09.063Z"
last_activity: 2026-05-18 -- Phase 30.1 execution started
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

**Current focus:** Phase 30.1 — free-community-scan-migration

## Current Position

Milestone: v2.0
Phase: 30.1 (free-community-scan-migration) — EXECUTING
Plan: 1 of 5
Status: Executing Phase 30.1
Last activity: 2026-05-18 -- Phase 30.1 execution started
Last completed: 20-C-02 → Brier + Murphy 1973 decomposition + CORP-method (PNAS 2021) reliability diagram per classifier_version. `src/lib/stats/brier.ts` (brierScore + brierDecomposition with strict unique-prediction-value Murphy 1973 partition — algebraic identity BS = R − Res + U holds at 1e-9; equal-width binning is retained only for the per_bin dashboard histogram, not for R/Res/U) + `src/lib/stats/isotonic.ts` (Pool-Adjacent-Violators with same-x tie pre-aggregation + CORP-method reliability diagram). `scripts/eval-brier.ts` joins SentimentObservation PIT-INVARIANT on `fetched_at` (Gate 8: zero `published_at` literals) × forward 7d alpha-vs-SPY (PriceOutcome.pct_change at days_after=7 minus SPY 7d return via yahoo-finance2). Weekly `/api/cron/eval-brier` (Bearer CRON_SECRET; `0 8 * * 1` UTC) writes `reports/brier-{date}.json` (always; gitignored) and `reports/brier-{date}.md` (only on ship_gate_failed; committed as operator narrative with REMEDIATION_RECOMMENDATION). `/insights/calibration` server component renders one BrierTile (ship-gate badge + stacked R/−Res/U bar + remediation) + one ReliabilityDiagram (pure-SVG CORP curve + identity diagonal + 20-bin frequency histogram for T-20-C-02-04 multimodal defense) per classifier_version. Ship gate: Brier ≤ 0.24 AND |base_rate − 0.5| < 0.1 (T-20-C-02-01). Minimum n=100 per classifier_version (T-20-C-02-02 isotonic stability). HYPERPARAMETERS.md §Brier Calibration with citations to Brier 1950, Murphy 1973, Bröcker-Smith 2007, Barlow-Brunk 1972, Dimitriadis-Gneiting-Jordan 2021, Niculescu-Mizil-Caruana 2005. `setAlphaResolver()` test seam allows integration tests to inject deterministic outcomes without yahoo-finance2 fixtures. 22 unit tests + 5 live-Neon integration tests green; npm test 1136 passing (no regressions vs 1114 baseline); npx tsc --noEmit 0; check-model-cards/immutability/telemetry-coverage/prompts/lookahead all 0 violations. 1477 new LOC across 8 source files + 4 test files. 7 atomic commits (bfbe06b, ffb29bd, ae29804, 838663c, 7034101, 1f4519b, 8e894b1).

Last completed (prior): 20-Z-05 → LLM-as-judge eval harness — `src/lib/eval/judge.ts` calls Claude Opus 4.7 with five-dimension rubric (numeric_grounding · citation_coverage · narrative_coherence · hedging_quality · contradiction_handling) loaded from the 20-Z-04 prompt registry (id=`eval-judge-v1`, version=`v1`); hard-pinned `judge_model='claude-opus-4-7'`, `temperature=0`, no `cache_control` (T-20-Z-05-05); lazy-client pattern mirrors anthropic-search.ts; type-narrowed `opts.temperature?: 0` and `opts.cache?: false` so accidental looseness is a compile-time error. `scripts/eval-report.ts` CLI iterates `tests/golden-tickers/_human_labels/` (5 starter exemplars covering AAPL bull/bear, GME meme crowding, SPY neutral, PLTR mixed; per-dim variance 1.20-2.24 so Pearson well-defined), emits per-dimension Pearson r vs human scores + JSON + markdown; auto-engages `--dry-run` (deterministic sha256-seeded synthetic scoring) when `ANTHROPIC_API_KEY` is unset so CI runs cost zero tokens (T-20-Z-05-02). Sample-size warning fires at n<30 referencing 20-D-04 dependency. `npm run eval` wired in package.json; wall-clock ~2ms on starter set (target <60s). 13 unit tests with mocked Anthropic SDK + RUN_LIVE_JUDGE-gated integration test (skipped in `npm test`, opt-in via `RUN_LIVE_JUDGE=true`). PromptId union extended in `src/lib/prompts/registry.ts` with `'eval-judge-v1'`; rubric body lives at `src/lib/prompts/_v1/eval-judge-v1.md` with golden-snapshot drift protection from 20-Z-04. All 879 unit tests passing (+2 skipped, +3 todo), `npx tsc --noEmit` 0, `npm run check-prompts` 0. 4 atomic commits (b7c0c8a, cc46d21, c70cbcd, 41b3aae).
Last completed (prior): 20-Z-04 → prompt registry + golden-file regression — every Gemini prompt in the codebase migrated to versioned `(PromptId, PromptVersion)` artifacts under `src/lib/prompts/_vN/<id>.md` with closed PromptId union (10 (id,version) tuples = 9 v1 + 1 v2 cove-pass1), `renderPrompt()` pure substitution + missing-var guard + post-render placeholder leak scan, bit-identical migration proven by 26 byte-equality assertions, golden-snapshot regression test + `scripts/check-prompt-versions.ts` git-diff-aware CI gate + `.github/workflows/prompts.yml`, MODEL-CARD-prompt-registry.md S4 documentation. 6 atomic commits.
Last completed (prior 2): 20-Z-03 → per-provider telemetry foundation — `ProviderCallLog` Prisma model live in Neon (15 cols, 2 composite indexes `idx_pcl_provider_started` + `idx_pcl_ticker_started`); `withTelemetry<T>()` wrapper composing around `withRetry` (fire-and-forget INSERT via queueMicrotask — caller-side timing unchanged; T-20-Z-03-01 verified with 1000-invocation overhead harness well under 5ms p99 CI ceiling); 21 external call sites wrapped across yahoo (×2), polygon, polygon-news, finnhub, finnhub-analyst (×3), anthropic-search (×4), stocktwits (×2), lightweight-community-scan (firecrawl), apewisdom, exa-search (×3 under anthropic-search umbrella), finsentllm (finbert-hf), gemini-analysis (with usage.inputTokens × GEMINI_TOKEN_RATES estimator); `/insights/sentiment-health` server component + `/api/insights/sentiment-health` JSON endpoint computing per-provider p50/p95/p99 + error/cache/fallback/cost via Postgres `percentile_cont` over last-24h; two new Vercel crons (`/api/cron/cost-budget-check` at 09:00 UTC — 1.5× rolling-7d alerter with `insufficient_history` cold-start no-op per T-20-Z-03-04; `/api/cron/provider-call-log-retention` at 09:30 UTC — 90d sweeper per T-20-Z-03-02); `scripts/check-telemetry-coverage.ts` CI guard greps 11 modules + `npm run check-telemetry-coverage` wired; `error_class` is controlled enum (RATE_LIMITED|AUTH_FAILED|TIMEOUT|UPSTREAM_5XX|NETWORK|UNKNOWN) — raw messages NEVER persisted (T-20-Z-03-05); cost constants pinned with citations + quarterly review cadence (T-20-Z-03-03); 31 unit tests + 6 live-Neon integration tests green; npm test 786 passing (no regressions); `npx tsc --noEmit` 0. 5 atomic commits (a36c987, 0108043, a725076, 8665ba5, 4361bc3).
Last completed (prior): 20-Z-02 → model + dataset card scaffold (Mitchell 2019 + Gebru 2018) + check-model-cards CI guard — 2 templates (`docs/templates/MODEL-CARD-template.md` 12 sections, `DATASET-CARD-template.md` 7 sections) + 3 retroactive model cards (stocktwits-naive, reputation-weighted, finbert with `ProsusAI/finbert@pinned-by-ops-at-deploy` S5 SHA pin + OPS-HANDOFF flag) + 1 canonical dataset card (SentimentObservation, bridged from 20-Z-01 in-phase stub via append-only "Moved to:" pointer); 3 single-line `// @model-card:` annotations on aggregator.ts / finsentllm.ts / ensemble.ts (zero logic changes); `scripts/check-model-cards.ts` (321 LOC, pure `runCardChecks(deps)` exported) + config + `npm run check-model-cards` wiring; 13 unit tests covering all 5 failure modes (missing-annotation / phantom-card / stale-card / placeholder-leak / duplicate-annotation) + parseIsoDurationDays table cases, runs in 14ms; all numerical gates green (cards ≥ 3 / dataset cards ≥ 1 / annotations ≥ 3, tsc 0, npm test 755 passing, check-model-cards 0). 6 atomic commits.
Last completed (prior 2): 20-Z-01 → SentimentObservation PIT feature store — Prisma model live in Neon (13 cols, 0 NULL fetched_at, 2 composite indexes, 1 composite unique on (ticker, message_id, model_version)); insert-only DAO with SHA-256 body hashing + PII allowlist + typed SentimentObservationDuplicateError on P2002; parallel writer wired into sentiment-scan cron (existing SentimentSnapshot writer untouched); `npm run check-immutability` CI guard; 16 unit + 6 live-Neon integration tests green; dataset card stub forward-references 20-Z-02. 8 atomic commits.

## Accumulated Context (carried forward from v1.0)

### Roadmap Evolution

- 2026-05-10: Phase 21 added — Sector-Relative Outcome Labels (`alpha-vs-sector-ETF` becomes primary outcome label; SPY-alpha retained as secondary). Driven by 4-agent literature synthesis: DGTW 1997 / Lakonishok-Lee / AQR / Park-Irwin / Quantopian all converge that sector-relative is the right benchmark for the firm-specific signals Cipher tracks. Context doc: `.planning/phases/21-sector-relative-outcome-labels/CONTEXT.md`.
- 2026-05-14: Phase 30 added — Provider Health Hardening. Triggered by Bayesian-learning-engine production outage diagnosis (resolved/bayesian-learning-engine-prod-broken.md): Yahoo 90.7% error rate, Firecrawl 100%, Anthropic-search 86.3%, Gemini $4/call cost anomaly. Locked 25 decisions in 30-CONTEXT.md (circuit breaker + Prisma `ProviderHealthAlert` + new `/api/cron/provider-error-budget` + Yahoo demotion + Gemini model pinning + cost-anomaly trip).
- 2026-05-15: Phase 30 completed with 5/5 plans (12 commits). Deferred D-21 (Firecrawl rotation) mid-execution because operator hit Firecrawl free tier — full migration scoped as new Phase 30.1.
- 2026-05-15: Phase 30.1 inserted (URGENT) — Free Community-Scan Migration. Replaces Firecrawl entirely. Scope per operator: not just Reddit-only — design must cover broader free sentiment sources (multiple subreddits, news/forum sites). Likely Reddit replacement: official OAuth API (free 100 QPM). Twitter/X scraping is dead for free in 2026. Until 30.1 ships, Firecrawl remains in BREACH on Phase-30 Done-gate 1.

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

- Total plans completed: 99
- Average duration: ~0.9 days/plan
- Total execution time: 49 days

**v2.0 Target Cadence:** maintain ~1 plan/day average; estimate 25-35 plans across 10 phases.

---

*Updated after each plan completion via `/gsd-execute-phase` or `/gsd-plan-phase`*
