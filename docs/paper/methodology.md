# Historical Backfill Methodology (Phase 27)

**Version:** 2026-05-26  
**Status:** Shipped (Phase 27 Wave 3)  
**Related artifacts:** `src/lib/backtest/universe.ts`, `scripts/backfill-historical.ts`,
`docs/cards/MODEL-CARD-historical-backfill.md`

---

## 1. Scope

This document describes the historical backfill methodology used to bootstrap the Bayesian
lift-gate's cross-validation (CV) pool count N in Cipher's learning engine. The backfill
replays **≥100 tickers × ≥5 years of the technical signal class** through the existing live
feature-extraction pipeline to populate the CV pool used by Phase 23's Purged K-Fold
evaluation.

The single reproducible command to run the full backfill is:

```bash
npx tsx scripts/backfill-historical.ts
```

Dry-run (no DB writes, verifies the pipeline end-to-end):

```bash
npx tsx scripts/backfill-historical.ts --dry-run --max-tickers 3
```

The backfill is **not** a Vercel Function — it runs locally to avoid the 300-second function
timeout ceiling. Expected wall-clock time: 15–45 minutes for the full universe, depending on
Neon connection latency.

---

## 2. Universe and Survivorship Bias (D-03)

The backfill universe is a curated, versioned, cap-balanced static list defined in
`src/lib/backtest/universe.ts` under the export `BACKFILL_UNIVERSE` (tagged
`UNIVERSE_VERSION`). It contains ≥100 tickers distributed roughly evenly across the three
learning-engine cap-class buckets: `large_cap` (≥$10B), `mid_cap` (≥$2B), and `small_cap`
(< $2B).

### Survivorship Bias — Known, Documented Limitation

**Yahoo Finance returns no price history for delisted tickers.** Because the backfill fetches
historical data via `yahoo-finance2 chart()`, the universe is restricted to currently-listed
equities. This introduces **survivorship bias**: the set excludes companies that went
bankrupt, were acquired, or were otherwise delisted during the 5-year window.

The effect of survivorship bias is directional — it inflates the apparent historical
performance of the surviving set relative to the full investable universe at any past date.
For the purposes of this backfill, the bias affects the cell-count bootstrapping in the
lift-gate CV pool. Users of Phase 23's Brier-lift scores should be aware that the priors
were partially trained on a survivorship-biased population.

Truly survivorship-free coverage would require a paid point-in-time (PIT) dataset (e.g.,
Polygon delisted endpoint, CRSP, or equivalent). This is deferred and documented as a known
limitation — it is **not silently ignored**.

The universe is hand-curated to exclude names that crossed cap-class buckets significantly
over the 5-year window, mitigating — but not eliminating — cap-proxy bias described in
Section 4.

---

## 3. Price Series: Split-Adjusted `close`, Not `adjclose` (D-02)

Historical OHLCV bars are fetched using Yahoo Finance's `close` field, not `adjclose`. This
distinction is methodologically important:

- **`close` (used):** Split-adjusted. When a stock undergoes a forward split, Yahoo
  retroactively divides all historical `close` prices by the split factor so that the price
  series is continuous. This is the correct series for technical indicators (RSI, MACD, ATR,
  SMA) that measure price momentum and volatility patterns — split adjustments are
  economically neutral events that do not affect the shape of a technical pattern.

- **`adjclose` (not used):** Dividend-adjusted. Yahoo applies a backward adjustment factor
  that incorporates all future dividends paid between the bar date and the present. The
  adjustment factor at time T is computed using dividends paid after T — this is
  **forward-looking information** and would constitute feature leakage under CLAUDE.md
  Load-bearing Rule #6 (feature-leakage audit: every feature must be knowable at decision
  time). Using `adjclose` for historical patterns would contaminate the training signal.

**Minor caveat:** Split adjustment itself is retroactive — a stock split announced after
the bar date rewrites the historical `close` values in Yahoo's database. This is acceptable
for the technical-pattern use case because split adjustments are neutral to price momentum
and do not change the shape of indicator-derived features. However, it means the `close`
series for a given date T is not strictly knowable at T if a forward split has since
occurred. This is a documented, accepted simplification for technical signal extraction.

---

## 4. As-Of Cap Class Proxy (D-08 / Research Assumption A1)

The learning engine assigns outcomes to cells identified by `(signal_class, pattern_key,
cap_class, horizon_days)`. The `cap_class` dimension uses the thresholds defined in
`src/lib/diffusion-trace.ts:classifyCapClass()`:

- `large_cap`: market cap ≥ $10B  
- `mid_cap`: market cap ≥ $2B  
- `small_cap`: market cap < $2B  

**Historical market cap is not available on the Yahoo Finance free tier.** The `quoteSummary`
call returns current market cap, not market cap as of any historical date. The backfill
therefore assigns `cap_class` using the market cap at the time the backfill script is run
(curation time, May 2026), not the market cap as of each historical snapshot date.

This is a **documented simplification** (Research Assumption A1). The universe is
hand-curated to exclude names known to have crossed cap-class boundaries significantly over
the 5-year window (e.g., companies that were micro-cap in 2021 but grew to mid-cap by 2026
are excluded from the backfill universe). True historical cap-class assignment would require
a paid data source. This limitation is recorded in the model card at
`docs/cards/MODEL-CARD-historical-backfill.md`.

---

## 5. Sector-Relative Labels and ETF Inception Fallback (D-12 / Pitfall 5)

All backfilled `PriceOutcome` rows carry three labels, consistent with Phase 21:

1. **`forward_return_raw`** — raw return: `(price_at_outcome − price_at_scan) / price_at_scan × 100`
2. **`forward_return_sector_rel`** — sector-relative return: `forward_return_raw − sector_ETF_return` over the same window, where the sector ETF is resolved via `getSectorETF({ ticker, asOfDate: snapshot_date })` from `src/lib/data/sector-mapping.ts`.
3. **`pct_change`** — backward-compatible alias for `forward_return_raw`.

The `getSectorETF` call respects the `SECTOR_RECONSTITUTIONS` override table in
`sector-mapping.ts`, which handles the GICS sector changes for META (was Consumer Discretionary
before 2022, now Communication Services), GOOGL/GOOG, NFLX, DIS, T, and VZ.

**ETF Inception Fallback:** Several sector ETFs did not exist for the full 5-year window:

- **XLRE** (Real Estate): inception 2015-10-07
- **XLC** (Communication Services): inception 2018-06-18

For historical snapshot windows that predate a sector ETF's inception, `fetchSectorETFReturn`
returns null because Yahoo Finance has no price history before that date. In these cases,
the backfill falls back to **SPY-relative** return (the same fallback as the live
`price-followup` cron). This means `forward_return_sector_rel` for XLRE and XLC constituents
before their respective inception dates is computed as `forward_return_raw − SPY_return`
rather than the true sector-relative return.

This is a documented, known caveat. It affects a small fraction of the backfill rows (pre-2015
snapshots for real estate names, pre-2018 snapshots for communication services names). The
`pct_change` field remains an uncontaminated SPY-relative label for the affected rows, so
Phase 23's CV folds can use `pct_change` as a fallback label for those windows.

---

## 6. Point-in-Time Discipline and Purged K-Fold Compatibility (CLAUDE.md Rule #1 + Rule #6)

This section describes the timestamp conventions that make the backfill CV pool compatible
with Phase 23's Purged K-Fold + Embargo cross-validation.

### CLAUDE.md Load-Bearing Rules

> **Rule #1 (time-series CV, never random k-fold):** Random k-fold leaks future information
> into training (ISL Chapter 5). The backtest harness must use forward-chaining / walk-forward
> splits: train on (t₀, tₖ], evaluate on (tₖ, tₖ₊ₙ], advance, repeat. Anything else is
> lookahead bias and invalidates the IS paper.

> **Rule #6 (feature-leakage audit):** Every feature in SourcePackage must be tagged with
> the as-of-time it would have been knowable at decision time. Any new fetcher must document
> its timestamp semantics before being added to the backtest input.

### Timestamp Conventions (Critical Correctness Requirements)

The backfill enforces three timestamp invariants:

1. **`SentimentSnapshot.scanned_at` = the historical window date** (e.g., `2021-03-05`), NOT
   the backfill run date. This is the PIT anchor. Each weekly window uses the actual Friday
   closing date as `scanned_at`.

2. **`PriceOutcome.recorded_at` = `scanned_at + days_after`** (e.g., `scanned_at + 7 days`
   for the 7-day horizon outcome). This reflects when the outcome was resolvable in history,
   not today's date. The helper `computeOutcomeRecordedAt(scanned_at, days_after)` in
   `src/lib/backtest/windowing.ts` enforces this.

3. **`LearningEvent.occurred_at` = `PriceOutcome.recorded_at`** — the historical resolution date.

These timestamps are the inputs that Phase 23's Purged K-Fold fold generator consumes to
construct time-ordered folds with an embargo gap between training and evaluation windows. If
any timestamp were set to `new Date()` (the backfill run date), all backfill rows would appear
as simultaneous observations, Purged K-Fold folds would degenerate, and the IS paper's
time-series CV methodology would be violated (ISL Chapter 5 §5.3, CS229 §"Bias-Variance and
Regularization").

### Weekly Snapshot Cadence

Backfill snapshots are generated at weekly intervals (every 7 calendar days from a fixed
start anchor), producing approximately 260 snapshot dates per ticker over the 5-year window.
Weekly cadence balances CV pool density against runtime and Neon write volume. If Phase 23's
Purged K-Fold folds prove too sparse per cell, the cadence can be increased to daily — this
is a deferred tuning decision (noted in the CONTEXT.md deferred items).

---

## 7. Single Feature Path and Live-Only Gate (D-11 + D-10)

### Single Feature Path (Train/Serve Skew Defense, COVERAGE-08)

The backfill calls `computeTechnicalSnapshot(ticker, asOf)` from
`src/lib/data/technical.ts` as the **sole** feature-extraction path for both the backfill CLI
and the live sentiment-scan cron. No forked or parallel extractor is introduced. This is the
train/serve skew defense: the exact same indicator logic (RSI, MACD, ATR, SMA-200,
bollinger-bands, volume-trend) that generates live snapshot features also generates the
historical training pool. Feature definitions cannot diverge between the training corpus and
the live serving path.

The `computeTechnicalSnapshot` function accepts an `asOf?: Date` parameter. For backfill, the
weekly window date is passed as `asOf`; for live scans, `asOf` defaults to now. In both cases,
`fetchOhlcv(ticker, asOf)` fetches bars in the trailing year ending at `asOf`, and
`classifyTechPattern` returns null when `bar_count < 200` (SMA-200 warmup requirement). The
backfill skips writing snapshot rows where `tech_pattern === null`.

### Live-Only Gate (Lift-Gate Safeguard, COVERAGE-10, D-10)

Backfilled observations feed the **lift-gate CV pool only** — they contribute raw membership
counts for Phase 23's Purged K-Fold Brier-lift test. They do **not** promote cells from
`EXPLORATORY` to `ACTIVE` by themselves.

The `enforceLiveOnlyGate` function in `src/lib/learning.ts` implements this safeguard:

```typescript
// A cell cannot graduate EXPLORATORY → ACTIVE until it has
// LIVE_OUTCOME_THRESHOLD (= 10) live (non-backfill) outcomes confirming the prior.
if (liveOutcomeCount < LIVE_OUTCOME_THRESHOLD) {
  status = 'EXPLORATORY';
}
```

Where `liveOutcomeCount` counts `LearningEvent` rows for this cell whose `delta.source`
field is not `'backfill'`. Backfill rows are old; Phase 18's time-decay already drives their
live-posterior weight toward zero naturally (a 5-year-old row has
`w = exp(−1825/60) ≈ 1.5 × 10⁻¹³` — effectively zero). No explicit exclusion filter is
needed in the learn cron for the posterior path; only the live-only promotion gate is required.

The threshold `LIVE_OUTCOME_THRESHOLD = 10` is documented in `HYPERPARAMETERS.md` under the
`live_outcome_gate` section and will be revisited when Phase 23's lift-gate produces
sufficient evidence to tune it statistically.

---

## 8. References

- **ISL Ch. 5** — Resampling Methods: cross-validation, time-series CV, the case against random
  k-fold (James, Witten, Hastie, Tibshirani. *An Introduction to Statistical Learning*, 2nd ed.
  <https://www.statlearning.com>)
- **CS229** — "Bias-Variance and Regularization" (Stanford). Feature leakage, lookahead bias,
  walk-forward CV. <https://cs229.stanford.edu/main_notes.pdf>
- **Brier 1950** — Proper scoring rule for probabilistic forecasts; motivates Brier-lift
  evaluation in Phase 23.
- **Mitchell et al. 2019** — Model Cards for Model Reporting (*FAT\* '19*). The companion model
  card for this backfill is at `docs/cards/MODEL-CARD-historical-backfill.md`.
- **CLAUDE.md §"Statistical-Methods Reference"** — load-bearing rules #1 and #6 cited above.
- **Phase 27 Context** — `.planning/phases/27-historical-backfill/27-CONTEXT.md`: locked
  decisions D-01 through D-12.
- **Phase 27 Research** — `.planning/phases/27-historical-backfill/27-RESEARCH.md`: patterns,
  pitfalls, assumption log (A1–A4).

---

## Phase 21.1 — Capacity to Detect Edge

Phase 21.1 equips Cipher with five measurement primitives that together let us
answer the IS paper's central question — *does the Gemini-based research engine
produce edge above a non-LLM baseline trained on the same features?* — with
publication-grade rigor. The phase absorbs Phase 23 (lift-gated cell promotion,
CORE-ML-15..19) and extends it with direct LLM evaluation, two logistic baselines,
σ-aware labels, a 36-feature z-score expansion, and a knowable_at CI audit.

### Time-Series Cross-Validation

All model evaluation in this phase uses **Purged K-Fold + Embargo** (López de
Prado 2018, *Advances in Financial Machine Learning*, Ch. 6). The purging step
removes training observations whose outcomes overlap the evaluation window in
time; the embargo gap prevents information leakage at fold boundaries. Random
K-fold is explicitly forbidden (CLAUDE.md load-bearing rule #1; ISL 2nd ed.
Ch. 5 §5.3) because random splits leak future return information into training
when the label horizon (7–30 days) overlaps adjacent observations.

Implementation: `src/lib/cv.ts:purgedKFold` — the canonical CV path for both
the engine's lift-gate (CORE-ML-16) and the logistic baselines (CORE-ML-21).

### Measurement Primitives

**1. BCa Bootstrap** (Efron, B. 1987. "Better Bootstrap Confidence Intervals."
*Journal of the American Statistical Association* 82(397):171–185.)

Bias-corrected, accelerated non-parametric confidence intervals. 10,000
resamples by default; falls back to plain percentile when n < 10 (Efron's
stability floor). Used on every reported number (CLAUDE.md rule #3): hit rates,
Brier lift, IC, per-cell posterior, three-way model comparisons.

Implementation: `src/lib/evaluation/bootstrap.ts`.

**2. Benjamini–Yekutieli FDR** (Benjamini, Y. & Yekutieli, D. 2001. "The
control of the false discovery rate in multiple testing under dependency."
*Annals of Statistics* 29(4):1165–1188.)

Multiple-testing correction under arbitrary dependence — appropriate because
the 156 cells share market regime and their hit-rates are not independent. BH
(Benjamini & Hochberg 1995) assumes positive regression dependence (PRDS);
BY makes no such assumption (ISL 2nd ed. Ch. 13 §13.3). Applied across
`n_trials_attempted` in each `learn` cron run before any cell can graduate to
ACTIVE. Default q ≤ 0.10; documented in HYPERPARAMETERS.md.

Implementation: `src/lib/evaluation/fdr.ts`.

**3. Deflated Sharpe Ratio** (Bailey, D.H. & López de Prado, M. 2014. "The
Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and
Non-Normality." *Journal of Portfolio Management* 40(5):94–107.)

Adjusts in-sample Sharpe for selection bias arising from cell-space
exploration. A cell may pass the FDR gate by chance when many cells are tested
simultaneously; DSR > 0 is the second required filter for ACTIVE status.
Inputs: in-sample Sharpe, `n_trials_attempted`, skew, and excess kurtosis of
the cell's prediction-return series. T < 30 returns null (B&LdP sample-Sharpe
asymptotics require T ≥ 30). Returns are raw `forward_return_sector_rel` —
the continuous sector-relative return analogous to the P&L series in B&LdP.

Implementation: `src/lib/evaluation/dsr.ts`.

**4. Spearman Rank IC** (Spearman, C. 1904. "The proof and measurement of
association between two things." *American Journal of Psychology* 15:72–101.
Applied to financial prediction per Grinold, R.C. & Kahn, R.N. 2000. *Active
Portfolio Management*, 2nd ed. McGraw-Hill, §3.)

Rank correlation between the LLM's confidence-weighted directional score
s ∈ [−1, +1] (where Buy = +confidence, Hold = 0, Sell = −confidence) and the
forward sector-relative return at each horizon. The standard quant headline
metric. Rolling 30-day window with BCa 95% CI is Cipher's IS-paper headline
figure: `getLLMICRolling` in `src/lib/engine-context.ts`.

Implementation: `src/lib/evaluation/ic.ts`.

**5. Categorical Log Loss** (CS229 Main Notes, Stanford. "Information Theory"
section. See also Murphy, K.P. 2012. *Machine Learning: A Probabilistic
Perspective*, Ch. 8.)

Proper scoring rule alongside Brier score (CLAUDE.md rule #7). Rewards
calibrated probabilities and punishes overconfident wrong calls. Computed for
the Buy/Hold/Sell distribution whenever a calibrated 3-way probability vector
is available (ISL 2nd ed. Ch. 4 §4.4).

Implementation: `src/lib/evaluation/log-loss.ts`.

### Label Space

The primary engine outcome label is **σ-aware**: a prediction is a hit when
the stock beats its sector ETF by at least k = 1 standard deviations of the
sector's 60-day rolling return distribution (CORE-ML-22). This replaces the
fixed 1% threshold used prior to Phase 21.1, which produced a ~38–48% hit rate
indistinguishable from random walk on most cells.

Two secondary labels are retained as diagnostics: `is_directional_hit` (beat
sector by any positive margin, >0%) and `is_hit_flat1` (beat sector by ≥1%
absolute). All three labels are written by one shared compute path in
`/api/cron/relabel` and `/api/cron/price-followup` (CLAUDE.md rule #6 — single
feature path, no train/serve skew). The 60-day rolling sector σ is sourced from
`getSectorSigma60d` in `src/lib/data/sector-mapping.ts`.

### Feature Space

The engine's logistic prior is fit on a 36-dimensional feature vector (CORE-ML-23):

- **Base (12)**: 6 diffusion features (v_niche, v_middle, v_mainstream,
  niche_lead_cycles, q_z, qual_z) + 6 technical features (RSI-14, MACD
  histogram, SMA relative spread, ATR-14, volume ratio, uptrend flag).
- **Ticker-rolling z-score (12)**: each base feature standardized against the
  same ticker's own 60-day history.
- **Cross-sectional z-score (12)**: each base feature standardized within
  today's universe (position in the cross-section on scan date).

PRIOR_PRECISION anneals with the cell's outcome count n: 8 when n < 100, 4
when n < 500, 1 when n ≥ 500. This implements adaptive ridge regularization
(ISL 2nd ed. Ch. 6 §6.2; CS229 §"Bias-Variance and Regularization") — stronger
shrinkage toward the base rate when evidence is sparse.

### Head-to-Head Logistic Baseline

Per CLAUDE.md rule #8, the LLM is benchmarked against two logistic regression
baselines trained on identical Purged K-Fold + Embargo splits (CORE-ML-21):

- **24-feature** (`engine36` without the z-score expansion): the engine's
  numeric feature space without the z-score companions. Strongest "LLM beats
  numeric features" claim.
- **Canonical small set** (7 features: RSI-14, MACD histogram, sentiment %,
  insider net flow, institutional net flow, put/call ratio, sector return):
  literature-cited features from Lo & Hasanhodzic 2010, Brock-Lakonishok-LeBaron
  1992, De Bondt & Thaler 1985, Cohen-Malloy-Pomorski 2012, Wermers 1999, Pan &
  Poteshman 2006, DGTW 1997. Strongest "LLM beats lit-cited features" claim.

Both baselines use the same `predictLogistic` / `updateLogistic` Bayesian Laplace
logistic from `src/lib/learning.ts` (CLAUDE.md rule #8 — same framework, no
separate ML infrastructure). Ridge precision chosen via sweep {1, 2, 4, 8, 16}
on OOS Brier (ISL 2nd ed. Ch. 6). Implemented in `src/lib/baselines/logistic.ts`.

### Five-Gate ACTIVE Promotion

A cell graduates from EXPLORATORY to ACTIVE only when all five gates pass
sequentially (CORE-ML-15..18):

1. **ESS ≥ 30**: effective sample size (Phase 18 exponential decay)
2. **live ≥ 10**: at minimum 10 non-backfill outcomes (Phase 27 D-10)
3. **OOS Brier-lift > θ**: θ = 0.005 (HYPERPARAMETERS.md D-07), minimizing mean
   OOS Brier on Purged K-Fold vs the null model (constant base-rate predictor)
4. **BY-FDR q < 0.10**: Benjamini–Yekutieli adjusted p-value across
   `n_trials_attempted` cells in the same `learn` run
5. **DSR > 0**: Deflated Sharpe Ratio adjusting for multiple-testing selection bias

Any failing gate → EXPLORATORY; status flips emit `LearningEvent` of type
`cell_promoted` / `cell_demoted` with full evaluation context (CORE-ML-19).

### Honest Publishable Outcomes

Per the IS paper's commitment to calibrated null results, three outcomes are all
publishable under the IS research question:

**A.** LLM beats logistic with BCa CI excluding zero — defensible LLM edge claim.

**B.** Logistic ≈ LLM, both > null — publicly-available numeric features carry
signal; the LLM's narrative synthesis adds nothing above the feature signal alone.

**C.** Nothing beats null — publicly-available signal set lacks detectable
daily-frequency alpha at these horizons, consistent with the efficient markets
literature (Fama 1970, 1991; McLean & Pontiff 2016).

Phase 21.1 provides the *capacity* to distinguish these outcomes. The 6-month
live soak after Phase 21.1 ships is the *measurement window* that produces the
empirical answer. The IS paper defends whichever outcome the data support.

### References

- Efron, B. (1987). "Better Bootstrap Confidence Intervals." *JASA* 82(397):171–185.
- Benjamini, Y. & Yekutieli, D. (2001). "The control of the false discovery rate
  in multiple testing under dependency." *Annals of Statistics* 29(4):1165–1188.
- Bailey, D.H. & López de Prado, M. (2014). "The Deflated Sharpe Ratio."
  *Journal of Portfolio Management* 40(5):94–107.
- Spearman, C. (1904). "The proof and measurement of association between two things."
  *American Journal of Psychology* 15:72–101.
- Grinold, R.C. & Kahn, R.N. (2000). *Active Portfolio Management*, 2nd ed.
  McGraw-Hill, §3 (Information Coefficient).
- López de Prado, M. (2018). *Advances in Financial Machine Learning*. Wiley,
  Ch. 6 (Purged K-Fold + Embargo) + Ch. 7 (CV with leakage).
- James, G., Witten, D., Hastie, T. & Tibshirani, R. (2021). *An Introduction to
  Statistical Learning*, 2nd ed. Ch. 5 (Resampling Methods), Ch. 6 (Regularization),
  Ch. 13 (Multiple Testing).
- CS229 Main Notes (Stanford). "Bias-Variance and Regularization"; "Information Theory".
  https://cs229.stanford.edu/main_notes.pdf
- Brier, G.W. (1950). "Verification of Forecasts Expressed in Terms of Probability."
  *Monthly Weather Review* 78(1):1–3.

---

## Phase 22 — Regime-Conditional Bayesian Learning

**Version:** 2026-08-26
**Status:** Shipped (Phase 22, all 5 waves)
**Related artifacts:** `src/lib/regime/classify.ts`, `src/app/api/cron/learn/route.ts`, `src/lib/evaluation/fdr.ts`, `src/components/EngineCalibrationPanel.tsx`, `src/components/SourceMixExpanded.tsx`

### Motivation

Phase 21.1 established that the engine can detect edge in aggregate. Phase 22 tests whether that edge is regime-conditional — i.e., whether `(sentiment_type × cap_class × direction)` cells that work in bear/high-vol regimes also work in bull/low-vol regimes, or whether their alpha is regime-specific.

This is the standard insight from Hamilton (1989) Markov-switching models and Ang & Bekaert (2002): equity return distributions are statistically distinct across volatility and trend regimes, and models that ignore regime structure suffer from averaging across heterogeneous data-generating processes.

### Regime definition

Four buckets: `bull-low-vol`, `bull-high-vol`, `bear-low-vol`, `bear-high-vol`. The two axes are:

- **Trend**: SPY MA50 − MA200. Positive → bull; negative → bear.
- **Volatility**: VIX relative to its rolling 60-day 50th percentile. Above → high-vol; at or below → low-vol.

The classifier is implemented in `src/lib/regime/classify.ts` and is the single source of truth for all regime labels in the system. Labels are written at scan time into `SentimentSnapshot.regime` and backfilled for historical rows via `/api/cron/backfill-regime`.

The choice of 4 buckets (not 2 or 8) follows the cell-count constraint: 26 pattern keys × 3 horizons × 4 regimes = 312 cells, each requiring ≥ 10 live outcomes for promotion (COVERAGE-10). 8 buckets would starve most cells; 2 would sacrifice the trend dimension entirely. 4 is the industry-standard 2×2 (Hamilton 1989; Ang & Bekaert 2002).

### Hierarchical multiple-testing correction

With 312 cells × 2 hypotheses (lift > 0, calibration), naive FDR control inflates the denominator. Phase 22 applies a two-level Benjamini-Bogomolov (2014) hierarchical procedure:

1. **Inner stage**: within each regime family (78 cells), apply Benjamini-Yekutieli (BY) correction at `q_inner = 0.10`. BY (not BH) is used here because cells within a regime are positively dependent (shared market state). The BY correction constant `c(m) = Σ 1/i` accounts for arbitrary dependence.
2. **Outer stage**: take one summary statistic per regime family (minimum adjusted p-value) and apply Benjamini-Hochberg (BH) at `q_outer = 0.10`. Regime families are conditionally independent given the classifier assignment, so BH is valid at the outer level.

This two-level structure is the "multi-tissue eQTL" precedent from Benjamini & Bogomolov (2014): discovery is only claimed in a family when the family clears the outer gate AND the individual hypothesis clears the inner gate. It preserves per-regime detection power compared to a naive single-pass BY over the full 312-cell denominator (ISL Ch. 13).

### Transition-zone exclusion

Regime transitions introduce mislabeled training samples: a prediction made in `bull-low-vol` that matures during a shift to `bear-high-vol` has a label mismatch. Phase 22 drops `posterior_update` events where `snapshot_regime ≠ outcome_regime` (D-05).

The exclusion is **sample-relative** (not window-relative): only events whose snapshot and outcome are in different regimes are dropped. A window-relative rule would drop all predictions whose horizon window contains a flip anywhere, discarding legitimate same-regime observations on either side of brief whipsaws.

The `'ALL'` aggregate cell sees every event regardless of regime — that is its definition.

### Empirical-Bayes source-weight shrinkage

For each source `s` and regime `r`, the regime-conditional weight is:

```
cell_weight(s, r) = cell_n(s, r) / (cell_n(s, r) + λ)
```

where `λ` is a shrinkage strength hyperparameter (logged in `SourceTier.shrinkage_strength`). As `cell_n → 0`, `cell_weight → 0`, and the aggregator falls back through: `(source, regime)` → `(source, 'ALL')` → `1/N` equal-weight. This is the Beta-Binomial MAP estimator under a Beta prior (CS229 "Bayesian Methods"), equivalent to ridge regularization toward the grand mean (ISL Ch. 6).

Weights are normalized via clamped softmax so no single source dominates and the total sums to 1 within a regime.

### References

- Hamilton, J.D. (1989). "A New Approach to the Economic Analysis of Nonstationary Time Series and the Business Cycle." *Econometrica* 57(2):357–384.
- Ang, A. & Bekaert, G. (2002). "Regime Switches in Interest Rates." *Journal of Business & Economic Statistics* 20(2):163–182.
- Benjamini, Y. & Bogomolov, M. (2014). "Selective inference on multiple families of hypotheses." *Journal of the Royal Statistical Society: Series B* 76(1):297–318.
- Benjamini, Y. & Yekutieli, D. (2001). "The control of the false discovery rate in multiple testing under dependency." *Annals of Statistics* 29(4):1165–1188.
