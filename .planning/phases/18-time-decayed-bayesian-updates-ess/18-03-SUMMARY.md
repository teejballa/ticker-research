---
phase: 18-time-decayed-bayesian-updates-ess
plan: 03
subsystem: database

tags: [prisma, postgres, neon, schema-migration, learned-pattern, ess]

# Dependency graph
requires:
  - phase: 18-00
    provides: Phase 18 keystone — research/context committed; Plan 03 is the schema-side migration this plan operationalizes against live Neon
provides:
  - "LearnedPattern.effective_sample_size Float NOT NULL DEFAULT 0 — ESS column for time-decayed Bayesian posteriors (D-15)"
  - "LearnedPattern.n_trials_attempted Int NOT NULL DEFAULT 0 — FDR denominator reserved for Phase 21, populated from P18 forward (D-15)"
  - "Live Neon dev branch DDL synced with the new columns (npx prisma db push completed)"
  - "All 47 existing LearnedPattern rows on the dev branch take DEFAULT 0 (D-19 additive-soak verified)"
affects: [18-04 (cron rewire — reads/writes ESS), 18-05+ (drift gating, lift gating), 21 (FDR denominator), 22 (composite signal weighting by ESS)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive-only Prisma migrations (D-19): no drops, no type changes; new non-null columns get a DEFAULT to soak existing rows"
    - "Live db push for additive migrations against Neon dev branch via npx prisma db push (idempotent — produces 'in sync' on no-op re-runs)"
    - "Worktree env bootstrap: cp ../../.env.local . then `set -a && source .env.local && set +a` — Prisma 7 doesn't auto-load .env.local"

key-files:
  created:
    - ".planning/phases/18-time-decayed-bayesian-updates-ess/18-03-SUMMARY.md"
  modified:
    - "prisma/schema.prisma — +2 columns inside model LearnedPattern (lines 103-104), then prisma format reflowed column-width alignment"

key-decisions:
  - "Status enum widening for EXPLORATORY-WATCH (T-18-04) is NOT a schema change — `status` is already a free-form `String @default(\"EXPLORATORY\")`, so the mitigation lives in Plan 01's `STATUS_VALUES` const, not here. Confirmed against the schema."
  - "Used `set -a && source .env.local && set +a` to load env vars — Prisma 7 reads from process.env via prisma.config.ts and does not auto-load .env.local. Did NOT add dotenv-cli (extra dependency for a one-time push)."
  - "Did NOT run `prisma migrate dev` — repo is on `prisma db push` for dev-branch evolution (no migrations/ directory exists). Production migration is a separate Vercel buildCommand step at release time."
  - "Did NOT regenerate the Prisma client manually after the column add — `prisma db push` regenerates the client as a side effect, and `prisma generate` was already run in Task 2."

patterns-established:
  - "D-19 verification: db push that completes WITHOUT a 'data loss' prompt is the runtime proof that the migration is additive only — Prisma asks before any destructive change"
  - "Smoke-after-push: every Phase 18+ schema migration pairs `db push` with a `findFirst()` smoke that asserts the new column reads at its DEFAULT value across at least one real row"

requirements-completed: [CORE-ML-01]

# Metrics
duration: 2min
completed: 2026-05-06
---

# Phase 18 Plan 03: Live Schema Migration — ESS + n_trials_attempted columns Summary

**Additive Prisma migration adding `effective_sample_size Float DEFAULT 0` and `n_trials_attempted Int DEFAULT 0` to LearnedPattern, pushed live to Neon dev branch — D-19 invariant verified via no-data-loss prompt and DEFAULT 0 soak across all 47 existing rows.**

## Performance

- **Duration:** ~2 min (146s)
- **Started:** 2026-05-06T04:29:55Z
- **Completed:** 2026-05-06T04:32:21Z
- **Tasks:** 3 (1 schema edit, 1 format/generate, 1 [BLOCKING] live push + smoke)
- **Files modified:** 1 (`prisma/schema.prisma`)

## Accomplishments

- Two additive columns added inside `model LearnedPattern` (between `sample_size` and `hits`):
  - `effective_sample_size Float    @default(0)` — D-15
  - `n_trials_attempted    Int      @default(0)` — D-15 (reserved for P21 FDR denominator)
- `npx prisma format` succeeded; reformatted column-width alignment in the model (cosmetic-only — no semantic change to any other line).
- `npx prisma generate` succeeded — generated client at `node_modules/@prisma/client` (v7.7.0) now exposes `effective_sample_size: number` + `n_trials_attempted: number` on the LearnedPattern model.
- `npx tsc --noEmit` exits 0 — no broken consumers (none read the new columns yet; Plan 18-04 will).
- **`npx prisma db push` succeeded against live Neon dev branch** (`ep-lucky-recipe-akltfhuz.c-3.us-west-2.aws.neon.tech / neondb`):
  - stdout: `🚀 Your database is now in sync with your Prisma schema. Done in 1.68s`
  - **No data-loss prompt appeared** → D-19 additive-only invariant verified at runtime.
  - **Did NOT use `--accept-data-loss`** flag.
- Smoke `findFirst()` returned `effective_sample_size: 0, n_trials_attempted: 0` on row `insider/cluster_selling/small_cap/3` — DEFAULT 0 soak working.
- Aggregate verification via raw SQL `SELECT COUNT(*) FILTER (WHERE effective_sample_size = 0) ...` returned `total=47, ess_zero=47, nta_zero=47` — **100% of existing rows soaked at DEFAULT 0**.

## Task Commits

1. **Task 1: Add effective_sample_size + n_trials_attempted columns** — `f9fbf14` (feat) — +2 lines, 0 deletions, 0 modifications outside the LearnedPattern block.
2. **Task 2a: Apply prisma format alignment** — `aa12584` (chore) — 51 insertions / 51 deletions, all whitespace-only column-width realignments. Triggered by `prisma format` per the task action.
3. **Task 2b/3: prisma generate + db push + smoke** — no repo changes (db push affects Neon DDL only; client regeneration writes to gitignored `node_modules/`).

## Files Created/Modified

- `prisma/schema.prisma` — added the two columns inside `model LearnedPattern` (now lines 103-104); `prisma format` realigned column widths across the model (cosmetic).
- `.planning/phases/18-time-decayed-bayesian-updates-ess/18-03-SUMMARY.md` — this file.

## Decisions Made

- **Status enum NOT widened in schema.** `LearnedPattern.status` is already `String @default("EXPLORATORY")` — accepts arbitrary strings — so adding `EXPLORATORY-WATCH` for T-18-04 needs no schema change. Mitigation is the `STATUS_VALUES` const in Plan 01.
- **Used in-place `source .env.local`** instead of installing `dotenv-cli` — Prisma 7 reads from `process.env` (via `prisma.config.ts`) but doesn't auto-load `.env.local`. Adding a CLI dependency for one push command isn't worth it; the one-liner shell idiom (`set -a && source .env.local && set +a`) is repo-conventional.
- **Used `prisma db push`, not `prisma migrate dev`.** Repo has no `prisma/migrations/` directory — the team uses `db push` for dev-branch evolution and runs `prisma migrate deploy` only at production release. Plan 03 explicitly targets dev only.

## Deviations from Plan

### Documentation Discrepancy (not a code/exec deviation)

**1. [Plan-prose discrepancy] LearnedPattern row count** — The plan referenced "504 existing LearnedPattern rows" in three places (objective, must_haves, Task 3 done criterion). Live Neon dev branch actually has **47 rows** (verified via `SELECT COUNT(*)`). The D-19 invariant ("all existing rows take DEFAULT 0 on push") was verified against the actual count: 47 of 47 = 100%. No code change required — the success criterion ("all existing rows take DEFAULT 0") is satisfied; only the absolute count number in the plan prose was stale. Likely the plan author was reading from a cached count or counted across `learned_patterns + learning_events`. Flagging here for the SUMMARY trail; STATE.md / orchestrator can decide whether to refresh the plan prose.

### Auto-fixed Issues

**2. [Rule 3 - Blocking] Worktree missing .env.local**
- **Found during:** Task 3 (db push)
- **Issue:** `npx prisma db push` errored `Connection url is empty` because `prisma.config.ts` reads `process.env.DIRECT_URL` and the worktree lacked `.env.local` (worktrees don't symlink env files from the main repo).
- **Fix:** `cp /Users/tj/Desktop/Cipher/.env.local .env.local`. The repo `.gitignore` already excludes `.env.local`, so this file will not be committed.
- **Verification:** Re-ran `set -a && source .env.local && set +a && npx prisma db push` → succeeded with "in sync".
- **Committed in:** N/A — env file is gitignored.

**3. [Rule 3 - Blocking] Smoke test PrismaClient construction**
- **Found during:** Task 3 (smoke test)
- **Issue:** Plan 03's literal smoke command (`new (require('@prisma/client').PrismaClient)()`) fails under Prisma 7 with `PrismaClientInitializationError: needs to be constructed with non-empty PrismaClientOptions` because the client requires the Neon driver adapter (per `src/lib/db.ts`).
- **Fix:** Mirrored `src/lib/db.ts` — instantiate `new PrismaNeon({ connectionString: process.env.DATABASE_URL })` and pass it as `{ adapter }`.
- **Verification:** Smoke prints `effective_sample_size: 0, n_trials_attempted: 0` on a real cell, plus aggregate `47/47` rows at DEFAULT 0.
- **Committed in:** N/A — smoke test is one-shot, no repo file written.

---

**Total deviations:** 1 documentation discrepancy noted, 2 Rule-3 blocking auto-fixes (worktree env + Prisma 7 client construction). No schema-side or DB-side deviations. D-19 (additive-only) and D-15 (column adds) invariants both verified at runtime.

## Issues Encountered

- `prisma format` deprecation warning: `Preview feature "driverAdapters" is deprecated. The functionality can be used without specifying it as a preview feature.` This is project-wide (already in `generator client { previewFeatures = ["driverAdapters"] }` since well before Phase 18) and OUT OF SCOPE for this plan per the executor's scope-boundary rule. Logged here for visibility — a future infra plan can drop the line.
- `BigInt` serialization error during the first smoke run when `JSON.stringify`-ing a `COUNT()` result. Fixed inline by `String(row.total)` formatting. Not a schema bug; PostgreSQL's `COUNT()` returns BIGINT and Prisma's raw query passes it through as JS BigInt.

## Threat Flags

None. Plan 03 introduces no new endpoints, auth paths, file access patterns, or trust-boundary changes beyond the threat model's existing entries (`schema-tamper` and `wrong-target`, both mitigated as planned).

## Known Stubs

None. The new columns sit at DEFAULT 0 by D-19 design — this is a planned soak before Plan 04 wires the writers, NOT a UI-rendered placeholder. No stub-pattern files were touched.

## Next Phase Readiness

- **Plan 18-04 (cron rewire) is unblocked.** Live Neon dev branch DDL now has both columns; the `learn` cron can write to `effective_sample_size` and `n_trials_attempted` without throwing `column does not exist`.
- **Production deploy:** When Phase 18 ships, `npx prisma db push` (or `prisma migrate deploy` if a migration file is later created) must run against the production Neon branch. This is a separate operator step at Vercel build time — explicitly OUT OF SCOPE for Plan 03 per the plan's "DO NOT push to production" guard.
- **Type-safety from now on:** Any code reading `LearnedPattern` rows now sees `effective_sample_size: number` and `n_trials_attempted: number` in the generated client. Existing callers (`engine-context.ts`, `insights/page.tsx`, etc.) are unaffected because the columns are additive; they ignore unknown fields.

## Self-Check: PASSED

Verified before writing this section:

- `git log --oneline -3` shows commits `aa12584` (chore: prisma format) and `f9fbf14` (feat: add columns) — FOUND.
- `prisma/schema.prisma` lines 103-104 contain `effective_sample_size Float    @default(0)` and `n_trials_attempted    Int      @default(0)` — FOUND (verified via Grep).
- `.planning/phases/18-time-decayed-bayesian-updates-ess/18-03-SUMMARY.md` — being written now, will be FOUND post-Write.
- Live Neon dev branch: `47/47` rows return `effective_sample_size = 0` and `n_trials_attempted = 0` — verified via raw SQL aggregate.
- `npx prisma db push` log at `/tmp/p18-push.log` contains `Your database is now in sync with your Prisma schema` — FOUND.
- Generated client at `node_modules/.prisma/client/index.d.ts` contains `effective_sample_size: number` and `n_trials_attempted: number` on LearnedPattern — FOUND (multiple matches).

---
*Phase: 18-time-decayed-bayesian-updates-ess*
*Completed: 2026-05-06*
