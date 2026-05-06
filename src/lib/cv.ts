// src/lib/cv.ts
// Cross-validation utilities for Phase 18 hyperparameter tuning.
// Pure functions — no DB access (D-18 invariant extended from learning.ts).
//
// Purged K-Fold + Embargo cross-validation per López de Prado, Advances in
// Financial Machine Learning, §7.4. Defends against horizon-overlap leakage
// (Pitfall 3 / D-16). Used by:
//   - scripts/tune-lambda.ts          → per-class λ grid search
//   - scripts/tune-page-hinkley.ts    → per-class (δ, λ_PH) grid search
// Never used inside the daily learn cron — CV is offline tuning code path.

export interface Observation {
  recorded_at: Date;
  horizon_days: number;
  hit: boolean;
  cell_key: string;
}

export interface Fold {
  trainIdx: number[];
  testIdx: number[];
}

/**
 * Purged K-Fold + Embargo CV.
 *
 * 1. Sort observations by recorded_at.
 * 2. Split into k contiguous test folds.
 * 3. For each test fold f:
 *    - PURGE: drop training observations whose [t, t+horizon] outcome window
 *      overlaps the test fold's time range, padded by purgeDays on each side.
 *    - EMBARGO: drop training observations within embargoDays AFTER fold's tMax.
 *
 * Defaults purgeDays = embargoDays = 90 — per CONTEXT D-16, the max horizon
 * the engine learns at (90d). Override only for unit tests.
 *
 * @param obs        Observations to fold (any cell_key — caller is responsible for filtering).
 * @param k          Number of folds.
 * @param purgeDays  Default 90. Window padding on either side of the test range.
 * @param embargoDays Default 90. Post-test embargo period for training inclusion.
 */
export function purgedKFold(
  obs: Observation[],
  k: number,
  purgeDays = 90,
  embargoDays = 90,
): Fold[] {
  const sorted = [...obs].sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());
  const n = sorted.length;
  if (n === 0 || k <= 0) return [];

  const foldSize = Math.ceil(n / k);
  const dayMs = 86_400_000;
  const purgeMs = purgeDays * dayMs;
  const embargoMs = embargoDays * dayMs;

  const folds: Fold[] = [];
  for (let f = 0; f < k; f++) {
    const testStart = f * foldSize;
    const testEnd = Math.min(n, testStart + foldSize);
    if (testStart >= testEnd) continue;

    const testIdx: number[] = [];
    for (let i = testStart; i < testEnd; i++) testIdx.push(i);

    const tMin = sorted[testStart].recorded_at.getTime();
    const tMax = sorted[testEnd - 1].recorded_at.getTime();

    const trainIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i >= testStart && i < testEnd) continue;
      const ti = sorted[i].recorded_at.getTime();
      const tiOutcomeEnd = ti + sorted[i].horizon_days * dayMs;
      // Purge: training obs whose [t, t+horizon] window overlaps padded test range.
      if (tiOutcomeEnd >= tMin - purgeMs && ti <= tMax + purgeMs) continue;
      // Embargo: training obs immediately after test fold end.
      if (ti > tMax && ti < tMax + embargoMs) continue;
      trainIdx.push(i);
    }
    folds.push({ trainIdx, testIdx });
  }
  return folds;
}
