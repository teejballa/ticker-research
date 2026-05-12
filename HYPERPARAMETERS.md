# Hyperparameters Register

Source-of-truth list for calibrated parameters across the Cipher pipeline.
Each section is written by an automated calibration script — hand-editing
values violates S1 (no hand-picked parameters). Recalibration cadence is
documented per section.

---

## crowded_consensus (Plan 20-A-01)

Source: `scripts/calibrate-crowded-consensus.ts` grid search over the
`CrowdedConsensusCalibration` table.

| Parameter            | Value                       | Range searched          | Step  |
|----------------------|-----------------------------|-------------------------|-------|
| H_thresh (entropy)   | n/a (insufficient data)     | [0.3, 1.5]              | 0.1   |
| V_thresh (mention-z) | n/a (insufficient data)     | [1.0, 5.0]              | 0.25  |
| D_thresh (gini)      | n/a (insufficient data)     | [0.1, 0.7]              | 0.05  |

- **Brier Skill Score:** n/a (calibration deferred until ≥30 examples)
- **Training window:** 90d
- **n_examples:** 0 (live smoke deferred — mention_z stub returns 0 until 20-A-02 ships)
- **computed_at:** pending — first cron run lands the inaugural row.
- **model_version:** grid-search-v1
- **Recalibration cadence:** monthly via `/api/cron/calibrate-crowded-consensus` (schedule `'0 7 1 * *'` UTC)

**Deferred-state note:** This plan ships the calibration scaffold in `off`
mode. Live calibration smoke run was deferred — the mention_z stub returns 0
until plan 20-A-02 ships the real volume-baselining function, so the predicate
cannot fire under shadow until then. The monthly cron will write the first
inaugural row on its next scheduled run after 20-A-02 lands. This is
intentional ordering per CONTEXT.md S3 cutover criteria.

Updated by: Plan 20-A-01 (2026-05-12).

---

## Z_thresh per cap_class (Plan 20-A-02)

_Computed_at: pending — first calibration cron run lands the inaugural row. Literature default Z=2.0 (≈ 95th percentile under normal-equivalent MAD scaling) seeds the search per S1 / Rousseeuw & Croux 1993._

| cap_class | Z_thresh | IC | n_examples |
|---|---|---|---|
| large_cap | 2.00 | 0.0000 | 0 |
| mid_cap | 2.00 | 0.0000 | 0 |
| small_cap | 2.00 | 0.0000 | 0 |
| unknown | 2.00 | 0.0000 | 0 |

- **Calibration source:** `scripts/calibrate-mention-z-threshold.ts` grid search over Z ∈ [1.0, 5.0] step 0.25 against trailing-90d cross-sectional Spearman IC of (mention_z > Z, forward-5d return).
- **Training window:** 90d (CONTEXT.md S2 PIT — joins on `SentimentObservation.fetched_at` only).
- **MAD scaling:** 1.4826 (Rousseeuw & Croux 1993 — normal-equivalent σ).
- **MAD floor:** EPSILON = 1.0 mention/day (T-20-A-02-02 mitigation against division by zero on stable tickers).
- **Min observations:** n=30 daily-count buckets — below this `getBaselineForTicker` returns null and consumer falls back to legacy `is_trending_v1`.
- **Recalibration cadence:** nightly via `/api/cron/mention-baselines` (recompute) and monthly via `scripts/calibrate-mention-z-threshold.ts` (Z grid search).

**Deferred-state note:** This plan ships under `FEATURES.mention_z_trending_mode = 'off'`. Cutover to `shadow` (and eventually `on`) requires the four criteria documented in `docs/cards/MODEL-CARD-mention-baseline.md` Metrics section: ≥30d nightly cron, ≥80% ticker coverage, IC ≥ 0.05, ≥1 cap_class threshold differs from default Z=2.0.

Updated by: Plan 20-A-02 (2026-05-12).

---

## 20-A-03 — Per-source-class sentiment decay (λ in 1/day)

Half-life formula: **t½ = ln(2) / λ**.

| source_class | λ (per day) | half-life (days) | literature seed (h) | citation | tuned_at |
|---|---|---|---|---|---|
| retail | 0.6931 | 1.00 | 24 | Tetlock 2007 — J. Finance — pessimism predicts next-day returns then mean-reverts within 5 trading days | bootstrap |
| news | 0.2310 | 3.00 | 72 | Loughran-McDonald 2011 J. Finance — news effects survive 1-2 weeks | bootstrap |
| sec | 0.0990 | 7.00 | 168 | Loughran-McDonald 2011 — 10-K market response decays over 7-30d | bootstrap |
| analyst | 0.1386 | 5.00 | 120 | Womack 1996 / Stickel 1992 — analyst-revision drift survives 1-2 weeks | bootstrap |
| social-other | 0.1733 | 4.00 | 96 | Bridging seed between retail and news; calibration to override | bootstrap |

**Calibration procedure** (CONTEXT.md line 105):
1. `npx tsx scripts/tune-decay.ts` — grid search per class on rolling 90d window.
2. Grid: `{seed × 0.5, ×0.75, ×1.0, ×1.25, ×1.5, ×2.0}`.
3. Score: 20-day rolling ICIR of decayed aggregate vs forward 7-day alpha-vs-SPY.
4. Gate: `n_observations >= 60` per class. ICIR uplift `>= 0.05` vs no-decay baseline.
5. Cutover from `SENTIMENT_DECAY_MODE=shadow` to `=on` requires paired-bootstrap on Sharpe (1000 resamples) with 95% CI lower-bound > 0. Run `--bootstrap-cutover` to produce the report.
6. Re-tune monthly via `/api/cron/tune-decay` (vercel.json).

**Important** — this table is updated by `scripts/tune-decay.ts` after each successful run. The `bootstrap` value in `tuned_at` is replaced with the ISO timestamp of the run, and `literature seed` column is preserved as historical provenance.

**Deferred-state note:** Cipher ships under `SENTIMENT_DECAY_MODE=off` by default. Shadow mode runs both paths in parallel; cutover to `on` requires the paired-bootstrap report above with 95% CI lower-bound > 0 on Sharpe.

## 18-* — Per-signal-class learning-engine decay (λ in 1/day, t½ in days)

Lives inline in `src/lib/learning.ts` HYPERPARAMETERS const (per CONTEXT D-19 — additive-only schema). See that file for current values. Re-tune via `npx tsx scripts/tune-lambda.ts`.

| signal_class | lambda_days | tuned_at | source |
|---|---|---|---|
| diffusion | 60 | bootstrap | scripts/tune-lambda.ts |
| technical | 60 | bootstrap | scripts/tune-lambda.ts |
| insider | 60 | bootstrap | scripts/tune-lambda.ts |
| institutional | 60 | bootstrap | scripts/tune-lambda.ts |

> These two decay tables are intentionally separate — sentiment-message decay (per source class, t½ ≈ 1-7d) and learning-engine observation decay (per signal class, t½ ≈ 60d) are different domains with different calibration targets. Do not merge them. See `src/lib/sentiment/decay.ts` header for rationale.

Updated by: Plan 20-A-03 (2026-05-12).
