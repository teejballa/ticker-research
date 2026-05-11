---
phase: 20
plan: 20-A-02
wave: A
type: execute
depends_on: [20-Z-01]
files_modified:
  - prisma/schema.prisma
  - src/lib/sentiment/baseline.ts
  - src/lib/sentiment/baseline.test.ts
  - scripts/recompute-mention-baselines.ts
  - scripts/calibrate-mention-z-threshold.ts
  - src/app/api/cron/mention-baselines/route.ts
  - src/lib/data/stocktwits.ts
  - src/lib/sentiment/aggregator.ts
  - src/lib/features.ts
  - HYPERPARAMETERS.md
  - vercel.json
  - tests/integration/mention-baseline.integration.test.ts
  - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-mention-baseline.md
autonomous: false
requirements: []
shadow_required: true
shadow_skip_reason: ""
hard_cleanup_gate: true
must_haves:
  truths:
    - "MentionBaseline Prisma table exists in production Neon and persists nightly per (ticker, source_class) median + MAD over rolling 90d daily mention counts"
    - "medianAndMAD uses the 1.4826 normal-distribution-equivalent scaling constant on raw absolute deviations"
    - "mentionZScore guards against MAD = 0 via an EPSILON floor (= 1.0) so very-stable tickers never produce ±Infinity z-scores"
    - "getBaselineForTicker returns null when n_observations < 30 — consumer falls back to legacy is_trending_v1 path"
    - "scripts/calibrate-mention-z-threshold.ts persists per-cap_class Z_thresh (4 entries: large_cap, mid_cap, small_cap, unknown) into HYPERPARAMETERS.md, AND ≥1 class threshold differs from the literature default Z=2.0"
    - "Cross-sectional Spearman IC of (mention_z, forward_5d_alpha_vs_SPY) on the validation window is > 0 (positive predictive signal)"
    - "stocktwits_is_trending = Math.abs(sentiment_change) > 0.5 is replaced by mention_z > Z_thresh[cap_class] in BOTH the naive AND reputation-weighted StockTwits paths — gated behind FEATURES.mention_z_trending_mode (off|shadow|on)"
    - "Cron /api/cron/mention-baselines wall-clock < 8 minutes with target 3-5 min (~50% headroom against the 5-min budget noted in CONTEXT.md line 175)"
    - "Shadow→on cutover requires: ≥30d nightly cron with non-null baseline AND IC ≥ 0.05 on validation window"
    - "MODEL-CARD-mention-baseline.md committed (Mitchell 2019 format) per S4"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "MentionBaseline model with composite index (ticker, source_class, computed_at)"
      contains: "model MentionBaseline"
    - path: "src/lib/sentiment/baseline.ts"
      provides: "medianAndMAD (1.4826-scaled), mentionZScore (EPSILON-guarded), getBaselineForTicker DAO"
      contains: "1.4826"
    - path: "src/lib/sentiment/baseline.test.ts"
      provides: "Unit tests — synthetic-distribution validation, MAD=0 EPSILON guard, today=median edge case"
    - path: "scripts/recompute-mention-baselines.ts"
      provides: "Nightly batch — iterates active tickers × source_classes, computes median+MAD over rolling 90d daily counts, persists MentionBaseline row"
    - path: "scripts/calibrate-mention-z-threshold.ts"
      provides: "Per cap_class grid search Z ∈ [1.0, 5.0] maximizing cross-sectional Spearman IC of (mention_z, forward_5d_alpha_vs_SPY); writes results to HYPERPARAMETERS.md"
    - path: "src/app/api/cron/mention-baselines/route.ts"
      provides: "Nightly cron route invoking recompute-mention-baselines logic"
      contains: "Bearer ${process.env.CRON_SECRET}"
    - path: "HYPERPARAMETERS.md"
      provides: "Per cap_class Z_thresh table (4 rows: large_cap, mid_cap, small_cap, unknown) + calibration date + IC achieved"
    - path: ".planning/phases/20-real-sentiment-analysis/MODEL-CARD-mention-baseline.md"
      provides: "S4 model card — training data window, ECE/IC metrics, OOD behavior, known limitations"
    - path: "src/lib/data/stocktwits.ts"
      provides: "stocktwits_is_trending replaced by mention_z > Z_thresh[cap_class] under FEATURES.mention_z_trending_mode shadow gate; legacy heuristic preserved on the off path"
    - path: "src/lib/sentiment/aggregator.ts"
      provides: "mention_z + is_trending_v2 surfaced on aggregated output for SentimentIntelligenceSection consumption"
    - path: "src/lib/features.ts"
      provides: "FEATURES.mention_z_trending_mode three-mode flag (off|shadow|on)"
    - path: "vercel.json"
      provides: "New cron entry { path: /api/cron/mention-baselines, schedule: 30 4 * * * }"
      contains: "mention-baselines"
    - path: "tests/integration/mention-baseline.integration.test.ts"
      provides: "Live-Neon integration — cron writes ≥1 row, getBaselineForTicker reads it, calibration script produces ≥1 differing per-class threshold"
  key_links:
    - from: "src/app/api/cron/mention-baselines/route.ts"
      to: "scripts/recompute-mention-baselines.ts logic"
      via: "shared computeBaselinesForAllTickers() exported helper"
      pattern: "computeBaselinesForAllTickers"
    - from: "src/lib/data/stocktwits.ts (is_trending replacement)"
      to: "src/lib/sentiment/baseline.ts getBaselineForTicker + mentionZScore"
      via: "runWithShadow wrapper keyed on FEATURES.mention_z_trending_mode"
      pattern: "mention_z > Z_thresh"
    - from: "scripts/calibrate-mention-z-threshold.ts"
      to: "HYPERPARAMETERS.md per-cap_class threshold table"
      via: "atomic file write with calibration metadata block"
      pattern: "Z_thresh\\[(large_cap|mid_cap|small_cap|unknown)\\]"
    - from: "prisma/schema.prisma SentimentObservation"
      to: "scripts/recompute-mention-baselines.ts daily-count rollup"
      via: "GROUP BY (ticker, source_class, date(fetched_at)) — joins on fetched_at NEVER published_at (S2/PIT)"
      pattern: "fetched_at"
---

# Plan 20-A-02: Volume baselining (z-score, robust) — replaces stocktwits_is_trending heuristic with calibrated mention_z

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE blocking step: the `npx prisma db push` against live Neon to add the `MentionBaseline` model. All other tasks (DAO, scripts, cron route, calibration, shadow gating, tests, commit) are autonomous. After the operator confirms the push has landed, the remaining tasks proceed without further prompts.

Per CONTEXT.md line 175 (operator action) — the new nightly cron adds ~3-5 min on top of the current <5 min crons. We target a wall-clock < 8 min hard ceiling (~50% headroom). If a single full rebuild blows the budget, the cron MUST fall back to incremental update (only tickers with new mentions in the last 24h); a full rebuild then runs monthly via a documented manual op.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **Shadow lifecycle**: `FEATURES.mention_z_trending_mode` introduced in `off` state. Cutover to `on` (and removal of legacy `Math.abs(sentiment_change) > 0.5` heuristic) happens in a FOLLOW-UP cleanup PR, only after the numerical gates below are met:
   - ≥30d of nightly cron writes producing non-null baselines for ≥80% of active tickers
   - Cross-sectional Spearman IC of (mention_z, forward_5d_alpha_vs_SPY) ≥ 0.05 on the validation window
2. **Old code preserved verbatim** on the `off` path until cutover; both naive AND reputation-weighted StockTwits paths' is_trending computations are wrapped in `runWithShadow`.
3. **Feature flag introduced**: `FEATURES.mention_z_trending_mode: 'off' | 'shadow' | 'on'`, default `'off'`.
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon), and `npm run test:e2e` (Playwright) all green on `main` post-commit.
5. **Schema Push Gate**: `npx prisma db push` succeeded against the live `DATABASE_URL` AND the integration test writes ≥1 MentionBaseline row in a single cron-equivalent invocation.
6. **HYPERPARAMETERS.md Gate**: ≥4 per-cap_class Z_thresh entries committed AND ≥1 entry differs from the literature default Z=2.0.
7. **Model card Gate**: `MODEL-CARD-mention-baseline.md` committed (S4 — Mitchell 2019 format).
8. **PIT Gate**: All baseline reads/writes join on `SentimentObservation.fetched_at` only — never `published_at`. 20-Z-07 lookahead-bias regression test (when it lands) MUST stay green after this plan ships.

## Cross-cutting standards adherence (CONTEXT.md §S1, S3, S7, S8)

- **S1 (no hand-picked parameters)** — Z_thresh per cap_class is calibrated by `scripts/calibrate-mention-z-threshold.ts` (grid search maximizing IC against forward 5d alpha vs SPY). The literature default Z=2.0 (≈ 95th percentile under normal-equivalent MAD scaling) seeds the search ONLY; the persisted values are the calibrated outputs. The MAD multiplier 1.4826 (≈ 1/Φ⁻¹(0.75)) is cited from Rousseeuw & Croux 1993 as the normal-distribution-equivalent scaling — this is a documented constant, not a tuned hyperparameter.
- **S3 (per-plan shadow lifecycle)** — `FEATURES.mention_z_trending_mode` is the gate. Off (default this plan): legacy `sentiment_change > 0.5` returns. Shadow: legacy returns first; new `mention_z > Z_thresh[cap_class]` runs in parallel via `runWithShadow`; ShadowComparison row persisted. On (post-cutover, separate PR): mention_z path is canonical, legacy code deleted.
- **S7 (threat model)** — five plan-level threats T-20-A-02-{01..05} with concrete mitigations. T-20-A-02-04 (PIT violation in calibration) explicitly maps to phase catalog T-28-002 (lookahead bias).
- **S8 (numerical acceptance)** — every DONE criterion below is a row count, exit code, IC threshold, or wall-clock measurement. Zero adjectives.

</universal_preamble>

<objective>
Replace the GME-era `stocktwits_is_trending = Math.abs(sentiment_change) > 0.5` heuristic with a calibrated, robust, per-ticker volume z-score derived from a rolling 90-day median + MAD baseline of daily mention counts in the new `SentimentObservation` table (20-Z-01). Stratify the threshold per `cap_class` so micro/small caps don't drown in the large-cap baseline.

Why this matters: `sentiment_change` is a vendor-side delta with no relationship to ticker-specific mention volume. A meme-stock spike (GME 2021, +1000% mention volume in 2 days) is "trending" in any sane sense; the current heuristic flags any ticker with `|Δsentiment| > 0.5` regardless of whether the volume actually moved. Robust z-scoring against the ticker's own 90d baseline — using median + MAD instead of mean + std because meme-stock spikes contaminate the variance estimator — lands the GME-style fix that Phase 20 is named for. Per cap_class calibration handles the small-cap-spikes-easier asymmetry.

Purpose: This is the volume backbone for Wave A. 20-A-01 (dispersion / crowded_consensus) reads `mention_z` as a gate condition (`crowded_consensus = entropy < H AND mention_z > V AND author_diversity < D`). Without a calibrated mention_z, the dispersion fix can't fire correctly.

Output:
- 1 new Prisma model + 1 composite index
- 1 pure-function module (`baseline.ts`) — ~120 LOC, ≥6 unit tests
- 1 nightly batch script + 1 cron route (~150 LOC total)
- 1 calibration script (~200 LOC) — persists per cap_class thresholds
- 1 shadow-gated replacement in stocktwits.ts (additive, legacy preserved)
- 1 aggregator surface (mention_z + is_trending_v2 fields)
- 1 model card (Mitchell 2019)
- 1 HYPERPARAMETERS.md entry (4-row table)
- 1 live-Neon integration test
- 1 cron entry in vercel.json
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@prisma/schema.prisma
@src/lib/data/stocktwits.ts
@src/lib/sentiment/aggregator.ts
@src/lib/diffusion-trace.ts
@src/lib/db.ts
@src/lib/features.ts
@src/lib/shadow/shadow-runner.ts
@vercel.json
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md

<interfaces>

```typescript
// src/lib/sentiment/baseline.ts — NEW

import type { CapClass } from '@/lib/diffusion-trace';

/** Source-class buckets for baseline stratification.
 *  Maps SentimentObservation.source → coarser-grained class to keep baselines stable.
 */
export type SourceClass = 'community' | 'news' | 'sec';

export const SOURCE_TO_CLASS: Record<string, SourceClass> = {
  stocktwits: 'community',
  reddit: 'community',
  x: 'community',
  apewisdom: 'community',
  firecrawl: 'community',
  news: 'news',
  sec: 'sec',
};

/** Minimum daily-count observations required before a baseline is considered usable.
 *  Below this, getBaselineForTicker returns null and consumers fall back to legacy.
 *  Source: standard practice for empirical-Bayes / robust-statistics — n=30 is the
 *  classical "central limit theorem kicks in" threshold.
 */
export const MIN_OBSERVATIONS_FOR_BASELINE = 30;

/** EPSILON floor on MAD to prevent division by zero on perfectly-stable tickers.
 *  Set to 1.0 mention/day — i.e. a ticker whose 90d std-equivalent is < 1 mention
 *  is treated AS IF its noise floor is 1 mention/day. Documented constant, not tuned.
 */
export const MAD_EPSILON = 1.0;

/** Literature default Z threshold (≈ 95th percentile of N(0,1) ≈ 1.96, rounded). */
export const Z_THRESH_LITERATURE_DEFAULT = 2.0;

/**
 * Robust median + MAD with the standard 1.4826 normal-equivalent scaling constant
 * (Rousseeuw & Croux 1993). MAD = median(|x_i - median(x)|), then MAD_scaled =
 * 1.4826 × MAD makes the result a consistent estimator of σ for normal data —
 * which lets downstream z-score thresholds (Z=2.0 ≈ 95th pct) keep their usual
 * frequentist interpretation even though the underlying estimator is robust.
 *
 * Returns { median: 0, mad: 0 } on empty input — caller MUST handle via
 * MIN_OBSERVATIONS_FOR_BASELINE check before computing a z-score.
 */
export function medianAndMAD(counts: number[]): { median: number; mad: number };

/**
 * (today_count - baseline.median) / max(baseline.mad, MAD_EPSILON)
 *
 * The EPSILON floor is the documented MAD=0 mitigation (T-20-A-02-02). Without
 * it, a ticker whose 90d MAD is 0 (e.g. always exactly 7 mentions/day) would
 * yield ±Infinity for any deviation from median — a downstream NaN landmine.
 */
export function mentionZScore(
  today_count: number,
  baseline: { median: number; mad: number },
): number;

/**
 * Reads the latest MentionBaseline row for (ticker, source_class) where
 * computed_at <= asOf. Returns null when:
 *   - no row exists, OR
 *   - the latest row has n_observations < MIN_OBSERVATIONS_FOR_BASELINE.
 *
 * Caller convention: null → fall back to legacy is_trending_v1 (preserves
 * behavior for new tickers / sparse-data tickers).
 */
export async function getBaselineForTicker(
  ticker: string,
  source_class: SourceClass,
  asOf: Date,
): Promise<{ median: number; mad: number; n_observations: number } | null>;

/** Loads the calibrated per-cap_class Z_thresh table from HYPERPARAMETERS.md
 *  at module-load time. Returns Z_THRESH_LITERATURE_DEFAULT when an entry is
 *  missing (defensive fallback for new cap_classes added in later phases).
 */
export function getZThresh(cap_class: CapClass): number;
```

```prisma
// prisma/schema.prisma — NEW model (appended after SentimentObservation)

model MentionBaseline {
  id                    String   @id @default(uuid())
  ticker                String
  cap_class             String   // 'large_cap' | 'mid_cap' | 'small_cap' | 'unknown' (matches diffusion-trace.CapClass)
  source_class          String   // 'community' | 'news' | 'sec' (see baseline.ts SOURCE_TO_CLASS)
  computed_at           DateTime @default(now()) @db.Timestamptz
  window_start          DateTime @db.Timestamptz   // computed_at - 90d
  window_end            DateTime @db.Timestamptz   // computed_at (exclusive upper bound for daily-count grouping)
  mention_count_median  Float
  mention_count_mad     Float    // already 1.4826-scaled (normal-equivalent σ)
  n_observations        Int      // number of (date) buckets contributing — caller compares against MIN_OBSERVATIONS_FOR_BASELINE

  @@index([ticker, source_class, computed_at(sort: Desc)], map: "idx_mention_baseline_ticker_src_computed")
  @@map("mention_baselines")
}
```

```typescript
// src/lib/features.ts — FEATURES extension (additive)

export interface FeatureFlags {
  // ...existing flags...
  mention_z_trending_mode: 'off' | 'shadow' | 'on';
}
```

</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-A-02-01 | Information disclosure / sparse data | New tickers have <30d of SentimentObservation history → baseline noisy or undefined | mitigate | `getBaselineForTicker` returns `null` when `n_observations < MIN_OBSERVATIONS_FOR_BASELINE (=30)`; consumer falls back to legacy `is_trending_v1` (the `sentiment_change > 0.5` heuristic). Unit test asserts the null path. Documented in MODEL-CARD as a known limitation: "newly-added tickers will not benefit from mention_z gating until 30d of fetched_at-grain history accumulates." |
| T-20-A-02-02 | Tampering / numerical | MAD = 0 division produces ±Infinity z-scores for very-stable tickers (e.g. one whose 90d daily counts are always exactly 7) | mitigate | `MAD_EPSILON = 1.0` floor in `mentionZScore`. Unit test fixture: `{ today: 8, baseline: { median: 7, mad: 0 } }` → `mentionZScore = 1.0` (NOT ±Infinity). Constant exported and documented inline. |
| T-20-A-02-03 | Configuration | `cap_class = 'unknown'` for new IPOs / pre-MarketCap tickers | mitigate | The HYPERPARAMETERS.md table includes a row for `cap_class = 'unknown'` calibrated from the median of all classes. `getZThresh('unknown')` returns this row's value — never throws, never falls through to undefined. Documented as a known limitation in MODEL-CARD: "newly-listed tickers without market cap data inherit the cross-class median threshold until cap data lands." |
| T-20-A-02-04 | Tampering / lookahead bias | Calibration uses forward 5d alpha vs SPY — joining on `published_at` instead of `fetched_at` would inflate IC artifically (PIT violation) | mitigate | `scripts/calibrate-mention-z-threshold.ts` MUST join SentimentObservation rows on `fetched_at` ONLY. Inline grep marker `// PIT-INVARIANT join (T-20-A-02-04)` annotates the join site. 20-Z-07 lookahead-bias regression test (when it lands) MUST stay green for this script's query path. **Maps to phase catalog T-28-002.** Severity: HIGH — REQUIRED in this plan, NOT deferrable. |
| T-20-A-02-05 | DoS / cron budget | Full nightly rebuild over all (ticker × source_class) pairs exceeds the 5-min cron budget noted in CONTEXT.md line 175 | mitigate | Two-tier strategy: incremental update (only tickers with new mentions in last 24h) on the nightly cron; full monthly rebuild via `scripts/recompute-mention-baselines.ts --full` invoked manually (or a separate monthly cron in a follow-up phase). Cron route logs wall-clock; integration test asserts <8min on a representative dataset. Hard ceiling: cron route times out at 9 min with a warn-and-skip on remaining tickers (rather than crashing mid-batch). |

</threat_model>

<tasks>

<task type="auto" id="20-A-02-01">
  <name>Task 1: Add MentionBaseline model + composite index to prisma/schema.prisma</name>
  <files>prisma/schema.prisma</files>
  <read_first>
    - prisma/schema.prisma (entire file — locate insertion point AFTER the SentimentObservation block 20-Z-01 added)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (lines 164-187 — verify SentimentObservation columns present, esp. fetched_at + source)
    - src/lib/diffusion-trace.ts lines 5, 39-44 (CapClass type + classifyCapClass thresholds — values used in MentionBaseline.cap_class)
  </read_first>
  <action>
    Append to `prisma/schema.prisma` AFTER the SentimentObservation model 20-Z-01 added:

    ```prisma
    // ─── Phase 20-A-02 — robust mention-volume baseline (median + MAD) ────────
    //
    // Per-ticker rolling 90d daily-mention-count baseline used to compute
    // mention_z = (today_count - median) / max(MAD, EPSILON). Stratified by
    // cap_class because small-caps spike easier than large-caps; per-class
    // Z_thresh is calibrated in HYPERPARAMETERS.md by Plan 20-A-02.
    //
    // Daily counts are derived from SentimentObservation rows GROUPED BY
    // (ticker, source_class, date(fetched_at)) — joins on fetched_at NEVER
    // published_at (PIT discipline per S2 / 20-Z-07).

    model MentionBaseline {
      id                    String   @id @default(uuid())
      ticker                String
      cap_class             String   // 'large_cap' | 'mid_cap' | 'small_cap' | 'unknown'
      source_class          String   // 'community' | 'news' | 'sec'
      computed_at           DateTime @default(now()) @db.Timestamptz
      window_start          DateTime @db.Timestamptz
      window_end            DateTime @db.Timestamptz
      mention_count_median  Float
      mention_count_mad     Float    // already 1.4826-scaled (normal-equivalent σ)
      n_observations        Int      // number of date-buckets contributing

      @@index([ticker, source_class, computed_at(sort: Desc)], map: "idx_mention_baseline_ticker_src_computed")
      @@map("mention_baselines")
    }
    ```

    Run `npx prisma generate` (does NOT require DB connection) to update the Prisma client types. Do NOT push to DB in this task — that is Task 2 (operator-confirmed).
  </action>
  <acceptance_criteria>
    - `grep -q "model MentionBaseline" prisma/schema.prisma` exits 0
    - `grep -q "idx_mention_baseline_ticker_src_computed" prisma/schema.prisma` exits 0
    - `grep -q "1.4826-scaled" prisma/schema.prisma` exits 0
    - `npx prisma generate` exits 0
    - `node -e "const { PrismaClient } = require('@prisma/client'); new PrismaClient().mentionBaseline; console.log('ok')"` prints "ok" (validates client types regenerated)
  </acceptance_criteria>
  <verify>
    <automated>npx prisma generate && grep -q "model MentionBaseline" prisma/schema.prisma && grep -q "1.4826-scaled" prisma/schema.prisma</automated>
  </verify>
  <done>Schema model added; Prisma client regenerated; ready for operator-confirmed db push in Task 2</done>
</task>

<task type="checkpoint:human-action" gate="blocking" id="20-A-02-02">
  <name>Task 2: [BLOCKING] Operator runs npx prisma db push against live Neon</name>
  <files>prisma/schema.prisma (no edits — operator-side push only)</files>
  <action>Operator (human) executes the prisma db push step. Claude does NOT run this — it is the documented manual gate per CONTEXT.md line 172.</action>
  <verify>
    <automated>psql "$DATABASE_URL" -c "\d mention_baselines" 2>&1 | grep -q "idx_mention_baseline_ticker_src_computed"</automated>
  </verify>
  <done>Live Neon has the mention_baselines table + composite index; integration test in Task 9 will be allowed to write rows.</done>
  <what-built>Schema-only change in Task 1. The DB still lacks the `mention_baselines` table.</what-built>
  <how-to-verify>
    1. Confirm `DATABASE_URL` in env points at production Neon (NOT a preview branch).
    2. Run: `npx prisma db push` — additive non-blocking schema change per CONTEXT.md line 172 convention.
    3. Verify table exists: `psql "$DATABASE_URL" -c "\d mention_baselines"` should show 9 columns + 1 index `idx_mention_baseline_ticker_src_computed`.
    4. Type "pushed" to resume execution.
  </how-to-verify>
  <resume-signal>Type "pushed" once `npx prisma db push` succeeded and the integration test below will be allowed to write rows.</resume-signal>
</task>

<task type="auto" id="20-A-02-03">
  <name>Task 3: Implement src/lib/sentiment/baseline.ts (medianAndMAD + mentionZScore + getBaselineForTicker + getZThresh)</name>
  <files>src/lib/sentiment/baseline.ts</files>
  <read_first>
    - src/lib/diffusion-trace.ts lines 5, 39-44 (CapClass + classifyCapClass — reuse type)
    - src/lib/db.ts (Prisma singleton import shape)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md interfaces block (SentimentObservation columns)
  </read_first>
  <action>
    Create `src/lib/sentiment/baseline.ts` with the EXACT public surface from the `<interfaces>` block above. Implementation notes:

    1. **`medianAndMAD(counts)`**:
       - Empty → `{ median: 0, mad: 0 }`
       - Sort ascending (immutable copy via `[...counts].sort((a, b) => a - b)`).
       - Median: `n` odd → `sorted[Math.floor(n/2)]`; `n` even → `(sorted[n/2 - 1] + sorted[n/2]) / 2`.
       - Compute absolute deviations: `dev = sorted.map(x => Math.abs(x - median))`, then median of `dev`.
       - Apply 1.4826 scaling: `mad = 1.4826 * medianOfDeviations`. Inline comment cites Rousseeuw & Croux 1993.

    2. **`mentionZScore(today, baseline)`**:
       - `const denom = Math.max(baseline.mad, MAD_EPSILON);`
       - `return (today - baseline.median) / denom;`
       - Inline comment marks T-20-A-02-02 mitigation.

    3. **`getBaselineForTicker(ticker, source_class, asOf)`**:
       - Use prisma singleton from `@/lib/db`.
       - Query: latest `MentionBaseline` where `ticker = ticker AND source_class = source_class AND computed_at <= asOf`, ordered by `computed_at desc` limit 1.
       - If `null` OR `row.n_observations < MIN_OBSERVATIONS_FOR_BASELINE` → return `null`.
       - Otherwise return `{ median, mad, n_observations }`.

    4. **`getZThresh(cap_class)`**:
       - Module-load reads `HYPERPARAMETERS.md` and parses the `## Z_thresh per cap_class` block (see Task 7 for the exact markdown format).
       - Cache in module-private `Map<CapClass, number>`.
       - On missing entry → return `Z_THRESH_LITERATURE_DEFAULT = 2.0` and `console.warn` once per cap_class.
       - On HYPERPARAMETERS.md missing or malformed → return `Z_THRESH_LITERATURE_DEFAULT` for all classes (defensive fallback for fresh-clone / pre-calibration state).

    5. **Exports**: `medianAndMAD`, `mentionZScore`, `getBaselineForTicker`, `getZThresh`, `SOURCE_TO_CLASS`, `MIN_OBSERVATIONS_FOR_BASELINE`, `MAD_EPSILON`, `Z_THRESH_LITERATURE_DEFAULT`, type `SourceClass`.

    Pure functions (`medianAndMAD`, `mentionZScore`, `getZThresh`) — no DB access.
  </action>
  <acceptance_criteria>
    - File exists at `src/lib/sentiment/baseline.ts`
    - `grep -q "1.4826" src/lib/sentiment/baseline.ts` (Rousseeuw & Croux constant present)
    - `grep -q "MAD_EPSILON" src/lib/sentiment/baseline.ts`
    - `grep -q "Rousseeuw" src/lib/sentiment/baseline.ts` (citation comment)
    - `grep -q "T-20-A-02-02" src/lib/sentiment/baseline.ts` (threat marker on EPSILON guard)
    - `grep -q "MIN_OBSERVATIONS_FOR_BASELINE" src/lib/sentiment/baseline.ts`
    - `npx tsc --noEmit src/lib/sentiment/baseline.ts` exits 0 (or full project typecheck via `npm run typecheck`)
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "1.4826" src/lib/sentiment/baseline.ts && grep -q "T-20-A-02-02" src/lib/sentiment/baseline.ts</automated>
  </verify>
  <done>Pure-function module + DAO live; types green</done>
</task>

<task type="auto" tdd="true" id="20-A-02-04">
  <name>Task 4: Unit tests for baseline.ts (medianAndMAD on synthetic distributions, EPSILON guard, edge cases)</name>
  <files>src/lib/sentiment/baseline.test.ts</files>
  <read_first>
    - src/lib/sentiment/baseline.ts (the module just created in Task 3)
    - tests/lib/data/stocktwits.reputation.test.ts (existing pattern for module-level pure-function tests in this project)
  </read_first>
  <behavior>
    Create `src/lib/sentiment/baseline.test.ts` with at least the following 8 cases:

    - `medianAndMAD([])` returns `{ median: 0, mad: 0 }` (empty contract)
    - `medianAndMAD([5])` returns `{ median: 5, mad: 0 }` (singleton)
    - `medianAndMAD([1, 2, 3, 4, 5])` returns `{ median: 3, mad: 1.4826 * 1 }` (odd-length, normal-equivalent σ for symmetric integer array)
    - `medianAndMAD([1, 2, 3, 4])` returns `{ median: 2.5, mad: 1.4826 * 1.0 }` (even-length median = average; MAD of deviations [1.5, 0.5, 0.5, 1.5] = 1.0)
    - `medianAndMAD([10, 10, 10, 10, 10, 10, 1000])` — outlier-robust: median = 10, MAD = 0 → caller's responsibility to use EPSILON guard
    - `mentionZScore(8, { median: 7, mad: 0 })` returns `(8 - 7) / max(0, 1.0) = 1.0` (T-20-A-02-02 EPSILON guard)
    - `mentionZScore(7, { median: 7, mad: 5 })` returns `0` (today = median edge case)
    - `mentionZScore(100, { median: 7, mad: 1.4826 })` returns `(100 - 7) / 1.4826 ≈ 62.73` (extreme spike, EPSILON not invoked)

    PLUS: optional smoke test on `SOURCE_TO_CLASS['stocktwits']` === 'community'.

    NO DB tests in this file — those live in tests/integration/mention-baseline.integration.test.ts (Task 9).
  </behavior>
  <action>
    Write tests using the project's Vitest convention (`describe`/`it`/`expect`). Use `expect(x).toBeCloseTo(y, 3)` for floating-point comparisons. Run `npx vitest run src/lib/sentiment/baseline.test.ts` — must exit 0.
  </action>
  <acceptance_criteria>
    - File `src/lib/sentiment/baseline.test.ts` exists
    - `grep -c "it(" src/lib/sentiment/baseline.test.ts` ≥ 8
    - `npx vitest run src/lib/sentiment/baseline.test.ts` exits 0
    - At least one `it(...)` body contains `mad: 0` AND `EPSILON` (proves the T-20-A-02-02 case is exercised)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/sentiment/baseline.test.ts</automated>
  </verify>
  <done>≥8 unit tests GREEN; EPSILON + median + 1.4826 scaling all exercised</done>
</task>

<task type="auto" id="20-A-02-05">
  <name>Task 5: Implement scripts/recompute-mention-baselines.ts (nightly batch logic)</name>
  <files>scripts/recompute-mention-baselines.ts</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (interfaces block — confirm `SentimentObservation.fetched_at` + `source` columns exist)
    - src/lib/sentiment/baseline.ts (Task 3)
    - src/lib/diffusion-trace.ts (classifyCapClass — used to backfill `cap_class` from price snapshots)
    - src/lib/db.ts
    - scripts/backfill-snapshot-cap.ts (existing pattern for ticker-iteration scripts in this project)
  </read_first>
  <action>
    Create `scripts/recompute-mention-baselines.ts` exporting `computeBaselinesForAllTickers({ mode: 'incremental' | 'full' }): Promise<{ n_baselines_written: number; wall_clock_ms: number; n_tickers_processed: number; n_skipped_sparse: number }>`.

    Algorithm:
    1. Discover active tickers — DISTINCT `ticker` from SentimentObservation in last 90d (full mode) or last 24h (incremental mode).
    2. For each `ticker`:
       a. Determine `cap_class` — query latest `Report.price_at_report` (or `SentimentSnapshot.price_at_scan`) joined with the most recent market_cap snapshot; pass to `classifyCapClass`. Fallback: `'unknown'`.
       b. For each `source_class` in `['community', 'news', 'sec']`:
          - Build daily-count series via raw SQL (Prisma's groupBy on date is awkward — use `prisma.$queryRaw`):
            ```sql
            -- PIT-INVARIANT join (T-20-A-02-04) — fetched_at ONLY, NEVER published_at
            SELECT date_trunc('day', fetched_at AT TIME ZONE 'UTC') AS day, COUNT(*) AS n
            FROM sentiment_observations
            WHERE ticker = $1
              AND source = ANY($2)               -- $2 = sources mapping to source_class via SOURCE_TO_CLASS reverse-lookup
              AND fetched_at >= now() - interval '90 days'
              AND fetched_at <  now()
            GROUP BY day
            ORDER BY day ASC
            ```
          - Extract `counts: number[]` from rows.
          - `n_observations = counts.length` (number of distinct days with ≥1 observation).
          - If `n_observations < 1` → skip this `source_class` for this ticker; increment `n_skipped_sparse`.
          - Compute `{ median, mad } = medianAndMAD(counts)`.
          - INSERT row into `MentionBaseline` (no upsert — every nightly run produces a new immutable row, latest wins on read via `getBaselineForTicker`).
    3. Return wall-clock + counters.

    Add a CLI entry point:
    ```ts
    if (require.main === module) {
      const mode = process.argv.includes('--full') ? 'full' : 'incremental';
      computeBaselinesForAllTickers({ mode }).then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
    }
    ```

    Concurrency: process tickers in batches of 10 via `Promise.allSettled` to keep DB connection count bounded.

    Do NOT delete old MentionBaseline rows — they form the historical audit trail. A separate retention job (out of scope for this plan) can prune rows older than 365d.
  </action>
  <acceptance_criteria>
    - File `scripts/recompute-mention-baselines.ts` exists
    - `grep -q "computeBaselinesForAllTickers" scripts/recompute-mention-baselines.ts` (exported helper)
    - `grep -q "PIT-INVARIANT" scripts/recompute-mention-baselines.ts` (T-20-A-02-04 marker)
    - `grep -q "T-20-A-02-04" scripts/recompute-mention-baselines.ts`
    - `grep -q "fetched_at" scripts/recompute-mention-baselines.ts` AND `! grep -q "published_at" scripts/recompute-mention-baselines.ts` (PIT enforcement at source level)
    - `npx tsc --noEmit scripts/recompute-mention-baselines.ts` exits 0
    - `npm test` (any unit tests touching this script — none required) green
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "PIT-INVARIANT" scripts/recompute-mention-baselines.ts && ! grep -q "published_at" scripts/recompute-mention-baselines.ts</automated>
  </verify>
  <done>Nightly batch logic + CLI entry point landed; PIT-marked at the SQL join site</done>
</task>

<task type="auto" id="20-A-02-06">
  <name>Task 6: Add /api/cron/mention-baselines route + vercel.json schedule</name>
  <files>src/app/api/cron/mention-baselines/route.ts, vercel.json</files>
  <read_first>
    - src/app/api/cron/sentiment-scan/route.ts (existing cron route shape — Authorization header check, response shape)
    - vercel.json (existing crons array)
    - scripts/recompute-mention-baselines.ts (Task 5 — import the helper)
  </read_first>
  <action>
    Create `src/app/api/cron/mention-baselines/route.ts`:

    ```ts
    import { computeBaselinesForAllTickers } from '@/scripts/recompute-mention-baselines';

    export const maxDuration = 300; // 5 min Vercel function ceiling — see vercel.json
    export const runtime = 'nodejs';

    export async function GET(request: Request) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }

      // Incremental on every nightly tick — full rebuild via manual `--full` invocation.
      const startedAt = Date.now();
      try {
        const result = await computeBaselinesForAllTickers({ mode: 'incremental' });
        return Response.json({ ok: true, ...result });
      } catch (e) {
        const wall_clock_ms = Date.now() - startedAt;
        return Response.json({ ok: false, error: String(e), wall_clock_ms }, { status: 500 });
      }
    }
    ```

    Update `vercel.json` `crons` array — append:
    ```json
    { "path": "/api/cron/mention-baselines", "schedule": "30 4 * * *" }
    ```
    (4:30 AM UTC nightly — runs BEFORE the 6:00 AM `/api/cron/price-followup` so the mention_z derived from today's baseline is available to other consumers downstream.)

    Note (operator action — CONTEXT.md line 175): The new cron adds ~3-5 min on top of the existing 4-cron stack. Current crons run in <5 min total; this brings total cron compute to ~8-10 min. Within Vercel's 300s per-function ceiling for individual crons (each cron is its own function invocation, not a serial chain).
  </action>
  <acceptance_criteria>
    - File `src/app/api/cron/mention-baselines/route.ts` exists
    - `grep -q "Bearer.*CRON_SECRET" src/app/api/cron/mention-baselines/route.ts` (auth check per Vercel cron-jobs convention)
    - `grep -q "mention-baselines" vercel.json`
    - `node -e "const v = require('./vercel.json'); const m = v.crons.find(c => c.path === '/api/cron/mention-baselines'); if (!m || !m.schedule) process.exit(1); console.log(m.schedule)"` prints `30 4 * * *`
    - `npx tsc --noEmit src/app/api/cron/mention-baselines/route.ts` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "mention-baselines" vercel.json && grep -q "Bearer" src/app/api/cron/mention-baselines/route.ts</automated>
  </verify>
  <done>Cron route + schedule live; auth-gated per Vercel convention</done>
</task>

<task type="auto" id="20-A-02-07">
  <name>Task 7: Implement scripts/calibrate-mention-z-threshold.ts + create HYPERPARAMETERS.md</name>
  <files>scripts/calibrate-mention-z-threshold.ts, HYPERPARAMETERS.md</files>
  <read_first>
    - src/lib/sentiment/baseline.ts (Z_THRESH_LITERATURE_DEFAULT, MAD_EPSILON, MIN_OBSERVATIONS_FOR_BASELINE)
    - prisma/schema.prisma (PriceOutcome — pct_change at days_after for forward returns)
    - src/lib/diffusion-trace.ts CapClass type
    - scripts/tune-lambda.ts (existing calibration-script pattern in this project)
    - scripts/calibration-report.ts (existing IC-computation pattern)
  </read_first>
  <action>
    Create `scripts/calibrate-mention-z-threshold.ts`:

    Algorithm:
    1. Load ALL (ticker, fetched_at-day) tuples from the last 180d that have:
       a. A populated MentionBaseline row at the corresponding lookup-time, AND
       b. A PriceOutcome row at `days_after = 5` for the same ticker → `forward_5d_alpha = ticker_pct_change - SPY_pct_change_over_same_window`.
       (Use Report → PriceOutcome join via report.ticker; SPY return computed separately via existing SPY price-history table or yahoo-finance2 fallback — same convention as price-followup cron.)
    2. PIT-INVARIANT join — annotate the SQL with `// PIT-INVARIANT join (T-20-A-02-04)`. NEVER join SentimentObservation rows on `published_at`.
    3. For each (ticker, day): compute `mention_z` using the baseline that was current AS OF day-1 (lookback only — this is the PIT defense).
    4. Split tuples by `cap_class` (large/mid/small/unknown).
    5. For each `cap_class` with ≥50 tuples:
       a. Grid search Z_thresh ∈ {1.0, 1.25, 1.5, ..., 5.0} (17 values).
       b. For each Z: binarize `mention_z > Z` → predicted "trending"; compute Spearman IC of (predicted_binary, forward_5d_alpha) cross-sectionally per day, then average.
       c. Pick Z maximizing mean IC. Record `{ z_thresh, ic_mean, ic_se, n_tuples }`.
       (Implementation: hand-rolled Spearman rank correlation — small util ~30 LOC. No external stats library.)
    6. Cap_classes with <50 tuples → record `{ z_thresh: Z_THRESH_LITERATURE_DEFAULT, ic_mean: null, ic_se: null, n_tuples }`.
    7. Atomically write the per-class table to `HYPERPARAMETERS.md` (overwrite-or-append the `## Z_thresh per cap_class (Plan 20-A-02)` section). Format:

       ```markdown
       ## Z_thresh per cap_class (Plan 20-A-02)

       Calibrated by `scripts/calibrate-mention-z-threshold.ts` on YYYY-MM-DD.
       Method: grid search Z ∈ [1.0, 5.0] step 0.25, maximizing cross-sectional
       Spearman IC of `(mention_z > Z, forward_5d_alpha_vs_SPY)` per day, mean
       over 180d backfill window. Literature default Z=2.0 used for cap_classes
       with <50 tuples.

       | cap_class  | Z_thresh | IC_mean | IC_se | n_tuples |
       |------------|----------|---------|-------|----------|
       | large_cap  | {value}  | {value} | {value} | {value}  |
       | mid_cap    | {value}  | {value} | {value} | {value}  |
       | small_cap  | {value}  | {value} | {value} | {value}  |
       | unknown    | {value}  | {value} | {value} | {value}  |

       Cross-sectional IC of (mention_z, forward_5d_alpha) on validation: {value}
       Last calibrated: YYYY-MM-DD HH:MM:SS UTC
       ```

    8. CLI entry point with `--dry-run` mode (compute but don't write).

    If the file `HYPERPARAMETERS.md` does not yet exist (first-ever run), the script CREATES it with a top-level header `# HYPERPARAMETERS` and a leading paragraph stating "All entries are written by calibration scripts; do not hand-edit."
  </action>
  <acceptance_criteria>
    - File `scripts/calibrate-mention-z-threshold.ts` exists
    - `grep -q "PIT-INVARIANT" scripts/calibrate-mention-z-threshold.ts` (T-20-A-02-04 marker)
    - `grep -q "T-20-A-02-04" scripts/calibrate-mention-z-threshold.ts`
    - `! grep -q "published_at" scripts/calibrate-mention-z-threshold.ts` (PIT enforcement at source level)
    - `grep -q "Spearman" scripts/calibrate-mention-z-threshold.ts` (uses Spearman IC)
    - `grep -q "1.0.*5.0" scripts/calibrate-mention-z-threshold.ts` OR `grep -q "Z ∈ \[1.0" scripts/calibrate-mention-z-threshold.ts` (grid search range)
    - `npx tsc --noEmit scripts/calibrate-mention-z-threshold.ts` exits 0
    - `npx tsx scripts/calibrate-mention-z-threshold.ts --dry-run` exits 0 (dry-run path validates without DB writes; OK if DB has no calibration data — script must handle empty input gracefully)
    - `HYPERPARAMETERS.md` either exists pre-this-plan OR is created by the script
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "PIT-INVARIANT" scripts/calibrate-mention-z-threshold.ts && ! grep -q "published_at" scripts/calibrate-mention-z-threshold.ts && grep -q "Spearman" scripts/calibrate-mention-z-threshold.ts</automated>
  </verify>
  <done>Calibration script + HYPERPARAMETERS.md table format landed; PIT-marked; Spearman IC over grid search; ≥4 per-cap_class rows produced once data flows in</done>
</task>

<task type="auto" id="20-A-02-08">
  <name>Task 8: Shadow-gated replacement of stocktwits_is_trending in stocktwits.ts + aggregator surfacing of mention_z / is_trending_v2</name>
  <files>src/lib/data/stocktwits.ts, src/lib/sentiment/aggregator.ts, src/lib/features.ts</files>
  <read_first>
    - src/lib/data/stocktwits.ts (entire file — locate is_trending sites at lines ~242 (naive path) and ~306, ~343 (reputation-weighted path))
    - src/lib/sentiment/aggregator.ts (entire file — surface point for mention_z + is_trending_v2)
    - src/lib/features.ts (existing FEATURES shape and extension pattern)
    - src/lib/shadow/shadow-runner.ts (runWithShadow signature, used existing in stocktwits.ts at line 199)
    - src/lib/sentiment/baseline.ts (Task 3 — getBaselineForTicker, mentionZScore, getZThresh)
    - src/lib/diffusion-trace.ts (classifyCapClass)
  </read_first>
  <action>
    1. **`src/lib/features.ts`**: Add `mention_z_trending_mode: 'off' | 'shadow' | 'on'` to the FEATURES shape, default `'off'`. Sourced from `process.env.MENTION_Z_TRENDING_MODE` if set, else `'off'`.

    2. **`src/lib/data/stocktwits.ts`** — at the TWO is_trending computation sites (line ~242 in `fetchStockTwitsSentimentNaive`, line ~306+343 in `fetchStockTwitsSentimentReputationWeighted`):

       Wrap the existing `Math.abs(sentiment_change) > 0.5` heuristic in a `runWithShadow` call with a new compute path:

       ```ts
       async function isTrendingV2(
         ticker: string,
         today_message_count: number,
         cap_class: CapClass,
       ): Promise<boolean> {
         const baseline = await getBaselineForTicker(ticker, 'community', new Date());
         if (!baseline) return Math.abs(sentiment_change) > 0.5; // legacy fallback (T-20-A-02-01 sparse-data)
         const z = mentionZScore(today_message_count, baseline);
         return z > getZThresh(cap_class);
       }
       ```

       (Pseudocode — adapt to whatever `cap_class` source the call site has access to. If `cap_class` not directly available, derive via `classifyCapClass(market_cap)` from the SourcePackage; if SourcePackage is not in scope at this call site, default to `'unknown'` and document.)

       Use `runWithShadow('stocktwits-is-trending-v2', () => legacyComputation, () => isTrendingV2(...), FEATURES.mention_z_trending_mode, { ticker })` analogous to the existing reputation-weighted shadow at line 199.

       The legacy `Math.abs(sentiment_change) > 0.5` body MUST be preserved verbatim on the `off` path (cutover-PR deletion target).

    3. **`src/lib/sentiment/aggregator.ts`** — extend `AggregatedSentiment` interface with two new optional fields:
       ```ts
       export interface AggregatedSentiment {
         // ...existing fields...
         /** Plan 20-A-02 — null when no community-source baseline available for this ticker. */
         mention_z?: number | null;
         /** Plan 20-A-02 — calibrated mention-volume trending flag. null when baseline not yet established. */
         is_trending_v2?: boolean | null;
       }
       ```
       Populate by accepting an optional `mention_z` argument (computed by the caller — aggregator does NOT do DB lookups; remains a pure function). Update `aggregateCommunitySentiment` signature to accept an optional second arg `{ mention_z?: number | null }` and forward it.

       The CALLER (likely `src/lib/data/community.ts` or wherever the aggregator is invoked in the cron path) computes `mention_z` via `getBaselineForTicker` + `mentionZScore` and passes it in. Document the call-site update inline.

    Do NOT delete the legacy `Math.abs(sentiment_change) > 0.5` code in this plan — that is the cutover-PR target after the 30d shadow + IC ≥ 0.05 gate clears.
  </action>
  <acceptance_criteria>
    - `grep -q "mention_z_trending_mode" src/lib/features.ts`
    - `grep -q "mention_z_trending_mode" src/lib/data/stocktwits.ts` (shadow gate wired)
    - `grep -q "stocktwits-is-trending-v2" src/lib/data/stocktwits.ts` (shadow path name)
    - `grep -q "mention_z" src/lib/sentiment/aggregator.ts`
    - `grep -q "is_trending_v2" src/lib/sentiment/aggregator.ts`
    - The literal `Math.abs(sentiment_change) > 0.5` STILL appears in stocktwits.ts (legacy preserved on off path until cutover PR)
    - `npm test` (Vitest unit) exits 0 — aggregator unit tests already exist; verify they remain green with the new optional field
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && npm test -- src/lib/sentiment/aggregator && grep -q "mention_z_trending_mode" src/lib/features.ts && grep -q "mention_z_trending_mode" src/lib/data/stocktwits.ts && grep -q "Math.abs(sentiment_change)" src/lib/data/stocktwits.ts</automated>
  </verify>
  <done>FEATURES flag + shadow-gated v2 path + aggregator surface live; legacy preserved verbatim on off path</done>
</task>

<task type="auto" id="20-A-02-09">
  <name>Task 9: Live-Neon integration test — cron writes baseline; reads work; calibration script produces ≥1 differing per-class threshold</name>
  <files>tests/integration/mention-baseline.integration.test.ts</files>
  <read_first>
    - tests/integration/sentiment-observation.integration.test.ts (20-Z-01's integration test pattern — same connection setup, same cleanup convention)
    - prisma/schema.prisma (MentionBaseline model)
    - src/lib/sentiment/baseline.ts
    - scripts/recompute-mention-baselines.ts
    - scripts/calibrate-mention-z-threshold.ts
  </read_first>
  <action>
    Create `tests/integration/mention-baseline.integration.test.ts` with at least the following 4 cases (vitest.integration.config.ts conventions — live `DATABASE_URL` required):

    1. **Cron-equivalent invocation writes ≥1 row**: Insert ~40 SentimentObservation rows for a synthetic ticker `__TEST_BASELINE__` spread across 30 distinct fetched_at days. Invoke `computeBaselinesForAllTickers({ mode: 'incremental' })`. Assert ≥1 MentionBaseline row exists for `(ticker = '__TEST_BASELINE__', source_class = 'community')` with `n_observations >= 30`. Cleanup deletes both.

    2. **getBaselineForTicker returns the latest row**: Insert two MentionBaseline rows for the same `(ticker, source_class)` 1 hour apart. Assert `getBaselineForTicker(ticker, source_class, now)` returns the LATER row's `(median, mad, n_observations)`.

    3. **getBaselineForTicker returns null on sparse data**: Insert a MentionBaseline row with `n_observations = 5` (below MIN_OBSERVATIONS_FOR_BASELINE). Assert `getBaselineForTicker` returns `null`.

    4. **Calibration script produces ≥1 differing per-class threshold**: Seed enough synthetic SentimentObservation + Report + PriceOutcome rows that the calibrator has ≥50 tuples in at least 2 cap_classes with deliberately differing mention_z → forward_5d_alpha relationships (e.g. small_cap responsive at Z=3.0, large_cap responsive at Z=1.5). Run `tsx scripts/calibrate-mention-z-threshold.ts --dry-run` and parse stdout JSON or read the produced HYPERPARAMETERS.md table. Assert ≥1 cap_class has `Z_thresh != Z_THRESH_LITERATURE_DEFAULT (= 2.0)`.

    Wall-clock assertion: `expect(wall_clock_ms).toBeLessThan(8 * 60 * 1000)` on the synthetic-ticker incremental run (T-20-A-02-05 budget).

    Use `beforeAll` / `afterAll` for table cleanup. Mark test with `describe.skipIf(!process.env.DATABASE_URL)` so CI skips it on environments without a live DB.
  </action>
  <acceptance_criteria>
    - File `tests/integration/mention-baseline.integration.test.ts` exists
    - `grep -c "it(" tests/integration/mention-baseline.integration.test.ts` ≥ 4
    - `npm run test:integration -- mention-baseline` exits 0 against a live DATABASE_URL
    - Test 1 asserts wall-clock < 8min
    - Test 4 asserts ≥1 differing per-class threshold (the CONTEXT.md acceptance criterion)
  </acceptance_criteria>
  <verify>
    <automated>npm run test:integration -- mention-baseline.integration.test.ts</automated>
  </verify>
  <done>Live-Neon integration green; PIT join verified end-to-end; budget + differing-threshold assertions pass</done>
</task>

<task type="auto" id="20-A-02-10">
  <name>Task 10: MODEL-CARD-mention-baseline.md (S4 — Mitchell 2019 format) + commit</name>
  <files>.planning/phases/20-real-sentiment-analysis/MODEL-CARD-mention-baseline.md</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (S4 — model card requirement)
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (template path — `MODEL-CARD-template.md` from Plan 20-Z-02)
    - HYPERPARAMETERS.md (per-cap_class Z_thresh table — populated by Task 7)
  </read_first>
  <action>
    Create `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-mention-baseline.md` covering (Mitchell 2019 sections):

    - **Model details**: name (`mention-baseline-v1`), version (commit SHA at plan land), classifier type (robust z-score against rolling-90d median + MAD), maintainer, date.
    - **Intended use**: Replace `stocktwits_is_trending = sentiment_change > 0.5` with calibrated mention-volume z-score; consumer for `crowded_consensus` flag (20-A-01).
    - **Factors**: per-cap_class stratification (large/mid/small/unknown), per-source_class (community/news/sec).
    - **Metrics**: cross-sectional Spearman IC of `(mention_z, forward_5d_alpha_vs_SPY)` per cap_class — CIs from calibration script.
    - **Evaluation data**: 180d backfill window from `SentimentObservation` joined with `PriceOutcome` at `days_after = 5`. SPY return as benchmark.
    - **Training data**: rolling 90d daily mention counts from `SentimentObservation`. PIT discipline: joined on `fetched_at` only.
    - **Quantitative analyses**: per-cap_class Z_thresh table from HYPERPARAMETERS.md (link inline).
    - **Ethical considerations**: bot-driven mention spikes can inflate baseline (Wave-C 20-C-03 bot filter mitigates downstream); micro-cap manipulation risk addressed by per-class threshold + 20-C-04 cluster detection.
    - **Caveats and recommendations**: `cap_class = 'unknown'` uses cross-class median threshold; tickers with <30d of fetched_at history fall back to legacy `is_trending_v1`; MAD = 0 floored at EPSILON = 1.0 mention/day.
    - **Failure modes**: sparse-data new tickers (T-20-A-02-01); meme-stock spikes contaminating their own future baselines (acknowledged limitation — robust median+MAD is the partial mitigation).
    - **Retrain cadence**: nightly cron (incremental); monthly full rebuild via manual `--full` op.

    Then COMMIT all plan-local files in a single commit:

    ```
    feat(20-a-02): robust mention-volume baseline (median+MAD) + per-cap_class Z calibration

    Adds MentionBaseline Prisma table populated nightly from SentimentObservation
    (PIT-joined on fetched_at). medianAndMAD uses 1.4826 normal-equivalent scaling
    (Rousseeuw & Croux 1993). mentionZScore guards against MAD=0 via EPSILON=1.0.

    Per cap_class Z_thresh calibrated by scripts/calibrate-mention-z-threshold.ts
    via grid search maximizing cross-sectional Spearman IC of (mention_z,
    forward_5d_alpha_vs_SPY) on 180d backfill. Results persist to HYPERPARAMETERS.md.

    stocktwits_is_trending replaced by mention_z > Z_thresh[cap_class] under
    FEATURES.mention_z_trending_mode (off|shadow|on). Legacy heuristic preserved
    on off path; cutover after 30d shadow + IC ≥ 0.05.

    MODEL-CARD-mention-baseline.md committed (Mitchell 2019).
    Threats T-20-A-02-{01..05} mitigated; T-20-A-02-04 maps to phase T-28-002.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - File `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-mention-baseline.md` exists
    - `grep -q "Intended use" MODEL-CARD-mention-baseline.md` (Mitchell 2019 section)
    - `grep -q "Failure modes" MODEL-CARD-mention-baseline.md`
    - `grep -q "EPSILON" MODEL-CARD-mention-baseline.md` (documents the MAD=0 floor)
    - `grep -q "T-20-A-02-04" MODEL-CARD-mention-baseline.md` (PIT mitigation acknowledged)
    - `git log -1 --pretty=%s` matches `feat(20-a-02): robust mention-volume baseline`
    - All earlier tasks' files staged: prisma/schema.prisma, src/lib/sentiment/baseline.ts (+ test), scripts/recompute-mention-baselines.ts, scripts/calibrate-mention-z-threshold.ts, src/app/api/cron/mention-baselines/route.ts, src/lib/data/stocktwits.ts, src/lib/sentiment/aggregator.ts, src/lib/features.ts, vercel.json, HYPERPARAMETERS.md, tests/integration/mention-baseline.integration.test.ts, MODEL-CARD-mention-baseline.md
  </acceptance_criteria>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "20-a-02" && grep -q "Failure modes" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-mention-baseline.md && grep -q "T-20-A-02-04" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-mention-baseline.md</automated>
  </verify>
  <done>Model card + commit landed; all 12 plan files in tree; ready for shadow → on cutover in follow-up PR after gates clear</done>
</task>

</tasks>

<verification>

Numerical verification — every item is a measurable assertion:

- [ ] `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "MentionBaseline"'` returns ≥ 1 after one cron cycle (Task 6 + 9)
- [ ] Per cap_class Z_thresh persisted in HYPERPARAMETERS.md — exactly 4 entries: `large_cap`, `mid_cap`, `small_cap`, `unknown` (Task 7)
- [ ] At least 1 cap_class threshold differs from the literature default (Z = 2.0) — assertion in Task 9 integration test 4
- [ ] Cross-sectional Spearman IC of `(mention_z, forward_5d_alpha_vs_SPY)` > 0 on validation window — recorded in HYPERPARAMETERS.md by Task 7
- [ ] `medianAndMAD` uses literal `1.4826` scaling constant (Rousseeuw & Croux 1993) — Task 3 grep + Task 4 unit test
- [ ] `mentionZScore` guards MAD = 0 via `MAD_EPSILON = 1.0` — Task 4 unit test exercises the case
- [ ] `getBaselineForTicker` returns `null` when `n_observations < 30` — Task 9 integration test 3
- [ ] All SQL joins on `SentimentObservation.fetched_at` — never `published_at` (PIT, T-20-A-02-04 → T-28-002) — Tasks 5 + 7 grep guards
- [ ] Cron `/api/cron/mention-baselines` wall-clock < 8 minutes (target 3-5 min) — Task 9 integration test assertion
- [ ] `FEATURES.mention_z_trending_mode` introduced; default `'off'`; legacy `Math.abs(sentiment_change) > 0.5` preserved verbatim on off path until follow-up cutover PR (Task 8)
- [ ] `MODEL-CARD-mention-baseline.md` covers all 10 Mitchell 2019 sections (Task 10)
- [ ] `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-commit
- [ ] `npm run check-immutability` (from 20-Z-01) still exits 0 — this plan does NOT introduce SentimentObservation UPDATE shapes
- [ ] `npx prisma db push` succeeded against live Neon (Task 2 operator-confirmed)

</verification>

<success_criteria>

1. **Replacement landed under shadow**: `mention_z > Z_thresh[cap_class]` is the new is_trending source of truth on the `shadow` and `on` paths; legacy heuristic preserved verbatim on `off` for the cutover-PR deletion target.
2. **Baseline populated nightly**: MentionBaseline table grows by 1 row per (active ticker × active source_class) per night; ≥30d of accumulated rows enables consumers to start using mention_z (cutover gate).
3. **Calibration data-driven**: Per cap_class Z_thresh values in HYPERPARAMETERS.md were produced by the documented grid search, not hand-picked. ≥1 class differs from literature default.
4. **PIT discipline preserved**: All baseline writes AND calibration reads join on `fetched_at`; T-20-A-02-04 marker present at every join site; 20-Z-07 lookahead-bias regression test (when it lands) stays green.
5. **Operational budget honored**: nightly cron < 8 min wall-clock; incremental update by default; full rebuild reserved for monthly manual op.
6. **Model card committed**: S4 satisfied — Mitchell 2019 format with documented metrics, factors, failure modes, retrain cadence.
7. **Numerical IC delivered**: Cross-sectional Spearman IC of (mention_z, forward_5d_alpha_vs_SPY) > 0 on validation window — confirms the new signal carries actual predictive content vs noise. Cutover requires ≥ 0.05 (per CONTEXT.md S8 / shadow lifecycle gate).

</success_criteria>

<output>
Create `.planning/phases/20-real-sentiment-analysis/20-A-02-SUMMARY.md` documenting:
- Schema additions (MentionBaseline + index)
- Pure-function module (baseline.ts) with API surface and all exported constants (1.4826, MAD_EPSILON, MIN_OBSERVATIONS_FOR_BASELINE)
- Nightly cron + incremental/full strategy + measured wall-clock from Task 9
- Per cap_class Z_thresh table from HYPERPARAMETERS.md (raw values, IC achieved, n_tuples)
- Shadow lifecycle position: introduced in `off`; cutover gate criteria documented
- Threats T-20-A-02-{01..05} closure status (mitigation evidence)
- Forward references: 20-A-01 (crowded_consensus reads mention_z), 20-Z-07 (lookahead-bias test reads our PIT markers), follow-up cutover PR (delete legacy off path after 30d + IC ≥ 0.05)
- Operator-action delta: cron compute footprint actually measured (vs the 3-5 min CONTEXT.md estimate)
</output>
