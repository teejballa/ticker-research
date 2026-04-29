---
status: partial
phase: 16-technical-analysis
source: [16-VERIFICATION.md]
started: 2026-04-28T22:00:00-07:00
updated: 2026-04-28T22:00:00-07:00
---

## Current Test

[awaiting human testing]

## Tests

### 1. AC3 operational backfill
expected: Run `npx tsx scripts/backfill-technical.ts --dry-run` to preview, then `npx tsx scripts/backfill-technical.ts` to populate `technical_data` on every existing SentimentSnapshot row whose ticker has ≥200 daily bars (~33 min wall-clock against live Neon at 1s throttle). After backfill, `npx tsx scripts/check-active-cell-coverage.ts` should exit 0 with ≥25% ACTIVE in the most-traded `cap_class × horizon_days=7` row.
result: [pending]

### 2. Visual confirmation of EngineCalibrationPanel
expected: Open a research report against a ticker that has dual-class data (post-backfill). Confirm the panel renders DIFFUSION × TECHNICAL columns side-by-side, agreement badge in header, 6-row horizon table with `30d★` highlighted as primary, and a TechnicalSignalsCard above it showing RSI gauge, MACD direction, MA stack, and volume ratio. Then load an old persisted report (no `horizon_calibrations`) and confirm graceful fallback to the legacy diffusion-only single-column layout with no crash.
result: [pending]

### 3. Visual confirmation of /insights 4-tab UI
expected: Visit `/insights` and confirm 4 tabs render: Diffusion Library, Live Diffusion Map, Technical Pattern Library, Horizon Brier. Click into Technical Pattern Library and confirm the 8×4 grid (8 TechPatterns × 4 cap classes) shows the horizon selector defaulting to `30d★`. Click Horizon Brier and confirm the line chart renders Brier scores per horizon for each ACTIVE pattern (or the empty-state message if no patterns are ACTIVE yet).
result: [pending]

### 4. Production cron Pitfall-5 reinit log
expected: After deploying to Vercel, the first `/api/cron/learn` invocation should log `[learn] First post-Phase-16 cycle: reinitializing logistic to 12-d zero state.` exactly once, then never again. Verify in Vercel function logs.
result: [pending]

### 5. Pre-existing broken tests/integration/engine-affects-reports.test.ts
expected: This test references the dropped `LearnedPattern.flow_pattern` column and has 3 typecheck errors. Decide whether to (a) delete the file as obsolete, (b) rewrite it to use the new dual-class composite key, or (c) leave it as logged debt. Plan 16-04 SUMMARY did not address it.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
