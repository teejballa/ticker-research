# Model Card — Crowded Consensus Flag

**Component:** `src/lib/sentiment/dispersion.ts` `crowdedConsensus()`
**Plan:** 20-A-01 (Phase 20 Wave A)
**Status:** off (default) | shadow (after operator promotion) | on (after cutover criteria met)
**Last validated:** never (calibration deferred — see HYPERPARAMETERS.md note)

## Intended use

Surfaces a UI warning when sentiment shows the academic Cookson & Engelberg
2022 "echo chamber" signature: low entropy of bull/bear/neutral message tags,
anomalously high mention volume, and low author diversity (Gini > D_thresh).
Per the cited paper, this configuration historically mean-reverts within 14
days. Output is **informational** — never a recommendation.

## Out-of-scope use

- NOT a sell signal. NOT investment advice.
- NOT a confidence-weighted score; output is boolean.
- NOT predictive of timing; only directional base-rate.

## Inputs

- **Shannon entropy** of {bull, bear, neutral} per-message tag counts (24h window).
- **Population stdev** of bull_pct across cross-platform sources (informational; not part of the predicate as of 20-A-01).
- **Gini coefficient** of message-counts-per-author (24h window).
- **mention_z** (volume z-score per cap_class) — currently STUBBED at 0; replaced by 20-A-02.

## Outputs

- `boolean | null` (null when any input is non-finite OR thresholds are unavailable).

## Training data

- `SentimentObservation` rows from production Neon, trailing 90d window.
- `PriceOutcome` rows joined for 14-day forward outcome (binary: underperformed = 1, else 0).
- **PIT discipline:** joined by `fetched_at` ONLY (S2; T-20-A-01-01 mitigation).
  The literal substring `published_at` is absent from the calibration script
  (enforced by integration test grep gate + `npm run check-lookahead`).

## Evaluation

- **Brier Skill Score** vs climatology base rate. Latest: see `HYPERPARAMETERS.md`.
- **Backfill regression:** GME-shaped synthetic features fire the flag under canonical thresholds (integration test).
- **Spot-check log** (cutover obligation; populated before flag flips to 'on'):

| Date      | Sample size | Operator | TP | FP | FP rate     |
|-----------|-------------|----------|----|----|-------------|
| (pending) | 20          | (operator) | (n) | (n) | ≤ 0.20 target |

## Known failure modes

- **Threshold drift** (T-20-A-01-04) — market regime change makes thresholds stale. Mitigation: monthly cron recalibrates (`'0 7 1 * *'` UTC).
- **GME-never-fires** (T-20-A-01-02) — calibration grid bounds too tight. Mitigation: backfill regression test gates merge.
- **FP suppression of legitimate consensus** (T-20-A-01-03) — earnings beat where everyone correctly turns bullish. Mitigation: 20% FP-rate ceiling enforced by spot-check.
- **mention_z stub** — until 20-A-02 ships, `mentionZ()` returns 0; the predicate cannot fire under shadow because `V_thresh > 0`. This is intentional ordering.

## Citations

- Cookson, J. A. & Engelberg, J. (2022). "Echo Chambers." SSRN: <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3873189>
- Mitchell et al. (2019). "Model Cards for Model Reporting." FAT* 2019.

## Naming inversion note

Spec wording in CONTEXT.md line 103 reads "author_diversity < D_thresh". The
implementation uses `gini > D_thresh` because Gini is INVERSELY related to
diversity (high Gini = low diversity). The two phrasings are equivalent under
the conversion `diversity ≈ 1 − gini`. The threshold persisted in
`CrowdedConsensusCalibration.D_thresh` is the literal **Gini floor**, not a
diversity ceiling. Future maintainers: the predicate fires when the gini is
HIGH (concentrated authorship), and the calibrated D_thresh is the floor of
that concentration.

## Retrain cadence

Monthly via `/api/cron/calibrate-crowded-consensus` (`vercel.json` `crons[]`).
First inaugural row lands on next cron run after 20-A-02 ships.
