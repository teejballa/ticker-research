# Phase 18: Time-Decayed Bayesian Updates + ESS - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 18-time-decayed-bayesian-updates-ess
**Areas discussed:** λ tuning, ESS gate, drift action, UI surface, backfill, Page-Hinkley parameters

---

## Per-class λ tuning strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Empirical grid search now | Grid over λ ∈ {14,30,60,90,180,365}d per signal_class, score via OOS Brier on 87 existing PriceOutcomes via Purged K-Fold + Embargo. Pick best λ per class. Risk: N=87 thin — winner may not be robust. | ✓ |
| Sane default now, tune in P23 (Recommended) | Ship single default (λ=90d diffusion/technical, λ=180d institutional/insider). Re-tune in P23 once P27 backfill bootstraps real N. | |
| Hand-pick from research priors | diffusion=60d, technical=90d, institutional=180d, insider=180d. No tuning. Document picks. | |

**User's choice:** Empirical grid search now (overrode the recommended option)
**Notes:** "most advanced and optimal now, do not put things off for later" — explicit direction to skip the deferral path. Thin-N risk acknowledged but accepted because λ is a config knob and is reversible. Same CV protocol (Purged K-Fold + Embargo with purge=embargo=90d) applies.

---

## ESS-based EXPLORATORY → ACTIVE gate

| Option | Description | Selected |
|--------|-------------|----------|
| ESS < 30 (research recommendation) | Stricter gate per Pitfalls research — industry standard for binary-outcome ML. Most cells stay EXPLORATORY longer; ACTIVE flags become more meaningful. Pairs with P23 FDR. | ✓ |
| ESS < 10 (Recommended) | Direct ESS substitution — same threshold spirit as v1.0 but in effective sample size. Keeps v1.0 ACTIVE cell count alive while migration soaks. Tighten in P23. | |
| Class-specific thresholds | diffusion ESS<10, technical ESS<15, institutional/insider ESS<5. More tuning surface, reflects each class's natural data velocity. | |

**User's choice:** ESS < 30 (research recommendation)
**Notes:** Aligns with the same "most advanced now" principle as λ tuning — picks the rigorous threshold rather than the migration-friendly one. Most v1.0 ACTIVE cells will revert to EXPLORATORY post-migration, which is correct given Pitfall 6 (in-sample-only promotion produced false positives).

---

## Drift detector action when fired

| Option | Description | Selected |
|--------|-------------|----------|
| Log + new EXPLORATORY-WATCH status (Recommended) | Write `drift_alert` LearningEvent AND flip status to new `EXPLORATORY-WATCH`. Cell still surfaced but flagged. No auto-demote (Pitfall 13). | ✓ |
| Log-only | Write `drift_alert` and surface in `EngineCalibration`. Status unchanged. Minimal-surface change. Demotion deferred to P23. | |
| Auto-demote with persistence window | After 14 consecutive days drift_z high OR OOS Brier degradation > 0.03, flip ACTIVE → EXPLORATORY. | |

**User's choice:** Log + new EXPLORATORY-WATCH status
**Notes:** Auto-demote is explicitly avoided per Pitfall 13 — small-N false positives flap cells. The EXPLORATORY-WATCH state is non-silencing: cell still feeds Engine Calibration so the user sees the watching badge alongside the prior. Recovery requires both drift signals clear for 14 days AND ESS ≥ 30.

---

## EngineCalibrationPanel UI surface

| Option | Description | Selected |
|--------|-------------|----------|
| Show ESS only + drift hint badge (Recommended) | Replace raw N with ESS. When drift_z elevated, show "regime stability: watching" badge. Cleanest user-facing surface. | ✓ |
| Show both N and ESS side-by-side | Display "N=42 (ESS=18)". Transparent but busier. | |
| ESS replaces N silently | Just show ESS where N was; defer drift badging to P28. Minimum viable. | |

**User's choice:** Show ESS only + drift hint badge
**Notes:** Aligns with CORE-ML-05 wording. Raw N stays available in `/insights` debug surface only. Phase 28 dashboard will surface drift-history detail.

---

## Backfill of existing 87 PriceOutcomes

| Option | Description | Selected |
|--------|-------------|----------|
| Recompute ESS from `recorded_at` timestamps (Recommended) | One-time backfill cron walks every existing outcome, applies per-class λ decay using `recorded_at`, recomputes posteriors + ESS. No observation discarded. | ✓ |
| Reset all posteriors to Beta(1,1) | Wipe LearnedPattern state, rebuild from `recorded_at`-ordered replay. Functionally equivalent. | |
| Grandfather: pre-P18 = weight 1, decay only new | Easiest. Old observations dominate posteriors longer than they should. | |

**User's choice:** Recompute ESS from `recorded_at` timestamps
**Notes:** Mirrors the replay discipline P27 will need at scale. One transaction, idempotent, gated by env flag. The 30d rolling alpha_30d/beta_30d are also rebuilt during the same replay so drift_z is internally consistent post-migration.

---

## Add-on locked decisions (from "Anything missing?" check)

User selected: "Add Page-Hinkley parameter tuning approach", "Add minimum N=30 floor for drift testing", "Add ESS formula choice".

### Page-Hinkley (δ, λ_PH) tuning

| Option | Description | Selected |
|--------|-------------|----------|
| Empirical per-class tuning (Recommended) | Grid over δ ∈ {0.001, 0.005, 0.01} and λ_PH ∈ {30, 50, 100} per signal_class via Purged K-Fold + Embargo, score by drift-detection F1 on synthetic injected drift in held-out folds. | ✓ |
| Bifet & Gavaldà defaults | δ=0.005, λ_PH=50 uniform across classes. Document as known limitation. | |
| Per-class hand-picked from prior | diffusion (δ=0.01, λ_PH=30), technical (δ=0.005, λ_PH=50), institutional/insider (δ=0.005, λ_PH=100). No tuning. | |

**User's choice:** Empirical per-class tuning
**Notes:** Same defensibility bar as λ tuning. Synthetic drift injection used because real drift events in the 87-outcome corpus are too rare for direct F1 scoring.

### Minimum N=30 floor for drift testing

Locked as direct research mandate from Pitfall 13. Drift detector does not run on cells with raw N < 30; output is uninformative. No options needed — this is a defensive default, not a design decision.

### ESS formula

Locked as **Kish formula**: `ESS = (Σ w_i)² / Σ w_i²` where `w_i = exp(-Δt_i / λ)`. Standard for weighted-sample work. Every subsequent v2.0 phase assumes this form.

---

## Claude's Discretion

- Naming of new pure functions inside `learning.ts` and the migration filename
- Storage shape of per-class λ and Page-Hinkley parameters (`LearningHyperparameters` table vs config constant) — researcher and planner decide based on existing codebase patterns
- Backfill cron as separate route vs inline migration script — implementation detail

## Deferred Ideas

None — all discussion stayed within Phase 18 scope.

Cross-phase items mentioned for context but explicitly deferred:
- Auto-demote on persistent drift → revisit only after P23 ships OOS Brier as co-confirmation
- Drift-alert dashboard tile + ESS distribution heatmap → P28
- ESS-weighted information-gain reward function → P26
- Class-specific lift thresholds → P23
