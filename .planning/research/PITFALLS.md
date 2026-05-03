# Pitfalls Research — Cipher v1.1 "Learning Engine Excellence"

**Domain:** Self-calibrating financial ML on top of a Bayesian Beta-Bernoulli engine (per-cell α/β posteriors with online logistic regression overlay)
**Researched:** 2026-05-03
**Confidence:** HIGH (most claims grounded in published methodology — López de Prado, Bailey, Benjamini-Hochberg, Goodhart, NannyML/Evidently drift literature, Stan/PyMC hierarchical pooling consensus, sklearn calibration docs); MEDIUM where extrapolated to Cipher's specific architecture (Beta posteriors + 12-d Laplace logistic + Vercel cron stack)
**Existing system facts grounding this analysis:** 18 LearnedPattern cells / 2 ACTIVE / 87 PriceOutcome rows resolved at 3d–7d only / ACTIVE cells show 0% Brier-lift vs null / 0 of last 10 reports hit a calibrated cell / `patternStatus()` in `src/lib/learning.ts` lines 223-239 promotes on `brier_in < brier_null` (in-sample) without out-of-sample gate / no time decay in `updatePosterior` / no hierarchical sharing / no regime feature in cell key

---

## Critical Pitfalls

### Pitfall 1: Multiple Comparisons / "Lake of Cells" False ACTIVE Promotion (THE BIGGEST RISK)

**What goes wrong:**
The cell space is `signal_class (4) × pattern_key (~8 per class) × cap_class (3) × horizon_days (6) × regime (≥3 once Phase 20 ships) ≈ 1,728+ cells`. With v1.0's `patternStatus()` promoting any cell where `brier_in < brier_null`, the expected number of *spuriously* ACTIVE cells under a true null is enormous. Even at a strict α=0.05 per-cell test, ~86 of 1,728 cells will look ACTIVE by chance. The engine will appear to "learn" patterns that are pure noise — exactly the failure mode v1.1 is meant to defeat. This is the financial-ML-equivalent of p-hacking: many trials, no correction, plausible-looking winners.

**Why it happens:**
Engineers test each cell independently, treat each `ACTIVE` flag as a discovery, and never compute the family-wise error rate or False Discovery Rate (FDR) across the cell ensemble. The current `adversarialNullBrier` in `learning.ts` (lines 197-219) does a permutation test *per cell* — it answers "is this cell better than chance?" but not "across all 1,728 cells, how many would beat chance under the null?" López de Prado calls this the most important missing piece in published backtests: "the number of trials attempted."

**How to avoid:**
1. **Apply Benjamini-Hochberg FDR correction** across all cells in a single learning epoch. Each cron run produces N p-values (one per cell from the permutation null); accept only cells whose BH-adjusted q-value is below a fixed threshold (q ≤ 0.10 is standard for exploratory finance). Use **Benjamini-Yekutieli** instead of BH because cells are positively correlated (shared tickers, shared regime).
2. **Track and persist `n_trials_attempted`** as a column on `LogisticEpoch` and surface it in the dashboard. Every ACTIVE flag must be reported alongside "1 of N candidate cells survived FDR at q=0.10."
3. **Compute Deflated Sharpe Ratio (DSR) / Deflated Brier-Lift** per Bailey & López de Prado (2014): adjust the observed lift downward by the number of trials and the variance of trials, so a "5% Brier lift across 1,728 cells" is correctly deflated to its true significance.
4. **Promotion requires BOTH** (a) raw Brier lift > 5% out-of-sample AND (b) BH-adjusted q < 0.10 across the cell ensemble. Either alone is insufficient.

**Warning signs:**
- ACTIVE-cell count grows roughly linearly with total cell count (suggests random promotion, not learning)
- ACTIVE cells distributed uniformly across pattern_key × cap_class with no semantic clustering
- Cells flip ACTIVE → DEPRECATED → ACTIVE on consecutive cron runs (test instability typical of multiple-testing artifacts)
- Out-of-sample Brier on ACTIVE cells < in-sample Brier by > 0.03 (classic overfit gap)

**Phase to address:** **Phase 21 (Lift-Driven Cell Promotion)** — this is its primary deliverable. The phase plan must include `applyFDRCorrection(cellPValues, q=0.10)` as an explicit module, persist `n_trials_attempted`, and surface the deflated lift in the dashboard.

---

### Pitfall 2: Temporal CV Leakage with Overlapping Horizons

**What goes wrong:**
Cipher resolves outcomes at 3/7/14/30/60/90d on the same SentimentSnapshot. A naive train/test split (e.g., train on snapshots 1-80, test on 81-100) leaks: snapshot 80's 30d outcome resolves at day 110, which is *inside* the test window. Worse, the 90d outcome from snapshot 50 resolves at day 140, contaminating training labels with information that was unknown at scan time. The trained logistic regression looks predictive on the test set but is actually peeking at the future.

**Why it happens:**
Engineers reach for `train_test_split(shuffle=True)` or even an honest time-ordered split without realizing that *labels themselves* span the boundary. The "label horizon" overlap is invisible in row-level splits — you have to think in terms of `(scan_date, scan_date + horizon_days)` intervals.

**How to avoid:**
1. **Adopt López de Prado's Purged K-Fold + Embargo** (2018, *Advances in Financial Machine Learning*). For each test fold of dates [t1, t2]: purge from training any snapshot whose `scan_date + max_horizon_days > t1` AND `scan_date < t2`. Add an embargo of `max_horizon_days` after t2 so the next training window can't leak backward through serial correlation.
2. For multi-horizon training (12-d logistic on 30d outcomes), the purge window = 30 days. For composite signals using 90d outcomes, purge = 90 days. **Use the longest horizon's purge window** for the unified training run.
3. **Combinatorial Purged Cross-Validation (CPCV)** for the final v1.1 evaluation — generates many chronology-respecting splits and reports the distribution of out-of-sample Brier, not a single point estimate. Implement via `skfolio.model_selection.CombinatorialPurgedCV` reference algorithm (TS port — the library is Python-only).
4. **Walk-forward validation** (anchored or rolling window) for the *production* cron's daily epoch — train on [start, T], test on [T, T+stride], advance T. Never refit on data that includes outcomes from the test window.

**Warning signs:**
- In-sample Brier and out-of-sample Brier within 0.005 of each other (suspicious — normally OOS is materially worse)
- 30d horizon Brier-lift ≈ 3d horizon Brier-lift (suggests the model isn't actually learning the long horizon, just leaking)
- Random shuffling the snapshot order in CV changes the OOS Brier by < 5% (no temporal structure means leakage is dominating)

**Phase to address:** **Phase 21 (Lift-Driven Cell Promotion)** — adopt purged-CV as the OOS gate. **Phase 25 (Backfill)** — also needs purging because backfilled snapshots will be used for both training AND validation.

---

### Pitfall 3: Time-Decayed Updates Tuned by Eyeball (Half-Life Wrong)

**What goes wrong:**
Adding exponential decay (Phase 18) introduces a new free parameter — the half-life λ. Three failure modes:
1. **λ too short** (e.g., 14 days): erases real signal that's still valid. The engine becomes a momentum tracker on its own posteriors and forgets stable patterns. ESS (effective sample size) collapses to ~10, posteriors widen pathologically, and ACTIVE cells fall back to EXPLORATORY.
2. **λ too long** (e.g., 365 days): defeats the purpose. Concept drift goes undetected exactly when v1.1's value proposition requires it.
3. **One global λ for all cells**: equivalent to assuming all signal classes drift at the same rate. Insider Form 4 patterns may be stable for years; community sentiment may shift in weeks. Single λ underfits both ends.

**Why it happens:**
Half-life is invisible in the cron output; teams pick a "reasonable" value (commonly 30 or 90 days) and never validate it. There is no closed-form optimum — λ depends on the actual drift rate, which is itself the thing the model is trying to detect.

**How to avoid:**
1. **Treat λ as a hyperparameter and tune via OOS Brier** on a holdout. Grid over λ ∈ {14, 30, 60, 90, 180, 365} days; pick the λ that minimizes purged-CV Brier per signal_class. Different signal classes get different λ.
2. **Compute Effective Sample Size (ESS)** explicitly and surface it next to α/β in the dashboard. Formula for exponential decay: `ESS = (Σ w_i)² / Σ w_i²` where `w_i = exp(-Δt_i / λ)`. If ESS < 10, the cell is undersampled regardless of how many raw observations exist.
3. **Promotion gate change**: replace `sample_size < 10 → EXPLORATORY` with `ESS < 10 → EXPLORATORY`. The currency of a cell is no longer raw N but ESS.
4. **Coupled with `drift_z`**: when `|drift_z| > 2`, *temporarily* shorten λ (adaptive forgetting) or down-weight the older half. Do not silently delete observations.

**Warning signs:**
- ACTIVE-cell count drops by > 30% the day decay is enabled (λ too short)
- `drift_z` distribution unchanged from pre-decay world (λ too long — observations from drifted regime still dominate)
- ESS / raw N ratio < 0.3 across most cells (decay erasing too much)
- CIs widen rather than narrow as new observations arrive (decay killing signal faster than data adds it)

**Phase to address:** **Phase 18 (Time-Decayed Bayesian Updates)** — must include hyperparameter tuning of λ per signal_class, ESS calculation, and dashboard surface for ESS.

---

### Pitfall 4: Hierarchical Priors with Wrong Group Structure (Pooling the Wrong Cells)

**What goes wrong:**
The seductive promise of partial pooling (Phase 19) is "sparse cells learn faster from related cells." The trap is that "related" must reflect a real causal/economic similarity. Three failure modes from the literature:
1. **Pool by syntactic similarity, not economic similarity**: pooling `consolidation/large_cap/3d` with `consolidation/small_cap/3d` because they share `pattern_key` — but small-caps consolidate for very different reasons (illiquidity, lack of coverage) than large-caps (institutional accumulation). The shared parent prior pulls both toward an average that fits neither. Documented failure mode: "artificially low predicted mortality rates for smaller hospitals" in clinical Bayesian literature — direct analog.
2. **Aggressive shrinkage of cells that have real signal**: a cell with N=100 and a true 60% hit rate gets pulled toward the global ~30% mean if the prior precision is too strong. Real winners look like noise.
3. **Ignoring sample-size differences**: standard partial pooling assumes within-group variance is comparable across groups. If `large_cap` cells routinely have N=200 and `small_cap` cells have N=10, the small-caps' shrinkage becomes near-total — equivalent to having no per-cell estimate at all.

**Why it happens:**
The partial-pooling prior structure is a modeling decision, not a hyperparameter you can grid over cheaply. Stan/PyMC users frequently default to "every group shares a Normal hyperprior" without justifying why those groups belong to the same population.

**How to avoid:**
1. **Justify the hierarchy economically before coding it.** Document: "We pool `[pattern_key]` across `[cap_class]` because we believe the *pattern* generalizes across caps but the *base rate* differs." Then encode this as a partially pooled intercept (cap-specific) + pooled slope (pattern-specific).
2. **Use weakly informative priors at the hyperparameter level.** Half-Normal(0, 1) on the group-level standard deviation is the standard Stan recommendation — lets the data decide how much pooling to do. Avoid uniform priors on σ (causes funnel pathologies).
3. **Run a no-pooling vs partial-pooling vs complete-pooling sweep on a held-out set.** Report per-cell OOS Brier for all three. If partial pooling wins for sparse cells but loses for dense cells, deploy a *cell-specific* shrinkage factor: shrink low-N cells toward parent, leave high-N cells alone.
4. **Sanity-check shrinkage targets.** For each pooled cell, log "raw posterior mean" vs "shrunk posterior mean" — if shrinkage pulls a real winner from 60% to 35%, you've over-pooled.

**Warning signs:**
- All pooled cells report posteriors within ±5% of the global mean (over-pooling)
- Small-cap ACTIVE cells disappear after pooling enabled (sample-size imbalance crushed them)
- Per-cell credible intervals don't shrink at all relative to no-pooling (under-pooling — equivalent to no-pooling)
- Brier on dense cells degrades while Brier on sparse cells improves (pooling helping the wrong end of the distribution)

**Phase to address:** **Phase 19 (Hierarchical Priors)** — must include economic-justification document, shrinkage diagnostics in the dashboard, and the no-pooling/partial/complete sweep as a phase-completion gate.

---

### Pitfall 5: Regime Mis-labeling Poisons Training (Especially at Transitions)

**What goes wrong:**
Adding a `regime` dimension to the cell key (Phase 20) means every observation must be labeled with a regime at scan time. Three failure modes:
1. **Look-ahead bias in regime labeling**: training a regime classifier (e.g., HMM) on the full history and applying it to historical snapshots. The model has *seen the future* — it knows that volatile periods preceded crashes — and will be unrealistically accurate. Documented in QuantConnect's "Rage Against the Regimes" essay as the dominant academic mistake.
2. **Regime label flipping**: HMMlearn assigns state IDs non-deterministically. State 0 might be "bull" today and "bear" tomorrow after a re-fit. Cells keyed by state ID become incoherent.
3. **Regime transition contamination**: when regime changes from bull to bear on day T, snapshots from days [T-5, T+5] are ambiguously labeled. Either label poisons the cell — bull regime cells absorb bear-onset behavior, or vice versa.

**Why it happens:**
HMMs fit by EM on full history are computationally cheap and produce visually plausible regime maps; they look correct to the eye. The look-ahead bias is invisible in the diagnostic plot. The state-ID instability is a known HMM library quirk that academic papers ignore.

**How to avoid:**
1. **Rolling-window regime fit, never full-sample.** The regime classifier on day T sees only data from [T-365, T-1]. Re-fit nightly. Accept that regime labels will be noisier — this is the honest cost.
2. **Pin regime states to economic anchors, not state IDs.** Define "bull = SPY 200d slope > 0 AND VIX < median(VIX, 90d)" as a deterministic rule, OR post-process HMM states by sorting them by mean return so "bull" is always the high-return state regardless of internal state ID.
3. **Add a `regime_confidence` field.** When the HMM posterior over regimes is < 0.7 for any single regime (transition zone), exclude the snapshot from training entirely OR train a separate "transition" regime cell.
4. **Backfill regimes using only point-in-time data** — when reconstructing the regime label for a 2024 snapshot, the labeler uses only 2023 data. This is the same purging discipline as Pitfall 2 applied to a different label.

**Warning signs:**
- Regime-conditioned ACTIVE cells appear at sharp regime boundaries (suggests transition contamination)
- The same cell key flips between ACTIVE and DEPRECATED when the regime classifier is re-fit (state-ID instability)
- "Bull regime" cells have suspiciously high hit rates compared to "bear regime" cells across all signal classes (look-ahead bias — the labeler knows which periods preceded gains)

**Phase to address:** **Phase 20 (Market-Regime Feature)** — must implement rolling-window labeler with deterministic state ordering, regime confidence threshold for cell-inclusion, and a regression test that a 2024 snapshot's regime label is identical whether labeled in 2024 or 2026.

---

### Pitfall 6: In-Sample Brier Promotion Without Out-of-Sample Gate

**What goes wrong:**
Current `patternStatus()` promotes a cell if `brier_in < brier_null`. This is the v1.0 "ceiling" the brief calls out: ACTIVE cells show 0% Brier-lift vs null model. The cell looks calibrated *on the data it was trained on* but generalizes nowhere. Industry-standard ML promotes only on OOS performance — in-sample is for monitoring overfit, not for go/no-go decisions.

**Why it happens:**
The first version of the cron was built to make *something* go ACTIVE so the dashboard had cells to display. In-sample is cheap to compute (one pass), out-of-sample requires holding back data and running purged-CV. Engineering shortcut that became calibration debt.

**How to avoid:**
1. **Replace in-sample gate with OOS Brier-lift gate.** `patternStatus` requires `brier_out_of_sample < brier_null - 0.01` (1 percentage point of lift, configurable per signal class).
2. **Combine with FDR correction (Pitfall 1).** OOS lift alone over 1,728 cells will still produce false positives. Both gates are necessary.
3. **Track in-sample-vs-OOS gap as a dashboard metric.** Gap > 0.03 = warning sign of overfit; gap > 0.05 = automatic demotion.
4. **Promotion requires N (or ESS) ≥ 30 OOS observations**, not 10 raw. Industry standard for binary-outcome ML is 30+ events per fold.

**Warning signs:**
- ACTIVE cell count > 5% of total cells (with FDR correction, expect <1%)
- A cell's `brier_in` improves monotonically with each cron run while `brier_out` stays flat (the engine is fitting to itself)
- OOS Brier > null Brier on cells flagged ACTIVE (demote immediately)

**Phase to address:** **Phase 21 (Lift-Driven Cell Promotion)** — primary deliverable. Must rewrite `patternStatus()`, add `brier_out_of_sample` and `n_oos_observations` columns to LearnedPattern.

---

### Pitfall 7: Composite Signal — Naive Averaging Across Calibration-Mismatched Models

**What goes wrong:**
Phase 22 composes priors from 4 signal classes (diffusion, technical, institutional, insider) into one composite probability. Three pitfalls from ensemble literature:
1. **Naive averaging of mis-calibrated probabilities**: if technical is well-calibrated and insider is over-confident, averaging produces an in-between probability that is calibrated for nothing. Sklearn's calibration docs are explicit: ensemble *predictions* must be calibrated *individually* before averaging.
2. **Double-counting correlated signals**: institutional 13F filings and insider Form 4 transactions are not independent — when insiders buy, institutions often follow (and vice versa via signaling). Treating their priors as independent in a logistic regression overweights the joint signal.
3. **Logistic regression over-fits to the strongest single signal in low-N regimes**: with only 87 PriceOutcome rows resolved, the 4 signal classes will have very few overlapping observations. The composite logistic will assign nearly all weight to whichever class happened to fire on the small handful of joint snapshots — not a real composition.

**Why it happens:**
Engineers reach for `softmax(linear_combination(signals))` as the obvious composition; the calibration step is invisible in the math and easy to skip. Independence is assumed implicitly because "they're different data sources."

**How to avoid:**
1. **Per-signal-class calibration (Platt or isotonic) before composition.** After each cron's logistic update, fit `CalibratedClassifierCV(method='isotonic', cv=PurgedKFold)` per signal class. Compose calibrated probabilities, not raw logits.
2. **Estimate signal correlations explicitly.** Compute `corr(signal_i_fires, signal_j_fires)` quarterly; if |corr| > 0.3, model the correlated pair as a joint feature (e.g., `inst_AND_insider_aligned`) instead of two independent features.
3. **L2-regularize the composite logistic aggressively in low-N.** Use `PRIOR_PRECISION = 5.0` initially (vs 1.0 in current code), step down as ESS grows. Prevents the strongest-signal-wins failure.
4. **Surface a composite credible interval, not a point estimate.** "Composite prior: 0.42 ± 0.18" makes the low-N uncertainty visible in the report, preventing false confidence in the headline number.

**Warning signs:**
- Composite Brier worse than the best single-class Brier (ensemble destroying information)
- Composite probability calibration plot (reliability diagram) deviates > 0.1 from diagonal
- Logistic coefficient on one signal class > 5× the next (single-class dominance — the composition isn't actually composing)
- Reports cite composite > 0.7 with composite credible interval [0.35, 0.95] — the interval is meaningless because nothing was calibrated

**Phase to address:** **Phase 22 (Multi-cell Prior Composition)** — must include per-class calibration step, signal-correlation diagnostic, and composite reliability diagram in the dashboard.

---

### Pitfall 8: Counterfactual Reasoning Invites LLM Hallucination

**What goes wrong:**
Phase 23 injects "if signal X had been absent, prior would shift from A to B" into Gemini's prompt. Three failure modes:
1. **Counterfactual is mathematically wrong**: if the composite uses non-linear features (e.g., interactions), removing one signal isn't a clean subtraction — recomputation is required. Engineers ship a "delta = full_prior − single_signal_contribution" formula that approximates poorly. The LLM faithfully reports a wrong number.
2. **LLM elaborates beyond the data**: given "without insider buying, prior would be 0.35 instead of 0.50," Gemini extrapolates to "this means insider conviction is the dominant factor" — a story that may or may not be true. Counterfactual injection invites narrative confabulation, the well-documented LLM failure mode.
3. **Counterfactual on a non-firing signal**: "if signal X (which didn't fire) had been absent, prior would be unchanged" — true but meaningless. Cluttering the prompt with no-op counterfactuals trains the user to ignore them.

**Why it happens:**
Counterfactual explanations look educational and serious; the math gets less attention than the narrative wrapper. LLMs are notoriously bad at saying "this counterfactual doesn't change anything" — they will manufacture significance.

**How to avoid:**
1. **Compute counterfactuals correctly via leave-one-out re-prediction.** Re-run the composite logistic with signal X's features set to their null defaults (the same null defaults `buildFeatureVector12` already uses for missing data). Take the prediction delta. No approximations.
2. **Only inject counterfactuals where |delta| > 0.05.** No-op counterfactuals are filtered out. Keeps the prompt focused.
3. **Constrain Gemini's elaboration via prompt scaffolding.** Use a structured output schema for the counterfactual section: `{ signal: string, baseline: number, counterfactual: number, delta: number, interpretation: string }` where `interpretation` is constrained to one sentence. Reduces narrative drift.
4. **Add a "counterfactual provenance" footer to every report**: "Counterfactuals computed by leave-one-out at composite prior level. They reflect the engine's current calibration and do not imply causation."

**Warning signs:**
- Counterfactual deltas don't match a manual leave-one-out computation (math is wrong)
- Gemini reports use phrases like "this proves" or "this confirms" near counterfactual deltas (extrapolation)
- Reports include 4+ counterfactuals where 3 have |delta| < 0.02 (no-op clutter)
- Counterfactual delta for a signal that didn't fire on this ticker is > 0 (bug)

**Phase to address:** **Phase 23 (Counterfactual Reasoning)** — must implement true leave-one-out, |delta| filter, structured output schema, and a regression test that signal X with score 0 produces a 0 counterfactual.

---

### Pitfall 9: Adaptive Watchlist Bandit — Cold-Start Optimism Wastes Coverage Budget

**What goes wrong:**
Phase 24 replaces the fixed rotating watchlist with a multi-armed bandit (Thompson sampling, UCB, or similar). Three pitfalls:
1. **Optimistic priors on new tickers**: Thompson sampling with `Beta(1,1)` priors makes every new ticker look "potentially infinitely informative." A new ticker added on Monday will be over-scanned all week before its outcomes resolve and the prior tightens. Documented in production Thompson sampling: "an overly optimistic prior wastes substantial impressions before feedback is incorporated."
2. **Exploit dominates exploration once a few cells go ACTIVE**: bandit reward = "informativeness for the calibration goal." If a few cells are already calibrated, the bandit allocates almost all scans to confirming them, never exploring undersampled cells. The watchlist becomes degenerate.
3. **Regret minimization vs identification mismatch**: standard MAB literature optimizes cumulative regret (maximize total reward). Cipher's actual goal is *cell identification* (find which cells generalize). These have different optimal policies — pure regret minimization exploits too aggressively.

**Why it happens:**
Off-the-shelf MAB libraries default to regret-minimization Thompson sampling; the prior is `Beta(1,1)` because it's "uninformative." Both choices are wrong for Cipher's goal.

**How to avoid:**
1. **Use informative priors for new tickers based on cap_class.** Seed `Beta(α, β)` with the cap_class' historical mean hit rate. New tickers don't get an optimism bonus they haven't earned.
2. **Switch the reward function from "hit rate" to "ESS-weighted information gain."** Reward = `ΔH(posterior_before, posterior_after)` for the cell that this ticker would update. Naturally rewards exploring undersampled cells (high uncertainty = high information gain).
3. **Add an explicit ε-floor of exploration.** Even if exploit looks optimal, allocate ≥20% of daily scans to uniformly random tickers from cells with ESS < 30. Prevents degenerate convergence.
4. **Cold-start gating**: a new ticker doesn't enter the bandit pool until it has been scanned ≥ 3 times via the ε-floor, so its prior has at least minimal data before competing.

**Warning signs:**
- The same 5–10 tickers are scanned every day (exploit dominance)
- New tickers consume > 30% of scan budget for their first week (cold-start optimism)
- ESS distribution across cells is bimodal (some cells over-scanned, many under-scanned)
- Bandit-selected tickers' Brier-lift contribution to the engine is < the random baseline (bandit is hurting, not helping)

**Phase to address:** **Phase 24 (Adaptive Watchlist)** — must use cap-class informative priors, ESS-weighted information-gain reward, ε-floor exploration, and benchmark vs the v1.0 fixed rotation as a phase-completion gate.

---

### Pitfall 10: Historical Backfill Smuggles in Look-Ahead via Snapshot Reconstruction

**What goes wrong:**
Phase 25 backfills 5+ years of historical SentimentSnapshots and PriceOutcomes from technical patterns. Four failure modes:
1. **Survivorship bias**: backfilling only currently-listed tickers excludes failed companies, biasing posteriors toward the patterns that preceded survival. Documented to inflate annual returns by 1–4%.
2. **Look-ahead bias in feature reconstruction**: computing RSI(14) for 2021-06-01 uses the corrected/restated price data available in 2026, not the raw real-time data available in 2021. Yahoo Finance silently restates splits, dividends, and corrections — the historical snapshot is *not* what would have been seen at scan time.
3. **Backfill bias / point-in-time violation**: even with raw price data, if cap_class is computed from current market cap, a 2018 small-cap that grew to large-cap is misclassified across the entire backfill. Cell keys become incoherent.
4. **Regime mismatch between backfilled and live data**: if 5 years of backfill is mostly bull-regime (2021-2024), the engine learns priors that don't transfer to bear/chop regimes encountered in live operation.

**Why it happens:**
The Yahoo / Polygon / Finnhub APIs return current-state-restated data by default; `point-in-time` data requires explicit querying or a different vendor. Engineers don't notice because the backfill "just works." Sharpely's blog: "backfill bias is the #1 reason backtests overstate live performance."

**How to avoid:**
1. **Use point-in-time data sources only.** Polygon's `/v2/aggs` with `adjusted=false` for raw prices; SEC EDGAR for as-filed fundamentals. Document the as-of date for every backfilled feature.
2. **Backfill the full universe, not the survivor universe.** Use CRSP-style historical constituent lists or, at minimum, scan SEC EDGAR for companies that filed 10-K in the backfill year and *delisted* before 2026. Include them.
3. **Compute cap_class point-in-time.** Market cap from price × shares outstanding *as of* the snapshot date, not today.
4. **Tag backfilled snapshots with `is_backfill=true` and `backfill_regime`.** Allow the dashboard to exclude backfilled data from drift-detection windows. Run separate Brier evaluations on backfill-only vs live-only data — if the gap is > 0.05, the backfill isn't representative.
5. **Apply purged-CV (Pitfall 2) to backfilled data too.** The horizon-overlap problem doesn't disappear just because the data is historical.

**Warning signs:**
- Backfilled cells reach ACTIVE in the first cron run after backfill (suspicious — real signal takes weeks of validation)
- All backfilled tickers are currently listed (survivorship bias)
- Backfill Brier-lift dramatically exceeds live Brier-lift (look-ahead in features)
- A 2019 snapshot's `cap_class` is the same as the ticker's current cap_class (point-in-time violation)

**Phase to address:** **Phase 25 (Historical Backfill)** — must use point-in-time vendor or document deviations, include delisted tickers, compute cap_class as-of, separate backfill-vs-live Brier evaluation as a phase-completion gate.

---

### Pitfall 11: Vanity Metrics on the Dashboard ("Looks Good in Slides, Means Nothing Operationally")

**What goes wrong:**
Phase 26's dashboard becomes a showcase rather than an operational tool. Common metric failures:
1. **"Total observations: 50,000"**: impressive number, no decision attached. Doesn't tell anyone whether the engine is improving.
2. **"% reports using ACTIVE priors"**: looks like adoption, but if ACTIVE cells are spurious (Pitfall 1), this metric is celebrating false positives.
3. **"Average Brier score across all cells"**: averaged over EXPLORATORY + DEPRECATED cells, pulled down by chance. Hides the fact that ACTIVE cells aren't actually better than null.
4. **"Engine learned X new things today"**: gamification metric. Encourages over-promotion of cells. Goodhart's Law triggered.

**Why it happens:**
Dashboards are built to impress stakeholders before they are built to inform engineers. Vanity metrics correlate with engagement; actionable metrics often look modest or flat ("ACTIVE cell Brier-lift: +1.2%"), which feels underwhelming.

**How to avoid:**
1. **For every metric on the dashboard, write the action it triggers.** "If this metric is X, do Y." Metrics with no action are removed.
2. **Lead with actionable metrics**: (a) OOS Brier-lift on ACTIVE cells with 95% CI, (b) FDR-adjusted ACTIVE-cell count, (c) drift alerts in last 7 days, (d) ESS distribution histogram. Vanity metrics (total observations, reports using priors) go below the fold.
3. **Show counterfactual baselines.** Every learning-engine metric reports against the no-engine baseline so improvement is visible. "Reports with ACTIVE prior: Brier 0.18 ± 0.04 vs reports without: Brier 0.21 ± 0.03 → engine adds 1.5% lift, 95% CI overlaps."
4. **Avoid gamification language.** Replace "engine learned X new things" with "X cells transitioned to ACTIVE this week, of which Y survived FDR correction at q=0.10."

**Warning signs:**
- Dashboard mentions "growth" metrics (cells, observations, reports) more than "performance" metrics (lift, calibration, drift)
- Stakeholders cite the dashboard but engineers don't use it for debugging
- Metrics monotonically increase over time with no qualitative interpretation
- No metric has a "this is bad if it crosses X" threshold annotated

**Phase to address:** **Phase 26 (Live Engine Performance Dashboard)** — every metric must have a written action, baseline comparison, and threshold annotation as part of the phase deliverable.

---

### Pitfall 12: Public Calibration Trails — Goodhart, Gaming, and Compliance Risk

**What goes wrong:**
Phase 27 publishes per-report calibration trails (predictions + outcomes). Three independent risk classes:
1. **Goodhart's Law / metric gaming**: once predictions are public, they become a target. External actors (or even users) can game inputs (e.g., creating coordinated StockTwits sentiment) to manipulate Cipher's predictions and then trade against the resulting "ACTIVE" calibration.
2. **Reflexivity / market impact**: if Cipher's published predictions become widely-read, they may *cause* the price action they predict (or cause anti-action from contrarians). Predictions become unfalsifiable.
3. **SEC/FINRA "investment advice" framing**: published probabilistic predictions of price movement, especially with a track record, may cross the line from "research tool" to "investment recommendation" or "investment adviser" under the SEC Marketing Rule. The 2023 SEC predictive-analytics rule explicitly addresses AI-driven recommendations. Hypothetical / model performance has triggered enforcement actions against firms.

**Why it happens:**
The "transparency" framing assumes more publishing = more trust. But in financial domains, public predictions are reflexive instruments, not passive observations. Compliance assumes the disclaimer at the bottom of the page does the work of an exemption — it doesn't.

**How to avoid:**
1. **Publish outcomes-only, not live predictions.** Track record of *resolved* predictions (outcome known) is a backward-looking research artifact and far less risky. Live predictions (waiting for outcome) should be private to the user who requested the report.
2. **Aggregate before publishing.** "Across 200 reports in Q1, ACTIVE-cell predictions had Brier 0.18 vs null 0.22" is publishable research. Per-ticker per-report predictions are not.
3. **Add explicit disclaimers reviewed by counsel.** Industry-standard language: "Cipher is a research tool, not investment advice. The publisher is not a registered investment adviser. Past calibration does not predict future performance." Disclaimer must appear at every prediction, not buried in TOS.
4. **Rate-limit per-ticker publication.** A single ticker's predictions, if widely read, can move the underlying. Throttle to delay public visibility (e.g., redact ticker symbol on live page until outcome resolves).
5. **Explicitly avoid "Buy/Sell" framing in the public-facing log.** Engine outputs probabilities and calibration; the user interprets. Documented as the cleanest exemption pattern under SEC Marketing Rule guidance.

**Warning signs:**
- Calibration trail makes Cipher's track record the headline (vs. "as one signal among many")
- Per-ticker, per-report public log with timestamps that allow correlation with subsequent price action
- Marketing copy says "Cipher predicts" rather than "Cipher's engine assigns probability"
- Disclaimer is a single paragraph at the page bottom, not adjacent to each prediction

**Phase to address:** **Phase 27 (Public Research Log)** — must consult legal/compliance review before launch, restrict public log to resolved-outcome aggregates, build live predictions as user-private, and add prominent disclaimer adjacent to every published prediction.

---

### Pitfall 13: Concept-Drift False Positives Cause Premature Down-Weighting

**What goes wrong:**
Drift detection (`drift_z`, KS test, PSI) on small samples is noisy. With Cipher's small N per cell, normal variance triggers false alarms — drift detector signals "the cell has drifted" when it has only fluctuated. If the engine acts on these alarms (down-weighting old observations, demoting cells), it destroys real signal in pursuit of phantoms.

**Why it happens:**
Drift detectors are designed for high-frequency feature monitoring (millions of inferences per day), not low-frequency outcome monitoring (87 outcomes total across 18 cells). Default thresholds (PSI > 0.1 = "slight drift") are calibrated for the former.

**How to avoid:**
1. **Two-of-two confirmation rule.** Require *both* `|drift_z| > 2` *and* PSI > 0.25 to trigger a drift alert. NannyML / Evidently best practice for noisy environments.
2. **Minimum N for drift testing.** Don't run drift tests on cells with N < 30; the test is uninformative.
3. **Drift alerts don't automatically demote.** A drift alert opens a "review" status; the cell becomes EXPLORATORY-WATCH. Demotion to DEPRECATED requires either (a) drift persisting for 14 consecutive days or (b) OOS Brier degradation > 0.03.
4. **Rolling window for drift, not all-time.** Compare last 30d window to prior 30d window, not last 30d to all-time. Reduces sensitivity to long-term level shifts that aren't actually drift.

**Warning signs:**
- Drift alerts on > 20% of cells per week (sensitivity too high)
- Cells flip ACTIVE → EXPLORATORY → ACTIVE multiple times based on drift signal alone
- Drift alerts cluster around regime transitions (Pitfall 5 — regime change being mis-attributed to drift)

**Phase to address:** **Phase 18 (Time-Decayed Updates)** — drift detector tuning is part of the decay package. Two-of-two rule, minimum N, rolling window all implemented here. **Phase 26 (Dashboard)** must surface drift alerts with status + history, not as a binary flag.

---

### Pitfall 14: Distribution Shift Between Backfill and Live (Train/Serve Skew)

**What goes wrong:**
The backfilled training data (Phase 25) and the live serving data are produced by different pipelines — different vendors, different APIs, different normalization. Even if features have the same names, their distributions differ. Training-serving skew is the #1 cause of production ML degradation per Google's "Rules of ML."

Examples specific to Cipher:
- Backfilled `volume_ratio` computed from end-of-day Polygon vs live `volume_ratio` from intraday Yahoo — units may not match.
- Backfilled `tech_pattern_uptrend_flag` computed from a 2026 classifier vs live flag from the same classifier on different upstream features.
- Backfilled snapshots have null `community_intelligence` (Firecrawl wasn't running in 2021); live snapshots have full community data. The 12-d feature vector defaults nulls to neutral, but the *distribution of nulls* differs.

**Why it happens:**
Backfill and live pipelines are built at different times by different code paths; they're rarely tested for distributional equivalence.

**How to avoid:**
1. **Single feature-extraction code path.** Backfill calls the same `buildFeatureVector12` as live. No separate "historical feature extractor."
2. **Distribution monitor at every cron run.** Compute KS statistic per feature between backfilled and live distributions. Alert if KS > 0.1 on any feature. Baseline established at backfill completion.
3. **Hold out a "live-only" validation set.** Train on backfill, validate on a held-out 60-day live window. If lift on live-only validation < lift on backfill validation by > 0.02, train/serve skew is dominating.
4. **Document feature provenance per snapshot.** `snapshot.features.volume_ratio.source = "polygon_eod" | "yahoo_intraday"` so distributional differences can be traced to a vendor change.

**Warning signs:**
- Brier-lift on backfilled validation high but Brier-lift on first 30 days of live data near zero
- Feature distribution histograms (backfill vs live) differ visibly to the eye
- Logistic regression coefficients flip sign after switching from backfill to live training data
- Null-rate per feature differs > 20% between backfill and live

**Phase to address:** **Phase 25 (Backfill)** — single code path, distribution monitor, live-only validation as a phase gate. **Phase 26 (Dashboard)** — surface train/serve skew metrics.

---

### Pitfall 15: The "Lake of Cells" — Many Cells, Few Observations Per Cell, Even With Pooling

**What goes wrong:**
Even after Phase 19's hierarchical pooling, the cell space is so large (~1,728 cells) and the observation flow so slow (87 outcomes resolved in v1.0; ~30/week organically) that *most* cells will never reach statistically meaningful N. Pooling helps sparse cells, but pools-of-pools-of-pools tend toward a single shrunken estimate. The engine ends up with thousands of "calibrated" cells that all express the same shrunken global mean, dressed up as differentiated priors.

**Why it happens:**
The cell-space explosion is a natural consequence of v1.1's design (more dimensions = more granularity = more cells). Without pruning, the architecture can't possibly populate all cells.

**How to avoid:**
1. **Cell-space pruning by economic prior.** Define which cells are *expected* to differ. E.g., insider Form 4 has no mid_cap × short-horizon meaningful difference; collapse those to a single pooled cell. Document and version the pruned cell space.
2. **Lazy cell instantiation.** Cells aren't created until at least 1 observation arrives. Empty cells don't count toward the multiple-comparisons denominator.
3. **Coverage budget allocation.** Phase 24's adaptive watchlist gets a *coverage budget* — minimum N per cell within 90 days. Cells that the watchlist can't fill stay EXPLORATORY indefinitely or get pruned.
4. **Aggressive parent-prior reporting.** When a leaf cell has ESS < 10, the report should say "no calibrated leaf-cell signal; falling back to parent (ESS=N): prior=X." Prevents pretending sparse cells have unique information.
5. **Honest dashboard column for "cells that have ever reached ESS ≥ 30."** This is the real population. Total cell count is misleading.

**Warning signs:**
- Median ESS across cells is < 5 even after 6 months of operation
- Most ACTIVE cells share the same posterior mean within ±2% (pooling has converged everything to global mean)
- Reports cite "leaf cell prior" when the leaf has ESS=2 (false precision)
- Cell count grows but ACTIVE count stays flat (the lake widens, the islands don't)

**Phase to address:** **Phase 19 (Hierarchical Priors)** — pruning logic, lazy instantiation, parent-fallback reporting. **Phase 24 (Adaptive Watchlist)** — coverage budget. **Phase 26 (Dashboard)** — ESS distribution and "cells ≥ ESS 30" as a primary metric.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| In-sample Brier promotion (current v1.0) | Cells go ACTIVE so dashboard isn't empty | False ACTIVE flags, no real lift, dashboard credibility degraded | Only as a debug stage, gated behind a feature flag, never in production |
| Single global decay rate λ | One hyperparameter to tune | Underfits per-class drift dynamics | Acceptable in Phase 18 MVP if logged as known limitation, must be class-specific by Phase 21 |
| Naive averaging of signal-class priors | Composite signal ships fast | Mis-calibrated composite, double-counting | Never — calibration step is mandatory before composition |
| Backfill from current-state Yahoo data | 5 years of data in one cron | Look-ahead bias, survivorship bias, potentially unusable training data | Acceptable for *exploratory* visualization (not training) with a `is_lookahead_unsafe=true` flag |
| Public per-ticker prediction log | Strong "transparency" marketing story | Goodhart gaming, SEC enforcement risk, market reflexivity | Never publicly per-ticker live; aggregate or post-resolution only |
| Skipping FDR correction "because we have few cells" | Faster cron, simpler stats | The 1,728-cell future arrives fast; refactoring stats post-hoc is harder than building it correctly now | Never — bake FDR into the gate from Phase 21 onward |
| Treating drift_z as a binary demotion trigger | One-line implementation | Cells flap ACTIVE/DEPRECATED on noise | Never — two-of-two rule + persistence requirement is mandatory |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Yahoo / Polygon / Finnhub | Treating restated/adjusted prices as point-in-time | Use raw=unadjusted feeds; document as-of date per feature |
| SEC EDGAR | Using filing date instead of acceptance date for Form 4 | Acceptance date is when the filing became publicly visible — use that for snapshot timestamps |
| Vercel Cron | Idempotency assumption — cron runs exactly once | Cron may retry on failure; learn cron must be idempotent (skip already-processed snapshots by hash) |
| Neon Postgres | Using JSON columns for high-cardinality regime labels | Add a real `regime` column with index; JSON queries don't scale to per-cell filtering |
| Vercel AI Gateway (Gemini) | Embedding raw counterfactual numbers without bounds | Constrain via Zod schema; out-of-bounds values fail validation rather than ship to user |
| Firecrawl | Treating community sentiment as independent across sources | Reddit + StockTwits + X often share the same posts/users; correlation > 0.5 — model as one signal class, not three |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-cell purged-CV in cron | Cron timeout > 60s | Batch: compute CV folds once, evaluate all cells against shared folds | When cell count > 200 |
| Re-fitting hierarchical model on every cron | Cron memory exceeds Vercel function limit | Incremental update via Laplace approximation; full re-fit weekly | When N(observations) > 5,000 |
| Backfill in single cron run | 10-min Vercel function timeout | Chunk backfill: 100 snapshots per cron, paginate via cursor | When backfill universe > 1,000 tickers |
| Logistic state JSON column grows unbounded | Slow reads on `/insights` dashboard | Cap LogisticEpoch retention to last 30 epochs, archive older to cold storage | When epoch count > 100 |
| Bandit re-evaluating all tickers every cron | Cron CPU exceeds limit | Maintain bandit state in DB, only re-rank tickers whose posterior changed | When watchlist > 500 tickers |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Public calibration trail with per-user attribution | Per-user research history publicly visible — privacy violation | Aggregate-only public; per-user details remain authenticated |
| Scraped community content (Firecrawl) used in training without provenance | Reddit/X content may be CSAM, defamatory, or copyrighted; learning from it incurs liability | Attribute every training observation to URL + timestamp; ability to purge by source |
| Bandit reward function exposed in API responses | External actor can game bandit allocation by observing reward signal | Bandit state internal-only, no API surface |
| Counterfactual computations exposed pre-publish | Allows reverse-engineering of feature weights — intellectual-property leak | Counterfactuals computed server-side, only `{baseline, counterfactual, delta}` triple shipped to client |
| Public model card includes training-data ticker list | Reveals universe — attackers know which tickers Cipher is calibrated on | Publish aggregate stats (e.g., "calibrated on 500 large-cap tickers across 2021-2026") not the list |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Composite signal as single point estimate (no CI) | False confidence; user trades on a 50% probability with no sense of uncertainty | Always show point ± 95% CI; if CI > 0.3 wide, label "low confidence" |
| Engine Calibration block when no ACTIVE cells matched | "Engine has no opinion" displayed prominently — looks like product failure | Hide the block; show a smaller "engine has insufficient data for this profile (cell N=X)" footnote |
| Dashboard with > 10 metrics per page | Information overload; users don't know what to look at | Inverted pyramid: 3 hero metrics top, drill-down sections below |
| Counterfactual deltas without baseline anchor | "Without insider buying, prior would be 0.35" — 0.35 of what? | Always pair with baseline: "Composite prior 0.50; without insider buying would be 0.35" |
| Model card written for ML engineers, exposed to retail users | Users can't parse Brier scores, FDR, ESS | Two-tier model card: "How Cipher works" (plain English) ↔ "Technical model card" (linked) |

## "Looks Done But Isn't" Checklist

- [ ] **Time-decayed updates (Phase 18):** Often missing per-class λ tuning — verify each signal class has its own λ, tuned via OOS Brier on a holdout
- [ ] **Hierarchical priors (Phase 19):** Often missing economic justification for the pooling structure — verify a written doc explains why each pool exists
- [ ] **Hierarchical priors (Phase 19):** Often missing per-cell shrinkage diagnostic — verify "raw vs shrunk posterior mean" logged per cell
- [ ] **Regime feature (Phase 20):** Often missing rolling-window labeler regression test — verify a 2024 snapshot's regime label is identical whether labeled in 2024 or in 2026
- [ ] **Regime feature (Phase 20):** Often missing deterministic state ordering — verify HMM states are post-sorted by mean return, not used by raw state ID
- [ ] **Lift-driven promotion (Phase 21):** Often missing FDR correction — verify `applyFDRCorrection()` is called before any cell is promoted
- [ ] **Lift-driven promotion (Phase 21):** Often missing purged-CV — verify `n_oos_observations` column populated per cell from purged folds
- [ ] **Composite signal (Phase 22):** Often missing per-class calibration — verify `CalibratedClassifierCV(method='isotonic')` (or equivalent) called before composition
- [ ] **Composite signal (Phase 22):** Often missing reliability diagram — verify dashboard shows composite calibration plot
- [ ] **Counterfactuals (Phase 23):** Often missing leave-one-out re-prediction — verify counterfactual delta = full prediction − null-feature prediction (not approximation)
- [ ] **Counterfactuals (Phase 23):** Often missing |delta| filter — verify no-op counterfactuals (|delta| < 0.05) are not injected
- [ ] **Adaptive watchlist (Phase 24):** Often missing ε-floor exploration — verify ≥ 20% of daily scans go to ESS<30 cells
- [ ] **Adaptive watchlist (Phase 24):** Often missing benchmark vs v1.0 fixed rotation — verify A/B test demonstrates net Brier-lift improvement, not just coverage change
- [ ] **Backfill (Phase 25):** Often missing point-in-time verification — verify backfilled `cap_class` for ticker T at date D matches T's market cap from D, not from today
- [ ] **Backfill (Phase 25):** Often missing delisted tickers — verify SEC EDGAR scan for companies that filed 10-K in backfill year and delisted before 2026 includes them
- [ ] **Backfill (Phase 25):** Often missing live-only validation — verify Brier-lift on first 60 days of live data (post-backfill) is within 0.02 of backfill-validation lift
- [ ] **Dashboard (Phase 26):** Often missing per-metric action — verify every dashboard metric has a documented "if X then do Y" action
- [ ] **Dashboard (Phase 26):** Often missing baseline comparison — verify every learning-engine metric reports against the no-engine baseline
- [ ] **Public log (Phase 27):** Often missing legal/compliance review — verify counsel sign-off before public launch
- [ ] **Public log (Phase 27):** Often missing per-prediction disclaimer — verify disclaimer appears adjacent to every prediction, not buried in TOS

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| False ACTIVE cells from no-FDR (Pitfall 1) | LOW | Add FDR correction post-hoc; re-run promotion logic; demote cells failing FDR. No data loss. |
| Temporal CV leakage (Pitfall 2) | MEDIUM | Re-evaluate all cells under purged-CV; cells whose lift evaporates get demoted. Rebuild dashboard charts. |
| Wrong decay λ (Pitfall 3) | LOW | Re-tune via grid search on OOS holdout; re-run cron with new λ. Posteriors fully recomputable from raw observations. |
| Wrong pooling structure (Pitfall 4) | MEDIUM | Refactor hierarchy; re-run hierarchical fit. May invalidate ~2 weeks of pooled posteriors. |
| Regime mis-labels (Pitfall 5) | HIGH | Re-label entire history with rolling-window labeler; re-key all cells; many cells reset to EXPLORATORY. |
| Composite mis-calibration (Pitfall 7) | LOW | Add calibration step; refit calibrator on existing data. No retraining of underlying models. |
| Counterfactual hallucination (Pitfall 8) | LOW | Tighten Zod schema, add post-generation validation; affects future reports only. |
| Bandit degenerate convergence (Pitfall 9) | MEDIUM | Inject ε-floor exploration; let bandit re-explore for 30 days; transient over-coverage of some tickers. |
| Backfill look-ahead (Pitfall 10) | HIGH | Backfilled training data is unusable; full backfill must be redone with point-in-time vendor. Cells trained on backfill reset. |
| Vanity metrics (Pitfall 11) | LOW | Replace dashboard widgets; user re-education via docs. |
| SEC/compliance issue (Pitfall 12) | VERY HIGH | Take down public log; engage counsel; potential enforcement and remediation. **This is the only recovery scenario that may threaten the project itself.** |
| Drift false positives (Pitfall 13) | LOW | Tune drift thresholds; restore demoted cells if their underlying data still supports ACTIVE. |
| Train/serve skew (Pitfall 14) | MEDIUM | Unify feature extraction code path; retrain on unified-distribution data. |
| Lake of cells (Pitfall 15) | MEDIUM | Prune cell space; collapse over-granular dimensions; re-key remaining cells. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Multiple comparisons / lake-of-cells false ACTIVE | **Phase 21** (Lift-Driven Promotion) | Dashboard shows `n_trials_attempted` and FDR q-value per ACTIVE cell; ACTIVE-cell rate < expected-by-chance rate |
| 2. Temporal CV leakage | **Phase 21**, **Phase 25** | Purged-CV fold definition committed to repo; regression test verifies no train/test horizon overlap |
| 3. Time-decay misconfiguration | **Phase 18** | Per-class λ documented; ESS surfaced on dashboard; ESS/N ratio sane (≥ 0.3) |
| 4. Hierarchical pooling mis-grouping | **Phase 19** | Economic-justification doc committed; no-pool/partial/complete sweep results in repo; per-cell shrinkage diagnostic visible |
| 5. Regime mis-labeling / look-ahead | **Phase 20** | Rolling-window labeler test passes; HMM state ordering deterministic; regime transitions excluded by confidence threshold |
| 6. In-sample-only promotion | **Phase 21** | `patternStatus()` rewritten; OOS Brier-lift gate enforced; ACTIVE-without-OOS regression test |
| 7. Composite signal ensemble pitfalls | **Phase 22** | Per-class calibrators committed; composite reliability diagram on dashboard; signal-correlation diagnostic surfaces double-counting |
| 8. Counterfactual hallucination | **Phase 23** | Leave-one-out implementation tested; |delta|<0.05 filter active; structured Zod schema for counterfactual section |
| 9. Bandit cold-start / exploit dominance | **Phase 24** | Cap-class informative priors implemented; ε-floor active; A/B test vs fixed watchlist shows net Brier-lift |
| 10. Backfill survivorship / look-ahead | **Phase 25** | Point-in-time vendor documented; delisted tickers included; backfill-vs-live Brier gap < 0.02 |
| 11. Vanity dashboard metrics | **Phase 26** | Per-metric action document; every metric has baseline comparison; growth metrics demoted below performance metrics |
| 12. Public log gaming / SEC risk | **Phase 27** | Legal sign-off documented; live per-ticker public predictions prohibited; per-prediction disclaimer present |
| 13. Drift detector false positives | **Phase 18** + **Phase 26** | Two-of-two confirmation rule; minimum N=30 for drift testing; rolling window for drift baseline |
| 14. Train/serve distribution shift | **Phase 25** + **Phase 26** | Single feature-extraction code path; KS-statistic monitor on dashboard; live-only validation gate |
| 15. Lake of cells | **Phase 19** + **Phase 24** + **Phase 26** | Cell pruning rules committed; lazy instantiation in code; "ESS≥30 cells" primary dashboard metric |

## Sources

- López de Prado, M. (2018). *Advances in Financial Machine Learning* — chapters on Purged K-Fold and Combinatorial Purged CV (referenced via secondary sources below).
- [Purged cross-validation — Wikipedia](https://en.wikipedia.org/wiki/Purged_cross-validation) — purging and embargo definitions, financial ML context
- [Combinatorial Purged Cross-Validation method — Towards AI](https://towardsai.net/p/l/the-combinatorial-purged-cross-validation-method) — CPCV implementation guidance
- [Cross Validation in Finance: Purging, Embargoing, Combinatorial — QuantInsti](https://blog.quantinsti.com/cross-validation-embargo-purging-combinatorial/) — overlapping-horizon leakage explanation
- [Backtest overfitting in the machine learning era — ScienceDirect 2024](https://www.sciencedirect.com/science/article/abs/pii/S0950705124011110) — CPCV vs walk-forward comparison
- Bailey, D.H. & López de Prado, M. (2014). [The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality — SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551) — multiple-testing correction in financial backtests
- Bailey, Borwein et al. [The Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf) — N-trials problem
- Benjamini & Hochberg (1995) — FDR procedure; explained in [False Discovery Rate — Columbia Mailman](https://www.publichealth.columbia.edu/research/population-health-methods/false-discovery-rate)
- [Benjamini-Yekutieli for positively-correlated tests — GraphPad Prism Guide](https://www.graphpad.com/guides/prism/latest/statistics/stat_pros_and_cons_of_the_three_met.htm) — recommended for finance/fMRI
- [Hierarchical Bayesian partial pooling failure modes — Medium / TDS Archive](https://medium.com/data-science/when-mixed-effects-hierarchical-models-fail-pooling-and-uncertainty-77e667823ae8) — hospital-mortality case study
- [Hierarchical Bayesian Models — Bayes Rules! Chapter 15](https://www.bayesrulesbook.com/chapter-15) — partial pooling theory
- [How to Fit Hierarchical Bayesian Models in R with brms — R-bloggers, Mar 2026](https://www.r-bloggers.com/2026/03/how-to-fit-hierarchical-bayesian-models-in-r-with-brms-partial-pooling-explained/) — current best practice for partial pooling
- [Multilevel Modeling — PyMC example gallery](https://www.pymc.io/projects/examples/en/2022.12.0/case_studies/multilevel_modeling.html) — sparse-cell behavior
- [Market Regime Detection using HMM — QuantStart](https://www.quantstart.com/articles/market-regime-detection-using-hidden-markov-models-in-qstrader/) — full-sample-fit look-ahead pitfall
- [Rage Against the Regimes — QuantConnect](https://www.quantconnect.com/forum/discussion/14818/rage-against-the-regimes-the-illusion-of-market-specific-strategies/) — academic-paper regime-overfitting failure mode
- [Regime-Specific Trading with HMM — QuantInsti](https://blog.quantinsti.com/regime-adaptive-trading-python/) — rolling-window labeling discipline
- [Probability calibration — scikit-learn](https://scikit-learn.org/stable/modules/calibration.html) — CalibratedClassifierCV, ensemble pitfalls
- [Calibration intro Part II — Abzu](https://www.abzu.ai/data-science/calibration-introduction-part-2/) — Platt vs isotonic comparison
- Niculescu-Mizil & Caruana, [Predicting Good Probabilities With Supervised Learning — ICML 2005](https://www.cs.cornell.edu/~alexn/papers/calibration.icml05.crc.rev3.pdf) — ensemble calibration foundational paper
- [Multi-armed bandit — Wikipedia](https://en.wikipedia.org/wiki/Multi-armed_bandit) — exploration/exploitation framework
- [Thompson sampling — Wikipedia](https://en.wikipedia.org/wiki/Thompson_sampling) — cold-start prior selection
- [Foundations of RL with Applications in Finance — Stanford CME 241](https://stanford.edu/~ashlearn/RLForFinanceBook/chapter14.pdf) — financial bandit applications
- [Survivorship Bias in Backtesting — LuxAlgo](https://www.luxalgo.com/blog/survivorship-bias-in-backtesting-explained/) — 1–4% inflated returns
- [Sample Bias and Considerations — AnalystPrep CFA](https://analystprep.com/cfa-level-1-exam/quantitative-methods/considerations-and-biases-in-sampling/) — survivorship/look-ahead/backfill taxonomy
- [Bias-Free Backtesting with Point-in-Time Data — Sharpely](https://sharpely.in/blog/bias-free-backtesting-explained:-how-sharpely-uses-point-in-time-data-to-avoid-look-ahead-and-survivorship-bias) — operational definition of point-in-time
- [Backfill Bias — BowtiedRaptor Substack](https://bowtiedraptor.substack.com/p/backfill-bias) — failure-mode anatomy
- [Drift Detection: KS Test, PSI, and Interpreting Signals — StatsTest](https://www.statstest.com/drift-detection-ks-test-psi-interpret-signals) — combined-test best practice
- [Population Stability Index (PSI) — NannyML](https://www.nannyml.com/blog/population-stability-index-psi) — PSI thresholds and interpretation
- [Data drift detection: PSI vs KS — MLPipeline-Cloud](https://mlpipeline-cloud.com/blog/data-drift-detection-psi-ks) — two-of-two confirmation rationale
- [Goodhart's Law in AI — Practical DevSecOps](https://www.practical-devsecops.com/glossary/goodharts-law/) — when metrics become targets
- [Measuring Goodhart's Law — OpenAI](https://openai.com/index/measuring-goodharts-law/) — proxy gaming in ML
- [LLM Hallucinations Explained — Medium](https://medium.com/@nirdiamant21/llm-hallucinations-explained-8c76cdd82532) — counterfactual hallucination patterns
- [Causal Prompting Framework (CIP) — arXiv 2512.11282](https://arxiv.org/pdf/2512.11282) — counterfactual reasoning grounding for LLMs
- [SEC Predictive Analytics Rule — SEC.gov 2023-140](https://www.sec.gov/newsroom/press-releases/2023-140) — AI/predictive-analytics regulatory framework
- [SEC Marketing Rule Compliance — Kitces](https://www.kitces.com/blog/sec-marketing-rule-enforcement-investment-adviser-key-takeways-compliance-tips-regulations/) — hypothetical/model-performance enforcement
- [AI Compliance for Investment Advisers — Kitces](https://www.kitces.com/blog/artificial-intelligence-compliance-considerations-investment-advisers-sec-securities-exchange-commission-legal-regulation-framework/) — public-prediction risk framing
- [The Regulatory Minefield: FINRA, SEC & AI Compliance — Consult CRA](https://www.consultcra.com/regulatory-minefield-finra-sec-ai-compliance-essentials/) — transparency expectations for AI-driven recommendations
- [Vanity Metrics vs. Actionable KPIs — Improvado](https://improvado.io/blog/what-is-a-vanity-metric) — actionability framework
- [Vanity Metrics: Add Context — Nielsen Norman Group](https://www.nngroup.com/articles/vanity-metrics/) — UX dashboard antipatterns
- [Concept Drift in ML — Evidently AI](https://www.evidentlyai.com/ml-in-production/concept-drift) — drift detection vs over-reaction

---
*Pitfalls research for: Cipher v1.1 Learning Engine Excellence — additive ML capabilities on existing Bayesian engine*
*Researched: 2026-05-03*
