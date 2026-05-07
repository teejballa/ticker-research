---
phase: 19
plan: 19-Z-02
wave: Z
type: execute
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/
  - tests/integration/shadow-comparison.live.test.ts
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "ShadowComparison table accepts inserts with old_output_json/new_output_json/latencies/costs"
    - "RollbackLog table accepts inserts with feature_flag + reason"
    - "CommunityChatter table accepts inserts with ticker/source/url/raw_text"
    - "All 9 LearnedPattern columns nullable (rolling_ic_20d, ic_decay_flag, dsr, pbo, conformal_low/high, parent_alpha, parent_beta, shrinkage_strength)"
    - "All 4 SentimentSnapshot columns nullable (community_aggregated, citations_v2, finsentllm_score, model_agreement)"
    - "Existing rows survive migration with no data loss"
    - "npx prisma migrate status shows 0 pending after migration"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "ShadowComparison + RollbackLog + CommunityChatter models + 13 additive columns"
      contains: "model ShadowComparison"
    - path: "prisma/migrations/{timestamp}_phase19_additive_columns_and_tables/migration.sql"
      provides: "single consolidated additive migration per RESEARCH §Schema Migration Ordering"
    - path: "tests/integration/shadow-comparison.live.test.ts"
      provides: "Live-DB inserts + index assertions"
  key_links:
    - from: "prisma/schema.prisma"
      to: "Neon production DB"
      via: "npx prisma migrate deploy (in CI per vercel.json buildCommand)"
      pattern: "prisma migrate deploy"
---

# Plan 19-Z-02: ShadowComparison + RollbackLog Prisma schema (consolidated migration)

<universal_preamble>

## Autonomous Execution Clause (D-04, D-05, D-06, D-07)

Same Autonomous Execution Clause as 19-Z-01 (verbatim). Land migration → run tests → commit. No shadow lifecycle for schema infra (additive only).

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. (N/A — schema infra)
2. (N/A — additive only, nothing deleted)
3. (N/A)
4. (N/A — no flag introduced)
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-migration

PLUS the Schema Push Gate below.

</universal_preamble>

<objective>
Land the consolidated Phase 19 additive schema migration per RESEARCH §"Schema Migration Ordering": ALL 9 LearnedPattern column-adds (D-46) + 4 SentimentSnapshot column-adds (D-47) + 3 new tables (D-48) bundled into a SINGLE Prisma migration. Single `prisma generate`, single client regeneration, no type drift between waves.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-design.md
@prisma/schema.prisma
@.planning/phases/18-time-decayed-bayesian-updates-ess/18-03-SUMMARY.md

<interfaces>
<!-- Existing models that get additive columns: -->
```
model LearnedPattern {
  // ... existing fields including effective_sample_size (Phase 18-03)
  // 19-Z-02 adds:
  rolling_ic_20d      Float?
  ic_decay_flag       Boolean?  @default(false)
  dsr                 Float?
  pbo                 Float?
  conformal_low       Float?
  conformal_high      Float?
  parent_alpha        Float?
  parent_beta         Float?
  shrinkage_strength  Float?
}

model SentimentSnapshot {
  // ... existing fields
  // 19-Z-02 adds:
  community_aggregated Json?
  citations_v2         Json?
  finsentllm_score     Float?
  model_agreement      Float?
}
```
</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Prisma migration → Neon production DB | DDL crosses into live database |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-Z-02-01 | Tampering / DoS | additive schema poisoning | mitigate | All ALTER TABLE ADD COLUMN statements use nullable + default, so Postgres skips full table rewrite (no exclusive lock); existing rows untouched |
| T-19-Z-02-02 | Information Disclosure | ShadowComparison.old/new_output_json | mitigate | Rows store SourcePackage/AnalysisResult — sanitize before persist (strip any URL with embedded auth/bearer); no API surface exposes these tables to end users (admin-only) |
| T-19-Z-02-03 | DoS | unbounded ShadowComparison growth | mitigate | D-15 daily GC cron deletes rows >30d; index on `(path_name, created_at DESC)` keeps queries fast |
| T-19-Z-02-04 | Privacy | CommunityChatter.raw_text | mitigate | Store source URLs but no Reddit user IDs; reputation_weight is per-call-derived not per-user-persisted (V8 ASVS) |

</threat_model>

<tasks>

<task type="auto" id="19-Z-02-01">
  <name>Task 1: Edit prisma/schema.prisma — add 3 new models + 13 nullable columns</name>
  <read_first>
    - prisma/schema.prisma (current — note existing LearnedPattern at line ~94, SentimentSnapshot at line ~42)
    - docs/plans/2026-05-07-cipher-v2-excellence-design.md (lines 250-300 — exact SQL spec)
    - .planning/phases/18-time-decayed-bayesian-updates-ess/18-03-SUMMARY.md (Phase 18-03 additive migration pattern reference)
  </read_first>
  <action>
    Edit `prisma/schema.prisma`:

    1. In `model LearnedPattern { ... }` add (just before closing brace):
       ```prisma
       rolling_ic_20d      Float?
       ic_decay_flag       Boolean? @default(false)
       dsr                 Float?
       pbo                 Float?
       conformal_low       Float?
       conformal_high      Float?
       parent_alpha        Float?
       parent_beta         Float?
       shrinkage_strength  Float?
       ```

    2. In `model SentimentSnapshot { ... }` add (just before closing brace):
       ```prisma
       community_aggregated Json?
       citations_v2         Json?
       finsentllm_score     Float?
       model_agreement      Float?
       ```

    3. Append three new models at end of file:
       ```prisma
       model CommunityChatter {
         id                String   @id @default(cuid())
         ticker            String
         source            String
         url               String?
         raw_text          String?
         finsentllm_score  Float?
         reputation_weight Float?   @default(1.0)
         scraped_at        DateTime @default(now())

         @@unique([ticker, source, url, scraped_at], name: "chatter_ticker_idx")
         @@index([ticker, scraped_at(sort: Desc)])
       }

       model ShadowComparison {
         id              String   @id @default(cuid())
         path_name       String
         ticker          String?
         old_output_json Json?
         new_output_json Json?
         old_latency_ms  Int?
         new_latency_ms  Int?
         old_cost_usd    Float?
         new_cost_usd    Float?
         created_at      DateTime @default(now())

         @@index([path_name, created_at(sort: Desc)])
       }

       model RollbackLog {
         id            String   @id @default(cuid())
         feature_flag  String
         reason        String?
         created_at    DateTime @default(now())

         @@index([feature_flag, created_at(sort: Desc)])
       }
       ```

    DO NOT modify any existing column or remove any field. ALL ADDs must be nullable.
  </action>
  <acceptance_criteria>
    - `grep -c "model ShadowComparison" prisma/schema.prisma` returns 1
    - `grep -c "model RollbackLog" prisma/schema.prisma` returns 1
    - `grep -c "model CommunityChatter" prisma/schema.prisma` returns 1
    - `grep -c "rolling_ic_20d\|ic_decay_flag\|dsr\|pbo\|conformal_low\|conformal_high\|parent_alpha\|parent_beta\|shrinkage_strength" prisma/schema.prisma` returns ≥9
    - `grep -c "community_aggregated\|citations_v2\|finsentllm_score\|model_agreement" prisma/schema.prisma` returns ≥4
    - All 13 added columns end with `?` (nullable) or `?  @default(...)`
    - `npx prisma format` succeeds (file is valid Prisma)
  </acceptance_criteria>
  <automated>npx prisma format && grep -q "model ShadowComparison" prisma/schema.prisma && grep -q "model RollbackLog" prisma/schema.prisma && grep -q "model CommunityChatter" prisma/schema.prisma</automated>
  <done>schema.prisma valid; 3 new models + 13 columns added; nothing removed</done>
</task>

<task type="auto" id="19-Z-02-02">
  <name>Task 2: Generate consolidated migration via prisma migrate dev --create-only</name>
  <read_first>
    - vercel.json (verify "buildCommand": "prisma migrate deploy && next build")
    - prisma/migrations/ (existing migration directory pattern)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (lines 436-444 — Pitfall 6: prisma db push vs migrate deploy)
  </read_first>
  <action>
    Run: `npx prisma migrate dev --name phase19_additive_columns_and_tables --create-only`

    This creates `prisma/migrations/{timestamp}_phase19_additive_columns_and_tables/migration.sql` containing the consolidated DDL. Do NOT use `prisma db push` — that skips migration history and breaks production deploy (per RESEARCH Pitfall 6).

    The generated migration.sql must contain:
    - 9 `ALTER TABLE "LearnedPattern" ADD COLUMN ...` statements (all NULL or nullable + default)
    - 4 `ALTER TABLE "SentimentSnapshot" ADD COLUMN ...` statements
    - 3 `CREATE TABLE` statements for ShadowComparison, RollbackLog, CommunityChatter
    - Index creation statements

    If `prisma migrate dev` errors due to drift, run `npx prisma migrate resolve --applied <pending-migration>` first OR use `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-empty --script > /tmp/diff.sql` and assemble migration manually.
  </action>
  <acceptance_criteria>
    - Directory `prisma/migrations/*phase19_additive_columns_and_tables/` exists
    - File `prisma/migrations/*phase19_additive_columns_and_tables/migration.sql` exists
    - migration.sql contains: `ALTER TABLE "LearnedPattern" ADD COLUMN "rolling_ic_20d"` AND `CREATE TABLE "ShadowComparison"` AND `CREATE TABLE "RollbackLog"` AND `CREATE TABLE "CommunityChatter"`
    - migration.sql does NOT contain `DROP COLUMN` or `ALTER COLUMN ... DROP NOT NULL` (purely additive)
  </acceptance_criteria>
  <automated>ls prisma/migrations/*phase19_additive*/migration.sql && grep -q 'CREATE TABLE "ShadowComparison"' prisma/migrations/*phase19_additive*/migration.sql && grep -q 'CREATE TABLE "RollbackLog"' prisma/migrations/*phase19_additive*/migration.sql && grep -q 'CREATE TABLE "CommunityChatter"' prisma/migrations/*phase19_additive*/migration.sql && grep -q 'ADD COLUMN "rolling_ic_20d"' prisma/migrations/*phase19_additive*/migration.sql && ! grep -q 'DROP COLUMN' prisma/migrations/*phase19_additive*/migration.sql</automated>
  <done>Migration SQL file produced; purely additive DDL; ready for prisma migrate deploy in CI</done>
</task>

<task type="auto" id="19-Z-02-03" blocking="true">
  <name>Task 3: [BLOCKING] schema push — apply migration to Neon</name>
  <read_first>
    - .env.local (verify DATABASE_URL points to Neon)
    - prisma/migrations/*phase19_additive*/migration.sql (just generated)
  </read_first>
  <action>
    Apply the migration to the live Neon database:

    ```bash
    npx prisma generate && npx prisma migrate deploy
    ```

    `prisma migrate deploy` is the production-safe path that respects migration history (per RESEARCH Pitfall 6). After successful run:
    - Prisma Client regenerates with new types (parent_alpha, ShadowComparison, RollbackLog, CommunityChatter accessible)
    - Neon DB has the new columns/tables
    - Existing rows preserved (NULL for new columns)

    If `migrate deploy` shows pending migrations from prior phases, that's normal — let it apply them sequentially. Verify final state with `npx prisma migrate status`.

    Create the verification helper script if it doesn't exist:
    ```bash
    cat > scripts/verify-schema-pushed.sh <<'EOF'
    #!/usr/bin/env bash
    set -euo pipefail
    npx prisma migrate status 2>&1 | grep -q "Database schema is up to date" || exit 1
    echo "Schema in sync with migration history"
    EOF
    chmod +x scripts/verify-schema-pushed.sh
    ```
  </action>
  <acceptance_criteria>
    - `npx prisma migrate deploy` exits 0
    - `npx prisma migrate status` shows "Database schema is up to date" (0 pending)
    - `npx prisma generate` exits 0; node_modules/.prisma/client regenerates
    - Live DB query succeeds: `npx tsx -e "import { PrismaClient } from '@prisma/client'; const p = new PrismaClient(); p.shadowComparison.count().then(n => { console.log(n); process.exit(0); })"` outputs a number
    - Existing LearnedPattern row count unchanged from pre-migration snapshot
  </acceptance_criteria>
  <automated>bash scripts/verify-schema-pushed.sh</automated>
  <done>Migration applied to Neon; client regenerated; ShadowComparison/RollbackLog/CommunityChatter accessible via prisma client</done>
</task>

<task type="auto" tdd="true" id="19-Z-02-04">
  <name>Task 4: Write live-DB integration test for new tables + indexes</name>
  <read_first>
    - tests/integration/ (existing live-DB test pattern reference)
    - vitest.integration.config.ts
    - prisma/schema.prisma (verify model names + index names)
  </read_first>
  <behavior>
    - Test 1: `inserts ShadowComparison row and reads it back` — create with path_name='test-19-z-02', new_output_json={a:1}, latencies; assert returned row matches
    - Test 2: `inserts RollbackLog row and reads it back` — create with feature_flag='test-flag', reason='unit-test'; assert returned row matches
    - Test 3: `inserts CommunityChatter row and unique constraint enforces (ticker,source,url,scraped_at)` — first insert succeeds; duplicate throws Prisma unique constraint error
    - Test 4: `LearnedPattern accepts null for new Phase 19 columns` — find an existing row, assert parent_alpha === null AND rolling_ic_20d === null AND dsr === null
    - Test 5: `LearnedPattern accepts non-null writes to new columns` — update one row's parent_alpha=2.5, parent_beta=3.5; read back; cleanup with set null
    - Test 6: `ShadowComparison index on (path_name, created_at DESC) used in expected query plan` — run `EXPLAIN SELECT * FROM "ShadowComparison" WHERE path_name = 'x' ORDER BY created_at DESC LIMIT 10` via $queryRaw; assert index scan present
  </behavior>
  <action>
    Create `tests/integration/shadow-comparison.live.test.ts` matching existing live-DB test pattern (look at `tests/integration/learn.ess.live.test.ts` from Phase 18-04 for the import shape and beforeAll/afterAll hygiene). Use `prismaTest` helper or instantiate `PrismaClient`. Cleanup test rows in afterAll. Skip if `process.env.DATABASE_URL` is a sqlite/file URL (live-DB only).
  </action>
  <acceptance_criteria>
    - File `tests/integration/shadow-comparison.live.test.ts` exists
    - `grep -c "it(" tests/integration/shadow-comparison.live.test.ts` returns ≥6
    - `grep -q "shadowComparison\|rollbackLog\|communityChatter" tests/integration/shadow-comparison.live.test.ts`
    - Test runs against live Neon: `npx vitest run --config vitest.integration.config.ts tests/integration/shadow-comparison.live.test.ts` exits 0 (assuming DATABASE_URL set)
  </acceptance_criteria>
  <automated>npx vitest run --config vitest.integration.config.ts tests/integration/shadow-comparison.live.test.ts</automated>
  <done>6 integration tests pass against live Neon; new tables + indexes verified working</done>
</task>

<task type="auto" id="19-Z-02-05">
  <name>Task 5: Run full unit suite — confirm no regression</name>
  <read_first>
    - tests/learning.hyperparameters.test.ts (D-54 sanity test)
  </read_first>
  <action>Run `npx vitest run` and confirm zero failing tests; the new Prisma client types compile cleanly (no Phase 18 callsite breaks).</action>
  <acceptance_criteria>
    - `npx vitest run` exits 0
    - `npx tsc --noEmit` exits 0 (no type errors from regenerated client)
  </acceptance_criteria>
  <automated>npx vitest run && npx tsc --noEmit</automated>
  <done>Unit suite green; TS compile clean</done>
</task>

<task type="auto" id="19-Z-02-06">
  <name>Task 6: Commit schema migration + integration test + verify script</name>
  <read_first>
    - git status (verify staged files)
  </read_first>
  <action>
    Stage `prisma/schema.prisma`, `prisma/migrations/{timestamp}_phase19_additive_columns_and_tables/`, `tests/integration/shadow-comparison.live.test.ts`, `scripts/verify-schema-pushed.sh`. Commit with:
    ```
    feat(19-z-02): consolidated Phase 19 additive schema migration

    Bundles all 13 LearnedPattern + 4 SentimentSnapshot column-adds with the
    3 new tables (ShadowComparison, RollbackLog, CommunityChatter) into a
    single Prisma migration per RESEARCH §"Schema Migration Ordering" — one
    prisma generate, no type drift between Wave A/B/C plans (D-46/47/48).

    All ADDs nullable; existing rows untouched. Integration test verifies
    insert + index path against live Neon.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` returns "feat(19-z-02): consolidated Phase 19 additive schema migration"
    - `git show HEAD --stat | grep -c "schema.prisma\|migration.sql\|shadow-comparison.live.test.ts"` returns ≥3
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-z-02"</automated>
  <done>Commit landed with all Phase 19 schema changes consolidated</done>
</task>

</tasks>

<verification>
- [ ] `npx prisma migrate status` shows zero pending migrations
- [ ] `npx prisma generate` regenerates client without error
- [ ] `bash scripts/verify-schema-pushed.sh` exits 0
- [ ] Integration test passes against live Neon (6 test cases)
- [ ] `npx vitest run` (full unit suite) green; Plan 18-10 sanity test still green
- [ ] No DROP COLUMN, no NOT NULL added to existing columns (purely additive per D-46/47/48)
- [ ] All 9 LearnedPattern Phase 19 columns nullable; all 4 SentimentSnapshot columns nullable
</verification>

<success_criteria>
Plan 19-Z-02 is complete when:
1. Single Prisma migration `phase19_additive_columns_and_tables` applied to Neon
2. New Prisma Client types (`prisma.shadowComparison`, `prisma.rollbackLog`, `prisma.communityChatter`, `LearnedPattern.parent_alpha` etc.) accessible from any caller
3. 6 integration tests pass against live DB
4. Schema push gate verified via `scripts/verify-schema-pushed.sh`
5. No regression in Phase 18 functionality
</success_criteria>

<output>
After completion, create `.planning/phases/19-cipher-v2-0-excellence/19-Z-02-SUMMARY.md` documenting:
- Migration file path
- 13 columns + 3 tables added
- Pre/post row counts (existing rows preserved)
- Schema push gate verified — Wave A/B/C plans may now read/write parent_alpha, ShadowComparison, RollbackLog, CommunityChatter
</output>
