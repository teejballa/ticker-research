---
phase: 17-institutional-insider-intelligence
plan: "02"
subsystem: database
tags: [prisma, migration, neon, schema, smart-money]
dependency_graph:
  requires: []
  provides: [insider_at_report, institutional_at_report, insider_data, institutional_data]
  affects: [plans/17-03, plans/17-04]
tech_stack:
  added: []
  patterns: [prisma-migrate-deploy, additive-nullable-jsonb, describe-skipif-db]
key_files:
  created:
    - prisma/migrations/20260430_add_smart_money_columns/migration.sql
    - tests/integration/schema-phase-17.test.ts
  modified:
    - prisma/schema.prisma
decisions:
  - "Used prisma migrate deploy exclusively (db push forbidden) to maintain production replay parity with Vercel build"
  - "afterEach cleanup uses __phase17_test__ suffix to avoid polluting live learned_patterns rows"
  - "describe.skipIf(!DATABASE_URL) guards integration tests in CI without live DB"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-30"
  tasks_completed: 4
  tasks_total: 4
  files_created: 2
  files_modified: 1
---

# Phase 17 Plan 02: Schema Extension — Smart Money Columns Summary

Wave-1 additive schema migration adding 4 nullable JSONB columns to live Neon via `prisma migrate deploy`, with a green 8-test integration suite locking the structural correctness.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Edit prisma/schema.prisma — 4 nullable Json columns | 9605383 | prisma/schema.prisma |
| 2 | Author migration SQL (4 ALTER TABLE statements) | 64d33a3 | prisma/migrations/20260430_add_smart_money_columns/migration.sql |
| 3 [BLOCKING] | Apply migration to live Neon + regenerate Prisma client | 64d33a3 | (live DB + node_modules/.prisma/client) |
| 4 | Write schema-phase-17 integration test (8 tests) | 53320f5 | tests/integration/schema-phase-17.test.ts |

## Migration Applied

**Mechanism:** `prisma migrate deploy` (EXCLUSIVE — `db push` was forbidden per plan spec)

**Log path:** `/tmp/migrate-deploy-phase17.log`

**Log output (key line):**
```
Applying migration `20260430_add_smart_money_columns`
All migrations have been successfully applied.
```

## Information Schema Verification

Post-migration sanity check confirmed all 4 columns exist in live Neon:

```
snapshots: [{"column_name":"insider_data"},{"column_name":"institutional_data"}]
reports:   [{"column_name":"insider_at_report"},{"column_name":"institutional_at_report"}]
```

All 4 columns are `data_type = 'jsonb'` (confirmed by integration test assertions).

## Integration Test Results

`npm run test:integration -- --run tests/integration/schema-phase-17.test.ts`

```
✓ Phase 17 schema migration (8 tests) 2975ms
  ✓ sentiment_snapshots.insider_data is jsonb
  ✓ sentiment_snapshots.institutional_data is jsonb
  ✓ reports.insider_at_report is jsonb
  ✓ reports.institutional_at_report is jsonb
  ✓ LearnedPattern accepts signal_class = "insider"
  ✓ LearnedPattern accepts signal_class = "institutional"
  ✓ composite unique constraint is enforced for new signal_class values
  ✓ pre-existing snapshots have null insider_data and institutional_data (D-19)

Test Files  1 passed (1)
     Tests  8 passed (8)
```

## Build Verification

- `npx tsc --noEmit` — exits 0 (no type errors)
- `npm run build` — exits 0 (warnings only, pre-existing; no new errors from additive migration)
- `vercel.json` `buildCommand` = `prisma migrate deploy && next build` — verified unchanged

## LearnedPattern signal_class (D-14)

`signal_class` is already a `String` column accepting arbitrary text. Tests 5 and 6 confirm `'insider'` and `'institutional'` round-trip through Prisma without error. Tests 7 confirms the composite unique constraint `(signal_class, pattern_key, cap_class, horizon_days)` enforces uniqueness for the new values.

## Deviations from Plan

### Pre-Existing Issue (out of scope)

`tests/integration/schema-phase-16.test.ts` test 6 (`existing learned_patterns rows backfilled to diffusion / 7d / non-null pattern_key`) fails because the DB now contains `signal_class = 'technical'` rows written by Phase 16's own learn cron after the migration landed. This pre-dates plan 17-02 — no Phase 17 code writes or alters these rows. Out of scope per deviation rules (pre-existing failure in unrelated file).

No deviations from the 17-02 plan spec. Plan executed exactly as written.

## Handoff to Plans 17-03 and 17-04

Plans 17-03 (sentiment-scan cron) and 17-04 (engine-context) are **unblocked**:

- Prisma client is regenerated with `insider_data`, `institutional_data`, `insider_at_report`, `institutional_at_report` typed as `JsonValue | null`
- Live Neon has the columns; no runtime crash possible from missing columns
- Build is fully green; no batch-merge required (pure additive migration)

## Self-Check: PASSED

All created files exist on disk. All task commits confirmed in git log:
- 9605383 — schema edit (Task 1)
- 64d33a3 — migration SQL (Task 2)
- 53320f5 — integration test (Task 4)

Task 3 (live DB push) is a runtime operation with no separate commit; verified via information_schema query and `/tmp/migrate-deploy-phase17.log`.
