---
phase: 20
plan: 20-A-01
wave: A
type: execute
depends_on:
  - 20-Z-01
files_modified:
  - prisma/schema.prisma
  - src/lib/sentiment/dispersion.ts
  - src/lib/sentiment/aggregator.ts
  - src/lib/sentiment/crowded-consensus-config.ts
  - src/components/ResearchReport.tsx
  - src/app/api/cron/calibrate-crowded-consensus/route.ts
  - scripts/calibrate-crowded-consensus.ts
  - vercel.json
  - package.json
  - HYPERPARAMETERS.md
  - docs/cards/MODEL-CARD-crowded-consensus.md
  - tests/sentiment/dispersion.unit.test.ts
  - tests/sentiment/crowded-consensus.unit.test.ts
  - tests/integration/crowded-consensus-calibration.integration.test.ts
  - tests/components/research-report-crowded-consensus.unit.test.tsx
autonomous: false
requirements: []
shadow_required: true
shadow_skip_reason: null
shadow_lifecycle:
  off_default: true
  shadow_persist_column: "crowded_consensus_shadow"
  shadow_persist_target: "SentimentSnapshot.community_aggregated.crowded_consensus_shadow (JSONB key — additive, no schema change)"
  cutover_criteria:
    - "≥7 calendar days of shadow-mode operation since first crowded_consensus calibration row landed"
    - "≥10 distinct (ticker, scanned_at) shadow-flagged firings during the shadow window"
    - "Operator-driven false-positive spot-check on a uniformly-random sample of 20 shadow firings reports FP-rate ≤ 0.20 (FP defined: human reviewer determines flag fired in absence of any echo-chamber concentration — recorded in docs/cards/MODEL-CARD-crowded-consensus.md spot-check log section)"
    - "Latest CrowdedConsensusCalibration row has brier_skill_score > 0 (i.e., the calibrated thresholds outperform the constant base-rate predictor on the trailing 90d sample)"
  cutover_action: "Set FEATURE_CROWDED_CONSENSUS=on in src/lib/features.ts; on path renders the UI badge; off path remains intact for one full release cycle before deletion (per S3 hard cleanup gate, deletion happens in 20-A-01-FOLLOWUP plan filed at cutover time, NOT this plan)"
hard_cleanup_gate: true
must_haves:
  truths:
    - "CrowdedConsensusCalibration table exists in production Neon with composite index on (computed_at DESC, model_version)"
    - "shannonEntropy({bull, bear, neutral}) returns log₂(3) ≈ 1.585 for uniform input, 0 for fully-concentrated input — verified by unit test on the literal numbers"
    - "bullPctStd(perSource) returns the population standard deviation of bull_pct values (divisor n, not n-1) — verified by unit test"
    - "authorDiversityGini(messagesByAuthor) returns 0 for perfectly equal distribution and approaches 1 as one author dominates — verified by unit test against a 3-author fixture with closed-form expected values"
    - "crowdedConsensus(features, thresholds) returns true iff (entropy < H_thresh AND mention_z > V_thresh AND author_diversity > D_thresh) — note: high Gini = LOW diversity, so the literal predicate is gini > D_thresh; spec wording 'author_diversity < D_thresh' is preserved in the model card with the gini-conversion footnote"
    - "Aggregator reads the LATEST CrowdedConsensusCalibration row at runtime (cached for 1h) — never hardcodes thresholds in TS source"
    - "Calibration script grid-searches H_thresh ∈ [0.3, 1.5] step 0.1, V_thresh ∈ [1.0, 5.0] step 0.25, D_thresh ∈ [0.1, 0.7] step 0.05 over trailing 90d SentimentObservation rows joined to forward-14d alpha-vs-SPY from PriceOutcome"
    - "Calibration optimizes Brier Skill Score = 1 - BS_model / BS_climatology where BS = mean((p − y)²) and climatology p = base-rate of underperformance in the training window"
    - "Calibration script refuses to run when n_examples < 30 and emits structured 'INSUFFICIENT_DATA' exit code (4) — gates Wave A from polluting HYPERPARAMETERS.md with under-powered thresholds"
    - "Backfill regression test asserts: when run against the trailing 90d window containing GME/AMC/BBBY observations from Phase 19 production data, ≥1 ticker fires crowded_consensus = true under the persisted thresholds (test SKIPS with documented reason if Phase 19 backfill is empty in the test database, so Wave Z dependency does not block CI)"
    - "UI badge renders only when (a) FEATURE_CROWDED_CONSENSUS === 'on' AND (b) sentiment_intelligence.crowded_consensus === true; in 'shadow' mode the flag is computed and persisted but the badge is suppressed"
    - "UI badge text contains the literal strings 'Crowded consensus' and 'mean-reversion within 14d' AND 'Cookson & Engelberg 2022' citation — asserted by RTL snapshot test"
    - "Monthly cron /api/cron/calibrate-crowded-consensus is scheduled in vercel.json with cron expression '0 7 1 * *' (1st of month, 07:00 UTC)"
    - "Cron route enforces CRON_SECRET Bearer auth per project convention (CLAUDE.md skill:cron-jobs)"
    - "HYPERPARAMETERS.md gains a 'crowded_consensus' subsection with the latest H/V/D thresholds, brier_skill_score, training_window_days, n_examples, computed_at"
    - "MODEL-CARD-crowded-consensus.md committed at docs/cards/ following the Mitchell-2019 template — referenced from the 20-Z-02 model card scaffold registry"
    - "crowdedConsensus computation MUST use the existing mention_z formula contract from 20-A-02 (forward-ref). For this plan, the implementation calls a stub `mentionZ(observations): number` from src/lib/sentiment/mention-z-stub.ts that returns 0 + a TODO marker until 20-A-02 ships; flag therefore CANNOT fire under shadow until 20-A-02 lands. This is the ordering invariant — the cutover criteria above are evaluated AFTER 20-A-02 is live"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "CrowdedConsensusCalibration model + composite index"
      contains: "model CrowdedConsensusCalibration"
    - path: "src/lib/sentiment/dispersion.ts"
      provides: "shannonEntropy + bullPctStd + authorDiversityGini + crowdedConsensus pure functions (NO IO)"
      contains: "export function shannonEntropy"
    - path: "src/lib/sentiment/crowded-consensus-config.ts"
      provides: "loadLatestCrowdedConsensusThresholds() with 1h in-memory cache; never hardcodes a threshold"
      contains: "loadLatestCrowdedConsensusThresholds"
    - path: "src/lib/sentiment/aggregator.ts"
      provides: "Extends AggregatedSentiment with crowded_consensus + dispersion_features fields; computation gated behind FEATURE_CROWDED_CONSENSUS three-mode flag"
      contains: "crowded_consensus"
    - path: "src/components/ResearchReport.tsx"
      provides: "Conditional badge inside the existing Sentiment Intelligence card (lines 633-720) when crowded_consensus is true AND feature flag is 'on'"
      contains: "Crowded consensus"
    - path: "src/app/api/cron/calibrate-crowded-consensus/route.ts"
      provides: "Monthly Vercel cron — invokes the calibration script, persists CrowdedConsensusCalibration row, appends HYPERPARAMETERS.md entry, returns 200/JSON summary"
      contains: "CRON_SECRET"
    - path: "scripts/calibrate-crowded-consensus.ts"
      provides: "Operator-runnable + cron-runnable grid search over H/V/D ranges; persists winning thresholds + Brier skill score"
      contains: "Brier"
    - path: "vercel.json"
      provides: "New crons[] entry: '/api/cron/calibrate-crowded-consensus' on schedule '0 7 1 * *'"
      contains: "calibrate-crowded-consensus"
    - path: "HYPERPARAMETERS.md"
      provides: "Crowded-consensus section with H/V/D + brier_skill_score + computed_at + training_window_days + n_examples"
      contains: "crowded_consensus"
    - path: "docs/cards/MODEL-CARD-crowded-consensus.md"
      provides: "Mitchell-2019 model card stub for the composite signal; sections per S4"
      contains: "Intended use"
    - path: "tests/sentiment/dispersion.unit.test.ts"
      provides: "≥10 unit cases covering shannonEntropy, bullPctStd, authorDiversityGini formulas + edge cases (empty input, single class, NaN/Infinity guards)"
    - path: "tests/sentiment/crowded-consensus.unit.test.ts"
      provides: "≥6 unit cases on the boolean predicate (each predicate condition independently false → false; all true → true; threshold loading)"
    - path: "tests/integration/crowded-consensus-calibration.integration.test.ts"
      provides: "Live-Neon test — seeds 30-day fixture (≥30 SentimentObservation + matching PriceOutcome rows + ≥1 GME-shaped synthetic ticker), runs calibrator, asserts CrowdedConsensusCalibration row persists, asserts GME-shape fires the flag under the persisted thresholds"
    - path: "tests/components/research-report-crowded-consensus.unit.test.tsx"
      provides: "RTL test — asserts badge renders with literal text + citation when crowded_consensus=true AND flag=on; suppressed in shadow + off"
  key_links:
    - from: "src/lib/sentiment/aggregator.ts aggregateCommunitySentiment()"
      to: "src/lib/sentiment/crowded-consensus-config.ts loadLatestCrowdedConsensusThresholds()"
      via: "1h-cached read of LATEST CrowdedConsensusCalibration row at the start of each aggregation call"
      pattern: "loadLatestCrowdedConsensusThresholds\\("
    - from: "src/lib/sentiment/aggregator.ts"
      to: "src/lib/sentiment/dispersion.ts crowdedConsensus()"
      via: "pure-function call with the three computed dispersion features + the loaded thresholds"
      pattern: "crowdedConsensus\\("
    - from: "src/components/ResearchReport.tsx (Sentiment Intelligence Card block at lines 633-720)"
      to: "sentiment_intelligence.crowded_consensus boolean field"
      via: "conditional render inside the existing card; new badge sibling to the TRENDING badge at line 641"
      pattern: "Crowded consensus"
    - from: "src/app/api/cron/calibrate-crowded-consensus/route.ts"
      to: "scripts/calibrate-crowded-consensus.ts runCalibration()"
      via: "import { runCalibration } from '@/../scripts/calibrate-crowded-consensus'"
      pattern: "runCalibration\\("
    - from: "vercel.json crons[]"
      to: "/api/cron/calibrate-crowded-consensus"
      via: "monthly schedule entry — 1st of each month at 07:00 UTC"
      pattern: "calibrate-crowded-consensus"
    - from: "src/lib/sentiment/dispersion.ts crowdedConsensus()"
      to: "src/lib/sentiment/mention-z-stub.ts mentionZ()"
      via: "TEMPORARY stub returning 0 — 20-A-02 replaces this import with the real volume-baselining implementation"
      pattern: "mention-z-stub"
---

# Plan 20-A-01: Dispersion + `crowded_consensus` flag (the GME-100% fix)

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE step only: the `npx prisma db push` against live Neon (per CONTEXT.md line 172 "Prisma schema migration + db push (additive, non-blocking)"). All other tasks are autonomous. After the operator confirms the push has landed, the remaining tasks (dispersion module, aggregator wiring, calibration script, cron, UI, tests, model card, HYPERPARAMETERS update, commit) proceed without further prompts.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **Shadow lifecycle is staged but NOT graduated in this plan** — feature ships in `off` mode by default; cutover from shadow → on is performed in a follow-up plan filed at cutover time (`20-A-01-FOLLOWUP-CUTOVER`) once the four numerical cutover criteria in frontmatter `shadow_lifecycle.cutover_criteria` are met. This plan ships the shadow infrastructure + the off path only.
2. **No old code deleted** (additive — extends `AggregatedSentiment`, extends Sentiment Intelligence Card, adds new Prisma model, adds new cron route).
3. **Feature flag `FEATURE_CROWDED_CONSENSUS: 'off' | 'shadow' | 'on'` introduced in src/lib/features.ts** with default `off`. The `off` path is preserved verbatim until cutover-FOLLOWUP plan removes it (per S3 hard cleanup gate — deletion is the responsibility of the FOLLOWUP plan, not this plan).
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), and `npm run test:e2e` (Playwright) all green on `main` post-commit.
5. **Schema Push Gate**: `npx prisma db push` succeeded against live `DATABASE_URL` AND the integration test `tests/integration/crowded-consensus-calibration.integration.test.ts` writes ≥1 CrowdedConsensusCalibration row in a single calibration invocation against the seeded 30-day fixture.
6. **Calibration Smoke Gate**: `npm run calibrate-crowded-consensus` against the live trailing-90d production database EITHER (a) writes a CrowdedConsensusCalibration row with non-null thresholds + brier_skill_score, OR (b) exits with code 4 ('INSUFFICIENT_DATA') AND the operator has acknowledged in the run log. Both outcomes are accepted; silent failure is not.
7. **Backfill Regression Gate**: integration test asserts ≥1 historical GME-style ticker (synthetic fixture, since real-Neon Phase-19 data may not contain GME) fires `crowded_consensus = true` under the persisted thresholds — proves the calibration grid is not vacuously tight.
8. **UI Render Gate**: RTL test asserts badge text contains literal "Crowded consensus", "mean-reversion within 14d", "Cookson & Engelberg 2022" when feature flag is `on` AND `crowded_consensus === true`.
9. **Model Card Gate**: `docs/cards/MODEL-CARD-crowded-consensus.md` committed; passes any 20-Z-02 `check-model-cards.ts` if it exists at the time this plan ships (forward-reference: if 20-Z-02 has not landed yet, the file presence is sufficient — schema linting deferred to 20-Z-02).
10. **HYPERPARAMETERS Gate**: `HYPERPARAMETERS.md` contains a `## crowded_consensus` section with H/V/D + brier_skill_score + computed_at fields populated by the calibration run.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — H_thresh, V_thresh, D_thresh are NEVER hand-set. They live exclusively in the `CrowdedConsensusCalibration` table written by the grid-search calibration script. The grid search ranges (H ∈ [0.3, 1.5], V ∈ [1.0, 5.0], D ∈ [0.1, 0.7]) are the literal experiment ranges from CONTEXT.md line 103 — those are search bounds, not tuned values. Recalibration runs monthly via cron. The aggregator refuses to compute the flag if no calibration row exists (returns `crowded_consensus: null`).
- **S2 (PIT discipline)** — Calibration loads SentimentObservation rows by `fetched_at` (the PIT-INVARIANT column from 20-Z-01) NEVER `published_at`. Forward 14d alpha-vs-SPY is read from the existing `PriceOutcome` table where `recorded_at` ≥ `scanned_at + 14d`. The lookahead-bias regression test (20-Z-07, future plan) will catch any violation.
- **S3 (per-plan shadow lifecycle)** — `FEATURE_CROWDED_CONSENSUS: 'off' | 'shadow' | 'on'`. Default `off`. Shadow mode computes the flag + persists into `SentimentSnapshot.community_aggregated.crowded_consensus_shadow` (JSONB key, no schema change), but does NOT render UI. Cutover criteria are 4 numerical thresholds in frontmatter. Cutover + off-path deletion are deferred to `20-A-01-FOLLOWUP-CUTOVER` plan filed when criteria are met.
- **S4 (model card per artifact)** — `docs/cards/MODEL-CARD-crowded-consensus.md` committed in this plan. This composite signal needs a card per Mitchell 2019 because it combines three independently-noisy features (entropy + volume-z + author Gini) into a single boolean output.
- **S5 (pinned model + prompt versions)** — N/A; no model invocation. The calibration script pins its own algorithm version via `model_version` column on CrowdedConsensusCalibration ('grid-search-v1').
- **S6 (telemetry on every external call)** — N/A; no external call. The cron endpoint is wrapped by Next.js routing only; future plans may wrap with `withTelemetry()` once 20-Z-03 ships.
- **S7 (threat model)** — five plan-level threats T-20-A-01-{01..05} below. T-20-A-01-01 (calibration data leak) maps to phase catalog T-28-002. T-20-A-01-02 (GME never fires) is a regression-test obligation. T-20-A-01-03 (FP suppression) is the spot-check audit obligation in the cutover criteria. T-20-A-01-04 (drift) is the monthly-cron obligation. T-20-A-01-05 (panic UI) is the regulatory hygiene S10 obligation.
- **S8 (numerical acceptance)** — every gate above is grep / row-count / Brier-skill-score / FP-rate. Zero adjectives.
- **S10 (regulatory hygiene)** — UI badge text is informational base-rate framing ("historical base-rate of mean-reversion") NOT a recommendation. Citation to Cookson & Engelberg 2022 is literal in the badge so the user can audit the source.

## Forward-reference dependencies (NOT blocking this plan)

- **20-A-02** ships the real `mentionZ()` volume-baselining function. This plan ships `src/lib/sentiment/mention-z-stub.ts` returning 0 + a TODO marker. The flag therefore CANNOT fire in production until 20-A-02 lands and the stub is replaced. This is correct ordering — the cutover criteria can only be evaluated AFTER 20-A-02 is live, so deferring fire-readiness is intentional.
- **20-A-04** ships richer Gini work (per-author rolling window). This plan ships `authorDiversityGini()` standalone for use in the predicate. 20-A-04 may consolidate by importing from this module — no rework expected.
- **20-Z-02** ships the model-card scaffold + `check-model-cards.ts`. This plan ships the model card content but does NOT add the CI gate; that's 20-Z-02's scope.

</universal_preamble>

<objective>
Implement the dispersion + `crowded_consensus` flag — the GME-100% fix. Compute Shannon entropy of bull/bear/neutral message tags, bull_pct standard deviation across cross-platform sources, and author concentration (Gini). Flag fires when entropy is low AND mention volume is anomalously high AND author diversity is low — meaning a small number of accounts are pushing a one-sided narrative on unusually high volume. Per Cookson & Engelberg 2022 ("Echo Chambers"), this is a CROWDING signal that mean-reverts within 14 days, NOT a thesis confirmation.

Thresholds (H_thresh, V_thresh, D_thresh) are CALIBRATED via grid search maximizing Brier Skill Score on the binary "crowded → underperformed SPY at 14d" claim across the trailing 90d production sentiment + price-outcome data. Recalibrated monthly via Vercel cron. Per S1, hand-set thresholds are PROHIBITED.

Ships in `off` mode with shadow infrastructure ready. Cutover (shadow → on + off-path deletion) is a follow-up plan filed when the 4 numerical cutover criteria in frontmatter are met.

Purpose: GME report rendered `100% bullish` from a single-source vendor tag — exactly the failure mode Cookson & Engelberg's academic finding predicts. This plan operationalizes that finding into a UI warning so the user reads "100% bullish on high mention volume + low author diversity" as RISK, not THESIS.

Output:
- 1 new Prisma model + 1 composite index (CrowdedConsensusCalibration)
- 1 dispersion module (4 pure functions, ~120 LOC, zero IO)
- 1 config loader with 1h cache
- 1 mention-z stub (replaced by 20-A-02)
- 1 aggregator extension (add 2 fields to AggregatedSentiment + flag-gated compute path)
- 1 UI badge inside the existing Sentiment Intelligence card
- 1 calibration script (operator + cron runnable, ~250 LOC)
- 1 cron route + vercel.json entry (monthly)
- 1 unit test file for dispersion (≥10 cases)
- 1 unit test file for the predicate (≥6 cases)
- 1 live-Neon integration test (calibration end-to-end + GME backfill regression)
- 1 RTL component test (badge render contract)
- 1 HYPERPARAMETERS.md section
- 1 Mitchell-2019 model card
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md
@CLAUDE.md
@prisma/schema.prisma
@src/lib/sentiment/aggregator.ts
@src/lib/data/stocktwits.ts
@src/components/ResearchReport.tsx
@src/lib/types.ts
@src/lib/db.ts
@vercel.json

<interfaces>
```typescript
// src/lib/sentiment/dispersion.ts — NEW. Pure functions, zero IO.

/**
 * Shannon entropy in bits over the {bull, bear, neutral} categorical
 * distribution of per-message classifier tags.
 *
 * Formula: H(X) = -Σ p_i × log₂(p_i)
 *
 * Returns:
 *   - log₂(3) ≈ 1.585 when {bull, bear, neutral} is uniform (max disorder)
 *   - 0 when one category holds 100% of the mass (max concentration → CROWDED)
 *   - Convention 0 × log₂(0) := 0 (standard for empty bins).
 *
 * Throws when:
 *   - any count is negative, NaN, or Infinity
 *   - bull + bear + neutral === 0 (caller must filter empty windows upstream)
 */
export function shannonEntropy(counts: { bull: number; bear: number; neutral: number }): number;

/**
 * Population standard deviation (divisor n, not n-1) of bull_pct values
 * across cross-platform sources. Used as the secondary disagreement signal —
 * the entropy is intra-platform per-message; this is inter-platform per-source.
 *
 * Returns:
 *   - 0 when all sources report identical bull_pct
 *   - Up to 50 when half are at 0 and half at 100
 *   - 0 when perSource.length < 2 (cannot compute stdev with one observation;
 *     callers should treat single-source as "low cross-platform agreement signal")
 */
export function bullPctStd(perSource: { source: string; bull_pct: number }[]): number;

/**
 * Gini coefficient of message-counts-per-author within a window.
 *
 * Formula (mean-difference form for bias-resistance with small samples):
 *   G = (Σᵢ Σⱼ |x_i − x_j|) / (2 × n² × x̄)
 *
 * Returns:
 *   - 0 when every author has the same count (perfect equality, HIGH diversity)
 *   - Approaches 1 as a single author dominates (perfect inequality, LOW diversity)
 *   - 0 when messagesByAuthor.size === 0 (vacuous; caller filters empty windows)
 *
 * Note on naming inversion: spec wording "author_diversity < D_thresh" reads
 * naturally but Gini is INVERSELY related to diversity. The crowdedConsensus
 * predicate below uses gini > D_thresh (the equivalent rephrasing). The model
 * card documents the conversion explicitly so future maintainers don't get
 * tripped up by the spec-vs-implementation orientation.
 */
export function authorDiversityGini(messagesByAuthor: Map<string, number>): number;

export interface DispersionFeatures {
  /** Shannon entropy in bits over {bull, bear, neutral} message tags. */
  entropy_bits: number;
  /** Population stdev of bull_pct across contributing sources. 0 if <2 sources. */
  bull_pct_std: number;
  /** Gini of per-author message counts in the window. */
  author_gini: number;
  /** Mention z-score from 20-A-02 (stub returns 0 until 20-A-02 ships). */
  mention_z: number;
}

export interface CrowdedConsensusThresholds {
  H_thresh: number;   // entropy ceiling
  V_thresh: number;   // mention-z floor
  D_thresh: number;   // gini floor (high gini = low diversity)
  model_version: string;
  computed_at: Date;
  brier_skill_score: number;
}

/**
 * The flag predicate.
 *
 *   crowded_consensus = (entropy < H_thresh) AND (mention_z > V_thresh) AND (gini > D_thresh)
 *
 * All three conditions must be met. The aggregator returns:
 *   - true / false when all four DispersionFeatures fields are finite
 *   - null when any input is non-finite OR thresholds are unavailable
 *     (calibration row missing) — distinguishes "cannot compute" from "did
 *     not fire" so the UI never shows a false negative as a true negative.
 */
export function crowdedConsensus(
  features: DispersionFeatures,
  thresholds: CrowdedConsensusThresholds,
): boolean | null;
```

```typescript
// src/lib/sentiment/mention-z-stub.ts — NEW. Replaced by 20-A-02.

/**
 * TEMPORARY stub. Always returns 0 — meaning the V_thresh > 0 calibrated
 * threshold will never fire under shadow until 20-A-02 ships the real
 * volume-baselining implementation (median + MAD per cap_class).
 *
 * This is the correct ordering: 20-A-01 ships the predicate + calibration
 * scaffold so 20-A-02's mention_z output has a consumer ready on day one.
 *
 * 20-A-02 deliverable: replace this file's content with `import { mentionZ }
 * from '@/lib/sentiment/mention-z'` re-export. Callers do not change.
 */
export function mentionZ(_observations: unknown[]): number;
```

```typescript
// src/lib/sentiment/crowded-consensus-config.ts — NEW.

import type { CrowdedConsensusThresholds } from '@/lib/sentiment/dispersion';

/**
 * Reads the LATEST CrowdedConsensusCalibration row (ORDER BY computed_at DESC LIMIT 1).
 * Result is cached in-process for 1 hour. Returns null when no calibration row exists.
 *
 * This 1h cache means:
 *   - The monthly-cron-recomputed thresholds are picked up within 1h of the cron run.
 *   - Per-request DB hit is bounded.
 *   - Test reset: exposes `__resetCacheForTests()` for deterministic test setup.
 */
export async function loadLatestCrowdedConsensusThresholds(): Promise<CrowdedConsensusThresholds | null>;

export function __resetCacheForTests(): void;
```

```typescript
// src/lib/sentiment/aggregator.ts — EXTEND existing AggregatedSentiment.
// Additive — existing fields preserved verbatim.

export interface AggregatedSentiment {
  aggregated_bull_pct: number | null;
  aggregated_bear_pct: number | null;
  source_count: number;
  components: SentimentComponent[];
  // ── NEW (Plan 20-A-01) ─────────────────────────────────────
  /**
   * true  → flag fires (warning UI in 'on' mode)
   * false → flag explicitly does NOT fire
   * null  → cannot compute (calibration unavailable, or any input non-finite)
   */
  crowded_consensus?: boolean | null;
  /** Inputs used to compute the flag — surfaced for telemetry + the model card spot-check log. */
  dispersion_features?: DispersionFeatures | null;
  /** 'off' | 'shadow' | 'on' — the value FEATURE_CROWDED_CONSENSUS read at compute time. */
  crowded_consensus_mode?: 'off' | 'shadow' | 'on';
}

/**
 * Computation rule:
 *   - mode 'off':    crowded_consensus = undefined; dispersion_features = undefined
 *   - mode 'shadow': compute, persist into SentimentSnapshot.community_aggregated.crowded_consensus_shadow,
 *                    but DO NOT surface to ResearchReport (UI suppresses on 'shadow')
 *   - mode 'on':     compute + surface to UI
 */
```

```prisma
// prisma/schema.prisma — NEW model (appended after EngineThesis at line 220)

model CrowdedConsensusCalibration {
  id                   String   @id @default(uuid())
  computed_at          DateTime @default(now()) @db.Timestamptz
  model_version        String   // e.g. 'grid-search-v1'
  H_thresh             Float    // entropy ceiling
  V_thresh             Float    // mention-z floor
  D_thresh             Float    // gini floor (high gini = low diversity)
  brier_skill_score    Float    // 1 - BS_model / BS_climatology; >0 means we beat base rate
  training_window_days Int      // e.g. 90
  n_examples           Int      // sample size used in grid search
  grid_search_log      Json     // top-5 (H, V, D, score) tuples for audit
  notes                String?  @db.Text

  @@index([computed_at(sort: Desc), model_version], map: "idx_cc_calib_computed_at")
  @@map("crowded_consensus_calibrations")
}
```

```typescript
// scripts/calibrate-crowded-consensus.ts — NEW.

/**
 * Grid-searches H_thresh × V_thresh × D_thresh maximizing Brier Skill Score
 * on the binary outcome "crowded_consensus → underperformed SPY at 14d" over
 * the trailing 90 days of (SentimentObservation joined to PriceOutcome).
 *
 * Search ranges (LITERAL — from CONTEXT.md line 103):
 *   H_thresh ∈ [0.3, 1.5] step 0.1   → 13 values
 *   V_thresh ∈ [1.0, 5.0] step 0.25  → 17 values
 *   D_thresh ∈ [0.1, 0.7] step 0.05  → 13 values
 *   Total grid points: 13 × 17 × 13 = 2,873
 *
 * Brier Skill Score:
 *   BS_model       = mean( (p_pred − y_actual)² ) where p_pred ∈ {0, 1} (boolean → {0,1})
 *   BS_climatology = mean( (p_base_rate − y_actual)² )
 *   BSS            = 1 − BS_model / BS_climatology
 *   BSS > 0  → model beats base rate
 *   BSS = 0  → model equals base rate (no skill)
 *   BSS < 0  → model worse than base rate
 *
 * Refuses to run when n_examples < 30; exit code 4 ('INSUFFICIENT_DATA').
 *
 * Persists winning thresholds → CrowdedConsensusCalibration table.
 * Appends entry → HYPERPARAMETERS.md.
 *
 * Exit codes:
 *   0 — success (row written)
 *   4 — INSUFFICIENT_DATA (n_examples < 30)
 *   5 — DB_ERROR
 */
export async function runCalibration(opts?: {
  windowDays?: number;       // default 90
  minExamples?: number;      // default 30
  modelVersion?: string;     // default 'grid-search-v1'
  dryRun?: boolean;          // default false
}): Promise<{
  exit_code: 0 | 4 | 5;
  thresholds: CrowdedConsensusThresholds | null;
  n_examples: number;
  brier_skill_score: number | null;
  top5: Array<{ H: number; V: number; D: number; bss: number }>;
}>;
```

```typescript
// src/app/api/cron/calibrate-crowded-consensus/route.ts — NEW.

import { NextResponse } from 'next/server';
import { runCalibration } from '@/../scripts/calibrate-crowded-consensus';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const result = await runCalibration({});
  return NextResponse.json(result, { status: result.exit_code === 0 ? 200 : 202 });
}
```
</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| cron → DB | Calibration script writes to CrowdedConsensusCalibration; SentimentObservation join exposes lookahead-bias risk if joined on `published_at`. |
| DB → aggregator | Aggregator reads thresholds — stale or missing row must be handled explicitly (returns null, not silent default). |
| aggregator → UI | UI renders user-visible warning text — false positive suppresses legitimate consensus, true positive prevents the GME failure mode. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-A-01-01 | Tampering / lookahead bias | scripts/calibrate-crowded-consensus.ts joining SentimentObservation to forward-14d outcomes — using `published_at` would leak future information into threshold selection | mitigate | Calibration JOIN clause uses `SentimentObservation.fetched_at` ONLY (the `// PIT-INVARIANT` column from 20-Z-01). PriceOutcome join uses `recorded_at >= scanned_at + 14d`. Integration test asserts `published_at` does not appear in any SQL/raw-query string in the calibration script (grep gate). 20-Z-07 (forward-ref) ships the global lookahead regression. **Maps to phase catalog T-28-002.** **Severity: HIGH** — silent calibration data leak invalidates the entire signal. |
| T-20-A-01-02 | Repudiation / regression | Calibrated thresholds set so high that the GME-shape ticker NEVER fires the flag — defeats the entire purpose of the plan | mitigate | Backfill regression test in `tests/integration/crowded-consensus-calibration.integration.test.ts` seeds a synthetic GME-shaped ticker (entropy ≈ 0.1, mention_z ≈ 4.5, gini ≈ 0.6) and asserts `crowded_consensus === true` under the persisted thresholds. If the test fails, the calibration grid bounds (H/V/D ranges in the calibration script) are too tight and must be widened — test failure BLOCKS plan completion. **Severity: HIGH** — without this gate, calibration could vacuously claim "100% accuracy" by never firing. |
| T-20-A-01-03 | Information disclosure / FP suppression | False positives suppress legitimate consensus (e.g., earnings beat where everyone correctly turns bullish) → user dismisses the warning as noise → real crowding events get ignored | mitigate | Spot-check audit obligation in cutover criteria: human reviewer samples 20 shadow firings uniformly at random and labels each as TP/FP; FP-rate target ≤ 0.20. Result is logged in `docs/cards/MODEL-CARD-crowded-consensus.md` "Spot-check log" section before cutover. Documented in model card as a known failure mode + retrain cadence. **Severity: MEDIUM** — degrades signal trust over time but does not invalidate methodology. |
| T-20-A-01-04 | Tampering / drift | Market regime change (e.g., 2026 retail crash kills meme volatility) makes calibrated thresholds stale → flag stops firing on real crowding events | mitigate | Monthly cron `/api/cron/calibrate-crowded-consensus` (schedule `'0 7 1 * *'`) recalibrates against trailing 90d data. Model card `last_validated` date populated by each cron run. 20-Z-06 done gate (forward-ref) will fail if recalibration missed >35d. **Severity: MEDIUM** — cron failure is observable in Vercel cron logs + 20-Z-03 telemetry. |
| T-20-A-01-05 | Information disclosure / panic | UI warning text could be misread as "SELL" recommendation by a less-sophisticated user → triggers panic action → regulatory exposure under "investment advice" framing | mitigate | UI text is informational base-rate framing — literal: "Crowded consensus — historical base-rate of mean-reversion within 14d (Cookson & Engelberg 2022)." NO action verbs (no "sell", "exit", "reduce"). Citation included so user can audit the source. Aligns with S10 regulatory hygiene. RTL test asserts the literal text — any future edit that introduces an action verb breaks the test. **Severity: LOW** — framing is the only mitigation; no automated guard against future text edits beyond the snapshot test. |

</threat_model>

<tasks>

<task type="checkpoint:human-action" id="20-A-01-01" gate="blocking">
  <name>Task 1: Operator confirmation — npx prisma db push</name>
  <files>prisma/schema.prisma (read-only — written in Task 2)</files>
  <action>
    Operator-only step. After Task 2 has staged the schema delta locally, the operator runs `npx prisma db push` against the live `DATABASE_URL` (production Neon) to land the additive `CrowdedConsensusCalibration` model + index. Schema is additive (no column drops, no type changes on existing tables) so push is non-blocking.

    Note on ordering: Task 2 writes the schema FILE; this task gates on the operator running the live `db push`. The operator may run Task 2 first, review `git diff prisma/schema.prisma`, then run the push and type "approved".
  </action>
  <what-built>
    Prisma schema gains CrowdedConsensusCalibration model + composite index. Schema is additive so push is non-blocking.
  </what-built>
  <how-to-verify>
    1. Operator reads the schema delta in Task 2's diff
    2. Operator runs `npx prisma db push` against the live `DATABASE_URL` (production Neon)
    3. Operator confirms the new table exists: `psql $DATABASE_URL -c "\d crowded_consensus_calibrations"` shows the 10 columns + the composite index
    4. Operator types "approved" to resume
  </how-to-verify>
  <verify>
    <automated>MISSING — operator-confirmed step. Mechanical verification deferred to Task 9 integration test (writes >=1 row to the live table; fails if the table does not exist).</automated>
  </verify>
  <resume-signal>Type "approved" once `npx prisma db push` has succeeded against live Neon.</resume-signal>
  <done>Operator types "approved"; live Neon contains the new `crowded_consensus_calibrations` table; Task 9 integration test mechanically proves existence by writing to it.</done>
</task>

<task type="auto" id="20-A-01-02">
  <name>Task 2: Add CrowdedConsensusCalibration model to prisma/schema.prisma</name>
  <files>prisma/schema.prisma</files>
  <action>
    Append the CrowdedConsensusCalibration model from `<interfaces>` after the EngineThesis model (currently at line ~220). Verify Prisma client regenerates: `npx prisma generate` exits 0. Do NOT edit any other model.
  </action>
  <verify>
    <automated>npx prisma generate &amp;&amp; grep -q "model CrowdedConsensusCalibration" prisma/schema.prisma &amp;&amp; grep -q "idx_cc_calib_computed_at" prisma/schema.prisma</automated>
  </verify>
  <done>Model + index added; client regenerates clean.</done>
</task>

<task type="auto" tdd="true" id="20-A-01-03">
  <name>Task 3: Write failing dispersion + crowded-consensus unit tests</name>
  <files>tests/sentiment/dispersion.unit.test.ts, tests/sentiment/crowded-consensus.unit.test.ts</files>
  <behavior>
    `tests/sentiment/dispersion.unit.test.ts` (≥10 cases):
    - shannonEntropy({bull: 1, bear: 1, neutral: 1}) ≈ log₂(3) ± 1e-9
    - shannonEntropy({bull: 100, bear: 0, neutral: 0}) === 0
    - shannonEntropy({bull: 50, bear: 50, neutral: 0}) === 1 (binary uniform)
    - shannonEntropy throws on {bull: -1, ...}
    - shannonEntropy throws on {bull: 0, bear: 0, neutral: 0}
    - bullPctStd([{a, 50}]) === 0 (single source)
    - bullPctStd([{a, 0}, {b, 100}]) === 50 (population stdev)
    - bullPctStd([]) === 0
    - authorDiversityGini(new Map([['x', 5]])) === 0 (single author trivially equal)
    - authorDiversityGini(new Map([['x', 1], ['y', 1], ['z', 1]])) === 0 (perfect equality)
    - authorDiversityGini(new Map([['x', 100], ['y', 0], ['z', 0]])) closed-form: G = (100 + 100 + 0) / (2 × 9 × (100/3)) ≈ 0.667 ± 1e-3
    - authorDiversityGini(new Map()) === 0 (empty)

    `tests/sentiment/crowded-consensus.unit.test.ts` (≥6 cases):
    - all three conditions met → true
    - entropy ≥ H_thresh → false (only condition violated)
    - mention_z ≤ V_thresh → false
    - gini ≤ D_thresh → false
    - any feature non-finite (NaN/Infinity) → null
    - thresholds null (loader returned null) → null

    All tests RED (modules do not exist yet).
  </behavior>
  <action>
    Create the two test files with the cases above. Use `import { shannonEntropy, bullPctStd, authorDiversityGini, crowdedConsensus } from '@/lib/sentiment/dispersion'` — imports will fail (module not yet created), confirming RED state.
  </action>
  <verify>
    <automated>npx vitest run tests/sentiment/dispersion.unit.test.ts tests/sentiment/crowded-consensus.unit.test.ts 2>&amp;1 | grep -qE "FAIL|Cannot find module"</automated>
  </verify>
  <done>≥16 unit tests written; all RED (module not yet created).</done>
</task>

<task type="auto" tdd="true" id="20-A-01-04">
  <name>Task 4: Implement src/lib/sentiment/dispersion.ts (pure functions, no IO)</name>
  <files>src/lib/sentiment/dispersion.ts, src/lib/sentiment/mention-z-stub.ts</files>
  <action>
    Create `src/lib/sentiment/dispersion.ts` implementing the 4 exports from `<interfaces>`:
    - `shannonEntropy({bull, bear, neutral})` — formula H = -Σ p_i log₂(p_i); convention 0×log₂(0):=0; throws on negatives/NaN/all-zero
    - `bullPctStd(perSource)` — population stdev (divisor n); returns 0 when length < 2
    - `authorDiversityGini(messagesByAuthor)` — mean-difference Gini formula in the interfaces docstring; returns 0 on empty/single-author
    - `crowdedConsensus(features, thresholds)` — boolean predicate; returns null on non-finite inputs OR null thresholds

    Create `src/lib/sentiment/mention-z-stub.ts`:
    - Single export `mentionZ(_observations: unknown[]): number { return 0; }`
    - File-top comment: `// TODO(20-A-02): replace with real volume-baselining median+MAD per cap_class`

    Run the tests from Task 3 — all GREEN.

    Do NOT touch the aggregator yet (Task 6).
  </action>
  <verify>
    <automated>npx vitest run tests/sentiment/dispersion.unit.test.ts tests/sentiment/crowded-consensus.unit.test.ts</automated>
  </verify>
  <done>Dispersion module + stub implemented; ≥16 unit tests GREEN.</done>
</task>

<task type="auto" id="20-A-01-05">
  <name>Task 5: Implement crowded-consensus-config.ts (1h cache loader)</name>
  <files>src/lib/sentiment/crowded-consensus-config.ts</files>
  <action>
    Create `src/lib/sentiment/crowded-consensus-config.ts` with:
    - `loadLatestCrowdedConsensusThresholds(): Promise&lt;CrowdedConsensusThresholds | null&gt;`
      - In-process module-scoped cache `{ value, fetched_at }` with TTL = 60 × 60 × 1000 ms
      - Reads via `prisma.crowdedConsensusCalibration.findFirst({ orderBy: { computed_at: 'desc' } })`
      - Returns null when no row exists (NOT throwing — null is a valid "shadow not yet calibrated" state)
      - Maps Prisma row to CrowdedConsensusThresholds shape
    - `__resetCacheForTests()` — clears the cache for deterministic tests

    No tests required at this layer (covered by integration test in Task 9 + unit tests use `__resetCacheForTests` to swap fixtures).
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&amp;1 | grep -v "node_modules" | grep -qvE "error TS" || true; test -f src/lib/sentiment/crowded-consensus-config.ts &amp;&amp; grep -q "loadLatestCrowdedConsensusThresholds" src/lib/sentiment/crowded-consensus-config.ts</automated>
  </verify>
  <done>Config loader compiles; TS clean; export present.</done>
</task>

<task type="auto" id="20-A-01-06">
  <name>Task 6: Wire flag computation into aggregator + extend AggregatedSentiment + introduce FEATURE_CROWDED_CONSENSUS flag</name>
  <files>src/lib/sentiment/aggregator.ts, src/lib/features.ts, src/lib/types.ts</files>
  <action>
    1. **src/lib/features.ts** — Add `FEATURE_CROWDED_CONSENSUS: ('off' | 'shadow' | 'on')` to the FEATURES export, default `'off'`. Read from `process.env.FEATURE_CROWDED_CONSENSUS` if set, else `'off'`. Validate at module load with a Zod-style guard (mirror existing 19-A-01 pattern).

    2. **src/lib/sentiment/aggregator.ts** — Extend `AggregatedSentiment` with the 3 new optional fields from `<interfaces>` (`crowded_consensus`, `dispersion_features`, `crowded_consensus_mode`).

       Add a new exported function `computeCrowdedConsensus(args: {
         components: SentimentComponent[];
         messageTagCounts: { bull: number; bear: number; neutral: number };
         messagesByAuthor: Map&lt;string, number&gt;;
         observations: unknown[];  // forward-ref for mentionZ stub
       }): Promise&lt;{ flag: boolean | null; features: DispersionFeatures | null; mode: 'off'|'shadow'|'on' }&gt;`

       Logic:
       - Read `FEATURES.FEATURE_CROWDED_CONSENSUS`
       - If `off`: return `{ flag: undefined, features: undefined, mode: 'off' }` (caller spreads, undefined fields are dropped from JSON)
       - Else: call `loadLatestCrowdedConsensusThresholds()`. If null → return `{ flag: null, features: <computed>, mode }`
       - Compute features via `shannonEntropy`, `bullPctStd`, `authorDiversityGini`, `mentionZ` (stub)
       - Call `crowdedConsensus(features, thresholds)`
       - Return `{ flag, features, mode }`

       Do NOT modify `aggregateCommunitySentiment` signature — `computeCrowdedConsensus` is a sibling export. The cron writer at `src/app/api/cron/sentiment-scan/route.ts` is the integration site (extended in Task 7).

    3. **src/lib/types.ts** — Add the 3 new optional fields to `SentimentIntelligenceSection` (mirror `AggregatedSentiment` extension): `crowded_consensus?: boolean | null`, `dispersion_features?: DispersionFeatures | null`, `crowded_consensus_mode?: 'off' | 'shadow' | 'on'`. Import the type from `@/lib/sentiment/dispersion`.
  </action>
  <verify>
    <automated>grep -q "FEATURE_CROWDED_CONSENSUS" src/lib/features.ts &amp;&amp; grep -q "computeCrowdedConsensus" src/lib/sentiment/aggregator.ts &amp;&amp; grep -q "crowded_consensus" src/lib/types.ts &amp;&amp; npx tsc --noEmit -p tsconfig.json 2>&amp;1 | grep -E "error TS" | wc -l | grep -q "^0$"</automated>
  </verify>
  <done>Flag introduced; AggregatedSentiment + SentimentIntelligenceSection extended; TypeScript clean.</done>
</task>

<task type="auto" id="20-A-01-07">
  <name>Task 7: Wire computeCrowdedConsensus into the sentiment-scan cron writer (shadow persistence)</name>
  <files>src/app/api/cron/sentiment-scan/route.ts, src/lib/sentiment/aggregator.ts</files>
  <action>
    In the existing `sentiment-scan` cron loop (where `SentimentSnapshot.create()` is called per-ticker):

    1. After `aggregateCommunitySentiment(...)`, call `computeCrowdedConsensus({...})` with the per-ticker inputs.
    2. **Shadow mode persistence**: when `mode === 'shadow'` AND `flag !== undefined`, write the result into `community_aggregated.crowded_consensus_shadow` (JSONB key — additive, no schema change required since `community_aggregated` is already `Json?` per current schema):
       ```ts
       community_aggregated: {
         ...existingCommunityAggregated,
         crowded_consensus_shadow: { flag, features, computed_at: new Date().toISOString(), thresholds_model_version: thresholds?.model_version ?? null },
       }
       ```
    3. **On mode**: also surface to the per-request analysis path so the UI sees it (handled by extending `SentimentIntelligenceSection` in Task 6 — verify the field flows from the SentimentSnapshot read path through to the analysis result).
    4. **Off mode**: NO writes, NO computation cost (FEATURES guard short-circuits in `computeCrowdedConsensus`).

    Do NOT modify the existing snapshot-write path beyond the additive JSONB key.

    Append a 1-line log: `console.log('[crowded_consensus]', ticker, mode, flag)` so cron logs are inspectable.
  </action>
  <verify>
    <automated>grep -q "crowded_consensus_shadow" src/app/api/cron/sentiment-scan/route.ts &amp;&amp; grep -q "computeCrowdedConsensus" src/app/api/cron/sentiment-scan/route.ts &amp;&amp; npx tsc --noEmit -p tsconfig.json 2>&amp;1 | grep -E "error TS" | wc -l | grep -q "^0$"</automated>
  </verify>
  <done>Cron writes shadow flag into JSONB; off mode is true no-op; types clean.</done>
</task>

<task type="auto" id="20-A-01-08">
  <name>Task 8: Render UI warning badge in Sentiment Intelligence card (gated on FEATURE_CROWDED_CONSENSUS === 'on')</name>
  <files>src/components/ResearchReport.tsx, tests/components/research-report-crowded-consensus.unit.test.tsx</files>
  <action>
    In `src/components/ResearchReport.tsx`, inside the existing Sentiment Intelligence Card block (lines 633-720), add a new conditional badge sibling to the existing TRENDING badge at line 641:

    ```tsx
    {sentiment_intelligence.crowded_consensus === true &amp;&amp;
     sentiment_intelligence.crowded_consensus_mode === 'on' &amp;&amp; (
      <div
        role="alert"
        className="mt-3 px-4 py-2 rounded-md border border-error/40 bg-error/5 flex flex-col gap-1"
      >
        <span className="text-[10px] font-bold tracking-widest uppercase text-error">
          Crowded consensus
        </span>
        <span className="text-xs text-on-surface-variant leading-relaxed">
          High agreement on unusually high mention volume from a small number of authors.
          Historical base-rate of mean-reversion within 14d.
          {' '}
          <a
            href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3873189"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-on-surface-variant hover:text-on-surface"
          >
            Cookson &amp; Engelberg 2022
          </a>
        </span>
      </div>
    )}
    ```

    Critical: the badge MUST NOT render when `crowded_consensus_mode !== 'on'` — even if `crowded_consensus === true`. This enforces the shadow lifecycle from the UI layer.

    Create `tests/components/research-report-crowded-consensus.unit.test.tsx` with 4 cases (uses @testing-library/react):
    - `crowded_consensus: true, mode: 'on'` → badge present + literal "Crowded consensus" + literal "mean-reversion within 14d" + literal "Cookson & Engelberg 2022"
    - `crowded_consensus: true, mode: 'shadow'` → badge ABSENT
    - `crowded_consensus: true, mode: 'off'` → badge ABSENT
    - `crowded_consensus: false, mode: 'on'` → badge ABSENT
  </action>
  <verify>
    <automated>npx vitest run tests/components/research-report-crowded-consensus.unit.test.tsx</automated>
  </verify>
  <done>Badge renders with literal text + citation under (true, 'on'); suppressed in all other states; 4 RTL tests GREEN.</done>
</task>

<task type="auto" id="20-A-01-09">
  <name>Task 9: Implement scripts/calibrate-crowded-consensus.ts + integration test</name>
  <files>scripts/calibrate-crowded-consensus.ts, tests/integration/crowded-consensus-calibration.integration.test.ts, package.json</files>
  <action>
    Create `scripts/calibrate-crowded-consensus.ts` per `<interfaces>` runCalibration() signature:

    1. **Data load** (PIT-safe per T-20-A-01-01): SQL via `prisma.$queryRaw` joining SentimentObservation (by `fetched_at`) to PriceOutcome (by `recorded_at >= scanned_at + 14d`). Build observation windows of 24h grouped by `(ticker, day-bucket)`. The query MUST NOT contain the literal substring `published_at` — assert this in the integration test via grep.

    2. **Feature computation** per window: `shannonEntropy`, `bullPctStd`, `authorDiversityGini`, `mentionZ` (stub returns 0 — accepted limitation; calibration runs even with stub but recommends widening V_thresh search bound when stub is detected; logged in `notes`).

    3. **Outcome label**: `y = 1` if `forward_14d_alpha_vs_SPY < 0` (underperformed), else `y = 0`.

    4. **Grid search**: nested loops over H ∈ [0.3, 1.5] step 0.1, V ∈ [1.0, 5.0] step 0.25, D ∈ [0.1, 0.7] step 0.05. For each (H, V, D):
       - Predict per window: `p = crowdedConsensus(features, {H, V, D, ...}) ? 1 : 0`
       - BS_model = mean( (p - y)² )
       - Skip windows where any feature is non-finite (count + log; do not include in score)

    5. **Climatology baseline**: `BS_clim = mean( (base_rate - y)² )` where `base_rate = mean(y)` over the SAME windows used in BS_model.

    6. **BSS = 1 - BS_model / BS_clim**. Pick the (H, V, D) maximizing BSS. Tie-break: lowest H, then lowest V, then lowest D (deterministic).

    7. **Refuse on insufficient data**: if `n_examples < 30`, return `{ exit_code: 4, ... }` and log the reason.

    8. **Persist** winning row to CrowdedConsensusCalibration with `model_version: opts.modelVersion ?? 'grid-search-v1'`, top-5 (H, V, D, BSS) tuples in `grid_search_log`.

    9. **Append to HYPERPARAMETERS.md** (Task 11).

    Add `package.json` script: `"calibrate-crowded-consensus": "tsx scripts/calibrate-crowded-consensus.ts"`.

    Create `tests/integration/crowded-consensus-calibration.integration.test.ts` (live-Neon, gated on DATABASE_URL):

    - **Setup**: clear test data, seed 30 days × 5 synthetic tickers of SentimentObservation rows with `(message_count, bull_tag_pct, author_distribution)` patterns. Include 1 GME-shaped ticker: 50 messages/day from 3 authors all bullish-tagged for 7 consecutive days, with `forward_14d_alpha_vs_SPY = -0.08` (underperformed). Seed corresponding PriceOutcome rows.
    - **Test 1**: `runCalibration({ windowDays: 30 })` returns `exit_code: 0`, persists ≥1 CrowdedConsensusCalibration row.
    - **Test 2**: persisted row has finite H_thresh, V_thresh, D_thresh + `brier_skill_score >= 0`.
    - **Test 3**: GME-shaped ticker fires `crowded_consensus === true` under the persisted thresholds (load thresholds, compute features, assert predicate). NOTE: since mention_z stub returns 0, the test seeds `mentionZ` returning a high value via vi.mock to validate the predicate — the live cron will need 20-A-02 before the flag fires in production.
    - **Test 4**: assert `published_at` does not appear in any SQL string emitted by the calibration script (grep the source file).
    - **Test 5**: `runCalibration({ windowDays: 1, minExamples: 1000 })` returns `exit_code: 4` (insufficient data scenario).

    All tests SKIP with documented reason if `process.env.DATABASE_URL` is unset (CI without DB).
  </action>
  <verify>
    <automated>npx vitest run --config vitest.integration.config.ts tests/integration/crowded-consensus-calibration.integration.test.ts</automated>
  </verify>
  <done>Calibration script + 5 integration tests GREEN against live Neon (or SKIPPED with documented reason on no-DB).</done>
</task>

<task type="auto" id="20-A-01-10">
  <name>Task 10: Add cron route + vercel.json entry</name>
  <files>src/app/api/cron/calibrate-crowded-consensus/route.ts, vercel.json</files>
  <action>
    1. Create `src/app/api/cron/calibrate-crowded-consensus/route.ts` per `<interfaces>` — Bearer auth on CRON_SECRET, calls `runCalibration({})`, returns JSON.

    2. Add to `vercel.json` `crons[]`:
       ```json
       { "path": "/api/cron/calibrate-crowded-consensus", "schedule": "0 7 1 * *" }
       ```
       (1st of each month, 07:00 UTC — well outside US market hours; daily-cron limits per Hobby plan still respected since this is monthly.)

    3. Verify the existing crons array structure is preserved (DO NOT reorder existing entries; APPEND only).
  </action>
  <verify>
    <automated>test -f src/app/api/cron/calibrate-crowded-consensus/route.ts && grep -q "CRON_SECRET" src/app/api/cron/calibrate-crowded-consensus/route.ts && grep -q "calibrate-crowded-consensus" vercel.json && node -e "const v=require('./vercel.json'); const found = (v.crons||[]).some(c => c.path === '/api/cron/calibrate-crowded-consensus' && c.schedule === '0 7 1 * *'); process.exit(found ? 0 : 1)"</automated>
  </verify>
  <done>Cron route exists with auth; vercel.json contains the entry with the literal schedule '0 7 1 * *'; existing entries preserved.</done>
</task>

<task type="auto" id="20-A-01-11">
  <name>Task 11: Run live calibration smoke + write HYPERPARAMETERS.md entry + write MODEL-CARD-crowded-consensus.md</name>
  <files>HYPERPARAMETERS.md, docs/cards/MODEL-CARD-crowded-consensus.md</files>
  <action>
    1. Run `npm run calibrate-crowded-consensus` against the live trailing-90d production database. Capture the run output. ONE of two outcomes is acceptable per Calibration Smoke Gate:
       - **(a)** exit_code 0 + a CrowdedConsensusCalibration row written. Proceed to step 2.
       - **(b)** exit_code 4 (INSUFFICIENT_DATA). Document this in HYPERPARAMETERS.md as the current state with explicit "calibration deferred until ≥30 examples" + the date the cron will next attempt. Proceed to step 3 (model card) regardless.

    2. Append to `HYPERPARAMETERS.md` (create file if absent — base it on the existing 19-A-05 hyperparameters file pattern):
       ```markdown
       ## crowded_consensus (Plan 20-A-01)

       Source: scripts/calibrate-crowded-consensus.ts grid search over CrowdedConsensusCalibration table.

       | Parameter           | Value         | Range searched          | Step  |
       |---------------------|---------------|-------------------------|-------|
       | H_thresh (entropy)  | <from row>    | [0.3, 1.5]              | 0.1   |
       | V_thresh (mention-z)| <from row>    | [1.0, 5.0]              | 0.25  |
       | D_thresh (gini)     | <from row>    | [0.1, 0.7]              | 0.05  |

       - **Brier Skill Score:** <bss_from_row> (positive = model beats base-rate climatology)
       - **Training window:** <training_window_days>d
       - **n_examples:** <n_examples>
       - **computed_at:** <computed_at ISO>
       - **model_version:** grid-search-v1
       - **Recalibration cadence:** monthly via /api/cron/calibrate-crowded-consensus

       Updated by: Plan 20-A-01 calibration smoke run (date <today>).
       ```
       (If outcome (b), populate the table cells with "n/a (insufficient data)" and add the deferred-state note.)

    3. Create `docs/cards/MODEL-CARD-crowded-consensus.md` per Mitchell-2019 template (S4):
       ```markdown
       # Model Card — Crowded Consensus Flag

       **Component:** src/lib/sentiment/dispersion.ts crowdedConsensus()
       **Plan:** 20-A-01 (Phase 20 Wave A)
       **Status:** off (default) | shadow (after operator promotion) | on (after cutover criteria met)
       **Last validated:** <calibration computed_at OR "never" when outcome (b)>

       ## Intended use
       Surfaces a UI warning when sentiment shows the academic Cookson & Engelberg 2022 "echo chamber" signature: low entropy of bull/bear/neutral message tags, anomalously high mention volume, and low author diversity (Gini > D_thresh). Per the cited paper, this configuration historically mean-reverts within 14 days. Output is INFORMATIONAL — never a recommendation.

       ## Out-of-scope use
       - NOT a sell signal. NOT investment advice.
       - NOT a confidence-weighted score; output is boolean.
       - NOT predictive of timing; only directional base-rate.

       ## Inputs
       - Shannon entropy of {bull, bear, neutral} per-message tag counts (24h window).
       - Population stdev of bull_pct across cross-platform sources.
       - Gini coefficient of message-counts-per-author (24h window).
       - mention_z (volume z-score per cap_class) — currently STUBBED at 0; replaced by 20-A-02.

       ## Outputs
       - boolean | null (null when any input non-finite OR thresholds unavailable).

       ## Training data
       - SentimentObservation rows from production Neon, trailing 90d window.
       - PriceOutcome rows joined for 14-day forward alpha-vs-SPY (binary outcome: underperformed = 1, else 0).
       - PIT-discipline: joined by `fetched_at` ONLY (S2; T-20-A-01-01 mitigation).

       ## Evaluation
       - **Brier Skill Score** vs climatology base rate. Latest: see HYPERPARAMETERS.md.
       - **Backfill regression:** GME-shaped synthetic ticker fires the flag (integration test).
       - **Spot-check log** (cutover obligation; populated before flag flips to 'on'):
         | Date | Sample size | Operator | TP | FP | FP rate |
         |------|-------------|----------|-----|-----|---------|
         | (pending) | 20 | (operator) | (n) | (n) | ≤ 0.20 target |

       ## Known failure modes
       - **Threshold drift** (T-20-A-01-04) — market regime change makes thresholds stale. Mitigation: monthly cron recalibrates.
       - **GME-never-fires** (T-20-A-01-02) — calibration grid bounds too tight. Mitigation: backfill regression test gates merge.
       - **FP suppression of legitimate consensus** (T-20-A-01-03) — earnings beat where everyone correctly turns bullish. Mitigation: 20% FP-rate ceiling enforced by spot-check.

       ## Citations
       - Cookson, J. A. & Engelberg, J. (2022). "Echo Chambers." SSRN: https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3873189
       - Mitchell et al. (2019). "Model Cards for Model Reporting." FAT* 2019.

       ## Naming inversion note
       Spec wording in CONTEXT.md line 103 reads "author_diversity < D_thresh". The implementation uses `gini > D_thresh` because Gini is INVERSELY related to diversity (high Gini = low diversity). The two phrasings are equivalent under the conversion `diversity ≈ 1 − gini`. The threshold persisted in CrowdedConsensusCalibration.D_thresh is the literal Gini floor.

       ## Retrain cadence
       Monthly via /api/cron/calibrate-crowded-consensus (vercel.json crons[]).
       ```

    4. Commit nothing yet — Task 13 stages and commits everything together.
  </action>
  <verify>
    <automated>test -f docs/cards/MODEL-CARD-crowded-consensus.md && grep -q "Cookson" docs/cards/MODEL-CARD-crowded-consensus.md && grep -q "Intended use" docs/cards/MODEL-CARD-crowded-consensus.md && grep -q "crowded_consensus" HYPERPARAMETERS.md && grep -q "Plan 20-A-01" HYPERPARAMETERS.md</automated>
  </verify>
  <done>Calibration smoke run captured (outcome a or b); HYPERPARAMETERS.md contains the section; MODEL-CARD committed with Mitchell-2019 sections + naming-inversion note + Cookson citation.</done>
</task>

<task type="auto" id="20-A-01-12">
  <name>Task 12: Full test suite + lookahead grep gate</name>
  <files>(test runs only — no file writes)</files>
  <action>
    Run, in sequence:
    1. `npx vitest run` (full unit suite — must exit 0)
    2. `npx vitest run --config vitest.integration.config.ts` (full integration suite against live DATABASE_URL — must exit 0; SKIP-with-reason allowed if DATABASE_URL unset)
    3. `npx playwright test` (full e2e suite — must exit 0; SKIP if no dev server reachable, but document the skip reason)
    4. **Lookahead grep gate**: `grep -n "published_at" scripts/calibrate-crowded-consensus.ts && exit 1 || true` (the script MUST NOT reference `published_at` — exit 1 if found, exit 0 if absent)
    5. **Telemetry forward-ref**: confirm the cron route is unwrapped — fine for now; 20-Z-03 will wrap. Add an inline TODO comment in the cron route: `// TODO(20-Z-03): wrap with withTelemetry('cron-calibrate-crowded-consensus')`.

    Capture all exit codes in the run log for the SUMMARY.
  </action>
  <verify>
    <automated>npx vitest run && (npx vitest run --config vitest.integration.config.ts || echo "integration skipped — see SUMMARY") && bash -c '! grep -q "published_at" scripts/calibrate-crowded-consensus.ts'</automated>
  </verify>
  <done>Unit suite GREEN; integration suite GREEN-or-skipped-with-reason; e2e suite GREEN-or-skipped-with-reason; lookahead grep gate exits 0; TODO(20-Z-03) breadcrumb added.</done>
</task>

<task type="auto" id="20-A-01-13">
  <name>Task 13: Stage + commit all artifacts</name>
  <files>(git stage + commit)</files>
  <action>
    Stage by explicit paths (NEVER `git add -A` per CLAUDE Git Safety Protocol):
    ```
    git add prisma/schema.prisma \
            src/lib/sentiment/dispersion.ts \
            src/lib/sentiment/mention-z-stub.ts \
            src/lib/sentiment/crowded-consensus-config.ts \
            src/lib/sentiment/aggregator.ts \
            src/lib/features.ts \
            src/lib/types.ts \
            src/components/ResearchReport.tsx \
            src/app/api/cron/sentiment-scan/route.ts \
            src/app/api/cron/calibrate-crowded-consensus/route.ts \
            scripts/calibrate-crowded-consensus.ts \
            vercel.json \
            package.json \
            HYPERPARAMETERS.md \
            docs/cards/MODEL-CARD-crowded-consensus.md \
            tests/sentiment/dispersion.unit.test.ts \
            tests/sentiment/crowded-consensus.unit.test.ts \
            tests/integration/crowded-consensus-calibration.integration.test.ts \
            tests/components/research-report-crowded-consensus.unit.test.tsx
    ```

    Commit:
    ```
    feat(20-a-01): dispersion + crowded_consensus flag (GME-100% fix) — shipped in OFF mode

    Operationalizes Cookson & Engelberg 2022 "Echo Chambers" finding: low entropy
    + high mention-volume + low author diversity = crowding signal that mean-reverts
    within 14d, NOT a thesis confirmation.

    Components:
    - CrowdedConsensusCalibration Prisma table (monthly grid-search persistence)
    - dispersion.ts pure functions: shannonEntropy, bullPctStd, authorDiversityGini, crowdedConsensus
    - calibrate-crowded-consensus.ts grid search over H ∈ [0.3, 1.5], V ∈ [1.0, 5.0], D ∈ [0.1, 0.7]
      maximizing Brier Skill Score on "crowded → underperformed SPY at 14d"
    - Monthly cron @ '0 7 1 * *' UTC
    - Three-mode FEATURE_CROWDED_CONSENSUS flag (off | shadow | on); ships in OFF
    - UI badge (text-only, no action verbs) gated on (mode === 'on' AND flag === true)
    - mention_z stub (replaced by 20-A-02 — flag cannot fire in production until then)
    - HYPERPARAMETERS.md entry + Mitchell-2019 model card

    PIT discipline (S2): calibration joins SentimentObservation by fetched_at ONLY.
    Lookahead grep gate green (no published_at in calibration script).

    Cutover (shadow → on + off-path deletion) deferred to 20-A-01-FOLLOWUP-CUTOVER plan
    filed when 4 numerical criteria are met (≥7d shadow, ≥10 fires, FP-rate ≤ 0.20,
    BSS > 0).

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "20-a-01"</automated>
  </verify>
  <done>Single atomic commit with all 18 files; subject line matches; CLAUDE Git Safety Protocol respected (explicit paths, no -A).</done>
</task>

</tasks>

<verification>
- [ ] CrowdedConsensusCalibration table exists in production Neon (Task 1 operator-confirmed; Task 2 schema written)
- [ ] dispersion.ts pure functions verified by ≥10 unit tests (Task 3+4) — Shannon entropy formula literal, Gini formula literal
- [ ] crowded-consensus.unit.test.ts ≥6 cases — predicate boolean logic + null-on-non-finite
- [ ] FEATURE_CROWDED_CONSENSUS three-mode flag introduced; default 'off' (Task 6)
- [ ] Aggregator extended with crowded_consensus + dispersion_features + crowded_consensus_mode (Task 6)
- [ ] Cron writer persists shadow flag into community_aggregated.crowded_consensus_shadow JSONB (Task 7)
- [ ] UI badge renders ONLY under (mode === 'on' AND flag === true); literal text + Cookson citation; RTL test green (Task 8)
- [ ] Calibration script grid-searches H × V × D ranges literally as [0.3,1.5]/[1.0,5.0]/[0.1,0.7] with the documented step sizes (Task 9)
- [ ] Calibration optimizes Brier Skill Score = 1 − BS_model / BS_climatology (Task 9)
- [ ] Calibration refuses on n_examples < 30 (exit code 4); integration test asserts (Task 9)
- [ ] Backfill regression: GME-shaped synthetic ticker fires the flag under persisted thresholds (Task 9 Test 3)
- [ ] published_at NEVER appears in calibration script (Task 9 Test 4 + Task 12 grep gate)
- [ ] Monthly cron at '0 7 1 * *' in vercel.json with CRON_SECRET Bearer auth (Task 10)
- [ ] HYPERPARAMETERS.md contains crowded_consensus section with H/V/D + BSS + computed_at (Task 11)
- [ ] docs/cards/MODEL-CARD-crowded-consensus.md committed with Mitchell-2019 sections + naming-inversion note + Cookson citation (Task 11)
- [ ] Full unit + integration + e2e suites green (Task 12)
- [ ] Single atomic commit (Task 13); CLAUDE Git Safety Protocol respected
</verification>

<success_criteria>
1. **Numerical (S8):** Latest CrowdedConsensusCalibration row has finite H_thresh ∈ [0.3, 1.5], V_thresh ∈ [1.0, 5.0], D_thresh ∈ [0.1, 0.7], brier_skill_score ≥ 0 — OR exit_code 4 acknowledged in HYPERPARAMETERS.md (insufficient data is the alternative acceptance state).
2. **Backfill regression (T-20-A-01-02):** GME-shaped synthetic ticker fires `crowded_consensus === true` under the persisted thresholds in the integration test.
3. **PIT discipline (S2, T-20-A-01-01):** `grep "published_at" scripts/calibrate-crowded-consensus.ts` exits non-zero (substring absent).
4. **Shadow lifecycle (S3):** FEATURE_CROWDED_CONSENSUS ships at 'off'; UI badge does not render in 'off' or 'shadow' modes (RTL tests assert).
5. **Hard cleanup gate:** off-path preserved verbatim; deletion deferred to 20-A-01-FOLLOWUP-CUTOVER plan (per S3 stages).
6. **Model card (S4):** docs/cards/MODEL-CARD-crowded-consensus.md committed with all Mitchell-2019 sections + Cookson citation + naming-inversion note + spot-check log placeholder.
7. **Regulatory hygiene (S10):** UI badge text contains zero action verbs (no "sell", "exit", "reduce") — base-rate framing only; literal-text RTL assertion enforces this.
8. **Forward-ref ordering invariant:** mention_z stub returns 0 — flag CANNOT fire in production until 20-A-02 ships. Cutover criteria (≥10 fires) cannot be met until 20-A-02 lands. This is intentional.
9. **No scope creep:** zero references to time decay (20-A-03), volume baselining real impl (20-A-02), Gini-with-rolling-window (20-A-04), cross-platform agreement (20-A-05), per-document NLP (Wave B), or any Wave C/D/E artifact.
</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-A-01-SUMMARY.md` documenting:

1. **Calibration smoke run outcome:** (a) row written with H/V/D/BSS values OR (b) exit_code 4 with the deferred-state note + when next cron will retry.
2. **Backfill regression result:** GME-shaped fixture firing the flag — confirm ✅.
3. **PIT discipline grep proof:** literal `grep "published_at" scripts/calibrate-crowded-consensus.ts` output (must be empty).
4. **Test suite exit codes:** unit / integration / e2e — pasted from Task 12 run log.
5. **Files touched:** 18-file enumeration (matches Task 13 stage list).
6. **Three-mode flag state at end of plan:** FEATURE_CROWDED_CONSENSUS = 'off' (committed default).
7. **Forward-ref dependency status:** 20-A-02 (mention_z real impl) — pending; 20-Z-02 (model-card scaffold) — pending; 20-Z-07 (lookahead regression) — pending.
8. **Cutover plan filing trigger:** when ≥7d shadow + ≥10 fires + FP-rate ≤ 0.20 + BSS > 0 — file `20-A-01-FOLLOWUP-CUTOVER` plan.
9. **Open audit-log items:** Spot-check log in MODEL-CARD remains empty until cutover-time obligation is met.
</output>
