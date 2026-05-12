---
classifier_id: mention-baseline
version: v1
status: shadow
classifier_file: src/lib/sentiment/baseline.ts
training_window: rolling 90d of SentimentObservation rows (production Neon)
last_calibrated: pending  # first cron run lands inaugural calibration
retrain_cadence: P30D
mitchell_2019: true
---

# Model Card — Mention Volume Baseline (Plan 20-A-02)

## Intended Use

Replaces the GME-era `stocktwits_is_trending = Math.abs(sentiment_change) > 0.5`
heuristic with a calibrated, per-ticker, robust z-score on daily mention
counts. Output is consumed by:

- `stocktwits.ts` — gates `stocktwits_is_trending` under
  `FEATURES.mention_z_trending_mode` (off path preserves legacy behavior).
- `aggregator.ts` — surfaces `mention_z` + `is_trending_v2` on
  `AggregatedSentiment` for downstream UI + Diffusion Engine.
- `dispersion.ts` (Plan 20-A-01) — feeds `crowded_consensus` predicate as
  the V (volume) condition.

Not intended for: forward return prediction in isolation (no IR guarantee).
Use ONLY as a trending signal feeding the downstream sentiment aggregate.

## Factors

- **Cap class** — large_cap / mid_cap / small_cap / unknown. Z_thresh
  calibrated independently per class so micro-caps don't drown in the
  large-cap baseline.
- **Source class** — community / news / sec. Daily counts stratified
  because community volume baseline is fundamentally different from
  SEC filing cadence.
- **Window** — rolling 90 days, fetched_at-anchored (S2 PIT).

## Metrics

| Metric | Value | How measured |
|---|---|---|
| Cross-sectional Spearman IC (mention_z > Z, forward 5d alpha-vs-SPY) | pending | `scripts/calibrate-mention-z-threshold.ts` against trailing-90d validation set |
| ECE | n/a | binary classifier — not probabilistic |
| FP rate (z spike where no return signal) | pending | post-shadow review |

Cutover criteria (shadow → on):
- ≥30d nightly cron writes producing non-null baselines for ≥80% active tickers
- Cross-sectional IC ≥ 0.05 on validation window
- At least 1 per-cap_class Z_thresh differs from literature default Z=2.0

## Training data

- Source: `SentimentObservation` (Plan 20-Z-01).
- PII handling: SentimentObservation enforces hashed-author-id columns;
  raw text never persisted (allowlist DAO enforced by `npm run check-immutability`).
- Window: trailing 90d at compute_at.
- Exclusion: tickers with < 30 daily-count buckets in the window return null
  baseline → consumer falls back to legacy `is_trending` path.

## Quantitative analysis

Median + MAD chosen over mean + std because meme-stock spikes
(GME 2021: +1000% mention volume in 2 days) contaminate the variance
estimator. The 1.4826 scaling on MAD makes it a consistent estimator
of σ on N(0, σ²) data (Rousseeuw & Croux 1993, JASA 88:424), preserving
the usual frequentist interpretation of Z thresholds while keeping the
underlying estimator robust to outliers.

## Ethical considerations

- No PII — only counts of messages, never message contents.
- Survives the StockTwits anti-pump guarantees: per-ticker baseline
  cannot be gamed by cross-ticker coordination (each ticker's baseline
  is its own).
- Mitigation against MAD = 0 spike-suppression: `MAD_EPSILON = 1.0`
  floor in `mentionZScore` (T-20-A-02-02).

## Caveats and limitations

- Shadow-mode requires 30+ days of cron observations before evaluation.
- Cap_class 'unknown' falls back to literature default Z=2.0 (rounded
  95th percentile under normal-equivalent scaling) when calibration
  is sparse.
- StockTwits fetcher does not have market-cap context at call time, so
  the cutover-side cap_class resolution will happen upstream (FOLLOWUP plan).
- Calibration's forward return uses `PriceOutcome.pct_change`, not SPY-relative;
  the Spearman IC is rank-based and tolerates the linear shift, but the
  documented metric is "Spearman IC vs forward 5d alpha-vs-SPY" for
  consistency with the Diffusion Engine's measurement contract.

## Versioning

- v1: this card (initial ship under `FEATURES.mention_z_trending_mode = 'off'`).
- Future: any cap_class threshold change beyond ±25% from current bumps to v2.

## References

- Rousseeuw & Croux 1993, "Alternatives to the Median Absolute Deviation",
  J. Am. Stat. Assoc. 88:424.
- Mitchell et al. 2019, "Model Cards for Model Reporting", FAT* 2019.
- Plan 20-Z-01 (SentimentObservation PIT feature store).
- Plan 20-Z-07 (Lookahead-bias regression test).
