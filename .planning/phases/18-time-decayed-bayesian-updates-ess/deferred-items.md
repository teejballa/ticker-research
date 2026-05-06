# Deferred Items — Phase 18

Items discovered during plan execution that are out of scope for the current plan
and should be tracked for follow-up.

## Pre-existing test failures discovered during 18-04 execution

### `tests/integration/learn-dual-class.test.ts` — "one 7d outcome with diffusion + tech updates 2 cells at horizon=7, no logistic update"

- **Status:** Failing on the worktree base (commit `0ae03bd`) — predates Plan 18-04 changes.
- **Symptom:** `expect(epochsAfter).toBe(epochsBefore)` — test expects no LogisticEpoch
  appended at horizon=7, but the cron writes one. The "epochsBefore" snapshot is
  taken after a prior test seeded an outcome that already triggered an epoch persist,
  so the assertion is comparing against stale state.
- **Verified:** `git stash && npm run test:integration -- --run tests/integration/learn-dual-class.test.ts` reproduces the failure on the bare worktree before any of Plan 04's edits. Restored via `git stash pop`.
- **Out-of-scope here:** Not introduced by 18-04 (this plan only touches `recomputeOneCell` body and adds Phase 18 imports/tests; it doesn't change the logistic-epoch persist path at horizon=7 vs 30).
- **Likely owner:** Test ordering / isolation in `learn-dual-class.test.ts`. Should be addressed by either resetting `LogisticEpoch` rows in `beforeEach` or by tightening the assertion to count only epochs created during the current call.
- **Action:** Not fixed by this plan. Logged here for triage in a future cleanup pass.

## Pre-existing validator findings on `src/lib/gemini-analysis.ts` discovered during 18-07

- **Surfaced by:** PostToolUse Vercel-plugin validator after my Phase 18-07 edit
  added 5 ESS overwrite properties to the engine_calibration object literal.
- **Findings (all 3 pre-existing, none caused by 18-07):**
  1. Line 12 — `import Anthropic from '@anthropic-ai/sdk';` — direct SDK import
     instead of `@ai-sdk/anthropic`. **Intentional**: file comments at lines 9-11
     explicitly document this is required because Pool B niche discovery uses
     the `web_search_20250305` tool, which is not exposed through the AI Gateway.
  2. Line 17-18 — `const anthropicClient = new Anthropic();` — reads
     `ANTHROPIC_API_KEY` from `process.env`. Same root cause as #1 — the
     `web_search_20250305` tool requires the Anthropic SDK; the Gateway path
     doesn't support it as of this writing.
  3. Line 642 — false-positive on model-slug regex. Line 642 is a JSDoc comment
     `* Exported as a NAMED function so plan 16-05's integration test...` —
     "16-05" matched the validator's hyphen-version pattern. The actual model
     slug is `'google/gemini-3-flash'` at line 771 and is the correct AI Gateway
     routing format for Gemini.
- **Verified pre-existing:** `git diff HEAD -- src/lib/gemini-analysis.ts`
  shows my edit only adds lines 849-859 to the Plan 17-04 overwrite block —
  the imports, anthropic client, and JSDoc comment all predate this plan.
- **Out-of-scope here:** Migrating Pool B niche discovery away from the direct
  Anthropic SDK to the AI Gateway is an architectural change with its own
  blast radius (web search tool availability, cost tracking, OIDC auth). Not
  appropriate to bundle into a Wave-3 type-surface plan.
- **Action:** Not fixed by this plan. Track for a dedicated `ai-gateway`
  migration plan once Vercel exposes `web_search_20250305` through the
  Gateway, or migrate Pool B to a Gemini-native search tool.

## Pre-existing integration-test failures discovered during 18-10 full-suite audit

Three integration tests fail on the worktree base (commit `393e1e3`) before
any Plan 18-10 changes. Reproduced via `git stash && npm run test:integration`
on the bare base, then restored via `git stash pop`. Plan 18-10 makes zero
edits to any of these files (`git log 393e1e3..HEAD` on each path returns empty).

### `tests/integration/learn-dual-class.test.ts` — "one 7d outcome ... no logistic update"
- Already logged above (discovered first during Plan 18-04). Status unchanged.
- Test ordering / isolation issue around `LogisticEpoch` snapshot. Logistic-pop
  invariant is correct; the assertion is comparing against stale state.

### `tests/integration/backfill-active-rate.test.ts` — "AC3: ≥25% ACTIVE in most-traded cap_class × horizon=7"
- The check-active-cell-coverage.ts script computes a coverage metric that
  depends on the live `LearnedPattern` table state (Phase 16 backfill rate).
- Likely root cause: under Plan 18-04's stricter ESS<30 → EXPLORATORY gate,
  many cells previously ACTIVE on raw N≥10 demoted; the AC3 threshold was
  authored for the pre-Phase-18 promotion rule.
- Out-of-scope here: this is a Phase 16 acceptance criterion meeting a
  Phase 18 promotion-rule change. Belongs in a Phase 18 follow-up that
  retunes the AC3 threshold OR a Plan 21 cross-phase reconciliation.

### `tests/integration/schema-phase-16.test.ts` — "existing learned_patterns rows backfilled to diffusion / 7d / non-null pattern_key"
- The test seeds rows with `signal_class='insider'` then expects backfill
  to coerce them to `'diffusion'`. Phase 16 backfill no longer rewrites
  `signal_class` for rows that already carry a non-default class — the
  test was authored before Phase 16-03 added the dual-class persistence.
- Out-of-scope here: legitimate Phase 16 test cleanup that should land
  alongside the Phase 16 retrospective.

**Verification that these are NOT regressions from Plan 18-10:**
```
$ git stash && npm run test:integration 2>&1 | grep -E "FAIL"
 FAIL  tests/integration/backfill-active-rate.test.ts ...
 FAIL  tests/integration/learn-dual-class.test.ts ...
 FAIL  tests/integration/schema-phase-16.test.ts ...
$ git stash pop
```
Same 3 failures, same line numbers, on the bare worktree base — Plan 18-10
adds only a unit test (`learning.hyperparameters.test.ts`) and a single
exported `Set` to `learning.ts`; it cannot have introduced these.
