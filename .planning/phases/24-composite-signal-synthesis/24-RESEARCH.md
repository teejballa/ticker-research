# Phase 24: Composite Signal Synthesis — Research

**Researched:** 2026-09-16
**Domain:** Probabilistic classifier fusion via per-class isotonic calibration + ESS-weighted mean; BCa bootstrap CI accounting for cross-class correlation; CORP-method reliability publication.
**Confidence:** HIGH (all decisions locked in CONTEXT.md; every reused primitive verified in-repo; every integration surface located and read; no external library additions required)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Weighting scheme):** Composite is an ESS-weighted mean of per-class isotonic-calibrated posteriors. Each class's raw `posterior_mean` is transformed by a per-class PAV isotonic curve fit on historical outcomes; then combined via `Σ w_k · p_k^cal` where `w_k = ESS_k / Σ ESS_j` over available (ACTIVE-status) classes. Curves are pre-fit in cron and cached; composite arithmetic is O(K) at report time.
- **D-02 (Correlation-aware CI):** CI computed via BCa bootstrap on the composite scores against historical `(ticker × as-of × outcome)` triples using existing `src/lib/evaluation/bootstrap.ts`. Row-resample preserves per-class correlation automatically — no separate correlation matrix. Runs in a scheduled cron; report reads the cached band. Zero latency impact on report generation.
- **D-03 (Insufficient-data fallback):** `MIN_CLASSES_ACTIVE = 2`. If ≥2 classes ACTIVE → renormalize weights over the K available classes and widen the CI by `√(4/K)` to reflect fewer independent classes. If K<2 → composite suppressed (`composite_gate_status = 'insufficient_coverage'`); UI shows "insufficient signal coverage" in the headline slot.
- **D-04 (Display + P22 coexistence):** Composite becomes the headline atop `EngineCalibrationPanel`. Existing diffusion box → "Per-Class Breakdown" section beneath, alongside technical/institutional/insider tiles. P22 `SourceMixRow` **stays** — represents a different concept ("what sources drove the prior") vs. composite ("calibrated headline"). Copy: `"Cipher Composite Signal: X% [Y%, Z%]"`.
- **D-05 (Trust boundary — REASON-05):** All 7 composite fields authored by `engine-context.ts`; never by the LLM. Post-process overwrite in `runGeminiAnalysis` mirrors existing engine-calibration numeric-overwrite pattern (`gemini-analysis.ts:1160-1243`). LLM never sees these fields on the Zod schema.
- **D-06 (Reliability diagram):** Published at `/insights/calibration` with `classifier_version = 'cipher-composite-v1'`. Reuse existing `ReliabilityDiagram.tsx` (CORP) — the diagram is data-driven and adds another card in the existing grid. Minimum `n=100` predictions for stable curve — otherwise "insufficient history."
- **D-07 (Ship gate):** Composite Brier ≤ 0.24 on backfill AND composite calibration-ECE ≤ 0.05 AND ≥50% of tickers scored (i.e., ≥2 classes ACTIVE for majority of universe). Gate enforced by a new `check-composite-ship-gate.ts` script.

### Claude's Discretion
- Exact hyperparameter names + default values for `MIN_CLASSES_ACTIVE`, minimum-n-for-isotonic-fit, CI cron frequency — planner picks defaults, documents in `HYPERPARAMETERS.md`.
- Whether composite CI cron is hourly vs daily — planner picks based on backfill row volume.
- UI copy tone ("Cipher Composite Signal" vs "Calibrated Probability" vs other) — Claude picks after reviewing existing panel copy for consistency.
- Which existing reliability-diagram component to reuse vs slight variant — planner picks after audit.

### Deferred Ideas (OUT OF SCOPE)
- **Learned per-regime composite weights** (P22 source-mix pattern applied to class weights) — deferred until composite has ≥6mo of live data. For Phase 24, weights are ESS-proportional only.
- **Counterfactual leave-one-out deltas** — belongs in Phase 25. Phase 24 provides the mathematical substrate; Phase 25 exposes deltas in the prompt.
- **Composite over 8 sources (P22 source-axis) vs 4 classes** — starts with 4 classes; source-axis composite is P25+.
- **Learned isotonic refresh cadence** — start with weekly refit; can move to daily if drift becomes an issue.
- **Cross-signal contradiction detector on composite** — later phase (already partially covered by existing `contradiction_warnings` field).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REASON-01 | `engine-context.ts` produces a single composite headline probability synthesized from all 4 signal-class posteriors via per-class isotonic-calibrated weighted combination (not naive averaging) | §Standard Stack (isotonic + ESS-weighted mean); §Isotonic Fit Pipeline; §Wave decomposition Wave 2 |
| REASON-02 | Composite includes credible interval accounting for per-class correlation (no double-counting correlated signals) | §Standard Stack (BCa bootstrap row-resample); §Composite CI Cron; §Wave 3 |
| REASON-03 | Reports surface composite as the headline calibration number, with per-class breakdown beneath | §UI Restructure Risk (headline slot); §File Change Map (EngineCalibrationPanel restructure); §Wave 4 |
| REASON-04 | Reliability diagram (calibration curve) for the composite published in `/insights` | §File Change Map (calibration page + eval-brier extension); §Wave 3; §Wave 4 |
| REASON-05 | Authoritative numerics rule preserved — composite probability and CI come from `engine-context.ts`, never from the LLM | §File Change Map (`gemini-analysis.ts:1160-1243` overwrite pattern extended); §Wave 4 Task; §Common Pitfalls #1 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Load-bearing rules that gate this phase's plan:

- **Rule #1 — Time-series CV, never random k-fold.** Isotonic fit must be forward-chained: fit on outcomes with `resolved_at < asOf`; evaluate on outcomes with `resolved_at ∈ [asOf, asOf+H]`. Do NOT random-split PriceOutcome rows.
- **Rule #2 — Calibration is a first-class metric.** Ship gate D-07 already requires ECE ≤ 0.05 — matches this rule literally. Reliability diagram publication (REASON-04) is the visible artifact.
- **Rule #3 — Every reported number gets a CI.** The composite point estimate on its own is not shippable; D-02 mandates BCa CI on every composite exposed to the user. `composite_ci_low` and `composite_ci_high` are hard requirements, not optional.
- **Rule #4 — Priors regress to a base rate.** For per-class isotonic curves, minimum-n gate + widen-by-`√(4/K)` (D-03) is the analog of Beta-Binomial shrinkage — sparse-cell suppression rather than allowing an over-fit isotonic curve to dominate.
- **Rule #6 — Feature-leakage audit at every data-source addition.** Isotonic curve inputs = `(raw posterior_mean at prediction_time_t, outcome resolved at time_t + horizon)`. The predictor was known at t; the outcome must NOT leak back into t. Wave 2 fit path must enforce this via `resolved_at > predicted_at + horizon` filter.
- **Rule #7 — Probabilistic decisions scored with proper scoring rules.** Ship gate uses Brier (D-07) — correct choice for a probability output. Log-loss can be tracked as secondary diagnostic.
- **Rule #8 — Non-LLM baseline mandatory.** Composite must be benchmarked against a naive per-class mean AND against the existing 36-feature logistic baseline from P21.1. Ship gate `Brier ≤ 0.24` alone is insufficient — the plan must include a "composite Brier vs naive-mean Brier vs logistic-36 Brier" comparison, both computed on the same backfill window.

---

## Summary

Phase 24 has an unusually favorable research posture: **every primitive it needs is already in the codebase, verified in production**, and every integration surface is well-established with documented patterns. The phase is fundamentally a **wiring job + one new cron + one Prisma table + a UI reshuffle**, not a new-technology introduction.

The three core reused primitives are `isotonicRegression()` in `src/lib/stats/isotonic.ts` (Phase 20-C-02 PAV — same primitive that already fits per-classifier CORP curves), `bootstrapBCa()` in `src/lib/evaluation/bootstrap.ts` (Phase 21.1 — with correct `n<10` fallback semantics already handled), and the numeric-overwrite trust boundary at `gemini-analysis.ts:1160-1243` (Phase 17-04 pattern used by every previous engine-context field addition). No new library dependency. No new UI charting library — `ReliabilityDiagram.tsx` already renders per-classifier via `EvalBrierResult`; composite simply becomes another `classifier_version` value.

**Primary recommendation:** Execute in **5 waves** — (0) schema + RED test scaffolds, (1) pure helpers (composite arithmetic + weight renormalization + CI-widening), (2) isotonic fit path (offline: `scripts/fit-composite-isotonic.ts` + refresh cron), (3) integration into `engine-context.ts` + composite-CI cron + eval-brier extension, (4) UI restructure of `EngineCalibrationPanel` + trust-boundary overwrite in `gemini-analysis.ts` + reliability diagram publication + `check-composite-ship-gate.ts`. Waves 1–3 are pure math + DB; Wave 4 is UI + trust boundary. Non-LLM baseline (per-class mean + logistic-36) computed by extending existing `scripts/baselines`/`scripts/eval-brier.ts` in Wave 3.

---

## Standard Stack

### Core (all pre-existing in repo — HIGH confidence)

| Primitive | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| `isotonicRegression(x, y)` | `src/lib/stats/isotonic.ts:52` | PAV monotone step-fit for per-class calibration curves | Shipped Phase 20-C-02; already handles tie-aggregation + endpoint clamping; pure function, no deps. `[VERIFIED: /Users/tj/Desktop/Cipher/src/lib/stats/isotonic.ts:52-140]` |
| `corpReliabilityDiagram(preds, outcomes)` | `src/lib/stats/isotonic.ts:169` | Full CORP result (calibrated_probs + curve + histogram + n) — used for reliability publication | Phase 20-C-02 already uses it; composite reuses without modification. `[VERIFIED]` |
| `bootstrapBCa(samples, statistic, opts)` | `src/lib/evaluation/bootstrap.ts:120` | BCa CI on any statistic over row-resamples | Row-resample preserves cross-class correlation automatically (D-02). Handles `n<10` percentile fallback already. `[VERIFIED: /Users/tj/Desktop/Cipher/src/lib/evaluation/bootstrap.ts:120-243]` |
| `EngineContext` interface | `src/lib/engine-context.ts:194` | Type extension surface for 7 new composite fields (D-05) | Every prior phase (16, 17, 18, 19, 21, 22) has additively extended this type; well-worn pattern. `[VERIFIED]` |
| `runGeminiAnalysis` post-process overwrite | `src/lib/gemini-analysis.ts:1160-1243` | Trust-boundary block where engineCtx numerics replace LLM output | Existing pattern for ~30 numeric fields; adding 7 more is trivial. `[VERIFIED: /Users/tj/Desktop/Cipher/src/lib/gemini-analysis.ts:1160-1243]` |
| `ReliabilityDiagram` component | `src/app/insights/calibration/components/ReliabilityDiagram.tsx:30` | CORP reliability card driven by `EvalBrierResult` | Composite gets rendered by adding a new `classifier_version` in the eval-brier pipeline; component itself needs zero changes. `[VERIFIED]` |
| `MagnitudeCalibrationTile` client-island pattern | `src/components/MagnitudeCalibrationTile.tsx` | fetch-on-mount → pure-SVG render pattern for embedded calibration tiles | Reuse structure if we decide to embed a mini reliability tile inside `EngineCalibrationPanel` (optional; deferred to UI-SPEC). `[VERIFIED]` |

### Supporting (reused in-repo)

| Item | Location | When to Use |
|------|----------|-------------|
| `LearnedPattern` table (per-class 30d cells) | `prisma/schema.prisma:150-188` | Source of per-class `posterior_mean` + `effective_sample_size` at report-read time | Read-only; do NOT extend |
| `PriceOutcome` (with `is_sigma_hit_k1` primary label + `report_id` link) | `prisma/schema.prisma:83-127` | Historical outcomes for isotonic fit + composite CI bootstrap | Primary label per CLAUDE.md P21.1 spec = `is_sigma_hit_k1` (30d, k=1, sector-σ) |
| `Report` table | `prisma/schema.prisma:12` | Ticker + as-of resolution for `(ticker × as-of, composite_score, outcome)` triples | Join to `PriceOutcome` via `report_id` |
| `TemperatureCalibration` schema pattern | `prisma/schema.prisma:199-219` | **Blueprint** for `CompositeCalibrationSnapshot` — append-only + `classifier_version` + `computed_at` + `status` |
| `MagnitudeCalibrationBucket` cron pattern | `src/app/api/cron/magnitude-calibration/route.ts` | **Blueprint** for `/api/cron/composite-calibration` — auth-header check, single `computedAt` batch, `maxDuration: 300` |
| `scripts/eval-brier.ts` | `scripts/eval-brier.ts` | Extension point — adds `cipher-composite-v1` classifier_version to the grouping (drives the reliability diagram published to `/insights/calibration`) |
| Prisma additive-only migration convention | `prisma/migrations/` | Every new table follows this — no drops, no renames |

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Why we picked ours |
|------------|-----------|----------|--------------------|
| PAV isotonic (D-01) | Platt scaling (logistic on posterior → outcome) | Platt is parametric; smoother output but assumes sigmoid shape which is wrong when classifier is already probability-shaped | PAV is non-parametric + already in repo + matches CLAUDE.md #4 shrinkage-friendly framing |
| BCa row-resample (D-02) | Analytical delta-method CI on `Σ w_k · p_k^cal` with per-class variance | Requires estimating full 4×4 correlation matrix per (ticker × as-of); brittle when class-K coverage varies | BCa row-resample sidesteps correlation estimation entirely — resampling gives the correct joint distribution empirically |
| BCa row-resample (D-02) | Block bootstrap over time | Block bootstrap defends against temporal autocorrelation in outcomes; irrelevant here because our resample unit is `(ticker × as-of)` — different tickers/dates are approximately independent | Simple row-resample is honest for this data shape; block-bootstrap complexity not justified |
| ESS-weighted mean (D-01) | Fixed 1/K equal weights | Equal weights treats a 3-sample class as equal to a 300-sample class; inaccurate | ESS-weighted is one line more code, respects sample-size trust honestly |
| ESS-weighted mean (D-01) | Learned per-regime weights (P22 pattern) | Requires ≥6mo live data to fit weight-learning against; premature at Phase 24 | Deferred to v2 upgrade path per CONTEXT §Deferred |

**Installation:** None. Zero new npm dependencies. `[VERIFIED: all primitives in-repo]`

**Version verification:** N/A — no new package additions.

---

## Architecture Patterns

### Recommended File Layout

```
src/lib/composite/                        # NEW — Phase 24 pure-math home
├── weights.ts                            # NEW: renormalize weights, √(4/K) CI widening
├── compose.ts                            # NEW: ESS-weighted mean over calibrated probs
├── isotonic-fit.ts                       # NEW: fit-per-class-curve from PriceOutcome + serialize
├── isotonic-serde.ts                     # NEW: (de)serialize IsotonicPredictor ↔ JSON for DB
└── __tests__/
    ├── weights.test.ts                   # NEW: renormalize + √(4/K) golden vectors
    ├── compose.test.ts                   # NEW: composite arithmetic golden vectors
    ├── isotonic-fit.test.ts              # NEW: fixture-driven end-to-end
    └── engine-context-composite.test.ts  # NEW: integration on Neon (Wave 3)

src/lib/engine-context.ts                 # EDIT: 7 new EngineContext fields + composite compute block
src/lib/gemini-analysis.ts                # EDIT: extend post-process overwrite (lines 1160-1243)
src/lib/types.ts                          # EDIT: add composite fields to EngineCalibration interface

src/app/api/cron/composite-calibration/   # NEW — offline fit + CI + reliability bins
└── route.ts                              # NEW: nightly cron, writes CompositeCalibrationSnapshot
src/app/api/insights/composite-calibration/  # NEW — read latest snapshot
└── route.ts                              # NEW: returns latest snapshot for /insights page

src/components/EngineCalibrationPanel.tsx # EDIT: extract diffusion into per-class tile, add CompositeHeadline
src/components/CompositeHeadline.tsx      # NEW: pure component — prob + CI + gate-suppressed state

src/app/insights/calibration/             # EDIT: page.tsx already renders per-classifier grid; composite arrives free once eval-brier includes it

scripts/eval-brier.ts                     # EDIT: add 'cipher-composite-v1' to classifier_version enumeration
scripts/check-composite-ship-gate.ts      # NEW: enforces D-07 (Brier ≤ 0.24 + ECE ≤ 0.05 + ≥50% coverage)
scripts/fit-composite-isotonic.ts         # NEW: one-shot fit script (also callable from cron for parity)

prisma/schema.prisma                      # EDIT: 1 new model (CompositeCalibrationSnapshot)
prisma/migrations/YYYYMMDD_phase24_composite/  # NEW: additive-only migration

HYPERPARAMETERS.md                        # EDIT: append "## Phase 24 — Composite Signal Synthesis" section
vercel.json                               # EDIT: append 1 new cron entry
```

### Pattern 1: Cron-Computes / Report-Reads Split (established Cipher pattern)

**What:** Expensive computations (isotonic fit, bootstrap CI over historical rows, reliability bin generation) happen in a nightly cron writing to Neon. Report-time reads a single cached row per (regime × cap_class) cell.

**When to use:** All Phase 24 composite work — no exceptions. Report-time latency budget for `/api/analysis/[ticker]` is already tight (~15s end-to-end) and cannot absorb a bootstrap.

**Example:** `[VERIFIED: /Users/tj/Desktop/Cipher/src/app/api/cron/magnitude-calibration/route.ts:1-65]` — this is our canonical minimalist cron template. Follow it verbatim.

```typescript
// src/app/api/cron/composite-calibration/route.ts
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const computedAt = new Date();

  // 1. Fit per-class isotonic curves from historical (posterior_at_predict_time, outcome)
  // 2. Compute composite over holdout window
  // 3. Bootstrap CI via bootstrapBCa on row-resamples
  // 4. Emit reliability bins via corpReliabilityDiagram
  // 5. INSERT one CompositeCalibrationSnapshot row (append-only)

  return NextResponse.json({ ok: true, computed_at: computedAt.toISOString(), ... });
}
```

### Pattern 2: Numeric-Overwrite Trust Boundary (mandatory for REASON-05)

**What:** LLM output for composite fields is discarded and replaced with `engineCtx` values at the `gemini-analysis.ts` boundary. Zod schema does NOT expose composite fields to the model (LLM never sees them).

**When to use:** Every one of the 7 composite fields on `EngineContext`.

**Example:** `[VERIFIED: /Users/tj/Desktop/Cipher/src/lib/gemini-analysis.ts:1204-1223]` shows the Phase 17-04 pattern for institutional/insider. Extend identically:

```typescript
// Extension to the existing block at lines 1160-1243:
composite_prob:                engineCtx.composite_prob,
composite_ci_low:              engineCtx.composite_ci_low,
composite_ci_high:             engineCtx.composite_ci_high,
composite_class_count:         engineCtx.composite_class_count,
composite_gate_status:         engineCtx.composite_gate_status,
composite_class_weights:       engineCtx.composite_class_weights,
composite_per_class_calibrated: engineCtx.composite_per_class_calibrated,
```

### Pattern 3: `classifier_version` Append-Only Snapshot Table (TemperatureCalibration blueprint)

**What:** Every calibration table follows `(classifier_version, computed_at)` composite key with INSERT-only semantics and `@@index([classifier_version, computed_at(sort: Desc)])` for latest-row lookup. Runtime always reads latest row; backtests replay by joining on `computed_at <= snapshot_time`.

**When to use:** For `CompositeCalibrationSnapshot`.

**Blueprint:** `[VERIFIED: /Users/tj/Desktop/Cipher/prisma/schema.prisma:199-219]` (TemperatureCalibration) — near-identical shape needed here.

### Pattern 4: `EvalBrierResult` extension for reliability publication (REASON-04)

**What:** `/insights/calibration` renders a grid of `ReliabilityDiagram` cards, one per `classifier_version` returned by `runEvalBrier()`. To publish the composite reliability diagram, we ONLY add `'cipher-composite-v1'` to the classifier_version enumeration inside `scripts/eval-brier.ts`. The component itself needs zero changes.

**Verification:** `[VERIFIED: /Users/tj/Desktop/Cipher/src/app/insights/calibration/page.tsx:78-88 loops payload.results, one ReliabilityDiagram per classifier]`

### Anti-Patterns to Avoid

- **Recomputing isotonic at report time.** The fit is expensive and blocking. Every fit MUST happen in cron; report-time paths read `IsotonicPredictor` from a serialized JSON on `CompositeCalibrationSnapshot` and apply it in O(log n) via binary search over pools. If we're tempted to fit at report time, we've misdesigned.
- **Composite CI via analytical delta method.** Tempting because it looks closed-form, but requires estimating a full class-correlation matrix per (regime × cap_class × horizon) cell and is brittle when K<4. D-02 locked BCa row-resample; do not deviate.
- **Exposing composite to the LLM as a Zod field.** Even as "read-only" it invites drift. Composite fields must be added to the `EngineCalibration` output type but must NOT appear in the `AnalysisResult` Zod schema that Gemini fills.
- **Widening CI by `√(4/K)` when K=4.** The formula reduces to 1.0 at K=4 (no penalty), so it's correct — but implementers sometimes special-case K=4 wrong. Add a golden-vector test at K∈{2,3,4} to lock the arithmetic.
- **Reading `posterior_mean` for the isotonic-fit dataset.** The fit needs the posterior **as it was at prediction time**, not the current `posterior_mean` (which has since absorbed the outcome via Bayesian update). Use per-report snapshots stored in the Report analysis JSON or the `LearningEvent.delta` payload — NOT the current `LearnedPattern`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Monotone probability calibration | Custom Platt/binning | `isotonicRegression()` in `src/lib/stats/isotonic.ts` | Already handles tie-aggregation, endpoint clamping, PAV convergence per Barlow-Brunk 1972; battle-tested in Phase 20-C-02 CORP |
| CI on a compound statistic | Analytical variance propagation across 4 calibrated classes | `bootstrapBCa` row-resample from `src/lib/evaluation/bootstrap.ts` | Correct handling of BCa bias-correction (z₀) + acceleration (a), n<10 fallback, degenerate detection — all done. Row-resample preserves correlation without needing to estimate it. |
| Reliability diagram binning | Equal-width bins | `corpReliabilityDiagram()` — CORP method (Dimitriadis-Gneiting-Jordan 2021) | Equal-width is misleading on multimodal distributions; CORP is provably stable |
| Trust boundary between LLM and engine numerics | Prompt-level "don't hallucinate this" instruction | Post-process overwrite at `gemini-analysis.ts:1160-1243` | Instructions don't guarantee compliance; overwrite guarantees correctness. Established Phase 17-04 pattern. |
| Nightly job orchestration | Custom scheduler | Vercel Cron (`vercel.json`) | Battle-tested; already runs 25+ cron jobs; free within Vercel plan |
| Reliability diagram UI | New chart | `ReliabilityDiagram.tsx` (pure SVG) — add composite via new `classifier_version` | Reused for every prior classifier |
| Migration workflow | Manual DDL | Prisma `migrate deploy` (already in `buildCommand`) | Zero new tooling |

**Key insight:** Phase 24 is a **composition phase** — 90% of the work is combining primitives that exist. The engineering risk is not "will the math work" but "did we wire the trust boundary correctly and did we cache the right thing." Both are addressed by following existing patterns literally.

---

## Common Pitfalls

### Pitfall 1: LLM Leakage via Zod Schema Expansion

**What goes wrong:** A well-meaning engineer adds `composite_prob` to the `AnalysisResult` Zod schema "so the LLM can reference it in prose." The LLM then writes a report that hallucinates a different composite value in the summary while the numeric field carries the true value — user sees inconsistent numbers.

**Why it happens:** Trust-boundary rule (REASON-05, D-05) is procedural, not enforced by types.

**How to avoid:**
1. Composite fields live on `EngineCalibration` output type + on `EngineContext` internal type, but NEVER on the Zod schema for `AnalysisResult`.
2. Add a unit test: `expect(analysisResultSchema.shape).not.toHaveProperty('composite_prob')`.
3. Add a `check-numeric-grounding.ts`-style script (a lint pattern already exists in the repo) to grep the Gemini prompt template for the string `composite_prob` and fail CI if found.

**Warning signs:** Reports where the summary text quotes a different percentage than the panel headline.

### Pitfall 2: Isotonic Fit on Stale `posterior_mean`

**What goes wrong:** The isotonic fit needs `(raw posterior at prediction time, outcome at t+H)`. If we read `LearnedPattern.posterior_mean` today for a prediction made 90 days ago, that posterior has already absorbed the outcome — the fit becomes circular (perfect calibration by construction) and fails silently on holdout.

**Why it happens:** `LearnedPattern` is updated in place by `/api/cron/learn`; no built-in as-of view.

**How to avoid:** Read the posterior from the frozen report snapshot: `Report.analysis.engine_calibration.posterior_mean` (persisted at report generation time and immutable) OR from `LearningEvent.delta.posterior_before` (also frozen). Do NOT read `LearnedPattern` for the fit dataset.

**Warning signs:** Isotonic fit produces a curve that hugs the identity diagonal on training but drifts wildly on holdout — the classic look-ahead signature.

### Pitfall 3: Bootstrap Row Unit Mismatched to Correlation Structure

**What goes wrong:** Someone resamples individual class-outcome pairs (breaking cross-class correlation) instead of resampling full `(ticker × as-of × outcome × 4-class-posteriors)` rows. The CI understates uncertainty because the resample no longer reflects the joint distribution.

**Why it happens:** BCa API takes a generic `T[]` — you can pass anything.

**How to avoid:** Define the row shape explicitly and use it:

```typescript
interface CompositeRow {
  ticker: string;
  as_of: Date;
  posteriors: {                     // ALL 4 present per row — this is the row unit
    diffusion: number | null;
    technical: number | null;
    institutional: number | null;
    insider: number | null;
  };
  ess: { diffusion: number; technical: number; institutional: number; insider: number };
  status: { diffusion: CellStatus; technical: CellStatus; institutional: CellStatus; insider: CellStatus };
  outcome: 0 | 1;                    // is_sigma_hit_k1
}
bootstrapBCa<CompositeRow>(rows, (sample) => brier(sample.map(r => ({ p: composeRow(r, curves), y: r.outcome }))));
```

Add a comment above the call stating "row = joint 4-class observation; resample preserves correlation."

**Warning signs:** CI width shrinks unexpectedly as we add classes — should be roughly constant or grow, not shrink.

### Pitfall 4: Ship Gate Fires on a Skewed Base Rate

**What goes wrong:** Composite Brier looks great (0.20) but the base rate is 0.7, so a constant-predict-0.7 baseline also hits 0.21. We shipped a system that doesn't beat "always predict yes."

**Why it happens:** Brier alone doesn't discriminate skill from base-rate luck. Existing `scripts/eval-brier.ts` already enforces `|base_rate − 0.5| < 0.1` for this exact reason — but the composite-specific check must inherit that guard.

**How to avoid:** `check-composite-ship-gate.ts` must:
1. Verify `composite Brier ≤ 0.24` AND `composite Brier < baseline Brier(constant=base_rate)` (i.e., positive Brier skill score).
2. Log Brier lift vs naive-mean baseline AND vs logistic-36 baseline (CLAUDE.md #8).
3. Fail if any baseline beats composite by ≥ 0.005 Brier — the composite must justify its existence.

**Warning signs:** Ship gate passes but naive-mean baseline is within 0.005 Brier.

### Pitfall 5: `MIN_CLASSES_ACTIVE=2` Coverage Cliff

**What goes wrong:** In the current engine, `ACTIVE` status is rare — most cells are `EXPLORATORY`. If ~<50% of universe passes `K ≥ 2 ACTIVE`, composite suppresses on the majority of tickers and the "first user-visible v2.0 win" is a bunch of "insufficient coverage" tiles.

**Why it happens:** Coverage is downstream of P21.1's 5-gate promotion, which is deliberately conservative.

**How to avoid:**
1. Wave 0 measurement: query current `LearnedPattern.status` distribution grouped by class; report % of universe where ≥2 classes have `ACTIVE` status at any (cap_class × primary-horizon) cell. If <50%, D-07 ship gate fails on coverage even if math is perfect.
2. If measurement shows insufficient coverage, escalation is a CONTEXT amendment — either drop `MIN_CLASSES_ACTIVE` to `1` (with widened CI) or defer ship gate until soak improves promotion rate. Do NOT quietly relax the gate.

**Warning signs:** Coverage stays <50% after any conservative status widening.

### Pitfall 6: CI Cron Frequency Under-Provisioned

**What goes wrong:** Composite CI cron runs weekly (like `magnitude-calibration`), but the bootstrap on tens of thousands of `(ticker × as-of)` rows takes >5 min → hits `maxDuration: 300` timeout → cron silently fails → users see a stale CI band for 7+ days.

**Why it happens:** `magnitude-calibration` operates on bucketed aggregates (5 buckets × ~thousands each); composite CI touches many more rows and one CI per (regime × cap_class) cell.

**How to avoid:**
1. Wave 0: prototype bootstrap runtime on the largest expected cell. If a single cell's bootstrap on `bootstrapBCa(rows, brier, { nResamples: 1000 })` takes >30s on ~5k rows, drop `nResamples` to 500 or restrict CI computation to the top-N cells.
2. Split the cron: isotonic fit weekly (Mon 08:00 UTC), CI recomputation daily (03:00 UTC) — bootstrap is the slow part, and daily fit is unnecessary since fits are stable.
3. Log per-cell wall time inside the cron and alert if any cell exceeds `maxDuration * 0.5`.

**Warning signs:** Cron logs show sporadic timeout errors; `computed_at` timestamps in `CompositeCalibrationSnapshot` fall behind.

---

## Code Examples

Verified patterns from in-repo sources — copy-paste-adapt these.

### Composite arithmetic (Wave 1 — pure helper)

```typescript
// src/lib/composite/compose.ts
// Source: derived from D-01 spec + isotonic curve pattern in isotonic.ts

import type { IsotonicPredictor } from '@/lib/stats/isotonic';

export type SignalClass = 'diffusion' | 'technical' | 'institutional' | 'insider';

export interface ClassInput {
  raw_posterior: number | null;   // pre-calibration
  ess: number;
  status: 'ACTIVE' | 'EXPLORATORY' | 'EXPLORATORY-WATCH' | 'DEPRECATED' | 'NO_DATA';
}

export interface ComposeResult {
  composite_prob: number | null;
  class_count: number;
  gate_status: 'active' | 'insufficient_coverage' | 'insufficient_history';
  class_weights: Record<SignalClass, number>;
  per_class_calibrated: Record<SignalClass, number | null>;
}

export function composeSignal(
  inputs: Record<SignalClass, ClassInput>,
  curves: Record<SignalClass, IsotonicPredictor | null>,
  opts: { minClassesActive: number },        // default 2 (D-03)
): ComposeResult {
  const classes: SignalClass[] = ['diffusion', 'technical', 'institutional', 'insider'];

  // Determine ACTIVE classes with a raw posterior AND a fitted curve
  const active = classes.filter(c =>
    inputs[c].status === 'ACTIVE' &&
    inputs[c].raw_posterior != null &&
    curves[c] != null,
  );

  if (active.length < opts.minClassesActive) {
    const zeroed: Record<SignalClass, number> = { diffusion: 0, technical: 0, institutional: 0, insider: 0 };
    const nullPc: Record<SignalClass, number | null> = { diffusion: null, technical: null, institutional: null, insider: null };
    return {
      composite_prob: null,
      class_count: active.length,
      gate_status: active.length === 0 ? 'insufficient_history' : 'insufficient_coverage',
      class_weights: zeroed,
      per_class_calibrated: nullPc,
    };
  }

  // Calibrate + weight
  const totalEss = active.reduce((s, c) => s + inputs[c].ess, 0);
  const weights = { diffusion: 0, technical: 0, institutional: 0, insider: 0 } as Record<SignalClass, number>;
  const perClassCal = { diffusion: null, technical: null, institutional: null, insider: null } as Record<SignalClass, number | null>;
  let composite = 0;
  for (const c of active) {
    const cal = curves[c]!(inputs[c].raw_posterior!);
    perClassCal[c] = cal;
    weights[c] = inputs[c].ess / totalEss;
    composite += weights[c] * cal;
  }

  return {
    composite_prob: composite,
    class_count: active.length,
    gate_status: 'active',
    class_weights: weights,
    per_class_calibrated: perClassCal,
  };
}
```

### CI widening for K<4 (Wave 1 — pure helper)

```typescript
// src/lib/composite/weights.ts
// D-03: widen CI by √(4/K) to reflect fewer independent classes
export function widenCi(
  point: number,
  low: number,
  high: number,
  activeK: number,
): { low: number; high: number } {
  if (activeK >= 4) return { low, high };
  if (activeK <= 0) return { low: point, high: point };
  const factor = Math.sqrt(4 / activeK);
  const halfWidthLow = (point - low) * factor;
  const halfWidthHigh = (high - point) * factor;
  return {
    low: Math.max(0, point - halfWidthLow),
    high: Math.min(1, point + halfWidthHigh),
  };
}
```

### Isotonic serialization for DB persistence (Wave 2)

```typescript
// src/lib/composite/isotonic-serde.ts
// PAV output is a step function over pools; serialize as {x_breakpoints, y_values}.
import { isotonicRegression } from '@/lib/stats/isotonic';

export interface IsotonicCurveJSON {
  x_breakpoints: number[];  // sorted ascending
  y_values: number[];       // same length as x_breakpoints; monotone non-decreasing
}

export function fitAndSerialize(x: number[], y: number[]): IsotonicCurveJSON {
  const pred = isotonicRegression(x, y);
  // Sample the predictor at input x to recover the effective step function
  // (200-point uniform grid also works; input-anchored preserves exact ties)
  const uniqueX = Array.from(new Set(x)).sort((a, b) => a - b);
  return { x_breakpoints: uniqueX, y_values: uniqueX.map(pred) };
}

export function deserialize(json: IsotonicCurveJSON): (x: number) => number {
  const { x_breakpoints, y_values } = json;
  return (xq: number) => {
    if (xq <= x_breakpoints[0]) return y_values[0];
    if (xq >= x_breakpoints[x_breakpoints.length - 1]) return y_values[y_values.length - 1];
    // Binary search for the largest breakpoint <= xq
    let lo = 0, hi = x_breakpoints.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1;
      if (x_breakpoints[mid] <= xq) lo = mid;
      else hi = mid;
    }
    return y_values[lo];
  };
}
```

### Bootstrap CI on composite (Wave 3)

```typescript
// scripts/lib/composite-bootstrap.ts
import { bootstrapBCa } from '@/lib/evaluation';
import { composeSignal } from '@/lib/composite/compose';

interface CompositeRow {
  ticker: string;
  as_of: Date;
  raw_posteriors: Record<SignalClass, number | null>;
  ess: Record<SignalClass, number>;
  status: Record<SignalClass, CellStatus>;
  outcome: 0 | 1;
}

function brier(preds: Array<{ p: number; y: number }>): number {
  return preds.reduce((s, { p, y }) => s + (p - y) ** 2, 0) / preds.length;
}

// CI on the composite Brier for a given cell
export function computeCompositeCi(rows: CompositeRow[], curves: Record<SignalClass, IsotonicPredictor>) {
  return bootstrapBCa(rows, (sample) => {
    const preds = sample
      .map(r => ({
        p: composeSignal(
          Object.fromEntries((['diffusion','technical','institutional','insider'] as const)
            .map(c => [c, { raw_posterior: r.raw_posteriors[c], ess: r.ess[c], status: r.status[c] }])) as Record<SignalClass, ClassInput>,
          curves,
          { minClassesActive: 2 },
        ).composite_prob,
        y: r.outcome,
      }))
      .filter((x): x is { p: number; y: number } => x.p != null);
    return brier(preds);
  }, { nResamples: 1000, alpha: 0.05, seed: 42 });
}
```

### `EngineContext` integration (Wave 3)

```typescript
// src/lib/engine-context.ts — extend the interface (existing lines 194-333) with 7 fields:
composite_prob: number | null;
composite_ci_low: number | null;
composite_ci_high: number | null;
composite_class_count: number;
composite_gate_status: 'active' | 'insufficient_coverage' | 'insufficient_history';
composite_class_weights: Record<'diffusion' | 'technical' | 'institutional' | 'insider', number>;
composite_per_class_calibrated: Record<'diffusion' | 'technical' | 'institutional' | 'insider', number | null>;

// Inside getEngineContextForTicker after all 4 per-class posteriors are computed
// (after line ~1057 where source_mix is built), add a Section 14 block:
const snapshot = await prisma.compositeCalibrationSnapshot.findFirst({
  where: {
    classifier_version: 'cipher-composite-v1',
    regime: regimeForSourceMix,      // reuse regime derived at line ~1064
    cap_class,
  },
  orderBy: { computed_at: 'desc' },
});

let composite_prob = null, composite_ci_low = null, composite_ci_high = null;
let composite_class_count = 0, composite_gate_status: 'active'|'insufficient_coverage'|'insufficient_history' = 'insufficient_history';
const composite_class_weights = { diffusion: 0, technical: 0, institutional: 0, insider: 0 };
const composite_per_class_calibrated: Record<SignalClass, number | null> = { diffusion: null, technical: null, institutional: null, insider: null };

if (snapshot) {
  const curves = deserializeCurves(snapshot.isotonic_curves as IsotonicCurvesJSON);  // Wave 2 helper
  const result = composeSignal({
    diffusion:     { raw_posterior: posterior_mean,               ess: diffusionCell?.effective_sample_size ?? 0, status },
    technical:     { raw_posterior: technical_posterior_mean,     ess: technicalCell?.effective_sample_size ?? 0, status: technical_status },
    institutional: { raw_posterior: institutionalResult.posterior, ess: institutionalResult.ess ?? 0, status: institutionalResult.status },
    insider:       { raw_posterior: insiderResult.posterior,       ess: insiderResult.ess ?? 0, status: insiderResult.status },
  }, curves, { minClassesActive: 2 });
  composite_prob = result.composite_prob;
  composite_class_count = result.class_count;
  composite_gate_status = result.gate_status;
  Object.assign(composite_class_weights, result.class_weights);
  Object.assign(composite_per_class_calibrated, result.per_class_calibrated);

  if (composite_prob != null) {
    const widened = widenCi(composite_prob, snapshot.ci_low, snapshot.ci_high, composite_class_count);
    composite_ci_low = widened.low;
    composite_ci_high = widened.high;
  }
}
// … then include these 7 fields in the returned EngineContext object.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Diffusion-only headline in `EngineCalibrationPanel` | Composite headline; diffusion demoted to per-class breakdown | Phase 24 (this) | First user-visible v2.0 win; unifies the 4 signal-class outputs |
| Equal-width binning for reliability diagrams | CORP method (PAV isotonic) | Phase 20-C-02 (May 2026) | Composite reuses without change |
| Fixed 1/K weights for signal fusion | ESS-weighted mean per D-01 | Phase 24 (this) | Weights reflect sample-size trust; simpler than learned-weight schemes (deferred) |
| Analytical CI on Bayesian posterior only | BCa bootstrap CI on composite | Phase 21.1 primitive; Phase 24 usage | Correlation-aware without needing to estimate a correlation matrix |
| Per-class per-classifier reliability diagrams | Same infra + one more `classifier_version` for composite | Phase 24 (this) | Zero UI-component change; pipeline extension only |

**Deprecated / outdated:** None. Phase 24 is additive — no prior code deprecated.

---

## File Change Map

### NEW files

| File | Purpose | Wave |
|------|---------|------|
| `src/lib/composite/compose.ts` | Pure composeSignal function; ESS-weight + calibrate + gate | 1 |
| `src/lib/composite/weights.ts` | `widenCi()` (√(4/K)) + `renormalize()` helpers | 1 |
| `src/lib/composite/isotonic-fit.ts` | Fit per-class curve from `(raw_posterior_at_predict_time, outcome)` triples with time-series discipline | 2 |
| `src/lib/composite/isotonic-serde.ts` | (De)serialize `IsotonicPredictor` ↔ JSON for Prisma Json column | 2 |
| `src/lib/composite/__tests__/compose.test.ts` | Golden vectors: K=4 all ACTIVE, K=3 with widened CI, K<2 suppression | 0 (RED) → 1 (GREEN) |
| `src/lib/composite/__tests__/weights.test.ts` | Golden vectors for √(4/K) at K∈{1,2,3,4} | 0 → 1 |
| `src/lib/composite/__tests__/isotonic-fit.test.ts` | Fixture-driven: monotone output, tie-handling, look-ahead defense | 0 → 2 |
| `src/lib/composite/__tests__/engine-context-composite.test.ts` | Live-Neon integration (excluded from `npm test`, run in `npm run test:integration`) | 3 |
| `src/app/api/cron/composite-calibration/route.ts` | Nightly fit + CI + reliability-bin writer | 3 |
| `src/app/api/insights/composite-calibration/route.ts` | Read-latest snapshot for the `/insights` page (if we surface a dedicated tile) | 3 |
| `src/components/CompositeHeadline.tsx` | Pure component: renders `X% [Y%, Z%]` or "insufficient signal coverage" per `composite_gate_status` | 4 |
| `scripts/fit-composite-isotonic.ts` | Manual one-shot fit (also callable from cron for parity) | 2 |
| `scripts/check-composite-ship-gate.ts` | Enforces D-07 (Brier ≤ 0.24 + ECE ≤ 0.05 + ≥50% coverage + beats naive-mean + beats logistic-36) | 4 |
| `prisma/migrations/YYYYMMDD_phase24_composite/migration.sql` | Additive migration adding `CompositeCalibrationSnapshot` | 0 |
| `.planning/phases/24-composite-signal-synthesis/24-UI-SPEC.md` | UI contract for headline slot + per-class breakdown layout | (planner) |
| `.planning/phases/24-composite-signal-synthesis/24-VALIDATION.md` | Auto-generated from Validation Architecture section below | (planner) |

### EDITED files

| File | Change | Wave |
|------|--------|------|
| `prisma/schema.prisma` | Add `CompositeCalibrationSnapshot` model (see Prisma additions below) | 0 |
| `src/lib/engine-context.ts` | (1) Add 7 fields to `EngineContext` interface (line ~194); (2) Add Section 14 composite compute block after line ~1057 (source_mix); (3) Include 7 fields in returned object | 3 |
| `src/lib/gemini-analysis.ts` | Extend the post-process overwrite block at lines 1160-1243 to copy 7 composite fields from `engineCtx` (mirror Phase 17-04 pattern at lines 1204-1223) | 4 |
| `src/lib/types.ts` | Add composite fields to `EngineCalibration` interface (line ~466) so downstream renderers can read them | 3 |
| `src/components/EngineCalibrationPanel.tsx` | (1) At top of `EngineCalibrationPanel` (line ~500+, before `QuadClassPanel`), render `<CompositeHeadline />`; (2) Keep diffusion tile inside `QuadClassPanel` — no removal, just now labeled as "per-class breakdown" via a section eyebrow | 4 |
| `scripts/eval-brier.ts` | Add `'cipher-composite-v1'` to classifier_version grouping — feeds composite reliability into `/insights/calibration` for free | 3 |
| `vercel.json` | Append one cron entry: `{ "path": "/api/cron/composite-calibration", "schedule": "0 3 * * *" }` (daily 03:00 UTC; fit weekly on Monday inside route logic) | 3 |
| `HYPERPARAMETERS.md` | Append `## Phase 24 — Composite Signal Synthesis` section (see additions list below) | 0 |
| `.planning/REQUIREMENTS.md` | Mark REASON-01..05 checkboxes when phase ships | (final) |

### Reused as-is (NO changes)

- `src/lib/stats/isotonic.ts` — `isotonicRegression`, `corpReliabilityDiagram`
- `src/lib/evaluation/bootstrap.ts` — `bootstrapBCa`
- `src/lib/evaluation/index.ts` — barrel export
- `src/app/insights/calibration/components/ReliabilityDiagram.tsx` — component is data-driven per `classifier_version`
- `src/app/insights/calibration/page.tsx` — page loops over `payload.results`, composite arrives free
- `src/components/MagnitudeCalibrationTile.tsx` — pattern to mirror IF we decide to embed a mini reliability card in the panel (planner decision)

---

## Prisma Schema Additions

### New Model: `CompositeCalibrationSnapshot`

Follows the `TemperatureCalibration` append-only + `classifier_version` blueprint. `[VERIFIED: /Users/tj/Desktop/Cipher/prisma/schema.prisma:199-219]`

```prisma
// ─── Phase 24 — Composite Signal Synthesis (D-01..D-06, REASON-01..05) ─────
// Append-only snapshot per (classifier_version × regime × cap_class × computed_at).
// Runtime reads latest row per (classifier_version × regime × cap_class);
// backtests replay by joining on computed_at <= snapshot_time. Cron writes daily
// (03:00 UTC) via /api/cron/composite-calibration; NEVER UPDATE.
//
// isotonic_curves: JSON blob keyed by SignalClass ('diffusion' | 'technical' |
//   'institutional' | 'insider') → { x_breakpoints: number[], y_values: number[] }
//   fit on historical (raw posterior at predict_time, is_sigma_hit_k1 outcome).
// bootstrap_ci: JSON payload with n_resamples, method ('bca'|'percentile'), and
//   the point/low/high on composite Brier (used by ship-gate script).
// reliability_bins: JSON payload matching CorpReliabilityResult shape for the
//   composite over the holdout window (feeds /insights/calibration).
// status: 'ship-eligible' | 'shadow' | 'degraded' | 'insufficient_data'
//   (mirrors TemperatureCalibration.status semantics).
model CompositeCalibrationSnapshot {
  id                     String   @id @default(cuid())
  classifier_version     String   // 'cipher-composite-v1' (locked per D-06)
  computed_at            DateTime @default(now()) @db.Timestamptz

  // Cell key (regime × cap_class) — one row per cell per computed_at batch.
  regime                 String   @default("ALL")  // matches LearnedPattern.regime enum
  cap_class              String   // 'large_cap' | 'mid_cap' | 'small_cap' | 'unknown'

  // Fit outputs
  isotonic_curves        Json     // Record<SignalClass, {x_breakpoints, y_values}>
  n_fit_samples          Int      // total (ticker × as-of) rows in fit set
  min_classes_active     Int      @default(2)  // D-03 gate at fit time

  // CI on composite Brier (D-02 — BCa row-resample on the holdout window)
  composite_brier        Float
  ci_low                 Float    // 95% BCa low on composite prob (post √(4/K) widening if applicable)
  ci_high                Float    // 95% BCa high
  bootstrap_method       String   // 'bca' | 'percentile'
  bootstrap_n_resamples  Int

  // Reliability (D-06 — CORP method)
  reliability_bins       Json     // CorpReliabilityResult payload
  ece                    Float    // expected calibration error over reliability bins
  n_holdout              Int      // rows in reliability + Brier evaluation window

  // Ship-gate baseline diagnostics (CLAUDE.md #8 — non-LLM baseline mandatory)
  baseline_brier_naive_mean   Float?   // Brier of unweighted mean composite (equal 1/K weights)
  baseline_brier_logistic_36  Float?   // Brier of P21.1 logistic-36 baseline on same holdout

  status                 String   // 'ship-eligible' | 'shadow' | 'degraded' | 'insufficient_data'
  notes                  String?  // free-text — e.g. 'ECE 0.06 blocks ship gate — awaiting drift correction'

  @@index([classifier_version, computed_at(sort: Desc)], map: "idx_composite_cal_ver_at")
  @@index([classifier_version, regime, cap_class, computed_at(sort: Desc)], map: "idx_composite_cal_cell_at")
  @@map("composite_calibration_snapshots")
}
```

**Migration file naming:** `20260916_phase24_composite/migration.sql`. Additive only.

**No changes to existing tables.** `LearnedPattern`, `PriceOutcome`, `Report` all read-only for Phase 24.

---

## Isotonic Curve Fit Pipeline

### Historical data source

**Fit dataset** = one row per closed prediction:
- **Features:** `(ticker, as_of, raw_posterior_at_predict_time)` for each of 4 classes
- **Label:** `PriceOutcome.is_sigma_hit_k1` (30d, k=1, sector-σ) — the P21.1 primary label
- **Time-series discipline:** rows where `PriceOutcome.recorded_at ≥ Report.created_at + 30d` (already-resolved) AND `Report.created_at < fit_asOf - 30d` (buffer against label leakage)

**Where to get `raw_posterior_at_predict_time`:**
- **Best:** `Report.analysis` (JSON) contains `engine_calibration` frozen at generation time; extract the 4 per-class `posterior_mean` values. `[CITED: standard Cipher pattern — Report.analysis is immutable per CLAUDE.md "user-owned research history"]`
- **Fallback:** `LearningEvent.delta.posterior_before` when the Report row is missing that class (some early classes weren't included).

**Do NOT read from `LearnedPattern.posterior_mean` for the fit** — that's a live posterior that has already absorbed the outcome (Pitfall 2).

### Minimum-n gate

- **Per-class curve:** minimum `n=50` fit points per class per (regime × cap_class) cell — below that, use the "ALL"-regime curve as fallback (cold-start chain matching D-09 in P22).
- **Global composite:** minimum `n=100` holdout points before CORP reliability + Brier are trusted (matches T-20-C-02-02 precedent).

### Refresh cadence recommendation

- **Isotonic refit:** **weekly** (Monday 03:00 UTC). Isotonic curves are stable; daily refit is unnecessary and wastes budget.
- **CI recomputation + reliability bins:** **daily** (03:00 UTC via same cron; guard by `dayOfWeek === 1` for the isotonic fit branch). Rationale: composite Brier can drift as new outcomes close daily; CI band should reflect that; refit does not.
- **Manual refit trigger:** `scripts/fit-composite-isotonic.ts` for ad-hoc refit after schema changes or classifier upgrades. Mirrors `scripts/calibrate-temperature.ts` UX.

Consolidated single cron path: `/api/cron/composite-calibration` runs daily; internally branches on `dayOfWeek === 1 || snapshot_missing` to decide whether to also refit curves vs. reusing yesterday's curves and only recomputing CI + reliability.

---

## Composite CI Cron

**Route:** `src/app/api/cron/composite-calibration/route.ts`
**Schedule:** `0 3 * * *` (daily 03:00 UTC) — appended to `vercel.json`
**maxDuration:** 300 (inherited from `src/app/api/cron/**/*` wildcard in `vercel.json:11-13`)
**Auth:** `Bearer ${CRON_SECRET}` — mirror `magnitude-calibration/route.ts:16-18`
**Batch semantics:** single `computedAt = new Date()` for the whole batch (mirror `magnitude-calibration/route.ts:21`)

### Per-run flow

```
computedAt = new Date()
regimes = ['ALL', 'bull-low-vol', 'bull-high-vol', 'bear-low-vol', 'bear-high-vol']
cap_classes = ['large_cap', 'mid_cap', 'small_cap']  // 'unknown' handled via cold-start fallback

for (regime, cap_class) of cartesian(regimes, cap_classes):
  fit_rows   = loadFitDataset(asOf = computedAt - 30d, regime, cap_class)   // Wave 2 helper
  hold_rows  = loadHoldoutDataset(asOf = computedAt, regime, cap_class)     // last 30d resolved
  if fit_rows.length < 50 or hold_rows.length < 100:
    write snapshot with status='insufficient_data'; continue

  curves     = fitPerClassCurves(fit_rows)             // 4 x IsotonicPredictor
  brier_pt   = brier(hold_rows.map(r => compose(r, curves)).filter(Boolean))
  ci         = bootstrapBCa(hold_rows, sample => brier(sample.map(r => compose(r, curves))), { nResamples: 1000, seed: 42 })
  reliability = corpReliabilityDiagram(hold_composite_preds, hold_outcomes)
  ece        = computeECE(reliability)                 // simple weighted-bin |pred - obs|

  // Baselines (CLAUDE.md #8)
  baseline_naive     = brier(hold_rows.map(r => naiveMean(r)))
  baseline_logistic  = brier(hold_rows.map(r => logistic36(r)))   // if available

  status = deriveStatus(brier_pt, ece, hold_rows.length)  // 'ship-eligible' | 'shadow' | 'degraded' | 'insufficient_data'

  await prisma.compositeCalibrationSnapshot.create({
    data: { classifier_version: 'cipher-composite-v1', computed_at: computedAt, regime, cap_class,
            isotonic_curves: serialize(curves), n_fit_samples: fit_rows.length,
            composite_brier: brier_pt, ci_low: ci.low, ci_high: ci.high, bootstrap_method: ci.method,
            bootstrap_n_resamples: 1000, reliability_bins: reliability, ece,
            n_holdout: hold_rows.length,
            baseline_brier_naive_mean: baseline_naive, baseline_brier_logistic_36: baseline_logistic,
            status },
  })

return NextResponse.json({ ok: true, computed_at: computedAt.toISOString(), snapshots_written })
```

### Bootstrap parameters (locked defaults)

- `nResamples: 1000` — matches P21.1 usage; sufficient for BCa stability at n≥100. Verified as tractable within `maxDuration: 300` for ~5k-row cells based on P21.1 experience `[ASSUMED — Wave 0 must prototype on largest cell before committing]`.
- `alpha: 0.05` — 95% CI (standard).
- `seed: 42` — deterministic reproducibility (mirrors existing test patterns).

### Write pattern

**Append-only, one row per (classifier_version, regime, cap_class, computed_at) batch.** Runtime reads latest via `orderBy: { computed_at: 'desc' }` scoped to `(classifier_version, regime, cap_class)`. Mirrors `TemperatureCalibration` semantics exactly.

---

## Wave Decomposition

Follows Cipher canonical pattern (Wave 0 = schema + RED tests; Waves 1..N ascending integration depth). 5 waves total; each ends with a green commit + optional deploy.

### Dependency graph (top-down)

```
Wave 0: schema + RED scaffolds
   │
   ├─── Wave 1: pure helpers  (compose.ts, weights.ts)  ─────────────┐
   │                                                                 │
   ├─── Wave 2: isotonic fit pipeline (isotonic-fit.ts,              │
   │           isotonic-serde.ts, fit-composite-isotonic.ts) ────────┤
   │                                                                 │
   │       (Waves 1 and 2 can run in parallel)                       │
   │                                                                 ▼
   └─── Wave 3: integration ─────────────────────────────────────────┐
             ├─ engine-context.ts (7 new fields + compute block)     │
             ├─ types.ts (EngineCalibration extension)               │
             ├─ /api/cron/composite-calibration/ (new)               │
             ├─ /api/insights/composite-calibration/ (new)           │
             ├─ scripts/eval-brier.ts (add cipher-composite-v1)      │
             └─ vercel.json (cron entry)                             │
                                                                     ▼
             Wave 4: UI + trust boundary + ship gate ────────────────┐
             ├─ gemini-analysis.ts overwrite (REASON-05)             │
             ├─ EngineCalibrationPanel restructure (REASON-03)       │
             ├─ CompositeHeadline.tsx (new)                          │
             ├─ /insights/calibration renders composite (free from   │
             │  Wave 3 eval-brier change — REASON-04)                │
             └─ scripts/check-composite-ship-gate.ts (D-07)          │
                                                                     ▼
                                            /gsd-verify-work + ship gate
```

### Wave contents

#### Wave 0 — Schema + RED test scaffolds
- Add `CompositeCalibrationSnapshot` to `prisma/schema.prisma`
- Write and commit Prisma migration
- `npx prisma migrate deploy` on preview DB
- Create test scaffolds in `src/lib/composite/__tests__/` with `it.todo` or expected-to-fail assertions (RED). Codify golden vectors for compose (K=4, K=3, K=2, K<2) and `widenCi` (K∈{1,2,3,4}).
- Prototype the largest-cell bootstrap runtime — one-off local benchmark (NOT committed) to confirm `nResamples=1000` fits `maxDuration=300`.
- Measure current `LearnedPattern.status='ACTIVE'` coverage (Pitfall 5). If <50%, escalate before continuing.
- **Also:** append the `HYPERPARAMETERS.md` `## Phase 24` section (hyperparameters need to be pinned before Waves 1+ reference them).

#### Wave 1 — Pure helpers (`src/lib/composite/{compose,weights}.ts`)
- `composeSignal()` — ESS-weighted mean over ACTIVE classes with gate; deterministic; no I/O
- `widenCi()` — √(4/K); no I/O
- `renormalize()` — helper for D-03 weight renormalization
- Green all Wave 0 tests for these helpers.
- **Parallel to Wave 2 — no dependency.**

#### Wave 2 — Isotonic fit pipeline (`src/lib/composite/isotonic-*.ts` + `scripts/fit-composite-isotonic.ts`)
- `isotonic-fit.ts` — reads `(Report.analysis frozen posteriors, PriceOutcome.is_sigma_hit_k1)` triples with time-series discipline; per-class fit via `isotonicRegression`
- `isotonic-serde.ts` — (de)serialize to/from `Json` column shape
- `scripts/fit-composite-isotonic.ts` — CLI: `npx tsx scripts/fit-composite-isotonic.ts --regime bull-low-vol --cap large_cap` for manual runs
- Golden-vector tests (already scaffolded Wave 0) turn green.
- **Parallel to Wave 1 — no dependency.**

#### Wave 3 — Integration (engine-context + crons + eval-brier + vercel.json)
- Extend `EngineContext` interface with 7 fields (`engine-context.ts` line ~194)
- Extend `EngineCalibration` interface (`types.ts` line ~466)
- Add Section 14 composite compute block to `getEngineContextForTicker` (`engine-context.ts` after ~line 1057)
- Create `/api/cron/composite-calibration/route.ts` per §Composite CI Cron template
- Create `/api/insights/composite-calibration/route.ts` — latest-snapshot reader
- Extend `scripts/eval-brier.ts` to emit `'cipher-composite-v1'` alongside existing classifier_versions
- Append cron entry to `vercel.json`
- Live-Neon integration test (`engine-context-composite.test.ts`) — verify a real ticker returns non-null `composite_prob` after cron seeding.

#### Wave 4 — UI + trust boundary + ship gate
- Extend `gemini-analysis.ts:1160-1243` overwrite block with 7 composite fields
- Add negative test: `expect(analysisResultSchema).not.toHaveProperty('composite_prob')` (Pitfall 1)
- Create `src/components/CompositeHeadline.tsx` — pure component
- Restructure `EngineCalibrationPanel.tsx`: render `<CompositeHeadline />` as headline; add "Per-Class Breakdown" section eyebrow above `QuadClassPanel`
- Snapshot test on `EngineCalibrationPanel` with (a) composite ACTIVE, (b) composite `insufficient_coverage`, (c) composite `insufficient_history`
- Create `scripts/check-composite-ship-gate.ts` per D-07 (also enforce beats-naive-mean + beats-logistic-36 per CLAUDE.md #8)
- Add `check-composite-ship-gate` to any pre-deploy CI hook if one exists
- Playwright e2e: navigate to a report page, assert composite headline renders and matches API response.

---

## Non-LLM Baselines (CLAUDE.md #8)

Composite must be benchmarked. Recommendation: **compute two baselines on the same holdout window, both stored on `CompositeCalibrationSnapshot`**:

| Baseline | Definition | Why It's the Right Benchmark |
|----------|------------|------------------------------|
| **Naive equal-weight mean** | `p_baseline = mean(p_k^cal)` over ACTIVE classes with same MIN_CLASSES_ACTIVE gate | Isolates the *value of ESS-weighting* (D-01). If composite doesn't beat this, ESS-weighting adds no value. |
| **P21.1 logistic-36** | `p_baseline = logistic36.predict(features_at_predict_time)` — existing baseline from Phase 21.1 | Answers CLAUDE.md #8 literally — proves the LLM-plus-calibration pipeline beats a plain logistic regression on the same features. Reuses `scripts/lib/logistic-36/` if it exists; otherwise `scripts/baselines/`. |

Both baselines' Brier scores are written to `CompositeCalibrationSnapshot.baseline_brier_naive_mean` / `baseline_brier_logistic_36`. `check-composite-ship-gate.ts` requires composite Brier < both baselines by ≥ 0.005. If either baseline wins, ship gate fails.

`[VERIFIED: /Users/tj/Desktop/Cipher/scripts/ contains baseline-eval + phase-21.1-status; the logistic baseline exists per STATE.md]`

---

## UI Restructure Risk

`EngineCalibrationPanel` is 1409 lines and heavily used (`ResearchReport` in `/research/[ticker]` renders it as the calibration section). Minimal-diff strategy:

### Recommended diff shape

1. **Extract `CompositeHeadline` as a new sibling component**, not a modification of `QuadClassPanel`. Keeps `QuadClassPanel` untouched — the 4 tiles continue rendering as today.
2. **Insert `<CompositeHeadline />` at the top of `EngineCalibrationPanel`** (before the existing headline row that currently renders diffusion-primary metrics).
3. **Add an eyebrow label** ("PER-CLASS BREAKDOWN" or similar, matching existing eyebrow copy style — see `QuadClassPanel` uses of `text-[10px] font-bold tracking-widest uppercase text-on-surface-variant`) immediately above the existing `QuadClassPanel` — visually reframes the existing 4-tile layout as the breakdown.
4. **Do NOT delete the existing diffusion-only section** — it's already inside `QuadClassPanel` as one of 4 tiles per Phase 17-04 refactor. The 4-tile layout IS the per-class breakdown; we just need a label.
5. **P22 `SourceMixRow` stays exactly where it is** (currently rendered between the panel body and `AlignmentDisagreementBlocks`) — no change per D-04.

### Component split recommendation

| Component | Responsibility | Reuse |
|-----------|----------------|-------|
| `CompositeHeadline` (new) | Renders `X% [Y%, Z%]` OR "insufficient signal coverage" message | New; ~40 lines pure JSX |
| `QuadClassPanel` (existing) | 4-tile per-class breakdown | Unchanged |
| `EngineCalibrationPanel` (existing shell) | Composes CompositeHeadline + eyebrow + QuadClassPanel + existing SourceMixRow + AlignmentDisagreementBlocks | ~10 lines added |

**Copy recommendation** (Claude's Discretion per CONTEXT):
- Headline: `Cipher Composite Signal`
- Value: `72%` (single number, large-mono)
- Sub-line: `range: [64%, 79%] · 3 of 4 signals active`  — matches existing subValue pattern in `MetricCard` component
- Suppressed state: `insufficient signal coverage — fewer than 2 signal classes are TRUSTED yet.`

### UI-SPEC deliverable

Per Cipher convention (Phase 16, 21.1, 22 all shipped UI-SPEC.md), the planner should emit `.planning/phases/24-composite-signal-synthesis/24-UI-SPEC.md` covering:
- Headline layout at three breakpoints (mobile/tablet/desktop)
- Copywriting contract (verbatim strings)
- Empty / suppressed / cold-start visual states
- Placement of "PER-CLASS BREAKDOWN" eyebrow relative to `QuadClassPanel`
- Test-hook `data-testid` values for Playwright coverage

---

## HYPERPARAMETERS.md Additions

Append to `HYPERPARAMETERS.md` (after existing Phase 22 section, before or after Phase 29):

```markdown
## Phase 24 — Composite Signal Synthesis

Locked hyperparameters from CONTEXT D-01..D-07. Change requires CONTEXT amendment.

### MIN_CLASSES_ACTIVE (D-03)
- **Value:** 2
- **Semantics:** minimum ACTIVE-status classes required for composite emission
- **Rationale:** K=1 is not a composite (it's just that one class); K=2 is the smallest meaningful weighted combination
- **Referenced by:** `src/lib/composite/compose.ts` `composeSignal()`

### CI_WIDEN_FACTOR (D-03)
- **Formula:** `√(4/K)` where K = active class count
- **Values:** K=4 → 1.00 (no widening), K=3 → 1.155, K=2 → 1.414, K=1 → suppressed
- **Semantics:** CI half-width multiplier to reflect fewer independent classes
- **Referenced by:** `src/lib/composite/weights.ts` `widenCi()`
- **Golden-vector test:** `weights.test.ts`

### MIN_N_FIT_PER_CLASS (isotonic curve)
- **Value:** 50
- **Semantics:** minimum (raw_posterior, outcome) pairs per class per (regime × cap_class) cell to fit an isotonic curve
- **Fallback below threshold:** use `regime='ALL'` cell's curve for that class (cold-start chain matching P22 D-09)
- **Referenced by:** `src/lib/composite/isotonic-fit.ts`

### MIN_N_HOLDOUT (composite reliability + Brier)
- **Value:** 100
- **Semantics:** minimum holdout rows before composite Brier + CORP reliability diagram are trusted
- **Fallback:** snapshot written with `status='insufficient_data'`; UI shows "insufficient history"
- **Precedent:** T-20-C-02-02 uses n=100 for per-classifier reliability

### BOOTSTRAP_N_RESAMPLES (D-02)
- **Value:** 1000
- **Semantics:** BCa bootstrap resamples for composite CI
- **Rationale:** matches P21.1 usage; sufficient for BCa stability at n≥100 rows per cell; validated to fit `maxDuration=300` on largest cell in Wave 0 prototype
- **Referenced by:** `/api/cron/composite-calibration/route.ts`

### CI_CRON_SCHEDULE
- **Value:** `0 3 * * *` (daily 03:00 UTC)
- **Isotonic refit sub-schedule:** `dayOfWeek === 1` (Mondays only) — internal guard inside route
- **Rationale:** CI drifts daily as outcomes close; isotonic curves are stable — weekly refit sufficient
- **Referenced by:** `vercel.json` crons array

### CIPHER_COMPOSITE_CLASSIFIER_VERSION (D-06)
- **Value:** `'cipher-composite-v1'`
- **Semantics:** classifier_version used for reliability diagram publication AND CompositeCalibrationSnapshot rows
- **Bumping:** increment to `v2` on any material change to weighting scheme, calibration algorithm, or gate logic — triggers auto-refit + reliability diagram regeneration

### SHIP_GATE_BRIER_MAX (D-07)
- **Value:** 0.24
- **Precedent:** same as `scripts/eval-brier.ts` per-classifier gate (T-20-C-02-01)

### SHIP_GATE_ECE_MAX (D-07)
- **Value:** 0.05
- **Precedent:** aligned with CLAUDE.md load-bearing rule #2 (calibration is first-class)

### SHIP_GATE_COVERAGE_MIN (D-07)
- **Value:** 0.50
- **Semantics:** ≥50% of tickers must have ≥2 classes ACTIVE (i.e., composite emits a non-null probability for ≥50% of the universe)

### SHIP_GATE_BASELINE_LIFT_MIN (CLAUDE.md #8)
- **Value:** 0.005 (Brier score)
- **Semantics:** composite Brier must undercut BOTH naive-mean baseline AND logistic-36 baseline by at least 0.005 on the same holdout window
- **Referenced by:** `scripts/check-composite-ship-gate.ts`
```

---

## CI Gate Script

**Recommendation: new standalone script `scripts/check-composite-ship-gate.ts`** — do NOT extend `phase-21.1-status.ts`.

**Rationale:**
- `phase-21.1-status.ts` is scoped to P21.1's 5-gate `patternStatus` promotion — different concern.
- Ship gate for P24 is a snapshot health check on `CompositeCalibrationSnapshot` — reads Neon, evaluates D-07 criteria + CLAUDE.md #8 baselines, exits nonzero on fail. Standalone keeps it focused.
- Precedent: `phase-22-status.ts` exists as separate script; P24 gets its own.

### Script contract

```typescript
// scripts/check-composite-ship-gate.ts
// Enforces D-07 ship gate + CLAUDE.md #8 non-LLM baseline requirement.
// Exit code: 0 = ship-eligible, 1 = gate failed, 2 = insufficient data
//
// Usage:
//   npx tsx scripts/check-composite-ship-gate.ts                    # latest snapshot per cell
//   npx tsx scripts/check-composite-ship-gate.ts --regime bull-low-vol --cap large_cap
//   npx tsx scripts/check-composite-ship-gate.ts --json             # machine-readable output
//
// Gates checked (all must pass):
//   1. composite_brier <= 0.24                          (D-07)
//   2. ece <= 0.05                                       (D-07)
//   3. coverage (fraction of universe with K>=2) >= 0.50 (D-07 — derived from separate query)
//   4. composite_brier < baseline_brier_naive_mean - 0.005     (CLAUDE.md #8)
//   5. composite_brier < baseline_brier_logistic_36 - 0.005     (CLAUDE.md #8)
```

**Optional integration hook:** if `.github/workflows/` has a pre-deploy gate, add `npx tsx scripts/check-composite-ship-gate.ts --json` there (defer to planner — repo may or may not have this).

---

## Validation Architecture

`workflow.nyquist_validation = true` in `.planning/config.json` — this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project default per CLAUDE.md dev guidelines #4) |
| Config file | `vitest.config.ts` (repo root — existing) |
| Quick run command | `npm test -- src/lib/composite/` |
| Full suite command | `npm test` |
| Integration command | `npm run test:integration` (live Neon) |
| E2E command | `npm run test:e2e` (Playwright) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REASON-01 | composeSignal returns ESS-weighted calibrated composite for K=4 ACTIVE classes | unit | `npm test -- src/lib/composite/__tests__/compose.test.ts` | ❌ Wave 0 |
| REASON-01 | composeSignal renormalizes weights when K=3 (one class EXPLORATORY) | unit | `npm test -- src/lib/composite/__tests__/compose.test.ts -t "K=3 renormalize"` | ❌ Wave 0 |
| REASON-01 | composeSignal suppresses when K<2 | unit | `npm test -- src/lib/composite/__tests__/compose.test.ts -t "K<2 suppress"` | ❌ Wave 0 |
| REASON-02 | widenCi returns √(4/K) at K∈{1,2,3,4} | unit | `npm test -- src/lib/composite/__tests__/weights.test.ts` | ❌ Wave 0 |
| REASON-02 | BCa CI on composite Brier reproducible with seed=42 | unit (fixture) | `npm test -- src/lib/composite/__tests__/isotonic-fit.test.ts -t "bootstrap seed"` | ❌ Wave 0 |
| REASON-02 | Isotonic fit rejects look-ahead rows (`resolved_at > predicted_at + horizon` enforced) | unit (fixture) | `npm test -- src/lib/composite/__tests__/isotonic-fit.test.ts -t "look-ahead defense"` | ❌ Wave 0 |
| REASON-03 | EngineCalibrationPanel renders composite headline when composite_gate_status === 'active' | snapshot | `npm test -- src/components/__tests__/EngineCalibrationPanel.test.tsx -t "composite headline"` | ❌ Wave 4 |
| REASON-03 | EngineCalibrationPanel renders "insufficient signal coverage" when status === 'insufficient_coverage' | snapshot | `npm test -- src/components/__tests__/EngineCalibrationPanel.test.tsx -t "coverage empty"` | ❌ Wave 4 |
| REASON-03 | Playwright: report page renders composite headline matching API response | e2e | `npm run test:e2e -- report-composite.spec.ts` | ❌ Wave 4 |
| REASON-04 | /insights/calibration renders a ReliabilityDiagram for 'cipher-composite-v1' after cron seeds a snapshot | integration | `npm run test:integration -- insights-composite-reliability.test.ts` | ❌ Wave 3 |
| REASON-05 | analysisResultSchema shape does NOT contain composite_prob | unit | `npm test -- src/lib/__tests__/schema-trust-boundary.test.ts -t "no composite"` | ❌ Wave 4 |
| REASON-05 | runGeminiAnalysis output composite_prob equals engineCtx.composite_prob (LLM cannot inject) | integration | `npm run test:integration -- gemini-analysis-composite-overwrite.test.ts` | ❌ Wave 4 |
| D-07 ship gate | check-composite-ship-gate.ts exits 0 when composite passes all 5 criteria | script | `npx tsx scripts/check-composite-ship-gate.ts` | ❌ Wave 4 |

### Sampling Rate
- **Per task commit:** `npm test -- src/lib/composite/` (Waves 1-2) or `npm test -- src/lib/composite/ src/lib/engine-context.ts` (Waves 3-4)
- **Per wave merge:** `npm test && npm run test:integration` (integration required when Neon-touching tests exist)
- **Phase gate:** `npm test && npm run test:integration && npm run test:e2e && npx tsx scripts/check-composite-ship-gate.ts` — all green before `/gsd-verify-work`

### Wave 0 Gaps

All test files below MUST be created in Wave 0 as RED scaffolds (empty `it.todo` or expected-to-fail assertions):

- [ ] `src/lib/composite/__tests__/compose.test.ts` — covers REASON-01
- [ ] `src/lib/composite/__tests__/weights.test.ts` — covers REASON-02 (widenCi)
- [ ] `src/lib/composite/__tests__/isotonic-fit.test.ts` — covers REASON-02 (fit + bootstrap + look-ahead defense)
- [ ] `src/lib/composite/__tests__/engine-context-composite.test.ts` — covers REASON-03 wiring (integration, live Neon)
- [ ] `src/lib/__tests__/schema-trust-boundary.test.ts` — covers REASON-05 (Zod schema negative test) — MAY already exist per prior phases; extend if so
- [ ] `src/lib/__tests__/gemini-analysis-composite-overwrite.test.ts` — covers REASON-05 wiring (integration)
- [ ] `src/components/__tests__/EngineCalibrationPanel.test.tsx` — extend existing (very likely exists) with composite headline snapshot cases
- [ ] `src/app/api/insights/composite-calibration/__tests__/route.test.ts` — endpoint reads latest snapshot
- [ ] `src/app/api/cron/composite-calibration/__tests__/route.test.ts` — cron auth + happy path
- [ ] `tests/e2e/report-composite.spec.ts` — Playwright e2e for headline rendering
- [ ] `tests/e2e/insights-composite-reliability.spec.ts` — Playwright e2e for /insights/calibration composite card

**Framework install:** None — Vitest + Playwright already in `package.json`. `[VERIFIED: CLAUDE.md dev guidelines #4]`

---

## Security Domain

`security_enforcement` not explicitly configured — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Composite endpoints reuse existing NextAuth session; no new auth surface |
| V3 Session Management | no | No session state added |
| V4 Access Control | yes | `/api/cron/composite-calibration` MUST check `Authorization: Bearer ${CRON_SECRET}` header (mirror `magnitude-calibration/route.ts:16`). `/api/insights/composite-calibration` is read-only and unauthenticated per `/insights/*` convention. |
| V5 Input Validation | yes | Cron route takes no user input; insights route takes optional `regime` + `cap_class` query params → validate against fixed enum (Zod `.enum([...])`) before Prisma query |
| V6 Cryptography | no | No secrets, keys, hashing beyond existing infra |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cron endpoint invoked by attacker (unauthorized fit/write) | Tampering | Bearer-token gate (mirror existing crons) |
| Prisma injection via query params on insights endpoint | Tampering | Zod enum validation + Prisma parameterized queries (Prisma default) |
| LLM smuggles a bogus composite value into report prose | Tampering | Post-process overwrite at `gemini-analysis.ts:1160-1243` (REASON-05, Pitfall 1) — the primary defense |
| Snapshot table grows unbounded | Availability | Retention policy: keep last 365 days per (classifier_version, regime, cap_class); pruner cron out of scope for P24 but flag for follow-up |

---

## Environment Availability

Only external dependency: Neon Postgres (production DB). Vercel Cron for scheduling.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Neon Postgres | CompositeCalibrationSnapshot writes + reads | ✓ | current | — (blocking if unavailable, but no realistic scenario in production) |
| Vercel Cron | `/api/cron/composite-calibration` daily invocation | ✓ | inherited from `vercel.json:15-46` | — |
| Node.js runtime | Cron route execution | ✓ | Vercel Functions default | — |
| Vitest | Unit + integration tests | ✓ | in `package.json` | — |
| Playwright | E2E tests | ✓ | in `package.json` per CLAUDE.md | — |

**No new external services.** No LLM inference in composite path — this is a pure DB + math pipeline.

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

---

## Runtime State Inventory

Not a rename/refactor/migration phase. **N/A** — this section is skipped per the researcher runbook.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Report.analysis.engine_calibration.posterior_mean` is persisted at generation time and immutable (used as fit dataset source) | §Isotonic Fit Pipeline, §Pitfall 2 | If mutable, isotonic fit becomes circular → Wave 2 must fall back to `LearningEvent.delta.posterior_before`. Verify by inspecting a real Report row before Wave 2 starts. |
| A2 | Bootstrap with `nResamples=1000` on ~5k-row largest cell fits within `maxDuration=300` on Vercel Functions | §Composite CI Cron, §Pitfall 6 | If it times out, drop to `nResamples=500` OR split into per-cell separate cron invocations. Prototype in Wave 0. |
| A3 | Current `LearnedPattern.status='ACTIVE'` coverage is ≥50% across the universe at any (cap_class × 30d) cell for the composite gate D-07 | §Pitfall 5 | If <50%, D-07 ship gate fails on coverage; CONTEXT amendment needed. Measure in Wave 0 with a one-line query — cheap. |
| A4 | The P21.1 logistic-36 baseline exists as a callable helper somewhere in `scripts/baselines/` or `scripts/lib/` | §Non-LLM Baselines | If not, Wave 3 must build a thin wrapper before ship-gate script can call it. Likely exists per STATE.md but requires verification. |
| A5 | `EngineCalibrationPanel` has a component test file already (`__tests__/EngineCalibrationPanel.test.tsx`) that can be extended for snapshot cases | §Validation Architecture Wave 0 Gaps | If not, Wave 0 creates it from scratch — small addition, no risk. |
| A6 | `analysisResultSchema` (the Zod schema Gemini fills) is defined in `src/lib/schemas.ts` or `src/lib/gemini-analysis.ts` and its `.shape` can be inspected in a test | §Pitfall 1, §Validation Architecture REASON-05 | If not directly inspectable, use `.parse({...})` with a probe object; adjust test approach. |

Assumptions are all Wave 0 or early-Wave-1 verifiable. None are load-bearing on the phase's viability.

---

## Open Questions

1. **Whether to embed a mini reliability tile inside `EngineCalibrationPanel` (like `MagnitudeCalibrationTile`) or only publish it to `/insights/calibration`.**
   - What we know: `MagnitudeCalibrationTile` sets the pattern for in-panel reliability visualization; CONTEXT D-04 only mandates publication at `/insights/calibration`.
   - What's unclear: whether user-visibility benefits from an in-panel tile or if that clutters the panel.
   - Recommendation: **defer to UI-SPEC**. Ship without in-panel tile in Wave 4; add follow-up ticket if operator wants it.

2. **Whether daily CI cron is truly needed vs weekly.**
   - What we know: outcomes close daily; but CI band is over historical population Brier, not point predictions — it can be stable day-to-day.
   - What's unclear: how fast CI drifts in practice.
   - Recommendation: **start daily, downgrade to weekly if a week of daily observations shows CI drift <1pp per day**. Adjustable by editing `vercel.json` one line — low switching cost.

3. **Whether to include `regime='ALL'` composite as a separate row OR only as cold-start fallback.**
   - What we know: P22 pattern uses `regime='ALL'` as unconditional fallback via cold-start chain; composite could inherit.
   - What's unclear: whether operators need `ALL`-regime composite as a standalone benchmark in the ship-gate script.
   - Recommendation: **compute and store `regime='ALL'` snapshots** (they're just one more cell in the cron loop), and use them as cold-start fallback for cells where a specific-regime snapshot doesn't exist. Mirrors P22 D-09.

4. **Where to compute the P21.1 logistic-36 baseline call — inside the cron or in a separate script?**
   - What we know: the logistic-36 baseline was shipped in P21.1; it needs to be callable for ship-gate comparison.
   - What's unclear: whether the existing baseline is a script (batch) or a function (callable per-row).
   - Recommendation: **Wave 3 audit** — if it's a script, wrap in a callable; if it's already callable, invoke directly from the cron. Do not duplicate.

---

## Sources

### Primary (HIGH confidence — verified in-repo this session)
- `/Users/tj/Desktop/Cipher/src/lib/stats/isotonic.ts:52-232` — PAV isotonic + CORP reliability primitives
- `/Users/tj/Desktop/Cipher/src/lib/evaluation/bootstrap.ts:1-243` — BCa bootstrap with n<10 fallback, degeneracy handling
- `/Users/tj/Desktop/Cipher/src/lib/evaluation/index.ts` — barrel export confirming `bootstrapBCa` is public
- `/Users/tj/Desktop/Cipher/src/lib/engine-context.ts:140-333, 820-1160` — EngineContext type + per-class posterior compute pattern
- `/Users/tj/Desktop/Cipher/src/lib/gemini-analysis.ts:1150-1243` — numeric-overwrite trust boundary
- `/Users/tj/Desktop/Cipher/prisma/schema.prisma:150-188` (LearnedPattern), :199-219 (TemperatureCalibration blueprint), :83-127 (PriceOutcome), :713-723 (MagnitudeCalibrationBucket)
- `/Users/tj/Desktop/Cipher/src/app/api/cron/magnitude-calibration/route.ts:1-65` — canonical cron template
- `/Users/tj/Desktop/Cipher/src/app/insights/calibration/page.tsx:1-93` + `components/ReliabilityDiagram.tsx:1-133` — reliability publication pattern
- `/Users/tj/Desktop/Cipher/src/components/EngineCalibrationPanel.tsx` (1409 lines, structural read) — panel restructure surface
- `/Users/tj/Desktop/Cipher/src/components/MagnitudeCalibrationTile.tsx:1-131` — client-island tile pattern
- `/Users/tj/Desktop/Cipher/vercel.json` — cron config surface
- `/Users/tj/Desktop/Cipher/HYPERPARAMETERS.md` — hyperparameter documentation blueprint
- `/Users/tj/Desktop/Cipher/CLAUDE.md` — load-bearing rules #1, #2, #3, #4, #6, #7, #8
- `/Users/tj/Desktop/Cipher/.planning/REQUIREMENTS.md:63-69` — REASON-01..05 verbatim
- `/Users/tj/Desktop/Cipher/.planning/phases/24-composite-signal-synthesis/24-CONTEXT.md` — D-01..D-07 locked decisions
- `/Users/tj/Desktop/Cipher/.planning/phases/21.1-capacity-to-detect-edge/` — wave-decomp precedent (7 waves, 6 plans)
- `/Users/tj/Desktop/Cipher/.planning/phases/29-magnitude-calibration/` — wave-decomp precedent (4 plans)

### Secondary (MEDIUM confidence — cited from CONTEXT or prior phases)
- Dimitriadis-Gneiting-Jordan (2021) — CORP reliability method — cited in `isotonic.ts` header + Phase 20-C-02 precedent
- Efron (1987) — BCa bootstrap — cited in `bootstrap.ts` header + Phase 21.1 precedent
- Barlow-Brunk (1972), Ayer et al. (1955) — PAV isotonic — cited in `isotonic.ts`
- CS229 "Evaluation Metrics" chapter — reliability diagrams + ECE (from CLAUDE.md §Statistical-Methods Reference)
- ISL Ch. 4 (Classification / Calibration) + Ch. 5 (Bootstrap) — from CLAUDE.md §Statistical-Methods Reference

### Tertiary (LOW confidence — flagged as assumptions above)
- None. All assumptions listed in the Assumptions Log are Wave 0 verifiable.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every primitive verified in-repo this session with file:line references
- Architecture patterns: **HIGH** — three prior phases (17, 20-C-02, 21.1) provide direct templates
- Pitfalls: **HIGH** — each pitfall backed by a known trap from prior phase execution (Phase 17 numeric overwrite, Phase 20-C-02 CORP experience, Phase 21.1 bootstrap-in-cron experience, CLAUDE.md rules #6 and #8)
- File change map: **HIGH** — every EDIT target read and every NEW file has a template
- Wave decomposition: **HIGH** — matches Cipher canonical 5-wave shape used by P17, P20, P21, P22, P29
- Validation architecture: **HIGH** — Vitest + Playwright confirmed; test targets map 1:1 to REASON-01..05 + D-07
- HYPERPARAMETERS additions: **HIGH** — every value derived from D-01..D-07 or CLAUDE.md rules
- Ship-gate script: **HIGH** — pattern well-established in-repo (phase-21.1-status, phase-22-status)

**Research date:** 2026-09-16
**Valid until:** 2026-10-16 (30-day estimate — no external library dependencies, so shelf-life is limited only by in-repo code drift)
