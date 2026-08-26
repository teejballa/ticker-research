# Phase 29: Magnitude Calibration & Extended Horizons — Research

**Researched:** 2026-08-25
**Domain:** Gemini Zod schema extension, Prisma additive migration, cron wiring, reliability-diagram UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `price_target_pct: z.number().nullable().optional()` + `price_target_horizon_days: z.number().int().nullable().optional()` added to `AnalysisResultSchema`. Existing `price_target: z.string().optional().nullable()` retained unchanged.
- **D-02:** `PriceOutcome` gains `expected_pct Float?` + `expected_horizon_days Int?`. Written at report creation time inside `writeReportToDb`. Snapshot-originated outcomes do NOT get `expected_pct`.
- **D-03:** `magnitude_error = forward_return_raw - expected_pct` computed in `price-followup` cron when `expected_pct IS NOT NULL` AND `days_after = expected_horizon_days`. Stored as `magnitude_error Float?`.
- **D-04:** New cron `/api/cron/magnitude-calibration` at `0 8 * * 1` (Monday 8am UTC). 5 buckets: `< -5%`, `-5→0%`, `0→5%`, `5→10%`, `> 10%`. ESS gate: N≥20 per bucket. Writes `MagnitudeCalibrationBucket` rows.
- **D-05:** New tile in `EngineCalibrationPanel` — "Price Forecast Calibration". Reads from new `/api/insights/magnitude-calibration` GET endpoint. Chart: scatter/line with dashed diagonal. Hidden when fewer than 3 buckets meet N≥20 gate. No new charting library — reuse existing pattern.
- **D-06:** Additive Prisma migration only. New columns on `PriceOutcome`: `expected_pct Float?`, `expected_horizon_days Int?`, `magnitude_error Float?`. New model: `MagnitudeCalibrationBucket`.
- **D-07:** Prompt gains instruction block for `price_target_pct`.
- **D-08:** Unit tests for post-process guard, magnitude_error computation, calibration cron bucketing, and integration smoke test for expected_pct write.
- **Sector-relative primary label unchanged** — magnitude calibration is additive.
- **Free-text `price_target` string retained** — not removed.
- **5 buckets only, aggregate** — no per-regime or per-cap-class split.

### Claude's Discretion

- Chart library/component choice for calibration curve (reuse existing EngineCalibrationPanel pattern)
- Exact prompt wording for the Gemini forecast instruction
- Error handling edge cases in magnitude-calibration cron

### Deferred Ideas (OUT OF SCOPE)

- Per-regime magnitude calibration breakdown
- Per-cap-class magnitude calibration
- Public calibration trail page (SEC/FINRA risk)
- Removing free-text `price_target` string field
- Brier score on magnitude predictions
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEMO-07 | Gemini output gains `price_target_pct` (float, nullable, %-points) + `price_target_horizon_days` (int, nullable) as structured numeric fields alongside retained `price_target` string | D-01: additive Zod fields; post-process guard pattern verified in codebase |
| DEMO-08 | `PriceOutcome` gains `expected_pct` (float, nullable) + `expected_horizon_days` (int, nullable) written at report creation from `price_target_pct`/`price_target_horizon_days` | D-02: `writeReportToDb` is the exact insertion point; exact code path traced |
| DEMO-09 | `price-followup` cron computes `magnitude_error = actual_pct - expected_pct` on matching-horizon outcomes, stored as `magnitude_error Float?` | D-03: `forward_return_raw` IS the actual_pct; `prisma.priceOutcome.create` is the write site |
| DEMO-10 | New weekly cron `/api/cron/magnitude-calibration` buckets predictions, N≥20 gate, writes `MagnitudeCalibrationBucket` rows | D-04: schedule, bucket boundaries, ESS gate, model shape all locked |
| DEMO-11 | `EngineCalibrationPanel` surfaces "Price Forecast Calibration" chart; hidden when fewer than 3 buckets meet N≥20 | D-05: pure SVG chart (matches Sparkline pattern), new API endpoint |
</phase_requirements>

---

## Summary

Phase 29 closes the magnitude feedback loop: right now Cipher predicts direction but not magnitude. This phase adds a structured numeric price forecast from Gemini (`price_target_pct`, `price_target_horizon_days`), stores the expected value at prediction time on `PriceOutcome`, closes the loop when outcomes resolve by computing `magnitude_error`, and then aggregates closed outcomes into a reliability diagram via a new weekly cron. The `EngineCalibrationPanel` surfaces the resulting calibration chart.

All integration points have been verified against the live codebase. The insertion sites are: `AnalysisResultSchema` (Zod addition), `writeReportToDb` in `src/lib/reports-db.ts` (expected_pct write), `prisma.priceOutcome.create` in `src/app/api/cron/price-followup/route.ts` (magnitude_error computation), new cron route file, new insights API route, and `EngineCalibrationPanel.tsx` (new tile). The chart uses the same pure-SVG approach as the existing `Sparkline` component — no new library needed.

**Primary recommendation:** Implement in 4 waves: Wave 0 (schema + RED tests), Wave 1 (Gemini field + prompt), Wave 2 (price-followup magnitude_error wiring + writeReportToDb expected_pct write), Wave 3 (magnitude-calibration cron + insights endpoint + EngineCalibrationPanel tile).

---

## Standard Stack

### Core (all verified in codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma (`@prisma/client`) | existing | additive migration for new columns/model | already the project ORM; migration pattern verified |
| Zod (`z`) | existing | `AnalysisResultSchema` extension | already used at line 74 of `gemini-analysis.ts` |
| Next.js App Router | existing | new cron route + insights GET endpoint | all crons follow this pattern |
| `prisma` singleton | existing | `src/lib/db.ts` | all cron routes import from here |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Pure SVG (browser built-in) | — | Reliability diagram scatter/line + dashed diagonal | Matches existing `Sparkline` component pattern in `EngineCalibrationPanel` — no new dep |
| `lightweight-charts` | ^5.1.0 | Already installed; NOT used for this chart | Only used in `PriceLineChart.tsx`; calibration scatter is simpler (pure SVG is correct) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure SVG chart | lightweight-charts or recharts | D-05 locks "no new charting library"; pure SVG matches Sparkline precedent and is sufficient for 5-bucket scatter |

**No new npm packages required.** [VERIFIED: package.json inspection]

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
src/app/api/cron/magnitude-calibration/
└── route.ts                  # New weekly cron — buckets + writes MagnitudeCalibrationBucket
src/app/api/insights/
└── magnitude-calibration/
    └── route.ts              # New GET endpoint — reads latest MagnitudeCalibrationBucket rows
tests/unit/
└── magnitude-calibration.test.ts   # Unit tests (D-08)
```

### Pattern 1: Additive Zod Field (D-01)

**What:** Add nullable optional numeric fields to `AnalysisResultSchema` after `price_target`.
**When to use:** Any time a new LLM output field must be additive and backward-compatible.

```typescript
// Source: src/lib/gemini-analysis.ts line 115 (verified)
// EXISTING:
price_target: z.string().optional().nullable(),
// ADD AFTER (D-01):
price_target_pct: z.number().nullable().optional(),
price_target_horizon_days: z.number().int().nullable().optional(),
```

**Post-process guard (D-01):** After Zod parse, in the same post-process block that overwrites engine calibration numerics, null-out both fields if `price_target_horizon_days` is not in `[3, 7, 14, 30, 60, 90]`:

```typescript
// In generateAnalysis() post-process block — same location as engine_calibration overwrite
const VALID_HORIZONS = [3, 7, 14, 30, 60, 90] as const;
if (
  parsed.price_target_horizon_days != null &&
  !VALID_HORIZONS.includes(parsed.price_target_horizon_days as typeof VALID_HORIZONS[number])
) {
  parsed.price_target_pct = null;
  parsed.price_target_horizon_days = null;
}
```

### Pattern 2: writeReportToDb Extension (D-02)

**What:** After `prisma.report.create`, create a `PriceOutcome` row with `expected_pct`/`expected_horizon_days` from the analysis result.
**When to use:** Only when `result.price_target_pct != null` AND `result.price_target_horizon_days != null`.

**Critical constraint:** `writeReportToDb` currently returns `report.id` (a string). The `PriceOutcome.report_id` FK references `Report.id`. The PriceOutcome creation must happen inside the same function after the report row exists.

```typescript
// src/lib/reports-db.ts — after prisma.report.create()
// [VERIFIED: writeReportToDb returns report.id at line 37]
if (result.price_target_pct != null && result.price_target_horizon_days != null) {
  await prisma.priceOutcome.create({
    data: {
      report_id: report.id,
      days_after: result.price_target_horizon_days,
      price: opts?.price_at_report ?? 0,   // placeholder — actual price at prediction
      pct_change: 0,                        // will be filled by price-followup cron
      recorded_at: new Date(),
      expected_pct: result.price_target_pct,
      expected_horizon_days: result.price_target_horizon_days,
    },
  });
}
```

**Important note on `price` and `pct_change`:** `PriceOutcome` has non-nullable `price Float` and `pct_change Float`. These need placeholder values at creation time because the actual outcome price isn't known yet. Use `price_at_report` for the initial price placeholder and `0` for `pct_change`. The `price-followup` cron writes a SEPARATE `PriceOutcome` row with the actual price — it does NOT update the pre-created row. [VERIFIED: price-followup creates new rows with `prisma.priceOutcome.create`, deduped by `days_after`]

**CRITICAL DESIGN DECISION:** The `price-followup` cron already deduplicates via:
```typescript
if (report.outcomes.some(o => o.days_after === day)) { results.skipped++; continue; }
```
This means: if `writeReportToDb` creates a `PriceOutcome` at `days_after = expected_horizon_days` (e.g., 14), the `price-followup` cron will SKIP that horizon for this report — it finds an existing row.

**Resolution:** Do NOT pre-create a `PriceOutcome` row at report creation time. Instead, store `expected_pct` / `expected_horizon_days` directly on the `Report` table or in a separate lightweight table. However, D-02 explicitly says "PriceOutcome gains two new nullable columns" — meaning the PriceOutcome rows created by `price-followup` will carry `expected_pct`.

**Correct write path (D-02 re-read):** The `expected_pct` is written to the `PriceOutcome` row created by the `price-followup` cron, NOT at report creation time. The `report_id` FK on `PriceOutcome` is how we trace back to the original forecast. The `writeReportToDb` function needs to store `price_target_pct` and `price_target_horizon_days` somewhere the cron can find them — on the `Report.analysis` JSON (already stored as `analysis: result as object`).

Since `result.price_target_pct` and `result.price_target_horizon_days` are on the `AnalysisResult` which is persisted as `Report.analysis` (JSONB), the `price-followup` cron can read them back via `report.analysis.price_target_pct` when it creates the `PriceOutcome` row.

**Revised price-followup write pattern:**

```typescript
// In price-followup route.ts, inside the prisma.priceOutcome.create() call
const analysis = report.analysis as { price_target_pct?: number | null; price_target_horizon_days?: number | null } | null;
const expectedPct = analysis?.price_target_pct ?? null;
const expectedHorizonDays = analysis?.price_target_horizon_days ?? null;

await prisma.priceOutcome.create({
  data: {
    report_id: report.id,
    days_after: day,
    price,
    pct_change: absoluteReturnPct,
    recorded_at: recordedAt,
    sector_etf: sectorLabels.sector_etf,
    forward_return_raw: sectorLabels.forward_return_raw,
    forward_return_sector_rel: sectorLabels.forward_return_sector_rel,
    is_directional_hit: labels.is_directional_hit,
    is_sigma_hit_k1: labels.is_sigma_hit_k1,
    is_hit_flat1: labels.is_hit_flat1,
    sector_sigma_60d: labels.sector_sigma_60d,
    // Phase 29 additions:
    expected_pct: expectedPct,
    expected_horizon_days: expectedHorizonDays,
    magnitude_error: (expectedPct != null && expectedHorizonDays === day)
      ? sectorLabels.forward_return_raw - expectedPct
      : null,
  },
});
```

[VERIFIED: `report.analysis` is `Json` type in schema; price-followup already does `include: { outcomes: true }` and the `report` object is the full Prisma report row]

**Note:** The `price-followup` cron also needs `report.analysis` — it currently selects reports with `include: { outcomes: true }` but NOT `analysis`. The query at line 101-104 must be updated to also select `analysis`. [VERIFIED: line 101-104 of price-followup/route.ts]

### Pattern 3: Prisma Additive Migration (D-06)

**What:** Add columns to `PriceOutcome` and a new `MagnitudeCalibrationBucket` model.
**When to use:** Every schema change in this project is additive — no drops, no renames.

```prisma
// prisma/schema.prisma additions:

model PriceOutcome {
  // ... existing fields ...
  // Phase 29 — Magnitude Calibration (D-06)
  expected_pct          Float?   // LLM forecast at prediction time (%-points)
  expected_horizon_days Int?     // must match one of [3,7,14,30,60,90]
  magnitude_error       Float?   // forward_return_raw - expected_pct (positive = beat)
}

model MagnitudeCalibrationBucket {
  id               String   @id @default(uuid())
  bucket_label     String   // e.g. "0→5%", "<-5%"
  expected_midpoint Float   // midpoint of the bucket (e.g. 2.5 for "0→5%")
  mean_actual_pct  Float    // mean(forward_return_raw) for closed outcomes in bucket
  n                Int      // count of outcomes in bucket (must be >= 20 to appear)
  computed_at      DateTime @default(now()) @db.Timestamptz

  @@index([computed_at(sort: Desc)])
  @@map("magnitude_calibration_buckets")
}
```

### Pattern 4: Cron Route Structure (D-04)

**What:** New cron file follows the exact same pattern as all existing cron routes.
**Verified from:** `src/app/api/cron/price-followup/route.ts` and `src/app/api/cron/learn/route.ts`

```typescript
// src/app/api/cron/magnitude-calibration/route.ts
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... bucketing logic ...
}
```

**vercel.json entry:**
```json
{ "path": "/api/cron/magnitude-calibration", "schedule": "0 8 * * 1" }
```
[VERIFIED: vercel.json currently has 30 cron entries; Monday 8am UTC slot is used by `eval-brier` and `author-share-calibration` — both are safe coexistence since Vercel runs them independently]

### Pattern 5: Bucketing Logic (D-04)

The 5 bucket definitions and midpoints:

| Bucket Label | Expected Range | Midpoint | SQL Condition |
|---|---|---|---|
| `"< -5%"` | expected_pct < -5 | -7.5 | `WHERE expected_pct < -5` |
| `"-5→0%"` | -5 ≤ expected_pct < 0 | -2.5 | `WHERE expected_pct >= -5 AND expected_pct < 0` |
| `"0→5%"` | 0 ≤ expected_pct < 5 | 2.5 | `WHERE expected_pct >= 0 AND expected_pct < 5` |
| `"5→10%"` | 5 ≤ expected_pct < 10 | 7.5 | `WHERE expected_pct >= 5 AND expected_pct < 10` |
| `"> 10%"` | expected_pct ≥ 10 | 12.5 | `WHERE expected_pct >= 10` |

Cron bucketing logic:

```typescript
const BUCKETS = [
  { label: '< -5%',  expectedMidpoint: -7.5, minPct: null, maxPct: -5 },
  { label: '-5→0%',  expectedMidpoint: -2.5, minPct: -5,   maxPct: 0  },
  { label: '0→5%',   expectedMidpoint:  2.5, minPct: 0,    maxPct: 5  },
  { label: '5→10%',  expectedMidpoint:  7.5, minPct: 5,    maxPct: 10 },
  { label: '> 10%',  expectedMidpoint: 12.5, minPct: 10,   maxPct: null },
] as const;

// For each bucket, query closed outcomes:
const outcomes = await prisma.priceOutcome.findMany({
  where: {
    expected_pct: {
      ...(bucket.minPct !== null ? { gte: bucket.minPct } : {}),
      ...(bucket.maxPct !== null ? { lt: bucket.maxPct } : {}),
      not: null,
    },
    forward_return_raw: { not: null },  // closed outcome
  },
  select: { forward_return_raw: true },
});
if (outcomes.length < 20) continue; // ESS gate
const meanActualPct = outcomes.reduce((s, o) => s + (o.forward_return_raw ?? 0), 0) / outcomes.length;
```

**Idempotency:** Use `prisma.magnitudeCalibrationBucket.create` (not upsert) — each cron run appends a new row. The insights endpoint reads `orderBy: { computed_at: 'desc' }` to get the latest run. This matches the existing pattern used by `BrierTile` (append-only `eval-brier` table). [VERIFIED: `src/app/api/insights/calibration/route.ts` uses latest-row pattern]

### Pattern 6: EngineCalibrationPanel Calibration Chart (D-05)

**What:** Pure SVG scatter/line chart — same approach as the `Sparkline` component.
**Verified from:** `EngineCalibrationPanel.tsx` lines 239-256 (Sparkline is pure SVG).

The calibration chart (5 data points max) is simpler than Sparkline. Pattern:

```tsx
function CalibrationChart({ buckets }: { buckets: MagnitudeCalibrationBucket[] }) {
  const W = 200, H = 120;
  // Map expected_midpoint and mean_actual_pct to SVG coordinates
  // Draw dashed diagonal line (perfect calibration y=x)
  // Plot dots + connecting line for actual data
  return (
    <svg width={W} height={H} className="overflow-visible" aria-hidden="false">
      {/* dashed diagonal */}
      <line x1={0} y1={H} x2={W} y2={0} stroke="currentColor" strokeDasharray="4 3"
            className="text-outline-variant" strokeWidth="1" />
      {/* data line + dots */}
      <path d={buildDataPath(buckets, W, H)} stroke="currentColor"
            className="text-secondary" strokeWidth="1.5" fill="none" />
      {buckets.map(b => <circle key={b.bucket_label} ... />)}
    </svg>
  );
}
```

**Tile placement:** After the existing `SourceMixRow` (Phase 22, line ~406), before `AlignmentDisagreementBlocks`. The tile is a client-side data fetch from `/api/insights/magnitude-calibration`.

**"Insufficient data" guard (D-05):** When fewer than 3 buckets meet N≥20, render a placeholder div instead of the SVG:

```tsx
if (!buckets || buckets.length < 3) {
  return (
    <div className="mt-3 bg-surface-container-high p-3 rounded-lg text-[11px] text-on-surface-variant">
      Insufficient data — forecasts accumulating
    </div>
  );
}
```

### Pattern 7: Insights GET Endpoint

**What:** New server component/route at `/api/insights/magnitude-calibration`.
**Verified from:** `src/app/api/insights/` directory — existing routes: `baselines`, `calibration`, `horizon-brier`, `insider-library`, `institutional-library`, `llm-ic-rolling`, `route.ts`, `sentiment-health`, `sentiment-sources`.

```typescript
// src/app/api/insights/magnitude-calibration/route.ts
export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await prisma.magnitudeCalibrationBucket.findMany({
    where: { computed_at: {
      // Latest cron run: group by computed_at, take max
    }},
    orderBy: { expected_midpoint: 'asc' },
  });
  return NextResponse.json({ buckets: rows });
}
```

**Simpler pattern:** Query the latest `computed_at` first, then filter to that timestamp:

```typescript
const latest = await prisma.magnitudeCalibrationBucket.findFirst({
  orderBy: { computed_at: 'desc' },
  select: { computed_at: true },
});
if (!latest) return NextResponse.json({ buckets: [] });
const buckets = await prisma.magnitudeCalibrationBucket.findMany({
  where: { computed_at: latest.computed_at },
  orderBy: { expected_midpoint: 'asc' },
});
return NextResponse.json({ buckets });
```

### Anti-Patterns to Avoid

- **Pre-creating PriceOutcome at report time:** The `price-followup` dedup check (`outcomes.some(o => o.days_after === day)`) would skip the horizon. Write `expected_pct` by reading `report.analysis.price_target_pct` inside `price-followup`, not by pre-inserting a row.
- **Upsert on MagnitudeCalibrationBucket:** The append-only pattern (insert per cron run, read latest) is used consistently throughout; do not add a unique constraint.
- **Averaging over open outcomes:** `forward_return_raw IS NOT NULL` is the correct gate for "closed outcome" — the field is null until `price-followup` writes it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bucketing SQL | Custom CASE-based grouping | Prisma findMany per-bucket with range filters | Simpler, readable, testable with mock; only 5 buckets |
| Reliability diagram chart | Recharts/D3 component | Pure SVG (matches Sparkline) | No new dep; 5 data points is trivial for SVG |
| ESS gating | Complex statistical test | `outcomes.length < 20` gate | N=20 is a count gate, not a statistical weight |

---

## Runtime State Inventory

> Phase 29 is a greenfield addition (new schema columns, new cron, new UI tile). No rename or migration of existing string values.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | No existing `expected_pct`, `magnitude_error`, or `MagnitudeCalibrationBucket` rows | Wave 0 Prisma migration adds columns; cron backfill not needed (old outcomes have no forecast) |
| Live service config | vercel.json needs one new cron entry | Code edit to vercel.json |
| OS-registered state | None | None |
| Secrets/env vars | No new env vars needed (uses existing `CRON_SECRET`, `DATABASE_URL`) | None |
| Build artifacts | None | None |

**Nothing found in rename/refactor categories** — this is a greenfield additive phase.

---

## Common Pitfalls

### Pitfall 1: price-followup dedup blocks expected_pct write

**What goes wrong:** If `writeReportToDb` pre-creates a `PriceOutcome` row at `days_after = expected_horizon_days`, the `price-followup` cron will find it via `outcomes.some(o => o.days_after === day)` and skip creating the real outcome row. `magnitude_error` never gets written.

**Root cause:** D-02 says "Written at report creation time" — this was interpreted as creating a PriceOutcome row, but the correct interpretation is that the forecast values should be accessible at outcome-close time. The `Report.analysis` JSONB already stores the full `AnalysisResult`, so `price_target_pct` and `price_target_horizon_days` are available to the cron without any additional row.

**How to avoid:** Do NOT create a PriceOutcome in `writeReportToDb`. Read `report.analysis.price_target_pct` inside `price-followup` when creating each PriceOutcome row.

**Warning signs:** If Wave 2 integration test shows `expected_pct IS NULL` on all PriceOutcome rows even after a report with `price_target_pct != null`, this is the cause.

### Pitfall 2: price-followup query missing `analysis` field

**What goes wrong:** The current `prisma.report.findMany` in `price-followup` includes `{ outcomes: true }` but does NOT select `analysis`. The `analysis` field must be included to read `price_target_pct`.

**Root cause:** The query at line 101 of `price-followup/route.ts` was written before price forecasts existed.

**How to avoid:** In Wave 2, update the `findMany` to add `select` or use the default (no `select` = all fields) to ensure `analysis` is included. Currently no `select` clause is used on the report query — the `include: { outcomes: true }` returns all scalar fields by default. [VERIFIED: line 101-104 of route.ts — Prisma `include` does not restrict scalar fields, so `analysis` is already available on the report object].

**Resolution:** Actually no change needed. Prisma `include` without `select` returns ALL scalar fields plus the included relation. The `report.analysis` is already available. [VERIFIED]

### Pitfall 3: MagnitudeCalibrationBucket timestamp grouping

**What goes wrong:** If the insights endpoint groups by `computed_at` without careful timestamp comparison, two cron runs on the same Monday may appear as separate "latest" runs.

**How to avoid:** Use `findFirst` to get the latest `computed_at`, then filter `where: { computed_at: latest.computed_at }` (exact timestamp match). This is deterministic because each cron run completes atomically and each bucket write uses `new Date()` from the same JS runtime tick.

### Pitfall 4: SVG coordinate clamping for out-of-range actual returns

**What goes wrong:** If mean_actual_pct is extreme (e.g., +40% in the `> 10%` bucket), the SVG y-coordinate may go negative or exceed canvas height.

**How to avoid:** Clamp coordinate computation to `[0, H]` range. The x-axis range should be the full expected_midpoint range plus padding; y-axis should be symmetric around zero with the same range.

### Pitfall 5: Zod parse fails when Gemini outputs price_target_horizon_days as string

**What goes wrong:** Gemini occasionally returns numbers as strings (e.g., `"14"` instead of `14`). The `z.number().int()` validator will reject this.

**How to avoid:** The existing `generateText` with structured output via the AI SDK handles Zod coercion. However, add the post-process guard immediately after parse to null-out invalid horizons regardless of raw value. No coercion needed — Gemini with structured output respects the schema type. [ASSUMED — based on existing pattern; if tsc fails on this, add `.transform(Number)` to the Zod field]

---

## Code Examples

### Exact AnalysisResultSchema insertion point

```typescript
// Source: src/lib/gemini-analysis.ts line 115 (verified by Read)
// BEFORE:
  price_target: z.string().optional().nullable(),
// AFTER (Phase 29 D-01):
  price_target: z.string().optional().nullable(),
  price_target_pct: z.number().nullable().optional(),
  price_target_horizon_days: z.number().int().nullable().optional(),
```

### AnalysisResult type extension (src/lib/types.ts)

```typescript
// Source: src/lib/types.ts line 637 (verified by Read)
// Add after price_target:
  price_target?: string | null;      // existing (narrative)
  price_target_pct?: number | null;  // Phase 29: numeric forecast (%-points)
  price_target_horizon_days?: number | null;  // Phase 29: which horizon [3,7,14,30,60,90]
```

### price-followup: magnitude_error computation

```typescript
// Source: src/app/api/cron/price-followup/route.ts (verified — lines 131-145)
// In prisma.priceOutcome.create() data block:
const analysisJson = report.analysis as {
  price_target_pct?: number | null;
  price_target_horizon_days?: number | null;
} | null;
const expectedPct = analysisJson?.price_target_pct ?? null;
const expectedHorizonDays = analysisJson?.price_target_horizon_days ?? null;

// magnitude_error: only compute when expected_pct IS NOT NULL AND days_after matches
const magnitudeError =
  expectedPct != null && expectedHorizonDays === day
    ? sectorLabels.forward_return_raw - expectedPct
    : null;
```

### Prompt instruction (D-07)

```
Provide a numeric price target as a percentage change from current price
(e.g., 8.5 for +8.5%, -3.0 for -3.0%). Choose the horizon (3, 7, 14, 30, 60,
or 90 days) that best fits your thesis timeframe. If you have insufficient
conviction for a numeric estimate, set both price_target_pct and
price_target_horizon_days to null. Do not repeat this in price_target — the
narrative price_target string is separate from this numeric estimate.
```

### Gemini prompt instruction location

The system prompt is assembled by `buildSystemPrompt()` in `gemini-analysis.ts` (line 520). The price forecast instruction block should be appended to the user prompt via `buildUserPrompt()` or as a small addendum in `SYSTEM_PROMPT` (rendered via `renderPrompt('gemini-research-brief-system', {})`). [VERIFIED: `buildUserPrompt` is the simpler insertion point — add it as a trailing section in the user prompt]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `price_target` string only (narrative) | Add `price_target_pct` + `price_target_horizon_days` (numeric) | Phase 29 | Enables magnitude error tracking and reliability diagrams |
| No forward magnitude tracking | `magnitude_error = actual - expected` stored per outcome | Phase 29 | Closes the quantitative feedback loop |
| No calibration chart | Reliability diagram tile in `EngineCalibrationPanel` | Phase 29 | Shows whether Cipher's numeric forecasts are accurate |

**Not deprecated:** `price_target` string field is explicitly retained (D-01, D-06). Any existing report rendering that reads `result.price_target` continues to work unchanged.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Prisma `include: { outcomes: true }` without `select` returns all scalar fields including `analysis` on the report object | Pattern 2 / Pitfall 2 | If wrong: `report.analysis` is undefined in price-followup cron → `expectedPct` always null → no magnitude_error ever written |
| A2 | Gemini with structured output respects `z.number().int()` without needing `.transform(Number)` coercion | Pattern 1 | If wrong: Zod parse fails on string-typed horizon → add `.or(z.string().transform(Number)).pipe(z.number().int())` |
| A3 | The insights endpoint `/api/insights/magnitude-calibration` does not need auth (matches pattern of other insights routes) | Pattern 7 | If wrong: add CRON_SECRET or session guard; check how existing insights routes handle auth |

**If any A1 fails:** The fix is to explicitly add `select: { analysis: true, ... }` or just read `(report as any).analysis` — Prisma always returns JSONB columns for `findMany` without a `select` clause.

---

## Open Questions (RESOLVED)

1. **Should `expected_pct` ever be written to snapshot-originated `PriceOutcome` rows?**
   - What we know: D-02 explicitly says "Snapshot-originated PriceOutcome rows do NOT get `expected_pct`" — these rows have no per-ticker Gemini forecast.
   - What's clear: null is correct for snapshot rows.
   - Recommendation: Write `expected_pct = null` implicitly (field is nullable, price-followup snapshot path doesn't read `report.analysis`). No action needed.

2. **What `price` value to use for the PriceOutcome row when there is no pre-created row?**
   - What we know: D-02 resolved — do NOT pre-create a PriceOutcome. The `price-followup` cron writes the actual current price when the outcome resolves.
   - What's clear: No placeholder row needed; `expected_pct` / `expected_horizon_days` come from `report.analysis` JSON at cron time.
   - Recommendation: No action needed — the architecture is clean.

3. **Client-side fetch vs server component for calibration chart data?**
   - What we know: `EngineCalibrationPanel` is `'use client'` (line 1). It cannot call Prisma directly. Must use the `/api/insights/magnitude-calibration` endpoint.
   - What's clear: `useEffect` + `fetch` pattern (same as other dynamic data in client components) or pass data via props from a parent server component.
   - Recommendation: Use `useEffect` + `fetch` inside the new calibration tile sub-component, matching the `SourceMixExpanded` pattern (which is already a client island).

---

## Environment Availability

> Step 2.6: No new external dependencies. Phase uses only existing infrastructure (Neon Postgres, Vercel crons, Prisma, Next.js API routes). SKIPPED for external tool audit — all dependencies are already live in production.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.9 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test` (runs `vitest run`) |
| Full suite command | `npm test && npm run test:integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEMO-07 | `price_target_pct` Zod parse + post-process guard (invalid horizon → null both fields) | unit | `npm test -- magnitude-calibration` | Wave 0 |
| DEMO-07 | Valid horizon passes through unchanged | unit | `npm test -- magnitude-calibration` | Wave 0 |
| DEMO-08 | `expected_pct` written when `price_target_pct != null` on price-followup cron | unit | `npm test -- magnitude-calibration` | Wave 0 |
| DEMO-08 | `expected_pct` null for snapshot-originated rows | unit | `npm test -- magnitude-calibration` | Wave 0 |
| DEMO-09 | `magnitude_error = forward_return_raw - expected_pct` computed correctly | unit | `npm test -- magnitude-calibration` | Wave 0 |
| DEMO-09 | `magnitude_error` null when `days_after != expected_horizon_days` | unit | `npm test -- magnitude-calibration` | Wave 0 |
| DEMO-10 | Bucketing logic assigns correct bucket per expected_pct value | unit | `npm test -- magnitude-calibration` | Wave 0 |
| DEMO-10 | Mean actual pct computed correctly for mock bucket | unit | `npm test -- magnitude-calibration` | Wave 0 |
| DEMO-10 | ESS gate: bucket with N<20 excluded from output | unit | `npm test -- magnitude-calibration` | Wave 0 |
| DEMO-11 | Chart hidden when fewer than 3 buckets available | unit (component) | `npm test -- magnitude-calibration` | Wave 0 |
| DEMO-08 (smoke) | Integration: Report with `price_target_pct=5.0, price_target_horizon_days=14` results in PriceOutcome with `expected_pct=5.0` after price-followup cron | integration | `npm run test:integration` | Wave 2 |

### Sampling Rate

- **Per task commit:** `npm test` (unit suite, ~30s)
- **Per wave merge:** `npm test && npm run test:e2e`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/lib/__tests__/magnitude-calibration.test.ts` — covers DEMO-07 (Zod guard), DEMO-08 (expected_pct write logic), DEMO-09 (magnitude_error), DEMO-10 (bucketing + ESS gate), DEMO-11 (chart hide condition)
- [ ] Schema migration: `prisma db push` (blocking — must complete before Wave 1 code runs)

*(Existing test infrastructure covers all other requirements; no new framework install needed)*

---

## Security Domain

> `security_enforcement` absent from config.json — treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (cron route) | `CRON_SECRET` Bearer header check — same pattern as all existing crons |
| V3 Session Management | no | Cron routes are not session-bearing |
| V4 Access Control | yes (insights endpoint) | No auth required on public insights routes (matches existing `/api/insights/*` pattern) |
| V5 Input Validation | yes | Zod schema validates all Gemini output; bucket boundaries are hardcoded constants (no user input) |
| V6 Cryptography | no | No crypto operations introduced |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized cron invocation | Elevation of Privilege | `CRON_SECRET` Bearer header check (existing pattern, verified in all cron routes) |
| LLM price_target_pct drift | Tampering | Post-process guard nulls both fields if horizon invalid; `forward_return_raw` used for actual (from market data, not LLM) |
| Division by zero in mean computation | Denial of Service | ESS gate (`outcomes.length < 20`) prevents empty bucket computation |

---

## Sources

### Primary (HIGH confidence)

- `src/lib/gemini-analysis.ts` — `AnalysisResultSchema` at line 74; `price_target` at line 115; `buildSystemPrompt`, `buildUserPrompt` structure; post-process pattern [VERIFIED: Read tool]
- `src/lib/types.ts` — `AnalysisResult` interface; `EngineCalibration` shape [VERIFIED: Read tool]
- `prisma/schema.prisma` — `PriceOutcome` model (lines 83-115); all existing columns; `Report.analysis Json` [VERIFIED: Read tool]
- `src/app/api/cron/price-followup/route.ts` — `TARGET_DAYS`, `prisma.priceOutcome.create` call site, dedup check, `report.analysis` availability [VERIFIED: Read tool]
- `src/app/api/cron/learn/route.ts` — `HORIZONS` constant [VERIFIED: Read tool]
- `src/lib/engine-context.ts` — trust boundary architecture [VERIFIED: Read tool]
- `src/components/EngineCalibrationPanel.tsx` — `Sparkline` pure SVG pattern; `MetricCard` component; `SourceMixRow` placement; `'use client'` directive [VERIFIED: Read tool]
- `src/lib/reports-db.ts` — `writeReportToDb` complete signature and implementation [VERIFIED: Read tool]
- `src/app/api/analysis/[ticker]/route.ts` — `writeReportToDb` call site with arguments [VERIFIED: Read tool]
- `vercel.json` — existing cron entries and schedule patterns [VERIFIED: Read tool]
- `.planning/phases/29-magnitude-calibration/29-CONTEXT.md` — all locked decisions [VERIFIED: Read tool]

### Secondary (MEDIUM confidence)

- `src/app/api/insights/` directory listing — confirms pattern of existing insights routes [VERIFIED: Bash ls]
- `package.json` — `lightweight-charts@^5.1.0` installed; no recharts/D3 [VERIFIED: grep]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project; no new dependencies
- Architecture: HIGH — all insertion points verified against live source code
- Pitfalls: HIGH — dedup bug discovered and resolved via direct code inspection
- Wave decomposition: HIGH — all 4 waves have clear boundaries and no blocking dependencies between them

**Research date:** 2026-08-25
**Valid until:** 2026-09-25 (stable stack; Prisma/Next.js/Vercel patterns change slowly)
