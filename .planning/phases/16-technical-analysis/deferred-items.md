
## Plan 16-03 — Sentiment-scan route validator findings (deferred)

- **vercel-functions Line 56:** 2s throttle-sleep between tickers in `src/app/api/cron/sentiment-scan/route.ts`. Pre-existing pattern; plan 16-03 explicitly says "PRESERVE the throttle-sleep". Refactor to Vercel Workflow is a cross-cutting concern, deferred.
- **vercel-functions Line 13:** Route handler has no observability instrumentation. Same pre-existing deferral as 16-02. Cross-cutting observability plan owns this.

## Plan 16-03 — Pre-existing broken integration test (16-04 scope)

- **`tests/integration/engine-affects-reports.test.ts`** — fails with PrismaClientValidationError on `prisma.learnedPattern.deleteMany({ where: { flow_pattern: FLOW, cap_class: CAP } })` (line 30, 84). Uses the OLD `flow_pattern` column on `LearnedPattern` that plan 16-02 dropped.
- This test is explicitly listed in 16-02-SUMMARY.md "Deferred Issues" as a handoff to plans 16-03 / 16-04. Plan 16-04 owns rewriting this test against the new composite key — it depends on engine-context.ts being updated (also in 16-04 scope).
- Plan 16-03 does NOT own the engine-context lookup or its tests. The test was failing before 16-03 began and is failing for the same reason.
- Side-effect: the test's `cleanup()` partially completes before the error, leaving residual `TEST_TICKER` rows in `sentiment_snapshots`. This causes flaky FK violations on `price_outcomes_snapshot_id_fkey` when other test files run in parallel and try to write outcomes against the residual snapshots. Both effects resolve once plan 16-04 fixes the test.
