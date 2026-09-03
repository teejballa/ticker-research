// src/lib/magnitude-calibration.ts
// Phase 29 (D-01, D-03, D-04, D-05, DEMO-07, DEMO-09, DEMO-10, DEMO-11).
// Pure helpers: price-target guard, bucketing, magnitude_error computation,
// ESS gate, chart render decision. No DB or LLM imports — safe for vitest.
// Consumed by:
//   - src/lib/gemini-analysis.ts (applyPriceTargetGuard, VALID_PRICE_TARGET_HORIZONS)
//   - src/app/api/cron/price-followup/route.ts (computeMagnitudeError)
//   - src/app/api/cron/magnitude-calibration/route.ts (BUCKETS, assignBucket, computeBucketMean, applyEssGate)
//   - src/components/MagnitudeCalibrationTile.tsx (chartRenderDecision, indirect via tile)

// ─── Price-target horizon guard (Wave 1 / DEMO-07) ───────────────────────────

export const VALID_PRICE_TARGET_HORIZONS = [3, 7, 14, 30, 60, 90] as const;

/**
 * Mutates `parsed` in-place: nulls BOTH price_target_pct and
 * price_target_horizon_days when the horizon is not in
 * [3, 7, 14, 30, 60, 90]. Prevents LLM drift (e.g. horizon = 5 or 100).
 * Exported for direct unit testing without loading gemini-analysis.ts.
 */
export function applyPriceTargetGuard(parsed: {
  price_target_pct?: number | null;
  price_target_horizon_days?: number | null;
}): void {
  const h = parsed.price_target_horizon_days;
  if (h != null && !(VALID_PRICE_TARGET_HORIZONS as readonly number[]).includes(h)) {
    parsed.price_target_pct = null;
    parsed.price_target_horizon_days = null;
  }
}

// ─── Bucketing (Wave 3 / DEMO-10) ────────────────────────────────────────────

export interface BucketDef {
  readonly label: string;
  readonly expectedMidpoint: number;
  readonly minPct: number | null; // null = unbounded below
  readonly maxPct: number | null; // null = unbounded above
}

export const BUCKETS: readonly BucketDef[] = [
  { label: '< -5%',  expectedMidpoint: -7.5, minPct: null, maxPct: -5  },
  { label: '-5→0%',  expectedMidpoint: -2.5, minPct: -5,   maxPct: 0   },
  { label: '0→5%',   expectedMidpoint:  2.5, minPct: 0,    maxPct: 5   },
  { label: '5→10%',  expectedMidpoint:  7.5, minPct: 5,    maxPct: 10  },
  { label: '> 10%',  expectedMidpoint: 12.5, minPct: 10,   maxPct: null },
] as const;

/**
 * Assign a bucket by expected_pct value using half-open [minPct, maxPct) ranges.
 * null maxPct = unbounded above; null minPct = unbounded below.
 * Throws if no bucket matches (should never happen — buckets cover the real line).
 */
export function assignBucket(expected_pct: number): BucketDef {
  for (const b of BUCKETS) {
    const geMin = b.minPct == null || expected_pct >= b.minPct;
    const ltMax = b.maxPct == null || expected_pct < b.maxPct;
    if (geMin && ltMax) return b;
  }
  throw new Error(`assignBucket: no bucket matched expected_pct=${expected_pct}`);
}

// ─── Magnitude error (Wave 2 / DEMO-09) ──────────────────────────────────────

/**
 * Compute magnitude_error = forward_return_raw - expected_pct.
 * Returns null when any precondition is unmet (D-03).
 */
export function computeMagnitudeError(args: {
  forward_return_raw: number | null;
  expected_pct: number | null | undefined;
  expected_horizon_days: number | null | undefined;
  days_after: number;
}): number | null {
  if (args.expected_pct == null) return null;
  if (args.expected_horizon_days == null) return null;
  if (args.expected_horizon_days !== args.days_after) return null;
  if (args.forward_return_raw == null) return null;
  return args.forward_return_raw - args.expected_pct;
}

// ─── Bucket aggregation helpers (Wave 3 / DEMO-10) ───────────────────────────

/**
 * Arithmetic mean. Not defensive against empty arrays —
 * ESS gate (applyEssGate) is expected to run upstream.
 */
export function computeBucketMean(values: number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Filter bucket-aggregate rows by n >= threshold (D-04 ESS gate, default 20).
 */
export function applyEssGate<T extends { n: number }>(rows: T[], threshold: number = 20): T[] {
  return rows.filter(r => r.n >= threshold);
}

// ─── Chart render decision (Wave 3 / DEMO-11) ────────────────────────────────

/**
 * Returns 'render' when >= 3 buckets meet the ESS gate, else 'insufficient'.
 * UI shows "Insufficient data — forecasts accumulating" in the insufficient case.
 */
export function chartRenderDecision(buckets: unknown[]): 'render' | 'insufficient' {
  return buckets.length >= 3 ? 'render' : 'insufficient';
}
