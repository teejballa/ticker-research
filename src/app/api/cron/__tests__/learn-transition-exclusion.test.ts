/**
 * PHASE 22 Wave 0 RED stub — Wave 4 delivers GREEN.
 * Covers: D-05 (sample-relative transition-zone exclusion in posterior update path)
 *         per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Intentionally imports the Wave 4 helper `excludeTransitionZoneEvents` (or
 * the equivalent inline filter) from `src/app/api/cron/learn/route`. The export
 * does NOT exist yet → RED.
 *
 * Reference implementation contract (22-RESEARCH.md §G + Pitfall 5 + Risk R4):
 *   Filter weightedObs to DROP events where:
 *     snapshot.regime !== outcomeTimeRegime
 *   where outcomeTimeRegime is either:
 *     - read from PriceOutcome (if backfilled there), OR
 *     - computed via classifyRegimeAt({asOf: outcome.recorded_at}).
 *
 * Boundary semantics (R4):
 *   - inclusive of prediction_t, exclusive of prediction_t + horizon_days
 *   - flip ON the boundary day → EXCLUDE (strict)
 *   - NULL at either end → KEEP (no flip detectable, fail-open)
 *
 * Anti-pattern (Pitfall 5): over-exclusion that drops >30% of evidence
 * indicates a bug in boundary handling — covered by sample-size regression.
 */

import { describe, it } from 'vitest';
// Intentionally imports the Wave 4 helper so the file fails until it lands.
import { excludeTransitionZoneEvents } from '@/app/api/cron/learn/route';

describe('learn cron transition-zone exclusion — Wave 4 contract (D-05)', () => {
  it.todo('keeps event when snapshot.regime === outcome-time regime (same-regime window)');
  it.todo('excludes event when snapshot.regime !== outcome-time regime (flip mid-window)');
  it.todo('excludes event when regime flips ON the right boundary (strict per R4)');
  it.todo('keeps event when snapshot.regime is NULL (fail-open per R4)');
  it.todo('keeps event when outcome-time regime is NULL (fail-open per R4)');
  it.todo('does NOT over-exclude: same-regime fraction of test set stays > 70% on a synthetic 4-regime corpus (Pitfall 5)');
  it.todo('does NOT touch the unconditional "ALL" cell (transition exclusion is regime-conditional only)');
});

void excludeTransitionZoneEvents;
