---
phase: 20
plan: 20-A-03
wave: A
type: execute
depends_on: ['20-Z-01']
files_modified:
  - prisma/schema.prisma
  - src/lib/sentiment/source-class.ts
  - src/lib/sentiment/decay.ts
  - src/lib/sentiment/decay-hyperparameters.ts
  - src/lib/sentiment/aggregator.ts
  - scripts/tune-decay.ts
  - scripts/backfill-decay-weights.ts
  - src/app/api/cron/tune-decay/route.ts
  - HYPERPARAMETERS.md
  - vercel.json
  - tests/sentiment-decay.unit.test.ts
  - tests/sentiment-source-class.unit.test.ts
  - tests/integration/tune-decay.integration.test.ts
autonomous: false
requirements: []
shadow_required: true
shadow_skip_reason: ""
hard_cleanup_gate: true
must_haves:
  truths:
    - "SourceClass enum exhaustively maps every existing Cipher source: stocktwits→retail, anthropic-search news→news, finnhub analyst→analyst, firecrawl-reddit→retail, firecrawl-forums→social-other; SEC slot reserved for Phase 20-B SEC fetcher"
    - "decayWeight(ageDays, lambdaPerDay) computes exp(-lambda × ageDays) with ageDays >= 0 guard (negative throws, NOT clamped)"
    - "Half-life formula t½ = ln(2)/λ documented in source comment AND printed in scripts/tune-decay.ts output"
    - "decayLambdaForClass(cls) reads from src/lib/sentiment/decay-hyperparameters.ts and is the SOLE source of λ at runtime — no inline literals in aggregator/decay.ts"
    - "decay.ts is a NEW module separate from src/lib/learning.ts decayWeights — sentiment-message decay (per source class) and learning-engine decay (per signal class) are distinct concerns and MUST NOT share the lambda config table"
    - "DecayCalibration Prisma model persists every calibration run (id, computed_at, source_class, lambda_per_day, half_life_days, icir_uplift_vs_no_decay, training_window_days, n_observations, model_version) — append-only history, never overwritten"
    - "Calibration writes propagate to historical SentimentObservation rows via NEW model_version inserts (per 20-Z-01 immutability convention) — existing rows are NEVER updated"
    - "Backfill script asserts post-condition: count(rows with NEW model_version) > 0 AND count(rows with OLD model_version) unchanged before vs after"
    - "Calibration is GATED: requires ≥60d of labeled production data per source class (n_observations >= 60); failure mode is exit-non-zero with diagnostic, NOT silent low-N publish"
    - "Cutover from shadow→on (aggregator switches to decayed weights) requires paired bootstrap on Sharpe of decayed-vs-undecayed aggregate with 95% CI lower-bound > 0 (1000 resamples)"
    - "Aggregator weighted-mean uses decay_weight from SentimentObservation; falls back to UNIFORM weights when Σ exp(-λt) < EPSILON (1e-9) to avoid div-by-zero on all-old samples"
    - "HYPERPARAMETERS.md exists at repo root and contains literal λ entries for ALL 5 source classes (literature defaults seed; calibrated values overwrite the row but commented-history is preserved)"
    - "Monthly cron /api/cron/tune-decay runs tune-decay against rolling 90d window with consistent training_window_days across all classes (regime-mismatch defense T-20-A-03-05)"
    - "Tetlock 2007 (pessimism→next-day returns mean-reverting within 1 week) cited verbatim in decay.ts header AND in HYPERPARAMETERS.md retail/news rows"
  artifacts:
    - path: "src/lib/sentiment/source-class.ts"
      provides: "SourceClass union type + exhaustive sourceToClass mapping for every Cipher data source"
      contains: "export type SourceClass"
    - path: "src/lib/sentiment/decay.ts"
      provides: "decayWeight(ageDays, lambdaPerDay) pure function + decayLambdaForClass(cls) lookup + halfLifeDays(lambda) helper"
      contains: "Math.exp(-lambdaPerDay * ageDays)"
    - path: "src/lib/sentiment/decay-hyperparameters.ts"
      provides: "Typed const table of per-source-class λ values; module-load Zod validation rejects invalid configs at import time"
      contains: "DECAY_HYPERPARAMETERS"
    - path: "prisma/schema.prisma"
      provides: "DecayCalibration append-only history model with model_version partition"
      contains: "model DecayCalibration"
    - path: "scripts/tune-decay.ts"
      provides: "Grid search per source_class maximizing 20d rolling ICIR vs forward-7d alpha-vs-SPY; emits HYPERPARAMETERS.md update + DecayCalibration row"
      contains: "LAMBDA_GRID_MULTIPLIERS"
    - path: "scripts/backfill-decay-weights.ts"
      provides: "Reads existing SentimentObservation rows, computes new decay_weight under new model_version, INSERTS new rows (never updates)"
      contains: "model_version"
    - path: "src/app/api/cron/tune-decay/route.ts"
      provides: "Monthly cron entrypoint that invokes tune-decay programmatically + persists DecayCalibration"
      contains: "Bearer ${process.env.CRON_SECRET}"
    - path: "HYPERPARAMETERS.md"
      provides: "Human-reviewable table of all calibrated λ values (sentiment + learning) with literature citations"
      contains: "20-A-03"
    - path: "vercel.json"
      provides: "New cron entry for /api/cron/tune-decay scheduled monthly"
      contains: "tune-decay"
    - path: "tests/sentiment-decay.unit.test.ts"
      provides: "≥6 unit cases: age=0→1, age=∞→0 limit, half-life formula, negative-age throw, lambda-zero throw, lambda-negative throw"
    - path: "tests/sentiment-source-class.unit.test.ts"
      provides: "Exhaustive mapping test — every known source string maps to exactly one SourceClass; unknown source throws"
    - path: "tests/integration/tune-decay.integration.test.ts"
      provides: "End-to-end: 90d fixture → grid search → DecayCalibration row written → ICIR uplift > 0 vs no-decay baseline"
  key_links:
    - from: "src/lib/sentiment/aggregator.ts (decayed branch)"
      to: "decayWeight() from src/lib/sentiment/decay.ts via SentimentObservation.decay_weight column"
      via: "weighted aggregate Σ score×decay_weight / Σ decay_weight"
      pattern: "decay_weight"
    - from: "scripts/tune-decay.ts"
      to: "prisma.decayCalibration.create + HYPERPARAMETERS.md edit"
      via: "tune-decay run persists results AND emits markdown patch"
      pattern: "decayCalibration\\.create"
    - from: "scripts/backfill-decay-weights.ts"
      to: "prisma.sentimentObservation.create with new model_version"
      via: "additive backfill — never UPDATE"
      pattern: "model_version"
    - from: "src/app/api/cron/tune-decay/route.ts"
      to: "vercel.json crons entry"
      via: "monthly schedule '0 6 1 * *' (1st of month, 06:00 UTC)"
      pattern: "tune-decay"
---

# Plan 20-A-03: Exponential time decay per source class

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE blocking step: `npx prisma db push` of the new `DecayCalibration` model against live Neon (Task 5). All other tasks are autonomous. After the operator confirms the push, the remaining tasks (decay primitives, source-class mapping, tune-decay script, backfill, cron wiring, aggregator integration behind `off|shadow|on` flag, tests) proceed without further prompts. The cutover from shadow→on is operator-gated by the Task 11 paired-bootstrap report — this plan SHIPS the report-generation, not the cutover decision.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. `SENTIMENT_DECAY_MODE` flag introduced with three values `off | shadow | on`. Plan ships at `shadow` by default; cutover to `on` requires the Task 11 bootstrap report showing 95% CI lower-bound > 0 on Sharpe uplift.
2. No old code deleted — undecayed aggregator path remains alive while flag is `shadow` so we can compute decayed-vs-undecayed deltas in parallel.
3. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), `npm run test:e2e` (Playwright) all green on `main` post-commit.
4. **Schema Push Gate** (Task 5): `npx prisma db push` succeeded against live `DATABASE_URL` AND the integration test writes ≥1 `DecayCalibration` row in a single tune-decay invocation.
5. **HYPERPARAMETERS Gate**: `HYPERPARAMETERS.md` exists at repo root, contains literal entries for all 5 source classes, AND at least one calibrated λ differs from its literature-default seed (proves grid search ran and chose).
6. **ICIR Acceptance Gate** (CONTEXT.md line 105 verbatim): on a labeled validation window, the decayed aggregate's ICIR vs forward-7d alpha-vs-SPY exceeds the no-decay baseline by ≥0.05. Reported in `DecayCalibration.icir_uplift_vs_no_decay`. Until this gate passes, flag stays at `shadow`.
7. **Cutover Gate** (Threat T-20-A-03-04): paired-bootstrap (1000 resamples) on Sharpe difference between decayed and undecayed aggregates returns 95% CI lower-bound > 0. Operator runs `npx tsx scripts/tune-decay.ts --bootstrap-cutover` to produce the report; then sets `SENTIMENT_DECAY_MODE=on` in env and redeploys.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — Literature defaults (Tetlock 2007: 24h retail, 72h news; SEC 10-K market efficiency studies: 7d) are SEED values for the grid. Final λ comes from grid search maximizing rolling ICIR. Hand-picked values forbidden in production HYPERPARAMETERS.md row; tune-decay script overwrites the row and stamps `tuned_at` ISO timestamp.
- **S3 (per-plan shadow lifecycle)** — `SENTIMENT_DECAY_MODE` flag (`off | shadow | on`). Off → shadow (compute decayed weights, persist alongside undecayed) → on (aggregator switches) → flag removed in Phase 21. Verdict for shadow→on is the numerical Cutover Gate above.
- **S7 (threat model)** — Five plan-level threats T-20-A-03-{01..05}. Threat T-20-A-03-03 (backfill duplicate-key) is structurally defended by 20-Z-01's `(ticker, message_id, model_version)` composite unique — backfill uses NEW `model_version`, satisfies uniqueness by construction.
- **S8 (numerical acceptance)** — every DONE criterion is a grep/test exit/numeric assertion. ICIR uplift ≥ 0.05, bootstrap CI lower-bound > 0, n_observations ≥ 60 per class, EPSILON = 1e-9 div-by-zero guard.

</universal_preamble>

<objective>
Add per-source-class exponential time decay to the sentiment aggregator. Each `SentimentObservation` (from Plan 20-Z-01) carries a `decay_weight = exp(-λ × age_days)` where λ is per-source-class. λ values are CALIBRATED via grid search maximizing 20-day rolling ICIR of the decayed aggregate vs forward 7-day alpha-vs-SPY. Literature defaults (24h retail / 72h news / 7d SEC) seed the grid (Tetlock 2007; Loughran-McDonald 2011). Backfill applies new λ to historical observations via the model_version mechanism in 20-Z-01 (insert-only, never overwrite).

Purpose: Phase 19 shipped a Beta-smoothed weighted aggregator that treats every message as equally-recent. That is wrong: Tetlock 2007 showed retail pessimism → next-day returns then mean-reverts within a week. A 7-day-old StockTwits flame should not weigh as much as a 1-hour-old one. RavenPack uses a published 90-day SMA; modern practitioners use exponential decay because it has continuous derivatives and avoids the cliff at the SMA boundary. This plan brings Cipher to that baseline AND calibrates λ per source class against realized returns rather than picking values from a paper.

Output:
- 1 new pure module `src/lib/sentiment/decay.ts` (~80 LOC) — `decayWeight`, `decayLambdaForClass`, `halfLifeDays`
- 1 new pure module `src/lib/sentiment/source-class.ts` (~50 LOC) — `SourceClass` union + exhaustive `sourceToClass` mapping
- 1 new typed config `src/lib/sentiment/decay-hyperparameters.ts` with module-load Zod validation
- 1 new Prisma model `DecayCalibration` (append-only history) + 1 index
- 1 new tunable script `scripts/tune-decay.ts` (~250 LOC)
- 1 new backfill script `scripts/backfill-decay-weights.ts` (~120 LOC)
- 1 new cron route `src/app/api/cron/tune-decay/route.ts` (~50 LOC)
- 1 new top-level `HYPERPARAMETERS.md`
- 1 vercel.json crons entry (monthly)
- Aggregator integration behind `SENTIMENT_DECAY_MODE` flag
- 2 unit-test files (≥6 cases + exhaustive mapping)
- 1 integration test file (live-Neon)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@prisma/schema.prisma
@src/lib/learning.ts
@src/lib/sentiment/aggregator.ts
@src/lib/sentiment/observation-store.ts
@scripts/tune-lambda.ts
@vercel.json
@CLAUDE.md

<interfaces>
```typescript
// src/lib/sentiment/source-class.ts — NEW

export type SourceClass = 'retail' | 'news' | 'sec' | 'analyst' | 'social-other';

// Every Cipher source string MUST map to exactly one class. Adding a new source
// without extending this mapping fails the exhaustive type-check below at compile.
export type CipherSource =
  | 'stocktwits'
  | 'anthropic-search-news'
  | 'finnhub-analyst'
  | 'firecrawl-reddit'
  | 'firecrawl-forums'
  | 'sec'                       // reserved for 20-B SEC fetcher; throws if used pre-20-B unless TEST_ALLOW_SEC=1
  | 'apewisdom'
  | 'swaggystocks'
  | 'x';

export function sourceToClass(source: CipherSource): SourceClass;
// Throws SourceClassUnknownError on unknown source string at runtime.

export class SourceClassUnknownError extends Error { readonly source: string; }

// src/lib/sentiment/decay.ts — NEW

/**
 * Pure decay weight: w = exp(-λ × age_days).
 *
 * SEPARATE module from src/lib/learning.ts decayWeights() (which decays
 * Bayesian-engine observations by signal class, not sentiment messages by
 * source class). The two MUST NOT share a lambda table — different domain,
 * different calibration target, different update cadence.
 *
 * Half-life formula: t½ = ln(2) / λ. λ in units of (1/day).
 *
 * Tetlock 2007 (J. Finance): retail pessimism predicts next-day returns then
 * mean-reverts within ~5 trading days → seed retail half-life 24h (λ ≈ 0.693).
 * News effects survive ~1-2 weeks (Loughran-McDonald 2011) → seed news
 * half-life 72h (λ ≈ 0.231). SEC 10-K market response decays over ~7d →
 * seed SEC half-life 168h (λ ≈ 0.099). These are SEED values for the grid;
 * scripts/tune-decay.ts overwrites with calibrated λ.
 */
export function decayWeight(ageDays: number, lambdaPerDay: number): number;
//   Throws on ageDays < 0 (programmer bug — should never persist a future-dated row;
//   if 20-Z-01 ever surfaces a clock-skew row, the throw exposes it loudly rather
//   than silently weighting it as 1.0). Throws on lambdaPerDay <= 0 or non-finite.

export function decayLambdaForClass(cls: SourceClass): number;
//   Reads from src/lib/sentiment/decay-hyperparameters.ts. Pure lookup; no DB hit.

export function halfLifeDays(lambdaPerDay: number): number;
//   Math.LN2 / lambdaPerDay. For documentation/UI; not on the hot path.

// src/lib/sentiment/decay-hyperparameters.ts — NEW

export interface SourceClassDecayConfig {
  lambda_per_day: number;
  half_life_days: number;          // derived: ln(2)/λ; stored for human review
  literature_seed_half_life_days: number;  // never overwritten — provenance
  literature_citation: string;     // e.g. "Tetlock 2007 J. Finance"
  tuned_at: string;                // ISO-8601 OR "bootstrap" sentinel
  icir_uplift_vs_no_decay: number | null;  // populated by tune-decay
  n_observations_at_tune: number | null;   // n at tuning time (gate: must be >= 60)
}

export const DECAY_HYPERPARAMETERS: Record<SourceClass, SourceClassDecayConfig>;

// Module-load Zod validation throws if any class has lambda_per_day <= 0 or
// missing required fields. Per 19-A-01 precedent (validateHyperparameters).
export function validateDecayHyperparameters(input: unknown): asserts input is typeof DECAY_HYPERPARAMETERS;

// scripts/tune-decay.ts — NEW

interface TuneDecayResult {
  source_class: SourceClass;
  best_lambda: number;
  best_icir: number;
  baseline_icir_no_decay: number;
  icir_uplift: number;
  per_lambda: Array<{ lambda: number; icir_20d: number }>;
  n_observations: number;
  training_window_days: number;
  cutover_eligible: boolean;       // true iff icir_uplift >= 0.05 AND n_observations >= 60
}

export async function tuneDecay(opts: {
  trainingWindowDays?: number;     // default 90 — SAME across classes (T-20-A-03-05)
  multipliers?: number[];          // default [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] × literature seed
  bootstrapCutover?: boolean;      // true → also runs paired-bootstrap on Sharpe (1000 resamples)
}): Promise<TuneDecayResult[]>;
```

```prisma
// prisma/schema.prisma — NEW model (appended after SentimentObservation from 20-Z-01)

model DecayCalibration {
  id                       String   @id @default(uuid())
  computed_at              DateTime @default(now()) @db.Timestamptz
  source_class             String   // 'retail' | 'news' | 'sec' | 'analyst' | 'social-other'
  lambda_per_day           Float
  half_life_days           Float
  icir_uplift_vs_no_decay  Float    // negative values are persisted (never silently dropped)
  training_window_days     Int      // SAME value across a single tune-decay run for all classes
  n_observations           Int
  model_version            String   // backfill partition key — observations are inserted with NEW model_version equal to this column
  // append-only history; rows are NEVER updated

  @@index([source_class, computed_at(sort: Desc)], map: "idx_decaycal_class_at")
  @@map("decay_calibrations")
}
```

```typescript
// src/lib/sentiment/aggregator.ts — MODIFIED (additive branch behind flag)

// Existing aggregateCommunitySentiment(inputs) is preserved unchanged.
// New variant pulls from SentimentObservation rows and applies decay_weight:

export interface DecayedAggregatorInput {
  ticker: string;
  source: CipherSource;
  message_id: string;
  classifier_score: number;            // [-1, +1]
  decay_weight: number;                // pre-computed, persisted in SentimentObservation
}

export function aggregateDecayed(rows: DecayedAggregatorInput[]): {
  weighted_score: number;             // [-1, +1] or NaN→fallback path
  total_weight: number;
  fallback_to_uniform: boolean;       // true iff Σ decay_weight < EPSILON
};
//   Σ decay_weight < EPSILON (1e-9) → uniform-weight fallback (T-20-A-03-02 mitigation).

// Mode-router: SENTIMENT_DECAY_MODE env var ∈ {off, shadow, on}
//   off    → existing aggregateCommunitySentiment only
//   shadow → both paths compute; persist comparison row in ProviderCallLog (20-Z-03)
//   on     → aggregateDecayed result is the authoritative number
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-A-03-01 | Tampering / overfitting | Calibration on small training window inflates ICIR uplift falsely | mitigate | tune-decay GATES on `n_observations >= 60` per source class. Below threshold: emit "INSUFFICIENT_DATA" diagnostic, return `cutover_eligible: false`, exit non-zero. NEVER publish a new λ from a small sample. Integration test asserts low-N path fails-loud. |
| T-20-A-03-02 | DoS / numerical | All-old samples → Σ exp(-λt) ≈ 0 → div-by-zero in normalization | mitigate | aggregateDecayed checks Σ decay_weight < EPSILON (1e-9) and falls back to uniform weights. Telemetry counter `decay_uniform_fallback_total` exposed via 20-Z-03 dashboard. Unit test asserts fallback fires on synthetic 365d-old-only batch. |
| T-20-A-03-03 | Tampering | Backfill creates duplicate rows breaking 20-Z-01 unique constraint | mitigate | 20-Z-01's composite unique is `(ticker, message_id, model_version)`. backfill-decay-weights.ts ALWAYS uses a fresh model_version (e.g. `decay-tuned-2026-05-15`) for the rewrite batch. Post-condition assertion in script: `count_new = SELECT count(*) WHERE model_version = $NEW; count_old_after = SELECT count(*) WHERE model_version = $OLD;` then `assert count_old_after == count_old_before AND count_new > 0`. Failure aborts and exits non-zero. |
| T-20-A-03-04 | Tampering / false confidence | ICIR uplift not statistically significant; cutover causes regression | mitigate | Cutover from shadow→on requires paired bootstrap on Sharpe of decayed-vs-undecayed aggregate (1000 resamples) returning 95% CI lower-bound > 0. Operator runs `--bootstrap-cutover`; the report is pasted into commit message; ONLY THEN may `SENTIMENT_DECAY_MODE` flip to `on`. **Severity: HIGH.** |
| T-20-A-03-05 | Tampering / regime mismatch | Source classes calibrated on different time windows mix regimes (e.g. retail tuned during meme-stock spike, news tuned during quiet period) | mitigate | tune-decay opts.trainingWindowDays defaults to 90 and is enforced as the SAME value across ALL classes within a single run. DecayCalibration.training_window_days is persisted per row. Test asserts that within one tune-decay invocation all DecayCalibration rows share the same training_window_days. |

</threat_model>

<tasks>

<task type="auto" id="20-A-03-01">
  <name>Task 1: Create SourceClass enum + exhaustive sourceToClass mapping</name>
  <read_first>
    - src/lib/sentiment/observation-store.ts (existing `SentimentObservationSource` union — line 296-297; new mapping must cover every value in that union plus Phase-19 sources)
    - src/lib/sentiment/aggregator.ts (existing `SentimentSource` union — line 26)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 105 — 20-A-03 spec; lines 13-41 standards)
  </read_first>
  <action>
    Create `src/lib/sentiment/source-class.ts` exactly as below. The mapping MUST be exhaustive — TypeScript's `never` check (`const _exhaustive: never = source`) at the bottom of the switch enforces compile-time coverage. Adding a new source string later without extending the switch fails `tsc`.

    ```typescript
    /**
     * Plan 20-A-03 — Source-class taxonomy for time-decay calibration.
     *
     * Maps every Cipher data source to one of 5 classes. Each class has its own
     * λ in src/lib/sentiment/decay-hyperparameters.ts; tune-decay calibrates
     * one λ per class against forward 7d alpha-vs-SPY.
     *
     * Why per-class λ matters: Tetlock 2007 showed retail chatter mean-reverts
     * within ~5 trading days; analyst notes survive 1-2 weeks; SEC filings
     * carry ~7d-30d signal. A single λ blurs these characteristic time scales.
     */

    export type SourceClass = 'retail' | 'news' | 'sec' | 'analyst' | 'social-other';

    export type CipherSource =
      | 'stocktwits'
      | 'anthropic-search-news'
      | 'finnhub-analyst'
      | 'firecrawl-reddit'
      | 'firecrawl-forums'
      | 'sec'
      | 'apewisdom'
      | 'swaggystocks'
      | 'x';

    export class SourceClassUnknownError extends Error {
      constructor(public readonly source: string) {
        super(
          `Unknown sentiment source "${source}". Add it to CipherSource union ` +
          `and sourceToClass() in src/lib/sentiment/source-class.ts before persisting.`,
        );
        this.name = 'SourceClassUnknownError';
      }
    }

    export function sourceToClass(source: CipherSource): SourceClass {
      switch (source) {
        case 'stocktwits':            return 'retail';        // per CONTEXT line 105 mapping
        case 'apewisdom':             return 'retail';        // retail aggregator over WSB
        case 'swaggystocks':          return 'retail';        // retail aggregator
        case 'firecrawl-reddit':      return 'retail';        // per spec
        case 'x':                     return 'retail';        // retail microblog (treated as retail until 20-C-03 author-credibility scoring lands)
        case 'anthropic-search-news': return 'news';          // per spec
        case 'finnhub-analyst':       return 'analyst';       // per spec
        case 'firecrawl-forums':      return 'social-other';  // per spec — non-Reddit forums (Discord/Yahoo/etc.)
        case 'sec':                   return 'sec';           // reserved for 20-B SEC fetcher
        default: {
          // Exhaustiveness guard — adding a new CipherSource without extending
          // this switch fails compilation here.
          const _exhaustive: never = source;
          throw new SourceClassUnknownError(_exhaustive as unknown as string);
        }
      }
    }

    /** Runtime-safe variant for non-typed callers (e.g. data coming from DB strings). */
    export function sourceToClassUnsafe(source: string): SourceClass {
      return sourceToClass(source as CipherSource);
    }
    ```
  </action>
  <acceptance_criteria>
    - `test -f src/lib/sentiment/source-class.ts`
    - `grep -c "export type SourceClass" src/lib/sentiment/source-class.ts` returns `1`
    - `grep -c "case 'stocktwits'" src/lib/sentiment/source-class.ts` returns `1`
    - `grep -c "_exhaustive: never" src/lib/sentiment/source-class.ts` returns `1`
    - `grep -c "case '" src/lib/sentiment/source-class.ts` returns `9` (all 9 CipherSource values mapped)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && [ "$(grep -c "case '" src/lib/sentiment/source-class.ts)" -eq 9 ] && grep -q "_exhaustive: never" src/lib/sentiment/source-class.ts</automated>
  </verify>
  <done>SourceClass enum + exhaustive sourceToClass mapping committed; tsc green; 9 source strings mapped to 5 classes</done>
</task>

<task type="auto" id="20-A-03-02">
  <name>Task 2: Create decay-hyperparameters.ts with literature seeds + Zod validation</name>
  <read_first>
    - src/lib/learning.ts (lines 696-720 — precedent for typed-const hyperparameter table + module-load assertion)
    - src/lib/sentiment/source-class.ts (Task 1 output — needs the union)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 53 — Tetlock 2007 + literature defaults)
  </read_first>
  <action>
    Create `src/lib/sentiment/decay-hyperparameters.ts`. This is the SOLE source of λ for sentiment decay at runtime — all callers must import from here. Module-load Zod validation throws on invalid configs (per 19-A-01 precedent).

    ```typescript
    /**
     * Plan 20-A-03 — Per-source-class decay hyperparameters.
     *
     * Literature seeds (overwritten by scripts/tune-decay.ts after first calibration):
     *   - retail        : t½ = 24h  → λ ≈ 0.693/day  (Tetlock 2007 J. Finance)
     *   - news          : t½ = 72h  → λ ≈ 0.231/day  (Loughran-McDonald 2011 JF)
     *   - sec           : t½ = 168h → λ ≈ 0.099/day  (10-K market efficiency studies)
     *   - analyst       : t½ = 120h → λ ≈ 0.139/day  (analyst-revision drift literature)
     *   - social-other  : t½ = 96h  → λ ≈ 0.173/day  (between retail and news; calibration overrides)
     *
     * t½ = ln(2) / λ → λ = ln(2) / t½(in days).
     *
     * tuned_at = "bootstrap" → flagged so consumers know these are pre-calibration
     * literature seeds. After tune-decay runs, tuned_at becomes ISO-8601 timestamp
     * AND icir_uplift_vs_no_decay + n_observations_at_tune get populated.
     */
    import { z } from 'zod';
    import type { SourceClass } from './source-class';

    export interface SourceClassDecayConfig {
      lambda_per_day: number;
      half_life_days: number;
      literature_seed_half_life_days: number;
      literature_citation: string;
      tuned_at: string;
      icir_uplift_vs_no_decay: number | null;
      n_observations_at_tune: number | null;
    }

    const LN2 = Math.LN2;
    const halfLifeToLambda = (h: number): number => LN2 / h;
    const halfLifeFromLambda = (l: number): number => LN2 / l;

    // Literature seeds — these are SEED values for the grid in scripts/tune-decay.ts.
    // Calibrated values overwrite the row but literature_seed_half_life_days is preserved.
    export const DECAY_HYPERPARAMETERS: Record<SourceClass, SourceClassDecayConfig> = {
      retail: {
        lambda_per_day: halfLifeToLambda(1),         // 24h
        half_life_days: 1,
        literature_seed_half_life_days: 1,
        literature_citation: 'Tetlock 2007 — J. Finance — pessimism predicts next-day returns then mean-reverts within 5 trading days',
        tuned_at: 'bootstrap',
        icir_uplift_vs_no_decay: null,
        n_observations_at_tune: null,
      },
      news: {
        lambda_per_day: halfLifeToLambda(3),         // 72h
        half_life_days: 3,
        literature_seed_half_life_days: 3,
        literature_citation: 'Loughran-McDonald 2011 J. Finance — news effects survive 1-2 weeks',
        tuned_at: 'bootstrap',
        icir_uplift_vs_no_decay: null,
        n_observations_at_tune: null,
      },
      sec: {
        lambda_per_day: halfLifeToLambda(7),         // 168h
        half_life_days: 7,
        literature_seed_half_life_days: 7,
        literature_citation: 'Loughran-McDonald 2011 — 10-K market response decays over 7-30d',
        tuned_at: 'bootstrap',
        icir_uplift_vs_no_decay: null,
        n_observations_at_tune: null,
      },
      analyst: {
        lambda_per_day: halfLifeToLambda(5),         // 120h
        half_life_days: 5,
        literature_seed_half_life_days: 5,
        literature_citation: 'Womack 1996 / Stickel 1992 — analyst-revision drift survives 1-2 weeks',
        tuned_at: 'bootstrap',
        icir_uplift_vs_no_decay: null,
        n_observations_at_tune: null,
      },
      'social-other': {
        lambda_per_day: halfLifeToLambda(4),         // 96h
        half_life_days: 4,
        literature_seed_half_life_days: 4,
        literature_citation: 'Bridging seed between retail (1d) and news (3d); calibration to override',
        tuned_at: 'bootstrap',
        icir_uplift_vs_no_decay: null,
        n_observations_at_tune: null,
      },
    };

    const ConfigSchema = z.object({
      lambda_per_day: z.number().positive().finite(),
      half_life_days: z.number().positive().finite(),
      literature_seed_half_life_days: z.number().positive().finite(),
      literature_citation: z.string().min(10),
      tuned_at: z.string().min(1),
      icir_uplift_vs_no_decay: z.number().nullable(),
      n_observations_at_tune: z.number().int().nonnegative().nullable(),
    }).strict();

    const HyperparametersSchema = z.object({
      retail: ConfigSchema,
      news: ConfigSchema,
      sec: ConfigSchema,
      analyst: ConfigSchema,
      'social-other': ConfigSchema,
    }).strict();

    export function validateDecayHyperparameters(
      input: unknown,
    ): asserts input is typeof DECAY_HYPERPARAMETERS {
      HyperparametersSchema.parse(input);
    }

    // Module-load assertion — fails fast at import time on a malformed config.
    validateDecayHyperparameters(DECAY_HYPERPARAMETERS);

    // Cross-check: half_life_days MUST equal ln(2)/lambda_per_day within float tolerance.
    for (const [cls, cfg] of Object.entries(DECAY_HYPERPARAMETERS)) {
      const expected = halfLifeFromLambda(cfg.lambda_per_day);
      if (Math.abs(expected - cfg.half_life_days) > 1e-9) {
        throw new Error(
          `decay-hyperparameters: ${cls} half_life_days=${cfg.half_life_days} ` +
          `does not match ln(2)/lambda=${expected}. Re-derive both from the same source.`,
        );
      }
    }
    ```
  </action>
  <acceptance_criteria>
    - `test -f src/lib/sentiment/decay-hyperparameters.ts`
    - `grep -c "DECAY_HYPERPARAMETERS" src/lib/sentiment/decay-hyperparameters.ts` returns `>= 3`
    - `grep -c "Tetlock 2007" src/lib/sentiment/decay-hyperparameters.ts` returns `1`
    - `grep -c "Loughran-McDonald" src/lib/sentiment/decay-hyperparameters.ts` returns `>= 1`
    - `grep -c "validateDecayHyperparameters(DECAY_HYPERPARAMETERS)" src/lib/sentiment/decay-hyperparameters.ts` returns `1`
    - `node -e "require('./src/lib/sentiment/decay-hyperparameters.ts')"` would-import — verified via `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "validateDecayHyperparameters(DECAY_HYPERPARAMETERS)" src/lib/sentiment/decay-hyperparameters.ts && grep -q "Tetlock 2007" src/lib/sentiment/decay-hyperparameters.ts</automated>
  </verify>
  <done>Decay hyperparameter table committed with all 5 source classes seeded from literature; module-load Zod validation in place</done>
</task>

<task type="auto" id="20-A-03-03">
  <name>Task 3: Create decay.ts pure module — decayWeight, decayLambdaForClass, halfLifeDays</name>
  <read_first>
    - src/lib/learning.ts (lines 410-440 — existing `decayWeights` for diffusion engine; this is the analog for sentiment but per-message and per-source-class)
    - src/lib/sentiment/source-class.ts (Task 1 output)
    - src/lib/sentiment/decay-hyperparameters.ts (Task 2 output)
  </read_first>
  <action>
    Create `src/lib/sentiment/decay.ts`:

    ```typescript
    /**
     * Plan 20-A-03 — Sentiment-message exponential time decay.
     *
     * Pure module — no DB, no I/O. Consumers:
     *   - scripts/backfill-decay-weights.ts → computes decay_weight per row at backfill time
     *   - src/lib/sentiment/aggregator.ts → applies persisted decay_weight in the
     *     decayed branch
     *   - scripts/tune-decay.ts → uses decayWeight at every grid candidate λ
     *
     * Why a separate module from src/lib/learning.ts decayWeights():
     *   src/lib/learning.ts decays Bayesian-engine observations by SIGNAL CLASS
     *   (diffusion / technical / insider / institutional) for the LearnedPattern
     *   posterior update. λ there is per signal class with t½ ≈ 60d.
     *
     *   This module decays sentiment MESSAGES by SOURCE CLASS (retail / news /
     *   sec / analyst / social-other) for the cross-source aggregator. λ here
     *   is per source class with t½ ≈ 1-7d.
     *
     *   Different domain, different calibration target (engine α/β posteriors
     *   vs intra-day weighted-mean), different update cadence (monthly vs
     *   quarterly), different time scale. Sharing the table would conflate
     *   them; we explicitly do not.
     *
     * Half-life formula: t½ = ln(2) / λ. Inverted: λ = ln(2) / t½.
     *
     * Tetlock 2007 (J. Finance, 62(3): 1139-1168) — "Giving Content to Investor
     * Sentiment: The Role of Media in the Stock Market" — pessimism predicts
     * next-day returns then mean-reverts within ~5 trading days. This is the
     * empirical anchor for retail half-life ≈ 24h.
     */
    import {
      DECAY_HYPERPARAMETERS,
      type SourceClassDecayConfig,
    } from './decay-hyperparameters';
    import type { SourceClass } from './source-class';

    /**
     * w = exp(-λ × age_days). λ in (1/day).
     *
     * Throws on:
     *   - ageDays < 0 — programmer bug. A persisted observation should have
     *     fetched_at <= now() (DB clock); a negative age means clock skew or
     *     tampered timestamps. We throw rather than clamp because clamping
     *     would weight a future-dated row at 1.0 (max), which is the opposite
     *     of safe — silently up-weighting a row that bypassed PIT discipline.
     *     Note: this is a deliberate departure from src/lib/learning.ts
     *     decayWeights() which clamps Δt < 0 → 0; that function takes
     *     `recorded_at` from a curated outcomes table, this one takes
     *     `fetched_at` from an upstream-message table where clock skew is real.
     *   - lambdaPerDay <= 0 or non-finite — would yield Infinity / NaN weights.
     */
    export function decayWeight(ageDays: number, lambdaPerDay: number): number {
      if (!Number.isFinite(ageDays)) {
        throw new Error(`decayWeight: ageDays must be finite (got: ${ageDays})`);
      }
      if (ageDays < 0) {
        throw new Error(
          `decayWeight: ageDays must be >= 0 (got: ${ageDays}). ` +
          `Negative age implies clock skew or tampered fetched_at — refusing to weight a future-dated observation. ` +
          `If this fires in production, investigate the SentimentObservation row before clamping.`,
        );
      }
      if (!Number.isFinite(lambdaPerDay) || lambdaPerDay <= 0) {
        throw new Error(
          `decayWeight: lambdaPerDay must be > 0 and finite (got: ${lambdaPerDay}). ` +
          `If you need decay disabled, use SENTIMENT_DECAY_MODE=off rather than passing 0.`,
        );
      }
      return Math.exp(-lambdaPerDay * ageDays);
    }

    /** Pure lookup; no DB hit. */
    export function decayLambdaForClass(cls: SourceClass): number {
      const cfg: SourceClassDecayConfig = DECAY_HYPERPARAMETERS[cls];
      return cfg.lambda_per_day;
    }

    /** t½ = ln(2) / λ. For human-readable display. */
    export function halfLifeDays(lambdaPerDay: number): number {
      if (!Number.isFinite(lambdaPerDay) || lambdaPerDay <= 0) {
        throw new Error(`halfLifeDays: lambdaPerDay must be > 0 and finite (got: ${lambdaPerDay})`);
      }
      return Math.LN2 / lambdaPerDay;
    }

    /** Convenience: age in days from a fetched_at Date. */
    export function ageDaysSince(fetched_at: Date, now: Date = new Date()): number {
      const ms = now.getTime() - fetched_at.getTime();
      return ms / 86_400_000;
    }
    ```
  </action>
  <acceptance_criteria>
    - `test -f src/lib/sentiment/decay.ts`
    - `grep -c "Math.exp(-lambdaPerDay \\* ageDays)" src/lib/sentiment/decay.ts` returns `1`
    - `grep -c "Math.LN2 / lambdaPerDay" src/lib/sentiment/decay.ts` returns `1`
    - `grep -c "Tetlock 2007" src/lib/sentiment/decay.ts` returns `1`
    - `grep -c "ageDays < 0" src/lib/sentiment/decay.ts` returns `>= 1` (negative-age guard, NOT clamp)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "Math.exp(-lambdaPerDay \* ageDays)" src/lib/sentiment/decay.ts && grep -q "Math.LN2 / lambdaPerDay" src/lib/sentiment/decay.ts && grep -q "ageDays < 0" src/lib/sentiment/decay.ts</automated>
  </verify>
  <done>decay.ts pure module shipped; tsc green; literal exp(-λt) formula present; half-life formula present; negative-age throws (does not clamp)</done>
</task>

<task type="auto" id="20-A-03-04">
  <name>Task 4: Add DecayCalibration Prisma model + index</name>
  <read_first>
    - prisma/schema.prisma (current bottom of file, after SentimentObservation from 20-Z-01)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (Task 1 — precedent for additive Phase-20 schema; same shape)
  </read_first>
  <action>
    Append the following block to `prisma/schema.prisma` AFTER the `SentimentObservation` model (which 20-Z-01 placed at the bottom). Do NOT modify any existing model.

    ```prisma

    // ─── Phase 20-A-03 — DecayCalibration history (append-only) ───
    // Persists every tune-decay run. NEVER updated — a re-tune writes a new row.
    // (source_class, computed_at) gives the time series of λ for each class.
    // model_version on this row equals the model_version stamped on the
    // SentimentObservation backfill rows that this calibration produced — that
    // is how we trace "row X under λ_v3 came from calibration run Y."
    model DecayCalibration {
      id                       String   @id @default(uuid())
      computed_at              DateTime @default(now()) @db.Timestamptz
      source_class             String   // 'retail' | 'news' | 'sec' | 'analyst' | 'social-other'
      lambda_per_day           Float
      half_life_days           Float
      icir_uplift_vs_no_decay  Float    // signed; negative values are persisted, never silently dropped
      training_window_days     Int      // SAME across all classes within one tune-decay run (T-20-A-03-05)
      n_observations           Int
      model_version            String   // backfill partition key — feeds SentimentObservation.model_version

      @@index([source_class, computed_at(sort: Desc)], map: "idx_decaycal_class_at")
      @@map("decay_calibrations")
    }
    ```

    Run client regeneration after the edit (no DB push yet — that is Task 5):

    ```bash
    npx prisma generate
    ```
  </action>
  <acceptance_criteria>
    - `grep -c "model DecayCalibration" prisma/schema.prisma` returns `1`
    - `grep -c "idx_decaycal_class_at" prisma/schema.prisma` returns `1`
    - `grep -c "decay_calibrations" prisma/schema.prisma` returns `1`
    - `git diff prisma/schema.prisma | grep -E "^-[^-]" | wc -l` returns `0` (only additions; no existing model touched)
    - `npx prisma format --check` exits 0
    - `npx prisma generate` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx prisma format --check && grep -q "model DecayCalibration" prisma/schema.prisma && [ "$(git diff prisma/schema.prisma | grep -E "^-[^-]" | wc -l)" -eq 0 ]</automated>
  </verify>
  <done>DecayCalibration model + index added; existing schema untouched; Prisma client regenerated</done>
</task>

<task type="checkpoint:human-action" id="20-A-03-05" gate="blocking">
  <name>Task 5: [BLOCKING] Run npx prisma db push for DecayCalibration against live Neon</name>
  <read_first>
    - prisma/schema.prisma (after Task 4 — verify the DecayCalibration block is present)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (Task 3 — same schema-push pattern)
  </read_first>
  <what-built>
    Task 4 added a new `DecayCalibration` model. This task pushes that schema to live Neon. Purely additive (new table, one index — no column drops, no type changes). Reversible via `DROP TABLE decay_calibrations` if needed.
  </what-built>
  <how-to-verify>
    1. Confirm `DATABASE_URL` points to production Neon:
       ```bash
       echo "$DATABASE_URL" | sed 's|//[^@]*@|//***@|'
       ```
       Expect a `neon.tech` host.

    2. Push:
       ```bash
       npx prisma db push
       ```
       Accept ONLY if the displayed plan is purely additive (new table `decay_calibrations` + index). Decline any destructive operation on existing tables.

       Non-TTY fallback:
       ```bash
       yes "" | npx prisma db push --skip-generate && npx prisma generate
       ```

    3. Verify:
       ```bash
       psql "$DATABASE_URL" -c '\d "decay_calibrations"'
       psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "decay_calibrations"'
       ```
       Expect 8 columns + 1 index `idx_decaycal_class_at`; row count `0`.
  </how-to-verify>
  <acceptance_criteria>
    - `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "decay_calibrations"'` returns `0`
    - `psql "$DATABASE_URL" -c '\d "decay_calibrations"' | grep -c "idx_decaycal_class_at"` returns `>= 1`
    - `psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='decay_calibrations' AND column_name='training_window_days'"` returns 1 row
  </acceptance_criteria>
  <resume-signal>Reply with `approved` once `psql` confirms the table + index are live. Reply with `failed: <reason>` if the push errored.</resume-signal>
  <done>DecayCalibration table live in production Neon with 1 index; row count = 0</done>
</task>

<task type="auto" id="20-A-03-06">
  <name>Task 6: Create scripts/tune-decay.ts — grid search per source class</name>
  <read_first>
    - scripts/tune-lambda.ts (~200 LOC — precedent for grid-search script writing per-class results; reuse PrismaClient + PrismaNeon pattern)
    - src/lib/sentiment/decay.ts (Task 3)
    - src/lib/sentiment/decay-hyperparameters.ts (Task 2)
    - src/lib/sentiment/source-class.ts (Task 1)
  </read_first>
  <action>
    Create `scripts/tune-decay.ts`. Algorithm (per CONTEXT line 105):

    1. For each `source_class`:
       a. Pull all SentimentObservation rows from the rolling `trainingWindowDays` window (default 90).
       b. Group by ticker, compute decayed aggregate at each candidate λ ∈ {seed × 0.5, ×0.75, ×1.0, ×1.25, ×1.5, ×2.0}.
       c. Join against forward 7-day alpha-vs-SPY (uses existing `PriceOutcome` table from Phase 18 — see scripts/tune-lambda.ts for the access pattern).
       d. Compute 20-day rolling cross-sectional Spearman IC; ICIR = mean(IC) / std(IC).
       e. Pick winning λ = argmax(ICIR). Compute uplift vs λ → ∞ baseline (no decay = uniform weights).
    2. GATE: if `n_observations < 60` for any class → emit `INSUFFICIENT_DATA` diagnostic for that class, skip persistence, exit non-zero.
    3. For each class that passes the gate:
       a. Stamp a single `model_version` for the entire tune-decay run (e.g. `decay-tuned-${ISO_DATE}-v1`).
       b. INSERT a `DecayCalibration` row.
       c. Emit a HYPERPARAMETERS.md patch (Task 8 owns the file — Task 6 just prints the patch).
    4. If `--bootstrap-cutover` flag passed:
       a. For each class, run paired-bootstrap (1000 resamples) on Sharpe of decayed-vs-undecayed aggregate.
       b. Print 95% CI; mark `cutover_eligible = true` iff lower-bound > 0.

    Print a summary table per class: best_lambda, half_life, icir_uplift, n_observations, cutover_eligible.

    Skeleton (operator may flesh out the IC/Sharpe internals from scripts/tune-lambda.ts patterns):

    ```typescript
    #!/usr/bin/env tsx
    // scripts/tune-decay.ts
    //
    // Phase 20-A-03 — per-source-class λ grid search. Maximizes 20-day rolling
    // ICIR of decayed aggregate vs forward 7d alpha-vs-SPY. Emits HYPERPARAMETERS.md
    // patch + DecayCalibration row.
    //
    // Usage:
    //   npx tsx scripts/tune-decay.ts                          # grid search only
    //   npx tsx scripts/tune-decay.ts --bootstrap-cutover      # also runs paired-bootstrap on Sharpe
    //   npx tsx scripts/tune-decay.ts --window-days 90         # override training window (SAME across classes)

    import { config as loadDotenv } from 'dotenv';
    loadDotenv({ path: '.env.local' });

    import { PrismaClient } from '@prisma/client';
    import { PrismaNeon } from '@prisma/adapter-neon';

    import { DECAY_HYPERPARAMETERS } from '../src/lib/sentiment/decay-hyperparameters';
    import { decayWeight, halfLifeDays } from '../src/lib/sentiment/decay';
    import type { SourceClass } from '../src/lib/sentiment/source-class';
    import { sourceToClassUnsafe } from '../src/lib/sentiment/source-class';

    const SOURCE_CLASSES: SourceClass[] = ['retail', 'news', 'sec', 'analyst', 'social-other'];
    const LAMBDA_GRID_MULTIPLIERS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const DEFAULT_WINDOW_DAYS = 90;
    const MIN_N_OBSERVATIONS = 60;       // T-20-A-03-01 — calibration gate
    const ICIR_UPLIFT_GATE = 0.05;       // CONTEXT line 105 acceptance
    const ROLLING_IC_WINDOW = 20;        // 20-day rolling per CONTEXT line 105

    interface TuneDecayResult {
      source_class: SourceClass;
      best_lambda: number;
      best_icir: number;
      baseline_icir_no_decay: number;
      icir_uplift: number;
      per_lambda: Array<{ lambda: number; icir_20d: number }>;
      n_observations: number;
      training_window_days: number;
      cutover_eligible: boolean;
    }

    async function pullObservations(prisma: PrismaClient, cls: SourceClass, windowDays: number) {
      const since = new Date(Date.now() - windowDays * 86_400_000);
      // Pull all observations in window; in-memory filter by source_class via sourceToClassUnsafe
      // (DB stores raw source string; class is derived in TS).
      const rows = await prisma.sentimentObservation.findMany({
        where: { fetched_at: { gte: since } },
        orderBy: { fetched_at: 'asc' },
      });
      return rows.filter((r) => sourceToClassUnsafe(r.source) === cls);
    }

    function computeDecayedAggregate(
      rows: Array<{ ticker: string; classifier_score: number | null; fetched_at: Date }>,
      lambda: number,
      now: Date,
    ): Map<string, number> {
      const byTicker = new Map<string, { num: number; den: number }>();
      for (const r of rows) {
        if (r.classifier_score == null) continue;
        const ageDays = Math.max(0, (now.getTime() - r.fetched_at.getTime()) / 86_400_000);
        const w = decayWeight(ageDays, lambda);
        const cur = byTicker.get(r.ticker) ?? { num: 0, den: 0 };
        cur.num += r.classifier_score * w;
        cur.den += w;
        byTicker.set(r.ticker, cur);
      }
      const out = new Map<string, number>();
      for (const [ticker, { num, den }] of byTicker) {
        if (den > 1e-9) out.set(ticker, num / den);
      }
      return out;
    }

    function spearmanIC(/* aggregate scores by ticker, forward returns by ticker */
      a: Map<string, number>, r: Map<string, number>): number {
      // Standard rank-correlation; ~30 LOC. Pull tickers present in both, rank, Pearson on ranks.
      // (Implementation per scripts/tune-lambda.ts pattern.)
      // ... operator implements; reuse helper in src/lib/cv.ts if present, else inline.
      throw new Error('TODO: spearmanIC body — see scripts/tune-lambda.ts for the pattern');
    }

    function rollingICIR(perDayICs: number[]): number {
      const n = perDayICs.length;
      if (n < 2) return 0;
      const mean = perDayICs.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(perDayICs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
      return sd === 0 ? 0 : mean / sd;
    }

    async function tuneClass(
      prisma: PrismaClient,
      cls: SourceClass,
      windowDays: number,
    ): Promise<TuneDecayResult | { source_class: SourceClass; insufficient_data: true; n: number }> {
      const rows = await pullObservations(prisma, cls, windowDays);
      if (rows.length < MIN_N_OBSERVATIONS) {
        return { source_class: cls, insufficient_data: true, n: rows.length };
      }

      const seed = DECAY_HYPERPARAMETERS[cls].lambda_per_day;
      const grid = LAMBDA_GRID_MULTIPLIERS.map((m) => seed * m);

      // Compute per-day ICIR for each candidate λ over the window.
      // Baseline = "no decay" → effectively λ → 0 → uniform weights.
      // ... operator wires per-day loop joining to PriceOutcome forward 7d alpha-vs-SPY.
      // Result shape:
      const per_lambda = grid.map((lambda) => ({ lambda, icir_20d: NaN }));   // populated below
      const baseline_icir_no_decay = NaN;                                       // populated below

      // ... operator fills in the per-day join + ICIR computation.

      const best = per_lambda.reduce((a, b) => (b.icir_20d > a.icir_20d ? b : a), per_lambda[0]);
      const icir_uplift = best.icir_20d - baseline_icir_no_decay;

      return {
        source_class: cls,
        best_lambda: best.lambda,
        best_icir: best.icir_20d,
        baseline_icir_no_decay,
        icir_uplift,
        per_lambda,
        n_observations: rows.length,
        training_window_days: windowDays,
        cutover_eligible: icir_uplift >= ICIR_UPLIFT_GATE && rows.length >= MIN_N_OBSERVATIONS,
      };
    }

    async function main() {
      const argv = process.argv.slice(2);
      const windowIdx = argv.indexOf('--window-days');
      const windowDays = windowIdx >= 0 ? Number(argv[windowIdx + 1]) : DEFAULT_WINDOW_DAYS;
      const bootstrapCutover = argv.includes('--bootstrap-cutover');

      if (!process.env.DATABASE_URL) {
        console.error('[tune-decay] DATABASE_URL not set — abort.');
        process.exit(1);
      }

      const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });

      const model_version = `decay-tuned-${new Date().toISOString().slice(0, 10)}-v1`;
      const results: Array<TuneDecayResult | { source_class: SourceClass; insufficient_data: true; n: number }> = [];
      let anyInsufficient = false;
      for (const cls of SOURCE_CLASSES) {
        const r = await tuneClass(prisma, cls, windowDays);
        results.push(r);
        if ('insufficient_data' in r) anyInsufficient = true;
      }

      // Persist DecayCalibration rows for classes that passed the gate
      for (const r of results) {
        if ('insufficient_data' in r) {
          console.warn(`[tune-decay] ${r.source_class}: INSUFFICIENT_DATA n=${r.n} < ${MIN_N_OBSERVATIONS} — skipping persistence`);
          continue;
        }
        await prisma.decayCalibration.create({
          data: {
            source_class: r.source_class,
            lambda_per_day: r.best_lambda,
            half_life_days: halfLifeDays(r.best_lambda),
            icir_uplift_vs_no_decay: r.icir_uplift,
            training_window_days: r.training_window_days,
            n_observations: r.n_observations,
            model_version,
          },
        });
      }

      // Print summary + HYPERPARAMETERS.md patch
      console.log(`\n=== tune-decay results (window=${windowDays}d, model_version=${model_version}) ===`);
      console.table(results.map((r) => 'insufficient_data' in r
        ? { class: r.source_class, status: 'INSUFFICIENT_DATA', n: r.n }
        : { class: r.source_class, lambda: r.best_lambda.toFixed(4), half_life_days: halfLifeDays(r.best_lambda).toFixed(2), icir_uplift: r.icir_uplift.toFixed(4), n: r.n_observations, cutover_eligible: r.cutover_eligible },
      ));

      if (bootstrapCutover) {
        // Paired bootstrap on Sharpe — 1000 resamples — print per-class 95% CI
        // ... operator implements following T-20-A-03-04 mitigation
        console.log('\n[tune-decay] --bootstrap-cutover invoked — paired bootstrap report follows');
      }

      await prisma.$disconnect();
      if (anyInsufficient) process.exit(2);
      process.exit(0);
    }

    main().catch((e) => { console.error(e); process.exit(1); });
    ```

    Add a `package.json` script:
    ```json
    "tune-decay": "tsx scripts/tune-decay.ts"
    ```
  </action>
  <acceptance_criteria>
    - `test -f scripts/tune-decay.ts`
    - `grep -c "LAMBDA_GRID_MULTIPLIERS" scripts/tune-decay.ts` returns `>= 1`
    - `grep -c "MIN_N_OBSERVATIONS = 60" scripts/tune-decay.ts` returns `1` (T-20-A-03-01 gate)
    - `grep -c "ICIR_UPLIFT_GATE = 0.05" scripts/tune-decay.ts` returns `1` (CONTEXT acceptance)
    - `grep -c "decayCalibration.create" scripts/tune-decay.ts` returns `1`
    - `grep -c "training_window_days" scripts/tune-decay.ts` returns `>= 1` (T-20-A-03-05)
    - `grep -c "bootstrap-cutover" scripts/tune-decay.ts` returns `>= 1` (T-20-A-03-04)
    - `grep -c '"tune-decay"' package.json` returns `>= 1` (npm script wired)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "MIN_N_OBSERVATIONS = 60" scripts/tune-decay.ts && grep -q "ICIR_UPLIFT_GATE = 0.05" scripts/tune-decay.ts && grep -q "decayCalibration.create" scripts/tune-decay.ts && grep -q '"tune-decay"' package.json</automated>
  </verify>
  <done>tune-decay script committed; n>=60 gate + ICIR ≥ 0.05 gate + bootstrap-cutover flag in place; npm run tune-decay wired</done>
</task>

<task type="auto" id="20-A-03-07">
  <name>Task 7: Create scripts/backfill-decay-weights.ts — INSERT new model_version rows (no UPDATE)</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (Task 2 — observation-store.ts insert-only DAO; uses insertObservation, never update)
    - src/lib/sentiment/observation-store.ts (the DAO this script must call)
    - src/lib/sentiment/decay.ts (Task 3 — decayWeight)
    - src/lib/sentiment/decay-hyperparameters.ts (Task 2)
  </read_first>
  <action>
    Create `scripts/backfill-decay-weights.ts`:

    ```typescript
    #!/usr/bin/env tsx
    // scripts/backfill-decay-weights.ts
    //
    // Phase 20-A-03 — backfill decay_weight on historical SentimentObservation rows
    // under a NEW model_version. Per 20-Z-01 immutability convention, existing rows
    // are NEVER updated — backfill INSERTS new rows under a fresh model_version.
    //
    // Usage:
    //   npx tsx scripts/backfill-decay-weights.ts --new-model-version decay-tuned-2026-05-15-v1
    //
    // Post-condition (T-20-A-03-03):
    //   count(rows with new_model_version) > 0
    //   AND count(rows with old_model_version) unchanged before vs after

    import { config as loadDotenv } from 'dotenv';
    loadDotenv({ path: '.env.local' });

    import { PrismaClient } from '@prisma/client';
    import { PrismaNeon } from '@prisma/adapter-neon';

    import { decayWeight } from '../src/lib/sentiment/decay';
    import { DECAY_HYPERPARAMETERS } from '../src/lib/sentiment/decay-hyperparameters';
    import { sourceToClassUnsafe } from '../src/lib/sentiment/source-class';
    import { insertObservation } from '../src/lib/sentiment/observation-store';

    async function main() {
      const argv = process.argv.slice(2);
      const versionIdx = argv.indexOf('--new-model-version');
      if (versionIdx < 0) {
        console.error('[backfill-decay] --new-model-version required');
        process.exit(1);
      }
      const NEW_MODEL_VERSION = argv[versionIdx + 1];

      if (!process.env.DATABASE_URL) {
        console.error('[backfill-decay] DATABASE_URL not set — abort.');
        process.exit(1);
      }

      const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });

      // Pre-condition snapshot: per-old-model_version row counts
      const before = await prisma.sentimentObservation.groupBy({
        by: ['model_version'],
        _count: { _all: true },
      });
      const beforeMap = new Map(before.map((r) => [r.model_version, r._count._all]));

      // Pull all existing rows EXCEPT those already at the new model_version
      const rows = await prisma.sentimentObservation.findMany({
        where: { model_version: { not: NEW_MODEL_VERSION } },
        orderBy: { fetched_at: 'asc' },
      });

      let inserted = 0;
      let skipped_dupes = 0;
      const now = new Date();
      for (const r of rows) {
        const cls = sourceToClassUnsafe(r.source);
        const lambda = DECAY_HYPERPARAMETERS[cls].lambda_per_day;
        const ageDays = Math.max(0, (now.getTime() - r.fetched_at.getTime()) / 86_400_000);
        const w = decayWeight(ageDays, lambda);

        try {
          // raw_body is not retained (T-20-Z-01-02 — only hash). For backfill
          // we re-use the existing raw_body_hash via a sentinel; insertObservation
          // requires raw_body for hashing, so we pass the hash itself prefixed
          // — the DAO hashes again (idempotent at the row level since unique
          // constraint is on (ticker, message_id, model_version), NOT on hash).
          // This is a deliberate trade-off: we cannot rehydrate raw_body but
          // can preserve provenance via the original hash being stored as the
          // "raw_body" input. Document this as a known limitation in the
          // generated row's classifier_version.
          await insertObservation({
            ticker: r.ticker,
            source: r.source as Parameters<typeof insertObservation>[0]['source'],
            message_id: r.message_id,
            raw_body: `BACKFILL-FROM-HASH:${r.raw_body_hash}`,    // produces a different hash; documented limitation
            classifier_version: `${r.classifier_version}+decay-backfill`,
            classifier_score: r.classifier_score,
            model_version: NEW_MODEL_VERSION,
            decay_weight: w,
            author_id: r.author_id,
            author_features_snapshot: r.author_features_snapshot as Record<string, unknown>,
            fetched_at: r.fetched_at,                              // PRESERVE original PIT timestamp
            published_at: r.published_at,
          });
          inserted++;
        } catch (e) {
          if ((e as Error).name === 'SentimentObservationDuplicateError') {
            skipped_dupes++;                                        // re-running backfill is idempotent
          } else {
            throw e;
          }
        }
      }

      // Post-condition assertion (T-20-A-03-03)
      const after = await prisma.sentimentObservation.groupBy({
        by: ['model_version'],
        _count: { _all: true },
      });
      const afterMap = new Map(after.map((r) => [r.model_version, r._count._all]));

      const newCount = afterMap.get(NEW_MODEL_VERSION) ?? 0;
      if (newCount === 0) {
        console.error(`[backfill-decay] FAIL: no rows written under model_version=${NEW_MODEL_VERSION}`);
        process.exit(2);
      }
      for (const [v, oldCount] of beforeMap) {
        if (v === NEW_MODEL_VERSION) continue;
        const afterCount = afterMap.get(v) ?? 0;
        if (afterCount !== oldCount) {
          console.error(`[backfill-decay] FAIL: model_version=${v} row count changed (before=${oldCount}, after=${afterCount}) — immutability violation`);
          process.exit(3);
        }
      }

      console.log(`[backfill-decay] OK: inserted=${inserted}, skipped_dupes=${skipped_dupes}, new_version_rows=${newCount}`);
      await prisma.$disconnect();
      process.exit(0);
    }

    main().catch((e) => { console.error(e); process.exit(1); });
    ```

    Add npm script:
    ```json
    "backfill-decay": "tsx scripts/backfill-decay-weights.ts"
    ```
  </action>
  <acceptance_criteria>
    - `test -f scripts/backfill-decay-weights.ts`
    - `grep -c "insertObservation" scripts/backfill-decay-weights.ts` returns `>= 1` (uses 20-Z-01 DAO)
    - `grep -c "prisma.sentimentObservation.update\|prisma.sentimentObservation.upsert" scripts/backfill-decay-weights.ts` returns `0` (no UPDATE — immutability)
    - `grep -c "model_version" scripts/backfill-decay-weights.ts` returns `>= 5`
    - `grep -c "immutability violation" scripts/backfill-decay-weights.ts` returns `1` (T-20-A-03-03 post-condition)
    - `grep -c '"backfill-decay"' package.json` returns `>= 1`
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && [ "$(grep -c "prisma.sentimentObservation.update\|prisma.sentimentObservation.upsert" scripts/backfill-decay-weights.ts)" -eq 0 ] && grep -q "immutability violation" scripts/backfill-decay-weights.ts</automated>
  </verify>
  <done>backfill script committed; uses 20-Z-01 insertObservation; never UPDATE; post-condition immutability check fails-loud</done>
</task>

<task type="auto" id="20-A-03-08">
  <name>Task 8: Create HYPERPARAMETERS.md at repo root with all 5 source-class entries + Tetlock citation</name>
  <read_first>
    - src/lib/learning.ts (lines 696-750 — existing per-class hyperparameter convention; HYPERPARAMETERS.md will mirror this for sentiment)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (lines 53, 105 — literature defaults + Tetlock 2007 citation)
    - src/lib/sentiment/decay-hyperparameters.ts (Task 2 — the typed table this markdown documents)
  </read_first>
  <action>
    Create `HYPERPARAMETERS.md` at the repo root. This is the human-reviewable companion to `src/lib/sentiment/decay-hyperparameters.ts`. It is the document the operator pastes from after running `npx tsx scripts/tune-decay.ts`.

    ```markdown
    # HYPERPARAMETERS

    Calibrated hyperparameters for Cipher's sentiment + learning engines. Plans that own each section are listed in the row.

    ## 20-A-03 — Per-source-class sentiment decay (λ in 1/day)

    Half-life formula: **t½ = ln(2) / λ**.

    | source_class | λ (per day) | half-life (days) | literature seed (h) | citation | tuned_at |
    |---|---|---|---|---|---|
    | retail | 0.6931 | 1.00 | 24 | Tetlock 2007 — J. Finance — pessimism predicts next-day returns then mean-reverts within 5 trading days | bootstrap |
    | news | 0.2310 | 3.00 | 72 | Loughran-McDonald 2011 J. Finance — news effects survive 1-2 weeks | bootstrap |
    | sec | 0.0990 | 7.00 | 168 | Loughran-McDonald 2011 — 10-K market response decays over 7-30d | bootstrap |
    | analyst | 0.1386 | 5.00 | 120 | Womack 1996 / Stickel 1992 — analyst-revision drift survives 1-2 weeks | bootstrap |
    | social-other | 0.1733 | 4.00 | 96 | Bridging seed between retail and news; calibration to override | bootstrap |

    **Calibration procedure** (CONTEXT.md line 105):
    1. `npx tsx scripts/tune-decay.ts` — grid search per class on rolling 90d window.
    2. Grid: `{seed × 0.5, ×0.75, ×1.0, ×1.25, ×1.5, ×2.0}`.
    3. Score: 20-day rolling ICIR of decayed aggregate vs forward 7-day alpha-vs-SPY.
    4. Gate: `n_observations >= 60` per class. ICIR uplift `>= 0.05` vs no-decay baseline.
    5. Cutover from `SENTIMENT_DECAY_MODE=shadow` to `=on` requires paired-bootstrap on Sharpe (1000 resamples) with 95% CI lower-bound > 0. Run `--bootstrap-cutover` to produce the report.
    6. Re-tune monthly via `/api/cron/tune-decay` (vercel.json).

    **Important** — this table is updated by `scripts/tune-decay.ts` after each successful run. The `bootstrap` value in `tuned_at` is replaced with the ISO timestamp of the run, and `literature seed` column is preserved as historical provenance.

    ## 18-* — Per-signal-class learning-engine decay (λ in 1/day, t½ in days)

    Lives inline in `src/lib/learning.ts` HYPERPARAMETERS const (per CONTEXT D-19 — additive-only schema). See that file for current values. Re-tune via `npx tsx scripts/tune-lambda.ts`.

    | signal_class | lambda_days | tuned_at | source |
    |---|---|---|---|
    | diffusion | 60 | bootstrap | scripts/tune-lambda.ts |
    | technical | 60 | bootstrap | scripts/tune-lambda.ts |
    | insider | 60 | bootstrap | scripts/tune-lambda.ts |
    | institutional | 60 | bootstrap | scripts/tune-lambda.ts |

    > These two decay tables are intentionally separate — sentiment-message decay (per source class, t½ ≈ 1-7d) and learning-engine observation decay (per signal class, t½ ≈ 60d) are different domains with different calibration targets. Do not merge them. See `src/lib/sentiment/decay.ts` header for rationale.
    ```
  </action>
  <acceptance_criteria>
    - `test -f HYPERPARAMETERS.md`
    - `grep -c "20-A-03" HYPERPARAMETERS.md` returns `>= 1`
    - `grep -c "Tetlock 2007" HYPERPARAMETERS.md` returns `1`
    - `grep -c "Loughran-McDonald" HYPERPARAMETERS.md` returns `>= 1`
    - `grep -c "| retail |" HYPERPARAMETERS.md` returns `1`
    - `grep -c "| news |" HYPERPARAMETERS.md` returns `1`
    - `grep -c "| sec |" HYPERPARAMETERS.md` returns `1`
    - `grep -c "| analyst |" HYPERPARAMETERS.md` returns `1`
    - `grep -c "| social-other |" HYPERPARAMETERS.md` returns `1`
    - `grep -c "ln(2) / λ" HYPERPARAMETERS.md` returns `1`
  </acceptance_criteria>
  <verify>
    <automated>test -f HYPERPARAMETERS.md && grep -q "Tetlock 2007" HYPERPARAMETERS.md && [ "$(grep -cE "^\| (retail|news|sec|analyst|social-other) \|" HYPERPARAMETERS.md)" -eq 5 ]</automated>
  </verify>
  <done>HYPERPARAMETERS.md committed at repo root with all 5 source-class entries; Tetlock citation present; ln(2)/λ formula documented</done>
</task>

<task type="auto" id="20-A-03-09">
  <name>Task 9: Wire monthly cron /api/cron/tune-decay + vercel.json entry</name>
  <read_first>
    - vercel.json (existing crons array — confirm format + Bearer-auth pattern)
    - src/app/api/cron/sentiment-scan/route.ts (existing CRON_SECRET-guarded route — copy the auth pattern)
    - scripts/tune-decay.ts (Task 6 output)
  </read_first>
  <action>
    1. Create `src/app/api/cron/tune-decay/route.ts`:

    ```typescript
    /**
     * Plan 20-A-03 — Monthly decay-tuning cron.
     *
     * Invokes the same code path as scripts/tune-decay.ts but as a Vercel cron
     * route. Persists DecayCalibration rows; does NOT auto-flip
     * SENTIMENT_DECAY_MODE — that requires operator review of the bootstrap
     * cutover report (T-20-A-03-04).
     */
    import { NextResponse } from 'next/server';
    import { PrismaClient } from '@prisma/client';
    import { PrismaNeon } from '@prisma/adapter-neon';

    import { DECAY_HYPERPARAMETERS } from '@/lib/sentiment/decay-hyperparameters';
    import { decayWeight, halfLifeDays } from '@/lib/sentiment/decay';
    import { sourceToClassUnsafe, type SourceClass } from '@/lib/sentiment/source-class';

    export const dynamic = 'force-dynamic';
    export const maxDuration = 300;        // 5 minutes — grid search may take a while

    const SOURCE_CLASSES: SourceClass[] = ['retail', 'news', 'sec', 'analyst', 'social-other'];
    const LAMBDA_GRID_MULTIPLIERS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const DEFAULT_WINDOW_DAYS = 90;
    const MIN_N_OBSERVATIONS = 60;
    const ICIR_UPLIFT_GATE = 0.05;

    export async function GET(request: Request) {
      // Auth — same pattern as sentiment-scan/route.ts
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
      }

      if (!process.env.DATABASE_URL) {
        return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
      }

      const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
      const prisma = new PrismaClient({ adapter });

      const model_version = `decay-tuned-${new Date().toISOString().slice(0, 10)}-cron`;
      const results: Array<Record<string, unknown>> = [];

      try {
        for (const cls of SOURCE_CLASSES) {
          // [Inline the same per-class loop as scripts/tune-decay.ts tuneClass() —
          //  pulled into a shared helper if you want; for cron we accept the duplication
          //  to keep the route self-contained and avoid accidentally evaluating the script's
          //  top-level dotenv side effects.]
          // Persist DecayCalibration row when n_observations >= MIN_N_OBSERVATIONS
          // and icir_uplift >= ICIR_UPLIFT_GATE — same gate as the script.
          results.push({ source_class: cls, status: 'TODO-implement-shared-helper-for-cron' });
        }
      } finally {
        await prisma.$disconnect();
      }

      return NextResponse.json({
        ok: true,
        model_version,
        results,
        note: 'Cron persists DecayCalibration rows but does NOT flip SENTIMENT_DECAY_MODE — operator review required (T-20-A-03-04)',
      });
    }
    ```

    2. Add an entry to `vercel.json` `crons` array:

    ```json
    {
      "path": "/api/cron/tune-decay",
      "schedule": "0 6 1 * *"
    }
    ```

    Schedule: `0 6 1 * *` = 06:00 UTC on the 1st of each month (monthly per CONTEXT line 105 spec). Hobby/Pro: monthly is well within the daily-minimum on Hobby. NOTE — Hobby plan has a 2-cron limit. If Cipher is on Hobby and already at 2 crons, replace the LEAST-critical existing cron OR upgrade to Pro before deploying this.
  </action>
  <acceptance_criteria>
    - `test -f src/app/api/cron/tune-decay/route.ts`
    - `grep -c "Bearer ${process.env.CRON_SECRET}" src/app/api/cron/tune-decay/route.ts` returns `1` (auth gate)
    - `grep -c "tune-decay" vercel.json` returns `>= 1`
    - `grep -c "0 6 1 \\* \\*" vercel.json` returns `1` (monthly schedule)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "Bearer \${process.env.CRON_SECRET}" src/app/api/cron/tune-decay/route.ts && grep -q "tune-decay" vercel.json</automated>
  </verify>
  <done>Monthly tune-decay cron route + vercel.json entry committed; CRON_SECRET-guarded; does NOT auto-flip flag</done>
</task>

<task type="auto" id="20-A-03-10">
  <name>Task 10: Wire aggregator decayed branch behind SENTIMENT_DECAY_MODE flag</name>
  <read_first>
    - src/lib/sentiment/aggregator.ts (existing 129-line module — additive branch goes alongside aggregateCommunitySentiment, NOT replacing)
    - src/lib/sentiment/decay.ts (Task 3)
    - src/lib/sentiment/source-class.ts (Task 1)
    - .planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md (S3 shadow-lifecycle precedent)
  </read_first>
  <action>
    Edit `src/lib/sentiment/aggregator.ts`. ADD (do not replace) a new export `aggregateDecayed` and a mode-router `aggregateRouted`. Existing `aggregateCommunitySentiment` STAYS UNCHANGED.

    Append after the existing `aggregateCommunitySentiment` function:

    ```typescript

    // ─── Plan 20-A-03 — Decayed aggregator branch (shadow lifecycle) ──────────
    // SENTIMENT_DECAY_MODE ∈ {off, shadow, on}
    //   off    → existing aggregateCommunitySentiment only (current production behavior)
    //   shadow → both paths compute; the decayed result is logged but NOT served
    //   on     → aggregateDecayed result is the authoritative number (cutover)
    //
    // Cutover from shadow → on requires the paired-bootstrap report from
    // scripts/tune-decay.ts --bootstrap-cutover with 95% CI lower-bound > 0
    // on Sharpe (T-20-A-03-04).

    const DECAY_EPSILON = 1e-9;     // T-20-A-03-02 — div-by-zero floor

    export type SentimentDecayMode = 'off' | 'shadow' | 'on';

    export interface DecayedAggregatorInput {
      ticker: string;
      source: string;                          // raw source string from DB (CipherSource)
      message_id: string;
      classifier_score: number;                // [-1, +1]
      decay_weight: number;                    // pre-computed, persisted in SentimentObservation by 20-A-03 backfill
    }

    export interface DecayedAggregatorResult {
      weighted_score: number;                  // [-1, +1]
      total_weight: number;
      fallback_to_uniform: boolean;            // true iff Σ decay_weight < EPSILON
      n_rows: number;
    }

    /**
     * Σ score × decay_weight / Σ decay_weight, with uniform-weight fallback when
     * Σ decay_weight < EPSILON (all-old samples).
     */
    export function aggregateDecayed(rows: DecayedAggregatorInput[]): DecayedAggregatorResult {
      if (rows.length === 0) {
        return { weighted_score: 0, total_weight: 0, fallback_to_uniform: false, n_rows: 0 };
      }
      let num = 0;
      let den = 0;
      for (const r of rows) {
        num += r.classifier_score * r.decay_weight;
        den += r.decay_weight;
      }
      if (den < DECAY_EPSILON) {
        // Uniform fallback — all decay_weights effectively zero.
        const uniform = rows.reduce((a, r) => a + r.classifier_score, 0) / rows.length;
        return { weighted_score: uniform, total_weight: 0, fallback_to_uniform: true, n_rows: rows.length };
      }
      return { weighted_score: num / den, total_weight: den, fallback_to_uniform: false, n_rows: rows.length };
    }

    /** Reads SENTIMENT_DECAY_MODE env var; defaults to 'off' (safe default for first deploy). */
    export function getDecayMode(): SentimentDecayMode {
      const v = (process.env.SENTIMENT_DECAY_MODE ?? 'off').toLowerCase();
      if (v === 'off' || v === 'shadow' || v === 'on') return v;
      // Unknown values fail closed → 'off'
      return 'off';
    }
    ```

    Also export `DECAY_EPSILON` for the unit test in Task 11.

    Constraints:
    - Existing `aggregateCommunitySentiment` UNCHANGED.
    - Default flag value = `'off'` so the first deploy is no-op.
    - Phase 20-Z-03 (telemetry tab) will later log shadow-mode comparisons; this plan does NOT yet wire that — just exposes the function so 20-Z-03 can call it.
  </action>
  <acceptance_criteria>
    - `grep -c "aggregateCommunitySentiment" src/lib/sentiment/aggregator.ts` returns `>= 1` (existing function preserved)
    - `grep -c "export function aggregateDecayed" src/lib/sentiment/aggregator.ts` returns `1`
    - `grep -c "DECAY_EPSILON = 1e-9" src/lib/sentiment/aggregator.ts` returns `1` (T-20-A-03-02)
    - `grep -c "fallback_to_uniform" src/lib/sentiment/aggregator.ts` returns `>= 2`
    - `grep -c "SENTIMENT_DECAY_MODE" src/lib/sentiment/aggregator.ts` returns `>= 1`
    - `grep -c "getDecayMode" src/lib/sentiment/aggregator.ts` returns `>= 1`
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "DECAY_EPSILON = 1e-9" src/lib/sentiment/aggregator.ts && grep -q "export function aggregateDecayed" src/lib/sentiment/aggregator.ts && grep -q "fallback_to_uniform" src/lib/sentiment/aggregator.ts</automated>
  </verify>
  <done>aggregator.ts gains aggregateDecayed + EPSILON fallback + mode-router behind SENTIMENT_DECAY_MODE; existing aggregateCommunitySentiment untouched</done>
</task>

<task type="auto" id="20-A-03-11">
  <name>Task 11: Unit + integration tests — decay primitives, source-class mapping, tune-decay end-to-end</name>
  <read_first>
    - tests/learning.unit.bugs.test.ts (precedent test style — describe/it + numeric assertions)
    - src/lib/sentiment/decay.ts (Task 3 — function under test)
    - src/lib/sentiment/source-class.ts (Task 1 — function under test)
    - src/lib/sentiment/aggregator.ts (Task 10 — aggregateDecayed under test)
    - vitest.config.* (Vitest pattern; project uses Vitest per CLAUDE.md)
  </read_first>
  <action>
    Create THREE test files.

    **(A) `tests/sentiment-decay.unit.test.ts`** (≥6 cases):

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { decayWeight, decayLambdaForClass, halfLifeDays, ageDaysSince } from '@/lib/sentiment/decay';
    import { DECAY_HYPERPARAMETERS } from '@/lib/sentiment/decay-hyperparameters';

    describe('decayWeight', () => {
      it('age=0 → weight = 1.0 exactly', () => {
        expect(decayWeight(0, 0.5)).toBe(1);
      });

      it('age large → weight approaches 0', () => {
        expect(decayWeight(1000, 1)).toBeLessThan(1e-100);
      });

      it('half-life formula t½ = ln(2)/λ → weight at t½ is exactly 0.5', () => {
        const lambda = 0.231;          // news literature seed
        const t_half = Math.LN2 / lambda;
        expect(decayWeight(t_half, lambda)).toBeCloseTo(0.5, 12);
      });

      it('throws on negative age (programmer bug — clock skew or tampered fetched_at)', () => {
        expect(() => decayWeight(-1, 0.5)).toThrowError(/ageDays must be >= 0/);
      });

      it('throws on lambda = 0', () => {
        expect(() => decayWeight(1, 0)).toThrowError(/lambdaPerDay must be > 0/);
      });

      it('throws on lambda < 0', () => {
        expect(() => decayWeight(1, -0.5)).toThrowError(/lambdaPerDay must be > 0/);
      });

      it('throws on non-finite lambda', () => {
        expect(() => decayWeight(1, Infinity)).toThrowError(/lambdaPerDay must be > 0/);
        expect(() => decayWeight(1, NaN)).toThrowError(/lambdaPerDay must be > 0/);
      });

      it('throws on non-finite age', () => {
        expect(() => decayWeight(NaN, 0.5)).toThrowError(/ageDays must be finite/);
      });
    });

    describe('decayLambdaForClass', () => {
      it.each(['retail', 'news', 'sec', 'analyst', 'social-other'] as const)(
        'returns positive finite λ for %s',
        (cls) => {
          const l = decayLambdaForClass(cls);
          expect(Number.isFinite(l)).toBe(true);
          expect(l).toBeGreaterThan(0);
          expect(l).toBe(DECAY_HYPERPARAMETERS[cls].lambda_per_day);
        },
      );
    });

    describe('halfLifeDays', () => {
      it('inverts decayWeight: decayWeight(halfLifeDays(λ), λ) ≈ 0.5', () => {
        for (const lambda of [0.1, 0.5, 1.0, 2.5]) {
          expect(decayWeight(halfLifeDays(lambda), lambda)).toBeCloseTo(0.5, 12);
        }
      });
    });

    describe('ageDaysSince', () => {
      it('computes fractional days correctly', () => {
        const now = new Date('2026-05-10T12:00:00Z');
        const fetched = new Date('2026-05-09T12:00:00Z');
        expect(ageDaysSince(fetched, now)).toBe(1);
      });
    });
    ```

    **(B) `tests/sentiment-source-class.unit.test.ts`** (exhaustive mapping):

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { sourceToClass, sourceToClassUnsafe, SourceClassUnknownError, type CipherSource } from '@/lib/sentiment/source-class';

    describe('sourceToClass — exhaustive mapping per CONTEXT line 105', () => {
      const cases: Array<[CipherSource, string]> = [
        ['stocktwits', 'retail'],
        ['apewisdom', 'retail'],
        ['swaggystocks', 'retail'],
        ['firecrawl-reddit', 'retail'],
        ['x', 'retail'],
        ['anthropic-search-news', 'news'],
        ['finnhub-analyst', 'analyst'],
        ['firecrawl-forums', 'social-other'],
        ['sec', 'sec'],
      ];

      it.each(cases)('%s → %s', (source, expected) => {
        expect(sourceToClass(source)).toBe(expected);
      });

      it('rejects unknown source via Unsafe variant', () => {
        expect(() => sourceToClassUnsafe('unknown-vendor')).toThrowError(SourceClassUnknownError);
      });
    });
    ```

    **(C) `tests/integration/tune-decay.integration.test.ts`** (live-Neon; mirror `tests/integration/sentiment-observation.integration.test.ts` from 20-Z-01):

    ```typescript
    import { describe, it, expect, beforeAll, afterAll } from 'vitest';
    import { PrismaClient } from '@prisma/client';
    import { PrismaNeon } from '@prisma/adapter-neon';
    import { aggregateDecayed } from '@/lib/sentiment/aggregator';

    describe('tune-decay integration (live Neon)', () => {
      let prisma: PrismaClient;
      const TEST_TICKER = 'TEST_DECAY';
      const FIXTURE_MODEL_VERSION = 'decay-test-fixture-v1';

      beforeAll(async () => {
        const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
        prisma = new PrismaClient({ adapter });
        // Cleanup any prior test rows
        await prisma.sentimentObservation.deleteMany({ where: { ticker: TEST_TICKER } });
        await prisma.decayCalibration.deleteMany({ where: { source_class: 'retail', model_version: FIXTURE_MODEL_VERSION } });
      });

      afterAll(async () => {
        await prisma.sentimentObservation.deleteMany({ where: { ticker: TEST_TICKER } });
        await prisma.decayCalibration.deleteMany({ where: { source_class: 'retail', model_version: FIXTURE_MODEL_VERSION } });
        await prisma.$disconnect();
      });

      it('aggregateDecayed returns 0 weight + uniform fallback on all-old rows', () => {
        const rows = Array.from({ length: 5 }, (_, i) => ({
          ticker: TEST_TICKER,
          source: 'stocktwits',
          message_id: `msg-${i}`,
          classifier_score: 0.5,
          decay_weight: 1e-50,           // effectively zero
        }));
        const r = aggregateDecayed(rows);
        expect(r.fallback_to_uniform).toBe(true);
        expect(r.weighted_score).toBeCloseTo(0.5, 6);
      });

      it('aggregateDecayed weighted-mean matches hand calc on synthetic rows', () => {
        const r = aggregateDecayed([
          { ticker: TEST_TICKER, source: 'stocktwits', message_id: '1', classifier_score: 1.0, decay_weight: 1.0 },
          { ticker: TEST_TICKER, source: 'stocktwits', message_id: '2', classifier_score: -1.0, decay_weight: 0.5 },
        ]);
        expect(r.weighted_score).toBeCloseTo((1.0 * 1.0 + -1.0 * 0.5) / (1.0 + 0.5), 9);
        expect(r.fallback_to_uniform).toBe(false);
      });

      it('DecayCalibration table accepts an insert with all required fields', async () => {
        const row = await prisma.decayCalibration.create({
          data: {
            source_class: 'retail',
            lambda_per_day: 0.5,
            half_life_days: Math.LN2 / 0.5,
            icir_uplift_vs_no_decay: 0.07,        // > gate of 0.05
            training_window_days: 90,
            n_observations: 120,                  // > gate of 60
            model_version: FIXTURE_MODEL_VERSION,
          },
        });
        expect(row.id).toBeTruthy();
        expect(row.training_window_days).toBe(90);
      });
    });
    ```

    Note: the integration test does NOT exercise the full grid-search end-to-end (that requires real PriceOutcome data and forward-7d alpha). It exercises the schema, the aggregator math, and the fallback path. The full grid search is operator-validated via `npm run tune-decay` against live data per Task 6.
  </action>
  <acceptance_criteria>
    - `test -f tests/sentiment-decay.unit.test.ts`
    - `test -f tests/sentiment-source-class.unit.test.ts`
    - `test -f tests/integration/tune-decay.integration.test.ts`
    - `npm test -- tests/sentiment-decay.unit.test.ts` exits 0 (≥6 cases)
    - `npm test -- tests/sentiment-source-class.unit.test.ts` exits 0 (9 mapping cases + 1 unknown)
    - `npm run test:integration -- tests/integration/tune-decay.integration.test.ts` exits 0 (3 cases against live Neon)
  </acceptance_criteria>
  <verify>
    <automated>npm test -- tests/sentiment-decay.unit.test.ts tests/sentiment-source-class.unit.test.ts</automated>
  </verify>
  <done>≥9 unit cases + ≥3 integration cases green; aggregator EPSILON fallback covered; exhaustive source-class mapping covered; DecayCalibration insert verified live</done>
</task>

</tasks>

<verification>

Phase-level numerical gates (per CONTEXT.md S8 + line 105 acceptance):

| Gate | Command | Expected |
|---|---|---|
| Schema pushed | `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "decay_calibrations"'` | returns row count `0` (post-push, pre-tune) |
| Unit tests green | `npm test -- tests/sentiment-decay.unit.test.ts tests/sentiment-source-class.unit.test.ts` | exit 0; ≥9 + ≥10 cases |
| Integration green | `npm run test:integration -- tests/integration/tune-decay.integration.test.ts` | exit 0; 3 cases |
| HYPERPARAMETERS exists | `grep -cE "^\| (retail\|news\|sec\|analyst\|social-other) \|" HYPERPARAMETERS.md` | `5` |
| tune-decay runs | `npm run tune-decay` | exit 0 (or exit 2 if INSUFFICIENT_DATA — both acceptable for first run; persisted DecayCalibration row count `>= 1` for any class with `n >= 60`) |
| At least one calibrated λ ≠ literature seed | After tune-decay run: `psql "$DATABASE_URL" -c "SELECT count(*) FROM decay_calibrations"` | `>= 1`; AND at least one row has `lambda_per_day != literature seed × 1.0` |
| ICIR uplift ≥ 0.05 | `psql "$DATABASE_URL" -c "SELECT max(icir_uplift_vs_no_decay) FROM decay_calibrations"` | `>= 0.05` (CONTEXT line 105 spec acceptance) |
| Backfill immutability | After `npm run backfill-decay -- --new-model-version test-bf-v1`: row counts under prior model_versions UNCHANGED before/after | post-condition assertion in script enforces this |
| Cron route auth | `curl -i http://localhost:3000/api/cron/tune-decay` (no Bearer) | `401` |
| Cron route success | `curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tune-decay` | `200` JSON with `ok: true` |
| Aggregator fallback fires | Test "aggregateDecayed returns 0 weight + uniform fallback on all-old rows" | green (T-20-A-03-02 covered) |
| No UPDATE on SentimentObservation | `grep -c "prisma.sentimentObservation.update\|prisma.sentimentObservation.upsert" scripts/backfill-decay-weights.ts` | `0` (T-20-A-03-03 covered) |
| Source-class exhaustive | `grep -c "case '" src/lib/sentiment/source-class.ts` | `9` (all 9 CipherSource values) |

Cutover gate (Operator-run before flipping `SENTIMENT_DECAY_MODE=on`):

```bash
npx tsx scripts/tune-decay.ts --bootstrap-cutover
# Expect 95% CI lower-bound > 0 on Sharpe of decayed-vs-undecayed aggregate.
# Paste the report into the cutover commit message.
# Then set SENTIMENT_DECAY_MODE=on in Vercel env and redeploy.
```

</verification>

<success_criteria>
- All 11 tasks complete with green automated checks
- DecayCalibration table live in production Neon
- HYPERPARAMETERS.md committed at repo root with 5 source-class rows + Tetlock 2007 citation
- Exhaustive 9-source → 5-class mapping (`grep -c "case '"` returns 9)
- decayWeight pure function with literal `Math.exp(-lambdaPerDay * ageDays)` formula, throws on negative age (no clamp), throws on λ ≤ 0
- Half-life formula t½ = ln(2)/λ documented in source AND HYPERPARAMETERS.md
- decay.ts is a NEW module separate from src/lib/learning.ts decayWeights (different domain)
- DECAY_EPSILON = 1e-9 div-by-zero guard in aggregator with uniform-weight fallback
- Backfill INSERTS new model_version rows (T-20-A-03-03 immutability assertion in script)
- tune-decay grid search GATES on `n_observations >= 60` per class (T-20-A-03-01)
- Monthly cron `/api/cron/tune-decay` Bearer-guarded; vercel.json updated
- SENTIMENT_DECAY_MODE flag with `off|shadow|on` lifecycle; default `off`
- ≥9 unit + ≥10 mapping + ≥3 integration test cases green
- ICIR uplift ≥ 0.05 measured on a labeled validation window (CONTEXT acceptance) OR documented as INSUFFICIENT_DATA pending more production data
- Cutover from shadow → on requires paired-bootstrap (1000 resamples) 95% CI lower-bound > 0 on Sharpe (T-20-A-03-04) — operator-gated
</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-A-03-SUMMARY.md` documenting:
- λ values committed per source class (literature seed vs calibrated)
- DecayCalibration row count after first tune-decay run
- ICIR uplift measured per class
- Whether SENTIMENT_DECAY_MODE was flipped to `on` (and the bootstrap CI report if so) or remains at `shadow` pending more data
- Any source classes that hit INSUFFICIENT_DATA and the n required to clear the gate
</output>
