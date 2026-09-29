---
phase: 24-composite-signal-synthesis
verified: 2026-09-29T21:22:00Z
status: human_needed
score: 43/43 automated must-haves verified structurally; 4 items gated on organic Neon data require human verification post-deploy
overrides_applied: 0
human_verification:
  - test: "First cron run seeds real CompositeCalibrationSnapshot rows on production Neon"
    expected: "After deploy + first 03:00 UTC cron run, `SELECT count(*) FROM composite_calibration_snapshots WHERE status != 'insufficient_data'` returns ≥1"
    why_human: "Cannot verify programmatically in this session — cron fires on Vercel schedule against production Neon; verification requires post-deploy checkpoint after 03:00 UTC or an operator-triggered GET /api/cron/composite-calibration (Bearer-auth)"
  - test: "Composite reliability card renders on /insights/calibration with real Brier"
    expected: "Once first cron run writes a ship-eligible or shadow snapshot for ALL × large_cap, ReliabilityDiagram card labelled 'cipher-composite-v1' appears alongside SentimentObservation classifiers; composite_brier + reliability_bins render numerically (not 'No Brier evaluation written yet')"
    why_human: "Requires deployed app + populated snapshot table; visual verification of card presence + histogram rendering + numeric values"
  - test: "CompositeHeadline renders on /research/[ticker] with active composite (post-deploy, post-cron)"
    expected: "For any ticker whose (regime × cap_class) cell has a ship-eligible snapshot with K ≥ 2 ACTIVE classes, the EngineCalibrationPanel top slot shows the composite probability + BCa CI + K-of-4 subline (not 'insufficient signal coverage — fewer than 2 signal classes are TRUSTED yet' or 'insufficient history — composite calibration is still warming up')"
    why_human: "REASON-03 visual anchor — full user-facing headline behavior requires organic P21.1 promotions to lift ≥2 cap_class cells' coverage above 0.50 threshold, then a cron refit to persist calibrated curves"
  - test: "check-composite-ship-gate exits 0 on organic data (post-launch watchdog)"
    expected: "Once (a) coverage ≥ 0.50 AND (b) baseline_brier_logistic_36 is populated as real numbers on ship-eligible cells (requires Wave 3 follow-up: extend loadHoldoutDataset with 36-feature projection), `npm run check-composite-ship-gate` exits 0 with all 5 gates PASS"
    why_human: "Blocker #2 follow-up: CompositeRow does not yet carry 36-feature vector; ship-gate correctly refuses promotion until follow-up lands. Verification requires (1) follow-up implementation, (2) cron re-run, (3) manual gate check"
---

# Phase 24: Composite Signal Synthesis — Verification Report

**Phase Goal:** Ship a per-class isotonic-calibrated ESS-weighted composite signal with BCa CI, daily-refit cron, non-LLM logistic-36 baseline (REASON-10 / CLAUDE.md §8), ship-gate enforcement, and dedicated UI headline.

**Verified:** 2026-09-29T21:22:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Composite arithmetic core is implemented (composeSignal ESS-weighted mean over ACTIVE calibrated classes with K∈{4,3,2,1,0} branches) | VERIFIED | `src/lib/composite/compose.ts` (68 LOC); `tests/composite/ess-weighted-mean.unit.test.ts` 3/3 GREEN; `tests/composite/fallback-gate.unit.test.ts` 5/5 GREEN |
| 2 | Per-class isotonic calibration + serde round-trips through IsotonicCurveJSON | VERIFIED | `src/lib/composite/isotonic-serde.ts` (35 LOC); `tests/composite/isotonic-fit.unit.test.ts` monotonicity + round-trip GREEN |
| 3 | BCa CI over row-resampled composite scores (preserves cross-class correlation per D-02, reproducible seed=42) | VERIFIED | `src/lib/composite/isotonic-fit.ts` computeCompositeCi (wraps @/lib/evaluation bootstrapBCa); `tests/composite/bootstrap-ci.unit.test.ts` 1/1 GREEN |
| 4 | √(4/K) CI widening + K<2 suppression fallback gate | VERIFIED | `src/lib/composite/weights.ts` widenCi; 5/5 fallback-gate tests GREEN |
| 5 | Look-ahead defense (CLAUDE.md #6) at two layers — loadFitDataset filter + fitPerClassCurves assertion | VERIFIED | `src/lib/composite/isotonic-fit.ts` (211 LOC); look-ahead defense test in isotonic-fit.unit.test.ts GREEN |
| 6 | Non-LLM logistic-36 baseline (REASON-10 / CLAUDE.md §8) via IRLS with forward-chaining CV enforcement | VERIFIED | `src/lib/composite/logistic-baseline.ts` (199 LOC); ml-matrix ^6.15.0 dep in package.json; `tests/composite/logistic-baseline.unit.test.ts` 3/3 GREEN (deterministic 37-coefficient IRLS + forward-chaining Brier + rejection guard) |
| 7 | Daily cron writes CompositeCalibrationSnapshot per (regime × cap_class) cell with fit + CI + reliability + baselines | VERIFIED | `src/app/api/cron/composite-calibration/route.ts` (314 LOC); Bearer-token auth; iterates 5 regimes × 3 cap_classes = 15 cells; vercel.json cron entry at schedule '0 3 * * *' |
| 8 | Read-latest endpoint exposes composite reliability data with Zod-validated query params | VERIFIED | `src/app/api/insights/composite-calibration/route.ts` (63 LOC); Zod enum validation; 400 on invalid, 404 on no snapshot, 200 with reliability_bins |
| 9 | EngineContext + EngineCalibration types extended with 7 composite_* fields (D-05) | VERIFIED | grep composite_* in `src/lib/engine-context.ts` = 30 refs (interface + Section 14 + return literal); `src/lib/types.ts` = 7 refs |
| 10 | Section 14 snapshot-driven composite compute at report time with ALL-regime cold-start fallback + Warning #3 defense | VERIFIED | `src/lib/engine-context.ts` lines 1132, 1141 both include `status: { not: 'insufficient_data' }` on findFirst queries |
| 11 | Trust boundary preserved (REASON-05) — 7 composite_* fields authored by engine-context, post-process overwritten in gemini-analysis.ts, never in Zod AnalysisResultSchema | VERIFIED | `src/lib/gemini-analysis.ts` lines 1252-1258 (7 field copies); `grep composite_prob` outside post-process = 0; `tests/composite/schema-negative-shape.unit.test.ts` GREEN; `tests/composite/gemini-analysis-composite-overwrite.int.test.ts` 2/2 GREEN |
| 12 | Blocker #1 closed — gemini-analysis.ts post-process copies 7 composite fields from engineCtx into analysis.engine_calibration | VERIFIED | 7 explicit copy lines at src/lib/gemini-analysis.ts:1252-1258; gemini-analysis-composite-overwrite.int.test.ts GREEN |
| 13 | CompositeHeadline component with 3 gate branches (active / insufficient_coverage / insufficient_history) | VERIFIED | `src/components/CompositeHeadline.tsx` (105 LOC); `tests/composite/panel-headline.unit.test.tsx` 8/8 GREEN |
| 14 | EngineCalibrationPanel restructured — CompositeHeadline atop + PER-CLASS BREAKDOWN eyebrow above QuadClassPanel; SourceMixRow unchanged (D-04 coexistence) | VERIFIED | src/components/EngineCalibrationPanel.tsx line 1322 <CompositeHeadline …>; line 1333 data-testid="per-class-breakdown-eyebrow"; panel-headline tests assert D-04 layout including SourceMixRow preservation |
| 15 | /insights/calibration renders composite reliability card via data-driven per-classifier loop (REASON-04) | VERIFIED (structural) | `scripts/eval-brier.ts` includes 'cipher-composite-v1' (grep count = 2); page.tsx unchanged (data-driven from Wave 3); `tests/composite/insights-render.int.test.tsx` 4/4 GREEN |
| 16 | Ship-gate enforces D-07 + CLAUDE.md §8 with 5 gates (Brier ≤ 0.24, ECE ≤ 0.05, coverage ≥ 0.50, naive-mean lift ≥ 0.005, logistic-36 lift ≥ 0.005) | VERIFIED | `scripts/check-composite-ship-gate.ts` (273 LOC) — all 5 gates present at lines 109-129; package.json script entry `check-composite-ship-gate`; exit codes 0/1/2 |
| 17 | Blocker #2 closed — Gate 5 (logistic-36 lift) MANDATORY, null baseline_brier_logistic_36 = HARD FAIL on ship-eligible/shadow cells | VERIFIED | check-composite-ship-gate.ts:127-129 (`snap.baseline_brier_logistic_36 == null ... snap.composite_brier < snap.baseline_brier_logistic_36 - SHIP_GATE_BASELINE_LIFT_MIN`); ship-eligible snapshots with null logistic-36 return 'fail'; `tests/composite/baseline-benchmark.int.test.ts` 2/2 GREEN (Gate 4 + Gate 5 pre-launch no-op-pass + assertions activate on real data) |
| 18 | HYPERPARAMETERS.md §Phase 24 pins 11 hyperparameters (D-01..D-07 + CLAUDE.md §8) with Wave 0 as sole author (Warning #4) | VERIFIED | `grep -c '## Phase 24 — Composite Signal Synthesis' HYPERPARAMETERS.md` = 1; all 11 values (MIN_CLASSES_ACTIVE, CI_WIDEN_FACTOR, MIN_N_FIT_PER_CLASS, MIN_N_HOLDOUT, BOOTSTRAP_N_RESAMPLES, CI_CRON_SCHEDULE, CIPHER_COMPOSITE_CLASSIFIER_VERSION, SHIP_GATE_BRIER_MAX, SHIP_GATE_ECE_MAX, SHIP_GATE_COVERAGE_MIN, SHIP_GATE_BASELINE_LIFT_MIN) present |
| 19 | docs/paper/methodology.md §Composite Signal Synthesis (Phase 24) records methodology with primary-source citations | VERIFIED | `docs/paper/methodology.md:514` heading present; CS229 Evaluation Metrics + ISL Ch. 4/5 + Bröcker-Smith 2007 + Dimitriadis-Gneiting-Jordan 2021 + Efron 1987 citations landed |
| 20 | Playwright end-to-end verification passed at pre-launch state (Task 4 human-verify checkpoint, orchestrator-approved 2026-09-29) | VERIFIED | 24-04-SUMMARY.md § Runtime verification: `/insights/calibration` renders pre-launch copy; GET cron returns `{ok: true, snapshots_written: 0, snapshots_insufficient_data: 15, refit_mode: 'reuse'}`; `npm run check-composite-ship-gate` exits 0 informationally; no visual regression on /research/AAPL |

**Score:** 20/20 truths verified structurally.

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases or by natural coverage growth:

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Coverage-probe on live Neon = 0.333 < 0.50 threshold | Natural growth (P21.1 organic promotions) | 24-DISCUSSION-LOG.md Wave 0 coverage probe: "Option (b) — defer ship gate enforcement, keep methodology intact"; check-composite-ship-gate.ts correctly refuses promotion until coverage ≥ 0.50 |
| 2 | `baseline_brier_logistic_36` returns null in Wave 3 cron happy path (CompositeRow lacks 36-feature vector) | Wave 3 follow-up: extend `loadHoldoutDataset` to project 12+24 P21.1 CORE-ML-23 features | 24-03-SUMMARY.md § Known Stubs / Follow-Ups item 1; 24-04-SUMMARY.md § Known Stubs / Follow-Ups item 1; Ship-gate Gate 5 remains MANDATORY (HARD FAIL, not null-skip) — cannot be forgotten |
| 3 | Composite reliability card + composite headline require first cron snapshot on production Neon | Automatic on next production deploy + first 03:00 UTC cron run | 24-03-SUMMARY.md item 2; 24-04-SUMMARY.md item 2 |
| 4 | REASON-06..09 (counterfactual reasoning) | Phase 25 (per REQUIREMENTS.md line 74-77) | Explicitly out of scope for Phase 24 per ROADMAP + REQUIREMENTS.md |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | CompositeCalibrationSnapshot model (15 fields + 2 indexes) | VERIFIED | grep count = 1 model reference; operator confirmed `prisma db push --accept-data-loss` → in sync (24-00 SUMMARY) |
| `HYPERPARAMETERS.md` | §Phase 24 with 11 pinned hyperparameters | VERIFIED | grep -c heading = 1; all 11 blocks present |
| `src/lib/composite/compose.ts` | composeSignal + SignalClass + ClassInput + ComposeResult exports | VERIFIED | 68 LOC (≥ min_lines=60) |
| `src/lib/composite/weights.ts` | widenCi + renormalize | VERIFIED | 45 LOC (≥ min_lines=25) |
| `src/lib/composite/isotonic-serde.ts` | fitAndSerialize + deserialize + IsotonicCurveJSON | VERIFIED | 35 LOC (≥ min_lines=30) |
| `src/lib/composite/index.ts` | Barrel export | VERIFIED | 15 LOC (≥ min_lines=5) |
| `src/lib/composite/types.ts` | CorpReliabilityResult re-export | VERIFIED | pins type boundary (Warning #6 defense) |
| `src/lib/composite/isotonic-fit.ts` | fitPerClassCurves + loadFitDataset + loadHoldoutDataset + computeCompositeCi + brier + CompositeRow | VERIFIED | 211 LOC (≥ min_lines=120) |
| `src/lib/composite/logistic-baseline.ts` | fitLogisticBaseline + predictLogisticBaseline + logistic36Brier + LogisticBaselineModel | VERIFIED | 199 LOC (≥ min_lines=100); ml-matrix ^6.15.0 in package.json |
| `scripts/fit-composite-isotonic.ts` | CLI: --regime, --cap, --horizon, --as-of, --dry-run | VERIFIED | 113 LOC (≥ min_lines=40); npm run fit:composite-isotonic wired |
| `src/lib/engine-context.ts` | 7 EngineContext fields + Section 14 compute block | VERIFIED | 30 composite_* refs; Warning #3 defense at 1132, 1141 |
| `src/lib/types.ts` | EngineCalibration interface + 7 composite_* fields | VERIFIED | 7 refs present |
| `src/app/api/cron/composite-calibration/route.ts` | Daily cron: fit + CI + reliability + baselines + INSERT | VERIFIED | 314 LOC (≥ min_lines=120); Bearer-auth; iterates 15 cells |
| `src/app/api/insights/composite-calibration/route.ts` | Read-latest snapshot endpoint with Zod validation | VERIFIED | 63 LOC (≥ min_lines=40) |
| `scripts/eval-brier.ts` | Includes 'cipher-composite-v1' classifier | VERIFIED | grep count = 2 |
| `vercel.json` | Cron entry '/api/cron/composite-calibration' at '0 3 * * *' | VERIFIED | line 46 |
| `src/lib/gemini-analysis.ts` | Post-process overwrite of 7 composite_* fields (Blocker #1) | VERIFIED | 7 explicit copy lines at 1252-1258; AnalysisResultSchema NEVER expanded |
| `src/components/CompositeHeadline.tsx` | Pure component with 3 gate branches | VERIFIED | 105 LOC (≥ min_lines=40) |
| `src/components/EngineCalibrationPanel.tsx` | CompositeHeadline atop + PER-CLASS BREAKDOWN eyebrow | VERIFIED | line 1322 render; line 1333 eyebrow with data-testid |
| `scripts/check-composite-ship-gate.ts` | 5-gate enforcer with logistic-36 MANDATORY (Blocker #2) | VERIFIED | 273 LOC (≥ min_lines=120); all 5 gates at 109-199; npm run check-composite-ship-gate wired |
| `docs/paper/methodology.md` | §Composite Signal Synthesis (Phase 24) with citations | VERIFIED | heading at line 514; 5 primary-source citations |
| `package.json` | ml-matrix + fit:composite-isotonic + check-composite-ship-gate | VERIFIED | all three present |
| `tests/composite/` — 12 test files | 43 tests GREEN | VERIFIED | vitest run tests/composite/ → 12/12 files, 43/43 tests pass in 1.75s |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/lib/engine-context.ts` Section 14 | `prisma.compositeCalibrationSnapshot` + `@/lib/composite` (composeSignal, widenCi, deserialize) | findFirst + deserialize + composeSignal | WIRED | Section 14 block queries snapshot with regime + ALL-regime fallback; both queries carry `status: { not: 'insufficient_data' }` (Warning #3) |
| `/api/cron/composite-calibration` | `@/lib/composite/isotonic-fit` (loadFitDataset, fitPerClassCurves, loadHoldoutDataset, computeCompositeCi, brier) + `@/lib/composite/logistic-baseline` (logistic36Brier) + `@/lib/stats/isotonic` (corpReliabilityDiagram) | named imports; cell loop → fit → CI → reliability → baselines → INSERT | WIRED | Cron iterates 15 cells, applies weekly refit gate, throws on malformed CorpReliabilityResult (Warning #6), missing curve → NO_DATA status flip (Warning #5) |
| `src/lib/gemini-analysis.ts` post-process | `EngineContext` composite_* fields → `analysis.engine_calibration` | 7 explicit copy lines at 1252-1258 | WIRED | Trust boundary preserved: Zod schema NEVER expanded; schema-negative-shape test GREEN; overwrite test GREEN |
| `src/components/EngineCalibrationPanel.tsx` | `src/components/CompositeHeadline.tsx` | JSX render before showQuadClass branch | WIRED | line 1322 <CompositeHeadline …>; line 1333 PER-CLASS BREAKDOWN eyebrow; SourceMixRow preserved (D-04) |
| `/insights/calibration` page | `scripts/eval-brier.ts` cipher-composite-v1 payload | data-driven per-classifier_version render loop (Wave 3) | WIRED | eval-brier includes 'cipher-composite-v1' (grep count = 2); page.tsx unchanged; insights-render tests GREEN |
| `scripts/check-composite-ship-gate.ts` | `prisma.compositeCalibrationSnapshot.findFirst` per (regime × cap_class) cell | reads latest per-cell snapshot; evaluates 5 gates | WIRED | 273 LOC; SHIP_GATE_BRIER_MAX=0.24, SHIP_GATE_ECE_MAX=0.05, SHIP_GATE_COVERAGE_MIN=0.50, SHIP_GATE_BASELINE_LIFT_MIN=0.005; Gate 5 MANDATORY |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| CompositeHeadline | prob, ciLow, ciHigh, classCount, gateStatus (props) | EngineCalibrationPanel → calibration.composite_* fields | Yes (populated by engine-context post-process copy from CompositeCalibrationSnapshot) | FLOWING (structurally); HOLLOW (pre-launch — snapshot table has 15 rows all status='insufficient_data', so all fields are null with gateStatus='insufficient_history' — renders "insufficient history" copy which IS the correct pre-launch behavior) |
| EngineCalibrationPanel | calibration.composite_* fields | analysis.engine_calibration ← gemini-analysis.ts post-process ← engineCtx | Yes (7 fields propagated from engine-context) | FLOWING (structurally); pre-launch renders suppression copy correctly |
| /insights/calibration composite card | classifier_version === 'cipher-composite-v1' | eval-brier.ts loads latest ALL × large_cap snapshot | Yes (once cron seeds first ship-eligible snapshot); pre-launch renders "No Brier evaluation written yet" | HOLLOW at pre-launch (correctly rendering pre-launch copy per orchestrator Playwright verification); FLOWING once cron produces real Brier |
| check-composite-ship-gate | composite_brier, baseline_brier_naive_mean, baseline_brier_logistic_36 | prisma.compositeCalibrationSnapshot per cell | Yes (once cron produces real numbers); pre-launch: 15 cells all insufficient_data | HOLLOW at pre-launch (correctly exits 0 with "insufficient data" message per Playwright verification); FLOWING once cron produces first ship-eligible snapshot |
| Composite cron output | snapshots_written, snapshots_insufficient_data | 5 regimes × 3 cap_classes loop | Pre-launch: `{snapshots_written: 0, snapshots_insufficient_data: 15}` (correctly reflects Wave 0 coverage=0.333) | FLOWING structurally; STATIC in shape (produces 15 cells regardless); real Brier per-cell arrives as P21.1 promotions accumulate |

**Interpretation:** All 5 dynamic artifacts are structurally wired; pre-launch data-flow is HOLLOW by design because the coverage-probe (0.333) is below the D-07 threshold (0.50). This is the ship-gate correctly doing its job — the gate defers promotion until organic P21.1 promotions lift ≥2 cap_class cells' coverage. Live data-flow (FLOWING) requires human verification post-deploy + post-cron.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full composite test suite runs GREEN | `npx vitest run tests/composite/` | 12 files passed, 43 tests passed, 1.75s | PASS |
| tsc baseline maintained (0 net-new errors) | `npx tsc --noEmit 2>&1 \| grep -c "error TS"` | 27 (all 27 pre-existing P22 stale-index-name errors; 0 in Phase 24 files) | PASS |
| Phase 24 composite files produce 0 tsc errors | `npx tsc --noEmit 2>&1 \| grep -E "src/lib/composite/\|CompositeHeadline\|composite-calibration\|check-composite-ship-gate\|fit-composite-isotonic"` | (empty output) | PASS |
| CompositeCalibrationSnapshot in Prisma schema | `grep -c "CompositeCalibrationSnapshot" prisma/schema.prisma` | 1 | PASS |
| HYPERPARAMETERS.md §Phase 24 present exactly once | `grep -c "## Phase 24 — Composite Signal Synthesis" HYPERPARAMETERS.md` | 1 | PASS |
| eval-brier includes cipher-composite-v1 | `grep -c "cipher-composite-v1" scripts/eval-brier.ts` | 2 | PASS |
| vercel.json cron entry | `grep "composite-calibration" vercel.json` | `{ "path": "/api/cron/composite-calibration", "schedule": "0 3 * * *" }` | PASS |
| Ship-gate script exit behavior at pre-launch | Recorded by orchestrator Playwright verification 2026-09-29 | Exits 0 with "insufficient data — no snapshots with real Brier available yet" | PASS |
| GET /api/cron/composite-calibration at pre-launch | Recorded by orchestrator Playwright verification 2026-09-29 | `{ok: true, snapshots_written: 0, snapshots_insufficient_data: 15, refit_mode: 'reuse'}` | PASS |
| /insights/calibration pre-launch copy | Recorded by orchestrator Playwright verification 2026-09-29 | "No Brier evaluation written yet" rendered correctly | PASS |
| No visual regression on /research/AAPL | Recorded by orchestrator Playwright verification 2026-09-29 | Passed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REASON-01 | 24-00, 24-01 | Composite headline via per-class isotonic-calibrated weighted combination | SATISFIED | composeSignal (compose.ts) + isotonic-serde + ESS-weighted; 8/8 GREEN tests |
| REASON-02 | 24-00, 24-02, 24-03 | Composite CI accounting for per-class correlation | SATISFIED | BCa row-resample (computeCompositeCi wraps bootstrapBCa); D-02 correlation preserved; seed=42 reproducibility test GREEN |
| REASON-03 | 24-00, 24-04 | Reports surface composite as headline with per-class breakdown beneath | SATISFIED | CompositeHeadline atop EngineCalibrationPanel + PER-CLASS BREAKDOWN eyebrow (D-04); panel-headline tests 8/8 GREEN |
| REASON-04 | 24-00, 24-03, 24-04 | Reliability diagram for composite on /insights | SATISFIED | eval-brier includes cipher-composite-v1; data-driven page loop renders card; insights-render 4/4 GREEN; orchestrator Playwright confirmed pre-launch copy correct |
| REASON-05 | 24-00, 24-03 | Numerics from engine-context, never LLM | SATISFIED | 7 composite_* fields authored in engine-context.ts; gemini-analysis.ts post-process overwrite at 1252-1258; AnalysisResultSchema NEVER expanded; schema-negative-shape + gemini-analysis-composite-overwrite tests GREEN |
| REASON-10 | 24-00, 24-02 | Composite Brier beats non-LLM logistic-36 baseline by ≥ 0.5pp (CLAUDE.md §8) | SATISFIED STRUCTURALLY; NEEDS ORGANIC DATA | Logistic-36 baseline module lands with IRLS + forward-chaining CV; ship-gate Gate 5 MANDATORY; baseline-benchmark 2/2 GREEN (pre-launch no-op-pass with warning; assertions activate when real snapshots exist); requires Wave 3 follow-up (extend loadHoldoutDataset with 36-feature projection) + organic P21.1 coverage growth to fully close on production data |

**Orphaned requirements check:** REASON-06, REASON-07, REASON-08, REASON-09 are explicitly Phase 25 per REQUIREMENTS.md line 74-77 — NOT orphaned, correctly deferred.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/lib/composite/types.ts | 4 | Comment references "24-REVISION-TODO.md" | Info | Documentation reference to the phase punch-list filename, not a code TODO |
| scripts/check-composite-ship-gate.ts | 10, 123 | Comment references "24-REVISION-TODO.md" | Info | Same — documentation reference |
| src/app/api/cron/composite-calibration/route.ts | 11, 68 | Comment references "24-REVISION-TODO.md" | Info | Same — documentation reference |

**No true stubs or placeholders found.** All matches are comment references to the numbered punch-list filename, not actual unfinished code.

### Human Verification Required

Four items are structurally verified in code but require post-deploy + organic-data verification to observe live behavior:

#### 1. First cron run seeds real CompositeCalibrationSnapshot rows on production Neon

**Test:** After production deploy + 03:00 UTC cron OR operator-triggered `GET /api/cron/composite-calibration` (Bearer-auth), query Neon: `SELECT count(*) FROM composite_calibration_snapshots WHERE status != 'insufficient_data'`
**Expected:** ≥1 row (rises to 15 as P21.1 organic promotions accumulate)
**Why human:** Cron fires on Vercel schedule against production Neon; cannot verify programmatically in this session

#### 2. Composite reliability card renders on /insights/calibration with real Brier

**Test:** After first ship-eligible or shadow snapshot for ALL × large_cap exists, load `/insights/calibration` in production
**Expected:** ReliabilityDiagram card labelled 'cipher-composite-v1' appears alongside SentimentObservation classifiers; composite_brier + reliability_bins render numerically
**Why human:** Requires deployed app + populated snapshot table; visual verification of card presence + histogram rendering

#### 3. CompositeHeadline renders on /research/[ticker] with active composite

**Test:** For any ticker whose (regime × cap_class) has a ship-eligible snapshot with K ≥ 2 ACTIVE classes, load `/research/[ticker]` in production
**Expected:** EngineCalibrationPanel top slot shows composite probability + BCa CI + K-of-4 subline (not the pre-launch "insufficient history" / "insufficient coverage" copy)
**Why human:** REASON-03 visual anchor requires organic P21.1 promotions to lift coverage above 0.50 threshold + cron refit to persist calibrated curves

#### 4. check-composite-ship-gate exits 0 on organic data (post-launch watchdog)

**Test:** After Wave 3 follow-up (extend `loadHoldoutDataset` to project 36-feature vector so `baseline_brier_logistic_36` becomes non-null) + cron re-run: `npm run check-composite-ship-gate`
**Expected:** Exits 0 with all 5 gates PASS (currently exits 0 informationally at pre-launch with "insufficient data" message)
**Why human:** Blocker #2 mitigation is structurally in place (Gate 5 MANDATORY, null = HARD FAIL) but full closure requires the Wave 3 follow-up + organic coverage growth. Ship-gate correctly refuses promotion until both arrive.

### Gaps Summary

**No blocking gaps.** Every Phase 24 must-have from every 24-*-PLAN.md is structurally present, wired, and covered by GREEN tests. Both revision-punch-list blockers are closed:

- **Blocker #1 (gemini-analysis.ts post-process overwrite):** 7 explicit copy lines at src/lib/gemini-analysis.ts:1252-1258; AnalysisResultSchema is not expanded; both schema-negative-shape and gemini-analysis-composite-overwrite tests GREEN.
- **Blocker #2 (check-composite-ship-gate.ts + logistic-36 baseline):** Script exists (273 LOC), wired to package.json, enforces baseline lift with Gate 5 MANDATORY. Null baseline_brier_logistic_36 on ship-eligible or shadow cell = HARD FAIL (not skip). Real logistic-36 module lives at src/lib/composite/logistic-baseline.ts (IRLS + forward-chaining CV enforcement).

**Two documented follow-ups (deferred, not gaps):**

1. **Coverage=0.333 < 0.50 threshold** — the D-07 gate is deferred not relaxed per 24-DISCUSSION-LOG.md Wave 0 coverage-probe decision (option b). MIN_CLASSES_ACTIVE=2 stays pinned. check-composite-ship-gate.ts correctly refuses promotion until organic P21.1 promotions accumulate. This is the gate doing its job.

2. **`baseline_brier_logistic_36` returns null in Wave 3 cron happy path** — CompositeRow doesn't yet project the 36-feature vector; loadHoldoutDataset needs extension. Documented in both 24-03-SUMMARY.md and 24-04-SUMMARY.md as follow-up work. Gate 5 remains MANDATORY so this cannot be forgotten. Real logistic-36 baseline module (fitLogisticBaseline + logistic36Brier) IS shipped — only the cron happy-path population is deferred.

**Live-behavior verification** (composite reliability card render, /research headline transition from suppression copy to active copy, ship-gate exits 0 on real data) naturally requires: (a) production deploy, (b) first 03:00 UTC cron run, (c) organic P21.1 promotions to grow coverage above 0.50, (d) Wave 3 follow-up for logistic-36 baseline. All four items are surfaced in the `human_verification` section.

---

*Verified: 2026-09-29T21:22:00Z*
*Verifier: Claude (gsd-verifier)*
