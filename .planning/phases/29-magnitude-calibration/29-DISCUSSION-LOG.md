# Phase 29: Magnitude Calibration & Extended Horizons — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-25
**Phase:** 29-magnitude-calibration
**Mode:** --auto (Claude selected recommended defaults; no interactive questions)
**Areas discussed:** Gemini output field shape, Expected storage, Magnitude error, Calibration cron, UI chart, Schema migration, Prompt instruction, Test strategy

---

## Gemini Output Field Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Structured numeric fields | `price_target_pct: Float?` + `price_target_horizon_days: Int?` added to Zod schema | ✓ |
| Replace string field | Remove `price_target` string, replace with number | |
| Both mandatory | Make numeric fields required, not nullable | |

**Auto-selected:** Structured numeric fields added as nullable optionals; existing string retained.
**Notes:** Additive is the safe choice — Gemini may not always have conviction for a number. Existing string preserved for narrative display.

---

## Expected Storage Location

| Option | Description | Selected |
|--------|-------------|----------|
| On PriceOutcome | `expected_pct` + `expected_horizon_days` columns on PriceOutcome | ✓ |
| On Report | Store forecast on Report table, join at read time | |
| Separate ForecastRecord table | New table linking Report → expected → actual | |

**Auto-selected:** On PriceOutcome — direct colocation with actual outcome, avoids joins, matches existing pattern.
**Notes:** Snapshot-originated PriceOutcome rows (no Gemini forecast) get null; only report-originated rows are populated.

---

## Magnitude Error Computation

| Option | Description | Selected |
|--------|-------------|----------|
| In price-followup cron | Compute at outcome-close time: `magnitude_error = forward_return_raw - expected_pct` | ✓ |
| In magnitude-calibration cron | Compute at calibration time (derived, not stored) | |
| Both stored and derived | Redundant — pick one | |

**Auto-selected:** In price-followup at close time — stored persistently for auditability and future analysis.
**Notes:** `forward_return_raw` is already in %-points; `expected_pct` will match — no unit conversion needed.

---

## Calibration Cron Schedule and Bucketing

| Option | Description | Selected |
|--------|-------------|----------|
| Weekly, 5 aggregate buckets | Monday 8am UTC; <-5%, -5→0%, 0→5%, 5→10%, >10% | ✓ |
| Daily, per-regime buckets | Higher cadence + regime split | |
| Monthly, aggregate | Lower cadence — data accumulates slowly | |

**Auto-selected:** Weekly, 5 aggregate buckets — matches data accumulation rate; per-regime deferred until data density warrants it.
**Notes:** N≥20 gate per bucket before including in output.

---

## UI Chart

| Option | Description | Selected |
|--------|-------------|----------|
| New tile in EngineCalibrationPanel | Reuse existing MetricCard/chart pattern; hidden until 3+ buckets meet N≥20 | ✓ |
| New insights tab | Separate page — more real estate but more friction | |
| Inline in report | Per-report forecast vs outcome — deferred (needs more data) | |

**Auto-selected:** New tile in EngineCalibrationPanel — consistent with existing architecture, reuses existing components.

---

## Schema Migration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Additive nullable columns | `expected_pct Float?`, `expected_horizon_days Int?`, `magnitude_error Float?` on PriceOutcome + new MagnitudeCalibrationBucket model | ✓ |
| New table for forecasts | Separate ForecastRecord table | |

**Auto-selected:** Additive nullable columns — least disruption, consistent with prior phase migrations (Phase 21, 22).

---

## Claude's Discretion

- Chart library/component choice for calibration curve — reuse existing EngineCalibrationPanel pattern
- Exact Gemini prompt wording for price_target_pct instruction
- Error handling for all-buckets-below-N-gate edge case in cron

## Deferred Ideas

- Per-regime magnitude calibration (sparse data risk in Phase 29)
- Public calibration trail page (original Phase 29 scope — SEC/FINRA review required, deferred indefinitely)
- Removing free-text `price_target` string (deferred until numeric field proven stable)
