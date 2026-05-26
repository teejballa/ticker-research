# Historical Backfill Methodology (Phase 27)

**Version:** 2026-05-26  
**Status:** Shipped (Phase 27 Wave 3)  
**Related artifacts:** `src/lib/backtest/universe.ts`, `scripts/backfill-historical.ts`,
`docs/cards/MODEL-CARD-historical-backfill.md`

---

## 1. Scope

This document describes the historical backfill methodology used to bootstrap the Bayesian
lift-gate's cross-validation (CV) pool count N in Cipher's learning engine. The backfill
replays **≥100 tickers × ≥5 years of the technical signal class** through the existing live
feature-extraction pipeline to populate the CV pool used by Phase 23's Purged K-Fold
evaluation.

The single reproducible command to run the full backfill is:

```bash
npx tsx scripts/backfill-historical.ts
```

Dry-run (no DB writes, verifies the pipeline end-to-end):

```bash
npx tsx scripts/backfill-historical.ts --dry-run --max-tickers 3
```

The backfill is **not** a Vercel Function — it runs locally to avoid the 300-second function
timeout ceiling. Expected wall-clock time: 15–45 minutes for the full universe, depending on
Neon connection latency.

---

## 2. Universe and Survivorship Bias (D-03)

The backfill universe is a curated, versioned, cap-balanced static list defined in
`src/lib/backtest/universe.ts` under the export `BACKFILL_UNIVERSE` (tagged
`UNIVERSE_VERSION`). It contains ≥100 tickers distributed roughly evenly across the three
learning-engine cap-class buckets: `large_cap` (≥$10B), `mid_cap` (≥$2B), and `small_cap`
(< $2B).

### Survivorship Bias — Known, Documented Limitation

**Yahoo Finance returns no price history for delisted tickers.** Because the backfill fetches
historical data via `yahoo-finance2 chart()`, the universe is restricted to currently-listed
equities. This introduces **survivorship bias**: the set excludes companies that went
bankrupt, were acquired, or were otherwise delisted during the 5-year window.

The effect of survivorship bias is directional — it inflates the apparent historical
performance of the surviving set relative to the full investable universe at any past date.
For the purposes of this backfill, the bias affects the cell-count bootstrapping in the
lift-gate CV pool. Users of Phase 23's Brier-lift scores should be aware that the priors
were partially trained on a survivorship-biased population.

Truly survivorship-free coverage would require a paid point-in-time (PIT) dataset (e.g.,
Polygon delisted endpoint, CRSP, or equivalent). This is deferred and documented as a known
limitation — it is **not silently ignored**.

The universe is hand-curated to exclude names that crossed cap-class buckets significantly
over the 5-year window, mitigating — but not eliminating — cap-proxy bias described in
Section 4.

---

## 3. Price Series: Split-Adjusted `close`, Not `adjclose` (D-02)

Historical OHLCV bars are fetched using Yahoo Finance's `close` field, not `adjclose`. This
distinction is methodologically important:

- **`close` (used):** Split-adjusted. When a stock undergoes a forward split, Yahoo
  retroactively divides all historical `close` prices by the split factor so that the price
  series is continuous. This is the correct series for technical indicators (RSI, MACD, ATR,
  SMA) that measure price momentum and volatility patterns — split adjustments are
  economically neutral events that do not affect the shape of a technical pattern.

- **`adjclose` (not used):** Dividend-adjusted. Yahoo applies a backward adjustment factor
  that incorporates all future dividends paid between the bar date and the present. The
  adjustment factor at time T is computed using dividends paid after T — this is
  **forward-looking information** and would constitute feature leakage under CLAUDE.md
  Load-bearing Rule #6 (feature-leakage audit: every feature must be knowable at decision
  time). Using `adjclose` for historical patterns would contaminate the training signal.

**Minor caveat:** Split adjustment itself is retroactive — a stock split announced after
the bar date rewrites the historical `close` values in Yahoo's database. This is acceptable
for the technical-pattern use case because split adjustments are neutral to price momentum
and do not change the shape of indicator-derived features. However, it means the `close`
series for a given date T is not strictly knowable at T if a forward split has since
occurred. This is a documented, accepted simplification for technical signal extraction.

---

## 4. As-Of Cap Class Proxy (D-08 / Research Assumption A1)

The learning engine assigns outcomes to cells identified by `(signal_class, pattern_key,
cap_class, horizon_days)`. The `cap_class` dimension uses the thresholds defined in
`src/lib/diffusion-trace.ts:classifyCapClass()`:

- `large_cap`: market cap ≥ $10B  
- `mid_cap`: market cap ≥ $2B  
- `small_cap`: market cap < $2B  

**Historical market cap is not available on the Yahoo Finance free tier.** The `quoteSummary`
call returns current market cap, not market cap as of any historical date. The backfill
therefore assigns `cap_class` using the market cap at the time the backfill script is run
(curation time, May 2026), not the market cap as of each historical snapshot date.

This is a **documented simplification** (Research Assumption A1). The universe is
hand-curated to exclude names known to have crossed cap-class boundaries significantly over
the 5-year window (e.g., companies that were micro-cap in 2021 but grew to mid-cap by 2026
are excluded from the backfill universe). True historical cap-class assignment would require
a paid data source. This limitation is recorded in the model card at
`docs/cards/MODEL-CARD-historical-backfill.md`.

---

## 5. Sector-Relative Labels and ETF Inception Fallback (D-12 / Pitfall 5)

All backfilled `PriceOutcome` rows carry three labels, consistent with Phase 21:

1. **`forward_return_raw`** — raw return: `(price_at_outcome − price_at_scan) / price_at_scan × 100`
2. **`forward_return_sector_rel`** — sector-relative return: `forward_return_raw − sector_ETF_return` over the same window, where the sector ETF is resolved via `getSectorETF({ ticker, asOfDate: snapshot_date })` from `src/lib/data/sector-mapping.ts`.
3. **`pct_change`** — backward-compatible alias for `forward_return_raw`.

The `getSectorETF` call respects the `SECTOR_RECONSTITUTIONS` override table in
`sector-mapping.ts`, which handles the GICS sector changes for META (was Consumer Discretionary
before 2022, now Communication Services), GOOGL/GOOG, NFLX, DIS, T, and VZ.

**ETF Inception Fallback:** Several sector ETFs did not exist for the full 5-year window:

- **XLRE** (Real Estate): inception 2015-10-07
- **XLC** (Communication Services): inception 2018-06-18

For historical snapshot windows that predate a sector ETF's inception, `fetchSectorETFReturn`
returns null because Yahoo Finance has no price history before that date. In these cases,
the backfill falls back to **SPY-relative** return (the same fallback as the live
`price-followup` cron). This means `forward_return_sector_rel` for XLRE and XLC constituents
before their respective inception dates is computed as `forward_return_raw − SPY_return`
rather than the true sector-relative return.

This is a documented, known caveat. It affects a small fraction of the backfill rows (pre-2015
snapshots for real estate names, pre-2018 snapshots for communication services names). The
`pct_change` field remains an uncontaminated SPY-relative label for the affected rows, so
Phase 23's CV folds can use `pct_change` as a fallback label for those windows.

---

## 6. Point-in-Time Discipline and Purged K-Fold Compatibility (CLAUDE.md Rule #1 + Rule #6)

This section describes the timestamp conventions that make the backfill CV pool compatible
with Phase 23's Purged K-Fold + Embargo cross-validation.

### CLAUDE.md Load-Bearing Rules

> **Rule #1 (time-series CV, never random k-fold):** Random k-fold leaks future information
> into training (ISL Chapter 5). The backtest harness must use forward-chaining / walk-forward
> splits: train on (t₀, tₖ], evaluate on (tₖ, tₖ₊ₙ], advance, repeat. Anything else is
> lookahead bias and invalidates the IS paper.

> **Rule #6 (feature-leakage audit):** Every feature in SourcePackage must be tagged with
> the as-of-time it would have been knowable at decision time. Any new fetcher must document
> its timestamp semantics before being added to the backtest input.

### Timestamp Conventions (Critical Correctness Requirements)

The backfill enforces three timestamp invariants:

1. **`SentimentSnapshot.scanned_at` = the historical window date** (e.g., `2021-03-05`), NOT
   the backfill run date. This is the PIT anchor. Each weekly window uses the actual Friday
   closing date as `scanned_at`.

2. **`PriceOutcome.recorded_at` = `scanned_at + days_after`** (e.g., `scanned_at + 7 days`
   for the 7-day horizon outcome). This reflects when the outcome was resolvable in history,
   not today's date. The helper `computeOutcomeRecordedAt(scanned_at, days_after)` in
   `src/lib/backtest/windowing.ts` enforces this.

3. **`LearningEvent.occurred_at` = `PriceOutcome.recorded_at`** — the historical resolution date.

These timestamps are the inputs that Phase 23's Purged K-Fold fold generator consumes to
construct time-ordered folds with an embargo gap between training and evaluation windows. If
any timestamp were set to `new Date()` (the backfill run date), all backfill rows would appear
as simultaneous observations, Purged K-Fold folds would degenerate, and the IS paper's
time-series CV methodology would be violated (ISL Chapter 5 §5.3, CS229 §"Bias-Variance and
Regularization").

### Weekly Snapshot Cadence

Backfill snapshots are generated at weekly intervals (every 7 calendar days from a fixed
start anchor), producing approximately 260 snapshot dates per ticker over the 5-year window.
Weekly cadence balances CV pool density against runtime and Neon write volume. If Phase 23's
Purged K-Fold folds prove too sparse per cell, the cadence can be increased to daily — this
is a deferred tuning decision (noted in the CONTEXT.md deferred items).

---

## 7. Single Feature Path and Live-Only Gate (D-11 + D-10)

### Single Feature Path (Train/Serve Skew Defense, COVERAGE-08)

The backfill calls `computeTechnicalSnapshot(ticker, asOf)` from
`src/lib/data/technical.ts` as the **sole** feature-extraction path for both the backfill CLI
and the live sentiment-scan cron. No forked or parallel extractor is introduced. This is the
train/serve skew defense: the exact same indicator logic (RSI, MACD, ATR, SMA-200,
bollinger-bands, volume-trend) that generates live snapshot features also generates the
historical training pool. Feature definitions cannot diverge between the training corpus and
the live serving path.

The `computeTechnicalSnapshot` function accepts an `asOf?: Date` parameter. For backfill, the
weekly window date is passed as `asOf`; for live scans, `asOf` defaults to now. In both cases,
`fetchOhlcv(ticker, asOf)` fetches bars in the trailing year ending at `asOf`, and
`classifyTechPattern` returns null when `bar_count < 200` (SMA-200 warmup requirement). The
backfill skips writing snapshot rows where `tech_pattern === null`.

### Live-Only Gate (Lift-Gate Safeguard, COVERAGE-10, D-10)

Backfilled observations feed the **lift-gate CV pool only** — they contribute raw membership
counts for Phase 23's Purged K-Fold Brier-lift test. They do **not** promote cells from
`EXPLORATORY` to `ACTIVE` by themselves.

The `enforceLiveOnlyGate` function in `src/lib/learning.ts` implements this safeguard:

```typescript
// A cell cannot graduate EXPLORATORY → ACTIVE until it has
// LIVE_OUTCOME_THRESHOLD (= 10) live (non-backfill) outcomes confirming the prior.
if (liveOutcomeCount < LIVE_OUTCOME_THRESHOLD) {
  status = 'EXPLORATORY';
}
```

Where `liveOutcomeCount` counts `LearningEvent` rows for this cell whose `delta.source`
field is not `'backfill'`. Backfill rows are old; Phase 18's time-decay already drives their
live-posterior weight toward zero naturally (a 5-year-old row has
`w = exp(−1825/60) ≈ 1.5 × 10⁻¹³` — effectively zero). No explicit exclusion filter is
needed in the learn cron for the posterior path; only the live-only promotion gate is required.

The threshold `LIVE_OUTCOME_THRESHOLD = 10` is documented in `HYPERPARAMETERS.md` under the
`live_outcome_gate` section and will be revisited when Phase 23's lift-gate produces
sufficient evidence to tune it statistically.

---

## 8. References

- **ISL Ch. 5** — Resampling Methods: cross-validation, time-series CV, the case against random
  k-fold (James, Witten, Hastie, Tibshirani. *An Introduction to Statistical Learning*, 2nd ed.
  <https://www.statlearning.com>)
- **CS229** — "Bias-Variance and Regularization" (Stanford). Feature leakage, lookahead bias,
  walk-forward CV. <https://cs229.stanford.edu/main_notes.pdf>
- **Brier 1950** — Proper scoring rule for probabilistic forecasts; motivates Brier-lift
  evaluation in Phase 23.
- **Mitchell et al. 2019** — Model Cards for Model Reporting (*FAT\* '19*). The companion model
  card for this backfill is at `docs/cards/MODEL-CARD-historical-backfill.md`.
- **CLAUDE.md §"Statistical-Methods Reference"** — load-bearing rules #1 and #6 cited above.
- **Phase 27 Context** — `.planning/phases/27-historical-backfill/27-CONTEXT.md`: locked
  decisions D-01 through D-12.
- **Phase 27 Research** — `.planning/phases/27-historical-backfill/27-RESEARCH.md`: patterns,
  pitfalls, assumption log (A1–A4).
