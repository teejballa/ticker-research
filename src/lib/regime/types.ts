/**
 * Phase 22 D-02 — Regime label types.
 *
 * SINGLE source of truth for the 5-literal regime union (4 buckets + 'ALL' cold-start).
 *
 * There is NO parallel/forked regime label set — train/serve skew defense per
 * CLAUDE.md rule #6. Anywhere a `regime` string appears (SentimentSnapshot.regime,
 * LearnedPattern.regime, PerSourceIC.regime, SourceTier.regime, LearningEvent.regime)
 * it MUST be a member of `RegimeLabel`.
 */

/**
 * 4-bucket regime per D-02 (bull/bear trend × low-vol/high-vol vol) plus the
 * 'ALL' cold-start fallback per D-09 step 3. Industry-standard 2×2 structure
 * (Hamilton 1989, Ang & Bekaert 2002).
 */
export type RegimeLabel =
  | 'bull-low-vol'
  | 'bull-high-vol'
  | 'bear-low-vol'
  | 'bear-high-vol'
  | 'ALL';

/**
 * Frozen audit array of the 4 non-cold-start regime labels. Order is stable
 * so consumers (hierarchical FDR, dashboards) can index deterministically.
 */
export const ACTIVE_REGIME_LABELS = [
  'bull-low-vol',
  'bull-high-vol',
  'bear-low-vol',
  'bear-high-vol',
] as const satisfies readonly RegimeLabel[];

/**
 * Audit-only inputs the classifier captures alongside the label so future readers
 * can verify the regime decision was based on knowable-at-asOf data. Stored on
 * SentimentSnapshot.regime_vix_level / regime_vix_pctile / regime_ma_diff.
 */
export interface RegimeInputs {
  /** Raw VIX close at asOf. Null when no VIX history resolved (cold-start). */
  vix_level: number | null;
  /** Rolling 60d 50th-percentile rank of VIX. Null on cold-start. Range [0, 1]. */
  vix_60d_percentile: number | null;
  /** SPY MA50 − MA200 in price units. Null on cold-start. Sign drives the trend axis. */
  spy_ma_50_minus_200: number | null;
}

/**
 * Final classifier output: the discrete regime + the audit numerics.
 * Persisted as `{regime, regime_vix_level, regime_vix_pctile, regime_ma_diff}`
 * on every SentimentSnapshot at scan time (CORE-ML-08).
 */
export interface RegimeResult extends RegimeInputs {
  regime: RegimeLabel;
}
