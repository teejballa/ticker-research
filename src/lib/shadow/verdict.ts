// src/lib/shadow/verdict.ts
//
// Phase 19 / Plan 19-Z-03 — verdict() pure function over ShadowComparison aggregates.
// Implements D-11/12/13 PASS/FAIL/HOLD thresholds.
//
// Cost regression (D-12) is RATIO-based: cost_new / cost_old > 1.5 → FAIL.
// verdict() computes the ratio internally; the rule is skipped when either
// cost is null OR old <= 0 (cannot compute ratio safely).
//
// PASS rule (D-11): non-regression on every metric (not average).
// FAIL rule (D-12): any one of (quality regression | latency p95 ≥ 2× old |
//   cost ratio > 1.5× | disagreement ≥ 5%) trips.
// HOLD rule (D-13): n_rows < 200 AND quality_measurable=false.

export type VerdictResult = 'PASS' | 'FAIL' | 'HOLD';

/**
 * VerdictMetrics — caller passes BOTH old + new absolute cost (USD/request).
 *
 * Cost regression rule (D-12): FAIL when cost_new / cost_old > 1.5
 *   - Skipped (no cost gate fired) when EITHER cost is null OR old <= 0.
 *   - The CLI in scripts/shadow-verdict.ts is responsible for averaging
 *     per-row cost into these aggregate fields.
 */
export interface VerdictMetrics {
  n_rows: number;
  latency_p50_old_ms: number;
  latency_p95_old_ms: number;
  latency_p50_new_ms: number;
  latency_p95_new_ms: number;
  cost_old_baseline_usd_per_request: number | null;
  cost_new_usd_per_request: number | null;
  output_disagreement_rate: number;
  quality_delta: number | null;
  quality_measurable: boolean;
}

export const VERDICT_THRESHOLDS = {
  /** D-12: FAIL when latency_p95_new_ms / latency_p95_old_ms ≥ 2.0 */
  LATENCY_P95_REGRESSION_RATIO: 2.0,
  /** D-12: FAIL when cost_new / cost_old > 1.5 (strict ratio) */
  COST_REGRESSION_RATIO: 1.5,
  /** D-11: FAIL when output_disagreement_rate ≥ 0.05 */
  DISAGREEMENT_THRESHOLD: 0.05,
  /** D-13: HOLD when n_rows < this AND quality_measurable=false */
  MIN_ROWS_FOR_VERDICT: 200,
} as const;

export interface Verdict {
  result: VerdictResult;
  reasons: string[];
}

export function verdict(m: VerdictMetrics): Verdict {
  const reasons: string[] = [];

  // FAIL rule 1 — quality regression (D-12).
  // Only gates when quality is measurable AND delta is known to be < 0.
  if (m.quality_measurable && m.quality_delta !== null && m.quality_delta < 0) {
    reasons.push(`quality regressed: delta=${m.quality_delta}`);
  }

  // FAIL rule 2 — latency p95 regression (D-12). new_p95 ≥ 2× old_p95 trips.
  if (m.latency_p95_old_ms > 0) {
    const p95Ratio = m.latency_p95_new_ms / m.latency_p95_old_ms;
    if (p95Ratio >= VERDICT_THRESHOLDS.LATENCY_P95_REGRESSION_RATIO) {
      reasons.push(
        `latency p95 regression ${p95Ratio.toFixed(2)}× old (new=${m.latency_p95_new_ms}ms, old=${m.latency_p95_old_ms}ms)`,
      );
    }
  }

  // FAIL rule 3 — cost regression (D-12). Strictly ratio-based: cost_new / cost_old > 1.5.
  // Skip when ratio cannot be computed safely (null cost OR old <= 0).
  if (
    m.cost_old_baseline_usd_per_request !== null &&
    m.cost_new_usd_per_request !== null &&
    m.cost_old_baseline_usd_per_request > 0
  ) {
    const costRatio = m.cost_new_usd_per_request / m.cost_old_baseline_usd_per_request;
    if (costRatio > VERDICT_THRESHOLDS.COST_REGRESSION_RATIO) {
      reasons.push(
        `cost regression: new=${m.cost_new_usd_per_request} old=${m.cost_old_baseline_usd_per_request} ratio=${costRatio.toFixed(2)}× > 1.5×`,
      );
    }
  }

  // FAIL rule 4 — output disagreement (D-11). ≥ 5% disagreement trips.
  if (m.output_disagreement_rate >= VERDICT_THRESHOLDS.DISAGREEMENT_THRESHOLD) {
    reasons.push(
      `disagreement ${(m.output_disagreement_rate * 100).toFixed(1)}% ≥ ${(VERDICT_THRESHOLDS.DISAGREEMENT_THRESHOLD * 100).toFixed(0)}%`,
    );
  }

  if (reasons.length > 0) {
    return { result: 'FAIL', reasons };
  }

  // HOLD rule (D-13) — insufficient rows AND quality unmeasurable.
  if (m.n_rows < VERDICT_THRESHOLDS.MIN_ROWS_FOR_VERDICT && !m.quality_measurable) {
    return {
      result: 'HOLD',
      reasons: [
        `only ${m.n_rows} rows (< ${VERDICT_THRESHOLDS.MIN_ROWS_FOR_VERDICT}) AND quality unmeasurable — extend window`,
      ],
    };
  }

  // PASS rule (D-11) — non-regression on every metric.
  return { result: 'PASS', reasons: ['all gates green'] };
}
