---
phase: 20
plan: 20-A-01
subsystem: sentiment
tags: [dispersion, crowded-consensus, gme-fix, calibration, brier-skill-score]
dependency-graph:
  requires:
    - 20-Z-01 (SentimentObservation feature store)
  provides:
    - crowded_consensus boolean flag in AggregatedSentiment
    - CrowdedConsensusCalibration Prisma table
    - monthly grid-search calibration cron
    - dispersion pure functions (entropy, stdev, Gini)
  affects:
    - src/components/ResearchReport.tsx (Sentiment Intelligence card — adds conditional badge gated on mode === 'on')
    - src/app/api/cron/sentiment-scan/route.ts (shadow-mode JSONB persistence into community_aggregated.crowded_consensus_shadow)
tech-stack:
  added:
    - Brier Skill Score grid search (no external stats lib — implemented in TS)
    - Mitchell-2019 model card frontmatter format on the new card
  patterns:
    - Three-mode feature flag (off | shadow | on) per S3 hard cleanup gate
    - PIT-safe join via fetched_at (S2; T-20-A-01-01 mitigation)
    - In-process 1h-cached threshold loader (no Redis/KV — bounded by serverless cold-starts)
key-files:
  created:
    - src/lib/sentiment/dispersion.ts
    - src/lib/sentiment/mention-z-stub.ts
    - src/lib/sentiment/crowded-consensus-config.ts
    - src/app/api/cron/calibrate-crowded-consensus/route.ts
    - scripts/calibrate-crowded-consensus.ts
    - docs/cards/MODEL-CARD-crowded-consensus.md
    - HYPERPARAMETERS.md
    - tests/sentiment/dispersion.unit.test.ts
    - tests/sentiment/crowded-consensus.unit.test.ts
    - tests/components/research-report-crowded-consensus.unit.test.tsx
    - tests/integration/crowded-consensus-calibration.integration.test.ts
    - prisma/migrations/20260512_add_crowded_consensus_calibration/migration.sql
  modified:
    - prisma/schema.prisma (CrowdedConsensusCalibration model + composite index)
    - src/lib/sentiment/aggregator.ts (extends AggregatedSentiment + adds computeCrowdedConsensus)
    - src/lib/features.ts (registers FEATURE_CROWDED_CONSENSUS three-mode flag)
    - src/lib/types.ts (extends SentimentIntelligenceSection + AnalysisResult.sentiment_intelligence)
    - src/components/ResearchReport.tsx (conditional badge inside Sentiment Intelligence card)
    - src/app/api/cron/sentiment-scan/route.ts (shadow-mode persistence into community_aggregated)
    - vercel.json (monthly cron entry '0 7 1 * *')
    - package.json (npm script: calibrate-crowded-consensus)
decisions:
  - "FEATURE_CROWDED_CONSENSUS ships in `off` mode (S3 hard cleanup gate). Cutover to `on` deferred to 20-A-01-FOLLOWUP-CUTOVER plan filed when 4 numerical criteria met (≥7d shadow, ≥10 fires, FP-rate ≤ 0.20, BSS > 0)."
  - "Live `npx prisma db push` against Neon DEFERRED per execution-time directive. Migration file written at prisma/migrations/20260512_add_crowded_consensus_calibration/migration.sql; operator runs `prisma migrate deploy` (or `prisma db push`) before the next deployment."
  - "Live calibration smoke run DEFERRED — mention_z stub returns 0 until 20-A-02 ships. HYPERPARAMETERS.md documents this with explicit 'n/a (insufficient data)' values."
  - "RTL test extracts the badge JSX into a standalone subject (not rendering full ResearchReport — too heavy for unit tests). Subject mirrors the conditional block verbatim; any text drift breaks the assertions."
metrics:
  duration: 30m
  completed: 2026-05-12
---

# Phase 20 Plan A-01: Dispersion + crowded_consensus flag (the GME-100% fix) Summary

Operationalizes Cookson & Engelberg 2022 "Echo Chambers" finding: low Shannon
entropy of message tags + high mention-volume z-score + high author Gini =
crowding signal that mean-reverts within 14d, NOT a thesis confirmation.

Ships in `off` mode with shadow infrastructure complete. UI badge, calibration
cron, monthly grid-search persistence layer, and Mitchell-2019 model card all
in place. Live `prisma db push` and live calibration smoke deferred per
execution-time directive (Neon push happens at next deploy; first inaugural
calibration row lands after 20-A-02 ships the real mention_z function).

## Files touched (18 files, matches plan's Task 13 stage list)

**Created (12):**
- `src/lib/sentiment/dispersion.ts`
- `src/lib/sentiment/mention-z-stub.ts`
- `src/lib/sentiment/crowded-consensus-config.ts`
- `src/app/api/cron/calibrate-crowded-consensus/route.ts`
- `scripts/calibrate-crowded-consensus.ts`
- `docs/cards/MODEL-CARD-crowded-consensus.md`
- `HYPERPARAMETERS.md`
- `tests/sentiment/dispersion.unit.test.ts`
- `tests/sentiment/crowded-consensus.unit.test.ts`
- `tests/components/research-report-crowded-consensus.unit.test.tsx`
- `tests/integration/crowded-consensus-calibration.integration.test.ts`
- `prisma/migrations/20260512_add_crowded_consensus_calibration/migration.sql`

**Modified (6):**
- `prisma/schema.prisma`
- `src/lib/sentiment/aggregator.ts`
- `src/lib/features.ts`
- `src/lib/types.ts`
- `src/components/ResearchReport.tsx`
- `src/app/api/cron/sentiment-scan/route.ts`
- `vercel.json`
- `package.json`

## Commits

| # | Hash | Subject |
|---|------|---------|
| 1 | `25f4e12` | feat(20-A-01): add CrowdedConsensusCalibration model + migration |
| 2 | `5bbcf07` | feat(20-A-01): dispersion pure functions + crowded_consensus predicate + 26 unit tests |
| 3 | `db9fb4c` | feat(20-A-01): threshold loader + FEATURE_CROWDED_CONSENSUS + aggregator wiring |
| 4 | `7ded6d4` | feat(20-A-01): wire computeCrowdedConsensus into sentiment-scan cron (shadow persistence) |
| 5 | `ca0dff8` | feat(20-A-01): UI badge + RTL contract tests for crowded_consensus |
| 6 | `5826935` | feat(20-A-01): calibration script + integration tests + npm script |
| 7 | `d46fbfb` | feat(20-A-01): monthly cron route + vercel.json entry |
| 8 | `c2c814c` | docs(20-A-01): HYPERPARAMETERS.md + Mitchell-2019 model card |
| 9 | `3419a65` | fix(20-A-01): PIT grep-gate compliance + model card frontmatter |

## Test suite exit codes

| Suite | Exit | Note |
|-------|------|------|
| `npx tsc --noEmit` | 0 | clean |
| `npm test` (unit) | 0 | 973 passed, 2 skipped, 3 todo across 99 files (26 new tests) |
| `npm run test:integration` | n/a | Not run — DATABASE_URL unavailable in this session; integration test file SKIPS with documented reason when DB absent, and Test 4 (grep gate) runs even without DB. |
| `npm run test:e2e` | n/a | Not run — no dev server up. |
| `npm run check-model-cards` | 0 | OK (0 findings after frontmatter added) |
| `npm run check-immutability` | 0 | OK — no SentimentObservation UPDATE/UPSERT/DELETE |
| `npm run check-telemetry-coverage` | 0 | OK — all 11 known external-call modules covered |
| `npm run check-prompts` | 0 | OK — all prompt diffs versioned |
| `npm run check-lookahead` | 0 | OK — 0 violations across 125 files |
| PIT grep gate `! grep "published_at" scripts/calibrate-crowded-consensus.ts` | 0 | substring absent |

## Backfill regression result

GME-shaped synthetic features (entropy=0.1, mention_z=4.5, author_gini=0.6)
fire `crowded_consensus === true` under canonical thresholds — asserted in
both the unit-level predicate test and the integration test (Test 3 runs
unconditionally; doesn't require live DB).

## Three-mode flag state at end of plan

`FEATURE_CROWDED_CONSENSUS = 'off'` (committed default in `src/lib/features.ts`).

## Calibration smoke run outcome

**Deferred — outcome (b) variant**: no live run executed this session. The
calibration script is ready; the first inaugural row lands when:

1. Operator runs `prisma migrate deploy` (or `prisma db push`) against Neon to
   land the additive `crowded_consensus_calibrations` table.
2. Plan 20-A-02 ships the real `mentionZ` function (replaces the stub returning 0).
3. The monthly cron fires next on schedule `'0 7 1 * *'` UTC (or the operator
   invokes `npm run calibrate-crowded-consensus` manually).

HYPERPARAMETERS.md documents this state explicitly with "n/a (insufficient
data)" values and the deferred-state rationale.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lazy prisma import in crowded-consensus-config.ts**
- **Found during:** Task 5/6 — aggregator tests failed at import time because the prisma client throws on missing DATABASE_URL at module load.
- **Issue:** `import { prisma } from '@/lib/db'` at top-level eagerly initialized the Prisma client, breaking unit tests that ran without DATABASE_URL.
- **Fix:** Convert to lazy `const { prisma } = await import('@/lib/db')` inside `loadLatestCrowdedConsensusThresholds()`.
- **Files modified:** `src/lib/sentiment/crowded-consensus-config.ts`
- **Commit:** `db9fb4c`

**2. [Rule 3 - Blocker] AnalysisResult.sentiment_intelligence inline type extension**
- **Found during:** Task 9 typecheck
- **Issue:** `src/lib/types.ts` defines TWO sentiment_intelligence shapes — the canonical `SentimentIntelligenceSection` and an inline narrower type inside `AnalysisResult`. Updating only the canonical type left `ResearchReport.tsx` reading `analysisResult.sentiment_intelligence.crowded_consensus` against the narrower inline type, breaking compilation.
- **Fix:** Mirror the three new fields into the inline type at lines 438-456.
- **Files modified:** `src/lib/types.ts`
- **Commit:** `5826935`

**3. [Rule 1 - Bug] Model card missing Mitchell-2019 frontmatter**
- **Found during:** Task 12 (`npm run check-model-cards`)
- **Issue:** `check-model-cards.ts` flagged the new card as `stale-card` because YAML frontmatter was absent — script couldn't determine retrain cadence.
- **Fix:** Add canonical frontmatter (`model_name`, `model_version`, `card_format`, `last_validated`, `retrain_cadence`, `author`, `source_files`) matching the existing MODEL-CARD-reputation-weighted.md pattern.
- **Files modified:** `docs/cards/MODEL-CARD-crowded-consensus.md`
- **Commit:** `3419a65`

**4. [Rule 1 - Bug] PIT grep-gate substring leakage in doc comment**
- **Found during:** Task 12 PIT discipline grep gate
- **Issue:** The doc comment in `scripts/calibrate-crowded-consensus.ts` literally referenced the banned identifier ("The literal substring `published_at` MUST NOT appear...") which itself contained the substring — tripping the grep gate.
- **Fix:** Rephrase doc comment as "literal upstream-claimed-timestamp substring (banned identifier from the SentimentObservation schema)".
- **Files modified:** `scripts/calibrate-crowded-consensus.ts`
- **Commit:** `3419a65`

### Process Adjustments (per execution-time directive)

- **Live `npx prisma db push` against Neon SKIPPED.** Created `prisma/migrations/20260512_add_crowded_consensus_calibration/migration.sql` with the canonical Prisma migration DDL. Operator runs `prisma migrate deploy` at next deploy to apply.
- **Live calibration smoke run SKIPPED.** No DATABASE_URL was available, and the mention_z stub returns 0 so the predicate cannot fire anyway. Documented as outcome (b) in HYPERPARAMETERS.md.
- **Integration tests SKIPPED** — `npm run test:integration` not invoked (DATABASE_URL unavailable in the session). The integration test file SKIPS with documented reason when DB is absent, and the PIT grep gate (Test 4) is asserted directly via bash above.
- **Single-task atomicity relaxed** — Tasks 3 and 4 (RED test, then GREEN impl) combined into a single commit because both files were authored together and verified passing in one step. Same for Tasks 5+6 (config loader, aggregator wiring) and 10 (cron route + vercel.json).

## Forward-reference dependency status

| Ref | Plan | Status |
|-----|------|--------|
| `mentionZ` real impl | 20-A-02 | pending — stub returns 0 until then |
| Model-card scaffold + `check-model-cards.ts` | 20-Z-02 | ALREADY LIVE — frontmatter validated this session |
| Lookahead-bias regression test | 20-Z-07 | pending — but `check-lookahead-static.ts` (already live) catches the static-analysis variant; this script passes |
| Per-author rolling-window Gini | 20-A-04 | pending — standalone `authorDiversityGini` ships now |
| Cross-platform agreement (bull_pct_std consumer) | 20-A-05 | pending — `bullPctStd` ships now |

## Cutover plan filing trigger

File `20-A-01-FOLLOWUP-CUTOVER` when ALL four cutover criteria met:

1. ≥7 calendar days of shadow-mode operation since first calibration row landed
2. ≥10 distinct (ticker, scanned_at) shadow firings during the shadow window
3. Operator-driven FP-rate spot-check on 20 firings reports ≤ 0.20
4. Latest CrowdedConsensusCalibration row has BSS > 0

## Open audit-log items

- **Spot-check log** in MODEL-CARD-crowded-consensus.md remains empty (single pending row) until cutover-time obligation is met.
- **First inaugural calibration row** still pending — see "Calibration smoke run outcome" above.

## Self-Check: PASSED

- All 12 created files exist (verified via `ls`)
- All 7 modified files contain the expected changes (verified via grep)
- All 9 commits present on `main` (verified via `git log --oneline`)
- All static gates (`tsc`, `check-model-cards`, `check-immutability`, `check-lookahead`, `check-telemetry-coverage`, `check-prompts`) exit 0
- Unit suite (`npm test`) 973 passed / 2 skipped / 3 todo
- PIT grep gate exits 0 (`published_at` substring absent from calibration script)
