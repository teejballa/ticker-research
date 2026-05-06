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
