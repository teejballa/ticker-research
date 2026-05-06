---
phase: 18-time-decayed-bayesian-updates-ess
plan: 07
subsystem: trust-boundary
tags: [engine-context, types, ess, exploratory-watch, trust-boundary, post-process-overwrite]

# Dependency graph
requires:
  - phase: 18-time-decayed-bayesian-updates-ess
    provides: LearnedPattern.effective_sample_size column (Plan 18-03), LearnedStatus + STATUS_VALUES const incl. 'EXPLORATORY-WATCH' (Plan 18-01), cron writes ESS + status flip on confirmedDrift (Plan 18-04)
provides:
  - EngineContext.effective_sample_size + technical_ess + institutional_ess + insider_ess + logistic_ess (REQUIRED)
  - EngineCalibration.effective_sample_size + 4 per-class ESS fields (OPTIONAL — back-compat)
  - 'EXPLORATORY-WATCH' literal added to every status union (EngineContext, EngineCalibration, HorizonCalibration, technical_status, institutional_status, insider_status)
  - HorizonCalibration.effective_sample_size per row (max across 4 signal classes)
  - Post-process overwrite at gemini-analysis.ts site extends authoritative-numerics rule to all 5 ESS fields (T-trust-boundary-leak mitigation)
  - resolveBucketCellAt30 returns ess alongside posterior/CI/sampleSize/status
affects:
  - 18-08 (EngineCalibrationPanel ESS column + watch badge — types now ready, STATUS_BADGE/STATUS_LABEL placeholder added)
  - 18-09 (/insights credible-interval rendering — already wired through credibleInterval95(weighted α/β); ESS now also available for the per-row N column)
  - All future plans that consume EngineContext: literal-union forces compile-time exhaustiveness for 'EXPLORATORY-WATCH'

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-additive type extension: every new EngineCalibration field is OPTIONAL so old persisted Report.analysis JSONs in Neon continue to typecheck and render without migration"
    - "Literal-union as enforcement: adding 'EXPLORATORY-WATCH' to the union surfaces every missed call site at `npx tsc --noEmit` time (T-18-04 downstream mitigation)"
    - "Authoritative-numerics post-process overwrite extended: same Phase-17 D-04 pattern, 5 more numeric fields plumbed from engineCtx → engine_calibration in the persisted Report.analysis JSON"
    - "ESS surfaced parallel to existing posterior/CI fields — no new query path; rides on the same LearnedPattern row read"

key-files:
  created: []
  modified:
    - src/lib/types.ts
    - src/lib/engine-context.ts
    - src/lib/gemini-analysis.ts
    - src/lib/__tests__/engine-context.test.ts
    - src/lib/__tests__/gemini-analysis.test.ts
    - src/lib/gemini-analysis.test.ts
    - src/components/EngineCalibrationPanel.tsx
    - .planning/phases/18-time-decayed-bayesian-updates-ess/deferred-items.md

key-decisions:
  - "logistic_ess: 0 (sentinel) — LogisticEpoch schema in Prisma has only `sample_size: Int`, no ESS column. Phase 18 deliberately stayed schema-additive only on LearnedPattern (Plan 18-03). Surfacing logistic_ess as 0 today is honest: Plan 21+ may add LogisticEpoch.effective_sample_size if/when the logistic gets decay-weighted updates. Documented inline in engine-context.ts and in this Summary."
  - "HorizonCalibration.effective_sample_size = max across 4 signal classes — mirrors the existing sample_size = max convention in readHorizonCalibrations. Honest: surfaces the best-calibrated cell at this horizon, not a sum (which would double-count if multiple classes share observations)."
  - "EngineContext ESS fields are REQUIRED (number); EngineCalibration mirrors are OPTIONAL (number?). Inside the engine the value is always known (default 0); on the persisted side optional preserves back-compat with reports written pre-Phase-18."
  - "resolveBucketCellAt30 helper extended to return ess in its result tuple — keeps the EngineCalibrationPanel post-process overwrite a single object-literal pass, no second DB read."
  - "EngineCalibrationPanel STATUS_BADGE entry for 'EXPLORATORY-WATCH' is a placeholder (amber border on the tertiary base). Plan 18-08 owns the user-facing watch badge visual; this plan only ships the type-surface fix to make tsc clean."

patterns-established:
  - "Type-surface trust-boundary expansion pattern: extend EngineContext (required) → mirror in EngineCalibration (optional) → extend post-process overwrite block — three sites, identical to the Phase 16 / Phase 17-04 patterns. Reproducible for Plan 19+ when hierarchical priors, regime keys, or composite-signal numerics need surfacing."
  - "Literal-union forcing-function: ANY future status added to the LearnedStatus const must be added to all 6 union sites (EngineContext.status + 3 per-class statuses on EngineCalibration + HorizonCalibration.status + the local CellStatus in engine-context.ts) or tsc will refuse to build. T-18-04 closure made permanent."

requirements-completed: [CORE-ML-03, CORE-ML-05]

# Metrics
duration: ~25min
completed: 2026-05-06
---

# Phase 18 Plan 07: ESS + EXPLORATORY-WATCH Trust-Boundary Surface Summary

**EngineContext + EngineCalibration types + the gemini-analysis post-process overwrite all extended to surface effective_sample_size and the 'EXPLORATORY-WATCH' status flag through the single trust boundary so Plan 18-08 (panel) and Plan 18-09 (/insights) can render Phase-18 calibration without inventing numbers client-side.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 1/1
- **Files modified:** 8 (2 plan-target source files + 1 post-process site + 3 test fixtures + 1 component STATUS record + 1 deferred-items log)
- **Files created:** 0

## Accomplishments

### Task 1 — Extend EngineContext + EngineCalibration types with ESS + 'EXPLORATORY-WATCH' (RED + GREEN)

**RED phase** — `test(18-07): add failing tests for ESS + EXPLORATORY-WATCH surface`

- Extended the test helper `buildLearnedCell` with `effective_sample_size` (defaults to raw sample_size for backwards-compat fixtures) and a wider status union including `'EXPLORATORY-WATCH'`.
- Added 3 new tests in `src/lib/__tests__/engine-context.test.ts`:
  1. `surfaces effective_sample_size from the diffusion LearnedPattern row` — seeds ESS=42 on a horizon=7 diffusion cell and asserts `ctx.effective_sample_size === 42`. Also asserts the 4 per-class ESS fields exist and default to 0 when their respective cells aren't seeded.
  2. `preserves 'EXPLORATORY-WATCH' status when the cell is in drift watch` — seeds `status: 'EXPLORATORY-WATCH'` on the diffusion cell and asserts `ctx.status === 'EXPLORATORY-WATCH'` (was being silently coerced to `'EXPLORATORY'` by `deriveCellStatus`'s pre-Phase-18 fallthrough).
  3. `surfaces per-class ESS for technical/institutional/insider when those cells exist` — seeds technical=19 / institutional=17 / insider=12 ESS values and asserts each propagates to the matching `*_ess` field on EngineContext.
- All 3 tests failed RED as expected (`undefined` vs `42`, `'EXPLORATORY'` vs `'EXPLORATORY-WATCH'`, `undefined` vs `19`); 31 existing tests still passed.
- Committed RED: `c9ccbda`.

**GREEN phase** — `feat(18-07): surface ESS + EXPLORATORY-WATCH through engine-context`

5 EngineContext fields added (`src/lib/engine-context.ts`):
- `effective_sample_size: number` — diffusion cell, horizon=7
- `technical_ess: number` — technical cell, horizon=30
- `institutional_ess: number` — institutional cell, horizon=30
- `insider_ess: number` — insider cell, horizon=30
- `logistic_ess: number` — sentinel `0` (LogisticEpoch carries raw sample_size only)

5 EngineCalibration optional fields added (`src/lib/types.ts`):
- `effective_sample_size?: number`
- `technical_ess?: number`
- `institutional_ess?: number`
- `insider_ess?: number`
- `logistic_ess?: number`

Status union extensions (6 sites, all gain `'EXPLORATORY-WATCH'`):
- `EngineContext.status`
- `EngineCalibration.status`
- `EngineCalibration.technical_status`
- `EngineCalibration.institutional_status`
- `EngineCalibration.insider_status`
- `HorizonCalibration.status`

Plus `HorizonCalibration.effective_sample_size?: number` (per-row, optional for back-compat).

Implementation changes:
- `CellStatus` local union extended.
- `LearnedCellLike` interface gains `effective_sample_size: number`.
- `deriveCellStatus` recognizes `'EXPLORATORY-WATCH'` (instead of falling through to `'EXPLORATORY'`).
- `maxStatus` ordering: `ACTIVE: 4 > 'EXPLORATORY-WATCH': 3 > EXPLORATORY: 2 > DEPRECATED: 1 > NO_DATA: 0`.
- `resolveBucketCellAt30` return shape extended with `ess: number`.
- `readHorizonCalibrations` writes `effective_sample_size` on each row (max across 4 classes).
- Final `EngineContext` return literal populates all 5 new ESS fields from their respective cells (or 0 for logistic / when the cell is missing).

Post-process overwrite (`src/lib/gemini-analysis.ts` lines 855-859):
```ts
effective_sample_size: engineCtx.effective_sample_size,
technical_ess:         engineCtx.technical_ess,
institutional_ess:     engineCtx.institutional_ess,
insider_ess:           engineCtx.insider_ess,
logistic_ess:          engineCtx.logistic_ess,
```

Trust-boundary preserved: ESS values are written authoritatively from `engineCtx`, never from the LLM's response. `T-trust-boundary-leak` from the plan's threat register is mitigated.

Compile-time enforcement: the literal-union widening surfaced 3 missed call sites at `tsc --noEmit` time (one in `EngineCalibrationPanel.tsx`, two in `gemini-analysis.test.ts` fixtures), exactly as the threat model `T-18-04 (downstream)` predicted. All three were fixed in the same commit:
- `EngineCalibrationPanel.tsx` STATUS_BADGE / STATUS_LABEL gain `'EXPLORATORY-WATCH'` keys (placeholder visuals — Plan 18-08 owns refinement).
- Both `gemini-analysis.test.ts` copies' `buildEngineCtx` fixtures gain the 5 new ESS fields defaulted to `0`.

- Committed GREEN: `f19d212`.

## Task Commits

1. **Task 1 RED** — `c9ccbda` (test) — 3 failing tests for ESS + 'EXPLORATORY-WATCH' surface
2. **Task 1 GREEN** — `f19d212` (feat) — types + engine-context + post-process overwrite + 3 consumer fixups

## Files Created/Modified

- `src/lib/types.ts` — modified (EngineCalibration: 5 optional ESS fields + 'EXPLORATORY-WATCH' on 4 status unions; HorizonCalibration: optional ESS + 'EXPLORATORY-WATCH' on status).
- `src/lib/engine-context.ts` — modified (CellStatus widened, LearnedCellLike + ESS, deriveCellStatus + 'EXPLORATORY-WATCH', maxStatus reordered, resolveBucketCellAt30 returns ess, readHorizonCalibrations writes per-row ESS, EngineContext interface + 5 ESS fields, return literal populates them).
- `src/lib/gemini-analysis.ts` — modified (post-process overwrite block: 5 new ESS fields written from engineCtx).
- `src/lib/__tests__/engine-context.test.ts` — modified (buildLearnedCell helper + 3 new Phase 18-07 tests).
- `src/lib/__tests__/gemini-analysis.test.ts` — modified (buildEngineCtx fixture + 5 ESS defaults).
- `src/lib/gemini-analysis.test.ts` — modified (buildEngineCtx fixture + 5 ESS defaults).
- `src/components/EngineCalibrationPanel.tsx` — modified (STATUS_BADGE + STATUS_LABEL records gain 'EXPLORATORY-WATCH' key — placeholder visual).
- `.planning/phases/18-time-decayed-bayesian-updates-ess/deferred-items.md` — modified (logged 3 pre-existing validator findings on `gemini-analysis.ts`).

## Decisions Made

- **logistic_ess defaults to 0:** LogisticEpoch in Prisma has only `sample_size: Int` — no ESS column. Plan 18-03 was deliberately scoped to the LearnedPattern table, so the LogisticEpoch row carries raw N only. Surfacing `logistic_ess: 0` today is the honest pass-through; Plan 21 (or a future logistic-decay plan) can populate it once the schema is otherwise touched. Inline comment + key-decision documented.
- **HorizonCalibration.effective_sample_size = max across 4 signal classes:** mirrors the existing `sample_size = max(...)` convention in `readHorizonCalibrations`. Other choices considered: (a) sum across classes — rejected, would double-count when multiple classes share observations; (b) per-class array — rejected, breaks the row's flat-shape contract that Plan 18-09 will read.
- **EngineCalibration ESS fields all OPTIONAL, EngineContext ESS fields all REQUIRED:** EngineContext is the authoritative source (always populated, default 0); EngineCalibration is the persisted projection (old reports lack the fields). Identical pattern to Phase 16-04 (`technical_*` optional) and Phase 17-04 (`institutional_*` / `insider_*` optional).
- **EngineCalibrationPanel STATUS_BADGE / STATUS_LABEL placeholder:** the literal-union widening forced an exhaustiveness fix here, but the user-facing watch badge visual is owned by Plan 18-08. Shipping a placeholder (amber border on the tertiary base + `'EXPLORATORY (WATCH)'` text) keeps `tsc --noEmit` clean today without pre-empting the design.
- **Pre-existing gemini-analysis.ts validator findings logged, not fixed:** the PostToolUse Vercel-plugin validator surfaced 3 ERROR-level findings (direct Anthropic SDK import, env-key bypass, model-slug regex false-positive on a JSDoc line). All 3 predate this plan — the `git diff HEAD` for `gemini-analysis.ts` shows my edit is exclusively the 11-line overwrite-block append at line 849-859. The Anthropic SDK is required because Pool B niche discovery uses `web_search_20250305`, an Anthropic-native tool not exposed through the AI Gateway. Migrating that surface is a real architectural change with its own blast radius and is logged in `deferred-items.md` for a dedicated plan.

## Deviations from Plan

### Auto-handled discrepancies

**1. [Rule 3 — Blocking issue] Consumer literal-union exhaustiveness**

- **Found during:** Task 1 GREEN — `npx tsc --noEmit` failed with 3 errors after the union widening.
- **Issue:** Adding `'EXPLORATORY-WATCH'` to the EngineCalibration / EngineContext status unions forced 3 consumer sites (1 component + 2 test fixtures) to be updated, or `tsc --noEmit` would not pass — and the plan's acceptance criterion is `npx tsc --noEmit exits 0 across the whole repo`.
- **Fix (one commit, same as GREEN):**
  - `EngineCalibrationPanel.tsx`: STATUS_BADGE + STATUS_LABEL records gain `'EXPLORATORY-WATCH'` keys (placeholder visual).
  - `src/lib/gemini-analysis.test.ts` + `src/lib/__tests__/gemini-analysis.test.ts`: `buildEngineCtx` fixtures gain the 5 new ESS fields defaulted to `0`.
- **Why this is correct (not architectural / not Rule 4):** The fixes are mechanical exhaustiveness completions forced by the literal-union extension I introduced — exactly what the threat model `T-18-04 (downstream)` predicts and exactly what the plan's `key_links` field calls out (Plan 18-08 will refine the watch badge). No design decisions taken here; the placeholder visual is reversible by Plan 18-08.
- **Files modified:** `src/components/EngineCalibrationPanel.tsx`, `src/lib/gemini-analysis.test.ts`, `src/lib/__tests__/gemini-analysis.test.ts`
- **Committed in:** `f19d212` (rolled into the GREEN commit since the build is invalid without these fixes).

### Out-of-scope items logged for follow-up

**1. Pre-existing direct Anthropic SDK usage in `gemini-analysis.ts`**

- **Status:** Validator (PostToolUse Vercel plugin) flagged 3 ERROR-level findings on `gemini-analysis.ts` after my unrelated 11-line append. The SDK import + env-key reads are intentional per the file's own comments — Pool B niche discovery uses `web_search_20250305`, an Anthropic-native tool the AI Gateway doesn't expose.
- **Out of scope:** Migration to `@ai-sdk/anthropic` + OIDC requires either (a) Vercel exposing `web_search_20250305` through the Gateway, or (b) replacing Pool B with a Gemini-native search tool. Either is its own plan.
- **Logged:** `.planning/phases/18-time-decayed-bayesian-updates-ess/deferred-items.md`.

---

**Total deviations:** 1 auto-handled (Rule 3 — consumer literal-union exhaustiveness).
**Out-of-scope items:** 1 pre-existing validator finding logged for later.

## Issues Encountered

None — clean RED → GREEN cycle. The literal-union widening's compile-time exhaustiveness check did exactly what the threat model said it would (T-18-04 downstream): caught 3 missed call sites at `tsc` time, all fixable mechanically.

## Threat Mitigations Realized

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| trust-boundary-leak | Newly enforced for ESS | `grep` at lines 855-859 of `src/lib/gemini-analysis.ts`: 5 `engineCtx.*_ess` reads inside the `engine_calibration` overwrite block. The LLM's `output.engine_calibration` is read only for the prose strings (`engine_alignment`, `technical_alignment`, etc.); any numeric ESS field it might hallucinate is discarded. |
| T-18-04 (downstream) | Newly enforced | TS literal-union forced 3 missed call sites (component + 2 test fixtures) at `npx tsc --noEmit` time. Verified zero output from `tsc --noEmit` after fixes. Adding `'EXPLORATORY-WATCH'` to a non-literal `string` field would have allowed the bug to surface in production; the type system caught it at build time. |

## Verification Results

```
$ npm test -- --run src/lib/__tests__/engine-context.test.ts
 Test Files  1 passed (1)
      Tests  34 passed (34)              # 31 existing + 3 new

$ npm test -- --run src/lib/__tests__/gemini-analysis.test.ts src/lib/gemini-analysis.test.ts
 Test Files  2 passed (2)
      Tests  31 passed (31)              # 18 + 13, fixture fixups confirmed

$ npm test -- --run                       # Full unit-test suite
 Test Files  41 passed | 1 skipped (42)
      Tests  404 passed | 3 todo (407)   # zero regressions

$ npx tsc --noEmit && echo $?
0

$ grep -E "effective_sample_size|EXPLORATORY-WATCH" src/lib/engine-context.ts src/lib/types.ts | wc -l
45                                         # plan floor: ≥ 8
```

All Plan 18-07 acceptance criteria met:

- `src/lib/engine-context.ts` contains `effective_sample_size: number` inside the EngineContext interface — ✓ (line ~178 inside the interface block)
- `src/lib/engine-context.ts` contains `technical_ess: number` AND `institutional_ess: number` AND `insider_ess: number` AND `logistic_ess: number` — ✓
- `src/lib/engine-context.ts` `CellStatus` union contains literal `'EXPLORATORY-WATCH'` — ✓
- `src/lib/engine-context.ts` `LearnedCellLike` interface contains `effective_sample_size: number` — ✓
- `src/lib/engine-context.ts` returned EngineContext object literal contains `effective_sample_size: diffusionCell?.effective_sample_size ?? 0` — ✓
- `src/lib/types.ts` `EngineCalibration` contains literal `effective_sample_size?: number` — ✓
- `src/lib/types.ts` `EngineCalibration.status` union contains literal `'EXPLORATORY-WATCH'` — ✓
- `src/lib/types.ts` `HorizonCalibration` contains literal `effective_sample_size?: number` — ✓
- `npm test -- --run src/lib/__tests__/engine-context.test.ts` exits 0 with 34/34 — ✓ (existing 31 + 2 ESS + 1 status preservation)
- `npx tsc --noEmit` exits 0 across the whole repo — ✓
- `gemini-analysis.ts` post-process site overwrites `effective_sample_size` etc. — ✓ (lines 855-859)

## Self-Check: PASSED

- File `src/lib/types.ts` modified — VERIFIED via `git log -p f19d212 -- src/lib/types.ts` showing the EngineCalibration + HorizonCalibration + status-union diff hunks.
- File `src/lib/engine-context.ts` modified — VERIFIED.
- File `src/lib/gemini-analysis.ts` modified — VERIFIED at lines 855-859.
- File `src/lib/__tests__/engine-context.test.ts` modified — VERIFIED (3 new tests + helper extension).
- File `src/lib/__tests__/gemini-analysis.test.ts` modified — VERIFIED (fixture fixup).
- File `src/lib/gemini-analysis.test.ts` modified — VERIFIED (fixture fixup).
- File `src/components/EngineCalibrationPanel.tsx` modified — VERIFIED (STATUS_BADGE + STATUS_LABEL keys).
- File `.planning/phases/18-time-decayed-bayesian-updates-ess/deferred-items.md` modified — VERIFIED (validator findings logged).
- Commit `c9ccbda` exists in git log — VERIFIED (RED phase: 3 failing tests).
- Commit `f19d212` exists in git log — VERIFIED (GREEN phase: types + engine-context + overwrite + 3 fixups).
- 34 engine-context unit tests green — VERIFIED above.
- 404/404 + 3 todo full unit suite green — VERIFIED above (zero regressions).
- `npx tsc --noEmit` exits 0 — VERIFIED.
- `grep -E "effective_sample_size|EXPLORATORY-WATCH" src/lib/engine-context.ts src/lib/types.ts | wc -l` = 45 ≥ 8 — VERIFIED.

---
*Phase: 18-time-decayed-bayesian-updates-ess*
*Plan: 07*
*Completed: 2026-05-06*
