---
model_name: agreement-signal
model_version: v1
card_format: mitchell-2019
last_validated: 2026-05-12
retrain_cadence: P30D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/agreement.ts
  - src/lib/sentiment/aggregator.ts
  - src/lib/learning.ts
  - scripts/calibrate-agreement-threshold.ts
---

# Model Card — Cross-Platform Agreement Signal (Plan 20-A-05)

## Intended Use

Surfaces a scalar `agreement_score ∈ [0, 1]` whenever ≥2 sentiment sources
contributed to the multi-source aggregator. Drives:

- **UI**: amber `MIXED · LOW AGREEMENT` badge when score < threshold AND
  `agreement_signal_mode` is graduated to `on`.
- **Diffusion Engine**: extends `LearnedPattern.pattern_key` with an
  `agreement_bucket ∈ {'mixed','aligned','na'}` suffix so the engine
  accumulates separate Beta posteriors per agreement regime
  (Cookson & Engelberg-style echo-chamber gating).

Not intended for: forward return prediction in isolation. The signal's
documented relationship is to forward 7d **realized-vol uplift**, not
directional return.

## Factors

- **Number of contributing sources** — score is `null` when n_sources < 2.
- **bull_pct range** — formula assumes [0, 100]; caller validates before
  invocation (T-20-A-05-02).
- **Threshold** — calibrated monthly via grid search; literature default
  0.5 (Cookson & Engelberg) is the cold-start fallback.

## Metrics

| Metric | Value | How measured |
|---|---|---|
| Forward 7d realized-vol uplift (low-agreement → higher vol) | pending | `scripts/calibrate-agreement-threshold.ts` grid search vs trailing-90d outcomes |
| Bootstrap CI lower bound on uplift | pending | paired-bootstrap n=1000 against per-ticker trailing window |
| Cutover criteria (shadow → on) | pending | candidate threshold must beat baseline with bootstrap CI > 0 |

Null-result handling (T-20-A-05-04): if no candidate threshold beats
baseline, the script persists the literature default 0.5 with
`null_result = true` AND schedules a 6-month re-evaluation gate (no
further calibration attempts until then).

## Training data

- Source: `SentimentObservation` (Plan 20-Z-01) joined with `PriceOutcome`
  (post-Phase-19 forward returns).
- PII handling: zero raw-author data flows through this signal — only
  aggregated cross-source bull_pct dispersion. Author hashing (20-Z-01)
  applies at the upstream observation layer.
- Window: trailing 90d at compute_at.
- Exclusion: tickers with < 2 contributing sources at compute time
  return `agreement_score = null`.

## Quantitative analysis

`agreement_score = 1 - std(bull_pct) / 50` clamped to [0, 1]. The /50
normalization treats a 0-vs-100 disagreement (max std ≈ 50 for binary
sources) as `agreement_score = 0`. Bessel-corrected sample std so a
2-source vector has well-defined dispersion.

Bucket convention (for LearnedPattern key extension):
- `agreement_score ≥ threshold` → `aligned`
- `agreement_score < threshold` → `mixed`
- `null` (n_sources < 2) → `na`

## Ethical considerations

- No PII surfaces — only aggregate dispersion.
- The signal does NOT make a directional claim; the UI badge explicitly
  says "MIXED" not "BEARISH" to avoid implying that disagreement implies
  any particular direction.
- Cookson & Engelberg motivation: low cross-source agreement correlates
  with forward realized-vol uplift, NOT return direction.

## Caveats and limitations

- 2-source vectors have well-defined but high-variance dispersion;
  threshold calibration must accommodate this.
- `aligned` bucket includes both bullish-aligned and bearish-aligned —
  the LearnedPattern key downstream already carries direction via the
  cap_class × sentiment_type tuple, so this is by design.
- Shadow→on cutover requires explicit operator confirmation (no
  auto-graduation) because the signal affects engine learning.

## Versioning

- v1: this card (initial ship under `FEATURE_AGREEMENT_SIGNAL = 'off'`).

## References

- Cookson & Engelberg 2022, "Echo Chambers", J. Financial Economics.
- Mitchell et al. 2019, "Model Cards for Model Reporting", FAT* 2019.
- Plan 20-Z-01 (SentimentObservation feature store).
- Plan 20-Z-07 (Lookahead-bias regression test).
