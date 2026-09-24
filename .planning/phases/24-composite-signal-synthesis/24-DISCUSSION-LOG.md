# Phase 24: Composite Signal Synthesis - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-16
**Phase:** 24-composite-signal-synthesis
**Mode:** User-directed auto-decide ("just make all decisions smartly, prioritizing simplicity and accuracy without sacrificing latency")
**Areas discussed:** All 4 identified gray areas (single decision pass; user delegated selection)

---

## Meta

The user selected "Other" on the initial gray-area multi-select and specified: *"just make all decisions smartly, prioritizing simplicity and accuracy without sacrificing latency"*. Claude proceeded through all 4 gray areas making decisions under that constraint. Each decision below shows the options that were on the table and which one was chosen with rationale.

---

## Weighting Scheme

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed equal weights | Composite = mean of 4 posteriors | |
| Per-class rolling IC weights | Weights ∝ predictive Information Coefficient (uses 20-C-01 IC monitor) | |
| Learned per-regime weights (P22 pattern) | Weights learned per (class × regime) via posterior update | |
| ESS-weighted mean of isotonic-calibrated posteriors | Per-class PAV isotonic calibration, then combine with weights ∝ ESS | ✓ |

**Selected:** ESS-weighted mean of per-class isotonic-calibrated posteriors
**Rationale:** Meets REASON-01 literally ("per-class isotonic-calibrated weighted combination"). Simpler than learned per-regime weights (defers that complexity to a future phase once we have live data). More accurate than fixed-equal because ESS respects sample-size trust. Zero report-time latency — isotonic curves pre-fit in cron and cached; composite arithmetic is O(K).

---

## Correlation-Aware CI

| Option | Description | Selected |
|--------|-------------|----------|
| Empirical correlation matrix from historical outcomes | Fit 4×4 correlation matrix, propagate through CI closed-form | |
| BCa bootstrap on composite scores | Bootstrap-resample historical (ticker × as-of) rows; correlation preserved automatically | ✓ |
| Assume independence with shrinkage | Naive independent-CI with a fudge factor | |

**Selected:** BCa bootstrap on composite scores against historical outcomes
**Rationale:** Bootstrap-resamples full rows so per-class correlation is preserved automatically — no separate correlation matrix required. Uses existing `src/lib/evaluation/bootstrap.ts` primitive from P21.1. Runs in nightly cron; zero report-time latency. Simpler than explicit correlation-matrix bookkeeping.

---

## Insufficient-Data Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Renormalize over available classes with MIN gate + CI widening | K < 4 → renormalize weights + widen CI by √(4/K); K < 2 → suppress | ✓ |
| Gate entirely (need all 4 ACTIVE) | Suppress composite unless K = 4 | |
| Partial badge with unmodified CI | Show composite with warning label; no CI adjustment | |

**Selected:** Renormalize with MIN_CLASSES_ACTIVE=2 gate + √(4/K) CI widening
**Rationale:** More honest than "partial badge" (which hides the coverage trade-off). Less brittle than requiring all 4 (majority of tickers don't have all 4 classes ACTIVE early on). CI widening is a principled small penalty for fewer independent signals. Simple to implement + explain.

---

## Display + Phase 22 Interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Composite becomes headline; diffusion tile moves to per-class breakdown; P22 source-mix stays | Composite replaces current diffusion-only headline visually; source-mix row coexists | ✓ |
| New dedicated "Composite Signal" section below existing panel | Additive — leaves current diffusion headline in place | |
| Composite as small badge next to Buy/Hold/Sell | Minimal visual disruption | |
| Composite replaces P22 source-mix entirely | Merge concepts | |

**Selected:** Composite becomes the headline; diffusion tile moves to Per-Class Breakdown; P22 source-mix row coexists
**Rationale:** Phase 24 is the "first user-visible v2.0 win" per ROADMAP — needs prominent placement, not a badge. P22 source-mix is a different concept (which sources drive the prior, vs the calibrated headline probability) — merging would lose information. Coexistence is honest.

---

## Trust Boundary (REASON-05)

Not a gray area — REASON-05 is prescriptive ("Composite computed in engine-context.ts, never from LLM"). Follows existing engine-calibration numeric-overwrite pattern from `gemini-analysis.ts:1160-1243`. 7 new fields added to `EngineContext`; post-process overwritten in `runGeminiAnalysis`; LLM never sees them.

---

## Claude's Discretion

Areas explicitly left to the planner:
- Exact hyperparameter defaults (MIN_CLASSES_ACTIVE, min-n-for-isotonic-fit)
- CI cron frequency (hourly vs daily) — planner picks based on backfill volume
- UI copy tone ("Cipher Composite Signal" vs "Calibrated Probability")
- Existing reliability-diagram component to reuse vs slight variant

## Deferred Ideas

- Learned per-regime composite weights (future phase, needs ≥6mo live data)
- Counterfactual leave-one-out deltas (belongs in Phase 25)
- Composite over 8-source axis (P25+ consideration)
- Cross-signal contradiction detector (later phase)

---

## Wave 0 coverage probe

**Date:** 2026-09-23
**SQL:** `tests/composite/_fixtures/coverage-probe.sql`
**Runner:** operator (Claude, executed via psql against live Neon with operator credentials)
**Result:** `coverage_fraction = 0.3333333333333333` (below D-07 ship gate threshold of 0.50)

**Decision:** Option (b) — defer ship gate enforcement, keep methodology intact.

**Rationale:**
- `MIN_CLASSES_ACTIVE = 2` remains pinned in HYPERPARAMETERS.md — the composite-signal design demands ≥2 active classes; a single-signal "composite" is definitionally not a composite.
- Wave 4's `scripts/check-composite-ship-gate.ts` will correctly refuse promotion until organic coverage rises above 0.50. That is the gate doing its job — no silent relaxation.
- Coverage will improve organically as P21.1 patternStatus promotions accumulate more `ACTIVE` cells across cap_class dimensions (currently 1 of 3 cap_class cells has ≥2 ACTIVE distinct signal_class rows at horizon_days=30 / regime='ALL').
- Rejected: (a) drop MIN_CLASSES_ACTIVE to 1 — defeats the point of "composite"; (c) widen regime slice — the LIVE engine reads regime='ALL' at report time, so widening the probe would misrepresent what production actually sees.

**Downstream implication:** Waves 1-4 build the full pipeline; the ship gate blocks production promotion (Wave 4 D-07) until Neon accumulates enough ACTIVE cells. This is expected behavior, not a defect.

**Scaffold fix committed:** `tests/composite/_fixtures/coverage-probe.sql` originally referenced non-existent column `patternStatus`; corrected to `status` (matches Prisma-generated column name; P21.1 5-gate promotion values land in `LearnedPattern.status`).
