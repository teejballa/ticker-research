---
phase: 19-cipher-v2-0-excellence
plan: 19-Z-01
subsystem: infra
tags: [feature-flags, env-vars, typescript, vitest, vercel, phase-19, wave-z]

# Dependency graph
requires:
  - phase: 18-time-decayed-bayesian-updates
    provides: stable Phase 18 ML primitives (decayWeights, ESS, drift) which must NOT regress per D-54
provides:
  - "src/lib/features.ts: typed Features object + resolveFeatures() + FeatureMode type"
  - "Three-mode flag system (off | shadow | on) for all 15 Phase 19 cutovers"
  - "Module-load validation: misconfigured FEATURE_* env var throws at startup, not request time"
  - "FLAG_NAMES const array as single source of truth for downstream Wave A/B/C plans"
affects: [19-Z-02, 19-Z-03, 19-Z-04, 19-A-01..07, 19-B-01..08, 19-C-01..11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-mode feature flag (off | shadow | on) — supersedes binary boolean flags"
    - "Env-var override map (FLAG_ENV_OVERRIDES) for shorthand names"
    - "Module-load `FEATURES = resolveFeatures()` so misconfig fails fast"

key-files:
  created:
    - "src/lib/features.ts (75 LOC)"
    - "tests/lib/features.test.ts (43 LOC)"
  modified:
    - ".env.example (+17 lines: 15 FEATURE_* defaults + section header + spacer)"

key-decisions:
  - "FLAG_NAMES is the canonical 15-flag list; downstream Wave A/B/C plans import this array"
  - "`conformal_intervals` flag reads from shorthand env var FEATURE_CONFORMAL via override map (matches .env.example convention)"
  - "parseMode accepts both 'false'/'off' as off and 'true'/'on' as on so .env.example default values (=off) round-trip without erroring"
  - "FEATURES exported as module-load constant — misconfig surfaces at process start, not first request (T-19-Z-01-01 mitigation)"

patterns-established:
  - "Three-mode flag: every Wave A/B/C plan reads from FEATURES.<name>_mode (for shadow A/B plumbing) and FEATURES.<name>_enabled (for cutover gating)"
  - "Env-var override map: extend FLAG_ENV_OVERRIDES when a flag's env var name diverges from the simple FEATURE_<UPPER> derivation"

requirements-completed: []

# Metrics
duration: ~10 min
completed: 2026-05-07
---

# Phase 19 Plan 19-Z-01: features.ts flag matrix + env wiring Summary

**Three-mode (off | shadow | on) feature flag matrix exposing 15 typed Phase 19 flags from `src/lib/features.ts`; all flags default to off; misconfigured env values throw at module load with descriptive errors. Foundation for every Wave A/B/C cutover.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-07T14:59:30Z
- **Completed:** 2026-05-07T15:02:46Z
- **Tasks:** 5/5
- **Files modified:** 3 (1 created module, 1 created test, 1 modified env template)

## Accomplishments

- `src/lib/features.ts` exports `FeatureMode`, `Features`, `resolveFeatures()`, and module-load `FEATURES` constant
- 5 unit tests covering: defaults to false, parses 'true' as enabled, parses 'shadow' as shadow mode, rejects unknown values with descriptive error, all 15 flags expose both `_enabled` + `_mode`
- 15 `FEATURE_*=off` lines documented in `.env.example` so first deploy is a guaranteed no-op
- Plan 18-10 sanity test (`src/lib/__tests__/learning.hyperparameters.test.ts`) verified still GREEN — D-54 honored, zero Phase 18 regression
- Full unit suite: 414 passed / 3 todo / 1 file skipped — clean baseline for Wave A/B/C parallel work

## Task Commits

Each task was committed atomically (TDD discipline preserved):

1. **Task 1: Failing test suite** — `4623070` (test) — `tests/lib/features.test.ts` red, "Cannot find module '../../src/lib/features'"
2. **Task 2: Implementation** — `2b300e3` (feat) — `src/lib/features.ts` makes all 5 tests GREEN
3. **Task 3: .env.example defaults** — `bd4990e` (chore) — 15 FEATURE_* lines appended

_Note: Task 4 (full-suite verification) and Task 5 (final commit) were absorbed into the per-task TDD commits above; no separate "squash" commit was made because each TDD step is independently meaningful in git history. See Deviations._

## Files Created/Modified

- `src/lib/features.ts` — 75 LOC; FLAG_NAMES tuple (15 names), Features mapped type, parseMode, envVarFor, resolveFeatures, FEATURES module-load constant
- `tests/lib/features.test.ts` — 43 LOC; 5 vitest cases with beforeEach/afterEach env snapshot/restore
- `.env.example` — +17 lines; Phase 19 feature flag section with all 15 defaults set to `off`

## Decisions Made

- **Env-var override map for `conformal_intervals`** — The plan's TDD test (impl-plan line 134) and `.env.example` block (impl-plan line 239) both use `FEATURE_CONFORMAL`, not `FEATURE_CONFORMAL_INTERVALS`. Encoded this asymmetry as a `FLAG_ENV_OVERRIDES: Partial<Record<FlagName, string>>` map so future shorthand mappings have a single, typed extension point.
- **`parseMode` accepts `'off'` literal as off mode** — The impl-plan parser only accepted `'false'`/`'true'`/`'shadow'`/empty, but `.env.example` ships `=off` literals as defaults. Without accepting `'off'`, the very first deploy of the module would throw `must be one of: false, shadow, true (got: off)`. Treating `'off'` and `'on'` as synonyms of `'false'` and `'true'` is strictly more compatible and the test suite still validates the error path with `'invalid'`.
- **TDD-style separate commits over a single squash commit** — Plan Task 5 originally suggested a single commit covering all three files. Per the executor's task_commit_protocol (atomic per-task commits) and the TDD discipline the plan itself prescribes (RED commit → GREEN commit → docs commit), I committed each phase separately. Each commit's subject carries the `19-z-01` scope so the acceptance check `git log -1 --pretty=%s | grep -q "19-z-01"` still passes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added env-var override map for `conformal_intervals` shorthand**
- **Found during:** Task 2 (first GREEN run)
- **Issue:** The naive `FEATURE_${name.toUpperCase()}` derivation read `FEATURE_CONFORMAL_INTERVALS`, but the test file (and `.env.example`) use shortened `FEATURE_CONFORMAL`. Three of five tests failed.
- **Fix:** Added `FLAG_ENV_OVERRIDES: Partial<Record<FlagName, string>> = { conformal_intervals: 'FEATURE_CONFORMAL' }` and `envVarFor()` helper that consults the map first, then falls back to the upper-case derivation.
- **Files modified:** `src/lib/features.ts`
- **Verification:** All 5 tests GREEN immediately after the fix; full suite still green.
- **Committed in:** `2b300e3` (Task 2 commit)

**2. [Rule 2 - Missing Critical] `parseMode` accepts `'off'` and `'on'` as synonyms of `'false'` and `'true'`**
- **Found during:** Task 2 implementation (anticipating .env.example load)
- **Issue:** `.env.example` ships 15 `FEATURE_*=off` lines. The parser as quoted in impl-plan only accepted `'false'`/`'true'`/`'shadow'`/empty. First production deploy would throw `must be one of: false, shadow, true (got: off)` — startup failure for the canonical default config.
- **Fix:** Extended `parseMode` to treat `'off'` like `'false'` (off mode) and `'on'` like `'true'` (on mode). Unknown-value error path unchanged; the `rejects unknown values` test still passes with `'invalid'`.
- **Files modified:** `src/lib/features.ts`
- **Verification:** All 5 tests GREEN; loaded module successfully resolves `FEATURE_*=off` defaults from `.env.example` to mode `'off'` without throwing.
- **Committed in:** `2b300e3` (Task 2 commit)

**3. [Rule 3 - Blocking] Per-task TDD commits instead of single squash commit at Task 5**
- **Found during:** Reviewing Task 5 against task_commit_protocol
- **Issue:** Plan Task 5 prescribed a single combined commit; task_commit_protocol prescribes atomic per-task commits, and TDD discipline (which the plan itself uses for Tasks 1+2) requires separate RED and GREEN commits to preserve the audit trail.
- **Fix:** Three commits — one per task — each carrying `19-z-01` scope. Acceptance criterion `git log -1 --pretty=%s | grep -q "19-z-01"` still passes (HEAD is `chore(19-z-01): document...`).
- **Files modified:** none (process change)
- **Verification:** `git log --oneline -3` shows three `19-z-01`-scoped commits; `git log --pretty=format: --name-only -3 | sort -u` shows all three intended files: `src/lib/features.ts`, `tests/lib/features.test.ts`, `.env.example`.
- **Committed in:** `4623070`, `2b300e3`, `bd4990e`

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing-critical, 1 blocking process)
**Impact on plan:** All three deviations strictly reinforce the plan's intent. The override map keeps the `.env.example` convention the plan itself ships; accepting `'off'`/`'on'` literals makes the default config loadable; the per-task commits preserve the TDD audit trail. No scope creep.

## Issues Encountered

- First GREEN run failed 3 of 5 tests because `FEATURE_${name.toUpperCase()}` produced `FEATURE_CONFORMAL_INTERVALS` while tests use shortened `FEATURE_CONFORMAL`. Resolved by override map. ~2 min lost.

## User Setup Required

None — no external service configuration required. All 15 `FEATURE_*` env vars are optional and default to `off` via `parseMode` returning `off` for null/undefined/empty.

## Foundation Declaration

**Wave A/B/C may now read from `FEATURES` for all flag gating.** Pattern for downstream plans:

```typescript
import { FEATURES } from '@/lib/features';

if (FEATURES.conformal_intervals_mode === 'shadow') {
  // run new path in setImmediate background, log to ShadowComparison (D-14)
}
if (FEATURES.conformal_intervals_enabled) {
  // hot path: new code only, old code may be deleted in same commit (D-05)
}
```

Adding new flags requires:
1. Append name to `FLAG_NAMES` in `src/lib/features.ts`
2. Append `FEATURE_<UPPER>=off` to `.env.example`
3. (If shorthand) extend `FLAG_ENV_OVERRIDES` map

## Self-Check

- [x] `src/lib/features.ts` exists at `/Users/tj/Desktop/Cipher/src/lib/features.ts`
- [x] `tests/lib/features.test.ts` exists at `/Users/tj/Desktop/Cipher/tests/lib/features.test.ts`
- [x] `.env.example` modified at `/Users/tj/Desktop/Cipher/.env.example` (15 FEATURE_* lines)
- [x] Commit `4623070` exists (test RED)
- [x] Commit `2b300e3` exists (feat GREEN)
- [x] Commit `bd4990e` exists (chore env)
- [x] `npx vitest run tests/lib/features.test.ts` exits 0 with 5 passed
- [x] `npx vitest run` (full suite) exits 0 — 414 passed, 3 todo, 0 failed
- [x] `src/lib/__tests__/learning.hyperparameters.test.ts` GREEN (Plan 18-10 sanity, D-54 honored)

## Next Phase Readiness

- Wave Z foundation laid; Plans 19-Z-02 (schema migration), 19-Z-03 (shadow harness), 19-Z-04 (cutover script) can proceed
- Waves A, B, C unblocked: each plan in those waves now imports from `@/lib/features` to gate its new code path
- Zero regressions to Phase 18 ML primitives — diffusion engine still ships every cycle as before

---
*Phase: 19-cipher-v2-0-excellence*
*Completed: 2026-05-07*
