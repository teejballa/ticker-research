---
phase: "22-market-regime-and-source-weights"
plan: "22-04"
subsystem: "diffusion-learning-engine"
tags: [hierarchical-bf-fdr, transition-exclusion, learn-cron, regime-conditioning, by-fdr, benjamini-bogomolov-2014, regime-events, soak-window, wave-4]
dependency_graph:
  requires:
    - "Phase 22 Wave 0 (22-00): additive LearningEvent.regime + SentimentSnapshot.regime + LearnedPattern.regime columns + 3 RED stubs targeting Waves 4-5"
    - "Phase 22 Wave 1 (22-01): src/lib/regime/classify.ts — SINGLE source of truth for 4-bucket regime label, used for outcome_regime computation in posterior_update events"
    - "Phase 22 Wave 2 (22-02): /api/cron/backfill-regime — populates historical SentimentSnapshot.regime so D-05 transition exclusion has real labels to filter on"
    - "Phase 22 Wave 3 (22-03): SourceTier regime-conditional weights (SUMMARY pending) — orthogonal to Wave 4; Wave 4 does not depend on Wave 3 code paths"
    - "Phase 21.1 Wave 4: two-pass BY-FDR architecture in /api/cron/learn — Wave 4 extends this two-pass to per-regime evaluation + hierarchical FDR"
    - "src/lib/evaluation/fdr.ts: benjaminiYekutieli P21.1 primitive — Wave 4 reuses VERBATIM as inner-loop primitive of hierarchicalBYBH"
  provides:
    - "src/lib/evaluation/fdr.ts → hierarchicalBYBH(perRegimePValues, q_inner=0.10, q_outer=0.10) + HierarchicalBYResult type"
    - "src/lib/evaluation/index.ts barrel re-export of hierarchicalBYBH + HierarchicalBYResult"
    - "src/app/api/cron/learn/route.ts → excludeTransitionZoneEvents helper (D-05) + extended CellKey with regime axis + 5-tuple cartesian + hierarchicalBYBH at pass-2 + LearningEvent.regime top-level column on cell_promoted/cell_demoted"
    - "src/app/api/cron/learn/route.ts → posterior_update LearningEvent.delta carries snapshot_regime + outcome_regime (PIT-correct via classifyRegimeAt({asOf: outcome.recorded_at}))"
    - ".planning/phases/22-market-regime-and-source-weights/22-04-SOAK.md — soak-gate truth file with soak_start_iso 2026-06-13T01:07:10Z + soak_end_iso 2026-06-27T01:07:10Z (D-13 14-day soak)"
    - "HYPERPARAMETERS.md Phase 22 section: BRIER_LIFT_THRESHOLD reuse (D-07), q_inner/q_outer for hierarchical BY-FDR (D-15), D-05 sample-relative transition-exclusion semantics + Pitfall-5 over-exclusion guard"
  affects:
    - "Wave 5 (22-05) — done-gate Brier-lift-per-regime consumes 22-04-SOAK.md soak_start_iso for the blocking-gate check; reads cell_promoted/cell_demoted LearningEvents with the new top-level regime column to compute per-regime promotion counts"
    - "/insights learning-feed dashboard (post-P21.1) — can now filter by LearningEvent.regime via direct WHERE clause instead of JSON-path query"
tech_stack:
  added: []
  patterns:
    - "Hierarchical FDR per Benjamini-Bogomolov 2014: per-regime BY families (inner stage 1) → BH across regime-family-summary statistics (outer stage 2). Inner uses BY for dependence-robustness within a regime; outer uses BH since regime families are conditionally independent given the classifier assignment."
    - "Pitfall-3 defense: 4-bucket regime split does NOT 4× the BY denominator. Hierarchical structure keeps per-regime c(m_r) at single-family value (~5.6 not ~7.0), preserving per-regime detection power."
    - "D-05 sample-relative transition exclusion: drop events where snapshot_regime != outcome_regime, but fail-open on NULL (R4) and on 'ALL' (cold-start). Right-open interval boundary semantics (prediction_t, prediction_t + horizon_days]."
    - "5-tuple CellKey (signal_class × pattern_key × cap_class × horizon_days × regime) at evaluation time; 4-tuple unique constraint on LearnedPattern preserved until Wave 5 constraint flip (D-11 step 4); per-regime cells surface as cell_promoted/_demoted LearningEvents with top-level regime column."
    - "Investigation-mode instrumentation per skill: 3 console.log lines per cron run — regime-fdr (per-regime counts + meta-BH promoted regimes), regime-exclusion (per-cell excluded/kept counts), regime-pass1 (planned at next iteration). Wave 4 instruments fdr + exclusion; full pass-1 instrumentation is a Wave 5 refinement."
key_files:
  created:
    - ".planning/phases/22-market-regime-and-source-weights/22-04-SOAK.md (90 LOC) — soak-gate truth file for Wave 5 blocking check"
  modified:
    - "src/lib/evaluation/fdr.ts (+128 LOC) — appends hierarchicalBYBH + HierarchicalBYResult + private benjaminiHochbergDecisions helper. Existing benjaminiYekutieli untouched (reused VERBATIM as inner primitive)."
    - "src/lib/evaluation/index.ts (+1 LOC barrel) — re-exports hierarchicalBYBH + HierarchicalBYResult"
    - "src/lib/evaluation/__tests__/fdr-hierarchical.test.ts (208 LOC) — 9 GREEN cases turning Wave 0 RED stub GREEN (was 7 it.todo placeholders + 1 module-level RED guard)"
    - "src/app/api/cron/learn/route.ts (+318 LOC) — adds ACTIVE_REGIME_LABELS/classifyRegimeAt imports; extends CellKey with regime axis; adds excludeTransitionZoneEvents export; extends cartesian to 5 axes; replaces benjaminiYekutieli call with hierarchicalBYBH; adds snapshot_regime + outcome_regime to posterior_update LearningEvent.delta; adds regime top-level column to cell_promoted/_demoted/drift_alert/drift_clear LearningEvents; gates DB writes to LearnedPattern on regime==='ALL' aggregate cells (Wave 5 widens)."
    - "src/app/api/cron/__tests__/learn-transition-exclusion.test.ts (135 LOC) — 8 GREEN cases turning Wave 0 RED stub GREEN; adds vi.mock('@/lib/db') so the test runs without DATABASE_URL (per backfill-regime.test.ts pattern)"
    - "HYPERPARAMETERS.md (+98 LOC) — Phase 22 section: D-07 BRIER_LIFT_THRESHOLD reuse + D-15 hierarchical BY-FDR q_inner/q_outer + D-05 transition-exclusion semantics + Pitfall-5 over-exclusion guard + 3 citations (Benjamini-Bogomolov 2014, Benjamini-Yekutieli 2001, ISL Ch. 13)"
decisions:
  - "Hierarchical BY (inner) + BH (outer) asymmetry locked: BY at inner because cells within a regime share market context (dependent); BH at outer because regime families are conditionally independent given the classifier assignment (BB-2014 §3 PRDS)."
  - "Empty regime panel → Q_r = 1.0 (fails outer gate by default; explicitly NOT a divide-by-zero edge case). Documented in hierarchicalBYBH JSDoc + tested in fdr-hierarchical.test.ts case 4."
  - "Per-regime cells do NOT yet write to LearnedPattern (Wave 5 constraint flip required). Until then, only 'ALL' aggregate row mutates the DB row; per-regime status decisions surface ONLY via cell_promoted/_demoted LearningEvents with top-level regime column."
  - "patternStatus 5-gate (P21.1) runs UNCHANGED per (cell × regime). Regime is a key dimension, NOT a 6th gate parameter. CORE-ML-21 (BRIER_LIFT_THRESHOLD) preserved verbatim."
  - "snapshot_regime and outcome_regime carried in LearningEvent.delta as the per-event provenance for D-05 exclusion. Reading regime from delta JSON avoids per-event Prisma joins back to SentimentSnapshot at recompute time."
  - "Wave 4 emits drift_alert/drift_clear ONLY on the 'ALL' aggregate cell (per-regime drift surfaces via cell_promoted/_demoted instead). Avoids 5× event spam during normal operation; consumers needing per-regime drift can filter on the regime column of the promotion/demotion events."
  - "excludeTransitionZoneEvents helper is exported so the Wave 0 RED stub test can import it without re-implementing the boundary semantics. Helper is generic over `{snapshot_regime, outcome_regime}` shape so tests can use lightweight type-only objects."
  - "Soak start timestamp committed in 22-04-SOAK.md immediately on Wave 4 GREEN landing, NOT after operator-confirmed relearn. Rationale: Wave 5 done-gate reads soak_start_iso to compute days-elapsed; operator's separate Task 3 (deploy + manual cron invocation) flips relearn_complete_ack:true asynchronously. This separation matches Wave 2's checkpoint:human-action pattern."
metrics:
  duration_minutes: 13
  completed_date: "2026-06-13"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 5
  loc_added: ~545 source/docs + ~338 test
  tests_added: 17
requirements-completed: [CORE-ML-10, CORE-ML-28]
---

# Phase 22 Plan 04: Wave 4 — Learn Cron Hierarchical BY-FDR + D-05 Transition Exclusion Summary

**One-liner:** Hierarchical Benjamini-Bogomolov 2014 FDR primitive replaces the
single BY call in `/api/cron/learn`'s two-pass architecture, extending the cell
key to a 5-tuple with a `regime` axis, applying D-05 sample-relative transition
exclusion in the posterior path, and surfacing per-regime promotion decisions
as `cell_promoted`/`cell_demoted` LearningEvents carrying a top-level `regime`
column — all without changing P21.1's 5-gate `patternStatus` (regime is a key
dimension, not a gate parameter).

---

## Performance

- **Duration:** ~13 minutes (this executor)
- **Started:** 2026-06-13T00:55:01Z
- **Completed:** 2026-06-13T01:08:18Z
- **Tasks:** 3 of 3 committed
- **Files created:** 1 (22-04-SOAK.md)
- **Files modified:** 5 (fdr.ts, index.ts, fdr-hierarchical.test.ts, route.ts, learn-transition-exclusion.test.ts, HYPERPARAMETERS.md)

## What Shipped

### 1. `hierarchicalBYBH` primitive — `src/lib/evaluation/fdr.ts` (Task 1)

**Signature:**
```typescript
export function hierarchicalBYBH(
  perRegimePValues: Record<RegimeLabel, number[]>,
  q_inner: number = 0.1,
  q_outer: number = 0.1,
): HierarchicalBYResult
```

**Returns** `{per_regime, meta_bh_decisions, effective_q}`:

| Field | Shape | Purpose |
|-------|-------|---------|
| `per_regime` | `Record<RegimeLabel, BYResult>` | Inner BY result per regime (decisions + adjusted_p + harmonic_sum c(m_r)) |
| `meta_bh_decisions` | `Record<RegimeLabel, 'REJECT'|'ACCEPT'>` | Outer BH decision per regime; REJECT = regime passes outer gate |
| `effective_q` | `Record<RegimeLabel, number>` | Family-summary statistic per regime (min adjusted q; 1.0 for empty regime) |

**Algorithm** (per Benjamini & Bogomolov 2014):
1. **Stage 1 (inner):** for each regime r, call `benjaminiYekutieli(P_r, q_inner)` VERBATIM. Compute `Q_r = min(adjusted_p_r)` as the family-summary statistic. Empty panel → `Q_r = 1.0`.
2. **Stage 2 (outer):** apply Benjamini-Hochberg (NOT BY) at level `q_outer` to `{Q_r}`. BH is appropriate at the outer level because regime families are conditionally independent given the classifier assignment (BB-2014 §3 PRDS).

**Caller contract:** consumer reads `meta_bh_decisions[r]` and demotes inner rejections to ACCEPT when the regime failed the outer gate. The wrapper preserves the unmasked inner decisions so consumers can introspect what the naive denominator would have promoted (useful for IS paper Section IV table).

**Pitfall 3 defense:** 4-bucket regime split does NOT 4× the BY denominator. Hierarchical structure keeps per-regime `c(m_r)` at single-family value (~5.6 not ~7.0), preserving per-regime detection power.

### 2. `/api/cron/learn` extension — `src/app/api/cron/learn/route.ts` (Task 2)

**A. CellKey 5th axis** (`regime: RegimeLabel`):
```typescript
interface CellKey {
  signal_class: 'diffusion' | 'technical' | 'insider' | 'institutional';
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
  regime: RegimeLabel;   // NEW
}
```

**B. Cartesian extended** to iterate `[...ACTIVE_REGIME_LABELS, 'ALL']` as the 5th axis. The `'ALL'` axis is REQUIRED so the Wave 5 done-gate can compute `brier_all − brier_regime` lift contrast (D-14).

**C. `evaluateOneCell` per-regime filter + transition exclusion:**
- For `regime === 'ALL'`: every event participates (the unconditional aggregate).
- For per-regime cells: filter events to `snapshot_regime === key.regime`, then apply `excludeTransitionZoneEvents` (D-05) to drop events where `snapshot_regime !== outcome_regime`.

**D. `excludeTransitionZoneEvents` helper** (exported per Wave 0 contract):
```typescript
export function excludeTransitionZoneEvents<
  E extends { snapshot_regime: string | null; outcome_regime: string | null }
>(events: E[]): E[]
```
Fail-open on NULL (R4); fail-open on `'ALL'` (cold-start); strict on cross-regime same-label pairs.

**E. Pass-2 BY-FDR REPLACED with hierarchical:**
```typescript
// before: const fdrResult = benjaminiYekutieli(pValues, 0.10);
const hier = hierarchicalBYBH(perRegimePValues, 0.10, 0.10);
const adjustedPByCell = cellEvals.map((e) => {
  const innerQ = hier.per_regime[regime].adjusted_p[idx] ?? 1.0;
  const outerPassed = hier.meta_bh_decisions[regime] === 'REJECT';
  return outerPassed ? innerQ : 1.0;
});
```

**F. `processOneOutcome` writes per-event regime provenance** into `LearningEvent.delta`:
- `snapshot_regime`: read from `SentimentSnapshot.regime` column (populated by Wave 1 sentiment-scan + Wave 2 backfill).
- `outcome_regime`: computed via `classifyRegimeAt({asOf: outcome.recorded_at})` (PIT-correct; classifier failure → `null` → fail-open).

**G. `cell_promoted` / `cell_demoted` LearningEvents** now carry the top-level `regime` column (RESEARCH §Q3) for direct dashboard filtering (no JSON-path query needed). Delta also includes `regime` for back-compat. Other events (`drift_alert`, `drift_clear`) emit ONLY on the `'ALL'` aggregate cell to avoid 5× event spam — per-regime drift surfaces via promotion/demotion events.

**H. DB writes** to `LearnedPattern` remain on the 4-tuple unique constraint until Wave 5 flips it. Per-regime status decisions surface ONLY via the LearningEvent stream until the constraint flip.

**I. Investigation-mode instrumentation:**
```
[cron:learn] regime-fdr { per_regime_counts, meta_bh_promoted_regimes }
[cron:learn] regime-exclusion { cell, total_obs, excluded_for_flip, kept }
```

### 3. HYPERPARAMETERS.md Phase 22 section (Task 3)

Documents D-07 (BRIER_LIFT_THRESHOLD reuse), D-15 (`q_inner = q_outer = 0.10`), and D-05 (sample-relative transition-exclusion semantics + boundary table + Pitfall-5 over-exclusion guard). Three primary citations: Benjamini & Bogomolov 2014 (hierarchical FDR), Benjamini & Yekutieli 2001 (inner BY), ISL 2nd ed. Ch. 13.

### 4. Soak window — `.planning/phases/22-market-regime-and-source-weights/22-04-SOAK.md`

Frontmatter:
```yaml
soak_start_iso: 2026-06-13T01:07:10Z
soak_end_iso:   2026-06-27T01:07:10Z
soak_duration_days: 14
relearn_complete_ack: false   # operator flips after first relearn confirms
posterior_shape_summary:
  per_regime_cell_counts:  { bull-low-vol: pending, ... }
  meta_bh_promoted_regimes: pending
  transition_exclusion_drop_count: pending
```

Consumed by the Wave 5 done-gate (`scripts/phase-22-status.ts`).

## Task Commits

| Task | Type | Commit | Files |
|------|------|--------|-------|
| 1 | RED | `c46d1d6` | fdr-hierarchical.test.ts (9 cases) |
| 1 | GREEN | `8822b8c` | fdr.ts (+128 LOC), index.ts (+1) |
| 2 | RED | `90c5f7c` | learn-transition-exclusion.test.ts (8 cases) |
| 2 | GREEN | `a518353` | route.ts (+318 LOC), learn-transition-exclusion.test.ts (+vi.mock) |
| 3 | docs | `5f9f99f` | HYPERPARAMETERS.md (+98 LOC), 22-04-SOAK.md (NEW) |

## Decisions Made

- **Hierarchical BY (inner) + BH (outer) asymmetry**: justified by the dependence structure — within-regime cells share market context (dependent → BY); regime families are conditionally independent given the classifier assignment (PRDS → BH). Documented in `hierarchicalBYBH` JSDoc + HYPERPARAMETERS.md.
- **Inner primitive reuse**: `hierarchicalBYBH` delegates VERBATIM to `benjaminiYekutieli` — no re-implementation. Verified by test case "inner BY uses the existing benjaminiYekutieli primitive verbatim".
- **Empty regime → Q_r = 1.0**: explicit policy choice, not a divide-by-zero edge case. Documented + tested.
- **`patternStatus` 5-gate runs UNCHANGED per (cell × regime)**. Regime is a key dimension, NOT a 6th gate parameter. Confirmed `grep -c patternStatus src/lib/learning.ts` returns 2 (definition + comment ref).
- **Wave 4 does not flip the LearnedPattern unique constraint**: Wave 5 owns that destructive migration. Per-regime cells surface via LearningEvent stream until the constraint widens.
- **`'ALL'` aggregate row preserved alongside per-regime rows**: Wave 5 done-gate needs the contrast `brier_all − brier_regime` per D-14.
- **`snapshot_regime` + `outcome_regime` in delta JSON** (not via Prisma join at recompute time): avoids N×500 extra DB reads per cron run. PIT-correct: `outcome_regime` computed via `classifyRegimeAt({asOf: outcome.recorded_at})`.
- **`drift_alert`/`drift_clear` emit ONLY on `'ALL'` aggregate**: avoids 5× event spam during normal operation. Per-regime drift surfaces via the regime column of `cell_promoted`/`cell_demoted`.
- **`excludeTransitionZoneEvents` exported with structural type**: helper is generic over `{snapshot_regime, outcome_regime}` shape so tests can use lightweight POJOs (no Prisma type coupling).
- **Soak `relearn_complete_ack: false` at file creation**: operator flips it true asynchronously (separate Task 3 in the plan file). The soak_start_iso wall-clock begins at Wave 4 GREEN landing.

## Deviations from Plan

None — the plan was executed exactly as written for Tasks 1-3 in the prompt's `plan_specific_context` ordering (Task 1: hierarchicalBYBH primitive; Task 2: learn cron extension; Task 3: HYPERPARAMETERS.md + SOAK.md). The on-disk plan file (`22-04-PLAN.md`) labels Task 3 as a `checkpoint:human-action` operator-triggered relearn — that operator action is intentionally OUT-OF-SCOPE for the executor and is documented as `relearn_complete_ack: false` in `22-04-SOAK.md`. The Wave 5 done-gate will gate on both soak-end-date AND operator-flipped `relearn_complete_ack: true`.

## Verification

Run from repo root:

| Gate | Command | Result |
|------|---------|--------|
| Wave 4 test suites (17 cases) | `DATABASE_URL=postgresql://stub:stub@localhost:5432/stub npx vitest run src/lib/evaluation/__tests__/fdr-hierarchical.test.ts src/app/api/cron/__tests__/learn-transition-exclusion.test.ts --reporter=dot` | **17/17 GREEN** (≈400 ms) |
| Inner-primitive reuse guarantee | `grep -c 'benjaminiYekutieli' src/lib/evaluation/fdr.ts` | 3 (def + JSDoc ref + delegation in hierarchicalBYBH) |
| Cron pass-2 replacement | `grep -n 'benjaminiYekutieli\\|hierarchicalBYBH' src/app/api/cron/learn/route.ts` | hierarchicalBYBH called at pass-2; benjaminiYekutieli appears only in import + `void` placeholder + comments |
| patternStatus signature unchanged | `grep -c 'patternStatus' src/lib/learning.ts` | 2 (definition + DSR comment reference) |
| tsc cleanliness over Wave 4 surface | `npx tsc --noEmit` | 0 errors in Wave 4 files; 2 expected RED stubs for Wave 5 (learned-pattern-regime.test.ts, regime-done-gate.test.ts) explicitly out-of-scope |
| Existing P21.1 learn-promotion-event tests | `DATABASE_URL=stub npx vitest run src/app/api/cron/__tests__/learn-promotion-event.test.ts --reporter=dot` | 24/25 (1 skipped live integration) — no regressions |
| SOAK file format | `grep -E 'soak_start_iso\\|soak_end_iso\\|relearn_complete_ack' .planning/phases/22-market-regime-and-source-weights/22-04-SOAK.md` | All 3 keys present |

### Test-suite coverage map

`fdr-hierarchical.test.ts` (9 GREEN cases):

| # | Behavior | Decision |
|---|----------|----------|
| 1 | `hierarchicalBYBH` is exported as a function | D-15 contract |
| 2 | signal-in-1-regime: only signal regime promotes; 3 noisy regimes fail outer gate | D-15 + Pitfall-3 (per-regime power preservation) |
| 3 | signal-in-all-regimes: all 4 regimes promote | D-15 outer BH at q=0.10 with 4 strong p-values |
| 4 | noise-in-all-regimes: 0 regimes promote | D-15 outer BH correctly fails all weak Q_r |
| 5 | empty regime panel: Q_r=1.0, ACCEPT, no divide-by-zero | D-15 explicit empty-panel rule |
| 6 | single-cell regime (m=1): inner BY harmonic_sum=1, correct REJECT/ACCEPT | D-15 m=1 edge case |
| 7 | adjusted_p monotone-non-decreasing in sorted order | BY 2001 monotone enforcement preserved through wrapper |
| 8 | inner BY uses existing benjaminiYekutieli primitive VERBATIM | D-15 no-re-implementation contract |
| 9 | outer meta-BH keys on min(per-family adjusted q) per BB-2014 §3 | D-15 family-summary statistic rule |

`learn-transition-exclusion.test.ts` (8 GREEN cases):

| # | Behavior | Decision |
|---|----------|----------|
| 1 | same-regime obs: keep | D-05 baseline |
| 2 | cross-regime obs (flip mid-window or boundary): exclude | D-05 + R4 strict |
| 3 | NULL snapshot_regime: keep | R4 fail-open |
| 4 | NULL outcome_regime: keep | R4 fail-open |
| 5 | 'ALL' on either side: keep | D-09 cold-start |
| 6 | mixed batch correctness (5-event panel) | D-05 + R4 composite |
| 7 | over-exclusion guard: same-regime fraction stays > 94% on 95/5 corpus | Pitfall 5 |
| 8 | helper never special-cases 'ALL' to drop (caller-level decision) | D-05 boundary discipline |

## IS-Paper Note

The hierarchical structure is the headline statistical novelty Wave 4 ships. From the IS paper's perspective (per `[[is-symposium-framing-summer-2026]]`):

- **The methodology table** (Wave 5 will write this) reads: "We applied Benjamini-Bogomolov 2014 hierarchical FDR — per-regime Benjamini-Yekutieli BY families at q_inner=0.10, outer Benjamini-Hochberg BH at q_outer=0.10 over per-family minimum adjusted q-values. This preserves per-regime detection power (c(m_r) ≈ 5.6) instead of inflating to c(4·m_r) ≈ 7.0 under naive single-pass BY."
- **The results table** (post-soak) reads: "Of 4 regimes evaluated, N passed the outer meta-BH gate at q_outer=0.10. Of cells within those N regimes, M passed all 5 inner gates (ESS≥30, live≥10, Brier-lift>0.005, BY-FDR q<0.10, DSR>0)." Both N and M may be 0 — "0 ACTIVE cells in any regime is a valid IS-paper finding" per D-16.
- **Defense of the asymmetry** (Section III): "Inner uses BY because cells within a market regime share regime-level context — they fail independence. Outer uses BH because regime labels are an exogenous classifier output; conditional on classifier assignment, the 4 family-summary statistics are independent (PRDS satisfied per BB-2014 §3)."

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| Pass-1 instrumentation log line `[cron:learn] regime-pass1` | `src/app/api/cron/learn/route.ts` | Documented in `tech_stack.patterns`. Wave 4 instruments fdr + exclusion log lines; the per-regime pass-1 brier counter is a Wave 5 refinement (depends on the post-soak telemetry shape Wave 5 picks). |
| `relearn_complete_ack: false` and `posterior_shape_summary: pending_first_relearn` in `22-04-SOAK.md` | `.planning/phases/22-market-regime-and-source-weights/22-04-SOAK.md` | Operator flips these via the on-disk plan file's `checkpoint:human-action` Task 3. Wave 5 done-gate refuses to advance until BOTH soak-end-date AND relearn_complete_ack=true. |

Neither stub blocks Wave 4's goal. The 5-gate promotion logic, hierarchical BY-FDR, D-05 transition exclusion, and per-regime LearningEvent surfacing are fully operational.

## Hand-off to Wave 5

> **Soak begins NOW** (`soak_start_iso: 2026-06-13T01:07:10Z`).
>
> **Wave 5 cannot start its constraint-flip migration until 14 days elapse AND ≥ 2 live `/api/cron/learn` cycles produce non-degenerate posteriors.**
>
> Specifically, Wave 5 task 0:
> 1. Reads `22-04-SOAK.md` for `soak_start_iso` — refuses to advance if `now - soak_start_iso < 14 days` (target: ≥ 2026-06-27T01:07:10Z).
> 2. Reads `relearn_complete_ack` from frontmatter — refuses to advance if `false`.
> 3. Reads `posterior_shape_summary.per_regime_cell_counts` — refuses to advance if ALL 4 non-'ALL' regimes are zero/`pending_first_relearn`.
>
> Once Wave 5 advances, it:
> - Calls `regimeDoneGate(cellEvals)` (Wave 5 task 1) to compute per-regime Brier-lift + BCa CI per D-14.
> - Flips the `LearnedPattern` unique constraint to include `regime` (D-11 step 4) — IRREVERSIBLE.
> - Cuts over the aggregator + learn cron to read `(source, regime)` weights.
> - Ships the EngineCalibrationPanel "Source mix" row (D-17).

## Issues Encountered

None of substance.

The only meta-issue: the test runner needed `DATABASE_URL` to import `/api/cron/learn/route` because the route imports `@/lib/db` which calls `new PrismaNeon({connectionString})` at module-load. Solved per the existing pattern in `backfill-regime.test.ts` — added `vi.mock('@/lib/db', ...)` BEFORE the route import. Documented inline. This pattern was already established by Wave 2.

## User Setup Required

None — Wave 4 uses existing `DATABASE_URL` + `CRON_SECRET` (already provisioned across all Vercel scopes per `[[feedback_env_parity]]`) and existing Yahoo/Polygon paths via `classifyRegimeAt`. No new provider keys, no new schema migrations (the regime columns were added in Wave 0).

## Next Phase Readiness

- **Wave 5 (22-05) is BLOCKED on operator Task 3** (deploy + manual cron invocation → flip `relearn_complete_ack: true` in `22-04-SOAK.md`) AND the 14-day soak elapsing.
- Wave 4 code is production-ready. No infrastructure changes needed before deploy.
- Once unblocked, Wave 5 ships: `regimeDoneGate` primitive + `scripts/phase-22-status.ts` done-gate + LearnedPattern unique-constraint flip migration + aggregator cutover + EngineCalibrationPanel "Source mix" row + methodology paper section.

## Self-Check

Verifying claimed artifacts + commits:

- File `src/lib/evaluation/fdr.ts` updated with `hierarchicalBYBH` + `HierarchicalBYResult` — **FOUND**
- File `src/lib/evaluation/index.ts` updated with barrel export — **FOUND**
- File `src/lib/evaluation/__tests__/fdr-hierarchical.test.ts` — **FOUND** (9 cases)
- File `src/app/api/cron/learn/route.ts` updated with hierarchical FDR + D-05 exclusion + regime axis + LearningEvent regime column — **FOUND**
- File `src/app/api/cron/__tests__/learn-transition-exclusion.test.ts` — **FOUND** (8 cases)
- File `HYPERPARAMETERS.md` updated with Phase 22 section — **FOUND**
- File `.planning/phases/22-market-regime-and-source-weights/22-04-SOAK.md` — **FOUND**
- Commit `c46d1d6` (Task 1 RED) — **FOUND**
- Commit `8822b8c` (Task 1 GREEN) — **FOUND**
- Commit `90c5f7c` (Task 2 RED) — **FOUND**
- Commit `a518353` (Task 2 GREEN) — **FOUND**
- Commit `5f9f99f` (Task 3 docs + SOAK) — **FOUND**
- `hierarchicalBYBH` in `src/lib/evaluation/index.ts` — **FOUND**
- `excludeTransitionZoneEvents` exported from `src/app/api/cron/learn/route.ts` — **FOUND**
- `soak_start_iso` in `22-04-SOAK.md` frontmatter — **FOUND** (2026-06-13T01:07:10Z)

## Self-Check: PASSED

---
*Phase: 22-market-regime-and-source-weights*
*Plan: 04*
*Completed: 2026-06-13 (Tasks 1-3 committed; operator Task 3 pending per checkpoint:human-action)*
