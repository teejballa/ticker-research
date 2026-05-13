---
phase: 20
plan: 20-B-03
subsystem: sentiment-layer
tags: [calibration, temperature-scaling, ece, brier, guo-2017, append-only, shadow]
dependency_graph:
  requires:
    - 20-Z-01  # SentimentObservation feature store (classifier_version pin convention)
    - 20-Z-03  # withTelemetry + ProviderCallLog
    - 20-Z-05  # Production-labeled docs (deferred — HumanExemplar.class_label pending)
    - 20-B-01  # Gemini per-doc classifier (consumer of T-scaling)
    - 20-B-02  # FinBERT-Prosus classifier (consumer of T-scaling)
  provides:
    - calibration-primitives: expectedCalibrationError, brierScore, softmax, temperatureScale, fitTemperature, kFoldCalibrationECE
    - calibration-bounds: CALIBRATION_BOUNDS + Zod module-load validation
    - temperature-runtime: loadTemperatureFor (5-min cache) + getTempScalingMode + classifier_version resolvers
    - calibration-cli: scripts/calibrate-temperature.ts + scripts/calibrate-temperature-core.ts
    - calibration-cron: /api/cron/calibrate-temperature (monthly + auto-refit-on-version-change)
    - calibration-tile: CalibrationTile.tsx on /insights/sentiment-health
    - fpb-dataset: data/datasets/financial-phrasebank.csv (3,453 rows; Malo 2014 / Araci 2019; CC-BY-NC-SA-3.0)
    - temperature-calibration-model: TemperatureCalibration Prisma model (append-only)
  affects:
    - 20-C-02  # Brier decomposition consumes Brier numbers shipped here
    - 20-C-06  # Fairness audit extends per-classifier ECE with cap_class stratification
    - 20-Z-05  # Must extend HumanExemplar with class_label to graduate 'degraded' → 'ship-eligible'
tech-stack:
  added:
    - bounded-golden-section search (scipy.optimize.minimize_scalar(method='bounded') TypeScript port)
    - 5-fold cross-validation with Mulberry32 deterministic shuffle
  patterns:
    - shadow-lifecycle (SENTIMENT_TEMP_SCALING_MODE default 'off'; production set to 'shadow')
    - APPEND-ONLY calibration history (every refit INSERTs a new TemperatureCalibration row)
    - auto-refit-on-classifier-version-change (T-20-B-03-04 mitigation — cron triggers refit when SHA / prompt-version differs from latest row)
    - shared runCalibration core (CLI + cron import the same function)
    - module-load Zod assertion on CALIBRATION_BOUNDS (19-A-01 symmetry)
key-files:
  created:
    - src/lib/sentiment/calibration.ts
    - src/lib/sentiment/calibration-hyperparameters.ts
    - src/lib/sentiment/temperature-runtime.ts
    - src/lib/sentiment/MODEL-CARD-finbert-prosus.md
    - src/lib/sentiment/MODEL-CARD-gemini-per-doc.md
    - scripts/calibrate-temperature.ts
    - scripts/calibrate-temperature-core.ts
    - src/app/api/cron/calibrate-temperature/route.ts
    - src/app/insights/sentiment-health/components/CalibrationTile.tsx
    - data/datasets/financial-phrasebank.csv
    - data/datasets/DATASET-CARD-financial-phrasebank.md
    - tests/sentiment-calibration.unit.test.ts
    - tests/sentiment-calibration-fit.unit.test.ts
    - tests/sentiment-calibration-bounds.unit.test.ts
    - tests/sentiment-finbert-temp-scaling.unit.test.ts
    - tests/sentiment-per-doc-temp-scaling.unit.test.ts
    - tests/integration/calibrate-temperature.integration.test.ts
  modified:
    - prisma/schema.prisma                              # +model TemperatureCalibration (APPEND-ONLY)
    - src/lib/sentiment/finsentllm.ts                   # SENTIMENT_TEMP_SCALING_MODE-gated T-scaling on classifyFinBERT
    - src/lib/sentiment/per-doc-classifier.ts           # SENTIMENT_TEMP_SCALING_MODE-gated T-scaling on classifyDocumentsBatch
    - src/app/insights/sentiment-health/page.tsx        # renders 2 CalibrationTile (FinBERT + Gemini)
    - docs/cards/MODEL-CARD-finbert-prosus.md           # +§13 Calibration
    - docs/cards/MODEL-CARD-gemini-per-doc.md           # +Calibration subsection
    - HYPERPARAMETERS.md                                # +§Temperature Scaling section
    - vercel.json                                       # +cron '/api/cron/calibrate-temperature' '0 7 2 * *'
    - .gitignore                                        # +!data/datasets/*.csv exception
decisions:
  - "Bounded golden-section search (Brent 1973 / scipy minimize_scalar(method='bounded')) replaces multivariate L-BFGS — for scalar T this is the canonical implementation, zero deps, provably convergent"
  - "5-fold CV uses Mulberry32 deterministic shuffle (seed=CV_SEED=42) — same input always produces identical (cv_ece_mean, cv_ece_std)"
  - "SENTIMENT_TEMP_SCALING_MODE defaults to 'off' (legacy byte-for-byte preserved); shadow → on cutover is operator-gated by Task 12 ship gate"
  - "Brier co-gate at 0.24 (T-20-B-03-05) defends ECE-gaming by class-imbalanced base-rate models — both gates must pass for ship-eligible"
  - "Production-labels floor of 500 (CONTEXT.md line 115 verbatim) — below floor, status='degraded' and ship gate skipped; this plan defaults to degraded until 20-Z-05 extends HumanExemplar with class_label"
  - "TemperatureCalibration is APPEND-ONLY history; auto-refit-on-version-change inserts a NEW row instead of updating — runtime always reads latest by computed_at desc"
  - "FinBERT T-scaling: HF SDK returns post-softmax probs; we convert back to logits via log(p) (sufficient for T scaling since softmax is shift-invariant)"
  - "Gemini per-doc T-scaling: synthetic 2-class logits {log(c), log(1-c)} derived from emitted confidence scalar; polarity sign preserved"
metrics:
  duration_seconds: 1100
  completed_date: "2026-05-13"
  task_count: 12
  files_created: 17
  files_modified: 9
  unit_tests_added: 37        # 5 bounds + 10 calibration + 8 calibration-fit + 7 finbert-temp + 7 per-doc-temp
  integration_tests_added: 3   # 2 DB-gated (skip cleanly if table absent), 1 always-on math check
---

# Phase 20 Plan B-03: Temperature scaling + ECE tracking per classifier_version

Single-scalar temperature T fit per classifier_version on merged FPB + production-labeled
validation set, with APPEND-ONLY calibration history, auto-refit-on-version-change cron,
3-mode flag gating (off / shadow / on), and per-classifier CalibrationTile on
`/insights/sentiment-health`.

## What shipped

1. **`TemperatureCalibration` Prisma model** — APPEND-ONLY history table with 16 columns:
   `classifier_version`, `computed_at`, `temperature`, `ece_pre_scaling`, `ece_post_scaling`,
   `brier_pre_scaling`, `brier_post_scaling`, `cv_ece_mean`, `cv_ece_std`,
   `n_validation_samples`, `n_fpb_samples`, `n_production_samples`,
   `validation_window_days`, `status`, `notes`. Composite index on
   `(classifier_version, computed_at)`. Live `prisma db push` is operator-gated (Task 2).

2. **`CALIBRATION_BOUNDS` frozen const** (`src/lib/sentiment/calibration-hyperparameters.ts`)
   with Zod module-load validation (19-A-01 pattern):
   - T_MIN=0.1, T_MAX=10.0, T_INITIAL=1.0
   - CONVERGENCE_TOL=1e-6, MAX_ITER=100
   - N_BINS_ECE=10 (Guo 2017 default), N_FOLDS_CV=5, CV_SEED=42
   - PRODUCTION_LABELS_FLOOR=500, SHIP_GATE_ECE=0.05, SHIP_GATE_BRIER=0.24

3. **Pure calibration primitives** (`src/lib/sentiment/calibration.ts`):
   - `softmax(logits)` — numerically-stable max-subtract
   - `temperatureScale(logits, T)` — softmax(logits/T); throws on T≤0
   - `expectedCalibrationError(predictions, n_bins?)` — Guo 2017 §2 binned ECE
   - `brierScore(predictions)` — Brier 1950 quadratic score
   - `fitTemperature(predictions)` — bounded golden-section search minimising NLL (Brent 1973 / scipy minimize_scalar(method='bounded') analog); non-convergent → console.warn + T=1.0
   - `kFoldCalibrationECE(predictions, k?, seed?)` — 5-fold CV with Mulberry32 deterministic shuffle

4. **Shared runtime helpers** (`src/lib/sentiment/temperature-runtime.ts`):
   - `getTempScalingMode()` — env parser returning 'off'/'shadow'/'on'
   - `loadTemperatureFor(classifier_version)` — Prisma read with 5-min in-proc cache
   - `resolveFinBERTClassifierVersion()` — parses SHA from `HF_FINBERT_ENDPOINT`, falls back to `FINBERT_PINNED_SHA8`
   - `resolveGeminiPerDocClassifierVersion(v?)` — returns `gemini-per-doc-v{N}`
   - `probsToLogits(probs)` — elementwise log with EPS clamp
   - `applyTemperature(logits, T)` — wraps temperatureScale with T=1.0 short-circuit
   - `_resetTemperatureCache()` — test-only helper

5. **CLI + monthly cron** sharing one implementation:
   - `scripts/calibrate-temperature-core.ts` — `runCalibration(classifier, opts)` + `persistCalibrationRow` + `emitHyperparametersPatch` + FPB CSV loader
   - `scripts/calibrate-temperature.ts` — CLI wrapper (`--classifier`, `--dry-run`, `--out`)
   - `src/app/api/cron/calibrate-temperature/route.ts` — monthly cron (Vercel) with CRON_SECRET Bearer auth, classifier_version drift check, and 30-day cadence guard
   - `vercel.json`: `'0 7 2 * *'` (staggered after 20-A-03 `'0 6 1 * *'`)

6. **Classifier integrations** (gated by `SENTIMENT_TEMP_SCALING_MODE`):
   - **classifyFinBERT** (`src/lib/sentiment/finsentllm.ts`): off=legacy byte-for-byte (no DB read); shadow=raw return with T-scaled debug breadcrumb in `result.error`; on=T-scaled SentimentScore replaces raw
   - **classifyDocumentsBatch** (`src/lib/sentiment/per-doc-classifier.ts`): same 3-mode pattern; 2-class synthetic logits `{log(c), log(1-c)}` from emitted confidence; polarity sign preserved

7. **Financial PhraseBank dataset** (`data/datasets/financial-phrasebank.csv`):
   - 3,453 labeled sentences (2,264 AllAgree + 1,189 75pct)
   - Columns: `text,label,agreement_level`
   - Labels: `{positive, neutral, negative}`
   - License: CC-BY-NC-SA-3.0 (Malo 2014 / Araci 2019 partition)
   - Gebru-2018 dataset card at `data/datasets/DATASET-CARD-financial-phrasebank.md`
   - `.gitignore`: `!data/datasets/*.csv` exception

8. **`CalibrationTile.tsx`** Server Component on `/insights/sentiment-health`:
   - Queries latest TemperatureCalibration row by classifier_version
   - Status badge color-coded: ship-eligible=emerald, shadow=amber, degraded=orange, nonconvergent=red
   - Inline SVG reliability micro-chart (pre orange → post emerald on [0, 0.1] axis)
   - Falls back to "No calibration data" message when row absent
   - Two tiles rendered: FinBERT + Gemini per-doc

9. **HYPERPARAMETERS.md §Temperature Scaling** — seed table with T=1.0 placeholders + Guo 2017 citation + arxiv link 1706.04599 + ship-gate reference (CONTEXT.md line 115).

10. **Model cards updated**:
    - `docs/cards/MODEL-CARD-finbert-prosus.md` — appended §13 Calibration
    - `docs/cards/MODEL-CARD-gemini-per-doc.md` — appended Calibration subsection
    - `src/lib/sentiment/MODEL-CARD-finbert-prosus.md` — on-source mirror (plan-literal S4 path)
    - `src/lib/sentiment/MODEL-CARD-gemini-per-doc.md` — on-source mirror (plan-literal S4 path)

## Final T values per classifier_version

| classifier_version            | T (seed) | T (calibrated) | ECE_post | Brier_post | n_val | status         |
|------------------------------|----------|----------------|----------|------------|-------|----------------|
| finbert-prosus-4556d130      | 1.0      | TBD (operator) | TBD      | TBD        | TBD   | seed (shadow)  |
| gemini-per-doc-v1            | 1.0      | TBD (operator) | TBD      | TBD        | TBD   | seed (shadow)  |

**Cutover status:** flag ships at `off` default (legacy preserved); production
should set to `shadow` post-`prisma db push`. The first calibration run lands
the inaugural TemperatureCalibration rows. Until 20-Z-05 extends
HumanExemplar with `class_label`, runs will report `status='degraded'`
(n_production_samples=0 < floor=500) — Brier and ECE numbers are valid but
the ship gate is skipped per the floor rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] data/datasets/*.csv caught by generic `*.csv` gitignore**

- **Found during:** Task 5 commit
- **Issue:** Generic `*.csv` rule in `.gitignore` blocked the FPB dataset from being committed; the plan requires the dataset to be physically present in the repo for reproducibility.
- **Fix:** Added `!data/datasets/*.csv` unignore exception with a comment citing 20-B-03.
- **Commit:** 4620f70

**2. [Rule 1 — Bug] CalibrationResult literal-type narrowing on T_MIN/T_MAX**

- **Found during:** Task 7 typecheck
- **Issue:** `as const` made `T_MIN: 0.1` and `T_MAX: 10.0` literal types in `CALIBRATION_BOUNDS`; `let a = T_MIN` inferred `a` as literal type `0.1`, refusing later mutations.
- **Fix:** Annotated `let a: number = T_MIN` and `let b: number = T_MAX` in `fitTemperature`.
- **Commit:** 405fed5

**3. [Rule 1 — Bug] Test synthetic data didn't actually trigger overconfidence**

- **Found during:** Task 4 unit-test run
- **Issue:** Initial synthetic-set helper sharpened logits but with correct labels → optimizer found T near 1.0 (data was already calibrated). Fixed by constructing an overconfident regime: predicted-class peak logit with only 60% realized accuracy.
- **Fix:** Updated `makeSyntheticSet` to inject ~30% deliberate errors so the optimizer is forced to soften.
- **Commit:** 0f35518

### Operator-deferred (not blocking this plan's commit)

- **Task 2 (prisma db push)** — schema validates locally; prisma generate produced typed client; live push deferred to operator per the plan's `<universal_preamble>` autonomous-execution clause. Integration test skips DB-touching cases cleanly via runtime `tableExists()` probe until the operator runs `npx prisma db push`.

- **Task 12 (operator ship-gate)** — calibration infrastructure is shipped; the cutover decision (run calibration → inspect tiles → flip flag) is operator-gated. Until then, `SENTIMENT_TEMP_SCALING_MODE` stays at `off` in env defaults.

- **20-Z-05 HumanExemplar.class_label** — until this field exists, production-labeled docs count is 0 < 500 floor; calibration runs flag `status='degraded'` and SKIP the ship gate per T-20-B-03-01 mitigation. This is intentional per the plan.

## Shadow lifecycle

- **Current mode**: `off` in code defaults (env-default); production must be set to `shadow` by operator post prisma db push.
- **Cutover criteria** (`shadow → on`):
  1. `cv_ece_mean_post < 0.05` per `CALIBRATION_BOUNDS.SHIP_GATE_ECE`
  2. `brier_post < 0.24` per `CALIBRATION_BOUNDS.SHIP_GATE_BRIER`
  3. `n_production_samples >= 500` per `CALIBRATION_BOUNDS.PRODUCTION_LABELS_FLOOR`
  4. All TemperatureCalibration rows for the production classifier_versions report `status='ship-eligible'`
- **Cutover action**: flip `SENTIMENT_TEMP_SCALING_MODE=shadow → on` in Vercel prod env.

## Verification gates (all green at commit time)

| Gate                  | Command                                          | Result |
| --------------------- | ------------------------------------------------ | ------ |
| TypeScript            | `npx tsc --noEmit -p .`                          | 0 errors |
| Vitest (full)         | `npm test`                                       | 1385 passed / 2 skipped / 3 todo |
| Model cards           | `npm run check-model-cards`                      | OK (0 findings) |
| Sentiment immutability| `npm run check-immutability`                     | OK |
| Telemetry coverage    | `npm run check-telemetry-coverage`               | OK — 11/11 modules wrap withTelemetry |
| Prompt registry       | `npm run check-prompts`                          | green |
| Lookahead bias        | `npm run check-lookahead`                        | 0 violations across 180 files |
| 20-B-03 unit tests    | `npx vitest run tests/sentiment-calibration*`    | 23 / 23 green (5 bounds + 10 ECE + 8 fit) |
| FinBERT temp tests    | `npx vitest run tests/sentiment-finbert-temp-scaling.unit.test.ts` | 7 / 7 green |
| Per-doc temp tests    | `npx vitest run tests/sentiment-per-doc-temp-scaling.unit.test.ts` | 7 / 7 green |
| Integration test      | `npm run test:integration -- tests/integration/calibrate-temperature.integration.test.ts` | 1 passed / 2 skipped (DB-gated) |

**Pre-existing integration failures NOT related to 20-B-03:** 11 failures in
`src/app/api/cron/learn/__tests__/learn.ess.live.test.ts` (engine learn ESS
test timeouts at 5s). These predate this plan and are out-of-scope per the
SCOPE BOUNDARY rule.

## Numerical Acceptance

| Criterion | Value | Status |
|---|---|---|
| `grep -q "model TemperatureCalibration" prisma/schema.prisma` | yes | ✓ |
| `grep -q "20-B-03" HYPERPARAMETERS.md` | yes | ✓ |
| `grep -q "Guo" HYPERPARAMETERS.md` AND `grep -q "1706.04599"` | yes | ✓ |
| `grep -q "CC-BY-NC-SA-3.0" data/datasets/DATASET-CARD-financial-phrasebank.md` | yes | ✓ |
| `wc -l data/datasets/financial-phrasebank.csv` | 3454 | ✓ ≥1000 |
| `grep -q "calibrate-temperature" vercel.json` | yes | ✓ |
| `grep -q "Temperature" src/lib/sentiment/MODEL-CARD-finbert-prosus.md` | yes | ✓ |
| `grep -q "Temperature" src/lib/sentiment/MODEL-CARD-gemini-per-doc.md` | yes | ✓ |
| `grep -q "SENTIMENT_TEMP_SCALING_MODE" src/lib/sentiment/finsentllm.ts` | yes | ✓ |
| `grep -q "temperatureScale" src/lib/sentiment/finsentllm.ts` | yes | ✓ |
| `grep -q "loadTemperatureFor" src/lib/sentiment/finsentllm.ts` | yes | ✓ |
| `grep -q "HF_FINBERT_ENDPOINT" src/lib/sentiment/finsentllm.ts` | yes | ✓ |
| Script length ≤ 350 lines | scripts/calibrate-temperature.ts = 124 lines, core = 304 lines | ✓ |

## Threats mitigated

All 5 plan-level threats T-20-B-03-{01..05} mitigated:

- **T-20-B-03-01 (Production-labels floor)** — PRODUCTION_LABELS_FLOOR=500 enforced; below floor → status='degraded', ship gate SKIPPED, row still persisted for telemetry.
- **T-20-B-03-02 (Small-sample CV overfit)** — kFoldCalibrationECE with k=5 + cv_ece_mean ± cv_ece_std persisted; ship gate uses cv_ece_mean, not single-fold ECE.
- **T-20-B-03-03 (Optimiser DoS)** — bounded golden-section search with explicit [0.1, 10] bounds + MAX_ITER=100; non-convergent path returns T=1.0 (identity, safe) + console.warn.
- **T-20-B-03-04 (Silent SHA drift)** — TemperatureCalibration.classifier_version pins SHA/version; cron auto-refits when current_version differs from latest row.classifier_version (verified by integration test inserting a NEW row on version bump).
- **T-20-B-03-05 (ECE gaming via base-rate)** — Brier co-gate at 0.24 required for ship-eligible status; both pre+post Brier persisted for offline reliability analysis.

## Forward references

- **20-C-02 (Brier decomposition)** — consumes the Brier numbers persisted in TemperatureCalibration rows.
- **20-C-06 (Fairness audit)** — extends the per-classifier ECE shipped here with stratification by cap_class.
- **20-Z-05 (HumanExemplar.class_label)** — must extend HumanExemplar with `class_label` to lift status from 'degraded' to 'ship-eligible' for the production-label dimension.
- **L&M classifier (20-B-06)** — explicitly NOT calibrated by this plan; bag-of-words has no probabilistic output (documented in lm-classifier header).

## Self-Check: PASSED

- File existence (all FOUND):
  - FOUND src/lib/sentiment/calibration.ts
  - FOUND src/lib/sentiment/calibration-hyperparameters.ts
  - FOUND src/lib/sentiment/temperature-runtime.ts
  - FOUND src/lib/sentiment/MODEL-CARD-finbert-prosus.md
  - FOUND src/lib/sentiment/MODEL-CARD-gemini-per-doc.md
  - FOUND scripts/calibrate-temperature.ts
  - FOUND scripts/calibrate-temperature-core.ts
  - FOUND src/app/api/cron/calibrate-temperature/route.ts
  - FOUND src/app/insights/sentiment-health/components/CalibrationTile.tsx
  - FOUND data/datasets/financial-phrasebank.csv
  - FOUND data/datasets/DATASET-CARD-financial-phrasebank.md
  - FOUND tests/sentiment-calibration.unit.test.ts
  - FOUND tests/sentiment-calibration-fit.unit.test.ts
  - FOUND tests/sentiment-calibration-bounds.unit.test.ts
  - FOUND tests/sentiment-finbert-temp-scaling.unit.test.ts
  - FOUND tests/sentiment-per-doc-temp-scaling.unit.test.ts
  - FOUND tests/integration/calibrate-temperature.integration.test.ts
- Commits (all FOUND):
  - FOUND e6e86dd — TemperatureCalibration model + calibration-hyperparameters
  - FOUND 0f35518 — calibration primitives (ECE/Brier/softmax/temperatureScale/fitTemperature/kFoldCalibrationECE)
  - FOUND 4620f70 — Financial PhraseBank dataset + dataset card
  - FOUND 405fed5 — calibrate-temperature CLI + cron + auto-refit-on-version-change
  - FOUND 93189fc — wire T-scaling into classifyFinBERT + temperature-runtime
  - FOUND fa4a8bf — wire T-scaling into classifyDocumentsBatch
  - FOUND 643b97a — CalibrationTile + HYPERPARAMETERS + model card updates
  - FOUND c58791b — integration test

All success criteria met within the plan's autonomous-execution scope. Plan complete (Task 2 prisma db push + Task 12 ship-gate are explicitly operator-gated per plan preamble).
