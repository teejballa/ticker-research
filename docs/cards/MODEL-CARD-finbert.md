---
model_name: finbert
model_version: ProsusAI/finbert@pinned-by-ops-at-deploy
card_format: mitchell-2019
last_validated: 2026-05-10
retrain_cadence: P90D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/finsentllm.ts
  - src/lib/sentiment/ensemble.ts
---

# Model Card: finbert

> **Schema**: Mitchell et al. 2019 — *Model Cards for Model Reporting*, FAT* '19. https://arxiv.org/abs/1810.03993
> **PII Policy**: redact handles, usernames, message bodies. Reference Plan 20-Z-01's author-features allowlist (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d`). For any per-message sample, hash via `sha256Hex` per 20-Z-01's DAO. Examples MUST use synthetic or aggregated values only.

## 1. Model Details

- **Person or organization developing the model**: Araci 2019; ProsusAI fine-tune of `bert-base-uncased` on Financial PhraseBank (Malo et al. 2014). Cipher operates the model as an HF Inference Endpoint client (see `src/lib/sentiment/finsentllm.ts`).
- **Model date**: original FinBERT 2019; ProsusAI fine-tune commit pinned via `HF_FINBERT_ENDPOINT` URL convention per `src/lib/sentiment/finsentllm.ts` lines 11-22 (`HF_FINBERT_ENDPOINT=https://<id>.aws.endpoints.huggingface.cloud/finbert@<commit-sha>`).
- **Model version**: `ProsusAI/finbert@pinned-by-ops-at-deploy`. The exact commit SHA is pinned in the production HF endpoint URL per CONTEXT §S5 (pinned model + prompt versions). **OPS-HANDOFF**: replace `pinned-by-ops-at-deploy` in this card's frontmatter and §1 with the actual ProsusAI/finbert commit SHA after the first 20-B-02 deploy lands the live HF endpoint.
- **Model type**: transformer fine-tune. BERT-base-uncased (110M params) fine-tuned on financial sentiment. 3-class output: `{positive, negative, neutral}`.
- **Training algorithms, parameters, fairness constraints**: standard supervised fine-tune over Financial PhraseBank's 4,840 labeled sentences (75%-train / 25%-test split per Araci 2019 §3). No explicit fairness constraints.
- **Paper or other resource**: Araci 2019, *FinBERT: Financial Sentiment Analysis with Pre-trained Language Models*, https://arxiv.org/abs/1908.10063 .
- **Citation details**: Araci, D. (2019). FinBERT: Financial Sentiment Analysis with Pre-trained Language Models. arXiv:1908.10063.
- **License**: Apache-2.0 (ProsusAI/finbert on HuggingFace).
- **Where to send questions or comments**: Cipher project owner tjameswalsh@icloud.com; ProsusAI on HuggingFace for upstream model concerns.

## 2. Intended Use

- **Primary intended uses**: per-message sentiment classification at scale, applied when message volume on a ticker exceeds the cost-prohibitive threshold for Gemini per-doc (~50+ documents per cron tick — per CONTEXT §"Cost / latency profile"). Cipher composes the FinBERT score into the FinSentLLM ensemble (`src/lib/sentiment/ensemble.ts`) alongside FinGPT v3 and Mistral-Fin-7B.
- **Primary intended users**: the FinSentLLM ensemble meta-classifier; downstream consumers receive only the ensemble score, never raw FinBERT output.
- **Out-of-scope use cases**:
  - **10-K / 10-Q SEC filings** — Loughran-McDonald 2011 finds that generic financial-sentiment lexicons (and by extension fine-tunes built on news-genre data) mislabel ~75% of "negative" words in 10-K context (e.g., "depreciation", "tax", "loss"). Plan 20-B-06 will introduce Loughran-McDonald lexicon as the SEC-filings fallback.
  - **Non-English text** — training corpus is English-only.
  - **Tickers <$50M market cap** — Financial PhraseBank skews large-cap; small-cap headlines are out-of-distribution.
  - **Whole-document sentiment on long-form articles** — FinBERT truncates at 512 tokens, dropping back-half content. Plan 20-B-01 (Gemini per-doc) covers full-text long-form.

## 3. Factors

- **Relevant factors**:
  - Text length (FinBERT truncates at 512 tokens).
  - Domain (news vs StockTwits vs SEC filings vs Reddit comments).
  - Language (English-only; non-English will produce nonsense scores).
  - Aspect-conflict density (paragraphs with mixed-sign aspects average to neutral — see §11).
- **Evaluation factors**: per-source IC pending Plan 20-C-01; ECE pending Plan 20-B-03 temperature-scaling cron.

## 4. Metrics

- **Model performance measures**:
  - Original (Araci 2019): ~97% accuracy on Financial PhraseBank held-out test set.
  - Cipher-side ECE measured by Plan 20-B-03 (forthcoming) — ship-gate ECE < 0.05 per CONTEXT §S8 numerical acceptance.
- **Decision thresholds**: argmax over the 3-class probability distribution `{positive, negative, neutral}`. No tunable threshold at the FinBERT layer; downstream ensemble (`src/lib/sentiment/ensemble.ts`) computes a weighted-average score across FinGPT/Mistral-Fin/FinBERT.
- **Variation approaches**: ensemble averaging across 3 FinSentLLM clients (the variation reduction lives at the ensemble layer per `MODEL-CARD-finbert.md` §1; an ensemble-specific card will land in 20-B-01 once the per-doc Gemini classifier replaces ensemble.ts's primary route).

## 5. Evaluation Data

- **Datasets**: Financial PhraseBank (Malo et al. 2014) — ~5k labeled financial sentences with 50%+ annotator agreement. License: CC BY-NC-SA 3.0.
- **Motivation**: standard financial-sentiment benchmark; the same dataset Araci 2019 used for held-out evaluation.
- **Preprocessing**: standard BERT tokenization (WordPiece, lower-case, 512-token max).

## 6. Training Data

- **Datasets**: ProsusAI fine-tune corpus — Financial PhraseBank + Reuters TRC2 financial subset; see Araci 2019 §3.1.
- **Distribution / demographics**: English-language financial news. Skews large-cap, US/EU-listed, post-2007 (TRC2 cutoff). Under-represents non-English markets, micro-caps, and SEC-style legalese.

## 7. Quantitative Analyses

- **Unitary results**: per-source IC pending Plan 20-C-01; ECE pending Plan 20-B-03.
- **Intersectional results**: not yet shipped; Plan 20-C-06 fairness audit will produce the first cap-class × news-source crosstab on the FinBERT output.

## 8. Ethical Considerations

- **Data sensitivity**: training corpus is English-language financial news; under-represents non-English markets and micro-caps. Inferences on these subpopulations should not be presented to end users without a coverage caveat.
- **Risks and harms**: sentence-level classification AVERAGES OUT opposite signals within a paragraph (the "TABFSA" finding from RavenPack) — Plan 20-B-05 per-aspect decomposition mitigates by classifying per aspect-tag instead of whole-document.
- **Use cases that raise concern**: standalone "FinBERT says positive → buy" recommendations without the ensemble. Cipher never surfaces raw FinBERT output to the user — only the FinSentLLM ensemble score, gated by Plan 20-B-03 calibration.

## 9. Caveats and Recommendations

- **Known limitations**:
  - HF Inference Endpoint cold-start latency can be ~10s on the first request after idle (scale-to-zero). Wired through `withTelemetry` (Plan 20-Z-03 forthcoming) to surface p99 to `/insights`.
  - Fallback chain per CONTEXT §20-B-02: HF endpoint → local CPU `@xenova/transformers` → null sentinel.
- **Recommendations for future work**: Plan 20-B-03 will add temperature-scaling on the FinBERT logits (post-hoc calibration). Plan 20-B-05 will decompose paragraphs by aspect tag before classification.

## 10. Out-of-Distribution (OOD) Behavior — *Cipher extension*

- **Known OOD inputs that degrade the score**: SEC 10-K / 10-Q filings — Loughran-McDonald 2011 negation patterns ("no significant decline", "we do not anticipate") flip the score relative to a financial-domain reader's intuition.
- **Detection mechanism**: Plan 20-B-06 lexicon fallback is the documented recourse — when the input source is `sec_filing`, route to Loughran-McDonald lexicon instead of FinBERT.

## 11. Known Failure Modes — *Cipher extension*

- **Failure mode 1**: 512-token truncation drops the back half of long news articles. Plan 20-B-01 Gemini per-doc covers full-text without truncation.
- **Failure mode 2**: Sentence-level averaging masks aspect-conflicts (a paragraph that's "earnings good, guidance bad" averages to neutral, dropping signal). Plan 20-B-05 per-aspect decomposition cures.
- **Failure mode 3**: Vendor SHA bump silently changes scoring distribution. S5 SHA pin is the primary defense; §12 quarterly re-validation is the backstop.

## 12. Retrain Cadence — *Cipher extension*

- **Cadence** (matches frontmatter `retrain_cadence`): P90D (90 days). HF endpoint SHA pin = "we don't retrain"; the cadence governs SHA RE-VALIDATION. Operator runs `curl -s $HF_FINBERT_ENDPOINT/info` quarterly to confirm pinned SHA has not been bumped without our knowledge.
- **Trigger conditions**: ECE > 0.05 per Plan 20-B-03 monitor → forced refresh + re-pin to current SHA; OR ProsusAI publishes a new tagged release → manual review + re-pin decision.
- **Owner**: Cipher project owner (tjameswalsh@icloud.com).

<!-- FAIRNESS-AUDIT-START audit_id=782ed807-f789-47cc-b9d6-6801cde1d60a audit_date=2026-05-11 classifier_version=finbert-prosus -->
## Fairness Audit — Known Limitations

Audit window: rolling 90 days ending 2026-05-11. n=100.

Flagged limitations (Brier > 0.27 OR ECE > 0.10):
- cap_class=micro: Brier=0.330, ECE=0.300, n=100 (audit 782ed807-f789-47cc-b9d6-6801cde1d60a 2026-05-11)

See [reports/fairness-audit-2026-05-11.md](../../reports/fairness-audit-2026-05-11.md) for the full segment table.
<!-- FAIRNESS-AUDIT-END -->
