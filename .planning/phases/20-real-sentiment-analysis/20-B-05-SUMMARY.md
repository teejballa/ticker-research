---
phase: 20
plan: 20-B-05
subsystem: sentiment-aggregation
tags: [per-aspect, chip-stack, cohen-kappa, beta-smoothing]
requires: [20-B-01]
provides: [per-aspect-aggregator, per-aspect-chip-stack, aspect-kappa-monitor]
affects: [src/components/ResearchReport.tsx, src/lib/research-brief.ts, src/lib/types.ts, vercel.json]
tech-stack-added: []
tech-stack-patterns: [feature-flag-shadow-default, beta-prior-smoothing, em-dash-empty-sentinel, monthly-monitor-cron]
key-files-created:
  - src/lib/sentiment/per-aspect-aggregate.ts
  - src/components/PerAspectChips.tsx
  - src/components/__tests__/PerAspectChips.test.tsx
  - scripts/eval-aspect-kappa.ts
  - tests/golden-tickers/_aspect_labels.json
  - src/app/api/cron/aspect-kappa-monitor/route.ts
  - docs/cards/MODEL-CARD-per-aspect-aggregate.md
  - docs/runbooks/aspect-label-curation.md
  - tests/integration/per-aspect-aggregate.integration.test.ts
  - tests/e2e/per-aspect-chips.spec.ts
key-files-modified:
  - src/components/ResearchReport.tsx
  - src/lib/types.ts
  - src/lib/gemini-analysis.ts
  - src/lib/data/source-package.ts
  - src/lib/research-brief.ts
  - src/lib/features.ts
  - HYPERPARAMETERS.md
  - vercel.json
decisions:
  - "Empty-aspect chips render em-dash '—', NEVER '0%' — '0%' would falsely communicate zero bullishness when truth is zero data"
  - "Beta prior α=β=5 inherited from post-Phase-19 aggregator (Cookson weak symmetric prior, 10 pseudo-observations)"
  - "N_DOCS_MIN=3 — sentinel cut for insufficient signal"
  - "Cron MEASURES κ, NEVER enforces — ship gate lives in HYPERPARAMETERS.md (S1 single-source-of-truth)"
  - "Inter-aspect overlap intentional — multi-aspect docs contribute to BOTH aggregates (CONTEXT.md line 113)"
metrics:
  duration: ~45min
  completed: 2026-05-13
  tasks-completed: 10
  files-created: 10
  files-modified: 8
---

# Phase 20 Plan B-05: Per-Aspect Chip Stack Summary

Per-aspect Beta-smoothed bull% chip stack on the Sentiment Snapshot card — replaces the single global bull% chip with a 7-element per-aspect decomposition (earnings, guidance, regulatory, M&A, macro, product, management) so the reader can see *which dimension* drives the aggregate signal.

## What Shipped

1. **Pure-functions aggregator** — `src/lib/sentiment/per-aspect-aggregate.ts` exports `aggregateByAspect(perDocResults)` over the fixed 7-element `ASPECT_TAXONOMY`. Beta-smoothed (α=β=5) weighted-mean bull% per aspect; `N_DOCS_MIN=3` insufficient-signal cut emits `bull_pct: null` for the UI to render '—'. (Commit `0d4037a`)
2. **Feature flag** — `FEATURE_PER_ASPECT_AGGREGATE` registered in `src/lib/features.ts` with `'shadow'` default + explicit `FEATURE_PER_ASPECT_AGGREGATE` re-export. (Commit `8e8bb23`)
3. **Pipeline wire** — `runGeminiAnalysis` reads `_per_aspect_sentiment` sidecar from SourcePackage and post-process-writes `AnalysisResult.per_aspect_sentiment`; source-package.ts computes the sidecar via `aggregateByAspect(perDocResults)` after the 20-B-01 classifier finishes. (Commits `40be6cf`)
4. **Research-brief prompt** — `renderPerAspectBlock` helper inserted into the research brief so Gemini sees the per-aspect breakdown when generating the report. (Commit `64e5a50`)
5. **UI component + RTL test** — `PerAspectChips.tsx` renders 7 chips with `flex flex-wrap` for mobile, `data-bullpct=null` sentinel attribute, and `'—'` literal for empty aspects. 8 RTL contract tests across AAPL/GME/SPY/TSM golden tickers lock the contract; `queryByText('0%')` MUST return null. (Commit `d8f244c`)
6. **ResearchReport integration** — gated behind `process.env.NEXT_PUBLIC_FEATURE_PER_ASPECT_AGGREGATE === 'on'`; renders `<PerAspectChips entries={analysisResult.per_aspect_sentiment} />` inside the Sentiment Snapshot card right after the bull/bear/P-C chip stack. (Commit `7441cbe`)
7. **κ eval harness** — `scripts/eval-aspect-kappa.ts` computes Cohen's κ between Gemini aspect tags and human-labeled fixture; per-aspect + macro-averaged. MEASURES, NEVER asserts a threshold (S1). 10-doc starter fixture at `tests/golden-tickers/_aspect_labels.json` covers all 7 aspects + multi-aspect rows + off-topic guard. (Commit `dd2a982`)
8. **Monthly monitor cron** — `/api/cron/aspect-kappa-monitor` on `0 8 1 * *` (1st of month, 08:00 UTC). CRON_SECRET Bearer auth, calls `classifyDocumentsBatch` over the fixture, returns per-aspect + macro κ + writes `/tmp/aspect-kappa-<date>.json` for history. Added to `vercel.json` crons array. (Commit `3fdd85d`)
9. **Model card + runbook + HYPERPARAMETERS** — Mitchell-2019 frontmatter card with κ ≥ 0.6 ship gate; runbook for growing the fixture to ≥50 docs; HYPERPARAMETERS.md per_aspect_aggregate section pinning α=β=5, N_DOCS_MIN=3, and cutover criteria (κ ≥ 0.6 across 2 consecutive monthly runs). (Commit `1de4193`)
10. **Integration test + Playwright spec** — `tests/integration/per-aspect-aggregate.integration.test.ts` validates the end-to-end contract (taxonomy order, sentinel, inter-aspect overlap, prior dominance, confidence-mean isolation, [0,100] clamp) — skipped without DATABASE_URL. `tests/e2e/per-aspect-chips.spec.ts` is dev-server-gated; asserts 7-chip render with no '0%' literal. (Commit `30a1247`)

## Commits (this plan)

| Commit  | Type | Description                                                     |
| ------- | ---- | --------------------------------------------------------------- |
| `0d4037a` | feat | per-aspect-aggregate pure-functions + Beta smoothing            |
| `8e8bb23` | feat | FEATURE_PER_ASPECT_AGGREGATE flag + AnalysisResult schema       |
| `40be6cf` | feat | wire per_doc_sentiment → aggregateByAspect → AnalysisResult      |
| `64e5a50` | feat | renderPerAspectBlock helper + research-brief integration         |
| `d8f244c` | feat | PerAspectChips component + 8-test RTL contract                  |
| `7441cbe` | feat | wire PerAspectChips into ResearchReport Sentiment card           |
| `dd2a982` | feat | aspect-kappa eval harness + 10-doc starter fixture               |
| `3fdd85d` | feat | aspect-kappa-monitor monthly cron + vercel.json wiring           |
| `1de4193` | docs | model card + runbook + HYPERPARAMETERS entry                     |
| `30a1247` | test | integration + Playwright e2e specs                               |

## Deviations from Plan

None of substance — plan executed exactly as written. Minor adjustments:

- **Prop name normalization:** plan prompt referenced `<PerAspectChips aspects={...} />` but the existing component (already authored before resume) exports `entries: PerAspectSentimentEntry[]`. Used the existing prop name for consistency with the test file's contract. No behavior change.
- **Starter fixture size:** plan called for "50-doc fixture (or smaller seed; expand later)" — shipped 10 seed docs covering all 7 aspects + off-topic guard. Expansion path documented in `docs/runbooks/aspect-label-curation.md`. The cron will run against the 10-doc fixture until expansion; this is the documented seed branch.

## End-of-Plan Gates

| Gate                       | Result      |
| -------------------------- | ----------- |
| `tsc --noEmit`             | 0 errors    |
| `npm test`                 | 1325 pass / 2 skip / 3 todo across 132 files |
| `check-model-cards`        | OK (0 findings) |
| `check-immutability`       | OK          |
| `check-telemetry-coverage` | OK (all 11 modules wrap withTelemetry) |
| `check-prompts`            | green       |
| `check-lookahead`          | 0 violations across 174 files |

## Ship Gate (κ ≥ 0.6)

Cutover from `FEATURE_PER_ASPECT_AGGREGATE='shadow'` → `='on'` is gated on the monthly `/api/cron/aspect-kappa-monitor` reporting **macro-averaged κ ≥ 0.6 across 2 consecutive monthly runs**. The fixture must be expanded to ≥50 docs before the first formal ship-gate evaluation — see `docs/runbooks/aspect-label-curation.md`. The cron measures; the operator flips the flag.

## Threat Flags

None — this plan introduces no new network endpoints (the new cron is CRON_SECRET-gated like all other `/api/cron/*` routes), no new file-system access patterns (the `/tmp` write is wrapped in try/catch and is best-effort), and no schema changes at trust boundaries. The aspect taxonomy is a re-export from `src/lib/sentiment/aspects.ts` (20-B-01 single source of truth).

## Self-Check: PASSED

- **Files created (10/10):** all present (verified by git status)
  - `src/lib/sentiment/per-aspect-aggregate.ts` — FOUND
  - `src/components/PerAspectChips.tsx` — FOUND
  - `src/components/__tests__/PerAspectChips.test.tsx` — FOUND
  - `scripts/eval-aspect-kappa.ts` — FOUND
  - `tests/golden-tickers/_aspect_labels.json` — FOUND
  - `src/app/api/cron/aspect-kappa-monitor/route.ts` — FOUND
  - `docs/cards/MODEL-CARD-per-aspect-aggregate.md` — FOUND
  - `docs/runbooks/aspect-label-curation.md` — FOUND
  - `tests/integration/per-aspect-aggregate.integration.test.ts` — FOUND
  - `tests/e2e/per-aspect-chips.spec.ts` — FOUND
- **Commits (10/10):** all `git log` confirmed
  - `0d4037a`, `8e8bb23`, `40be6cf`, `64e5a50`, `d8f244c`, `7441cbe`, `dd2a982`, `3fdd85d`, `1de4193`, `30a1247`
- **Gates:** 7/7 green (tsc, npm test, check-model-cards, check-immutability, check-telemetry-coverage, check-prompts, check-lookahead)
