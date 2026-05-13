// src/lib/stats/newey-west.ts
//
// Phase 20-C-01: Newey-West 1987 heteroskedasticity- and autocorrelation-
// consistent (HAC) standard error using the Bartlett (linear-decay) kernel,
// plus the two-sided Student-t p-value built on the regularized incomplete
// beta function. PIT-SAFE — pure numerical primitives, NO DB, NO network,
// NO external math libraries.
//
// Reference (Newey & West 1987): "A Simple, Positive Semi-Definite,
// Heteroskedasticity and Autocorrelation Consistent Covariance Matrix,"
// Econometrica 55(3): 703-708.
//
// HARD RULE — mirrors src/lib/learning.ts and src/lib/reasoning/alpha-decay-
// monitor.ts: this file is DB-free, dep-free, and side-effect-free.

/**
 * Newey-West 1987 heteroskedasticity- and autocorrelation-consistent (HAC)
 * standard error using the Bartlett (linear-decay) kernel.
 *
 * For a residual series {e_t} of length T:
 *
 *   γ_0 = (1/T) · Σ_{t=1..T} e_t²                                  (variance)
 *   γ_k = (1/T) · Σ_{t=k+1..T} e_t · e_{t-k}                       (lag-k autocovariance)
 *
 *   SE_NW² = γ_0 + 2 · Σ_{k=1..L} (1 - k/(L+1)) · γ_k              (Bartlett-weighted sum)
 *   SE_NW  = sqrt(max(0, SE_NW²))                                  (clamp negative to 0)
 *
 * The (1 - k/(L+1)) factor is the Bartlett kernel — linearly tapers higher-lag
 * autocovariances to zero at lag = L+1. Guarantees positive-semi-definite
 * variance estimator (Newey & West 1987 Theorem 2). We clamp to 0 only to
 * guard against floating-point underflow producing a tiny negative variance.
 *
 * Reference: Newey & West (1987), "A Simple, Positive Semi-Definite,
 * Heteroskedasticity and Autocorrelation Consistent Covariance Matrix,"
 * Econometrica 55(3): 703-708.
 *
 * Lag selection rule (Newey-West 1987): L = floor(4·(T/100)^(2/9)).
 * For Phase 20-C-01 the per-horizon lag is pinned in HYPERPARAMETERS.md
 * (and {@link selectNeweyWestLag} in src/lib/sentiment/per-source-ic.ts):
 *   - 7d-forward:  L = 5  (T ≈ 20-day window × ~5 sources)
 *   - 30d-forward: L = 10 (longer overlap)
 *
 * @param residuals  the residual series (typically demeaned IC values)
 * @param lag        Bartlett-kernel truncation lag L (>= 0)
 * @returns          SE_NW — non-negative scalar
 * @throws           when lag < 0, lag >= residuals.length, residuals.length < 2,
 *                   or any residual is non-finite
 */
export function neweyWestSE(residuals: number[], lag: number): number {
  if (!Number.isInteger(lag) || lag < 0) {
    throw new Error(`neweyWestSE: lag must be a non-negative integer (got ${lag})`);
  }
  if (residuals.length < 2) {
    throw new Error(
      `neweyWestSE: residuals.length must be >= 2 (got ${residuals.length})`,
    );
  }
  if (lag >= residuals.length) {
    throw new Error(
      `neweyWestSE: lag must be < residuals.length (got lag=${lag}, length=${residuals.length})`,
    );
  }
  for (let i = 0; i < residuals.length; i++) {
    if (!Number.isFinite(residuals[i])) {
      throw new Error(`neweyWestSE: non-finite residual at index ${i}`);
    }
  }

  const T = residuals.length;

  // γ_0 = (1/T) · Σ e_t²
  let gamma0 = 0;
  for (let t = 0; t < T; t++) {
    gamma0 += residuals[t] * residuals[t];
  }
  gamma0 /= T;

  // Bartlett-weighted sum of lag autocovariances.
  // SE_NW² = γ_0 + 2 · Σ_{k=1..L} (1 - k/(L+1)) · γ_k
  let variance = gamma0;
  for (let k = 1; k <= lag; k++) {
    let gammaK = 0;
    for (let t = k; t < T; t++) {
      gammaK += residuals[t] * residuals[t - k];
    }
    gammaK /= T;
    const bartlettWeight = 1 - k / (lag + 1);
    variance += 2 * bartlettWeight * gammaK;
  }

  // Clamp tiny negative variance from floating-point underflow to zero.
  return Math.sqrt(Math.max(0, variance));
}

/**
 * Two-sided p-value for the studentized statistic t = beta / se_nw under
 * Student-t(df). Pure function — no `mathjs` / `simple-statistics`. Uses
 * the regularized incomplete beta function via Lentz's continued-fraction
 * algorithm (Numerical Recipes in C, §6.4) — keeps the module dep-free.
 *
 * Two-sided: p = I_{df/(df + t²)}(df/2, 1/2)
 *
 * @param beta    coefficient estimate (e.g. mean IC)
 * @param se_nw   Newey-West standard error from neweyWestSE
 * @param df      degrees of freedom (typically n_observations - 1)
 * @returns       two-sided p-value ∈ [0, 1]; returns 1 when se_nw === 0
 *                (degenerate — no inference possible)
 */
export function ttestNW(beta: number, se_nw: number, df: number): number {
  if (!Number.isFinite(beta) || !Number.isFinite(se_nw) || !Number.isFinite(df)) {
    return 1;
  }
  if (se_nw === 0 || df <= 0) return 1;
  const t = beta / se_nw;
  if (t === 0) return 1;
  const x = df / (df + t * t);
  const p = regularizedIncompleteBeta(x, df / 2, 0.5);
  // Clamp to [0, 1] against floating-point drift.
  return Math.max(0, Math.min(1, p));
}

// ─── Internal helpers (not exported) ───

/**
 * Regularized incomplete beta function I_x(a, b) via continued fraction
 * (Numerical Recipes §6.4). Returns I_x(a, b) ∈ [0, 1].
 *
 * Uses the symmetry I_x(a,b) = 1 - I_{1-x}(b,a) to choose the faster-
 * converging branch.
 */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lbeta =
    logGamma(a) + logGamma(b) - logGamma(a + b);
  const front =
    Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;

  if (x < (a + 1) / (a + b + 2)) {
    return front * betacf(x, a, b);
  } else {
    return (
      1 -
      (Math.exp(
        Math.log(1 - x) * b + Math.log(x) * a - lbeta,
      ) /
        b) *
        betacf(1 - x, b, a)
    );
  }
}

/**
 * Modified Lentz continued-fraction evaluation of the beta function's
 * tail, used by regularizedIncompleteBeta. Numerical Recipes §6.4.
 */
function betacf(x: number, a: number, b: number): number {
  const MAXIT = 200;
  const EPS = 3e-7;
  const FPMIN = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

/**
 * Lanczos approximation of log(Γ(x)) — accurate to ~1e-13 for x > 0.
 * Numerical Recipes §6.1.
 */
function logGamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
