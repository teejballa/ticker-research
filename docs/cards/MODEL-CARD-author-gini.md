---
model_name: author-gini
model_version: gini-v1
card_format: mitchell-2019
last_validated: 2026-05-12
retrain_cadence: P7D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/gini.ts
  - src/lib/sentiment/aggregator.ts
  - scripts/calibrate-author-share-thresholds.ts
---

# Model Card — Author-Concentration Gini Signal (Phase 20-A-04)

**Component:** `src/lib/sentiment/gini.ts` `giniCoefficient()` + `src/lib/sentiment/aggregator.ts` `computeAuthorConcentration()`
**Plan:** 20-A-04 (Phase 20 Wave A)
**Status:** shadow → on (target — graduates after ≥7d shadow + GME/AMC/SOFI backfill within [0.3, 0.85])
**Last validated:** 2026-05-12 (literature-seeded; first calibration row pending operator-driven cron)

## 1. Model details

Composite signal — Gini coefficient of message-counts-per-author over the
rolling 24h window of `SentimentObservation` rows. Pure-math (no ML).
Implementation: `src/lib/sentiment/gini.ts`.

Formula (after sorting `values` ascending, x_1 ≤ … ≤ x_n):

    G = (2 × Σ_{i=1..n} i × x_i) / (n × Σ x_i) − (n+1)/n

Returns ∈ [0, 1]; 0 = perfect equality, 1 = perfect concentration (asymptote).

Companion calibration table: `AuthorShareCalibration` — per-ticker weekly Q1
of trailing-90d author-share distribution. Aggregator down-weights authors
whose 24h share exceeds Q1 by AUTHOR_GINI_DOWNWEIGHT = 0.5.

## 2. Intended use

Surface author-concentration as a robust replacement for the
`unique_authors / total_messages` ratio (which is symmetric and cannot
distinguish 10 authors × 1 message from 1 author × 10 + 9 × 1). Inform
crowding warnings (forward-referenced by 20-A-01 dispersion composite).
NOT a buy/sell signal in isolation — Gini is one of four Cookson-style
crowding inputs (the others: entropy of bull/bear tags 20-A-01,
mention z-score 20-A-02, time-decay 20-A-03).

## 3. Calibration data

Per-ticker trailing-90d author-share distribution. Q1 (25th percentile) via
NIST method 7 linear interpolation. Computed weekly via
`scripts/calibrate-author-share-thresholds.ts` and persisted in
`AuthorShareCalibration`. Old rows preserved for 30d (PIT replay).

**Retrain cadence:** weekly via `/api/cron/author-share-calibration`
schedule `'0 8 * * 1'` (Mondays 08:00 UTC).

## 4. Performance / acceptance criteria

- Gini values must lie in the published meme-stock range **[0.3, 0.85]** on
  the GME / AMC / SOFI backfill set during shadow → on graduation
  (per CONTEXT.md S3 verdict gate).
- Three canonical unit-test invariants:
  - uniform 10×1 → G = 0 ± 0.01
  - single dominant (n=10) → G = 0.9 ± 0.01
  - 50/50 two-author → G = 0 ± 0.01
- Q1 down-weight false-suppression rate measured at 30/60/90d post-cutover;
  documented as supplementary section here.

## 5. Known failure modes

- **Sparse-author tickers** (n_authors < 5 in 24h window): `gini_coefficient`
  returns null; UI hides sub-card. AUTHOR_GINI_N_MIN = 5 sentinel
  (T-20-A-04-02). Tracked count exposed via 20-Z-03 telemetry once wired.
- **Single-day burst from one journalist**: Q1-relative threshold absorbs
  consistent posters; one-off bursts on a single ticker get correctly
  down-weighted. False-suppression risk if a journalist suddenly posts on a
  ticker they normally don't cover — measured post-cutover.
- **New ticker, no calibration row**: global Q1 fallback = 0.25 with
  console.warn. Conservative — only the very top tail is suppressed until
  the next weekly cron run.
- **Race condition during cron**: INSERT-only model (T-20-A-04-03);
  in-flight reads see the previous row. `findFirst({orderBy:
  computed_at:'desc'})` is atomic in Postgres.

## 6. Ethical considerations

- **PII:** all author IDs are sha256-hashed at the source (20-Z-01) and only
  the 8-char sha256 prefix surfaces in UI via `authorDisplayPrefix()`
  (defense-in-depth re-hash even though 20-Z-01 already hashed). No raw
  handles persisted or rendered. Playwright + RTL contract tests
  (`tests/components/research-report-author-concentration.unit.test.tsx`)
  assert zero realistic-handle substrings in rendered DOM.
- **Down-weighting suppresses voices** — done relative to per-ticker
  historical norm (Cookson & Engelberg 2020 echo-chamber relative-baseline),
  NOT a global penalty. Caveat: a new prolific-but-legitimate poster on a
  previously-quiet ticker would be temporarily down-weighted until the next
  weekly calibration absorbs them.

## 7. Retrain cadence

- Q1 thresholds: weekly via `/api/cron/author-share-calibration` cron
  (`'0 8 * * 1'` UTC).
- Gini formula: pure math, no retrain.
- Down-weight multiplier (0.5): static literature default. Re-tune is
  out-of-scope for first ship; revisit after 90d of production data.

## 8. References

- Cookson, J. A., & Engelberg, J. (2020). "Echo Chambers." Review of
  Financial Studies. https://doi.org/10.1093/rfs/hhaa027
- Lucchini et al. (2022). GameStop sentiment self-induced consensus study.
- Mitchell, M. et al. (2019). "Model Cards for Model Reporting."
  Proceedings of FAT* 2019. https://arxiv.org/abs/1810.03993
- 20-Z-02 model card schema (already live — `check-model-cards` CI gate).

## Spot-check log

| Date | Ticker | Gini | Top author share | Q1 active | Operator notes |
|------|--------|------|------------------|-----------|----------------|
| pending | — | — | — | — | First entry lands at cutover. |
