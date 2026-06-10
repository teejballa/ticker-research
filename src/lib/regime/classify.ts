/**
 * Phase 22 D-02..D-04 — Pure functional regime classifier.
 *
 * SINGLE source of truth for the 4-bucket regime label.
 * Called by BOTH:
 *   - /api/cron/sentiment-scan      (forward write path; Wave 1)
 *   - /api/cron/backfill-regime     (historical backfill path; Wave 2)
 *
 * There is NO parallel/forked regime logic — train/serve skew defense per
 * CLAUDE.md rule #6. Any change to regime semantics touches ONLY this file.
 *
 * Cold-start fail-open (D-09 step 3): when either input helper returns null,
 * `classifyRegimeAt` returns `{ regime: 'ALL', vix_level: null, vix_60d_percentile: null,
 * spy_ma_50_minus_200: null }`. Downstream readers honor the D-09 fallback chain
 * `(source, regime) → (source, 'ALL') → 1.0` so the cron still writes a labeled row.
 *
 * Boundary semantics (per D-03 + D-04):
 *   - trend = spy.ma50_minus_ma200 >= 0 ? 'bull' : 'bear'      // D-03 sign(0)=+
 *   - vol   = vix.percentile_60d >= 0.5 ? 'high-vol' : 'low-vol'  // D-04 strict >=
 *
 * @knowable_at args.asOf — caller passes the snapshot's PIT date; no forward data used.
 */

import { getVix60dPercentile } from './vix-percentile';
import { getSpyMaCross } from './ma-cross';
import { REGIME_HYPERPARAMETERS } from './hyperparameters';
import type { RegimeResult, RegimeLabel } from './types';

export type { RegimeResult, RegimeLabel } from './types';

export interface ClassifyRegimeArgs {
  /** PIT date for the classification. Caller MUST NOT pass a forward-looking date. */
  asOf: Date;
}

/**
 * Pure functional regime classifier — D-02 (4 buckets) × D-03 (trend) × D-04 (vol)
 * with D-09 cold-start fallback to `'ALL'`.
 *
 * Calls both input helpers in parallel via `Promise.all` (independent IO).
 *
 * @knowable_at args.asOf — caller passes the prediction-time date; no forward
 *   data is used. The vol axis trailing-60d window is self-excluded; the trend
 *   axis MA window ends at `asOf`'s own close.
 */
export async function classifyRegimeAt(args: ClassifyRegimeArgs): Promise<RegimeResult> {
  const [vix, spy] = await Promise.all([
    getVix60dPercentile(args.asOf),
    getSpyMaCross(args.asOf),
  ]);

  // D-09 step 3 — any null input → cold-start 'ALL' (fail-open).
  if (vix == null || spy == null) {
    return {
      regime: 'ALL',
      vix_level: null,
      vix_60d_percentile: null,
      spy_ma_50_minus_200: null,
    };
  }

  const trend: 'bull' | 'bear' =
    spy.ma50_minus_ma200 >= 0 ? 'bull' : 'bear'; // D-03 sign(0)=+

  const vol: 'low-vol' | 'high-vol' =
    vix.percentile_60d >= REGIME_HYPERPARAMETERS.vix_percentile_threshold
      ? 'high-vol'
      : 'low-vol'; // D-04 strict >=

  const regime = `${trend}-${vol}` as RegimeLabel;

  return {
    regime,
    vix_level: vix.level,
    vix_60d_percentile: vix.percentile_60d,
    spy_ma_50_minus_200: spy.ma50_minus_ma200,
  };
}
