---
model_name: reputation-weighted
model_version: v1.1.0-post-phase-19
card_format: mitchell-2019
last_validated: 2026-05-10
retrain_cadence: P90D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/aggregator.ts
---

# Model Card: reputation-weighted

> **Schema**: Mitchell et al. 2019 — *Model Cards for Model Reporting*, FAT* '19. https://arxiv.org/abs/1810.03993
> **PII Policy**: redact handles, usernames, message bodies. Reference Plan 20-Z-01's author-features allowlist (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d`). For any per-message sample, hash via `sha256Hex` per 20-Z-01's DAO. Examples MUST use synthetic or aggregated values only.

## 1. Model Details

- **Person or organization developing the model**: Cipher project (tjameswalsh@icloud.com). The Beta-smoothing patch landed in the post-Phase-19 30-line robustness fix; the WEIGHT_CAP construct is also Cipher-internal.
- **Model date**: post-Phase-19 patch (2026-05). Beta(α=5, β=5) prior and WEIGHT_CAP both shipped together in `src/lib/sentiment/aggregator.ts` lines 5-23 (algorithm comments verbatim in source).
- **Model version**: `v1.1.0-post-phase-19`. The `v1.0.0` was the pre-Beta arithmetic-mean variant; `v1.1.0` is the current Beta-smoothed implementation.
- **Model type**: ensemble — Beta-smoothed weighted-mean of {stocktwits-naive, swaggystocks, apewisdom} bullish-percentages.
- **Training algorithms, parameters, fairness constraints**: closed-form Bayesian smoother — no learned parameters. Parameters: Beta(α=5, β=5) prior (equivalent to 10 pseudo-mentions at 50%), per-source WEIGHT_CAP applied to `mention_count` before weighted mean. No explicit fairness constraints.
- **Paper or other resource**: in-file algorithm comments at `src/lib/sentiment/aggregator.ts` lines 5-23. Beta-smoothing background: see e.g. Gelman, *Bayesian Data Analysis* 3e §2.4 (Beta-binomial conjugacy).
- **Citation details**: N/A — internal implementation; no publication.
- **License**: project-internal (Cipher source tree).
- **Where to send questions or comments**: tjameswalsh@icloud.com.

## 2. Intended Use

- **Primary intended uses**: cross-source headline `bullish_pct` for the Sentiment Intelligence card in the Cipher research report. Feeds the `EngineCalibrationPanel` and `ResearchReport` UI components.
- **Primary intended users**: end-users of the Cipher research report.
- **Out-of-scope use cases**:
  - Per-message classification — wrong grain; use FinBERT (see `MODEL-CARD-finbert.md`) or Plan 20-B-01 Gemini per-doc instead.
  - Per-aspect decomposition (earnings vs guidance vs management vs macro) — the aggregator is whole-document only. Plan 20-B-05 will add per-aspect breakdown.
  - Tickers with <2 contributing sources where mention_count is zero on the other two — the Beta prior dominates and the score loses meaning. Downstream UI should treat low-cardinality aggregates as directional, not actionable.

## 3. Factors

- **Relevant factors**: number of contributing sources (1, 2, or 3); total cross-source message volume; per-source share-of-volume; cap-class (micro-caps need a lower WEIGHT_CAP than large-caps, currently uniform — see §11).
- **Evaluation factors**: aggregate IC vs forward 7-day alpha-vs-SPY tracked nightly via the Phase-19 cron, recorded separately from per-source IC so we can measure whether smoothing helps.

## 4. Metrics

- **Model performance measures**:
  - Output: aggregate `bullish_pct` ∈ [0, 100].
  - `source_count` ∈ {0, 1, 2, 3} — number of sources that contributed (non-null bullish_pct AND mention_count > 0).
  - `agreement_score` (forthcoming, Plan 20-A-05) — pairwise agreement across contributing sources.
- **Decision thresholds**: NONE at the aggregator layer. Threshold logic lives downstream in 20-A-01 (crowded-consensus) and 20-A-05 (cross-platform agreement).
- **Variation approaches**: Beta(α=5, β=5) prior strength = 10 pseudo-mentions at 50% bullish — provides closed-form shrinkage toward neutral on small samples. No explicit CI computed yet; Plan 20-Z-04 (forthcoming) will surface analytic Beta-posterior credible intervals.

## 5. Evaluation Data

- **Datasets**: same as `stocktwits-naive` — rolling 30-day production snapshots from Phase 12+ in `SentimentSnapshot`; rolling 90-day per-source IC in `LearnedPattern`. No labeled benchmark.
- **Motivation**: production-data IC is the only signal Cipher can observe end-to-end.
- **Preprocessing**: each contributing source's bullish_pct + mention_count is read directly from the per-source provider; no preprocessing.

## 6. Training Data

- **Datasets**: N/A — closed-form Bayesian smoother, no learned parameters.
- **Distribution / demographics**: composes three vendor classifiers; demographics inherited from each upstream — StockTwits (retail-bullish skew), swaggystocks (Discord retail), apewisdom (Reddit WSB-adjacent retail).

## 7. Quantitative Analyses

- **Unitary results**: aggregate IC tracked nightly via Phase-19 cron; tracked separately from per-source IC so we can isolate the smoothing contribution.
- **Intersectional results**: not yet shipped; Plan 20-C-06 fairness audit will produce the first cap-class × event-day crosstab on the aggregate output.

## 8. Ethical Considerations

- **Data sensitivity**: aggregate-only — non-PII (no handles, no message bodies persisted upstream of the aggregator).
- **Risks and harms**: the same retail-bullish skew as stocktwits-naive, partially mitigated by including swaggystocks + apewisdom which sample different (but overlapping) retail communities. The bias persists at smaller magnitude.
- **Use cases that raise concern**: presenting the aggregate as "the market's view" rather than "the retail-community view" — the Cipher UI labels this clearly as "Community Intelligence" / "Sentiment Intelligence" and not as analyst-tier signal.

## 9. Caveats and Recommendations

- **Known limitations**: WEIGHT_CAP and Beta prior strength are HAND-PICKED — the 30-line patch shipped with literature defaults, NOT calibrated values per CONTEXT §S1 (no hand-picked parameters).
- **Recommendations for future work**: Plan 20-A-01 (dispersion + crowded_consensus) and Plan 20-B-04 (data-driven source-tier weighting) will replace these constants with calibrated values. After 20-B-04 ships, `model_version` MUST bump to `v1.2.0` and `last_validated` MUST be re-set.

## 10. Out-of-Distribution (OOD) Behavior — *Cipher extension*

- **Known OOD inputs that degrade the score**: when only 1 source contributes (other 2 returned `mention_count: 0`), the score reduces to that source's bullish_pct shrunk toward 50% by the Beta prior — this is BY DESIGN, not a bug, but downstream readers should treat low-cardinality scores as directional, not actionable.
- **Detection mechanism**: `source_count` field on the `AggregatedSentiment` return type — UI can branch on `source_count < 2` to display a "low-cardinality" badge.

## 11. Known Failure Modes — *Cipher extension*

- **Failure mode 1**: Hand-picked constants per §9 — to be cured by Plan 20-A-01 calibration and Plan 20-B-04 source-tier weighting.
- **Failure mode 2**: WEIGHT_CAP applied uniformly across cap classes — micro-caps need a lower cap. Plan 20-A-02 will cure.
- **Failure mode 3**: treats the three sources as independent samples; in practice they overlap heavily (the same retail user posts on multiple). Overstates effective sample size. Cresci 2019 bot study suggests ~6% of accounts contribute most of the cross-platform overlap.
- **Failure mode 4**: Beta-smoothed mean ignores per-source historical reliability (a 100% bullish from swaggystocks weighs the same per-mention as a 100% bullish from stocktwits, despite different historical ICs). Plan 20-B-04 cures by introducing per-source-tier multipliers from rolling ICIR.

## 12. Retrain Cadence — *Cipher extension*

- **Cadence** (matches frontmatter `retrain_cadence`): P90D (90 days). Revisit Beta prior strength + WEIGHT_CAP after each Phase-20 Wave-A calibration cycle.
- **Trigger conditions**: any of 20-A-01 / 20-A-02 / 20-B-04 lands → mandatory model_version bump + last_validated reset. Otherwise: rolling 30-day aggregate IC drops by more than 0.05 absolute → manual review.
- **Owner**: Cipher project owner (tjameswalsh@icloud.com).
