---
model_name: finbert-prosus
model_version: finbert-prosus-4556d130-v1
card_format: mitchell-2019
last_validated: 2026-05-13
retrain_cadence: P90D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/finsentllm.ts
  - src/lib/sentiment/per-message-pass.ts
  - src/lib/sentiment/local-finbert-fallback.ts
  - scripts/check-finbert-sha.ts
---

# MODEL CARD — finbert-prosus (Plan 20-B-02)

**Format**: Mitchell-2019 model card.
**Status**: shadow (per `PER_MESSAGE_PASS_MODE=shadow`); cutover gated by 24h shadow-window verdict (p95 ≤ 2s, kappa ≥ 0.7 vs Gemini per-doc, error rate ≤ 5%, per-ticker per-day cost ≤ $0.10).

## 1. Model Details

- **Person or organization developing the model**: Araci 2019; ProsusAI fine-tune of `bert-base-uncased` on the Financial PhraseBank (Malo et al. 2014). Cipher operates the model as an HF Inference Endpoint client (`src/lib/sentiment/finsentllm.ts`) plus a lazy-loaded `@xenova/transformers` local CPU fallback (`src/lib/sentiment/local-finbert-fallback.ts`).
- **Model date**: original FinBERT 2019; ProsusAI commit pinned via `HF_FINBERT_ENDPOINT` URL convention. Current pinned SHA: `4556d13015211d73dccd3fdd39d39232506f3e43` (verified 2026-05-13 from `https://huggingface.co/api/models/ProsusAI/finbert`). First 8 hex chars exported as `FINBERT_PINNED_SHA8 = '4556d130'`.
- **Model version**: `ProsusAI/finbert@4556d130...`. `SentimentObservation.classifier_version` is persisted as `finbert-prosus-4556d130`; `model_version` as `finbert-prosus-4556d130-v1`. Re-pin → bump constant + suffix to `-v2` (20-Z-01 composite unique forbids overwrites — historical rows partition cleanly).
- **Model type**: transformer fine-tune. BERT-base-uncased (110M params) fine-tuned on financial sentiment. 3-class output: `{positive, negative, neutral}`.
- **Training algorithms, parameters, fairness constraints**: standard supervised fine-tune over Financial PhraseBank's 4,840 labeled sentences (75/25 split per Araci 2019 §3). No explicit fairness constraints.
- **Paper or other resource**: Araci 2019, *FinBERT: Financial Sentiment Analysis with Pre-trained Language Models*, https://arxiv.org/abs/1908.10063 . Malo et al. 2014, *Good Debt or Bad Debt: Detecting Semantic Orientations in Economic Texts*.
- **Citation**: Araci, D. (2019). FinBERT: Financial Sentiment Analysis with Pre-trained Language Models. arXiv:1908.10063.
- **License**: Apache-2.0 (ProsusAI/finbert on HuggingFace).
- **Where to send questions or comments**: Cipher project owner tjameswalsh@icloud.com; ProsusAI on HuggingFace for upstream model concerns.

## 2. Intended Use

- **Primary intended uses**: per-StockTwits-message bullish/bearish classification when StockTwits message volume on a ticker exceeds 50 (the threshold above which 20-B-01 Gemini per-document classification becomes cost-prohibitive — see CONTEXT.md line 114). Each successful classification persists as a `SentimentObservation` row (20-Z-01) tagged `classifier_version='finbert-prosus-4556d130'`. Consumers (20-A-03 time decay, 20-B-04 source-tier weighting, 20-C-01 per-source ICIR) read these rows once `PER_MESSAGE_PASS_MODE='on'`.
- **Primary intended users**: the Cipher cron pipeline (`/api/cron/sentiment-scan`) and downstream consumer plans; the dashboard `/insights/sentiment-health` surfaces `finbert-hf` provider telemetry.
- **Out-of-scope use cases**:
  - **SEC 10-K / 10-Q filings** — Loughran-McDonald 2011 finds that generic financial-sentiment lexicons (and fine-tunes built on news-genre data) mislabel ~75% of "negative" words in 10-K context (e.g., "depreciation", "tax", "loss"). Plan 20-B-06 ships a Loughran-McDonald lexicon as the SEC-filings fallback.
  - **Non-English text** — training corpus is English-only.
  - **Tickers <$50M market cap** — Financial PhraseBank skews large-cap; small-cap headlines are out-of-distribution.
  - **Long-form articles** — FinBERT truncates at 512 tokens, dropping back-half content. Plan 20-B-01 (Gemini per-doc) covers full-text long-form.

## 3. Factors

- **Relevant factors**: text length (512-token cap); domain (news vs StockTwits vs Reddit vs SEC); language (English-only); pump-and-dump slang ("to the moon" — flagged bullish but is itself a manipulation signal; 20-C-04 catches separately).
- **Evaluation factors**: per-source IC and ECE pending Plan 20-B-03 (temperature scaling) and Plan 20-C-01 (per-source ICIR). Locally-measured ECE will be calibrated post-shadow.

## 4. Metrics

- **Model performance measures**:
  - Original (Araci 2019): ~97% accuracy on Financial PhraseBank held-out test set.
  - Cipher-side ECE: pending Plan 20-B-03 (temperature scaling). Ship-gate ECE < 0.05 per CONTEXT §S8.
- **Decision thresholds**: argmax over the 3-class probability distribution `{positive, negative, neutral}`. Polarity score = `pos − neg` after prefix matching (`pos*` / `neg*`) — neutral does not contribute. No tunable threshold at the FinBERT layer.
- **Variation approaches**: 3-tier fallback chain (HF endpoint → `@xenova/transformers` local CPU → null sentinel) defends against vendor outages. Cohen's kappa vs 20-B-01 Gemini per-doc on the overlap set is the cutover sign-off metric.

## 5. Evaluation Data

- **Datasets**: Financial PhraseBank (Malo et al. 2014) — ~5k labeled financial sentences with 50%+ annotator agreement. License: CC BY-NC-SA 3.0.
- **Motivation**: standard financial-sentiment benchmark; the same dataset Araci 2019 used for held-out evaluation. Reused at 20-B-03 calibration time.
- **Preprocessing**: standard BERT tokenization (WordPiece, lower-case, 512-token max).

## 6. Training Data

- **Datasets**: ProsusAI fine-tune corpus — Financial PhraseBank + Reuters TRC2 financial subset; see Araci 2019 §3.1.
- **Distribution / demographics**: English-language financial news. Skews large-cap, US/EU-listed, post-2007 (TRC2 cutoff). Under-represents non-English markets, micro-caps, and SEC-style legalese.

## 7. Quantitative Analyses

- **Unitary results**: per-source IC pending Plan 20-C-01; ECE pending Plan 20-B-03.
- **Intersectional results**: not yet shipped; Plan 20-C-06 fairness audit will produce the first cap-class × news-source crosstab on the FinBERT output.

## 8. Ethical Considerations

- **Data sensitivity**: training corpus is English-language financial news; under-represents non-English markets and micro-caps. Inferences on these subpopulations should not be presented to end users without a coverage caveat.
- **Risks and harms**: sentence-level classification averages out opposite signals within a paragraph; mitigated by per-aspect decomposition in Plan 20-B-05.
- **Use cases that raise concern**: standalone "FinBERT says positive → buy" recommendations without ensemble or calibration context. Cipher only surfaces FinBERT scores through aggregated downstream consumers (20-A-03 / 20-B-04), not raw to end users.

## 9. Caveats and Recommendations

- **Known limitations**:
  - HF Inference Endpoint cold-start latency can be ~10s on the first request after idle (scale-to-zero). Wired through `withTelemetry('finbert-hf', ...)` (Plan 20-Z-03) to surface p95 to `/insights/sentiment-health`.
  - Fallback chain per CONTEXT §20-B-02: HF endpoint → local CPU `@xenova/transformers` → null sentinel. Each tier persists `SentimentObservation` rows; tertiary persists with `classifier_score=null` (`-null` suffix on classifier_version) so the failure is visible in the PIT log.
- **Recommendations for future work**: 20-B-03 temperature scaling on the FinBERT logits; 20-B-05 per-aspect decomposition; 20-C-06 fairness audit on cap-class strata.

## 10. Out-of-Distribution (OOD) Behavior — *Cipher extension*

- **Known OOD inputs that degrade the score**:
  - SEC 10-K / 10-Q filings — Loughran-McDonald 2011 negation patterns ("no significant decline", "we do not anticipate") flip the score relative to a financial-domain reader's intuition.
  - General-domain text (sports, politics) — FinBERT trained on financial news only; non-finance text yields meaningless polarity.
  - Ticker mentions without context ("just bought $TSLA pizza") — surface-level ticker match without sentiment context.
- **Detection mechanism**: Plan 20-B-06 lexicon fallback is the documented recourse for SEC filings (route to Loughran-McDonald instead of FinBERT). For low-confidence FinBERT outputs, the null-sentinel fallback (`confidence < 0.4` threshold) tags as `-null` so downstream consumers can filter.

## 11. Known Failure Modes — *Cipher extension*

- **Failure mode 1**: 512-token truncation drops the back half of long news articles. Plan 20-B-01 Gemini per-doc covers full-text without truncation.
- **Failure mode 2**: Sentence-level averaging masks aspect-conflicts (a paragraph that's "earnings good, guidance bad" averages to neutral, dropping signal). Plan 20-B-05 per-aspect decomposition cures.
- **Failure mode 3**: Vendor SHA bump silently changes scoring distribution. SHA pin is the primary defense; `scripts/check-finbert-sha.ts` is the monthly drift detector (Plan 20-B-02 T-20-B-02-05 mitigation).
- **Failure mode 4**: Sarcasm / irony (StockTwits is rife with both). No mitigation; flagged for 20-C-04 manipulation detection.
- **Failure mode 5**: Pump-language ("to the moon", "rocket emojis") gets flagged bullish but is a manipulation signal. Plan 20-C-04 catches separately via coordinated-posting detection.

## 12. Retrain Cadence — *Cipher extension*

- **Cadence** (matches frontmatter `retrain_cadence`): P90D (90 days). HF endpoint SHA pin = "we don't retrain"; the cadence governs SHA RE-VALIDATION. Operator runs `npm run check-finbert-sha` quarterly to confirm pinned SHA has not been bumped by ProsusAI without our knowledge.
- **Trigger conditions**: ECE > 0.05 per Plan 20-B-03 monitor → forced refresh + re-pin to current SHA; OR ProsusAI publishes a new tagged release → manual review + re-pin decision (bump `FINBERT_PINNED_SHA8` AND `model_version` suffix `-v1` → `-v2`).
- **Owner**: Cipher project owner (tjameswalsh@icloud.com).

## 13. Calibration — *Plan 20-B-03* (Temperature scaling)

- **Procedure**: single-scalar temperature T fit on merged FPB held-out + production-labeled (20-Z-05) validation set via bounded golden-section search minimising NLL (Guo et al. 2017 §3.1; scipy.optimize.minimize_scalar(method='bounded') analog). Bounds T ∈ [0.1, 10.0] from `CALIBRATION_BOUNDS`. Bin count 10. 5-fold CV for `cv_ece_mean ± cv_ece_std`.
- **Where T comes from at runtime**: latest `TemperatureCalibration` row keyed by `classifier_version='finbert-prosus-<sha>'`, 5-min in-process cache via `src/lib/sentiment/temperature-runtime.ts#loadTemperatureFor`.
- **Gating**: `SENTIMENT_TEMP_SCALING_MODE` (`off`/`shadow`/`on`); ships at `shadow` by default. Cutover to `on` requires `cv_ece_mean_post < 0.05` AND `brier_post < 0.24` (CONTEXT.md line 115 verbatim).
- **Auto-refit-on-version-change** (T-20-B-03-04): cron `/api/cron/calibrate-temperature` (`0 7 2 * *`) inserts a NEW append-only row whenever the pinned SHA changes — historical T is preserved.
- **Initial state**: T=1.0 (identity) until first calibration run lands a row. See `HYPERPARAMETERS.md §Temperature Scaling` for the latest persisted T.
- **Reference**: Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017). "On Calibration of Modern Neural Networks." ICML 2017. https://arxiv.org/abs/1706.04599
