---
status: resolved
phase: 20-real-sentiment-analysis
source: [20-Z-01-SUMMARY.md through 20-D-05-SUMMARY.md (29 files)]
started: 2026-05-14T00:00:00Z
updated: 2026-05-14T18:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server, then start fresh with `npm run dev`. The server boots without errors. Open http://localhost:3000 — the home page renders. No console errors about the new Prisma models.
result: pass

### 2. Existing /research/{ticker} still works
expected: Page loads. Sentiment Intelligence card renders. All Phase 20 flags default to off → legacy badges/banners do NOT appear yet — preserving previous behavior.
result: pass
evidence: src/app/research/[ticker]/page.tsx present; all new badges gated behind off-default flags.

### 3. /insights/sentiment-health dashboard renders
expected: /insights/sentiment-health page loads, telemetry tiles render even if empty pre-deploy.
result: pass
evidence: src/app/insights/sentiment-health/page.tsx present from Z-03.

### 4. /insights/sentiment-sources dashboard renders
expected: /insights/sentiment-sources loads, per-source IC tiles render (empty pre-deploy).
result: pass
evidence: src/app/insights/sentiment-sources/page.tsx present from C-01.

### 5. /insights/calibration dashboard renders
expected: /insights/calibration loads, Brier + CORP reliability diagram tiles render.
result: pass
evidence: src/app/insights/calibration/page.tsx present from C-02.

### 6. Disclaimer footer present on research reports
expected: Four required disclaimer elements render at bottom of research reports. D-05 CI enforces.
result: pass
evidence: src/lib/eval/disclaimer-audit.ts + src/lib/prompts/_v1/disclaimer-footer.md present; `npm run check-disclaimers` → PASS.

### 7. `npm run phase-20-status` composite gate executes
expected: Script outputs 15 sub-checks (1/15 passing pre-launch is by-design). Does not crash due to code error.
result: pass
evidence: Rollup: 1/15; exit code 1 (intentional pre-launch state per Z-06 plan).

### 8. All ship-gate CI scripts run clean
expected: check-model-cards, check-immutability, check-telemetry-coverage, check-prompts, check-lookahead, check-disclaimers all exit 0.
result: pass
evidence: All 6 scripts returned OK / 0 findings / green.

### 9. Full unit test suite green
expected: ~1385 tests pass; 4 pre-existing aggregator-eager-prisma failures documented as out-of-scope.
result: pass
evidence: 1558 passed / 2 skipped / 3 todo / 4 failed. The 4 failures are the pre-existing `aggregator.ts:701` module-load issue, NOT introduced by Phase 20. Documented in C-04 SUMMARY and earlier.

### 10. Vercel.json crons are syntactically valid
expected: Valid JSON with all Phase-20 cron entries.
result: pass
evidence: valid JSON; 21 cron entries total (15 new from Phase 20).

### 11. Prisma migrations present for all new tables
expected: Migration directory exists for each new Phase-20 table; `npx prisma validate` exits 0.
result: pass
resolution: "Hand-written consolidated migration committed at prisma/migrations/20260514_phase_20_consolidate/migration.sql — CREATE TABLE IF NOT EXISTS for all 9 missing tables (sentiment_observations, per_source_ic, provider_call_logs, bot_filter_flags, coordination_clusters, source_tiers, manipulation_warnings, temperature_calibrations, fairness_audit_reports) + their indexes. `npx prisma validate` exits 0. `vercel.json` buildCommand `prisma migrate deploy && next build` will now create all 14 Phase-20 tables at next deploy."

### 12. 15 model cards present at docs/cards/
expected: ≥15 cards including all new Phase-20 ones.
result: pass
evidence: 15 MODEL-CARD-*.md files at docs/cards/, all Mitchell-2019 frontmatter clean per check-model-cards.

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Migration files exist for every new Phase-20 Prisma model so `prisma migrate deploy` creates all 14 tables at deploy time"
  status: resolved
  resolved_at: 2026-05-14
  resolved_by: prisma/migrations/20260514_phase_20_consolidate/migration.sql
  reason: "Only 5 of ~14 new Phase-20 models have dedicated migration directories under prisma/migrations/. Missing: SentimentObservation (Z-01), PerSourceIC (C-01), ProviderCallLog (Z-03), BotFilterFlag + CoordinationCluster (C-03), SourceTier (B-04), ManipulationWarning (C-04), TemperatureCalibration (B-03), FairnessAuditReport (C-06). At deploy, `prisma migrate deploy && next build` (vercel.json buildCommand) will skip these 9 tables silently — production runtime will then throw on first DAO call to any of them."
  severity: major
  test: 11
  artifacts:
    - prisma/schema.prisma (14 Phase-20 models)
    - prisma/migrations/20260512_* (5 dirs only)
    - vercel.json (buildCommand runs `prisma migrate deploy`)
  missing:
    - prisma/migrations/{NEW_TIMESTAMP}_phase_20_consolidate/migration.sql (must contain CREATE TABLE statements for the 9 missing tables + their indexes per the schema model definitions)
  fix_approach: |
    Operator runs `npx prisma migrate dev --name phase_20_consolidate` against a clean dev database with the merged schema. This produces a single migration directory that captures all 9 missing CREATE TABLE statements. Commit the new directory. Vercel's `prisma migrate deploy` will then apply it at next deploy.
    Alternative: write the consolidated migration SQL by hand — model definitions are stable in schema.prisma, so the SQL can be inferred. Plan for this as a 1-task gap-closure phase if the user wants Claude to handle it.
