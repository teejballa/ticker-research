# Phase 18: Time-Decayed Bayesian Updates + ESS - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 18 is the **keystone** of v2.0. It introduces `effective_sample_size` (ESS) to `LearnedPattern` via per-class exponential time decay, replaces raw-N gating with ESS gating, adds a Page-Hinkley drift detector that emits `LearningEvent` of type `drift_alert` and flips affected cells to a new `EXPLORATORY-WATCH` status, and surfaces ESS + drift hint in the `EngineCalibrationPanel`. All later v2.0 phases (19, 21, 26) consume `effective_sample_size` produced here.

In scope:
- `LearnedPattern.effective_sample_size` column (additive migration)
- Per-class half-life λ — empirically tuned via Purged K-Fold + Embargo CV, no global default
- Per-class Page-Hinkley parameters (δ, λ_PH) — empirically tuned via the same CV protocol
- Page-Hinkley drift detector emitting `drift_alert` LearningEvents and assigning new `EXPLORATORY-WATCH` status
- ESS-based credible intervals everywhere posteriors surface (`/insights`, `EngineCalibrationPanel`)
- One-time backfill of all 87 existing PriceOutcomes through the new decay engine using `recorded_at` timestamps
- ESS column in `EngineCalibrationPanel` (replacing raw N) plus a "regime stability: watching" badge when drift_z elevated

Out of scope (deferred to listed phase):
- Hierarchical pooling using ESS — Phase 19
- Regime feature in cell key — Phase 20
- Lift-gated ACTIVE promotion (FDR + Purged-CV OOS Brier) — Phase 21
- Drift-alert dashboard tile + ESS heatmap — Phase 26
- Auto-demote on persistent drift — explicitly NOT in P18 (Pitfall 13: drift-alone demotion flaps cells on noise; revisit only after P21 ships OOS Brier degradation as a confirmation signal)

</domain>

<decisions>
## Implementation Decisions

### Time decay (CORE-ML-02)
- **D-01:** Per-class half-life λ is **empirically tuned now** via grid search over λ ∈ {14, 30, 60, 90, 180, 365} days per `signal_class`, scored by out-of-sample Brier under **Purged K-Fold + Embargo** CV (López de Prado). One winning λ per class, persisted as a config constant. No global default. Re-tuning in P21 is allowed but not required — we ship the keystone with the most defensible λ available now.
- **D-02:** Tuning runs against the existing 87 PriceOutcomes plus any new outcomes resolved before P18 ships. Users have explicitly directed: "most advanced and optimal now, do not put things off for later." Thin-N is acknowledged but accepted because (a) it's the same N P21 will start from after backfill bootstraps, (b) the decision is reversible — λ is a config knob.
- **D-03:** ESS is computed via the **Kish formula**: `ESS = (Σ w_i)² / Σ w_i²` where `w_i = exp(-Δt_i / λ)` and `Δt_i` is days between observation timestamp and `now()`. This is the standard for survey/weighted-sample work and is what every subsequent v2.0 phase will assume.

### ESS-based promotion gate (CORE-ML-01, CORE-ML-03)
- **D-04:** Replace `sample_size < 10 → EXPLORATORY` with `effective_sample_size < 30 → EXPLORATORY`. Threshold 30 follows the Pitfalls research recommendation (industry standard for binary-outcome ML). Pairs cleanly with Phase 21's FDR-corrected OOS Brier-lift gate — by the time a cell reaches ESS≥30 it's a meaningful candidate, not a small-N artifact.
- **D-05:** Credible intervals reported in `/insights` and the `EngineCalibrationPanel` are computed against ESS, not raw N — sparse-but-recent cells visibly tighten faster than sparse-but-old cells.

### Drift detector (CORE-ML-04)
- **D-06:** Page-Hinkley drift detector runs nightly inside the `learn` cron, per cell. **Two-of-two confirmation rule** required to fire: both `|drift_z| > 2` AND Page-Hinkley statistic exceeds threshold. Single-test alerts are silently logged for diagnostics but do not change cell state.
- **D-07:** Page-Hinkley parameters (δ magnitude, λ_PH sensitivity) are **empirically tuned per signal_class** via Purged K-Fold + Embargo CV with synthetic injected drift in held-out folds. Grid: δ ∈ {0.001, 0.005, 0.01}, λ_PH ∈ {30, 50, 100}. Score: drift-detection F1 on injected-drift folds. Same defensibility bar as λ tuning (D-01). No published-default fallback.
- **D-08:** Drift detection requires **minimum raw N ≥ 30** on the cell. Cells below this floor never run the drift test (output is uninformative). Per Pitfall 13.
- **D-09:** When the drift detector fires for a cell:
  1. Write a `LearningEvent` with `event_type='drift_alert'` carrying drift_z, PH statistic, raw N, and ESS at fire time
  2. Flip cell `status` to new `EXPLORATORY-WATCH` value
  3. Cell continues to be eligible for Engine Calibration injection — it is not silenced
  4. **No auto-demote.** Recovery to `ACTIVE` requires the cell to clear both drift signals for 14 consecutive days AND maintain ESS ≥ 30
  5. Pitfall 13 explicitly forbids auto-demotion-on-drift-alone — small-N false positives flap cells

### Engine Calibration UI (CORE-ML-05)
- **D-10:** `EngineCalibrationPanel` on `/research/[ticker]` replaces the raw-N column with ESS as the user-facing currency. One number per cell, plain-English subtitle preserved (per Phase 17 D-Log).
- **D-11:** When a cell's status is `EXPLORATORY-WATCH`, render a compact "regime stability: watching" badge adjacent to the column. No additional text in the headline — Phase 26 will surface drift-history detail in the dashboard.
- **D-12:** No N=42 (ESS=18) hybrid display. ESS is the single number; raw N is available only in the `/insights` debug surface.

### Migration & data carry-forward (CORE-ML-01)
- **D-13:** A one-time backfill cron (`/api/cron/backfill-ess`, idempotent, gated by env flag) walks every existing PriceOutcome ordered by `recorded_at`, recomputes per-cell α/β/ESS using the chosen per-class λ, and writes the result back to each `LearnedPattern` row inside a single `prisma.$transaction`. The 30d rolling alpha_30d/beta_30d are also rebuilt from the same replay so drift_z is consistent post-migration.
- **D-14:** No observation is discarded. No grandfather hack. Migration is reversible by re-running with a different λ — the raw outcomes table is the source of truth.

### Cross-cutting v2.0 mandates honored in P18
- **D-15:** `LearnedPattern` migration adds `effective_sample_size Float NOT NULL DEFAULT 0` and `n_trials_attempted Int NOT NULL DEFAULT 0` columns (n_trials_attempted reserved for P21 FDR denominator but populated from P18 forward — every phase that touches LearnedPattern must record it).
- **D-16:** Every CV used in P18 (λ tuning, Page-Hinkley parameter tuning) uses **Purged K-Fold + Embargo**, never random K-fold, never simple time-split. Purge window = max horizon (90 days). Embargo = max horizon (90 days).
- **D-17:** Every metric introduced in P18 (`effective_sample_size`, `drift_alert` counts, `EXPLORATORY-WATCH` cell counts) gets a documented operational action in CONTEXT.md or in the dashboard plan: "if metric is X, do Y." No vanity metrics.

### Architectural commitments preserved
- **D-18:** `learning.ts` remains pure functions, no DB access. New decay/ESS/Page-Hinkley primitives are added as pure functions (`computeESS`, `decayWeights`, `pageHinkleyStatistic`, `confirmedDrift`) called by the cron route.
- **D-19:** Schema migration is additive only. No column drops, no type changes. Soak via `DEFAULT 0` on the new column, populate via backfill cron, then production reads from the populated column.
- **D-20:** Vercel cron `maxDuration: 300` is sufficient for the per-class CV tuning runs against current N=87. Bump to `800` only if backfill in D-13 exceeds the limit; revisit in P25 anyway.

### Claude's Discretion
- Naming of new pure functions inside `learning.ts` and the migration filename — pick standard repo conventions
- Exact storage shape of per-class λ and Page-Hinkley params (e.g., a new `LearningHyperparameters` table vs a config constant in `learning.ts`) — researcher and planner decide based on the rest of the codebase
- Whether to ship the backfill cron as a separate route vs an inline migration script — implementation detail

### Folded Todos
None — todo match returned 0 relevant entries for Phase 18.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v2.0 milestone artifacts
- `.planning/ROADMAP.md` — Phase 18 line item (CORE-ML-01..05) and v2.0 build order (P18 → P20 → P19 → P25 → P21 → P22 → P23/24/26 → P27)
- `.planning/REQUIREMENTS.md` §"Phase 18 — Time-decayed Bayesian updates + ESS" — CORE-ML-01..05 acceptance criteria
- `.planning/PROJECT.md` §"Group A — Core ML quality" — phase intent
- `.planning/STATE.md` — accumulated context including stack additions (`jstat`, `ml-matrix`) and cross-cutting defensive mandates

### v2.0 research synthesis
- `.planning/research/SUMMARY.md` — phase-ordering rationale; P18 identified as keystone
- `.planning/research/PITFALLS.md` §"Pitfall 3: Time-Decayed Updates Tuned by Eyeball (Half-Life Wrong)" — λ tuning protocol
- `.planning/research/PITFALLS.md` §"Pitfall 13: Concept-Drift False Positives Cause Premature Down-Weighting" — two-of-two rule, min N=30, no auto-demote
- `.planning/research/PITFALLS.md` §"Looks Done But Isn't Checklist" — P18 verification items
- `.planning/research/STACK.md` — `jstat` and `ml-matrix` package decisions
- `.planning/research/ARCHITECTURE.md` — `learning.ts` "pure functions" commitment

### Existing code to extend (not rewrite)
- `src/lib/learning.ts` — Bayesian primitives. New decay/ESS/Page-Hinkley pure functions added here.
- `src/app/api/cron/learn/route.ts` — daily learning cron. Decay applied in the `prisma.$transaction` block; drift detector runs after posterior recompute.
- `prisma/schema.prisma` lines 94–115 (`model LearnedPattern`) — add `effective_sample_size` and `n_trials_attempted` columns; expand status enum (string in current schema) to include `EXPLORATORY-WATCH`.
- `prisma/schema.prisma` lines 117–133 (`model LearningEvent`) — add `drift_alert` event_type usage; no schema change required (event_type is already free-form `String`).
- `src/lib/engine-context.ts` — surfaces ESS and `EXPLORATORY-WATCH` badge state into the Engine Calibration block returned to `gemini-analysis.ts`.
- `src/components/research/EngineCalibrationPanel.tsx` (or current equivalent) — UI surface for D-10/D-11.

### External methodology references (for researcher/planner Context7 queries)
- López de Prado, *Advances in Financial Machine Learning* — Purged K-Fold + Embargo CV (cited in PITFALLS.md Sources)
- Bifet & Gavaldà — Page-Hinkley + ADWIN drift detection
- Kish — effective sample size formula `(Σw_i)² / Σw_i²`
- NannyML / Evidently — two-of-two confirmation rule for drift detection on small samples

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/learning.ts` — `updatePosterior`, `posteriorMean`, `credibleInterval95`, `brierScore`, `driftZ`, `patternStatus`, `adversarialNullBrier`, `buildFeatureVector12`, `updateLogistic`. Decay is added as a pre-processing layer over these primitives — no rewrite needed.
- `src/lib/diffusion-trace.ts` — feature reconstruction for diffusion observations; reused for replay during the backfill in D-13.
- `src/app/api/cron/learn/route.ts` — already uses `prisma.$transaction` for idempotent posterior updates; the decay+drift logic slots into the same transaction block.
- `src/lib/engine-context.ts` — already the single trust boundary for authoritative numerics surfaced to the LLM. ESS surfacing follows the same pattern.

### Established Patterns
- Pure functions in `src/lib/learning.ts`, DB calls in `src/app/api/cron/*` route handlers — preserved.
- Additive Prisma migrations only — no column drops, no type changes.
- Vitest for units (`npm test`), live-DB integration tests (`npm run test:integration`), Playwright for e2e (`npm run test:e2e`) — every P18 deliverable lands with all three.
- Per-cell idempotency via `LearningEvent.outcome_id` dedup — backfill cron must respect this if it replays outcomes.

### Integration Points
- `learn` cron is the only writer to `LearnedPattern` — single point to inject decay + drift logic.
- `EngineCalibrationPanel` already consumes `engine-context.ts` output — UI changes for D-10/D-11 are surface-only once `engine-context.ts` returns ESS and watch flag.
- `LogisticEpoch` table — λ-tuning and Page-Hinkley parameter tuning could persist their per-class winners here as a new epoch type, OR in a new `LearningHyperparameters` table; planner decides.

</code_context>

<specifics>
## Specific Ideas

- User direction on λ tuning was explicit: "most advanced and optimal now, do not put things off for later." This rules out shipping a hand-picked default and re-tuning later — the empirical-grid-search-now path is locked.
- The two-of-two drift confirmation rule (drift_z + Page-Hinkley) is a deliberate borrow from NannyML/Evidently best practice for low-frequency outcome monitoring. Single-detector firing is too noisy for ~30/week observations.
- New `EXPLORATORY-WATCH` status is intentionally a non-silencing state — the cell still feeds into Engine Calibration so the user sees the prior + the watching badge. Hiding the cell during drift would create the "engine has no opinion" UX failure (Pitfall, UX section).
- Backfill design in D-13 mirrors the discipline P25 will need: replay outcomes ordered by `recorded_at`, no future leakage, one transaction. P18 is the warm-up.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
None reviewed.

### Cross-phase items intentionally deferred (mentioned for context, not in scope)
- Auto-demote on persistent drift → revisit only when P21 ships OOS Brier degradation as a co-confirmation signal
- Drift-alert dashboard tile + ESS distribution heatmap → Phase 26
- ESS-weighted information-gain reward function for the bandit → Phase 24
- Class-specific lift thresholds → Phase 21

</deferred>

---

*Phase: 18-time-decayed-bayesian-updates-ess*
*Context gathered: 2026-05-04*
