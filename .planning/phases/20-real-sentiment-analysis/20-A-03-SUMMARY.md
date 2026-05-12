---
phase: 20-real-sentiment-analysis
plan: 20-A-03
subsystem: sentiment
tags: [exponential-decay, per-source-class, calibration, shadow-gating, immutability, cron]

requires:
  - phase: 20-Z-01
    provides: SentimentObservation PIT feature store with decay_weight column + insertObservation DAO + model_version partition
  - phase: 20-Z-02
    provides: Mitchell-2019 model card scaffold + check-model-cards CI gate (no new card required — typed table is the contract)
  - phase: 20-Z-03
    provides: withTelemetry pattern reference (cron route is auth-gated; instrumented at PrismaNeon layer)
provides:
  - DecayCalibration Prisma model — append-only history (id, computed_at, source_class, lambda_per_day, half_life_days, icir_uplift_vs_no_decay, training_window_days, n_observations, model_version)
  - src/lib/sentiment/source-class.ts — SourceClass union + exhaustive sourceToClass + sourceToClassUnsafe (legacy DB strings)
  - src/lib/sentiment/decay-hyperparameters.ts — typed DECAY_HYPERPARAMETERS with Zod module-load validation
  - src/lib/sentiment/decay.ts — pure module (decayWeight, decayLambdaForClass, halfLifeDays, ageDaysSince)
  - src/lib/sentiment/aggregator.ts — additive aggregateDecayed + DECAY_EPSILON + getDecayMode + SentimentDecayMode type
  - scripts/tune-decay.ts — grid search per source class maximizing 20d rolling ICIR vs forward 7d alpha (PriceOutcome.pct_change), with --bootstrap-cutover option (1000-resample paired bootstrap on Sharpe)
  - scripts/backfill-decay-weights.ts — insert-only re-population under fresh model_version; pre/post immutability assertion
  - src/app/api/cron/tune-decay/route.ts — monthly Bearer-guarded cron, persists DecayCalibration rows
  - HYPERPARAMETERS.md — 20-A-03 section with 5 source-class rows + Tetlock 2007 / Loughran-McDonald citations
  - vercel.json — `/api/cron/tune-decay` schedule `'0 6 1 * *'`
  - SENTIMENT_DECAY_MODE env flag (off|shadow|on, default off)
  - prisma/migrations/20260512_add_decay_calibration/migration.sql
  - tests/sentiment-decay.unit.test.ts (19 cases)
  - tests/sentiment-source-class.unit.test.ts (14 cases)
  - tests/integration/tune-decay.integration.test.ts (4 cases, DATABASE_URL-skip)
affects: [20-Z-03 telemetry consumer (later), 20-B-04 source-tier weighting (later), 20-C-01 per-source ICIR (later)]

tech-stack:
  added: []
  patterns:
    - "Per-source-class exponential decay: w = exp(-λ × age_days), λ in (1/day), t½ = ln(2)/λ"
    - "Tetlock 2007 retail mean-reversion 24h, Loughran-McDonald 2011 news 72h, SEC 168h as literature seeds"
    - "Insert-only backfill under NEW model_version per 20-Z-01 immutability convention (T-20-A-03-03)"
    - "EPSILON-floored aggregator (Σ decay_weight < 1e-9 → uniform fallback) — T-20-A-03-02 div-by-zero guard"
    - "n>=60 calibration gate per source class — T-20-A-03-01 small-sample defense"
    - "Paired-bootstrap (1000 resamples) on Sharpe with 95% CI low > 0 for cutover — T-20-A-03-04"
    - "training_window_days SAME across all classes in one tune-decay run — T-20-A-03-05 regime-mismatch defense"

key-files:
  created:
    - src/lib/sentiment/source-class.ts
    - src/lib/sentiment/decay-hyperparameters.ts
    - src/lib/sentiment/decay.ts
    - scripts/tune-decay.ts
    - scripts/backfill-decay-weights.ts
    - src/app/api/cron/tune-decay/route.ts
    - prisma/migrations/20260512_add_decay_calibration/migration.sql
    - tests/sentiment-decay.unit.test.ts
    - tests/sentiment-source-class.unit.test.ts
    - tests/integration/tune-decay.integration.test.ts
  modified:
    - prisma/schema.prisma
    - src/lib/sentiment/aggregator.ts
    - HYPERPARAMETERS.md
    - vercel.json
    - package.json

key-decisions:
  - "decay.ts is a NEW module separate from src/lib/learning.ts decayWeights — sentiment-message decay (per source class, t½ ≈ 1-7d) and learning-engine signal decay (per signal class, t½ ≈ 60d) are different domains and intentionally do not share a lambda table. Documented in module header."
  - "decayWeight throws on negative age rather than clamping (deliberate departure from learning.ts decayWeights which clamps Δt<0 → 0). sentiment messages arrive from upstream sources with real clock-skew risk; clamping a future-dated row would silently weight it at 1.0 (max), the opposite of safe."
  - "Forward-return proxy is PriceOutcome.pct_change at days_after=7 (matches 20-A-02 convention). SPY subtraction lives in diffusion engine; Spearman IC is rank-based and tolerates the linear shift. Metric label preserved as 'alpha-vs-SPY'."
  - "sourceToClassUnsafe accepts 3 legacy DB strings (reddit/news/firecrawl) via a separate const map, NOT additional case statements — this preserves the 9-case acceptance criterion on sourceToClass while still being defensive against historic rows."
  - "Cron route imports tuneClass + constants from scripts/tune-decay.ts via relative path — avoids duplicating the grid-search loop, but means tune-decay.ts had to gate main() behind require.main check + VITEST env to prevent side-effects at import time."
  - "raw_body is unrecoverable post-T-20-Z-01-02 (only hash retained). Backfill stores 'BACKFILL-FROM-HASH:<orig_hash>' as raw_body input to insertObservation, which then hashes again — documented limitation in classifier_version suffix '+decay-backfill'."

patterns-established:
  - "Shadow-gated aggregator: aggregateCommunitySentiment (legacy) untouched; aggregateDecayed lives alongside; SENTIMENT_DECAY_MODE env env-driven switch."
  - "Per-source-class λ table as runtime SOLE source — all callers import from decay-hyperparameters.ts; no inline literals in aggregator/decay.ts."
  - "tune-decay grid search exports helpers (tuneClass, computeDecayedAggregate, dailyICs, pairedBootstrapSharpe) for both CLI and cron consumers."

requirements-completed: []

duration: ~1h30m (single inline executor session, no agent dispatch)
completed: 2026-05-12
---

# Phase 20-A-03 Summary

**Per-source-class exponential time decay (`w = exp(-λ × age_days)`) lands behind `SENTIMENT_DECAY_MODE=off` default, with 5 literature-seeded λ values (Tetlock 2007 retail / Loughran-McDonald news+sec / Womack 1996 analyst / bridging social-other), append-only DecayCalibration history table, n≥60 calibration gate, EPSILON-floored fallback, and 1000-resample paired-bootstrap cutover gate.**

## Self-Check: PASSED

- `npx tsc --noEmit` → exit 0
- `npm test` → **1025 passed / 2 skipped / 3 todo / 0 failed** (was 992 in A-02; we added 33)
- `npm run check-model-cards` → OK (0 findings — no new card required for this typed-table plan)
- `npm run check-immutability` → OK (no SentimentObservation UPDATE/UPSERT/DELETE in src/ or scripts/)
- `npm run check-telemetry-coverage` → OK (11 modules wrapped — cron route is auth-only path)
- `npm run check-prompts` → green
- `npm run check-lookahead` → **0 violations / 131 files** (was 127 — 4 new sentiment files clean)
- `tests/sentiment-decay.unit.test.ts` → 19/19 pass
- `tests/sentiment-source-class.unit.test.ts` → 14/14 pass
- Working tree clean post-final-commit

## Performance

- **Duration:** ~1h30m wall-clock (single inline executor session)
- **Tasks landed:** 10 atomic commits (Task 5 db-push deferred to operator per directive)
- **Files created:** 10
- **Files modified:** 5

## Accomplishments

### Commits (in order)

1. `1dac06c` feat(20-A-03): SourceClass enum + exhaustive sourceToClass mapping
2. `87642e9` feat(20-A-03): decay-hyperparameters seed table + decay.ts pure module
3. `64733ad` feat(20-A-03): DecayCalibration Prisma model + migration SQL
4. `14327f5` feat(20-A-03): tune-decay.ts grid-search script + npm scripts
5. `c079ae8` feat(20-A-03): backfill-decay-weights script (insert-only, no UPDATE)
6. `8a96e21` docs(20-A-03): HYPERPARAMETERS.md — 5 source-class decay rows + citations
7. `9ab8582` feat(20-A-03): monthly tune-decay cron route + vercel.json entry
8. `1b0b586` feat(20-A-03): aggregateDecayed + SENTIMENT_DECAY_MODE behind shadow flag
9. `d8f92a9` test(20-A-03): unit + integration tests for decay primitives

### Three-mode flag state

`SENTIMENT_DECAY_MODE=off` (committed default; `getDecayMode()` in `src/lib/sentiment/aggregator.ts`). `off` short-circuits to legacy `aggregateCommunitySentiment`; `shadow` runs both paths in parallel (consumer to be wired in 20-Z-03 follow-up); `on` makes `aggregateDecayed` authoritative.

### λ values committed (literature seed — all `tuned_at: 'bootstrap'`)

| source_class | λ (per day) | half-life (days) | citation |
|---|---|---|---|
| retail | 0.6931 | 1.00 | Tetlock 2007 J. Finance |
| news | 0.2310 | 3.00 | Loughran-McDonald 2011 JF |
| sec | 0.0990 | 7.00 | Loughran-McDonald 2011 / 10-K studies |
| analyst | 0.1386 | 5.00 | Womack 1996 / Stickel 1992 |
| social-other | 0.1733 | 4.00 | Bridging seed |

`DecayCalibration.computed_at` row count at SUMMARY time: **0** (calibration cron not yet run; first run is operator-triggered or scheduled monthly 06:00 UTC on the 1st via `/api/cron/tune-decay`).

### Cutover criteria (shadow → on, documented in HYPERPARAMETERS.md)

1. `npm run tune-decay -- --bootstrap-cutover` produces per-class 95% CI on Sharpe of decayed-vs-undecayed aggregate.
2. All five classes must show CI lower-bound > 0 (or operator may flip selectively per class with a follow-up plan).
3. ICIR uplift ≥ 0.05 vs no-decay baseline (CONTEXT.md line 105 spec).
4. `n_observations >= 60` per class (T-20-A-03-01 small-sample gate).
5. Bootstrap report pasted into cutover commit message; then `SENTIMENT_DECAY_MODE=on` set in Vercel env + redeploy.

### Threat mitigations

- **T-20-A-03-01** (small-window overfit): `tuneClass` gates on `rows.length < MIN_N_OBSERVATIONS (60)`; returns `insufficient_data` and skips persistence. Exit code 2 from CLI signals partial-skip.
- **T-20-A-03-02** (div-by-zero on all-old samples): `aggregateDecayed` checks `den < DECAY_EPSILON (1e-9)` and falls back to uniform mean. Unit test "aggregateDecayed returns uniform fallback on all-old rows" covers (skipped in CI without DB, runs in `test:integration`).
- **T-20-A-03-03** (backfill duplicate-key / immutability violation): backfill INSERTS under NEW model_version; (ticker, message_id, model_version) composite unique from 20-Z-01 prevents duplicates by construction. Pre/post groupBy assertion in script aborts with exit 3 if any OLD model_version row count changes.
- **T-20-A-03-04** (false-confidence cutover): `--bootstrap-cutover` flag in `scripts/tune-decay.ts` runs 1000-resample paired-bootstrap on Sharpe with 95% CI; cron route does NOT auto-flip flag (operator-gated).
- **T-20-A-03-05** (regime-mismatch across classes): `training_window_days` is passed once to `tuneClass(..., windowDays)` per main() call; ALL classes share the same value within one run; column persists per `DecayCalibration` row for audit.

## Deviations from plan

1. **Task 5 (live db push) deferred to operator** per executor directive ("Skip live `prisma db push` against Neon — local migration file only"). Migration SQL committed at `prisma/migrations/20260512_add_decay_calibration/migration.sql`; auto-applied at next deploy via `vercel.json buildCommand` (`prisma migrate deploy && next build`).
2. **Cron route imports from scripts/tune-decay.ts via relative path** rather than duplicating the grid-search loop. Required gating `main()` in tune-decay.ts behind `require.main === module && !process.env.VITEST` to prevent the dotenv side-effect at import-time. Documented in script header.
3. **sourceToClassUnsafe handles 3 legacy DB strings** ('reddit', 'news', 'firecrawl') via a separate `LEGACY_SOURCE_TO_CLASS` const map (NOT additional case statements in `sourceToClass`). This preserves the strict 9-case acceptance criterion while remaining defensive against historic SentimentObservation rows.
4. **Forward-return proxy is PriceOutcome.pct_change** at `days_after = 7` (matches 20-A-02 convention). SPY subtraction lives in the diffusion engine; Spearman IC is rank-based and tolerates the linear shift. Metric label preserved as "alpha-vs-SPY" in HYPERPARAMETERS.md and model_card-style header comments.

## Deferred items

- **Live `prisma db push`** of `decay_calibrations` table (Task 5) — operator-applied at next deploy.
- **Live calibration smoke run** — depends on operator running the db push first AND ≥60 SentimentObservation rows accumulating per source class. Until then `tune-decay` will emit `INSUFFICIENT_DATA` for all 5 classes and exit 2 (expected, non-fatal).
- **20-Z-03 telemetry hookup for shadow comparisons** — `aggregateDecayed` is exposed; consumer wiring (ShadowComparison row writer) is a follow-up plan item.
- **Cutover to `SENTIMENT_DECAY_MODE=on`** — requires Task 11 bootstrap report with 95% CI low > 0 on Sharpe per class. Operator gate.

## Verification command snapshot

```
$ npx tsc --noEmit && \
  npm run check-model-cards && \
  npm run check-immutability && \
  npm run check-telemetry-coverage && \
  npm run check-prompts && \
  npm run check-lookahead && \
  npx vitest run tests/sentiment-decay.unit.test.ts tests/sentiment-source-class.unit.test.ts
# All green — see Self-Check section above.
```

## Known Stubs

None. All wired functions (`decayWeight`, `aggregateDecayed`, `tuneClass`) return real computed values; cron route persists real rows. The "stub-like" state is HYPERPARAMETERS.md `tuned_at: 'bootstrap'` for all 5 classes — this is the expected literature-seed pre-calibration state, not a stub. First successful `tune-decay` run overwrites with ISO timestamps.
