/**
 * Phase 22 Wave 5 — D-14 regime done-gate.
 *
 * Computes per-cell Brier-lift = brier_ALL - brier_regime, applies
 * bootstrapBCa (n=10_000, α=0.05) to get a 95% CI, and promotes a cell
 * when point > 0.005 AND the CI low > 0 (excludes zero).
 *
 * References:
 *   - Efron 1987 JASA 82(397) — BCa bootstrap (via bootstrap.ts)
 *   - Phase 22 D-14 (22-CONTEXT.md) — done-gate specification
 *   - Phase 21.1 BRIER_LIFT_THRESHOLD (P21.1 precedent) — same 0.005 constant
 *   - CLAUDE.md rule #3 — every reported number gets a CI
 *
 * @knowable_at  every input CellEvalResult carries its own PIT via horizon_days + regime
 *               grouping — no temporal leakage. The pairing (regime cell vs same-fold ALL cell)
 *               is Q7-compliant (same-fold apples-to-apples).
 */
import { bootstrapBCa, type BCaResult } from './bootstrap';
import type { RegimeLabel } from '@/lib/regime/types';

/**
 * D-14 magnitude threshold — matches P21.1 BRIER_LIFT_THRESHOLD by design so
 * the "regime cell earned its sparsity cost" bar is the same as the "logistic
 * baseline earned its edge claim" bar in Phase 21.1.
 */
export const BRIER_LIFT_THRESHOLD = 0.005;

/**
 * Number of BCa resamples per cell. Matches the P21.1 precedent
 * (bootstrapBCa call sites in engine-context.ts, dsr.ts).
 */
export const BCA_N_RESAMPLES = 10_000;

/**
 * Minimal shape of a per-cell evaluation result consumed by the done-gate.
 * Structurally compatible with the CellEvalResult defined inside the learn
 * cron (src/app/api/cron/learn/route.ts) — deliberately does NOT import from
 * that route file (Next.js App Router forbids arbitrary named exports on
 * route.ts).
 *
 * The done-gate needs only 5 fields per row: the 4-tuple that identifies a
 * cell group, plus the per-observation Brier-score series that lets us pair
 * (regime, ALL) rows and compute a per-observation lift.
 */
export interface DoneGateInputRow {
  signal_class: string;
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
  regime: RegimeLabel;
  /**
   * Per-observation Brier scores for this cell, in the same order as the
   * matching 'ALL' row for the same 4-tuple. Length must match the paired
   * 'ALL' row's series length; unpaired series lengths cause the pair to be
   * skipped (see logic below).
   */
  brier_series: number[];
}

export interface PromotedCell {
  signal_class: string;
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
  regime: RegimeLabel;
  brier_lift: BCaResult;
}

export interface DoneGateResult {
  promoted_cells: PromotedCell[];
  total_evaluated: number;
  threshold_used: typeof BRIER_LIFT_THRESHOLD;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let acc = 0;
  for (const x of xs) acc += x;
  return acc / xs.length;
}

/**
 * Phase 22 D-14 done-gate.
 *
 * Groups input rows by (signal_class, pattern_key, cap_class, horizon_days).
 * For each group that has BOTH a regime-specific row AND a matching 'ALL'
 * row, computes:
 *   brier_lift_series[i] = brier_ALL[i] - brier_regime[i]
 * Applies bootstrapBCa (n=10_000, α=0.05) to the paired series.
 *
 * A cell is PROMOTED when:
 *   result.point > BRIER_LIFT_THRESHOLD (0.005)  AND
 *   result.low   > 0                             (CI excludes zero)
 *
 * A cell is DEMOTED (not returned in promoted_cells) when either condition
 * fails — including the honest null-finding case per D-16 (n_promoted = 0
 * is a valid IS-paper outcome).
 *
 * Empty input → { promoted_cells: [], total_evaluated: 0 } (no throw).
 * Unpaired regime rows (no matching 'ALL' row for same 4-tuple) → skipped.
 * Series-length mismatch between regime and ALL rows → skipped (no promotion,
 * counted in total_evaluated so operators see it in the composite report).
 */
export function regimeDoneGate(cellEvals: DoneGateInputRow[]): DoneGateResult {
  const groups = new Map<string, { all?: DoneGateInputRow; regimes: DoneGateInputRow[] }>();

  for (const row of cellEvals) {
    const key = `${row.signal_class}::${row.pattern_key}::${row.cap_class}::${row.horizon_days}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = { regimes: [] };
      groups.set(key, bucket);
    }
    if (row.regime === 'ALL') {
      bucket.all = row;
    } else {
      bucket.regimes.push(row);
    }
  }

  const promoted: PromotedCell[] = [];
  let totalEvaluated = 0;

  for (const bucket of groups.values()) {
    const allRow = bucket.all;
    if (!allRow) continue; // Q7: same-fold ALL row required — skip incomplete pairs.

    for (const regimeRow of bucket.regimes) {
      // Series-length mismatch means the two rows didn't cover the same
      // observation pool → not apples-to-apples per Q7 → skip promotion.
      // Still counted as evaluated so the composite report sees it.
      totalEvaluated += 1;
      if (regimeRow.brier_series.length !== allRow.brier_series.length) {
        continue;
      }
      if (regimeRow.brier_series.length === 0) {
        continue;
      }

      const liftSeries = allRow.brier_series.map(
        (bAll, i) => bAll - regimeRow.brier_series[i],
      );

      const bca = bootstrapBCa(liftSeries, mean, {
        nResamples: BCA_N_RESAMPLES,
        alpha: 0.05,
      });

      const promotedByMagnitude = bca.point > BRIER_LIFT_THRESHOLD;
      const promotedByCI = bca.low > 0;

      if (promotedByMagnitude && promotedByCI) {
        promoted.push({
          signal_class: regimeRow.signal_class,
          pattern_key: regimeRow.pattern_key,
          cap_class: regimeRow.cap_class,
          horizon_days: regimeRow.horizon_days,
          regime: regimeRow.regime,
          brier_lift: bca,
        });
      }
    }
  }

  return {
    promoted_cells: promoted,
    total_evaluated: totalEvaluated,
    threshold_used: BRIER_LIFT_THRESHOLD,
  };
}
