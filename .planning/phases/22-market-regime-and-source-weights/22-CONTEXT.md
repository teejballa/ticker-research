# Phase 22: Market-Regime Feature + Learned Sentiment-Source Weights — Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Depends on:** Phase 21 (complete, 2026-05-24), Phase 21.1 (complete, 2026-06-08)
**Requirements:** CORE-ML-06..10 (regime dim) + CORE-ML-20..22 (source-weight learning, regime-conditional weights, source-mix UI surface)

<domain>
## Phase Boundary

Two additions to what the engine learns, shipped together because they share the per-cell posterior update path in `/api/cron/learn`:

**(a) Regime dimension** — extends `LearnedPattern` composite key with a 4-bucket regime (bull/bear × low-vol/high-vol). Per-regime Beta posteriors mean the engine learns "this sentiment_type × cap_class × horizon works in bear/high-vol but not bull/low-vol," not just "this works on average."

**(b) Learned sentiment-source weights** — extends `SourceTier` with regime conditioning so the aggregator weighs each sentiment input differently per regime. Reuses `PerSourceIC` infrastructure from P20-C-01; reuses clamped-softmax pattern from P20-B-04; reuses Beta-Binomial empirical-Bayes shrinkage from P19-A-07.

**Out of scope** — explicitly deferred:
- Multi-axis regime decomposition (rate cycle / earnings season / sector rotation as additional axes) — future phase if a 4-bucket cell earns the right to split.
- Schwab brokerage integration, portfolio-level analysis — IS Week-13 open feature decision.
- Per-regime logistic baseline retraining — Wave 3 logistic infrastructure already exists; regime as interaction term is a P22.5 candidate if cell-level lift signals more is needed.

</domain>

<decisions>
## Implementation Decisions

### Carried Forward (locked before this discuss session)
- **D-01:** P22 strict-gates on P21 ship + relearn soak. Both complete 2026-06-08 (P21 cutover 2026-05-24, P21.1 cutover 2026-06-08, ≥2 weeks elapsed). *Source: [[project-phase-22-next]], locked 2026-05-19.*

### Regime Definition (Area 1)
- **D-02:** **4-bucket regime** (bull/bear × low-vol/high-vol). Resolves the REQUIREMENTS.md ↔ ROADMAP.md conflict in favor of REQUIREMENTS (CORE-ML-07 stays 4-bucket; ROADMAP gets updated during planning). Industry-standard 2×2 trend × vol structure per Hamilton 1989 Markov-switching, Ang & Bekaert 2002, AQR / Bridgewater regime literature. "Chop" absorbed into the trend axis as a continuous score that maps to bull/bear via threshold. Sparsity defense: hierarchical shrinkage to parent cells (P19-A-07 pattern) + P21.1's 5-gate continues to enforce no cell promotes without real lift.
- **D-03:** Inputs = VIX level + SPY 50d/200d MA cross. Trend axis = sign(SPY MA50 − MA200); vol axis = VIX vs threshold. Both PIT-correct via snapshot at scan time. Free via yahoo-finance2.
- **D-04:** VIX threshold = rolling 60d percentile, 50th-percentile split. Auto-adapts to regime drift (low-vol-2017 ≠ low-vol-2022); avoids the distribution-naive fixed VIX=20 cutoff.
- **D-05:** Transition-zone exclusion = **sample-relative**. Drop predictions from posterior updates if a regime flip occurs in `(prediction_t, prediction_t + horizon_days]`. Honest — only drops genuinely ambiguous samples. Satisfies CORE-ML-10.

### Source-Weight Wiring (Area 2)
- **D-06:** Extend `SourceTier` with `regime` column. Additive migration: `DEFAULT 'ALL'`, then flip the unique constraint to include `regime` after the soak window (D-13). Same pattern as the LearnedPattern migration. `getWeightForSource` extends to `(source_id, regime, asOf)`.
- **D-07:** Weight computation = **regime-sliced PerSourceIC → empirical-Bayes shrinkage toward unconditional SourceTier IC → clamped softmax** (hybrid A+B). Matches BlackRock SAE / AQR / Two Sigma signal-mixing practice. Adds `shrinkage_strength` column to SourceTier (additive). Sparse regime cells regress to the unconditional weight under low ESS.
- **D-08:** Aggregator reads regime label **from the SentimentSnapshot row being aggregated** (CORE-ML-08 already mandates writing it at scan time). PIT-correct by construction; mixed-regime windows produce per-row weights without distortion.
- **D-09:** Cold-start fallback chain: `(source, regime)` → `(source, 'ALL')` → `1.0`. Smoothest cutover; regime layer activates gradually as each bucket accumulates IC observations. Empirical-Bayes shrinkage in D-07 targets step 2 (unconditional row), not step 3 (cold-start).

### Backfill + Cutover Order (Area 3)
- **D-10:** New `/api/cron/backfill-regime`, one-shot, auto-disables after complete pass. P27-style checkpoint pattern. Isolated failure domain — a regime-backfill bug does NOT poison the relabel cron or learn cron.
- **D-11:** Phased cutover sequence: (1) Prisma migration adds `regime` columns with `DEFAULT 'ALL'`; (2) backfill cron writes historical regime labels (offline-safe — `'ALL'` rows still serve all reads); (3) full relearn rebuilds `LearnedPattern` + `SourceTier` per-regime; (4) unique-constraint flip on both tables; (5) aggregator + learn cron start reading `(source, regime)` weights. **Each step independently reversible until step 4.**
- **D-12:** Historical VIX + SPY data = **yahoo-finance2 primary; Polygon fallback per-row when Yahoo returns null; prior trading day's close for market-holiday gaps** (standard practice). Rows where neither source resolves get logged + skipped (regime label stays NULL, excluded from regime-conditional learning); backfill cron is re-runnable to fill them later.
- **D-13:** Soak = **2 weeks of live `/api/cron/learn` cycles** between relearn and the unique-constraint flip. Matches the P21 → P21.1 soak duration (2026-05-24 → 2026-06-08) that just succeeded. Gives the 5-gate (ESS≥30 + live≥10) a chance to clear in each regime.

### Done-Gate + P21.1 Interaction (Area 4)
- **D-14:** Done-gate = **Brier-lift on regime-flipped cells ≥ 0.005 with BCa 95% CI excluding 0**, vs the `regime='ALL'` baseline aggregated across regimes. Same magnitude as P21.1's `BRIER_LIFT_THRESHOLD` constant — internally consistent. Reuses P21.1's BCa primitive (`src/lib/evaluation/bootstrap.ts`).
- **D-15:** **Hierarchical BY-FDR** — per-regime BY families, then meta-BH across regimes (Benjamini-Bogomolov 2014). Standard for multi-axis testing in genomics multi-tissue eQTL analysis. Preserves per-cell detection power; the 4-bucket regime split does NOT 4× the BY-FDR denominator.
- **D-16:** Keep **ESS≥30 for all cells**, including regime-conditional. "0 ACTIVE cells in a regime is a valid IS-paper finding" — same honest-reporting discipline P21.1 already adopted per [[is-symposium-framing-summer-2026]] depth-over-features framing.
- **D-17:** EngineCalibrationPanel gets an **always-visible "Source mix" row** — top 3 sources by weight + regime label, click-to-expand for full ranking + 30d weight-drift sparkline. Satisfies CORE-ML-22 source-mix UI requirement; matches existing panel density.

### Claude's Discretion
- Concrete column types + indexes for the additive SourceTier / SentimentSnapshot / LearnedPattern migrations (planner picks).
- VIX history fetch cadence inside the backfill cron (planner picks — likely once-per-trading-day batched).
- Exact "Source mix" row visual styling and sparkline implementation in EngineCalibrationPanel (UI-phase researcher picks).
- Vercel cron schedule for `/api/cron/backfill-regime` (planner picks; one-shot semantics make this nearly arbitrary).
- File layout for the regime classifier helper — likely `src/lib/regime/classify.ts` mirroring `src/lib/labels/compute.ts` from P21.1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 22 framing
- `.planning/ROADMAP.md` §"Phase 22" — current scope statement (will need 2-bucket→4-bucket fix during planning per D-02).
- `.planning/REQUIREMENTS.md` CORE-ML-06..10 — regime dimension requirements (these stay at 4-bucket).
- `.planning/REQUIREMENTS.md` CORE-ML-20..22 — source-weight learning + regime-conditional weights + source-mix UI.
- `.planning/PROJECT.md` §"Cells starve under multi-axis regime" — explicit guidance that hierarchical pooling defends sparsity.

### Phase 22 prior-decision sources
- `.planning/phases/21.1-capacity-to-detect-edge/21.1-CONTEXT.md` — P21.1's 5-gate (ESS≥30, live≥10, Brier-lift>0.005, BY-FDR q<0.10, DSR>0); D-14 reuses BRIER_LIFT_THRESHOLD=0.005 for internal consistency.
- `.planning/phases/21.1-capacity-to-detect-edge/21.1-04-SUMMARY.md` — Two-pass BY-FDR architecture details (D-15 extends this to hierarchical).
- `.planning/phases/21-sector-relative-outcome-labels/` — P21's sector-relative labels are the substrate the regime split operates on.

### Statistical methodology (CS229 + ISL grounded — per CLAUDE.md Load-Bearing Rules)
- Hamilton 1989 (Markov-switching regimes) — cited in D-02.
- Ang & Bekaert 2002 (international equity regimes) — cited in D-02.
- Benjamini & Bogomolov 2014 (hierarchical FDR control) — cited in D-15.
- López de Prado 2018 (Advances in Financial ML) §Backtesting/regimes — implicit grounding.
- Efron 1987 (BCa bootstrap) — reused via P21.1's primitive in D-14.

### Existing code to extend (no parallel modules)
- `prisma/schema.prisma:122` — `LearnedPattern` (add `regime` column, flip unique constraint).
- `prisma/schema.prisma:351` — `PerSourceIC` (slice on regime for D-07; may need regime column added if backfill demands it).
- `prisma/schema.prisma:582` — `SourceTier` (add `regime` + `shrinkage_strength` columns).
- `src/lib/sentiment/source-tier.ts` — `getWeightForSource` extends to take regime arg per D-08.
- `src/lib/sentiment/aggregator.ts:405` — per-row regime read at aggregation time per D-08.
- `src/lib/labels/compute.ts` (P21.1 Wave 2) — pattern for the new `src/lib/regime/classify.ts` helper.
- `src/lib/evaluation/bootstrap.ts` (P21.1 Wave 1) — BCa primitive for D-14 done-gate.
- `src/lib/evaluation/fdr.ts` (P21.1 Wave 1) — BY-FDR primitive that D-15 extends hierarchically.
- `src/app/api/cron/learn/route.ts` (P21.1 Wave 4 two-pass architecture) — extend the evaluation pass to honor hierarchical FDR families.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`PerSourceIC` model + cron** (P20-C-01): per-source rolling Spearman IC with Newey-West HAC SE + BH-FDR p-values already computed. P22 D-07 slices this panel by regime; no new IC infrastructure needed.
- **`SourceTier` model + `getWeightForSource`** (P20-B-04): clamped-softmax weights from IC. P22 D-06 extends additively with a regime column; D-08 extends the lookup signature.
- **Beta-Binomial empirical-Bayes shrinkage** (P19-A-07): the established sparse-cell defense. P22 D-07 reuses for `(source × regime)` weight shrinkage toward unconditional.
- **BCa bootstrap primitive** (P21.1 Wave 1): `src/lib/evaluation/bootstrap.ts`. P22 D-14 calls it for the done-gate CI.
- **BY-FDR primitive** (P21.1 Wave 1): `src/lib/evaluation/fdr.ts`. P22 D-15 extends to hierarchical Benjamini-Bogomolov.
- **5-gate patternStatus + LearningEventType** (P21.1 Wave 4): `src/lib/learning.ts`. P22 honors the existing gate; doesn't extend it.
- **Two-pass evaluation in `/api/cron/learn`** (P21.1 Wave 4): the architecture pattern for FDR-denominator-correct learning. P22 extends pass 1 to evaluate per-regime, pass 2 to apply hierarchical FDR.
- **P27-style checkpoint pattern** (P27 backfill): `/api/cron/backfill-regime` follows this. Exponential-backoff + in-run cooldown + per-ticker progress.
- **yahoo-finance2 historical + Polygon fallback** (P10 merge layer): the field-level merge pattern. D-12 mirrors this for VIX + SPY history.

### Established Patterns
- **Additive Prisma migrations only.** No drops, no type changes. D-06 follows this; D-11 sequences the unique-constraint flip after soak.
- **`learning.ts` is pure functions, no DB.** Any new helper (regime classifier, hierarchical FDR) lives in pure modules; DB access stays in cron routes.
- **Authoritative numerics from `engine-context.ts`.** The aggregated `(source × regime)` weights surface there for the EngineCalibrationPanel (D-17), not from the LLM.
- **PIT discipline everywhere.** D-08 reads regime from the snapshot row; D-12 fetches PIT-correct VIX + SPY history; D-05 transition exclusion preserves PIT at the boundary.
- **CI guard `no-hand-curated-tier-weights`** (P20-B-04). D-07 weights come from DB rows only — Vault for IS-paper defense.
- **Phase-status composite gate** (`npm run phase-21.1-status` precedent). P22 will get `npm run phase-22-status` with D-14 as the headline gate.

### Integration Points
- **`/api/cron/learn` two-pass architecture** (P21.1 Wave 4) is the load-bearing extension point. P22 modifies pass 1 to emit `(cell × regime)` evaluations and pass 2 to apply hierarchical BY-FDR (D-15).
- **`EngineCalibrationPanel`** (post-P21.1) gets the new "Source mix" row (D-17). The panel's existing density + interaction pattern is the target.
- **`/insights/baselines`** (P21.1 Wave 5) is adjacent but separate — P22 does NOT add a regime tab there; the new surface is the source-mix row in the calibration panel.
- **`SentimentSnapshot` writer** (sentiment-scan cron): new `regime` column written at scan time per CORE-ML-08.
- **Vercel cron registry** (`vercel.json`): one new entry for `/api/cron/backfill-regime` (one-shot, can be removed after auto-disable).

</code_context>

<specifics>
## Specific Ideas

- **User's meta-preference** (applied throughout this discussion, captured in [[feedback-override-claudemd-for-progress]]): pick the most ambitious technically-defensible option. Applied to D-02 (4-bucket over 2-bucket), D-07 (hybrid EB+softmax over plain softmax), D-12 (Yahoo + Polygon fallback over Yahoo-only), D-15 (hierarchical FDR over single-pass).
- **IS-paper framing carried forward** [[is-symposium-framing-summer-2026]]: the done-gate (D-14) and ESS floor (D-16) are calibrated so the result is publishable whether regime conditioning wins or doesn't. "We tested 4 buckets; N cells cleared the 5-gate; M produced statistically significant Brier-lift over unconditional baseline" is a valid IS-paper finding regardless of the values of N and M.
- **Internal consistency** with P21.1: BRIER_LIFT_THRESHOLD reused as the D-14 magnitude; BCa + BY-FDR primitives reused; 5-gate preserved; soak duration matches P21→P21.1 precedent.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-axis regime decomposition** (rate cycle / earnings season / sector rotation × VIX/SPY) — explicit non-goal in PROJECT.md "We DO NOT need" section. If a cell earns the right to split via D-14 done-gate lift, future phase candidate.
- **Per-regime logistic baseline retraining** — Wave 3 logistic infrastructure already exists; regime as an interaction term would be P22.5 if cell-level lift signals more is needed.
- **HMM-based regime classifier** — D-03 picked the rule-based VIX + MA cross over the Hamilton HMM. HMM remains a future upgrade candidate if rule-based regime labels show classification noise.
- **Schwab brokerage integration / portfolio-level analysis** — IS Week-13 open feature decision (deferred per IS syllabus).
- **`(source × regime × cap_class)` weights** — three-way conditioning. Out of P22 scope; reconsider if D-14 done-gate passes and cell-level evidence grows.
- **Bull/bear/chop 3-state trend axis** (vs current bull/bear 2-state in D-02) — defer until trend-axis classification accuracy is empirically measured.

</deferred>

---

*Phase: 22-market-regime-and-source-weights*
*Context gathered: 2026-06-08*
