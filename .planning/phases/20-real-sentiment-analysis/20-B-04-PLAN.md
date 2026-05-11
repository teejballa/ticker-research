---
phase: 20
plan: 20-B-04
wave: B
type: execute
depends_on: ['20-Z-01', '20-C-01']
files_modified:
  - prisma/schema.prisma
  - src/lib/sentiment/source-tier.ts
  - src/lib/sentiment/source-tier-hyperparameters.ts
  - scripts/recompute-source-tiers.ts
  - src/app/api/cron/source-tier-recompute/route.ts
  - src/lib/sentiment/aggregator.ts
  - src/components/ResearchReport.tsx
  - HYPERPARAMETERS.md
  - vercel.json
  - tests/sentiment-source-tier.unit.test.ts
  - tests/integration/source-tier-recompute.integration.test.ts
  - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-source-tier.md
  - .github/workflows/no-hand-curated-tier-weights.yml
autonomous: true
requirements: []
shadow_required: true
shadow_skip_reason: ""
hard_cleanup_gate: true
must_haves:
  truths:
    - "SourceTier Prisma model persists every monthly recompute as an append-only history (id, source_id, computed_at, mean_ic_90d, weight, n_observations, validation_window_days, model_version) with composite index on (source_id, computed_at DESC) — old rows are NEVER updated"
    - "softmaxWithCaps(values, cap_min=0.5, cap_max=5.0) is a PURE function: standard exp/sum-exp normalization (numerically stable via max-subtract) followed by element-wise clamp to [cap_min, cap_max]; the function MUST document inline that clamped softmax is no longer a probability distribution but a bounded weighting"
    - "Cap bounds [0.5, 5.0] are CONFIGURABLE via SOURCE_TIER_CAP_MIN / SOURCE_TIER_CAP_MAX in src/lib/sentiment/source-tier-hyperparameters.ts (Zod-validated at module load per 19-A-01 precedent) and reflected in HYPERPARAMETERS.md — NO inline literal in source-tier.ts beyond the default-argument fallback"
    - "computeSourceWeights({source_id, mean_ic_90d, n_observations}[]) returns {source_id, weight}[] where: (a) sources with n_observations < N_MIN_OBS (default 30) OR mean_ic_90d == null receive weight = 1.0 verbatim (NOT softmaxed); (b) the softmaxWithCaps step runs ONLY over sources with n_observations >= N_MIN_OBS AND non-null mean_ic_90d"
    - "getWeightForSource(source_id, asOf) reads the LATEST SourceTier row with computed_at <= asOf for that source_id; returns 1.0 default when no row exists yet (cold-start fallback) — NEVER throws on missing row"
    - "scripts/recompute-source-tiers.ts reads per-source IC from PerSourceIC table (owned by 20-C-01) via a thin read-only adapter; if the PerSourceIC table is empty (20-C-01 not yet shipped or no data) the script exits 0 with diagnostic 'PerSourceIC table empty — defaulting all weights to 1.0', writes ZERO SourceTier rows, and aggregator continues with default weights"
    - "Aggregator weighted-mean multiplies each component's existing mention-count weight by SourceTier.weight; missing SourceTier row → multiplier = 1.0 (cold start); flag SOURCE_TIER_MODE ∈ {off|shadow|on} controls whether the tier multiplier is applied to the authoritative aggregate (off) or only to a shadow-comparison column (shadow) or to both (on)"
    - "Cutover from shadow→on requires (a) ≥30 days of SourceTier history per source AND (b) paired-bootstrap on validation Sharpe of tier-weighted vs unweighted aggregate with 95% CI lower-bound > 0 (1000 resamples)"
    - "UI: SentimentIntelligenceCard per-source breakdown row shows tier weight with format 'wt: X.XX' next to existing 'n=N' label — only when tier weight differs from 1.0 by ≥ 0.01 (avoids visual noise on cold-start sources)"
    - "MODEL-CARD-source-tier.md committed at .planning/phases/20-real-sentiment-analysis/ — Mitchell 2019 format covering training data (per-source IC from 20-C-01), evaluation metrics (Sharpe uplift, Brier delta), intended use, OOD behavior (new sources), known failure modes (single-source dominance at cap=5.0), retrain cadence (monthly cron)"
    - "Monthly cron /api/cron/source-tier-recompute at schedule '0 7 1 * *' (1st of month, 07:00 UTC — 1h after 20-A-03 tune-decay to avoid simultaneous Neon load)"
    - "CI grep guard: .github/workflows/no-hand-curated-tier-weights.yml runs `grep -RE 'SOURCE_WEIGHT_OVERRIDE|HARD_CODED_TIER|HAND_CURATED_TIER' src/ tests/ scripts/ || true` and fails the workflow if matches > 0 (ensures S1 — no hand-picked weights snuck in via env override)"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "SourceTier append-only history model with composite index on (source_id, computed_at DESC)"
      contains: "model SourceTier"
    - path: "src/lib/sentiment/source-tier.ts"
      provides: "softmaxWithCaps + computeSourceWeights + getWeightForSource — all pure except getWeightForSource (DB read)"
      contains: "softmaxWithCaps"
    - path: "src/lib/sentiment/source-tier-hyperparameters.ts"
      provides: "Typed const config (cap_min, cap_max, n_min_observations, validation_window_days) with Zod module-load validation"
      contains: "SOURCE_TIER_HYPERPARAMETERS"
    - path: "scripts/recompute-source-tiers.ts"
      provides: "Monthly recompute job — reads PerSourceIC (20-C-01), runs computeSourceWeights, persists SourceTier rows, exits 0 on empty IC table"
      contains: "PerSourceIC table empty"
    - path: "src/app/api/cron/source-tier-recompute/route.ts"
      provides: "Cron entrypoint with Bearer ${process.env.CRON_SECRET} guard, invokes the script's exported runRecompute()"
      contains: "Bearer ${process.env.CRON_SECRET}"
    - path: "src/lib/sentiment/aggregator.ts"
      provides: "Aggregator integration — SOURCE_TIER_MODE flag gates the tier multiplier; preserves existing aggregateCommunitySentiment signature"
      contains: "SOURCE_TIER_MODE"
    - path: "src/components/ResearchReport.tsx"
      provides: "Per-source weight 'wt: X.XX' label in SentimentIntelligenceCard breakdown"
      contains: "wt:"
    - path: "HYPERPARAMETERS.md"
      provides: "Documents cap_min, cap_max, n_min_observations defaults + cron cadence — Phase 20-B-04 entry"
      contains: "20-B-04"
    - path: "vercel.json"
      provides: "Monthly cron entry for /api/cron/source-tier-recompute"
      contains: "source-tier-recompute"
    - path: "tests/sentiment-source-tier.unit.test.ts"
      provides: "≥10 unit cases covering softmax ordering, cap clamping, n<30 fallback, null IC fallback, getWeightForSource cold-start"
    - path: "tests/integration/source-tier-recompute.integration.test.ts"
      provides: "End-to-end with mock PerSourceIC fixture: rows written; weights applied in aggregator; UI snapshot shows 'wt:' label"
    - path: ".planning/phases/20-real-sentiment-analysis/MODEL-CARD-source-tier.md"
      provides: "Mitchell-2019 model card stub per 20-Z-02 — full fields populated"
    - path: ".github/workflows/no-hand-curated-tier-weights.yml"
      provides: "CI grep guard fails build on SOURCE_WEIGHT_OVERRIDE / HARD_CODED_TIER / HAND_CURATED_TIER token presence"
  key_links:
    - from: "src/lib/sentiment/aggregator.ts (tier-weighted branch)"
      to: "getWeightForSource() from src/lib/sentiment/source-tier.ts via SourceTier.weight column"
      via: "weighted aggregate Σ score × mention_weight × tier_weight / Σ (mention_weight × tier_weight)"
      pattern: "getWeightForSource"
    - from: "scripts/recompute-source-tiers.ts"
      to: "20-C-01 PerSourceIC read adapter (read-only)"
      via: "thin SELECT mean_ic_90d, n_observations FROM per_source_ic — gracefully empty"
      pattern: "PerSourceIC"
    - from: "src/app/api/cron/source-tier-recompute/route.ts"
      to: "vercel.json crons entry '0 7 1 * *'"
      via: "Vercel monthly cron schedule"
      pattern: "source-tier-recompute"
    - from: ".github/workflows/no-hand-curated-tier-weights.yml"
      to: "Phase 20 cross-cutting standard S1 (no hand-picked parameters)"
      via: "CI guard — fails on SOURCE_WEIGHT_OVERRIDE / HARD_CODED_TIER tokens in repo source"
      pattern: "no-hand-curated-tier-weights"
---

# Plan 20-B-04: Source-tier weighting (data-driven, capped softmax of per-source IC)

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE blocking step: `npx prisma db push` of the new `SourceTier` model against live Neon (Task 2). All other tasks are autonomous. After the operator confirms the push, the remaining tasks (pure-function module, hyperparameter config, recompute script, cron route, aggregator integration behind `off|shadow|on` flag, UI label, model card, CI grep guard, tests) proceed without further prompts. The cutover from shadow→on is operator-gated by the Hard Cleanup Gate criterion below — this plan SHIPS the data-driven weighting infrastructure, not the cutover decision.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. `SOURCE_TIER_MODE` flag introduced with three values `off | shadow | on`. Plan ships at `shadow` by default; cutover to `on` requires gate (4) below.
2. No old code deleted — the existing mention-count-only weighting in `aggregator.ts` remains alive while flag is `shadow`; tier multiplier is layered on top, not swapped in.
3. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), `npm run test:e2e` (Playwright) all green on `main` post-commit.
4. **Cutover Gate** (CONTEXT.md spec verbatim — "≥30d of IC data + monotonic improvement on validation Sharpe"):
   - (a) `SELECT MIN(computed_at) FROM source_tiers` is ≥30 days before today AND
   - (b) Paired-bootstrap on validation-window Sharpe of tier-weighted vs unweighted aggregate returns 95% CI lower-bound > 0 over 1000 resamples
   - Operator runs `npx tsx scripts/recompute-source-tiers.ts --bootstrap-cutover` to produce the report; then sets `SOURCE_TIER_MODE=on` in Vercel prod env and redeploys.
5. **Schema Push Gate** (Task 2): `npx prisma db push` succeeded against live `DATABASE_URL` AND the integration test writes ≥1 `SourceTier` row in a single recompute invocation against the mock PerSourceIC fixture.
6. **No-Hand-Curated Gate** (S1 enforcement): `grep -REc 'SOURCE_WEIGHT_OVERRIDE|HARD_CODED_TIER|HAND_CURATED_TIER' src/ tests/ scripts/` returns 0 AND the `.github/workflows/no-hand-curated-tier-weights.yml` workflow exists and is wired to PR triggers.
7. **Bounds Gate**: every persisted `SourceTier.weight` value is in `[cap_min, cap_max]` (default `[0.5, 5.0]`); integration test asserts `SELECT COUNT(*) FROM source_tiers WHERE weight < 0.5 OR weight > 5.0` returns 0.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — CORE INVARIANT. Source weights are computed from per-source rolling-90d IC (data) via a documented capped-softmax procedure. Cap bounds and `n_min_observations` ARE configurable hyperparameters but are seeded from the spec and reviewed monthly via the model card. The CI grep guard at `.github/workflows/no-hand-curated-tier-weights.yml` fails the build if any commit introduces `SOURCE_WEIGHT_OVERRIDE` / `HARD_CODED_TIER` / `HAND_CURATED_TIER` tokens (no override mechanism allowed).
- **S3 (per-plan shadow lifecycle)** — `SOURCE_TIER_MODE` flag (`off | shadow | on`). Off → shadow (compute tier multiplier, persist alongside unweighted in `ProviderCallLog` 20-Z-03 / `ShadowComparison` table) → on (aggregator multiplies by tier weight). Verdict for shadow→on is the numerical Cutover Gate above.
- **S4 (model card)** — `MODEL-CARD-source-tier.md` ships in this plan (Task 9), Mitchell 2019 format, references 20-Z-02 template. Retrain cadence: monthly cron. Known failure modes: single-source dominance at cap=5.0; new-source cold-start at weight=1.0 with no signal.
- **S7 (threat model)** — Five plan-level threats T-20-B-04-{01..05}; threat 04 maps to phase catalog T-28-001 (manipulation defense via cap=5.0 ceiling); threat 03 is the explicit graceful-degradation pact with 20-C-01.
- **S8 (numerical acceptance)** — every DONE criterion is a grep / SELECT / test exit / numeric assertion. Bootstrap CI lower-bound > 0; cap bounds [0.5, 5.0]; n_min_observations = 30; cron schedule '0 7 1 * *'; row counts ≥6 after first prod run; weight diff threshold 0.01 for UI display.

## Cross-wave dependency on 20-C-01 (CRITICAL — read carefully)

This plan is in Wave B but `depends_on: ['20-Z-01', '20-C-01']`. **20-C-01 is in Wave C.** This is intentional and the wave structure must accommodate it:

- 20-Z-01 (Wave Z) ships the immutable observation store this plan reads via 20-C-01.
- 20-C-01 (Wave C) ships the per-source rolling-90d IC computation. Until 20-C-01 lands, the `PerSourceIC` table does not exist or is empty.
- This plan SHIPS the infrastructure to consume PerSourceIC — schema, pure functions, recompute script, cron route, aggregator integration, UI label, CI guard, tests — but the recompute script gracefully exits 0 with diagnostic when PerSourceIC is empty (T-20-B-04-03 mitigation), and the aggregator falls back to default weight=1.0 per source.
- **Wave-ordering implication**: this plan can MERGE before 20-C-01 (the schema, code, cron, UI, model card, and CI guard are all valuable on their own and don't break anything), but the `SOURCE_TIER_MODE=on` cutover (Hard Cleanup Gate criterion 4) is BLOCKED until 20-C-01 ships AND has accumulated ≥30 days of IC history. Plan ships at `shadow` until then.
- This is a deliberate decoupling: the operator can verify the schema, recompute path, and cron wiring against the empty-PerSourceIC fallback before 20-C-01 ships, then graduate to `on` once 20-C-01 has been live long enough.

</universal_preamble>

<objective>
Replace any hand-curated source-weighting table with a data-driven `SourceTier` weight per source, computed monthly as `softmaxWithCaps(mean_IC_per_source, cap_min=0.5, cap_max=5.0)` so that no source is fully suppressed (floor 0.5) or fully dominant (ceiling 5.0). Sources with fewer than 30 days of measured IC default to weight 1.0 (cold start). The recompute reads per-source rolling-90d IC against forward 7d alpha-vs-SPY produced by 20-C-01; if 20-C-01 hasn't shipped or has no data yet, the script exits cleanly and the aggregator continues with default weights. Tier weights are surfaced in the per-source UI breakdown so users can see WHY a source's contribution was up- or down-weighted.

Purpose: CONTEXT.md spec §20-B-04 requires that source-tier weights be data-driven, not hand-curated. The previous-architecture sketch had a hand-curated table (Reuters/Bloomberg ≫ blog ≫ social). RavenPack and MarketPsych explicitly weight by source authority but BOTH calibrate continuously against realized returns — that is the institutional baseline. Capping the softmax at [0.5, 5.0] is a deliberate robustness choice: pure softmax can collapse to one source dominating; pure equal-weighting throws away signal; capped softmax is the bounded compromise.

Output:
- 1 new Prisma model `SourceTier` (append-only history) + 1 composite index
- 1 new pure module `src/lib/sentiment/source-tier.ts` (~110 LOC) — `softmaxWithCaps`, `computeSourceWeights`, `getWeightForSource`
- 1 new typed config `src/lib/sentiment/source-tier-hyperparameters.ts` with module-load Zod validation (~50 LOC)
- 1 new recompute script `scripts/recompute-source-tiers.ts` (~150 LOC)
- 1 new cron route `src/app/api/cron/source-tier-recompute/route.ts` (~50 LOC)
- Aggregator integration behind `SOURCE_TIER_MODE` flag (~30 LOC delta)
- UI per-source breakdown 'wt:' label (~10 LOC delta in ResearchReport.tsx)
- HYPERPARAMETERS.md 20-B-04 entry
- vercel.json crons entry (monthly)
- 1 unit test file (≥10 cases)
- 1 integration test file (live-Neon, mock PerSourceIC fixture)
- 1 model card (Mitchell 2019 format)
- 1 CI workflow file (no-hand-curated grep guard)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-A-03-PLAN.md
@prisma/schema.prisma
@src/lib/sentiment/aggregator.ts
@src/lib/learning.ts
@src/components/ResearchReport.tsx
@HYPERPARAMETERS.md
@vercel.json
@CLAUDE.md
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md

<interfaces>
```typescript
// src/lib/sentiment/source-tier-hyperparameters.ts — NEW

export interface SourceTierConfig {
  cap_min: number;                    // weight floor — default 0.5 per CONTEXT.md spec
  cap_max: number;                    // weight ceiling — default 5.0 per CONTEXT.md spec
  n_min_observations: number;         // sources below this default to weight 1.0; default 30 per spec
  validation_window_days: number;     // rolling-90d IC window per spec
  cron_schedule: string;              // '0 7 1 * *' — monthly, 1h after 20-A-03 tune-decay
  weight_diff_display_threshold: number; // UI shows 'wt: X.XX' only when |w-1.0| >= this; default 0.01
}

export const SOURCE_TIER_HYPERPARAMETERS: SourceTierConfig;

// Module-load Zod validation per 19-A-01 precedent. Throws on:
//   cap_min <= 0, cap_max <= cap_min, n_min_observations < 1, etc.
export function validateSourceTierHyperparameters(input: unknown): asserts input is SourceTierConfig;

// src/lib/sentiment/source-tier.ts — NEW

/**
 * Numerically stable softmax with element-wise clamp to [cap_min, cap_max].
 *
 * IMPORTANT: Clamped softmax is NOT a probability distribution. It is a
 * BOUNDED WEIGHTING. The clamp ensures no source is fully suppressed
 * (floor) or fully dominant (ceiling) regardless of the IC spread.
 *
 * Implementation: subtract max(values) before exp() to avoid overflow,
 * then divide by sum(exp), then clamp.
 *
 * Edge cases:
 *  - Empty input → throws (caller bug; should filter beforehand)
 *  - All values equal → all weights equal to 1/N then clamped (likely to floor)
 *  - cap_min > cap_max → throws at module load via Zod
 */
export function softmaxWithCaps(
  values: number[],
  cap_min?: number,    // defaults to SOURCE_TIER_HYPERPARAMETERS.cap_min
  cap_max?: number,    // defaults to SOURCE_TIER_HYPERPARAMETERS.cap_max
): number[];

export interface PerSourceICRow {
  source_id: string;
  mean_ic_90d: number | null;
  n_observations: number;
}

export interface SourceWeightRow {
  source_id: string;
  weight: number;       // ∈ [cap_min, cap_max] OR exactly 1.0 for cold-start
  is_cold_start: boolean; // true when n_observations < n_min OR mean_ic_90d == null
}

/**
 * Computes per-source weights from rolling-90d IC.
 *
 * Two-stage:
 *  1. Partition into eligible (n >= n_min AND mean_ic_90d != null) vs cold-start.
 *  2. Run softmaxWithCaps over eligible IC values; cold-start sources get weight = 1.0.
 *
 * Both partitions are returned in the result so the caller can persist EVERY source
 * (including cold-start), making the SourceTier history complete.
 */
export function computeSourceWeights(
  rows: PerSourceICRow[],
  config?: Partial<SourceTierConfig>,
): SourceWeightRow[];

/**
 * Reads the LATEST SourceTier row with computed_at <= asOf for the given source_id.
 *
 * Cold-start fallback: returns 1.0 when no row exists yet (NEVER throws).
 *
 * Used by aggregator.ts on every aggregation call. Caller is responsible for batching
 * if performance becomes an issue (Phase 27 follow-up); current ~7-source set makes
 * per-call lookups fine.
 */
export async function getWeightForSource(source_id: string, asOf: Date): Promise<number>;
```

```prisma
// prisma/schema.prisma — NEW model (appended after DecayCalibration from 20-A-03)

model SourceTier {
  id                       String   @id @default(uuid())
  source_id                String   // matches CipherSource union from 20-A-03 source-class.ts
  computed_at              DateTime @default(now()) @db.Timestamptz
  mean_ic_90d              Float?   // null on cold-start sources (preserved for audit)
  weight                   Float    // ∈ [cap_min, cap_max] OR exactly 1.0 for cold-start
  n_observations           Int      // count of (ticker, day) IC rows used; gates the softmax bucket
  validation_window_days   Int      // typically 90; logged so cap recalibration is auditable
  model_version            String   // partition key — same convention as 20-Z-01 / 20-A-03
  // append-only history; rows are NEVER updated

  @@index([source_id, computed_at(sort: Desc)], map: "idx_sourcetier_source_at")
  @@map("source_tiers")
}
```

```typescript
// src/lib/sentiment/aggregator.ts — MODIFIED (additive branch behind flag)

// Existing aggregateCommunitySentiment(inputs) is preserved unchanged.
// New variant applies tier weights as a multiplier on the existing mention-count weight:

export type SourceTierMode = 'off' | 'shadow' | 'on';

export interface TierAwareAggregatorOptions {
  mode?: SourceTierMode;             // defaults to env SOURCE_TIER_MODE; defaults to 'off'
  asOf?: Date;                       // defaults to now(); used for getWeightForSource
}

export async function aggregateCommunitySentimentTierAware(
  inputs: AggregatorInputs,
  options?: TierAwareAggregatorOptions,
): Promise<AggregatedSentiment & {
  tier_weights_applied: Record<string, number>; // empty when mode == 'off'
  tier_mode: SourceTierMode;
}>;
//   off    → identical numbers to existing aggregateCommunitySentiment; tier_weights_applied = {}
//   shadow → BOTH paths compute; persist comparison row (off-result vs on-result); RETURNS off-result
//   on     → tier multiplier applied to each component's weight: w'_i = w_i × getWeightForSource(source_i)
//
// Cold-start fallback: missing SourceTier row → multiplier = 1.0 (degrades to off behavior for that source).

// scripts/recompute-source-tiers.ts — NEW (exported for cron route + bootstrap-cutover)

export interface RecomputeOptions {
  bootstrapCutover?: boolean;  // when true, also runs paired-bootstrap on validation Sharpe and exits with report
  modelVersion?: string;       // defaults to ISO date string of computed_at
}

export interface RecomputeResult {
  sources_processed: number;
  rows_written: number;
  cold_start_sources: string[];
  per_source_ic_table_empty: boolean;  // true when 20-C-01 hasn't shipped or has no data
  bootstrap_report?: {
    sharpe_uplift: number;
    ci_lower_95: number;
    ci_upper_95: number;
    n_resamples: number;
    cutover_eligible: boolean;          // true iff ci_lower_95 > 0 AND ≥30d of SourceTier history
  };
}

export async function runRecompute(opts?: RecomputeOptions): Promise<RecomputeResult>;
//   On per_source_ic_table_empty: exits with diagnostic, writes 0 rows, RETURNS NORMALLY (does not throw).
//   Called by both the cron route and the operator-driven bootstrap CLI.
```

```typescript
// 20-C-01 read adapter (read-only) — embedded inside scripts/recompute-source-tiers.ts

interface PerSourceICAdapter {
  fetchPerSourceIC(windowDays: number): Promise<PerSourceICRow[]>;
}

// Implementation reads from a 'per_source_ic' table OWNED by 20-C-01.
// If the table does not exist yet (20-C-01 not shipped):
//   try { ... } catch (e: PrismaClientKnownRequestError code === 'P2021') {
//     return [];   // table-does-not-exist → empty result, recompute exits gracefully
//   }
// If the table exists but has zero rows: returns []; recompute exits gracefully.
// The adapter is the SOLE coupling point with 20-C-01's schema. When 20-C-01 lands, that
// plan documents its PerSourceIC schema; this plan reads only (source_id, mean_ic_90d, n_observations).
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-B-04-01 | Tampering / signal collapse | Single source dominates aggregate even with cap=5.0 (e.g., on a small-source-set ticker, one source at 5.0 vs three at 0.5 still gets 5/(5+1.5) ≈ 77% of weight) | mitigate | Cap of 5.0 is the spec default; configurability via `SOURCE_TIER_HYPERPARAMETERS.cap_max` allows monthly review. Phase 20-Z-03 telemetry surfaces weight distribution per ticker; if any ticker shows >70% concentration on one source for ≥7 days, alert fires (operator-side: tighten cap_max via Zod-validated config bump). MODEL-CARD-source-tier.md documents this as a known failure mode. **Maps to phase catalog T-28-001** (manipulation defense). |
| T-20-B-04-02 | Tampering / cold-start gaming | New noisy source with small sample receives default 1.0 weight, can flood the aggregate before tier calibration kicks in | mitigate | Two-layer defense: (1) `n_min_observations = 30` gate ensures 30 days of IC must accumulate before softmax bucket entry; (2) sources with measured IC < 0 after the 30d gate get clamped to `cap_min = 0.5` floor (NOT zero — preserves audit trail and avoids hard-zero edge cases). Documented in MODEL-CARD-source-tier.md "OOD behavior". UI 'wt: X.XX' label exposes the cold-start status visibly so report consumers can discount cold-start sources by eye. |
| T-20-B-04-03 | Availability / cross-plan dependency | 20-C-01 not yet shipped — `per_source_ic` table doesn't exist or is empty; recompute script crashes; cron alert spams operator | mitigate | Adapter-level graceful degradation: catches Prisma `P2021` (table does not exist) AND empty-result case; returns `per_source_ic_table_empty: true` in result; script exits 0 with diagnostic log line; cron route logs the diagnostic but does NOT alert. Aggregator falls back to default 1.0 weight per source via `getWeightForSource` cold-start path. Integration test asserts both empty-table and missing-table paths exit gracefully. **Documented as the explicit cross-wave decoupling pact** in the universal_preamble. |
| T-20-B-04-04 | Tampering / S1 violation | Hand-curated weights snuck in via env var override (e.g., a future `SOURCE_WEIGHT_OVERRIDE_STOCKTWITS=2.5` env var to "fix" a perceived problem) | mitigate | (1) NO env-var override path exists in this plan's code — `getWeightForSource` reads SourceTier rows ONLY. (2) CI grep guard at `.github/workflows/no-hand-curated-tier-weights.yml` runs `grep -REc 'SOURCE_WEIGHT_OVERRIDE\|HARD_CODED_TIER\|HAND_CURATED_TIER' src/ tests/ scripts/` and fails the workflow if matches > 0. Wired to PR `pull_request` triggers. (3) Hard Cleanup Gate criterion 6 enforces this on every commit. |
| T-20-B-04-05 | Tampering / lookahead bias upstream | IC computed against contaminated forward-return data (e.g., overlapping windows, future-leakage) inflates the source's measured IC and gives it an unjustified high weight | accept (defer to 20-C-01 and 20-Z-07) | This plan is the IC CONSUMER, not the IC producer. The lookahead-bias risk lives in 20-C-01's IC computation. Mitigation: this plan documents the contract verbatim ("rolling-90d IC against forward 7d alpha-vs-SPY") so 20-C-01 implements to the same contract. 20-Z-07 lookahead-bias regression test (PIT discipline) catches violations of the contract at the SQL/ORM layer. MODEL-CARD-source-tier.md "Known limitations" section forward-references this dependency. |

</threat_model>

<tasks>

<task type="auto" id="20-B-04-01">
  <name>Task 1: Add SourceTier Prisma model + composite index</name>
  <read_first>
    - prisma/schema.prisma (current state — append after the last model)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (precedent for additive Phase Z migration)
    - .planning/phases/20-real-sentiment-analysis/20-A-03-PLAN.md (DecayCalibration model — same append-only history pattern)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 116 — verbatim 20-B-04 spec)
  </read_first>
  <action>
    Append the following block to `prisma/schema.prisma` AFTER the last existing model (likely `DecayCalibration` if 20-A-03 has merged, otherwise after `EngineThesis` — Task 1 of this plan must `git pull --rebase` first to ensure correct insertion point). Do NOT modify any existing model — purely additive.

    ```prisma

    // ─── Phase 20-B-04 — Source-tier weighting (data-driven; capped softmax of per-source IC) ───
    // Append-only history. Each monthly recompute INSERTS new rows; the aggregator reads the
    // LATEST row per source_id via getWeightForSource(). Old rows are NEVER updated. Cold-start
    // sources (n_observations < 30 OR mean_ic_90d == null) are persisted with weight = 1.0
    // and is_cold_start tracked implicitly via mean_ic_90d == null. Cap bounds [0.5, 5.0] are
    // configurable in src/lib/sentiment/source-tier-hyperparameters.ts.
    model SourceTier {
      id                     String   @id @default(uuid())
      source_id              String   // matches CipherSource union from 20-A-03 source-class.ts
      computed_at            DateTime @default(now()) @db.Timestamptz
      mean_ic_90d            Float?   // null for cold-start sources (preserved for audit)
      weight                 Float    // ∈ [cap_min, cap_max] OR exactly 1.0 for cold-start
      n_observations         Int      // count of (ticker, day) IC rows used in the softmax bucket
      validation_window_days Int      // typically 90; logged for audit when cap is recalibrated
      model_version          String   // partition key — same convention as 20-Z-01 / 20-A-03

      @@index([source_id, computed_at(sort: Desc)], map: "idx_sourcetier_source_at")
      @@map("source_tiers")
    }
    ```

    Run Prisma client regeneration (no DB push yet — that's Task 2):

    ```bash
    npx prisma generate
    ```
  </action>
  <verify>
    <automated>npx prisma format --check && grep -q "model SourceTier" prisma/schema.prisma && grep -q "idx_sourcetier_source_at" prisma/schema.prisma && grep -q "@@map(\"source_tiers\")" prisma/schema.prisma</automated>
  </verify>
  <done>SourceTier model + composite index appended; Prisma client regenerated; no existing model modified (`git diff prisma/schema.prisma | grep -E "^-[^-]" | wc -l` returns 0)</done>
</task>

<task type="checkpoint:human-action" id="20-B-04-02" gate="blocking">
  <name>Task 2: [BLOCKING] Push SourceTier schema to live Neon</name>
  <what-built>SourceTier Prisma model added in Task 1. This is the only blocking operator step in the plan — `npx prisma db push` against the live `DATABASE_URL`.</what-built>
  <how-to-verify>
    Run from the repo root with the production `DATABASE_URL` exported (or via `.env.local`):

    ```bash
    npx prisma db push
    ```

    Expected output: "Database synchronization completed" with `+ source_tiers` table and `+ idx_sourcetier_source_at` index in the diff. No data loss; no existing table modified.

    Verify in Neon console (or `npx prisma studio`) that `source_tiers` exists and is empty (`SELECT COUNT(*) FROM source_tiers` returns 0).

    On success, type "pushed" to resume.
  </how-to-verify>
  <resume-signal>Type "pushed" once db push completes successfully and source_tiers table is visible in Neon.</resume-signal>
</task>

<task type="auto" id="20-B-04-03">
  <name>Task 3: Implement source-tier-hyperparameters.ts with Zod validation</name>
  <read_first>
    - src/lib/learning.ts (HYPERPARAMETERS pattern + validateHyperparameters precedent — 19-A-01)
    - .planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md (Zod .strict() pattern)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 116 — cap defaults; lines 13-14 — S1)
  </read_first>
  <action>
    Create `src/lib/sentiment/source-tier-hyperparameters.ts`:

    ```typescript
    /**
     * Plan 20-B-04 — Source-tier weighting hyperparameters.
     *
     * S1 enforcement: cap bounds, n_min_observations, validation_window_days, and
     * cron schedule are configurable here so changes are reviewable in PRs and
     * surfaced in HYPERPARAMETERS.md. There is INTENTIONALLY no env-var override
     * path — see threat T-20-B-04-04 and the CI grep guard.
     */
    import { z } from 'zod';

    export interface SourceTierConfig {
      cap_min: number;
      cap_max: number;
      n_min_observations: number;
      validation_window_days: number;
      cron_schedule: string;
      weight_diff_display_threshold: number;
    }

    export const SOURCE_TIER_HYPERPARAMETERS: SourceTierConfig = {
      // CONTEXT.md §20-B-04 spec: capped softmax at [0.5, 5.0]
      cap_min: 0.5,
      cap_max: 5.0,
      // CONTEXT.md §20-B-04 spec: ≥30d of measured IC before softmax bucket entry
      n_min_observations: 30,
      // CONTEXT.md §20-B-04 spec: rolling-90d IC against forward 7d alpha-vs-SPY
      validation_window_days: 90,
      // Monthly cron, 1h after 20-A-03 tune-decay (06:00 UTC) to avoid simultaneous Neon load
      cron_schedule: '0 7 1 * *',
      // UI shows 'wt: X.XX' only when |w-1.0| >= this; default 0.01 hides cold-start visual noise
      weight_diff_display_threshold: 0.01,
    };

    const SourceTierConfigSchema = z.object({
      cap_min: z.number().positive().finite(),
      cap_max: z.number().positive().finite(),
      n_min_observations: z.number().int().positive(),
      validation_window_days: z.number().int().positive(),
      cron_schedule: z.string().min(1),
      weight_diff_display_threshold: z.number().nonnegative().finite(),
    }).strict().refine(
      (cfg) => cfg.cap_max > cfg.cap_min,
      { message: 'cap_max must be strictly greater than cap_min' },
    );

    export function validateSourceTierHyperparameters(
      input: unknown,
    ): asserts input is SourceTierConfig {
      const result = SourceTierConfigSchema.safeParse(input);
      if (!result.success) {
        throw new Error(
          `SOURCE_TIER_HYPERPARAMETERS validation failed: ${result.error.issues
            .map((i) => i.path.join('.') + ': ' + i.message)
            .join('; ')}`,
        );
      }
    }

    // Module-load assertion — fail fast at import time on malformed config (per 19-A-01).
    validateSourceTierHyperparameters(SOURCE_TIER_HYPERPARAMETERS);
    ```
  </action>
  <verify>
    <automated>node -e "require('./src/lib/sentiment/source-tier-hyperparameters.ts')" 2>&1 || npx tsx -e "import { SOURCE_TIER_HYPERPARAMETERS } from './src/lib/sentiment/source-tier-hyperparameters.ts'; if (SOURCE_TIER_HYPERPARAMETERS.cap_min !== 0.5) process.exit(1); if (SOURCE_TIER_HYPERPARAMETERS.cap_max !== 5.0) process.exit(1); if (SOURCE_TIER_HYPERPARAMETERS.n_min_observations !== 30) process.exit(1);"</automated>
  </verify>
  <done>Hyperparameters module loads cleanly with default values; Zod schema validates module-load assertion; all 6 fields present at correct defaults</done>
</task>

<task type="auto" id="20-B-04-04">
  <name>Task 4: Implement source-tier.ts pure functions (softmaxWithCaps, computeSourceWeights, getWeightForSource)</name>
  <read_first>
    - src/lib/sentiment/source-tier-hyperparameters.ts (just created in Task 3)
    - src/lib/db.ts (prisma singleton)
    - src/lib/sentiment/aggregator.ts (existing module style)
    - prisma/schema.prisma (SourceTier model from Task 1)
  </read_first>
  <action>
    Create `src/lib/sentiment/source-tier.ts`:

    ```typescript
    /**
     * Plan 20-B-04 — Source-tier weighting (data-driven, capped softmax of per-source IC).
     *
     * Three pure-ish exports:
     *   - softmaxWithCaps(values, cap_min, cap_max) — numerically stable softmax + clamp.
     *     IMPORTANT: clamped softmax is NOT a probability distribution; it is a bounded
     *     weighting. Callers must NOT assume Σ weights = 1.
     *   - computeSourceWeights(rows) — partitions cold-start vs eligible, runs softmax over
     *     eligible, defaults cold-start to weight=1.0.
     *   - getWeightForSource(source_id, asOf) — DB read of latest SourceTier row; cold-start
     *     fallback returns 1.0 verbatim (NEVER throws).
     *
     * Threat T-20-B-04-04 enforcement: NO env-var override path. Weights come from SourceTier
     * rows ONLY. CI grep guard at .github/workflows/no-hand-curated-tier-weights.yml fails the
     * build on SOURCE_WEIGHT_OVERRIDE / HARD_CODED_TIER tokens.
     */
    import { prisma } from '@/lib/db';
    import {
      SOURCE_TIER_HYPERPARAMETERS,
      type SourceTierConfig,
    } from './source-tier-hyperparameters';

    export interface PerSourceICRow {
      source_id: string;
      mean_ic_90d: number | null;
      n_observations: number;
    }

    export interface SourceWeightRow {
      source_id: string;
      weight: number;
      is_cold_start: boolean;
    }

    /**
     * Numerically stable softmax with element-wise clamp to [cap_min, cap_max].
     *
     * Implementation: subtract max(values) before exp() to prevent overflow on
     * large positive ICs (rare but possible). Then divide by sum(exp). Then clamp.
     *
     * CLAMPED SOFTMAX IS NOT A PROBABILITY DISTRIBUTION — it is a bounded weighting.
     * The clamp ensures no source is fully suppressed (floor) or fully dominant (ceiling).
     */
    export function softmaxWithCaps(
      values: number[],
      cap_min: number = SOURCE_TIER_HYPERPARAMETERS.cap_min,
      cap_max: number = SOURCE_TIER_HYPERPARAMETERS.cap_max,
    ): number[] {
      if (values.length === 0) {
        throw new Error('softmaxWithCaps: input array is empty (caller bug — should filter beforehand)');
      }
      if (!Number.isFinite(cap_min) || !Number.isFinite(cap_max) || cap_min <= 0 || cap_max <= cap_min) {
        throw new Error(`softmaxWithCaps: invalid caps (cap_min=${cap_min}, cap_max=${cap_max}); require 0 < cap_min < cap_max`);
      }
      for (const v of values) {
        if (!Number.isFinite(v)) {
          throw new Error(`softmaxWithCaps: non-finite value in input (${v})`);
        }
      }
      const maxV = Math.max(...values);
      const exps = values.map((v) => Math.exp(v - maxV));
      const sumExp = exps.reduce((a, b) => a + b, 0);
      // sumExp >= 1 by construction (one term is exp(0) = 1), so no div-by-zero.
      const softmaxed = exps.map((e) => e / sumExp);
      // Clamp. After clamping, the values no longer sum to 1 — that is intentional (bounded weighting).
      return softmaxed.map((w) => Math.min(cap_max, Math.max(cap_min, w * values.length)));
      // Note: multiply by values.length first so a uniform softmax (all equal) lands at 1.0
      // (the "neutral" weight). Without the * N, uniform softmax = 1/N which would always
      // hit the floor — defeating the purpose. This is the bounded WEIGHTING interpretation:
      // softmax × N is "relative weight where 1.0 = average".
    }

    /**
     * Two-stage: cold-start sources default to weight=1.0; eligible sources go through
     * softmaxWithCaps over their mean_ic_90d values.
     */
    export function computeSourceWeights(
      rows: PerSourceICRow[],
      config?: Partial<SourceTierConfig>,
    ): SourceWeightRow[] {
      const cfg = { ...SOURCE_TIER_HYPERPARAMETERS, ...config };
      const eligible: PerSourceICRow[] = [];
      const coldStart: PerSourceICRow[] = [];
      for (const r of rows) {
        if (r.mean_ic_90d == null || r.n_observations < cfg.n_min_observations) {
          coldStart.push(r);
        } else {
          eligible.push(r);
        }
      }

      const result: SourceWeightRow[] = [];

      if (eligible.length > 0) {
        const weights = softmaxWithCaps(
          eligible.map((r) => r.mean_ic_90d as number),
          cfg.cap_min,
          cfg.cap_max,
        );
        eligible.forEach((r, i) => {
          result.push({ source_id: r.source_id, weight: weights[i], is_cold_start: false });
        });
      }

      for (const r of coldStart) {
        result.push({ source_id: r.source_id, weight: 1.0, is_cold_start: true });
      }

      return result;
    }

    /**
     * Reads latest SourceTier row with computed_at <= asOf for the given source_id.
     * Cold-start fallback: returns 1.0 when no row exists (NEVER throws).
     */
    export async function getWeightForSource(source_id: string, asOf: Date): Promise<number> {
      try {
        const row = await prisma.sourceTier.findFirst({
          where: { source_id, computed_at: { lte: asOf } },
          orderBy: { computed_at: 'desc' },
          select: { weight: true },
        });
        if (!row) return 1.0;
        return row.weight;
      } catch (err) {
        // Defensive: if DB is unreachable or table missing, fall back to 1.0 rather than
        // crash the aggregator. Operator-side telemetry (20-Z-03) will catch the error rate.
        return 1.0;
      }
    }
    ```
  </action>
  <verify>
    <automated>npx tsc --noEmit src/lib/sentiment/source-tier.ts 2>&1 | (! grep -q "error TS")</automated>
  </verify>
  <done>source-tier.ts compiles cleanly; all three exports defined with documented behavior; cap-default fallbacks wired to SOURCE_TIER_HYPERPARAMETERS</done>
</task>

<task type="auto" tdd="true" id="20-B-04-05">
  <name>Task 5: Unit tests for source-tier.ts (≥10 cases)</name>
  <read_first>
    - src/lib/sentiment/source-tier.ts (just created)
    - tests/learning.unit.bugs.test.ts (precedent for unit-test style)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 116 spec)
  </read_first>
  <behavior>
    ≥10 unit test cases covering:
    1. softmaxWithCaps preserves ordering (highest IC → highest weight)
    2. softmaxWithCaps with all-equal inputs → all weights equal 1.0 (uniform * N normalization)
    3. softmaxWithCaps clamps at cap_max=5.0 when one source dominates
    4. softmaxWithCaps clamps at cap_min=0.5 when one source is far below
    5. softmaxWithCaps throws on empty input
    6. softmaxWithCaps throws on non-finite value
    7. softmaxWithCaps throws on cap_min >= cap_max
    8. computeSourceWeights: source with n_observations < 30 → weight = 1.0 exactly + is_cold_start = true
    9. computeSourceWeights: source with mean_ic_90d == null → weight = 1.0 + is_cold_start = true
    10. computeSourceWeights: mixed cold-start + eligible → cold-start gets 1.0, eligible go through softmax
    11. computeSourceWeights: all eligible weights ∈ [0.5, 5.0]
    12. getWeightForSource: cold-start (no row) returns 1.0 (mocked Prisma returns null)
  </behavior>
  <action>
    Create `tests/sentiment-source-tier.unit.test.ts` with the 12 cases above. Use vitest. Mock the prisma singleton via `vi.mock('@/lib/db')` for case 12. Cases 1-11 are pure-function — no mocking needed.

    Key assertions:
    - Case 1: `expect(weights[0]).toBeGreaterThan(weights[2])` for inputs [0.5, 0.0, -0.5]
    - Case 2: `expect(weights.every(w => Math.abs(w - 1.0) < 1e-9)).toBe(true)` for inputs [0.1, 0.1, 0.1]
    - Case 3: feed `[10.0, -10.0, -10.0]` and assert `weights[0] === 5.0` AND `weights[1] === 0.5`
    - Case 8: `expect(result.find(r => r.source_id === 'X').weight).toBe(1.0)` AND `is_cold_start === true` for n=10
    - Case 11: `expect(result.filter(r => !r.is_cold_start).every(r => r.weight >= 0.5 && r.weight <= 5.0)).toBe(true)`
    - Case 12: mocked `prisma.sourceTier.findFirst` returns null → `expect(await getWeightForSource('x', new Date())).toBe(1.0)`
  </action>
  <verify>
    <automated>npx vitest run tests/sentiment-source-tier.unit.test.ts</automated>
  </verify>
  <done>≥10 unit test cases (covering ordering, caps, throws, cold-start, fallback); all GREEN</done>
</task>

<task type="auto" id="20-B-04-06">
  <name>Task 6: Implement scripts/recompute-source-tiers.ts (with empty-PerSourceIC graceful exit)</name>
  <read_first>
    - src/lib/sentiment/source-tier.ts (functions to call)
    - src/lib/sentiment/source-tier-hyperparameters.ts (config)
    - src/lib/db.ts (prisma singleton)
    - .planning/phases/20-real-sentiment-analysis/20-A-03-PLAN.md (scripts/tune-decay.ts shape — same pattern: exported runX() called by both CLI and cron)
  </read_first>
  <action>
    Create `scripts/recompute-source-tiers.ts` (~150 LOC) following the 20-A-03 tune-decay shape:

    Structure:
    ```typescript
    /**
     * Plan 20-B-04 — monthly recompute of source-tier weights from per-source IC.
     *
     * Reads from PerSourceIC table OWNED by 20-C-01. If 20-C-01 hasn't shipped or has no
     * data, the adapter returns [] and this script exits 0 with diagnostic — aggregator
     * continues with default weight=1.0 per source (cold-start fallback).
     *
     * Called by:
     *   - src/app/api/cron/source-tier-recompute/route.ts (monthly cron)
     *   - operator CLI: npx tsx scripts/recompute-source-tiers.ts
     *   - operator CLI: npx tsx scripts/recompute-source-tiers.ts --bootstrap-cutover
     */
    import { prisma } from '@/lib/db';
    import { Prisma } from '@prisma/client';
    import { computeSourceWeights, type PerSourceICRow } from '@/lib/sentiment/source-tier';
    import { SOURCE_TIER_HYPERPARAMETERS } from '@/lib/sentiment/source-tier-hyperparameters';

    export interface RecomputeOptions {
      bootstrapCutover?: boolean;
      modelVersion?: string;
    }

    export interface RecomputeResult {
      sources_processed: number;
      rows_written: number;
      cold_start_sources: string[];
      per_source_ic_table_empty: boolean;
      bootstrap_report?: {
        sharpe_uplift: number;
        ci_lower_95: number;
        ci_upper_95: number;
        n_resamples: number;
        cutover_eligible: boolean;
      };
    }

    /**
     * Read-only adapter for 20-C-01's per_source_ic table.
     * Returns [] on:
     *  - Table does not exist (Prisma P2021) — 20-C-01 not yet shipped
     *  - Table exists but has no rows for the window
     */
    async function fetchPerSourceIC(windowDays: number): Promise<PerSourceICRow[]> {
      try {
        // 20-C-01 will define a PerSourceIC Prisma model; until then, raw SQL keeps the
        // dependency soft. When 20-C-01 lands, switch to prisma.perSourceIC.findMany.
        const rows = await prisma.$queryRaw<Array<{ source_id: string; mean_ic_90d: number | null; n_observations: bigint }>>`
          SELECT source_id, mean_ic_90d, n_observations
          FROM per_source_ic
          WHERE window_days = ${windowDays}
            AND computed_at = (SELECT MAX(computed_at) FROM per_source_ic WHERE window_days = ${windowDays})
        `;
        return rows.map((r) => ({
          source_id: r.source_id,
          mean_ic_90d: r.mean_ic_90d,
          n_observations: Number(r.n_observations),
        }));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021') {
          // Table does not exist — 20-C-01 not shipped yet.
          return [];
        }
        // Treat any other read error as table-empty for graceful degradation.
        // Operator-side telemetry (20-Z-03) catches the error rate.
        // eslint-disable-next-line no-console
        console.warn(`[source-tier-recompute] PerSourceIC read failed (treating as empty): ${String(err)}`);
        return [];
      }
    }

    export async function runRecompute(opts: RecomputeOptions = {}): Promise<RecomputeResult> {
      const cfg = SOURCE_TIER_HYPERPARAMETERS;
      const modelVersion = opts.modelVersion ?? `recompute-${new Date().toISOString().slice(0, 10)}`;
      const icRows = await fetchPerSourceIC(cfg.validation_window_days);

      if (icRows.length === 0) {
        // eslint-disable-next-line no-console
        console.log('[source-tier-recompute] PerSourceIC table empty — defaulting all weights to 1.0; no SourceTier rows written.');
        return {
          sources_processed: 0,
          rows_written: 0,
          cold_start_sources: [],
          per_source_ic_table_empty: true,
        };
      }

      const weights = computeSourceWeights(icRows, cfg);

      // Persist every source (eligible AND cold-start) so SourceTier history is complete.
      let rows_written = 0;
      const cold_start_sources: string[] = [];
      for (const w of weights) {
        const ic = icRows.find((r) => r.source_id === w.source_id)!;
        await prisma.sourceTier.create({
          data: {
            source_id: w.source_id,
            mean_ic_90d: ic.mean_ic_90d,
            weight: w.weight,
            n_observations: ic.n_observations,
            validation_window_days: cfg.validation_window_days,
            model_version: modelVersion,
          },
        });
        rows_written += 1;
        if (w.is_cold_start) cold_start_sources.push(w.source_id);
      }

      const result: RecomputeResult = {
        sources_processed: weights.length,
        rows_written,
        cold_start_sources,
        per_source_ic_table_empty: false,
      };

      if (opts.bootstrapCutover) {
        // Paired-bootstrap on validation Sharpe — 1000 resamples.
        // STUB: implementation deferred to a follow-up task once 20-C-01 ships and we have
        // ≥30d of SourceTier history. The stub returns a not-yet-eligible report so the
        // operator gets clear feedback on what's missing.
        const oldestRow = await prisma.sourceTier.findFirst({
          orderBy: { computed_at: 'asc' },
          select: { computed_at: true },
        });
        const days_of_history = oldestRow
          ? (Date.now() - oldestRow.computed_at.getTime()) / 86_400_000
          : 0;
        result.bootstrap_report = {
          sharpe_uplift: NaN,
          ci_lower_95: NaN,
          ci_upper_95: NaN,
          n_resamples: 0,
          cutover_eligible: false, // requires ≥30d history AND CI lower-bound > 0; both checked at cutover time
        };
        // eslint-disable-next-line no-console
        console.log(`[source-tier-recompute] bootstrap-cutover: days_of_history=${days_of_history.toFixed(1)}; gate requires >=30. Implementation lands after 20-C-01 has ≥30d of IC.`);
      }

      return result;
    }

    // CLI entry — only when invoked directly (not when imported by cron route).
    if (require.main === module) {
      const bootstrapCutover = process.argv.includes('--bootstrap-cutover');
      runRecompute({ bootstrapCutover })
        .then((r) => {
          // eslint-disable-next-line no-console
          console.log(JSON.stringify(r, null, 2));
          process.exit(0);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error(err);
          process.exit(1);
        });
    }
    ```
  </action>
  <verify>
    <automated>npx tsc --noEmit scripts/recompute-source-tiers.ts 2>&1 | (! grep -q "error TS")</automated>
  </verify>
  <done>Script compiles; runRecompute exported for cron use; CLI entry guarded by require.main === module; PerSourceIC empty/missing-table both return per_source_ic_table_empty=true with no thrown errors</done>
</task>

<task type="auto" id="20-B-04-07">
  <name>Task 7: Cron route /api/cron/source-tier-recompute + vercel.json entry</name>
  <read_first>
    - src/app/api/cron/sentiment-scan/route.ts (existing CRON_SECRET pattern)
    - vercel.json (existing crons array — add new entry alongside)
    - .planning/phases/20-real-sentiment-analysis/20-A-03-PLAN.md (cron route shape)
  </read_first>
  <action>
    Create `src/app/api/cron/source-tier-recompute/route.ts`:

    ```typescript
    /**
     * Plan 20-B-04 — monthly cron entrypoint for source-tier recompute.
     *
     * Schedule: '0 7 1 * *' (1st of month, 07:00 UTC) — 1h after 20-A-03 tune-decay
     * to avoid simultaneous Neon load. Per Vercel cron docs, requires Bearer
     * ${CRON_SECRET} authorization header check.
     */
    import { NextResponse } from 'next/server';
    import { runRecompute } from '@/../scripts/recompute-source-tiers';

    export const runtime = 'nodejs';
    export const maxDuration = 300;

    export async function GET(request: Request) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
      }
      try {
        const result = await runRecompute();
        return NextResponse.json({ ok: true, ...result });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[cron:source-tier-recompute] failed', err);
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
      }
    }
    ```

    Add to `vercel.json` `crons` array (do NOT remove or modify any existing entry):

    ```json
    {
      "path": "/api/cron/source-tier-recompute",
      "schedule": "0 7 1 * *"
    }
    ```
  </action>
  <verify>
    <automated>grep -q "Bearer \${process.env.CRON_SECRET}" src/app/api/cron/source-tier-recompute/route.ts && grep -q "source-tier-recompute" vercel.json && grep -q "0 7 1 \\* \\*" vercel.json</automated>
  </verify>
  <done>Cron route file exists with CRON_SECRET guard; vercel.json crons array contains new entry with monthly schedule; existing cron entries untouched</done>
</task>

<task type="auto" id="20-B-04-08">
  <name>Task 8: Aggregator integration behind SOURCE_TIER_MODE flag + UI 'wt:' label</name>
  <read_first>
    - src/lib/sentiment/aggregator.ts (existing aggregateCommunitySentiment — preserve unchanged)
    - src/lib/sentiment/source-tier.ts (getWeightForSource)
    - src/lib/sentiment/source-tier-hyperparameters.ts (weight_diff_display_threshold)
    - src/components/ResearchReport.tsx (lines 690-710 — per-source breakdown rendering)
    - .planning/phases/20-real-sentiment-analysis/20-A-03-PLAN.md (SENTIMENT_DECAY_MODE pattern)
  </read_first>
  <action>
    **Aggregator** (`src/lib/sentiment/aggregator.ts`):

    Append (do NOT modify the existing `aggregateCommunitySentiment` function):

    ```typescript
    import { getWeightForSource } from './source-tier';

    export type SourceTierMode = 'off' | 'shadow' | 'on';

    export interface TierAwareAggregatorOptions {
      mode?: SourceTierMode;
      asOf?: Date;
    }

    function resolveTierMode(opts?: TierAwareAggregatorOptions): SourceTierMode {
      if (opts?.mode) return opts.mode;
      const env = process.env.SOURCE_TIER_MODE;
      if (env === 'shadow' || env === 'on') return env;
      return 'off';
    }

    export async function aggregateCommunitySentimentTierAware(
      inputs: AggregatorInputs,
      options?: TierAwareAggregatorOptions,
    ): Promise<AggregatedSentiment & {
      tier_weights_applied: Record<string, number>;
      tier_mode: SourceTierMode;
    }> {
      const mode = resolveTierMode(options);
      const baseline = aggregateCommunitySentiment(inputs);

      if (mode === 'off') {
        return { ...baseline, tier_weights_applied: {}, tier_mode: mode };
      }

      const asOf = options?.asOf ?? new Date();
      const tier_weights_applied: Record<string, number> = {};
      // Build adjusted components: w'_i = w_i × tier_weight
      let weightedSum = 0;
      let totalWeight = 0;
      for (const c of baseline.components) {
        const tier = await getWeightForSource(c.source, asOf);
        tier_weights_applied[c.source] = tier;
        const adjW = c.weight * tier;
        weightedSum += c.bullish_pct * adjW;
        totalWeight += adjW;
      }
      const PRIOR_ALPHA = 5;
      const PRIOR_BETA = 5;
      const num = weightedSum + PRIOR_ALPHA * 100;
      const den = totalWeight + PRIOR_ALPHA + PRIOR_BETA;
      const tierAdjustedBull = Math.max(0, Math.min(100, num / den));
      const tierAdjustedBullRounded = Math.round(tierAdjustedBull * 100) / 100;
      const tierAdjustedBearRounded = Math.round((100 - tierAdjustedBull) * 100) / 100;

      if (mode === 'shadow') {
        // Return baseline numbers (do not change report-facing aggregate); persist comparison
        // via 20-Z-03 telemetry on the call site (deferred — telemetry wiring is 20-Z-03's scope).
        return {
          ...baseline,
          tier_weights_applied,
          tier_mode: mode,
        };
      }

      // mode === 'on' — return tier-adjusted aggregate as authoritative
      return {
        aggregated_bull_pct: tierAdjustedBullRounded,
        aggregated_bear_pct: tierAdjustedBearRounded,
        source_count: baseline.source_count,
        components: baseline.components,
        tier_weights_applied,
        tier_mode: mode,
      };
    }
    ```

    **UI** (`src/components/ResearchReport.tsx` — per-source breakdown, lines ~696-708):

    Extend the per-source row to show 'wt: X.XX' when tier weight differs from 1.0 by ≥ 0.01. The tier weight comes from a new optional field `tier_weights_applied` on the sentiment_intelligence prop (which the data layer fills from `aggregateCommunitySentimentTierAware`). Add the label after `n={c.raw_mention_count}`:

    ```tsx
    {sentiment_intelligence.tier_weights_applied?.[c.source] != null &&
      Math.abs(sentiment_intelligence.tier_weights_applied[c.source] - 1.0) >= 0.01 && (
        <span className="text-on-surface-variant ml-2">
          wt: {sentiment_intelligence.tier_weights_applied[c.source].toFixed(2)}
        </span>
      )}
    ```

    Also extend the `sentiment_intelligence` prop type wherever it is defined (likely in src/types or inline) to include `tier_weights_applied?: Record<string, number>`.
  </action>
  <verify>
    <automated>grep -q "SOURCE_TIER_MODE" src/lib/sentiment/aggregator.ts && grep -q "aggregateCommunitySentimentTierAware" src/lib/sentiment/aggregator.ts && grep -q "wt:" src/components/ResearchReport.tsx && npx tsc --noEmit 2>&1 | (! grep -q "error TS")</automated>
  </verify>
  <done>Aggregator export added behind SOURCE_TIER_MODE flag; baseline aggregateCommunitySentiment unchanged; UI 'wt:' label appears only when tier ≠ 1.0; TypeScript compiles clean</done>
</task>

<task type="auto" id="20-B-04-09">
  <name>Task 9: Integration test (live-Neon, mock PerSourceIC fixture)</name>
  <read_first>
    - tests/integration/ (existing live-Neon test pattern)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (integration test shape)
    - scripts/recompute-source-tiers.ts (just created)
  </read_first>
  <action>
    Create `tests/integration/source-tier-recompute.integration.test.ts`. Three tests minimum:

    **Test 1 — empty PerSourceIC graceful exit:**
    - Drop or skip seeding `per_source_ic` (table may not exist). Call `runRecompute()`.
    - Assert: `result.per_source_ic_table_empty === true`, `result.rows_written === 0`, no thrown error.

    **Test 2 — populated PerSourceIC writes SourceTier rows with bounded weights:**
    - Seed `per_source_ic` table via raw SQL with 6 rows (5 eligible with varying ICs, 1 cold-start with n=10):
      ```sql
      CREATE TABLE IF NOT EXISTS per_source_ic (
        source_id text, mean_ic_90d double precision,
        n_observations bigint, window_days int, computed_at timestamptz default now()
      );
      INSERT INTO per_source_ic (source_id, mean_ic_90d, n_observations, window_days)
      VALUES ('stocktwits', 0.05, 90, 90), ('reddit', 0.10, 90, 90),
             ('news', 0.20, 90, 90), ('apewisdom', -0.05, 90, 90),
             ('swaggystocks', 0.0, 90, 90), ('newsource', NULL, 10, 90);
      ```
    - Call `runRecompute({ modelVersion: 'test-v1' })`.
    - Assert: `SELECT COUNT(*) FROM source_tiers WHERE model_version='test-v1'` >= 6.
    - Assert: `SELECT COUNT(*) FROM source_tiers WHERE weight < 0.5 OR weight > 5.0` returns 0.
    - Assert: `SELECT COUNT(DISTINCT weight) FROM source_tiers WHERE model_version='test-v1'` >= 2 (proves data-driven, not all-1.0).
    - Assert: cold-start source 'newsource' has weight = 1.0.
    - Assert: result.cold_start_sources includes 'newsource'.

    **Test 3 — aggregator with tier weights produces different output than baseline:**
    - With Test 2 data still in place, set `process.env.SOURCE_TIER_MODE = 'on'`.
    - Build a fixture AggregatorInputs with stocktwits + apewisdom contributions.
    - Call both `aggregateCommunitySentiment(fixture)` (baseline) and `aggregateCommunitySentimentTierAware(fixture, { mode: 'on' })` (tier-aware).
    - Assert: `tierAware.aggregated_bull_pct !== baseline.aggregated_bull_pct` (regression test — tier weights actually change the output).
    - Assert: `tierAware.tier_weights_applied['stocktwits']` exists and is ∈ [0.5, 5.0].

    Cleanup hook: drop test rows after test (`DELETE FROM source_tiers WHERE model_version='test-v1'`; `DROP TABLE IF EXISTS per_source_ic` if test created it).
  </action>
  <verify>
    <automated>npx vitest run --config vitest.integration.config.ts tests/integration/source-tier-recompute.integration.test.ts</automated>
  </verify>
  <done>3 integration tests pass on live-Neon: empty-PerSourceIC graceful exit; ≥6 SourceTier rows written with bounded weights and ≥2 distinct values; tier-aware aggregator produces different bull_pct than baseline</done>
</task>

<task type="auto" id="20-B-04-10">
  <name>Task 10: Model card + HYPERPARAMETERS.md entry + CI grep guard workflow</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (if exists — Mitchell 2019 template reference)
    - HYPERPARAMETERS.md (will be created by 20-A-03 Task — if missing on disk, create with header)
    - .github/workflows/ (existing CI patterns)
  </read_first>
  <action>
    **3a — MODEL-CARD-source-tier.md:**

    Create `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-source-tier.md` (Mitchell 2019 format):

    ```markdown
    # Model Card: Source-Tier Weighting (Plan 20-B-04)

    ## Model Details
    - **Name:** source-tier-weighting
    - **Version:** v1 (initial — capped softmax of per-source 90d IC)
    - **Type:** Bounded weighting (NOT a probability distribution)
    - **Owner:** Phase 20 sentiment layer
    - **Date:** 2026-05-10

    ## Intended Use
    Replace any hand-curated source-authority table with a data-driven monthly recompute. Per-source weight = `softmaxWithCaps(mean_IC_per_source, [0.5, 5.0])` so no source is fully suppressed or fully dominant.

    ## Training Data
    - **Source:** Per-source rolling-90d Spearman IC against forward 7d alpha-vs-SPY (PRODUCED BY 20-C-01)
    - **Window:** 90 days
    - **Min sample for inclusion:** 30 days of measured IC; below this threshold the source defaults to weight = 1.0 (cold start)

    ## Evaluation Metrics
    - **Cutover gate:** paired-bootstrap on validation Sharpe of tier-weighted vs unweighted aggregate, 95% CI lower-bound > 0 (1000 resamples)
    - **Acceptance:** ≥30d of SourceTier history AND CI lower-bound > 0
    - **Per-segment fairness:** delegated to Phase 20-C-06 audit (cap_class × sector stratification)

    ## Out-of-Distribution Behavior
    - **New source (n_observations < 30 OR mean_ic_90d == null):** weight = 1.0 verbatim; persisted with `is_cold_start: true`. UI does not render the 'wt:' label (avoids visual noise).
    - **All sources cold-start:** softmax bucket is empty; everyone gets 1.0; aggregator behavior is identical to baseline.
    - **PerSourceIC table missing or empty (20-C-01 not yet shipped):** `getWeightForSource` returns 1.0; recompute exits 0 with diagnostic.

    ## Known Failure Modes
    1. **Single-source dominance at cap=5.0** (T-20-B-04-01). On a small-source-set ticker, one source at 5.0 vs three at 0.5 still gets ~77% of total weight. Mitigation: monthly review via Phase 20-Z-03 telemetry alerts.
    2. **Cold-start gaming** (T-20-B-04-02). New noisy source with small sample receives default 1.0 weight before tier calibration kicks in. Mitigation: 30-day n_observations gate + 0.5 floor after measurement.
    3. **IC contamination upstream** (T-20-B-04-05). If 20-C-01's IC is computed on lookahead-biased data, weights are inflated. Mitigation: 20-Z-07 lookahead-bias regression test.

    ## Retrain Cadence
    Monthly cron at `'0 7 1 * *'` UTC (1st of month, 07:00).

    ## Ethical Considerations
    Source weights are computed from market signal only (IC vs forward returns). No demographic, geographic, or content-based signals enter the weighting. No source is permanently suppressed (cap_min = 0.5 floor).

    ## Cross-references
    - Spec: CONTEXT.md §20-B-04
    - Producer: 20-C-01 (per-source rolling-90d IC)
    - Schema: prisma/schema.prisma `model SourceTier`
    - Cutover gate: this plan's Hard Cleanup Gate criterion 4
    ```

    **3b — HYPERPARAMETERS.md entry:**

    If `HYPERPARAMETERS.md` does not exist (20-A-03 has not merged), create it with header:
    ```markdown
    # Cipher Hyperparameters

    Calibrated and operator-reviewable hyperparameters per Phase 20 §S1 (no hand-picked parameters).
    ```

    Append a Phase 20-B-04 section:
    ```markdown
    ## Phase 20-B-04 — Source-tier weighting

    | Parameter | Default | Rationale | Source |
    |---|---|---|---|
    | `cap_min` | 0.5 | Floor — no source fully suppressed; preserves audit signal | CONTEXT.md §20-B-04 spec |
    | `cap_max` | 5.0 | Ceiling — no source fully dominant; bounds adversarial inflation | CONTEXT.md §20-B-04 spec |
    | `n_min_observations` | 30 | Sources below this default to weight=1.0 (cold start) | CONTEXT.md §20-B-04 spec |
    | `validation_window_days` | 90 | Rolling-90d IC against forward 7d alpha-vs-SPY | CONTEXT.md §20-B-04 spec |
    | `cron_schedule` | `0 7 1 * *` | Monthly, 1h after 20-A-03 tune-decay (avoid simultaneous Neon load) | This plan |
    | `weight_diff_display_threshold` | 0.01 | UI shows `wt: X.XX` only when |w−1| ≥ this; hides cold-start visual noise | This plan |

    Source: `src/lib/sentiment/source-tier-hyperparameters.ts` (Zod-validated at module load).
    ```

    **3c — CI grep guard workflow:**

    Create `.github/workflows/no-hand-curated-tier-weights.yml`:

    ```yaml
    name: No hand-curated tier weights (Phase 20 §S1)

    on:
      pull_request:
        paths:
          - 'src/**'
          - 'tests/**'
          - 'scripts/**'
      push:
        branches: [main]
        paths:
          - 'src/**'
          - 'tests/**'
          - 'scripts/**'

    jobs:
      grep-guard:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - name: Fail on SOURCE_WEIGHT_OVERRIDE / HARD_CODED_TIER / HAND_CURATED_TIER tokens
            run: |
              MATCHES=$(grep -REc 'SOURCE_WEIGHT_OVERRIDE|HARD_CODED_TIER|HAND_CURATED_TIER' src/ tests/ scripts/ || true)
              # Sum line counts per file (grep -c outputs 'file:N' format with -R)
              TOTAL=$(echo "$MATCHES" | awk -F: '{s+=$2} END {print s+0}')
              if [ "$TOTAL" -gt 0 ]; then
                echo "S1 violation: hand-curated tier weight tokens found:"
                grep -REn 'SOURCE_WEIGHT_OVERRIDE|HARD_CODED_TIER|HAND_CURATED_TIER' src/ tests/ scripts/
                exit 1
              fi
              echo "S1 OK: no hand-curated tier weight tokens in src/ tests/ scripts/"
    ```
  </action>
  <verify>
    <automated>test -f .planning/phases/20-real-sentiment-analysis/MODEL-CARD-source-tier.md && grep -q "20-B-04" HYPERPARAMETERS.md && test -f .github/workflows/no-hand-curated-tier-weights.yml && [ "$(grep -REc 'SOURCE_WEIGHT_OVERRIDE|HARD_CODED_TIER|HAND_CURATED_TIER' src/ tests/ scripts/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')" -eq 0 ]</automated>
  </verify>
  <done>Model card committed; HYPERPARAMETERS.md has 20-B-04 section; CI workflow exists and grep guard returns 0 matches on the committed tree</done>
</task>

</tasks>

<verification>
- [ ] `psql $DATABASE_URL -c 'SELECT COUNT(*) FROM source_tiers'` returns ≥ 6 after one cron-equivalent invocation against seeded PerSourceIC fixture (Test 2)
- [ ] `psql $DATABASE_URL -c 'SELECT COUNT(*) FROM source_tiers WHERE weight < 0.5 OR weight > 5.0'` returns 0
- [ ] `psql $DATABASE_URL -c 'SELECT COUNT(DISTINCT weight) FROM source_tiers'` returns ≥ 2 (proves data-driven, not all-1.0 defaults)
- [ ] `grep -REc 'SOURCE_WEIGHT_OVERRIDE|HARD_CODED_TIER|HAND_CURATED_TIER' src/ tests/ scripts/` returns 0 (S1 — no hand-curated weights)
- [ ] UI per-source breakdown shows `wt: X.XX` label on at least one source after Test 3 runs (regression: tier-aware aggregator produces different bull_pct than baseline)
- [ ] All ≥10 unit tests in tests/sentiment-source-tier.unit.test.ts GREEN
- [ ] All 3 integration tests in tests/integration/source-tier-recompute.integration.test.ts GREEN
- [ ] `npm test` and `npm run test:integration` GREEN on `main` post-commit
- [ ] vercel.json contains `"path": "/api/cron/source-tier-recompute"` with `"schedule": "0 7 1 * *"`
- [ ] MODEL-CARD-source-tier.md exists with all Mitchell 2019 sections
- [ ] HYPERPARAMETERS.md contains the 20-B-04 section with all 6 parameters documented
- [ ] `.github/workflows/no-hand-curated-tier-weights.yml` exists and is wired to PR triggers
- [ ] Empty-PerSourceIC graceful exit: `runRecompute()` returns `per_source_ic_table_empty: true` without throwing (Test 1)
- [ ] Cold-start fallback: source with n<30 OR null IC gets weight=1.0 verbatim (Test 8 + Test 2 'newsource')
- [ ] `SOURCE_TIER_MODE` flag introduced with `off|shadow|on` values; default `off`; cutover to `on` BLOCKED until ≥30d SourceTier history AND bootstrap CI lower-bound > 0
</verification>

<success_criteria>
1. Source weights are computed monthly from per-source rolling-90d IC via documented capped-softmax — no hand-curated table anywhere in the repo (CI guard enforces).
2. Cap bounds [0.5, 5.0] are configurable via `SOURCE_TIER_HYPERPARAMETERS` (Zod-validated at module load); no inline literals beyond default-argument fallback.
3. Cold-start sources (n<30 OR null IC) default to weight=1.0; never get softmaxed.
4. `getWeightForSource` cold-start fallback returns 1.0 without throwing when no SourceTier row exists.
5. Aggregator integration is behind `SOURCE_TIER_MODE` flag (`off|shadow|on`); existing `aggregateCommunitySentiment` is preserved unchanged; cutover to `on` is operator-gated.
6. Recompute script gracefully exits 0 with diagnostic when 20-C-01's PerSourceIC table is missing or empty (cross-wave decoupling pact).
7. UI surfaces per-source `wt: X.XX` label only when weight differs from 1.0 by ≥ 0.01 (configurable).
8. Model card (Mitchell 2019 format) committed; retrain cadence (monthly), known failure modes, OOD behavior documented.
9. Monthly cron at `'0 7 1 * *'` wired in vercel.json with CRON_SECRET guard.
10. CI grep guard fails the workflow on any commit introducing `SOURCE_WEIGHT_OVERRIDE` / `HARD_CODED_TIER` / `HAND_CURATED_TIER` tokens.
</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-B-04-SUMMARY.md` documenting:
- Hyperparameter defaults (cap bounds, n_min, window, cron schedule)
- Schema migration applied (`source_tiers` table + index)
- Files created (10) + files modified (3: aggregator.ts, ResearchReport.tsx, vercel.json) + files conditionally created (HYPERPARAMETERS.md if 20-A-03 hadn't merged first)
- Cross-wave dependency note: plan ships at `SOURCE_TIER_MODE=shadow` until 20-C-01 lands AND ≥30d SourceTier history accumulates
- Cutover Gate status snapshot (days_of_history, bootstrap report stub)
- CI guard verified clean on committed tree
- Test results (≥10 unit + 3 integration GREEN)
</output>
