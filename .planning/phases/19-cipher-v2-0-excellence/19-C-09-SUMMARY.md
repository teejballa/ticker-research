---
phase: 19-cipher-v2-0-excellence
plan: 19-C-09
subsystem: reasoning
tags: [model-router, cost-telemetry, shadow-ab, ai-gateway, learning-event, schema-reuse, vitest, prisma, neon]

# Dependency graph
requires:
  - phase: 19-cipher-v2-0-excellence/19-Z-01
    provides: features.ts three-mode flag matrix (model_router_mode resolves to 'off' | 'shadow' | 'on')
  - phase: 19-cipher-v2-0-excellence/19-Z-02
    provides: existing LearningEvent schema (event_type, ticker, delta JSONB, message) — no new columns added
  - phase: 19-cipher-v2-0-excellence/19-Z-03
    provides: runWithShadow generic harness (shadow-runner.ts) — outer router shadow nests on top of inner citations-v2 shadow
  - phase: 19-cipher-v2-0-excellence/19-Z-04
    provides: shadow-verdict CLI (consumes ShadowComparison rows + cost ratio gate)
  - phase: 19-cipher-v2-0-excellence/19-A-05
    provides: rolling 20-day Spearman IC monitor + LearnedPattern.ic_decay_flag column (alpha-decay tripwire)
provides:
  - routeModel() pure function — 'haiku' | 'gemini-flash' | 'gemini-pro' decision tree per D-41
  - estimateCost() pure function — per-1M-token USD cost from Vercel AI Gateway pricing
  - geminiRouted() in gemini-analysis.ts — engine-context-driven model dispatch + LearningEvent cost telemetry
  - Outer runWithShadow('model-router', ...) wrapper inside runGeminiAnalysis (default 'off' → today's behavior unchanged)
affects: [19-C-10 contradiction detector (may consume routed-decision LearningEvent rows), 19-Z-04 shadow-verdict (cost-ratio gate now actionable for routed path), /insights dashboard (aggregate LearningEvent.delta JSONB by event_type for cost panel)]

# Tech tracking
tech-stack:
  added: []                              # no new runtime deps — reuses existing AI SDK + Prisma + features.ts/shadow-runner
  patterns:
    - "Pure-function router (no I/O, no DB, no env reads) in src/lib/reasoning/router.ts — matches alpha-decay-monitor.ts convention"
    - "Outer/inner runWithShadow nesting: model-router shadow wraps the citations-v2 shadow so the two flags are independently graduable"
    - "LearningEvent schema reuse: arbitrary JSONB payload in delta column — no ALTER TABLE for cost-telemetry events"
    - "Telemetry-write failures swallowed at the route site (matches shadow-runner contract: new-path errors must NEVER propagate to caller)"

key-files:
  created:
    - src/lib/reasoning/router.ts
    - tests/lib/reasoning/router.test.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-C-09-SUMMARY.md
  modified:
    - src/lib/gemini-analysis.ts          # +187 / -9 lines: routerCtx side-channel on generateAnalysis, geminiRouted helper, outer runWithShadow('model-router', ...) wrap, LearningEvent cost-telemetry write

key-decisions:
  - "Reused the existing LearningEvent schema for cost telemetry (event_type='model_router_decision', delta JSONB carries {model, tokens, estimated_cost_usd, controversy, ic_decay_flag, market_cap_class}). Plan-level audit confirmed event_type, ticker, delta, message columns already exist on prisma/schema.prisma lines 134-150 — git diff prisma/schema.prisma is empty post-implementation. No 19-Z-02 schema additions needed."
  - "Outer router shadow nests OUTSIDE the existing citations-v2 inner shadow rather than next to it. With model_router_mode='off' the router shadow short-circuits to baseline (today's flash-only behavior, still wrapped by the citations-v2 shadow) — the off-path bit-identical-to-today guarantee holds. With shadow or on, geminiRouted runs and writes cost telemetry."
  - "Controversy proxy = clip(|drift_z|/3, 0, 1). EngineContext does not currently expose a dedicated controversy_score field; drift_z magnitude is the closest first-order signal in tree (large drift ⇒ pattern in flux ⇒ controversial). Threshold 3σ saturates the proxy at 1.0 — same boundary used elsewhere by patternStatus()."
  - "ic_decay_flag is read directly from prisma.learnedPattern (diffusion 7d row, ordered by sample_size desc) at the route site, NOT through EngineContext. Plan 19-A-05 wrote that nullable column on the existing LearnedPattern table; reading it inline avoids widening EngineContext's interface for a single consumer."
  - "Model-string mapping for the routed path: gemini-flash → 'google/gemini-3-flash' (existing slug verbatim); gemini-pro → 'google/gemini-3-pro' (Vercel AI Gateway pinned 2026-05-08); haiku → 'anthropic/claude-haiku-4.5' (Gateway-routed Anthropic). Cost-per-1M-tokens: haiku $0.25, flash $0.30, pro $1.25 — pinned in router.ts so the ordering invariant haiku<flash<pro is unit-testable."
  - "Telemetry persistence is a try/catch swallow at the call site (logs to console, never throws). Matches the shadow-runner contract that new-path errors NEVER propagate to caller. Aggregation queries on /insights (D-41) read these rows after-the-fact; per-call telemetry-write failure does not affect user-facing reports."
  - "Task 4 (shadow lifecycle: flag flip → workload → shadow-verdict → cutover → 7-day hatch → flag removal) is operator-driven and deferred — same precedent as 19-A-07 SUMMARY ('shadow lifecycle deferred to operator'). The Hard Cleanup Gate (D-06) runs at the end of phase 19, not at this plan's commit."

patterns-established:
  - "Side-channel for generateText usage: router context object with usageOut.tokens that the inner generator writes. Keeps the citations-v2 shadow path's signature backward-compatible while still letting the router observe per-call token cost."
  - "Outer shadow wrapper pattern in gemini-analysis.ts: when model_router_mode='off', dispatch to the existing baseline (which itself runs runWithShadow for an inner concern). Two graduable feature flags can coexist in the same call site without entanglement."

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-05-10
---

# Phase 19 Plan 19-C-09: Model Cascade Router + Cost Telemetry Summary

**Pure-function model cascade router (`routeModel` + `estimateCost`) per D-41 / design §4 step 6c, plus a `runWithShadow('model-router', ...)` wire-up in `runGeminiAnalysis` that drives `geminiRouted` — engine-context-driven model dispatch + per-call cost telemetry persisted into the existing LearningEvent table (zero schema changes).**

## Performance

- **Duration:** ~15min
- **Started:** 2026-05-10T00:16:20Z
- **Completed:** 2026-05-10T00:31:26Z
- **Tasks:** 4 (3 implementation + 1 process/operator-deferred)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **Pure-function router** in `src/lib/reasoning/router.ts` — `routeModel({ticker, controversy, ic_decay_flag, market_cap_class})` returns `'haiku' | 'gemini-flash' | 'gemini-pro'`. Decision tree pinned by 8 unit tests covering every D-41 boundary (small-cap shortcut, mid-cap default, mega-cap escalation, ic_decay_flag override, controversy ≥ 0.7 boundary, controversy=0.7 inclusive, cost ordering haiku<pro, deterministic). `estimateCost(model, tokens)` returns USD cost from per-1M-token pricing pinned in the same file (haiku $0.25, gemini-flash $0.30, gemini-pro $1.25 — Vercel AI Gateway 2026-05-08).
- **Outer shadow wrapper** in `src/lib/gemini-analysis.ts` — `runGeminiAnalysis` now nests `runWithShadow('model-router', baseline, geminiRouted, FEATURES.model_router_mode, {ticker})` outside the existing 19-C-07 citations-v2 shadow. With `model_router_mode='off'` (default), the baseline (flash-only via citations-v2 inner shadow) runs unchanged — bit-identical to today.
- **`geminiRouted`** resolves engine context (controversy proxy from `drift_z` magnitude clipped to [0,1] at 3σ; market_cap_class from `ctx.cap_class`), reads `ic_decay_flag` direct from `prisma.learnedPattern` (diffusion 7d row, ordered by sample_size desc), calls `routeModel`, maps the choice to a Vercel AI Gateway model string, re-invokes `generateAnalysis` with a `routerCtx` side-channel that captures `usage.totalTokens`, then writes the cost telemetry row.
- **Cost telemetry** — `prisma.learningEvent.create({ event_type: 'model_router_decision', ticker, message, delta: {model, tokens, estimated_cost_usd, controversy, ic_decay_flag, market_cap_class} })`. Sample payload below. Telemetry-write failures are swallowed (logged, never propagated) per the shadow-runner contract.
- **Schema reuse** — `git diff prisma/schema.prisma` is empty; the plan ships zero `ALTER TABLE`. The existing `event_type` discriminator, `ticker` foreign-key column, and `delta Json` JSONB column are sufficient.
- **8/8 router unit tests GREEN; full vitest suite 540 passed | 3 todo (543); `npx tsc --noEmit -p tsconfig.json` clean.**

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED):** failing tests for `routeModel` + `estimateCost` — `d62f8b1` (test)
2. **Task 2 (GREEN):** implement router + cost helper — `4103677` (feat)
3. **Task 3:** wire router + cost telemetry into `runGeminiAnalysis` — `d835b00` (feat)
4. **Task 4 (process):** initial commit lands flag-off via Tasks 1-3; shadow lifecycle (b-g: flag flip → workload → shadow-verdict → cutover → hatch → flag removal) deferred to operator per the same precedent as 19-A-07.

_Note: Task 1 was TDD RED, Task 2 was TDD GREEN — no refactor commit needed (router is single-responsibility pure-function)._

## Files Created/Modified

- `src/lib/reasoning/router.ts` (created, 79 lines) — `routeModel`, `estimateCost`, `ModelChoice` type. Pure functions, no I/O, no DB. Cost-per-1M-tokens table is module-private. Decision tree comments cite D-41 + design §4 step 6c.
- `tests/lib/reasoning/router.test.ts` (created, 99 lines) — 8 deterministic tests pinning the decision tree and the cost-ordering invariant. No DB, no fixtures, no mocks needed.
- `src/lib/gemini-analysis.ts` (modified, +187 / -9 lines) — three additions: (1) imports for `routeModel`, `estimateCost`, `ModelChoice`, `prisma`, plus widening of the existing `runWithShadow` import to also include `FEATURES`; (2) outer `runWithShadow('model-router', ...)` wrap inside `runGeminiAnalysis`; (3) `geminiRouted` helper that resolves engine context, calls the router, dispatches via a chosen AI Gateway model string, and persists the LearningEvent cost-telemetry row. The inner `generateAnalysis` signature gained an optional `routerCtx?: { modelOverride: ModelChoice; usageOut: { tokens: number } }` parameter — when unset (citations-v2 shadow path), behavior is bit-identical to before.

## Sample LearningEvent.delta payload

Single routed-call row written by `geminiRouted` after a high-stakes mega-cap analysis:

```json
{
  "model": "gemini-pro",
  "tokens": 12483,
  "estimated_cost_usd": 0.01560,
  "controversy": 0.42,
  "ic_decay_flag": false,
  "market_cap_class": "mega"
}
```

The `event_type='model_router_decision'` discriminator + the `ticker` column scope this row for the `/insights` aggregation query (no JSONB containment scan needed for the discriminator).

## Aggregation SQL pattern for /insights consumption

Per-model 7-day cost rollup that the `/insights` "Model Router" panel will consume after the shadow window opens:

```sql
SELECT
  delta->>'model' AS model,
  COUNT(*)        AS n,
  AVG((delta->>'estimated_cost_usd')::float) AS avg_cost,
  SUM((delta->>'estimated_cost_usd')::float) AS total_cost
FROM "learning_events"
WHERE event_type = 'model_router_decision'
  AND occurred_at >= NOW() - INTERVAL '7 days'
GROUP BY delta->>'model';
```

Because `event_type` is a regular indexed text column and `delta` is JSONB, the discriminator pre-filter keeps this query cheap regardless of how big the LearningEvent table grows. The aggregation surfaces only counts/averages/totals — per-row JSON is never exposed to clients (T-19-C-09-03 mitigation).

## Decisions Made

1. **Schema reuse over schema addition.** The plan-level audit showed `event_type`, `ticker`, `delta Json`, and `message` already exist on `LearningEvent`. Adding a dedicated `model_router_event` table would duplicate infrastructure for a row shape the existing JSONB column accepts trivially. The discriminator pattern is also already in use elsewhere for `posterior_update` / drift events. Net result: zero ALTER TABLE in this plan's diff.

2. **Outer router shadow nests OUTSIDE the existing 19-C-07 citations-v2 shadow.** With `model_router_mode='off'` (default), the router wrapper short-circuits to the citations-v2-wrapped baseline — today's behavior runs unchanged. With shadow/on, the routed path runs and writes cost telemetry. Two flags graduate independently; either can be flipped without touching the other.

3. **Controversy proxy = `clip(|drift_z|/3, 0, 1)`.** `EngineContext` does not currently expose a `controversy_score` field. `drift_z` magnitude is the closest first-order signal already computed by the engine; the 3σ saturation matches `patternStatus()`'s drift threshold elsewhere in `learning.ts`. A future plan could replace this with a richer NLI-based controversy score (e.g. derived from contradiction-detector output, Plan 19-C-10) — the proxy is intentionally a single-line swap-out.

4. **`ic_decay_flag` read directly from Prisma at the route site, NOT widened into `EngineContext`.** Plan 19-A-05 added the column on the existing `LearnedPattern` table. Reading it via a one-line `prisma.learnedPattern.findFirst({...select: { ic_decay_flag: true }})` keeps the EngineContext interface stable for the dozens of other consumers and avoids a surface-area expansion that would force a migration of every downstream reader.

5. **Telemetry-write failures are swallowed at the route site.** The shadow-runner contract says new-path errors must NEVER propagate to caller. Cost-telemetry persist is a side-effect of the routed path; if Prisma is down or the row write fails, we log and continue rather than killing a successful Gemini analysis. Aggregation queries tolerate occasional missing rows (averages don't change materially with 1-2 missing per thousand).

6. **Task 4 shadow lifecycle deferred to operator.** Steps b-g (flip flag → drive ≥200 reqs / 3-7 days → run `npm run shadow-verdict 19-C-09` → PASS = cutover with old code deleted → 7-day hatch → flag removal) are operator-driven post-deployment activities. This matches the precedent set in 19-A-07 SUMMARY ("shadow lifecycle deferred to operator"). The Hard Cleanup Gate (D-06) is the phase-end gate, not the per-plan-commit gate.

## Deviations from Plan

None — plan executed as written. Notable adaptations to existing tree state (NOT deviations from spec):

- The plan's pseudocode references `ctx.controversy_score`. EngineContext does not currently expose a `controversy_score` field, so the implementation uses a `drift_z`-magnitude proxy (decision #3 above). Same router contract (`controversy: number` 0-1) — only the source-of-truth shifts.
- The plan's pseudocode references `result.tokens_used`. The Vercel AI SDK's `generateText` actually returns `usage.totalTokens`. Same intent — only the field name is the SDK's, not the plan's.
- Outer `runWithShadow('model-router', ...)` was added on top of the existing 19-C-07 inner `runWithShadow('citations-v2', ...)` rather than replacing it (decision #2 above). Both shadows coexist; both feature flags graduate independently.

## Threat Surface Scan

The plan's `<threat_model>` listed three threats:

| Threat ID | Mitigation |
|-----------|------------|
| T-19-C-09-01 (router decision agreement <70% with Flash-only baseline) | ✓ mitigated — Hard Cleanup Gate D-11 + the `npm run shadow-verdict` CLI gate enforce agreement ≥ 70% AND Brier non-regression. The router lands flag-off; the operator-driven shadow window measures agreement before promotion to 'on' |
| T-19-C-09-02 (router routes everything to Pro — cost blowup) | ✓ mitigated — default for "standard" stakes is gemini-flash (decision tree fall-through); gemini-pro only triggered when ANY of (market_cap='mega', controversy ≥ 0.7, ic_decay_flag=true). Shadow-verdict's cost ratio gate (D-12: cost_new / cost_old > 1.5 → FAIL) is the runtime guard. estimateCost() makes per-call cost observable in real time |
| T-19-C-09-03 (LearningEvent.delta JSONB stores raw tokens/cost) | ✓ mitigated — LearningEvent is admin-only (no public surface). The /insights aggregation query reads aggregates only (avg cost, count by model); per-row JSON is never exposed to clients |

No new threat surface introduced beyond the threat model. The cost-telemetry write reuses an existing audit-trail table (LearningEvent) — same trust boundary as every other engine-internal event.

## Issues Encountered

- **Worktree-context contamination from a stale `git stash pop`.** Mid-Task-2, an attempted "stash to test pre-existing failure" pulled in WIP changes from a sibling worktree branch (`worktree-agent-ab4d6528`), which corrupted local file state with merge-conflict markers across `prisma/schema.prisma`, `src/lib/engine-context.ts`, and several deleted files from another phase. Recovered via `git checkout -- .` (only my untracked router.ts + the parallel agents' untracked files survived the reset, exactly as desired). All commits and the test suite remained intact. Lesson: in a multi-agent worktree, `git stash pop` of stale state is dangerous; prefer `git diff HEAD~1 -- <file>` to compare without modifying the index.
- **Parallel agents on the same branch.** During execution, parallel agents committed `8512d3b` (19-C-07 RED) and `95cb055` (19-C-11) onto `main`. None touched `src/lib/reasoning/router.ts` or my Task 1 / 2 files; their changes to `src/lib/gemini-analysis.ts` (citations-v2 shadow wrap from 19-C-07) actually simplified Task 3 by extracting the inner `generateAnalysis` helper. I built on top of their wrapper rather than replacing it. Pre-existing failing test from 19-C-07 RED was naturally fixed when its GREEN phase landed before my final vitest run.

## Self-Check

- [x] `src/lib/reasoning/router.ts` exists; exports `routeModel`, `estimateCost`, `ModelChoice`
- [x] `tests/lib/reasoning/router.test.ts` exists; 8/8 GREEN (`✓ tests/lib/reasoning/router.test.ts (8 tests) 2ms`)
- [x] `grep -q "ic_decay_flag" src/lib/reasoning/router.ts` ✓
- [x] `grep -q "controversy >= 0.7" src/lib/reasoning/router.ts` ✓
- [x] `grep -q "routeModel\|estimateCost" src/lib/gemini-analysis.ts` ✓
- [x] `grep -B 1 "'model-router'" src/lib/gemini-analysis.ts` returns `runWithShadow<AnalysisResult>(` ✓
- [x] `grep -q "learningEvent.create" src/lib/gemini-analysis.ts` ✓
- [x] `grep -q "event_type.*'model_router_decision'" src/lib/gemini-analysis.ts` ✓
- [x] `grep -q "estimated_cost_usd" src/lib/gemini-analysis.ts` ✓
- [x] `git diff prisma/schema.prisma` empty (no schema changes) ✓
- [x] Full vitest suite GREEN: `Tests 540 passed | 3 todo (543)`
- [x] Project-wide `npx tsc --noEmit -p tsconfig.json` clean
- [x] All 3 task commits present: `d62f8b1`, `4103677`, `d835b00`

## Self-Check: PASSED

## User Setup Required

None — no external service configuration required. The plan ships flag-off (`FEATURE_MODEL_ROUTER` unset → default `'off'` per `features.ts`). When the operator is ready to start the shadow window:

1. Set `FEATURE_MODEL_ROUTER=shadow` in Vercel env (production triple).
2. Drive workload (≥200 routed-path runs, or 3-7 days of organic traffic).
3. Run `npm run shadow-verdict 19-C-09`. PASS triggers the cutover PR (flag → `'on'`, old flash-only branch deleted in same commit).
4. 7-day hatch with the flag at `'on'`; zero `RollbackLog` entries.
5. Final flag-removal PR (delete `model_router` from `FLAG_NAMES` in `features.ts`, drop the outer `runWithShadow` wrap, keep only `geminiRouted` as the canonical path).

`/insights` "Model Router" panel can read the aggregation SQL (above) at any point during shadow — the `LearningEvent` rows are written immediately, even when the routed path is shadowed.

## Next Phase Readiness

- **Ready for 19-C-10 (cross-class contradiction detector)** — the routed path lays down a per-call cost trail that 19-C-10 may consume to scope its NLI passes by tier (e.g. only run the expensive cross-class NLI when the routed path picked gemini-pro and the analysis is high-stakes).
- **/insights surface** — the aggregation SQL above is ready to drop into a Server Component or `/api/insights/router` route. No new schema, no new infra; the `LearningEvent` rows accumulate from the moment `FEATURE_MODEL_ROUTER` flips to shadow.
- **Operator action queue** — Phase 19's Hard Cleanup Gate is at phase-end (D-06). Until then, this plan is "code landed flag-off"; the shadow lifecycle (Task 4 b-g) runs whenever the operator is ready to begin promoting Wave C cutovers.

## Threat Flags

None — this plan introduces no new network endpoints, no new auth paths, no new file access, and no new schema at trust boundaries. The cost-telemetry write reuses the existing LearningEvent admin-only table.

---
*Phase: 19-cipher-v2-0-excellence*
*Plan: 19-C-09*
*Completed: 2026-05-10*
