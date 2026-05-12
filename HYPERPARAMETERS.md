# Hyperparameters Register

Source-of-truth list for calibrated parameters across the Cipher pipeline.
Each section is written by an automated calibration script — hand-editing
values violates S1 (no hand-picked parameters). Recalibration cadence is
documented per section.

---

## crowded_consensus (Plan 20-A-01)

Source: `scripts/calibrate-crowded-consensus.ts` grid search over the
`CrowdedConsensusCalibration` table.

| Parameter            | Value                       | Range searched          | Step  |
|----------------------|-----------------------------|-------------------------|-------|
| H_thresh (entropy)   | n/a (insufficient data)     | [0.3, 1.5]              | 0.1   |
| V_thresh (mention-z) | n/a (insufficient data)     | [1.0, 5.0]              | 0.25  |
| D_thresh (gini)      | n/a (insufficient data)     | [0.1, 0.7]              | 0.05  |

- **Brier Skill Score:** n/a (calibration deferred until ≥30 examples)
- **Training window:** 90d
- **n_examples:** 0 (live smoke deferred — mention_z stub returns 0 until 20-A-02 ships)
- **computed_at:** pending — first cron run lands the inaugural row.
- **model_version:** grid-search-v1
- **Recalibration cadence:** monthly via `/api/cron/calibrate-crowded-consensus` (schedule `'0 7 1 * *'` UTC)

**Deferred-state note:** This plan ships the calibration scaffold in `off`
mode. Live calibration smoke run was deferred — the mention_z stub returns 0
until plan 20-A-02 ships the real volume-baselining function, so the predicate
cannot fire under shadow until then. The monthly cron will write the first
inaugural row on its next scheduled run after 20-A-02 lands. This is
intentional ordering per CONTEXT.md S3 cutover criteria.

Updated by: Plan 20-A-01 (2026-05-12).
