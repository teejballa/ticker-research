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
