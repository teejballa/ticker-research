---
model_name: historical-backfill
model_version: v1-2026-05-26
card_format: mitchell-2019
last_validated: 2026-05-26
retrain_cadence: operator-triggered (one-shot CLI, not periodic)
author: tjameswalsh@icloud.com
source_files:
  - scripts/backfill-historical.ts
  - src/lib/backtest/universe.ts
  - src/lib/backtest/windowing.ts
  - src/lib/data/technical.ts
  - src/lib/learning.ts
  - src/app/api/cron/learn/route.ts
  - prisma/schema.prisma
---

# MODEL CARD — historical-backfill (Phase 27)

**Format**: Mitchell-2019 model card.  
**Companion document**: `docs/paper/methodology.md` (full methodology prose with citations).  
**Status**: shipped; one-shot backfill CLI run by operator after schema push.

---

## Overview

The historical backfill bootstraps the Bayesian lift-gate's cross-validation (CV) pool by
replaying ≥100 tickers × ≥5 years of the **technical signal class** through the live
feature-extraction pipeline (`computeTechnicalSnapshot`). It writes `SentimentSnapshot` and
`PriceOutcome` rows tagged `source = 'backfill'` to Neon, which Phase 23's Purged K-Fold
Brier-lift evaluation will consume.

This is NOT a trained model in the traditional sense — it is a data-ingestion bootstrap
that populates the CV pool required by a downstream evaluation. The "model" here is the
`LearnedPattern` Bayesian prior that the backfill helps calibrate indirectly.

---

## Intended Use

**Primary use:** Bootstrap the lift-gate CV pool count N so Phase 23's Purged K-Fold
evaluation has sufficient historical observations per `(signal_class, pattern_key, cap_class,
horizon_days)` cell.

**Correct use:**
- Backfill rows contribute to the raw membership pool used by Phase 23's CV folds.
- Backfill rows contribute to the weighted Bayesian posterior via Phase 18's learn cron,
  but their weight is effectively zero due to time-decay (5-year-old rows have
  `w ≈ 1.5 × 10⁻¹³` under the λ=60d decay schedule).

**Incorrect / out-of-scope use:**
- Backfill rows alone **cannot** graduate a cell from `EXPLORATORY` to `ACTIVE`. The
  `enforceLiveOnlyGate` safeguard (`src/lib/learning.ts:enforceLiveOnlyGate`) requires
  `LIVE_OUTCOME_THRESHOLD = 10` live (non-backfill) outcomes before any cell can promote.
- Backfill rows should NOT be used to claim a cell is calibrated without also reporting the
  live-outcome count and the ESS of the live posterior.

---

## Data Provenance

| Property | Value |
|----------|-------|
| Price source | Yahoo Finance via `yahoo-finance2 chart()` |
| Price field | `close` (split-adjusted; NOT `adjclose` — see §Limitations) |
| History window | 5 years prior to backfill run date (May 2026) |
| Snapshot cadence | Weekly (every 7 calendar days) |
| Universe | `BACKFILL_UNIVERSE` in `src/lib/backtest/universe.ts`, version `UNIVERSE_VERSION` |
| Universe size | ≥100 tickers |
| Cap-class balance | ~40 each: `large_cap`, `mid_cap`, `small_cap` |
| Source tag | `source = 'backfill'` on all `SentimentSnapshot` rows |
| Outcome labels | `forward_return_raw`, `forward_return_sector_rel`, `pct_change` (Phase 21) |
| Sector ETF lookup | `getSectorETF({ ticker, asOfDate })` from `src/lib/data/sector-mapping.ts` |
| Schema constraint | `@@unique([ticker, scanned_at])` on `SentimentSnapshot` — idempotent re-runs |

---

## Limitations

### L1 — Survivorship Bias (D-03) — HIGH IMPACT, DOCUMENTED

Yahoo Finance returns no price history for delisted tickers. The backfill universe is
therefore restricted to currently-listed equities — companies that went bankrupt, were
acquired, or delisted during the 5-year window are entirely absent. This is a **survivorship
bias**: the historical performance distribution of the surviving set is systematically
more favorable than the full investable universe at any historical date.

Direction of bias: inflates apparent historical signal quality for the surviving set.

Mitigation deferred to a future phase (paid PIT dataset: Polygon delisted endpoint, CRSP,
or equivalent). See `docs/paper/methodology.md §2` for full discussion.

### L2 — Current-Cap Proxy for Historical Cap Class (Research Assumption A1) — MEDIUM IMPACT

Historical market cap is not available via the Yahoo Finance free tier. `cap_class`
is assigned using the market cap at backfill run time (May 2026) via
`classifyCapClass(currentMarketCap)`. Tickers that crossed cap-class boundaries during the
5-year window are partially misclassified — their historical snapshots are assigned to the
wrong cell.

Mitigation: the universe is hand-curated to exclude names with known cap-class crossings.
Remaining misclassification is a known, accepted simplification. True as-of cap-class
would require a paid historical market-cap data source.

### L3 — Sector ETF Inception Gaps (Pitfall 5) — LOW IMPACT, DOCUMENTED

XLRE (inception 2015-10-07) and XLC (inception 2018-06-18) lack Yahoo price history before
their inception dates. Backfill snapshot windows predating each ETF's inception fall back to
SPY-relative return for `forward_return_sector_rel`. The fraction of affected rows is small
(pre-2015 snapshots for real estate names; pre-2018 for communication services names).

### L4 — Split-Adjustment Retroactivity (D-02 minor caveat) — LOW IMPACT

Yahoo's `close` series rewrites historical bars when a split occurs after the bar date. The
`close` value for date T is therefore not strictly knowable at T if a forward split has since
been announced. For technical-pattern features, this is an accepted simplification — split
adjustments do not change the shape of momentum or volatility indicators. Using `adjclose`
(dividend-adjusted) would be worse: it introduces forward-looking dividend information.

### L5 — Live-Only Gate Threshold (D-10) — DESIGN CHOICE, NOT A BUG

`LIVE_OUTCOME_THRESHOLD = 10` is a fixed constant documented in `HYPERPARAMETERS.md`.
It was chosen conservatively to ensure cells that look good in backfill have also been
validated by recent live observations before being surfaced to users. The threshold will be
revisited when Phase 23's lift-gate produces sufficient evidence to tune it statistically.

---

## Live-Only Gate Safeguard

The most important safeguard against overfitting to backfill data is the **live-only promotion
gate** (`src/lib/learning.ts:enforceLiveOnlyGate`):

```
Cell status = EXPLORATORY  ←→  liveOutcomeCount < LIVE_OUTCOME_THRESHOLD (10)
Cell status = ACTIVE        ←→  liveOutcomeCount ≥ 10 AND Brier-lift > 0
```

No backfill data can cause a cell to transition from `EXPLORATORY` to `ACTIVE`. Only live
outcomes (snapshots with `source != 'backfill'`) count toward the promotion threshold. This
guarantees that user-facing research reports cite patterns supported by recent, real market
behavior — not historical patterns that may no longer hold.

The gate is applied in `src/app/api/cron/learn/route.ts` each time the learn cron runs.

---

## Evaluation Metrics

The backfill itself does not have evaluation metrics — it is a data-ingestion step. The
metrics for the patterns it helps train are:

| Metric | Definition | Gate | Evaluated by |
|--------|-----------|------|-------------|
| Brier score in-sample | Mean squared error of posterior probability vs outcome | No direct gate | `src/lib/stats/brier.ts` |
| Live outcome count | `SentimentSnapshot.source != 'backfill'` events per cell | ≥ 10 before ACTIVE | `enforceLiveOnlyGate` |
| ESS (Effective Sample Size) | Phase 18 decay-weighted ESS | Display only | `src/lib/learning.ts` |
| Purged K-Fold Brier-lift | OOS Brier improvement over null model | Phase 23 gate (future) | `src/lib/backtest/` (future) |

---

## Maintenance

- **Re-run cadence:** Operator-triggered one-shot CLI. Re-running is idempotent (unique
  constraint on `(ticker, scanned_at)` + `createMany({ skipDuplicates: true })`).
- **Universe updates:** Bump `UNIVERSE_VERSION` in `src/lib/backtest/universe.ts` and re-run
  the CLI when the universe membership changes.
- **Threshold recalibration:** `LIVE_OUTCOME_THRESHOLD` is documented in `HYPERPARAMETERS.md`.
  Change it there (code-change, not env var) so the gate cannot be relaxed at deploy time.

---

## References

- Mitchell, M. et al. 2019. "Model Cards for Model Reporting." *FAT\* '19*.
- `docs/paper/methodology.md` — full methodology: survivorship, split-adj, as-of-cap, PIT timestamps, Purged K-Fold compatibility.
- Phase 27 CONTEXT.md — locked decisions D-01 through D-12.
- Phase 27 RESEARCH.md — assumption log A1–A4, pitfall inventory.
- HYPERPARAMETERS.md §live_outcome_gate — `LIVE_OUTCOME_THRESHOLD = 10` documented with D-10 rationale.
- ISL Ch. 5 (resampling / time-series CV) + CS229 §"Bias-Variance and Regularization" (feature leakage, walk-forward splits).
