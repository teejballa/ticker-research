/**
 * PHASE 22 Wave 0 RED stub — Wave 5 delivers GREEN.
 * Covers: D-14 (Brier-lift + BCa CI done-gate over regime-flipped cells)
 *         per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Intentionally imports the Wave 5 helper `regimeDoneGate` from
 * `../regime-done-gate`. The module does NOT exist yet → RED.
 *
 * Reference implementation contract (22-RESEARCH.md §I):
 *   interface DoneGateResult {
 *     promoted_cells: Array<{
 *       cell_key: string;
 *       regime: RegimeLabel;
 *       brier_lift: number;
 *       ci_low: number;
 *       ci_high: number;
 *     }>;
 *     n_promoted: number;
 *     n_evaluated: number;
 *   }
 *   export function regimeDoneGate(cellEvals: CellEvalResult[]): DoneGateResult
 *
 * Gate semantics (D-14):
 *   For every (cell_key) with BOTH a regime-specific row AND an 'ALL' row:
 *     brier_lift = brier_all - brier_regime
 *     bca = bootstrapBCa({nResamples: 10000, alpha: 0.05})
 *     PROMOTE if bca.point > 0.005 AND bca.low > 0.
 *   Aggregate count is the headline P22 gate metric (CONTEXT D-16:
 *   0 promoted is a valid IS-paper null finding).
 *
 * Reuses P21.1's BCa primitive at src/lib/evaluation/bootstrap.ts.
 */

import { describe, it } from 'vitest';
// Intentionally imports the Wave 5 helper so the file fails until it lands.
import { regimeDoneGate } from '../regime-done-gate';

describe('regimeDoneGate — Wave 5 contract (D-14)', () => {
  it.todo('promotes regime-flipped cell when brier_lift > 0.005 AND BCa 95% CI low > 0');
  it.todo('does NOT promote when brier_lift > 0.005 but BCa CI includes 0 (uncertain lift)');
  it.todo('does NOT promote when brier_lift <= 0.005 (under-threshold per BRIER_LIFT_THRESHOLD)');
  it.todo('uses 10_000 BCa resamples per cell (matches P21.1 precedent)');
  it.todo('skips cells lacking either a regime-specific row OR an "ALL" row (incomplete pair)');
  it.todo('n_promoted = 0 is a valid output (D-16 honest null finding) — does NOT throw');
  it.todo('compares against the LIVE "ALL" row from the same relearn (Q7 same-fold apples-to-apples)');
});

void regimeDoneGate;
