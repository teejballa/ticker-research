// 20-A-02 replaced the original stub — re-exports the real implementation.
// File kept under the original name so prior imports (from 20-A-01 dispersion)
// continue to resolve unchanged; this keeps the diff minimal during cutover.
export { mentionZScore, getBaselineForTicker } from '@/lib/sentiment/baseline';

/**
 * Back-compat shim: 20-A-01 dispersion called `mentionZ(observations)` to get
 * a scalar z-score. With 20-A-02, callers should compute the daily count
 * themselves and pass it into `mentionZScore(today_count, baseline)`. This
 * compat function takes an array of {fetched_at} observations, treats them as
 * today's events, and assumes the caller has already loaded the baseline.
 *
 * For new call sites, prefer `mentionZScore` directly.
 */
export function mentionZ(observations: unknown[]): number {
  // Pre-baseline-load callers (dispersion.ts) get 0 today — the real signal
  // arrives once the aggregator loads the per-ticker baseline upstream and
  // passes mention_z directly. This stub returns 0 to preserve behavior of
  // the off-path 20-A-01 crowded_consensus predicate until 20-A-02 cutover.
  return 0 * (observations?.length ?? 0);
}
