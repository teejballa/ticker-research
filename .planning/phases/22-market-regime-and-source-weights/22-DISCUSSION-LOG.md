# Phase 22: Market-Regime Feature + Learned Sentiment-Source Weights — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 22-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 22 — Market-Regime Feature + Learned Sentiment-Source Weights
**Areas discussed:** Regime definition & bucket count, Source-weight wiring, Backfill + cutover order, Done-gate metric + P21.1 interaction (source-mix UI rolled in)

---

## Pre-discussion Carry-Forwards

| Decision | Source | Status |
|----------|--------|--------|
| D-01: P22 strict-gates on P21 ship + relearn soak | [[project-phase-22-next]] locked 2026-05-19 | ✓ Both complete 2026-06-08 |

---

## Area 1: Regime Definition & Bucket Count

### Q1 — Bucket count (resolves REQUIREMENTS ↔ ROADMAP conflict)

| Option | Description | Selected |
|--------|-------------|----------|
| 2 buckets — low-vol/high-vol | ROADMAP's locked choice. Halves the sparsity cost. | |
| 4 buckets — bull/bear × low-vol/high-vol | REQUIREMENTS.md spec. Industry-standard 2×2. Doubles cell count. | ✓ |
| 3 buckets — risk-off/neutral/risk-on | Compromise single-axis composite. | |

**User's choice:** "Other" → "Whichever is most complex and closest to industry standard and will make the best and most sense for the functionality and optimization of this app."
**Resolution:** Per [[feedback-override-claudemd-for-progress]], picked 4-bucket — the canonical 2×2 regime structure in Hamilton 1989 / Ang-Bekaert 2002 / AQR.
**Notes:** Sparsity defense = hierarchical shrinkage (P19-A-07 pattern) + P21.1's 5-gate.

### Q2 — Regime inputs (what data defines the bucket)

| Option | Description | Selected |
|--------|-------------|----------|
| VIX + SPY 50d/200d MA cross | CTA-standard regime detection. PIT-correct. Free via yahoo-finance2. | ✓ |
| VIX + SPY 30d return sign | Simpler; less smoothing; more flips. | |
| Hamilton HMM on SPY returns + VIX | Most sophisticated; needs HMM library or online EM. | |

**User's choice:** "VIX level + SPY 50d/200d MA cross (Recommended for industry-standard)"

### Q3 — VIX threshold scheme

| Option | Description | Selected |
|--------|-------------|----------|
| Rolling 60d VIX percentile, 50th split | Auto-adapts to regime drift. | ✓ |
| Fixed VIX=20 (academic standard) | Reproducible but distribution-naive. | |
| 3-zone with hysteresis (>30 / <15 / middle) | Avoids whipsaw; breaks pure-functional purity. | |

**User's choice:** "Rolling 60d VIX percentile, split at 50th (Recommended)"

### Q4 — Transition-zone exclusion (CORE-ML-10)

| Option | Description | Selected |
|--------|-------------|----------|
| Sample-relative: exclude horizon-window crossing flip day | Only drops genuinely ambiguous samples. | ✓ |
| ±3 trading days around every flip | Calendar-fixed; drops more than necessary. | |
| No exclusion zone | Violates CORE-ML-10 as written. | |

**User's choice:** "Exclude predictions whose outcome window crosses the flip day (Recommended)"

---

## Area 2: Source-Weight Wiring

### Q1 — Schema shape for (source × regime) weights

| Option | Description | Selected |
|--------|-------------|----------|
| Extend SourceTier with regime column (additive) | Single source of truth; tightest integration. | ✓ |
| New SourceTierRegime parallel model | Cleaner separation; more migration work. | |
| Materialize in-memory from PerSourceIC | Zero schema; runtime cost; no audit trail. | |

**User's choice:** "Extend SourceTier with `regime` column (additive migration) (Recommended)"

### Q2 — Weight computation algorithm

| Option | Description | Selected |
|--------|-------------|----------|
| Regime-sliced PerSourceIC → clamped softmax | Straightforward extension. | |
| Hierarchical EB shrink toward unconditional | Industry-standard defense against thin slices. | |
| Logistic regression with regime × source interaction | Most principled; requires architecture change. | |

**User's choice:** "Other" → "Again, whatever is the best for the functionality, optimization, and industry standard of this project."
**Resolution:** Per [[feedback-override-claudemd-for-progress]], picked **hybrid A+B**: regime-sliced PerSourceIC → empirical-Bayes shrinkage toward unconditional SourceTier IC → clamped softmax. Matches BlackRock SAE / AQR / Two Sigma signal-mixing practice.

### Q3 — Aggregator regime read

| Option | Description | Selected |
|--------|-------------|----------|
| Read regime from SentimentSnapshot row being aggregated | PIT-correct by construction. | ✓ |
| Recompute regime at aggregation time using asOf | Wrong direction; violates PIT. | |
| Use dominant regime in aggregation window | Distorts during transitions. | |

**User's choice:** "Read regime from the SentimentSnapshot row being aggregated (Recommended)"

### Q4 — Cold-start fallback chain

| Option | Description | Selected |
|--------|-------------|----------|
| (source, regime) → (source, 'ALL') → 1.0 | Smoothest cutover; gradual layer activation. | ✓ |
| Fall back to 1.0 immediately (skip ALL) | Forces every cell to earn weight from scratch. | |
| Average across all regimes' existing rows | Statistically dubious; non-normalized. | |

**User's choice:** "Fall back to unconditional SourceTier row (regime='ALL'), then 1.0 if missing (Recommended)"

---

## Area 3: Backfill + Cutover Order

### Q1 — Backfill cron architecture

| Option | Description | Selected |
|--------|-------------|----------|
| New /api/cron/backfill-regime, one-shot, auto-disable | Isolated failure domain; P27 checkpoint pattern. | ✓ |
| Extend P21's /api/cron/relabel to also write regime | Fewer crons; couples concerns. | |
| Live-only — no historical backfill | Cheapest; sacrifices history. | |

**User's choice:** "New /api/cron/backfill-regime, runs once, then auto-disables (Recommended)"

### Q2 — Production cutover order

| Option | Description | Selected |
|--------|-------------|----------|
| Migration → backfill → relearn → flip → aggregator cutover | Phased; reversible until step 4. | ✓ |
| Migration → flip → backfill → relearn | Locks schema upfront; lossy rollback. | |
| Migration + aggregator on day 1, backfill streams in over weeks | Lowest perceived downtime; mixed-state debugging hell. | |

**User's choice:** "Migration → backfill → relearn → unique-constraint flip → aggregator cutover (Recommended)"

### Q3 — Historical VIX + SPY data source

| Option | Description | Selected |
|--------|-------------|----------|
| yahoo-finance2 historical | Already in stack; free; proven at P27 scale. | (partial) |
| Polygon historical API | Better SLA; costs API calls. | (partial) |
| Pre-cached static fixture (CSV/JSON in repo) | Reproducible; becomes stale. | |

**User's choice:** "Other" → "Yahoo Finance too, if it has enough information and does not return N/A"
**Resolution:** Yahoo primary; Polygon fallback per-row when Yahoo returns null; prior trading day's close for market-holiday gaps; rows where neither resolves get logged + skipped with re-run capability.

### Q4 — Soak duration before unique-constraint flip

| Option | Description | Selected |
|--------|-------------|----------|
| 2 weeks of live learn-cron cycles | Matches P21 → P21.1 precedent. | ✓ |
| 1 week (one full learn cycle) | Faster; less observation. | |
| Flip immediately after relearn succeeds | No soak; highest risk. | |

**User's choice:** "2 weeks of live learn-cron cycles after backfill+relearn (Recommended)"

---

## Area 4: Done-Gate Metric + P21.1 Interaction (Source-Mix UI rolled in)

### Q1 — Concrete done-gate metric

| Option | Description | Selected |
|--------|-------------|----------|
| Brier-lift ≥ 0.005 on regime-flipped cells, BCa CI excluding 0 | Internally consistent with P21.1 BRIER_LIFT_THRESHOLD. | ✓ |
| ACTIVE cell count up ≥10% vs no-regime baseline | Direct edge measure; sensitive to FDR denominator. | |
| IC-lift ≥ 0.01 on (source × regime) weights vs unconditional | Misses LearnedPattern split benefit. | |

**User's choice:** "Brier-lift on regime-flipped cells ≥ 0.005 vs no-regime baseline, BCa CI excluding 0 (Recommended)"

### Q2 — BY-FDR denominator handling (P21.1 interaction)

| Option | Description | Selected |
|--------|-------------|----------|
| Hierarchical: per-regime BY families, then meta-BH | Benjamini-Bogomolov 2014; preserves per-cell power. | ✓ |
| Accept 4× denominator; raise q to 0.20 | Simpler; doubles FP rate. | |
| BY-FDR only on regime cells; leave unconditional | Backwards-compatible; permanent two-tier FDR. | |

**User's choice:** "Hierarchical FDR: per-regime BY families, then meta-BH across regimes (Recommended)"

### Q3 — ESS floor under regime split

| Option | Description | Selected |
|--------|-------------|----------|
| Keep ESS≥30 — fewer ACTIVE is honest | Aligns with IS depth-over-features framing. | ✓ |
| Lower regime-cell floor to ESS≥20 with UI caveat | Easier to populate UI; less statistical defense. | |
| Hierarchical shrinkage to parent + keep ESS≥30 | Most principled; third shrinkage layer. | |

**User's choice:** "Keep ESS≥30 — fewer ACTIVE cells is honest signal (Recommended)"

### Q4 — Source-mix UI surface in EngineCalibrationPanel

| Option | Description | Selected |
|--------|-------------|----------|
| Always-visible "Source mix" row — top 3 + regime label | Discoverable; matches existing panel density. | ✓ |
| Hidden-by-default toggle | Avoid density growth; loses transparency. | |
| Dedicated /insights/source-mix page + chip in panel | Most space; highest engineering cost. | |

**User's choice:** "Always-visible 'Source mix' row — top 3 sources by weight + regime label (Recommended)"

---

## Claude's Discretion

Areas where the user left implementation choices to downstream agents:

- Concrete column types + indexes for the additive Prisma migrations (planner picks).
- VIX history fetch cadence inside the backfill cron (planner picks — likely once-per-trading-day batched).
- Exact "Source mix" row visual styling and sparkline implementation (UI-phase researcher picks).
- Vercel cron schedule for `/api/cron/backfill-regime` (planner picks; one-shot semantics make this nearly arbitrary).
- File layout for the regime classifier helper — likely `src/lib/regime/classify.ts` mirroring `src/lib/labels/compute.ts` from P21.1.

---

## Deferred Ideas

- Multi-axis regime decomposition (rate cycle / earnings season / sector rotation as additional axes) — explicit non-goal in PROJECT.md.
- Per-regime logistic baseline retraining as P22.5 if cell-level lift signals more is needed.
- HMM-based regime classifier as a future upgrade candidate.
- Schwab brokerage integration / portfolio-level analysis — IS Week-13 open feature decision.
- (source × regime × cap_class) three-way conditioning — out of P22 scope.
- Bull/bear/chop 3-state trend axis — defer until trend-axis classification accuracy is measured.

---

## Meta-Patterns Observed

- **User invoked [[feedback-override-claudemd-for-progress]] twice** (Q1 of Area 1; Q2 of Area 2), both times choosing "the most ambitious technically-defensible option." Captured in both 22-CONTEXT.md `<specifics>` and locked decisions D-02 (4-bucket) + D-07 (hybrid EB+softmax).
- **Internal consistency with P21.1 was load-bearing throughout** — D-14 reuses BRIER_LIFT_THRESHOLD=0.005; D-15 extends Wave 4's two-pass FDR architecture; D-16 holds the same ESS floor; soak duration matches.
- **No scope creep** — every question stayed within "HOW to implement regime + source-weights." The deferred ideas list captures the few adjacent ideas surfaced.
