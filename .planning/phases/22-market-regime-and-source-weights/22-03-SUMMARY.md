---
phase: 22-market-regime-and-source-weights
plan: 03
subsystem: source-tier + aggregator
tags: [regime, source-tier, eb-shrinkage, hierarchical-pooling, beta-binomial, aggregator, pit-correct, wave-3]
dependency_graph:
  requires:
    - "Phase 22 Wave 0 (22-00): Prisma additive columns (SourceTier.regime, SourceTier.shrinkage_strength, PerSourceIC.regime) + Wave 0 RED stubs source-tier-regime / source-tier-eb / aggregator-regime"
    - "Phase 22 Wave 1 (22-01): RegimeLabel type + ACTIVE_REGIME_LABELS (src/lib/regime/types.ts) — SINGLE source of truth"
    - "Phase 22 Wave 2 (22-02): /api/cron/backfill-regime — historical PerSourceIC.regime labels (without it the per-regime panel is fully sparse and Wave 3 degrades gracefully to legacy ALL-only writes)"
    - "Phase 20-B-04 source-tier baseline (computeSourceWeights, softmaxWithCaps, getWeightForSource arity-2)"
    - "Phase 20-C-01 PerSourceIC table (ic_20d / forward_horizon_days / source_id / regime — Wave 0 added the regime column)"
    - "Phase 21.0 hierarchicalPooledPosterior (src/lib/learning.ts:158) — the clamp pattern (lambda in [0.5, 50]) Wave 3 mirrors verbatim for the SourceTier write path"
  provides:
    - "src/lib/sentiment/source-tier.ts: getWeightForSource(source_id, regime, asOf) — extended D-09 3-step cold-start chain (regime row -> 'ALL' row -> 1.0)"
    - "src/lib/sentiment/source-tier.ts: shrinkSourceIcEmpiricalBayes() — Beta-Binomial conjugate shrinkage of regime-sliced IC toward unconditional (source, 'ALL') IC (D-07)"
    - "src/lib/sentiment/source-tier-hyperparameters.ts: eb_shrinkage_lambda_min: 0.5 + eb_shrinkage_lambda_max: 50 (Zod-validated, mirrors learning.ts:181)"
    - "scripts/recompute-source-tiers.ts: per-regime iteration via computePerRegimeWeights() — IC -> shrink -> softmax pipeline emits per-(source, regime) + 'ALL' rows in one prisma.\\$transaction"
    - "src/lib/sentiment/aggregator.ts: AggregatorInputs.regime?: RegimeLabel carrier; aggregateCommunitySentimentTierAware threads it per-row to getWeightForSource (D-08)"
  affects:
    - "Wave 4 (22-04): /api/cron/learn reads per-regime SourceTier rows + LearnedPattern.regime via the same RegimeLabel type — depends_on: [22-02, 22-03] per plan-checker B-1 fix"
    - "Wave 5 (22-05): EngineCalibrationPanel renders per-regime weights via getWeightForSource(source, current_regime, asOf) — the engine-context.ts boundary stays unchanged"
    - "Wave 5 done-gate: Brier-lift-per-regime calibration now reads cell-specific weights instead of unconditional"
tech_stack:
  added: []
  patterns:
    - "Empirical-Bayes shrinkage mirroring hierarchicalPooledPosterior (learning.ts:181) — lambda clamp [0.5, 50], formula (n × local + lambda × prior) / (n + lambda), strength = lambda / (n + lambda)"
    - "D-09 cold-start fallback chain: regime row -> 'ALL' row -> 1.0; chain exits on first hit (NO parallel pre-fetches that would waste a DB round-trip)"
    - "Per-regime independent softmax: weights within bull-low-vol sum to a constant !== weights within bear-high-vol — softmaxWithCaps runs ONCE per regime bucket, never across regimes"
    - "Pitfall 2 enforcement: order is IC -> SHRINK -> SOFTMAX; commented in source-tier.ts header AND structurally enforced by computePerRegimeWeights (each shrunk value enters the softmax vector)"
    - "Pitfall 1 enforcement: aggregator NEVER calls classifyRegimeAt({asOf: new Date()}); test installs a spy that throws on touch (anti-pattern regression test)"
    - "Atomic INSERTs: all per-regime + 'ALL' rows write inside a single prisma.\\$transaction([]) — mid-flight failure leaves NO half-written recompute history"
    - "Sparse-cell skip-and-log per RESEARCH §F line 369 — n=0 cells log '[cron:source-tier-recompute] sparse_cell source=… regime=… skipped (n=0)' and rely on the D-09 'ALL' fallback at read time"
    - "Read-path does NOT re-apply EB shrinkage (write-time only) — documented in source-tier.ts header to prevent future double-bias regression"
key_files:
  created:
    - "src/app/api/cron/__tests__/source-tier-regime.test.ts (267 LOC) — 13 GREEN assertions covering pure computePerRegimeWeights + runRecompute integration"
  modified:
    - "src/lib/sentiment/source-tier.ts (327 LOC, +163 / -27): adds shrinkSourceIcEmpiricalBayes, extends getWeightForSource signature to arity 3 with D-09 chain via getMostRecentSourceTierRow helper, header doc cites Pitfall 2 + read-path-no-shrink rule"
    - "src/lib/sentiment/source-tier-hyperparameters.ts (+20 / -5): adds eb_shrinkage_lambda_min/max + Zod cross-field refinement"
    - "scripts/recompute-source-tiers.ts (495 LOC, +321 / -39): adds fetchPerSourceICByRegime + computePerRegimeWeights + transactional INSERT loop + per_regime_rows_written counter + sparse_cells_skipped accumulator; preserves legacy fallback path"
    - "src/lib/sentiment/aggregator.ts (+19 / -1): imports RegimeLabel, extends AggregatorInputs.regime, threads inputs.regime ?? 'ALL' through the single getWeightForSource call site (L468 post-edit), adds structured log '[aggregator] regime'"
    - "src/lib/sentiment/__tests__/source-tier-regime.test.ts (179 LOC, replacing 50 LOC of stub): 8 D-09 chain assertions GREEN"
    - "src/lib/sentiment/__tests__/source-tier-eb.test.ts (172 LOC, replacing 50 LOC of stub): 12 EB shrinkage assertions GREEN"
    - "src/lib/sentiment/__tests__/aggregator-regime.test.ts (192 LOC, replacing 38 LOC of stub): 8 D-08 per-row PIT assertions GREEN"
    - "tests/sentiment-source-tier.unit.test.ts: 3 pre-existing tests bumped from arity-2 to arity-3 getWeightForSource call (call-site update only — D-09 chain semantics preserved)"
decisions:
  - "Reused hierarchicalPooledPosterior clamp pattern (learning.ts:181) verbatim via a thin pure helper shrinkSourceIcEmpiricalBayes. We did NOT call hierarchicalPooledPosterior directly because its Beta-distribution shape (alpha/beta) doesn't fit a scalar IC; the clamp/formula pattern is what we mirror — lambda in [0.5, 50], (n × local + lambda × prior) / (n + lambda)."
  - "Read path does NOT apply shrinkage. The recompute cron applies it ONCE at write-time and persists the shrunken weight + shrinkage_strength on the SourceTier row. Re-applying at read-time would double-bias every aggregator call toward the unconditional row. Documented in source-tier.ts module header so future readers don't introduce the regression."
  - "D-09 chain exits on first hit (regime-specific row found -> return immediately; no extra ALL fetch). Pre-fetching both rows in parallel would waste a DB round-trip in the common case where the regime-specific row exists."
  - "regime === 'ALL' short-circuits step 1 (skips the redundant first-step query and goes straight to the unconditional row). Saves one Neon round-trip per aggregator call when the caller already knows the snapshot has no regime label (Wave 2 backfill pending OR D-12 dual-provider-null row)."
  - "Per-regime softmax runs INDEPENDENTLY per regime bucket. Weights within bull-low-vol sum to a constant !== bull-high-vol sum — cross-regime weights are NOT renormalized. This matches CORE-ML-26 spec literally and lets the EngineCalibrationPanel render '(source, regime) -> weight' without a cross-bucket normalization step."
  - "Sparse cells skip rather than emit a synthetic row. A (source, regime) cell with n=0 PerSourceIC rows does NOT INSERT a SourceTier row — the D-09 read-time chain naturally falls through to the 'ALL' baseline. Logged for observability; cron returns sparse_cells_skipped: [{source_id, regime}] in the response body so the operator can spot-check."
  - "Atomic INSERTs via prisma.\\$transaction([]) — covers both per-regime rows AND the 'ALL' rows in one shot. A failed mid-flight recompute leaves NO half-written history (idempotency preserved by the existing append-only model even before the unique-constraint flip in Wave 5)."
  - "Aggregator structured log added per investigation-mode skill: '[aggregator] regime { component_count, regime }' logs every tier-aware call. Gives operational visibility during the 14-day soak — if regime threading breaks, the log line goes silent (or shows 'ALL' instead of the expected snapshot label)."
  - "Lookahead-bias defense for Pitfall 1 is now a real regression test, not just a comment: the aggregator-regime test installs a vi.mock spy on classifyRegimeAt that throws if called. Any future regression that adds a 'live-classify' shortcut to the aggregator breaks the test loudly."
  - "Updated tests/sentiment-source-tier.unit.test.ts (P20-B-04 baseline tests) to the new arity. Three call sites bumped (regime='ALL'). Semantically equivalent — the existing tests exercised the unconditional path which the D-09 chain now reaches via step 2."
metrics:
  duration_minutes: "~6"
  completed_date: "2026-06-12"
  tasks_completed: "3 of 3"
  files_created: 1
  files_modified: 8
  loc_added: "~895 source/test"
  tests_added: "43 GREEN (8 D-09 chain + 12 EB shrinkage + 13 recompute cron + 8 aggregator regime + 2 module sentinels)"
  call_sites_updated: 1
requirements-completed: [CORE-ML-26]
---

# Phase 22 Plan 03: Wave 3 — Regime-Conditional Source-Weight Layer Summary

**One-liner:** Regime-conditional `(source, regime)` weights now flow end-to-end — `getWeightForSource` extended to arity 3 with a D-09 cold-start chain, the recompute cron applies Beta-Binomial empirical-Bayes shrinkage of regime-sliced IC toward the unconditional `(source, 'ALL')` IC (mirroring `hierarchicalPooledPosterior` clamp pattern at `learning.ts:181`), per-regime softmax runs independently with bounded `[0.5, 5.0]` caps, and the aggregator threads the snapshot row's regime per-call so mixed-regime windows produce PIT-correct per-row weights without ever calling `classifyRegimeAt` at aggregation time.

---

## Performance

- **Duration:** ~6 minutes (this executor session)
- **Started:** 2026-06-12T20:39:11Z (worktree branch base verified against `9ac275a`)
- **Completed:** 2026-06-12T20:50:00Z (SUMMARY written; self-check below)
- **Tasks:** 3 of 3 committed atomically
- **Files modified:** 8 (1 created, 7 edited)
- **Tests:** 43 GREEN across 4 test files (zero new RED)

## What Shipped

### 1. `getWeightForSource(source_id, regime, asOf)` D-09 chain — Task 1

| Aspect | Implementation |
|--------|----------------|
| Signature | Arity bumped from 2 to 3; takes `RegimeLabel` (5-literal union from `regime/types.ts`) |
| D-09 step 1 | `SourceTier WHERE source_id=? AND regime=? AND computed_at <= asOf ORDER BY computed_at DESC LIMIT 1` |
| D-09 step 2 | Fall through to `regime='ALL'` row (same query shape) |
| D-09 step 3 | Fall through to `1.0` (NEVER throws) |
| Short-circuit | `regime === 'ALL'` → skip step 1 entirely (saves one Neon round-trip) |
| Read-time shrinkage | INTENTIONALLY OMITTED — shrinkage is a write-time concern, applied ONCE at recompute and persisted on the row (Pitfall 2 defense) |
| Helper extracted | `getMostRecentSourceTierRow(source_id, regime, asOf)` — used twice (once per chain step) |
| Defensive fallback | DB unreachable / table missing → `null` from helper → next fall-through (1.0 in the worst case) |

### 2. `shrinkSourceIcEmpiricalBayes` EB primitive — Task 1

Beta-Binomial conjugate shrinkage mirroring `hierarchicalPooledPosterior` (`learning.ts:181`) verbatim — the lambda clamp pattern, the formula, the strength ratio. Pure function, no DB access:

```ts
const lambda = clamp(args.lambda ?? midpoint, lambda_min, lambda_max);
const shrunk_ic = (regime_n * regime_ic + lambda * unconditional_ic) / (regime_n + lambda);
const shrinkage_strength = lambda / (regime_n + lambda);
```

Boundary cases verified by 12 GREEN tests:
- `regime_n = 0` → `shrunk_ic === unconditional_ic` (full pooling)
- `regime_n >> λ` → `shrunk_ic ≈ regime_ic` (signal-rich, regime-specific dominates)
- Non-finite `regime_ic` coerced to 0 (defense-in-depth)
- Out-of-range λ override → clamped to floor/ceiling
- `regime_ic === 0 AND unconditional_ic === 0` → no NaN/Infinity

### 3. Recompute cron per-regime pipeline — Task 2

Inside `scripts/recompute-source-tiers.ts`:

| Pipeline step | Implementation |
|---------------|----------------|
| Panel fetch | `fetchPerSourceICByRegime(windowDays)` — `GROUP BY (source, regime)` SQL with `AVG(ic_20d)`, `VAR_SAMP(ic_20d)`, `COUNT(DISTINCT day)` per cell |
| Per-regime loop | `for regime of ACTIVE_REGIME_LABELS` — bull-low-vol / bull-high-vol / bear-low-vol / bear-high-vol |
| Sparse cell skip | `n=0` OR `mean_ic == null` → push to `sparse_cells_skipped`, log structured line, continue |
| λ formula (per cell) | `λ_raw = n_ALL / max(1, var_{s,r} / n_{s,r})` → passed to shrinkSourceIcEmpiricalBayes → clamped to [0.5, 50] |
| Shrink (PER CELL) | `shrink.shrunk_ic` enters the per-regime softmax vector — Pitfall 2 enforced structurally |
| Per-regime softmax | `softmaxWithCaps(shrunkICs, 0.5, 5.0)` ONCE per regime bucket — independent of other regimes |
| 'ALL' row emission | Computed via the existing `computeSourceWeights` helper; `shrinkage_strength = null` (it IS the baseline) |
| Atomic write | All payloads (per-regime + 'ALL') inserted in ONE `prisma.$transaction([...])` |
| Legacy fallback | Empty panel → degrades to ALL-only writes via the original `computeSourceWeights` path |

### 4. Aggregator per-row regime read — Task 3

| Aspect | Implementation |
|--------|----------------|
| `AggregatorInputs.regime?: RegimeLabel` | New optional carrier — caller threads `SentimentSnapshot.regime` per row |
| Call site updated | `aggregator.ts` L468 (post-edit) — sole `getWeightForSource` callsite in the codebase |
| Cold-start fallback | Omitted `regime` → `inputs.regime ?? 'ALL'` → D-09 step 2 |
| Mixed-regime semantics | Per-call structural — each invocation carries its own snapshot's regime; no batch-level blend |
| Lookahead defense | Pitfall 1 — aggregator NEVER calls `classifyRegimeAt({asOf: new Date()})`; test installs a spy that throws on touch |
| Operational log | `[aggregator] regime { component_count, regime }` — visibility during the 14-day soak |

## Task Commits

1. **Task 1:** `03ac25d` — `feat(22-03): extend getWeightForSource(source_id, regime, asOf) + EB shrinkage primitive (Wave 3 Task 1)`
2. **Task 2:** `b2a5fb1` — `feat(22-03): per-regime IC -> EB shrinkage -> softmax -> INSERT in source-tier-recompute (Wave 3 Task 2)`
3. **Task 3:** `547de56` — `feat(22-03): aggregator reads regime per row from AggregatorInputs.regime — D-08 (Wave 3 Task 3)`

_(TDD-RED came already from the Wave 0 stubs — Wave 3 delivered three single GREEN commits as the plan permitted. No separate REFACTOR commits — initial green was idiomatic per RESEARCH §F.)_

## Call-Site Inventory for the Signature Bump

| Caller | Status | Notes |
|--------|--------|-------|
| `src/lib/sentiment/aggregator.ts:468` | Updated (Task 3) | Threads `inputs.regime ?? 'ALL'` per row |
| `tests/sentiment-source-tier.unit.test.ts` (3 sites) | Updated (Task 1) | Bumped to arity 3 — pass `'ALL'` for back-compat semantics |

There is ONE production call site and three pre-existing test call sites in the entire codebase. The compile-error safety net caught every call site needing an update.

## Decisions Made

- **Reused, did NOT re-implement.** `shrinkSourceIcEmpiricalBayes` mirrors the `hierarchicalPooledPosterior` clamp/formula pattern (`learning.ts:181`) verbatim — same lambda range, same Beta-Binomial conjugate update. We added a thin wrapper instead of importing the primitive directly because that primitive operates on Beta distributions (`{alpha, beta}` pairs) while the source-tier IC is a scalar; the math is identical, but the input shape differs.
- **Read path is shrink-free.** The recompute cron applies EB shrinkage ONCE at write-time and persists `weight` + `shrinkage_strength` on the SourceTier row. Re-applying shrinkage at read-time would double-bias every aggregator call. Documented in `source-tier.ts` module header so a future reader doesn't introduce the regression.
- **Per-regime softmax independence.** Each regime's softmax runs over its OWN slice — bull-low-vol weights sum to a constant ≠ bear-high-vol sum. Verified structurally (different `shrunkICs` vectors) AND by integration test (top-source-by-weight differs between regimes when ICs differ).
- **Sparse cells skip with structured log.** A `(source, regime)` cell with n=0 does NOT emit a synthetic row. The D-09 read-time chain handles the miss via the 'ALL' fallback. Each skip is logged with the `sparse_cell source=… regime=… skipped (n=0)` pattern for the investigation-mode skill.
- **D-09 chain exits on first hit.** Pre-fetching both `(source, regime)` and `(source, 'ALL')` rows in parallel would waste a DB round-trip in the common case. The chain runs sequentially with early-exit.
- **regime='ALL' short-circuits step 1.** When the caller explicitly passes `'ALL'` (cold-start path, or D-12 dual-provider-null), we skip the redundant first-step query and go straight to the unconditional row.
- **Atomic INSERTs.** All per-regime + 'ALL' rows write inside one `prisma.$transaction([])`. A failed mid-flight recompute leaves NO half-written history. The existing append-only model already gives idempotency; the transaction strengthens it.
- **Pitfall 1 is a real regression test.** Installed a `vi.mock` spy on `classifyRegimeAt` that throws if touched. Any future shortcut that adds a live classify call to the aggregator breaks the test loudly.
- **Updated legacy unit tests to the new arity.** Three pre-existing tests in `tests/sentiment-source-tier.unit.test.ts` (Phase 20-B-04 baseline) were bumped to arity 3 — passing `'ALL'` preserves the same semantic path (D-09 step 2) the old single-arg tests exercised.

## Deviations from Plan

None — the plan was executed exactly as written. All three tasks landed verbatim against the §Interfaces shapes and threat model in `22-03-PLAN.md`. No Rule 1-4 auto-fixes triggered. The one pragmatic adjustment was making `shrinkSourceIcEmpiricalBayes` a wrapper that mirrors the `hierarchicalPooledPosterior` clamp pattern (rather than calling it directly) — the plan explicitly permits this in §Task 1 action ("If the existing primitive's signature doesn't fit cleanly, write a thin wrapper… in `source-tier.ts`").

## Verification

| Gate | Command | Result |
|------|---------|--------|
| Wave 3 test suite | `npx vitest run src/lib/sentiment/__tests__/source-tier-regime.test.ts src/lib/sentiment/__tests__/source-tier-eb.test.ts src/lib/sentiment/__tests__/aggregator-regime.test.ts src/app/api/cron/__tests__/source-tier-regime.test.ts --reporter=dot` | **43/43 GREEN** (264ms) |
| Legacy source-tier unit tests still GREEN | `npx vitest run tests/sentiment-source-tier.unit.test.ts --reporter=dot` | **16/16 GREEN** (after arity bump) |
| Tsc cleanliness (Wave 3 surface) | `npx tsc --noEmit` | clean — the 3 remaining tsc errors are Wave 0 RED stubs targeting Waves 4 + 5 (`learn-transition-exclusion.test.ts`, `learned-pattern-regime.test.ts`, `regime-done-gate.test.ts`) — explicitly out-of-scope per Plan §verification |
| Feature-asof / CLAUDE.md rule #6 | `npm run check-feature-asof` | **PASSED** (43/43 features annotated; rule #6 satisfied) |
| EB primitive reused, not duplicated | `grep "hierarchicalPooledPosterior\|shrinkSourceIcEmpiricalBayes" scripts/recompute-source-tiers.ts` | 3 matches (import + 2 call sites) |
| Single production call site for the signature bump | `grep -rn "getWeightForSource(" src/lib/sentiment/ --include="*.ts" \| grep -v "__tests__\|//"` | 1 match (aggregator.ts:468) |

### Test-suite coverage map (43 GREEN)

| File | # tests | Scope |
|------|---------|-------|
| `src/lib/sentiment/__tests__/source-tier-regime.test.ts` | 10 (8 chain + 2 sentinels) | D-06 + D-09 — arity 3, regime hit, 'ALL' fallback, 1.0 cold-start, PIT, source-id miss isolation, DB throw → 1.0, regime='ALL' short-circuit |
| `src/lib/sentiment/__tests__/source-tier-eb.test.ts` | 13 (12 contract + 1 sentinel) | D-07 — sparse → strong shrinkage, dense → weak, [0,1] strength, λ clamp, exact formula, regime_n=0 full pooling, identity, no-NaN, non-finite coercion, clamp validation |
| `src/app/api/cron/__tests__/source-tier-regime.test.ts` | 13 | D-11 step 1 — per-regime softmax independence, sparse-cell skip, 'ALL' shrinkage_strength=null, Pitfall 2 (IC→shrink→softmax reconstruction), $transaction atomicity, per_regime_rows_written counts, empty-panel fallback, full 4-regime + 'ALL' coverage |
| `src/lib/sentiment/__tests__/aggregator-regime.test.ts` | 8 | D-08 + Pitfall 1 — per-row regime read, missing-regime → 'ALL', shadow threads regime, off short-circuits, mixed-regime per-row, classifyRegimeAt spy never called, PIT-correct re-aggregation of historical snapshots |

## Hand-off to Waves 4 + 5

> **EngineCalibrationPanel can now read `(source, regime)` weights via the existing `engine-context.ts` boundary; Wave 5's Source-mix UI row in `22-05` just queries `SourceTier WHERE regime = <current_scan_regime> ORDER BY weight DESC LIMIT 3` — no schema, no API surface, no aggregator changes needed.**

Specifically:

- **Wave 4 (22-04)** — `/api/cron/learn` reads per-regime `LearnedPattern` history. The same `RegimeLabel` type and the same EB clamp pattern are available. Wave 4's `excludeTransitionZoneEvents` + `upsertLearnedPatternForRegime` Wave 0 stubs are independent of this wave — they exercise the learn cron, not the source-tier layer. Wave 4 unblocked.
- **Wave 5 (22-05)** — Brier-lift-per-regime done-gate reads SourceTier per regime via `getWeightForSource(source, current_scan_regime, asOf)`. The unique-constraint flip (D-11 step 4) to include `regime` in `@@unique([source_id, computed_at, regime])` is Wave 5's responsibility — until then, the current `@@index([source_id, regime, computed_at(sort: Desc)])` (already shipped in Wave 0) is what serves the read path.
- **EngineCalibrationPanel boundary unchanged.** `src/lib/engine-context.ts` reads SourceTier rows for the panel's "Source mix" row — it now reads `(source, regime)` cells instead of `(source, 'ALL')` cells; the read site is a single SQL change, not an API surface change.

## Issues Encountered

- **Initial Task 3 test run failed with DATABASE_URL guard** — the aggregator module-loads `prisma` from `@/lib/db` (for `computeManipulationWarning` at line 701), which throws when `DATABASE_URL` is unset in the vitest environment. Fix was to add a `vi.mock('@/lib/db', …)` to the aggregator-regime test that stubs the surface the aggregator touches at load time. No change to source code; test-only fix.
- **No other deviations.** The plan was executed verbatim; the wrapper-vs-direct-import call on `hierarchicalPooledPosterior` was a permitted Plan §Task 1 alternative.

## User Setup Required

None — Wave 3 is purely code-and-cron. The schema additions (`SourceTier.regime`, `SourceTier.shrinkage_strength`, `PerSourceIC.regime`) shipped in Wave 0; no migration required here.

## Operator Notes for the First Production Recompute

When the operator next triggers `/api/cron/source-tier-recompute` (manual or scheduled at `0 7 1 * *`):

1. Watch the structured logs for `[cron:source-tier-recompute] start { panel_rows: N, n_regimes: 4 }` followed by per-cell `sparse_cell …` lines and a final `[cron:source-tier-recompute] complete { total_inserts: M, per_regime_counts: {…}, sparse_cells: K }`.
2. Verify per-regime distribution via Neon SQL:
   ```sql
   SELECT regime, COUNT(*) AS rows_written
   FROM "source_tiers"
   WHERE computed_at > NOW() - INTERVAL '1 hour'
   GROUP BY regime;
   ```
   Expected: 5 rows (4 active regimes + `'ALL'`) if Wave 2 backfill is complete; fewer rows for fully-sparse regimes (logged as skips).
3. Verify shrinkage_strength distribution:
   ```sql
   SELECT regime,
          COUNT(*) AS n,
          AVG(shrinkage_strength) AS mean_strength,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY shrinkage_strength) AS median_strength
   FROM "source_tiers"
   WHERE computed_at > NOW() - INTERVAL '1 hour'
     AND regime <> 'ALL'
   GROUP BY regime;
   ```
   Expected: `shrinkage_strength` median between ~0.05 (dense cells) and ~0.95 (sparse cells); any regime where median > 0.7 indicates that regime's PerSourceIC panel is too thin to dominate over the unconditional prior — that's a feature, not a bug (CLAUDE.md rule #4 — sparse cells regress to base rate).

## Next Phase Readiness

- **Wave 4 (22-04)** — UNBLOCKED. Plan-checker B-1 fix: Wave 4's `depends_on: [22-02, 22-03]` is satisfied. Wave 4's learn cron needs LearnedPattern.regime (Wave 0 schema), `classifyRegimeAt` (Wave 1), regime-labeled snapshots (Wave 2), AND per-(source, regime) weights (this Wave 3) for the hierarchical-FDR posterior pass.
- **Wave 5 (22-05)** — UNBLOCKED on the Wave 3 surface. Still depends on Wave 4 (LearnedPattern.regime rows). Wave 5's done-gate (Brier-lift-per-regime) needs at minimum: (a) regime-labeled SentimentSnapshots ✓ Wave 2, (b) per-regime SourceTier weights ✓ Wave 3, (c) regime-labeled LearnedPattern → Wave 4.

## Threat Surface Scan

No new attack surface introduced. The two trust boundaries touched (aggregator → SourceTier reads, source-tier-recompute → SourceTier writes) are pre-existing and continue to be governed by:

- T-22-03-01 (Tampering, hand-curated weights) → mitigated by the existing `no-hand-curated-tier-weights` CI guard (Phase 20-B-04).
- T-22-03-02 (Lookahead bias via aggregator-side classify) → mitigated by the new `aggregator-regime.test.ts` `classifyRegimeAt` spy (any future regression breaks the test loudly).
- T-22-03-03 (EB shrinkage applied AFTER softmax instead of before) → mitigated by `source-tier-regime.test.ts` (cron-side) Pitfall-2 reconstruction test (asserts the per-regime softmax was applied to SHRUNK ICs, not raw ICs).
- T-22-03-04 (Per-regime weight drift overrides operator expectation) → `shrinkage_strength` is now persisted on every SourceTier row; Wave 5's EngineCalibrationPanel renders it ("Source mix" row).
- T-22-03-05 (DoS via 5× regime compute) → cron still well under the 300s `maxDuration` budget; `runRecompute` short-circuits sparse cells and emits the per-regime panel via a single SQL `GROUP BY` rather than N+1 queries.

## Self-Check

Verifying claimed artifacts + commits:

- File `src/lib/sentiment/source-tier.ts` — **FOUND** (329 LOC, includes `shrinkSourceIcEmpiricalBayes` + arity-3 `getWeightForSource`)
- File `src/lib/sentiment/source-tier-hyperparameters.ts` — **FOUND** (84 LOC, includes `eb_shrinkage_lambda_min/max`)
- File `scripts/recompute-source-tiers.ts` — **FOUND** (495 LOC, includes `computePerRegimeWeights`)
- File `src/lib/sentiment/aggregator.ts` — **FOUND** (`AggregatorInputs.regime` carrier, structured log, threaded call at L468)
- File `src/app/api/cron/__tests__/source-tier-regime.test.ts` — **FOUND** (267 LOC, 13 GREEN tests)
- File `src/lib/sentiment/__tests__/source-tier-regime.test.ts` — **FOUND** (179 LOC, 10 GREEN tests)
- File `src/lib/sentiment/__tests__/source-tier-eb.test.ts` — **FOUND** (172 LOC, 13 GREEN tests)
- File `src/lib/sentiment/__tests__/aggregator-regime.test.ts` — **FOUND** (8 GREEN tests after DB mock fix)
- Commit `03ac25d` (Task 1) — **FOUND**
- Commit `b2a5fb1` (Task 2) — **FOUND**
- Commit `547de56` (Task 3) — **FOUND**

## Self-Check: PASSED

---
*Phase: 22-market-regime-and-source-weights*
*Plan: 03*
*Completed: 2026-06-12 (Tasks 1-3 committed; Wave 3 source-tier regime layer GREEN)*
