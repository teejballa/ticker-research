---
model_name: gemini-per-doc-sentiment
model_version: v1
card_format: mitchell-2019
last_validated: 2026-05-13
retrain_cadence: P90D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/per-doc-classifier.ts
  - src/lib/sentiment/aspects.ts
  - src/lib/sentiment/select-top-docs.ts
  - src/lib/prompts/_v1/gemini-per-doc-sentiment.md
  - scripts/eval-fpb-per-doc.ts
---

# Model Card: Gemini Per-Document Sentiment Classifier (gemini-per-doc-v1)

**Template:** Mitchell et al. (2019) "Model cards for model reporting." FAT* 2019.
**20-Z-02 conformance:** this card follows the 20-Z-02 template (intended use, training data, evaluation, failure modes, ethical considerations, retrain cadence, cost).

## Model Details

- **Model**: `google/gemini-3.1-flash-lite` routed via Vercel AI Gateway (OIDC auth — no provider key shipped to the runtime).
- **Prompt pin**: `gemini-per-doc-sentiment@v1`, registered in the 20-Z-04 prompt registry (`src/lib/prompts/_v1/gemini-per-doc-sentiment.md`).
- **Classifier pin**: `classifier_version='gemini-per-doc-v1'` + `model_version='gemini-per-doc-v1'` on every persisted `SentimentObservation` row.
- **Implementation**: `src/lib/sentiment/per-doc-classifier.ts` — `classifyDocumentsBatch(docs, opts?)`.
- **Plan**: 20-B-01 (Phase 20: real sentiment analysis).
- **Date created**: 2026-05-11
- **Owner**: Cipher sentiment-layer
- **License of host code**: project-internal.

## Intended Use

Per-document polarity + aspect classification for news + community items, top-N capped at 30 docs/ticker per cron tick.

**Output (per doc):**
```json
{ "doc_id": "string", "polarity": -1..+1, "confidence": 0..1, "aspects": ["earnings"|"guidance"|"regulatory"|"M&A"|"macro"|"product"|"management"] }
```

**Consumed by:** the downstream 20-B-05 per-aspect chip stack (Cohen's κ ≥ 0.6 ship gate on 50-doc human-aspect set OWNED by 20-B-05), and the Diffusion Learning Engine via `SentimentObservation` rows.

**Inappropriate for:**
- Single-ticker pure-quantitative trading signals (this is a qualitative aspect-decomposed classifier, not a price-target predictor).
- Adversarial / pump-and-dump filtering (out of scope; see 20-C-03 bot filter + 20-A-04 author concentration).
- Non-English text (out of distribution).

## Training Data

**N/A — zero-shot prompted classifier.** No fine-tuning. The rubric + ≥5 anchored examples + OFF-TOPIC CLAUSE are baked into prompt v1 and pinned via the 20-Z-04 registry. Any rubric change requires a `_v2/` directory and a new `model_version` partition (S2 immutability).

## Evaluation

| Metric | Threshold | Source | Owner |
|---|---|---|---|
| Expected Calibration Error (ECE) | ≤ 0.15 (10-bin binned per Guo 2017) | Financial PhraseBank held-out subset (Malo et al. 2014; Apache-2) | 20-B-01 — `scripts/eval-fpb-per-doc.ts` |
| Cohen's κ (aspect agreement) | ≥ 0.6 | 50-doc human-labeled aspect set | **OWNED by 20-B-05** — this card ships the predictions; 20-B-05 ships the κ harness |
| 10-doc fixture integration | All 10 classified; ranges valid; all 7 aspects covered ≥1×; off-topic guard validates | `tests/fixtures/per-doc-classification/ten-doc-fixture.json` | 20-B-01 |
| Cost per 30-doc batch | ≤ $0.05 USD | 20-Z-03 `ProviderCallLog` rollup | 20-Z-03 telemetry |

**ECE measurement (deferred until first live-Neon run):** the harness `npx tsx scripts/eval-fpb-per-doc.ts` produces a `/tmp/fpb-ece-{date}.json` with the measured ECE on the 111-row held-out subset. **If ECE > 0.15 on the raw Gemini classifier, cutover from `'shadow'` → `'on'` is DEFERRED until 20-B-03 (temperature scaling) lands. The flag stays in `'shadow'`. This deferred-cutover branch is a PASS for THIS plan.**

## Known Failure Modes

| Failure | Threat ID | Mitigation |
|---|---|---|
| Aspect hallucination (out-of-enum aspect) | T-20-B-01-01 | Zod `z.enum(ASPECT_TAGS)` rejection + one retry + `aspects:[]` fallback (never fabricates) |
| Off-topic polarity hallucination | T-20-B-01-03 | OFF-TOPIC CLAUSE in rubric + integration-test assertion: weather doc returns polarity=0 confidence=0 |
| Cost runaway | T-20-B-01-02 | `selectTopDocs` hard cap = 30 docs/ticker + single batched call (NOT one-per-doc) + 20-Z-03 1.5× rolling baseline alerter |
| ECE > 0.15 ship gate unmet | T-20-B-01-04 | Documented deferral to 20-B-03 (temperature scaling) — flag stays in `'shadow'` |
| Prompt drift (silent rubric edit) | T-20-B-01-05 | 20-Z-04 golden snapshot test + `npm run check-prompts` CI gate + `renderPrompt` PromptVarMissingError defense-in-depth |

**Out-of-distribution behavior:**
- Non-English docs — undocumented; future plan may extend the rubric or route to a multilingual model.
- Code snippets / OCR-derived text — treated as off-topic by default per the OFF-TOPIC CLAUSE.
- Multi-ticker docs (e.g., ETF holdings) — classifier emits the dominant signal; per-ticker decomposition deferred.
- Sarcasm / negation — Gemini handles "not bullish" reasonably; periodic spot-check recommended.

## Ethical Considerations

- Persisted `SentimentObservation` rows contain `raw_body_hash` only (per 20-Z-01 T-20-Z-01-02 — raw text never persisted). No PII.
- `author_features_snapshot` is allow-list-gated per 20-Z-01 (account_age_days, follower_count, is_verified, message_count_30d).
- Internal research feature — never surfaces text outside the auth-gated `/research/[ticker]` UI per S10.

## Retrain / Re-evaluation Cadence

- **Prompt review:** quarterly. Any body edit triggers a `_v2/` directory + golden snapshot diff + new `model_version` partition.
- **ECE re-fit:** monthly via 20-B-03 temperature scaling cron (planned, not yet shipped).
- **Aspect κ re-eval:** per 20-B-05 monthly cron `/api/cron/aspect-kappa-monitor` (planned, owned by 20-B-05).
- **Cost re-check:** weekly via 20-Z-03 `ProviderCallLog` rollup; budget alerter fires at 1.5× rolling 7d baseline.

## Cost

- **Per 30-doc batch:** ≤ $0.05 USD (T-20-B-01-02 ship gate).
- **Per ticker per cron tick:** ≤ $0.05 USD.
- **Token-rate basis:** `GEMINI_TOKEN_RATES = { input: $0.000125 / token, output: $0.000375 / token }` pinned 2026-Q1. Cost recorded per call in `ProviderCallLog.cost_usd`.

## Calibration — *Plan 20-B-03* (Temperature scaling)

- **Procedure**: single-scalar temperature T fit on merged FPB held-out + production-labeled (20-Z-05) validation set via bounded golden-section search minimising NLL (Guo et al. 2017 §3.1). Bounds T ∈ [0.1, 10.0] from `CALIBRATION_BOUNDS`. Bin count 10. 5-fold CV for `cv_ece_mean ± cv_ece_std`.
- **classifier_version**: `gemini-per-doc-v{N}` where N is the 20-Z-04 prompt registry version (currently `v1`). A registry bump invalidates calibration history per T-20-B-03-04 and triggers an auto-refit on the next monthly cron run.
- **Where T applies at runtime**: post-Gemini batch in `classifyDocumentsBatch` — 2-class synthetic logits `{log(c), log(1-c)}` are T-scaled and the new max-class probability replaces the emitted confidence; polarity sign is preserved.
- **Gating**: `SENTIMENT_TEMP_SCALING_MODE` (`off`/`shadow`/`on`); ships at `shadow` by default. Cutover to `on` requires `cv_ece_mean_post < 0.05` AND `brier_post < 0.24` (CONTEXT.md line 115 verbatim).
- **Initial state**: T=1.0 (identity) until first calibration run lands a row. See `HYPERPARAMETERS.md §Temperature Scaling` for the latest persisted T.

## References

- Malo, P., Sinha, A., Korhonen, P., Wallenius, J., Takala, P. (2014). "Good debt or bad debt: Detecting semantic orientations in economic texts." *Journal of the Association for Information Science and Technology*, 65(4), 782–796.
- Araci, D. (2019). "FinBERT: Financial sentiment analysis with pre-trained language models." arXiv:1908.10063.
- Mitchell, M. et al. (2019). "Model cards for model reporting." *Proceedings of the Conference on Fairness, Accountability, and Transparency (FAT*)*.
- Guo, C., Pleiss, G., Sun, Y., Weinberger, K. Q. (2017). "On calibration of modern neural networks." *ICML*. https://arxiv.org/abs/1706.04599

## Links

- Plan: `.planning/phases/20-real-sentiment-analysis/20-B-01-PLAN.md`
- Summary: `.planning/phases/20-real-sentiment-analysis/20-B-01-SUMMARY.md`
- Prompt: `src/lib/prompts/_v1/gemini-per-doc-sentiment.md`
- Classifier: `src/lib/sentiment/per-doc-classifier.ts`
- Aspect taxonomy: `src/lib/sentiment/aspects.ts`
- Selector: `src/lib/sentiment/select-top-docs.ts`
- Eval harness: `scripts/eval-fpb-per-doc.ts`
- Held-out CSV: `data/eval/fpb-held-out.csv`
- Hyperparameters: `HYPERPARAMETERS.md` (section "20-B-01: Gemini per-document sentiment classifier")
