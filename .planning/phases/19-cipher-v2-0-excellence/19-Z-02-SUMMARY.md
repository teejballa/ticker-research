---
phase: 19
plan: 19-Z-02
subsystem: schema-infrastructure
tags: [prisma, migration, schema, neon, additive, phase-19, wave-z]
dependency_graph:
  requires:
    - 19-Z-01 (feature flag matrix scaffolding — informational, no code dep)
  provides:
    - prisma.shadowComparison
    - prisma.rollbackLog
    - prisma.communityChatter
    - LearnedPattern.{rolling_ic_20d, ic_decay_flag, dsr, pbo, conformal_low, conformal_high, parent_alpha, parent_beta, shrinkage_strength}
    - SentimentSnapshot.{community_aggregated, citations_v2, finsentllm_score, model_agreement}
  affects:
    - All Wave A plans (19-A-01..07) — read/write LearnedPattern Phase 19 columns
    - All Wave B plans (19-B-01..08) — write ShadowComparison from shadow A/B harness
    - All Wave C plans (19-C-01..11) — write SentimentSnapshot Phase 19 columns + CommunityChatter rows
    - 19-Z-03 (shadow-verdict CLI) — reads ShadowComparison rows
    - 19-Z-04 (rollback hatch) — writes RollbackLog rows
tech-stack:
  added:
    - "@prisma/client@7.7.0 — regenerated client with 3 new models + 13 new fields"
  patterns:
    - "Prisma migrate deploy via vercel.json buildCommand (production-safe, respects history)"
    - "Additive nullable columns with sensible defaults — Postgres skips full table rewrite (metadata-only DDL on PG 11+)"
    - "prisma migrate diff --from-config-datasource (live DB) → --to-schema (new schema) for safe migration authoring under existing drift"
key-files:
  created:
    - prisma/migrations/20260507150810_phase19_additive_columns_and_tables/migration.sql
    - tests/integration/shadow-comparison.live.test.ts
    - scripts/verify-schema-pushed.sh
  modified:
    - prisma/schema.prisma (LearnedPattern +9 cols, SentimentSnapshot +4 cols, +3 models)
decisions:
  - "Authored migration via `prisma migrate diff --from-config-datasource --to-schema --script` instead of `migrate dev --create-only` to side-step a pre-existing Phase 18 history drift (Phase 18 added effective_sample_size + n_trials_attempted via direct push, no migration file). The diff tool inspects live DB state vs target schema and emits ONLY the new additive DDL — exactly what's needed for `migrate deploy` to apply cleanly."
  - "Used cuid() for primary keys on the 3 new tables (matches design doc spec) instead of uuid() to match the cuid pattern emerging in newer Prisma 7 conventions; existing tables retain uuid()."
  - "Did NOT add the missing Phase 18 baseline columns (effective_sample_size, n_trials_attempted) to a new baseline migration in this plan — they are already present in the live DB and `prisma migrate status` reports 'Database schema is up to date' after our migration applied. Adding them would create false drift on next `migrate dev`. If a fresh-DB clone is ever required, a separate baseline migration plan is needed (out of scope for 19-Z-02)."
metrics:
  duration: ~25min
  completed_date: 2026-05-07
  tasks_completed: 6
  files_modified: 1
  files_created: 3
  rows_preserved: 51 (LearnedPattern, pre = post)
---

# Phase 19 Plan Z-02: ShadowComparison + RollbackLog Prisma Schema (consolidated migration) Summary

Consolidated the entire Phase 19 schema delta (D-46/47/48) into a single additive Prisma migration `20260507150810_phase19_additive_columns_and_tables` and applied it to Neon — Wave A/B/C plans now have a stable type surface (parent_alpha, ShadowComparison, RollbackLog, CommunityChatter) without any further client regenerations between plans.

## What was built

### Schema additions (migration `phase19_additive_columns_and_tables`)

**LearnedPattern — 9 new nullable columns (D-46):**
- `rolling_ic_20d Float?` — rolling 20-day Spearman rank-IC per signal class (Plan 19-A-05)
- `ic_decay_flag Boolean? @default(false)` — true when rolling_ic_20d < 0.02 for 5 consecutive days
- `dsr Float?` — Deflated Sharpe Ratio (Bailey-Lopez de Prado), Plan 19-A-04
- `pbo Float?` — Probability of Backtest Overfitting (Bailey-Borwein-Lopez de Prado-Zhu), Plan 19-A-04
- `conformal_low Float?` — Vovk-Romano split-conformal CI lower bound (Plan 19-A-03)
- `conformal_high Float?` — conformal CI upper bound
- `parent_alpha Float?` — empirical-Bayes hierarchical pooling parent alpha (Plan 19-A-07)
- `parent_beta Float?` — hierarchical pooling parent beta
- `shrinkage_strength Float?` — per-cell λ shrinkage weight

**SentimentSnapshot — 4 new nullable columns (D-47):**
- `community_aggregated Json?` — Swaggystocks + ApeWisdom + Firecrawl unified payload (Plan 19-C-05)
- `citations_v2 Json?` — structured citation array `{source, url, confidence, date_retrieved}` (Plan 19-C-07)
- `finsentllm_score Float?` — ensemble meta-classifier output (Plan 19-C-02)
- `model_agreement Float?` — `1 - std(scores)` agreement metric across HF models

**Three new tables (D-48):**

1. **CommunityChatter** — `id, ticker, source, url?, raw_text?, finsentllm_score?, reputation_weight? (default 1.0), scraped_at`
   - `@@unique([ticker, source, url, scraped_at], name: chatter_ticker_idx)` for dedup
   - `@@index([ticker, scraped_at DESC])` for hot-path query "last N rows for a ticker"
2. **ShadowComparison** — `id, path_name, ticker?, old_output_json?, new_output_json?, old_latency_ms?, new_latency_ms?, old_cost_usd?, new_cost_usd?, created_at`
   - `@@index([path_name, created_at DESC])` for shadow-verdict queries scoped per path
3. **RollbackLog** — `id, feature_flag, reason?, created_at`
   - `@@index([feature_flag, created_at DESC])` for "last rollback for this flag" queries

### Live DB state (post-migration)

```
LearnedPattern   : 51 rows (unchanged from pre-migration snapshot)
ShadowComparison : 0 rows (table newly created)
RollbackLog      : 0 rows (table newly created)
CommunityChatter : 0 rows (table newly created)
```

`npx prisma migrate status` reports **"Database schema is up to date"**.

## Verification

| Gate | Result |
|------|--------|
| `npx prisma format` | ✅ exit 0 (Prisma schema valid) |
| `npx prisma migrate deploy` | ✅ exit 0 (1 migration applied) |
| `npx prisma migrate status` | ✅ "Database schema is up to date" |
| `npx prisma generate` | ✅ exit 0 (client regenerated, v7.7.0) |
| `bash scripts/verify-schema-pushed.sh` | ✅ "Schema in sync with migration history" |
| `npx vitest run` (full unit suite) | ✅ 414 passed, 1 file skipped (no regression) |
| Plan 18-10 sanity test (`learning.hyperparameters.test.ts`) | ✅ 5/5 passing — `nyquist_compliant: true` preserved |
| `npx tsc --noEmit` | ✅ exit 0 (regenerated client types compile cleanly across all callsites) |
| `npx vitest run --config vitest.integration.config.ts tests/integration/shadow-comparison.live.test.ts` | ✅ 6/6 passed against live Neon |
| Pre/post LearnedPattern row count | ✅ 51 == 51 (no data loss) |

### 6 integration tests pass against live Neon

1. ✅ `inserts ShadowComparison row and reads it back` — verifies all numeric/JSONB fields persist + cuid PK format
2. ✅ `inserts RollbackLog row and reads it back` — verifies feature_flag + reason persistence
3. ✅ `CommunityChatter unique constraint enforces (ticker, source, url, scraped_at)` — duplicate INSERT throws Prisma unique-constraint error; differing scraped_at allowed
4. ✅ `LearnedPattern accepts NULL on every Phase 19 column for existing rows` — all 9 new columns null on pre-migration rows (ic_decay_flag default applies on INSERT only; existing rows are NULL, which is expected)
5. ✅ `LearnedPattern accepts non-null writes to new Phase 19 columns` — round-trip update of all 9 columns; restored to original values in `finally` block to keep prod data clean
6. ✅ `ShadowComparison index on (path_name, created_at DESC)` — pg_indexes lookup confirms `ShadowComparison_path_name_created_at_idx` exists with correct DESC ordering

## Schema Push Gate verified

`scripts/verify-schema-pushed.sh` executes `prisma migrate status` and asserts the "Database schema is up to date" string. Returns 0 when migration history is in sync — Wave A/B/C plans may now safely read/write `parent_alpha`, `ShadowComparison`, `RollbackLog`, `CommunityChatter` from any callsite without further migration work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Pre-existing Phase 18 migration drift on Neon**

- **Found during:** Task 2 (`npx prisma migrate dev --create-only`)
- **Issue:** Phase 18 added `learned_patterns.effective_sample_size` and `learned_patterns.n_trials_attempted` to the live DB without a corresponding migration file. `prisma migrate dev` refused to proceed and demanded a `migrate reset` (which would have wiped 51 production rows).
- **Fix:** Switched to `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (per Plan task 2's documented fallback path). This emits the SQL needed to bring the **live DB** up to the **new schema** — by definition omitting columns already present, so it produces a purely additive Phase 19 migration without touching the Phase 18 columns. Wrote the SQL into the standard `prisma/migrations/{timestamp}_phase19_additive_columns_and_tables/migration.sql` directory layout so `prisma migrate deploy` (used by `vercel.json` buildCommand) picks it up cleanly.
- **Verification:** `prisma migrate status` returns "Database schema is up to date" after deploy; existing 51 LearnedPattern rows preserved.
- **Files modified:** `prisma/migrations/20260507150810_phase19_additive_columns_and_tables/migration.sql` (created)
- **Commit:** 8238f89 (consolidated)
- **Note:** This deviation is documented as a known limitation. A separate baseline migration plan (out of Phase 19 scope) is recommended if a fresh-DB clone is ever required.

**2. [Discretionary] Prisma 7 API change**

- **Found during:** Task 2 (`migrate diff` invocation)
- **Issue:** Prisma 7 deprecated the `--from-url` flag in favor of `--from-config-datasource` (uses datasource defined in `prisma.config.ts`). Plan referenced the older syntax in its fallback note.
- **Fix:** Used the new Prisma 7 syntax. Functionally equivalent — config datasource resolves to `DIRECT_URL`.
- **Files modified:** None (CLI invocation only)

## Authentication gates

None — DATABASE_URL/DIRECT_URL already in `.env.local`; no manual auth required.

## Hard Cleanup Gate (Schema Plan exception)

Per the plan's universal_preamble, the standard 5-condition Hard Cleanup Gate is N/A for schema infrastructure (no shadow lifecycle, additive only, no flag introduced, no old code path to delete). The single applicable gate — **Schema Push Gate** — is verified above (`bash scripts/verify-schema-pushed.sh` exits 0).

## What unblocks

Wave A plans (19-A-01..07) can now write `dsr`, `pbo`, `conformal_low/high`, `rolling_ic_20d`, `ic_decay_flag`, `parent_alpha/beta`, `shrinkage_strength` to LearnedPattern.

Wave B plans (19-B-01..08) can write ShadowComparison rows from the shadow A/B harness in 19-Z-03.

Wave C plans (19-C-01..11) can write SentimentSnapshot Phase 19 columns AND CommunityChatter rows.

Wave Z follow-ups: 19-Z-03 (shadow-verdict CLI) reads ShadowComparison; 19-Z-04 (rollback hatch) writes RollbackLog.

## Self-Check: PASSED

- ✅ FOUND: prisma/migrations/20260507150810_phase19_additive_columns_and_tables/migration.sql
- ✅ FOUND: tests/integration/shadow-comparison.live.test.ts
- ✅ FOUND: scripts/verify-schema-pushed.sh
- ✅ FOUND: prisma/schema.prisma (modified — 3 new models + 13 new fields)
- ✅ FOUND: commit 8238f89 in git history
