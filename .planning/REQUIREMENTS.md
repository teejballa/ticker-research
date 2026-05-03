# Requirements: Cipher v2.0 — Learning Engine Excellence

**Defined:** 2026-05-03
**Milestone goal:** Take the v1.0 self-calibrating learning engine from "alive and learning" to **a clean, defensible, industry-standard ML system that works perfectly for what it is supposed to do** — measurable out-of-sample lift, drift defenses, hierarchical sharing, regime awareness, lift-gated promotion, composite signal synthesis, public model card.

## v2.0 Requirements

Phase mapping enforces the build order from `research/SUMMARY.md`. Pitfall-prevention work (per `research/PITFALLS.md`) is embedded in each phase's success criteria.

### CORE-ML — Group A: Industry-standard ML quality

#### Phase 18 — Time-decayed Bayesian updates + ESS

- [ ] **CORE-ML-01**: `LearnedPattern` table gains an `effective_sample_size` column derived from time-decayed observation weights (exponential decay)
- [ ] **CORE-ML-02**: `learn` cron applies per-class decay rate λ to observations when computing posterior; default λ tuned empirically per signal class (no global default)
- [ ] **CORE-ML-03**: Posterior credible intervals reported in `/insights` use `effective_sample_size`, not raw N — sparse-but-recent cells visibly tighten faster than sparse-but-old cells
- [ ] **CORE-ML-04**: Drift detector emits a `LearningEvent` of type `drift_alert` when posterior mean shifts > Page-Hinkley threshold over a rolling window (with minimum N=30 to avoid false positives)
- [ ] **CORE-ML-05**: `EngineCalibration` block in reports surfaces ESS alongside posterior, and a "regime-stability" hint when drift_z is elevated

#### Phase 20 — Market-regime feature

- [ ] **CORE-ML-06**: `LearnedPattern` composite key extended to include `regime` dimension (additive migration: column with `DEFAULT 'ALL'` then add to unique constraint after soak)
- [ ] **CORE-ML-07**: Regime detector classifies each scan moment into one of 4 buckets (bull/bear/chop × low-vol/high-vol via VIX bucketing + SPY trend) with deterministic, reproducible labeling
- [ ] **CORE-ML-08**: `SentimentSnapshot` records the regime label at scan time; backfilled snapshots get historical regime labels via point-in-time VIX/SPY data
- [ ] **CORE-ML-09**: Regime label appears in the EngineCalibration block ("Current regime: bull / low-vol")
- [ ] **CORE-ML-10**: At regime transitions, posterior updates respect a transition-zone exclusion period to avoid mis-labeled training samples

#### Phase 19 — Hierarchical priors / partial pooling

- [ ] **CORE-ML-11**: `learn` cron computes pooled posterior parameters (`pooled_alpha`, `pooled_beta`) per `(signal_class, pattern_key)` parent group, sharing strength across cap_class × horizon × regime children
- [ ] **CORE-ML-12**: Pooling structure documented with empirical justification — both 2-level and 3-level hierarchies tested on existing data; chosen structure backed by no-pool / partial-pool / complete-pool sweep
- [ ] **CORE-ML-13**: Sparse cells (low ESS) shrink toward parent prior; rich cells (high ESS) retain individual posterior — observable in `/insights` as differential confidence intervals
- [ ] **CORE-ML-14**: Cell-space pruning: cells that have not been observed in N days AND have ESS < threshold are not allocated parameter rows (defends against the "lake of cells" combinatorial blowup)

#### Phase 21 — Lift-gated cell promotion

- [ ] **CORE-ML-15**: ACTIVE promotion gate becomes "out-of-sample Brier-lift > threshold AND statistically significant after FDR correction" (was: "sample_size + brier_in_sample threshold")
- [ ] **CORE-ML-16**: Out-of-sample evaluation uses **Purged K-Fold + Embargo** cross-validation per López de Prado — never random K-fold, never simple time-split (defends against horizon-overlap leakage)
- [ ] **CORE-ML-17**: Multiple-comparisons correction applied via Benjamini-Yekutieli FDR control across all candidate cells — `n_trials_attempted` recorded per evaluation
- [ ] **CORE-ML-18**: Deflated Sharpe Ratio (Bailey & López de Prado) computed per ACTIVE cell to expose selection bias from cell-space exploration
- [ ] **CORE-ML-19**: Promotion decisions logged as `LearningEvent` of type `cell_promoted` / `cell_demoted` with full evaluation context (CV folds, lift, p-value, DSR)

### REASON — Group B: Reasoning impact in reports

#### Phase 22 — Composite signal synthesis

- [ ] **REASON-01**: `engine-context.ts` produces a single composite headline probability synthesized from all 4 signal-class posteriors via per-class isotonic-calibrated weighted combination (not naive averaging)
- [ ] **REASON-02**: Composite includes credible interval accounting for per-class correlation (no double-counting correlated signals)
- [ ] **REASON-03**: Reports surface composite as the headline calibration number, with per-class breakdown beneath
- [ ] **REASON-04**: Reliability diagram (calibration curve) for the composite published in `/insights`
- [ ] **REASON-05**: Authoritative numerics rule preserved — composite probability and CI come from `engine-context.ts`, never from the LLM

#### Phase 23 — Counterfactual reasoning in prompt

- [ ] **REASON-06**: Each report includes counterfactual deltas: "if [signal class] were absent, the prior would shift from A% to B%" — computed via leave-one-out on the composite synthesis
- [ ] **REASON-07**: Counterfactual deltas with absolute magnitude < 5% suppressed (signal/noise filter)
- [ ] **REASON-08**: Counterfactuals injected as a structured Zod-validated block in the Gemini prompt — LLM contributes narrative explanation only, never the numbers
- [ ] **REASON-09**: Reports render counterfactuals as a dedicated "Why this thesis moved" section with each driver attributed to its signal class

### COVERAGE — Group C: Evidence growth

#### Phase 24 — Adaptive watchlist (multi-armed bandit)

- [ ] **COVERAGE-01**: `ticker-watchlist.ts` selects scan targets via Thompson sampling on cell-undersampledness (cells with low ESS prioritized)
- [ ] **COVERAGE-02**: Cap-class informative priors seed the bandit so cold-start doesn't waste scan budget on already-saturated cells
- [ ] **COVERAGE-03**: ε-floor maintains a minimum baseline of fixed-watchlist coverage (avoids degenerate bandit collapse)
- [ ] **COVERAGE-04**: A/B comparison vs the v1.0 fixed rotating watchlist — adaptive must measurably accelerate cell saturation
- [ ] **COVERAGE-05**: Bandit reward function is ESS-weighted information gain (not raw scan count, not pattern hit rate — those are wrong incentives)

#### Phase 25 — Historical backfill

- [ ] **COVERAGE-06**: Backfill universe spans ≥100 tickers × ≥5 years for technical signal class (deterministic features computable from historical OHLCV)
- [ ] **COVERAGE-07**: Point-in-time data discipline: vendor returns unadjusted prices, cap_class assigned as-of historical date (not current), no survivorship bias from delisted tickers
- [ ] **COVERAGE-08**: Single feature-extraction code path for backfill and live (defends against train/serve skew)
- [ ] **COVERAGE-09**: Backfilled SentimentSnapshot rows tagged with `source = 'backfill'` so live-vs-backfill validation is possible
- [ ] **COVERAGE-10**: Live-only validation gate: every promoted ACTIVE cell must also have ≥10 live (non-backfill) outcomes confirming the prior

### DEMO — Group D: Demonstrability and transparency

#### Phase 26 — Live engine performance dashboard

- [ ] **DEMO-01**: New `/insights` tab "Engine Performance" with daily learning feed (cells learned, promoted, demoted, drift alerts)
- [ ] **DEMO-02**: Out-of-sample Brier lift chart over time per ACTIVE cell with baseline (null model) comparison
- [ ] **DEMO-03**: Each metric labeled with the operational action it triggers (no vanity metrics — every chart answers "what should I do if this changes?")
- [ ] **DEMO-04**: Cell-space coverage heatmap (signal_class × pattern_key × regime) showing where evidence is dense vs sparse
- [ ] **DEMO-05**: Drift alerts surfaced with severity, recommended action, and link to the cell history page
- [ ] **DEMO-06**: ESS minimum threshold enforced for any displayed metric (don't show metrics computed on N<30)

#### Phase 27 — Public per-report calibration trail

- [ ] **DEMO-07**: Each generated report has a public-readable trail page: priors fired → engine prediction → resolved outcomes → ongoing accuracy stats
- [ ] **DEMO-08**: Aggregate-only public statistics (no per-ticker forward-looking predictions exposed publicly to limit gaming and SEC compliance risk)
- [ ] **DEMO-09**: Public model card published per Mitchell et al. 2019 — describes model intent, data, intended use, limits, fairness considerations, performance metrics
- [ ] **DEMO-10**: Disclaimers adjacent to all public predictions: "not investment advice," cite model uncertainty, link to limitations
- [ ] **DEMO-11**: **Entry gate: legal counsel engaged** before this phase begins implementation — SEC/FINRA review of public ML predictions about specific securities required pre-launch

## Out of Scope (explicit anti-features)

| Feature | Reason |
|---|---|
| Bayesian neural networks | Wrong-sized for 4-feature problem; over-engineered |
| Full NUTS / HMC MCMC | Empirical Bayes via method-of-moments matches it for binary trials at our scale (Stan case study confirms) |
| Particle filters for regime | HMM or rule-based VIX bucketing is the right tool |
| Reinforcement learning for watchlist | Thompson sampling is the right tool — RL is over-complex |
| LIME on prompt text | Counterfactual leave-one-out is the right tool here |
| Random K-fold CV | Always Purged K-Fold + Embargo for overlapping-horizon time series |
| MLflow / Feast / Arize infrastructure | Existing Postgres tables already serve this purpose at our scale |
| Live per-ticker public predictions | SEC/FINRA compliance risk; aggregate-only public stats |
| Mobile native app | Web-first; deferred to v3.0+ |

## Future Requirements (deferred to v2.1+)

- Multi-axis regime decomposition (rate cycle × earnings season × sector rotation as additional regime axes beyond VIX/SPY)
- Causal-inference layer for signal attribution (DAG-based, beyond counterfactuals)
- Cross-ticker correlation features (e.g., "TSLA's posterior shifts when QQQ technicals move")
- Backtesting playground for users (replay any historical date and see what Cipher would have produced)

## Traceability

Updated by roadmapper agent during ROADMAP.md generation.

| Requirement | Phase | Status |
|---|---|---|
| CORE-ML-01..05 | Phase 18 | Planned |
| CORE-ML-06..10 | Phase 20 | Planned |
| CORE-ML-11..14 | Phase 19 | Planned |
| CORE-ML-15..19 | Phase 21 | Planned |
| REASON-01..05 | Phase 22 | Planned |
| REASON-06..09 | Phase 23 | Planned |
| COVERAGE-01..05 | Phase 24 | Planned |
| COVERAGE-06..10 | Phase 25 | Planned |
| DEMO-01..06 | Phase 26 | Planned |
| DEMO-07..11 | Phase 27 | Planned |

**Coverage:** 50 v2.0 requirements / 10 phases / 4 capability groups. All mapped.

---
*Requirements defined: 2026-05-03 — derived from PROJECT.md v2.0 vision + research/SUMMARY.md*
