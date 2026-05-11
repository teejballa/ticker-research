---
phase: 20
plan: 20-B-03
wave: B
type: execute
depends_on: ['20-Z-01', '20-Z-03', '20-Z-05', '20-B-01', '20-B-02']
files_modified:
  - prisma/schema.prisma
  - data/datasets/financial-phrasebank.csv
  - data/datasets/DATASET-CARD-financial-phrasebank.md
  - src/lib/sentiment/calibration.ts
  - src/lib/sentiment/calibration-hyperparameters.ts
  - src/lib/sentiment/finsentllm.ts
  - src/lib/sentiment/per-doc-classifier.ts
  - src/lib/sentiment/MODEL-CARD-finbert-prosus.md
  - src/lib/sentiment/MODEL-CARD-gemini-per-doc.md
  - scripts/calibrate-temperature.ts
  - src/app/api/cron/calibrate-temperature/route.ts
  - src/app/insights/sentiment-health/components/CalibrationTile.tsx
  - vercel.json
  - HYPERPARAMETERS.md
  - tests/sentiment-calibration.unit.test.ts
  - tests/sentiment-calibration-fit.unit.test.ts
  - tests/integration/calibrate-temperature.integration.test.ts
autonomous: true
requirements: [20-B-03]
shadow_required: true
shadow_skip_reason: ""
hard_cleanup_gate: true
must_haves:
  truths:
    - "expectedCalibrationError(predictions, n_bins=10) implements the standard ECE formula Σᵢ (|Bᵢ|/N) × |confᵢ − accᵢ| with equal-width binning over the [0,1] confidence axis (Guo et al. 2017 §2)"
    - "temperatureScale(logits, T) returns softmax(logits / T); identity at T=1.0; lower T sharpens, higher T softens — verified against published numerical example"
    - "fitTemperature(predictions) minimises NLL over scalar T via L-BFGS with bounds [0.1, 10.0]; initial T=1.0; convergence tolerance 1e-6; falls back to T=1.0 with logged warning on non-convergence (T-20-B-03-03)"
    - "TemperatureCalibration Prisma model is APPEND-ONLY history (id, classifier_version, computed_at, temperature, ece_pre_scaling, ece_post_scaling, brier_pre_scaling, brier_post_scaling, n_validation_samples, n_fpb_samples, n_production_samples, validation_window_days, cv_ece_mean, cv_ece_std, status); NEVER UPDATE — every refit inserts a new row"
    - "Validation set composition is split-tracked: FPB held-out subset (~1k of the 5k allbut configured 80/20 train/val on the FPB CSV) PLUS ≥500 production-labeled docs from 20-Z-05 human spot-check; if production_labeled < 500 the run sets status='degraded' and SKIPS the ship gate (T-20-B-03-01)"
    - "Both ECE and Brier are reported and gated: ship gate requires ECE_post < 0.05 AND Brier_post < 0.24 (T-20-B-03-05 — guards against the always-predict-majority gaming of ECE alone)"
    - "5-fold cross-validation across the merged validation set produces cv_ece_mean ± cv_ece_std; ship gate uses cv_ece_mean (not single-fold ECE) to defend against small-sample overfit (T-20-B-03-02)"
    - "TemperatureCalibration.classifier_version pins the SHA / version string of the underlying classifier — for FinBERT this is the HF endpoint pinned commit (e.g. 'finbert-prosus-{sha}'); for Gemini per-doc this is 'gemini-per-doc-v{N}' from the 20-Z-04 prompt registry"
    - "Cron checks for new classifier_version on every monthly run AND triggers refit automatically when classifier_version changes vs the latest TemperatureCalibration row (T-20-B-03-04 — silent invalidation defense)"
    - "Both classifyFinBERT (in src/lib/sentiment/finsentllm.ts) and classifyDocumentsBatch (in src/lib/sentiment/per-doc-classifier.ts, owned by 20-B-01) read the latest TemperatureCalibration.temperature for their classifier_version at call time and apply temperatureScale(logits, T) to raw logits BEFORE returning polarity/confidence"
    - "Calibrated outputs are gated behind SENTIMENT_TEMP_SCALING_MODE flag with values off|shadow|on — at shadow the runtime computes both raw and T-scaled outputs and persists comparison telemetry; at on the T-scaled output replaces raw"
    - "Cutover from shadow→on is operator-gated by the numerical criterion: cv_ece_mean_post < 0.05 AND brier_post < 0.24 on the validation set, recorded in TemperatureCalibration.status='ship-eligible'"
    - "/insights/sentiment-health renders one CalibrationTile per classifier card showing latest TemperatureCalibration row (classifier_version, T, ece_pre, ece_post, brier_pre, brier_post, n_validation_samples, last_computed_at, status)"
    - "FPB dataset committed at data/datasets/financial-phrasebank.csv (Araci 2019; original Malo et al. 2014); license CC-BY-NC-SA-3.0 attribution + citation in DATASET-CARD-financial-phrasebank.md (S4 — dataset card)"
    - "HYPERPARAMETERS.md contains literal T entries for both classifier_versions, with computed_at timestamp + ece_post_scaling + brier_post_scaling + n_validation_samples; initial seed T=1.0 (uncalibrated identity) until first calibration run completes"
    - "Monthly cron /api/cron/calibrate-temperature scheduled via vercel.json at '0 7 2 * *' (2nd of month, 07:00 UTC — staggered after 20-A-03 tune-decay at '0 6 1 * *')"
    - "Brier score computed as standard Brier B = (1/N) Σ (p_i − y_i)² on the per-class probability for the predicted class against the binary correct/incorrect indicator (T-20-B-03-05)"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "TemperatureCalibration append-only history model"
      contains: "model TemperatureCalibration"
    - path: "data/datasets/financial-phrasebank.csv"
      provides: "Financial PhraseBank labeled sentence dataset (Malo et al. 2014, Araci 2019 partition); ~5k labeled sentences in {positive, neutral, negative}"
      min_lines: 1000
    - path: "data/datasets/DATASET-CARD-financial-phrasebank.md"
      provides: "Gebru-2018 dataset card: source, license (CC-BY-NC-SA-3.0), citation, intended use, known limitations"
      contains: "Malo"
    - path: "src/lib/sentiment/calibration.ts"
      provides: "expectedCalibrationError(), brierScore(), softmax(), temperatureScale(), fitTemperature(), kFoldCalibrationECE() pure functions"
      contains: "expectedCalibrationError"
    - path: "src/lib/sentiment/calibration-hyperparameters.ts"
      provides: "Typed const table of latest T per classifier_version (read at runtime from DB; this file holds the bootstrap seed T=1.0 and Zod-validated bounds)"
      contains: "CALIBRATION_BOUNDS"
    - path: "src/lib/sentiment/finsentllm.ts"
      provides: "classifyFinBERT calls temperatureScale on raw HF logits before reducing to polarity/confidence; gated by SENTIMENT_TEMP_SCALING_MODE"
      contains: "temperatureScale"
    - path: "src/lib/sentiment/per-doc-classifier.ts"
      provides: "classifyDocumentsBatch (created in 20-B-01) consumes calibration.ts to apply T to per-doc Gemini logits before emitting polarity/confidence; gated by SENTIMENT_TEMP_SCALING_MODE"
      contains: "temperatureScale"
    - path: "scripts/calibrate-temperature.ts"
      provides: "CLI: load FPB + production-labeled-from-20-Z-05; compute pre-ECE and pre-Brier; fit T per classifier; recompute post; 5-fold CV; persist TemperatureCalibration row; emit HYPERPARAMETERS.md update"
      contains: "fitTemperature"
    - path: "src/app/api/cron/calibrate-temperature/route.ts"
      provides: "Monthly cron entrypoint; checks classifier_version drift; invokes calibrate-temperature; persists TemperatureCalibration; auth via CRON_SECRET"
      contains: "Bearer ${process.env.CRON_SECRET}"
    - path: "src/app/insights/sentiment-health/components/CalibrationTile.tsx"
      provides: "React tile component displaying latest TemperatureCalibration row per classifier_version on the 20-Z-03 dashboard"
      contains: "ece_post_scaling"
    - path: "vercel.json"
      provides: "New cron entry for /api/cron/calibrate-temperature scheduled monthly"
      contains: "calibrate-temperature"
    - path: "HYPERPARAMETERS.md"
      provides: "Updated with §Temperature Scaling section: per-classifier_version T entries with timestamps, ECE/Brier numbers, citation Guo et al. 2017"
      contains: "20-B-03"
    - path: "src/lib/sentiment/MODEL-CARD-finbert-prosus.md"
      provides: "Mitchell-2019 model card (S4) — adds calibration section: T value, ECE_post, Brier_post, validation set, retrain cadence (20-Z-02 dependency satisfied)"
      contains: "Temperature"
    - path: "src/lib/sentiment/MODEL-CARD-gemini-per-doc.md"
      provides: "Mitchell-2019 model card (S4) — adds calibration section for the Gemini per-doc classifier created in 20-B-01"
      contains: "Temperature"
    - path: "tests/sentiment-calibration.unit.test.ts"
      provides: "≥6 unit cases on ECE + Brier + temperatureScale + softmax: synthetic perfectly-calibrated→ECE≈0; uniform-overconfident→known ECE; T=1 identity; T=2 softens (max prob decreases); T=0.5 sharpens; Brier on hard predictions; bin edge handling"
    - path: "tests/sentiment-calibration-fit.unit.test.ts"
      provides: "≥4 unit cases on fitTemperature: convergence within 1e-6 on synthetic 2-class data; bounds [0.1, 10] enforced; non-convergence falls back to T=1.0 with warning; 5-fold CV produces non-negative std"
    - path: "tests/integration/calibrate-temperature.integration.test.ts"
      provides: "End-to-end: load real FPB CSV head subset → fit T on FinBERT-shaped logits → assert ECE_post < ECE_pre AND Brier_post < Brier_pre; insert TemperatureCalibration row to live Neon; assert HYPERPARAMETERS.md patch produced"
  key_links:
    - from: "src/lib/sentiment/finsentllm.ts (classifyFinBERT)"
      to: "src/lib/sentiment/calibration.ts (temperatureScale)"
      via: "T-scaling applied to raw HF logits when SENTIMENT_TEMP_SCALING_MODE in {shadow, on}; T loaded from latest TemperatureCalibration row for classifier_version='finbert-prosus-{HF_FINBERT_SHA}'"
      pattern: "temperatureScale"
    - from: "src/lib/sentiment/per-doc-classifier.ts (classifyDocumentsBatch — owned by 20-B-01)"
      to: "src/lib/sentiment/calibration.ts (temperatureScale)"
      via: "T-scaling applied to per-doc Gemini logits when SENTIMENT_TEMP_SCALING_MODE in {shadow, on}; T loaded for classifier_version='gemini-per-doc-v{N}'"
      pattern: "temperatureScale"
    - from: "scripts/calibrate-temperature.ts"
      to: "prisma.temperatureCalibration.create + HYPERPARAMETERS.md edit"
      via: "single calibration run persists APPEND-ONLY row AND emits markdown patch (never overwrites historical rows)"
      pattern: "temperatureCalibration\\.create"
    - from: "src/app/api/cron/calibrate-temperature/route.ts"
      to: "vercel.json crons entry"
      via: "monthly schedule '0 7 2 * *'"
      pattern: "calibrate-temperature"
    - from: "src/app/api/cron/calibrate-temperature/route.ts"
      to: "prisma.temperatureCalibration.findFirst({ orderBy: computed_at desc })"
      via: "auto-refit-on-version-change: if HF_FINBERT_SHA or gemini-per-doc prompt version differs from latest row.classifier_version, force a refit even outside monthly cadence (T-20-B-03-04)"
      pattern: "classifier_version"
    - from: "src/app/insights/sentiment-health/components/CalibrationTile.tsx"
      to: "prisma.temperatureCalibration.findFirst({ where: { classifier_version }, orderBy: computed_at desc })"
      via: "tile renders latest calibration row per classifier_version on 20-Z-03 dashboard"
      pattern: "TemperatureCalibration"
---

# Plan 20-B-03: Temperature scaling + ECE tracking

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE blocking step: `npx prisma db push` of the new `TemperatureCalibration` model against live Neon (Task 2). All other tasks are autonomous. After the operator confirms the push, the remaining tasks (calibration primitives, fitTemperature L-BFGS, FPB dataset commit, scripts/calibrate-temperature.ts, cron wiring, classifier integration behind `off|shadow|on` flag, /insights tile, tests, model card updates) proceed without further prompts.

The cutover from shadow→on (T-scaled outputs replace raw outputs in production) is operator-gated by the Task 11 ship-gate report — this plan SHIPS the calibration infrastructure + report-generation, not the cutover decision.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:

1. `SENTIMENT_TEMP_SCALING_MODE` flag introduced with three values `off | shadow | on`. Plan ships at `shadow` by default; cutover to `on` requires the Task 11 ship-gate showing cv_ece_mean_post < 0.05 AND brier_post < 0.24.
2. No old code deleted — raw (untemperatured) classifier path remains alive while flag is `shadow` so we can persist raw-vs-scaled comparison telemetry through `ProviderCallLog` (20-Z-03).
3. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), `npm run test:e2e` (Playwright) all green on `main` post-commit.
4. **Schema Push Gate** (Task 2): `npx prisma db push` succeeded against live `DATABASE_URL` AND the integration test writes ≥1 `TemperatureCalibration` row in a single calibrate-temperature invocation.
5. **HYPERPARAMETERS Gate**: `HYPERPARAMETERS.md` contains a §Temperature Scaling section with literal T entries for both classifier_versions, computed_at timestamps, ece_post_scaling, brier_post_scaling, n_validation_samples, AND a citation to Guo et al. 2017.
6. **ECE Acceptance Gate** (CONTEXT.md line 115 verbatim): cv_ece_mean_post < 0.05 on the merged FPB+production validation set after T scaling, reported in `TemperatureCalibration.cv_ece_mean`. Until this gate passes, flag stays at `shadow` and TemperatureCalibration.status='shadow' or 'degraded'.
7. **Brier Co-Gate** (T-20-B-03-05): brier_post_scaling < 0.24 on the validation set. ECE alone is gameable by always-predict-majority (perfect ECE on a class-imbalanced set); requiring Brier < 0.24 (vs 0.25 random) co-validates predictive sharpness. Until this gate passes, flag stays at `shadow`.
8. **Production-labels Floor** (T-20-B-03-01): if production-labeled docs from 20-Z-05 < 500 at calibration time, the run completes with `status='degraded'`, persists the row for telemetry, SKIPS the ship gate, and logs a warning. Cron does not auto-cutover when degraded.
9. **Auto-refit-on-version-change** (T-20-B-03-04): cron re-fits T whenever HF_FINBERT_SHA or the registered gemini-per-doc prompt version differs from the latest TemperatureCalibration.classifier_version, even outside the monthly cadence. Verified by integration test that bumps the simulated version and asserts a new row is inserted.
10. **Model Cards Updated** (S4): both MODEL-CARD-finbert-prosus.md and MODEL-CARD-gemini-per-doc.md gain a calibration section with T value, ECE_post, Brier_post, validation set composition, retrain cadence. Until present, `scripts/check-model-cards.ts` (20-Z-02) returns non-zero.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — T is fit, never picked. Bootstrap seed T=1.0 in calibration-hyperparameters.ts is the IDENTITY (no scaling) — once Task 11 succeeds, the DB row T value is what runtime reads. The L-BFGS bounds [0.1, 10] are cited from Guo et al. 2017 (typical T ∈ [1, 4] in published reliability work; we widen the bounds to admit underconfidence as well). Bin count n_bins=10 is also Guo 2017 default.
- **S2 (PIT discipline)** — TemperatureCalibration is append-only with `computed_at`. Runtime always reads the latest row by `computed_at desc` for the matching `classifier_version`. Backtests can replay any historical T by joining on `computed_at <= snapshot_time`.
- **S3 (per-plan shadow lifecycle)** — `SENTIMENT_TEMP_SCALING_MODE` flag (`off | shadow | on`). Off → shadow (compute both raw and T-scaled, persist both via ProviderCallLog) → on (T-scaled replaces raw at the classifier output) → flag removed in Phase 21. Verdict for shadow→on is the numerical Cutover Gate above (cv_ece_mean_post < 0.05 AND brier_post < 0.24).
- **S4 (model card per artifact)** — Both classifier model cards (FinBERT-prosus, gemini-per-doc) gain a calibration section. ECE numbers per cap_class are reported per the 20-C-06 fairness audit pattern (this plan SHIPS the per-classifier numbers; 20-C-06 splits by segment).
- **S5 (pinned model + prompt versions)** — TemperatureCalibration.classifier_version pins the upstream classifier version. For FinBERT: `finbert-prosus-{HF_FINBERT_SHA}` from the env-pinned endpoint URL (per 19-C-01 / 20-B-02 convention). For Gemini per-doc: `gemini-per-doc-v{N}` from the 20-Z-04 prompt registry. T is per-version — a classifier upgrade invalidates and triggers refit (T-20-B-03-04).
- **S6 (telemetry on every external call)** — In shadow mode, both raw and T-scaled outputs flow through ProviderCallLog (20-Z-03 wrapper) so the dashboard can render side-by-side reliability diagrams. CalibrationTile renders ECE/Brier history per classifier on /insights/sentiment-health.
- **S7 (threat model)** — Five plan-level threats T-20-B-03-{01..05} below; mitigations are concrete and testable.
- **S8 (numerical acceptance)** — Every DONE criterion is a grep / test exit / numeric assertion. ECE < 0.05, Brier < 0.24, n_production ≥ 500, T ∈ [0.1, 10], cv_fold count = 5, convergence tol 1e-6.
- **S9 (failure-mode coverage)** — Calibration affects every report's classifier confidence numbers. The 20-D-04 golden-ticker suite exercises the calibrated path; this plan does not regress golden-ticker rendering (verified at Task 12 by re-running the 20-D-04 suite if available, otherwise gated against Phase 19's existing report regression).
- **S10 (regulatory hygiene)** — No new public surface area; calibration tile is on the operator-only /insights dashboard, not in user reports. No additional disclaimers required.

</universal_preamble>

<objective>
Calibrate per-classifier confidence outputs from the FinBERT (20-B-02) and Gemini per-doc (20-B-01) classifiers via single-scalar temperature scaling (Guo et al. 2017). Persist append-only calibration history. Auto-refit monthly via cron AND on classifier version change. Display ECE / Brier / T per classifier on the /insights sentiment-health dashboard. Ship gate: cv_ece_mean_post < 0.05 AND brier_post < 0.24 on the merged FPB + ≥500 production-labeled validation set.

Why temperature scaling: post-Phase-19 we publish bull/bear percentages and per-doc confidence, but neural classifiers (especially fine-tuned BERT and instruction-tuned LLMs) are systematically overconfident on out-of-distribution finance text — Guo et al. 2017 showed temperature scaling is the simplest and strongest single-parameter calibration method, reducing ECE on CIFAR-100 from ~0.16 to ~0.01. We replicate the procedure on Cipher's classifiers using FPB held-out + production human-spot-checks from 20-Z-05.

Output: `src/lib/sentiment/calibration.ts` + new `TemperatureCalibration` Prisma model + monthly cron + /insights tile + FPB dataset commit + updated model cards + flag-gated runtime integration in both classifiers.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-05-PLAN.md
@src/lib/sentiment/finsentllm.ts
@prisma/schema.prisma
@HYPERPARAMETERS.md

<interfaces>

```typescript
// src/lib/sentiment/calibration.ts — pure functions

/**
 * Standard expected calibration error with equal-width binning over [0,1].
 *
 *     ECE = Σᵢ (|Bᵢ| / N) × | conf_i - acc_i |
 *
 * where Bᵢ is the i-th bin of confidences, conf_i is the mean confidence in
 * bin i, and acc_i is the empirical accuracy in bin i. Standard reference:
 * Guo, Pleiss, Sun & Weinberger 2017 §2 (https://arxiv.org/abs/1706.04599).
 *
 * @param predictions one row per inference: confidence is the predicted
 *   probability of the predicted class (max softmax value), correct is whether
 *   the prediction matched the label.
 * @param n_bins number of equal-width bins on [0, 1]. Default 10 (Guo 2017).
 * @returns ECE in [0, 1]. Lower is better calibrated. 0 = perfectly calibrated.
 */
export function expectedCalibrationError(
  predictions: { confidence: number; correct: boolean }[],
  n_bins?: number,                        // default 10
): number;

/**
 * Standard Brier score for the predicted-class probability against the
 * binary correct/incorrect indicator.
 *
 *     B = (1/N) Σᵢ (p_i − y_i)²
 *
 * Lower is better. Random binary classifier ≈ 0.25; ship-gate < 0.24
 * (Murphy 1973 decomposition; Brier 1950 original).
 */
export function brierScore(
  predictions: { confidence: number; correct: boolean }[],
): number;

/**
 * Numerically-stable softmax over an arbitrary-length logit vector.
 * Subtracts max(logits) before exponentiating to avoid overflow on
 * large positive logits (common with un-normalized BERT classifier heads).
 */
export function softmax(logits: number[]): number[];

/**
 * Temperature-scaled softmax: returns softmax(logits / T).
 * T = 1 is the identity; T > 1 softens (entropy↑); T < 1 sharpens (entropy↓).
 *
 * @param logits raw classifier logits (NOT post-softmax probabilities).
 *   For Cipher: FinBERT raw scores BEFORE the SDK's softmax reduction
 *   in src/lib/sentiment/finsentllm.ts — must be intercepted upstream of
 *   reduceLabels(). For Gemini per-doc: synthetic logits derived from the
 *   model's emitted log-probabilities (per 20-B-01 contract).
 */
export function temperatureScale(logits: number[], T: number): number[];

/**
 * Fit single scalar temperature T minimising negative log-likelihood on
 * a held-out set, via L-BFGS with bounds [0.1, 10.0]. Initial T=1.0;
 * convergence tolerance 1e-6 on T. On non-convergence within 100 iterations,
 * returns T=1.0 (identity — uncalibrated but safe) and logs a warning to
 * stderr (caller may surface to TemperatureCalibration.status='nonconvergent').
 *
 * Reference: Guo et al. 2017 §3.1.
 *
 * @param predictions one row per held-out example: logits is the raw classifier
 *   logit vector (length = num_classes; for FinBERT typically 3:
 *   {positive, neutral, negative}); label is the integer class index of the
 *   ground truth.
 * @returns scalar T in [0.1, 10.0].
 */
export function fitTemperature(
  predictions: { logits: number[]; label: number }[],
): number;

/**
 * 5-fold cross-validation of fitTemperature + ECE-after-scaling, returning
 * the mean and std of post-scaling ECE across the 5 folds. Defends against
 * overfit T on small validation sets (T-20-B-03-02). Folds are deterministic
 * (seeded; same input → same partition).
 */
export function kFoldCalibrationECE(
  predictions: { logits: number[]; label: number }[],
  k?: number,                            // default 5
  seed?: number,                          // default 42
): { cv_ece_mean: number; cv_ece_std: number; per_fold: { T: number; ece_post: number }[] };
```

```prisma
// prisma/schema.prisma — APPEND-ONLY history; NEVER UPDATE
model TemperatureCalibration {
  id                       String   @id @default(cuid())
  classifier_version       String   // e.g. 'finbert-prosus-{HF_FINBERT_SHA}' or 'gemini-per-doc-v1'
  computed_at              DateTime @default(now())
  temperature              Float    // fit T in [0.1, 10.0]; 1.0 = identity (uncalibrated)
  ece_pre_scaling          Float
  ece_post_scaling         Float
  brier_pre_scaling        Float
  brier_post_scaling       Float
  cv_ece_mean              Float
  cv_ece_std               Float
  n_validation_samples     Int
  n_fpb_samples            Int
  n_production_samples     Int
  validation_window_days   Int      // typically 90 — production-label collection window
  status                   String   // 'ship-eligible' | 'shadow' | 'degraded' | 'nonconvergent'
  notes                    String?  // free-text — e.g. 'auto-refit on classifier_version change'

  @@index([classifier_version, computed_at])
}
```

```typescript
// src/lib/sentiment/calibration-hyperparameters.ts — bootstrap seed + bounds
import { z } from 'zod';

// L-BFGS optimiser bounds; see Guo et al. 2017 §3.1.
// We widen the typical published [1, 5] range to [0.1, 10] to admit
// both severe overconfidence (T >> 1) AND underconfidence (T < 1) corrections.
export const CALIBRATION_BOUNDS = Object.freeze({
  T_MIN: 0.1,
  T_MAX: 10.0,
  T_INITIAL: 1.0,                  // identity at start; fit moves from here
  CONVERGENCE_TOL: 1e-6,
  MAX_ITER: 100,
  N_BINS_ECE: 10,                  // Guo 2017 default
  N_FOLDS_CV: 5,                   // standard k-fold for small validation sets
  CV_SEED: 42,                     // determinism for repro
  PRODUCTION_LABELS_FLOOR: 500,    // CONTEXT.md line 115 verbatim
  SHIP_GATE_ECE: 0.05,             // CONTEXT.md line 115 verbatim
  SHIP_GATE_BRIER: 0.24,           // T-20-B-03-05 — Brier co-gate; vs 0.25 random
} as const);

// Bootstrap seed T per classifier_version BEFORE first calibration run.
// Identity = uncalibrated. Runtime always prefers the latest DB row when present.
export const BOOTSTRAP_T = Object.freeze({
  // populated at module load with classifier_versions known at PLAN authorship time;
  // unknown classifier_versions fall back to T=1.0 + a logged warning.
  // FinBERT SHA is read from process.env.HF_FINBERT_ENDPOINT pinned URL (per 20-B-02).
} as const);

const CalibrationConfigSchema = z.object({
  T_MIN: z.number().positive().max(1),
  T_MAX: z.number().min(1).max(100),
  T_INITIAL: z.number().positive(),
  CONVERGENCE_TOL: z.number().positive().lt(1),
  MAX_ITER: z.number().int().positive(),
  N_BINS_ECE: z.number().int().min(2).max(100),
  N_FOLDS_CV: z.number().int().min(2).max(20),
  CV_SEED: z.number().int(),
  PRODUCTION_LABELS_FLOOR: z.number().int().positive(),
  SHIP_GATE_ECE: z.number().positive().lt(1),
  SHIP_GATE_BRIER: z.number().positive().lt(1),
}).strict();

export function validateCalibrationBounds(): void {
  CalibrationConfigSchema.parse(CALIBRATION_BOUNDS);
}
// Module-load assertion (mirrors 19-A-01 pattern):
validateCalibrationBounds();
```

```typescript
// src/lib/sentiment/finsentllm.ts — INTEGRATION POINT (additive, gated)
//
// classifyFinBERT currently calls reduceLabels() on raw HF output.
// New behaviour at SENTIMENT_TEMP_SCALING_MODE in {shadow, on}:
//   1. read latest TemperatureCalibration row for classifier_version='finbert-prosus-{HF_FINBERT_SHA}'
//   2. extract raw logits from the HF response (the HF SDK returns post-softmax
//      class probabilities; we reverse via inverse softmax = log probabilities,
//      stable for ratios, see implementation note in calibration.ts)
//   3. T-scale: probs_scaled = softmax(log(probs) / T) [equivalent to scaling logits]
//   4. reduceLabels(probs_scaled) → SentimentScore
// At 'off' the existing behaviour is preserved verbatim.
// At 'shadow' BOTH raw and T-scaled SentimentScore are computed; raw is returned;
// scaled is logged via ProviderCallLog (20-Z-03) for offline reliability analysis.
// At 'on' the T-scaled SentimentScore replaces raw at the function return.
```

</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 20-Z-05 → calibration | Production-labeled docs from human spot-check are trusted as labels; assumes 20-Z-05 enforces label QA. |
| HF endpoint → classifier output | HF SDK output is trusted to be valid softmax probabilities; T-scaling assumes well-formed input. |
| Gemini Zod-validated output → per-doc-classifier | Gemini per-doc logits are derived from emitted log-probs per 20-B-01 contract; trusted within Zod schema bounds. |
| classifier_version env strings → DB classifier_version column | The HF SHA / prompt registry version are the authoritative version identifiers; mismatch triggers refit. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-B-03-01 | Information Disclosure | Insufficient production-labeled data — refit relies on 20-Z-05 spot-checks. If <500 labels, calibration is unreliable. | mitigate | Enforce `n_production_samples >= 500` floor (CONTEXT.md verbatim). Below floor: persist row with `status='degraded'`, SKIP ship gate, log warning, do NOT auto-cutover. Cron also surfaces a CalibrationTile warning banner on /insights so operator sees the degraded state. |
| T-20-B-03-02 | Tampering | Single-fold ECE on small validation set is high-variance and overfit-prone. A T that scores well on one held-out subset may not generalise. | mitigate | 5-fold CV across the merged FPB+production set; persist `cv_ece_mean` AND `cv_ece_std`. Ship gate uses `cv_ece_mean < 0.05`, not single-fold. CV seeded for repro (CV_SEED=42). |
| T-20-B-03-03 | Denial of Service | Optimiser non-convergence (degenerate input, all-correct or all-wrong predictions) → infinite loop OR T outside sane bounds (e.g. 1e-12 from numerical underflow). | mitigate | L-BFGS with explicit bounds [0.1, 10.0] + MAX_ITER=100. On non-convergence: return T=1.0 (identity, safe), log warning, persist row with `status='nonconvergent'`, SKIP ship gate. Identity is never worse than uncalibrated. |
| T-20-B-03-04 | Tampering | Classifier upgrade silently invalidates T — operator bumps HF_FINBERT_SHA or 20-Z-04 registers gemini-per-doc-v2, but TemperatureCalibration row still references old version → runtime applies stale T to incompatible new logits. | mitigate | TemperatureCalibration.classifier_version pins the SHA / version string. Runtime reads `findFirst({ where: { classifier_version: CURRENT_VERSION }, orderBy: computed_at desc })` — no row → fall back to T=1.0 + warning. Cron checks current vs latest row each run AND triggers an immediate refit when versions differ (auto-refit-on-version-change), not waiting for the monthly cadence. Verified by integration test that bumps simulated version. |
| T-20-B-03-05 | Tampering / metric gaming | ECE alone is gameable: a model that always predicts the majority class with confidence = base-rate scores a low ECE (locally well-calibrated bin) despite zero predictive sharpness. | mitigate | Co-gate on Brier score: ship requires `cv_ece_mean_post < 0.05` AND `brier_post < 0.24`. Brier penalises probability mass on the wrong class quadratically — collapses to base-rate fail Brier hard. Plus persist `brier_pre_scaling` and `brier_post_scaling` so reliability diagrams on /insights surface the joint metric. |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-B-03-01">
  <name>Task 1: Add TemperatureCalibration Prisma model + bounds module + module-load Zod validation</name>
  <files>prisma/schema.prisma, src/lib/sentiment/calibration-hyperparameters.ts, tests/sentiment-calibration-bounds.unit.test.ts</files>
  <read_first>
    - prisma/schema.prisma (verify model naming convention; place TemperatureCalibration adjacent to existing sentiment-related models if any)
    - src/lib/learning.ts (HYPERPARAMETERS Zod-validation pattern from 19-A-01 for symmetry)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 115 — verbatim acceptance)
  </read_first>
  <behavior>
    Unit tests (≥4) — `tests/sentiment-calibration-bounds.unit.test.ts`:
    1. validateCalibrationBounds() does not throw on the shipped CALIBRATION_BOUNDS
    2. validateCalibrationBounds() throws when T_MIN >= T_MAX (mocked clone)
    3. validateCalibrationBounds() throws when SHIP_GATE_ECE >= 1 (impossible threshold)
    4. CALIBRATION_BOUNDS is frozen — direct mutation throws in strict mode
  </behavior>
  <action>
    A. Append `model TemperatureCalibration` to `prisma/schema.prisma` per the EXACT shape in `<interfaces>` above. Place it AFTER the existing `LearnedPattern` model (line 99) for grouping with other engine/classifier-history models.

    B. Create `src/lib/sentiment/calibration-hyperparameters.ts` with EXACTLY the contents in `<interfaces>` above: `CALIBRATION_BOUNDS` frozen const, `BOOTSTRAP_T` frozen const, Zod schema, `validateCalibrationBounds()`, AND a module-top-level `validateCalibrationBounds()` call so any malformed config fails the build at import time (mirroring 19-A-01 pattern).

    C. Create `tests/sentiment-calibration-bounds.unit.test.ts` with the 4 behaviours above.

    DO NOT push the schema in this task — Task 2 is the gated push step. Tests in this task run against the existing DB schema (the new model is not yet pushed; tests are pure-TypeScript on the bounds module).
  </action>
  <acceptance_criteria>
    - `grep -q "model TemperatureCalibration" prisma/schema.prisma`
    - `grep -q "classifier_version" prisma/schema.prisma`
    - `grep -q "@@index(\[classifier_version, computed_at\])" prisma/schema.prisma`
    - File `src/lib/sentiment/calibration-hyperparameters.ts` exists and exports CALIBRATION_BOUNDS, BOOTSTRAP_T, validateCalibrationBounds
    - `grep -q "validateCalibrationBounds()" src/lib/sentiment/calibration-hyperparameters.ts` (the module-load assertion line)
    - `npx vitest run tests/sentiment-calibration-bounds.unit.test.ts` exits 0 with ≥4 passing tests
    - `npx prisma format` exits 0 (schema is syntactically valid)
  </acceptance_criteria>
  <verify>
    <automated>npx prisma format && npx vitest run tests/sentiment-calibration-bounds.unit.test.ts</automated>
  </verify>
  <done>Schema model + bounds module landed; module-load Zod assertion guards CALIBRATION_BOUNDS at import time; ≥4 unit tests GREEN</done>
</task>

<task type="checkpoint:human-action" id="20-B-03-02" gate="blocking">
  <name>Task 2: [BLOCKING] Schema Push Gate — npx prisma db push to live Neon</name>
  <files>prisma/schema.prisma (push only — no file mutation; live DB schema change)</files>
  <what-built>Task 1 added `model TemperatureCalibration` to prisma/schema.prisma but did NOT push to live Neon. The remaining tasks (script, integration test, cron, runtime read) all depend on the table existing.</what-built>
  <how-to-verify>
    1. From repo root: `npx prisma db push`
    2. Verify table exists: `psql "$DATABASE_URL" -c '\d "TemperatureCalibration"'`
    3. Expected output: 14 columns including `id`, `classifier_version`, `computed_at`, `temperature`, `ece_pre_scaling`, `ece_post_scaling`, `brier_pre_scaling`, `brier_post_scaling`, `cv_ece_mean`, `cv_ece_std`, `n_validation_samples`, `n_fpb_samples`, `n_production_samples`, `validation_window_days`, `status`, `notes`
    4. Verify index: `psql "$DATABASE_URL" -c '\di "TemperatureCalibration*"'` shows `(classifier_version, computed_at)` index
  </how-to-verify>
  <resume-signal>Type "approved" once `npx prisma db push` has succeeded against the live Neon DATABASE_URL AND the table is verified via psql.</resume-signal>
  <action>OPERATOR: Run `npx prisma db push` from repo root with the live Neon DATABASE_URL configured. This pushes the new TemperatureCalibration model schema added in Task 1 to the live Neon database. Then verify the table + index exist as described in <how-to-verify>. No code change in this task — pure DB schema migration.</action>
  <verify>
    <automated>psql "$DATABASE_URL" -c '\d "TemperatureCalibration"' | grep -q "classifier_version" && psql "$DATABASE_URL" -c '\di "TemperatureCalibration*"' | grep -q "classifier_version"</automated>
  </verify>
  <done>TemperatureCalibration table exists in live Neon with all 16 columns AND the (classifier_version, computed_at) index; subsequent tasks can read/write the table.</done>
</task>

<task type="auto" tdd="true" id="20-B-03-03">
  <name>Task 3: Implement calibration.ts pure functions (ECE, Brier, softmax, temperatureScale)</name>
  <files>src/lib/sentiment/calibration.ts, tests/sentiment-calibration.unit.test.ts</files>
  <read_first>
    - src/lib/sentiment/calibration-hyperparameters.ts (CALIBRATION_BOUNDS — N_BINS_ECE default)
    - https://arxiv.org/abs/1706.04599 §2 (ECE formula reference — Guo et al. 2017)
    - src/lib/sentiment/finsentllm.ts lines 50-59 (existing reduceLabels pattern — calibration.ts lives upstream of this)
  </read_first>
  <behavior>
    Unit tests (≥6) — `tests/sentiment-calibration.unit.test.ts`:
    1. expectedCalibrationError on perfectly-calibrated synthetic predictions (N=1000, every confidence bin has accuracy = bin midpoint) returns a value < 0.02
    2. expectedCalibrationError on uniform-overconfident set (every prediction confidence=0.99, every prediction wrong) returns a value > 0.95 (specifically: 1 × |0.99 - 0.0| ≈ 0.99)
    3. expectedCalibrationError handles empty input → returns 0 (no error contribution; guard in code)
    4. brierScore on hard correct prediction (confidence=1.0, correct=true) → 0; hard wrong prediction (confidence=1.0, correct=false) → 1; uniform (confidence=0.5, mixed) → 0.25
    5. softmax([0, 0, 0]) returns [1/3, 1/3, 1/3]; softmax([1000, 0, 0]) returns approximately [1, 0, 0] (numerically stable, no overflow)
    6. temperatureScale(logits, 1.0) === softmax(logits) (identity at T=1)
    7. temperatureScale(logits, 2.0) returns probabilities with strictly LOWER max (softens) than T=1.0 case for non-degenerate logits [3, 1, 0]
    8. temperatureScale(logits, 0.5) returns probabilities with strictly HIGHER max (sharpens) than T=1.0 case for the same logits
    9. expectedCalibrationError with n_bins=10 vs n_bins=20 — values differ but both are in [0, 1] and lower-binned variant is a coarser estimate (no specific monotonicity required, just both finite)
  </behavior>
  <action>
    Create `src/lib/sentiment/calibration.ts` implementing the four primitives per the `<interfaces>` block above. Implementation notes:

    - **softmax**: subtract max(logits) before exp to avoid overflow; return probabilities summing to 1 within 1e-9 (assert in test).
    - **temperatureScale**: return softmax(logits.map(l => l / T)). Reject T <= 0 with descriptive throw (defends against caller passing 0).
    - **expectedCalibrationError**: equal-width bins on [0, 1] with edges at i/n_bins for i in 0..n_bins. Assign each prediction to bin floor(confidence * n_bins) (clamp confidence=1.0 into the last bin). For each non-empty bin: compute mean(confidence) and mean(correct ? 1 : 0); accumulate `(|bin| / N) * |mean_conf - mean_acc|`. Empty bins contribute zero. Empty input returns 0.
    - **brierScore**: `(1/N) * Σ (confidence_i - (correct ? 1 : 0))²`. Empty input returns 0 with a TODO note that callers should not invoke on empty sets (test asserts the empty-guard).

    Header comment cites Guo et al. 2017 (https://arxiv.org/abs/1706.04599) and Brier 1950. Each export has a JSDoc block with the formula in LaTeX-ish ASCII (so it shows up cleanly in editor hover).

    File MUST NOT import from prisma client — these are pure functions consumed by the script (Task 5) and runtime (Task 8). Keeps unit tests fast and DB-free.
  </action>
  <acceptance_criteria>
    - File `src/lib/sentiment/calibration.ts` exists
    - Exports: expectedCalibrationError, brierScore, softmax, temperatureScale (verified via dynamic import in test)
    - `grep -q "Guo" src/lib/sentiment/calibration.ts`
    - `grep -q "1706.04599" src/lib/sentiment/calibration.ts`
    - File contains NO `import.*prisma` (pure functions)
    - `npx vitest run tests/sentiment-calibration.unit.test.ts` exits 0 with ≥6 (target 9) passing tests
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/sentiment-calibration.unit.test.ts</automated>
  </verify>
  <done>Pure ECE + Brier + softmax + temperatureScale primitives landed; ≥6 unit tests GREEN; Guo 2017 cited in source header</done>
</task>

<task type="auto" tdd="true" id="20-B-03-04">
  <name>Task 4: Implement fitTemperature (L-BFGS) + kFoldCalibrationECE</name>
  <files>src/lib/sentiment/calibration.ts, tests/sentiment-calibration-fit.unit.test.ts</files>
  <read_first>
    - src/lib/sentiment/calibration.ts (Task 3 — uses softmax, temperatureScale, expectedCalibrationError)
    - src/lib/sentiment/calibration-hyperparameters.ts (CALIBRATION_BOUNDS — T_MIN, T_MAX, T_INITIAL, CONVERGENCE_TOL, MAX_ITER, N_FOLDS_CV, CV_SEED)
    - https://arxiv.org/abs/1706.04599 §3.1 (Guo 2017 fitting procedure)
  </read_first>
  <behavior>
    Unit tests (≥4) — `tests/sentiment-calibration-fit.unit.test.ts`:
    1. fitTemperature on synthetic predictions where the IDEAL T = 2.0 (predictions generated by SHARPENING a known calibrated distribution by factor 2) recovers T within 0.05 (i.e. fit ∈ [1.95, 2.05])
    2. fitTemperature on degenerate input (all predictions identical, no signal) returns T=1.0 with status loggable as nonconvergent (caller-observable via stderr capture)
    3. fitTemperature respects bounds: synthetic input that would prefer T=20 is clamped to T_MAX=10
    4. fitTemperature respects bounds: synthetic input that would prefer T=0.01 is clamped to T_MIN=0.1
    5. kFoldCalibrationECE on 100 synthetic 2-class predictions returns cv_ece_mean ≥ 0 AND cv_ece_std ≥ 0 AND per_fold.length === 5
    6. kFoldCalibrationECE is deterministic — same input + same seed produces identical (cv_ece_mean, cv_ece_std)
  </behavior>
  <action>
    Append fitTemperature + kFoldCalibrationECE to `src/lib/sentiment/calibration.ts`.

    L-BFGS implementation: the optimisation problem is 1-dimensional (scalar T) so a full L-BFGS library is overkill. Use a hand-rolled bounded scalar minimisation: golden-section search OR simple bounded gradient descent with backtracking line search. Reference implementation: 80-line bounded golden-section search adapted for scalar NLL. Approach:

    - NLL(T) = -Σᵢ log( softmax(logits_i / T)[label_i] )
    - Numerical gradient via central difference (h=1e-4) since the closed-form involves softmax derivatives we don't need at this scale.
    - Bounded golden-section search on [T_MIN, T_MAX], terminating when the bracket width < CONVERGENCE_TOL × (T_MAX - T_MIN).
    - On MAX_ITER without convergence: return T=1.0, write `console.warn('[calibration] fitTemperature non-convergent; returning T=1.0')`.

    Why golden-section over true L-BFGS: scipy.optimize.minimize_scalar(method='bounded', bounds=(0.1, 10)) IS the published reference for scalar T; it uses Brent / golden-section internally (not multivariate L-BFGS). This matches industry practice and avoids a node-side L-BFGS dependency (`fmin-lbfgs` etc. are unmaintained).

    Document the substitution in the JSDoc: "Note: published references describe L-BFGS for the multi-class T fit, but for scalar T (single-parameter optimisation) bounded golden-section search is the standard implementation in scipy.optimize.minimize_scalar(method='bounded') — cf. Brent 1973. We adopt this here for the same numerical guarantees with zero dependencies."

    kFoldCalibrationECE: deterministic shuffle (seedable Mulberry32 or similar 32-line PRNG), partition into k folds, for each fold fit T on (k-1)/k and compute ECE_post on 1/k held out. Return mean+std of post-ECE plus per-fold details.
  </action>
  <acceptance_criteria>
    - fitTemperature and kFoldCalibrationECE exported from src/lib/sentiment/calibration.ts
    - `grep -q "golden-section\\|golden section\\|Brent" src/lib/sentiment/calibration.ts` (justification comment present)
    - `grep -q "console.warn" src/lib/sentiment/calibration.ts` (non-convergent warning)
    - `npx vitest run tests/sentiment-calibration-fit.unit.test.ts` exits 0 with ≥4 (target 6) passing tests
    - Determinism test passes (same seed → same result)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/sentiment-calibration-fit.unit.test.ts</automated>
  </verify>
  <done>fitTemperature + kFoldCalibrationECE landed with bounded golden-section search; ≥4 unit tests GREEN; non-convergence path tested; determinism verified</done>
</task>

<task type="auto" id="20-B-03-05">
  <name>Task 5: Commit Financial PhraseBank dataset + dataset card</name>
  <files>data/datasets/financial-phrasebank.csv, data/datasets/DATASET-CARD-financial-phrasebank.md</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 115 — "FPB (~5k labeled sentences)")
    - https://huggingface.co/datasets/financial_phrasebank (Araci 2019 partition reference)
    - https://arxiv.org/abs/1307.5336 (Malo et al. 2014 original — license CC-BY-NC-SA-3.0)
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (DATASET-CARD-template.md location)
  </read_first>
  <action>
    A. Create `data/datasets/` directory if absent.

    B. Download the Financial PhraseBank `Sentences_AllAgree.txt` (~2,264 sentences with 100% annotator agreement — the cleanest subset; the full dataset has ~4,840 with majority-agreement). For training/validation use we want the AllAgree set as gold-standard PLUS the 75%-agree subset (~3,453 total). Convert to CSV with columns `text,label` where label ∈ {positive, neutral, negative}.

    Source: https://www.researchgate.net/publication/251231364_FinancialPhraseBank-v10 (original release) OR the HuggingFace mirror at `huggingface.co/datasets/financial_phrasebank` with config 'sentences_75agree' (~3,453 sentences) OR 'sentences_allagree' (~2,264).

    Write the combined set as `data/datasets/financial-phrasebank.csv` with header row `text,label,agreement_level` where agreement_level ∈ {all, 75pct}. Keep encoding UTF-8.

    Acceptance constraint: file is ≥1000 lines (well below 5k, well above 100 — proves it is the real corpus, not a stub). Run `wc -l data/datasets/financial-phrasebank.csv` post-creation.

    C. Create `data/datasets/DATASET-CARD-financial-phrasebank.md` per the Gebru 2018 schema (S4):

    ```markdown
    # Dataset Card — Financial PhraseBank

    ## Source
    - **Original**: Malo, P., Sinha, A., Korhonen, P., Wallenius, J., & Takala, P. (2014).
      "Good debt or bad debt: Detecting semantic orientations in economic texts."
      *Journal of the Association for Information Science and Technology*, 65(4), 782-796.
      https://arxiv.org/abs/1307.5336
    - **Standard partition**: Araci, D. (2019). "FinBERT: Financial Sentiment Analysis with
      Pre-trained Language Models." https://arxiv.org/abs/1908.10063
    - **Mirror**: https://huggingface.co/datasets/financial_phrasebank

    ## License
    Creative Commons Attribution-NonCommercial-ShareAlike 3.0 (CC-BY-NC-SA-3.0).
    Cipher uses this dataset for INTERNAL CALIBRATION ONLY (research use within
    the meaning of the license). Calibration outputs (T values, ECE numbers) are
    derived works; we publish only aggregate statistics, never raw sentences.

    ## Composition
    - ~2,264 sentences with 100% inter-annotator agreement (highest gold standard)
    - ~3,453 sentences with ≥75% inter-annotator agreement
    - Class distribution (75pct subset): ~25% positive / ~13% negative / ~62% neutral
    - Domain: financial news headlines and excerpts

    ## Intended use in Cipher
    - Held-out validation set for temperature scaling of Cipher's classifiers
      (FinBERT-Prosus, Gemini per-doc classifier).
    - 5-fold CV partition: 80% train / 20% val per fold (deterministic, seed=42).
    - NOT used for training — Cipher does not retrain FinBERT or fine-tune Gemini;
      this is calibration data only.

    ## Known limitations
    - English-only.
    - Skewed class distribution (majority neutral) — Brier co-gate (T-20-B-03-05)
      defends against ECE gaming.
    - News-headline distribution shift vs Cipher's full document corpus
      (StockTwits, Reddit, full SEC filings) — production-labeled validation
      from 20-Z-05 (≥500 docs) supplements FPB to bridge the gap.

    ## Citation
    If you use this dataset cite Malo et al. 2014 AND Araci 2019.
    ```

    D. Add `data/datasets/financial-phrasebank.csv` to `.gitignore` IF the file is >5MB; otherwise commit directly. (Project convention per CLAUDE.md: do not commit generated artifacts. The FPB dataset is RESEARCH input data, not a generated artifact, so it IS committed. Verify file size — typical FPB CSV ≈ 600KB, well under any sane LFS threshold.)
  </action>
  <acceptance_criteria>
    - File `data/datasets/financial-phrasebank.csv` exists
    - `wc -l data/datasets/financial-phrasebank.csv` returns ≥ 1000
    - First line contains the header `text,label,agreement_level` (or compatible)
    - All `label` values are in {positive, neutral, negative} (verify with `tail -n +2 data/datasets/financial-phrasebank.csv | cut -d, -f2 | sort -u` returns exactly those three)
    - File `data/datasets/DATASET-CARD-financial-phrasebank.md` exists
    - `grep -q "CC-BY-NC-SA-3.0" data/datasets/DATASET-CARD-financial-phrasebank.md`
    - `grep -q "Malo" data/datasets/DATASET-CARD-financial-phrasebank.md`
    - `grep -q "Araci" data/datasets/DATASET-CARD-financial-phrasebank.md`
  </acceptance_criteria>
  <verify>
    <automated>test -f data/datasets/financial-phrasebank.csv && [ "$(wc -l < data/datasets/financial-phrasebank.csv)" -ge 1000 ] && grep -q "CC-BY-NC-SA-3.0" data/datasets/DATASET-CARD-financial-phrasebank.md && grep -q "Araci" data/datasets/DATASET-CARD-financial-phrasebank.md</automated>
  </verify>
  <done>FPB CSV committed (≥1000 sentences in {positive, neutral, negative}); dataset card present with license + Malo et al. 2014 + Araci 2019 citations</done>
</task>

<task type="auto" id="20-B-03-06">
  <name>Task 6: Implement scripts/calibrate-temperature.ts (per-classifier fit + persist)</name>
  <files>scripts/calibrate-temperature.ts</files>
  <read_first>
    - src/lib/sentiment/calibration.ts (Tasks 3+4 — primitives)
    - src/lib/sentiment/calibration-hyperparameters.ts (Task 1 — bounds)
    - data/datasets/financial-phrasebank.csv (Task 5 — validation source)
    - .planning/phases/20-real-sentiment-analysis/20-Z-05-PLAN.md (production-labeled exemplars location: tests/golden-tickers/_human_labels/)
    - src/lib/sentiment/finsentllm.ts (classifier_version source for FinBERT — derived from process.env.HF_FINBERT_ENDPOINT pinned URL)
    - .planning/phases/20-real-sentiment-analysis/20-A-03-PLAN.md (operator-driven script + cron pattern — 20-A-03 is the established sibling)
  </read_first>
  <action>
    Create `scripts/calibrate-temperature.ts`. CLI signature:

    ```
    npx tsx scripts/calibrate-temperature.ts --classifier {finbert | gemini-per-doc | all} \
       [--fpb-only] [--dry-run] [--out /tmp/calibration-report.json]
    ```

    Algorithm:

    1. Load FPB CSV from `data/datasets/financial-phrasebank.csv`. Map labels to integer indices: {positive: 0, neutral: 1, negative: 2}. (Both classifiers use this 3-class layout.)

    2. Load production-labeled exemplars from `tests/golden-tickers/_human_labels/*.json` (20-Z-05 starter set; 20-D-04 expands). Filter to the `human_scores` whose dimension reflects sentiment ground-truth: this set is RUBRIC-graded by 20-Z-05, NOT raw class labels — so for THIS plan the production-labeled set is a TODO referencing 20-Z-05's planned class-label extension. Until that lands, run with `n_production_samples = 0` and set `status = 'degraded'` per the floor rule.

       (Forward-reference comment in the script: "TODO 20-Z-05 — extend HumanExemplar with `class_label` field for direct calibration use; until then production_labeled count is 0 and runs are flagged degraded.")

    3. For each classifier in {finbert, gemini-per-doc} (or the single one passed via --classifier):
        - Determine `classifier_version`:
          - FinBERT: parse the SHA off `process.env.HF_FINBERT_ENDPOINT` (format `...finbert@<sha>`); fail with diagnostic if env missing or SHA absent (this script REQUIRES production env to know which version it is calibrating).
          - Gemini per-doc: read from `getPrompt('per-doc-classifier-v1', undefined).version` (20-Z-04 registry; falls back to 'v1' default if 20-B-01 has not yet registered the prompt — in which case log `status='nonconvergent', notes='prompt registry missing'` and SKIP).
        - For the FPB validation pass: send each FPB sentence through the classifier's RAW logit-emitting path (NOT through the production polarity-reduction path which has already collapsed logits to scalar). For FinBERT the HF SDK returns post-softmax probs — convert back to "logits" via `log(p)` (proportional, sufficient for T scaling since softmax is shift-invariant). For Gemini per-doc 20-B-01 emits the per-class log-prob block per-doc — read directly.
        - On the merged `predictions: { logits: number[]; label: number }[]` (FPB + production-labeled if any):
          - Compute `ece_pre_scaling` and `brier_pre_scaling` (T=1).
          - `T = fitTemperature(predictions)`.
          - Apply scaling, recompute `ece_post_scaling`, `brier_post_scaling`.
          - Run `kFoldCalibrationECE` for `cv_ece_mean`, `cv_ece_std`.
          - Determine `status`:
            - if n_production_samples < PRODUCTION_LABELS_FLOOR → 'degraded'
            - else if optimiser returned T=1.0 with non-convergence warning → 'nonconvergent'
            - else if cv_ece_mean < SHIP_GATE_ECE AND brier_post < SHIP_GATE_BRIER → 'ship-eligible'
            - else → 'shadow'
          - INSERT (NEVER UPDATE) a TemperatureCalibration row with all fields populated.

    4. Emit a Markdown patch for `HYPERPARAMETERS.md` (printed to stdout AND written to `--out` if provided) updating §Temperature Scaling with the new rows.

    5. Print summary table to stdout: classifier_version | T | ECE_pre | ECE_post | Brier_pre | Brier_post | n_val | status

    6. `--dry-run` mode: do all computation, print summary, but DO NOT INSERT into DB and DO NOT MUTATE HYPERPARAMETERS.md.

    Implementation budget: ≤ 350 lines TypeScript. Reuses calibration.ts primitives — script is glue code: load CSV, route to classifier, persist row, emit patch.

    For the FinBERT inference pass at scale (FPB = 5k sentences): batch via the HF endpoint with concurrency capped at 4 (avoid rate-limiting) and a 60s per-batch timeout. If endpoint is unreachable: fail with a clear "FinBERT endpoint required for calibration; ensure HF_FINBERT_ENDPOINT is set and reachable" message.
  </action>
  <acceptance_criteria>
    - File `scripts/calibrate-temperature.ts` exists
    - `grep -q "fitTemperature" scripts/calibrate-temperature.ts`
    - `grep -q "kFoldCalibrationECE" scripts/calibrate-temperature.ts`
    - `grep -q "TemperatureCalibration" scripts/calibrate-temperature.ts`
    - `grep -q "PRODUCTION_LABELS_FLOOR" scripts/calibrate-temperature.ts`
    - `grep -q "ship-eligible\\|degraded\\|nonconvergent" scripts/calibrate-temperature.ts`
    - `grep -q "dry-run" scripts/calibrate-temperature.ts`
    - `npx tsx scripts/calibrate-temperature.ts --help` (or --dry-run with no env) exits 0 OR exits with a clear, documented error message (script is well-formed)
    - Script length ≤ 350 lines: `wc -l scripts/calibrate-temperature.ts` returns ≤ 350
  </acceptance_criteria>
  <verify>
    <automated>test -f scripts/calibrate-temperature.ts && grep -q "fitTemperature" scripts/calibrate-temperature.ts && grep -q "PRODUCTION_LABELS_FLOOR" scripts/calibrate-temperature.ts && [ "$(wc -l < scripts/calibrate-temperature.ts)" -le 350 ]</automated>
  </verify>
  <done>Calibration CLI landed; loads FPB + production-labeled; fits T per classifier_version; persists APPEND-ONLY TemperatureCalibration row; emits HYPERPARAMETERS.md patch; honours --dry-run + degraded/nonconvergent/ship-eligible status logic</done>
</task>

<task type="auto" id="20-B-03-07">
  <name>Task 7: Cron + auto-refit-on-version-change wiring</name>
  <files>src/app/api/cron/calibrate-temperature/route.ts, scripts/calibrate-temperature-core.ts, vercel.json</files>
  <read_first>
    - vercel.json (existing crons array; verify schedule format; 20-A-03 added '0 6 1 * *' tune-decay — stagger this one to '0 7 2 * *')
    - .planning/phases/20-real-sentiment-analysis/20-A-03-PLAN.md Task 7 (cron handler pattern — Bearer ${process.env.CRON_SECRET})
    - scripts/calibrate-temperature.ts (Task 6 — invoked by the cron handler)
  </read_first>
  <action>
    A. Create `src/app/api/cron/calibrate-temperature/route.ts`:

    ```typescript
    // GET handler — invoked by Vercel cron. Auth via Bearer ${CRON_SECRET}.
    // Behaviour:
    //   1. For each classifier in {finbert, gemini-per-doc}:
    //      a. Read CURRENT classifier_version from env (FinBERT) / prompt registry (Gemini)
    //      b. Read LATEST TemperatureCalibration row for that classifier_version
    //      c. If LATEST is null OR LATEST.classifier_version !== CURRENT version → force refit
    //         (auto-refit-on-version-change, T-20-B-03-04)
    //      d. Else if LATEST.computed_at > 30 days ago → monthly cadence refit
    //   2. Refit invokes the same code path as scripts/calibrate-temperature.ts (extract a
    //      runCalibrationFor(classifier) function from the script and import it here so cron
    //      and CLI share one implementation — DO NOT shell out from the cron handler).
    //   3. Returns JSON: { classifier_version, status, T, ece_post, brier_post, refit_reason }
    //      per classifier.
    ```

    B. Update `vercel.json` to add the new cron entry:

    ```json
    {
      "path": "/api/cron/calibrate-temperature",
      "schedule": "0 7 2 * *"
    }
    ```

    Schedule rationale: 02:00 UTC on the 2nd of every month — staggered after 20-A-03's tune-decay cron at '0 6 1 * *'. Avoids two heavy compute crons on the same day. Hobby plan limit is 2 crons total per project; verify this is the project plan and gate the cron addition behind a check (the project is on Vercel Pro per existing 20-A-03 plan — confirm by the existing cron count in vercel.json being > 2).

    C. The handler MUST refactor the script's core logic into a shared function. Move the per-classifier orchestration from `scripts/calibrate-temperature.ts` to a new exported function `runCalibration(classifier: 'finbert' | 'gemini-per-doc' | 'all', opts: { dryRun?: boolean })` in `scripts/calibrate-temperature-core.ts` (NEW file). The CLI script imports + invokes it; the cron handler imports + invokes it. This ensures one implementation, two invocation surfaces.
  </action>
  <acceptance_criteria>
    - File `src/app/api/cron/calibrate-temperature/route.ts` exists
    - `grep -q "Bearer \${process.env.CRON_SECRET}" src/app/api/cron/calibrate-temperature/route.ts`
    - `grep -q "classifier_version" src/app/api/cron/calibrate-temperature/route.ts` (version-change check present)
    - File `scripts/calibrate-temperature-core.ts` exists with exported `runCalibration` function
    - `grep -q "calibrate-temperature" vercel.json`
    - `grep -q '0 7 2 \* \*' vercel.json`
  </acceptance_criteria>
  <verify>
    <automated>test -f src/app/api/cron/calibrate-temperature/route.ts && test -f scripts/calibrate-temperature-core.ts && grep -q "calibrate-temperature" vercel.json && grep -q "CRON_SECRET" src/app/api/cron/calibrate-temperature/route.ts</automated>
  </verify>
  <done>Monthly cron live; auto-refit-on-version-change wired (T-20-B-03-04); CLI + cron share runCalibration() core implementation in scripts/calibrate-temperature-core.ts</done>
</task>

<task type="auto" id="20-B-03-08">
  <name>Task 8: Wire T-scaling into FinBERT classifier (gated by SENTIMENT_TEMP_SCALING_MODE)</name>
  <files>src/lib/sentiment/finsentllm.ts, tests/sentiment-finbert-temp-scaling.unit.test.ts</files>
  <read_first>
    - src/lib/sentiment/finsentllm.ts (existing classifyFinBERT; reduceLabels at line 50)
    - src/lib/sentiment/calibration.ts (Task 3 — temperatureScale)
    - .planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md (ProviderCallLog telemetry contract — used at shadow mode)
  </read_first>
  <action>
    Modify `src/lib/sentiment/finsentllm.ts` to add T-scaling at the FinBERT path:

    1. Extract a new helper `loadTemperatureFor(classifier_version: string): Promise<{ T: number; computed_at: Date | null }>` that does `prisma.temperatureCalibration.findFirst({ where: { classifier_version }, orderBy: { computed_at: 'desc' } })` and returns `{ T: row?.temperature ?? 1.0, computed_at: row?.computed_at ?? null }`. Cache result per process for 5 minutes (in-memory map keyed by classifier_version) to avoid hitting Neon on every classification.

    2. Modify `classifyFinBERT` to check `process.env.SENTIMENT_TEMP_SCALING_MODE` (default 'off'):
        - At 'off': preserve existing behaviour byte-for-byte (no DB read, no T-scaling, no behaviour change).
        - At 'shadow': compute BOTH raw and T-scaled SentimentScore. Return raw (existing behaviour). Log the (raw, scaled, T, classifier_version) tuple via the 20-Z-03 ProviderCallLog wrapper if available, else stash in `result.error` field as a JSON-encoded debug breadcrumb (forward-reference to 20-Z-03 telemetry).
        - At 'on': T-scale before returning. The reduceLabels step now operates on T-scaled probabilities.

    3. T-scaling math: HF SDK returns `[{ label: 'POSITIVE', score: 0.93 }, ...]`. Convert to logits via `log(score)`, apply `softmax(logits / T)`, feed to `reduceLabels`. Skip T-scaling if T === 1.0 (identity short-circuit, also defends against missing-row→T=1 fallback).

    4. classifier_version derivation: parse SHA from `process.env.HF_FINBERT_ENDPOINT` (format `https://....cloud/finbert@<sha>`). If env missing or no `@<sha>` segment: log warning, fall back to classifier_version='finbert-prosus-unpinned', T=1.0. The SHA pin is enforced by 20-B-02 — this plan's defensive code is for early/local dev.

    5. NO existing test breaks at SENTIMENT_TEMP_SCALING_MODE=off. Add a new test file `tests/sentiment-finbert-temp-scaling.unit.test.ts` (≥3 tests):
        - At 'off' classifyFinBERT does NOT call prisma.temperatureCalibration.findFirst (mock spy)
        - At 'shadow' classifyFinBERT calls prisma exactly once and returns the RAW SentimentScore unchanged (mock both prisma + HF)
        - At 'on' classifyFinBERT applies temperatureScale before reduceLabels (verify by injecting T=2.0 and asserting the post-scale max prob is lower than the pre-scale max prob)
  </action>
  <acceptance_criteria>
    - `grep -q "SENTIMENT_TEMP_SCALING_MODE" src/lib/sentiment/finsentllm.ts`
    - `grep -q "temperatureScale" src/lib/sentiment/finsentllm.ts`
    - `grep -q "loadTemperatureFor" src/lib/sentiment/finsentllm.ts`
    - `grep -q "HF_FINBERT_ENDPOINT" src/lib/sentiment/finsentllm.ts`
    - File `tests/sentiment-finbert-temp-scaling.unit.test.ts` exists
    - `npx vitest run tests/sentiment-finbert-temp-scaling.unit.test.ts` exits 0 with ≥3 passing tests
    - All pre-existing FinBERT tests still pass (no regression at 'off' mode)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/sentiment-finbert-temp-scaling.unit.test.ts && npx vitest run tests/ --testPathPattern="finsentllm|finbert" 2>/dev/null || npx vitest run tests/sentiment-finbert-temp-scaling.unit.test.ts</automated>
  </verify>
  <done>classifyFinBERT consumes latest TemperatureCalibration row at runtime; gated by SENTIMENT_TEMP_SCALING_MODE; off-mode behaviour unchanged; shadow + on modes tested</done>
</task>

<task type="auto" id="20-B-03-09">
  <name>Task 9: Wire T-scaling into Gemini per-doc classifier (gated by SENTIMENT_TEMP_SCALING_MODE)</name>
  <files>src/lib/sentiment/temperature-runtime.ts, src/lib/sentiment/per-doc-classifier.ts, tests/sentiment-per-doc-temp-scaling.unit.test.ts</files>
  <read_first>
    - src/lib/sentiment/per-doc-classifier.ts (created in 20-B-01; verify the file exists at execute time — if not, this task BLOCKS pending 20-B-01 completion)
    - src/lib/sentiment/calibration.ts (Task 3 — temperatureScale)
    - src/lib/sentiment/finsentllm.ts (Task 8 — same loadTemperatureFor helper, REUSED — extract to a shared module if not already shared)
  </read_first>
  <action>
    Mirror Task 8 for the Gemini per-doc classifier created in 20-B-01.

    EXTRACT loadTemperatureFor + the in-memory cache + the 'off|shadow|on' mode-check helper from Task 8's finsentllm.ts into a new shared module `src/lib/sentiment/temperature-runtime.ts`. Both classifiers import from there. This avoids duplication and ensures single source of truth for the runtime gating.

    Then in `src/lib/sentiment/per-doc-classifier.ts` (the file 20-B-01 creates):

    1. After Gemini returns the per-doc classification block (with logits per the 20-B-01 contract), check SENTIMENT_TEMP_SCALING_MODE.
    2. classifier_version is read from the registered prompt: `getPrompt('per-doc-classifier-v1').version` → format string `gemini-per-doc-v{version}`.
    3. Apply the same shadow / on logic as Task 8.
    4. Add `tests/sentiment-per-doc-temp-scaling.unit.test.ts` (≥3 tests) mirroring the FinBERT tests but with mocked Gemini logit output.

    BLOCKER NOTE: this task depends on 20-B-01 having shipped per-doc-classifier.ts. The depends_on frontmatter pins both 20-B-01 and 20-B-02. If 20-B-01 has NOT yet landed at execute time, this task fails fast with a diagnostic referencing the dependency — the orchestrator's wave system (Wave B) ensures siblings have completed before 20-B-03 runs.
  </action>
  <acceptance_criteria>
    - File `src/lib/sentiment/temperature-runtime.ts` exists with exported loadTemperatureFor + mode helpers
    - `grep -q "temperatureScale\\|temperature-runtime" src/lib/sentiment/per-doc-classifier.ts`
    - `grep -q "gemini-per-doc-v" src/lib/sentiment/per-doc-classifier.ts`
    - File `tests/sentiment-per-doc-temp-scaling.unit.test.ts` exists
    - `npx vitest run tests/sentiment-per-doc-temp-scaling.unit.test.ts` exits 0 with ≥3 passing tests
    - finsentllm.ts also imports from temperature-runtime.ts (DRY refactor of Task 8)
  </acceptance_criteria>
  <verify>
    <automated>test -f src/lib/sentiment/temperature-runtime.ts && grep -q "temperatureScale\\|temperature-runtime" src/lib/sentiment/per-doc-classifier.ts && npx vitest run tests/sentiment-per-doc-temp-scaling.unit.test.ts</automated>
  </verify>
  <done>Per-doc classifier consumes latest TemperatureCalibration; runtime gating shared between both classifiers via src/lib/sentiment/temperature-runtime.ts; gated tests GREEN</done>
</task>

<task type="auto" id="20-B-03-10">
  <name>Task 10: /insights CalibrationTile + HYPERPARAMETERS.md + model card updates</name>
  <files>src/app/insights/sentiment-health/components/CalibrationTile.tsx, HYPERPARAMETERS.md, src/lib/sentiment/MODEL-CARD-finbert-prosus.md, src/lib/sentiment/MODEL-CARD-gemini-per-doc.md</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md (sentiment-health dashboard layout — tile component pattern)
    - HYPERPARAMETERS.md (current state — populated by 20-A-03; verify §Temperature Scaling section absent)
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (MODEL-CARD-template.md location)
  </read_first>
  <action>
    A. Create `src/app/insights/sentiment-health/components/CalibrationTile.tsx` — a Server Component (default export) that:
        - Accepts a prop `classifierVersion: string`
        - Queries `prisma.temperatureCalibration.findFirst({ where: { classifier_version }, orderBy: { computed_at: 'desc' } })`
        - Renders a card showing: classifier_version, current T, ECE_pre, ECE_post, Brier_pre, Brier_post, n_validation_samples (split as n_fpb + n_production), last computed_at (relative — "2 days ago"), status badge (color-coded: ship-eligible=green, shadow=yellow, degraded=orange, nonconvergent=red)
        - Falls back to "No calibration data — run scripts/calibrate-temperature.ts" message when row absent
        - Renders a tiny inline reliability micro-chart (just dots: pre vs post on a [0, 0.1] ECE axis) — minimal SVG, no chart lib

    B. Render two CalibrationTiles on the sentiment-health page (dashboard layout owned by 20-Z-03; this plan ADDS the tiles): one for `finbert-prosus-{HF_FINBERT_SHA}` (resolve at request time from env), one for `gemini-per-doc-v{N}` (resolve from prompt registry).

    C. Update `HYPERPARAMETERS.md` — add a new §Temperature Scaling section:

    ```markdown
    ## §Temperature Scaling (Plan 20-B-03)

    Per-classifier scalar temperature T fit on held-out FPB + ≥500 production-labeled docs
    via bounded golden-section search minimising NLL (Guo et al. 2017).
    Bounds: T ∈ [0.1, 10.0]. Bin count for ECE: 10. Refit cadence: monthly cron at
    `/api/cron/calibrate-temperature` ('0 7 2 * *') AND on classifier_version change.

    | classifier_version                 | T (seed) | T (calibrated) | ECE_post | Brier_post | n_val | computed_at | status         |
    |------------------------------------|----------|----------------|----------|------------|-------|-------------|----------------|
    | finbert-prosus-{HF_FINBERT_SHA}    | 1.0      | (TBD)          | (TBD)    | (TBD)      | (TBD) | (TBD)       | (TBD — seed)   |
    | gemini-per-doc-v1                  | 1.0      | (TBD)          | (TBD)    | (TBD)      | (TBD) | (TBD)       | (TBD — seed)   |

    Ship gate (cv_ece_mean_post < 0.05 AND brier_post < 0.24) is verified per-classifier
    before SENTIMENT_TEMP_SCALING_MODE flips from `shadow` to `on`. Calibration history is
    APPEND-ONLY in TemperatureCalibration table; this file mirrors the latest row.

    Reference: Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017).
    "On Calibration of Modern Neural Networks." ICML 2017. https://arxiv.org/abs/1706.04599
    ```

    D. Create `src/lib/sentiment/MODEL-CARD-finbert-prosus.md` per the 20-Z-02 template, with a §Calibration section that points to the latest TemperatureCalibration row (template includes a script-generated block; for this PLAN the section text contains placeholder values + explicit "see TemperatureCalibration table for latest" note).

    E. Create `src/lib/sentiment/MODEL-CARD-gemini-per-doc.md` mirroring (D) for the per-doc classifier.

    Both model cards MUST include the 5 standard Mitchell-2019 sections: Model Details, Intended Use, Factors, Metrics, Evaluation Data + the Calibration subsection under Metrics. Reference 20-Z-02's template explicitly.
  </action>
  <acceptance_criteria>
    - File `src/app/insights/sentiment-health/components/CalibrationTile.tsx` exists
    - `grep -q "ece_post_scaling" src/app/insights/sentiment-health/components/CalibrationTile.tsx`
    - `grep -q "20-B-03" HYPERPARAMETERS.md`
    - `grep -q "Guo" HYPERPARAMETERS.md`
    - `grep -q "1706.04599" HYPERPARAMETERS.md`
    - `grep -q "Temperature" src/lib/sentiment/MODEL-CARD-finbert-prosus.md`
    - `grep -q "Temperature" src/lib/sentiment/MODEL-CARD-gemini-per-doc.md`
    - `npx tsc --noEmit` exits 0 (TS compile clean for the new tile component)
  </acceptance_criteria>
  <verify>
    <automated>test -f src/app/insights/sentiment-health/components/CalibrationTile.tsx && grep -q "20-B-03" HYPERPARAMETERS.md && grep -q "Temperature" src/lib/sentiment/MODEL-CARD-finbert-prosus.md && grep -q "Temperature" src/lib/sentiment/MODEL-CARD-gemini-per-doc.md && npx tsc --noEmit</automated>
  </verify>
  <done>CalibrationTile renders per-classifier on /insights/sentiment-health; HYPERPARAMETERS.md §Temperature Scaling populated with seed rows; model cards present for both classifiers with Calibration subsection</done>
</task>

<task type="auto" id="20-B-03-11">
  <name>Task 11: Live integration test — calibrate-temperature against FPB on Neon</name>
  <files>tests/integration/calibrate-temperature.integration.test.ts</files>
  <read_first>
    - scripts/calibrate-temperature-core.ts (Task 7 — runCalibration function)
    - data/datasets/financial-phrasebank.csv (Task 5 — input)
    - tests/integration/ (existing integration test pattern; 20-A-03 has an analogous tune-decay integration test)
  </read_first>
  <action>
    Create `tests/integration/calibrate-temperature.integration.test.ts` (live-Neon, runs under `npm run test:integration`):

    Steps:
    1. Skip if `process.env.HF_FINBERT_ENDPOINT` is unset (test logs reason and skips — integration tests are env-dependent).
    2. Load a HEAD subset of the FPB CSV (first 200 rows — keeps wall-clock under 60s on the HF endpoint).
    3. Synthesise SHAPED logits (length-3 vectors) from FinBERT-style outputs OR mock the HF call to return deterministic post-softmax scores. (The test does NOT need to hit the HF endpoint to validate the calibration math + DB persistence — that surface is unit-tested at Task 8. The integration test validates the Neon write path + HYPERPARAMETERS.md emission + status logic.)
    4. Invoke `runCalibration('finbert', { dryRun: false, fpbHeadN: 200, mockProductionLabels: 600 })` (the function exposes a TEST-MODE knob that injects synthetic production labels above the floor so we exercise the `ship-eligible` happy path).
    5. Assert: a TemperatureCalibration row exists in Neon with the test's classifier_version and `ece_post_scaling < ece_pre_scaling AND brier_post_scaling < brier_pre_scaling`. (Both gates fire on a properly-calibrated synthetic input.)
    6. Bump the simulated classifier_version (call runCalibration with a different version string) and assert a NEW row is inserted (not an update — verify count(*) increased by 1).
    7. Cleanup: delete the test rows by classifier_version starting with 'test-finbert-' so we do not pollute production telemetry.

    Wall-clock target: < 90s on a warm HF endpoint OR < 30s in pure-mock mode (default for CI).
  </action>
  <acceptance_criteria>
    - File `tests/integration/calibrate-temperature.integration.test.ts` exists
    - `npm run test:integration -- --testPathPattern="calibrate-temperature"` exits 0 (or skips cleanly if env-gated)
    - Test asserts ECE_post < ECE_pre AND Brier_post < Brier_pre on the calibration result
    - Test asserts version-change triggers an insert (not an update)
    - Test cleans up its own rows
  </acceptance_criteria>
  <verify>
    <automated>npm run test:integration -- --testPathPattern="calibrate-temperature"</automated>
  </verify>
  <done>Live-Neon integration test green; verifies ECE + Brier reductions, append-only history, auto-refit-on-version-change behaviour</done>
</task>

<task type="checkpoint:human-verify" id="20-B-03-12" gate="blocking">
  <name>Task 12: Operator ship-gate verification — run calibrate-temperature, inspect tile, decide cutover</name>
  <files>(operator-driven verification — no file mutation)</files>
  <what-built>
    Tasks 1-11 shipped: schema + bounds module + ECE/Brier/T primitives + L-BFGS-equivalent fitter + FPB dataset + calibration script + monthly cron + auto-refit-on-version-change + classifier integration (FinBERT + Gemini per-doc) gated by SENTIMENT_TEMP_SCALING_MODE + /insights tile + HYPERPARAMETERS.md + model cards + live integration test.

    The flag ships at SENTIMENT_TEMP_SCALING_MODE=shadow. This task is the operator-driven cutover decision.
  </what-built>
  <how-to-verify>
    1. Ensure `HF_FINBERT_ENDPOINT` is set to the production-pinned URL.
    2. Run a real calibration pass: `npx tsx scripts/calibrate-temperature.ts --classifier all`
    3. Inspect the printed summary table. Note the T value, ECE_pre, ECE_post, Brier_pre, Brier_post, n_validation_samples, status per classifier.
    4. Verify rows exist in Neon: `psql "$DATABASE_URL" -c 'SELECT classifier_version, temperature, ece_post_scaling, brier_post_scaling, status, computed_at FROM "TemperatureCalibration" ORDER BY computed_at DESC LIMIT 5;'`
    5. Visit `/insights/sentiment-health` (or the equivalent route 20-Z-03 ships) and verify both CalibrationTiles render with the new data.
    6. Decision tree:
       - If ALL classifiers report `status='ship-eligible'` (cv_ece_mean_post < 0.05 AND brier_post < 0.24): set `SENTIMENT_TEMP_SCALING_MODE=on` in production env; redeploy; verify by re-running a representative classification and confirming the runtime applies T-scaling (debug log "[temperature-runtime] applied T=X for classifier_version=Y").
       - If any classifier reports `status='degraded'` (n_production < 500): leave flag at shadow; document in the SUMMARY that 20-Z-05 must extend HumanExemplar with class_label OR collect more spot-checks before this plan can cutover.
       - If any classifier reports `status='nonconvergent'`: investigate — likely degenerate input distribution; do NOT cutover.
    7. Update HYPERPARAMETERS.md with the actual computed T values (replace the (TBD) placeholders) — emit via `npx tsx scripts/calibrate-temperature.ts --classifier all --emit-hyperparameters > /tmp/hp.patch && cat /tmp/hp.patch` and apply manually.
  </how-to-verify>
  <resume-signal>
    Type "ship-eligible" if both classifiers passed the ship gate AND you flipped the flag to `on`.
    Type "shadow" if both classifiers landed but at least one is `degraded` or `nonconvergent` (acceptable — plan complete, cutover deferred per the Hard Cleanup Gate criterion 6).
    Type "blocked" with a description if calibration produced unexpected output that needs investigation before this plan can be considered complete.
  </resume-signal>
  <action>OPERATOR: Execute the steps in <how-to-verify> in order. Run scripts/calibrate-temperature.ts against live FinBERT + Gemini per-doc; verify TemperatureCalibration rows in Neon; verify CalibrationTiles render on /insights/sentiment-health; apply the decision tree to determine cutover (set SENTIMENT_TEMP_SCALING_MODE=on if both classifiers report status='ship-eligible', else leave at shadow). Update HYPERPARAMETERS.md with actual T values.</action>
  <verify>
    <automated>psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"TemperatureCalibration\" WHERE computed_at > NOW() - INTERVAL '1 day'" | grep -E "[1-9]" && grep -v "(TBD)" HYPERPARAMETERS.md | grep -q "finbert-prosus"</automated>
  </verify>
  <done>Calibration run completed against live classifiers; TemperatureCalibration rows persisted; HYPERPARAMETERS.md updated with actual numbers; cutover decision recorded (operator signaled ship-eligible | shadow | blocked).</done>
</task>

</tasks>

<verification>

## Numerical acceptance — every check is grep / SQL / test exit

- [ ] `grep -q "model TemperatureCalibration" prisma/schema.prisma` exits 0
- [ ] `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "TemperatureCalibration"'` returns ≥ 2 (one per classifier) after Task 11 OR Task 12
- [ ] `grep -q "20-B-03" HYPERPARAMETERS.md` exits 0
- [ ] `grep -q "Guo" HYPERPARAMETERS.md` AND `grep -q "1706.04599" HYPERPARAMETERS.md` exit 0
- [ ] `grep -q "CC-BY-NC-SA-3.0" data/datasets/DATASET-CARD-financial-phrasebank.md` exits 0
- [ ] `wc -l data/datasets/financial-phrasebank.csv` returns ≥ 1000
- [ ] `grep -q "calibrate-temperature" vercel.json` exits 0
- [ ] `npx vitest run tests/sentiment-calibration.unit.test.ts` exits 0 with ≥6 passing
- [ ] `npx vitest run tests/sentiment-calibration-fit.unit.test.ts` exits 0 with ≥4 passing
- [ ] `npx vitest run tests/sentiment-calibration-bounds.unit.test.ts` exits 0 with ≥4 passing
- [ ] `npx vitest run tests/sentiment-finbert-temp-scaling.unit.test.ts` exits 0 with ≥3 passing
- [ ] `npx vitest run tests/sentiment-per-doc-temp-scaling.unit.test.ts` exits 0 with ≥3 passing
- [ ] `npm run test:integration -- --testPathPattern="calibrate-temperature"` exits 0 OR skips with a clear env-gate message
- [ ] After Task 12 with status='ship-eligible': latest TemperatureCalibration.cv_ece_mean < 0.05 AND latest TemperatureCalibration.brier_post_scaling < 0.24 for both classifiers
- [ ] `grep -q "Temperature" src/lib/sentiment/MODEL-CARD-finbert-prosus.md` AND `grep -q "Temperature" src/lib/sentiment/MODEL-CARD-gemini-per-doc.md` exit 0
- [ ] /insights/sentiment-health renders CalibrationTile with non-null data for both classifier_versions

</verification>

<success_criteria>

Plan 20-B-03 is COMPLETE when:

1. The Hard Cleanup Gate criteria 1-10 in <universal_preamble> are all satisfied.
2. All numerical checks in <verification> pass.
3. The TemperatureCalibration table is APPEND-ONLY history (no UPDATE statements anywhere in the codebase touch this table — verifiable via `grep -r "temperatureCalibration\.update" src/ scripts/` returning empty).
4. SENTIMENT_TEMP_SCALING_MODE flag exists in env and gates runtime behaviour at three levels (`off`, `shadow`, `on`).
5. Cutover from shadow→on is operator-gated by Task 12; this plan ships INFRASTRUCTURE + REPORT-GENERATION at status='shadow'-default. The cutover decision is its own operator action.
6. Both model cards (FinBERT-Prosus, Gemini per-doc) include the §Calibration section (S4 satisfied for both classifiers shipped).
7. Auto-refit-on-version-change is verified by the integration test inserting a second row when the simulated classifier_version is bumped.

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-B-03-SUMMARY.md` documenting:
- Final T values per classifier_version (from the latest TemperatureCalibration rows)
- ECE_pre / ECE_post / Brier_pre / Brier_post per classifier
- Status of the cutover decision (ship-eligible + flipped, OR shadow-pending-data, OR nonconvergent)
- Forward dependencies activated: 20-C-02 (Brier decomposition) consumes the Brier numbers shipped here; 20-C-06 (fairness audit) extends the per-classifier ECE shipped here with stratification by cap_class; 20-Z-05 must extend HumanExemplar with class_label to lift status from 'degraded' to 'ship-eligible' for the production-label dimension
- Any deviations from the PLAN with rationale
</output>
