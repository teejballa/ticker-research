# Phase 22: Market-Regime Feature + Learned Sentiment-Source Weights — Research

**Researched:** 2026-06-08
**Domain:** Bayesian learning engine — regime conditioning + source-weight learning
**Confidence:** HIGH (extension architecture is fully grounded in P20 / P21 / P21.1 / P27 prior code; statistical methodology is canonical literature; only the regime classifier itself is greenfield)

---

## Summary

Phase 22 ships two intertwined upgrades to what the engine learns:

1. **Regime dimension** — extend `LearnedPattern` composite key with a 4-bucket regime (bull/bear × low-vol/high-vol) so per-regime Beta posteriors learn "this sentiment_type × cap_class × horizon works in bear/high-vol but not bull/low-vol."
2. **Learned (source × regime) sentiment weights** — extend `SourceTier` with regime conditioning so the aggregator can weight StockTwits vs Reddit vs News vs HackerNews differently per regime, reusing existing `PerSourceIC` infrastructure + Beta-Binomial empirical-Bayes shrinkage + clamped softmax.

Both ride the same per-cell posterior update path in `/api/cron/learn`, which is why they ship together. The work composes — does **not** replace — P21.1's 5-gate `patternStatus` and Wave 4's two-pass BY-FDR architecture. Cells simply become regime-conditional and must clear all 5 gates **per regime**.

**Primary recommendation:** Ship in **6 plans / 6 waves** in goal-backward order — schema migration → regime classifier (PIT-correct) → backfill cron + cutover → aggregator (source × regime) extension → learn-cron two-pass extension with hierarchical BY-FDR → done-gate + EngineCalibrationPanel "Source mix" row. The riskiest step (unique-constraint flip on `LearnedPattern`/`SourceTier`/`SentimentSnapshot`) lands **after** a 2-week relearn soak per D-13.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

Source: `.planning/phases/22-market-regime-and-source-weights/22-CONTEXT.md`, gathered 2026-06-08, **17 decisions D-01..D-17 are LOCKED — DO NOT re-litigate**.

**Area 0 — Sequencing:**
- **D-01:** P22 strict-gates on P21 ship + relearn soak. Both complete 2026-06-08 (P21 cutover 2026-05-24, P21.1 cutover 2026-06-08, ≥2 weeks elapsed). Source: `[[project-phase-22-next]]`.

**Area 1 — Regime Definition:**
- **D-02:** **4-bucket regime** (bull/bear × low-vol/high-vol). Resolves REQUIREMENTS.md ↔ ROADMAP.md conflict in favor of REQUIREMENTS (CORE-ML-07 stays 4-bucket; ROADMAP gets updated during planning). Grounded: Hamilton 1989, Ang & Bekaert 2002, AQR / Bridgewater regime literature. "Chop" absorbed into the trend axis as a continuous score that maps to bull/bear via threshold.
- **D-03:** Inputs = VIX level + SPY 50d/200d MA cross. Trend axis = `sign(SPY MA50 − MA200)`; vol axis = VIX vs threshold. Both PIT-correct via snapshot at scan time. Free via yahoo-finance2.
- **D-04:** VIX threshold = rolling 60d percentile, **50th-percentile split**. Auto-adapts to regime drift (low-vol-2017 ≠ low-vol-2022); avoids the distribution-naive fixed VIX=20 cutoff.
- **D-05:** Transition-zone exclusion = **sample-relative**. Drop predictions from posterior updates if a regime flip occurs in `(prediction_t, prediction_t + horizon_days]`. Satisfies CORE-ML-10.

**Area 2 — Source-Weight Wiring:**
- **D-06:** Extend `SourceTier` with `regime` column. Additive migration: `DEFAULT 'ALL'`, then flip the unique constraint to include `regime` after the soak window (D-13). Same pattern as the LearnedPattern migration. `getWeightForSource` extends to `(source_id, regime, asOf)`.
- **D-07:** Weight computation = **regime-sliced PerSourceIC → empirical-Bayes shrinkage toward unconditional SourceTier IC → clamped softmax** (hybrid A+B). Matches BlackRock SAE / AQR / Two Sigma signal-mixing practice. Adds `shrinkage_strength` column to SourceTier (additive). Sparse regime cells regress to the unconditional weight under low ESS.
- **D-08:** Aggregator reads regime label **from the SentimentSnapshot row being aggregated** (CORE-ML-08 already mandates writing it at scan time). PIT-correct by construction; mixed-regime windows produce per-row weights without distortion.
- **D-09:** Cold-start fallback chain: `(source, regime) → (source, 'ALL') → 1.0`. Smoothest cutover; regime layer activates gradually as each bucket accumulates IC observations. Empirical-Bayes shrinkage in D-07 targets step 2 (unconditional row), not step 3 (cold-start).

**Area 3 — Backfill + Cutover Order:**
- **D-10:** New `/api/cron/backfill-regime`, one-shot, auto-disables after complete pass. P27-style checkpoint pattern. Isolated failure domain — a regime-backfill bug does NOT poison the relabel cron or learn cron.
- **D-11:** Phased cutover sequence: (1) Prisma migration adds `regime` columns with `DEFAULT 'ALL'`; (2) backfill cron writes historical regime labels (offline-safe — `'ALL'` rows still serve all reads); (3) full relearn rebuilds `LearnedPattern` + `SourceTier` per-regime; (4) unique-constraint flip on both tables; (5) aggregator + learn cron start reading `(source, regime)` weights. **Each step independently reversible until step 4.**
- **D-12:** Historical VIX + SPY data = **yahoo-finance2 primary; Polygon fallback per-row when Yahoo returns null; prior trading day's close for market-holiday gaps**. Rows where neither source resolves get logged + skipped (regime label stays NULL, excluded from regime-conditional learning); backfill cron is re-runnable to fill them later.
- **D-13:** Soak = **2 weeks of live `/api/cron/learn` cycles** between relearn and the unique-constraint flip. Matches the P21 → P21.1 soak duration that just succeeded. Gives the 5-gate (ESS≥30 + live≥10) a chance to clear in each regime.

**Area 4 — Done-Gate + P21.1 Interaction:**
- **D-14:** Done-gate = **Brier-lift on regime-flipped cells ≥ 0.005 with BCa 95% CI excluding 0**, vs the `regime='ALL'` baseline aggregated across regimes. Same magnitude as P21.1's `BRIER_LIFT_THRESHOLD` constant. Reuses P21.1's BCa primitive (`src/lib/evaluation/bootstrap.ts`).
- **D-15:** **Hierarchical BY-FDR** — per-regime BY families, then meta-BH across regimes (Benjamini-Bogomolov 2014). Preserves per-cell detection power; the 4-bucket regime split does NOT 4× the BY-FDR denominator.
- **D-16:** Keep **ESS≥30 for all cells**, including regime-conditional. "0 ACTIVE cells in a regime is a valid IS-paper finding."
- **D-17:** EngineCalibrationPanel gets an **always-visible "Source mix" row** — top 3 sources by weight + regime label, click-to-expand for full ranking + 30d weight-drift sparkline. Satisfies CORE-ML-22 source-mix UI requirement.

### Claude's Discretion

- Concrete column types + indexes for the additive `SourceTier` / `SentimentSnapshot` / `LearnedPattern` / `PerSourceIC` migrations.
- VIX history fetch cadence inside the backfill cron (likely once-per-trading-day batched).
- Exact "Source mix" row visual styling and sparkline implementation in EngineCalibrationPanel (UI-phase researcher picks).
- Vercel cron schedule for `/api/cron/backfill-regime` (one-shot semantics make this nearly arbitrary).
- File layout for the regime classifier helper — recommend `src/lib/regime/classify.ts` mirroring `src/lib/labels/compute.ts` from P21.1.
- Whether `shrinkage_strength` lives on `SourceTier` directly (recommended) or in a sibling table.

### Deferred Ideas (OUT OF SCOPE)

- **Multi-axis regime decomposition** (rate cycle / earnings season / sector rotation × VIX/SPY) — explicit non-goal in PROJECT.md.
- **Per-regime logistic baseline retraining** — P22.5 candidate.
- **HMM-based regime classifier** — D-03 picked rule-based VIX + MA cross over Hamilton HMM. Future upgrade if rule-based classification noise becomes a problem.
- **Schwab brokerage integration / portfolio-level analysis** — IS Week-13 decision.
- **(source × regime × cap_class) weights** — three-way conditioning. Reconsider only if D-14 done-gate passes.
- **Bull/bear/chop 3-state trend axis** — defer until trend-axis classification accuracy empirically measured.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-ML-06 | `LearnedPattern` composite key extended to include `regime` dimension (additive migration: column with `DEFAULT 'ALL'` then add to unique constraint after soak) | §"File-by-file change map" → `prisma/schema.prisma:122-155`. Migration sequence D-11. |
| CORE-ML-07 | Regime detector classifies each scan moment into one of 4 buckets (bull/bear × low-vol/high-vol) with deterministic, reproducible labeling | §"Regime classifier" pattern; D-02..D-04; mirrors `src/lib/labels/compute.ts` pure-functional pattern. |
| CORE-ML-08 | `SentimentSnapshot` records the regime label at scan time; backfilled snapshots get historical regime labels via point-in-time VIX/SPY data | §"File-by-file change map" → `prisma/schema.prisma:42` + `/api/cron/backfill-regime`. D-08 + D-10 + D-12. |
| CORE-ML-09 | Regime label appears in the EngineCalibration block ("Current regime: bull / low-vol") | §"File-by-file change map" → `EngineCalibrationPanel.tsx:897`. D-17. |
| CORE-ML-10 | At regime transitions, posterior updates respect a transition-zone exclusion period to avoid mis-labeled training samples | §"Transition-zone exclusion" — D-05 sample-relative implementation in `evaluateOneCell`. |
| CORE-ML-20 | Learned sentiment-source weights | §"Empirical-Bayes for (source × regime)" — D-07 hybrid + extends `source-tier-recompute` cron. |
| CORE-ML-21 | Regime-conditional weights | §"Aggregator extension" — D-08 PIT-correct read of `SentimentSnapshot.regime`. |
| CORE-ML-22 | Source-mix UI surface | §"EngineCalibrationPanel" → D-17 always-visible "Source mix" row. |

---

## Project Constraints (from CLAUDE.md)

These MUST be honored. Every plan-task in this phase is gated by these rules; the verifier and plan-checker check compliance.

1. **Time-series CV, never random k-fold.** P21.1 already uses `purgedKFold` (5-fold, 90-day purge+embargo). P22 reuses verbatim — no new CV path.
2. **Calibration first-class.** D-14 done-gate is Brier-lift, not hit-rate. P22 extends the existing reliability-diagram surface (`/insights/calibration`) with per-regime panels.
3. **Every reported number gets a CI.** D-14 BCa CI requirement reuses `bootstrapBCa` from `src/lib/evaluation/bootstrap.ts`. The EngineCalibrationPanel "Source mix" row D-17 must also surface CI on the weight-drift sparkline.
4. **Priors regress to base rate.** D-07 EB shrinkage of `(source × regime)` weights toward the unconditional `(source, 'ALL')` row is **literally this rule**. Hierarchical pooling `hierarchicalPooledPosterior` (`src/lib/learning.ts:157`) is the established primitive.
5. **Multiple-testing correction mandatory.** D-15 hierarchical BY-FDR (Benjamini-Bogomolov 2014) implements this for the 4× expanded cell space.
6. **Feature-leakage audit at every new data source.** The regime classifier IS a new data source. Every helper in `src/lib/regime/` gets a `@knowable_at` annotation; `scripts/check-feature-asof.ts` (shipped in P21.1 Wave 6) will fail the build if any new feature lacks it.
7. **Proper scoring rules.** P22 reports Brier + log-loss per regime; reuses `src/lib/evaluation/log-loss.ts`.
8. **Always a non-LLM baseline.** P21.1's logistic baselines (24-feature + canonical-7) are the reference. P22 does NOT retrain them per regime (deferred to P22.5); it only adds regime-conditional Beta posteriors and regime-conditional source weights, both of which are honest baselines themselves.

**Module path discipline (CLAUDE.md "Where this lives in code"):** New work extends `src/lib/evaluation/` and `src/lib/sentiment/`; **do not create parallel modules**. The new regime classifier lives at `src/lib/regime/classify.ts` mirroring `src/lib/labels/compute.ts`.

---

## Standard Stack

### Core (reused from earlier phases — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `yahoo-finance2` | already pinned | VIX (`^VIX`) + SPY historical OHLC for regime labels | [VERIFIED: existing usage at `src/lib/data/sector-mapping.ts:175` for sector-σ; same caller pattern reused for VIX/SPY] |
| Polygon (REST) | already pinned | Fallback for VIX/SPY when Yahoo returns null | [VERIFIED: D-12 mirrors the Phase 10 field-level merge pattern] |
| Prisma | already pinned | Additive migrations only (no drops, no type changes) | [VERIFIED: D-11 sequence is the same pattern P21 / P27 used successfully] |
| `zod` | already pinned | Schema validation for new hyperparameter blocks | [CITED: `src/lib/sentiment/source-tier-hyperparameters.ts` precedent] |

### Supporting (existing in-repo primitives — reuse, do not reinvent)
| Module | Path | Purpose |
|--------|------|---------|
| `bootstrapBCa` | `src/lib/evaluation/bootstrap.ts:120` | D-14 done-gate CI. n<10 falls back to percentile (already implemented). |
| `benjaminiYekutieli` | `src/lib/evaluation/fdr.ts:43` | Per-regime BY families in D-15. Hierarchical wrapper extends this. |
| `purgedKFold` | `src/lib/cv.ts` | Reused verbatim in `evaluateOneCell` per-cell-per-regime. |
| `deflatedSharpeRatio` | `src/lib/evaluation/dsr.ts` | Reused; runs per (cell × regime). |
| `hierarchicalPooledPosterior` | `src/lib/learning.ts:158` | Empirical-Bayes for `(source × regime)` shrinkage toward unconditional `SourceTier` row (D-07). |
| `patternStatus` (5-gate) | `src/lib/learning.ts:357` | Reused verbatim per (cell × regime); P22 does NOT extend the gate. |
| `softmaxWithCaps` + `computeSourceWeights` | `src/lib/sentiment/source-tier.ts:54, 97` | Clamped softmax for per-regime weights (D-07). |
| `getWeightForSource` | `src/lib/sentiment/source-tier.ts:143` | Signature extension target — adds `regime: RegimeLabel` arg. Cold-start fallback chain D-09 implemented inside. |
| `aggregateCommunitySentimentTierAware` | `src/lib/sentiment/aggregator.ts:445` | Source of per-row weight application; D-08 per-row regime read happens here. |
| `getSectorSigma60d` pattern | `src/lib/data/sector-mapping.ts:175` | Template for `getVix60dPercentile` and `getSpyMaCross` helpers (cache key, retry semantics, `@knowable_at` annotation). |
| `enforceLiveOnlyGate` | `src/lib/learning.ts:412` | Preserved verbatim — `LIVE_OUTCOME_THRESHOLD=10` applies per (cell × regime). |
| Two-pass learn cron | `src/app/api/cron/learn/route.ts:552-642` | The architecture extension point — pass 1 emits per-regime evals, pass 2 applies hierarchical BY-FDR. |

### Installation
**No new npm packages.** All required primitives exist in-repo. The dependency surface is **strictly additive Prisma migrations + ~6 new TypeScript modules**.

### Version verification (verified Jun 8 2026)
- `yahoo-finance2` — pinned (`^VIX` chart endpoint available; verified via existing `sector-mapping.ts:175` usage of `yf.chart` against ETF tickers; `^VIX` is a valid Yahoo symbol)
- Polygon REST — pinned (same caller pattern as existing fallback in `src/lib/data/merge.ts`)

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
src/
├── lib/
│   ├── regime/                       # NEW — pure functional, no DB
│   │   ├── classify.ts               # classifyRegime(vix, spyMa50, spyMa200, vixThreshold) → RegimeLabel
│   │   ├── vix-percentile.ts         # rolling 60d percentile helper (D-04)
│   │   ├── ma-cross.ts               # sign(MA50 − MA200) (D-03)
│   │   ├── hyperparameters.ts        # vix_window_days, vix_percentile_threshold, ma_short, ma_long
│   │   ├── types.ts                  # RegimeLabel = 'bull-low-vol' | 'bull-high-vol' | 'bear-low-vol' | 'bear-high-vol' | 'ALL'
│   │   └── __tests__/
│   ├── evaluation/
│   │   ├── fdr.ts                    # EXTEND — add hierarchicalBYBH(perRegimePValues, q) for D-15
│   │   └── __tests__/
│   ├── learning.ts                   # NO CHANGE TO patternStatus — regime is a key dimension, not a gate parameter
│   └── sentiment/
│       ├── source-tier.ts            # EXTEND — getWeightForSource(source_id, regime, asOf); cold-start chain D-09
│       └── aggregator.ts             # EXTEND — read SentimentSnapshot.regime per row in aggregateCommunitySentimentTierAware (D-08)
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   ├── backfill-regime/      # NEW — one-shot, auto-disables (D-10)
│   │   │   │   └── route.ts
│   │   │   ├── learn/route.ts        # EXTEND — pass 1 per-regime, pass 2 hierarchical BY-FDR
│   │   │   ├── sentiment-scan/       # EXTEND — write SentimentSnapshot.regime at scan time (D-08, CORE-ML-08)
│   │   │   └── source-tier-recompute/route.ts  # EXTEND — emit per-regime SourceTier rows (D-07 hybrid)
└── components/
    └── EngineCalibrationPanel.tsx    # EXTEND — "Source mix" row (D-17) at L897 region
```

### Pattern 1: Regime classifier as pure-functional, asOf-keyed helper (mirrors P21.1 `src/lib/labels/compute.ts`)

**What:** Single shared compute path; no DB access inside the helper; caller-supplies VIX + SPY MA inputs; returns `RegimeLabel` + the raw inputs (for audit).

**When to use:** Both `/api/cron/sentiment-scan` (live write at scan time) and `/api/cron/backfill-regime` (historical write per PIT date).

**Example:**
```typescript
// Source: pattern from src/lib/labels/compute.ts:60 (P21.1 Wave 2)
// File: src/lib/regime/classify.ts

import { getVix60dPercentile } from './vix-percentile';
import { getSpyMaCross } from './ma-cross';
import { REGIME_HYPERPARAMETERS } from './hyperparameters';
import type { RegimeLabel, RegimeInputs } from './types';

export interface RegimeResult {
  regime: RegimeLabel;
  vix_level: number | null;
  vix_60d_percentile: number | null;
  spy_ma_50_minus_200: number | null;
}

/**
 * Pure functional regime classifier — D-02..D-04.
 * @knowable_at asOf — caller passes the prediction-time date; no forward data used.
 */
export async function classifyRegimeAt(args: {
  asOf: Date;
}): Promise<RegimeResult> {
  const vix = await getVix60dPercentile(args.asOf);   // returns { level, percentile_60d }
  const spy = await getSpyMaCross(args.asOf);         // returns { ma50_minus_ma200 }

  // Cold-start: any input null → regime = 'ALL' (D-09 fallback)
  if (vix == null || spy == null) {
    return { regime: 'ALL', vix_level: null, vix_60d_percentile: null, spy_ma_50_minus_200: null };
  }

  const trend = spy.ma50_minus_ma200 >= 0 ? 'bull' : 'bear';      // D-03
  const vol = vix.percentile_60d >= REGIME_HYPERPARAMETERS.vix_percentile_threshold  // D-04
    ? 'high-vol'
    : 'low-vol';

  return {
    regime: `${trend}-${vol}` as RegimeLabel,
    vix_level: vix.level,
    vix_60d_percentile: vix.percentile_60d,
    spy_ma_50_minus_200: spy.ma50_minus_ma200,
  };
}
```

### Pattern 2: Hierarchical BY-FDR (per-regime BY families → meta-BH across regimes)

**What:** Replace the current single-family BY across ~157 cells with a two-level structure: BY within each of 4 regime families (≈157 p-values each), then BH across the 4 regime-family summary statistics.

**Why:** Benjamini-Bogomolov 2014 multi-tissue eQTL precedent. Naive BY across 4× cells deflates power by ~4×; hierarchical preserves per-regime detection. D-15.

**Implementation outline (`src/lib/evaluation/fdr.ts` extension):**
```typescript
export interface HierarchicalBYResult {
  per_regime: Record<RegimeLabel, BYResult>;   // family-wise q-values per regime
  meta_bh_decisions: Record<RegimeLabel, 'REJECT' | 'ACCEPT'>;  // outer BH over family-min q-values
  effective_q: Record<RegimeLabel, number>;    // q used at family level given meta-BH gate
}

/**
 * Hierarchical BY-FDR per Benjamini & Bogomolov 2014 ("Selective inference on multiple
 * families of hypotheses", JRSS B). Multi-tissue eQTL canonical use case.
 *
 * Stage 1: BY within each regime (current denominator = per-regime cell count).
 * Stage 2: BH across regime families using min(per-family q) as the family-summary statistic.
 *          Regimes failing meta-BH have ALL their per-family rejections demoted to ACCEPT.
 */
export function hierarchicalBYBH(
  perRegimePValues: Record<RegimeLabel, number[]>,
  q_inner: number = 0.10,    // per-regime BY level
  q_outer: number = 0.10,    // meta-BH level across regime families
): HierarchicalBYResult { ... }
```

**Key property:** A 4-bucket regime split does NOT 4× the BY denominator. If only 1 of 4 regimes carries signal, the outer BH gate prevents the noisy 3 from inflating overall FDR while preserving inner-BY power on the signal-carrying one.

### Pattern 3: Empirical-Bayes shrinkage for (source × regime) weights (D-07 hybrid)

**What:** Three-tier computation per (source, regime) pair:
1. Compute regime-sliced rolling Spearman IC over `PerSourceIC` rows filtered by `regime` (when present, else unconditional).
2. Shrink toward the unconditional `(source, 'ALL')` IC via Beta-Binomial empirical-Bayes (`hierarchicalPooledPosterior` pattern at `src/lib/learning.ts:158`). Sparse regime cells regress to the unconditional weight.
3. Run `softmaxWithCaps` (`src/lib/sentiment/source-tier.ts:54`) over the shrunk per-regime ICs per regime separately, producing a per-regime weight per source.

**Why this matches BlackRock SAE / AQR / Two Sigma practice:**
- Multi-strategy alpha mixing always reweights signals per market regime.
- Empirical-Bayes shrinkage (Stein 1956, Efron-Morris 1973) is the standard sparse-cell defense — same logic as ridge regularization (CS229 "Bias-Variance and Regularization").
- Clamped softmax keeps no source fully suppressed or fully dominant (S1 bounded weighting; same caps as P20-B-04: `[0.5, 5.0]`).

**File extension (`src/app/api/cron/source-tier-recompute/route.ts`):**
- Group `PerSourceIC` rows by `(source_id, regime, horizon_days)`.
- For each `(source, regime)` panel: compute mean IC + n_observations.
- Compute unconditional `(source, 'ALL')` row in parallel as the EB prior.
- Apply `hierarchicalPooledPosterior`-style shrinkage (lambda = λ_min..λ_max bounded as in `learning.ts:181`) of regime-sliced IC toward unconditional IC, weight = `cell_n / (cell_n + lambda)`.
- Persist per-regime `SourceTier` rows + the unconditional `'ALL'` row.

**Anti-pattern to avoid:** Plain softmax over regime-sliced IC without shrinkage. Sparse regime cells will produce noisy outliers in the softmax; clamped-softmax's `[0.5, 5.0]` cap will paper over noise but lose information.

### Anti-Patterns to Avoid

- **Computing regime from snapshot-time VIX without backfilling history.** Sentiment-snapshot writer must call regime classifier **before** the INSERT (CORE-ML-08); separately, backfill cron must populate historical `SentimentSnapshot.regime` AND `PerSourceIC.regime` so the relearn has training signal per regime.
- **Reading regime from `getCurrentRegime()` at aggregation time.** Violates PIT discipline. D-08 mandates reading from the SentimentSnapshot row.
- **Extending `patternStatus` 5-gate with a 6th regime gate.** Wrong axis — regime is a **key dimension**, not a gate parameter. P21.1's 5-gate runs per (cell × regime) unchanged.
- **Naive BY across all cells × all regimes.** Inflates FDR denominator by 4×, deflates power by 4×. Must use hierarchical D-15.
- **Per-regime logistic baseline retraining inside P22.** Explicitly deferred to P22.5 per CONTEXT.md `<deferred>`.
- **Hand-curated regime labels or per-regime weights.** Triggers the existing `no-hand-curated-tier-weights` CI guard (`.github/workflows/no-hand-curated-tier-weights.yml`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-regime FDR correction | Bonferroni per regime or pooled BY across all cells | `hierarchicalBYBH` (extension of `fdr.ts:43`) | Bonferroni is over-conservative for dependent tests; pooled BY 4× deflates power. Benjamini-Bogomolov 2014 is the canonical solution. |
| (source × regime) weights | Plain softmax per regime over raw PerSourceIC | EB shrinkage (`hierarchicalPooledPosterior`) → `softmaxWithCaps` | Sparse regime cells produce noisy softmax outputs. EB is the established sparse-cell defense (CLAUDE.md rule #4). |
| Done-gate CI | Normal-approximation CI on Brier-lift | `bootstrapBCa` (already at `bootstrap.ts:120`) | Brier-lift is non-Gaussian and bounded; BCa accounts for skew/bias per Efron 1987. |
| VIX threshold | Fixed VIX=20 cutoff | Rolling 60d 50th-percentile (D-04) | Fixed thresholds break across regimes: VIX=20 was high in 2017, low in 2022. Auto-adaptation per regime drift. |
| Regime classifier | Markov-switching HMM (Hamilton 1989) | Rule-based VIX percentile + SPY MA cross (D-03) | HMM adds inference latency, requires backfill warmup, and adds a stochastic boundary that complicates train/serve. Rule-based is deterministic, reproducible, and PIT-correct by construction. HMM remains a candidate upgrade if rule-based shows classification noise. |
| Historical VIX/SPY fetch | Custom adapter | yahoo-finance2 primary + Polygon fallback (D-12), Phase-10 merge pattern | Already proven for sector ETFs in `getSectorSigma60d`. Reuse the cache + retry semantics. |
| Backfill orchestration | Long-running script | P27-style `/api/cron/backfill-regime` (one-shot, checkpoint, auto-disable) | P27 already proved this pattern over 121 tickers; isolated failure domain. |
| Source-mix weight drift sparkline | Custom chart library | Pure SVG (P21.1 BrierTile precedent at `src/app/insights/calibration/components/`) | No new chart deps; matches existing UI density. |

**Key insight:** P22 is overwhelmingly an **extension phase**. The only genuinely new code is (a) `src/lib/regime/` (regime classifier + helpers), (b) `/api/cron/backfill-regime`, (c) the hierarchical BY-FDR wrapper, (d) the "Source mix" UI row. Everything else is an additive Prisma column, a signature extension, or a per-regime iteration inside an existing loop.

---

## File-by-File Change Map

Every file that must change with exact extension points. **No parallel modules.** Code edits are sequenced by Wave below.

### A. Prisma schema (additive only — D-11 sequence)

| File | Line | Change |
|------|------|--------|
| `prisma/schema.prisma` | L42-65 (`SentimentSnapshot`) | **Add** `regime String @default("ALL")` + `regime_vix_level Float?` + `regime_vix_pctile Float?` + `regime_ma_diff Float?` columns. Indexes: add `@@index([ticker, regime, scanned_at(sort: Desc)])`. **Do NOT change** `@@unique([ticker, scanned_at])` — regime is metadata, not a key. |
| `prisma/schema.prisma` | L122-155 (`LearnedPattern`) | **Add** `regime String @default("ALL")` column. Migration: keep existing `@@unique([signal_class, pattern_key, cap_class, horizon_days])` until soak completes (D-13); then flip to `@@unique([signal_class, pattern_key, cap_class, horizon_days, regime])` in a later migration (D-11 step 4). |
| `prisma/schema.prisma` | L351-368 (`PerSourceIC`) | **Add** `regime String @default("ALL")` column. Update `@@unique` and `@@index` to include `regime` after backfill completes. Backfill cron writes historical regime per PIT date. |
| `prisma/schema.prisma` | L582-594 (`SourceTier`) | **Add** `regime String @default("ALL")` + `shrinkage_strength Float?` columns. Indexes: add `@@index([source_id, regime, computed_at(sort: Desc)])`. Migration: keep existing `@@index([source_id, computed_at(sort: Desc)])` until soak completes. |

**Migration sequencing (D-11):**
1. Migration 1 (Wave 0): all additive columns with `DEFAULT 'ALL'`. Code reads `'ALL'` rows transparently. Zero downtime.
2. Wave 2: backfill cron writes historical `SentimentSnapshot.regime` and `PerSourceIC.regime`.
3. Wave 3: full relearn rebuilds `LearnedPattern` + `SourceTier` per-regime (creates per-regime rows alongside the existing `'ALL'` rows; both coexist).
4. **2-week soak.**
5. Wave 5: Migration 2 — flip unique constraints to include `regime`. Old `'ALL'` rows become "the unconditional fallback row" (consumed via D-09 cold-start chain).
6. Wave 5: aggregator + learn cron cut over to reading `(source, regime)` weights.

**Reversibility:** Steps 1-3 are reversible (drop columns is destructive but additive backfill rows are reseeded by next cron run). Step 5 is the irreversible cutover.

### B. Regime classifier (new, greenfield)

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/regime/classify.ts` | **NEW** | `classifyRegimeAt({ asOf })` pure async function. Mirrors `src/lib/labels/compute.ts:60` pattern. `@knowable_at asOf` annotation. |
| `src/lib/regime/vix-percentile.ts` | **NEW** | `getVix60dPercentile(asOf)` — yahoo `yf.chart('^VIX')` primary, Polygon fallback per D-12. Cache key `vix_60d:{YYYY-MM-DD}` TTL 24h (matches `getSectorSigma60d` precedent). |
| `src/lib/regime/ma-cross.ts` | **NEW** | `getSpyMaCross(asOf)` — yahoo `yf.chart('^GSPC')` primary (or `'SPY'`), 200d window. Computes `ma50 - ma200` and `sign()`. |
| `src/lib/regime/hyperparameters.ts` | **NEW** | Zod-validated `REGIME_HYPERPARAMETERS = { vix_window_days: 60, vix_percentile_threshold: 0.5, ma_short: 50, ma_long: 200 }`. Module-load assertion (matches `source-tier-hyperparameters.ts` precedent). |
| `src/lib/regime/types.ts` | **NEW** | `RegimeLabel = 'bull-low-vol' \| 'bull-high-vol' \| 'bear-low-vol' \| 'bear-high-vol' \| 'ALL'` union. |
| `src/lib/regime/__tests__/classify.test.ts` | **NEW** | Unit tests: cold-start null inputs → `'ALL'`; bull/bear axis sign correctness; vol axis threshold boundary; PIT discipline (no forward data used). |

### C. Sentiment-scan cron (writes regime at scan time)

| File | Line | Change |
|------|------|--------|
| `src/app/api/cron/sentiment-scan/route.ts` | scan loop | Before `prisma.sentimentSnapshot.create(...)`, call `classifyRegimeAt({ asOf: now })` and populate the new `regime`, `regime_vix_level`, `regime_vix_pctile`, `regime_ma_diff` columns. Idempotent: re-running on the same `scanned_at` overwrites (unique key unchanged). |

### D. Backfill cron (new, one-shot)

| File | Status | Purpose |
|------|--------|---------|
| `src/app/api/cron/backfill-regime/route.ts` | **NEW** | P27-style checkpoint pattern. Sweeps `SentimentSnapshot` rows WHERE `regime = 'ALL'` ORDER BY `scanned_at`. For each row, call `classifyRegimeAt({ asOf: scanned_at })`, write `regime` + ancillary fields. Also sweeps `PerSourceIC` rows WHERE `regime = 'ALL'` and assigns per `computed_at`. Auto-disables after a complete pass via env-var checkpoint (mirrors `BACKFILL_DISABLED` pattern from P27). Bearer `CRON_SECRET` guard. `maxDuration: 800` per Pro tier. |
| `vercel.json` | crons array | **Add** entry `{ "path": "/api/cron/backfill-regime", "schedule": "0 10 * * *" }`. After auto-disable, the entry can be removed in a later commit. |

### E. Aggregator extension (D-08 per-row regime read)

| File | Line | Change |
|------|------|--------|
| `src/lib/sentiment/aggregator.ts` | L445-479 (`aggregateCommunitySentimentTierAware`) | The `for (const c of baseline.components)` loop at L466 already calls `getWeightForSource(c.source, asOf)`. **Extend** to read `regime` from the SentimentSnapshot row (passed via `inputs` or threaded through the call site). Call becomes `getWeightForSource(c.source, regime, asOf)`. PIT-correct: aggregator never asks "what's the current regime" — it asks "what regime was this row scanned in." |
| `src/lib/sentiment/aggregator.ts` | `AggregatorInputs` type | **Add** optional `regime?: RegimeLabel` field. When omitted (cold-start) → cold-start chain D-09 returns 1.0. |
| `src/lib/sentiment/aggregator.ts` | call sites (multiple — research-brief, gemini-analysis, engine-context) | Thread the snapshot's `regime` field through. For mixed-regime aggregation windows, group by regime and apply per-row. |

### F. Source-tier extension (D-06 + D-07 + D-09)

| File | Line | Change |
|------|------|--------|
| `src/lib/sentiment/source-tier.ts` | L143-163 (`getWeightForSource`) | **Extend signature** to `getWeightForSource(source_id: string, regime: RegimeLabel, asOf: Date)`. Implement D-09 cold-start chain: query `(source_id, regime, computed_at <= asOf)` first → fall through to `(source_id, 'ALL', computed_at <= asOf)` → fall through to `1.0`. |
| `src/lib/sentiment/source-tier.ts` | L97-134 (`computeSourceWeights`) | **No signature change**. Pure function still operates on a `PerSourceICRow[]` panel — the recompute cron is what calls this per-regime. |
| `src/lib/sentiment/source-tier-hyperparameters.ts` | bottom of file | **Add** EB shrinkage hyperparameters: `eb_shrinkage_lambda_min: 0.5`, `eb_shrinkage_lambda_max: 50` (mirrors `hierarchicalPooledPosterior` clamps at `learning.ts:181`). |
| `src/app/api/cron/source-tier-recompute/route.ts` | recompute loop | **Extend** to iterate per regime. For each regime: group `PerSourceIC` rows by `(source_id, regime)`; compute mean IC + n; compute unconditional `(source, 'ALL')` mean as the EB prior; apply EB shrinkage of regime-sliced IC toward unconditional via shrinkage_strength; run `softmaxWithCaps` per regime; INSERT per-regime `SourceTier` rows + the unconditional `'ALL'` row. |
| `src/lib/sentiment/__tests__/source-tier.test.ts` | extend | Add tests for the cold-start chain (D-09), EB shrinkage (sparse regime → regresses to unconditional), and per-regime softmax independence. |

### G. Learn cron extension (Wave 4 two-pass → hierarchical)

| File | Line | Change |
|------|------|--------|
| `src/app/api/cron/learn/route.ts` | L552-642 (`recomputePerSignalClassPatternMetrics`) | **Extend the cartesian** at L582-599 to include `regime` as the 5th axis. Cell space grows from 504 to 504 × 4 + 504 (the `'ALL'` aggregate row) = 2,520. CONTEXT D-15 ensures BY denominator doesn't grow naively. |
| `src/app/api/cron/learn/route.ts` | L656 (`evaluateOneCell`) | **Extend `CellKey`** to include `regime: RegimeLabel`. Query at L657-666 extends `where` clause to include `regime`. Event-fetch query at L676-686 extends WHERE clause. Live-outcome-count counts only events whose snapshot is in this `regime`. |
| `src/app/api/cron/learn/route.ts` | L637-641 (BY-FDR + apply) | **Replace** `benjaminiYekutieli(pValues, 0.10)` with `hierarchicalBYBH(perRegimePValues, 0.10, 0.10)`. Group cell evals by `regime` first; pass per-regime panel into the hierarchical wrapper. Apply per-regime `adjusted_p` in pass 2. |
| `src/app/api/cron/learn/route.ts` | L946-1057 (`applyPatternStatusAndEmitEvents`) | **No change** to the per-cell logic — `patternStatus` runs unchanged per (cell × regime). `cell_promoted` / `cell_demoted` event delta gets one new key: `regime`. |
| `src/app/api/cron/learn/route.ts` | L719 (decay weights filter — D-05 transition exclusion) | **Add** filter: exclude events where the predicting snapshot's regime ≠ the outcome-resolution-window regime (sample-relative transition exclusion). Implementation: when building `weightedObs`, drop observations where the snapshot's regime label differs from `classifyRegimeAt({ asOf: outcome.recorded_at })` (or simpler — store outcome-time regime on `PriceOutcome` during the backfill). |

### H. Evaluation extension

| File | Line | Change |
|------|------|--------|
| `src/lib/evaluation/fdr.ts` | append at end | **Add** `hierarchicalBYBH(perRegimePValues: Record<RegimeLabel, number[]>, q_inner: number, q_outer: number): HierarchicalBYResult` per Pattern 2 above. Cites Benjamini-Bogomolov 2014. |
| `src/lib/evaluation/__tests__/fdr.test.ts` | extend | Hierarchical tests: (a) signal in 1 regime + noise in 3 → only signal regime promotes; (b) signal in all 4 regimes → all promote; (c) noise in all 4 → 0 promote; (d) empty regime panels handled. |
| `src/lib/evaluation/index.ts` | exports | Re-export `hierarchicalBYBH`. |

### I. Done-gate (D-14)

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/evaluation/regime-done-gate.ts` | **NEW** | `regimeDoneGate(cellEvals: CellEvalResult[]): DoneGateResult` — for every cell with both a regime-specific row AND an `'ALL'` row, compute Brier-lift = `brier_all - brier_regime`. Apply `bootstrapBCa` with `nResamples=10000`. Promote regime-flipped cell if `point > 0.005` AND `low > 0` (95% CI excludes 0). Aggregate count of promoted cells as the headline gate metric. |
| `package.json` | scripts | **Add** `"phase-22-status": "node scripts/phase-22-status.ts"` mirroring `phase-21.1-status` precedent. |
| `scripts/phase-22-status.ts` | **NEW** | Headline gate: regime-flipped cell count + Brier-lift point + CI per cell. Exits non-zero if 0 cells pass D-14. |

### J. EngineCalibrationPanel (D-17)

| File | Line | Change |
|------|------|--------|
| `src/components/EngineCalibrationPanel.tsx` | L897 (`EngineCalibrationPanel`) | **Add** always-visible "Source mix" row showing top 3 sources by weight + the current `regime` label. Click-to-expand reveals full source ranking + 30d weight-drift sparkline (pure SVG, mirrors P20-C-02 BrierTile reliability diagram). |
| `src/components/__tests__/EngineCalibrationPanel.test.tsx` | extend | RTL tests for the new row (top-3 ordering, regime label rendering, expand behavior, sparkline data binding). |
| `src/lib/engine-context.ts` | calibration block builder | **Add** top-N source-weight extraction per the active regime, plus 30d weight-drift series. Authoritative numerics rule preserved — numbers flow from engine-context.ts, never the LLM. |

### K. CI guard / lookahead audit

| File | Status | Purpose |
|------|--------|---------|
| `scripts/check-feature-asof.ts` | NO CHANGE (already shipped P21.1 Wave 6) | Will fail the build if any new `src/lib/regime/` helper lacks `@knowable_at` annotation. **MUST add `@knowable_at` to every regime helper.** |
| `.github/workflows/no-hand-curated-tier-weights.yml` | NO CHANGE (already shipped P20-B-04) | Continues to fail the build if any per-regime weight is hardcoded outside DB rows. |

### L. ROADMAP fix (per D-02)

| File | Line | Change |
|------|------|--------|
| `.planning/ROADMAP.md` | Phase 22 section | **Update** "2-bucket regime" → "4-bucket regime (bull/bear × low-vol/high-vol)" to resolve the REQUIREMENTS↔ROADMAP conflict in favor of REQUIREMENTS (CORE-ML-07). |

---

## Wave Decomposition Recommendation

**Total: 6 plans across 6 waves. Goal-backward order — risky migration before computation; soak before cutover.**

### Wave 0 — Schema + RED stubs (1 plan: `22-00`)
- Prisma migration 1: additive `regime` columns on `SentimentSnapshot`, `LearnedPattern`, `PerSourceIC`, `SourceTier`. `shrinkage_strength` on `SourceTier`. All `DEFAULT 'ALL'`.
- Push to Neon (operator-confirmed checkpoint, mirrors P27-01 precedent).
- RED test stubs for: `classifyRegimeAt`, `getWeightForSource(source, regime, asOf)` signature, `hierarchicalBYBH`, `/api/cron/backfill-regime` checkpoint, sentiment-scan regime write.
- Dependencies: P21.1 ship + 2-week soak (D-01, both already satisfied 2026-06-08).
- Provides: schema for Wave 1.
- Expected duration: ~3 hours.

### Wave 1 — Regime classifier (1 plan: `22-01`)
- `src/lib/regime/classify.ts` + `vix-percentile.ts` + `ma-cross.ts` + `hyperparameters.ts` + `types.ts`.
- VIX (`^VIX`) and SPY/`^GSPC` historical data fetchers with Polygon fallback (D-12).
- 24h Upstash cache keyed by date.
- Sentiment-scan cron writes regime at scan time (CORE-ML-08).
- `@knowable_at` annotations on every helper.
- Tests: unit (cold-start → 'ALL', bull/bear sign, vol threshold boundary); live-Yahoo integration (RUN_LIVE_INTEGRATION gate).
- Depends on: Wave 0.
- Provides: regime classifier for Wave 2.
- Expected duration: ~4 hours.

### Wave 2 — Backfill cron + cutover preparation (1 plan: `22-02`)
- `/api/cron/backfill-regime` one-shot route with P27-style checkpoint.
- Backfills `SentimentSnapshot.regime` over all historical rows (offline-safe; `'ALL'` rows still serve all reads until Wave 5 cutover).
- Backfills `PerSourceIC.regime` over historical rows.
- Sweeps re-runnable on Yahoo/Polygon failure rows (D-12 NULL skip semantics).
- Operator-runs the backfill manually first (dry-run); cron auto-disables after complete pass.
- Depends on: Wave 1.
- Provides: regime-labeled corpus for Wave 3 relearn.
- Expected duration: ~3 hours.

### Wave 3 — Source-tier recompute extension + EB shrinkage (1 plan: `22-03`)
- Extend `source-tier-recompute` cron to iterate per regime (D-07 hybrid: regime-sliced IC → EB shrinkage → softmax).
- EB shrinkage uses `hierarchicalPooledPosterior` clamp pattern (`learning.ts:181`).
- Extend `getWeightForSource(source, regime, asOf)` with D-09 cold-start chain.
- Extend `aggregateCommunitySentimentTierAware` per-row regime read (D-08).
- `shrinkage_strength` persisted to `SourceTier`.
- Unit tests: cold-start chain, EB shrinkage regression to unconditional under low ESS, per-regime softmax independence, mixed-regime aggregation produces per-row weights.
- Depends on: Wave 2 backfill complete.
- Provides: regime-conditional source weights for aggregator.
- Expected duration: ~5 hours.

### Wave 4 — Learn cron + hierarchical BY-FDR + transition exclusion (1 plan: `22-04`)
- Extend `evaluateOneCell` `CellKey` with regime.
- Extend cartesian enumeration in `recomputePerSignalClassPatternMetrics` to include 4 regime buckets + the `'ALL'` aggregate.
- Implement `hierarchicalBYBH` in `src/lib/evaluation/fdr.ts`.
- Replace single `benjaminiYekutieli` call at `learn/route.ts:638` with hierarchical wrapper.
- Implement transition-zone exclusion (D-05): filter weightedObs by regime-flip-in-horizon-window.
- Extend `cell_promoted` / `cell_demoted` LearningEvent delta with `regime` key.
- Tests: hierarchical FDR signal-in-1-regime promotes only that regime; signal-in-all promotes all; noise-in-all promotes none.
- Trigger first full relearn run (manual cron POST).
- **Start 2-week soak window after first successful relearn.**
- Depends on: Waves 2 + 3.
- Provides: regime-conditional `LearnedPattern` rows.
- Expected duration: ~6 hours, plus 14-day soak.

### Wave 5 — Done-gate + Migration 2 (unique constraint flip) + EngineCalibrationPanel "Source mix" row (1 plan: `22-05`)
- **MUST wait for 2-week soak completion (D-13).**
- `src/lib/evaluation/regime-done-gate.ts` + `scripts/phase-22-status.ts`.
- Done-gate evaluation (D-14): count regime-flipped cells where Brier-lift > 0.005 and BCa CI excludes 0.
- Migration 2: flip unique constraints on `LearnedPattern`, `PerSourceIC`, `SourceTier` to include `regime` (irreversible — D-11 step 5).
- Aggregator + learn cron cut over to reading `(source, regime)` weights.
- EngineCalibrationPanel "Source mix" row (D-17) — UI-phase researcher generates UI-SPEC first.
- `engine-context.ts` extension for top-N source surfacing.
- ROADMAP.md update from D-02 (2-bucket → 4-bucket fix).
- Done-gate must pass OR be honestly reported as "0 ACTIVE regime-cells; IS-paper valid finding" per D-16.
- Depends on: Wave 4 + 14-day soak.
- Provides: phase complete.
- Expected duration: ~5 hours.

### Dependency graph (goal-backward)

```
P21.1 ship + 2wk soak (DONE 2026-06-08)
  │
  ▼
Wave 0 (schema migration 1, RED stubs)
  │
  ▼
Wave 1 (regime classifier + sentiment-scan write)
  │
  ▼
Wave 2 (backfill cron + relearn corpus)
  │
  ├──▶ Wave 3 (source-tier recompute + aggregator)
  │
  └──▶ Wave 4 (learn cron + hierarchical BY-FDR + transition exclusion)
              │
              ▼  [14-day relearn soak]
              │
              ▼
        Wave 5 (done-gate + migration 2 + cutover + UI)
```

**Parallelization:** Waves 3 and 4 are independent (different code paths — source-tier vs learn cron) and could run in parallel if `parallelization: true` in config.json. Waves 0, 1, 2 are strictly sequential. Wave 5 is strictly after both 3, 4, AND the soak.

---

## Hierarchical BY-FDR Implementation Pattern

**Reference (canonical):** Benjamini, Y. & Bogomolov, M. (2014). "Selective inference on multiple families of hypotheses." *Journal of the Royal Statistical Society B*, 76(1):297-318.

**Precedent application:** Multi-tissue eQTL analyses in genomics (GTEx consortium); selecting tissue-specific gene-expression QTLs while controlling family-wise FDR across tissues. The structural analog: tissues ↔ regimes; gene-expression hypotheses ↔ cell hypotheses.

### Two-stage algorithm

**Stage 1 (inner) — per-regime BY:**
For each `r ∈ {bull-low-vol, bull-high-vol, bear-low-vol, bear-high-vol}`:
- Collect cell p-values `P_r = {p_1, ..., p_{m_r}}` where `m_r ≈ 157` (current cell count per CONTEXT.md §IS-paper note).
- Apply `benjaminiYekutieli(P_r, q_inner)` → per-regime adjusted q-values `q_r^{adj}`.
- Family-summary statistic: `Q_r = min_i q_{r,i}^{adj}` (the strongest signal in regime r).

**Stage 2 (outer) — meta-BH across regime families:**
- Apply Benjamini-Hochberg to `{Q_r : r ∈ regimes}` at level `q_outer`.
- Regimes failing the outer gate: **demote all rejections** to ACCEPT (no per-regime promotions allowed).
- Regimes passing the outer gate: **preserve inner rejections** as the final promotion list.

### Why this preserves power

A naive single-pass BY across `4 × 157 = 628` p-values would raise the BY harmonic correction `c(m) ≈ ln(628) + 0.577 ≈ 7.0` from `c(157) ≈ 5.6`. That's a 25% denominator inflation per p-value. With sparse signal concentrated in 1-2 regimes, this is enough to wipe out all detection.

Hierarchical: per-regime denominator stays at `c(157) ≈ 5.6`. Outer BH on 4 family-summary statistics adds negligible correction. Net result: only cells in **truly noisy** regimes lose detection.

### Wrong patterns to avoid

- **Bonferroni per regime** — over-conservative; ignores correlation.
- **Pooled BY 4× cells** — under-powered; ignores family structure.
- **Outer Bonferroni instead of BH** — over-conservative at the outer level too. BH at the outer is correct since regime families are exchangeable under H0.
- **Mix of BY (inner) and BH (outer)** — appears asymmetric but is CORRECT. Inner needs dependence robustness (cells correlate via shared market regime within a bucket); outer uses BH because regime families are conditionally independent given the regime-classifier assignment.

### Confidence: HIGH

[CITED: Benjamini & Bogomolov 2014 *JRSS B* 76(1):297-318 — `https://academic.oup.com/jrsssb/article/76/1/297/7075961`]
[VERIFIED: existing `benjaminiYekutieli` at `src/lib/evaluation/fdr.ts:43` is the inner-loop primitive — just needs `hierarchicalBYBH` wrapper added.]

---

## Empirical-Bayes Shrinkage for (source × regime) Weights

### Hybrid recipe (D-07)

```
For each (source, regime) pair:
  1. Compute regime-sliced rolling Spearman IC:
       IC_{s,r} = mean(IC observations where source=s AND regime=r)
       n_{s,r}  = count(IC observations)

  2. Compute unconditional reference:
       IC_{s,ALL} = mean(IC observations where source=s, all regimes)
       n_{s,ALL}  = count

  3. Apply empirical-Bayes shrinkage:
       lambda      = min(50, max(0.5, n_{s,ALL} / max(1, var(IC_{s,r})/n_{s,r})))
       IC_shrunk   = (n_{s,r} * IC_{s,r} + lambda * IC_{s,ALL}) / (n_{s,r} + lambda)
       strength    = lambda / (n_{s,r} + lambda)  ∈ [0, 1]

  4. Persist {source, regime, IC_shrunk, shrinkage_strength, n_{s,r}} as SourceTier row.

Then per regime:
  5. Run softmaxWithCaps over {IC_shrunk for s in sources} with cap_min=0.5, cap_max=5.0.
  6. Persist {source, regime, weight} as SourceTier weight row.
```

### Why this matches industry practice

- **BlackRock SAE (Systematic Active Equity)** runs alpha-source pooling across regimes with shrinkage toward the unconditional alpha-source IC. (Published in Grinold-Kahn 2000, *Active Portfolio Management*, ch. 14.)
- **AQR signal-mixing** uses Bayesian shrinkage of regime-conditional alphas toward the unconditional alpha (Asness, Frazzini, Pedersen 2018, *Quality Minus Junk*, appendix on signal mixing).
- **Two Sigma "regime-aware risk premia"** — published research has consistently used shrinkage estimators for regime-conditional factor exposures (e.g., Pedersen 2015, *Efficiently Inefficient*, ch. 5).
- The Beta-Binomial conjugate update is **literally CLAUDE.md rule #4**: "Priors must regress to a base rate. Use a Beta-Binomial conjugate update (MAP under a Beta prior) so sparse cells shrink toward the global base rate — same logic as ridge regularization."

### Confidence: HIGH

[VERIFIED: `hierarchicalPooledPosterior` at `src/lib/learning.ts:158-189` is the exact same empirical-Bayes pattern; the regime-conditional version reuses the lambda computation verbatim.]
[VERIFIED: `softmaxWithCaps` + `computeSourceWeights` at `src/lib/sentiment/source-tier.ts:54, 97` are the post-shrinkage step; signature unchanged — only the calling cron extends to iterate per regime.]
[CITED: Grinold & Kahn 2000, ch. 14; Asness et al. 2018, appendix; CLAUDE.md rule #4]

---

## Validation Architecture

**Nyquist validation is enabled** (`workflow.nyquist_validation: true` in `.planning/config.json`). This section is mandatory.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (pinned in `package.json`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run <test-file> --reporter=dot` |
| Full suite command | `npm test` (unit) + `npm run test:integration` (live-Neon) |
| Live-DB suite | `RUN_LIVE_INTEGRATION=true npm run test:integration` |
| E2E command | `npm run test:e2e` (Playwright — for EngineCalibrationPanel only) |
| Lookahead audit | `npm run check-feature-asof` (shipped P21.1 Wave 6) |
| Phase status gate | `npm run phase-22-status` (new in Wave 5) |
| Type check | `npx tsc --noEmit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command (< 30s) | File Exists? |
|--------|----------|-----------|---------------------------|-------------|
| CORE-ML-06 | `LearnedPattern.regime` column writable; unique constraint enforced post-cutover | live-DB integration | `npx vitest run src/lib/__tests__/learned-pattern-regime.test.ts -x` | ❌ Wave 0 RED stub |
| CORE-ML-07 | `classifyRegimeAt({asOf})` returns deterministic regime label given VIX + SPY inputs | unit | `npx vitest run src/lib/regime/__tests__/classify.test.ts -x` | ❌ Wave 1 RED stub |
| CORE-ML-07 | `getVix60dPercentile` + `getSpyMaCross` fetch correctly from Yahoo with Polygon fallback | live-Yahoo integration | `RUN_LIVE_INTEGRATION=true npx vitest run src/lib/regime/__tests__/vix-percentile.live.test.ts -x` | ❌ Wave 1 (skipped by default) |
| CORE-ML-08 | Sentiment-scan writes `SentimentSnapshot.regime` at scan time | integration | `npx vitest run src/app/api/cron/__tests__/sentiment-scan-regime.test.ts -x` | ❌ Wave 1 RED stub |
| CORE-ML-08 | Backfill cron writes historical regimes via PIT classifier | integration | `npx vitest run src/app/api/cron/__tests__/backfill-regime.test.ts -x` | ❌ Wave 2 RED stub |
| CORE-ML-09 | EngineCalibrationPanel displays regime label + "Source mix" row | RTL component | `npx vitest run src/components/__tests__/EngineCalibrationPanel.test.tsx -x` | ✅ extend |
| CORE-ML-09 | EngineCalibrationPanel renders without regression for `regime='ALL'` (cold-start) | RTL component | same file | ✅ extend |
| CORE-ML-10 | Transition-zone exclusion drops events crossing regime boundary inside horizon | unit | `npx vitest run src/app/api/cron/__tests__/learn-transition-exclusion.test.ts -x` | ❌ Wave 4 RED stub |
| CORE-ML-20 | Source-tier recompute emits per-regime rows via EB shrinkage | integration | `npx vitest run src/app/api/cron/__tests__/source-tier-regime.test.ts -x` | ❌ Wave 3 RED stub |
| CORE-ML-20 | EB shrinkage regresses sparse regime cells to unconditional | unit | `npx vitest run src/lib/sentiment/__tests__/source-tier-eb.test.ts -x` | ❌ Wave 3 RED stub |
| CORE-ML-21 | `getWeightForSource(source, regime, asOf)` follows cold-start chain D-09 | unit | `npx vitest run src/lib/sentiment/__tests__/source-tier.test.ts -x` | ✅ extend |
| CORE-ML-21 | Aggregator reads regime from snapshot row PIT-correctly | unit | `npx vitest run src/lib/sentiment/__tests__/aggregator-regime.test.ts -x` | ❌ Wave 3 RED stub |
| CORE-ML-21 | Mixed-regime windows produce per-row weights | unit | same file | ❌ Wave 3 |
| CORE-ML-22 | "Source mix" row shows top-3 + click-to-expand + sparkline | RTL + Playwright | RTL: same as CORE-ML-09 file; Playwright: `npx playwright test tests/e2e/source-mix.spec.ts` | ❌ Wave 5 |
| D-14 (done-gate) | Regime-flipped cell Brier-lift > 0.005 with BCa CI excluding 0 → promotion | unit | `npx vitest run src/lib/evaluation/__tests__/regime-done-gate.test.ts -x` | ❌ Wave 5 RED stub |
| D-15 | `hierarchicalBYBH` — signal-in-1-regime promotes only that regime | unit | `npx vitest run src/lib/evaluation/__tests__/fdr-hierarchical.test.ts -x` | ❌ Wave 4 RED stub |
| D-15 | `hierarchicalBYBH` — noise-in-all promotes none | unit | same file | ❌ Wave 4 |
| D-15 | `hierarchicalBYBH` — signal-in-all promotes all | unit | same file | ❌ Wave 4 |
| Composite | `learn` cron two-pass produces per-regime CellEvalResults | live-DB integration | `RUN_LIVE_INTEGRATION=true npx vitest run src/app/api/cron/__tests__/learn-regime-two-pass.test.ts -x` | ❌ Wave 4 (skipped by default) |
| Phase gate | `phase-22-status` exits 0 OR honestly reports 0 ACTIVE regime cells per D-16 | composite script | `npm run phase-22-status` | ❌ Wave 5 |
| CI guard | All new regime helpers carry `@knowable_at` | CI grep | `npm run check-feature-asof` | ✅ exists |
| CI guard | No hand-curated per-regime weights | CI grep | `npm run lint` (workflow already exists) | ✅ exists |

### Sampling Rate
- **Per task commit:** `npx vitest run <changed-test-file>` + `npx tsc --noEmit` (< 60s combined for any single wave's test footprint).
- **Per wave merge:** `npm test` (full unit suite — current baseline ~1815 tests passing; target ≤ +60s wall time after P22).
- **Per phase gate:** `npm run phase-22-status` after Wave 5 + 14-day soak. Must report either "≥1 regime-flipped cell passes done-gate" OR "0 cells, IS-paper valid null finding."

### Wave 0 Gaps
- [ ] `src/lib/regime/__tests__/classify.test.ts` — RED stub covering CORE-ML-07
- [ ] `src/app/api/cron/__tests__/sentiment-scan-regime.test.ts` — RED stub covering CORE-ML-08
- [ ] `src/app/api/cron/__tests__/backfill-regime.test.ts` — RED stub covering CORE-ML-08 backfill path
- [ ] `src/lib/__tests__/learned-pattern-regime.test.ts` — live-DB schema test (CORE-ML-06)
- [ ] `src/lib/evaluation/__tests__/fdr-hierarchical.test.ts` — RED stub covering D-15
- [ ] `src/lib/sentiment/__tests__/source-tier-eb.test.ts` — RED stub covering D-07 EB shrinkage
- [ ] `src/lib/sentiment/__tests__/aggregator-regime.test.ts` — RED stub covering D-08 PIT read
- [ ] `src/app/api/cron/__tests__/learn-transition-exclusion.test.ts` — RED stub covering D-05
- [ ] `src/lib/evaluation/__tests__/regime-done-gate.test.ts` — RED stub covering D-14

**Framework installation:** None needed (Vitest + Playwright + Vercel functions already installed and configured).

---

## Security Domain

`security_enforcement` is not explicitly disabled in `.planning/config.json`; treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | NextAuth Google — unchanged; new cron route reuses `Bearer CRON_SECRET` guard (same as all existing crons) |
| V3 Session Management | no | No new session paths |
| V4 Access Control | yes | New `/api/cron/backfill-regime` enforces `Authorization: Bearer ${CRON_SECRET}` — pattern mirrors `learn/route.ts` |
| V5 Input Validation | yes | `zod` schema validation on `REGIME_HYPERPARAMETERS` module-load (mirrors `source-tier-hyperparameters.ts:46`) |
| V6 Cryptography | no | No new cryptographic surface |
| V9 Communications | yes | Yahoo + Polygon fetches use existing wrappers with telemetry (`withTelemetry`); circuit-breaker from P30 applies automatically |
| V13 Configuration | yes | `vercel.json` cron-route addition is reviewable in PR; no env-var override path for regime hyperparameters (T-20-B-04-04 principle) |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated cron invocation | Spoofing | `Bearer CRON_SECRET` guard on `/api/cron/backfill-regime`; replay-resistant via Vercel's per-deployment secrets |
| Hand-curated regime labels in code | Tampering | Existing `no-hand-curated-tier-weights` CI workflow (`.github/workflows/`) — extend grep list with regime label tokens |
| Lookahead bias in regime classifier | Integrity / Information Disclosure | `@knowable_at` annotations on all regime helpers; `check-feature-asof` CI guard from P21.1 Wave 6 enforces |
| VIX/SPY fetcher exposes API keys | Information Disclosure | Existing `ProviderCallLog` telemetry redacts; no new secret surface — reuses `YAHOO_*` / `POLYGON_*` env vars |
| Per-regime weight drift unnoticed | Repudiation | `LearningEvent` of new type `regime_promoted` / `regime_demoted` with full audit context per D-15 |
| Migration data loss (unique-constraint flip) | Denial of Service | Phased cutover D-11 — steps 1-3 reversible; operator-confirmed checkpoint per P27 precedent |

---

## Risk Register

### R1: Sparsity under 4-bucket regime split — HIGH likelihood / MEDIUM impact
**Risk:** 4× cell space inflation means each regime cell sees ~25% of unconditional observations. ESS-30 gate may starve regime cells of promotions.
**Mitigation:** D-07 EB shrinkage regresses sparse regime weights to unconditional. D-15 hierarchical FDR preserves per-regime detection power. D-16 keeps ESS≥30 — "0 ACTIVE cells in a regime is a valid IS-paper finding" per the depth-over-features framing in `[[is-symposium-framing-summer-2026]]`.
**Acceptance:** Honest reporting. If 0 cells clear all 5 gates in a regime after the soak, that IS the answer.

### R2: Cold-start contamination during backfill — MEDIUM likelihood / HIGH impact
**Risk:** Backfill cron writes historical regime labels for SentimentSnapshot rows, but if VIX/SPY history has gaps (holidays, vendor outages), some rows get `regime=NULL`. If the relearn touches those rows before backfill completes, they get mis-attributed to `'ALL'` indefinitely.
**Mitigation:** D-12 — Yahoo primary, Polygon fallback, prior-trading-day fallback. NULL-only rows are explicitly EXCLUDED from regime-conditional learning (D-12 says "logged + skipped"; re-runnable). Wave 2 strict-gates Wave 3 — relearn does not start until backfill operator-confirms completion.
**Acceptance:** Operator-confirmed checkpoint between Waves 2 and 3, mirroring P27-01 DB-push pattern.

### R3: BY-FDR denominator interactions — MEDIUM likelihood / MEDIUM impact
**Risk:** Existing single-pass BY at `learn/route.ts:638` is currently the only FDR primitive in the engine. Subtle bugs in hierarchical wrapper (e.g., miscounting per-regime m, wrong outer correction) could either over-promote (false discoveries) or under-promote (lost edge).
**Mitigation:** Reference test cases from Benjamini-Bogomolov 2014 paper appendix; multi-tissue eQTL synthetic data is a documented testbed. Unit tests must cover (a) signal-in-1-regime, (b) signal-in-all, (c) noise-in-all, (d) edge cases (empty regime panel, single cell per regime). The existing 4-test BY-FDR suite in `learn-promotion-event.test.ts` is the precedent.
**Acceptance:** Hierarchical FDR unit suite passes; integration test on real cell-eval data shows monotonic q-values within each regime.

### R4: Transition-zone edge cases — MEDIUM likelihood / MEDIUM impact
**Risk:** D-05 says "drop predictions if regime flips inside `(prediction_t, prediction_t + horizon_days]`." But what if regime flips ON the boundary day? What if regime is `NULL` (backfill gap) on either end?
**Mitigation:** Specify boundary semantics in `src/lib/regime/types.ts`: inclusive of `prediction_t`, exclusive of `prediction_t + horizon_days` (right-open interval — same convention as P21.1's purgedKFold embargo). NULL ends = treat as same-regime (no flip detected, no exclusion — fail-open since the relearn already excludes NULL rows from regime-conditional cells).
**Acceptance:** Unit tests covering: same-regime → keep; flip mid-window → exclude; flip on boundary → exclude (strict); NULL at start or end → keep (no flip detectable).

### R5: Unique-constraint flip irreversibility (D-11 step 4) — LOW likelihood / HIGH impact
**Risk:** Migration 2 flips `@@unique` to include `regime`. Once flipped, rolling back requires consolidating multiple per-regime rows into a single unconditional row — destructive and complex.
**Mitigation:** Phased cutover D-11: steps 1-3 are reversible (drop additive columns, re-seed via cron). Step 4 only runs after the 14-day soak in Wave 4 AND the done-gate D-14 either passes OR is honestly reported as a null IS-paper finding. Operator-confirmed checkpoint before step 4.
**Acceptance:** Wave 5 plan splits the unique-constraint flip into a separate Wave 5b "checkpoint:human-action" task, mirroring P27-01 DB-push precedent. Operator confirms via manual approval.

### R6: VIX (`^VIX`) symbol availability — LOW likelihood / MEDIUM impact
**Risk:** `^VIX` is the Cboe Volatility Index ticker on Yahoo. If Yahoo deprecates or renames the symbol (unlikely but possible), the regime classifier breaks.
**Mitigation:** Polygon fallback (D-12) covers VIX via their `I:VIX` ticker. Add a unit test that the fallback path activates when Yahoo returns null. Document VIX symbol resolution in `src/lib/regime/vix-percentile.ts` header.
**Acceptance:** Polygon fallback test passes; production telemetry alarms on consecutive Yahoo VIX failures (existing P30 circuit breaker pattern).

### R7: EngineCalibrationPanel UI regression (Phase 21.1 baseline) — LOW likelihood / LOW impact
**Risk:** The panel at L897 is a 170-line component already extended by P21.1 and P20. Adding a "Source mix" row risks visual regression on existing rows.
**Mitigation:** UI-phase researcher generates UI-SPEC.md before Wave 5 implementation (per `workflow.ui_phase: true` in config.json). RTL test extends existing component test suite, with regression assertions on existing-row layout.
**Acceptance:** UI-SPEC approved, existing tests still green, new tests cover "Source mix" row.

---

## Open Questions for the Planner

These are gray-area decisions the CONTEXT.md did NOT lock. Each is `Claude's Discretion` per D-XX or omitted entirely. Planner picks; the picks get documented in `HYPERPARAMETERS.md`.

### Q1: Should the `'ALL'` aggregate row continue to be written after Wave 5 cutover?
**What we know:** D-09 cold-start chain requires `(source, 'ALL')` rows to exist as the second-tier fallback. So yes, the unconditional row must persist.
**What's unclear:** Should `LearnedPattern` also retain its `'ALL'` row for the same reason (aggregator falling back if regime classifier returns 'ALL')?
**Recommendation:** YES. Write both per-regime AND `'ALL'` rows in the relearn. Aggregator falls back gracefully on cold-start. Cost: 5× row count instead of 4×; negligible Neon storage.

### Q2: VIX percentile threshold — 50th or 70th?
**What we know:** D-04 locks the 50th-percentile split.
**What's unclear:** No sensitivity sweep specified. Wave 6-style sweep could revisit, but D-04 doesn't request one.
**Recommendation:** Honor D-04. Document HYPERPARAMETERS.md with citation and leave a TODO for future sensitivity sweep if the done-gate produces an unexpected null finding.

### Q3: Should `LearningEvent.delta` get a top-level `regime` key or nest it inside the existing payload?
**What we know:** P21.1 Wave 4 added `regime` to cell evaluations but did not extend the LearningEvent schema for regime.
**What's unclear:** Schema extension vs nested JSON.
**Recommendation:** Top-level `regime` String on `LearningEvent`, additive nullable column. Mirrors the established pattern (signal_class, pattern_key, cap_class, horizon_days are all top-level on `LearningEvent` already at `prisma/schema.prisma:215-230`). Enables direct WHERE filtering for the dashboard.

### Q4: Should the EngineCalibrationPanel "Source mix" sparkline be rendered server-side (RSC) or client-side?
**What we know:** D-17 mandates the row + click-to-expand; existing panel mixes RSC + 'use client' islands (`WatchBadge.tsx:22`).
**What's unclear:** SVG generation location.
**Recommendation:** UI-phase researcher decides. Default to RSC for the always-visible top-3 row, client-side for the expanded sparkline (small interactivity surface).

### Q5: Should `/api/cron/backfill-regime` write a `LearningEvent` per ticker completion checkpoint?
**What we know:** P27 backfill used CHECKPOINT_FILE pattern; doesn't write to LearningEvent.
**What's unclear:** Whether regime-backfill progress should be visible in /insights/learning-feed.
**Recommendation:** No. Backfill is operational, not learning. Use existing `ProviderCallLog` telemetry from P20-Z-03. Adding LearningEvent rows would pollute the cell-promotion audit trail.

### Q6: Where does the regime label appear in the Engine Calibration Context block injected into Gemini prompts?
**What we know:** CORE-ML-09 says "regime label appears in the EngineCalibration block ('Current regime: bull / low-vol')."
**What's unclear:** Whether this is just for the UI panel or also threaded into the LLM prompt via `research-brief.ts`.
**Recommendation:** Include in BOTH. The prompt context block already surfaces composite signal posteriors; add a single line "Current regime: bull-low-vol (VIX 60d %ile: 0.32, MA50-MA200: +12.4)" right above the per-class posterior breakdown. Gemini consumes the context but never produces the regime number — authoritative-numerics rule preserved.

### Q7: Should the done-gate count regime-flipped cells against the pre-P22 baseline or the post-Wave 4 `'ALL'` baseline?
**What we know:** D-14 says "vs the `regime='ALL'` baseline aggregated across regimes."
**What's unclear:** Whether "aggregated across regimes" means the live `'ALL'` row (computed during the relearn) or a frozen pre-P22 snapshot.
**Recommendation:** Use the live `'ALL'` row. It's the apples-to-apples comparison: same observation pool, same time window, same outcome stream — just with regime aggregated out. This matches P21.1's Brier-lift convention (`brier_null - brier_out` over the same fold).

---

## Common Pitfalls

### Pitfall 1: Reading regime from `getCurrentRegime()` at aggregation time
**What goes wrong:** Aggregator looks up "current regime" rather than the snapshot's recorded regime. Lookahead bias — backfill aggregations would use a regime that didn't exist at the snapshot's PIT.
**Why it happens:** Convenience — `getCurrentRegime()` is a one-liner.
**How to avoid:** D-08 mandates the regime read comes from `SentimentSnapshot.regime`. Aggregator's `AggregatorInputs` gets a `regime` field. NEVER call `classifyRegimeAt({ asOf: new Date() })` from the aggregator.
**Warning signs:** Lookahead-bias test (P20-Z-07 precedent at `src/lib/sentiment/__tests__/lookahead-bias.test.ts`) fires on regime fields.

### Pitfall 2: Per-regime softmax over un-shrunk IC
**What goes wrong:** Sparse regime cells produce noisy IC means; softmax converts noise into extreme weights; clamped softmax `[0.5, 5.0]` papers over but doesn't fix.
**Why it happens:** "Softmax already handles outliers via cap" feels true but the cap loses information.
**How to avoid:** D-07 EB shrinkage MUST run before softmax. The recompute cron iterates `IC → shrink → softmax`, not `IC → softmax → shrink`.
**Warning signs:** Per-regime weights show extreme bimodality (everything at 0.5 or 5.0); `shrinkage_strength` is near 1 (all signal from EB prior, none from regime data).

### Pitfall 3: Naive BY over the 4×-expanded cell space
**What goes wrong:** Calling `benjaminiYekutieli(allPValuesAcrossAllRegimes, 0.10)` raises `c(m)` from 5.6 to 7.0, deflating per-regime power by ~25%. The done-gate fails because no cells clear FDR.
**Why it happens:** It's the path-of-least-resistance refactor — just change the loop bounds.
**How to avoid:** D-15 hierarchical wrapper. Replace the single `benjaminiYekutieli` call at `learn/route.ts:638` with `hierarchicalBYBH`. Hierarchical structure is mandatory, not optional.
**Warning signs:** Wave 4 done-gate Wave 5 shows 0 promoted cells across all regimes; existing P21.1 baseline used to promote 2-5 cells.

### Pitfall 4: Forgetting to backfill `PerSourceIC.regime` before relearn
**What goes wrong:** Source-tier-recompute runs on a partially-backfilled `PerSourceIC` panel. Regime-sliced IC means computed against rows where most have `regime='ALL'`. EB shrinkage looks fine but the regime-conditional signal is washed out.
**Why it happens:** PerSourceIC is implicit prior infrastructure — easy to forget it's also in the cell space.
**How to avoid:** Wave 2 backfill cron MUST sweep both `SentimentSnapshot` AND `PerSourceIC`. Wave 3 source-tier-recompute is gated on Wave 2 operator-confirmation.
**Warning signs:** Per-regime SourceTier rows show suspiciously low n_observations relative to SentimentSnapshot backfill counts.

### Pitfall 5: Transition-zone exclusion silently dropping all evidence
**What goes wrong:** D-05 boundary semantics are ambiguous; over-exclusion drops every observation whose horizon crossed a regime flip, including legitimate same-regime predictions.
**Why it happens:** Boundary handling is one of those "I'll fix the edge cases later" things.
**How to avoid:** Strict semantics: exclude IFF regime at `outcome.recorded_at` differs from regime at `snapshot.scanned_at`. Implement via `if (predictionRegime !== outcomeRegime) skip;`. NULL ends do NOT trigger exclusion (R4 above).
**Warning signs:** Sample size drops > 30% after transition-exclusion is enabled. Compare pre/post counts via integration test.

### Pitfall 6: VIX/SPY history fetch blowing up in backfill
**What goes wrong:** Backfill cron iterates per `scanned_at` and calls `yf.chart('^VIX')` per row. 200k rows × ~500ms per Yahoo call = ~28 hours; rate limits kick in; cron times out at `maxDuration: 800`.
**Why it happens:** Per-row fetch instead of batched.
**How to avoid:** Discretion-area: fetch VIX + SPY history ONCE (one long-window chart query covering the full backfill range), then map per scanned_at by date-key. Cache via Upstash keyed by `vix_history:full_range:{computed_at_date}` with 24h TTL.
**Warning signs:** Backfill cron logs show high Yahoo call rate; ProviderCallLog shows VIX latency p99 > 2s.

---

## Code Examples

### Example 1: Regime classifier (full signature + cold-start)

```typescript
// Source: pattern from src/lib/labels/compute.ts:60 (P21.1 Wave 2)
// File: src/lib/regime/classify.ts

import { getVix60dPercentile } from './vix-percentile';
import { getSpyMaCross } from './ma-cross';
import { REGIME_HYPERPARAMETERS } from './hyperparameters';
import type { RegimeLabel } from './types';

export interface RegimeResult {
  regime: RegimeLabel;                  // 'bull-low-vol' | 'bull-high-vol' | 'bear-low-vol' | 'bear-high-vol' | 'ALL'
  vix_level: number | null;             // raw VIX close on asOf
  vix_60d_percentile: number | null;    // [0, 1]
  spy_ma_50_minus_200: number | null;
}

/**
 * Phase 22 — D-02..D-04. Pure functional regime classifier.
 *
 * Cold-start: if either VIX or SPY MA data unavailable for asOf,
 * returns regime='ALL' (unconditional fallback per D-09).
 *
 * @knowable_at args.asOf — only data with timestamp <= asOf is consulted;
 *                          no forward data used.
 */
export async function classifyRegimeAt(args: {
  asOf: Date;
}): Promise<RegimeResult> {
  const [vix, spy] = await Promise.all([
    getVix60dPercentile(args.asOf),
    getSpyMaCross(args.asOf),
  ]);

  if (vix == null || spy == null) {
    return {
      regime: 'ALL',
      vix_level: null,
      vix_60d_percentile: null,
      spy_ma_50_minus_200: null,
    };
  }

  const trend: 'bull' | 'bear' = spy.ma50_minus_ma200 >= 0 ? 'bull' : 'bear';
  const vol: 'low-vol' | 'high-vol' =
    vix.percentile_60d >= REGIME_HYPERPARAMETERS.vix_percentile_threshold
      ? 'high-vol'
      : 'low-vol';

  return {
    regime: `${trend}-${vol}` as RegimeLabel,
    vix_level: vix.level,
    vix_60d_percentile: vix.percentile_60d,
    spy_ma_50_minus_200: spy.ma50_minus_ma200,
  };
}
```

### Example 2: `getWeightForSource` with D-09 cold-start chain

```typescript
// Source: extension of src/lib/sentiment/source-tier.ts:143
// File: src/lib/sentiment/source-tier.ts (modified)

import type { RegimeLabel } from '@/lib/regime/types';

export async function getWeightForSource(
  source_id: string,
  regime: RegimeLabel,           // NEW arg per D-08
  asOf: Date,
): Promise<number> {
  try {
    const { prisma } = await import('@/lib/db');

    // D-09 cold-start chain step 1: (source_id, regime)
    if (regime !== 'ALL') {
      const exact = await prisma.sourceTier.findFirst({
        where: { source_id, regime, computed_at: { lte: asOf } },
        orderBy: { computed_at: 'desc' },
        select: { weight: true },
      });
      if (exact) return exact.weight;
    }

    // D-09 step 2: (source_id, 'ALL') — unconditional fallback
    const unconditional = await prisma.sourceTier.findFirst({
      where: { source_id, regime: 'ALL', computed_at: { lte: asOf } },
      orderBy: { computed_at: 'desc' },
      select: { weight: true },
    });
    if (unconditional) return unconditional.weight;

    // D-09 step 3: cold-start hardcoded 1.0
    return 1.0;
  } catch {
    return 1.0;
  }
}
```

### Example 3: Hierarchical BY-FDR call site in learn cron

```typescript
// Source: extension of src/app/api/cron/learn/route.ts:637-641
// File: src/app/api/cron/learn/route.ts (modified)

import { hierarchicalBYBH } from '@/lib/evaluation/fdr';
import type { RegimeLabel } from '@/lib/regime/types';
const REGIMES: RegimeLabel[] = ['bull-low-vol', 'bull-high-vol', 'bear-low-vol', 'bear-high-vol', 'ALL'];

// ... after PASS 1 collects all cellEvals ...

// Group by regime for hierarchical FDR (D-15)
const pValuesByRegime: Record<RegimeLabel, number[]> = Object.fromEntries(
  REGIMES.map((r) => [r, [] as number[]])
) as Record<RegimeLabel, number[]>;

const evalIndexInRegime = new Map<string, number>();
for (const ev of cellEvals) {
  const arr = pValuesByRegime[ev.key.regime];
  evalIndexInRegime.set(ev.cellKey, arr.length);
  arr.push(ev.p_value);
}

// Hierarchical BY-FDR per Benjamini-Bogomolov 2014
const hier = hierarchicalBYBH(pValuesByRegime, 0.10, 0.10);

// PASS 2 receives per-regime adjusted q-values
const adjustedPByCell = new Map<string, number>();
for (const ev of cellEvals) {
  const regimeQs = hier.per_regime[ev.key.regime].adjusted_p;
  const idx = evalIndexInRegime.get(ev.cellKey)!;
  const passedOuterGate = hier.meta_bh_decisions[ev.key.regime] === 'REJECT';
  // If the regime family failed the outer BH gate, demote ALL inner rejections
  adjustedPByCell.set(ev.cellKey, passedOuterGate ? regimeQs[idx] : 1.0);
}

await applyPatternStatusAndEmitEvents(cellEvals, adjustedPByCell);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single regime "average" cells | 4-bucket regime conditioning | This phase | Engine learns regime-specific edges |
| Single-pass BY across all cells | Hierarchical BY (per-regime) → BH (across regimes) | This phase | Preserves per-regime power; FDR rigorous |
| Unconditional source weights | (source × regime) weights with EB shrinkage | This phase | Source authority varies by regime (matches industry practice) |
| Hand-rolled regime detection (HMM) | Rule-based VIX percentile + SPY MA cross | D-03 | PIT-correct, deterministic, no inference latency |
| Fixed VIX=20 threshold | Rolling 60d 50th-percentile | D-04 | Auto-adapts to regime drift over years |
| Random splits / chronological splits | Purged K-Fold + Embargo (P21.1) | (preserved) | Lookahead-bias defense |
| Hit-rate as gate | Brier-lift + BCa CI excluding 0 (P21.1) | (preserved + extended D-14) | Proper scoring rule |

**Deprecated/outdated:**
- Pre-P22 `LearnedPattern` cells without regime dimension: persist as `regime='ALL'` for back-compat (D-09 cold-start chain). After Wave 5 cutover, these become the unconditional fallback row.
- Pre-P22 `SourceTier` rows: similarly persist as `regime='ALL'`. Source-tier-recompute extends to emit per-regime rows alongside.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Yahoo Finance `^VIX` symbol remains available through P22 + soak window (~6 weeks) | Standard Stack, R6 | Medium — Polygon fallback covers; but if both fail, regime classifier degrades to `'ALL'`; engine remains functional but no regime conditioning |
| A2 | Cell-space inflation from 504 → 2,520 is within Neon's per-row constraints + cron `maxDuration: 300` envelope | Wave 4, Pitfall 6 | Low-Medium — sequential per-cell evaluation is already proven on 504 cells. 5× scaling could push past 300s; mitigation: bump `maxDuration: 800` for learn cron during P22 |
| A3 | `hierarchicalPooledPosterior` clamp pattern (lambda ∈ [0.5, 50]) transfers cleanly to (source × regime) shrinkage | EB Pattern | Low — same Beta-Binomial math; the constants may need re-tuning via HYPERPARAMETERS.md sweep |
| A4 | EngineCalibrationPanel L897 region accepts a new "Source mix" row without major refactor of the surrounding component structure | File-by-file map J | Low — component is already ~170 lines with multiple expandable sections; one more row fits the existing pattern |
| A5 | Backfill cron can complete VIX/SPY history fetches within the soak window (~14 days) | Wave 2, Pitfall 6 | Low if batched fetch (Pitfall 6 mitigation); High if per-row fetch — but Pitfall 6 explicitly flags this |
| A6 | 2-week soak D-13 is sufficient for ESS≥30 + live≥10 to clear in at least 1 regime | Done-gate D-14 | Medium — IS-paper-honest reporting (D-16) accepts "0 cells, valid finding" outcome; not a project risk, only an outcome risk |
| A7 | `regime_promoted` / `regime_demoted` LearningEvent types (or `cell_promoted` with regime in delta) are the right shape for dashboard consumption | Q3 | Low — dashboard already reads delta payloads (P21.1 Wave 4 precedent) |

---

## Sources

### Primary (HIGH confidence)
- **`src/lib/sentiment/source-tier.ts`** — clamped softmax + cold-start + 1.0 fallback patterns (existing P20-B-04 code, verified)
- **`src/lib/learning.ts:158-189`** — empirical-Bayes hierarchical pooling (`hierarchicalPooledPosterior`); λ ∈ [0.5, 50] clamp; pure functional pattern
- **`src/lib/evaluation/fdr.ts:43`** — Benjamini-Yekutieli BY implementation with adjusted-p output (existing P21.1 Wave 1 code)
- **`src/lib/evaluation/bootstrap.ts:120`** — BCa bootstrap with n<10 percentile fallback (existing P21.1 Wave 1 code)
- **`src/lib/labels/compute.ts:60`** — pure-functional async helper pattern with `@knowable_at` annotation (P21.1 Wave 2)
- **`src/lib/data/sector-mapping.ts:175`** — `getSectorSigma60d` 60d-rolling pattern with Upstash cache + Yahoo primary + 24h TTL — template for `getVix60dPercentile`
- **`src/app/api/cron/learn/route.ts:552-1057`** — Two-pass BY-FDR architecture (P21.1 Wave 4); `evaluateOneCell` + `applyPatternStatusAndEmitEvents`
- **`prisma/schema.prisma:122,351,582`** — `LearnedPattern`, `PerSourceIC`, `SourceTier` model definitions confirmed
- **`prisma/schema.prisma:42`** — `SentimentSnapshot` confirmed; CORE-ML-08 extension target
- **`.planning/phases/22-market-regime-and-source-weights/22-CONTEXT.md`** — 17 locked decisions D-01..D-17
- **`.planning/REQUIREMENTS.md` lines 20-26** — CORE-ML-06..10 verbatim (4-bucket per CORE-ML-07)
- **`CLAUDE.md` "Load-bearing rules" #1-#8** — statistical methodology mandates
- **`.planning/phases/21.1-capacity-to-detect-edge/21.1-CONTEXT.md`** — P21.1 5-gate + Wave 4 two-pass architecture (composed, not replaced)
- **`.planning/phases/21.1-capacity-to-detect-edge/21.1-04-SUMMARY.md`** — Wave 4 BY-FDR two-pass implementation details

### Secondary (MEDIUM confidence — methodology references)
- **Benjamini & Bogomolov 2014** — "Selective inference on multiple families of hypotheses." *JRSS B* 76(1):297-318 — canonical hierarchical FDR
- **Hamilton 1989** — "A new approach to the economic analysis of nonstationary time series and the business cycle." *Econometrica* 57:357-384 — Markov-switching regimes (D-02 reference)
- **Ang & Bekaert 2002** — "International asset allocation with regime shifts." *Review of Financial Studies* 15:1137-1187 — equity regime detection (D-02 reference)
- **Efron 1987** — "Better bootstrap confidence intervals." *JASA* 82(397):171-185 — BCa method (existing reuse, D-14)
- **Grinold & Kahn 2000** — *Active Portfolio Management*, 2nd ed., ch. 14 — alpha-source pooling (D-07 industry precedent)
- **Asness, Frazzini, Pedersen 2018** — *Quality Minus Junk* appendix — signal mixing (D-07 industry precedent)
- **López de Prado 2018** — *Advances in Financial Machine Learning* — purged K-Fold + embargo (existing reuse)
- **Stein 1956** + **Efron-Morris 1973** — empirical-Bayes shrinkage foundations (CLAUDE.md rule #4 reference)

### Tertiary (LOW confidence — verify if load-bearing)
- None for this phase. All claims trace to either in-repo code (HIGH) or canonical statistical literature already cited in CLAUDE.md (MEDIUM).

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every required primitive exists in-repo; no new npm packages
- Architecture extension: **HIGH** — extension points verified at line-number granularity in source files
- Statistical methodology: **HIGH** — every method (hierarchical BY-FDR, EB shrinkage, BCa, clamped softmax) cited to canonical literature already in CLAUDE.md
- Regime classifier: **MEDIUM-HIGH** — rule-based logic is straightforward; Yahoo `^VIX` symbol availability is A1 assumption
- Backfill operational risk: **MEDIUM** — Pitfall 6 + R2 require operator-confirmed checkpoints; mitigations identified
- Done-gate outcome: **N/A** — D-16 explicitly accepts "0 cells" as valid IS-paper finding

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 (30 days — methodology stable; Yahoo `^VIX` availability is the only fast-moving dependency)

**Phase: 22-market-regime-and-source-weights**
**Driver: gsd-phase-researcher**
**Drives downstream: gsd-planner (6 plans expected), gsd-executor**
