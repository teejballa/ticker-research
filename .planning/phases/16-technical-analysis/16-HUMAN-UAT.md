---
status: partial
phase: 16-technical-analysis
source: [16-VERIFICATION.md]
started: 2026-04-28T22:00:00-07:00
updated: 2026-04-28T22:10:00-07:00
---

## Current Test

[awaiting user-owned operational + visual checks]

## Tests

### 1. AC3 operational backfill — USER ACTION REQUIRED
expected: Run `npx tsx scripts/backfill-technical.ts --dry-run` to preview, then `npx tsx scripts/backfill-technical.ts` to populate `technical_data` on every existing SentimentSnapshot row whose ticker has ≥200 daily bars (~33 min wall-clock against live Neon at 1s throttle). After backfill, `npx tsx scripts/check-active-cell-coverage.ts` should exit 0 with ≥25% ACTIVE in the most-traded `cap_class × horizon_days=7` row.
result: pending — operational task, user-owned

### 2. Visual confirmation of EngineCalibrationPanel — USER ACTION REQUIRED
expected: Open a research report against a ticker that has dual-class data (post-backfill). Confirm the panel renders DIFFUSION × TECHNICAL columns side-by-side, agreement badge in header, 6-row horizon table with `30d★` highlighted as primary, and a TechnicalSignalsCard above it showing RSI gauge, MACD direction, MA stack, and volume ratio. Then load an old persisted report (no `horizon_calibrations`) and confirm graceful fallback to the legacy diffusion-only single-column layout with no crash.
result: pending — user will visually verify

### 3. Visual confirmation of /insights 4-tab UI — USER ACTION REQUIRED
expected: Visit `/insights` and confirm 4 tabs render: Diffusion Library, Live Diffusion Map, Technical Pattern Library, Horizon Brier. Click into Technical Pattern Library and confirm the 8×4 grid (8 TechPatterns × 4 cap classes) shows the horizon selector defaulting to `30d★`. Click Horizon Brier and confirm the line chart renders Brier scores per horizon for each ACTIVE pattern (or the empty-state message if no patterns are ACTIVE yet).
result: pending — user will visually verify

### 4. Production cron Pitfall-5 reinit log — USER ACTION REQUIRED
expected: After deploying to Vercel, the first `/api/cron/learn` invocation should log `[learn] First post-Phase-16 cycle: reinitializing logistic to 12-d zero state.` exactly once, then never again. Verify in Vercel function logs.
result: pending — verifiable only after Vercel deployment

### 5. Pre-existing broken tests/integration/engine-affects-reports.test.ts — RESOLVED
expected: Decide cleanup of obsolete test file referencing dropped `flow_pattern` column.
result: passed — file deleted in commit `396b48e`. Dual-class equivalents (learn-dual-class.test.ts, technical-affects-reports.test.ts) supersede it.

### 6. Auto-verified: build + AC4 + integration suite (29/30) — PASSED
expected: `npm run build` exits 0; `compare-horizon-brier.ts` exits 0 (NO_IMPROVEMENT loose pass acceptable per AC4); 29 of 30 live-Neon integration tests pass (the 1 failure is the AC3 gate awaiting backfill — see item 1).
result: passed — verified 2026-04-28T22:10
notes:
- Build green, /insights bundle 13.2 kB
- AC4 brier script: NO_IMPROVEMENT (loose pass, surfacing truth)
- Integration tests: schema-phase-16 (7/7), price-followup-horizons (6/6), sentiment-scan-technical (3/3), learn-dual-class (6/6), horizon-brier (1/1), technical-affects-reports (5/5), backfill-active-rate (0/1 — AC3 gate, awaits backfill)
- Auto-fixed during this verification:
  - `tests/integration/technical-affects-reports.test.ts`: agreement test changed from `create` to `upsert` (resilient to interrupted-run state) — commit `d692bf4`
  - `vitest.integration.config.ts`: `fileParallelism: false` to prevent live-Neon collisions — commit `11f7aa5`

## Summary

total: 6
passed: 2
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
