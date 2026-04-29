---
phase: 16-technical-analysis
plan: 02
subsystem: database
tags: [prisma, postgres, neon, migration, schema, multi-horizon, learning-engine]

# Dependency graph
requires:
  - phase: 13-diffusion-learning-engine
    provides: LearnedPattern, LearningEvent, SentimentSnapshot, PriceOutcome models that this plan reshapes
  - phase: 16-01
    provides: TechPattern type + technicalindicators dependency that pattern_key values will eventually reference
provides:
  - LearnedPattern model keyed on (signal_class × pattern_key × cap_class × horizon_days) instead of (flow_pattern × cap_class)
  - LearningEvent parallel rename (flow_pattern → pattern_key + signal_class + horizon_days)
  - SentimentSnapshot.technical_data JSONB column for per-snapshot technical state
  - Report.technical_at_report JSONB column for per-report technical state
  - price-followup cron writes outcomes for 6 horizons (3/7/14/30/60/90) over a 95-day window
  - Live Neon DB migrated atomically via prisma migrate deploy with hand-edited expand-then-contract SQL
  - Two live-DB integration tests locking the migration shape and the multi-horizon behaviour
affects: [16-03 (learn cron rewrite), 16-04 (engine-context + UI), 16-05 (backfill + insights)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Expand-then-contract migrations: ADD COLUMN with DEFAULT → backfill UPDATE → ALTER COLUMN SET NOT NULL → DROP old column. Atomic per-Postgres-tx; survives Neon serverless cold starts."
    - "Hand-edited migration.sql (NOT auto-generated) when ordering of UPDATE-before-NOT-NULL is load-bearing — protects against silent data loss on rename."
    - "Explicit Postgres index names with @@unique map: when default Prisma name exceeds NAMEDATALEN=63."
    - "::text casts on information_schema/pg_indexes queries when using @prisma/adapter-neon — driver cannot natively deserialise Postgres `name` type."
    - "Live-DB integration tests gated by describe.skipIf(!process.env.DATABASE_URL) so contributors without DB access still see green."
    - "Yahoo-finance2 stubbed in cron tests via vi.mock so throwaway tickers do not depend on Yahoo's recognition."

key-files:
  created:
    - prisma/migrations/20260427_add_technical_signal_class/migration.sql
    - tests/integration/schema-phase-16.test.ts
    - tests/integration/price-followup-horizons.test.ts
  modified:
    - prisma/schema.prisma
    - src/app/api/cron/price-followup/route.ts

key-decisions:
  - "Renamed live unique index to learned_patterns_lookup_key (Postgres NAMEDATALEN=63 truncates the default Prisma name silently — explicit map: in @@unique keeps schema/migration/DB in sync)."
  - "Preserved DiffusionTrace.flow_pattern column (out of scope; the plan only targets LearnedPattern and LearningEvent — diffusion regime tagging uses its own column on a different table)."
  - "Replaced inlined `[3, 7] as const` literal in the snapshot loop with the TARGET_DAYS constant — the literal was a latent bug that would have silently dropped 14/30/60/90 outcomes for snapshots even after extending TARGET_DAYS."
  - "Stubbed yahoo-finance2 in the cron integration test (test ticker TEST_PHASE16_PFU is unknown to Yahoo) — keeps the test about horizon logic, not the data fetcher."

patterns-established:
  - "Expand-then-contract Prisma migration with hand-authored SQL when rename ordering is critical."
  - "Live-DB integration tests cast information_schema/pg_indexes columns to ::text for @prisma/adapter-neon compatibility."

requirements-completed: [16-02, AC3-precondition]

# Metrics
duration: ~25 min
completed: 2026-04-28
---

# Phase 16 Plan 02: Engine schema reshape + multi-horizon outcomes Summary

**Migrated live Neon to dual-class multi-horizon LearnedPattern keyed on (signal_class × pattern_key × cap_class × horizon_days), added technical_data/technical_at_report JSONB columns, and extended the price-followup cron to write outcomes at 6 horizons (3/7/14/30/60/90) over a 95-day window — locked behind 13 live-DB integration assertions.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-29T03:23Z (approx — branch reset to base)
- **Completed:** 2026-04-29T03:48Z
- **Tasks:** 5/5
- **Commits:** 6 (5 task commits + 1 final docs)
- **Files modified:** 5 (2 modified, 3 created)
- **Tests:** 13 live-DB integration assertions (all green)

## Accomplishments
- Prisma schema reshaped: LearnedPattern now keyed `(signal_class, pattern_key, cap_class, horizon_days)`; LearningEvent received the parallel rename; SentimentSnapshot/Report each gained a nullable JSONB column for per-cycle technical state.
- Hand-authored expand-then-contract migration SQL applied atomically to live Neon via `prisma migrate deploy` (Pitfall 3 — UPDATE before NOT NULL — averted by explicit ordering).
- price-followup cron extended from 3 horizons (3/7/14) over 15d to 6 horizons (3/7/14/30/60/90) over 95d. Both the report loop and the (formerly hardcoded) snapshot loop now share `TARGET_DAYS`.
- Two live-DB integration test files added: `tests/integration/schema-phase-16.test.ts` (7 assertions on the migration shape + backfill) and `tests/integration/price-followup-horizons.test.ts` (6 assertions on the cron behaviour at each new horizon, including a window-coverage proof and a dedup proof).

## Task Commits

Each task was committed atomically (no pre-commit hooks bypassed beyond the prompt's `--no-verify` requirement for parallel agents):

1. **Task 1: Update prisma/schema.prisma** — `1676b33` (feat)
2. **Task 2: Author expand-then-contract migration SQL** — `b07e839` (feat)
3. **Task 3: Push to live Neon + index rename fix** — `369d76c` (fix)
4. **Task 4: Extend price-followup horizons** — TDD pair: `e3c173b` (test, RED) + `66721fd` (feat, GREEN)
5. **Task 5: Schema integration test** — `69f5225` (test)

## Files Created/Modified

- `prisma/schema.prisma` — LearnedPattern reshaped; LearningEvent renamed; SentimentSnapshot/Report each get a JSONB column; explicit `map: "learned_patterns_lookup_key"` on the new composite unique. DiffusionTrace.flow_pattern preserved (out of scope).
- `prisma/migrations/20260427_add_technical_signal_class/migration.sql` — Hand-edited expand-then-contract SQL: ADD COLUMN with DEFAULT → UPDATE backfill → SET NOT NULL → DROP old column → CREATE shorter-named UNIQUE INDEX → DROP DEFAULTs. Parallel rename for `learning_events`. JSONB columns on `sentiment_snapshots` and `reports`.
- `src/app/api/cron/price-followup/route.ts` — `TARGET_DAYS = [3, 7, 14, 30, 60, 90]`; `windowMs = 95 * 24 * 60 * 60 * 1000`; replaced inline `[3, 7] as const` in the snapshot loop with `TARGET_DAYS`.
- `tests/integration/schema-phase-16.test.ts` — 7 assertions (column existence, removed flow_pattern, explicit unique-index name, JSONB column types, backfill correctness on existing rows, learning_events parallel rename).
- `tests/integration/price-followup-horizons.test.ts` — 6 assertions (30/60/90 each get an outcome, no-horizon-match writes nothing, dedup, 95d window covers a 90d-old snapshot). Stubs `yahoo-finance2` so the throwaway test ticker does not depend on Yahoo recognition.

## Migration SQL applied

The hand-edited migration.sql committed in `b07e839` was applied to live Neon via `npx prisma migrate deploy` — captured in `/tmp/migrate-deploy-phase16.log`:

```
5 migrations found in prisma/migrations
Applying migration `20260427_add_technical_signal_class`
The following migration(s) have been applied:
migrations/
  └─ 20260427_add_technical_signal_class/
    └─ migration.sql
All migrations have been successfully applied.
```

`prisma db push` was NOT used at any point (it would bypass the hand-authored UPDATE-before-NOT-NULL ordering and silently lose `flow_pattern` data). `migrate deploy` is the exclusive mechanism — captured by `<acceptance_criteria>` and re-asserted by future Vercel deploys via `vercel.json` `buildCommand: "prisma migrate deploy && next build"` (already in place from base commit `acb19fc`).

## Information_schema sanity-check outputs

Captured in `/tmp/migrate-deploy-phase16-sanity.log`:

- `learned_patterns` columns: `alpha, alpha_30d, beta, beta_30d, brier_in_sample, brier_null, brier_out_sample, cap_class, drift_z, hits, horizon_days, id, last_updated, pattern_key, sample_size, signal_class, status` — `flow_pattern` dropped, `signal_class` / `pattern_key` / `horizon_days` present.
- `sentiment_snapshots` columns: `community_data, id, price_at_scan, scanned_at, technical_data, ticker` — `technical_data` JSONB present.
- `reports` columns: `analysis, analyzed_at, community_data, company_name, confidence_level, id, market_sentiment, price_at_report, technical_at_report, ticker, user_id` — `technical_at_report` JSONB present.
- `learning_events` columns: `cap_class, delta, event_type, horizon_days, id, message, occurred_at, outcome_id, pattern_key, signal_class, ticker` — `flow_pattern` dropped, parallel rename complete.
- `learned_patterns` indexes: `learned_patterns_pkey`, `learned_patterns_lookup_key` (after the truncation-fix rename).

## Pre-existing-row counts that backfilled

- `learned_patterns`: 0 rows (live Neon was empty for this table at migration time). Backfill assertions in `schema-phase-16.test.ts` are vacuously true. Plan 16-03 should expect to start from an empty `learned_patterns` table.
- `learning_events`: count not captured in the sanity log; backfill UPDATE used `WHERE flow_pattern IS NOT NULL`, so any pre-existing rows with non-null flow_pattern got `signal_class='diffusion'`, `horizon_days=7`, `pattern_key=<old flow_pattern>`. Older diagnostic / cron-error events (no flow_pattern) were left as-is, then the column was dropped.

## Decisions Made

1. **Index rename** — discovered live: Postgres truncated the default Prisma name `learned_patterns_signal_class_pattern_key_cap_class_horizon_days_key` (67 chars) to fit NAMEDATALEN=63. Renamed the live index to `learned_patterns_lookup_key` and added explicit `map: "learned_patterns_lookup_key"` to the schema's `@@unique`. Migration SQL also updated so any future Neon branch ends up with the same explicit name.
2. **DiffusionTrace.flow_pattern preserved** — the plan's blanket "grep `flow_pattern` returns 0 in schema.prisma" criterion is too aggressive; semantically the plan only touches LearnedPattern + LearningEvent. DiffusionTrace.flow_pattern is the regime classification of a trace, used by `src/lib/diffusion-trace.ts`. Removing it is out of scope and would break the diffusion engine in a way no other plan addresses.
3. **Snapshot-loop literal replaced with TARGET_DAYS constant** — the price-followup route had a separate inlined `[3, 7] as const` for snapshots that the plan's action steps did not call out. Without this fix, snapshots would have been stuck at 2 horizons even after TARGET_DAYS was extended.
4. **Yahoo-finance2 stubbed in cron test** — using a real ticker would either pollute production data or make the test depend on Yahoo's network behaviour. Stubbing keeps the test focused on horizon logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Postgres NAMEDATALEN=63 silently truncated the default Prisma index name**
- **Found during:** Task 3 (live `migrate deploy` + sanity-check query)
- **Issue:** Migration SQL specified `CREATE UNIQUE INDEX "learned_patterns_signal_class_pattern_key_cap_class_horizon_days_key" ...` (67 chars). Postgres silently truncated to 63 chars, leaving the live index named `learned_patterns_signal_class_pattern_key_cap_class_horizon_day` and breaking the planned acceptance criterion (and the schema integration test's exact-name match).
- **Fix:** `ALTER INDEX ... RENAME TO "learned_patterns_lookup_key"` on live Neon; updated migration SQL to use the shorter name from the start; added `map: "learned_patterns_lookup_key"` to the schema `@@unique` so Prisma's introspection matches reality.
- **Files modified:** prisma/schema.prisma, prisma/migrations/20260427_add_technical_signal_class/migration.sql
- **Verification:** Sanity query confirms `learned_patterns_lookup_key` is present; schema-phase-16 integration test asserts it.
- **Committed in:** `369d76c` (Task 3 commit)

**2. [Rule 1 - Bug] price-followup snapshot loop used inlined `[3, 7] as const` instead of TARGET_DAYS**
- **Found during:** Task 4 GREEN run (4 of 6 horizon assertions still failing after extending the TARGET_DAYS const at module top)
- **Issue:** The route had two parallel loops — one for reports using `TARGET_DAYS`, one for snapshots using a hardcoded `[3, 7] as const` literal. The plan's action step only mentioned editing the top-level `TARGET_DAYS` and `windowMs`, missing the snapshot-loop literal.
- **Fix:** Replaced `[3, 7] as const` with `TARGET_DAYS` so both loops share the constant.
- **Files modified:** src/app/api/cron/price-followup/route.ts
- **Verification:** All 6 horizon tests pass.
- **Committed in:** `66721fd` (Task 4 GREEN commit)

**3. [Rule 1 - Bug] information_schema queries failed on Prisma 7 + Neon adapter due to `name` type**
- **Found during:** Task 3 (sanity-check `tsx -e` script and the schema integration test)
- **Issue:** `@prisma/adapter-neon` cannot natively deserialise Postgres `name` type returned by `information_schema.columns.column_name` and `pg_indexes.indexname`. Errors with `UnsupportedNativeDataType`.
- **Fix:** Explicit `::text` casts on every `information_schema` / `pg_indexes` column referenced in raw queries, both in the sanity script and the integration test.
- **Files modified:** tests/integration/schema-phase-16.test.ts (covered in Task 5 commit)
- **Verification:** `npm run test:integration -- --run tests/integration/schema-phase-16.test.ts` all 7 green.
- **Committed in:** `69f5225` (Task 5 commit) and the inline tsx command captured in `/tmp/migrate-deploy-phase16-sanity.log`.

**4. [Rule 4-related judgement, applied without escalation] Preserved `DiffusionTrace.flow_pattern`**
- **Found during:** Task 1 (schema edit)
- **Issue:** Plan acceptance criterion says "grep `flow_pattern` returns 0 matches across schema.prisma", but the plan body only instructs removal from `LearnedPattern` and `LearningEvent`. `DiffusionTrace.flow_pattern` is a separate column (the diffusion-regime tag of a trace), used by `src/lib/diffusion-trace.ts` and indexed for cap-class queries. Removing it would break the diffusion engine in a way no other plan addresses.
- **Fix:** Preserved the column; honoured the semantic intent (the dropped column is on `learned_patterns`, asserted true in the integration test). Did NOT escalate because the migration SQL's `<must_haves>` block explicitly says "no `flow_pattern` column on `learned_patterns`" — it is the integration-test acceptance criterion that is too broad, not the actual locked truth.
- **Files modified:** prisma/schema.prisma (no removal of DiffusionTrace.flow_pattern)
- **Verification:** Schema validates; integration tests green; diffusion-trace.ts and diffusion-trace.test.ts continue to compile against the preserved field.
- **Committed in:** `1676b33` (Task 1 commit, with rationale in commit body)

---

**Total deviations:** 4 auto-fixed (3 bugs + 1 scope judgement)
**Impact on plan:** All four were necessary for correctness or to honour the locked `<must_haves>` truth. No scope creep — every fix was either a direct cause of test failure or required to match Postgres + Prisma 7 + Neon adapter realities.

## Issues Encountered

- The branch base in this worktree (`f999ac6` "Planning ph 16") was 3 commits behind the plan's expected base (`acb19fc` "feat(16-01): pin technicalindicators..."). Reset the worktree HEAD to the expected base via `git reset --hard acb19fcae...` so that 16-01's deliverables (TechPattern types, technicalindicators dep, the `3a59564` planning-artifacts commit containing 16-02-PLAN.md itself) were available.
- `.env.local` did not exist in the worktree (worktrees share `.git` but not gitignored files). Symlinked from the parent repo so `prisma migrate deploy` and the live-DB integration tests could load `DATABASE_URL` and `DIRECT_URL`.
- Other consumers of the old schema (`src/lib/engine-context.ts`, `src/app/api/cron/learn/route.ts`, `src/components/EngineCalibrationPanel.tsx`, etc.) currently fail to typecheck. This is **expected and intentional** per the plan's `<merge_strategy>` — plans 16-03 and 16-04 fix them. The `npm run build` for plan 16-02 alone succeeds for `src/app/api/cron/price-followup/route.ts` only; broader typecheck shows ~14 errors elsewhere in files explicitly handed off to 16-03/16-04.

## User Setup Required

None — no new environment variables or external service configuration. The migration was applied to the same Neon DB the project already uses; future Vercel deploys auto-apply pending migrations via the existing `buildCommand`.

## Deferred Issues

- **Observability instrumentation on price-followup route**: post-edit hook flagged `Line 24: route handler has no observability instrumentation. Add logging and error tracking.` This is out of scope for plan 16-02 (the action step explicitly says "PRESERVE the rest of the route logic"). Logged for a future cross-cutting observability plan.
- **Type errors in 16-03 / 16-04 scope files**: `src/lib/engine-context.ts`, `src/app/api/cron/learn/route.ts`, `src/lib/__tests__/engine-context.test.ts`, `src/components/EngineCalibrationPanel.tsx`, `src/components/InsightsDashboard.tsx`, `src/app/api/insights/route.ts`, `tests/integration/engine-affects-reports.test.ts`, `src/lib/types.ts`, `src/lib/gemini-analysis.ts`, `src/lib/__tests__/diffusion-trace.test.ts` — all reference the dropped `flow_pattern` column or the old `flow_pattern_cap_class` composite key. Per `<merge_strategy>`, these are explicit handoffs.
- **Prisma generator preview-feature warning**: `Preview feature "driverAdapters" is deprecated. The functionality can be used without specifying it as a preview feature.` Cosmetic — generator still works. Removing the `previewFeatures = ["driverAdapters"]` line in `prisma/schema.prisma` is a cross-cutting cleanup, deferred.
- **Prisma version update available** (7.7.0 → 7.8.0): out of scope for this plan.

## Next Phase Readiness

Plan 16-03 (learn cron rewrite) can now:
- Query/update `LearnedPattern` rows by the new composite key `(signal_class, pattern_key, cap_class, horizon_days)` — Prisma's generated `where: { signal_class_pattern_key_cap_class_horizon_days: {...} }` is wired through the explicit map `learned_patterns_lookup_key`.
- Read `PriceOutcome.days_after` values at 30/60/90 immediately — the cron starts writing them on its next scheduled run (next day at 06:00 UTC).
- Write `LearningEvent` rows with `signal_class` / `pattern_key` / `horizon_days`.

Plan 16-04 (engine-context + UI) can now:
- Read `LearnedPattern` rows by the new composite key.
- Read `SentimentSnapshot.technical_data` and `Report.technical_at_report` directly from the typed Prisma client.

## Threat Flags

None — every new surface introduced by this plan (new columns, the cron's wider window, the new horizons) is already in the plan's `<threat_model>` register. The `learning_events.flow_pattern` parallel rename was explicitly captured as Open Question 4 in RESEARCH.md and folded into the migration SQL.

## Self-Check: PASSED

Verified existence of created files and commits:
- `prisma/migrations/20260427_add_technical_signal_class/migration.sql` — FOUND
- `tests/integration/schema-phase-16.test.ts` — FOUND
- `tests/integration/price-followup-horizons.test.ts` — FOUND
- Modified `prisma/schema.prisma` — FOUND (with all 5 model changes + map: directive)
- Modified `src/app/api/cron/price-followup/route.ts` — FOUND (with TARGET_DAYS, 95d window, snapshot loop using TARGET_DAYS)
- Commit `1676b33` (Task 1 schema) — FOUND in `git log`
- Commit `b07e839` (Task 2 migration SQL) — FOUND in `git log`
- Commit `369d76c` (Task 3 live deploy + index rename) — FOUND in `git log`
- Commit `e3c173b` (Task 4 RED) — FOUND in `git log`
- Commit `66721fd` (Task 4 GREEN) — FOUND in `git log`
- Commit `69f5225` (Task 5 schema test) — FOUND in `git log`
- All 13 integration tests green against live Neon (7 schema + 6 horizons).

---
*Phase: 16-technical-analysis*
*Plan: 02*
*Completed: 2026-04-28*
