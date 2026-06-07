/**
 * Information Coefficient (IC) — Spearman rank correlation between
 * predictions and realized returns.
 *
 * Standard quant convention: Grinold & Kahn "Active Portfolio Management" §3
 * recommends Spearman IC as the primary measure of signal quality.
 *
 * Tie handling: "fractional" (average-rank) method, matching
 * scipy.stats.spearmanr default behavior. This is essential for
 * Buy/Hold/Sell predictions where Hold (score=0) is common.
 *
 * References:
 * - Grinold & Kahn, "Active Portfolio Management" §3 (Spearman as standard)
 * - scipy.stats.spearmanr 1.13 default fractional tie handling
 *
 * Hand-rolled — no external dependencies.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute average-rank (fractional) ranks for an array of values.
 * Tied values receive the mean of their tied positions (1-indexed).
 *
 * Matches scipy.stats.rankdata(method='average') behavior.
 */
function rankWithTies(values: number[]): number[] {
  const n = values.length;
  // Create index array sorted by value
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => values[a] - values[b],
  );

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    // Find extent of this tie group
    let j = i;
    while (j < n - 1 && values[order[j]] === values[order[j + 1]]) {
      j++;
    }
    // Assign average rank (1-indexed: positions i+1 .. j+1)
    const avgRank = (i + 1 + j + 1) / 2; // mean of 1-indexed positions
    for (let k = i; k <= j; k++) {
      ranks[order[k]] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

/**
 * Pearson correlation between two equal-length numeric arrays.
 * Returns NaN when either standard deviation is zero.
 */
function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((a, v) => a + v, 0) / n;
  const my = y.reduce((a, v) => a + v, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const sigX = Math.sqrt(varX);
  const sigY = Math.sqrt(varY);

  if (sigX < 1e-12 || sigY < 1e-12) return NaN;
  return cov / (sigX * sigY);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ICMethod = 'spearman' | 'pearson';

/**
 * Information Coefficient: Spearman (or Pearson) correlation between
 * predictions and realized returns.
 *
 * @param predictions - Signal scores (e.g., Buy=1, Hold=0, Sell=-1)
 * @param returns - Forward realized returns aligned by row
 * @param method - 'spearman' (default, rank-based) | 'pearson' (raw values)
 * @returns Correlation coefficient ∈ [-1, 1], or NaN with console.warn if:
 *          - n < 10 (insufficient sample)
 *          - All predictions identical (σ = 0)
 *
 * Reference: Grinold & Kahn "Active Portfolio Management" §3 (Spearman IC
 * as standard quant convention); tie handling matches scipy.stats.spearmanr.
 */
export function informationCoefficient(
  predictions: number[],
  returns: number[],
  method: ICMethod = 'spearman',
): number {
  const n = predictions.length;

  if (n !== returns.length) {
    throw new Error(`[ic] predictions and returns length mismatch: ${n} vs ${returns.length}`);
  }

  if (n < 10) {
    console.warn(`[ic] insufficient sample n=${n} — returning NaN`);
    return NaN;
  }

  if (method === 'pearson') {
    const rho = pearson(predictions, returns);
    if (isNaN(rho)) {
      console.warn('[ic] all predictions identical (σ=0) — returning NaN');
    }
    return rho;
  }

  // Spearman: Pearson correlation on ranks (with average-rank tie handling)
  const xRanks = rankWithTies(predictions);
  const yRanks = rankWithTies(returns);
  const rho = pearson(xRanks, yRanks);

  if (isNaN(rho)) {
    console.warn('[ic] all predictions identical (σ=0) — returning NaN');
  }
  return rho;
}

// ---------------------------------------------------------------------------
// Rolling IC
// ---------------------------------------------------------------------------

export interface RollingICPoint {
  t: Date;
  ic: number;
  n: number;
}

/**
 * Compute rolling Information Coefficient over a sliding window.
 *
 * @param rows - Array of {t, pred, ret} sorted or unsorted (sorted internally)
 * @param windowDays - Look-back window in calendar days
 * @returns One RollingICPoint per unique date in the input
 *
 * Used by the D-10 rolling LLM IC tile in the Insights dashboard.
 * When a window has n < 10 rows, ic = NaN is still emitted (n is reported).
 */
export function rollingIC<T extends { t: Date; pred: number; ret: number }>(
  rows: T[],
  windowDays: number,
): RollingICPoint[] {
  if (rows.length === 0) return [];

  // Sort by date ascending
  const sorted = [...rows].sort((a, b) => a.t.getTime() - b.t.getTime());
  const msPerDay = 86400_000;
  const windowMs = windowDays * msPerDay;

  const result: RollingICPoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const currentT = sorted[i].t;
    const cutoffT = currentT.getTime() - windowMs;

    // Collect rows in window (t > cutoff, t <= current)
    const windowRows = sorted.filter(
      (r) => r.t.getTime() > cutoffT && r.t.getTime() <= currentT.getTime(),
    );

    const preds = windowRows.map((r) => r.pred);
    const rets = windowRows.map((r) => r.ret);
    const n = windowRows.length;

    // informationCoefficient emits NaN for n<10 — suppress the warning in rolling context
    let ic: number;
    if (n < 10) {
      ic = NaN;
    } else {
      ic = informationCoefficient(preds, rets, 'spearman');
    }

    result.push({ t: currentT, ic, n });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Per-signal-class IC
// ---------------------------------------------------------------------------

/**
 * Compute IC broken down by signal_class.
 *
 * @param rows - Array of {signal_class, pred, ret}
 * @returns One entry per unique signal_class, sorted by |ic| descending
 *
 * Used by the D-29 per-signal-class IC table in the Insights dashboard.
 */
export function perSignalClassIC<
  T extends { signal_class: string; pred: number; ret: number },
>(rows: T[]): Array<{ signal_class: string; ic: number; n: number }> {
  // Group by signal_class
  const groups = new Map<string, { preds: number[]; rets: number[] }>();

  for (const row of rows) {
    if (!groups.has(row.signal_class)) {
      groups.set(row.signal_class, { preds: [], rets: [] });
    }
    const g = groups.get(row.signal_class)!;
    g.preds.push(row.pred);
    g.rets.push(row.ret);
  }

  const result: Array<{ signal_class: string; ic: number; n: number }> = [];

  for (const [signal_class, { preds, rets }] of groups) {
    const n = preds.length;
    let ic: number;
    if (n < 10) {
      ic = NaN;
    } else {
      ic = informationCoefficient(preds, rets, 'spearman');
    }
    result.push({ signal_class, ic, n });
  }

  // Sort by |ic| descending (NaN goes last)
  result.sort((a, b) => {
    const absA = isNaN(a.ic) ? -1 : Math.abs(a.ic);
    const absB = isNaN(b.ic) ? -1 : Math.abs(b.ic);
    return absB - absA;
  });

  return result;
}
