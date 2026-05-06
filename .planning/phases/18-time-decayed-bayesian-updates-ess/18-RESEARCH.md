# Phase 18: Time-Decayed Bayesian Updates + ESS — Research

**Researched:** 2026-05-04
**Domain:** Bayesian online learning, drift detection, time-series CV
**Confidence:** HIGH (decisions locked in CONTEXT.md; this doc is implementation pattern)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01..D-20 in `18-CONTEXT.md`. Salient implementation invariants:
- Per-class λ via grid `{14,30,60,90,180,365}` tuned with **Purged K-Fold + Embargo** (purge=embargo=90d), scored OOS Brier. No global default.
- ESS via **Kish**: `(Σwᵢ)² / Σwᵢ²`, `wᵢ = exp(−Δtᵢ/λ)`, Δtᵢ in days from `recorded_at` to `now()`.
- Promotion gate: `effective_sample_size < 30 → EXPLORATORY`.
- Drift detector: **two-of-two** (`|drift_z|>2` AND Page-Hinkley over threshold). Min raw N≥30. Per-class (δ,λ_PH) tuned via same CV protocol on synthetic-injected drift.
- Drift fires → write `drift_alert` LearningEvent + flip `status='EXPLORATORY-WATCH'`. **No auto-demote.** Recovery: 14 consecutive clear days AND ESS≥30.
- Backfill: idempotent route `/api/cron/backfill-ess`, env-flag gated, single `prisma.$transaction` over all 87 outcomes ordered by `recorded_at`, rebuilds α/β/ESS/alpha_30d/beta_30d.
- Pure functions in `learning.ts`, DB calls only in cron route. Additive-only Prisma migration: `effective_sample_size Float NOT NULL DEFAULT 0`, `n_trials_attempted Int NOT NULL DEFAULT 0`. Status enum (string) gains `EXPLORATORY-WATCH`.
- UI: `EngineCalibrationPanel` replaces raw N with ESS as user-facing number; `EXPLORATORY-WATCH` cells render a "regime stability: watching" badge.

### Claude's Discretion
- Naming of new `learning.ts` pure functions and the migration filename (use repo conventions).
- Storage of per-class λ and Page-Hinkley params: config constant vs new `LearningHyperparameters` table vs `LogisticEpoch` reuse — **see Q4 below**.
- Backfill ships as a separate cron route vs inline script — **CONTEXT explicitly lands on a route (D-13)**, so locked.

### Deferred Ideas (OUT OF SCOPE)
None. CONTEXT.md kept the discussion within phase scope. Cross-phase items mentioned only for context: hierarchical pooling (P19), regime feature (P20), lift-gated ACTIVE (P21), drift dashboard tile (P26), auto-demote (post-P21).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-ML-01 | `LearnedPattern.effective_sample_size` column from time-decayed observation weights | Q1 (decay/ESS pure fns), Q5 (migration), Q6 (backfill) |
| CORE-ML-02 | Per-class decay λ tuned empirically (no global default) | Q3 (Purged K-Fold), Q4 (hyperparameter storage), Q1 (decay primitive) |
| CORE-ML-03 | Credible intervals in `/insights` use ESS, not raw N | Q1 + existing `credibleInterval95` operates on weighted α/β — passes through automatically |
| CORE-ML-04 | Page-Hinkley `drift_alert` LearningEvent with min N=30 + two-of-two | Q2 (PH primitive + confirmation), Q3 (PH parameter tuning) |
| CORE-ML-05 | `EngineCalibration` block surfaces ESS + drift hint | Q7 (UI surface) |
</phase_requirements>

## Summary

Phase 18 adds **three pure primitives** to `src/lib/learning.ts` (`decayWeights`, `computeESS`, `pageHinkleyStatistic` plus a `confirmedDrift` composer that wraps existing `driftZ`), a fourth utility (`purgedKFold`) likely in a new `src/lib/cv.ts`, an additive Prisma migration (`effective_sample_size`, `n_trials_attempted`, status string gains `EXPLORATORY-WATCH`), an idempotent one-shot backfill cron at `/api/cron/backfill-ess`, an extension to `recomputeOneCell` in `src/app/api/cron/learn/route.ts` to apply weights and run two-of-two drift, and an additive change to `EngineCalibrationPanel` (replace `n=` subValue with `ESS=`, render `EXPLORATORY-WATCH` badge). All primitives are pure-functional, all DB writes funnel through one transaction per cell, and migration is additive — D-19 invariant preserved.

The riskiest implementation choice is **persisting per-class λ and per-class Page-Hinkley parameters** (Q4). Pick the wrong storage and either (a) tuning becomes invisible to ops (constants are recompiled to ship a re-tune), (b) the database accrues a tiny lookup table that every learn-cycle reads. **Mitigation: ship a typed config constant in `learning.ts` (option A) for v2.0, document the tuning script that regenerates it, and defer a `LearningHyperparameters` table to P21 when re-tuning becomes a recurring operation.** This pairs cleanly with the "no global default" mandate (the constant carries per-class winners, not a global) while keeping the schema additive-minimum.

## Q1: Time-decay primitives in learning.ts

```typescript
// src/lib/learning.ts — additions

export interface WeightedObservation {
  hit: boolean;          // existing classifyHit() output
  recorded_at: Date;     // PriceOutcome.recorded_at
}

/** Exponential decay weights wᵢ = exp(−Δtᵢ/λ). λ in days. now defaults to Date.now(). */
export function decayWeights(obs: WeightedObservation[], lambdaDays: number, now: Date = new Date()): number[] {
  const t0 = now.getTime();
  const dayMs = 86_400_000;
  return obs.map(o => {
    const dtDays = Math.max(0, (t0 - o.recorded_at.getTime()) / dayMs);
    return Math.exp(-dtDays / lambdaDays);
  });
}

/** Kish ESS = (Σw)² / Σw². Returns 0 for empty input. */
export function computeESS(weights: number[]): number {
  if (weights.length === 0) return 0;
  let sum = 0, sumSq = 0;
  for (const w of weights) { sum += w; sumSq += w * w; }
  return sumSq === 0 ? 0 : (sum * sum) / sumSq;
}

/** Weighted Beta posterior: replaces +1/+0 increments with +wᵢ on hit-side / miss-side. */
export function updatePosteriorWeighted(
  prior: BetaPosterior,
  obs: WeightedObservation[],
  weights: number[],
): BetaPosterior {
  let a = prior.alpha, b = prior.beta;
  for (let i = 0; i < obs.length; i++) {
    if (obs[i].hit) a += weights[i]; else b += weights[i];
  }
  return { alpha: a, beta: b };
}
```

Cron consumption: in `recomputeOneCell`, after fetching `events`, build `obs[] = events.map(ev => ({ hit, recorded_at: ev.occurred_at }))`, call `decayWeights(obs, λ_for_class, new Date())`, derive α/β via `updatePosteriorWeighted({alpha:1, beta:1}, obs, weights)`, ESS via `computeESS(weights)`. Existing `credibleInterval95` already takes `BetaPosterior` — pass weighted α/β and CI tightens automatically (D-05 satisfied for free).

## Q2: Page-Hinkley + two-of-two confirmation

```typescript
// src/lib/learning.ts — additions

/**
 * Page-Hinkley statistic for shift detection on a stream of deltas (per-obs
 * residuals from running mean). Returns max(|cumulative_shift| − λ_PH × n).
 *
 * deltas[i] = pᵢ − running_mean_before_i, with a δ-magnitude tolerance applied:
 *   shifted_delta = deltas[i] − δ_sign(direction)
 * Tracks both upward and downward shift accumulators; returns the max.
 */
export function pageHinkleyStatistic(deltas: number[], delta: number, lambdaPH: number): number {
  let mUp = 0, mDown = 0;          // cumulative upward/downward shift
  let MUp = 0, MDown = 0;          // running max so far
  for (const d of deltas) {
    mUp   = Math.max(0, mUp   + d - delta);
    mDown = Math.max(0, mDown - d - delta);
    MUp   = Math.max(MUp,   mUp);
    MDown = Math.max(MDown, mDown);
  }
  // Detector value vs threshold = max accumulator − λ_PH; positive ⇒ candidate alert.
  return Math.max(MUp, MDown) - lambdaPH;
}

/** Two-of-two confirmation per D-06. Reuses existing driftZ for the z signal. */
export function confirmedDrift(args: {
  rolling: BetaPosterior;
  allTime: BetaPosterior;
  perObsDeltas: number[];          // pᵢ − cumulative posterior mean before observation i
  delta: number;                   // PH δ magnitude — per-class
  lambdaPH: number;                // PH threshold — per-class
  rawN: number;                    // raw sample_size, NOT ESS
}): { fired: boolean; drift_z: number; ph_stat: number; ph_threshold: number } {
  const drift_z = driftZ({ rolling: args.rolling, allTime: args.allTime });
  const ph_stat = pageHinkleyStatistic(args.perObsDeltas, args.delta, args.lambdaPH);
  // D-08: minimum raw N=30; below floor never fires (ph_stat dragged ≤0 by gate).
  const fired = args.rawN >= 30 && Math.abs(drift_z) > 2 && ph_stat > 0;
  return { fired, drift_z, ph_stat, ph_threshold: args.lambdaPH };
}
```

Cron call site: `recomputeOneCell` already computes `drift_z`. Build `perObsDeltas` by walking `events` chronologically, tracking running posterior mean, recording `pᵢ − running_mean` per event. Call `confirmedDrift(...)`. If `fired===true`: write `drift_alert` LearningEvent (delta carries `{drift_z, ph_stat, ph_threshold, raw_n, ess}`), set `status='EXPLORATORY-WATCH'`. The existing `if (Math.abs(drift_z) > 2 && prevStatus !== status)` block on line 513 of `learn/route.ts` is **replaced** by this confirmed path.

## Q3: Purged K-Fold + Embargo CV

Recommend **new file `src/lib/cv.ts`** — keeps `learning.ts` focused on online primitives; CV is offline tuning code path that needn't load on every cron tick.

```typescript
// src/lib/cv.ts
export interface Observation { recorded_at: Date; horizon_days: number; hit: boolean; cell_key: string; }
export interface Fold { trainIdx: number[]; testIdx: number[]; }

/**
 * López de Prado Purged K-Fold + Embargo. Sort observations by recorded_at,
 * split into k contiguous test folds. For each test fold:
 *   - PURGE: remove training observations whose [t, t+horizon] window overlaps
 *     the test fold's time range (info leakage from outcome dates).
 *   - EMBARGO: remove training observations within `embargoDays` after the
 *     test fold's end (residual leakage from autocorrelated returns).
 * purgeDays / embargoDays both default to max horizon = 90 (D-16).
 */
export function purgedKFold(
  obs: Observation[],
  k: number,
  purgeDays = 90,
  embargoDays = 90,
): Fold[] {
  const sorted = [...obs].sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());
  const n = sorted.length;
  const foldSize = Math.ceil(n / k);
  const folds: Fold[] = [];
  for (let f = 0; f < k; f++) {
    const testStart = f * foldSize;
    const testEnd = Math.min(n, testStart + foldSize);
    const testIdx = Array.from({ length: testEnd - testStart }, (_, i) => testStart + i);
    const tMin = sorted[testStart].recorded_at.getTime();
    const tMax = sorted[testEnd - 1].recorded_at.getTime();
    const purgeMs = purgeDays * 86_400_000;
    const embargoMs = embargoDays * 86_400_000;
    const trainIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i >= testStart && i < testEnd) continue;
      const ti = sorted[i].recorded_at.getTime();
      const tiOutcomeEnd = ti + sorted[i].horizon_days * 86_400_000;
      // Purge: any training obs whose outcome window overlaps test range.
      if (tiOutcomeEnd >= tMin - purgeMs && ti <= tMax + purgeMs) continue;
      // Embargo: training obs immediately after test fold end.
      if (ti > tMax && ti < tMax + embargoMs) continue;
      trainIdx.push(i);
    }
    folds.push({ trainIdx, testIdx });
  }
  return folds;
}
```

Tuning runs (λ grid + (δ, λ_PH) grid) live in `scripts/tune-decay.ts` and `scripts/tune-page-hinkley.ts` — **invoked manually pre-merge**, not in cron. Output: a `learning-hyperparameters.json` consumed at compile time by Q4's config constant.

## Q4: Hyperparameter storage

**Recommendation: (A) typed config constant in `learning.ts`** (e.g., `export const HYPERPARAMETERS: Record<SignalClass, {lambda_days: number, ph_delta: number, ph_lambda: number, tuned_at: string, cv_brier_oos: number}>`).

- **Defensible against D-17 ("documented operational action"):** the constant is type-checked, version-controlled, reviewable in the PR; tuning runs print a JSON blob the developer pastes in. Re-tunes leave a git diff.
- **Cheapest schema impact:** D-19 mandates additive-only migrations; option (B) introduces a new table whose only row is a singleton — pure overhead until P21 wants automated re-tuning.
- **`LogisticEpoch` reuse (C) is wrong shape:** that table is per-cycle posterior state; per-class λ is run-config, not posterior. Conflating them muddles meaning and complicates the P21 lift-gated promotion which needs a clean `LogisticEpoch` series.

Migrate to a `LearningHyperparameters` table when P21 lands automated re-tuning + A/B comparison — at that point the row count grows and the audit trail belongs in the DB.

## Q5: Migration sequencing

1. Author Prisma migration `add_ess_and_n_trials_attempted` adding `effective_sample_size Float NOT NULL DEFAULT 0` + `n_trials_attempted Int NOT NULL DEFAULT 0` to `learned_patterns`. **D-19 additive-only** — no column drops/type changes.
2. `npx prisma migrate dev` locally → `npx prisma migrate deploy` on Neon staging → smoke `SELECT effective_sample_size FROM learned_patterns LIMIT 1` → returns `0` for all 504 cells (default).
3. Ship the new `learning.ts` pure fns (Q1, Q2) + `cv.ts` (Q3) — no consumer changes yet. CI green.
4. Run tuning scripts (Q3) against existing 87 outcomes → produce `HYPERPARAMETERS` constant per class → land in `learning.ts` (Q4).
5. Wire `recomputeOneCell` in `learn/route.ts` to compute weighted α/β + ESS + write `effective_sample_size`. Drift block still uses old single-test code.
6. Deploy `/api/cron/backfill-ess` (env-flag gated `ENABLE_BACKFILL_ESS=1`), run once → all 504 cells now have populated ESS. Verify random sample manually.
7. Flip drift block in `learn/route.ts` to `confirmedDrift` two-of-two + add `EXPLORATORY-WATCH` status writes. Deploy.
8. Update `patternStatus` (or a new `patternStatusV2`) to use `effective_sample_size < 30 → EXPLORATORY` instead of `sample_size < 10`. Deploy. Cells previously ACTIVE on raw N may demote → expected per D-04.
9. Update `EngineCalibrationPanel` to surface ESS subValue + watch badge (Q7). Deploy.
10. Disable backfill route (delete file or flip env flag off); P18 done.

## Q6: Backfill cron design

- **Route:** `POST /api/cron/backfill-ess`
- **Env-flag gate:** `process.env.ENABLE_BACKFILL_ESS === '1'` AND `request.headers.get('authorization') === 'Bearer ${CRON_SECRET}'` — both required, returns 401 otherwise.
- **Idempotency:** uses `LearningEvent` of type `ess_backfill_complete` as marker. On entry: `if (await prisma.learningEvent.findFirst({where:{event_type:'ess_backfill_complete'}})) return 'already_done'`. On exit (post-transaction success): write that event.
- **Single transaction:** YES. Loop over all `learnedPattern` cells (504 max), for each: pull all `posterior_update` events, build weighted α/β + ESS via Q1 primitives + recompute alpha_30d/beta_30d from the same replay (D-13), write all 504 updates inside one `prisma.$transaction([...])`. Neon Postgres handles 504 row updates in single tx easily (<5 MB statement size at current data volumes).
- **Expected duration at N=87:** dominated by the events query (single `findMany` with 87 rows × per-cell filter). Per-cell loop is in-memory math. End-to-end <10s on Vercel; well within `maxDuration: 300` (D-20). No need to bump to 800.

## Q7: EngineCalibrationPanel surface

- **File path verified:** `src/components/EngineCalibrationPanel.tsx` (single file; no nested `research/` subdir despite CONTEXT.md hint).
- **Current data shape (from `EngineCalibration` type):** consumes `sample_size`, `technical_sample_size`, `institutional_sample_size`, `insider_sample_size`, `logistic_sample_size`, `status` (union including ACTIVE/EXPLORATORY/DEPRECATED/NO_DATA). `HorizonCalibration` rows carry `sample_size: number` + `status`.
- **Minimal additive change:**
  1. Type extension: `EngineCalibration` gains `effective_sample_size: number`, `technical_ess`, `institutional_ess`, `insider_ess`, `logistic_ess` (number). `HorizonCalibration` gains `effective_sample_size: number`. `status` union gains `'EXPLORATORY-WATCH'`.
  2. `STATUS_BADGE` map: add `'EXPLORATORY-WATCH': 'bg-tertiary/30 text-tertiary border-tertiary/50'` and `STATUS_LABEL['EXPLORATORY-WATCH'] = 'WATCHING'`.
  3. `MetricCard` subValue strings (lines 469, 477, 504, 511, 516, 537, 542, 568, 574, 743, 749) replace `n=${sample_size}` with `ESS=${effective_sample_size.toFixed(1)}` — no layout shift; same column.
  4. `HorizonTable` row line 390: render `n=${effective_sample_size.toFixed(1)}` (label key changes to "ESS" via subtitle copy in UI-SPEC follow-up).
  5. New small `WatchBadge` component rendered next to `STATUS_BADGE` when `status === 'EXPLORATORY-WATCH'`: copy "regime stability: watching" per D-11.

## Validation Architecture

| Layer | Test | Pass criterion | File path |
|-------|------|----------------|-----------|
| Unit (Vitest) | `decayWeights` returns `1.0` at Δt=0, `e⁻¹` at Δt=λ, monotonic | All assertions green | `src/lib/__tests__/learning.decay.test.ts` |
| Unit (Vitest) | `computeESS` matches Kish on hand-computed cases (uniform, single-spike, all-zero) | All assertions green | `src/lib/__tests__/learning.ess.test.ts` |
| Unit (Vitest) | `pageHinkleyStatistic` fires on synthetic shift, silent on stationary stream | F1 ≥0.9 on synthetic suite | `src/lib/__tests__/learning.ph.test.ts` |
| Unit (Vitest) | `confirmedDrift` returns `fired=false` when only one of (driftZ>2, PH>thr) trips; `fired=true` when both AND rawN≥30 | Two-of-two truth-table fully covered | `src/lib/__tests__/learning.drift.test.ts` |
| Unit (Vitest) | `purgedKFold` produces non-overlapping train/test, respects purge+embargo windows | No leakage on synthetic | `src/lib/__tests__/cv.purgedkfold.test.ts` |
| Integration (live-DB Vitest) | `learn` cron with seeded outcomes writes `effective_sample_size > 0` and matches Q1 hand calculation within 1e-6 | DB row matches | `src/app/api/cron/learn/__tests__/learn.ess.live.test.ts` |
| Integration (live-DB Vitest) | `backfill-ess` is idempotent — second invocation is a no-op (returns `already_done`) | No duplicate rows; ESS unchanged | `src/app/api/cron/backfill-ess/__tests__/backfill.live.test.ts` |
| Integration (live-DB Vitest) | Synthetic injected drift → `drift_alert` event written + cell flips to `EXPLORATORY-WATCH` | Event count ≥1, status updated | `src/app/api/cron/learn/__tests__/learn.drift.live.test.ts` |
| Integration (live-DB Vitest) | Cell with raw N=29 (below D-08 floor) never fires drift even with synthetic shift | Zero `drift_alert` events | `src/app/api/cron/learn/__tests__/learn.drift.live.test.ts` |
| E2E (Playwright) | `/research/AAPL` renders ESS column; `EXPLORATORY-WATCH` cell shows "regime stability: watching" badge | DOM contains both | `tests/e2e/engine-calibration-ess.spec.ts` |
| E2E (Playwright) | `/insights` credible-interval widths reflect ESS (sparse-but-recent < sparse-but-old) | Width comparison passes | `tests/e2e/insights-ess-ci.spec.ts` |
| Manual UAT | Operator reads tuning script output and pastes new λ into HYPERPARAMETERS constant; CI re-runs Q3 fold-OOS-Brier on new constant | Brier improvement vs prior λ | dev console |

## Threat Model Inputs

- **Cron auth (CRON_SECRET):** existing `learn` cron checks `Bearer ${CRON_SECRET}`; backfill route MUST do the same — copy verbatim (line 841 of `learn/route.ts`). Without this anyone can hit a public Vercel function and trigger a 504-cell mass write.
- **Partial-write recovery:** all 504 cell updates land in one `prisma.$transaction`. If Neon connection drops mid-tx, Postgres rolls back atomically. The idempotency marker (`ess_backfill_complete` LearningEvent) is written **inside** the same transaction so the marker and the data are atomically consistent.
- **DoS via repeated tuning:** tuning scripts are local-dev only (not exposed via HTTP). No DoS surface.
- **DoS via repeated backfill:** env-flag gate `ENABLE_BACKFILL_ESS=1` defaults off in production. Only set during the migration window. Idempotency marker prevents double-run damage if flag stays on.
- **JSON deserialization (LearningEvent.delta):** the new `drift_alert` payload `{drift_z, ph_stat, ph_threshold, raw_n, ess}` is all numeric — no string injection surface. `EngineContext` reads `ev.delta as {hit?: boolean, ...}` already; new keys follow same pattern.
- **Status enum poisoning:** `status` is a free-form `String` in Prisma (line 110). Adding `EXPLORATORY-WATCH` requires no migration but means typos in code can write garbage. **Mitigation:** centralize allowed values in a `const STATUS_VALUES = ['ACTIVE', 'EXPLORATORY', 'EXPLORATORY-WATCH', 'DEPRECATED'] as const` in `learning.ts`; lint with TS literal type.

## Pitfalls Defended

- **Pitfall 3 (λ-by-eyeball):** Q3's Purged K-Fold + Embargo with grid `{14,30,60,90,180,365}` per signal class, scored by OOS Brier on outcomes-only-not-yet-released folds. Q4's typed `HYPERPARAMETERS` constant carries the per-class winner with `tuned_at` + `cv_brier_oos` audit fields — re-tunes leave a reviewable git diff. Looks-Done-But-Isn't gate: planner MUST write a Vitest assertion that `HYPERPARAMETERS[signal_class].cv_brier_oos < 0.25` (better than 50/50 baseline) before merging the constant.
- **Pitfall 13 (drift FP flap):** Q2's `confirmedDrift` enforces three independent gates (`rawN ≥ 30`, `|drift_z| > 2`, `ph_stat > 0`) — Pitfalls research bar is two; we ship three. **No auto-demote** (D-09): cell stays in Engine Calibration injection during WATCH. Recovery rule (D-09 step 4): 14 consecutive clear days AND ESS ≥ 30. Implementation: track `consecutive_clear_days` field — **NEW DERIVED FIELD** the planner must specify either as a column on `LearnedPattern` or a per-cell rolling LearningEvent count (recommend the latter to stay additive-zero on schema).
- **Looks-Done-But-Isn't (planner: turn into acceptance criterion):** "ESS column appears in EngineCalibrationPanel" is insufficient. **Acceptance criterion to enforce:** an integration test seeds two cells with identical raw N=20 but one has all observations dated within 7 days and the other dated 90+ days ago; assertion: `ESS_recent > 2 × ESS_old` AND `credibleInterval95(weighted_alpha_recent, weighted_beta_recent).high - .low < credibleInterval95(... old).high - .low`. This proves the time decay is wired end-to-end and the CI surface uses ESS, not raw N.

## Open Questions for Planner

- **Recovery state machine persistence:** D-09 step 4 requires "14 consecutive clear days." Where is `consecutive_clear_days` stored? Recommend deriving from a `count(LearningEvent where event_type='drift_clear' for cell, occurred_at >= now - 14d)` to stay additive-zero; planner confirms.
- **`patternStatus` signature change vs new `patternStatusV2`:** the existing `patternStatus` (learning.ts line 223) signature is locked; ESS gate adds a parameter. Planner picks: extend with optional `effective_sample_size?: number` (back-compat) vs new fn (clean). Recommend: extend with optional, fall back to raw `sample_size` when ESS absent.

## RESEARCH COMPLETE
