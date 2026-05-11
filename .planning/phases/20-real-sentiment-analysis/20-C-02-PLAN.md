---
phase: 20
plan: 20-C-02
wave: C
type: execute
depends_on: ['20-Z-01']
files_modified:
  - src/lib/stats/brier.ts
  - src/lib/stats/isotonic.ts
  - scripts/eval-brier.ts
  - src/app/api/cron/eval-brier/route.ts
  - src/app/insights/calibration/page.tsx
  - src/app/insights/calibration/components/BrierTile.tsx
  - src/app/insights/calibration/components/ReliabilityDiagram.tsx
  - src/app/api/insights/calibration/route.ts
  - vercel.json
  - HYPERPARAMETERS.md
  - reports/.gitkeep
  - tests/stats/brier.unit.test.ts
  - tests/stats/isotonic.unit.test.ts
  - tests/stats/corp.unit.test.ts
  - tests/integration/eval-brier.integration.test.ts
autonomous: true
requirements: [20-C-02]
shadow_required: false
shadow_skip_reason: "Pure offline statistical tooling — read-only join against existing SentimentObservation (owned by 20-Z-01) and forward 7d alpha-vs-SPY (existing learning.ts surface). Emits JSON artifacts under reports/ and renders an operator-only /insights/calibration page. NO classifier output is altered, NO production decision path consumes the Brier numbers (per CONTEXT.md S3 — when no read path is being changed, there is no off→shadow→on to gate). Verdict is purely the numerical acceptance gates below."
hard_cleanup_gate: true
must_haves:
  truths:
    - "brierScore(predictions, outcomes) implements the literal Brier formula BS = (1/N) Σ (p_i - o_i)² where p_i ∈ [0,1] and o_i ∈ {0,1} — see Brier 1950 §2; unit tests cover N=1 degenerate, all-correct (BS=0), all-wrong-confident (BS=1), and a published example"
    - "brierDecomposition(predictions, outcomes, n_bins=10) returns { reliability, resolution, uncertainty, bs_check } satisfying the Murphy 1973 identity BS = Reliability − Resolution + Uncertainty within |residual| ≤ 1e-9 — asserted in tests"
    - "Reliability = (1/N) Σ_k n_k (p̄_k - ō_k)²; Resolution = (1/N) Σ_k n_k (ō_k - ō)²; Uncertainty = ō(1-ō) where ō is the marginal base rate; literal formulas committed as comment block above each function"
    - "isotonicRegression(x, y) implements the Pool-Adjacent-Violators (PAV) algorithm — Barlow & Brunk 1972 / Ayer et al. 1955 — and returns a non-decreasing step function fit by least-squares; unit test asserts monotonicity invariant on 1000 random inputs"
    - "corpReliabilityDiagram(predictions, outcomes) implements the CORP method (Dimitriadis, Gneiting & Jordan, PNAS 2021, doi:10.1073/pnas.2016191118) — fits isotonic regression of outcomes on predictions, returns { calibrated_probs, bin_counts, recalibrated_curve } where recalibrated_curve is the PAV-fit identity-mapping on perfectly-calibrated synthetic data"
    - "brierScore numerical agreement with Murphy 1973 Table 1 reference example (forecasts p ∈ {0.0, 0.2, 0.4, 0.6, 0.8, 1.0} on a fixed 100-observation set) — committed reference values asserted within 1e-6 in tests/stats/brier.unit.test.ts"
    - "scripts/eval-brier.ts joins SentimentObservation by fetched_at (NOT published_at — T-20-C-02-05; PIT-INVARIANT per 20-Z-01 marker) against forward 7d alpha-vs-SPY computed via existing learning.ts hit-classification surface; computes Brier + decomposition + CORP per classifier_version; writes reports/brier-{YYYY-MM-DD}.json AND reports/brier-{YYYY-MM-DD}.md"
    - "Binary outcome: classifier predicts 'bullish' (P(bullish) = polarity-mapped probability in [0,1] — for tags use 1.0 for bull / 0.0 for bear / 0.5 for neutral; for continuous classifier_score in [-1,+1] map via (score+1)/2); outcome y_i = 1 if alpha_7d > 0 (beats SPY) else 0"
    - "Class-imbalance defense: report base_rate = Σ y_i / N alongside Brier; ship gate is Brier ≤ 0.24 AND (|base_rate - 0.5| < 0.1 OR documented_imbalance_acknowledged in reports/brier-{date}.md) — T-20-C-02-01"
    - "Minimum-sample floor: per-classifier_version evaluations require n ≥ 100 observations; below threshold emit status='insufficient_data' and SKIP ship gate (T-20-C-02-02 isotonic overfit defense); documented in dataset card"
    - "/insights/calibration page renders one BrierTile per classifier_version (current Brier, decomposition stack, base_rate, n_samples, last_computed_at) AND one ReliabilityDiagram per classifier_version (scatter + isotonic-fit curve + histogram of prediction frequency — T-20-C-02-04 multimodal defense)"
    - "Weekly cron /api/cron/eval-brier scheduled in vercel.json at '0 8 * * 1' (Mondays 08:00 UTC) — staggered after the 20-Z-03 retention crons; authenticated via CRON_SECRET Bearer header per the Vercel cron convention"
    - "20-Z-03 sentiment-health dashboard gains a top-level link to /insights/calibration; the CalibrationTile component is REUSED from this plan and surfaced as a small summary card on /insights/sentiment-health (latest Brier + green/yellow/red badge)"
    - "HYPERPARAMETERS.md gains a §Brier Calibration section documenting: random-baseline Brier=0.25, ship-gate Brier ≤ 0.24, citation to Murphy 1973 and Dimitriadis-Gneiting-Jordan 2021, minimum n=100"
    - "Ship-gate report: if any classifier_version has Brier > 0.24 on its first full evaluation, the eval-brier run writes a remediation note section to reports/brier-{date}.md naming the failing classifier_version, observed Brier, base_rate, dominant failure mode (high Reliability term = miscalibration vs low Resolution = no skill), and either ACCEPT_AS_BASELINE or REMEDIATE_BY recommendation"
    - "No Prisma schema change — Brier results live as JSON files under reports/brier-*.json and are read by the /api/insights/calibration route (server reads filesystem in dev; cron writes filesystem; on Vercel Functions the cron writes to /tmp and uploads to Vercel Blob); reports/.gitkeep committed; reports/brier-*.json gitignored"
    - "Existing .gitignore receives a /reports/brier-*.json entry; reports/brier-*.md is committed only when the ship-gate fails (operator artifact for remediation tracking)"
  artifacts:
    - path: "src/lib/stats/brier.ts"
      provides: "brierScore(), brierDecomposition() with literal Murphy 1973 formulas; pure functions with no IO; Reliability/Resolution/Uncertainty + bs_check; identity-asserting unit tests"
      contains: "brierDecomposition"
      min_lines: 100
    - path: "src/lib/stats/isotonic.ts"
      provides: "isotonicRegression() via Pool-Adjacent-Violators (PAV); pure function returning a step-function predictor; corpReliabilityDiagram() implementing the PNAS-2021 CORP method"
      contains: "Pool-Adjacent-Violators"
      min_lines: 80
    - path: "scripts/eval-brier.ts"
      provides: "CLI: load SentimentObservation join forward 7d alpha-vs-SPY → per classifier_version compute Brier + decomposition + CORP; emit reports/brier-{date}.{json,md}; pretty-prints to stdout"
      contains: "brierDecomposition"
    - path: "src/app/api/cron/eval-brier/route.ts"
      provides: "Weekly cron entrypoint; invokes eval-brier logic; auth via CRON_SECRET Bearer; writes JSON to /tmp + (optional) Vercel Blob; logs ship-gate verdict"
      contains: "Bearer ${process.env.CRON_SECRET}"
    - path: "src/app/api/insights/calibration/route.ts"
      provides: "JSON endpoint returning latest Brier + decomposition + CORP-reliability-diagram data per classifier_version; reads newest reports/brier-*.json (filesystem in dev, Vercel Blob in prod)"
      contains: "brier"
    - path: "src/app/insights/calibration/page.tsx"
      provides: "Server component rendering per-classifier_version BrierTile + ReliabilityDiagram; links from /insights/sentiment-health"
      contains: "Calibration"
    - path: "src/app/insights/calibration/components/BrierTile.tsx"
      provides: "React tile showing latest Brier, Reliability/Resolution/Uncertainty stacked, base_rate, n_samples, ship-gate badge (green ≤0.24, yellow 0.24–0.25, red >0.25)"
      contains: "0.24"
    - path: "src/app/insights/calibration/components/ReliabilityDiagram.tsx"
      provides: "CORP reliability scatter: x-axis predicted probability, y-axis empirical frequency; overlay isotonic-fit step curve + identity diagonal + frequency histogram (T-20-C-02-04 defense against multimodal misreads)"
      contains: "isotonic"
    - path: "vercel.json"
      provides: "New cron entry for /api/cron/eval-brier at '0 8 * * 1' (weekly Monday 08:00 UTC)"
      contains: "eval-brier"
    - path: "HYPERPARAMETERS.md"
      provides: "§Brier Calibration section: ship-gate value, citations, minimum n, base-rate defense rule"
      contains: "20-C-02"
    - path: "reports/.gitkeep"
      provides: "Empty placeholder so reports/ directory exists in repo; reports/brier-*.json gitignored separately"
    - path: "tests/stats/brier.unit.test.ts"
      provides: "≥6 unit cases: degenerate N=1 (BS=0 perfect, BS=1 wrong); all-correct case; all-wrong-confident case; Murphy 1973 Table 1 numerical reference (committed literal values); decomposition identity BS = R - Res + U residual ≤ 1e-9 on 3 distinct datasets; binning edge cases (predictions on bin boundaries)"
      contains: "1e-9"
    - path: "tests/stats/isotonic.unit.test.ts"
      provides: "≥3 unit cases: monotonicity invariant over 1000 random inputs (assert non-decreasing); identity recovery (already-sorted ascending y returns y unchanged); single-pool merge case (worked example with known PAV output)"
      contains: "monotonic"
    - path: "tests/stats/corp.unit.test.ts"
      provides: "≥3 unit cases: perfectly-calibrated synthetic Bernoulli (predictions p_i, outcomes ~Bernoulli(p_i)) → CORP returns near-identity mapping (assert sup-norm deviation from diagonal ≤ 0.1 with N=2000 seeded RNG); systematic overconfidence dataset → recalibrated_curve shrinks toward base rate; bin_counts sum to N"
      contains: "PNAS"
    - path: "tests/integration/eval-brier.integration.test.ts"
      provides: "Live-Neon test: seed 200 SentimentObservation rows with known forward-return outcomes (using 20-Z-01 insertObservation DAO and a deterministic seeded RNG); run eval-brier.ts; assert reports/brier-{date}.json produced; assert BS = R - Res + U identity holds within 1e-9; assert classifier_version field present"
      contains: "1e-9"
  key_links:
    - from: "scripts/eval-brier.ts"
      to: "prisma.sentimentObservation.findMany({ where: { fetched_at: { lte: cutoff } } })"
      via: "PIT join on fetched_at (per 20-Z-01 PIT-INVARIANT marker); NEVER published_at (T-20-C-02-05)"
      pattern: "fetched_at"
    - from: "scripts/eval-brier.ts"
      to: "src/lib/learning.ts forward 7d alpha-vs-SPY computation"
      via: "reuses existing hit-classification surface (SPY-relative returns, 1% threshold convention per project memory)"
      pattern: "alpha"
    - from: "scripts/eval-brier.ts"
      to: "src/lib/stats/brier.ts brierDecomposition() + src/lib/stats/isotonic.ts corpReliabilityDiagram()"
      via: "per-classifier_version invocation; results written to reports/brier-{date}.json"
      pattern: "brierDecomposition"
    - from: "src/app/api/cron/eval-brier/route.ts"
      to: "vercel.json crons entry"
      via: "weekly Monday 08:00 UTC '0 8 * * 1'"
      pattern: "eval-brier"
    - from: "src/app/api/insights/calibration/route.ts"
      to: "reports/brier-*.json (newest by computed_at)"
      via: "filesystem read in dev; Vercel Blob read in prod; per-classifier_version slice returned as JSON"
      pattern: "brier-"
    - from: "src/app/insights/sentiment-health/page.tsx (20-Z-03)"
      to: "src/app/insights/calibration/components/BrierTile.tsx"
      via: "summary tile (latest Brier + status badge) rendered alongside provider tiles; link to /insights/calibration"
      pattern: "BrierTile"
---

# Plan 20-C-02: Brier decomposition + CORP reliability diagram

<universal_preamble>

## Autonomous Execution Clause

This plan ships **pure offline statistical tooling + a read-only operator dashboard page + a weekly cron**. There is NO Prisma schema change, NO classifier output mutation, and NO production decision path that consumes the Brier numbers. All tasks are autonomous — no operator gate, no `npx prisma db push`, no shadow lifecycle to graduate. The plan executes end-to-end and commits when:

1. Unit tests green (≥6 in brier.unit.test.ts, ≥3 in isotonic.unit.test.ts, ≥3 in corp.unit.test.ts)
2. Integration test green (`tests/integration/eval-brier.integration.test.ts`)
3. Weekly cron entry committed in `vercel.json`
4. /insights/calibration page renders against seeded data
5. HYPERPARAMETERS.md §Brier Calibration section landed
6. Ship-gate verdict (Brier ≤ 0.24 OR documented remediation in `reports/brier-{date}.md`) recorded for ≥1 classifier_version with n ≥ 100 observations in the integration test

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:

1. **No shadow lifecycle to graduate** (S3 N/A — pure read-only telemetry; documented in frontmatter `shadow_skip_reason`)
2. **No old code deleted** (additive only; no existing surface modified except `vercel.json` cron list, `HYPERPARAMETERS.md` documentation, `.gitignore` exclude line, and `/insights/sentiment-health` gains a small link tile — none of those changes affect existing behavior)
3. **No feature flag introduced** (tooling always runs on the weekly schedule; the calibration page renders empty state when reports/ is empty)
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), `npm run test:e2e` (Playwright) all green on `main` post-commit
5. **Decomposition Identity Gate** (T-20-C-02-03): every unit test that constructs (predictions, outcomes) asserts `|brierDecomposition.bs_check − brierScore(predictions, outcomes)| ≤ 1e-9` AND `|bs_check − (reliability − resolution + uncertainty)| ≤ 1e-9` — the algebraic identity holds by construction in `brierDecomposition`, so any drift catches a floating-point or formula regression at CI time
6. **Murphy 1973 Reference Gate**: `tests/stats/brier.unit.test.ts` includes a committed-literal numerical example matching Murphy 1973 Table 1 (or the equivalent worked example in Bröcker & Smith 2007 §2 if Murphy's table is paywalled in our citation pipeline) within 1e-6
7. **Sample Floor Gate** (T-20-C-02-02): integration test exercises both branches: n=200 (above floor → status='evaluated', ship-gate runs) and n=50 (below floor → status='insufficient_data', ship-gate skipped)
8. **PIT Join Gate** (T-20-C-02-05): `grep -E "published_at" scripts/eval-brier.ts src/lib/stats/*.ts src/app/api/cron/eval-brier/route.ts` returns ZERO matches; all SentimentObservation queries join on `fetched_at`
9. **Ship-Gate Reporting Gate**: when the integration test seeds a deliberately-uncalibrated classifier (predictions = constant 0.9 against base_rate ≈ 0.5 outcomes) → eval-brier writes a remediation note to `reports/brier-{date}.md` with `STATUS: FAIL_SHIP_GATE` and a `DOMINANT_FAILURE_MODE` line citing the dominant decomposition term
10. **Cron Authentication Gate**: `grep -q "Bearer ${process.env.CRON_SECRET}" src/app/api/cron/eval-brier/route.ts` (per Vercel cron-jobs convention — authorization header check)

## Cross-cutting standards adherence (CONTEXT.md §S1–S10)

- **S1 (no hand-picked parameters)** — The ship-gate Brier ≤ 0.24 is cited from CONTEXT.md line 125 verbatim AND derived from the random-classifier baseline Brier = ō(1−ō) = 0.5 × 0.5 = 0.25 when base rate is balanced (Brier 1950 / Murphy 1973). The minimum-n=100 floor is the conventional minimum for isotonic regression stability per Niculescu-Mizil & Caruana 2005 §4; documented in HYPERPARAMETERS.md and the dataset card. The base-rate-imbalance window |base_rate − 0.5| < 0.1 is a defensive constant explicitly motivated by T-20-C-02-01 and documented in HYPERPARAMETERS.md.
- **S2 (PIT discipline)** — All SentimentObservation joins use `fetched_at` per 20-Z-01's PIT-INVARIANT marker. `published_at` does not appear anywhere in this plan's source (enforced by Gate 8). The integration test seeds rows via 20-Z-01's `insertObservation` DAO, which sets `fetched_at = now()` at insert time and never overwrites — so the eval-brier join is reproducible from row contents alone.
- **S3 (per-plan shadow lifecycle)** — Skipped with documented reason in frontmatter `shadow_skip_reason`. Pure offline read tooling + operator dashboard + no production decision path consumes Brier numbers. Future plans (e.g., 20-B-03 T-scaling which uses Brier as a co-gate, or a hypothetical Phase-21 auto-down-weight on Brier > 0.27) introduce their own flags when they couple Brier into a runtime decision.
- **S4 (model card)** — Not adding a new model; the Brier numbers feed back into existing model cards (FinBERT-prosus, gemini-per-doc, stocktwits-tag-v1). 20-B-03 and 20-C-06 already own the model-card updates that include per-classifier Brier numbers; this plan supplies the numbers via its JSON artifact for those plans to cite.
- **S5 (pinned model + prompt versions)** — Every eval-brier output row is keyed by `classifier_version` (the same string pinned in TemperatureCalibration per 20-B-03 — e.g. `finbert-prosus-{HF_FINBERT_SHA}`, `gemini-per-doc-v{N}`, `stocktwits-tag-v1`). Brier computed against a stale classifier_version cannot leak into the new version's tile.
- **S6 (telemetry on every external call)** — N/A; this plan makes zero external calls. The Brier numbers themselves are surfaced on /insights via the route owned by this plan AND linked from 20-Z-03's /insights/sentiment-health.
- **S7 (threat model)** — Five plan-level threats T-20-C-02-{01..05} below with concrete mitigations.
- **S8 (numerical acceptance)** — Every DONE criterion is a grep / test exit / numeric assertion. Brier ≤ 0.24, decomposition residual ≤ 1e-9, Murphy reference within 1e-6, n ≥ 100 floor, |base_rate − 0.5| < 0.1 window. Zero adjectives.
- **S9 (failure-mode coverage)** — Brier is itself a failure-mode metric. The 20-D-04 golden-ticker suite is downstream of this plan: when 20-D-04 lands, its CI gate can read the latest reports/brier-*.json for the per-classifier numbers used in its acceptance criteria. This plan ships the numbers and the schema; 20-D-04 wires the gate.
- **S10 (regulatory hygiene)** — /insights/calibration is operator-only (admin-gated like the rest of /insights). No user-facing surface, no public publication of calibration data (which is Phase 29's legal-counsel gate). Reports/brier-*.json is gitignored — only ship-gate-failure .md narratives are committed as operator artifacts.

</universal_preamble>

<objective>
Compute and surface the Brier score plus its Murphy-1973 decomposition (Reliability − Resolution + Uncertainty) for the binary claim "classifier-bullish ⇒ beats SPY at 7d," per classifier_version, using a CORP-method reliability diagram (Dimitriadis-Gneiting-Jordan, PNAS 2021) that replaces ad-hoc equal-width binning with isotonic regression. Ship a weekly cron that emits reports/brier-{date}.{json,md}, an /insights/calibration page that renders the latest tile per classifier_version, and a ship-gate Brier ≤ 0.24 reported as either MET or with a documented remediation narrative.

Why this matters: post-Phase-19 we publish bull/bear percentages and per-document confidence numbers but have NO single statistic for "is this classifier predictive at all" that decomposes miscalibration (Reliability term) from no-skill (low Resolution) from base-rate randomness (Uncertainty). Brier + Murphy decomposition gives us that — Reliability isolates calibration error (the thing 20-B-03 fixes via temperature scaling), Resolution isolates discriminative skill (the thing 20-C-01 measures via per-source ICIR), Uncertainty is the irreducible base-rate term. CORP replaces the historical "10 equal-width bins" reliability diagram (which is sensitive to bin choice and silently misleading on multimodal prediction distributions) with a defensible non-parametric alternative.

Scope guard: this plan ships **Brier + decomposition + CORP reliability diagram + dashboard tile + weekly cron ONLY**. Temperature scaling (20-B-03) consumes Brier as a co-gate but lives in its own plan. Per-source ICIR with Newey-West (20-C-01) is a different metric. Fairness/bias audit by cap_class (20-C-06) is a different plan. Manipulation detection (20-C-04) is different. Bot filter (20-C-03) is different. Joint feature ablation (20-C-05) is different.

Output:
- 2 new pure-function modules (`src/lib/stats/brier.ts`, `src/lib/stats/isotonic.ts`)
- 1 CLI script (`scripts/eval-brier.ts`)
- 1 cron route + vercel.json entry
- 1 JSON API route + 1 server-component page + 2 React tiles
- 1 HYPERPARAMETERS.md §Brier Calibration section
- 4 test files (3 unit + 1 integration), all green
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-B-03-PLAN.md
@src/lib/learning.ts
@prisma/schema.prisma
@HYPERPARAMETERS.md
@vercel.json

<interfaces>

```typescript
// src/lib/stats/brier.ts — pure functions, no IO

/**
 * Brier score for binary outcomes.
 *
 *     BS = (1/N) Σ_{i=1..N} (p_i − o_i)²
 *
 * where p_i ∈ [0,1] is the predicted probability for the positive class and
 * o_i ∈ {0,1} is the realized outcome (1 = positive). Reference: Brier 1950,
 * "Verification of forecasts expressed in terms of probability," Monthly Weather
 * Review 78(1):1-3. Range: [0, 1]; lower is better; 0.25 = always predict 0.5
 * on a 50/50 base rate (the random baseline this phase's ship gate references).
 *
 * Throws on length mismatch, empty input, p_i ∉ [0,1], or o_i ∉ {0,1}.
 */
export function brierScore(predictions: number[], outcomes: number[]): number;

/**
 * Murphy 1973 decomposition into Reliability, Resolution, Uncertainty.
 *
 *     BS = Reliability − Resolution + Uncertainty
 *
 *     Reliability  = (1/N) Σ_k n_k × (p̄_k − ō_k)²
 *     Resolution   = (1/N) Σ_k n_k × (ō_k − ō)²
 *     Uncertainty  = ō × (1 − ō)
 *
 * where:
 *   • k indexes equal-width bins (default n_bins=10, Guo 2017 convention) on
 *     the predicted probability axis [0,1]
 *   • n_k is the number of observations falling in bin k
 *   • p̄_k is the mean prediction within bin k
 *   • ō_k is the empirical positive-class frequency within bin k
 *   • ō = (1/N) Σ_i o_i is the marginal positive-class base rate
 *
 * Reference: Murphy 1973, "A new vector partition of the probability score,"
 * Journal of Applied Meteorology 12(4):595–600. See also Bröcker & Smith 2007
 * "Increasing the reliability of reliability diagrams," Weather and Forecasting
 * 22(3):651-661 for a clear worked example.
 *
 * Returns bs_check = Reliability − Resolution + Uncertainty for the algebraic
 * identity unit test; bs_check MUST equal brierScore(predictions, outcomes)
 * within 1e-9 (asserted in tests).
 */
export function brierDecomposition(
  predictions: number[],
  outcomes: number[],
  n_bins?: number,  // default 10
): {
  reliability: number;
  resolution: number;
  uncertainty: number;
  bs_check: number;
  base_rate: number;
  n: number;
  per_bin: Array<{ bin_index: number; n_k: number; p_bar_k: number; o_bar_k: number }>;
};
```

```typescript
// src/lib/stats/isotonic.ts — pure functions, no IO

/**
 * Pool-Adjacent-Violators (PAV) isotonic regression. Fits a non-decreasing
 * step function ŷ(x) to (x_i, y_i) by least-squares.
 *
 * Algorithm (Barlow & Brunk 1972; Ayer-Brunk-Ewing-Reid-Silverman 1955):
 *   1. Sort pairs by x ascending (stable).
 *   2. Initialize pools = [{ x_start, x_end, y_mean, weight=1 }, ...] one per
 *      input point.
 *   3. While any adjacent pool pair violates y_mean[i] > y_mean[i+1]:
 *        merge into a single pool with weight-averaged y_mean.
 *   4. Return a step function that, given a new x, returns the y_mean of the
 *      pool covering [x_start, x_end] (or the nearest pool by x).
 *
 * Reference: Robertson, Wright & Dykstra 1988, "Order Restricted Statistical
 * Inference," Wiley. Standard textbook PAV; ~50 lines in TypeScript.
 *
 * Returns: a predictor (x: number) => number whose output is monotonic
 * non-decreasing in x (asserted in unit tests on 1000 random inputs).
 */
export function isotonicRegression(
  x: number[],
  y: number[],
): (x: number) => number;

/**
 * CORP method (Consistent, Optimally binned, Reproducible, PAV-based) for
 * reliability diagrams.
 *
 * Reference: Dimitriadis, Gneiting & Jordan, "Stable reliability diagrams for
 * probabilistic classifiers," PNAS 118(8) 2021, doi:10.1073/pnas.2016191118.
 *
 * Replaces equal-width binning (sensitive to bin choice; misleading on
 * multimodal prediction distributions per T-20-C-02-04) with isotonic
 * regression of outcomes on predictions. The fit IS the recalibration curve:
 *   • Perfectly calibrated classifier → curve = identity (y = x).
 *   • Systematic overconfidence → curve shrinks toward the base rate.
 *
 * Returns:
 *   • calibrated_probs[i] = recalibrated probability for prediction i
 *   • recalibrated_curve: dense grid {x: number[], y: number[]} for plotting
 *   • bin_counts: histogram of predictions over [0,1] in 20 equal-width bins
 *     (rendered alongside the curve per T-20-C-02-04 multimodal defense)
 */
export function corpReliabilityDiagram(
  predictions: number[],
  outcomes: number[],
): {
  calibrated_probs: number[];
  recalibrated_curve: { x: number[]; y: number[] };
  bin_counts: number[];
  n: number;
};
```

```typescript
// scripts/eval-brier.ts — CLI signature

interface EvalBrierResult {
  computed_at: string;             // ISO timestamp
  classifier_version: string;      // e.g. "finbert-prosus-{sha}", "gemini-per-doc-v2", "stocktwits-tag-v1"
  n: number;
  base_rate: number;               // ō = Σ y_i / N
  brier: number;
  reliability: number;
  resolution: number;
  uncertainty: number;
  bs_check: number;                // identity check; |bs_check − brier| ≤ 1e-9
  corp: {
    recalibrated_curve: { x: number[]; y: number[] };
    bin_counts: number[];
  };
  status: 'evaluated' | 'insufficient_data' | 'ship_gate_failed';
  ship_gate: {
    threshold: 0.24;
    met: boolean;
    base_rate_imbalance_acknowledged?: boolean;
    dominant_failure_mode?: 'reliability' | 'resolution' | 'base_rate_imbalance';
  };
}

// Top-level entry: read SentimentObservation joined to forward 7d alpha-vs-SPY,
// compute one EvalBrierResult per classifier_version, write to:
//   reports/brier-{YYYY-MM-DD}.json  (always, gitignored)
//   reports/brier-{YYYY-MM-DD}.md    (only on ship_gate_failed; committed)
```

</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| cron→DB | weekly cron reads SentimentObservation by fetched_at; PIT discipline enforced (T-20-C-02-05) |
| script→reports/ | eval-brier writes JSON; .gitignore excludes brier-*.json so private telemetry is not committed |
| dashboard→reports/ | /insights/calibration reads newest reports/brier-*.json; operator-only surface |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-C-02-01 | Information disclosure (misleading metric) | brierScore vs class imbalance | mitigate | Always-predict-majority on imbalanced (base_rate=0.95) data scores Brier=0.05 — looks excellent, predicts nothing. Mitigation: report base_rate alongside Brier in BrierTile + JSON output. Ship gate is `Brier ≤ 0.24 AND (|base_rate − 0.5| < 0.1 OR documented_imbalance_acknowledged=true in the .md remediation note)`. Unit test seeds an imbalanced-base-rate dataset and asserts the gate logic rejects it without acknowledgement. |
| T-20-C-02-02 | Tampering (overfit) | isotonicRegression on small N | mitigate | Isotonic regression over-pools small samples and can produce a misleadingly-flat recalibration curve. Mitigation: minimum n=100 per per-classifier_version evaluation. Below floor → status='insufficient_data', ship gate SKIPPED, BrierTile renders a "collecting data" badge. Documented in HYPERPARAMETERS.md §Brier Calibration. Integration test exercises both n=200 (above floor) and n=50 (below floor) branches. |
| T-20-C-02-03 | Tampering (numerical) | brierDecomposition identity | mitigate | Murphy decomposition is an algebraic identity; floating-point drift catches a formula regression. Mitigation: bs_check field returned, unit tests assert `|bs_check − brierScore| ≤ 1e-9` AND `|bs_check − (reliability − resolution + uncertainty)| ≤ 1e-9` on 3 distinct seeded datasets. Drift > 1e-9 fails CI before merge. |
| T-20-C-02-04 | Information disclosure (misleading visualization) | CORP diagram on multimodal predictions | mitigate | If predictions cluster bimodally (e.g., classifier outputs only 0.1 or 0.9), the smooth isotonic curve looks well-behaved over the gap but the gap is data-empty. Mitigation: ReliabilityDiagram component renders a frequency histogram (20-bin) under the curve so the operator sees where the data lives. Documented limitation in the §Known Limitations section of the BrierTile help text. |
| T-20-C-02-05 | Information disclosure (lookahead bias) | forward-return join | mitigate | Joining SentimentObservation on `published_at` instead of `fetched_at` admits upstream-revised timestamps and creates a subtle lookahead leak. Mitigation: 20-Z-07 (separate plan) is the regression test that enforces this for the production query path; THIS plan defends with Gate 8 — `grep -E "published_at" scripts/eval-brier.ts src/lib/stats/*.ts src/app/api/cron/eval-brier/route.ts` returns zero matches at CI time. All joins use `fetched_at` per 20-Z-01's PIT-INVARIANT marker. |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-C-02-01">
  <name>Task 1: Write failing tests — brierScore + brierDecomposition (pure-function unit tests)</name>
  <files>tests/stats/brier.unit.test.ts</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (lines 125, 153 — ship-gate Brier ≤ 0.24 verbatim)
    - .planning/phases/20-real-sentiment-analysis/20-B-03-PLAN.md (frontmatter must_haves — Brier formula already cited; this plan ships the implementation behind that citation)
  </read_first>
  <behavior>
    ≥6 unit cases for src/lib/stats/brier.ts. Tests fail because the file does not exist yet.

    1. brierScore: empty input throws.
    2. brierScore: length mismatch throws.
    3. brierScore: out-of-range prediction (p=1.5) throws.
    4. brierScore: out-of-range outcome (o=0.5) throws.
    5. brierScore: N=1 perfect prediction (p=1, o=1) returns 0.
    6. brierScore: N=1 maximally-wrong prediction (p=1, o=0) returns 1.
    7. brierScore: all-correct vector (p=[1,0,1,0], o=[1,0,1,0]) returns 0.
    8. brierScore: all-50/50 vector (p=[0.5,0.5,0.5,0.5], o=[1,0,1,0]) returns 0.25 (the random baseline).
    9. brierScore: Murphy 1973 reference example — committed literal predictions + outcomes + expected BS value within 1e-6. Use the Bröcker-Smith-2007-§2 worked example (p ∈ {0.1, 0.3, 0.5, 0.7, 0.9} on 50 observations each, ō = 0.5 by construction) if Murphy's original table is paywalled — cite chosen source in test comment.
    10. brierDecomposition: returns reliability, resolution, uncertainty, bs_check, base_rate, n, per_bin fields.
    11. brierDecomposition: identity gate on dataset A — `|bs_check − brierScore(p, o)| ≤ 1e-9` AND `|bs_check − (reliability − resolution + uncertainty)| ≤ 1e-9`.
    12. brierDecomposition: identity gate on dataset B (different distribution — skewed predictions, balanced outcomes).
    13. brierDecomposition: identity gate on dataset C (balanced predictions, imbalanced outcomes ō=0.9).
    14. brierDecomposition: predictions on bin boundaries (p=0.1 with n_bins=10 falls into bin 1, p=1.0 falls into the last bin) — assert no out-of-range bin index.
    15. brierDecomposition: uncertainty = ō(1−ō) verified literally on dataset C (ō=0.9 → uncertainty=0.09).
  </behavior>
  <action>
    Create tests/stats/brier.unit.test.ts. Follow the existing test convention from tests/learning.unit.bugs.test.ts (see @.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md for the template — describe blocks per function; imports at top; literal expected values in `expect().toBeCloseTo()` with precision 9 for identity assertions and 6 for the Murphy reference). Use `describe('brierScore — Brier 1950', () => {...})` and `describe('brierDecomposition — Murphy 1973 identity', () => {...})`.

    Embed a comment block above the Murphy reference test naming the citation and committing the literal input arrays + expected output, so any future drift surfaces as a numerical diff.

    Do NOT create src/lib/stats/brier.ts yet — these tests must fail with "Cannot find module".
  </action>
  <verify>
    <automated>npx vitest run tests/stats/brier.unit.test.ts 2>&1 | grep -qE "Cannot find module|FAIL"</automated>
  </verify>
  <done>≥15 failing test cases written; verified RED with "Cannot find module './brier'" or equivalent</done>
</task>

<task type="auto" tdd="true" id="20-C-02-02">
  <name>Task 2: Write failing tests — isotonicRegression PAV + corpReliabilityDiagram</name>
  <files>tests/stats/isotonic.unit.test.ts, tests/stats/corp.unit.test.ts</files>
  <read_first>
    - tests/stats/brier.unit.test.ts (just created — match style)
  </read_first>
  <behavior>
    tests/stats/isotonic.unit.test.ts — ≥3 cases:
    1. Monotonicity invariant: for 1000 random (x, y) inputs (seeded RNG mulberry32(42)), assert the fitted predictor returns a non-decreasing sequence when evaluated on the input x's. No adjacent inversions allowed.
    2. Identity recovery: when y is already sorted ascending in x, the PAV output equals y within 1e-12 (no pooling needed).
    3. Single-pool merge: known worked example y=[3, 1, 4, 1, 5, 9, 2, 6] (the digits-of-π textbook PAV case) — assert the fitted means at each input x match a hand-computed expected vector (commit the expected vector literally in the test file with a comment explaining the merge sequence: 3,1 → pool [2]; 4,1 → pool [2.5]; ...).

    tests/stats/corp.unit.test.ts — ≥3 cases:
    1. Perfectly-calibrated synthetic: seeded RNG mulberry32(7), generate p_i ~ Uniform(0,1), o_i ~ Bernoulli(p_i) with N=2000. CORP returns a recalibrated_curve whose sup-norm deviation from the identity y=x is ≤ 0.1.
    2. Systematic overconfidence: predictions p ∈ {0.05, 0.95} with outcomes following true probabilities {0.3, 0.7} (i.e., classifier overconfident). CORP returns a recalibrated_curve where curve.y at x=0.05 is ≥ 0.2 and at x=0.95 is ≤ 0.8 (shrinks toward base rate).
    3. bin_counts sum-to-N: for any input with N observations, sum(bin_counts) === N.
  </behavior>
  <action>
    Create tests/stats/isotonic.unit.test.ts and tests/stats/corp.unit.test.ts. Inline a tiny seeded RNG implementation at the top of each file (mulberry32 — public-domain ~5 lines) so tests are deterministic without adding a dep:

    ```ts
    function mulberry32(seed: number): () => number {
      let a = seed;
      return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    ```

    Cite Dimitriadis-Gneiting-Jordan 2021 (PNAS doi:10.1073/pnas.2016191118) in the corp.unit.test.ts header comment.

    Do NOT create src/lib/stats/isotonic.ts yet — these tests must fail with "Cannot find module".
  </action>
  <verify>
    <automated>npx vitest run tests/stats/isotonic.unit.test.ts tests/stats/corp.unit.test.ts 2>&1 | grep -qE "Cannot find module|FAIL"</automated>
  </verify>
  <done>≥6 failing test cases across two files; RED verified</done>
</task>

<task type="auto" tdd="true" id="20-C-02-03">
  <name>Task 3: Implement src/lib/stats/brier.ts — brierScore + brierDecomposition</name>
  <files>src/lib/stats/brier.ts</files>
  <read_first>
    - tests/stats/brier.unit.test.ts (the spec from Task 1)
  </read_first>
  <action>
    Create src/lib/stats/brier.ts. Implement:

    1. `brierScore(predictions: number[], outcomes: number[]): number` — input validation (empty / mismatch / out-of-range) throws descriptive Error. Computation:
       ```typescript
       let sum = 0;
       for (let i = 0; i < predictions.length; i++) {
         const d = predictions[i] - outcomes[i];
         sum += d * d;
       }
       return sum / predictions.length;
       ```

    2. `brierDecomposition(predictions, outcomes, n_bins = 10)` — per the formulas in the `<interfaces>` literal block above. Steps:
       - Validate inputs (same checks as brierScore).
       - Compute `base_rate = sum(outcomes) / N`.
       - Build per-bin aggregates: for each i, bin_index = `Math.min(n_bins - 1, Math.floor(predictions[i] * n_bins))` (clamp p=1.0 into last bin). Accumulate n_k, sum_p_k, sum_o_k per bin.
       - Compute `p_bar_k = sum_p_k / n_k`, `o_bar_k = sum_o_k / n_k`.
       - `reliability = (1/N) Σ_k n_k × (p_bar_k − o_bar_k)²` (zero-n bins skipped).
       - `resolution  = (1/N) Σ_k n_k × (o_bar_k − base_rate)²`.
       - `uncertainty = base_rate × (1 − base_rate)`.
       - `bs_check = reliability − resolution + uncertainty`.
       - Return all fields including `per_bin` array.

    Place a literal comment block above each function citing Brier 1950 / Murphy 1973 / Bröcker-Smith 2007.

    Re-run the Task 1 tests — all should pass.
  </action>
  <verify>
    <automated>npx vitest run tests/stats/brier.unit.test.ts</automated>
  </verify>
  <done>brier.ts shipped; all Task 1 tests GREEN; Murphy identity residual ≤ 1e-9 on all 3 dataset variants</done>
</task>

<task type="auto" tdd="true" id="20-C-02-04">
  <name>Task 4: Implement src/lib/stats/isotonic.ts — PAV + corpReliabilityDiagram</name>
  <files>src/lib/stats/isotonic.ts</files>
  <read_first>
    - tests/stats/isotonic.unit.test.ts and tests/stats/corp.unit.test.ts (the specs from Task 2)
    - src/lib/stats/brier.ts (just created — match exported style)
  </read_first>
  <action>
    Create src/lib/stats/isotonic.ts. Implement:

    1. `isotonicRegression(x: number[], y: number[]): (x: number) => number` via PAV:
       - Sort (x, y) pairs ascending by x (stable, preserve order of equal x).
       - Initialize `pools: { x_start: number; x_end: number; mean: number; weight: number }[]` one per sorted point.
       - Iterate: scan adjacent pairs; if `pools[i].mean > pools[i+1].mean`, merge:
         ```
         new_weight = w_i + w_{i+1}
         new_mean = (w_i * m_i + w_{i+1} * m_{i+1}) / new_weight
         new_x_start = x_start_i
         new_x_end = x_end_{i+1}
         ```
         Replace the two with the merged pool; restart the scan from `max(0, i-1)` to check newly-adjacent violations.
       - Continue until a full scan finds no violations.
       - Return a closure `(x: number) => number` that binary-searches `pools` for the covering interval (or nearest pool for out-of-range queries) and returns that pool's `mean`.

    2. `corpReliabilityDiagram(predictions, outcomes)`:
       - Call `isotonicRegression(predictions, outcomes)` to get the predictor.
       - `calibrated_probs[i] = predictor(predictions[i])`.
       - `recalibrated_curve`: evaluate predictor on a dense grid (200 points over [min(predictions), max(predictions)]); return as `{ x: number[]; y: number[] }`.
       - `bin_counts`: 20 equal-width bins over [0, 1]; per-bin count of predictions.
       - Return `{ calibrated_probs, recalibrated_curve, bin_counts, n: predictions.length }`.

    Cite Barlow-Brunk 1972 (PAV) and Dimitriadis-Gneiting-Jordan 2021 (CORP) in literal comment blocks above each function.

    Re-run the Task 2 tests — all should pass.
  </action>
  <verify>
    <automated>npx vitest run tests/stats/isotonic.unit.test.ts tests/stats/corp.unit.test.ts</automated>
  </verify>
  <done>isotonic.ts shipped; PAV monotonicity invariant holds on 1000 random inputs; CORP near-identity recovery on perfectly-calibrated synthetic with N=2000</done>
</task>

<task type="auto" id="20-C-02-05">
  <name>Task 5: scripts/eval-brier.ts — load SentimentObservation × forward 7d alpha-vs-SPY, compute Brier per classifier_version, emit reports/brier-{date}.{json,md}</name>
  <files>scripts/eval-brier.ts, reports/.gitkeep, .gitignore, HYPERPARAMETERS.md</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (SentimentObservation schema: ticker, fetched_at, classifier_version, classifier_score, source, message_id, model_version)
    - src/lib/learning.ts (hit classification: SPY-relative returns, 1% threshold per project memory; existing forward-return surfaces)
    - prisma/schema.prisma (current SentimentSnapshot + Report tables — context only; SentimentObservation lands in 20-Z-01)
    - src/lib/db.ts (Prisma singleton for queries)
  </read_first>
  <action>
    1. Create scripts/eval-brier.ts (CLI; node --import tsx scripts/eval-brier.ts invocable):
       - Parse args: `--cutoff <ISO date>` (default: today UTC) and `--lookback-days <N>` (default: 90).
       - Query SentimentObservation by `fetched_at` BETWEEN (cutoff − lookback) AND (cutoff − 7 days) — the 7-day buffer ensures forward returns have realized.
       - For each row, compute predicted P(bullish):
         - If `classifier_score` is null → skip (cannot evaluate).
         - For tag-shaped classifier_versions ('stocktwits-tag-v1') where classifier_score ∈ {-1, 0, +1}: map to {0.0, 0.5, 1.0}.
         - For continuous classifier_versions (FinBERT, Gemini per-doc) where classifier_score ∈ [-1, +1]: map p = (score + 1) / 2.
         - Document this mapping at the top of the script with a comment citing CONTEXT.md line 125 (binary "sentiment-bullish ⇒ beats SPY in 7d").
       - For each row's ticker, compute realized 7-day alpha vs SPY using the existing learning.ts surface (`computeAlphaVsSPY(ticker, fetched_at, fetched_at + 7d)` — exact function name to match what's in learning.ts; if the import surface is private, add a thin re-export in learning.ts as part of this task, ≤5 LOC).
       - outcome y_i = 1 if alpha_7d > 0 else 0.
       - Group by classifier_version. For each group:
         - If N < 100 → emit `{status: 'insufficient_data'}` and skip Brier computation (T-20-C-02-02).
         - Else:
           - `brier = brierScore(p, y)`.
           - `dec = brierDecomposition(p, y, 10)`.
           - `corp = corpReliabilityDiagram(p, y)`.
           - base_rate_imbalanced = `Math.abs(dec.base_rate - 0.5) >= 0.1`.
           - ship_gate.met = `brier <= 0.24 && !base_rate_imbalanced` (per T-20-C-02-01).
           - dominant_failure_mode: pick the largest contributor to BS among `{reliability term magnitude vs (uncertainty - resolution)}` — record literal rule in the script header.

    2. Emit `reports/brier-{YYYY-MM-DD}.json` (array of EvalBrierResult).

    3. If ANY result has `status='ship_gate_failed'`, emit `reports/brier-{YYYY-MM-DD}.md` with sections:
       - Date, classifier_versions evaluated
       - For each failing classifier: classifier_version, n, base_rate, brier, reliability, resolution, uncertainty, dominant_failure_mode
       - `REMEDIATION_RECOMMENDATION`: choose one of `ACCEPT_AS_BASELINE` (first run, no prior to compare) / `REMEDIATE_BY_TEMPERATURE_SCALING` (high Reliability — 20-B-03 path) / `REMEDIATE_BY_DROPPING_CLASSIFIER` (low Resolution — no skill).

    4. Add `reports/.gitkeep` (empty file) so the directory exists in the repo.

    5. Add to `.gitignore` (append):
       ```
       # Brier evaluation artifacts (20-C-02) — committed only on ship-gate failure as operator narratives
       /reports/brier-*.json
       ```
       (`/reports/brier-*.md` is intentionally NOT gitignored — ship-gate-failure narratives are committed for operator tracking.)

    6. Append a `## Brier Calibration (20-C-02)` section to HYPERPARAMETERS.md citing:
       - Ship gate: Brier ≤ 0.24 (CONTEXT.md line 125)
       - Random baseline: Brier = 0.25 when base_rate = 0.5 (Brier 1950)
       - Minimum n=100 per classifier_version (Niculescu-Mizil-Caruana 2005 isotonic stability)
       - Base-rate-imbalance window: |base_rate − 0.5| < 0.1 (T-20-C-02-01)
       - n_bins=10 for Murphy decomposition (Guo et al. 2017 convention)
       - Citation list: Brier 1950; Murphy 1973; Bröcker-Smith 2007; Barlow-Brunk 1972; Dimitriadis-Gneiting-Jordan 2021.

    PIT defense: every Prisma query in this script uses `fetched_at`. The string `published_at` MUST NOT appear anywhere in scripts/eval-brier.ts (Gate 8).
  </action>
  <verify>
    <automated>grep -E "published_at" scripts/eval-brier.ts && exit 1 || grep -q "brierDecomposition" scripts/eval-brier.ts</automated>
  </verify>
  <done>script + reports/.gitkeep + .gitignore entry + HYPERPARAMETERS.md §Brier Calibration committed; no published_at references in script</done>
</task>

<task type="auto" id="20-C-02-06">
  <name>Task 6: Cron route + vercel.json entry + API route + /insights/calibration page + tiles</name>
  <files>src/app/api/cron/eval-brier/route.ts, src/app/api/insights/calibration/route.ts, src/app/insights/calibration/page.tsx, src/app/insights/calibration/components/BrierTile.tsx, src/app/insights/calibration/components/ReliabilityDiagram.tsx, vercel.json, src/app/insights/sentiment-health/page.tsx</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md (sentiment-health dashboard structure — match component pattern)
    - vercel.json (existing crons array)
    - scripts/eval-brier.ts (just created — reuse its core computation; export it as a function so the route imports it)
  </read_first>
  <action>
    1. Refactor scripts/eval-brier.ts to export a `runEvalBrier(opts: { cutoff?: Date; lookbackDays?: number }): Promise<EvalBrierResult[]>` function. The CLI entry calls this and writes JSON. The cron route also calls this.

    2. Create `src/app/api/cron/eval-brier/route.ts`:
       - GET handler.
       - Authorization header check: must equal `Bearer ${process.env.CRON_SECRET}` (per Vercel cron-jobs skill convention; 401 if missing/mismatch).
       - Call `runEvalBrier({})`.
       - On Vercel Functions (read-only FS except /tmp), write JSON to `/tmp/brier-{date}.json` AND, if `process.env.BLOB_READ_WRITE_TOKEN` is set, upload via `@vercel/blob` to `brier/brier-{date}.json`. In local dev, write to `reports/brier-{date}.json` directly.
       - On ship_gate_failed in any classifier, log a structured warning visible in `vercel logs --follow`.
       - Response: `{ ok: true, results: EvalBrierResult[] }`.

    3. Add to `vercel.json` crons[]:
       ```json
       { "path": "/api/cron/eval-brier", "schedule": "0 8 * * 1" }
       ```
       (Mondays 08:00 UTC — staggered after 20-Z-03's daily crons which run earlier.)

    4. Create `src/app/api/insights/calibration/route.ts`:
       - GET handler.
       - Read the newest `reports/brier-*.json` (or Vercel Blob `brier/` prefix sorted by key desc in prod).
       - Return `{ results: EvalBrierResult[], computed_at: string }`.
       - 404 if no reports exist.

    5. Create `src/app/insights/calibration/page.tsx`:
       - Server component.
       - Fetch from `/api/insights/calibration`.
       - Render an empty state with "No Brier evaluation yet — first run is scheduled Monday 08:00 UTC" when 404.
       - For each result, render `<BrierTile result={r} />` and `<ReliabilityDiagram result={r} />`.

    6. Create `src/app/insights/calibration/components/BrierTile.tsx`:
       - Props: `result: EvalBrierResult`.
       - Display classifier_version, n, base_rate, Brier (large number), stacked Reliability/Resolution/Uncertainty bar, ship-gate badge (green Brier ≤ 0.24 / yellow 0.24–0.25 / red > 0.25 / grey insufficient_data).
       - Help-text section noting T-20-C-02-04 multimodal limitation.

    7. Create `src/app/insights/calibration/components/ReliabilityDiagram.tsx`:
       - Props: `result: EvalBrierResult`.
       - Render an SVG (no chart-library dep — Cipher avoids them per existing /insights pattern):
         - Identity diagonal (y=x) as dashed reference line
         - `corp.recalibrated_curve` as the isotonic step curve
         - `corp.bin_counts` as a frequency histogram along the bottom (T-20-C-02-04 multimodal defense)
         - Axis labels: x="Predicted P(beats SPY)", y="Empirical frequency".

    8. Edit `src/app/insights/sentiment-health/page.tsx` (owned by 20-Z-03 — additive edit to add a top-level link tile to /insights/calibration). The edit is bounded to ≤15 LOC: a single new <Link> tile in the existing tiles grid. Coordinate with 20-Z-03 (Wave Z) by noting in this plan's summary that 20-Z-03 must merge first; since 20-Z-03 is in Wave Z and this is Wave C, that dependency is wave-ordered.
  </action>
  <verify>
    <automated>grep -q "Bearer \${process.env.CRON_SECRET}" src/app/api/cron/eval-brier/route.ts && grep -q "eval-brier" vercel.json && grep -q "0 8 \* \* 1" vercel.json</automated>
  </verify>
  <done>cron + API + page + 2 tiles committed; vercel.json cron entry present; page renders empty state in local dev without seeded data</done>
</task>

<task type="auto" tdd="true" id="20-C-02-07">
  <name>Task 7: Integration test — seed SentimentObservation, run eval-brier, assert identity + ship-gate branches</name>
  <files>tests/integration/eval-brier.integration.test.ts</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (insertObservation DAO signature)
    - scripts/eval-brier.ts (runEvalBrier export from Task 6)
    - tests/integration/sentiment-observation.integration.test.ts (the convention from 20-Z-01 — match the seeded-via-DAO + cleanup-via-prisma pattern)
  </read_first>
  <behavior>
    Live-Neon integration test. Requires DATABASE_URL set; skip with `it.skipIf(!process.env.DATABASE_URL)` in CI envs without it (per project convention).

    Test cases:
    1. **n=200 above-floor evaluated branch** — seed 200 SentimentObservation rows for ticker 'TEST-BRIER-1' under classifier_version='stocktwits-tag-v1' with classifier_score ∈ {-1, 0, +1} distributed to give base_rate near 0.5. Insert known forward-return outcomes by stubbing the alpha-vs-SPY surface (use a module-level test helper that intercepts the call by ticker prefix 'TEST-BRIER-' and returns deterministic values from a seeded map). Run runEvalBrier({}). Assert:
       - results[].classifier_version contains 'stocktwits-tag-v1'
       - results[].n === 200
       - results[].status === 'evaluated'
       - |bs_check − brier| ≤ 1e-9 (decomposition identity)
       - |bs_check − (reliability − resolution + uncertainty)| ≤ 1e-9
       - reports/brier-{today}.json was written and is parseable

    2. **n=50 below-floor insufficient_data branch** — seed 50 SentimentObservation rows for ticker 'TEST-BRIER-2' under classifier_version='gemini-per-doc-v2'. Run. Assert status='insufficient_data', ship_gate not evaluated.

    3. **Ship-gate failed branch** — seed 200 SentimentObservation rows for ticker 'TEST-BRIER-3' under classifier_version='broken-classifier-v0' with classifier_score = +1 for ALL rows (constant overconfident bullish) against outcomes following base_rate 0.5. Brier will be (0.5)² = 0.25 (exactly random baseline; fails ≤ 0.24 gate). Assert:
       - status === 'ship_gate_failed'
       - reports/brier-{today}.md written
       - The .md file contains 'REMEDIATION_RECOMMENDATION' and 'broken-classifier-v0'

    4. **PIT defense** — assert that the script's Prisma queries observed during the test only filter on `fetched_at`. Use Prisma's $extends({ query: { sentimentObservation: { findMany: { ... } } } }) instrumentation OR a simpler grep-of-source check after the run.

    Cleanup: delete all SentimentObservation rows where ticker LIKE 'TEST-BRIER-%' AND all reports/brier-{today}.{json,md} files written during the test.
  </behavior>
  <action>
    Create tests/integration/eval-brier.integration.test.ts. Skip-on-missing-DATABASE_URL via `describe.skipIf(!process.env.DATABASE_URL)('eval-brier integration', () => {...})`.

    Match the pre-existing live-Neon integration test pattern from `tests/integration/sentiment-observation.integration.test.ts` (uses insertObservation DAO + manual cleanup). Use `vi.doMock('@/lib/learning', () => ({ ...actual, computeAlphaVsSPY: vi.fn((ticker, ...) => seededAlphaMap.get(ticker)) }))` for the alpha-vs-SPY stub.

    Run the test with `npm run test:integration` (or `npx vitest run --config vitest.integration.config.ts tests/integration/eval-brier.integration.test.ts`).
  </action>
  <verify>
    <automated>npx vitest run --config vitest.integration.config.ts tests/integration/eval-brier.integration.test.ts</automated>
  </verify>
  <done>3 branches exercised; identity asserted at 1e-9; reports written + cleaned up</done>
</task>

<task type="auto" id="20-C-02-08">
  <name>Task 8: Full suite + commit</name>
  <files>(none — verification + commit only)</files>
  <read_first>
    - All test files committed in this plan
  </read_first>
  <action>
    1. Run the full unit suite: `npx vitest run` — assert exit 0.
    2. Run the integration suite: `npx vitest run --config vitest.integration.config.ts` — assert exit 0 (skip-on-missing-DATABASE_URL is acceptable on CI envs without it; locally must pass).
    3. Run typecheck if the project has one: `npx tsc --noEmit` (skip silently if no tsconfig.json).
    4. Run lint if the project has one: `npm run lint` (skip silently if not defined in package.json).
    5. Verify the eight Hard Cleanup Gates manually:
       - Gate 5 (Decomposition Identity): `grep -c "1e-9" tests/stats/brier.unit.test.ts` ≥ 3
       - Gate 6 (Murphy Reference): `grep -q "Murphy 1973\|Bröcker" tests/stats/brier.unit.test.ts`
       - Gate 7 (Sample Floor): `grep -q "insufficient_data" tests/integration/eval-brier.integration.test.ts`
       - Gate 8 (PIT): `grep -rE "published_at" scripts/eval-brier.ts src/lib/stats/*.ts src/app/api/cron/eval-brier/route.ts` returns no matches
       - Gate 9 (Ship-gate reporting): `grep -q "REMEDIATION_RECOMMENDATION" scripts/eval-brier.ts`
       - Gate 10 (Cron auth): `grep -q "Bearer \${process.env.CRON_SECRET}" src/app/api/cron/eval-brier/route.ts`
    6. Stage all files; commit with message:
       ```
       feat(20-c-02): Brier decomposition + CORP reliability diagram

       Pure-function brierScore + brierDecomposition (Murphy 1973 identity
       BS = R − Res + U asserted at 1e-9) + isotonicRegression PAV +
       corpReliabilityDiagram (Dimitriadis-Gneiting-Jordan PNAS 2021).
       Weekly eval-brier cron emits reports/brier-{date}.{json,md} per
       classifier_version. /insights/calibration renders BrierTile +
       ReliabilityDiagram. Ship gate Brier ≤ 0.24 with base-rate-imbalance
       defense (T-20-C-02-01) and n=100 minimum-sample floor (T-20-C-02-02).

       PIT join on fetched_at only (T-20-C-02-05). No Prisma schema change —
       results live as JSON artifacts under reports/.

       Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       ```
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "20-c-02"</automated>
  </verify>
  <done>Full suite green; commit landed; all 10 Hard Cleanup Gates verifiable via grep</done>
</task>

</tasks>

<verification>

## Numerical acceptance criteria

1. `brierScore` on Murphy 1973 / Bröcker-Smith 2007 reference example matches expected value within 1e-6.
2. `brierDecomposition` identity `|bs_check − (reliability − resolution + uncertainty)| ≤ 1e-9` on 3 distinct seeded datasets (datasets A, B, C in Task 1).
3. `brierDecomposition` identity `|bs_check − brierScore(p, o)| ≤ 1e-9` on the same 3 datasets.
4. `isotonicRegression` monotonicity invariant: 1000 random inputs (mulberry32(42)) produce non-decreasing output.
5. `corpReliabilityDiagram` near-identity recovery on perfectly-calibrated synthetic Bernoulli with N=2000: sup-norm deviation of recalibrated_curve from y=x is ≤ 0.1.
6. Integration test n=200 branch: status='evaluated', identity holds at 1e-9.
7. Integration test n=50 branch: status='insufficient_data', ship_gate skipped.
8. Integration test n=200 constant-overconfident branch: status='ship_gate_failed', reports/brier-{today}.md written with REMEDIATION_RECOMMENDATION.
9. `grep -E "published_at" scripts/eval-brier.ts src/lib/stats/*.ts src/app/api/cron/eval-brier/route.ts` returns ZERO matches (PIT discipline).
10. `vercel.json` contains cron entry `{ "path": "/api/cron/eval-brier", "schedule": "0 8 * * 1" }`.
11. `HYPERPARAMETERS.md` contains `## Brier Calibration (20-C-02)` with citations to Brier 1950, Murphy 1973, Dimitriadis-Gneiting-Jordan 2021.
12. `/insights/calibration` page renders empty state without seeded data; renders BrierTile + ReliabilityDiagram with seeded data.

</verification>

<success_criteria>

This plan is DONE when:

- [ ] `npx vitest run` exits 0 (all unit tests green, ≥6 in brier.unit.test.ts, ≥3 each in isotonic + corp tests)
- [ ] `npx vitest run --config vitest.integration.config.ts tests/integration/eval-brier.integration.test.ts` exits 0 (with DATABASE_URL set)
- [ ] All 10 Hard Cleanup Gates verifiable via grep / test exit / file existence
- [ ] `git log -1 --pretty=%s` matches "20-c-02"
- [ ] No published_at references in any file owned by this plan
- [ ] HYPERPARAMETERS.md §Brier Calibration section landed
- [ ] reports/.gitkeep + .gitignore line landed
- [ ] vercel.json cron entry landed
- [ ] /insights/calibration page accessible (renders empty state if no reports yet)

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-C-02-SUMMARY.md` covering:
- Brier numbers produced by the integration test seeded data (per classifier_version)
- Whether the ship-gate-failed branch fired and what the dominant_failure_mode was
- File counts: LOC of brier.ts, isotonic.ts, eval-brier.ts
- Ready-for-consumers note: 20-B-03 can now read reports/brier-*.json for the Brier co-gate; 20-C-06 fairness audit can stratify by cap_class using the same Brier primitive
</output>
