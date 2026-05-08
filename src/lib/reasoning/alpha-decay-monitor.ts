// src/lib/reasoning/alpha-decay-monitor.ts
//
// Phase 19-A-05 (D-21): Pure-function module computing the rolling 20-day
// Spearman rank-IC and the alpha-decay confirmed/cleared transitions.
//
// HARD RULE — same as src/lib/learning.ts: this file is DB-free. No Prisma
// import, no @/lib/db. The cron route at src/app/api/cron/alpha-decay-watch
// is the ONLY caller that talks to the database; this module is pure
// numerical primitives only.
//
// Reference (RESEARCH.md "Anti-overfitting trifecta + IC monitor"):
//   Reddit / social signal alpha decay is HOURS, not days. The 20-day
//   rolling Spearman IC is the tripwire for the *engine-level* signal
//   classes (diffusion, technical, insider, institutional). Below 0.02 for
//   5 consecutive days → ic_decay_flag set → 19-Z-04 model-card-status
//   surfaces it on /insights and the EngineCalibrationPanel.

/**
 * Spearman rank-IC: Pearson correlation of the ranks of two equal-length
 * vectors. Insensitive to monotone transformations of the inputs (unlike
 * Pearson) — the right metric for "do my predictions order outcomes
 * correctly?" without committing to a linear model.
 *
 * Uses midrank (average rank) for ties — preserves zero-sum-of-ranks even
 * under heavy ties (e.g. tied-at-0 returns when SPY = ticker close to flat).
 *
 * @returns IC in [-1, 1]. Returns 0 when inputs have < 2 elements (no rank
 * structure) or when one vector is constant (zero variance — Pearson
 * denominator goes to 0; we avoid the NaN by short-circuiting).
 *
 * @throws when arrays have different lengths (caller bug — we don't try to
 * silently truncate).
 */
export function rollingSpearmanIC(args: {
  predictions: number[];
  realizedReturns: number[];
}): number {
  if (args.predictions.length !== args.realizedReturns.length) {
    throw new Error(
      `rollingSpearmanIC: arrays must be same length (got predictions=${args.predictions.length}, realizedReturns=${args.realizedReturns.length})`,
    );
  }
  if (args.predictions.length < 2) return 0;

  const rankP = midrankArray(args.predictions);
  const rankR = midrankArray(args.realizedReturns);
  return pearsonCorrelation(rankP, rankR);
}

/**
 * Convert a numeric vector to its midranks (1-indexed). Ties receive the
 * average of the ranks they would have occupied in a strict ordering.
 *
 * Example: [10, 20, 20, 30] → ranks [1, 2.5, 2.5, 4]. The two 20s would
 * have occupied ranks 2 and 3; midrank = (2+3)/2 = 2.5.
 */
function midrankArray(xs: number[]): number[] {
  const indexed = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(xs.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    // Walk forward as long as the next value equals the current value.
    while (j < indexed.length - 1 && indexed[j + 1].v === indexed[i].v) {
      j++;
    }
    // Midrank is the average of the 1-indexed positions [i+1 .. j+1].
    const midrank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].i] = midrank;
    }
    i = j + 1;
  }
  return ranks;
}

/**
 * Pearson correlation. Returns 0 (not NaN) when either vector has zero
 * variance — keeps callers free of NaN handling.
 */
function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  if (n === 0) return 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

/**
 * D-21: ic_decay_flag = true when rolling_ic_20d < `threshold` for
 * `consecutiveDays` consecutive days. Default threshold = 0.02, default
 * window = 5 days (per CONTEXT.md D-21).
 *
 * Reads the **last** `consecutiveDays` entries of `rollingICs` (assumed
 * chronologically ordered, oldest first). Returns false when the history is
 * too short — we never confirm decay on insufficient evidence.
 */
export function isDecayConfirmed(
  rollingICs: number[],
  threshold: number = 0.02,
  consecutiveDays: number = 5,
): boolean {
  if (rollingICs.length < consecutiveDays) return false;
  const tail = rollingICs.slice(-consecutiveDays);
  return tail.every((ic) => ic < threshold);
}

/**
 * D-21: ic_decay_flag clears (false) when rolling_ic_20d recovers to
 * `>= threshold` for `consecutiveDays` consecutive days. Default
 * `consecutiveDays = 3` — symmetric, faster recovery than confirmation
 * because the false-negative cost is asymmetric (a stuck-true flag silently
 * suppresses Engine Calibration injection).
 *
 * Returns false when history is too short — we never clear a flag on
 * insufficient evidence (the flag's default-true bias is intentional;
 * clearing must be explicit).
 */
export function isDecayCleared(
  rollingICs: number[],
  threshold: number = 0.02,
  consecutiveDays: number = 3,
): boolean {
  if (rollingICs.length < consecutiveDays) return false;
  const tail = rollingICs.slice(-consecutiveDays);
  return tail.every((ic) => ic >= threshold);
}
