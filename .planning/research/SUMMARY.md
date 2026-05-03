# v2.0 Research Synthesis — Learning Engine Excellence

**Date:** 2026-05-03
**Researchers:** Stack, Features, Architecture, Pitfalls (4 parallel agents)
**Confidence:** HIGH across all four dimensions

## Headline

v2.0 is **buildable in pure TypeScript on the existing Vercel + Neon stack** with **3 new npm packages** (`jstat`, `ml-matrix`, `posthog-node`). All 10 phases (P18–P27) are strictly additive — no v1.0 module is rewritten. The architectural foundation laid in v1.0 (`learning.ts` is "pure functions, no DB"; `engine-context.ts` is the single trust boundary for authoritative numerics) is the right shape for these enhancements.

## Stack Additions (verified against Context7 / npm registry, May 2026)

| Package | Version | Why |
|---|---|---|
| `jstat` | latest | `beta.inv` for exact Beta-CDF quantiles → real Thompson sampling + replaces v1.0's Wilson-approximation CI |
| `ml-matrix` | 6.12.2 | Linear algebra for upgrading the 12-d Laplace logistic stub to full IRLS Bayesian logistic with proper covariance |
| `posthog-node` | latest | Lightweight metric collection for Phase 26 dashboard (alternative: just write to `LearningEvent` table) |

**Net code additions per phase:** 200–500 LOC of well-documented hand-rolled algorithm. **Schema migrations:** 3 batched (not 10), all additive, zero v1.0 data at risk.

**Vercel runtime confirmed compatible.** `maxDuration: 800` available for backfill/bandit phases on Pro tier.

## Critical Findings That Reshape Phase Ordering

1. **P25 (historical backfill) must come before P21 (lift gating).** With only 87 PriceOutcome rows today, walk-forward CV for lift estimation is too noisy. Backfill bootstraps the N needed for statistically meaningful lift gating.

2. **P20 (regime feature) is the highest-risk migration** — it changes the `LearnedPattern` composite unique key. Must ship EARLY (when fewer dependent rows exist) with a 2-step migration: add column with `DEFAULT 'ALL'`, soak, then add new constraint.

3. **P18 (time-decay) is the keystone** — it defines `effective_sample_size` (ESS), which P19, P21, and P26 all consume. Must ship first.

4. **Pitfall 1 (multiple comparisons / lake of cells) is the dominant risk.** With ~1,728 cells once P20 adds regime dimension, expect ~86 spuriously ACTIVE cells under the null at α=0.05 if no FDR correction is applied. **This is exactly the failure mode v1.0 ACTIVE cells exhibit (0% Brier-lift).** Phase 21 must include FDR correction (Benjamini-Yekutieli).

5. **Pitfall 2 (temporal CV leakage) is the second-biggest risk** because horizons (3/7/14/30/60/90d) overlap on the same SentimentSnapshot rows. Purged K-Fold + Embargo (López de Prado) is the standard defense, must apply to both P21 promotion and P25 backfill.

6. **Phase 27 (public calibration trail) needs legal sign-off pre-launch.** SEC/FINRA compliance risk for public ML predictions about specific securities is the only pitfall whose recovery cost is "may threaten the project itself."

## Reconciled Phase Order (P18 → P27)

Resolves between Architecture's "P18→P20→P19→P21" and Features' "P25 before P21":

| Phase | Capability | Why this slot |
|---|---|---|
| **18** | Time-decayed Bayesian updates + ESS | Keystone — all later phases consume `effective_sample_size` |
| **20** | Market-regime feature + key extension | Risky schema migration, do early when fewer rows depend on cell key |
| **19** | Hierarchical priors / partial pooling | Needs P18's ESS + P20's regime dimension as a pooling axis |
| **25** | Historical backfill | Bootstraps N needed for P21's lift gating to be meaningful |
| **21** | Lift-gated cell promotion | Needs P25's data + FDR correction + Purged CV |
| **22** | Composite signal synthesis | First user-visible UX win — composite headline number with CI |
| **23** | Counterfactual reasoning in prompt | Needs P22 composite to counterfactual against |
| **24** | Adaptive watchlist (Thompson sampling bandit) | Parallel-eligible with P22/P23, no shared files |
| **26** | Live performance dashboard | Needs everything else to have produced numbers worth surfacing |
| **27** | Public per-report calibration trail | Last — needs legal sign-off + all metrics from P26 |

**Parallelization opportunities** identified by file-level disjointness: P22 ↔ P24, P23 ↔ P26.

## Requirements Themes (drives REQUIREMENTS.md)

### CORE-ML (Group A) — 4 capability areas
Drift defense (P18), hierarchical pooling (P19), regime awareness (P20), lift-gated promotion (P21). Industry-standard references: Stan partial-pooling case studies, ADWIN/Page-Hinkley for drift, López de Prado for purged CV, Benjamini-Yekutieli for FDR.

### REASON (Group B) — 2 capability areas
Composite signal (P22), counterfactual reasoning (P23). Industry-standard references: scikit-learn isotonic calibration, Brunswik lens model, EU AI Act 2026 explainability standards.

### COVERAGE (Group C) — 2 capability areas
Adaptive watchlist (P24), historical backfill (P25). Industry-standard references: Russo & Van Roy Thompson-sampling tutorial, point-in-time data per CFA curriculum.

### DEMO (Group D) — 2 capability areas
Performance dashboard (P26), public calibration trail (P27). Industry-standard references: Mitchell et al. 2019 model cards, MLflow/W&B dashboards, SEC Predictive Analytics Rule 2023-140 compliance.

## Defensive Engineering Mandate

User said "good, clean, **industry-standard ML model and product that works perfectly for what it is supposed to do**." Each phase plan MUST include prevention work for its associated pitfalls (per the PITFALLS.md mapping). Specifically:

- **Every phase that touches LearnedPattern must record `n_trials_attempted`** so FDR correction has the right denominator
- **Every phase that does CV must use Purged K-Fold + Embargo**, never random splits
- **Every phase that adds a metric must document the operational action it triggers** — no vanity metrics
- **Every phase that surfaces a posterior to the user must show effective sample size**, not raw N
- **Phase 27 entry gate is "legal counsel engaged"**, not "feature ready to ship"

## What v2.0 Will NOT Include (anti-features explicitly identified)

Avoid these even though they sound impressive:
- Bayesian neural networks (wrong-sized for 4-feature problem)
- Full NUTS MCMC (empirical Bayes via method-of-moments matches it for binary trials at our scale)
- Particle filters for regime detection (HMM or rule-based VIX bucketing is the right tool)
- Reinforcement learning for watchlist (Thompson sampling is the right tool)
- LIME on prompt text (counterfactual leave-one-out is the right tool)
- Random K-fold CV (always Purged + Embargo for time series)
- BayesianChangePointJS npm (stale 2020 — port the algorithm in-tree, ~150 LOC)
- MLflow / Feast / Arize as infrastructure (existing Postgres `LogisticEpoch` + `LearningEvent` tables already serve this purpose at our scale)

## Definition of Done (v2.0 ship criteria)

Per user direction: "industry-standard ML model and product that works perfectly for what it is supposed to do." Operationalized as:

1. **Drift detector live** with `effective_sample_size` down-weighting > 30-day-old observations (P18)
2. **Hierarchical pooling demonstrably accelerates sparse-cell learning** vs no-pool control on out-of-sample data (P19)
3. **Regime feature integrated** into LearnedPattern key with deterministic regime labels for all backfilled and live snapshots (P20)
4. **≥1 cell with FDR-corrected, Purged-CV out-of-sample Brier-lift > 5%** vs null model (P21)
5. **Composite signal block in every report** showing calibrated headline probability + CI + per-class breakdown (P22)
6. **Counterfactual deltas in every report** explaining how each signal class moved the thesis (P23)
7. **Adaptive watchlist live** with Thompson-sampling-driven undersampled-cell prioritization (P24)
8. **Backfill universe expanded** to ≥100 tickers × 5 years with point-in-time correctness (P25)
9. **Performance dashboard live at /insights** with daily learning feed + drift alerts (P26)
10. **Per-report calibration trail published** with legal sign-off + aggregate-only public metrics (P27)

## Open Questions Deferred to Phase Plans

- Hierarchy structure (2-level vs 3-level) — empirical decision in plan 19-01
- Regime taxonomy (8-bucket bull/bear × low-vol/high-vol vs HMM) — plan 20-01
- Lift-gate threshold (DoD says >5% — is that ACTIVE bar or higher?) — plan 21-01
- Backfill scope (100 tickers × 5y? more?) — plan 25-01
- Vendor selection for point-in-time data — plan 25-01

---

_See `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` for full per-dimension findings._
