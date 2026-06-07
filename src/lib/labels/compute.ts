/**
 * Phase 21.1 D-17 — Shared label compute path.
 *
 * SINGLE source of truth for computing ALL THREE PriceOutcome labels:
 *   - is_directional_hit  (D-15): beat sector by > 0%
 *   - is_sigma_hit_k1     (D-14): beat sector by ≥ k·σ (k=1, 60d sector ETF σ) — PRIMARY
 *   - is_hit_flat1        (D-16): beat sector by ≥ 1% flat — TERTIARY diagnostic
 *
 * Called by BOTH:
 *   - /api/cron/relabel    (one-shot backfill path)
 *   - /api/cron/price-followup (forward creation path)
 *
 * There is NO parallel/forked label logic — train/serve skew defense per
 * CLAUDE.md rule #6. Any change to label semantics touches ONLY this file.
 *
 * Snapshot discipline (D-17 anti-drift): sector_sigma_60d is computed at
 * call time and returned for the caller to persist on PriceOutcome. It is
 * never re-derived from a stored snapshot — the caller persists it and it
 * is frozen thereafter (mirrors Phase 21 sector_etf snapshot pattern).
 *
 * @knowable_at  args.asOf — caller passes the row's recorded_at; no forward data used
 */

import { getSectorSigma60d } from '@/lib/data/sector-mapping';
import { classifyHit } from '@/lib/learning';

export interface LabelInputs {
  /** The sector ETF resolved at prediction time (e.g. 'XLK'). Null → all labels null. */
  sector_etf: string | null;
  /** The as-of date for the sector sigma lookup (typically PriceOutcome.recorded_at). */
  asOf: Date;
  /** Absolute ticker return over the window, in percentage-points. */
  ticker_return_pct: number;
  /** SPY return over the same window, in percentage-points. Null when unavailable. */
  spy_return_pct: number | null;
  /**
   * Sector-relative return = ticker_return - sector_return, in percentage-points.
   * Null when the sector ETF return could not be fetched.
   */
  sector_relative_pct: number | null;
}

export interface ComputedLabels {
  /** D-15: secondary diagnostic — did ticker beat sector by > 0%? */
  is_directional_hit: boolean | null;
  /** D-14 PRIMARY: did ticker beat sector by ≥ k·σ (k=1, 60d rolling σ)? */
  is_sigma_hit_k1: boolean | null;
  /** D-16 tertiary: did ticker beat sector by ≥ 1% flat (back-compat)? */
  is_hit_flat1: boolean | null;
  /** 60-day rolling sample stdev of sector ETF daily returns (decimal, e.g. 0.012). */
  sector_sigma_60d: number | null;
}

/**
 * Compute all three PriceOutcome labels + snapshot the 60d sector sigma.
 *
 * Idempotent: calling twice with the same args produces the same result.
 * Safe to call from both backfill (relabel) and forward (price-followup) paths.
 */
export async function computeLabelsFor(args: LabelInputs): Promise<ComputedLabels> {
  // Snapshot sector_sigma_60d at compute time (D-17 anti-drift discipline).
  const sector_sigma_60d = args.sector_etf
    ? await getSectorSigma60d(args.sector_etf, args.asOf)
    : null;

  // D-15: directional — beat sector by > 0%
  const is_directional_hit =
    args.sector_relative_pct != null ? args.sector_relative_pct > 0 : null;

  // D-14 PRIMARY: σ-aware k=1 — requires both sector_relative_pct and sigma
  const is_sigma_hit_k1 =
    sector_sigma_60d != null && args.sector_relative_pct != null
      ? classifyHit({
          ticker_return_pct: args.ticker_return_pct,
          spy_return_pct: args.spy_return_pct,
          sector_relative_pct: args.sector_relative_pct,
          sector_sigma: sector_sigma_60d,
          k: 1,
        })
      : null;

  // D-16 TERTIARY: 1% flat threshold — back-compat with existing dashboards
  const is_hit_flat1 =
    args.sector_relative_pct != null
      ? classifyHit({
          ticker_return_pct: args.ticker_return_pct,
          spy_return_pct: args.spy_return_pct,
          sector_relative_pct: args.sector_relative_pct,
          threshold_pct: 1,
        })
      : null;

  return { is_directional_hit, is_sigma_hit_k1, is_hit_flat1, sector_sigma_60d };
}
