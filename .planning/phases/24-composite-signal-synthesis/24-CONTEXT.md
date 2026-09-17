# Phase 24: Composite Signal Synthesis - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a single calibrated **headline probability + credible interval** for every ticker, synthesized from the 4 existing per-class posteriors (diffusion / technical / institutional / insider) already computed in `engine-context.ts`. Surface it as the report's headline calibration number and publish its reliability diagram in `/insights`. Numerics come from `engine-context.ts` — never from the LLM (REASON-05 trust-boundary).

**In scope (REASON-01..05):**
- Per-class isotonic calibration of raw posteriors
- ESS-weighted combination into composite probability
- Bootstrap-based CI on composite accounting for cross-class correlation
- Composite becomes headline in `EngineCalibrationPanel`; per-class breakdown moves beneath
- Reliability diagram for composite published in `/insights`
- Trust boundary: post-process overwrite in `runGeminiAnalysis`

**Out of scope (deferred):**
- Learned per-regime composite weights (Phase 22 source-mix pattern) — kept as v2 upgrade path
- Counterfactual "if class X removed, prior shifts A%→B%" (that's Phase 25)
- Composite over 8 sources (P22 source-mix axis) vs 4 classes — starts with 4 classes; source-mix is a separate row

</domain>

<decisions>
## Implementation Decisions

### Weighting Scheme (D-01)
- **D-01:** Composite is an ESS-weighted mean of per-class isotonic-calibrated posteriors. Each class's raw posterior_mean is transformed by a per-class PAV isotonic curve fit on historical outcomes; then combined via `Σ w_k · p_k^cal` where `w_k = ESS_k / Σ ESS_j` over available (ACTIVE-status) classes. Meets REASON-01 literally ("per-class isotonic-calibrated weighted combination"). Simpler than learned per-regime weights (P22 pattern); more accurate than fixed-equal because ESS respects sample-size trust. Latency: zero at report time — isotonic curves are pre-fit in cron and cached; composite arithmetic is O(K).

### Correlation-Aware CI (D-02)
- **D-02:** CI computed via BCa bootstrap on the composite scores against historical (ticker × as-of) outcomes, using existing `src/lib/evaluation/bootstrap.ts`. Bootstrap resamples full rows so per-class correlation is preserved automatically — no separate correlation matrix required. Runs in a nightly cron (`/api/cron/composite-ci`, hourly or daily TBD by planner) writing latest CI band per (regime × cap_class) cell. Report-time reads the cached band. Zero latency impact on report generation.

### Insufficient-Data Fallback (D-03)
- **D-03:** `MIN_CLASSES_ACTIVE = 2` gate. If ≥2 signal classes have ACTIVE `patternStatus`, renormalize weights over available classes and widen CI by √(4/K) to reflect fewer independent classes. If <2 → composite is suppressed (`composite_gate_status = 'insufficient_coverage'`); UI shows "insufficient signal coverage" in the headline slot instead of a probability. Simpler than any partial-badge scheme; honest about what we can and can't say.

### Display + Phase 22 Interaction (D-04)
- **D-04:** Composite becomes the headline at the top of `EngineCalibrationPanel` — replacing the current diffusion-only posterior box as the visual anchor. The existing diffusion box moves to a "Per-Class Breakdown" section beneath, alongside technical/institutional/insider posterior tiles. Phase 22's `SourceMixRow` **stays** — it represents a different concept (which input sources drive the prior) versus the composite (calibrated headline). Both coexist. Report copy: `"Cipher Composite Signal: X% [Y%, Z%]"` with the per-class breakdown collapsible.

### Trust Boundary (D-05, REASON-05)
- **D-05:** All composite fields are authored by `engine-context.ts`, never by the LLM. New fields on `EngineContext`:
  - `composite_prob: number | null`
  - `composite_ci_low: number | null`
  - `composite_ci_high: number | null`
  - `composite_class_count: number` (K, the number of ACTIVE classes contributing)
  - `composite_gate_status: 'active' | 'insufficient_coverage' | 'insufficient_history'`
  - `composite_class_weights: Record<'diffusion'|'technical'|'institutional'|'insider', number>`
  - `composite_per_class_calibrated: Record<'diffusion'|'technical'|'institutional'|'insider', number | null>`

  Post-process overwrite in `runGeminiAnalysis` mirrors the existing engine-calibration numeric-overwrite pattern (see `gemini-analysis.ts:1160-1243`) — the LLM never sees these fields.

### Reliability Diagram (REASON-04)
- **D-06:** Composite reliability diagram published at `/insights/calibration` alongside existing per-classifier diagrams. Uses existing `CorpReliabilityDiagram` (or `ReliabilityDiagram`) component from `src/app/insights/calibration/`. Data source: same nightly cron that computes CI writes reliability-bin buckets (CORP method). Minimum n=100 predictions for stable curve — otherwise show "insufficient history."

### Ship Gate
- **D-07:** Composite Brier ≤ 0.24 on backfill AND composite calibration-ECE ≤ 0.05 AND ≥50% of tickers scored (i.e., ≥2 classes ACTIVE for majority of universe). Gate enforced by a new `check-composite-ship-gate.ts` or extension of existing `phase-N-status` composite gate scripts.

### Claude's Discretion
- Exact hyperparameter names + default values for `MIN_CLASSES_ACTIVE`, minimum-n-for-isotonic-fit, CI cron frequency — planner chooses defaults documented in `HYPERPARAMETERS.md`.
- Whether composite CI cron is hourly vs daily — planner picks based on backfill row volume.
- UI copy tone ("Cipher Composite Signal" vs "Calibrated Probability" vs other) — Claude picks after reviewing existing panel copy for consistency.
- Which existing reliability-diagram component to reuse vs slight variant — planner picks based on component-shape audit.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + Roadmap
- `.planning/REQUIREMENTS.md` — REASON-01 through REASON-05 (Phase 24 requirements block)
- `.planning/ROADMAP.md` — Phase 24 entry + parallelization note (P25/P26/P28 can plan in parallel after P24 ships)
- `CLAUDE.md` — "Load-bearing rules" section (esp. #3 confidence intervals mandatory; #7 proper scoring rules for probabilistic decisions; #8 non-LLM baseline required — composite must be benchmarked against per-class-averaged baseline)

### Statistical Methodology
- `docs/paper/methodology.md` — cite Phase 24 additions here (Brier decomposition for composite, CORP reliability, BCa bootstrap for composite CI)
- CS229 "Evaluation Metrics" — reliability diagrams, ECE
- ISL Ch. 4 — probability calibration; Ch. 5 — bootstrap methodology
- Bröcker & Smith (2007) — reliability diagram sampling variance
- Dimitriadis-Gneiting-Jordan (2021) — CORP reliability method (already cited by Phase 20-C-02)

### Existing Code (integration surfaces)
- `src/lib/engine-context.ts` — where composite is computed (lines 828-1153 show existing per-class posterior computation pattern)
- `src/lib/gemini-analysis.ts:1160-1243` — post-process numeric-overwrite pattern to mirror
- `src/lib/stats/isotonic.ts` — PAV isotonic regression primitive (reuse for per-class calibration curves)
- `src/lib/evaluation/bootstrap.ts` — BCa bootstrap primitive (reuse for composite CI)
- `src/lib/evaluation/index.ts` — barrel of evaluation primitives
- `src/components/EngineCalibrationPanel.tsx` — panel where composite becomes headline
- `src/app/insights/calibration/` — where reliability diagram publishes
- `src/app/insights/calibration/components/ReliabilityDiagram.tsx` — component to reuse for composite curve
- `src/components/MagnitudeCalibrationTile.tsx` — client-island pattern for reliability tiles (reuse structure)

### Prior Phase Context (for consistency)
- `.planning/phases/21.1-capacity-to-detect-edge/21.1-CONTEXT.md` — 5-gate `patternStatus` (ESS≥30, live≥10, Brier-lift, BY-FDR, DSR) — composite fallback D-03 uses ACTIVE status defined here
- `.planning/phases/22-market-regime-and-source-weights/22-CONTEXT.md` — source-mix pattern + regime axis (composite coexists with source-mix per D-04)
- `.planning/phases/20-real-sentiment-analysis/` Plan 20-C-02 — isotonic calibration + CORP reliability diagram precedent (composite uses same primitives)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/lib/stats/isotonic.ts`** — `isotonicRegression()` PAV primitive and `IsotonicPredictor` type. Use directly to fit per-class calibration curves.
- **`src/lib/evaluation/bootstrap.ts`** — BCa bootstrap already used in P21.1. Composite CI reuses this on `(ticker × as-of, composite_score, outcome)` triples.
- **`src/app/insights/calibration/components/ReliabilityDiagram.tsx`** — CORP reliability diagram already renders per-classifier. Add composite as another classifier_version = `'cipher-composite-v1'`.
- **`src/components/EngineCalibrationPanel.tsx`** — headline location. Restructure top section to lead with composite, existing diffusion tile becomes one of 4 in per-class breakdown.
- **`src/components/MagnitudeCalibrationTile.tsx`** — client-island tile pattern (fetches from `/api/insights/*`, renders pure-SVG chart) — mirror for `CompositeCalibrationTile`.

### Established Patterns
- **Engine-context numeric-overwrite trust boundary** — `runGeminiAnalysis` explicitly overwrites LLM numerics with `engineCtx` values (see `gemini-analysis.ts:1160-1243`). Composite fields follow identical pattern; LLM never sees composite fields on the schema at all.
- **PatternStatus 5-gate** (P21.1) — ACTIVE / EXPLORATORY / RETIRED. Composite fallback D-03 keys off ACTIVE only; EXPLORATORY classes are excluded from the weighted sum.
- **Cron-computes / report-reads split** — expensive computation (isotonic fit, bootstrap CI, reliability bins) happens in a nightly cron writing to Neon; reports do simple lookups. Zero LLM-latency impact.
- **`classifier_version` field on calibration tables** — existing pattern for versioning ("gemini-per-doc-v1"). New composite gets `classifier_version = 'cipher-composite-v1'`.
- **Prisma additive-only migrations** — new columns on existing tables or new tables; no drops.

### Integration Points
- `getEngineContextForTicker(ticker)` returns `EngineContext` — extend with 7 new composite fields (D-05)
- `runGeminiAnalysis` post-process block copies engineCtx values into result — extend to copy composite fields
- `EngineCalibrationPanel` restructures: composite headline on top, existing diffusion/technical/institutional/insider tiles regroup as "Per-Class Breakdown"
- New cron `/api/cron/composite-calibration` (frequency TBD by planner): fits isotonic curves + computes CI + writes reliability bins
- New Prisma model `CompositeCalibrationSnapshot` (or reuse existing calibration table with new `classifier_version`)
- New endpoint `/api/insights/composite-calibration` — read latest snapshot for the diagram

</code_context>

<specifics>
## Specific Ideas

- User directive on decision-making style: "make all decisions smartly, prioritizing simplicity and accuracy without sacrificing latency" (2026-09-16 discuss-phase session). Recorded here so downstream agents know the north-star tradeoff.
- Ship gate must be measurable — D-07 defines Brier + ECE + coverage thresholds.
- Composite is meant to be the **first user-visible v2.0 win** per ROADMAP.md — visual placement in the panel must reflect that (headline slot, not sidebar).

</specifics>

<deferred>
## Deferred Ideas

- **Learned per-regime composite weights** — the P22 source-mix pattern applied to composite class weights. Deferred to a follow-up phase once composite has ≥6mo of live data to fit weight-learning against. For now weights = ESS-proportional.
- **Counterfactual "leave-one-out" deltas** — belongs in Phase 25. Composite provides the mathematical substrate; Phase 25 exposes deltas in the prompt.
- **Composite over 8 sources (source × regime axis, P22 axis)** vs 4 classes — starts with 4 classes because that matches existing posterior computation. Adding source-axis composite is a P25+ consideration.
- **Learned isotonic curve refresh cadence** — start with weekly refit; can move to daily if drift becomes an issue.
- **Cross-signal contradiction detector on composite** — surface when classes disagree strongly (e.g., diffusion bull, technical bear) as its own report insight. Belongs in later phase.

### Reviewed Todos (not folded)
None — no todos surfaced from `todo match-phase` for Phase 24.

</deferred>

---

*Phase: 24-composite-signal-synthesis*
*Context gathered: 2026-09-16*
