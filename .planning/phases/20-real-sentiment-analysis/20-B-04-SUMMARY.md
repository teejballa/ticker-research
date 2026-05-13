---
phase: 20-real-sentiment-analysis
plan: 20-B-04
subsystem: sentiment
tags: [source-tier, softmax-with-caps, capped-softmax, per-source-ic, cross-wave-decoupling, shadow-lifecycle]

requires:
  - phase: 20-Z-01
    provides: SentimentObservation immutable feature store (PIT-safe via fetched_at)
  - phase: 20-C-01
    provides: PerSourceIC rolling-90d IC table (consumed via raw-SQL adapter; graceful-empty pact)
provides:
  - SourceTier append-only history table (one row per source per monthly recompute)
  - Pure module src/lib/sentiment/source-tier.ts (softmaxWithCaps + computeSourceWeights + getWeightForSource)
  - Hyperparameters src/lib/sentiment/source-tier-hyperparameters.ts (Zod-validated at module load)
  - scripts/recompute-source-tiers.ts (CLI + cron entry; graceful-empty on missing PerSourceIC)
  - /api/cron/source-tier-recompute monthly cron route ('0 7 1 * *')
  - aggregateCommunitySentimentTierAware with SOURCE_TIER_MODE ∈ {off|shadow|on} lifecycle
  - UI per-source 'wt: X.XX' label in ResearchReport (visible when |w-1.0| >= 0.01)
  - MODEL-CARD-source-tier.md (Mitchell 2019)
  - .github/workflows/no-hand-curated-tier-weights.yml CI grep guard (S1 enforcement)
  - HYPERPARAMETERS.md §Phase 20-B-04 entry (6 parameters with rationale + sources)
affects: [20-Z-03 telemetry weight-distribution alerter (forward-reference), 20-C-06 fairness audit (forward-reference)]

tech-stack:
  added: []
  patterns:
    - "Capped softmax × N: numerically stable softmax (max-subtract) → multiply by N so uniform input lands at 1.0 → element-wise clamp to [cap_min, cap_max]. Clamped softmax is NOT a probability distribution (intentional; bounded weighting interpretation)."
    - "Cross-wave decoupling pact: 20-B-04 reads 20-C-01's PerSourceIC table via raw SQL with Prisma P2021 catch + empty-result graceful exit. Plan can MERGE before 20-C-01 ships; aggregator falls back to default weight=1.0 per source until ≥30d of IC accumulates."
    - "Three-mode SOURCE_TIER_MODE flag lifecycle (off|shadow|on) mirrors SENTIMENT_DECAY_MODE precedent from 20-A-03. Cutover from shadow→on operator-gated by paired-bootstrap CI lower-bound > 0 (Hard Cleanup Gate criterion 4)."
    - "Lazy prisma import inside getWeightForSource — keeps the module unit-testable without DATABASE_URL (mirrors computeAuthorConcentration pattern in aggregator.ts)."

key-files:
  created:
    - src/lib/sentiment/source-tier.ts
    - src/lib/sentiment/source-tier-hyperparameters.ts
    - scripts/recompute-source-tiers.ts
    - src/app/api/cron/source-tier-recompute/route.ts
    - tests/sentiment-source-tier.unit.test.ts
    - tests/integration/source-tier-recompute.integration.test.ts
    - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-source-tier.md
    - .github/workflows/no-hand-curated-tier-weights.yml
  modified:
    - prisma/schema.prisma         # +SourceTier model + composite index
    - src/lib/sentiment/aggregator.ts # +aggregateCommunitySentimentTierAware + SourceTierMode
    - src/components/ResearchReport.tsx # +'wt: X.XX' label in per-source breakdown
    - src/lib/types.ts             # +tier_weights_applied + tier_mode on SentimentIntelligenceSection AND AnalysisResult.sentiment_intelligence
    - vercel.json                  # +monthly cron entry '0 7 1 * *'
    - HYPERPARAMETERS.md           # +§Phase 20-B-04 entry (6 parameters)

key-decisions:
  - "softmax × N before clamp: a uniform softmax lands at 1.0 (the 'neutral' weight) instead of 1/N. Without this, every uniform-source ticker would clamp every weight to cap_min — defeating the purpose of softmax. This is the bounded-WEIGHTING interpretation: weight=1.0 means 'average', not 'sums-to-one'."
  - "Cap bounds [0.5, 5.0] configurable via SOURCE_TIER_HYPERPARAMETERS (Zod-validated at module load). NO env-var override path — CI grep guard fails the workflow on SOURCE_WEIGHT_OVERRIDE / HARD_CODED_TIER / HAND_CURATED_TIER tokens (T-20-B-04-04 mitigation)."
  - "Cold-start path: sources with n_observations < 30 OR mean_ic_90d == null persist with weight=1.0 verbatim (NOT softmaxed). UI hides the 'wt:' label for them (|w-1| < 0.01) so they don't look 'down-weighted'."
  - "Aggregator preserves baseline aggregateCommunitySentiment unchanged. The tier-aware path is a SEPARATE async function (aggregateCommunitySentimentTierAware) consumed by callers that hold ticker+date context for the SourceTier lookup. SOURCE_TIER_MODE='off' default ⇒ zero behavior change at deploy."
  - "Cross-wave dependency on 20-C-01 (Wave C) read with raw SQL + Prisma P2021 catch. When PerSourceIC table is missing or empty, runRecompute returns per_source_ic_table_empty=true with rows_written=0 and the cron returns ok=true (NO alert). This plan can merge before 20-C-01 in deploy order without breaking anything."

metrics:
  duration_min: 10
  completed_date: 2026-05-13
  tasks_completed: 9 # Task 2 (live prisma db push) deferred per execution directive
  files_created: 8
  files_modified: 6
  commits: 10
---

# Phase 20 Plan B-04: Source-tier weighting (data-driven, capped softmax of per-source IC) Summary

**One-liner: monthly source-tier recompute via `softmaxWithCaps(mean_IC_per_source, [0.5, 5.0])` over per-source rolling-90d IC, fed by 20-C-01 with graceful-empty cross-wave decoupling and a SOURCE_TIER_MODE off|shadow|on lifecycle.**

## Self-Check: PASSED

- `npx tsc --noEmit` → exit 0 (clean)
- `npm test` → **1299 passed / 2 skipped / 3 todo / 129 files passed** (no regressions; 16 new unit tests)
  - tests/sentiment-source-tier.unit.test.ts: 16 passed (softmax ordering, caps, throws; computeSourceWeights cold-start + eligible; getWeightForSource fallback)
- `npx vitest run --config vitest.integration.config.ts tests/integration/source-tier-recompute.integration.test.ts` → 5 passed (2 always-on: S1 grep guard, off-mode baseline equality; 3 SKIP gracefully when source_tiers table not pushed — DEFERRED per execution directive)
- `npm run check-model-cards` → OK (0 findings)
- `npm run check-immutability` → OK
- `npm run check-telemetry-coverage` → OK (11/11 modules wrapped)
- `npm run check-prompts` → green
- `npm run check-lookahead` → 0 violations / 171 files
- CI grep guard self-check: `grep -REc 'SOURCE_WEIGHT_OVERRIDE|HARD_CODED_TIER|HAND_CURATED_TIER' src/ tests/ scripts/` (excluding the integration test that names the tokens) = **0 matches** (S1 OK)

## Pipeline overview

```
PerSourceIC (20-C-01)  ◄── soft dependency; missing/empty → graceful exit
       │
       ▼
fetchPerSourceIC()  — raw SQL aggregating ic_20d AVG over trailing 90d window
       │             — catches Prisma P2021 (table missing) → []
       ▼
computeSourceWeights(rows)
       │  ─ partitions cold-start (n<30 OR null IC) vs eligible
       │  ─ softmaxWithCaps over eligible mean_ic_90d
       │  ─ cold-start → weight=1.0 verbatim, is_cold_start=true
       ▼
SourceTier.create()  — one row per source per recompute (append-only history)
       │
       ▼
getWeightForSource(source_id, asOf)  — latest row with computed_at <= asOf
       │                              — defensive fallback returns 1.0 (NEVER throws)
       ▼
aggregateCommunitySentimentTierAware(inputs, { mode })
       │  ─ off    → baseline numbers; tier_weights_applied={}
       │  ─ shadow → tier weights surfaced; baseline aggregate authoritative
       │  ─ on     → w'_i = w_i × tier_weight; Beta(5,5) prior re-applied
       ▼
UI: SentimentIntelligenceCard per-source row shows 'wt: X.XX'
    only when |tier_weight - 1.0| >= 0.01 (hides cold-start noise)
```

## Hyperparameter defaults

| Parameter                         | Value         | Source                       |
|-----------------------------------|---------------|------------------------------|
| `cap_min`                         | 0.5           | CONTEXT.md §20-B-04 spec     |
| `cap_max`                         | 5.0           | CONTEXT.md §20-B-04 spec     |
| `n_min_observations`              | 30            | CONTEXT.md §20-B-04 spec     |
| `validation_window_days`          | 90            | CONTEXT.md §20-B-04 spec     |
| `cron_schedule`                   | `0 7 1 * *`   | This plan                    |
| `weight_diff_display_threshold`   | 0.01          | This plan                    |

Source: `src/lib/sentiment/source-tier-hyperparameters.ts` (Zod-validated at module load).

## Schema migration

```prisma
model SourceTier {
  id                     String   @id @default(uuid())
  source_id              String   // matches CipherSource union
  computed_at            DateTime @default(now()) @db.Timestamptz
  mean_ic_90d            Float?   // null for cold-start sources
  weight                 Float    // ∈ [cap_min, cap_max] OR exactly 1.0 for cold-start
  n_observations         Int
  validation_window_days Int      // typically 90
  model_version          String   // partition key

  @@index([source_id, computed_at(sort: Desc)], map: "idx_sourcetier_source_at")
  @@map("source_tiers")
}
```

**Migration status**: schema committed; `npx prisma db push` deferred to operator per execution directive (Task 2 BLOCKING). On next Vercel deploy, `prisma migrate deploy && next build` auto-applies via the `buildCommand` in `vercel.json`.

## Cross-wave dependency snapshot (status: shadow until 20-C-01 lands ≥30d IC)

- Plan ships at `SOURCE_TIER_MODE=off` (default) — zero behavior change at deploy.
- 20-C-01 is in Wave C; PerSourceIC table will accumulate IC daily once that plan's cron starts writing.
- Cutover from `off`/`shadow` → `on` is BLOCKED until:
  - (a) `SELECT MIN(computed_at) FROM source_tiers` is ≥30 days before today AND
  - (b) operator runs `npx tsx scripts/recompute-source-tiers.ts --bootstrap-cutover` and the report shows `ci_lower_95 > 0` on validation Sharpe.
- `bootstrap_report` block is currently a STUB returning `cutover_eligible: false` with days-of-history diagnostic — full implementation lands as a follow-up.

## Threats mitigated

| Threat ID | Disposition | Mitigation |
|-----------|-------------|------------|
| T-20-B-04-01 Single-source dominance at cap=5.0 | mitigate | Cap bounds configurable; monthly review via Phase 20-Z-03 telemetry; MODEL-CARD documents as known failure mode. **Maps to phase catalog T-28-001 (manipulation defense).** |
| T-20-B-04-02 Cold-start gaming | mitigate | 30-day `n_observations` gate + 0.5 floor after measurement; UI 'wt:' label exposes cold-start status visibly. |
| T-20-B-04-03 20-C-01 cross-wave unavailability | mitigate | `fetchPerSourceIC` catches Prisma P2021 + treats any read error as empty; `getWeightForSource` defensive 1.0 fallback; integration test verifies the graceful-exit path. |
| T-20-B-04-04 Hand-curated weight injection | mitigate | NO env-var override path in code; `.github/workflows/no-hand-curated-tier-weights.yml` CI grep guard fails on `SOURCE_WEIGHT_OVERRIDE` / `HARD_CODED_TIER` / `HAND_CURATED_TIER` tokens; verified clean (0 matches) on the committed tree. |
| T-20-B-04-05 IC contamination upstream | accept | Deferred to 20-C-01 + 20-Z-07 lookahead-bias regression. This plan documents the join contract verbatim so 20-C-01 implements to the same PIT semantics. |

## Numerical gates passed

| Gate | Value | Status |
|------|-------|--------|
| softmax×N uniform = 1.0 | `\|w_i - 1.0\| < 1e-9` for [0.1, 0.1, 0.1] | PASS |
| cap_max clamp (1 dominant of 6) | `w[0] === 5.0` for [10, -10, -10, -10, -10, -10] | PASS |
| cap_min clamp on far-below source | `w[2] === 0.5` for [5, 5, -10] | PASS |
| computeSourceWeights bounds invariant | every eligible weight ∈ [0.5, 5.0] for extreme inputs | PASS |
| Cold-start gate (n < 30) | weight = 1.0 + is_cold_start=true | PASS |
| Cold-start gate (null IC) | weight = 1.0 + is_cold_start=true | PASS |
| getWeightForSource cold-start fallback | returns 1.0 on null Prisma row | PASS |
| getWeightForSource defensive DB error | returns 1.0 on rejection (never throws) | PASS |
| off-mode baseline equality | tierAware === baseline numbers, tier_weights_applied={} | PASS |
| S1 CI grep guard | 0 matches on `SOURCE_WEIGHT_OVERRIDE`/`HARD_CODED_TIER`/`HAND_CURATED_TIER` in src/tests/scripts | PASS |
| TypeScript strict | 0 errors | PASS |
| Vitest unit | 1299 passed / 0 failed (16 new) | PASS |
| Vitest integration | 5/5 in the new suite (3 graceful-skip on deferred db push) | PASS |
| All Phase 20 guard scripts (model-cards / immutability / telemetry / prompts / lookahead) | all green | PASS |

## Commits

1. `0f341dd` feat(20-B-04): add SourceTier Prisma model + composite index
2. `c99d0d9` feat(20-B-04): add source-tier hyperparameters with Zod validation
3. `01d56d6` feat(20-B-04): add source-tier pure functions (softmaxWithCaps + computeSourceWeights + getWeightForSource)
4. `288c0b6` test(20-B-04): 16 unit cases for softmaxWithCaps + computeSourceWeights + getWeightForSource
5. `6a9e769` feat(20-B-04): monthly recompute script for source-tier weights
6. `4564528` feat(20-B-04): monthly cron route /api/cron/source-tier-recompute
7. `0b2896e` feat(20-B-04): aggregator SOURCE_TIER_MODE flag + UI 'wt:' per-source label
8. `b2686ce` test(20-B-04): live-Neon integration test with graceful skip for deferred db push
9. `f1834ca` docs(20-B-04): model card + HYPERPARAMETERS entry + CI grep guard workflow
10. `9683f74` fix(20-B-04): lazy-import prisma in getWeightForSource to keep module unit-testable

## Deviations from plan

1. **Task 2 (live `npx prisma db push`) deferred to operator** — per the execution directive, the migration is committed via `prisma/schema.prisma` and auto-applies on next deploy via `vercel.json` buildCommand (`prisma migrate deploy && next build`). The integration test gracefully SKIPS the 3 DB-touching cases when the table is not yet pushed; the 2 always-on cases (S1 grep guard + off-mode baseline equality) run unconditionally and PASS.
2. **Test case wording adjusted in unit tests for cap_max clamp**: the original plan asserted `softmaxWithCaps([10, -10, -10]) → [5.0, 0.5, 0.5]`. With N=3 and the `softmax × N` convention, the dominant source's pre-clamp weight is `~3.0` (3 × softmax_share≈1), which doesn't trigger the cap_max ceiling of 5.0. Updated the test to use N=6 sources with one dominant, where the pre-clamp weight is `~6.0 → clamps to 5.0`. Same exact gate enforced; bigger sample size to actually exercise the ceiling. Documented inline in test comments.
3. **Cap_min clamp test (case 4) reworked**: the original plan asserted `softmaxWithCaps([5, -5]) → [5.0, 0.5]`. With N=2 the pre-clamp weights are ~2.0 and ~0.0001 — only the floor triggers, not the ceiling. Updated to `[5, 5, -10]` (N=3) where the third weight `~0` clamps to floor 0.5; cleaner demonstration of the cap_min path.
4. **getWeightForSource lazy import of `@/lib/db`** (fix commit `9683f74`) — without this, importing `aggregator.ts` (which now imports `source-tier.ts`) crashes every test that doesn't mock the prisma singleton because `db.ts` throws at module load on missing DATABASE_URL. The fix mirrors the `computeAuthorConcentration` lazy-import pattern already in `aggregator.ts`. Added a 3rd unit test case for "DB throws → returns 1.0" since this defensive path is now reachable.
5. **Cron schedule collision noted**: `vercel.json` already has `/api/cron/calibrate-crowded-consensus` at `'0 7 1 * *'` (the same monthly slot). Per the plan spec verbatim, kept the slot — both crons are short-running and Neon is fine with the concurrency. If this becomes an operator problem, the schedule is a Zod-validated hyperparameter and can move (e.g., `'0 8 1 * *'`) in a follow-up PR.

## Deferred items

- **Operator action: `npx prisma db push`** against live Neon (or wait for the next deploy's `prisma migrate deploy && next build` to auto-apply).
- **Operator action: 30-day post-deploy revisit** — run `npx tsx scripts/recompute-source-tiers.ts --bootstrap-cutover` once 20-C-01 has shipped + accumulated ≥30d of IC; gate the `SOURCE_TIER_MODE=on` cutover on `ci_lower_95 > 0`.
- **Bootstrap-cutover full implementation** — the script currently STUBs the paired-bootstrap report; the full 1000-resample Sharpe-uplift calculation lands as a follow-up plan after 20-C-01's IC table has accumulated enough history to make the bootstrap meaningful.
- **20-Z-03 weight-distribution alerter** (forward-reference) — telemetry on tier-weight concentration per ticker; alert when >70% of weight concentrates on one source for ≥7 days (T-20-B-04-01 mitigation).
- **20-C-06 fairness audit** (forward-reference) — per-segment evaluation (cap_class × sector stratification).

## Self-Check: PASSED

All numerical gates met; all guard scripts green; per-task commits in place; SUMMARY committed.
