/**
 * Phase 21.1 D-18 — z-score feature companions.
 *
 * Two transforms over base features:
 *   - tickerRolling60dZ: each base feature vs the same ticker's own 60-day history
 *   - crossSectionalZ:   each base feature within today's BACKFILL_UNIVERSE
 *
 * The engine's logistic moves from 12 features → 36 features:
 *   12 base + 12 ticker-rolling-z + 12 cross-sectional-z
 *
 * Both functions are pure. They take precomputed history / universe vectors;
 * the caller is responsible for assembling those slices PIT-correctly
 * (no future data must appear in history60d or universeValues).
 *
 * Cold-start safety: when history or universe is too small (n < 5), both
 * functions return 0 and log a warning. This keeps the 36-feature vector
 * valid even in cold-start conditions — the z-score dimensions simply
 * contribute no signal (same as a zero-initialized weight).
 *
 * Zero-variance safety: when stdev = 0 (all history/universe values identical),
 * both functions return 0 and log a warning rather than returning Inf/NaN.
 */

/**
 * Ticker-relative 60-day rolling z-score.
 *
 * Computes (value - mean(history60d)) / stdev(history60d) using the
 * sample standard deviation (n-1 denominator) of the provided history.
 *
 * The caller must ensure history60d contains ONLY observations ending at
 * or before the decision timestamp — no forward data.
 *
 * @knowable_at  history60d's most recent date (caller ensures no forward leakage)
 */
export function tickerRolling60dZ(value: number, history60d: number[]): number {
  if (history60d.length < 5) {
    console.warn(
      `[tickerRolling60dZ] insufficient history (n=${history60d.length}); returning 0`,
    );
    return 0;
  }
  const n = history60d.length;
  const mean = history60d.reduce((a, b) => a + b, 0) / n;
  const variance = history60d.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) {
    console.warn(`[tickerRolling60dZ] zero variance; returning 0`);
    return 0;
  }
  return (value - mean) / std;
}

/**
 * Cross-sectional z-score within today's universe.
 *
 * Computes (value - mean(universeValues)) / stdev(universeValues) using the
 * sample standard deviation (n-1 denominator) of the provided universe slice.
 *
 * The caller must ensure universeValues contains ONLY observations at or
 * before asOf — no future-dated universe members.
 *
 * @knowable_at  asOf (universeValues must be observed strictly before/at asOf)
 */
export function crossSectionalZ(value: number, universeValues: number[]): number {
  if (universeValues.length < 5) {
    console.warn(
      `[crossSectionalZ] universe too small (n=${universeValues.length}); returning 0`,
    );
    return 0;
  }
  const n = universeValues.length;
  const mean = universeValues.reduce((a, b) => a + b, 0) / n;
  const variance = universeValues.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) {
    console.warn(`[crossSectionalZ] zero variance; returning 0`);
    return 0;
  }
  return (value - mean) / std;
}
