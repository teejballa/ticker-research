---
phase: 20-real-sentiment-analysis
plan: 20-A-02
subsystem: sentiment
tags: [median-mad, mention-z, cap-class-stratified, shadow-gating, calibration, cron, pit]

requires:
  - phase: 20-Z-01
    provides: SentimentObservation PIT feature store (the daily-count source)
  - phase: 20-Z-02
    provides: Mitchell-2019 model card scaffold + check-model-cards CI gate
  - phase: 20-Z-03
    provides: withTelemetry wrapper (used implicitly via stocktwits + cron sites)
provides:
  - MentionBaseline Prisma table — rolling 90d (median, MAD) per (ticker, source_class)
  - baseline.ts module — medianAndMAD (1.4826-scaled), mentionZScore (EPSILON-floored), getZThresh (HYPERPARAMETERS-parsed)
  - mention-z-stub.ts now re-exports the real implementation; 20-A-01 dispersion's V condition is wired
  - FEATURES.mention_z_trending_mode three-mode flag (off|shadow|on, default off)
  - stocktwits.ts shadow-gated is_trending replacement (legacy preserved on off path)
  - AggregatedSentiment surfaces mention_z + is_trending_v2 + mode
  - Nightly cron /api/cron/mention-baselines at 04:30 UTC (8-min wall-clock budget)
  - Calibration script scripts/calibrate-mention-z-threshold.ts (grid search, exit 4 on INSUFFICIENT_DATA)
  - HYPERPARAMETERS.md Z_thresh per cap_class table (literature default seeded; live cron will overwrite)
  - docs/cards/MODEL-CARD-mention-baseline.md (Mitchell-2019 format)
affects: [20-A-01 dispersion (V condition), 20-C-04 pump-dump, 20-B-04 source-tier consumer in future]

tech-stack:
  added: []
  patterns:
    - "Median + 1.4826-scaled MAD as robust σ estimator (Rousseeuw & Croux 1993)"
    - "EPSILON floor on MAD to mitigate division-by-zero on perfectly-stable tickers (T-20-A-02-02)"
    - "Cap-class stratified Z_thresh — calibrated, not hand-set (S1)"

key-files:
  created:
    - prisma/migrations/20260512_add_mention_baseline/migration.sql
    - src/lib/sentiment/baseline.ts
    - scripts/recompute-mention-baselines.ts
    - scripts/calibrate-mention-z-threshold.ts
    - src/app/api/cron/mention-baselines/route.ts
    - docs/cards/MODEL-CARD-mention-baseline.md
    - tests/sentiment/baseline.unit.test.ts
    - tests/integration/mention-baseline.integration.test.ts
  modified:
    - prisma/schema.prisma
    - src/lib/sentiment/mention-z-stub.ts
    - src/lib/features.ts
    - src/lib/data/stocktwits.ts
    - src/lib/sentiment/aggregator.ts
    - vercel.json
    - HYPERPARAMETERS.md

key-decisions:
  - "Cap-class for runtime decision in stocktwits.ts is 'unknown' (fetcher has no market-cap context); proper resolution belongs in a follow-up plan."
  - "Calibration's forward-return proxy is PriceOutcome.pct_change (SPY subtraction lives in diffusion engine). Spearman IC is rank-based and tolerates the linear shift; metric label is preserved as 'alpha-vs-SPY' in the model card."
  - "Model card placed at docs/cards/ (Z-02 convention), not the .planning/ path the plan frontmatter originally suggested — check-model-cards reads the @model-card: annotation as canonical path."

patterns-established:
  - "Shadow-gated is_trending replacement: legacy heuristic returns first, new baseline-based path runs in setImmediate background, ShadowComparison persists."
  - "MentionBaseline as the source-of-truth for downstream mention_z consumers (dispersion V condition, source-tier, pump-dump)."

requirements-completed: []

duration: ~3h50m (mixed: 2 stream timeouts + 1 partial-success agent + inline finishing)
completed: 2026-05-12
---

# Phase 20-A-02 Summary

**Robust mention-volume baseline (median + MAD per cap_class) replaces GME-era stocktwits_is_trending heuristic. Shipped under FEATURES.mention_z_trending_mode = 'off' with full shadow infrastructure ready.**

## Self-Check: PASSED

- `npx tsc --noEmit` → exit 0
- `npm test` → **992 passed / 2 skipped / 3 todo / 0 failed**
- `npm run check-model-cards` → OK
- `npm run check-immutability` → OK
- `npm run check-telemetry-coverage` → OK (11 modules wrapped)
- `npm run check-prompts` → green
- `npm run check-lookahead` → 0 violations / 127 files
- `tests/sentiment/baseline.unit.test.ts` → 19/19 pass
- Working tree clean

## Performance

- **Duration:** ~3h50m wall-clock (3 spawned executor agents, 2 stream timeouts, then inline finishing). The first agent landed 0 commits in 60min; the second landed only the schema + module in 53min; the rest (9 commits) was done inline.
- **Tasks landed:** 11 atomic commits + 1 SUMMARY (this file)
- **Files created:** 8
- **Files modified:** 7

## Accomplishments

### Commits (in order)

1. `8ebf482` feat(20-A-02): MentionBaseline schema + median/MAD baseline module (partial-agent commit of `prisma/schema.prisma`, `prisma/migrations/.../migration.sql`, `src/lib/sentiment/baseline.ts`)
2. `93d0079` feat(20-A-02): mention_z_trending feature flag + replace mention-z stub
3. `6706ddd` feat(20-A-02): shadow-gate stocktwits is_trending under mention_z_trending_mode
4. `2a58d2a` feat(20-A-02): surface mention_z + is_trending_v2 on AggregatedSentiment
5. `2f8361b` feat(20-A-02): nightly recompute + per-cap_class calibration scripts
6. `b6b987f` feat(20-A-02): nightly mention-baselines cron route + vercel.json entry
7. `35a0b83` docs(20-A-02): mention-baseline model card + HYPERPARAMETERS Z_thresh table
8. `bfaf579` fix(20-A-02): align mention-baseline model-card frontmatter to project schema
9. `9887557` test(20-A-02): 19 unit tests for baseline.ts
10. `b83c60c` test(20-A-02): live-Neon integration test (skip when DATABASE_URL unset)

### Three-mode flag state

`FEATURES.mention_z_trending_mode = 'off'` (committed default in `src/lib/features.ts`).

### Cutover criteria (shadow → on, documented in MODEL-CARD)

1. ≥30d of nightly cron writes producing non-null baselines for ≥80% active tickers
2. Cross-sectional Spearman IC of (mention_z, forward 5d alpha-vs-SPY) ≥ 0.05
3. ≥1 per-cap_class Z_thresh differs from literature default Z=2.0
4. Upstream cap_class resolution wired into stocktwits.ts (currently passes 'unknown')

### Threat mitigations

- T-20-A-02-01 (sparse-data new-ticker null-baseline): `getBaselineForTicker` returns null when `n_observations < MIN_OBSERVATIONS_FOR_BASELINE (=30)`; consumers fall back to legacy path.
- T-20-A-02-02 (MAD = 0 → ±Infinity z-score): `mentionZScore` floors denominator at `MAD_EPSILON = 1.0`; explicitly asserted by unit test "applies MAD_EPSILON floor when baseline MAD is 0".
- T-20-A-02-04 (PIT violation in calibration): recompute + calibration scripts join SentimentObservation on `fetched_at` only — `check-lookahead` green at 0 violations / 127 files.

## Deviations from plan

1. **Forward-return proxy:** calibration uses `PriceOutcome.pct_change` instead of `Report.return_5d_vs_spy` — the latter does not exist on the Report schema; the SPY benchmark subtraction lives in the diffusion engine pipeline. Spearman IC is rank-based and tolerates the linear shift; metric label preserved as alpha-vs-SPY in the model card.
2. **Cap_class at call time:** stocktwits.ts passes `'unknown'` to `getZThresh` because the StockTwits fetcher has no market-cap context. Upstream resolution is a documented FOLLOWUP item (cutover prerequisite #4).
3. **Model card path:** placed at `docs/cards/` (project convention since Z-02), not the `.planning/` path the plan frontmatter originally specified. `@model-card:` annotation in `baseline.ts` updated to match.

## Deferred items

- **Live `prisma db push`** against Neon — migration SQL committed at `prisma/migrations/20260512_add_mention_baseline/migration.sql`. Operator applies at next deploy via `prisma migrate deploy` (already in vercel.json buildCommand).
- **Live calibration smoke run** — depends on operator running the db push first AND ≥30 daily-count buckets accumulating. The HYPERPARAMETERS.md table currently shows literature-default Z=2.0 for all 4 cap classes; the monthly calibration cron will overwrite on its first scheduled run.
- **Upstream cap_class wiring** in stocktwits.ts — FOLLOWUP plan filed at cutover time.

## Verification command snapshot

```
$ npx tsc --noEmit && \
  npm run check-model-cards && \
  npm run check-immutability && \
  npm run check-telemetry-coverage && \
  npm run check-prompts && \
  npm run check-lookahead && \
  npx vitest run tests/sentiment/baseline.unit.test.ts
# All green — see Self-Check section above.
```
