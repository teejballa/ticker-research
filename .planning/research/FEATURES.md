# Feature Research — Cipher v1.1 "Learning Engine Excellence"

**Domain:** Self-calibrating Bayesian ML reasoning engine for ticker research
**Researched:** 2026-05-01
**Confidence:** HIGH (industry-standard ML practices are well-documented; specific composition for this domain is the novel synthesis)

---

## Executive Frame

This document enumerates v1.1 capability behaviors across the four groups defined in `PROJECT.md` (A: Core ML quality, B: Reasoning impact, C: Coverage, D: Demonstrability) covering 11 distinct capability areas (drift defense, hierarchical priors, regime awareness, lift-gated promotion, composite signal, counterfactual reasoning, adaptive sampling, historical backfill, performance dashboard, calibration trail, public model card).

**User want (verbatim):** "good, clean, industry-standard ML model and product that works perfectly for what it is supposed to do."

**Translation:** Each capability is judged against (a) what published ML literature considers minimum-viable, (b) what production systems actually ship, and (c) what *this* project specifically benefits from. Scope discipline is enforced via the **Anti-Features** column — flashy ML constructs that don't earn their complexity for a 4-signal-class, ~thousands-of-observations problem.

---

## Group A — Core ML Quality

The "infinitely better" path. Drift / hierarchical / regime / lift-gating. These capabilities directly determine whether the engine is *measurably* better than v1.0 baseline.

### A1. Drift Defense (Phase 18 — Time-Decayed Bayesian Updates)

The v1.0 ceiling: Beta posteriors weight all observations equally regardless of age. `drift_z` is computed but not acted on.

#### Table Stakes — every credible drift-aware Bayesian system MUST do these

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Exponential time-decay on posterior updates | Concept drift defense is the entire point — "weight recent more" is the minimum behavior | LOW | Replace `α += 1, β += 1` with `α = decay·α + outcome`. Half-life is the only tunable. Single-line change in `learning.ts updateBetaPosterior`. |
| Effective Sample Size (ESS) replaces raw N in cell metadata | Once decay is on, raw `α + β` overstates evidence; ESS is the honest currency | LOW | `ess = (α + β) / max_decay_age_factor`. Surface in cell key and EngineCalibrationPanel. |
| Drift detection threshold that *gates* prior injection | Industry-standard ML monitoring (PSI > 0.2, KL > threshold, ADWIN window shift) blocks stale priors from firing | MEDIUM | If `drift_z > threshold`, downgrade cell from ACTIVE to LEARNING with an "in regime change" badge. Already have the metric — wire it to the gate. |
| Distinct alert states: stable / drifting / regime-shift | Production drift-monitor UX (Fiddler, Evidently, Arize) all show 3-tier state | LOW | Color-code in /insights table: green / amber / red. |

#### Differentiators — production-grade systems do these

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-cell adaptive half-life (vol-regime-aware) | High-vol regimes drift faster; constant half-life under-fits during calm and over-fits during shocks | MEDIUM | Tie half-life to per-cell variance of recent residuals. Stretch goal — likely v1.2. |
| Drift-cause attribution ("posterior shift driven by N=12 fresh observations vs prior N=80") | Fiddler/Arize-style "why is drift firing" — explanatory not just alerting | MEDIUM | Compute and show on cell drill-down. Audit-trail value > model-quality value. |
| Auto-rollback to a snapshotted prior when drift_z spikes | MLflow/Vertex pattern — version priors and revert if new posterior demonstrably worse OOS | HIGH | Defer to v1.2 — needs Phase 21 lift gating + version snapshots first. |

#### Anti-Features — flashy but wrong-sized for this domain

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Bayesian Online Changepoint Detection (BOCPD) | Looks rigorous in literature; full posterior over changepoint location | Massive overhead for a system where exponential decay + ADWIN-style window covers 95% of the value at 5% of the complexity | Use ADWIN/PSI-style threshold detection — it's what evidently / fiddler / arize ship. |
| Particle filter for drift state | "Real" online inference; tracks full posterior | Particle filters are infrastructure for systems with continuous state — Cipher's state is discrete cells; no payoff | Stick with closed-form Beta posteriors with time decay. |
| Bayesian Neural Network for drift modeling | Sounds impressive; "deep" Bayesian | A 4-signal, ~hundreds-per-cell problem doesn't earn a BNN; uninterpretable, slow, hard to explain | Beta-Bernoulli with decay is provably optimal for this conjugate setup. |

**Industry reference:** Evidently AI, Fiddler AI, Arize, and Label Your Data's 2026 drift guide all converge on the same recipe: PSI/KL/Wasserstein for distribution drift + DDM/ADWIN for performance drift + alerting tied to business thresholds. The Bayesian addition (exponential decay) is just Beta-prior arithmetic.

**Dependency on v1.0:** Builds directly on `drift_z` field already computed in `learning.ts`. No schema migration needed beyond adding `effective_sample_size` to LearnedPattern.

---

### A2. Hierarchical Priors (Phase 19 — Partial Pooling)

The v1.0 ceiling: bucket granularity is fixed and discrete. Sparse cells like `accumulation/small_cap/30d` learn slowly even when `accumulation/mid_cap/30d` has plenty of data.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Two-level hierarchy: parent prior + per-cell partial pooling | The defining behavior of hierarchical Bayesian — anything else isn't pooling | MEDIUM | Per `(signal_class × pattern_key)` parent across cap_class × horizon. Use Beta-Beta hierarchy or shrinkage estimator. |
| Effective Sample Size accounting that includes pooled contribution | ESS must reflect borrowed strength or the cell promotion gate is wrong | LOW | `ess_effective = ess_local + λ · ess_pooled` where λ is the pooling weight. |
| Visible "borrowing strength from parent" indicator on EngineCalibrationPanel | User must understand why a cell with N=8 is marked ACTIVE | LOW | Badge: "Pooled from N=120 in parent class" with hover detail. |
| Sparse-cell acceleration test in CI | Must prove pooling works — control vs treatment comparison | MEDIUM | Synthetic test: same data, with/without pooling — sparse cell should converge faster. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Three-level hierarchy (signal_class → pattern_key → cell) | More granular borrowing — sparse pattern_keys benefit from same signal_class | MEDIUM | Marginal value vs two-level; defensible only if data shows pattern_keys cluster meaningfully. |
| Adaptive pooling strength λ based on within-group variance | Standard hierarchical Bayes practice — high within-group variance → less pooling | MEDIUM | `λ = τ² / (τ² + σ²)` where τ is between-cell variance, σ within-cell. PyMC-style behavior. |
| Per-pooled-cell "effective N" badge in /insights | UX clarity — shows the user the math is honest | LOW | Already covered in table stakes; differentiator is the visual treatment. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full No-U-Turn-Sampler (NUTS) MCMC inference | "Real" Bayesian, conjugate analytical solutions look quaint | NUTS for a Beta-Bernoulli hierarchy is overkill — analytical/variational shrinkage gives the same answer in microseconds, fits in a Vercel Function | Use closed-form shrinkage with empirical Bayes parent estimation. |
| Continuous bucket boundaries (replace discrete buckets with kernel-smoothed regions) | "Why discretize at all?" purist argument | Loses interpretability ("which pattern fired?"), kills the calibration block UX, breaks the existing schema | Keep discrete cells. Pool across them. |
| Stan/PyMC integration for the hierarchy | Industry-standard Bayesian tooling | Both are Python; Cipher pivoted *away* from Python in Phase 12 — re-introducing it kills the "pure-TS on Vercel" architecture | Implement closed-form hierarchical update in TypeScript. R-bloggers/PyMC docs translate cleanly to TS for conjugate cases. |

**Industry reference:** Hierarchical partial pooling is the textbook approach in Stan, PyMC, and brms for repeated-binary-trials problems (which is exactly Cipher's outcome shape — alpha-vs-SPY win/loss). The PyMC "Hierarchical Partial Pooling" example gallery is the direct template.

**Dependency on v1.0:** Schema extension — add `parent_prior_alpha`, `parent_prior_beta`, `pooled_ess` fields to LearnedPattern. Backward-compatible.

---

### A3. Regime Awareness (Phase 20 — Market-Regime Feature)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Macro regime detector with 3+ states (bull/bear/chop OR low-vol/high-vol/crisis) | Without explicit regime, 2026-bull priors contaminate 2028-bear posteriors. Standard finance ML (HMM-based regime detection is established practice — QSTrader, LSEG) | MEDIUM | VIX bucketing (>30 high vol, <15 low vol) is the cheap minimum. HMM on SPY returns is the standard upgrade. |
| Regime-conditional cell key extension | Once regimes exist, the cell key MUST include regime or the whole point is lost | MEDIUM | New cell key: `(signal_class × pattern_key × cap_class × horizon × regime)`. Schema migration — add `regime` to LearnedPattern composite key. |
| Current regime visible in the Engine Calibration block | User-facing surfacing is industry-standard for any regime-aware product (every Bloomberg/TradingView dashboard shows current regime) | LOW | Badge in EngineCalibrationPanel: "Current regime: HIGH-VOL (VIX 28.4, since 2026-04-12)". |
| Current regime visible on /insights with regime-history strip | Helps user understand why some cells show LEARNING while others ACTIVE — they're regime-specific | LOW | Strip chart at top of /insights showing regime over last 12mo. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Smooth regime transition handling (interpolation, not hard switch) | Hard regime boundaries cause priors to flicker on edge cases — production HMMs use posterior probabilities, not arg-max | MEDIUM | Use HMM posterior `P(regime=r \| observations)` as soft weights when blending priors. |
| Multiple regime axes (vol-regime × rate-regime × trend-regime) | Real markets have multiple independent regime dimensions; one-axis regime under-fits | HIGH | Cartesian product blows up cell count — only add second axis if data supports it. |
| Regime-conditional hierarchical pooling (regimes pool from a "regime-agnostic" parent when sparse) | Combines A2 + A3 — sparse cells in a new regime borrow from the regime-blind parent until they have evidence | HIGH | Phase 19 + Phase 20 composition. High value but high complexity. |
| Citadel/Quantinsti-style "regime score dashboard" with backwardation/contango/transition labels | Financial industry expects this exact UX — VIX/VIX3M ratio with regime labels | MEDIUM | TradingView "Ultron VIX Regime" indicator is the reference. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Custom-trained deep regime classifier (LSTM/Transformer on macro time series) | "ML-native" regime detection vs "rule-based" VIX bucketing | A 3-state HMM on VIX/returns matches deep model accuracy on regime classification while being interpretable, auditable, and explainable | HMM with Viterbi decoding — quantinsti and LSEG both ship this. |
| Sub-daily regime detection | "Real-time" appeal | Regime should change on monthly-quarterly cadence; intra-day "regimes" are noise | Daily regime label, recomputed on cron. |
| User-configurable regime thresholds | "Customization" appeal | Defeats the calibration story — if user changes regime def, all priors become incomparable | Single canonical regime definition with public methodology. |

**Industry reference:** HMM-based regime detection is well-documented (QSTrader, LSEG Developer Portal, Quantinsti). For 2026, the standard production setup is: VIX-bucket as cheap baseline, HMM as upgrade, GMM if multivariate macro signals are added. HMMs separated COVID + 2022 vol-shock periods cleanly per LSEG.

**Dependency on v1.0:** Schema migration for cell key. Engine cron jobs rerun with regime label appended. **All v1.0 LearnedPattern observations need to be back-stamped with regime** — historical regime labels can be computed from FRED VIXCLS history.

---

### A4. Lift-Gated Promotion (Phase 21 — Promotion Based on Brier Lift, Not Just N + In-Sample Brier)

The v1.0 ceiling: ACTIVE = `sample_size >= threshold AND brier_in_sample >= threshold`. Two ACTIVE cells currently show 0% Brier lift vs null — calibration ≠ predictive lift.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Out-of-sample Brier score via temporal cross-validation | Industry standard for any production predictive model — walk-forward backtesting is mandatory in financial ML (CFA Institute, Lopez de Prado) | MEDIUM | Walk-forward: train on rolling window, test on next window, advance. Per-cell OOS Brier. |
| Brier-lift-vs-null as the active promotion criterion | The actual definition of "this cell predicts better than guessing the base rate" | LOW | `lift = (brier_null - brier_cell) / brier_null`. Promote only when `lift > threshold AND ess > threshold`. |
| Demotion when OOS lift drops below threshold | Symmetric promotion/demotion is standard MLOps — Vertex/SageMaker model registry ships this | LOW | Daily reassessment in `learn` cron. State transitions logged to LearningEvent. |
| Promotion-state audit trail visible in /insights | "Cell X went ACTIVE on date Y because lift=Z" — auditability is non-negotiable per EU AI Act 2026 | LOW | LearningEvent already exists. Surface promotions in dashboard timeline. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Bootstrap confidence interval on the lift estimate | Don't promote on a noisy single-fold estimate | MEDIUM | Bootstrap resample within OOS window. Promote only if 90% CI lower bound > 0. |
| Multiple horizon agreement requirement (3d AND 7d AND 30d all show lift) | Spurious lift on one horizon is common; multi-horizon agreement is the rigor signal | LOW | Promote pattern_key only if ≥ 2 horizons clear the gate. |
| A/B comparison of "with-prior vs without-prior" report quality (downstream metric) | Ultimate test — does the prior actually improve the report? | HIGH | Defer — needs human eval framework. Likely v1.3 candidate. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Statistical significance test (chi-square / likelihood ratio) as the gate | "Rigorous" appeal | NHST in this small-N, multiple-comparison setting is a footgun — better to use effect-size threshold (lift > X%) than p-value | Use lift threshold + bootstrap CI. |
| K-fold cross-validation (random splits) | Standard ML practice | LOOK-AHEAD BIAS — random folds in time-series data are wrong. Walk-forward is the only valid CV for temporal data | Walk-forward CV exclusively. |
| Promotion based on Sharpe ratio of a backtested strategy | "Real trader" appeal | Cipher is a research engine, not a trading system. Sharpe requires position sizing, slippage, etc — out of scope | Brier-lift on the underlying probability prediction is the correct primitive. |

**Industry reference:** Walk-forward analysis is THE standard backtest method in financial ML (Lopez de Prado "Advances in Financial Machine Learning", CFA Institute 2026 backtesting & simulation refresher, QuantStart). For probability calibration validation, Brier score on rolling temporal windows is the textbook protocol per scikit-learn 1.8 calibration docs.

**Dependency on v1.0:** Requires sufficient observation history — currently ~87 PriceOutcomes; walk-forward CV needs at least 3 windows. **Will only be meaningful after Phase 25 (historical backfill) bootstraps observation count.**

---

## Group B — Reasoning Impact

### B1. Composite Signal (Phase 22 — Multi-Cell Prior Composition into Headline Number)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single composite probability + credible interval as the report headline | Every production ML product ships ONE headline number (Perplexity confidence, Anthropic's "I'm X% sure", FICO score) | MEDIUM | Logistic regression scaffolding from Phase 16 already exists. Use it to combine 4 signal-class priors into `P(alpha vs SPY at 30d)`. |
| Credible interval visualization (shaded band on a probability bar) | Standard uncertainty viz for non-experts — Claus Wilke "Fundamentals of Data Visualization" | LOW | Horizontal bar with point estimate + shaded 90% CI. |
| Per-signal contribution weights visible (which signal class moved the headline) | Brunswik lens model decomposition — show beta coefficients | LOW | Mini bar chart: "Diffusion +12pp, Technical +5pp, Institutional -3pp, Insider +1pp". |
| Headline number is post-hoc-checkable (recorded in LearningEvent for outcome resolution) | Per-report calibration trail (D2) requires this | LOW | Persist `composite_p` and `composite_ci` on Report at generation time. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Stacking ensemble (meta-learner over per-cell predictions) | More flexible than fixed logistic; scikit-learn `StackingClassifier` pattern | HIGH | Defer — logistic regression with calibration is "good enough" until N is much larger. |
| Isotonic / Platt calibration of the composite output | Stacked outputs are often miscalibrated; isotonic fixes this when N > ~1000 | MEDIUM | Add when sufficient observations accumulated. |
| Brunswik lens-style ecological vs cognitive validity decomposition | Show "the engine's signal validity vs reasoning correctness" | MEDIUM | Educational value; cite the actual Brunswik literature in the public model card. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Deep stacking (3+ layer meta-learners) | Kaggle-style "win at all costs" stacking | At Cipher's N, deep stacking overfits the meta-fold; complexity bloat | Single-layer logistic + isotonic. |
| Multiple competing composite heads (one per investor archetype) | "Personalization" appeal | Forks the calibration story — which composite gets validated? | One canonical composite. Personalization can be display-side (filtering signals to show). |
| Confidence-interval-free point estimate with extra precision | "Cleaner UX" appeal | Hides uncertainty — actively misleading when N per cell is small | Always show CI. Use plain-English ("ranges from 45% to 65%"). |

**Industry reference:** The Brunswik lens model + multiple-regression decomposition is the established framework for combining multiple imperfect cues into a single judgment (per the 1956 Brunswik LME, modern applications in psychology + judgment analysis). Probability calibration via Platt / isotonic is scikit-learn 1.8 standard practice.

**Dependency on v1.0:** Logistic regression scaffolding from Phase 16 already exists with `epoch=1` waiting for first 30d outcomes ~2026-05-26. Phase 22 turns "scaffolding" into "actively-trained composite."

---

### B2. Counterfactual Reasoning (Phase 23 — "If Signal Absent, Prior Would Shift From A to B")

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-signal counterfactual: "If diffusion signal had been NEUTRAL, composite would be X% instead of Y%" | Industry-standard "explain this prediction" pattern — counterfactuals are now table-stakes alongside SHAP/LIME per EU AI Act high-risk requirements | MEDIUM | For each input signal, recompute composite holding others fixed. 4 calls to logistic regression. |
| Counterfactuals injected into the Gemini prompt for educational reasoning | The whole v1.1 pitch is "engine impact on report quality" — Gemini needs the counterfactual to write "the diffusion signal is the swing vote here" | LOW | New section in the prompt template. Zod schema addition. |
| Display the counterfactual table to the user, not just feed it to the LLM | Auditability — user sees the same counterfactual the LLM saw | LOW | New panel below EngineCalibrationPanel: "If [signal] had been absent..." |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Actionable counterfactuals ("for the BUY rec to flip to HOLD, institutional flow would need to drop to X%") | Higher-order counterfactual — Wachter et al. "actionable knowledge" pattern from the XAI literature | HIGH | Inverse problem — search input space for boundary. Defer to v1.2 unless cheap. |
| SHAP-style attribution on the *composite* model | Standard XAI rigor — shows marginal contribution of each input | MEDIUM | Shapley values for the 4-signal logistic regression are closed-form. |
| Counterfactual on the prior age (drift counterfactual): "if we used only last-30d data, prior would shift to..." | Unique to a time-decayed Bayesian system | MEDIUM | Recompute posterior with shorter half-life. Cute differentiator. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| LIME on the LLM output text | "Explain the language model" appeal | LIME on text is unreliable; doesn't explain the underlying signals (which is what users actually want) | Counterfactuals on the *signals*, not the text. The LLM is downstream of the signals. |
| Anchor explanations | Academic XAI completionism | Anchors don't add value over counterfactuals for this 4-signal use case; complexity > information | Counterfactuals + SHAP cover the user need. |
| Causal inference (do-calculus) on signals | "Real" causality vs correlational counterfactuals | Cipher's signals are not causally identified; pretending otherwise is misleading | Be explicit: "counterfactual = 'if this signal had been different in our model'", not "if it had been different in reality." Honest framing. |

**Industry reference:** Counterfactual explanations are now industry-standard alongside SHAP/LIME per the explainable AI literature (Wachter et al., DataCamp/Meta-Intelligence/Apxml comparisons 2025-2026). EU AI Act 2026 high-risk classification explicitly requires explainability — counterfactuals are the most user-understandable form.

**Dependency on v1.0:** Requires Phase 22 composite signal first (need a composite to counterfactual against). Cleanly extends the existing `formatCalibrationContext()` in `engine-context.ts`.

---

## Group C — Coverage & Evidence Growth

### C1. Adaptive Watchlist (Phase 24 — Bandit-Driven Sampling for Undersampled Cells)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Cell-population telemetry: which (signal_class × pattern_key × cap_class × regime) cells are undersampled | Can't be adaptive without knowing what's sparse | LOW | Computed view over LearnedPattern. Display as "coverage heatmap" in /insights. |
| Bandit policy (UCB or Thompson sampling) for ticker selection in `sentiment-scan` cron | The textbook explore/exploit setup — production ML systems for data acquisition use this exact pattern | MEDIUM | Replace fixed rotating watchlist with bandit-selected tickers biased toward sparse cells. UCB1 is the simplest. |
| Coverage progress bar visible to the user ("Engine has 8/12 regime × cap_class cells populated for technical patterns") | Demonstrates the engine is actively learning, not just running | LOW | Stat block at top of /insights. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Thompson sampling with per-cell posterior over "value of one more observation" | More principled than UCB — directly Bayesian, fits the Bayesian-engine narrative | MEDIUM | Same complexity as UCB. Choose Thompson for the brand consistency. |
| Hierarchical bandit (explore signal classes first, then cells within) | Avoids over-exploring rare classes when a parent class is data-rich | HIGH | Real value but defer — UCB/Thompson on flat cell space is fine for v1.1. |
| User can mark a ticker "high-priority for the engine" (manual override) | Power-user feature, also useful for demos | LOW | Optional flag on watchlist. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Reinforcement learning (DQN/PPO) for watchlist selection | "Modern" RL vs "classical" bandits | Bandits are the *correct* tool for this exact problem (single decision, immediate reward); RL adds state/sequence complexity that doesn't apply | Stick with bandits. RL would be wrong here, not just over-engineered. |
| User-configurable watchlist exploration vs exploitation slider | "Customization" appeal | Same problem as A3 user-configurable thresholds — defeats calibration story | Fixed schedule (early: high explore, late: high exploit). |
| Real-time bandit updates on every report request | "Responsive" appeal | Adds latency to user-facing request path; bandit updates on cron schedule is fine | Update bandit posteriors in `learn` cron, not in report flow. |

**Industry reference:** Multi-armed bandit for adaptive sampling is the established pattern (UCB1, Thompson sampling — see Sutton/Barto, AdaptiveBandit framework, ALMAB-DC 2026). Wikipedia's MAB article + Stanford's Ashwin Rao bandit chapter are the canonical references.

**Dependency on v1.0:** Builds on existing `sentiment-scan` cron and rotating watchlist. New schema field: `Cell.observation_target` (target N), `Cell.observation_count` (current).

---

### C2. Historical Backfill (Phase 25 — Bootstrap Cells from 5+ Years of Historical Data)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Backfill job for deterministic-feature signal classes (technical patterns) | Technical patterns are computed from historical OHLCV — no reason to wait weeks of live data | MEDIUM | New cron / one-shot script: replay 5y of SPY-relative outcomes for technical pattern_keys. |
| Provenance flag on backfilled observations (`source: backfill` vs `source: live`) | Audit trail integrity — backfilled and live observations must be distinguishable | LOW | Add `provenance` field to PriceOutcome. |
| Backfilled observations weighted by time-decay (consistent with A1) | If A1 says "weight recent more," backfill must respect that — old observations contribute their decayed weight | LOW | Apply decay function based on observation date. |
| User-visible "evidence age distribution" stat per cell ("median observation age: 3.2 years; ESS 67% from last 12 months") | Honest reporting of what's behind a cell | LOW | Display in /insights cell drill-down. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Backfill institutional/insider via SEC EDGAR full-history pull | Form 4 / 13F have decade+ of public history; bootstraps insider/institutional cells | HIGH | Requires EDGAR full-archive ingestion + parsing; complex but high-value. |
| Differential backfill cadence (rare patterns get more historical pulls) | Same logic as bandit watchlist — apply to backfill | MEDIUM | Coordinate with Phase 24 bandit. |
| Public "engine memory" page showing backfill stats ("12,847 historical observations across 47 cells, 5.3y average history") | Demonstrability — concrete evidence of accumulated knowledge | LOW | Static-ish page. Marketing value high. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Backfill *sentiment* signals from historical news | "Comprehensive backfill" appeal | Sentiment classification at-the-time would have used a different model and different sources — backfilled sentiment is fabrication | Only backfill signals with deterministic feature computation (technicals, institutional flows). |
| Backfill from third-party sentiment datasets (RavenPack, etc.) | "Data is data" appeal | Different definitions of sentiment than Cipher's — pollutes the prior with non-comparable observations | Same as above — only backfill what we can recompute from raw historical data. |
| Backfill *predictions* (run the engine retrospectively and store its hypothetical reports) | "Track record" appeal | Look-ahead bias trivially — engine "knew" the regime; meaningless track record | Only backfill outcomes against retrospectively-computed signal labels, not predictions. |

**Industry reference:** Walk-forward backtesting standard requires high-quality historical data with no look-ahead bias and survivorship-bias awareness (Lopez de Prado, CFA Institute 2026). The principle: only backfill features that can be recomputed deterministically from data available at the historical point in time.

**Dependency on v1.0:** Requires Phase 21 lift gating to be meaningful (need to validate backfilled cells achieve OOS lift before promoting). Schema: `provenance` field on observations. **Critical:** ordered with Phase 21 to make lift gating possible at all (current N too low without backfill).

---

## Group D — Demonstrability

### D1. Live Engine Performance Dashboard (Phase 26 — `/insights` Engine Tab)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Aggregate Brier lift over time (line chart, last 12 months) | The single most important dashboard element — proves the engine is improving | LOW | Plot rolling-90d aggregate Brier-lift across all ACTIVE cells. |
| % of recent reports that hit a calibrated cell | The "we're learning enough to matter" metric | LOW | "27% of last-30d reports used ACTIVE priors, up from 12% 90d ago." |
| Top performing cells leaderboard (highest lift, sufficient ESS) | Standard MLOps dashboard element (W&B/MLflow tracking) | LOW | Sortable table. |
| Recent drift alerts feed | Standard MLOps element (Fiddler / Arize / Evidently all ship this) | LOW | Append-only feed of cells flagged drifting. |
| "Engine learned X new things" daily feed | The user-facing version of the LearningEvent table | LOW | Promotion events, calibration improvements, new cells reaching threshold N. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Calibration plot (predicted probability vs realized frequency) for each ACTIVE cell | Standard scikit-learn calibration curve — the gold-standard "is the engine well-calibrated?" visualization | MEDIUM | Display on cell drill-down. |
| Reliability diagram with bootstrap CI bands | Differentiator vs basic calibration plot | MEDIUM | Standard practice in any rigorous probabilistic ML product. |
| Public RSS/JSON feed of engine learning events | Defensible openness — anyone can subscribe to "what the engine learned today" | MEDIUM | Cron-generated static feed. |
| Hooks into MLflow / W&B (tracking export) | Plays well with industry tools; technical credibility | LOW-MEDIUM | Optional integration. Probably not worth it for a single-tenant system. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time WebSocket dashboard updates | "Modern" UX appeal | Engine updates on cron cadence (daily); WS adds infra without information value | Polling on page load is sufficient. |
| Dashboards behind auth gates (per-user) | "Privacy" appeal | The engine's calibration is ONE engine's calibration — there's no per-user model. Per-user dashboards make no sense and hide the public-trust value | Public read-only dashboard. Per-user is only the user's report history. |
| Interactive "what-if" sliders ("what if VIX were 20?") | "Engagement" appeal | Engagement at the cost of misleading users about the engine's scope; not what the engine actually does | Static counterfactuals (B2) on actual reports only. |

**Industry reference:** MLflow + Weights & Biases are the de facto standards for production ML performance dashboards in 2026 (per the multiple "MLOps tools 2026" comparisons). Reliability diagrams + calibration plots are standard sklearn output and the established way to visualize probabilistic model performance.

**Dependency on v1.0:** New tab on existing `/insights` page. New API routes aggregating LearnedPattern, LearningEvent, PriceOutcome.

---

### D2. Calibration Trail / Public Model Card (Phase 27 — Per-Report Receipts + Engine Transparency Doc)

This combines two distinct artifacts: per-report **calibration trail** (bottom-up audit of one report) and engine-level **model card** (top-down documentation of the system).

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-report calibration trail page: "what priors fired, what was predicted, what happened" | The headline differentiator — "every Cipher report has receipts" | MEDIUM | New page `/research/[ticker]/[reportId]/trail`. Persists snapshot of priors, composite probability, outcomes as they resolve. |
| Outcome resolution updates the trail automatically | The trail isn't static — it grows as 3d/7d/30d/etc. outcomes come in | LOW | Cron writes to trail when PriceOutcome resolves. |
| Public engine model card following Mitchell et al. 2019 schema | Industry-standard transparency artifact — 9 categories (Model Details, Intended Use, Factors, Metrics, Evaluation Data, Training Data, Quantitative Analyses, Ethical Considerations, Caveats) | MEDIUM | Static-ish `MODEL_CARD.md` rendered at `/about/engine`. |
| Quantitative metrics in the model card (current Brier lift, ESS distribution, calibration curves) | Mitchell 2019 explicitly requires quantitative analyses with confidence intervals | LOW-MEDIUM | Auto-generated section. |
| Disaggregated metrics (performance by cap_class, by regime) | Mitchell 2019 emphasizes disaggregation — production-grade requirement, not optional | LOW | Already have the data; just surface it. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Automated model card regeneration on a schedule (always current) | Per Stirrup 2026 EU AI Act analysis, automated model cards are the production standard for EU compliance | MEDIUM | Cron rebuilds the card weekly. |
| Tamper-evident hash chain on calibration trails | Transparency credibility — trail entries can't be silently revised | MEDIUM | Each trail entry includes hash of previous; defensible against "you cherry-picked." |
| Sharable per-report trail link with social-card preview | Marketing value — "share this report's track record" | LOW | OpenGraph card with composite probability + accuracy stat. |
| Datasheet for the engine's training data (Gebru et al. style) | Counterpart to model cards for the data side; rigorous transparency | MEDIUM | Document SourcePackage shape, sources, refresh cadence. |
| Engine-wide aggregate accuracy stat ("87 outcomes resolved, 53% directional accuracy, Brier 0.21") prominently on every page footer | Visible-receipts pattern — Perplexity-style citation but for the engine's own track record | LOW | Footer component. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| User can edit/curate which trails are public | "Curation" / "show your best work" appeal | Defeats the entire transparency thesis — "receipts you can selectively hide" are worse than no receipts | All trails public for all reports. No editing. |
| Anonymized/aggregated trails only (no per-report) | "Privacy" framing | Reports are public knowledge (ticker symbols, public data); per-report trails are the differentiator | Per-report trails. User identity stays private (already is). |
| Live "engine confidence" widget embedded in third-party sites | "Distribution" appeal | Premature; needs much higher accuracy stats before this is helpful (it could embarrass) | Defer to post-v1.1 once stats justify external embedding. |
| Marketing claims of "X% accuracy" without disclosing confidence intervals or N | Standard SaaS marketing pattern | Violates Mitchell 2019 standards; corrodes the "industry-standard ML" positioning | Always show CI + N. Honesty is the brand. |

**Industry reference:** Model Cards for Model Reporting (Mitchell et al. 2019, arxiv 1810.03993) is the canonical specification — 9 categories, quantitative analyses with CIs, disaggregated metrics. NVIDIA's Model Card++ extends with system-level concerns. EU AI Act 2026 makes automated model cards a compliance standard for high-risk AI systems (Stirrup 2026). Datasheets for Datasets (Gebru et al.) is the data-side counterpart.

**Dependency on v1.0:** Calibration trail requires Phase 22 composite signal (something to record), Phase 26 dashboard (where to surface aggregate stats). Model card is standalone — could ship at any time, but maximally honest after Phase 21 lift gating gives real numbers.

---

## Feature Dependencies

```
Phase 18 (Time-Decay) ───────┬──> Phase 21 (Lift Gating)
                              │      └─> Phase 22 (Composite)
                              │              └─> Phase 23 (Counterfactuals)
                              │                      └─> Phase 27 (Calibration Trail)
                              │
                              └──> Phase 19 (Hierarchical Pooling)
                                       └─> Phase 20 (Regime Awareness)
                                              └─> Phase 21 (Lift Gating, regime-conditional)

Phase 25 (Historical Backfill) ──enables──> Phase 21 (Lift Gating has enough N to be meaningful)

Phase 24 (Adaptive Watchlist) ──enhances──> Phase 19 / 20 / 21 (sparse cells fill faster)

Phase 26 (Dashboard) ──surfaces──> All of A + Phase 22

Phase 27 (Calibration Trail / Model Card) ──documents──> Everything
```

### Dependency Notes

- **Phase 18 (Time-Decay) is the keystone.** Effective sample size becomes the unit of currency for Phases 19, 21, 26. Schedule first.
- **Phase 25 (Historical Backfill) before Phase 21 (Lift Gating).** Walk-forward CV needs sufficient observations per cell. With only 87 PriceOutcomes today, lift estimates would be too noisy to gate on. Backfill first → then lift gating becomes meaningful.
- **Phase 22 (Composite) before Phase 23 (Counterfactuals).** Counterfactuals are computed against the composite — no composite, no counterfactual.
- **Phase 26 (Dashboard) is an integration phase.** Surfaces work from all prior phases; minimal logic of its own. Schedule near the end.
- **Phase 27 (Model Card / Calibration Trail) is most honest last.** Quantitative metrics in the model card need real numbers — premature publication risks publishing stale or low-N stats.
- **Phase 19 + Phase 20 conflict on schema migration order.** Both add fields to LearnedPattern composite key. Recommend Phase 19 first (single field, simpler) → Phase 20 second (regime field, more surface area). Or batch them in one migration.

---

## v1.1 Definition (Mapping to Capability Areas)

### Must Ship (per PROJECT.md v1.1 DoD)

- [ ] **Phase 18 (A1 drift defense)** — exponential decay + ESS-based promotion gate
- [ ] **Phase 19 (A2 hierarchical priors)** — partial pooling demonstrably accelerating sparse-cell learning
- [ ] **Phase 20 (A3 regime awareness)** — regime label in cell key + visible in EngineCalibrationPanel
- [ ] **Phase 21 (A4 lift gating)** — at least 1 cell with measurable Brier-lift > 5% on out-of-sample data
- [ ] **Phase 26 (D1 dashboard)** — engine performance tab live at `/insights` with daily learning feed
- [ ] **Phase 27 (D2 calibration trail)** — per-report calibration trail published

### Should Ship (high-value, achievable in v1.1 window)

- [ ] **Phase 22 (B1 composite signal)** — completes Phase 16's logistic regression scaffold; unlocks B2
- [ ] **Phase 25 (C2 backfill)** — bootstraps the data needed for Phase 21 to be meaningful

### Stretch / Defer to v1.2

- [ ] **Phase 23 (B2 counterfactuals)** — high value, requires Phase 22 + dashboard integration
- [ ] **Phase 24 (C1 adaptive watchlist)** — high value, lower urgency than evidence-quality phases

---

## Feature Prioritization Matrix

| Capability Area | User Value | Implementation Cost | Priority |
|---|---|---|---|
| A1 — Drift defense (time-decay + ESS) | HIGH | LOW | P1 |
| A2 — Hierarchical priors | HIGH | MEDIUM | P1 |
| A3 — Regime awareness | HIGH | MEDIUM | P1 |
| A4 — Lift-gated promotion | HIGH | MEDIUM | P1 |
| B1 — Composite signal | HIGH | MEDIUM | P1 |
| B2 — Counterfactual reasoning | MEDIUM-HIGH | MEDIUM | P2 |
| C1 — Adaptive watchlist (bandit) | MEDIUM | MEDIUM | P2 |
| C2 — Historical backfill | HIGH | HIGH | P1 (gate to A4) |
| D1 — Performance dashboard | HIGH | LOW-MEDIUM | P1 |
| D2 — Calibration trail / Model card | HIGH | MEDIUM | P1 |

**Priority key:**
- P1: Required for v1.1 DoD or unlocks a P1 capability
- P2: High value, ship if time
- P3: Nice to have, future consideration

---

## Competitor / Industry Reference Analysis

| Capability | Reference Product / Standard | What "Industry Standard" Means in 2026 |
|---|---|---|
| Drift defense | Evidently AI, Fiddler AI, Arize | PSI / KL / Wasserstein metric, threshold-based alerting tied to business impact, drift cause attribution |
| Hierarchical priors | PyMC, Stan, brms | Empirical-Bayes shrinkage with adaptive λ, ESS-aware, partial pooling visible to user |
| Regime detection | LSEG Developer Portal, QSTrader, Quantinsti | HMM with Viterbi decoding, soft transitions via posterior probabilities, VIX/macro indicators as inputs |
| Lift gating | scikit-learn 1.8 calibration, MLflow Model Registry, Vertex AI | Walk-forward CV (NOT random K-fold), Brier-lift-vs-null with bootstrap CI, automated promotion/demotion |
| Composite signal | scikit-learn StackingClassifier, Brunswik LME, isotonic / Platt calibration | Single headline number with CI, per-input contribution decomposition, post-hoc-checkable |
| Counterfactual explanations | SHAP, LIME, Wachter et al. counterfactuals | Per-input counterfactual table, actionable framing where possible, complement (not replace) SHAP |
| Adaptive sampling | UCB1 (Sutton/Barto), Thompson sampling, AdaptiveBandit | Bandit policy with explicit explore/exploit, coverage telemetry visible to user |
| Historical backfill | Lopez de Prado AFML, CFA Institute backtesting | Walk-forward only, no look-ahead, provenance flags, deterministic feature recomputation |
| Performance dashboard | MLflow, Weights & Biases | Calibration curves, reliability diagrams with CI bands, drift alerts, recent learning events |
| Model card | Mitchell et al. 2019 (arxiv 1810.03993), NVIDIA Model Card++ | 9 categories, disaggregated quantitative metrics with CIs, automated regeneration, EU AI Act compliant |

---

## Sources

### Drift Defense
- [Evolving Strategies in Machine Learning: A Systematic Review of Concept Drift Detection](https://www.mdpi.com/2078-2489/15/12/786)
- [Data Drift: Key Detection and Monitoring Techniques in 2026 | Label Your Data](https://labelyourdata.com/articles/machine-learning/data-drift)
- [Measuring Data Drift with the Population Stability Index (PSI) | Fiddler AI Blog](https://www.fiddler.ai/blog/measuring-data-drift-population-stability-index)
- [Model Drift in Production (2026): Detection, Monitoring & Response Runbook](https://alldaystech.com/guides/artificial-intelligence/model-drift-detection-monitoring-response)
- [Bayesian Nonparametric Unsupervised Concept Drift Detection for Data Stream Mining | ACM TIST](https://dl.acm.org/doi/abs/10.1145/3420034)

### Hierarchical Bayesian
- [How to Fit Hierarchical Bayesian Models in R with brms: Partial Pooling Explained | R-bloggers](https://www.r-bloggers.com/2026/03/how-to-fit-hierarchical-bayesian-models-in-r-with-brms-partial-pooling-explained/)
- [Hierarchical Partial Pooling — PyMC example gallery](https://www.pymc.io/projects/examples/en/latest/case_studies/hierarchical_partial_pooling.html)
- [Hierarchical Partial Pooling for Repeated Binary Trials — Stan](https://mc-stan.org/learn-stan/case-studies/pool-binary-trials.html)
- [Chapter 15 Hierarchical Models | Bayes Rules!](https://www.bayesrulesbook.com/chapter-15)
- [TSB-HB: Hierarchical Bayesian Extension (2026)](https://arxiv.org/pdf/2511.12749)

### Regime Detection
- [Market regime detection using Statistical and ML based approaches | LSEG](https://medium.com/lseg-developer-community/market-regime-detection-using-statistical-and-ml-based-approaches-b4c27e7efc8b)
- [Markov and Hidden Markov Models for Regime Detection in Cryptocurrency Markets (2024–2026)](https://www.preprints.org/manuscript/202603.0831)
- [Market Regime Detection using Hidden Markov Models in QSTrader](https://www.quantstart.com/articles/market-regime-detection-using-hidden-markov-models-in-qstrader/)
- [A forest of opinions: ensemble-HMM voting for market regime shift detection](https://www.aimspress.com/article/id/69045d2fba35de34708adb5d)
- [Cboe VIX Index Dashboard](https://www.cboe.com/us/indices/dashboard/vix/)

### Lift Gating + Backtesting
- [Brier Score in Machine Learning: Definition and Use Cases](https://howtolearnmachinelearning.com/articles/brier-score/)
- [Brier Score: Understanding Model Calibration | Neptune.ai](https://neptune.ai/blog/brier-score-and-model-calibration)
- [scikit-learn 3.4 Metrics and scoring](https://scikit-learn.org/stable/modules/model_evaluation.html)
- [Walk Forward Optimization | Wikipedia](https://en.wikipedia.org/wiki/Walk_forward_optimization)
- [The Future of Backtesting: A Deep Dive into Walk Forward Analysis | Interactive Brokers](https://www.interactivebrokers.com/campus/ibkr-quant-news/the-future-of-backtesting-a-deep-dive-into-walk-forward-analysis/)
- [CFA Institute — Backtesting & Simulation refresher (2026)](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/backtesting-and-simulation)

### Composite / Calibration
- [scikit-learn 1.16 Probability Calibration](https://scikit-learn.org/stable/modules/calibration.html)
- [An introduction to calibration (part II): Platt scaling, isotonic regression](https://www.abzu.ai/data-science/calibration-introduction-part-2/)
- [Brunswik's fundamental principle explained: A diffusion lens model | PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12913299/)
- [The Lens Model Equation | Oxford Academic](https://academic.oup.com/book/54234/chapter/422435233)

### Explainability / Counterfactuals
- [Mastering Explainable AI: SHAP, LIME, Counterfactuals | Medium](https://medium.com/@siddharthapramanik771/mastering-explainable-ai-shap-lime-counterfactuals-and-interpretable-neural-networks-for-1db6892461f6)
- [Explainable AI, LIME & SHAP for Model Interpretability | DataCamp](https://www.datacamp.com/tutorial/explainable-ai-understanding-and-trusting-machine-learning-models)
- [LIME vs SHAP: What's the Difference for Model Interpretability?](https://apxml.com/posts/lime-vs-shap-difference-interpretability)
- [Explainable AI (XAI) Guide: SHAP, LIME & Grad-CAM | Meta Intelligence](https://www.meta-intelligence.tech/en/insight-explainable-ai)

### Bandits / Adaptive Sampling
- [Multi-armed bandit | Wikipedia](https://en.wikipedia.org/wiki/Multi-armed_bandit)
- [Thompson sampling | Wikipedia](https://en.wikipedia.org/wiki/Thompson_sampling)
- [A Tutorial on Thompson Sampling — Stanford](https://web.stanford.edu/~bvr/pubs/TS_Tutorial.pdf)
- [Multi-Armed Bandits: Exploration vs. Exploitation | Stanford / Ashwin Rao](https://stanford.edu/~ashlearn/RLForFinanceBook/MultiArmedBandits.pdf)
- [Integrating Multi-Armed Bandit, Active Learning, and Distributed Computing](https://arxiv.org/html/2601.00615)

### MLOps / Dashboards
- [MLflow vs Weights & Biases vs Neptune (2026)](https://reintech.io/blog/mlflow-vs-weights-and-biases-vs-neptune-experiment-tracking-comparison)
- [Compare MLflow vs. Weights & Biases in 2026 | Slashdot](https://slashdot.org/software/comparison/MLflow-vs-Weights-Biases/)
- [Top MLOps tools in 2026 | Medium](https://medium.com/@online-inference/top-mlops-tools-in-2026-858fd479acac)
- [26 MLOps Tools for 2026 | lakeFS](https://lakefs.io/mlops/mlops-tools/)

### Model Cards / Transparency
- [Model Cards for Model Reporting | Mitchell et al. 2019, arxiv 1810.03993](https://arxiv.org/abs/1810.03993)
- [Implementing ML Model Cards for Better Decision Making | trail-ml](https://www.trail-ml.com/blog/ml-model-cards)
- [Moving beyond the 'Governance Report': Automated Model Cards and the EU AI Act in 2026 | Stirrup](https://jenstirrup.com/2026/04/01/moving-beyond-the-governance-report-automated-model-cards-and-the-eu-ai-act-in-2026/)
- [Enhancing AI Transparency with Model Card++ | NVIDIA](https://developer.nvidia.com/blog/enhancing-ai-transparency-and-ethical-considerations-with-model-card/)
- [Blueprints of Trust: AI System Cards](https://arxiv.org/pdf/2509.20394)

### Citation / Source Attribution Reference Products
- [How to Use Perplexity AI (Like a Pro) in 2026](https://aiclicks.io/blog/how-to-use-perplexity-ai-like-a-pro)
- [Does Perplexity Always Show Sources? Citation Quality and Transparency](https://www.datastudios.org/post/does-perplexity-always-show-sources-citation-quality-and-transparency)

### Uncertainty Visualization
- [Fundamentals of Data Visualization (Wilke) — Visualizing Uncertainty](https://clauswilke.com/dataviz/visualizing-uncertainty.html)
- [The Role of Prediction Intervals in Machine Learning Forecasts](https://www.numberanalytics.com/blog/role-of-prediction-intervals-machine-learning-forecasts)
- [Enhancing Uncertainty Communication in Time Series Predictions](https://arxiv.org/html/2408.12365)

---
*Feature research for: Cipher v1.1 Learning Engine Excellence*
*Researched: 2026-05-01*
*Confidence: HIGH — capability behaviors are well-documented in published ML literature; the novel synthesis is the per-capability table-stakes/differentiator/anti-feature decomposition specific to a 4-signal, ~thousands-of-observations Bayesian engine on Vercel.*
