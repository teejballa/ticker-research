---
phase: 20
plan: 20-C-04
subsystem: sentiment-pump-dump-detector
tags: [pump-dump, nam-yang-2023, manipulation-detection, surveillance, banner, shadow-lifecycle]
status: shipped (computation flag default off; UI flag default off — operator-driven cutover)
completed_at: 2026-05-13
dependency_graph:
  requires:
    - 20-A-02  # mention_z cap-class-aware baseline
    - 20-A-04  # author concentration gini
    - 20-Z-01  # SentimentObservation feature store + author_features_snapshot
    - 20-C-03  # cresci bot filter (upstream noise reduction)
  provides:
    - ManipulationWarning Prisma model (append-only, PIT-INVARIANT, 2 composite indexes)
    - pump-dump-detector pure-math module (5-condition AND-gate, RULE_VERSION pdd-v1.0)
    - computeManipulationWarning aggregator IO wrapper
    - Pump-and-dump warning banner (top of ResearchReport, dismissable 24h via localStorage)
    - 24h-TTL dismissal helper (isDismissed/dismissBanner — SSR-safe)
    - /api/cron/eval-pump-dump-synthetic (Tuesdays 09:00 UTC)
    - FEATURE_PUMP_DUMP_DETECTOR computation flag
    - NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI banner flag
    - scripts/eval-pump-dump-synthetic.ts (F1/sensitivity/specificity synthetic eval)
  affects:
    - /research/[ticker] (banner mounts above NavBar when flag=on AND is_warning=true)
    - 20-Z-03 (telemetry — null-input counters per condition; FP review)
    - 20-Z-07 (PIT lookahead-bias regression — reads computed_at on new table)
tech_stack:
  added: [nam-yang-2023-baseline, 5-condition-AND-predicate, RULE_VERSION-attribution, mitchell-2019-model-card]
  patterns: [shadow-lifecycle, PIT-INVARIANT, immutable-table, null-input-never-default-on-fire, dismissable-banner-24h-TTL]
key_files:
  created:
    - src/lib/sentiment/pump-dump-detector.ts
    - src/components/manipulation-banner-dismiss.ts
    - src/app/api/cron/eval-pump-dump-synthetic/route.ts
    - scripts/eval-pump-dump-synthetic.ts
    - tests/sentiment-pump-dump-detector.unit.test.ts
    - tests/playwright/research-manipulation-banner.spec.ts
    - tests/integration/sentiment-pump-dump.integration.test.ts
    - docs/cards/MODEL-CARD-pump-dump-detector.md
  modified:
    - prisma/schema.prisma (additive — ManipulationWarning model + 2 composite indexes)
    - src/lib/features.ts (pump_dump_detector + pump_dump_detector_ui flags)
    - src/lib/sentiment/aggregator.ts (computeManipulationWarning + ManipulationWarningBlock export)
    - src/lib/types.ts (sentiment_intelligence.manipulation_warning shape)
    - src/components/ResearchReport.tsx (banner mount + dismissal handler)
    - HYPERPARAMETERS.md (pump_dump_detector section, 5 literal thresholds + RULE_VERSION + citations)
    - vercel.json (eval-pump-dump-synthetic cron Tuesdays 09:00 UTC)
    - playwright.config.ts (testDir './tests' + testMatch covers e2e/ + playwright/)
decisions:
  - "5-condition AND-gate is strict-greater (>) on mention_z, bull_pct, gini; strict-less (<) on account_age — exact Nam/Yang 2023 §4 thresholds, not Cipher-derived"
  - "Null inputs (mention_z / gini / mean_account_age_days) return false from isPumpAndDumpPattern — insufficient-data is NEVER a default-on fire (T-20-C-04-04)"
  - "matched_rules populated INDEPENDENT of the AND-gate verdict — enables per-rule FP-rate telemetry during the 30d shadow gate"
  - "RULE_VERSION ('pdd-v1.0') persisted per ManipulationWarning row so historical fires remain attributable when thresholds bump"
  - "INSERT-only DB writes EVERY invocation (not just fires) — operator FP/TN review during 30d shadow gate; out-of-scope cap_class early-exits with NO write"
  - "Cap_class set is {small_cap} only — Cipher's CapClass enum maps Nam/Yang {micro, small} to small_cap per classifyCapClass (cited in detector header)"
  - "Banner copy is FIXED + Playwright-asserted to contain ZERO forbidden substrings (buy/sell/advise/recommend/should) — regulatory hygiene per T-20-C-04-01"
  - "Dismissal is per-(ticker, UTC-day) with 24h TTL via localStorage — no server-side tracking; SSR-safe (helper returns false on no-window)"
  - "Playwright spec lives at tests/playwright/ per plan path; playwright.config.ts widened to discover both tests/e2e/ and tests/playwright/"
  - "Synthetic eval cron mirrors CLI exit-code logic: status='regression' when F1<0.6 OR specificity<0.95"
metrics:
  duration_minutes: 18
  tasks_completed: 9
  files_created: 8
  files_modified: 8
  commits: 9
---

# Phase 20 Plan C-04: Pump-and-Dump Cluster Detector (Nam/Yang 2023 baseline) — Summary

**One-liner:** Pure-math 5-condition AND-gate over (mention_z>5, bull_pct>95, gini>0.7, mean_account_age_days<90, cap_class∈{small_cap}) — Nam/Yang 2023 thresholds verbatim — persists every invocation to the append-only `ManipulationWarning` table (PIT-INVARIANT via `computed_at`), surfaces a dismissable non-advisory banner at the top of the research report (24h-TTL localStorage), and runs a weekly synthetic-eval cron that regresses on F1≥0.6 AND specificity≥0.95.

## What shipped

### Detector core
- **`src/lib/sentiment/pump-dump-detector.ts`** — pure-math module. Exports:
  - `PUMP_DUMP_THRESHOLDS` (5 literal Nam/Yang 2023 thresholds).
  - `RULE_VERSION = 'pdd-v1.0'` (bumps on every threshold edit so historical rows remain attributable).
  - `isPumpAndDumpPattern(features, thresholds?)` — boolean AND-gate; returns false when ANY of `mention_z` / `gini` / `mean_account_age_days` is null.
  - `detectManipulation(features, thresholds?)` — returns `{ is_warning, matched_rules, rule_version }`. `matched_rules` is the lex-sorted subset of fired sub-conditions, populated independently of the AND-gate so per-rule telemetry survives during shadow gate.
- 17 unit tests in `tests/sentiment-pump-dump-detector.unit.test.ts` cover all 32 AND-gate truth-table combinations + null-input handling + `matched_rules` lex sort + RULE_VERSION constancy.

### Persistence + aggregator IO
- **Prisma `ManipulationWarning`** (new) — append-only PIT-INVARIANT row per invocation: `id`, `ticker`, `computed_at`, `mention_z`, `bull_pct`, `gini`, `mean_account_age_days`, `cap_class`, `is_warning_fired`, `matched_rules`, `rule_version`. Two composite indexes: `(ticker, computed_at DESC)` and `(is_warning_fired, computed_at DESC)`.
- **`computeManipulationWarning`** in `src/lib/sentiment/aggregator.ts`:
  - Returns null when `FEATURES.pump_dump_detector_mode === 'off'`.
  - Out-of-scope cap_class (large/mid/unknown) → returns non-firing block with **NO DB write** (small-cap-only scope per Nam/Yang).
  - In-scope cap_class → reads `mean_account_age_days` from `SentimentObservation.author_features_snapshot.account_age_days` over the rolling 24h window (PIT-safe via `fetched_at` — never `published_at`, enforced by 20-Z-07).
  - Persists telemetry row on **every** invocation (not just fires) so operator FP/TN review is possible during the 30d shadow gate.

### UI banner
- Banner mounts at the **top** of `ResearchReport` (above `NavBar`) so the non-advisory warning surfaces before any sentiment-bearing content.
- Gated by `NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI === 'on'` AND `manipulation_warning.is_warning === true` AND `!isDismissed(ticker)`.
- `role="alert"` + `aria-live="polite"` for screen-reader announcement without focus-stealing.
- Fixed copy: **"Possible market manipulation pattern detected (Nam/Yang 2023). This warning does NOT constitute investment advice."** plus a Methodology link to `/docs/model-cards/pump-dump-detector`.
- X-button dismissal writes `pump_dump_dismissed:{TICKER}:{YYYY-MM-DD}` to `localStorage` with `Date.now()` payload; reload respects the 24h TTL.
- Playwright spec (`tests/playwright/research-manipulation-banner.spec.ts`) asserts: visibility + role/aria + exact copy + zero forbidden substrings (buy/sell/advise/recommend/should) + dismissal-persists-across-reload + is_warning=false → count=0.

### Cron + synthetic eval
- **`/api/cron/eval-pump-dump-synthetic`** route (`vercel.json` schedule `'0 9 * * 2'` — Tuesdays 09:00 UTC, staggered against 20-A-04 Monday + 20-A-02 nightly).
- `CRON_SECRET` Bearer-auth (skipped when unset for local dev); `maxDuration: 120s` defensive against cold-start jitter.
- Response shape: `{ f1, sensitivity, specificity, rule_version, ms_elapsed, status }`. `status === 'regression'` when `F1 < 0.6` OR `specificity < 0.95` (mirrors `scripts/eval-pump-dump-synthetic.ts` CLI exit-code logic).
- 500-per-class balanced synthetic eval via seeded RNG completes in <100ms warm.

### Hyperparameters + model card
- `HYPERPARAMETERS.md` — new `pump_dump_detector` section: 5 thresholds + `RULE_VERSION` attribution policy + cron schedule + cutover criteria + Nam/Yang 2023 citation.
- `docs/cards/MODEL-CARD-pump-dump-detector.md` — full Mitchell 2019 §1-8 stub: model details, intended use (surveillance, NOT trading), calibration data (Nam/Yang baseline F1=0.67, sens=85%, spec=99% + Cipher synthetic F1≥0.6/spec≥0.95 gate), known failure modes (insufficient data, non-small-cap scope, legitimate rally misflag risk, brand-new ticker), ethical considerations (no PII, dismissability, no enforcement coupling, immutable persistence), retrain cadence (P90D), references.
- `@model-card:` annotation in `src/lib/sentiment/pump-dump-detector.ts` points at the model card.
- `npm run check-model-cards` → 0 findings.

### Integration test
- `tests/integration/sentiment-pump-dump.integration.test.ts` (skipped when `DATABASE_URL` absent — bot-filter pattern). 4 cases:
  1. Out-of-scope `large_cap` returns non-firing block AND writes ZERO rows.
  2. All-firing inputs (small_cap + mention_z=10 + bull_pct=99 + gini=0.9 + author_age=30) → 1 row with `is_warning_fired=true`, 5 matched rules, `rule_version='pdd-v1.0'`.
  3. Non-firing inputs still write a telemetry row (shadow-gate FP review).
  4. `mean_account_age_days` derived from rolling 24h window ONLY — 48h-old `SentimentObservation` rows are excluded (PIT-safe).

## Gates

All end-of-plan gates green at HEAD:

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npm run check-model-cards` | OK (0 findings) |
| `npm run check-immutability` | OK (no UPDATE/UPSERT/DELETE on SentimentObservation) |
| `npm run check-telemetry-coverage` | OK (11/11 external-call modules wrap with withTelemetry()) |
| `npm run check-prompts` | green (no `_v*/` prompt deltas this plan) |
| `npm run check-lookahead` | 0 violations across 183 files |
| `npm test` | 1377 pass / **4 pre-existing failures** (see Deferred Issues) |

## Deferred Issues

- **4 vitest failures in `tests/unit/anthropic-search-branching.test.ts` and `src/lib/data/source-package.test.ts` are pre-existing**, NOT introduced by 20-C-04. Each fails with `DATABASE_URL environment variable is required but not set` originating from `src/lib/sentiment/aggregator.ts:701` (the existing top-level `import { prisma } from '@/lib/db'` chain). Reproduces identically with my changes stashed. Out-of-scope per the executor scope-boundary rule — logged here for a future plan that decouples the aggregator module-load from a live DB connection (likely a lazy-prisma refactor mirroring `getPrisma()` in the integration tests).

## Auto-fixed deviations

None. Plan executed exactly as written. The only deviation worth noting: the plan path `tests/playwright/` did not exist in the repo; per the plan's explicit `tests/playwright/research-manipulation-banner.spec.ts` directive (lines 19, 79, 1048, 1156), I created that directory and widened `playwright.config.ts` `testDir` from `./tests/e2e` to `./tests` with `testMatch: ['e2e/**/*.spec.ts', 'playwright/**/*.spec.ts']` so both directories are discovered. Existing `tests/e2e/*.spec.ts` files remain discoverable unchanged.

## Commits (this plan)

| # | Hash | Message |
|---|------|---------|
| 1 | `76a9966` | feat(20-C-04): pump-dump-detector pure-math module + synthetic eval harness + 17 unit tests |
| 2 | `632f4f3` | feat(20-C-04): ManipulationWarning Prisma model + pump_dump_detector flags |
| 3 | `18eb257` | feat(20-C-04): computeManipulationWarning aggregator + SentimentIntelligenceSection.manipulation_warning |
| 4 | `7df5de9` | feat(20-C-04): ManipulationWarning banner at top of ResearchReport + dismissal helper |
| 5 | `d93cb82` | feat(20-C-04): synthetic-eval cron + vercel.json schedule |
| 6 | `ee28afc` | docs(20-C-04): add pump_dump_detector hyperparameters section |
| 7 | `2c21cf7` | docs(20-C-04): Mitchell-2019 model card for pump-dump-detector |
| 8 | `6c21bd9` | test(20-C-04): Playwright spec for ManipulationWarning banner |
| 9 | `0ab0c0c` | test(20-C-04): integration test for ManipulationWarning persistence |

## Self-Check: PASSED

- `src/lib/sentiment/pump-dump-detector.ts` — FOUND
- `src/components/manipulation-banner-dismiss.ts` — FOUND
- `src/app/api/cron/eval-pump-dump-synthetic/route.ts` — FOUND
- `scripts/eval-pump-dump-synthetic.ts` — FOUND
- `docs/cards/MODEL-CARD-pump-dump-detector.md` — FOUND
- `tests/playwright/research-manipulation-banner.spec.ts` — FOUND
- `tests/integration/sentiment-pump-dump.integration.test.ts` — FOUND
- `tests/sentiment-pump-dump-detector.unit.test.ts` — FOUND
- All 9 commit hashes — FOUND in `git log --oneline`
- All 6 end-of-plan gates — GREEN (tsc, check-model-cards, check-immutability, check-telemetry-coverage, check-prompts, check-lookahead)
- `npm test`: 1377 pass / 4 pre-existing failures documented under Deferred Issues
