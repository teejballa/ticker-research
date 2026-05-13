---
model_name: per-source-ic
model_version: per-source-ic-v1
card_format: mitchell-2019
last_validated: 2026-05-12
retrain_cadence: P1D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/per-source-ic.ts
  - src/lib/stats/newey-west.ts
  - src/lib/stats/bh-fdr.ts
  - scripts/compute-per-source-ic.ts
  - src/app/api/cron/per-source-ic/route.ts
---

# Model Card — Per-Source Rolling ICIR with Newey-West Significance (Plan 20-C-01)

## Model Details

- **Name**: per-source-ic
- **Version**: `per-source-ic-v1` (bumped on algorithm change — never overwriting old rows)
- **Card format**: Mitchell 2019
- **Owner**: Cipher engine team (tjameswalsh@icloud.com)
- **Card last validated**: 2026-05-12
- **Retrain Cadence**: daily cron `/api/cron/per-source-ic` at `0 5 * * *` UTC

### What it is

Per-input-source rolling 20-day cross-sectional Spearman Information
Coefficient (IC) of source-tagged sentiment (`bull_pct - bear_pct` proxy via
mean `classifier_score`) against forward 7-day and 30-day returns, with:

- **ICIR** = mean(IC) / sample_std(IC) over the rolling 20-day window
  (Bessel-corrected sample std).
- **Newey-West HAC standard error** (Bartlett kernel) for autocorrelation
  robust significance; lag pinned per horizon by the Newey-West 1987 rule
  L = floor(4·(T/100)^(2/9)). 7d horizon → L = 5; 30d horizon → L = 10.
- **Benjamini-Hochberg FDR correction** at α=0.05 across the daily
  (source × horizon) panel — controls Type-I inflation from ~12 simultaneous
  hypotheses per day.

### Inputs

- `SentimentObservation` rows (Phase 20-Z-01) filtered by `source` ∈
  {`stocktwits`, `reddit`, `x`, `news`, `apewisdom`, `firecrawl`} and joined
  via `fetched_at` (PIT-safe — NEVER `published_at`). 20-Z-07 lookahead-bias
  regression test enforces.
- `PriceOutcome` rows with `days_after ∈ {7, 30}` providing forward return
  proxies (`pct_change`).

### Output

`PerSourceIC` rows: `(source_id, computed_at, forward_horizon_days, ic_20d,
icir_20d, ic_se_nw, ic_p_value_nw, ic_p_value_bh_fdr, n_observations,
nw_lag, model_version)`.

## Intended Use

1. **Calibration input for 20-B-04 SourceTier weight recompute** —
   `mean_ic_90d` is derived from PerSourceIC.ic_20d aggregates; SourceTier
   weights are NEVER hand-curated (S1 — no hand-picked authority table).
2. **Auto-down-weight signal** — sources with `icir_20d < 0.3` for **two
   consecutive 20-day windows** are flagged AUTO-DOWN-WEIGHT TRIGGERED on
   `/insights/sentiment-sources` and (forward-reference) feed
   SourceTier.weight reduction in the next monthly recompute.

Not intended for: per-ticker forward return prediction; the IC is a
cross-sectional ranking-quality metric for the SOURCE, not a per-ticker
score.

## Factors / Subgroups

| Factor | Values |
|--------|--------|
| `source_id` | `stocktwits`, `reddit`, `x`, `news`, `apewisdom`, `firecrawl` |
| `forward_horizon_days` | `7`, `30` |

## Metrics

- `ic_20d` — rolling-20d Spearman IC, ∈ [-1, 1].
- `icir_20d` — IC / sample_std(IC), unbounded; null when std = 0.
- `ic_se_nw` — Newey-West HAC standard error of the mean IC.
- `ic_p_value_nw` — raw two-sided Student-t p-value at t = ic_20d / ic_se_nw.
- `ic_p_value_bh_fdr` — BH-FDR-corrected p-value across today's
  (source × horizon) panel; the dashboard's significance asterisks read from
  this column, NOT `ic_p_value_nw`.

## Training Data

`SentimentObservation` × `PriceOutcome` over the trailing 20 days at the
moment the cron runs. **PIT-safe** — joins via `SentimentObservation.fetched_at`,
NEVER `published_at`. The grep marker `// PIT-INVARIANT` on the
`src/lib/sentiment/per-source-ic.ts` join site is the contract; 20-Z-07
regression test instruments this exact path.

## Evaluation Data

Same source — measure-and-report. This is a calibration metric (IC of the
signal's ranking quality), not a held-out classifier evaluation.

## Quantitative Analyses

### Lag-per-horizon derivation (Newey-West 1987)

`L = floor(4·(T/100)^(2/9))` evaluated at T = 20-day window × ~5 sources
cross-section ≈ 100 observations:

- **h = 7 → L = 5** — accounts for short-range overlap in weekly forward
  returns.
- **h = 30 → L = 10** — longer-overlap autocorrelation under 30-day forward
  windows; biased upward from the rule.

### Multiple-hypothesis correction

Daily we evaluate ~12 hypotheses (6 sources × 2 horizons). Under
uncorrected α=0.05, the expected number of false positives is ~0.6/day. The
BH-FDR procedure at α=0.05 controls the expected false-discovery rate at 5%
in the daily panel.

### Sample-std correction

Sample std uses (n-1) denominator (Bessel correction) — the BH-FDR test
treats the IC mean estimator as a finite-sample average, not a population
parameter.

## Ethical Considerations

No PII. Inputs are hashed `author_id` (sha256("source:handle")) and
`classifier_score` floats from `SentimentObservation`. Source attribution is
preserved at the source-class level (no per-author breakouts). Auto-down-
weight is reversible — a source whose ICIR recovers ≥ 0.3 in any subsequent
window has the badge cleared immediately.

## Caveats / Recommendations / OOD

- **New source < 20 observation days returns null** — no PerSourceIC row is
  written for cold-start sources. 20-B-04 SourceTier.recompute treats
  missing PerSourceIC as `weight = 1.0` default (T-20-B-04-03 graceful-empty
  pact).
- **Cross-sectional N < 5 per day** — that day is skipped (Spearman
  unstable). If every day fails the floor, the row is null.
- **Sparse small-cap coverage inflates IC variance** — the 20d window can be
  noisy for tickers with few daily messages. Considered in 20-C-06 fairness
  audit (cap_class stratification).
- **Overlapping returns at 30d horizon** make raw t-stats anti-conservative
  — the Newey-West correction at L=10 is the intended mitigation.
- **BH-FDR is daily-panel only** — longitudinal multiple-testing (e.g.,
  evaluating the same source over many days) is NOT corrected here.
  Operator should re-examine in 20-C-06 fairness audit.

## Known Failure Modes

- Zero-volume source-days — skipped silently in the per-day loop; logged as
  "below cross-sectional N floor".
- Single-ticker-per-day source — Spearman undefined; rollingSpearmanIC
  returns 0 per the alpha-decay-monitor convention.
- SentimentObservation classifier upgrade — requires `model_version` bump on
  PerSourceIC; old rows preserved (append-only history).

## References

- Newey, W. K., & West, K. D. (1987). "A Simple, Positive Semi-Definite,
  Heteroskedasticity and Autocorrelation Consistent Covariance Matrix."
  *Econometrica* 55(3): 703–708.
- Benjamini, Y., & Hochberg, Y. (1995). "Controlling the False Discovery
  Rate: A Practical and Powerful Approach to Multiple Testing." *J. Royal
  Statistical Society B* 57(1): 289–300.
- CONTEXT.md §20-C-01 (Phase 20 specification).
- Phase 19-A-05 — `src/lib/reasoning/alpha-decay-monitor.ts` rolling-IC
  primitive reused here.
- Phase 20-Z-01 — `SentimentObservation` PIT-safe feature store.
- Phase 20-Z-02 — Model-card scaffold (Mitchell 2019 frontmatter convention).
- Phase 20-Z-07 — Lookahead-bias regression test enforcing the
  fetched_at-only join.
