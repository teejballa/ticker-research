// src/lib/composite/weights.ts
// Phase 24 (D-03, REASON-02). Pure helpers for CI widening + weight renormalization.

import type { SignalClass } from './compose';

/**
 * CI widening per D-03: √(4/K) factor to reflect fewer independent classes.
 * K=4 → 1.00 (no widening); K=3 → 1.155; K=2 → 1.414; K<=1 → suppressed.
 */
export function widenCi(
  point: number,
  low: number,
  high: number,
  activeK: number,
): { low: number; high: number } {
  if (activeK >= 4) return { low, high };
  if (activeK <= 1) return { low: point, high: point };
  const factor = Math.sqrt(4 / activeK);
  const halfLow = (point - low) * factor;
  const halfHigh = (high - point) * factor;
  return {
    low: Math.max(0, point - halfLow),
    high: Math.min(1, point + halfHigh),
  };
}

/**
 * Renormalize a partial weights map over active keys so they sum to 1.
 * Inactive classes are set to 0. Falls back to uniform 1/K if input weights sum to 0.
 */
export function renormalize(
  weights: Record<SignalClass, number>,
  activeKeys: SignalClass[],
): Record<SignalClass, number> {
  const CLASSES: SignalClass[] = ['diffusion', 'technical', 'institutional', 'insider'];
  const out: Record<SignalClass, number> = { diffusion: 0, technical: 0, institutional: 0, insider: 0 };
  if (activeKeys.length === 0) return out;
  const sum = activeKeys.reduce((s, k) => s + weights[k], 0);
  if (sum === 0) {
    for (const k of activeKeys) out[k] = 1 / activeKeys.length;
    return out;
  }
  for (const k of CLASSES) {
    out[k] = activeKeys.includes(k) ? weights[k] / sum : 0;
  }
  return out;
}
