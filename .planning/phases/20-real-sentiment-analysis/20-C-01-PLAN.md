---
phase: 20
plan: 20-C-01
wave: C
type: execute
depends_on: ['20-Z-01']
files_modified:
  - prisma/schema.prisma
  - src/lib/stats/newey-west.ts
  - src/lib/stats/bh-fdr.ts
  - src/lib/sentiment/per-source-ic.ts
  - scripts/compute-per-source-ic.ts
  - src/app/api/cron/per-source-ic/route.ts
  - src/app/insights/sentiment-sources/page.tsx
  - src/app/insights/sentiment-sources/components/SourceTile.tsx
  - src/app/api/insights/sentiment-sources/route.ts
  - vercel.json
  - HYPERPARAMETERS.md
  - tests/stats-newey-west.unit.test.ts
  - tests/stats-bh-fdr.unit.test.ts
  - tests/sentiment-per-source-ic.unit.test.ts
  - tests/integration/per-source-ic.integration.test.ts
  - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-per-source-ic.md
autonomous: true
requirements: []
shadow_required: true
shadow_skip_reason: ""
hard_cleanup_gate: true
must_haves:
  truths:
    - "PerSourceIC Prisma model exists in production Neon with columns (id, source_id, computed_at, ic_20d, icir_20d, ic_p_value_nw, ic_p_value_bh_fdr, ic_se_nw, n_observations, forward_horizon_days, nw_lag, model_version) and composite index on (source_id, computed_at DESC)"
    - "neweyWestSE(residuals, lag) is a PURE function implementing the Bartlett-kernel HAC formula: SE_NW² = γ₀ + 2·Σ(1 - k/(L+1))·γ_k for k=1..L where γ_k is the autocovariance at lag k; documented inline with full formula + Newey-West 1987 citation"
    - "ttestNW(beta, se_nw, df) returns a two-sided p-value via the Student-t CDF on the studentized statistic t = beta / se_nw with df degrees of freedom"
    - "spearmanIC reuses src/lib/reasoning/alpha-decay-monitor.ts rollingSpearmanIC — no duplicate Spearman implementation in this plan (re-export or thin wrapper only)"
    - "rollingICIR(perDayIC, window=20) returns mean(IC) / std(IC) over the trailing window; sample-std (n-1 denom); returns null when std == 0 or window < 2"
    - "computePerSourceIC(source_id, horizon: 7|30, asOf) joins SentimentObservation rows (via 20-Z-01) to forward alpha-vs-SPY on fetched_at + days_after (NEVER published_at — enforced by 20-Z-07 lookahead test); returns null when n_observations < 20 (cold-start) AND writes ZERO PerSourceIC row in that case"
    - "Newey-West lag per horizon: 7d-forward uses lag=5; 30d-forward uses lag=10; both derived from Newey-West 1987 rule L = floor(4·(T/100)^(2/9)) with T = window length × cross-section size, documented in MODEL-CARD-per-source-ic.md and HYPERPARAMETERS.md"
    - "Benjamini-Hochberg FDR correction at α=0.05 applied across all (source × horizon) p-values within a single cron run; corrected p-values written to ic_p_value_bh_fdr column and are monotonically ≥ raw ic_p_value_nw"
    - "Daily cron /api/cron/per-source-ic at schedule '0 5 * * *' (05:00 UTC, 1h before alpha-decay-watch); guarded by Authorization: Bearer ${CRON_SECRET}; writes one row per (source × horizon) per day; idempotent on rerun via composite unique (source_id, computed_at::date, forward_horizon_days, model_version)"
    - "/insights/sentiment-sources renders per-source tiles for each source × {7d, 30d} horizon with ICIR value, significance asterisks (* p_bh<0.05, ** p_bh<0.01, *** p_bh<0.001), n_observations, and a 'COLD START' badge when n < 20"
    - "Auto-down-weight signal: monitor query reads the last 2 consecutive 20d-window PerSourceIC rows per (source, horizon); when BOTH have icir_20d < 0.3, the dashboard tile renders an 'AUTO-DOWN-WEIGHT TRIGGERED' badge AND the row is consumed by 20-B-04 SourceTier.weight reduction (FORWARD-REFERENCE — 20-B-04 reads PerSourceIC; this plan does NOT modify SourceTier)"
    - "Cron wall-clock < 5 minutes per run for current source cardinality (≤ 10 sources × 2 horizons = ≤ 20 PerSourceIC.computePerSourceIC invocations); measured via withTelemetry (20-Z-03) when that plan is live, else via console.timeEnd"
    - "MODEL-CARD-per-source-ic.md committed in Mitchell 2019 format covering: training data (SentimentObservation × PriceOutcome forward alpha-vs-SPY), evaluation (ICIR / Newey-West p-value / BH-FDR correction), intended use (source-tier weighting in 20-B-04), OOD behavior (new source < 20 obs returns null), known failure modes (sparse small-cap coverage inflates IC variance), retrain cadence (daily cron)"
    - "Newey-West unit test asserts against scipy reference values within 1e-6: on the canonical test vector residuals=[1,-1,1,-1,1,-1,1,-1,1,-1] (period-2 alternating), SE_NW at lag=0 equals sqrt(γ₀) = 1.0 exactly; at lag=2 with Bartlett weights computed verbatim"
    - "BH-FDR unit test asserts on the canonical Benjamini-Hochberg 1995 example p-values [0.001, 0.008, 0.039, 0.041, 0.042, 0.060, 0.074, 0.205] at α=0.05 — correct rejections match the original paper"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "PerSourceIC append-only history model + composite unique + composite index"
      contains: "model PerSourceIC"
    - path: "src/lib/stats/newey-west.ts"
      provides: "neweyWestSE + ttestNW pure functions with Bartlett-kernel HAC formula"
      contains: "neweyWestSE"
    - path: "src/lib/stats/bh-fdr.ts"
      provides: "benjaminiHochbergFDR pure function — multiple-hypothesis correction at α=0.05"
      contains: "benjaminiHochbergFDR"
    - path: "src/lib/sentiment/per-source-ic.ts"
      provides: "spearmanIC (re-export from alpha-decay-monitor) + rollingICIR + computePerSourceIC (the only DB-touching function)"
      contains: "computePerSourceIC"
    - path: "scripts/compute-per-source-ic.ts"
      provides: "Daily recompute — iterates (source × horizon), persists PerSourceIC rows, applies BH-FDR correction across all today's p-values"
      contains: "benjaminiHochbergFDR"
    - path: "src/app/api/cron/per-source-ic/route.ts"
      provides: "Cron entrypoint with Bearer ${CRON_SECRET} guard, invokes runComputePerSourceIC()"
      contains: "Bearer ${process.env.CRON_SECRET}"
    - path: "src/app/insights/sentiment-sources/page.tsx"
      provides: "Per-source ICIR tiles dashboard — server component"
      contains: "Sentiment Sources"
    - path: "src/app/insights/sentiment-sources/components/SourceTile.tsx"
      provides: "Per-source tile renderer with significance asterisks + AUTO-DOWN-WEIGHT badge"
      contains: "AUTO-DOWN-WEIGHT"
    - path: "src/app/api/insights/sentiment-sources/route.ts"
      provides: "JSON endpoint returning latest PerSourceIC row per (source, horizon) + auto-down-weight flag from last 2 consecutive 20d windows"
      contains: "icir_20d"
    - path: "vercel.json"
      provides: "Daily cron entry '0 5 * * *' for /api/cron/per-source-ic"
      contains: "per-source-ic"
    - path: "HYPERPARAMETERS.md"
      provides: "20-C-01 entry — NW lag table (7d → 5, 30d → 10), BH-FDR α=0.05, n_min=20, ICIR threshold 0.3, consecutive-windows = 2"
      contains: "20-C-01"
    - path: ".planning/phases/20-real-sentiment-analysis/MODEL-CARD-per-source-ic.md"
      provides: "Mitchell-2019 model card per 20-Z-02 template"
      contains: "Newey-West"
    - path: "tests/stats-newey-west.unit.test.ts"
      provides: "≥6 unit cases including scipy-equivalence on canonical residuals + lag=0 reduction + Bartlett-weight monotonicity"
    - path: "tests/stats-bh-fdr.unit.test.ts"
      provides: "≥4 unit cases including the BH 1995 paper example + monotonicity p_corrected ≥ p_raw"
    - path: "tests/sentiment-per-source-ic.unit.test.ts"
      provides: "≥8 unit cases — spearmanIC=1.0 on monotone; rollingICIR on synthetic series; computePerSourceIC null when n<20; lag selection per horizon"
    - path: "tests/integration/per-source-ic.integration.test.ts"
      provides: "End-to-end live-Neon — fixture SentimentObservation + PriceOutcome rows; cron writes PerSourceIC; dashboard endpoint returns ICIR with significance; auto-down-weight fires on synthetic ICIR < 0.3 × 2 windows"
  key_links:
    - from: "src/lib/sentiment/per-source-ic.ts spearmanIC"
      to: "src/lib/reasoning/alpha-decay-monitor.ts rollingSpearmanIC"
      via: "thin re-export — NO duplicate rank-correlation implementation"
      pattern: "rollingSpearmanIC"
    - from: "src/lib/sentiment/per-source-ic.ts computePerSourceIC"
      to: "prisma.sentimentObservation (20-Z-01) joined to prisma.priceOutcome on fetched_at + days_after"
      via: "PIT-safe join — uses SentimentObservation.fetched_at (// PIT-INVARIANT) NEVER published_at; 20-Z-07 lookahead test enforces"
      pattern: "fetched_at"
    - from: "scripts/compute-per-source-ic.ts (post-loop)"
      to: "src/lib/stats/bh-fdr.ts benjaminiHochbergFDR"
      via: "single BH-FDR pass over all today's (source × horizon) p-values before persistence"
      pattern: "benjaminiHochbergFDR"
    - from: "src/app/api/cron/per-source-ic/route.ts"
      to: "vercel.json crons entry '0 5 * * *'"
      via: "Vercel daily cron schedule"
      pattern: "per-source-ic"
    - from: "src/app/insights/sentiment-sources/page.tsx"
      to: "/api/insights/sentiment-sources JSON endpoint"
      via: "server-component fetch of latest PerSourceIC per (source × horizon) + 2-window down-weight monitor"
      pattern: "sentiment-sources"
    - from: "PerSourceIC table (this plan's output)"
      to: "20-B-04 SourceTier recompute consumer (FORWARD-REFERENCE)"
      via: "20-B-04 scripts/recompute-source-tiers.ts reads mean_ic_90d derived from PerSourceIC.ic_20d; auto-down-weight signal feeds SourceTier.weight reduction"
      pattern: "PerSourceIC"
---

# Plan 20-C-01: Per-input-source rolling ICIR with Newey-West significance + BH-FDR correction

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE blocking step: `npx prisma db push` of the new `PerSourceIC` model against live Neon (Task 2). All other tasks are autonomous. After the operator confirms the push, the remaining tasks (pure-function stats modules, IC computation, cron, dashboard, integration test, model card, commit) proceed without further prompts. The dashboard "≥7 days of live data" acceptance criterion is satisfied passively by the running cron after this plan ships; the integration test in Task 11 directly inserts fixture rows so the dashboard gate is mechanically verifiable immediately post-deploy.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **No shadow lifecycle to graduate as a code path** — `shadow_required: true` reflects the operational cutover: PerSourceIC writes run in parallel from day 1; the cutover is "≥7d of dashboard data accumulated AND 20-B-04 auto-down-weight wiring confirmed reading from this table". This is a data-readiness gate, not a flag flip. No old code is deleted (additive table + new dashboard tab + new pure modules).
2. **No old code deleted** — additive: new table, new files, new dashboard route. Existing alpha-decay-watch cron (19-A-05) and SentimentObservation writer (20-Z-01) are untouched.
3. **No feature flag introduced for the core computation** — the cron always runs; failures are logged-and-continue per row, never block subsequent (source × horizon) combinations.
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), and `npm run test:e2e` (Playwright) all green on `main` post-commit.
5. **Schema Push Gate** (Task 2): `npx prisma db push` succeeded against live `DATABASE_URL` AND `tests/integration/per-source-ic.integration.test.ts` writes ≥6 PerSourceIC rows in a single cron-equivalent invocation against fixture data (one per source × horizon for ≥3 sources).
6. **Numerical Reference Gate**: `npx vitest run tests/stats-newey-west.unit.test.ts -t scipy-equivalence` passes (SE_NW matches commited scipy reference value within 1e-6 on canonical residuals fixture).
7. **BH-FDR Gate**: `npx vitest run tests/stats-bh-fdr.unit.test.ts -t bh-1995-paper-example` passes (matches the canonical Benjamini-Hochberg 1995 paper example rejections at α=0.05).
8. **Dashboard Gate**: After Task 2 push + integration-test fixture insert, `curl -fs http://localhost:3000/api/insights/sentiment-sources` returns 200 with JSON containing at least one source entry whose `ic_20d` is non-null and `forward_horizon_days ∈ {7, 30}`.
9. **Auto-Down-Weight Gate**: Integration test inserts synthetic PerSourceIC rows with icir_20d < 0.3 for 2 consecutive windows on a single source and asserts the API endpoint flags that source with `auto_down_weight: true`.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — ICIR threshold 0.3 and consecutive-window count 2 are the literal values from CONTEXT.md spec line 124 ("Auto-down-weight (or alert) when ICIR < 0.3 for two consecutive windows"). The Newey-West lag per horizon (7d → 5, 30d → 10) is derived from the Newey-West 1987 rule `L = floor(4·(T/100)^(2/9))`, computed verbatim in MODEL-CARD-per-source-ic.md and surfaced in HYPERPARAMETERS.md. The BH-FDR α=0.05 is the canonical Benjamini-Hochberg 1995 default. The n_min_observations = 20 mirrors the rolling-20d window length (per CONTEXT.md "rolling-20d cross-sectional Spearman IC"). Zero hand-picked values.
- **S2 (PIT discipline)** — CORE INVARIANT. `computePerSourceIC` joins `SentimentObservation.fetched_at` to `PriceOutcome` via `recorded_at` derived from `fetched_at + days_after`, NEVER `published_at`. 20-Z-07 lookahead-bias regression test instruments this exact path. The grep marker `// PIT-INVARIANT` on the join site is the contract.
- **S3 (per-plan shadow lifecycle)** — `shadow_required: true` here reflects the data-readiness cutover (≥7d dashboard data + 20-B-04 consumer wired), not a flag flip. The PerSourceIC table is append-only and consumed downstream by 20-B-04 (forward-reference). 20-B-04's recompute script gracefully handles an empty PerSourceIC table — so this plan can merge before 20-B-04 fully cuts over.
- **S4 (model card)** — `MODEL-CARD-per-source-ic.md` ships in this plan (Task 10), Mitchell 2019 format, references 20-Z-02 template. Retrain cadence: daily cron. Known failure modes: sparse small-cap coverage inflates IC variance; cross-sectional N < 5 produces unstable Spearman; new sources < 20 obs return null.
- **S5 (pinned model+prompt versions)** — `model_version` column on PerSourceIC captures the computation version (e.g., `per-source-ic-v1`). Schema change → bump model_version → new rows; never overwrite.
- **S6 (telemetry on every external call)** — N/A for this plan (no external API calls — pure DB read + DB write). 20-Z-03 telemetry wraps external adapters; this plan is database-internal.
- **S7 (threat model)** — Five plan-level threats T-20-C-01-{01..05} below; T-20-C-01-01 maps to phase catalog T-28-002 (lookahead bias), T-20-C-01-05 is the multiple-hypothesis testing inflation specifically mitigated by BH-FDR.
- **S8 (numerical acceptance)** — every DONE criterion is a grep / SELECT / test exit / numeric assertion. Zero adjectives.
- **S9 (failure-mode coverage)** — Unit test on Newey-West scipy-equivalence; unit test on BH 1995 paper example; integration test on synthetic auto-down-weight pattern. The 8-golden-ticker regression suite (20-D-04) extends to verify PerSourceIC is populated for the tickers that have community-data coverage.
- **S10 (regulatory hygiene)** — N/A (no per-user surface; internal dashboard only).

</universal_preamble>

<objective>
Compute a per-input-source rolling 20-day cross-sectional Spearman Information Coefficient (IC) of `bull_pct - bear_pct` against forward 7-day and 30-day alpha-vs-SPY, daily. Derive the IC-to-IC-std ratio (ICIR) over the rolling window. Test significance with Newey-West HAC standard errors (Bartlett kernel) at lag=5 for the 7d horizon and lag=10 for the 30d horizon, both derived from the Newey-West 1987 rule L = floor(4·(T/100)^(2/9)). Apply Benjamini-Hochberg FDR correction at α=0.05 across the daily (source × horizon) panel of p-values to control Type-I error inflation from testing many sources simultaneously. Persist results to a new `PerSourceIC` Prisma table. Surface per-source tiles with significance asterisks on `/insights/sentiment-sources`. Flag sources with `ICIR < 0.3` for two consecutive 20-day windows as candidates for auto-down-weighting; 20-B-04 (forward-reference) consumes this signal in its monthly SourceTier recompute.

Purpose: CONTEXT.md spec §20-C-01 requires per-source ICIR with Newey-West significance to be the data-driven input to 20-B-04's source-tier weights (replacing any hand-curated authority table). Without per-source IC measurement, every downstream "trust this source more" claim is unfalsifiable. Without Newey-West correction, autocorrelation in daily IC series inflates t-statistics 2-3× for the 30d-forward horizon (overlapping returns). Without BH-FDR, testing ~10 sources × 2 horizons daily at uncorrected α=0.05 gives ~1 false positive per day by chance.

Scope guard — this plan ships **per-source ICIR computation + significance + dashboard + auto-down-weight SIGNAL ONLY**. The consumer (SourceTier weight reduction) is 20-B-04. The Brier-decomposition reliability diagram is 20-C-02. The Cresci-2019 bot filter is 20-C-03. The pump/dump detector is 20-C-04. The joint sentiment×momentum feature ablation is 20-C-05. The fairness audit by cap_class is 20-C-06. The new lookahead-bias regression test is 20-Z-07. The new ProviderCallLog telemetry is 20-Z-03. NONE OF THE ABOVE are in this plan.

Output:
- 1 new Prisma model `PerSourceIC` (append-only history) + 1 composite unique + 1 composite index
- 1 new pure stats module `src/lib/stats/newey-west.ts` (~110 LOC) — `neweyWestSE`, `ttestNW`
- 1 new pure stats module `src/lib/stats/bh-fdr.ts` (~60 LOC) — `benjaminiHochbergFDR`
- 1 new module `src/lib/sentiment/per-source-ic.ts` (~150 LOC) — `spearmanIC` (re-export), `rollingICIR`, `computePerSourceIC` (DB-touching)
- 1 new recompute script `scripts/compute-per-source-ic.ts` (~180 LOC)
- 1 new cron route `src/app/api/cron/per-source-ic/route.ts` (~50 LOC)
- 1 new dashboard route `src/app/insights/sentiment-sources/page.tsx` + 1 tile component
- 1 new JSON API endpoint `/api/insights/sentiment-sources` (~80 LOC)
- vercel.json crons entry (daily)
- HYPERPARAMETERS.md 20-C-01 entry
- 3 unit test files (Newey-West, BH-FDR, per-source-ic) + 1 integration test file
- 1 model card (Mitchell 2019 format)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-B-04-PLAN.md
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md
@prisma/schema.prisma
@src/lib/reasoning/alpha-decay-monitor.ts
@src/lib/learning.ts
@src/lib/db.ts
@src/app/api/cron/alpha-decay-watch/route.ts
@src/app/insights/page.tsx
@vercel.json
@HYPERPARAMETERS.md
@CLAUDE.md

<interfaces>

### Existing infrastructure to reuse (DO NOT duplicate)

```typescript
// src/lib/reasoning/alpha-decay-monitor.ts — Phase 19-A-05, EXISTING
//   Reused verbatim. Spearman rank-IC of two equal-length vectors.
//   Returns 0 (not NaN) on length < 2 or constant input. Throws on length mismatch.
export function rollingSpearmanIC(args: {
  predictions: number[];
  realizedReturns: number[];
}): number;
```

### New: Newey-West HAC SE (pure module)

```typescript
// src/lib/stats/newey-west.ts — NEW

/**
 * Newey-West 1987 heteroskedasticity- and autocorrelation-consistent (HAC)
 * standard error using the Bartlett (linear-decay) kernel.
 *
 * For a residual series {e_t} of length T:
 *
 *   γ_0 = (1/T) · Σ_{t=1..T} e_t²                                  (variance)
 *   γ_k = (1/T) · Σ_{t=k+1..T} e_t · e_{t-k}                       (lag-k autocovariance)
 *
 *   SE_NW² = γ_0 + 2 · Σ_{k=1..L} (1 - k/(L+1)) · γ_k              (Bartlett-weighted sum)
 *   SE_NW  = sqrt(max(0, SE_NW²))                                   (clamp negative to 0)
 *
 * The (1 - k/(L+1)) factor is the Bartlett kernel — linearly tapers higher-lag
 * autocovariances to zero at lag = L+1. Guarantees positive-semi-definite
 * variance estimator (Newey & West 1987 Theorem 2).
 *
 * Reference: Newey & West (1987), "A Simple, Positive Semi-Definite,
 * Heteroskedasticity and Autocorrelation Consistent Covariance Matrix,"
 * Econometrica 55(3): 703-708.
 *
 * Lag selection rule (Newey-West 1987): L = floor(4·(T/100)^(2/9)).
 * For Phase 20-C-01 we pre-bake the rule into HYPERPARAMETERS.md per horizon:
 *   - 7d-forward (T ≈ 20-day window × ~5 sources): L = 5
 *   - 30d-forward (T ≈ same window, longer overlap): L = 10
 *
 * @param residuals  the residual series (typically demeaned IC values)
 * @param lag        Bartlett-kernel truncation lag L (>= 0)
 * @returns          SE_NW — non-negative scalar
 * @throws           when lag < 0, lag >= residuals.length, residuals.length < 2,
 *                   or any residual is non-finite
 */
export function neweyWestSE(residuals: number[], lag: number): number;

/**
 * Two-sided p-value for the studentized statistic t = beta / se_nw under
 * Student-t(df). Pure function — no external numerical-libraries dependency.
 * Implements the regularized incomplete beta function via continued fraction
 * (Lentz's algorithm, Numerical Recipes 6.4) — keeps the module DB-free and
 * dep-free.
 *
 * @param beta    coefficient estimate (e.g. mean IC)
 * @param se_nw   Newey-West standard error from neweyWestSE
 * @param df      degrees of freedom (typically n_observations - 1)
 * @returns       two-sided p-value ∈ [0, 1]; returns 1 when se_nw === 0
 */
export function ttestNW(beta: number, se_nw: number, df: number): number;
```

### New: Benjamini-Hochberg FDR correction (pure module)

```typescript
// src/lib/stats/bh-fdr.ts — NEW

/**
 * Benjamini-Hochberg 1995 false-discovery-rate correction at level alpha.
 *
 * Given m raw p-values {p_1, ..., p_m}:
 *   1. Sort ascending: p_(1) ≤ p_(2) ≤ ... ≤ p_(m)
 *   2. Find largest k such that p_(k) ≤ (k/m) · alpha
 *   3. Reject H_0 for the k smallest p-values
 *
 * For per-test "corrected" p-values (BH-adjusted):
 *   p_corrected_(i) = min_{j >= i} (m/j) · p_(j)        (running min from the top)
 *   then clamped to [0, 1]
 *
 * Returned p_corrected_(i) is monotonically >= p_raw_(i) (UNIT TEST asserts this).
 *
 * Reference: Benjamini & Hochberg (1995), "Controlling the False Discovery
 * Rate: A Practical and Powerful Approach to Multiple Testing," Journal of
 * the Royal Statistical Society Series B 57(1): 289-300.
 *
 * @param pValues   the raw p-values to correct (order preserved in return)
 * @param alpha     FDR level (default 0.05)
 * @returns         { corrected: number[], rejected: boolean[] } — same length & order as input
 */
export function benjaminiHochbergFDR(
  pValues: number[],
  alpha?: number,
): { corrected: number[]; rejected: boolean[] };
```

### New: Per-source IC orchestration

```typescript
// src/lib/sentiment/per-source-ic.ts — NEW

import { rollingSpearmanIC } from '@/lib/reasoning/alpha-decay-monitor';

/**
 * Thin re-export — keeps a single Spearman implementation across the codebase.
 * MUST NOT introduce a parallel rank-correlation function.
 */
export const spearmanIC: typeof rollingSpearmanIC;

/**
 * Rolling ICIR (Information Coefficient Information Ratio).
 *
 *   ICIR = mean(IC) / sample_std(IC)        over the trailing `window` days
 *
 * Sample std uses (n-1) denominator (Bessel correction). Returns null when:
 *   - perDayIC.length < window
 *   - sample_std(IC) === 0 (constant IC — degenerate)
 *
 * @param perDayIC  daily IC series, ordered oldest → newest
 * @param window    rolling window length, default 20
 * @returns         ICIR scalar or null
 */
export function rollingICIR(perDayIC: number[], window?: number): number | null;

/**
 * Compute per-source IC for a single (source, horizon, asOf) tuple.
 *
 * Joins:
 *   SentimentObservation (PIT-safe via fetched_at — // PIT-INVARIANT)
 *   ⨯ PriceOutcome (days_after = horizon, recorded_at derived from fetched_at + days_after)
 *
 * Per-day cross-sectional Spearman IC across all tickers in the source on that
 * day, then aggregated over the trailing 20-day window. Newey-West SE applied
 * to the residual series (IC_t - mean(IC)). p-value via ttestNW.
 *
 * Returns null and writes ZERO rows when:
 *   - distinct fetched_at days in window < 20 (cold-start; per CONTEXT.md spec)
 *   - cross-sectional N per day < 5 (Spearman unstable below this)
 *
 * @param source_id  e.g. 'stocktwits' | 'reddit' | 'x' | 'news' | 'apewisdom' | 'firecrawl'
 * @param horizon    7 | 30 — forward days_after
 * @param asOf       cutoff date (exclusive); rolling 20-day window ends here
 * @returns          { ic_20d, icir_20d, ic_se_nw, ic_p_value_nw, n_observations, nw_lag } | null
 */
export async function computePerSourceIC(
  source_id: string,
  horizon: 7 | 30,
  asOf: Date,
): Promise<{
  ic_20d: number;
  icir_20d: number | null;
  ic_se_nw: number;
  ic_p_value_nw: number;
  n_observations: number;
  nw_lag: number;
} | null>;
```

### New: PerSourceIC Prisma model

```prisma
// prisma/schema.prisma — NEW model (appended after SentimentObservation)

model PerSourceIC {
  id                    String   @id @default(uuid())
  source_id             String                                              // 'stocktwits' | 'reddit' | 'x' | 'news' | 'apewisdom' | 'firecrawl'
  computed_at           DateTime @default(now()) @db.Timestamptz            // wall-clock when this row was computed; PIT-safe for downstream readers
  forward_horizon_days  Int                                                 // 7 | 30
  ic_20d                Float                                               // rolling-20d Spearman IC
  icir_20d              Float?                                              // mean(IC) / sample_std(IC); null when std == 0
  ic_se_nw              Float                                               // Newey-West standard error (Bartlett kernel)
  ic_p_value_nw         Float                                               // raw two-sided p-value via Student-t on t = ic_20d / ic_se_nw
  ic_p_value_bh_fdr     Float                                               // BH-FDR-adjusted p-value (across all today's source × horizon panel)
  n_observations        Int                                                 // distinct fetched_at days contributing to the 20d window
  nw_lag                Int                                                 // Bartlett-kernel truncation lag used (5 for h=7, 10 for h=30)
  model_version         String                                              // 'per-source-ic-v1' — bumped on algorithm change, never overwritten

  @@unique([source_id, computed_at, forward_horizon_days, model_version], map: "psic_src_date_hor_ver_uq")
  @@index([source_id, forward_horizon_days, computed_at(sort: Desc)], map: "idx_psic_src_hor_computed_at")
  @@map("per_source_ic")
}
```

### Cron route shape (mirrors existing alpha-decay-watch)

```typescript
// src/app/api/cron/per-source-ic/route.ts — NEW

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await runComputePerSourceIC({ asOf: new Date() });
  return Response.json({ ok: true, ...result });
}
```

### Dashboard JSON shape

```typescript
// /api/insights/sentiment-sources — response

interface SentimentSourcesResponse {
  generated_at: string;
  sources: Array<{
    source_id: string;
    horizons: {
      '7d':  SourceHorizonTile | null;
      '30d': SourceHorizonTile | null;
    };
  }>;
}

interface SourceHorizonTile {
  computed_at: string;
  ic_20d: number;
  icir_20d: number | null;
  ic_p_value_nw: number;
  ic_p_value_bh_fdr: number;
  significance: '' | '*' | '**' | '***';   // derived from ic_p_value_bh_fdr
  n_observations: number;
  cold_start: boolean;                     // n_observations < 20
  auto_down_weight: boolean;               // last 2 consecutive 20d-windows both have icir_20d < 0.3
  nw_lag: number;
}
```

</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-C-01-01 | Tampering (lookahead bias) | `computePerSourceIC` join between SentimentObservation and PriceOutcome | mitigate | Join joins on `SentimentObservation.fetched_at` (// PIT-INVARIANT marker from 20-Z-01) NEVER `published_at`. Source code carries the `// PIT-INVARIANT` grep marker at the join site. 20-Z-07 lookahead-bias regression test (Wave Z) instruments the production query path and fails the build on any SQL/ORM call using `published_at` for backtest joins. **Maps to phase catalog T-28-002.** **Severity: HIGH** — if violated, IC values are unfalsifiable. |
| T-20-C-01-02 | Configuration (lag too short) | Newey-West lag = 7 for 30-day horizon would under-correct autocorrelation in overlapping returns | mitigate | Per-horizon lag explicitly documented: 7-day horizon → lag=5; 30-day horizon → lag=10. Derived from Newey-West 1987 rule `L = floor(4·(T/100)^(2/9))` evaluated at T = 20-day window × ~5 sources cross-section. Lag is configurable per horizon (no hand-pick — derived from rule), surfaced in HYPERPARAMETERS.md, and overrideable via the function signature for future tuning. Unit test asserts the lag rule output for {7, 30} horizons. |
| T-20-C-01-03 | Cold-start (insufficient data) | New source with < 20 days of SentimentObservation rows returns spurious IC | mitigate | `computePerSourceIC` returns null and writes ZERO PerSourceIC rows when distinct fetched_at days in window < 20 OR cross-sectional N per day < 5. Downstream consumer (20-B-04 SourceTier) handles missing PerSourceIC as "no IC yet → default weight=1.0" (T-20-B-04-03 graceful-empty pact). Unit test asserts null-return on n<20. |
| T-20-C-01-04 | Operational (aggressive auto-down-weight) | Auto-down-weight could suppress a recoverable source | mitigate | Requires 2 consecutive 20-day windows with ICIR < 0.3 (40d total before trigger) — per CONTEXT.md spec line 124 verbatim. Reversible: when ICIR recovers ≥ 0.3 in any subsequent window, badge clears immediately. 20-B-04 SourceTier weight is computed monthly from rolling-90d IC (not the daily ICIR directly), so even with auto-down-weight triggered, the source remains in the weighted aggregate at floor `cap_min=0.5`. Integration test exercises the trigger + clearance cycle. |
| T-20-C-01-05 | Statistical (multiple-hypothesis inflation) | Daily testing of ~10 sources × 2 horizons at uncorrected α=0.05 yields ~1 false positive per day by chance | mitigate | Benjamini-Hochberg FDR correction at α=0.05 applied across all (source × horizon) p-values within a single cron run. Corrected p-values persisted in `ic_p_value_bh_fdr` column; significance asterisks on the dashboard derive from `ic_p_value_bh_fdr` (NOT `ic_p_value_nw`). Unit test asserts corrected ≥ raw monotonicity AND validates against the canonical Benjamini-Hochberg 1995 paper example. |

</threat_model>

<tasks>

<task type="auto" id="20-C-01-01">
  <name>Task 1: Add PerSourceIC Prisma model + commit schema</name>
  <read_first>
    - prisma/schema.prisma (existing structure — SentimentObservation from 20-Z-01)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (~lines 164-186 — composite unique + index pattern)
    - .planning/phases/20-real-sentiment-analysis/20-B-04-PLAN.md (~lines 76-90 — SourceTier append-only history pattern)
  </read_first>
  <action>
    Append the `PerSourceIC` model to `prisma/schema.prisma` immediately after the `SentimentObservation` model (added by 20-Z-01). Use the exact schema in `<interfaces>` above. Composite unique `(source_id, computed_at, forward_horizon_days, model_version)` mapped to `psic_src_date_hor_ver_uq`. Composite index `(source_id, forward_horizon_days, computed_at DESC)` mapped to `idx_psic_src_hor_computed_at`. Table mapped to `per_source_ic`. Do NOT touch any other model. Run `npx prisma format` to normalize whitespace.
  </action>
  <acceptance_criteria>
    - `grep -c "model PerSourceIC" prisma/schema.prisma` returns 1
    - `grep -c "psic_src_date_hor_ver_uq" prisma/schema.prisma` returns 1
    - `grep -c "idx_psic_src_hor_computed_at" prisma/schema.prisma` returns 1
    - `npx prisma format` exits 0
    - `npx prisma validate` exits 0
  </acceptance_criteria>
  <automated>npx prisma validate 2>&1 | grep -q "schema.prisma is valid"</automated>
  <done>PerSourceIC model committed to schema; prisma validate green</done>
</task>

<task type="checkpoint:human-action" id="20-C-01-02" gate="blocking">
  <name>Task 2: Operator confirms `npx prisma db push` against live Neon</name>
  <what-built>The `PerSourceIC` Prisma model in Task 1 — additive table, two indexes, one composite unique. No data migration required (new empty table).</what-built>
  <action>Operator runs `npx prisma db push` against the production `DATABASE_URL` to materialize the new `PerSourceIC` table + two indexes. Sanity-check via `psql "$DATABASE_URL" -c "\d per_source_ic"` that `psic_src_date_hor_ver_uq` (UNIQUE) and `idx_psic_src_hor_computed_at` exist. Reply "approved" to unblock the remaining autonomous tasks.</action>
  <how-to-verify>
    1. Run `npx prisma db push` against the production `DATABASE_URL`.
    2. Confirm the output reads: "🚀  Your database is now in sync with your Prisma schema."
    3. Sanity-check the table + indexes exist:
       ```
       psql "$DATABASE_URL" -c "\d per_source_ic"
       ```
       Expected indexes visible: `psic_src_date_hor_ver_uq` (UNIQUE), `idx_psic_src_hor_computed_at`.
    4. Reply with "approved" to proceed.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

<task type="auto" id="20-C-01-03" tdd="true">
  <name>Task 3: Implement + test Newey-West HAC SE (src/lib/stats/newey-west.ts)</name>
  <read_first>
    - src/lib/reasoning/alpha-decay-monitor.ts (~lines 80-105 — pearsonCorrelation pattern for pure-function style)
    - src/lib/learning.ts (~lines 345-400 — module-level pure-function conventions)
  </read_first>
  <behavior>
    Unit cases (≥6) in tests/stats-newey-west.unit.test.ts:
    1. **scipy-equivalence**: residuals = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1] (period-2 alternating, mean=0). At lag=0: SE_NW = sqrt(γ_0) = sqrt(1.0) = 1.0 exactly. At lag=2 with Bartlett weights w_1 = 1 - 1/3 = 2/3, w_2 = 1 - 2/3 = 1/3: SE_NW² = 1 + 2·(2/3)·(-1·8/10) + 2·(1/3)·(1·6/10) = ... (compute the exact expected value in the test as a literal and verify within 1e-6). Commit the scipy reference value as a comment.
    2. lag=0 reduction: for any residuals, neweyWestSE(r, 0) === sqrt(mean(r²) - mean(r)·mean(r) if demeaned else mean(r²)). Asserts the lag=0 case reduces to plain sample variance sqrt.
    3. Bartlett-weight monotonicity: at increasing lag L (within [1, length-1]), the weights `(1 - k/(L+1))` are strictly positive and decreasing in k. Assert this property holds on a constructed test vector.
    4. Throws on lag < 0; throws on lag >= residuals.length; throws on residuals.length < 2; throws on any non-finite residual.
    5. Always non-negative: for randomized inputs (seeded fixed-seed), SE_NW >= 0. Newey-West 1987 Theorem 2 guarantees PSD; clamp to 0 if numerical underflow.
    6. **ttestNW two-sided**: ttestNW(0, 1, 10) === 1.0 (t=0 → p=1); ttestNW(2.228, 1, 10) ≈ 0.05 (t critical value at df=10); ttestNW(beta, 0, df) === 1.0 (degenerate SE → p=1).
  </behavior>
  <action>
    1. Create `tests/stats-newey-west.unit.test.ts` with the 6 cases above. Compute the scipy reference values OFFLINE and commit them as literal constants in the test. RED.
    2. Create `src/lib/stats/newey-west.ts` implementing:
       - `neweyWestSE(residuals: number[], lag: number): number` with the Bartlett-kernel formula in the interfaces block above. Include the full LaTeX-style formula in the JSDoc + the Newey-West 1987 citation. Add `// PIT-SAFE` marker (this module is dep-free / DB-free per 19-A-05 convention).
       - `ttestNW(beta: number, se_nw: number, df: number): number` with the Student-t two-sided CDF via the regularized incomplete beta function (Lentz's algorithm). Pure function — no `mathjs` / `simple-statistics` dependency.
    3. Run vitest; iterate until GREEN.
  </action>
  <acceptance_criteria>
    - `grep -c "Newey & West (1987)" src/lib/stats/newey-west.ts` returns 1
    - `grep -c "Bartlett" src/lib/stats/newey-west.ts` returns 1
    - `grep -c "SE_NW²" src/lib/stats/newey-west.ts` returns 1 (formula present)
    - `grep -c "from 'mathjs'" src/lib/stats/newey-west.ts` returns 0 (no external math dep)
    - All 6 tests pass
  </acceptance_criteria>
  <automated>npx vitest run tests/stats-newey-west.unit.test.ts</automated>
  <done>Newey-West module implemented + 6 unit tests green; scipy-equivalence within 1e-6</done>
</task>

<task type="auto" id="20-C-01-04" tdd="true">
  <name>Task 4: Implement + test Benjamini-Hochberg FDR (src/lib/stats/bh-fdr.ts)</name>
  <read_first>
    - src/lib/stats/newey-west.ts (Task 3 — pure-function style + JSDoc citation convention)
  </read_first>
  <behavior>
    Unit cases (≥4) in tests/stats-bh-fdr.unit.test.ts:
    1. **bh-1995-paper-example**: input p-values [0.001, 0.008, 0.039, 0.041, 0.042, 0.060, 0.074, 0.205] at α=0.05. Expected rejections: indices 0..4 (first 5) per the original paper. Corrected p-values monotonically >= raw p-values.
    2. Empty input returns { corrected: [], rejected: [] }.
    3. Single p-value: corrected === raw (clamped to [0, 1]); rejected === (raw <= alpha).
    4. **Monotonicity**: for ANY input p-values, output `corrected[i] >= raw[i]` for all i. Test with 100 randomized inputs (seeded).
    5. Order preservation: output index order matches input index order (no implicit sorting in the return).
  </behavior>
  <action>
    1. Create `tests/stats-bh-fdr.unit.test.ts` with the 5 cases above. The BH 1995 paper example is the gold standard — its expected output is committed as a literal in the test. RED.
    2. Create `src/lib/stats/bh-fdr.ts` implementing `benjaminiHochbergFDR(pValues, alpha=0.05): { corrected: number[]; rejected: boolean[] }` per the interfaces block. Include the full BH-1995 citation + algorithm description in JSDoc. Sort internally (index-tracked); return in original input order. The running-min-from-the-top step is the standard adjustment formula.
    3. Run vitest; iterate until GREEN.
  </action>
  <acceptance_criteria>
    - `grep -c "Benjamini & Hochberg (1995)" src/lib/stats/bh-fdr.ts` returns 1
    - `grep -c "p_corrected_(i) = min_" src/lib/stats/bh-fdr.ts` returns 1 (formula present in JSDoc)
    - All 5 tests pass; bh-1995-paper-example matches paper exactly
  </acceptance_criteria>
  <automated>npx vitest run tests/stats-bh-fdr.unit.test.ts</automated>
  <done>BH-FDR module implemented + 5 unit tests green; canonical 1995 paper example matches</done>
</task>

<task type="auto" id="20-C-01-05" tdd="true">
  <name>Task 5: Implement + test per-source IC orchestration (src/lib/sentiment/per-source-ic.ts)</name>
  <read_first>
    - src/lib/reasoning/alpha-decay-monitor.ts (rollingSpearmanIC — to re-export, NOT reimplement)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (~lines 121-187 — SentimentObservation schema + fetched_at PIT-INVARIANT marker)
    - prisma/schema.prisma (~lines 63-78 — PriceOutcome model)
    - src/lib/db.ts (Prisma singleton convention)
  </read_first>
  <behavior>
    Unit cases (≥8) in tests/sentiment-per-source-ic.unit.test.ts:
    1. `spearmanIC` is a thin re-export of `rollingSpearmanIC` (same reference equality OR same output on shared inputs).
    2. spearmanIC on perfectly monotone [1,2,3,4,5] vs [10,20,30,40,50] === 1.0 within 1e-9.
    3. spearmanIC on perfectly anti-monotone === -1.0.
    4. rollingICIR on synthetic IC series [0.1, 0.15, 0.05, 0.20, 0.10, ...]: returns mean(IC) / sample_std(IC) with Bessel correction (n-1 denom). Compute expected value as a literal.
    5. rollingICIR returns null when perDayIC.length < window.
    6. rollingICIR returns null when sample_std === 0 (constant IC).
    7. **nw_lag-per-horizon**: function under test (e.g. `selectNeweyWestLag(horizon: 7 | 30)`) returns 5 for h=7 and 10 for h=30 — the literal values from CONTEXT.md spec and HYPERPARAMETERS.md.
    8. computePerSourceIC returns null when n_observations < 20 (cold-start case — mocked Prisma returning 19 fetched_at days).
    9. computePerSourceIC returns null when cross-sectional N per day < 5 (mocked Prisma returning 20 days but each with only 4 tickers).
    10. Join uses `fetched_at` not `published_at` — assert via Prisma mock argument inspection (the WHERE clause must reference `fetched_at`, never `published_at`).
  </behavior>
  <action>
    1. Create `tests/sentiment-per-source-ic.unit.test.ts` with the 10 cases above. Use a mocked Prisma client (vi.mock '@/lib/db') for the DB-touching cases. RED.
    2. Create `src/lib/sentiment/per-source-ic.ts`:
       - `export { rollingSpearmanIC as spearmanIC } from '@/lib/reasoning/alpha-decay-monitor';`
       - `selectNeweyWestLag(horizon: 7 | 30): number` — returns 5 for 7, 10 for 30. Cite the Newey-West 1987 rule in JSDoc.
       - `rollingICIR(perDayIC: number[], window: number = 20): number | null` — sample-std with Bessel correction; null on degenerate cases.
       - `computePerSourceIC(source_id, horizon, asOf)` — the DB-touching orchestrator:
         a. Query `prisma.sentimentObservation` for the trailing 20-day window of `(source = source_id) AND (fetched_at >= asOf - 20d) AND (fetched_at < asOf)`. **GREP MARKER: place `// PIT-INVARIANT — join on fetched_at, NEVER published_at` immediately above the WHERE clause.** Group by `fetched_at::date`.
         b. For each day: collect cross-section of `(ticker, bull_pct - bear_pct)` from the message-tagged classifier_score (or aggregate via the existing SentimentObservation.classifier_score field — document the assumption with a TODO if the SentimentObservation rows are per-message rather than per-ticker; in that case use grouped mean per ticker per day).
         c. Join each ticker to `prisma.priceOutcome` where `days_after = horizon` and the snapshot was taken on that fetched_at day. (Forward-reference: 19-A-05 alpha-decay-monitor uses the same join pattern.)
         d. Compute per-day Spearman IC via `spearmanIC`. Skip days with cross-sectional N < 5.
         e. Aggregate IC over the window: `ic_20d = mean(per_day_IC)`; `icir_20d = rollingICIR(per_day_IC, 20)`.
         f. Compute Newey-West residuals `r_t = IC_t - ic_20d`; call `neweyWestSE(r, selectNeweyWestLag(horizon))`. Compute `ic_p_value_nw = ttestNW(ic_20d, se_nw / sqrt(n), n - 1)` where n = per_day_IC.length.
         g. Return null when distinct days < 20 OR every day had cross-sectional N < 5.
    3. Run vitest; iterate until GREEN.
  </action>
  <acceptance_criteria>
    - `grep -c "// PIT-INVARIANT" src/lib/sentiment/per-source-ic.ts` returns 1
    - `grep -c "published_at" src/lib/sentiment/per-source-ic.ts` returns 0 (no published_at references in this file)
    - `grep -c "export.*spearmanIC" src/lib/sentiment/per-source-ic.ts` returns 1 (re-export only)
    - `grep -c "function rollingSpearmanIC\|function midrankArray\|function pearsonCorrelation" src/lib/sentiment/per-source-ic.ts` returns 0 (no duplicates)
    - All 10 tests pass
  </acceptance_criteria>
  <automated>npx vitest run tests/sentiment-per-source-ic.unit.test.ts</automated>
  <done>Per-source IC orchestrator implemented; PIT-INVARIANT marker placed; ≥10 unit tests green; no duplicate Spearman implementation</done>
</task>

<task type="auto" id="20-C-01-06">
  <name>Task 6: Daily recompute script with BH-FDR (scripts/compute-per-source-ic.ts)</name>
  <read_first>
    - src/lib/sentiment/per-source-ic.ts (Task 5 — computePerSourceIC interface)
    - src/lib/stats/bh-fdr.ts (Task 4 — benjaminiHochbergFDR interface)
    - .planning/phases/20-real-sentiment-analysis/20-B-04-PLAN.md (~lines 50-52 — scripts/recompute-source-tiers.ts pattern + graceful-empty diagnostic)
    - src/app/api/cron/alpha-decay-watch/route.ts (~lines 50-100 — existing per-day rolling-IC orchestration as the structural template)
  </read_first>
  <action>
    Create `scripts/compute-per-source-ic.ts` exporting `runComputePerSourceIC({ asOf }: { asOf: Date }): Promise<{ rows_written: number; sources_attempted: number; diagnostic?: string }>`:

    1. Enumerate sources: hardcoded literal const `SOURCES = ['stocktwits', 'reddit', 'x', 'news', 'apewisdom', 'firecrawl'] as const`. (S1 — this is the closed-set enum from 20-Z-01 SentimentObservation.source; not a hand-picked weighting parameter.)
    2. Iterate `(source × horizon ∈ {7, 30})`:
       - Call `computePerSourceIC(source, horizon, asOf)`.
       - Collect non-null results into an array `results: Array<{ source, horizon, ic_20d, icir_20d, ic_se_nw, ic_p_value_nw, n_observations, nw_lag }>`.
       - On null result: log `[per-source-ic] ${source}@${horizon}d: cold-start (n<20 or N<5 per day)` and SKIP the row (write nothing).
    3. After the loop: extract `pValues = results.map(r => r.ic_p_value_nw)`. Call `benjaminiHochbergFDR(pValues, 0.05)`. Attach `ic_p_value_bh_fdr` to each result.
    4. Persist via a single `prisma.perSourceIC.createMany({ data: rows, skipDuplicates: true })` call with `model_version: 'per-source-ic-v1'` and `computed_at: asOf`. The composite-unique constraint enforces idempotency on rerun.
    5. Return `{ rows_written: result.count, sources_attempted: SOURCES.length * 2 }`. If `results.length === 0`, also return `diagnostic: 'no sources met n>=20 + N>=5 threshold — all returned null'` and exit success.
    6. Wrap the whole function body in a top-level `try/catch` that logs the error and re-throws so the cron route sees a 500.

    Add `tsx scripts/compute-per-source-ic.ts` invocation example in a top-of-file comment for local debugging.
  </action>
  <acceptance_criteria>
    - `grep -c "benjaminiHochbergFDR" scripts/compute-per-source-ic.ts` returns 1
    - `grep -c "model_version: 'per-source-ic-v1'" scripts/compute-per-source-ic.ts` returns 1
    - `grep -c "skipDuplicates: true" scripts/compute-per-source-ic.ts` returns 1
    - `grep -c "cold-start" scripts/compute-per-source-ic.ts` returns 1
    - File compiles: `npx tsc --noEmit scripts/compute-per-source-ic.ts` exits 0
  </acceptance_criteria>
  <automated>npx tsc --noEmit scripts/compute-per-source-ic.ts</automated>
  <done>Daily recompute script ships; BH-FDR applied across all p-values; idempotent on rerun; graceful empty</done>
</task>

<task type="auto" id="20-C-01-07">
  <name>Task 7: Cron route + vercel.json + HYPERPARAMETERS.md entry</name>
  <read_first>
    - src/app/api/cron/alpha-decay-watch/route.ts (existing cron route shape — auth + invocation pattern)
    - vercel.json (existing crons array)
    - HYPERPARAMETERS.md (existing entries from earlier plans — section structure)
  </read_first>
  <action>
    1. Create `src/app/api/cron/per-source-ic/route.ts`:
       ```typescript
       import { runComputePerSourceIC } from '@/../scripts/compute-per-source-ic';
       export const dynamic = 'force-dynamic';
       export const maxDuration = 300;
       export async function GET(request: Request) {
         const authHeader = request.headers.get('authorization');
         if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
           return new Response('Unauthorized', { status: 401 });
         }
         const result = await runComputePerSourceIC({ asOf: new Date() });
         return Response.json({ ok: true, ...result });
       }
       ```

    2. Update `vercel.json` — append to the `crons` array:
       ```json
       { "path": "/api/cron/per-source-ic", "schedule": "0 5 * * *" }
       ```
       (05:00 UTC — 1 hour before the existing alpha-decay-watch at 06:00 UTC, to avoid simultaneous Neon load.)

    3. Append a new section to `HYPERPARAMETERS.md`:
       ```markdown
       ## Phase 20-C-01 — Per-source rolling ICIR with Newey-West significance

       | Parameter | Value | Source |
       |-----------|-------|--------|
       | Rolling window | 20 days | CONTEXT.md §20-C-01 verbatim |
       | Newey-West lag (7d horizon) | 5 | Newey-West 1987 rule L = floor(4·(T/100)^(2/9)), T ≈ 100 |
       | Newey-West lag (30d horizon) | 10 | Newey-West 1987 rule, longer overlap |
       | BH-FDR α | 0.05 | Benjamini-Hochberg 1995 default |
       | n_min_observations (cold-start) | 20 | CONTEXT.md §20-C-01 verbatim |
       | Cross-sectional N min per day | 5 | Spearman instability below this; model card §OOD |
       | Auto-down-weight ICIR threshold | 0.3 | CONTEXT.md §20-C-01 verbatim |
       | Auto-down-weight consecutive windows | 2 | CONTEXT.md §20-C-01 verbatim |
       | Cron schedule | `0 5 * * *` | 1h before alpha-decay-watch |
       | model_version | `per-source-ic-v1` | Bump on algorithm change |
       ```
  </action>
  <acceptance_criteria>
    - `grep -c "Bearer \${process.env.CRON_SECRET}" src/app/api/cron/per-source-ic/route.ts` returns 1
    - `grep -c "/api/cron/per-source-ic" vercel.json` returns 1
    - `grep -c "0 5 \\* \\* \\*" vercel.json` returns 1
    - `grep -c "20-C-01" HYPERPARAMETERS.md` returns 1
    - `npx tsc --noEmit src/app/api/cron/per-source-ic/route.ts` exits 0
  </acceptance_criteria>
  <automated>npx tsc --noEmit src/app/api/cron/per-source-ic/route.ts</automated>
  <done>Cron route + vercel schedule + HYPERPARAMETERS entry committed</done>
</task>

<task type="auto" id="20-C-01-08">
  <name>Task 8: Dashboard JSON API endpoint (/api/insights/sentiment-sources)</name>
  <read_first>
    - src/app/api/insights/route.ts (existing /insights backing endpoint — response shape conventions)
    - src/app/insights/page.tsx (existing top-level /insights page — to understand the sibling structure)
    - src/lib/db.ts (Prisma singleton)
  </read_first>
  <action>
    Create `src/app/api/insights/sentiment-sources/route.ts`:

    1. `export const dynamic = 'force-dynamic';`
    2. `GET(request)` returns the `SentimentSourcesResponse` shape from `<interfaces>`.
    3. Query: for each source × horizon, fetch the LATEST PerSourceIC row (by `computed_at DESC`) + the second-latest row to compute the consecutive-windows auto-down-weight signal.
       ```sql
       -- equivalent Prisma:
       prisma.perSourceIC.findMany({
         where: { source_id, forward_horizon_days: horizon },
         orderBy: { computed_at: 'desc' },
         take: 2,
       });
       ```
    4. For each (source, horizon):
       - `significance = '***' if p_bh < 0.001, '**' if < 0.01, '*' if < 0.05, '' otherwise`
       - `cold_start = (n_observations < 20)` — when this is true the row should NOT exist per Task 5, but defensive: when no row exists at all, return `null` for the horizon's tile rather than throw.
       - `auto_down_weight = (latest.icir_20d != null && latest.icir_20d < 0.3) && (prev != null && prev.icir_20d != null && prev.icir_20d < 0.3)`
    5. Iterate the hardcoded source list `['stocktwits', 'reddit', 'x', 'news', 'apewisdom', 'firecrawl']` and return one entry per source with both `7d` and `30d` horizons populated.
    6. Response includes `generated_at = new Date().toISOString()`.
  </action>
  <acceptance_criteria>
    - `grep -c "auto_down_weight" src/app/api/insights/sentiment-sources/route.ts` returns 1
    - `grep -c "icir_20d < 0.3" src/app/api/insights/sentiment-sources/route.ts` returns 1
    - `grep -c "take: 2" src/app/api/insights/sentiment-sources/route.ts` returns 1
    - `npx tsc --noEmit src/app/api/insights/sentiment-sources/route.ts` exits 0
  </acceptance_criteria>
  <automated>npx tsc --noEmit src/app/api/insights/sentiment-sources/route.ts</automated>
  <done>JSON API endpoint compiles; auto-down-weight signal computed from latest 2 rows per (source, horizon)</done>
</task>

<task type="auto" id="20-C-01-09">
  <name>Task 9: Dashboard page + SourceTile component (/insights/sentiment-sources)</name>
  <read_first>
    - src/app/insights/page.tsx (existing /insights page — server-component pattern + Tailwind conventions)
    - src/app/insights/components/PatternsTable.tsx (existing tile-style component for visual consistency)
    - CLAUDE.md (UI/UX guidelines — typography, spacing, accessibility)
  </read_first>
  <action>
    1. Create `src/app/insights/sentiment-sources/page.tsx` — a Next.js App Router server component:
       - Fetch `/api/insights/sentiment-sources` server-side (via the function imported directly to avoid HTTP roundtrip in production).
       - Render a header `<h1>Sentiment Sources — Per-Source IC Calibration</h1>` + brief explainer (1-2 sentences referencing Newey-West correction + BH-FDR).
       - Render a grid of `<SourceTile>` components, one per (source × horizon).

    2. Create `src/app/insights/sentiment-sources/components/SourceTile.tsx`:
       - Props: `{ source_id, horizon, tile: SourceHorizonTile | null }`.
       - When `tile === null`: render "COLD START — insufficient data" badge with neutral styling.
       - When tile present: render:
         - Source name + horizon label (e.g., "stocktwits · 7d")
         - ICIR value to 2 decimals + significance asterisks appended (e.g., `0.42 **`)
         - IC_20d secondary metric
         - n_observations + nw_lag in a small footer line
         - When `auto_down_weight === true`: a prominent `<span data-testid="auto-down-weight-badge">AUTO-DOWN-WEIGHT TRIGGERED</span>` badge in warning color
         - When `icir_20d < 0.3` (single window): a softer "BELOW THRESHOLD" badge
       - Tailwind for layout (per project convention); no new design system primitives required.

    3. Use semantic HTML (h1, section, ul) for a11y; add `aria-label` on the auto-down-weight badge.
  </action>
  <acceptance_criteria>
    - `grep -c "AUTO-DOWN-WEIGHT" src/app/insights/sentiment-sources/components/SourceTile.tsx` returns 1
    - `grep -c "data-testid=\"auto-down-weight-badge\"" src/app/insights/sentiment-sources/components/SourceTile.tsx` returns 1
    - `grep -c "Newey-West" src/app/insights/sentiment-sources/page.tsx` returns 1
    - `npx tsc --noEmit` exits 0 over the new files
    - `npm run build` exits 0 (Next.js compile)
  </acceptance_criteria>
  <automated>npm run build 2>&1 | tail -5 | grep -qE "Compiled|✓"</automated>
  <done>Dashboard page + tile component render; significance asterisks + auto-down-weight badge present</done>
</task>

<task type="auto" id="20-C-01-10">
  <name>Task 10: Model card (MODEL-CARD-per-source-ic.md, Mitchell 2019 format)</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (Mitchell 2019 template structure)
    - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-source-tier.md (if 20-B-04 has shipped a sibling card — for stylistic consistency)
  </read_first>
  <action>
    Create `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-per-source-ic.md` covering the Mitchell 2019 sections:

    - **Model Details**: per-source rolling-20d Spearman IC + Newey-West HAC SE + BH-FDR correction. Inputs: SentimentObservation × PriceOutcome. Output: PerSourceIC rows.
    - **Intended Use**: input to 20-B-04 SourceTier weight recompute; auto-down-weight signal for sources with persistent ICIR < 0.3.
    - **Factors / Subgroups**: per source_id ∈ {stocktwits, reddit, x, news, apewisdom, firecrawl} × horizon ∈ {7d, 30d}.
    - **Metrics**: ic_20d, icir_20d, ic_se_nw, ic_p_value_nw, ic_p_value_bh_fdr.
    - **Training Data**: SentimentObservation rows with fetched_at in trailing 20 days × PriceOutcome with days_after = horizon. Per-day cross-sectional Spearman IC across all tickers in the source on that day. **PIT-safe** — joins on fetched_at, never published_at.
    - **Evaluation Data**: same source — measure-and-report; no held-out set (this is a calibration metric, not a classifier).
    - **Quantitative Analyses**: Newey-West lag-per-horizon derivation (Newey-West 1987 rule L = floor(4·(T/100)^(2/9))): h=7 → L=5, h=30 → L=10. BH-FDR α=0.05 controlling Type-I inflation across ~12 hypotheses per day (6 sources × 2 horizons). Sample-std with Bessel correction.
    - **Ethical Considerations**: no PII (operates on hashed author_id + classifier scores). Source attribution preserved.
    - **Caveats / Recommendations / OOD**: (i) new source < 20 obs days returns null; (ii) cross-sectional N < 5 per day skips that day; (iii) sparse small-cap coverage inflates IC variance; (iv) overlapping returns at 30d horizon make raw t-stats anti-conservative — Newey-West correction handles this; (v) BH-FDR is daily-panel only; longitudinal multiple-testing is NOT corrected (operator should re-examine in 20-C-06 fairness audit).
    - **Retrain Cadence**: daily cron 05:00 UTC.
    - **Known Failure Modes**: zero-volume source-days (skip); single-ticker-per-day source (Spearman undefined, returns 0 per alpha-decay-monitor convention); SentimentObservation classifier upgrade requires model_version bump on PerSourceIC.
    - **References**: Newey & West (1987); Benjamini & Hochberg (1995); CONTEXT.md §20-C-01; Phase 19-A-05 alpha-decay-monitor.
  </action>
  <acceptance_criteria>
    - `grep -c "Newey-West" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-per-source-ic.md` returns ≥3
    - `grep -c "Benjamini" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-per-source-ic.md` returns ≥1
    - `grep -c "PIT-safe" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-per-source-ic.md` returns ≥1
    - `grep -c "Retrain Cadence" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-per-source-ic.md` returns 1
    - `grep -c "OOD\|Known Failure Modes" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-per-source-ic.md` returns ≥1
  </acceptance_criteria>
  <automated>test -s .planning/phases/20-real-sentiment-analysis/MODEL-CARD-per-source-ic.md && grep -qc "Newey-West" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-per-source-ic.md</automated>
  <done>Mitchell-2019 model card committed; all required sections present</done>
</task>

<task type="auto" id="20-C-01-11">
  <name>Task 11: Live-Neon integration test (end-to-end fixture + auto-down-weight)</name>
  <read_first>
    - tests/integration/sentiment-observation.integration.test.ts (Plan 20-Z-01 — fixture-insertion pattern)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (~lines 44-46 — fixture writer convention)
    - src/lib/db.ts (Prisma singleton)
  </read_first>
  <action>
    Create `tests/integration/per-source-ic.integration.test.ts` (live-Neon, runs under `npm run test:integration`):

    **Setup** (each test): truncate `PerSourceIC` + relevant fixture rows in `SentimentObservation` + `PriceOutcome` from a deterministic test prefix.

    **Test 1 — end-to-end cron writes ≥6 rows**:
    1. Insert 20 distinct fetched_at days × 10 tickers × 3 sources of SentimentObservation rows with `classifier_score` drawn from a fixed-seed PRNG.
    2. Insert corresponding PriceOutcome rows with `days_after = 7` and `days_after = 30` plus deterministic `pct_change` correlated with the classifier_score for some sources, uncorrelated for others.
    3. Call `runComputePerSourceIC({ asOf: new Date() })`.
    4. Assert `await prisma.perSourceIC.count({ where: { model_version: 'per-source-ic-v1' } }) >= 6` (3 sources × 2 horizons).
    5. Assert that for the source designed to correlate, `ic_20d > 0` and `ic_p_value_bh_fdr < 0.05`.
    6. Assert that for the uncorrelated source, `Math.abs(ic_20d) < 0.3`.

    **Test 2 — idempotent on rerun**:
    1. After Test-1 setup, call `runComputePerSourceIC({ asOf: SAME_AS_OF })` twice.
    2. Assert row count unchanged (composite unique + skipDuplicates honored).

    **Test 3 — BH-FDR monotonicity in DB**:
    1. Read all rows from Test 1. Assert for every row `ic_p_value_bh_fdr >= ic_p_value_nw`.

    **Test 4 — auto-down-weight signal fires after 2 consecutive windows**:
    1. Directly insert 2 PerSourceIC rows for `(source='stocktwits', horizon=7)` with `computed_at = today` and `computed_at = today - 20d`, both with `icir_20d = 0.15` (< 0.3).
    2. Fetch `/api/insights/sentiment-sources` via direct function call.
    3. Assert the response payload for stocktwits.7d has `auto_down_weight === true`.

    **Test 5 — auto-down-weight clears when one window recovers**:
    1. Setup as Test 4 but the most-recent row has `icir_20d = 0.50` (>= 0.3).
    2. Assert `auto_down_weight === false`.

    **Test 6 — dashboard JSON 200 response**:
    1. After Test-1 setup, call the route handler directly.
    2. Assert response status 200, content-type JSON, body contains at least one source with non-null ic_20d.

    **Test 7 — cold-start returns null (no row written)**:
    1. Insert only 10 days of SentimentObservation (below n_min=20).
    2. Call `runComputePerSourceIC`. Assert `await prisma.perSourceIC.count({ where: { source_id: TEST_SOURCE } }) === 0` AND `runComputePerSourceIC` resolves successfully (no throw).
  </action>
  <acceptance_criteria>
    - `grep -c "auto_down_weight" tests/integration/per-source-ic.integration.test.ts` returns ≥2
    - `grep -c "ic_p_value_bh_fdr >= ic_p_value_nw\|ic_p_value_bh_fdr.*>=.*ic_p_value_nw" tests/integration/per-source-ic.integration.test.ts` returns ≥1
    - `grep -c "skipDuplicates\|composite unique\|idempotent" tests/integration/per-source-ic.integration.test.ts` returns ≥1
    - All 7 tests pass: `npx vitest run tests/integration/per-source-ic.integration.test.ts --config vitest.integration.config.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/integration/per-source-ic.integration.test.ts --config vitest.integration.config.ts</automated>
  <done>End-to-end live-Neon integration green; auto-down-weight signal verified; idempotency + BH-FDR monotonicity asserted in DB</done>
</task>

<task type="checkpoint:human-verify" id="20-C-01-12" gate="blocking">
  <name>Task 12: Operator dashboard sanity check + cutover confirmation</name>
  <action>Operator opens `/insights/sentiment-sources` in agent-browser, screenshots the tile grid, and confirms (a) the dashboard renders, (b) the production cron returns 200 on a manual curl with `Authorization: Bearer $CRON_SECRET`, and (c) the data-readiness cutover criterion (≥7 days of dashboard data + 20-B-04 wired) is understood as a passive accumulation gate — the plan SHIPS when Tasks 1-11 are green; this checkpoint is the operator handshake on dashboard + cron health. The detailed verification steps are in `<how-to-verify>` below.</action>
  <what-built>
    - PerSourceIC table populated by daily cron (or by integration-test fixtures if cron hasn't run yet).
    - /insights/sentiment-sources dashboard rendering per-source tiles with significance asterisks.
    - Auto-down-weight signal flagged when ICIR < 0.3 for 2 consecutive windows.
    - Newey-West HAC SE + Benjamini-Hochberg FDR correction implemented as pure modules + green unit tests.
  </what-built>
  <how-to-verify>
    1. **Cron health** (after first scheduled run at 05:00 UTC the day post-deploy):
       ```
       curl -fs -H "Authorization: Bearer $CRON_SECRET" \
         https://cipher-<your-deployment>.vercel.app/api/cron/per-source-ic | jq
       ```
       Expected: `{ "ok": true, "rows_written": >= 0, "sources_attempted": 12 }` (6 sources × 2 horizons). `rows_written` may be 0 if no source has reached n=20 yet — that's the cold-start case and is reported as the `diagnostic` field, not a failure.

    2. **Dashboard visual** — open the deployed `/insights/sentiment-sources` page in agent-browser:
       ```
       agent-browser open https://cipher-<your-deployment>.vercel.app/insights/sentiment-sources
       agent-browser wait --load networkidle
       agent-browser screenshot 20-c-01-dashboard.png --annotate
       agent-browser eval 'document.body.innerText.includes("Per-Source IC Calibration") ? "OK" : "MISSING_HEADER"'
       agent-browser eval 'document.querySelectorAll("[data-testid=\"auto-down-weight-badge\"]").length'
       ```
       Expected: header present; tile grid renders. Either non-zero tiles (data has accumulated) or all-cold-start (just-deployed; check back after 24h).

    3. **Cutover criterion** (the data-readiness gate per CONTEXT.md spec line 124 "≥7 days" acceptance):
       - This plan SHIPS when Tasks 1-11 are green. The cutover (≥7 days of dashboard data + 20-B-04 wired) is a passive accumulation gate, NOT a blocking task.
       - The 20-B-04 plan reads `PerSourceIC` and gracefully handles an empty table (T-20-B-04-03), so this plan can merge before either gate is met.
       - Operator action: 7 days post-deploy, revisit /insights/sentiment-sources; confirm ≥1 source has non-null ICIR with significance asterisks AND, if any source is flagged AUTO-DOWN-WEIGHT, confirm 20-B-04 SourceTier.weight reflects the down-weight in the next monthly recompute (or sooner via manual `npx tsx scripts/recompute-source-tiers.ts`).

    4. Reply with "approved" once dashboard renders + cron returns 200, OR describe issues.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>

**Numerical gates** (mechanically verifiable, no adjectives):

1. `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM per_source_ic WHERE model_version = 'per-source-ic-v1'"` returns `>= 6` after one full cron tick with sufficient fixture data (3 sources × 2 horizons minimum).

2. `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM per_source_ic WHERE ic_p_value_bh_fdr < ic_p_value_nw"` returns `0` (BH-FDR monotonicity in DB).

3. `npx vitest run tests/stats-newey-west.unit.test.ts` exits 0 — all ≥6 cases green, including scipy-equivalence at lag=0 (1.0 exactly) and Bartlett-weighted lag=2 within 1e-6.

4. `npx vitest run tests/stats-bh-fdr.unit.test.ts` exits 0 — BH 1995 paper example rejections match indices 0..4 verbatim.

5. `npx vitest run tests/sentiment-per-source-ic.unit.test.ts` exits 0 — all ≥10 cases green, including cold-start null and the PIT-INVARIANT grep assertion.

6. `npx vitest run tests/integration/per-source-ic.integration.test.ts --config vitest.integration.config.ts` exits 0 — all 7 cases green, including auto-down-weight trigger + clearance.

7. `curl -fs http://localhost:3000/api/insights/sentiment-sources | jq '.sources | length'` returns `6` (one entry per source) AND `curl -fs ... | jq '.sources[] | .horizons | keys'` shows `["30d", "7d"]` for every source.

8. `npm run build` exits 0 (Next.js compile after dashboard route added).

9. **Cron wall-clock**: production log line for the cron route shows total invocation `< 300_000ms` (the maxDuration ceiling); typical case `< 60_000ms` for current source cardinality.

10. **PIT-INVARIANT grep**: `grep -c "// PIT-INVARIANT" src/lib/sentiment/per-source-ic.ts` returns `1`; `grep -c "published_at" src/lib/sentiment/per-source-ic.ts` returns `0`.

11. **No duplicate Spearman implementation**: `grep -rE "function (midrankArray|pearsonCorrelation|rollingSpearmanIC)" src/lib/stats/ src/lib/sentiment/` returns `0` (the only definitions live in `src/lib/reasoning/alpha-decay-monitor.ts`).

</verification>

<success_criteria>

This plan is DONE when:

1. All 12 tasks complete with green automated checks.
2. `PerSourceIC` Prisma table live in production Neon with composite unique + composite index.
3. `npx vitest run tests/stats-newey-west.unit.test.ts tests/stats-bh-fdr.unit.test.ts tests/sentiment-per-source-ic.unit.test.ts` exits 0.
4. `npx vitest run tests/integration/per-source-ic.integration.test.ts --config vitest.integration.config.ts` exits 0.
5. Daily cron `/api/cron/per-source-ic` scheduled at `0 5 * * *` in `vercel.json`.
6. `/insights/sentiment-sources` dashboard live and rendering tiles with significance asterisks + auto-down-weight badge.
7. `MODEL-CARD-per-source-ic.md` committed in Mitchell 2019 format.
8. `HYPERPARAMETERS.md` 20-C-01 section committed with Newey-West lag per horizon + BH-FDR α + ICIR threshold + consecutive-windows count, each cited verbatim from CONTEXT.md or Newey-West 1987 / BH 1995.
9. Operator approval received in Task 12 (dashboard renders + cron returns 200).
10. **Forward-reference confirmed** (not in this plan, but the contract): 20-B-04 `scripts/recompute-source-tiers.ts` reads `PerSourceIC.ic_20d` aggregated to mean_ic_90d; auto-down-weight signal feeds SourceTier.weight reduction at the next monthly recompute.

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-C-01-SUMMARY.md` per `$HOME/.claude/get-shit-done/templates/summary.md`.

Required summary sections:
- Per-source IC pipeline overview (Spearman → rolling ICIR → Newey-West SE → BH-FDR correction)
- Lag-per-horizon table (with Newey-West 1987 rule derivation)
- Cron schedule + idempotency guarantee
- Dashboard surface description + auto-down-weight semantics
- Forward-references to 20-B-04 (consumer) and 20-Z-07 (lookahead-bias regression)
- Numerical gates passed (with values)
- Threats mitigated (T-20-C-01-{01..05}) with disposition status
</output>
