# Hyperparameters Register

Source-of-truth list for calibrated parameters across the Cipher pipeline.
Each section is written by an automated calibration script — hand-editing
values violates S1 (no hand-picked parameters). Recalibration cadence is
documented per section.

---

## crowded_consensus (Plan 20-A-01)

Source: `scripts/calibrate-crowded-consensus.ts` grid search over the
`CrowdedConsensusCalibration` table.

| Parameter            | Value                       | Range searched          | Step  |
|----------------------|-----------------------------|-------------------------|-------|
| H_thresh (entropy)   | n/a (insufficient data)     | [0.3, 1.5]              | 0.1   |
| V_thresh (mention-z) | n/a (insufficient data)     | [1.0, 5.0]              | 0.25  |
| D_thresh (gini)      | n/a (insufficient data)     | [0.1, 0.7]              | 0.05  |

- **Brier Skill Score:** n/a (calibration deferred until ≥30 examples)
- **Training window:** 90d
- **n_examples:** 0 (live smoke deferred — mention_z stub returns 0 until 20-A-02 ships)
- **computed_at:** pending — first cron run lands the inaugural row.
- **model_version:** grid-search-v1
- **Recalibration cadence:** monthly via `/api/cron/calibrate-crowded-consensus` (schedule `'0 7 1 * *'` UTC)

**Deferred-state note:** This plan ships the calibration scaffold in `off`
mode. Live calibration smoke run was deferred — the mention_z stub returns 0
until plan 20-A-02 ships the real volume-baselining function, so the predicate
cannot fire under shadow until then. The monthly cron will write the first
inaugural row on its next scheduled run after 20-A-02 lands. This is
intentional ordering per CONTEXT.md S3 cutover criteria.

Updated by: Plan 20-A-01 (2026-05-12).

---

## Z_thresh per cap_class (Plan 20-A-02)

_Computed_at: pending — first calibration cron run lands the inaugural row. Literature default Z=2.0 (≈ 95th percentile under normal-equivalent MAD scaling) seeds the search per S1 / Rousseeuw & Croux 1993._

| cap_class | Z_thresh | IC | n_examples |
|---|---|---|---|
| large_cap | 2.00 | 0.0000 | 0 |
| mid_cap | 2.00 | 0.0000 | 0 |
| small_cap | 2.00 | 0.0000 | 0 |
| unknown | 2.00 | 0.0000 | 0 |

- **Calibration source:** `scripts/calibrate-mention-z-threshold.ts` grid search over Z ∈ [1.0, 5.0] step 0.25 against trailing-90d cross-sectional Spearman IC of (mention_z > Z, forward-5d return).
- **Training window:** 90d (CONTEXT.md S2 PIT — joins on `SentimentObservation.fetched_at` only).
- **MAD scaling:** 1.4826 (Rousseeuw & Croux 1993 — normal-equivalent σ).
- **MAD floor:** EPSILON = 1.0 mention/day (T-20-A-02-02 mitigation against division by zero on stable tickers).
- **Min observations:** n=30 daily-count buckets — below this `getBaselineForTicker` returns null and consumer falls back to legacy `is_trending_v1`.
- **Recalibration cadence:** nightly via `/api/cron/mention-baselines` (recompute) and monthly via `scripts/calibrate-mention-z-threshold.ts` (Z grid search).

**Deferred-state note:** This plan ships under `FEATURES.mention_z_trending_mode = 'off'`. Cutover to `shadow` (and eventually `on`) requires the four criteria documented in `docs/cards/MODEL-CARD-mention-baseline.md` Metrics section: ≥30d nightly cron, ≥80% ticker coverage, IC ≥ 0.05, ≥1 cap_class threshold differs from default Z=2.0.

Updated by: Plan 20-A-02 (2026-05-12).

---

## 20-A-03 — Per-source-class sentiment decay (λ in 1/day)

Half-life formula: **t½ = ln(2) / λ**.

| source_class | λ (per day) | half-life (days) | literature seed (h) | citation | tuned_at |
|---|---|---|---|---|---|
| retail | 0.6931 | 1.00 | 24 | Tetlock 2007 — J. Finance — pessimism predicts next-day returns then mean-reverts within 5 trading days | bootstrap |
| news | 0.2310 | 3.00 | 72 | Loughran-McDonald 2011 J. Finance — news effects survive 1-2 weeks | bootstrap |
| sec | 0.0990 | 7.00 | 168 | Loughran-McDonald 2011 — 10-K market response decays over 7-30d | bootstrap |
| analyst | 0.1386 | 5.00 | 120 | Womack 1996 / Stickel 1992 — analyst-revision drift survives 1-2 weeks | bootstrap |
| social-other | 0.1733 | 4.00 | 96 | Bridging seed between retail and news; calibration to override | bootstrap |

**Calibration procedure** (CONTEXT.md line 105):
1. `npx tsx scripts/tune-decay.ts` — grid search per class on rolling 90d window.
2. Grid: `{seed × 0.5, ×0.75, ×1.0, ×1.25, ×1.5, ×2.0}`.
3. Score: 20-day rolling ICIR of decayed aggregate vs forward 7-day alpha-vs-SPY.
4. Gate: `n_observations >= 60` per class. ICIR uplift `>= 0.05` vs no-decay baseline.
5. Cutover from `SENTIMENT_DECAY_MODE=shadow` to `=on` requires paired-bootstrap on Sharpe (1000 resamples) with 95% CI lower-bound > 0. Run `--bootstrap-cutover` to produce the report.
6. Re-tune monthly via `/api/cron/tune-decay` (vercel.json).

**Important** — this table is updated by `scripts/tune-decay.ts` after each successful run. The `bootstrap` value in `tuned_at` is replaced with the ISO timestamp of the run, and `literature seed` column is preserved as historical provenance.

**Deferred-state note:** Cipher ships under `SENTIMENT_DECAY_MODE=off` by default. Shadow mode runs both paths in parallel; cutover to `on` requires the paired-bootstrap report above with 95% CI lower-bound > 0 on Sharpe.

## 18-* — Per-signal-class learning-engine decay (λ in 1/day, t½ in days)

Lives inline in `src/lib/learning.ts` HYPERPARAMETERS const (per CONTEXT D-19 — additive-only schema). See that file for current values. Re-tune via `npx tsx scripts/tune-lambda.ts`.

| signal_class | lambda_days | tuned_at | source |
|---|---|---|---|
| diffusion | 60 | bootstrap | scripts/tune-lambda.ts |
| technical | 60 | bootstrap | scripts/tune-lambda.ts |
| insider | 60 | bootstrap | scripts/tune-lambda.ts |
| institutional | 60 | bootstrap | scripts/tune-lambda.ts |

> These two decay tables are intentionally separate — sentiment-message decay (per source class, t½ ≈ 1-7d) and learning-engine observation decay (per signal class, t½ ≈ 60d) are different domains with different calibration targets. Do not merge them. See `src/lib/sentiment/decay.ts` header for rationale.

Updated by: Plan 20-A-03 (2026-05-12).

---

## Phase 20-A-04 — Author-concentration Gini

Source: `src/lib/sentiment/aggregator.ts` `computeAuthorConcentration()` +
weekly `scripts/calibrate-author-share-thresholds.ts` cron writing to the
`AuthorShareCalibration` table. Q1 thresholds are NEVER hand-set (S1).

| Param | Value | Source / rationale |
|-------|-------|---------------------|
| `FEATURE_AUTHOR_GINI` down-weight multiplier | `0.5` | Cookson & Engelberg 2020 echo-chamber down-weight literature default. Re-tunable; out of scope for first ship. |
| `AUTHOR_GINI_N_MIN` sentinel | `5` | Below this, Gini is statistically meaningless on a 24h window. Returns null → UI hides sub-card (T-20-A-04-02). Soft default; revisit after 90d production. |
| `q1_author_share_pct` | per-ticker, weekly | NOT hand-set — calibrated by `/api/cron/author-share-calibration` schedule `'0 8 * * 1'` UTC (S1 compliance). Stored in `AuthorShareCalibration` table. |
| `AUTHOR_GINI_GLOBAL_Q1_FALLBACK` | `0.25` | Conservative fallback used only when no calibration row exists for the ticker yet. console.warn fires alongside. Replaced on first cron run. |
| `training_window_days` | `90` | Standard quarterly window; matches 20-A-02 / 20-A-03 baseline windows. |
| `topN` author bars | `5` | UI density choice; not a model parameter. |

- **Computed_at:** pending — first weekly cron run lands the inaugural rows for each ticker. Until then, the global Q1 fallback (`0.25`) applies.
- **Recalibration cadence:** weekly via `/api/cron/author-share-calibration` (`'0 8 * * 1'` UTC).
- **Cutover criteria (shadow → on):** ≥7d shadow + Gini values in the published meme-stock range [0.3, 0.85] on the GME/AMC/SOFI backfill set. UI rollout (`FEATURE_AUTHOR_GINI_UI`) is gated SEPARATELY in a follow-up commit.

**Citation:** Cookson, J. A., & Engelberg, J. (2020). "Echo Chambers." *Review of Financial Studies*. https://doi.org/10.1093/rfs/hhaa027

Updated by: Plan 20-A-04 (2026-05-12).

---

## Phase 20-C-01 — Per-source rolling ICIR with Newey-West significance

Source: `src/lib/sentiment/per-source-ic.ts` `computePerSourceIC()` +
daily `scripts/compute-per-source-ic.ts` cron writing to the `PerSourceIC`
table. Lags and thresholds are NEVER hand-set (S1) — every value below has
a literature citation or rule derivation.

| Parameter | Value | Source |
|-----------|-------|--------|
| Rolling window | 20 days | CONTEXT.md §20-C-01 verbatim |
| Newey-West lag (7d horizon) | 5 | Newey-West 1987 rule L = floor(4·(T/100)^(2/9)), T ≈ 100 |
| Newey-West lag (30d horizon) | 10 | Newey-West 1987 rule, longer overlap |
| BH-FDR α | 0.05 | Benjamini-Hochberg 1995 default |
| n_min_observations (cold-start) | 20 | CONTEXT.md §20-C-01 verbatim |
| Cross-sectional N min per day | 5 | Spearman instability below this; model card §OOD |
| Auto-down-weight ICIR threshold | 0.3 | CONTEXT.md §20-C-01 verbatim |
| Auto-down-weight consecutive windows | 2 | CONTEXT.md §20-C-01 verbatim |
| Cron schedule | `0 5 * * *` | 1h before alpha-decay-watch (06:00 UTC) |
| `model_version` | `per-source-ic-v1` | Bump on algorithm change; old rows preserved |

- **Recalibration cadence:** daily via `/api/cron/per-source-ic` (`'0 5 * * *'` UTC).
- **Cutover criteria:** ≥7 days of dashboard data accumulated AND 20-B-04 SourceTier recompute reading from `PerSourceIC` (forward-reference; this plan ships the SIGNAL only).

**Citations:**
- Newey, W. K., & West, K. D. (1987). "A Simple, Positive Semi-Definite, Heteroskedasticity and Autocorrelation Consistent Covariance Matrix." *Econometrica* 55(3): 703–708.
- Benjamini, Y., & Hochberg, Y. (1995). "Controlling the False Discovery Rate: A Practical and Powerful Approach to Multiple Testing." *J. Royal Statistical Society B* 57(1): 289–300.

Updated by: Plan 20-C-01 (2026-05-12).

---

## Phase 20-C-02 — Brier Calibration

Source: `src/lib/stats/brier.ts` `brierScore()` + `brierDecomposition()` +
`src/lib/stats/isotonic.ts` `isotonicRegression()` +
`corpReliabilityDiagram()`. Weekly evaluation harness:
`scripts/eval-brier.ts` driven by `/api/cron/eval-brier` writes
`reports/brier-{YYYY-MM-DD}.json` (always; gitignored) and
`reports/brier-{YYYY-MM-DD}.md` (only on ship-gate failure; committed as
operator artifact). Per S1, every value below has a literature citation
or rule derivation.

| Parameter | Value | Source |
|-----------|-------|--------|
| Ship-gate threshold (Brier) | `0.24` | CONTEXT.md §S1 line 125 verbatim |
| Random-classifier baseline | `0.25` | Brier 1950: BS = ō·(1−ō) = 0.5·0.5 on balanced base rate |
| Minimum n per classifier_version | `100` | Niculescu-Mizil & Caruana 2005 §4 — isotonic regression stability floor |
| Base-rate imbalance window | `|base_rate − 0.5| < 0.1` | T-20-C-02-01 defensive constant (majority-class trivial Brier ≤ 0.05 at base_rate=0.95) |
| Murphy decomposition n_bins (per_bin histogram only) | `10` | Guo et al. 2017 ICML calibration convention |
| CORP recalibrated-curve grid | `200 points` over [min(p), max(p)] | Dimitriadis-Gneiting-Jordan 2021 §3 dense-grid plotting recommendation |
| CORP histogram bins | `20` | Multimodal-defense histogram-under-the-curve (T-20-C-02-04) |
| Cron schedule | `0 8 * * 1` (Mondays 08:00 UTC) | Plan 20-C-02 weekly cadence; staggered after daily 20-Z-03 retention crons |
| Decomposition identity tolerance | `1e-9` | Floating-point representable across f64; T-20-C-02-03 |
| Reference example tolerance | `1e-6` | Bröcker-Smith 2007 §2 worked example |

**Remediation decision rule** (script header in `scripts/eval-brier.ts`):
- `reliability >= 0.5 × brier` → `REMEDIATE_BY_TEMPERATURE_SCALING` (miscalibration dominates — 20-B-03 owns the fix)
- `resolution < uncertainty / 4` → `REMEDIATE_BY_DROPPING_CLASSIFIER` (no discriminative skill)
- Otherwise (or first run) → `ACCEPT_AS_BASELINE`

**Recalibration cadence:** weekly via `/api/cron/eval-brier` (`'0 8 * * 1'` UTC).
**Cutover criteria** (consumer integration, future): 20-B-03 reads `reports/brier-*.json` for its Brier co-gate. 20-C-06 reads the same JSON to stratify by `cap_class`.

**Citations:**
- Brier, G. W. (1950). "Verification of forecasts expressed in terms of probability." *Monthly Weather Review* 78(1): 1–3.
- Murphy, A. H. (1973). "A new vector partition of the probability score." *J. Applied Meteorology* 12(4): 595–600.
- Bröcker, J., & Smith, L. A. (2007). "Increasing the reliability of reliability diagrams." *Weather and Forecasting* 22(3): 651–661.
- Barlow, R. E., & Brunk, H. D. (1972). "The isotonic regression problem and its dual." *JASA* 67(337): 140–147.
- Dimitriadis, T., Gneiting, T., & Jordan, A. I. (2021). "Stable reliability diagrams for probabilistic classifiers." *PNAS* 118(8). doi:10.1073/pnas.2016191118.
- Niculescu-Mizil, A., & Caruana, R. (2005). "Predicting good probabilities with supervised learning." *ICML 2005*.

Updated by: Plan 20-C-02 (2026-05-12).

---

## bot_filter (Plan 20-C-03)

Source: literal thresholds from Cresci et al. 2019 §3.2 + Nam & Yang 2023 §4.1
+ Broder 1997 / Leskovec-Rajaraman-Ullman Ch. 3.4 (MinHash + banding LSH).
Quarterly review against the trailing 90d StockTwits sample per
`docs/cards/MODEL-CARD-bot-filter.md` §Maintenance.

| param                          | value | source                                            |
| ------------------------------ | ----- | ------------------------------------------------- |
| MIN_ACCOUNT_AGE_DAYS           | 30    | Cresci 2019 §3.2                                  |
| MAX_SELF_SIMILARITY            | 0.5   | Cresci 2019 §3.2                                  |
| MAX_PUMP_DENSITY               | 0.1   | Cresci 2019 Table 2                               |
| MAX_HASHTAG_COUNT              | 5     | Cresci 2019 §3.2                                  |
| MINHASH_NUM_PERM               | 128   | Broder 1997 / LRU Ch. 3.4                         |
| LSH_BANDS                      | 16    | bands × rows = num_perm (16 × 8 = 128)            |
| LSH_ROWS                       | 8     | threshold ≈ (1/16)^(1/8) ≈ 0.707                  |
| COORDINATION_SIMILARITY        | 0.7   | LRU Ch. 3.4 closed-form                           |
| COORDINATION_MIN_CLUSTER_SIZE  | 50    | T-20-C-03-04 mitigation (FP-protection)           |
| FP_GATE                        | 0.05  | Plan 20-C-03 acceptance criterion                 |

- **PUMP_PHRASES list (9 entries):** `to the moon`, `rocket`, `100x`,
  `moonshot`, `bagholder`, `yolo`, `tendies`, `rip`, `lambo` — derived from
  Cresci 2019 Table 2 + WSB slang corpus 2020-2024. Versioned via this
  register; updates require a new model_version under 20-Z-01.
- **Recalibration cadence:** quarterly review (model card §Maintenance);
  immediate recalibration triggered when `npm run eval-bot-fp` reports
  fp_rate > 0.05 on the 100-author labeled set.

**Citations:**
- Cresci, S., Lillo, F., Regoli, D., Tardelli, S., & Tesconi, M. (2019).
  "Cashtag piggybacking: Uncovering spam and bot activity in stock
  microblogs on Twitter." *ACM TWEB* 13(2).
- Nam, S., & Yang, J. (2023). "Detecting pump-and-dump schemes on financial
  social media." *Decision Support Systems* 165.
- Broder, A. (1997). "On the resemblance and containment of documents."
  *IEEE SEQUENCES*.
- Leskovec, J., Rajaraman, A., & Ullman, J. (2014). "Mining of Massive
  Datasets" 2nd ed., Ch. 3 (Finding Similar Items).

Updated by: Plan 20-C-03 (2026-05-12).

---

## Joint-feature quantile breakpoints (20-C-05)

Source: literature-default seeds for the four joint sentiment-interaction
features used in the JOINT_FEATURES_MODE pattern-key extension. 5 buckets
per feature (4 breakpoints, half-open intervals). **Calibration: pending;
see 20-C-05 roadmap.** Empirical recalibration against trailing-90d
distribution is a follow-up plan — these defaults exist so the ablation
script can run end-to-end on day one.

| Feature                       | Breakpoints                  |
|-------------------------------|------------------------------|
| sentimentMomentumProduct      | -0.05, -0.01, 0.01, 0.05     |
| sentimentVolumeInteraction    | -2.0, -0.5, 0.5, 2.0         |
| deltaSentiment3d              | -0.3, -0.1, 0.1, 0.3         |
| sentimentDispersion           | 0.1, 0.2, 0.3, 0.4           |

- **Flag:** JOINT_FEATURES_MODE ∈ {off, shadow, on}; default 'off' on merge.
- **Bucketing path:** `_bucketOf(value, breakpoints)` in `src/lib/learning.ts`.
- **Hash:** `sha1(bucket_tuple).slice(0,12)` — short hex for log readability.
- **New-bucket priors:** α=β=1 (uniform) — additive only, existing rows
  retain semantics under mode='off' (T-20-C-05-05).
- **Promotion gate:** 95% CI lower-bound > 0 AND 3 consecutive monthly runs
  all agreeing — see `/api/cron/joint-feature-ablation` and `reports/`.

Updated by: Plan 20-C-05 (2026-05-12).
