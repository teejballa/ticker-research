# Phase 29: Magnitude Calibration & Extended Horizons — Context

**Gathered:** 2026-08-25
**Status:** Ready for planning
**Mode:** auto (all decisions auto-selected)

<domain>
## Phase Boundary

Close the feedback loop on *how much* Cipher predicted vs *how much* actually happened.

Scope:
1. Add `price_target_pct` (float, nullable, %-points) + `price_target_horizon_days` (int, nullable) to Gemini's `AnalysisResultSchema` — structured numeric forecast
2. Store `expected_pct` / `expected_horizon_days` in `PriceOutcome` at report creation time
3. Compute `magnitude_error = actual_pct - expected_pct` in `price-followup` cron when outcome closes
4. New weekly cron `/api/cron/magnitude-calibration` — buckets predictions, writes reliability-diagram data
5. `EngineCalibrationPanel` — "Price Forecast Calibration" chart

NOT in scope:
- Changing the sector-relative win label (Phase 21, locked)
- Adding new horizon lengths — 30/60/90d already exist in both `price-followup` and `learn` crons (Phase 16)
- Making price forecasts public-facing (SEC/FINRA risk — deferred)
- Removing `price_target` string field (retained for narrative display)

</domain>

<decisions>
## Implementation Decisions

### D-01: Gemini output field shape
- `price_target_pct`: `z.number().nullable().optional()` — percentage-points (e.g., `8.5` means +8.5%). Nullable because Gemini may not have enough conviction to forecast a number.
- `price_target_horizon_days`: `z.number().int().nullable().optional()` — must match one of `[3, 7, 14, 30, 60, 90]`; Gemini instructed to pick the horizon that best fits the thesis timeframe.
- Existing `price_target: z.string().optional().nullable()` is **retained unchanged** for narrative display. The new numeric field is additive.
- Post-process guard: if `price_target_horizon_days` is not in `[3,7,14,30,60,90]`, null both fields before persisting.

### D-02: Where expected_pct is stored
- `PriceOutcome` gains two new nullable columns: `expected_pct Float?` and `expected_horizon_days Int?`.
- Written at **report creation time** (when the Report row is written to DB) — not at scan time. Snapshot-originated `PriceOutcome` rows (from the sentiment-scan cron watchlist) do NOT get `expected_pct`; those rows have no per-ticker Gemini forecast.
- `Report` table already has a reference to `PriceOutcome` via `report_id` foreign key — the write path is the existing `writeReportToDb` function.

### D-03: magnitude_error computation
- `price-followup` cron already closes outcomes at `days_after ∈ [3,7,14,30,60,90]`.
- When closing an outcome where `expected_pct IS NOT NULL` and `days_after = expected_horizon_days`: write `magnitude_error = forward_return_raw - expected_pct` (raw absolute return minus expected, both in %-points).
- `magnitude_error` stored as `Float?` on `PriceOutcome` — null if no forecast was made or horizon doesn't match.
- Unit: percentage-points (positive = beat forecast, negative = missed forecast).

### D-04: Magnitude calibration cron
- New cron: `/api/cron/magnitude-calibration`, schedule `0 8 * * 1` (weekly, Monday 8am UTC).
- Buckets: `< -5%`, `-5→0%`, `0→5%`, `5→10%`, `> 10%` (5 buckets by `expected_pct`).
- For each bucket: compute `mean(forward_return_raw)` and `count(*)` across all closed outcomes where `expected_pct` falls in the range.
- ESS gate: only include a bucket in output if count ≥ 20.
- Writes to new `MagnitudeCalibrationBucket` Prisma model: `{ bucket_label, expected_midpoint, mean_actual_pct, n, computed_at }`.
- No per-regime or per-cap-class breakdown in Phase 29 — aggregate only (sparse data risk).

### D-05: EngineCalibrationPanel chart
- New tile in `EngineCalibrationPanel` labelled **"Price Forecast Calibration"**.
- Reads latest `MagnitudeCalibrationBucket` rows via a new `/api/insights/magnitude-calibration` GET endpoint.
- Chart: scatter/line plot — x-axis = `expected_midpoint`, y-axis = `mean_actual_pct`, dashed diagonal line = perfect calibration.
- Hidden entirely when fewer than 3 buckets meet the N≥20 gate (show "Insufficient data — forecasts accumulating" instead).
- No new charting library — reuse whatever is currently used in `EngineCalibrationPanel` (check existing chart patterns first).

### D-06: Prisma migration strategy
- Additive only — no column drops, no renames.
- New columns on `PriceOutcome`: `expected_pct Float?`, `expected_horizon_days Int?`, `magnitude_error Float?`.
- New model: `MagnitudeCalibrationBucket` with `id`, `bucket_label String`, `expected_midpoint Float`, `mean_actual_pct Float`, `n Int`, `computed_at DateTime`.
- Use `prisma db push` for dev; generate a proper migration file for the PR.

### D-07: Gemini prompt instruction
- The system/user prompt in `gemini-analysis.ts` gains an instruction block explaining `price_target_pct`:
  > "Provide a numeric price target as a percentage change (e.g., 8.5 for +8.5%). Choose the horizon (3/7/14/30/60/90 days) that best fits your thesis timeframe. If you have insufficient conviction for a numeric estimate, set both fields to null."
- Keep the instruction concise — Gemini already handles the narrative in `price_target` string.

### D-08: Test strategy
- Unit test: `price_target_pct` post-process guard (invalid horizon → null both fields).
- Unit test: `magnitude_error` computation in price-followup (mock PriceOutcome with expected_pct, verify error = actual - expected).
- Unit test: calibration cron bucketing logic (given mock outcomes, verify correct bucket assignment and mean computation).
- Integration smoke test: create a Report with `price_target_pct=5.0, price_target_horizon_days=14`, verify `PriceOutcome.expected_pct=5.0` is written.

### Claude's Discretion
- Chart library / component choice for calibration curve — reuse existing pattern in `EngineCalibrationPanel`
- Exact prompt wording for the Gemini forecast instruction
- Error handling edge cases in magnitude-calibration cron (e.g., all buckets below N gate)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Learning Engine Core
- `src/lib/learning.ts` — Bayesian update logic, HORIZONS constant, cell key structure
- `src/lib/engine-context.ts` — EngineCalibration shape surfaced to reports and UI
- `src/app/api/cron/price-followup/route.ts` — TARGET_DAYS, outcome close logic, sector labels
- `src/app/api/cron/learn/route.ts` — HORIZONS, cell upsert, brier_out_sample computation

### Gemini Output Schema
- `src/lib/gemini-analysis.ts` — AnalysisResultSchema Zod definition (price_target at line ~115), runGeminiAnalysis
- `src/lib/types.ts` — AnalysisResult, EngineCalibration TypeScript types

### Persistence
- `prisma/schema.prisma` — PriceOutcome model (pct_change, forward_return_raw, forward_return_sector_rel, is_directional_hit)
- `src/lib/db.ts` — Neon adapter singleton

### UI
- `src/components/EngineCalibrationPanel.tsx` — existing chart/tile patterns to reuse

### Requirements
- `.planning/REQUIREMENTS.md` §DEMO-07..11 — acceptance criteria for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `price-followup/route.ts` `TARGET_DAYS = [3, 7, 14, 30, 60, 90]` — horizons already correct, no change needed
- `learn/route.ts` `HORIZONS = [3, 7, 14, 30, 60, 90]` — learn cron already handles all horizons
- `PriceOutcome.forward_return_raw` — the actual %-return (in %-points); this is the `actual_pct` for magnitude_error
- `EngineCalibrationPanel` — existing MetricCard + chart component pattern; new tile slots in without new library

### Established Patterns
- Additive Zod schema fields: `z.number().nullable().optional()` — matches existing nullable pattern (see `price_target` string)
- Cron route structure: `force-dynamic`, `maxDuration: 300`, authorized via `CRON_SECRET` header
- DB writes: Prisma upsert pattern used throughout learn, price-followup crons
- Post-process overwrite in `gemini-analysis.ts`: numeric fields are post-process-locked after LLM returns (prevents drift) — `price_target_pct` should follow same pattern

### Integration Points
- `writeReportToDb` (or equivalent in `src/app/api/analysis/`) — where `expected_pct` gets written to PriceOutcome
- `price-followup/route.ts` lines ~110-190 — where `magnitude_error` gets computed alongside existing labels
- `EngineCalibrationPanel` — new tile added after existing source-mix row (Phase 22)
- `vercel.json` crons array — add `magnitude-calibration` entry with `0 8 * * 1` schedule

</code_context>

<specifics>
## Specific Decisions

- **Keep sector-relative as primary** — magnitude calibration is additive, does NOT replace the `forward_return_sector_rel` win label
- **Free-text `price_target` string is not removed** — retained for narrative display in the report UI
- **5 buckets only** — no per-regime split in Phase 29 (sparse data; add regime dimension in a later phase if enough forecasts accumulate)
- **Weekly cron** — Monday 8am UTC, low urgency, data accumulates slowly
- **N≥20 gate per bucket** — consistent with ESS gating philosophy from Phase 21.1 (DEMO-06 uses N<30 gate for dashboard; calibration uses N≥20 as more permissive since buckets are coarser)

</specifics>

<deferred>
## Deferred Ideas

- Per-regime magnitude calibration breakdown (add after enough regime-specific forecasts accumulate)
- Per-cap-class magnitude calibration (same reason — sparse data in Phase 29 timeframe)
- Public calibration trail page (SEC/FINRA review required — original Phase 29 scope, deferred indefinitely)
- Removing free-text `price_target` string field (deferred until `price_target_pct` has proven stable)
- Brier score on magnitude predictions (possible Phase 28 extension once data exists)

</deferred>

---

*Phase: 29-magnitude-calibration*
*Context gathered: 2026-08-25*
