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
  - src/lib/sentiment/calibration.ts
  - src/lib/sentiment/temperature-runtime.ts
---

# Model Card: Gemini Per-Document Sentiment Classifier (Plans 20-B-01 + 20-B-03)

This card lives adjacent to the source code per Plan 20-B-03 S4. The canonical
Mitchell-2019 sections (Model Details, Intended Use, Factors, Metrics,
Evaluation Data, Quantitative Analyses, Ethical Considerations, Caveats and
Recommendations, Cost Basis, Retrain Cadence) live at
**`docs/cards/MODEL-CARD-gemini-per-doc.md`** — this file is the on-source
mirror and adds the Plan 20-B-03 Calibration subsection inline.

For full content of the 10 standard sections, see `docs/cards/MODEL-CARD-gemini-per-doc.md`.

## Calibration — Plan 20-B-03 (Temperature scaling)

- **Procedure**: single-scalar temperature T fit on merged FPB held-out +
  production-labeled (20-Z-05) validation set via bounded golden-section
  search minimising NLL (Guo et al. 2017 §3.1). Bounds T ∈ [0.1, 10.0] from
  `CALIBRATION_BOUNDS`. ECE bin count 10. 5-fold CV for
  `cv_ece_mean ± cv_ece_std`.
- **classifier_version**: `gemini-per-doc-v{N}` where N is the 20-Z-04 prompt
  registry version (currently `v1`). A registry bump invalidates calibration
  history per T-20-B-03-04 and triggers an auto-refit on the next monthly
  cron run.
- **Where T applies at runtime**: post-Gemini batch in `classifyDocumentsBatch`
  (`src/lib/sentiment/per-doc-classifier.ts`) — 2-class synthetic logits
  `{log(c), log(1-c)}` are T-scaled and the new max-class probability replaces
  the emitted confidence; polarity sign is preserved.
- **Gating**: `SENTIMENT_TEMP_SCALING_MODE` env (`off` / `shadow` / `on`).
  Ships at `shadow` by default — flag flips to `on` only after the
  ship-eligible numeric gate is met (`cv_ece_mean_post < 0.05` AND
  `brier_post < 0.24`).
- **Initial state**: T=1.0 (identity) until first calibration run lands a row.
  See `HYPERPARAMETERS.md §Temperature Scaling` for the latest persisted T.
- **Validation set**: `data/datasets/financial-phrasebank.csv` (Malo et al.
  2014; Araci 2019 partition; CC-BY-NC-SA-3.0) + ≥500 production-labeled docs
  from 20-Z-05 (`HumanExemplar.class_label`, pending).
- **Reference**: Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017).
  "On Calibration of Modern Neural Networks." ICML 2017.
  https://arxiv.org/abs/1706.04599
