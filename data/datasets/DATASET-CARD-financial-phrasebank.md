# Dataset Card — Financial PhraseBank

Plan: 20-B-03 (temperature scaling calibration). Gebru-2018 dataset card schema.

## Source

- **Original**: Malo, P., Sinha, A., Korhonen, P., Wallenius, J., & Takala, P. (2014).
  "Good debt or bad debt: Detecting semantic orientations in economic texts."
  *Journal of the Association for Information Science and Technology*, 65(4), 782-796.
  https://arxiv.org/abs/1307.5336
- **Standard partition** (75pct + AllAgree): Araci, D. (2019). "FinBERT: Financial
  Sentiment Analysis with Pre-trained Language Models." https://arxiv.org/abs/1908.10063
- **Mirror**: https://huggingface.co/datasets/financial_phrasebank
- **Local file**: `data/datasets/financial-phrasebank.csv`

## License

Creative Commons Attribution-NonCommercial-ShareAlike 3.0 (CC-BY-NC-SA-3.0).

Cipher uses this dataset for INTERNAL CALIBRATION ONLY (research use within the
meaning of the license). Calibration outputs (T values, ECE numbers) are
derived works; we publish only aggregate statistics, never raw sentences.

## Composition

| Field             | Value                                                  |
|-------------------|--------------------------------------------------------|
| Total sentences   | 3,453                                                  |
| Header columns    | `text,label,agreement_level`                           |
| Class labels      | `{positive, neutral, negative}`                        |
| Agreement levels  | `{all, 75pct}`                                         |
| All-agree subset  | 2,264 sentences (100% inter-annotator agreement)       |
| 75pct subset      | additional 1,189 with ≥75% agreement                   |
| Class distribution| ~26% positive / ~12% negative / ~62% neutral           |
| Domain            | Financial news headlines and excerpts                  |
| Language          | English only                                           |
| Encoding          | UTF-8 (converted from original Latin-1)                |

## Intended use in Cipher

- **Held-out validation set** for temperature scaling of Cipher's classifiers
  (FinBERT-Prosus per 20-B-02 + Gemini per-doc per 20-B-01).
- **5-fold CV partition**: deterministic 80% train / 20% val split per fold
  (seed=42 per `CALIBRATION_BOUNDS.CV_SEED`).
- **NOT used for training** — Cipher does not retrain FinBERT or fine-tune
  Gemini; this is calibration data only.

## Known limitations

- English-only — Cipher's StockTwits / Reddit / X intake is multilingual in
  principle; calibration generalisation to non-English text is unmeasured.
- Skewed class distribution (majority neutral) — Brier co-gate (T-20-B-03-05,
  `SHIP_GATE_BRIER < 0.24`) defends against ECE gaming by always-predict-majority.
- News-headline distribution shift vs Cipher's full document corpus (StockTwits,
  Reddit, full SEC filings) — production-labeled validation from 20-Z-05 (≥500
  docs) supplements FPB to bridge the gap. Until that floor is met, calibration
  runs are flagged `status='degraded'` and the ship gate is skipped.

## Citation

If you use this dataset, cite BOTH:

```
Malo, P., Sinha, A., Korhonen, P., Wallenius, J., & Takala, P. (2014).
"Good debt or bad debt: Detecting semantic orientations in economic texts."
Journal of the Association for Information Science and Technology, 65(4), 782-796.

Araci, D. (2019). "FinBERT: Financial Sentiment Analysis with
Pre-trained Language Models." arXiv:1908.10063.
```
