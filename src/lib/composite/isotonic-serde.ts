// src/lib/composite/isotonic-serde.ts
// Phase 24 (Wave 1 helper). (De)serialize isotonic curves for storage
// in CompositeCalibrationSnapshot.isotonic_curves JSON column.

import { isotonicRegression } from '@/lib/stats/isotonic';

export interface IsotonicCurveJSON {
  x_breakpoints: number[];  // sorted ascending
  y_values: number[];       // same length; monotone non-decreasing
}

export function fitAndSerialize(x: number[], y: number[]): IsotonicCurveJSON {
  const pred = isotonicRegression(x, y);
  const uniqueX = Array.from(new Set(x)).sort((a, b) => a - b);
  return { x_breakpoints: uniqueX, y_values: uniqueX.map(pred) };
}

export function deserialize(json: IsotonicCurveJSON): (x: number) => number {
  const { x_breakpoints, y_values } = json;
  if (x_breakpoints.length === 0) {
    throw new Error('deserialize: empty isotonic curve');
  }
  return (xq: number) => {
    if (xq <= x_breakpoints[0]) return y_values[0];
    if (xq >= x_breakpoints[x_breakpoints.length - 1]) return y_values[y_values.length - 1];
    // Binary search for largest breakpoint <= xq
    let lo = 0;
    let hi = x_breakpoints.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1;
      if (x_breakpoints[mid] <= xq) lo = mid;
      else hi = mid;
    }
    return y_values[lo];
  };
}
