/**
 * Phase 30.1 — Engagement-tier calibration primitives (D-19).
 *
 * Pure-function module shared by:
 *   - scripts/calibrate-engagement-tiers.ts  (Prisma I/O + CLI)
 *   - tests/lib/evaluation/tier-calibration.unit.test.ts  (fixture-driven unit tests)
 *
 * Keeping the comparison logic pure (no Prisma / IO) makes it unit-testable
 * without DB fixtures and lets `npm run calibrate-tiers --dry-run` execute
 * the comparison core without touching the DB.
 *
 * Per CLAUDE.md §Statistical-Methods Reference load-bearing rule #2:
 *   "Calibration is a first-class metric, not an afterthought."
 * This module lives in src/lib/evaluation/ alongside the planned
 * src/lib/evaluation/calibration.ts and src/lib/evaluation/significance.ts.
 *
 * Calibration constraint (CONTEXT.md D-19): tier distribution under the new
 * Reddit+HN engagement thresholds must match the historical Firecrawl-era
 * distribution within ±10 percentage points per tier before cutover.
 */

/**
 * Counts of observations falling into each engagement tier, plus a precomputed
 * total. `total` is supplied by the caller (rather than computed as
 * `high + medium + low`) so that callers can normalize against denominators
 * that include rows with missing fields without re-deriving them here.
 */
export interface Distribution {
  high: number;
  medium: number;
  low: number;
  total: number;
}

/**
 * Per-tier comparison row produced by `compareDistributions`. `delta_pp` is
 * signed (actual − target). `within_tolerance` is `true` when
 * `|delta_pp| <= tolerancePP`.
 */
export interface CalibrationResult {
  tier: 'high' | 'medium' | 'low';
  actual_pct: number;
  target_pct: number;
  delta_pp: number;
  within_tolerance: boolean;
}

/**
 * Compute a per-tier percentage breakdown of a Distribution. Returns 0 for
 * every tier when `total <= 0` (zero-total guard — no division by zero).
 */
function toPercentages(d: Distribution): { high: number; medium: number; low: number } {
  if (d.total <= 0) {
    return { high: 0, medium: 0, low: 0 };
  }
  return {
    high: (d.high / d.total) * 100,
    medium: (d.medium / d.total) * 100,
    low: (d.low / d.total) * 100,
  };
}

/**
 * Compare an `actual` engagement-tier distribution against a `target`
 * distribution (e.g. the historical Firecrawl-era baseline). Emits one
 * `CalibrationResult` per tier with the signed percentage-point delta and
 * an in-tolerance flag.
 *
 * @param actual       Observed distribution from the 7-day shadow soak.
 * @param target       Baseline distribution to calibrate against.
 * @param tolerancePP  Max absolute percentage-point delta accepted as
 *                     "preserves historical distribution". Defaults to 10 per
 *                     CONTEXT.md D-19. The boundary is INCLUSIVE — a tier
 *                     whose `|delta_pp|` is exactly `tolerancePP` is
 *                     considered within tolerance.
 */
export function compareDistributions(
  actual: Distribution,
  target: Distribution,
  tolerancePP: number = 10,
): CalibrationResult[] {
  const actualPct = toPercentages(actual);
  const targetPct = toPercentages(target);
  const tiers: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];
  return tiers.map((tier) => {
    const actual_pct = actualPct[tier];
    const target_pct = targetPct[tier];
    const delta_pp = actual_pct - target_pct;
    return {
      tier,
      actual_pct,
      target_pct,
      delta_pp,
      within_tolerance: Math.abs(delta_pp) <= tolerancePP,
    };
  });
}

/**
 * Convenience predicate: does every tier in the comparison fall within the
 * configured tolerance band? Used by the calibration CLI to choose between
 * exit code 0 (ship) and exit code 2 (retune thresholds).
 */
export function allWithinTolerance(results: CalibrationResult[]): boolean {
  return results.every((r) => r.within_tolerance);
}

/**
 * Convenience accessor: max absolute `delta_pp` across all tiers in a
 * comparison. Returned as a positive number; 0 when the comparison is empty.
 */
export function maxAbsDelta(results: CalibrationResult[]): number {
  if (results.length === 0) return 0;
  return Math.max(...results.map((r) => Math.abs(r.delta_pp)));
}
