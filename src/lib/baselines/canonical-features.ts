/**
 * Phase 21.1 D-11 — canonical small-feature-set logistic baseline.
 *
 * The "lit-cited classics" baseline. Tests whether the LLM beats a 7-feature
 * logistic on features the literature consensus says matter:
 *
 *   - RSI-14:                  Lo & Hasanhodzic 2010, "The Evolution of Technical Analysis"
 *   - MACD histogram:          Brock-Lakonishok-LeBaron 1992; widely used
 *   - sentiment %:             De Bondt & Thaler 1985 (sentiment overreaction)
 *   - insider net flow:        Cohen-Malloy-Pomorski 2012
 *   - institutional net flow:  Wermers 1999
 *   - put/call ratio:          Pan & Poteshman 2006
 *   - sector return:           Lakonishok-Shleifer-Vishny 1994 / DGTW 1997 (sector control)
 *
 * Strongest "LLM beats lit-cited features" head-to-head per CONTEXT D-11.
 * Both baselines train on the PRIMARY sigma_k1 label (D-14) to match the engine.
 */

/**
 * Ordered list of canonical feature names — LOCKED per D-11.
 * Order matches the 7-element vector returned by buildCanonicalFeatures.
 * Do NOT reorder — LogisticState.weights positions are index-stable.
 */
export const CANONICAL_FEATURE_NAMES = [
  'rsi_14',                 // @knowable_at  snapshot.scanned_at — Lo & Hasanhodzic 2010
  'macd_hist',              // @knowable_at  snapshot.scanned_at — Brock-Lakonishok-LeBaron 1992
  'sentiment_pct',          // @knowable_at  snapshot.scanned_at — De Bondt & Thaler 1985
  'insider_net_flow',       // @knowable_at  snapshot.scanned_at — Cohen-Malloy-Pomorski 2012
  'institutional_net_flow', // @knowable_at  snapshot.scanned_at — Wermers 1999
  'put_call_ratio',         // @knowable_at  snapshot.scanned_at — Pan & Poteshman 2006
  'sector_return',          // @knowable_at  snapshot.scanned_at — DGTW 1997 / LSV 1994
] as const;

export type CanonicalFeatureName = typeof CANONICAL_FEATURE_NAMES[number];

/**
 * Shape contract for the 7 canonical features at training/scoring time.
 *
 * All fields carry @knowable_at annotations — the cron route (Task 3) is
 * responsible for joining SentimentSnapshot + PriceOutcome fields into this
 * shape. This interface is intentionally agnostic of the DB model so the
 * math layer stays pure.
 *
 * @knowable_at  snapshot.scanned_at for ALL fields below (caller's invariant)
 */
export interface CanonicalSnapshot {
  /** @knowable_at  snapshot.scanned_at — RSI-14 from TechnicalSnapshot.rsi_14 */
  rsi_14: number | null;

  /** @knowable_at  snapshot.scanned_at — MACD histogram from TechnicalSnapshot.macd_histogram */
  macd_hist: number | null;

  /** @knowable_at  snapshot.scanned_at — StockTwits bull% at snapshot time (0-100 scale) */
  sentiment_pct: number | null;

  /** @knowable_at  snapshot.scanned_at — Quiver insider net buy USD prior 30d (from insider_data JSON) */
  insider_net_flow: number | null;

  /** @knowable_at  snapshot.scanned_at — Quiver 13F net institutional flow prior quarter (from institutional_data JSON) */
  institutional_net_flow: number | null;

  /** @knowable_at  snapshot.scanned_at — put/call ratio from yahoo options chain at snapshot time */
  put_call_ratio: number | null;

  /** @knowable_at  snapshot.scanned_at — sector ETF prior 5d return (sector_return from community_data or derived) */
  sector_return: number | null;
}

/**
 * Build the 7-element canonical feature vector from a CanonicalSnapshot.
 *
 * Returns 0 for any missing or non-finite feature (cold-start safety).
 * Emits a console.warn for each substitution so callers can detect data gaps.
 *
 * Pure function — no IO.
 *
 * @knowable_at  snapshot.scanned_at (all inputs must be PIT-correct at that timestamp)
 */
export function buildCanonicalFeatures(snapshot: CanonicalSnapshot): number[] {
  const vec: number[] = [];
  for (const name of CANONICAL_FEATURE_NAMES) {
    const v = snapshot[name as CanonicalFeatureName];
    if (v == null || !Number.isFinite(v)) {
      console.warn(`[buildCanonicalFeatures] missing or non-finite "${name}"; substituting 0`);
      vec.push(0);
    } else {
      vec.push(v);
    }
  }
  return vec;
}
