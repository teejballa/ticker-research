## Pre-existing test failures (out of scope for plan 30.1-04)

These 4 failures were present before plan 30.1-04 started (see plan 30.1-03 SUMMARY Self-Check note). They are env-related (require DATABASE_URL) and load-time-fail at `src/lib/sentiment/aggregator.ts:701`. Tracking here per the SCOPE BOUNDARY deviation rule:

- `tests/unit/anthropic-search-branching.test.ts > SourcePackage type includes security_type field`
- `src/lib/data/source-package.test.ts > collectAllData > returns SourcePackage with all 6 sections`
- `src/lib/data/source-package.test.ts > collectAllData > all 6 sections have collected_at timestamp (DATA-07)`
- `src/lib/data/source-package.test.ts > collectAllData > continues with partial data when one source fails`

**Resolution path:** either (a) set `DATABASE_URL=postgresql://localhost:5432/test` in vitest setup, or (b) lazy-import prisma in `src/lib/sentiment/aggregator.ts` matching the pattern in `tests/integration/bot-filter.integration.test.ts`. Out of scope for 30.1-04.
