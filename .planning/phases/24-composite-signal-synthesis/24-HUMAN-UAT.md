---
status: partial
phase: 24-composite-signal-synthesis
source: [24-VERIFICATION.md]
started: 2026-09-29T21:24:00Z
updated: 2026-09-29T21:24:00Z
---

## Current Test

[awaiting post-deploy verification + Blocker #2 follow-up]

## Tests

### 1. First cron run seeds real CompositeCalibrationSnapshot rows on production Neon
expected: After deploy + first 03:00 UTC cron run, `SELECT count(*) FROM composite_calibration_snapshots WHERE status != 'insufficient_data'` returns ≥1
result: [pending]

### 2. Composite reliability card renders on /insights/calibration with real Brier
expected: Once first cron run writes a ship-eligible or shadow snapshot for ALL × large_cap, ReliabilityDiagram card labelled 'cipher-composite-v1' appears alongside SentimentObservation classifiers; composite_brier + reliability_bins render numerically (not 'No Brier evaluation written yet')
result: [pending]

### 3. CompositeHeadline renders on /research/[ticker] with active composite (post-deploy, post-cron)
expected: For any ticker whose (regime × cap_class) cell has a ship-eligible snapshot with K ≥ 2 ACTIVE classes, the EngineCalibrationPanel top slot shows the composite probability + BCa CI + K-of-4 subline (not 'insufficient signal coverage' or 'insufficient history')
result: [pending]

### 4. check-composite-ship-gate exits 0 on organic data (post-launch watchdog)
expected: Once (a) coverage ≥ 0.50 AND (b) baseline_brier_logistic_36 is populated as real numbers on ship-eligible cells, `npm run check-composite-ship-gate` exits 0 with all 5 gates PASS
result: [pending]
blocked_by: Phase 24.1 gap-closure (BL-02 / Blocker #2 follow-up — extend loadHoldoutDataset with 36-feature projection)

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 1

## Gaps

Awaiting production deploy + Phase 24.1 gap-closure to unblock Test 4.

## Related Artifacts

- 24-VERIFICATION.md — structural pass (43/43 tests GREEN)
- 24-REVIEW.md — code review found 2 blockers + 1 major, cluster analysis: fix BL-01 + BL-02 + MJ-01 together as gap-closure
