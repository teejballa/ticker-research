---
model_name: stocktwits-naive
model_version: v1.0.0
card_format: mitchell-2019
last_validated: 2026-05-10
retrain_cadence: P180D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/aggregator.ts
---

# Model Card: stocktwits-naive

> **Schema**: Mitchell et al. 2019 — *Model Cards for Model Reporting*, FAT* '19. https://arxiv.org/abs/1810.03993
> **PII Policy**: redact handles, usernames, message bodies. Reference Plan 20-Z-01's author-features allowlist (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d`). For any per-message sample, hash via `sha256Hex` per 20-Z-01's DAO. Examples MUST use synthetic or aggregated values only.

## 1. Model Details

- **Person or organization developing the model**: StockTwits, Inc. (third-party vendor). Cipher consumes the vendor's `bullish` / `bearish` message-level tags as aggregate counts only; we never persist or display raw message text.
- **Model date**: vendor classifier has been stable in production since Cipher Phase 12 (2026-04). No algorithmic changes on Cipher's side — this is a pure pass-through of upstream tag counts into `aggregateCommunitySentiment`.
- **Model version**: `v1.0.0` (Cipher-side version pin; not the vendor's internal version, which is opaque).
- **Model type**: vendor classifier, unknown architecture. Most likely a fine-tuned distilled transformer or lexicon hybrid based on the public-facing description of StockTwits' "sentiment" tag, but the vendor does not publish details.
- **Training algorithms, parameters, fairness constraints**: opaque — vendor-owned. Cipher has zero visibility into training data, loss function, or fairness constraints.
- **Paper or other resource**: StockTwits API docs https://api.stocktwits.com/developers/docs/api/messages/streams/symbol — describes the public `entities.sentiment.basic` field that surfaces the bullish/bearish tag.
- **Citation details**: StockTwits API (2026). StockTwits Developer Docs. https://api.stocktwits.com/developers/docs
- **License**: StockTwits Terms of Service. Bulk redistribution of raw content prohibited — Cipher mitigates by storing only hashes (per 20-Z-01 T-20-Z-01-02) and aggregate counts.
- **Where to send questions or comments**: Cipher project owner tjameswalsh@icloud.com (Cipher-side concerns); StockTwits support (vendor-side classifier concerns).

## 2. Intended Use

- **Primary intended uses**: rolling community-sentiment proxy on liquid US large-cap tickers. Feeds the `'stocktwits'` branch of `aggregateCommunitySentiment` (see `src/lib/sentiment/aggregator.ts`) as one of three contributing sources to the headline `bullish_pct`.
- **Primary intended users**: Cipher's Sentiment Intelligence report section. NOT a standalone signal for end users — always presented inside the multi-source ensemble.
- **Out-of-scope use cases**:
  - Micro-cap tickers with <50 daily StockTwits messages — Cresci 2019 bot-share findings show retail-driven low-volume tickers are signal-swamped by automated accounts.
  - Illiquid OTC tickers — coverage is sparse and noise-dominated.
  - Non-US tickers — StockTwits user base is overwhelmingly US-retail.
  - Thinly-traded ETFs — vendor sample is too small to be informative.
  - Per-message sentiment classification — Cipher consumes tag COUNTS only; per-message classification belongs to FinBERT or Gemini per-doc (see `MODEL-CARD-finbert.md` and the forthcoming `MODEL-CARD-gemini-per-doc.md` from Plan 20-B-01).

## 3. Factors

- **Relevant factors**:
  - Market-cap class (large-cap vs micro-cap performance differs dramatically per Cresci 2019).
  - Event-day vs non-event-day (earnings days spike both message volume and bullish-bias).
  - Retail-meme-spike days (GME-class regime — `bullish_pct ≥ 95%` is the classic echo-chamber failure mode).
  - Trading hours (overnight messages skew toward retail-pump posts; during-market messages skew toward reaction).
- **Evaluation factors**: rolling per-source Information Coefficient vs forward 7-day alpha-vs-SPY is tracked nightly in `LearnedPattern.rolling_ic_90d` for the `diffusion` signal class. No formal subgroup eval has been run; Phase-20 Wave-C plans (20-C-01) will add per-source rolling ICIR.

## 4. Metrics

- **Model performance measures**:
  - Output: `bullish_pct = bullish_count / (bullish_count + bearish_count)` ∈ [0, 100].
  - Forward 7-day alpha-vs-SPY rolling IC over the prior 90 days — tracked in `LearnedPattern.rolling_ic_90d` (`diffusion` signal class).
- **Decision thresholds**: NONE — the raw `bullish_pct` is descriptive, never actionable on its own. Downstream Wave-A consumers (20-A-01 dispersion / `crowded_consensus` flag, 20-A-05 cross-platform agreement score) gate before any user-facing recommendation references this score.
- **Variation approaches**: Beta(α=5, β=5) prior applied at the AGGREGATOR layer (see `MODEL-CARD-reputation-weighted.md` §4), shrinking small samples toward 50%. No bootstrap or CI is computed on the raw stocktwits-naive score itself — confidence accrues from the ensemble.

## 5. Evaluation Data

- **Datasets**: rolling 30-day production snapshots from Phase 12+ in the `SentimentSnapshot` table; rolling 90-day per-source IC in `LearnedPattern`. There is NO labeled benchmark — vendor tags are unaudited ground-truth substitutes.
- **Motivation**: production data is the only sample where Cipher can observe how StockTwits tags correlate with Cipher's downstream alpha definition (forward 7d alpha vs SPY).
- **Preprocessing**: raw message bodies discarded at ingest (T-20-Z-01-02); only bullish/bearish counts and aggregate `bullish_pct` persist in `SentimentSnapshot`.

## 6. Training Data

- **Datasets**: N/A — vendor classifier. Cipher has zero visibility into the StockTwits training corpus.
- **Distribution / demographics**: opaque. Publicly StockTwits' user base skews US-retail and bullish-biased (Cookson & Engelberg, "Echo Chambers" 2023).

## 7. Quantitative Analyses

- **Unitary results**: per-source IC vs forward 7-day alpha-vs-SPY tracked nightly via Phase-19 cron; current rolling-90d IC sits in `LearnedPattern.rolling_ic_90d` for the `diffusion` signal class. No subgroup breakdown shipped yet — pending Plan 20-C-01.
- **Intersectional results**: not yet shipped; Plan 20-C-06 fairness audit will produce the first cap-class × event-day × signal-class crosstab.

## 8. Ethical Considerations

- **Data sensitivity**: vendor tag counts are aggregate, non-PII. The underlying messages are public posts on a platform with public-by-default ToS.
- **Risks and harms**: StockTwits' user base skews retail and bullish-biased (Cookson & Engelberg, "Echo Chambers in Investor Information" 2023). Using this score alone for any tactical recommendation publishes that bias directly to the user.
- **Use cases that raise concern**: standalone tactical "buy" recommendations driven by stocktwits-naive output without the ensemble's Beta smoothing or the Wave-A dispersion check.

## 9. Caveats and Recommendations

- **Known limitations**: vendor-tag flow is the WORST classifier in the Phase-20 portfolio. Kept as a fallback and as a baseline for the calibrated Wave-B replacements.
- **Recommendations for future work**: deprecate as a PRIMARY signal once 20-B-01 (Gemini per-doc) ships in `on` mode. Keep stocktwits-naive in the ensemble as one of N sources (for diversification) rather than as the headline.

## 10. Out-of-Distribution (OOD) Behavior — *Cipher extension*

- **Known OOD inputs that degrade the score**: meme-stock spikes (GME, AMC) consistently produce `bullish_pct ≥ 95%` — the ECHO-CHAMBER regime that triggered all of Phase 20. Earnings-day spikes produce similar but smaller bullish-skew artifacts.
- **Detection mechanism if any**: Plan 20-A-01 (forthcoming) will add a `crowded_consensus` flag that reads aggregator output and inverts the signal sign per the Cookson-Engelberg base rate when consensus exceeds the empirically-fit threshold.

## 11. Known Failure Modes — *Cipher extension*

- **Failure mode 1**: GME-style 100% bullish spikes — single-source crowding rendered as a thesis. Mitigated at the ensemble layer by Beta smoothing (see `MODEL-CARD-reputation-weighted.md` §1) and by 20-A-01 forthcoming sign-inversion gate.
- **Failure mode 2**: Rate-limit gaps — StockTwits 429s drop snapshots silently. Mitigated by `withRetry` from Plan 19-B-02 (existing infrastructure).
- **Failure mode 3**: Vendor tag-semantics drift — StockTwits has historically re-tuned their bullish/bearish heuristic without public notice. Cipher has no in-band detector for this and accepts the risk per the Phase-20 Wave-B replacement plan. §12 quarterly re-validation is the only defense.

## 12. Retrain Cadence — *Cipher extension*

- **Cadence** (matches frontmatter `retrain_cadence`): P180D (180 days). No retraining — vendor flow. Cadence governs RE-VALIDATION: spot-check 50 random recent messages quarterly to confirm vendor tag direction still matches a manual reader's judgment.
- **Trigger conditions**: vendor publishes a tag-semantics change note; OR rolling 30-day IC drops by more than 0.05 absolute; OR Cresci-2019 bot-share metric (not yet shipped) flags >15% on a watchlist ticker.
- **Owner**: Cipher project owner (tjameswalsh@icloud.com).
