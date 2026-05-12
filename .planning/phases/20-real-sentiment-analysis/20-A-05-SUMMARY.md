---
phase: 20-real-sentiment-analysis
plan: 20-A-05
subsystem: sentiment
tags: [agreement, cookson-engelberg, mixed-low-agreement, pattern-key, shadow-flag]

requires:
  - phase: 20-Z-01
    provides: SentimentObservation feature store (consumed indirectly via the multi-source aggregator)
provides:
  - agreement_score scalar in [0,1] surfaced on AggregatedSentiment
  - MIXED · LOW AGREEMENT amber badge in ResearchReport (UI flag-gated)
  - LearnedPattern.pattern_key extended with agreement_bucket ∈ {'mixed','aligned','na'} suffix
  - AgreementCalibration Prisma table — monthly grid-searched threshold
  - calibrate-agreement-threshold.ts script (null-result + 6-month re-evaluation gate)
  - Monthly /api/cron/agreement-calibration route
  - docs/cards/MODEL-CARD-agreement.md (Mitchell-2019)
  - FEATURE_AGREEMENT_SIGNAL three-mode flag (off|shadow|on, default off)
affects: [20-C-01 ICIR consumer of agreement_bucket priors, 20-C-04 pump-dump indirectly]

tech-stack:
  added: []
  patterns:
    - "Cookson & Engelberg-style echo-chamber gating via agreement_bucket suffix on LearnedPattern.pattern_key"
    - "Null-result calibration handling: literature default persists when no candidate beats baseline + 6-month re-evaluation gate"

key-files:
  created:
    - src/lib/sentiment/agreement.ts
    - scripts/calibrate-agreement-threshold.ts
    - src/app/api/cron/agreement-calibration/route.ts
    - prisma/migrations/20260512_add_agreement_calibration/migration.sql
    - docs/cards/MODEL-CARD-agreement.md
    - tests/components/research-report-agreement-badge.unit.test.tsx
    - tests/integration/agreement-calibration.integration.test.ts
  modified:
    - prisma/schema.prisma
    - src/lib/sentiment/aggregator.ts
    - src/lib/learning.ts
    - src/lib/features.ts
    - src/components/ResearchReport.tsx
    - HYPERPARAMETERS.md
    - vercel.json

key-decisions:
  - "agreement_score is null when n_sources < 2 (rather than 0 or 1) — explicit signal that cross-platform agreement is undefined, not 'low' or 'high'."
  - "Bucket boundary is `>=` for aligned, `<` for mixed; null → 'na'. Pattern-key suffix is backward-compatible: legacy keys without the suffix still load."
  - "Threshold calibration null-result handling: persist literature default 0.5 with null_result=true + 6-month re-evaluation gate (T-20-A-05-04). No auto-retries between."

patterns-established:
  - "Per-bucket Beta posteriors in LearnedPattern.pattern_key — engine learns separate priors per agreement regime, mirroring Cookson & Engelberg's empirical finding."

requirements-completed: []

duration: ~55min agent + cleanup
completed: 2026-05-12
---

# Phase 20-A-05 Summary

**Cross-platform agreement signal + MIXED · LOW AGREEMENT badge + LearnedPattern pattern_key extension. Shipped under FEATURE_AGREEMENT_SIGNAL = 'off'.**

## Self-Check: PASSED

- `npx tsc --noEmit` → exit 0
- `npm test` → **1081 passed / 2 skipped / 3 todo / 0 failed**
- `npm run check-model-cards` → OK (0 findings)
- `npm run check-immutability` → OK
- `npm run check-telemetry-coverage` → OK
- `npm run check-prompts` → green
- `npm run check-lookahead` → 0 violations / 135 files

(Working tree contains uncommitted UI/branding edits to layout.tsx, page.tsx,
NavBar.tsx, and ResearchReport.tsx — these are independent of A-05 and were
left in place for the user; they are not folded into A-05.)

## Performance

- **Duration:** ~55 min agent run (timed out at 81 tool calls) + ~10 min inline cleanup
- **Commits:** 7 task commits (from agent) + 1 test commit + 1 model-card commit + 1 SUMMARY commit (this file)

## Accomplishments

### Commits

1. `5ce546f` feat(20-A-05): agreementScore + lowAgreement + agreementBucket pure-functions module
2. `f61e3d3` feat(20-A-05): AgreementCalibration Prisma model + migration SQL
3. `d25c77b` feat(20-A-05): agreement-threshold calibration script + spot-check helper
4. `174dbea` feat(20-A-05): wire agreement_score + low_agreement_warning into aggregator (shadow flag)
5. `c68bfa5` feat(20-A-05): monthly agreement-calibration cron + vercel.json entry
6. `c8cb641` feat(20-A-05): extend LearnedPattern.pattern_key with backward-compat agreement_bucket suffix
7. `6f2c87a` feat(20-A-05): render MIXED · LOW AGREEMENT amber badge + agreement chip
8. `9762f0e` test(20-A-05): RTL badge contract + live-Neon calibration integration
9. `d5c931f` docs(20-A-05): Mitchell-2019 model card for agreement signal

### Threat mitigations

- T-20-A-05-02 (out-of-range bull_pct): aggregator validates [0,100] before agreement.ts is called.
- T-20-A-05-04 (null-result threshold): persists literature default 0.5 with `null_result=true` + 6-month re-evaluation gate. No silent auto-retries.

### Three-mode flag state

`FEATURES.agreement_signal_mode = 'off'` (default). Cutover to `on` requires candidate threshold with bootstrap CI > 0 on forward 7d realized-vol uplift.

## Deviations from plan

1. **Model card omitted by agent** — phantom-card finding from `check-model-cards` after agent timed out. Authored inline post-hoc at `docs/cards/MODEL-CARD-agreement.md` (commit `d5c931f`) matching the project's Mitchell-2019 frontmatter convention.
2. **Two test files added post-agent** — `tests/components/research-report-agreement-badge.unit.test.tsx` (4 RTL cases) + `tests/integration/agreement-calibration.integration.test.ts` were left uncommitted by the timed-out agent. Committed in `9762f0e`.

## Deferred items

- Live `prisma db push` — migration SQL committed; auto-applies on next deploy via `vercel.json` buildCommand (`prisma migrate deploy && next build`).
- Live calibration smoke run — depends on operator running migration + ≥30 cross-platform-aggregate examples accumulating.
