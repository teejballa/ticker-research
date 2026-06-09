---
phase: 22-market-regime-and-source-weights
plan: 00
subsystem: schema-migration + test-scaffolding
tags: [prisma, regime, source-weights, red-stubs, wave-0]
dependency_graph:
  requires:
    - "Phase 21 ship (2026-05-24)"
    - "Phase 21.1 ship (2026-06-08) + 2-week soak D-01"
  provides:
    - "prisma/schema.prisma additive columns for Waves 1-5 to populate"
    - "11 RED test stubs that downstream waves turn GREEN"
    - "tests/fixtures/regime/{vix,spy}-history.json deterministic fixtures for Wave 1"
  affects:
    - "Wave 1 (22-01) — regime classifier + sentiment-scan write"
    - "Wave 2 (22-02) — backfill-regime cron"
    - "Wave 3 (22-03) — source-tier recompute + aggregator regime read"
    - "Wave 4 (22-04) — learn cron + hierarchical BY-FDR + transition exclusion"
    - "Wave 5 (22-05) — done-gate + unique-constraint flip + Source mix UI"
tech_stack:
  added: []
  patterns:
    - "additive Prisma migration with DEFAULT 'ALL' (mirrors P21 sector_etf, P27 source column)"
    - "RED stub with module-level guard fires before it.todo blocks — meaningful error pointing at the missing Wave target"
    - "live-DB integration test gated on RUN_LIVE_INTEGRATION=true (mirrors learn-promotion-event.test.ts §6)"
key_files:
  created:
    - "src/lib/regime/__tests__/classify.test.ts"
    - "src/lib/regime/__tests__/vix-percentile.test.ts"
    - "src/lib/evaluation/__tests__/fdr-hierarchical.test.ts"
    - "src/lib/evaluation/__tests__/regime-done-gate.test.ts"
    - "src/lib/sentiment/__tests__/source-tier-regime.test.ts"
    - "src/lib/sentiment/__tests__/source-tier-eb.test.ts"
    - "src/lib/sentiment/__tests__/aggregator-regime.test.ts"
    - "src/app/api/cron/__tests__/backfill-regime.test.ts"
    - "src/app/api/cron/__tests__/sentiment-scan-regime.test.ts"
    - "src/app/api/cron/__tests__/learn-transition-exclusion.test.ts"
    - "src/lib/__tests__/learned-pattern-regime.test.ts"
    - "tests/fixtures/regime/vix-history.json"
    - "tests/fixtures/regime/spy-history.json"
  modified:
    - "prisma/schema.prisma"
decisions:
  - "D-06 step 1 — additive regime columns with DEFAULT 'ALL' (4 models)"
  - "D-07 — shrinkage_strength Float? on SourceTier (additive nullable)"
  - "D-11 step 1 — phased cutover: only column-add migration shipped; unique-constraint flip deferred to Wave 5"
  - "Q3 — LearningEvent.regime as top-level nullable column (not nested in delta JSON)"
metrics:
  duration_minutes: "~10"
  completed_date: "2026-06-09"
  tasks_completed_in_executor: "2 of 3 (Task 3 = operator checkpoint)"
  files_created: 13
  files_modified: 1
  loc_added: "~1647 (49 schema + ~1598 stubs + fixtures)"
---

# Phase 22 Plan 0: Wave 0 — Schema + RED stubs Summary

**One-liner:** Additive Prisma migration adds `regime`/`shrinkage_strength` columns to 5 models (SentimentSnapshot, LearnedPattern, PerSourceIC, SourceTier, LearningEvent) with `DEFAULT 'ALL'`, plus 11 RED test stubs + 2 deterministic VIX/SPY fixtures so Waves 1-5 have a contract skeleton to turn GREEN against.

---

## What Shipped

### 1. Prisma schema migration (Task 1)

Five models gained additive columns. The unique-constraint flips remain deferred to Wave 5 (D-11 step 4) per the phased cutover plan — Wave 0 is intentionally reversible.

| Model | New columns | New index |
|-------|-------------|-----------|
| `SentimentSnapshot` (L42-79) | `regime String @default("ALL")`, `regime_vix_level Float?`, `regime_vix_pctile Float?`, `regime_ma_diff Float?` | `@@index([ticker, regime, scanned_at(sort: Desc)])` |
| `LearnedPattern` (L122-167) | `regime String @default("ALL")` | none yet (existing `@@unique([signal_class, pattern_key, cap_class, horizon_days])` retained until Wave 5) |
| `PerSourceIC` (L351-405) | `regime String @default("ALL")` | none yet (existing `@@unique([source_id, computed_at, forward_horizon_days, model_version])` retained) |
| `SourceTier` (L582-641) | `regime String @default("ALL")`, `shrinkage_strength Float?` | `@@index([source_id, regime, computed_at(sort: Desc)], map: "idx_sourcetier_source_regime_at")` |
| `LearningEvent` (L214-260) | `regime String?` (top-level nullable per RESEARCH §Q3) | none |

**Reversibility:** every change is a column ADD with default OR nullable. `prisma format` and `prisma validate` both pass. Existing reads continue to work transparently because the `'ALL'` default flows into the D-09 cold-start chain unchanged.

### 2. RED test stubs (Task 2)

11 stub files seeded; each fails RED today with a meaningful error pointing at the missing Wave-N implementation. Live-DB stub uses `describe.skipIf(!RUN_LIVE_INTEGRATION)` so default `npm test` skips it cleanly.

| Stub file | Target wave | Decision | RED mode today |
|-----------|-------------|----------|----------------|
| `src/lib/regime/__tests__/classify.test.ts` | Wave 1 | CORE-ML-07, D-02/D-03/D-04/D-09 | `Cannot find module '../classify'` |
| `src/lib/regime/__tests__/vix-percentile.test.ts` | Wave 1 | CORE-ML-07, D-04/D-12 | `Cannot find module '../vix-percentile'` |
| `src/app/api/cron/__tests__/sentiment-scan-regime.test.ts` | Wave 1 | CORE-ML-08 | DATABASE_URL load error on sentiment-scan route import (Wave 1 will add `classifyRegimeAndPersistForScan` export) |
| `src/app/api/cron/__tests__/backfill-regime.test.ts` | Wave 2 | D-10, D-12 | `Cannot find module '@/app/api/cron/backfill-regime/route'` |
| `src/lib/sentiment/__tests__/source-tier-regime.test.ts` | Wave 3 | D-06, D-09 | Module-level RED guard asserts `getWeightForSource.length >= 3` (today is arity 2) |
| `src/lib/sentiment/__tests__/source-tier-eb.test.ts` | Wave 3 | D-07 | Module-level RED guard asserts `typeof shrinkSourceIcEmpiricalBayes === 'function'` (today undefined) |
| `src/lib/sentiment/__tests__/aggregator-regime.test.ts` | Wave 3 | D-08 | DATABASE_URL load error on aggregator import (Wave 3 will extend `AggregatorInputs` with `regime?`) |
| `src/lib/evaluation/__tests__/fdr-hierarchical.test.ts` | Wave 4 | D-15 | Module-level RED guard asserts `typeof hierarchicalBYBH === 'function'` (today undefined) |
| `src/app/api/cron/__tests__/learn-transition-exclusion.test.ts` | Wave 4 | D-05 | DATABASE_URL load error on learn route import (Wave 4 will export `excludeTransitionZoneEvents`) |
| `src/lib/evaluation/__tests__/regime-done-gate.test.ts` | Wave 5 | D-14 | `Cannot find module '../regime-done-gate'` |
| `src/lib/__tests__/learned-pattern-regime.test.ts` | Wave 4 / 5 live-DB | CORE-ML-06 | `describe.skipIf(!RUN_LIVE_INTEGRATION)` skips by default; will import `upsertLearnedPatternForRegime` from `@/lib/learning` (not yet exported) when run live |

### 3. Golden fixtures (Task 2)

Both fixtures hand-written for determinism — offline-runnable, no network. Wave 1 imports them for the classifier unit tests.

| Fixture | Shape | Known boundary |
|---------|-------|----------------|
| `tests/fixtures/regime/vix-history.json` | 65 trading-day entries `{date, close}`, linear walk 15.0 → 28.5 | Rolling-60d 50th-percentile cross at index 31 (close ≈ 21.539) — flips bull-low-vol → bull-high-vol on the vol axis |
| `tests/fixtures/regime/spy-history.json` | 220 trading-day entries `{date, close}`; decline 500→380 over indices 0..149, rise 380→500 over indices 150..219 | MA50 − MA200 sign flip in the index range `[200, 210)`: at index 199 diff = −13.88; at index 209 diff = +4.38 — flips bear → bull on the trend axis |

---

## Commits

| Commit | Type | Files | What |
|--------|------|-------|------|
| `a0d4952` | feat | `prisma/schema.prisma` | Additive regime + shrinkage_strength columns across SentimentSnapshot, LearnedPattern, PerSourceIC, SourceTier, LearningEvent |
| `1523718` | test | 13 new files (11 RED stubs + 2 fixtures) | RED-by-design stubs across `src/lib/regime/`, `src/lib/evaluation/`, `src/lib/sentiment/`, `src/app/api/cron/`, `src/lib/` + deterministic VIX/SPY fixtures |

---

## Verification (per plan `<verification>` block)

1. `npx prisma validate` exits 0. ✅
2. `grep -E 'regime String @default\("ALL"\)' prisma/schema.prisma | wc -l` = 4 (SentimentSnapshot L65, LearnedPattern L176, PerSourceIC L400, SourceTier L635). ✅
3. `grep -E 'shrinkage_strength Float\?' prisma/schema.prisma` returns the SourceTier line (L636) alongside the pre-existing LearnedPattern P19-A-07 line (L167). ✅
4. Operator confirms `prisma db push` succeeded against Neon. ⏸ **Task 3 pending — operator checkpoint** (see "Operator Checkpoint" section below).
5. `npx vitest run` over the 10 unit-test stubs exits non-zero (10 failed test files + 3 explicit assertion failures + 20 todo markers). ✅
6. `node -e "JSON.parse(require('fs').readFileSync('tests/fixtures/regime/vix-history.json'))"` exits 0. ✅
7. `node -e "JSON.parse(require('fs').readFileSync('tests/fixtures/regime/spy-history.json'))"` exits 0. ✅

---

## Deviations from Plan

None of the auto-fix rules (Rule 1/2/3) fired. The only minor refinement was strengthening 3 weakly-coupled RED stubs (`fdr-hierarchical`, `source-tier-regime`, `source-tier-eb`) with module-level `expect(typeof X).toBe('function')` guards so they fail with a meaningful directed error instead of silently passing as pure `it.todo`. This is consistent with the plan's done-criteria language: "module-resolution errors (RED state proving the implementation doesn't exist yet) OR `todo` markers — never silent pass." The guards make the error path explicit and self-documenting for Wave 3/4 executors.

---

## Operator Checkpoint (Task 3 — blocking)

**Type:** `checkpoint:human-action`

**Status:** awaiting operator.

**Why operator-gated:** `prisma db push` writes DDL to production Neon (T-22-00-01 trust boundary). The migration is fully additive — every new column is either `DEFAULT 'ALL'` or `?` nullable — so zero data loss is expected. Postgres 16 (Neon) handles nullable/defaulted column adds without table rewrites, so no downtime is expected either. Still, only the operator runs the push (single elevation point per the threat model).

**What the operator must do:**

1. Open a terminal at the repo root.
2. Confirm `DATABASE_URL` in `.env.local` points at the production Neon branch (per `[[feedback_env_parity]]` — keep prod and `.env.local` in lockstep).
3. Run: `npx prisma db push`
4. Confirm output includes "Your database is now in sync with your Prisma schema" and lists the 8 new columns + 2 new indexes (`@@index([ticker, regime, scanned_at])` on SentimentSnapshot, `@@index([source_id, regime, computed_at])` on SourceTier).
5. Spot-check with: `npx prisma db pull --print | grep -E 'regime|shrinkage_strength' | head -20` — confirm Neon reports the columns.
6. Spot-check via psql or the Neon dashboard:
   - `SELECT COUNT(*) FROM "sentiment_snapshots" WHERE regime = 'ALL';` — should equal the table's total row count
   - `SELECT COUNT(*) FROM "learned_patterns" WHERE regime = 'ALL';` — same
   - `SELECT COUNT(*) FROM "per_source_ic" WHERE regime = 'ALL';` — same
   - `SELECT COUNT(*) FROM "source_tiers" WHERE regime = 'ALL';` — same
   - `SELECT COUNT(*) FROM "learning_events" WHERE regime IS NULL;` — should equal total row count (LearningEvent.regime is nullable, not defaulted)

**Resume signal:** `pushed`.

---

## Hand-off to Wave 1

> **Wave 1 imports `tests/fixtures/regime/vix-history.json` and `tests/fixtures/regime/spy-history.json` for deterministic classifier tests.**

Wave 1's implementation target list (turning the Wave 0 RED stubs GREEN):

| Wave 1 deliverable | Turns GREEN |
|--------------------|-------------|
| `src/lib/regime/classify.ts` exporting `classifyRegimeAt({asOf}): Promise<RegimeResult>` | `classify.test.ts` |
| `src/lib/regime/vix-percentile.ts` exporting `getVix60dPercentile(asOf)` | `vix-percentile.test.ts` |
| `src/lib/regime/ma-cross.ts` exporting `getSpyMaCross(asOf)` (consumed by classifier) | (indirectly via `classify.test.ts`) |
| `src/lib/regime/hyperparameters.ts` exporting `REGIME_HYPERPARAMETERS` (Zod-validated) | (indirectly via `classify.test.ts`) |
| `src/lib/regime/types.ts` exporting `RegimeLabel` union | (indirectly across all stubs) |
| `src/app/api/cron/sentiment-scan/route.ts` exporting `classifyRegimeAndPersistForScan` and wiring `classifyRegimeAt({asOf: now})` into the snapshot insert | `sentiment-scan-regime.test.ts` |

Wave 1 also lands `@knowable_at` annotations on every helper (CLAUDE.md rule #6 + `scripts/check-feature-asof.ts` enforcement).

---

## Threat-Surface Check

No new threat surface beyond what the plan's `<threat_model>` already enumerated:

- T-22-00-01 (operator-gated DB push) — Task 3 checkpoint enforces this.
- T-22-00-02 (schema lock during push) — additive nullable-or-defaulted columns are non-blocking in Postgres 16.
- T-22-00-03 (test fixtures contain market data) — VIX + SPY closes are public; no PII, no keys.
- T-22-00-04 (traceability) — every new column carries a `// PHASE 22 (D-XX):` line comment per Task 1.

No `threat_flags` to record.

---

## Self-Check: PASSED

Verified all artifacts on disk and all commits in git history:

```
FOUND: prisma/schema.prisma                                           (modified)
FOUND: src/lib/regime/__tests__/classify.test.ts
FOUND: src/lib/regime/__tests__/vix-percentile.test.ts
FOUND: src/lib/evaluation/__tests__/fdr-hierarchical.test.ts
FOUND: src/lib/evaluation/__tests__/regime-done-gate.test.ts
FOUND: src/lib/sentiment/__tests__/source-tier-regime.test.ts
FOUND: src/lib/sentiment/__tests__/source-tier-eb.test.ts
FOUND: src/lib/sentiment/__tests__/aggregator-regime.test.ts
FOUND: src/app/api/cron/__tests__/backfill-regime.test.ts
FOUND: src/app/api/cron/__tests__/sentiment-scan-regime.test.ts
FOUND: src/app/api/cron/__tests__/learn-transition-exclusion.test.ts
FOUND: src/lib/__tests__/learned-pattern-regime.test.ts
FOUND: tests/fixtures/regime/vix-history.json
FOUND: tests/fixtures/regime/spy-history.json
FOUND: commit a0d4952 (feat schema migration)
FOUND: commit 1523718 (test RED stubs + fixtures)
```

(self-check commands: `[ -f path ] && echo FOUND || echo MISSING` for each path; `git log --oneline --all | grep -q <hash>` for each commit hash)
