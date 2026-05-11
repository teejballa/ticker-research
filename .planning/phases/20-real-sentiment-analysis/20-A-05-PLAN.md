---
phase: 20
plan: 20-A-05
wave: A
type: execute
depends_on: ['20-Z-01']
files_modified:
  - prisma/schema.prisma
  - src/lib/sentiment/agreement.ts
  - src/lib/sentiment/aggregator.ts
  - src/lib/learning.ts
  - src/lib/types.ts
  - src/components/ResearchReport.tsx
  - src/app/api/cron/agreement-calibration/route.ts
  - scripts/calibrate-agreement-threshold.ts
  - vercel.json
  - package.json
  - tests/sentiment-agreement.unit.test.ts
  - tests/integration/agreement-calibration.integration.test.ts
  - tests/learning-pattern-key-agreement.unit.test.ts
  - docs/cards/MODEL-CARD-agreement.md
  - HYPERPARAMETERS.md
autonomous: true
requirements: []
shadow_required: true
shadow_skip_reason: ""
shadow_cutover_criteria:
  - "≥7 days of shadow-mode parallel computation with no exceptions in /insights Sentiment Health (20-Z-03 wired)"
  - "agreement_score values match the formula `1 - std(bull_pct)/50` (clamped [0,1]) on 100 spot-check observations from production SentimentObservation rows (script: scripts/spot-check-agreement.ts)"
  - "Calibration script has produced AT LEAST one AgreementCalibration row — either a non-default threshold whose forward-vol-uplift bootstrap CI > 0, OR a documented null result with persisted threshold = 0.5 (literature default per Cookson/Engelberg)"
hard_cleanup_gate: true
requirements: []
must_haves:
  truths:
    - "agreementScore(perSourceBullPct) returns `1 - std(bull_pct)/50` clamped to [0,1] when ≥2 sources contributed; returns null otherwise"
    - "Aggregator surfaces `agreement_score: number | null` and `low_agreement_warning: boolean` on SentimentIntelligenceSection"
    - "AgreementCalibration Prisma table exists in production Neon with columns (id, computed_at, threshold, vol_uplift_vs_baseline, training_window_days, n_examples)"
    - "Monthly cron /api/cron/agreement-calibration runs scripts/calibrate-agreement-threshold.ts and inserts ≥1 AgreementCalibration row per month"
    - "Calibration script grid-searches threshold ∈ [0.3, 0.7] step 0.05 against forward 7d realized volatility; picks the threshold maximizing vol-uplift if its bootstrap CI > 0, else persists 0.5 with a logged null result"
    - "UI badge `MIXED · LOW AGREEMENT` (amber) renders when agreement_score < calibrated threshold, with tooltip citing Cookson/Engelberg"
    - "LearnedPattern pattern_key has been extended to include an `agreement_bucket` ∈ {'mixed','aligned','na'} suffix; existing rows resolve as 'na' (backward-compatible)"
    - "Unit tests verify agreementScore on canonical inputs (≥5 cases including all-50→1, 0/100→0, single-source→null)"
    - "Integration test passes: 3-source fixture aggregator surfaces agreement_score + low_agreement_warning; UI shows badge below threshold; pattern_key includes agreement_bucket"
    - "MODEL-CARD-agreement.md committed per 20-Z-02 template, referencing Cookson/Engelberg + null-result handling"
    - "Aggregator validates per-source bull_pct ∈ [0, 100] before calling agreementScore; throws if out of range (T-20-A-05-02 mitigation)"
  artifacts:
    - path: "src/lib/sentiment/agreement.ts"
      provides: "agreementScore + lowAgreement pure functions; constants AGREEMENT_DEFAULT_THRESHOLD = 0.5"
      contains: "export function agreementScore"
    - path: "prisma/schema.prisma"
      provides: "AgreementCalibration model + (computed_at DESC) index"
      contains: "model AgreementCalibration"
    - path: "scripts/calibrate-agreement-threshold.ts"
      provides: "Backfill grid-search over threshold vs forward 7d realized vol uplift, persists AgreementCalibration row"
      contains: "gridSearchThreshold"
    - path: "src/app/api/cron/agreement-calibration/route.ts"
      provides: "Monthly cron entry — auth via CRON_SECRET, invokes calibrate-agreement-threshold script logic"
      contains: "Bearer ${process.env.CRON_SECRET}"
    - path: "src/lib/sentiment/aggregator.ts"
      provides: "Computes per-source bullish_pct vector, validates [0,100] range, calls agreementScore + reads latest AgreementCalibration.threshold for low_agreement_warning"
      contains: "agreementScore("
    - path: "src/lib/learning.ts"
      provides: "buildPatternKey(base, agreement_bucket) helper that suffixes existing pattern_key with `:agreement=mixed|aligned|na`; legacy reads default to 'na'"
      contains: "agreement_bucket"
    - path: "src/lib/types.ts"
      provides: "SentimentIntelligenceSection.agreement_score (number|null) + low_agreement_warning (boolean)"
      contains: "agreement_score"
    - path: "src/components/ResearchReport.tsx"
      provides: "MIXED · LOW AGREEMENT amber badge in Sentiment Intelligence card with Cookson/Engelberg tooltip"
      contains: "MIXED · LOW AGREEMENT"
    - path: "vercel.json"
      provides: "Monthly cron entry: { path: '/api/cron/agreement-calibration', schedule: '0 6 1 * *' }"
      contains: "/api/cron/agreement-calibration"
    - path: "tests/sentiment-agreement.unit.test.ts"
      provides: "≥5 unit tests — canonical inputs, range validation, single-source null, default threshold gate"
    - path: "tests/integration/agreement-calibration.integration.test.ts"
      provides: "Live-Neon test — 3-source fixture, AgreementCalibration row persisted, badge renders below threshold"
    - path: "tests/learning-pattern-key-agreement.unit.test.ts"
      provides: "Verifies buildPatternKey backward-compat ('na' bucket) + new buckets ('mixed','aligned')"
    - path: "docs/cards/MODEL-CARD-agreement.md"
      provides: "Mitchell-2019 model card stub per 20-Z-02 — agreement_score signal + threshold calibration + null-result handling"
      contains: "Cookson"
    - path: "HYPERPARAMETERS.md"
      provides: "Documents AGREEMENT_DEFAULT_THRESHOLD = 0.5 and references AgreementCalibration override"
      contains: "AGREEMENT_DEFAULT_THRESHOLD"
  key_links:
    - from: "src/lib/sentiment/aggregator.ts (after computing per-source components)"
      to: "src/lib/sentiment/agreement.ts agreementScore()"
      via: "function call with components.map(c => c.bullish_pct)"
      pattern: "agreementScore\\("
    - from: "src/lib/sentiment/aggregator.ts (low_agreement_warning derivation)"
      to: "AgreementCalibration.threshold (latest by computed_at)"
      via: "prisma.agreementCalibration.findFirst({ orderBy: { computed_at: 'desc' } })"
      pattern: "agreementCalibration\\.findFirst"
    - from: "src/lib/learning.ts buildPatternKey()"
      to: "engine-context.ts pattern_key lookups (LearnedPattern composite key)"
      via: "suffix append `:agreement=<bucket>` — legacy rows resolved as ':agreement=na'"
      pattern: "agreement="
    - from: "src/components/ResearchReport.tsx Sentiment Intelligence card"
      to: "sentiment_intelligence.low_agreement_warning"
      via: "conditional render of amber badge with tooltip citing Cookson/Engelberg"
      pattern: "MIXED · LOW AGREEMENT"
    - from: "vercel.json crons[]"
      to: "src/app/api/cron/agreement-calibration/route.ts"
      via: "monthly schedule '0 6 1 * *'"
      pattern: "/api/cron/agreement-calibration"
---

# Plan 20-A-05: Cross-platform agreement signal + threshold calibration + Diffusion Engine pattern key extension

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE step only: the `npx prisma db push` against live Neon (Task 3 — additive `AgreementCalibration` model). All other tasks are autonomous: agreement.ts pure functions, aggregator wiring, calibration script, cron route, learning.ts pattern_key extension, UI badge, model card, tests. After the operator confirms the schema push, the remaining tasks proceed without further prompts. The shadow-mode→on cutover is itself operator-gated by the three numerical criteria in `shadow_cutover_criteria` above.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **Shadow lifecycle graduated**: `FEATURE_AGREEMENT_SIGNAL` flag flipped from `shadow` → `on` ONLY after the three numerical criteria in `shadow_cutover_criteria` are met AND ≥7d of shadow-mode rows show no exceptions in `/insights/sentiment-health` (20-Z-03 telemetry). Once `on`, the `shadow` branch and the flag itself are deleted in a follow-up commit (S3 — flag removed phase).
2. **No old code deleted yet** at this plan's commit (the existing aggregator path keeps emitting current fields; new fields are additive). Flag-removal cleanup happens in a follow-up after cutover.
3. **Feature flag introduced**: `FEATURE_AGREEMENT_SIGNAL: 'off' | 'shadow' | 'on'` in `src/lib/features.ts`. Defaults to `shadow`.
4. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-commit.
5. **Schema Push Gate**: `npx prisma db push` succeeded against live Neon AND integration test writes ≥1 `AgreementCalibration` row in a single calibration-script invocation.
6. **Backward-compat Gate**: `tests/learning-pattern-key-agreement.unit.test.ts` proves a legacy `pattern_key` value (no `:agreement=` suffix) reads back as `agreement_bucket = 'na'` — existing learned priors are NOT invalidated, they continue accumulating in the 'na' bucket while `mixed` / `aligned` start fresh.
7. **Model card committed**: `docs/cards/MODEL-CARD-agreement.md` exists, references Cookson & Engelberg ("Echo Chambers"), documents the null-result handling, and is recognised by `scripts/check-model-cards.ts` (20-Z-02). Re-evaluation cadence: 6 months.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — The 0.5 threshold is the literature default (Cookson & Engelberg "Echo Chambers" + the line-107 spec). The calibration step measures the Cookson-style relationship (low cross-source agreement → forward-realized vol uplift) on backfill and adjusts. If no candidate threshold beats the baseline with bootstrap CI > 0, 0.5 is persisted as a logged null result with mandatory 6-month re-evaluation. Hand-picking is therefore a documented FALLBACK, not a default.
- **S3 (shadow lifecycle)** — `FEATURE_AGREEMENT_SIGNAL` flag (off|shadow|on); cutover gated on the three numerical criteria in `shadow_cutover_criteria`. Spot-check script (`scripts/spot-check-agreement.ts`) verifies formula match on 100 production observations before flip.
- **S4 (model card per artifact)** — `docs/cards/MODEL-CARD-agreement.md` per 20-Z-02 template covers: training data (production SentimentObservation backfill window), evaluation metric (forward 7d realized-vol uplift, bootstrap CI), intended use (composite signal feeding LearnedPattern key + UI badge), out-of-distribution (single-source tickers → null), known failure modes (null-result possibility), retrain cadence (monthly cron + 6-month threshold re-evaluation).
- **S7 (threat model)** — five plan-level threats T-20-A-05-{01..05} below.
- **S8 (numerical acceptance)** — every DONE criterion in `<verification>` is a grep / SQL row count / Zod field assertion / Pearson agreement / bootstrap CI sign. Zero adjectives.

</universal_preamble>

<objective>
Surface a cross-platform `agreement_score = 1 - std(bull_pct)/50 ∈ [0,1]` whenever ≥2 sources contributed to the multi-source aggregator (post-Phase-19), render a `MIXED · LOW AGREEMENT` UI badge below the calibrated threshold, and extend the Diffusion Engine `LearnedPattern.pattern_key` to include an `agreement_bucket` ∈ {'mixed','aligned','na'} suffix so the engine learns separate priors for low- vs high-agreement regimes. The 0.5 threshold is calibrated against a Cookson-style relationship (low cross-source agreement → forward 7d realized-vol uplift) on production backfill; if no candidate threshold beats the baseline with bootstrap CI > 0, the literature default 0.5 is persisted as a logged null result with mandatory 6-month re-evaluation.

Purpose: Per Cookson & Engelberg ("Echo Chambers"), low cross-platform agreement on a high-mention ticker historically predicts higher subsequent volatility — the dispersion is itself a signal. Reporting only the post-Phase-19 smoothed `aggregated_bull_pct` throws away that information. Extending the LearnedPattern key with an agreement bucket lets the Diffusion Engine accumulate separate priors for low- vs high-agreement regimes, capturing the Cookson relationship inside the engine's own learning loop. This is a Wave A "quick win" because it is purely additive on top of 20-Z-01's `SentimentObservation` row store and the existing post-Phase-19 aggregator.

Output:
- 1 new pure-functions module (`src/lib/sentiment/agreement.ts`, ~50 LOC)
- 1 new Prisma model + 1 index (`AgreementCalibration`)
- 1 backfill calibration script + 1 monthly cron route
- 2 nullable fields on `SentimentIntelligenceSection`
- 1 backward-compatible extension to `LearnedPattern.pattern_key` resolution in `src/lib/learning.ts`
- 1 UI badge in `ResearchReport.tsx` Sentiment Intelligence card
- 1 model card per 20-Z-02
- 3 test files (unit, integration, pattern-key backward-compat)
- 1 cron entry in `vercel.json`
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@CLAUDE.md
@prisma/schema.prisma
@src/lib/sentiment/aggregator.ts
@src/lib/learning.ts
@src/lib/engine-context.ts
@src/lib/types.ts
@src/lib/db.ts
@src/components/ResearchReport.tsx
@vercel.json
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md

<interfaces>
```typescript
// src/lib/sentiment/agreement.ts — NEW (~50 LOC, pure functions)

/**
 * Sample standard deviation (Bessel-corrected) of a numeric vector.
 * Pure helper — exported for testing.
 */
export function std(values: number[]): number;

/**
 * Cross-platform agreement score per Cookson & Engelberg ("Echo Chambers").
 *
 *   agreement_score = 1 - std(bull_pct) / 50,  clamped to [0, 1]
 *
 * The /50 normalization assumes bull_pct ∈ [0, 100] — caller is responsible for
 * range validation BEFORE invocation (aggregator throws on out-of-range
 * inputs per T-20-A-05-02).
 *
 * Returns null when fewer than 2 sources contributed (no cross-platform signal).
 *
 * @param perSourceBullPct array of bullish percentages, one per contributing source
 * @returns agreement score ∈ [0, 1], or null if perSourceBullPct.length < 2
 */
export function agreementScore(perSourceBullPct: number[]): number | null;

/**
 * Returns true when score < threshold (i.e. the "MIXED · LOW AGREEMENT" regime).
 * Threshold is read from latest AgreementCalibration row at the call site;
 * literature default is 0.5 per Cookson/Engelberg.
 */
export function lowAgreement(score: number, threshold: number): boolean;

/** Literature default — used as fallback when no AgreementCalibration row exists. */
export const AGREEMENT_DEFAULT_THRESHOLD: number; // = 0.5

/**
 * Bucket the agreement score into the categorical key the Diffusion Engine
 * appends to LearnedPattern.pattern_key. 'na' is reserved for legacy rows /
 * single-source tickers — backward-compat for pre-20-A-05 learned priors.
 */
export function agreementBucket(
  score: number | null,
  threshold: number,
): 'mixed' | 'aligned' | 'na';
// Returns 'na' when score === null.
// Returns 'mixed' when score < threshold.
// Returns 'aligned' otherwise.
```

```typescript
// src/lib/learning.ts — ADDITIVE (~30 LOC delta)

/**
 * Extend an existing pattern_key with an agreement bucket suffix.
 *
 *   buildPatternKey('echo-chamber-bull', 'mixed') → 'echo-chamber-bull:agreement=mixed'
 *
 * Backward-compat: when the caller passes 'na' OR the legacy code path passes
 * undefined, the function returns the base key UNCHANGED — existing
 * LearnedPattern rows continue to be matched by their original pattern_key.
 * 'mixed' / 'aligned' buckets start with empty Beta posteriors and re-learn
 * from new data per the documented 6-month evaluation cadence.
 */
export function buildPatternKey(
  base: string,
  agreement_bucket?: 'mixed' | 'aligned' | 'na',
): string;

/**
 * Inverse helper: split a stored pattern_key back into (base, bucket).
 * Used by engine-context read paths and dashboards.
 */
export function parsePatternKey(
  storedKey: string,
): { base: string; agreement_bucket: 'mixed' | 'aligned' | 'na' };
// Legacy keys (no `:agreement=` segment) resolve to bucket = 'na'.
```

```prisma
// prisma/schema.prisma — NEW model (appended after the latest existing model)

model AgreementCalibration {
  id                    String   @id @default(uuid())
  computed_at           DateTime @default(now()) @db.Timestamptz
  threshold             Float    // ∈ [0.3, 0.7] from grid search; 0.5 on null result
  vol_uplift_vs_baseline Float   // forward 7d realized-vol uplift of `agreement < threshold` cohort vs `agreement >= threshold` cohort, in bps
  vol_uplift_ci_low     Float    // bootstrap 95% CI lower bound (positive ⇒ signal beat baseline)
  vol_uplift_ci_high    Float    // bootstrap 95% CI upper bound
  training_window_days  Int      // backfill window used (default 90)
  n_examples            Int      // count of (ticker, fetched_at) pairs that contributed to the search
  null_result           Boolean  @default(false) // true when no candidate beat baseline; threshold = 0.5 fallback persisted
  notes                 String?  // optional human-readable summary

  @@index([computed_at(sort: Desc)], map: "idx_agreement_calib_computed_at")
  @@map("agreement_calibrations")
}
```

```typescript
// src/lib/types.ts — ADDITIVE on existing SentimentIntelligenceSection

export interface SentimentIntelligenceSection extends SourceSection {
  // ... all existing fields preserved unchanged ...

  /**
   * Cross-platform agreement score per Cookson & Engelberg ("Echo Chambers").
   * Formula: 1 - std(per-source bull_pct) / 50, clamped [0,1].
   * Null when <2 sources contributed (no cross-platform signal available).
   */
  agreement_score?: number | null;

  /**
   * True when agreement_score < calibrated threshold (default 0.5 per
   * Cookson/Engelberg). Drives the "MIXED · LOW AGREEMENT" UI badge.
   * Always false when agreement_score is null.
   */
  low_agreement_warning?: boolean;
}
```

```typescript
// src/lib/sentiment/aggregator.ts — ADDITIVE delta inside aggregateCommunitySentiment

// AFTER the existing weightedSum/totalWeight loop:

// T-20-A-05-02 mitigation: validate per-source bull_pct ∈ [0, 100] BEFORE
// computing the agreement signal. Out-of-range silently breaks the /50
// normalization in agreementScore. Throw with diagnostic — caller bug.
for (const c of components) {
  if (c.bullish_pct < 0 || c.bullish_pct > 100) {
    throw new Error(
      `aggregator: per-source bull_pct out of [0,100]: source=${c.source} ` +
      `bullish_pct=${c.bullish_pct} — see T-20-A-05-02`,
    );
  }
}

const agreement_score = agreementScore(components.map(c => c.bullish_pct));
const threshold = await getLatestAgreementThreshold(); // latest AgreementCalibration; falls back to AGREEMENT_DEFAULT_THRESHOLD
const low_agreement_warning =
  agreement_score != null && agreement_score < threshold;

return {
  // ... existing fields ...
  agreement_score,
  low_agreement_warning,
};
```
</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| upstream sources → aggregator | Per-source `bullish_pct` (StockTwits / Swaggystocks / ApeWisdom) must be ∈ [0, 100]; out-of-range silently breaks /50 normalization |
| calibration cron → AgreementCalibration write path | Backfill data → grid search → persisted threshold consumed by every subsequent aggregator call (drift in cohort affects every report) |
| LearnedPattern.pattern_key writers/readers | Format change must be backward-compatible — legacy rows must still resolve, new buckets must accumulate independently |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-A-05-01 | (D) Denial of signal | Single-source tickers (StockTwits only, common for micro-caps) | accept | `agreementScore()` returns `null` when `perSourceBullPct.length < 2`; aggregator surfaces `agreement_score = null` and `low_agreement_warning = false`; UI renders "—" in place of badge. Documented as known limitation in MODEL-CARD-agreement.md. Maps to phase catalog T-28-006 (low-coverage tickers degrade gracefully). |
| T-20-A-05-02 | (T) Tampering / silent corruption | A source emits bull_pct on a [0, 1] scale instead of [0, 100] (e.g. a future provider integration error) — std/50 normalization silently produces nonsense | mitigate | Aggregator validates `0 <= bullish_pct <= 100` for every component BEFORE calling `agreementScore`; throws a typed Error with diagnostic identifying the offending source. Unit test asserts the throw on a [0,1]-scale fixture. **Severity: HIGH** — required mitigation. |
| T-20-A-05-03 | (T) Tampering | LearnedPattern key change invalidates existing learned priors — all Wave-19 accumulated Beta posteriors zero-out | mitigate | `buildPatternKey('base', 'na')` returns `'base'` UNCHANGED — legacy rows continue to be matched. New buckets `'mixed'` / `'aligned'` start with empty Beta posteriors and re-learn from new observations per the documented 6-month re-evaluation cadence. `tests/learning-pattern-key-agreement.unit.test.ts` proves backward-compat with a legacy fixture row. Documented as expected behavior in MODEL-CARD-agreement.md. |
| T-20-A-05-04 | (R) Repudiation / null-result | Calibration script produces no threshold whose forward-vol-uplift bootstrap CI > 0 (signal doesn't beat baseline on this backfill) | mitigate | Script persists `threshold = 0.5` (literature default per Cookson/Engelberg) with `null_result = true` and a `notes` column documenting the failed grid search. Feature still ships with the literature default. Re-evaluation in 6 months is mandatory per MODEL-CARD-agreement.md "retrain cadence". `/insights` Sentiment Health (20-Z-03) shows the latest calibration row's `null_result` flag so operators can spot persistent failures. |
| T-20-A-05-05 | (I) Information disclosure / misinterpretation | UI badge `MIXED · LOW AGREEMENT` could be misread as a SELL signal by users | mitigate | Badge color is **amber** (warning), NOT red (action). Tooltip text is mandatory and explicit: `"Cross-platform sources disagree; per Cookson & Engelberg historically predicts higher subsequent volatility, NOT a directional signal."` Citation present per S10 (regulatory hygiene). Playwright e2e asserts both the badge color class and tooltip text. |

</threat_model>

<tasks>

<task type="auto" id="20-A-05-01" tdd="true">
  <name>Task 1: Create src/lib/sentiment/agreement.ts pure-functions module + unit tests</name>
  <read_first>
    - src/lib/sentiment/aggregator.ts (existing AggregatedSentiment shape — components carry bullish_pct)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 107 — verbatim 20-A-05 spec; lines 9-41 — S1-S10)
    - .planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md (Task 1 — TDD-style failing-test scaffolding precedent)
  </read_first>
  <behavior>
    Write `tests/sentiment-agreement.unit.test.ts` FIRST (RED). ≥9 cases:
    - `agreementScore([50, 50, 50])` → 1 (all agree at neutral; std=0)
    - `agreementScore([0, 100])` → 0 (maximum disagreement; std=50, score=0)
    - `agreementScore([60, 40])` → 0.8 (std=10, 1 - 10/50)
    - `agreementScore([75])` → null (single source — no cross-platform signal)
    - `agreementScore([])` → null (no sources)
    - `agreementScore([50, 50, 50, 50, 50, 50])` → 1 (≥2 sources, all agree)
    - `agreementScore([100, 100, 100])` → 1 (consensus, even if extreme)
    - `lowAgreement(0.4, 0.5)` → true; `lowAgreement(0.5, 0.5)` → false (strict <); `lowAgreement(0.6, 0.5)` → false
    - `agreementBucket(null, 0.5)` → 'na'; `agreementBucket(0.4, 0.5)` → 'mixed'; `agreementBucket(0.7, 0.5)` → 'aligned'
    - `AGREEMENT_DEFAULT_THRESHOLD` === 0.5
    Run: tests fail (no implementation yet).
  </behavior>
  <action>
    1. Create `tests/sentiment-agreement.unit.test.ts` with the cases above. Run `npm test -- sentiment-agreement` — confirm all RED.
    2. Implement `src/lib/sentiment/agreement.ts` with the exact signatures from `<interfaces>`. Use Bessel-corrected sample std `sqrt(Σ(x-μ)² / (n-1))` for `std()`. Clamp `agreementScore` result to [0, 1] via `Math.max(0, Math.min(1, ...))` to defend against floating-point drift. Export `AGREEMENT_DEFAULT_THRESHOLD = 0.5`.
    3. Re-run `npm test -- sentiment-agreement` — confirm all GREEN.
    4. Commit: `test(20-A-05): add agreementScore + lowAgreement + agreementBucket pure-functions module`.

    DO NOT wire into aggregator yet — that is Task 5.
  </action>
  <verify>
    <automated>npm test -- sentiment-agreement.unit.test.ts</automated>
  </verify>
  <done>
    ≥9 tests pass; agreementScore/lowAgreement/agreementBucket exported; AGREEMENT_DEFAULT_THRESHOLD === 0.5; no aggregator wiring yet.
  </done>
</task>

<task type="auto" id="20-A-05-02">
  <name>Task 2: Add AgreementCalibration Prisma model + index</name>
  <read_first>
    - prisma/schema.prisma (current model list; append after the newest model — see 20-Z-01 PLAN Task 1 for the additive-append precedent)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (Task 1 — additive Prisma migration shape)
  </read_first>
  <action>
    Append the AgreementCalibration model from `<interfaces>` to `prisma/schema.prisma`. Do NOT modify any existing model. Then regenerate the client (no DB push yet — that is Task 3):

    ```bash
    npx prisma generate
    ```

    Verify the generated `node_modules/.prisma/client` exposes `prisma.agreementCalibration` with the new fields by running:

    ```bash
    grep -q "agreementCalibration" node_modules/.prisma/client/index.d.ts && echo OK
    ```

    Commit: `feat(20-A-05): add AgreementCalibration Prisma model + index`.
  </action>
  <verify>
    <automated>grep -q "model AgreementCalibration" prisma/schema.prisma && grep -q "agreementCalibration" node_modules/.prisma/client/index.d.ts</automated>
  </verify>
  <done>
    Schema contains `model AgreementCalibration` with all fields from `<interfaces>`; Prisma client regenerated; `prisma.agreementCalibration` typed accessor exists.
  </done>
</task>

<task type="checkpoint:human-action" id="20-A-05-03" gate="blocking">
  <name>Task 3: [BLOCKING] Operator runs `npx prisma db push` against live Neon</name>
  <what-built>
    Task 2 added the `AgreementCalibration` Prisma model (purely additive — no existing models touched). The schema must be pushed to live Neon so subsequent tasks (calibration script in Task 4, aggregator wiring in Task 5, integration test in Task 9) can read/write the new table.
  </what-built>
  <how-to-verify>
    1. Confirm `DATABASE_URL` in your environment points to production Neon (NOT a local stub).
    2. Run: `npx prisma db push`
    3. Confirm output reports the additive migration applied with **no destructive changes** ("Your database is now in sync with your Prisma schema. Done in Xms").
    4. Verify the table exists in production Neon:
       ```bash
       psql "$DATABASE_URL" -c '\dt agreement_calibrations'
       ```
       Should print one row with `agreement_calibrations | table | <owner>`.
    5. Verify the index exists:
       ```bash
       psql "$DATABASE_URL" -c "SELECT indexname FROM pg_indexes WHERE tablename='agreement_calibrations';"
       ```
       Should include `idx_agreement_calib_computed_at`.
  </how-to-verify>
  <resume-signal>Type "pushed" once both psql verifications return OK; or describe any error to abort.</resume-signal>
</task>

<task type="auto" id="20-A-05-04">
  <name>Task 4: Implement scripts/calibrate-agreement-threshold.ts (grid search + null-result handling)</name>
  <read_first>
    - src/lib/learning.ts (existing alpha-vs-SPY infrastructure — `classifyHit`, `brierScore`; calibration patterns)
    - prisma/schema.prisma (SentimentObservation columns — must aggregate bull_pct per source per ticker per fetched_at window from 20-Z-01's row store)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (`<interfaces>` — SentimentObservationInput / model_version partition)
    - src/lib/sentiment/agreement.ts (just created — `agreementScore`, `AGREEMENT_DEFAULT_THRESHOLD`)
  </read_first>
  <action>
    Create `scripts/calibrate-agreement-threshold.ts` with the following structure:

    1. **Load backfill** — Query SentimentObservation rows from the last `training_window_days` (default 90) where ≥2 distinct sources contributed for the same `(ticker, fetched_at±1h bucket)`. For each ticker × time-bucket, compute the per-source mean `classifier_score` mapped to bull_pct ∈ [0, 100], then `agreement_score` via `agreementScore(perSourceBullPct)`.
    2. **Forward realized volatility** — For each ticker × time-bucket, compute the forward 7d realized volatility: `std(daily log returns over the next 7 trading days) × sqrt(252)`. Use existing yahoo-finance2 `historical()` call pattern from `src/lib/data/`. Skip examples where forward window is incomplete (less than 7 trading days available).
    3. **Grid search** — For each candidate `threshold ∈ {0.3, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70}`:
       - Cohort A = examples where `agreement_score < threshold` (low-agreement)
       - Cohort B = examples where `agreement_score >= threshold` (high-agreement)
       - `vol_uplift = mean(realized_vol_A) - mean(realized_vol_B)` (in bps)
       - Bootstrap 95% CI for `vol_uplift` over 1000 resamples (paired bootstrap on examples).
    4. **Pick winning threshold** — Pick the threshold maximizing `vol_uplift` such that the bootstrap CI lower bound > 0. If NO candidate satisfies `ci_low > 0`:
       - Persist `threshold = 0.5` (literature default), `null_result = true`, `notes = "no candidate threshold beat baseline; bootstrap CI > 0 not achieved on training_window=Nd, n_examples=M"`.
    5. **Persist** — `await prisma.agreementCalibration.create({ data: { threshold, vol_uplift_vs_baseline, vol_uplift_ci_low, vol_uplift_ci_high, training_window_days, n_examples, null_result, notes } })`.
    6. Export the main function as `runAgreementCalibration({ training_window_days?: number }): Promise<{ threshold: number; null_result: boolean }>` so the cron route in Task 6 can import it.
    7. Add `package.json` script: `"calibrate-agreement": "tsx scripts/calibrate-agreement-threshold.ts"`.

    DO NOT use `withRetry` from 19-B-02 — this is a one-shot script, not a per-request adapter call.

    Commit: `feat(20-A-05): add agreement-threshold calibration script with null-result handling`.
  </action>
  <verify>
    <automated>npm run calibrate-agreement -- --dry-run 2>&1 | grep -E "(grid search|threshold candidate|null_result|persist)"</automated>
  </verify>
  <done>
    Script exists; `npm run calibrate-agreement -- --dry-run` runs grid search end-to-end on backfill without DB writes; persists exactly one AgreementCalibration row on a real run; null-result branch produces threshold=0.5 + null_result=true when no candidate satisfies CI > 0.
  </done>
</task>

<task type="auto" id="20-A-05-05">
  <name>Task 5: Wire agreement signal into aggregator + extend SentimentIntelligenceSection type</name>
  <read_first>
    - src/lib/sentiment/aggregator.ts (the aggregateCommunitySentiment function — extend the return path)
    - src/lib/types.ts (lines 129-161 — SentimentIntelligenceSection definition; add new optional fields)
    - src/lib/sentiment/agreement.ts (Task 1 exports)
    - src/lib/db.ts (prisma client singleton import pattern)
    - src/lib/features.ts (existing FEATURES flag pattern from 19-A-07)
  </read_first>
  <action>
    1. Add `FEATURE_AGREEMENT_SIGNAL: 'off' | 'shadow' | 'on'` to `src/lib/features.ts`. Default `'shadow'`.
    2. In `src/lib/types.ts`, append `agreement_score?: number | null` and `low_agreement_warning?: boolean` to `SentimentIntelligenceSection`. Both nullable/optional so SourcePackage stays backward-compatible.
    3. In `src/lib/sentiment/aggregator.ts`:
       - Import `agreementScore`, `AGREEMENT_DEFAULT_THRESHOLD` from `./agreement`.
       - Import `prisma` from `@/lib/db` and `FEATURES` from `@/lib/features`.
       - Add a helper `getLatestAgreementThreshold(): Promise<number>`:
         ```ts
         async function getLatestAgreementThreshold(): Promise<number> {
           const row = await prisma.agreementCalibration.findFirst({
             orderBy: { computed_at: 'desc' },
           });
           return row?.threshold ?? AGREEMENT_DEFAULT_THRESHOLD;
         }
         ```
       - Convert `aggregateCommunitySentiment` to async (it already returns a synchronous shape, but the threshold lookup is async). Update all call sites to `await`.
       - INSERT the per-source range validation loop from `<interfaces>` BEFORE calling `agreementScore` (T-20-A-05-02 mitigation).
       - Compute `agreement_score = agreementScore(components.map(c => c.bullish_pct))`.
       - Compute `low_agreement_warning = agreement_score != null && agreement_score < threshold`.
       - **Shadow gate**: When `FEATURES.FEATURE_AGREEMENT_SIGNAL === 'off'`, return `agreement_score: null, low_agreement_warning: false` (do not compute). When `'shadow'` or `'on'`, compute and surface. Difference between shadow and on: shadow LOGS the values to `/insights` telemetry but UI badge stays hidden; on flips the badge visible.
       - Return the new fields on the `AggregatedSentiment` shape AND add them to whatever assembles `SentimentIntelligenceSection` in `src/lib/data/source-package.ts` so they propagate to the SourcePackage.
    4. Update all call sites of `aggregateCommunitySentiment` to await it (grep: `aggregateCommunitySentiment(`). Likely sites: `src/lib/data/source-package.ts`, `src/lib/data/lightweight-community-scan.ts`, any tests.

    Commit: `feat(20-A-05): wire agreement_score + low_agreement_warning into aggregator (shadow flag)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm test -- aggregator</automated>
  </verify>
  <done>
    `agreement_score` + `low_agreement_warning` present on `SentimentIntelligenceSection`; aggregator emits both when ≥2 sources contributed AND flag is shadow/on; range validation throws on out-of-[0,100] input; FEATURE_AGREEMENT_SIGNAL flag gates compute path; existing `aggregator.test.ts` still passes.
  </done>
</task>

<task type="auto" id="20-A-05-06">
  <name>Task 6: Add monthly cron route /api/cron/agreement-calibration + vercel.json entry</name>
  <read_first>
    - vercel.json (existing crons[] array — sentiment-scan, price-followup, learn entries from CLAUDE.md "Diffusion Learning Engine" section)
    - src/app/api/cron/sentiment-scan/route.ts (CRON_SECRET auth pattern + monthly schedule precedent)
    - scripts/calibrate-agreement-threshold.ts (Task 4 — exported runAgreementCalibration)
  </read_first>
  <action>
    1. Create `src/app/api/cron/agreement-calibration/route.ts`:
       ```ts
       import { runAgreementCalibration } from '@/../scripts/calibrate-agreement-threshold';

       export async function GET(request: Request) {
         const authHeader = request.headers.get('authorization');
         if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
           return new Response('Unauthorized', { status: 401 });
         }
         const result = await runAgreementCalibration({ training_window_days: 90 });
         return Response.json({ ok: true, ...result });
       }
       ```
       (If the import path `@/../scripts/...` does not resolve under the project's tsconfig path mapping, copy the function body into the route inline rather than fight the resolver — script vs route boundary.)
    2. Append to `vercel.json` `crons[]`:
       ```json
       { "path": "/api/cron/agreement-calibration", "schedule": "0 6 1 * *" }
       ```
       (06:00 UTC on the 1st of every month — same family as existing learn cron, off-peak.)
    3. Local smoke test:
       ```bash
       CRON_SECRET=test curl -H "Authorization: Bearer test" http://localhost:3000/api/cron/agreement-calibration
       ```
       Should return `{ ok: true, threshold: <number>, null_result: <boolean> }` (after running `npm run dev` in another shell).

    Commit: `feat(20-A-05): add monthly agreement-calibration cron + vercel.json entry`.
  </action>
  <verify>
    <automated>grep -q "/api/cron/agreement-calibration" vercel.json && grep -q "0 6 1 \* \*" vercel.json && test -f src/app/api/cron/agreement-calibration/route.ts</automated>
  </verify>
  <done>
    Route file exists with CRON_SECRET auth; vercel.json contains the monthly entry; local smoke test returns ok=true.
  </done>
</task>

<task type="auto" id="20-A-05-07" tdd="true">
  <name>Task 7: Extend LearnedPattern.pattern_key with agreement_bucket suffix (backward-compatible)</name>
  <read_first>
    - src/lib/learning.ts (existing pattern_key construction sites; the engine-context lookups in src/lib/engine-context.ts at line 402 onwards)
    - src/lib/engine-context.ts (lines 402-444 — resolveBucketCellAt30 — pattern_key is the lookup key for LearnedPattern.findUnique)
    - prisma/schema.prisma (lines 99-119 — LearnedPattern model — pattern_key is a String column, no schema change needed)
    - tests/learning-pattern-key-agreement.unit.test.ts (will create in this task)
  </read_first>
  <behavior>
    Write `tests/learning-pattern-key-agreement.unit.test.ts` FIRST (RED). ≥6 cases:
    - `buildPatternKey('echo-chamber-bull', 'mixed')` → `'echo-chamber-bull:agreement=mixed'`
    - `buildPatternKey('echo-chamber-bull', 'aligned')` → `'echo-chamber-bull:agreement=aligned'`
    - `buildPatternKey('echo-chamber-bull', 'na')` → `'echo-chamber-bull'` (UNCHANGED — backward-compat)
    - `buildPatternKey('echo-chamber-bull')` → `'echo-chamber-bull'` (no bucket arg → backward-compat)
    - `parsePatternKey('echo-chamber-bull')` → `{ base: 'echo-chamber-bull', agreement_bucket: 'na' }` (legacy row resolution)
    - `parsePatternKey('echo-chamber-bull:agreement=mixed')` → `{ base: 'echo-chamber-bull', agreement_bucket: 'mixed' }`
    - `parsePatternKey('flow-pattern:agreement=aligned')` → `{ base: 'flow-pattern', agreement_bucket: 'aligned' }`
    - Round-trip: `parsePatternKey(buildPatternKey('foo', 'mixed'))` → `{ base: 'foo', agreement_bucket: 'mixed' }`
    Run: tests fail (no implementation yet).
  </behavior>
  <action>
    1. Create `tests/learning-pattern-key-agreement.unit.test.ts` with the cases above. Run RED.
    2. In `src/lib/learning.ts`, append (do NOT modify existing exports):
       ```ts
       export type AgreementBucket = 'mixed' | 'aligned' | 'na';
       const AGREEMENT_SUFFIX_RE = /:agreement=(mixed|aligned)$/;

       export function buildPatternKey(base: string, agreement_bucket?: AgreementBucket): string {
         if (!agreement_bucket || agreement_bucket === 'na') return base;
         return `${base}:agreement=${agreement_bucket}`;
       }

       export function parsePatternKey(storedKey: string): { base: string; agreement_bucket: AgreementBucket } {
         const m = storedKey.match(AGREEMENT_SUFFIX_RE);
         if (!m) return { base: storedKey, agreement_bucket: 'na' };
         return { base: storedKey.slice(0, m.index), agreement_bucket: m[1] as AgreementBucket };
       }
       ```
    3. **Wire only the WRITE side here** — call `buildPatternKey(base, agreementBucket(score, threshold))` at the LearnedPattern write sites that record sentiment-derived patterns. Grep for `prisma.learnedPattern.upsert` and `prisma.learnedPattern.create` in the cron paths (`/api/cron/sentiment-scan`, `/api/cron/learn`); pass the agreement bucket from the SourcePackage's `sentiment_intelligence.agreement_score` + the latest AgreementCalibration threshold.
    4. **Read side** — engine-context.ts existing lookups continue to work UNCHANGED for legacy keys (since `buildPatternKey('foo','na') === 'foo'`). For new buckets, the cron writes new rows with the suffixed key; engine-context.ts looks them up using the same `buildPatternKey(base, currentBucket)` call site (add a single line at the lookup site that decorates the bucket variable).
    5. Re-run `npm test -- learning-pattern-key-agreement` — confirm GREEN.

    Commit: `feat(20-A-05): extend LearnedPattern.pattern_key with backward-compat agreement_bucket suffix`.
  </action>
  <verify>
    <automated>npm test -- learning-pattern-key-agreement.unit.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>
    `buildPatternKey` + `parsePatternKey` + `AgreementBucket` type exported; `'na'` and undefined both yield UNCHANGED base key (backward-compat proven by test); write sites in sentiment-scan + learn crons use the bucketed key; engine-context reads unchanged for legacy rows; tsc clean.
  </done>
</task>

<task type="auto" id="20-A-05-08">
  <name>Task 8: Render `MIXED · LOW AGREEMENT` amber badge in ResearchReport.tsx Sentiment Intelligence card</name>
  <read_first>
    - src/components/ResearchReport.tsx (lines 633-714 — Sentiment Intelligence card; existing TRENDING badge at line 641-643 is the styling precedent)
    - src/lib/types.ts (updated SentimentIntelligenceSection — `agreement_score`, `low_agreement_warning`)
    - https://react.dev/reference/react (consult for tooltip ARIA patterns; verify `title` attribute behavior or use the codebase's existing tooltip primitive if one exists — grep `Tooltip` in src/components/)
  </read_first>
  <action>
    1. Inside the Sentiment Intelligence card header (`<div className="flex items-center justify-between mb-3">`), ALONGSIDE the existing TRENDING badge (line 641-643), conditionally render:
       ```tsx
       {sentiment_intelligence.low_agreement_warning && (
         <span
           className="text-[10px] font-bold tracking-widest uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded"
           title="Cross-platform sources disagree; per Cookson & Engelberg historically predicts higher subsequent volatility, NOT a directional signal."
         >
           MIXED · LOW AGREEMENT
         </span>
       )}
       ```
       (Color classes: amber, NOT red — T-20-A-05-05. If the codebase uses Material 3 tokens like `text-tertiary`/`text-error`, use the closest amber-equivalent token; check `tailwind.config.ts` for the project's amber/warning semantic class name.)
    2. Display the agreement_score as a small numeric chip BELOW the existing per-source breakdown row (line 690-710). Pattern: `Agreement: 0.42` when score is non-null, `Agreement: —` when null. Use existing chip styling from the bull/bear chips (line 658-687).
    3. Run `npm run dev` and visually confirm the badge renders on a fixture ticker with low_agreement_warning = true.

    Commit: `feat(20-A-05): render MIXED · LOW AGREEMENT amber badge + agreement chip in Sentiment Intelligence card`.
  </action>
  <verify>
    <automated>grep -q "MIXED · LOW AGREEMENT" src/components/ResearchReport.tsx && grep -q "Cookson" src/components/ResearchReport.tsx && npx tsc --noEmit</automated>
  </verify>
  <done>
    Badge renders conditionally on `low_agreement_warning`; tooltip text includes Cookson citation; color is amber (warning), not red (action); agreement chip displays score or "—".
  </done>
</task>

<task type="auto" id="20-A-05-09">
  <name>Task 9: Live-Neon integration test + Playwright UI assertion</name>
  <read_first>
    - tests/integration/sentiment-observation.integration.test.ts (20-Z-01 precedent for live-Neon test shape)
    - playwright.config.ts (e2e test conventions)
    - tests/sentiment-agreement.unit.test.ts (Task 1 — unit shape; integration test extends to live DB)
  </read_first>
  <action>
    1. Create `tests/integration/agreement-calibration.integration.test.ts`:
       - **Setup**: insert ≥30 SentimentObservation rows across 5 fixture tickers with ≥2 sources each (use 20-Z-01's `insertObservation` DAO).
       - **Test 1 (calibration script writes a row)**: invoke `runAgreementCalibration({ training_window_days: 7 })`; assert `prisma.agreementCalibration.count()` increases by 1; assert returned `threshold ∈ [0.3, 0.7]` OR `null_result === true`.
       - **Test 2 (aggregator surfaces fields)**: assemble a SourcePackage for one fixture ticker via the production code path; assert `pkg.sentiment_intelligence.agreement_score` is a number ∈ [0, 1]; assert `pkg.sentiment_intelligence.low_agreement_warning` is a boolean.
       - **Test 3 (range validation throw)**: pass an out-of-[0,100] component to the aggregator; assert it throws with diagnostic mentioning "T-20-A-05-02".
       - **Test 4 (LearnedPattern key extension)**: write a LearnedPattern row via the cron path with `agreement_bucket = 'mixed'`; assert `prisma.learnedPattern.findFirst({ where: { pattern_key: { contains: ':agreement=mixed' } } })` returns the row; assert legacy rows (no suffix) still resolve via `parsePatternKey` to `{ agreement_bucket: 'na' }`.
       - Cleanup with a transaction rollback or explicit deleteMany on test-tagged rows.
    2. Add Playwright e2e in `tests/e2e/agreement-badge.spec.ts`:
       - Seed a fixture ticker via the integration test seeder.
       - Navigate to `/research/<TICKER>`.
       - Assert `MIXED · LOW AGREEMENT` badge is visible: `await expect(page.locator('text=MIXED · LOW AGREEMENT')).toBeVisible()`.
       - Assert badge color class includes `amber` (NOT `red` / `error`).
       - Assert tooltip on hover shows text containing "Cookson".
       - Take a screenshot at `tests/e2e/screenshots/agreement-badge.png` and Read it back to visually confirm amber color, badge placement, and absence of any red SELL-style coloring.
    3. Add a `scripts/spot-check-agreement.ts` helper for the cutover gate: pulls the 100 most recent SentimentObservation rows that have ≥2 contributing sources, recomputes `agreementScore` from raw bull_pct, and asserts the value matches what the production aggregator wrote (within 1e-9). Outputs PASS/FAIL.

    Commit: `test(20-A-05): live-Neon integration + Playwright agreement-badge e2e + spot-check helper`.
  </action>
  <verify>
    <automated>npm run test:integration -- agreement-calibration && npm run test:e2e -- agreement-badge.spec.ts && npm run spot-check-agreement</automated>
  </verify>
  <done>
    Integration test writes ≥1 AgreementCalibration row; aggregator surfaces both new fields; out-of-range throw fires; LearnedPattern key extension verified for new + legacy rows; Playwright confirms badge visible + amber + Cookson tooltip + screenshot; spot-check script PASSES against 100 production rows.
  </done>
</task>

<task type="auto" id="20-A-05-10">
  <name>Task 10: Write MODEL-CARD-agreement.md + HYPERPARAMETERS.md entry</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 22-23 — S4 model card requirements)
    - 20-Z-02 model card template — read `MODEL-CARD-template.md` once 20-Z-02 is committed; if not yet present, follow Mitchell 2019 sections directly: Model Details, Intended Use, Factors, Metrics, Evaluation Data, Training Data, Quantitative Analyses, Ethical Considerations, Caveats and Recommendations.
    - HYPERPARAMETERS.md (existing format from Phase 19 — append, do not replace)
  </read_first>
  <action>
    1. Create `docs/cards/MODEL-CARD-agreement.md` with the following minimum sections (Mitchell 2019):
       - **Model Details**: name = `agreement-signal-v1`; type = composite signal (deterministic formula + calibrated threshold); owner = Cipher Phase 20-A-05.
       - **Intended Use**: Surfaced as `agreement_score` field + `MIXED · LOW AGREEMENT` UI badge + `agreement_bucket` suffix on LearnedPattern.pattern_key. NOT a directional signal — strictly a volatility-regime indicator per Cookson & Engelberg.
       - **Factors**: input is per-source bull_pct vector ∈ [0, 100]^n where n ≥ 2.
       - **Metrics**: forward 7d realized-vol uplift of low-agreement cohort vs high-agreement cohort, in bps, with bootstrap 95% CI.
       - **Evaluation Data**: trailing 90d production SentimentObservation rows with ≥2 contributing sources per (ticker, hour-bucket).
       - **Training Data**: same as evaluation (calibration is grid-search, not gradient training).
       - **Quantitative Analyses**: latest AgreementCalibration row's `vol_uplift_vs_baseline` + CI; null-result branch documented if present.
       - **Ethical Considerations**: badge could be misread as a sell signal — mitigated by amber color + explicit Cookson-citation tooltip (T-20-A-05-05).
       - **Caveats and Recommendations**: single-source tickers receive null score (T-20-A-05-01); 6-month re-evaluation cadence; null-result handling means the literature default 0.5 ships even if the relationship doesn't hold on Cipher's specific corpus.
       - **References**: Cookson, A., & Engelberg, J. (2024). "Echo Chambers." University of California, San Diego, Rady School of Management. Lucchini, L. et al. (2022). "From Reddit to WallStreetBets: The Online Conversation about GameStop." Frontiers in Physics.
    2. Append to `HYPERPARAMETERS.md`:
       ```markdown
       ### Agreement signal (Plan 20-A-05)
       - `AGREEMENT_DEFAULT_THRESHOLD = 0.5` — literature default per Cookson & Engelberg ("Echo Chambers"). Overridden monthly by the latest `AgreementCalibration.threshold` row (calibration script: `scripts/calibrate-agreement-threshold.ts`). Null-result handling: if no candidate threshold's bootstrap CI > 0, the default 0.5 is persisted with `null_result = true`.
       - Grid-search range: `threshold ∈ [0.3, 0.7]` step 0.05.
       - Training window: 90 days of SentimentObservation rows.
       - Re-evaluation cadence: monthly (cron) + mandatory 6-month full review per MODEL-CARD-agreement.md.
       ```
    3. Verify the model card passes `scripts/check-model-cards.ts` (from 20-Z-02). If 20-Z-02 has not yet shipped, leave a TODO comment in the model card referencing 20-Z-02 and confirm the file path matches the convention `docs/cards/MODEL-CARD-{component}.md`.

    Commit: `docs(20-A-05): add MODEL-CARD-agreement + HYPERPARAMETERS entry per S1 + S4`.
  </action>
  <verify>
    <automated>test -f docs/cards/MODEL-CARD-agreement.md && grep -q "Cookson" docs/cards/MODEL-CARD-agreement.md && grep -q "AGREEMENT_DEFAULT_THRESHOLD" HYPERPARAMETERS.md</automated>
  </verify>
  <done>
    Model card committed with all Mitchell-2019 sections + Cookson/Engelberg citation + null-result handling + 6-month re-evaluation; HYPERPARAMETERS.md documents the default + override mechanism + grid range; `check-model-cards.ts` recognizes the new card (or TODO recorded if 20-Z-02 unmerged).
  </done>
</task>

</tasks>

<verification>

## Numerical acceptance criteria (S8 — zero adjectives)

| # | Check | Pass condition |
|---|-------|----------------|
| 1 | Unit tests pass | `npm test -- sentiment-agreement.unit.test.ts learning-pattern-key-agreement.unit.test.ts` exits 0 with ≥15 cases passing |
| 2 | AgreementCalibration table exists | `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM agreement_calibrations"` returns a numeric value (table exists, even if zero rows pre-cron) |
| 3 | Cron has run at least once | After waiting one calibration tick (or manual `curl /api/cron/agreement-calibration`): `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM agreement_calibrations"` returns ≥ 1 |
| 4 | SentimentIntelligenceSection schema | `grep -q "agreement_score" src/lib/types.ts && grep -q "low_agreement_warning" src/lib/types.ts` returns 0 |
| 5 | UI badge renders below threshold | Playwright e2e `tests/e2e/agreement-badge.spec.ts` passes; screenshot confirmed amber-colored badge with Cookson tooltip |
| 6 | LearnedPattern.pattern_key includes agreement_bucket | `grep -q "agreement_bucket" src/lib/learning.ts && grep -q "AgreementBucket" src/lib/learning.ts` returns 0; round-trip test in `tests/learning-pattern-key-agreement.unit.test.ts` passes |
| 7 | Backward compatibility | Test asserts a legacy pattern_key (no `:agreement=` suffix) resolves to `agreement_bucket: 'na'` and continues matching existing LearnedPattern rows; `prisma.learnedPattern.count({ where: { pattern_key: { not: { contains: ':agreement=' } } } })` returns the same value pre/post-deploy |
| 8 | Integration test green | `npm run test:integration -- agreement-calibration` exits 0 |
| 9 | Calibration null-result handling | Calibration script run on a synthetic backfill where no candidate beats baseline → produces row with `threshold = 0.5` AND `null_result = true` (verified via Test 1 in integration test) |
| 10 | Range validation throws | Aggregator throws on bullish_pct = 0.5 (out of [0,100] when interpreted as percent) with error message containing "T-20-A-05-02" |
| 11 | Cookson citation present | `grep -q "Cookson" docs/cards/MODEL-CARD-agreement.md && grep -q "Cookson" src/components/ResearchReport.tsx` returns 0 |
| 12 | Cron entry present | `grep -q "/api/cron/agreement-calibration" vercel.json && grep -q "0 6 1 \* \*" vercel.json` returns 0 |
| 13 | Spot-check helper PASSES | `npm run spot-check-agreement` exits 0 with PASS on 100 production rows (formula matches written value within 1e-9) |
| 14 | tsc clean | `npx tsc --noEmit` exits 0 |
| 15 | Shadow flag introduced | `grep -q "FEATURE_AGREEMENT_SIGNAL" src/lib/features.ts` returns 0 |

## Shadow → on cutover (S3)

Operator flips `FEATURE_AGREEMENT_SIGNAL` from `'shadow'` to `'on'` ONLY when:
1. ≥7 calendar days elapsed since shadow rollout AND `/insights/sentiment-health` (20-Z-03) shows zero exceptions in agreement-signal compute path
2. `npm run spot-check-agreement` PASSES on 100 production observations
3. `prisma.agreementCalibration.count() >= 1` AND latest row either: (a) `null_result = false` AND `vol_uplift_ci_low > 0`, OR (b) `null_result = true` with operator-acknowledged null-result note

After cutover, the `'off'` and `'shadow'` branches and the flag itself are deleted in a follow-up commit per S3 — no dead code left behind.

</verification>

<success_criteria>

Plan is DONE when:

1. All 10 tasks committed (`git log --oneline | grep "20-A-05"` shows ≥10 entries)
2. All 15 numerical checks in `<verification>` pass
3. `npx prisma db push` against live Neon succeeded; `agreement_calibrations` table + index exist (Task 3 operator gate complete)
4. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-commit (per Hard Cleanup Gate item 4)
5. MODEL-CARD-agreement.md committed with Cookson/Engelberg citation + null-result handling + 6-month re-evaluation cadence
6. `FEATURE_AGREEMENT_SIGNAL` flag exists at `'shadow'` default; cutover-to-`'on'` is a separate operator action gated on the three numerical criteria above
7. Backward compatibility proven: existing LearnedPattern rows continue to be matched via the `'na'` bucket; new `'mixed'` / `'aligned'` buckets accumulate fresh Beta posteriors per the documented retrain cadence
8. Phase 20 standards adherence demonstrated: S1 (calibration replaces hand-picked threshold OR null-result documented), S3 (shadow flag), S4 (model card), S7 (5 threats), S8 (numerical acceptance — 15 checks, zero adjectives)

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-A-05-SUMMARY.md` recording:

- Final calibrated threshold value (or null-result + 0.5 fallback)
- `vol_uplift_vs_baseline` + bootstrap CI from the first AgreementCalibration row
- Cutover-to-`'on'` date OR a flag noting still in shadow with the gating-criteria delta
- Pattern-key extension impact: count of LearnedPattern rows with `:agreement=mixed` vs `:agreement=aligned` vs legacy ('na') after one full cron cycle of writes
- Any deviations from the 9 verification numerical checks (zero deviations expected)
- Reference to MODEL-CARD-agreement.md for the 6-month re-evaluation calendar
</output>
