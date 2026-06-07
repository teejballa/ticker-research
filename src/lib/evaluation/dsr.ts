/**
 * Deflated Sharpe Ratio (DSR)
 *
 * Corrects the Sharpe Ratio for multiple testing and non-normality
 * of returns (skewness and excess kurtosis), following the procedure
 * of Bailey & López de Prado 2014.
 *
 * Reference: Bailey & López de Prado 2014, J. Portfolio Management
 *   40(5):94-107 "The Deflated Sharpe Ratio: Correcting for Selection
 *   Bias, Backtest Overfitting, and Non-Normality"
 *
 * Also cited: CS229 main notes (evaluation metrics, proper scoring rules)
 *
 * Integration note (per RESEARCH.md §2.3 and Wave 6 HYPERPARAMETERS.md):
 * The `sampleSharpe` argument should be computed from raw forward
 * sector-relative returns (not binary hit-stream) — that choice is
 * documented in HYPERPARAMETERS.md and made at the `learn` cron call site
 * (Wave 4). This primitive only accepts a pre-computed Sharpe.
 *
 * Hand-rolled — no external dependencies.
 * Uses normalCdf imported from bootstrap.ts (single source of truth).
 */

import { normalCdf } from './bootstrap';

/** Euler–Mascheroni constant (γ ≈ 0.5772) used in the Gumbel max approximation. */
const EULER_MASCHERONI = 0.5772156649015329;

/**
 * Deflated Sharpe Ratio per Bailey & López de Prado 2014.
 *
 * Formula:
 *   σ_SR̂ = √((1 − γ₃·SR̂ + (γ₄−1)/4·SR̂²) / (T−1))
 *   E[max SR₀] ≈ √(2·ln N) − γ_EM / √(2·ln N)     (Gumbel max approx)
 *   SR₀ = σ_SR̂ · E[max SR₀]
 *   DSR  = Φ((SR̂ − SR₀) / σ_SR̂)
 *
 * where γ_EM = Euler–Mascheroni constant ≈ 0.5772 and γ₃, γ₄ are the
 * skewness and raw kurtosis of the strategy return series respectively.
 *
 * @param args.sampleSharpe   - Sample Sharpe ratio SR̂ (annualised or per-period)
 * @param args.skewness       - Skewness γ₃ of the returns stream
 * @param args.kurtosis       - Raw kurtosis γ₄ (NOT excess; we convert internally)
 * @param args.T              - Number of return observations
 * @param args.nTrialsAttempted - N: number of independent strategies tried;
 *                               stored as LearnedPattern.n_trials_attempted
 * @returns DSR ∈ [0,1] — probability that the true Sharpe exceeds SR₀;
 *          null when T < 30 (insufficient sample for reliable skew/kurtosis estimates)
 *
 * Special cases:
 *  - T < 30: return null with logged warning
 *  - N = 1: SR₀ = 0 → DSR = Φ(SR̂ / σ_SR̂)  (plain Sharpe significance test)
 *  - N = 0: treated as N = 1 (single trial)
 *
 * Reference: Bailey & López de Prado 2014, J. Portfolio Management 40(5):94-107
 * Gumbel max approximation: asymptotic expected maximum of N standard-normal
 * variates (see also Efron & Hastie "Computer Age Statistical Inference" Ch. 11).
 */
export function deflatedSharpeRatio(args: {
  sampleSharpe: number;
  skewness: number;
  kurtosis: number; // raw kurtosis; excess kurtosis = kurtosis - 3
  T: number;
  nTrialsAttempted: number;
}): number | null {
  const { sampleSharpe: SR, skewness: gamma3, kurtosis, T, nTrialsAttempted } = args;

  // Guard: insufficient sample for reliable higher-moment estimates
  if (T < 30) {
    console.warn(
      `[dsr] T=${T} < 30 — insufficient sample for DSR computation, returning null`,
    );
    return null;
  }

  const N = Math.max(nTrialsAttempted, 1); // treat 0 trials as 1

  // Step 1: Standard error of the sample Sharpe (non-normal correction)
  // σ_SR̂ = √((1 − γ₃·SR̂ + (γ₄−1)/4·SR̂²) / (T−1))
  // Note: (γ₄−1)/4 uses raw kurtosis γ₄; for normal returns (γ₄=3), this
  // reduces to (3−1)/4·SR̂² = SR̂²/2 which matches the standard formula.
  const gamma4 = kurtosis; // raw kurtosis
  const variance_sr = (1 - gamma3 * SR + ((gamma4 - 1) / 4) * SR * SR) / (T - 1);

  // Guard: negative variance_sr (can occur with extreme skewness + large SR)
  if (variance_sr <= 0) {
    console.warn('[dsr] Computed σ_SR̂² ≤ 0 — degenerate inputs, returning null');
    return null;
  }

  const sigma_sr = Math.sqrt(variance_sr);

  // Step 2: Benchmark SR₀ — expected maximum under null hypothesis
  // For N = 1: no multiple-testing penalty, SR₀ = 0
  let SR0: number;
  if (N <= 1) {
    SR0 = 0;
  } else {
    // Gumbel max approximation: E[max of N standard-normal variates]
    // ≈ √(2·ln N) − γ_EM / √(2·ln N)
    // Then SR₀ = σ_SR̂ · E[max]
    // (Asymptotic result for iid normal; holds approximately for dependent cells
    //  under common-shock dependence structure — conservative approximation)
    const sqrt2lnN = Math.sqrt(2 * Math.log(N));
    const expectedMaxSR = sqrt2lnN - EULER_MASCHERONI / sqrt2lnN;
    SR0 = sigma_sr * expectedMaxSR;
  }

  // Step 3: DSR = Φ((SR̂ − SR₀) / σ_SR̂)
  const z = (SR - SR0) / sigma_sr;
  return normalCdf(z);
}
