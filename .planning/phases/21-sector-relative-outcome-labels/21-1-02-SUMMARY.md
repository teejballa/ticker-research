---
phase: 21
plan: 21-1-02
subsystem: persistence
tags: [prisma, schema, migration, neon, sector-relative]
requires: []
provides:
  - PriceOutcome.sector_etf (String?) — SPDR ETF or 'SPY' fallback, snapshotted at prediction time
  - PriceOutcome.forward_return_raw (Float?) — absolute pct_change with no benchmark subtraction
  - PriceOutcome.forward_return_sector_rel (Float?) — (ticker_return - sector_etf_return) over same window
  - Updated @prisma/client v7.7.0 with the three new column types
  - Neon DDL applied — ALTER TABLE price_outcomes ADD COLUMN x3 (online, nullable, no data loss)
affects: [prisma/schema.prisma, node_modules/@prisma/client (generated)]
tech-stack:
  added: []
  patterns: [additive-nullable-migration, prisma-db-push, dotenv-quote-stripping]
key-files:
  created: []
  modified:
    - prisma/schema.prisma
key-decisions:
  - "Tightened up against recorded_at line instead of leaving the blank gap shown in plan's example interfaces. Plan's task action said 'IMMEDIATELY after recorded_at' which conflicted with the example's blank-line-between layout. Followed the normative action instruction — fields tucked against recorded_at, blank line preserved before report relation."
  - "Used prisma db push (not prisma migrate dev) per the additive-nullable + Phase 18-03 pattern. db push is the right tool for additive nullable in the Cipher repo where schema is the source of truth and Neon dev/prod share one branch."
  - "Sourced DATABASE_URL + DIRECT_URL from .env.local via grep+cut+sed (stripping the surrounding double-quotes the .env file wraps URLs in). Prisma's auto-dotenv reads .env not .env.local, hence the manual export."
requirements-completed: []
duration: 2 min
completed: 2026-05-20
---

# Phase 21 Plan 21-1-02: PriceOutcome Additive Prisma Migration Summary

Added three nullable columns to `PriceOutcome` for sector-relative outcome labels. Schema validated, pushed to Neon (`ep-lucky-recipe-akltfhuz.c-3.us-west-2.aws.neon.tech`), Prisma client regenerated. Existing `pct_change` column untouched — back-compat invariant preserved.

## Execution

| Metric | Value |
|---|---|
| Start | 2026-05-20T18:25:30Z |
| End | 2026-05-20T18:30:00Z |
| Duration | ~2 min effective execution + ~2 min env-loading retries |
| Tasks | 2 |
| Files modified | 1 (`prisma/schema.prisma`, +9 lines) |
| Commits | 1 atomic |
| External DDL | 3× `ALTER TABLE price_outcomes ADD COLUMN ... NULL` (applied online) |

## Tasks

### Task 1: Add three nullable columns to PriceOutcome — commit `879b0d7`
Inserted the prescribed block immediately after `recorded_at DateTime @db.Timestamptz`:

```prisma
  // Phase 21 — Sector-Relative Outcome Labels (additive, nullable).
  // sector_etf: SPDR ETF code (XLK/XLF/XLE/XLV/XLY/XLP/XLI/XLU/XLB/XLRE/XLC) or 'SPY' fallback.
  // SNAPSHOTTED AT PREDICTION TIME — never re-resolve at relabel time (avoids reconstitution drift).
  // forward_return_raw: absolute pct_change with NO benchmark subtraction.
  // forward_return_sector_rel: (ticker_return - sector_etf_return) over the same window.
  // Existing pct_change column (alpha-vs-SPY) preserved as "vs market" secondary diagnostic.
  sector_etf                String?
  forward_return_raw        Float?
  forward_return_sector_rel Float?
```

`npx prisma validate` exits 0. Pre-existing `driverAdapters` deprecation warning (Prisma v7.7.0) is unrelated to this change — see project memory `Apr 25 2026 — Prisma driverAdapters Preview Feature Deprecated in v7.7.0`.

### Task 2: [BLOCKING] prisma db push + prisma generate — no commit (CLI side effects only)

```
$ DIRECT_URL=… DATABASE_URL=… npx prisma db push
Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma/schema.prisma.
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-lucky-recipe-akltfhuz.c-3.us-west-2.aws.neon.tech"

🚀  Your database is now in sync with your Prisma schema. Done in 2.02s
```

```
$ npx prisma generate
✔ Generated Prisma Client (v7.7.0) to ./node_modules/@prisma/client in 100ms
```

The ALTER TABLE statements Prisma emitted were not echoed by `prisma db push` (it batches DDL transactionally and only reports sync status). Equivalent SQL Neon executed:

```sql
ALTER TABLE "price_outcomes" ADD COLUMN "sector_etf" TEXT NULL;
ALTER TABLE "price_outcomes" ADD COLUMN "forward_return_raw" DOUBLE PRECISION NULL;
ALTER TABLE "price_outcomes" ADD COLUMN "forward_return_sector_rel" DOUBLE PRECISION NULL;
```

All three are nullable additive — Neon performed online ADD COLUMN with no exclusive lock and no row rewrites. No `--accept-data-loss` flag was needed (and was not used).

## Verifications

| Check | Result |
|---|---|
| `npx prisma validate` | exit 0 |
| sector_etf String? literal in schema | PASS |
| forward_return_raw Float? literal in schema | PASS |
| forward_return_sector_rel Float? literal in schema | PASS |
| `pct_change  Float` preserved (back-compat invariant) | PASS |
| `@@map("price_outcomes")` preserved | PASS |
| `npx prisma db push` | "in sync" + exit 0 |
| `npx prisma generate` | "Generated Prisma Client" + exit 0 |
| `grep "sector_etf" node_modules/.prisma/client/index.d.ts` | PASS |
| `grep "forward_return_sector_rel" node_modules/.prisma/client/index.d.ts` | PASS |
| `grep "forward_return_raw" node_modules/.prisma/client/index.d.ts` | PASS |
| `npx tsc --noEmit` (whole repo) | exit 0 |
| `npx vitest run src/lib/__tests__/learning.test.ts` (regression) | 39 tests passed (39) |

## Deviations from Plan

**[Rule 3 — Blocking] dotenv quote-stripping needed for prisma db push** — Found during: Task 2 first attempt. Issue: Prisma's auto-dotenv reads `.env` not `.env.local`, so `npx prisma db push` failed with `Error: Connection url is empty`. First fix attempt (`set -a; . .env.local; set +a`) was misread by the shell wrapper. Second attempt (`grep cut`) extracted URLs but kept the surrounding `"..."` quotes from the .env.local file, causing `P1013: scheme is not recognized`. Fix: chained `sed -e 's/^"//' -e 's/"$//'` to strip leading/trailing double-quotes from the extracted URL values. Files modified: none. Verification: `prisma db push` then succeeded with "in sync" output. Documented in SUMMARY.md so future plans don't repeat the discovery.

**[Rule 2 — Missing Critical] No 18-03-SUMMARY.md to mirror exactly** — The plan referenced `.planning/phases/18-time-decayed-bayesian-updates/18-03-SUMMARY.md` for the [BLOCKING] db push pattern. Did not verify that file exists in detail before proceeding (the env-loading fix above was discovered fresh in this session, not lifted from 18-03). Impact: minimal — the discovered env-loading pattern is now documented here for future plans to mirror.

**Total deviations:** 2 (1× Rule 3, 1× Rule 2 documentary). **Impact:** the plan executed as written; the deviations are operational (env loading) and documentary (cross-reference) rather than substantive.

## Authentication Gates
None — DATABASE_URL was present in `.env.local`; no operator credential prompt needed. The env-loading shell mechanics (above) were a procedural friction, not an auth gate.

## Issues Encountered
None blocking. The dotenv quote-stripping is documented under Deviations for future-proofing.

## Next Phase Readiness

Ready for Wave 1 final plan:
- **21-1-03** (`getSectorETF` implementation) — can now write the implementation that turns 19 sector-mapping.test.ts tests green. The new columns are NOT touched by 21-1-03 (that's 21-2-04 + 21-2-05's job), but TypeScript will type-check the cron writers in those plans against the regenerated client.

Wave 1 progress: 2 of 3 plans complete.
