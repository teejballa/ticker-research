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
  - src/lib/sentiment/calibration.ts
  - src/lib/sentiment/temperature-runtime.ts
---

# MODEL CARD — finbert-prosus (Plans 20-B-02 + 20-B-03)

This card lives adjacent to the source code per Plan 20-B-03 S4. The canonical
Mitchell-2019 sections (Model Details, Intended Use, Factors, Metrics, Evaluation
Data, Quantitative Analyses, Ethical Considerations, Caveats and
Recommendations, Known Failure Modes, Retrain Cadence) live at
**`docs/cards/MODEL-CARD-finbert-prosus.md`** — this file is the on-source
mirror and adds the Plan 20-B-03 Calibration subsection inline.

For full content of the 12 standard sections, see `docs/cards/MODEL-CARD-finbert-prosus.md`.

## Calibration — Plan 20-B-03 (Temperature scaling)

- **Procedure**: single-scalar temperature T fit on merged FPB held-out +
  production-labeled (20-Z-05) validation set via bounded golden-section
  search minimising NLL (Guo et al. 2017 §3.1; scipy.optimize.minimize_scalar(method='bounded')
  analog). Bounds T ∈ [0.1, 10.0] from `CALIBRATION_BOUNDS`. ECE bin count 10.
  5-fold CV for `cv_ece_mean ± cv_ece_std`.
- **Where T comes from at runtime**: latest `TemperatureCalibration` row keyed
  by `classifier_version='finbert-prosus-<sha>'`, 5-min in-process cache via
  `src/lib/sentiment/temperature-runtime.ts#loadTemperatureFor`.
- **Gating**: `SENTIMENT_TEMP_SCALING_MODE` env (`off` / `shadow` / `on`).
  Ships at `shadow` by default — flag flips to `on` only after the
  ship-eligible numeric gate is met (`cv_ece_mean_post < 0.05` AND
  `brier_post < 0.24`).
- **Auto-refit-on-version-change** (T-20-B-03-04): monthly cron
  `/api/cron/calibrate-temperature` (`0 7 2 * *`) inserts a NEW append-only
  TemperatureCalibration row whenever the pinned SHA changes — historical T
  values are preserved (NEVER UPDATE).
- **Initial state**: T=1.0 (identity) until first calibration run lands a row.
  See `HYPERPARAMETERS.md §Temperature Scaling` for the latest persisted T.
- **Validation set**: `data/datasets/financial-phrasebank.csv` (Malo et al.
  2014; Araci 2019 partition; CC-BY-NC-SA-3.0) + ≥500 production-labeled docs
  from 20-Z-05 (`HumanExemplar.class_label`, pending).
- **Reference**: Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017).
  "On Calibration of Modern Neural Networks." ICML 2017.
  https://arxiv.org/abs/1706.04599
