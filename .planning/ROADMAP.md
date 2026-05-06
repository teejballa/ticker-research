# Roadmap: Cipher

## Shipped Milestones

- ✅ **v1.0 — MVP & Self-Calibrating Engine** (2026-03-13 → 2026-05-03)
  17 phases · 59 plan summaries · 461 commits · 19,085 LOC.
  Full data pipeline → Gemini reasoning via Vercel AI Gateway → Diffusion Learning Engine → Technical Analysis as parallel signal class → Institutional & Insider Intelligence. Production live at **ciphersearch.app**.
  → See [`milestones/v1.0-ROADMAP.md`](./milestones/v1.0-ROADMAP.md) and [`milestones/v1.0-REQUIREMENTS.md`](./milestones/v1.0-REQUIREMENTS.md).

## Current Milestone — v2.0: Learning Engine Excellence

**Goal:** Take the v1.0 self-calibrating engine to **clean, defensible, industry-standard ML** with measurable out-of-sample lift, drift defenses, hierarchical sharing, regime awareness, lift-gated promotion, composite signal synthesis, and a public model card.

**Status:** Defined 2026-05-03. Research complete. Ready for `/gsd-plan-phase 18`.

### Phases (10 total — continues numbering from v1.0)

Phase order reconciled across all 4 research dimensions. Build dependencies: P18 → P20 → P19 → P25 → P21 → P22 → P23/P24/P26 → P27.

- [ ] **Phase 18: Time-Decayed Bayesian Updates + ESS** — keystone phase. Adds `effective_sample_size` to LearnedPattern via exponential decay; Page-Hinkley drift detector; per-class λ tuning. Requirements: CORE-ML-01..05.
  - **Plans:** 11 plans across 5 waves
  - Plans:
    - [x] 18-00-PLAN.md — Wave 0: 10 test stub files scaffolded before any implementation (TDD red→green setup)
    - [x] 18-01-PLAN.md — Wave 1: decay/ESS/Page-Hinkley/confirmedDrift pure functions + STATUS_VALUES const in src/lib/learning.ts
    - [x] 18-02-PLAN.md — Wave 1: src/lib/cv.ts purgedKFold (Purged K-Fold + Embargo CV per López de Prado)
    - [x] 18-03-PLAN.md — Wave 1: additive Prisma schema migration (effective_sample_size, n_trials_attempted) + [BLOCKING] db push
    - [x] 18-04-PLAN.md — Wave 2: rewire /api/cron/learn — apply decay+ESS, two-of-two confirmedDrift, EXPLORATORY-WATCH writes
    - [x] 18-05-PLAN.md — Wave 2: /api/cron/backfill-ess — env-flag + auth + idempotent single-tx replay
    - [x] 18-06-PLAN.md — Wave 2: scripts/tune-lambda.ts + scripts/tune-page-hinkley.ts (operator-driven, paste into HYPERPARAMETERS)
    - [ ] 18-07-PLAN.md — Wave 3: engine-context.ts surfaces ESS + EXPLORATORY-WATCH; types extended back-compat
    - [ ] 18-08-PLAN.md — Wave 3: EngineCalibrationPanel ESS column + WatchBadge "regime stability: watching"
    - [ ] 18-09-PLAN.md — Wave 3: /insights ESS-based CI widths + drift_clear recovery counter (D-09 step 4 derived)
    - [ ] 18-10-PLAN.md — Wave 4: full-suite verification, per-task validation map, nyquist_compliant: true sign-off
- [ ] **Phase 20: Market-Regime Feature** — extends LearnedPattern composite key with regime dimension (4 buckets: bull/bear/chop × low-vol/high-vol via VIX bucketing + SPY trend); 2-step migration to manage risk. Requirements: CORE-ML-06..10.
- [ ] **Phase 19: Hierarchical Priors / Partial Pooling** — empirical Bayes pooled posteriors per `(signal_class, pattern_key)` parent group; cell-space pruning to defeat lake-of-cells. Requirements: CORE-ML-11..14.
- [ ] **Phase 25: Historical Backfill** — bootstrap N for lift gating: ≥100 tickers × ≥5 years of technical signals; point-in-time discipline; single feature-extraction code path. Requirements: COVERAGE-06..10.
- [ ] **Phase 21: Lift-Gated Cell Promotion** — out-of-sample Brier-lift > threshold gate via Purged K-Fold + Embargo CV; Benjamini-Yekutieli FDR correction; Deflated Sharpe Ratio. Requirements: CORE-ML-15..19.
- [ ] **Phase 22: Composite Signal Synthesis** — single calibrated headline probability with CI from per-class isotonic-calibrated combination; first user-visible v2.0 win. Requirements: REASON-01..05.
- [ ] **Phase 23: Counterfactual Reasoning** — leave-one-out deltas injected as structured Zod block in Gemini prompt; "Why this thesis moved" report section. Requirements: REASON-06..09.
- [ ] **Phase 24: Adaptive Watchlist (Thompson Sampling)** — bandit-driven scan target selection on cell undersampledness; ε-floor; A/B vs v1.0 fixed watchlist. Requirements: COVERAGE-01..05.
- [ ] **Phase 26: Live Engine Performance Dashboard** — `/insights` "Engine Performance" tab; daily learning feed; Brier-lift over time; cell-space coverage heatmap; ESS-gated metrics. Requirements: DEMO-01..06.
- [ ] **Phase 27: Public Per-Report Calibration Trail + Model Card** — public-readable trail page; aggregate-only public stats; Mitchell 2019 model card. **Entry gate: legal counsel engaged.** Requirements: DEMO-07..11.

### Parallelization Opportunities

After Phase 22 ships, Phases 23 / 24 / 26 share no files and can be planned in parallel. Phase 27 depends on Phase 26's metrics.

### Definition of Done

Per user direction: "industry-standard ML model and product that works perfectly for what it is supposed to do."

1. Drift detector live with ESS down-weighting > 30-day-old observations
2. Hierarchical pooling demonstrably accelerates sparse-cell learning vs no-pool control
3. Regime feature integrated with deterministic labels for all snapshots (live + backfill)
4. ≥1 cell with FDR-corrected, Purged-CV out-of-sample Brier-lift > 5% vs null
5. Composite signal block in every report (headline probability + CI + per-class breakdown)
6. Counterfactual deltas in every report
7. Adaptive watchlist live and measurably accelerating cell saturation
8. Backfill universe ≥100 tickers × 5 years with point-in-time correctness
9. Performance dashboard live at `/insights` with daily learning feed
10. Public calibration trail published with legal sign-off and aggregate-only metrics

### Defensive Engineering Mandate (cross-cutting)

Every phase plan must include prevention work for the pitfall(s) it owns. Specifically:
- Every phase touching LearnedPattern must record `n_trials_attempted` (FDR denominator)
- Every CV must use Purged K-Fold + Embargo (not random splits)
- Every new metric must document its operational action (no vanity metrics)
- Every posterior surface must show ESS, not raw N
- Every phase that ships in production must run vitest + Playwright before commit

---

## Phase Numbering

- Integer phases (18, 19, 20, ..., 27): v2.0 milestone work
- Decimal phases (18.1, 18.2): Urgent insertions (marked with INSERTED)

Continues from where v1.0 left off. v2.0 phases were sequenced by dependency, not numerically (P18 → P20 → P19 → P25 → P21 → P22 → P23/24/26 → P27).
