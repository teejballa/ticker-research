/**
 * Plan 20-C-05 — Paired block-bootstrap Sharpe-difference CI.
 *
 * Politis-Romano (1994) moving-block bootstrap for paired per-fold Sharpe
 * sequences (joint-features vs sentiment-alone). Block size = 7 days, larger
 * than the 5-day forecast horizon — preserves autocorrelation that an iid
 * bootstrap would discard, producing wider, honest CIs.
 *
 * Threat mitigations:
 *   T-20-C-05-03: autocorrelation handled via block bootstrap
 *   T-20-C-05-04: hard-coded `1000` resamples and `7`-day block size literals
 *                 so promotion-gate tests can assert them
 *
 * Pairing discipline: the SAME block start indices are used for seriesA and
 * seriesB on every resample. This makes the two resampled series paired and
 * the difference (mean(A) - mean(B)) properly accounts for cross-correlation.
 */

export interface PairedBootstrapResult {
  /** mean(seriesA) - mean(seriesB) on the actual (un-resampled) data. */
  observedDelta: number;
  /** length = nResamples (exactly 1000 on the default code path). */
  bootstrapDeltas: number[];
  /** 2.5th percentile of bootstrapDeltas. */
  ci95Lower: number;
  /** 97.5th percentile of bootstrapDeltas. */
  ci95Upper: number;
  /** 7 on the default code path (Politis-Romano stationary block bootstrap). */
  blockSize: number;
  /** 1000 on the default code path. */
  nResamples: number;
  /** 2 × min(P(delta ≤ 0), P(delta ≥ 0)), clamped to [0, 1]. */
  pValueTwoSided: number;
}

/** Mulberry32 — small seeded PRNG. 8 lines, no dependencies. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/**
 * Block-bootstrap paired Sharpe-difference CI.
 *
 * @param seriesA - joint-feature per-fold Sharpe sequence
 * @param seriesB - sentiment-alone per-fold Sharpe sequence (same fold indices)
 * @param nResamples - default 1000 — FIXED LITERAL — see plan 20-C-05 T-20-C-05-04
 * @param blockSize - default 7 — 7-day block — see plan 20-C-05 T-20-C-05-03
 *                    (Politis-Romano stationary block bootstrap, block > forecast horizon 5d)
 * @param seed - PRNG seed for deterministic tests
 */
export function pairedBlockBootstrapSharpeDiff(args: {
  seriesA: number[];
  seriesB: number[];
  nResamples?: number;
  blockSize?: number;
  seed?: number;
}): PairedBootstrapResult {
  const nResamples = args.nResamples ?? 1000; // FIXED LITERAL — see plan 20-C-05 T-20-C-05-04
  const blockSize = args.blockSize ?? 7; // 7-day block — see plan 20-C-05 T-20-C-05-03 (Politis-Romano stationary block bootstrap, block > forecast horizon 5d)
  const seed = args.seed ?? 20260510;
  const { seriesA, seriesB } = args;

  if (seriesA.length !== seriesB.length) {
    throw new Error(
      `pairedBlockBootstrapSharpeDiff: seriesA.length (${seriesA.length}) !== seriesB.length (${seriesB.length}) — pairing requires identical fold indices`,
    );
  }
  const n = seriesA.length;
  if (n === 0) {
    throw new Error('pairedBlockBootstrapSharpeDiff: empty series');
  }
  if (blockSize < 1 || !Number.isInteger(blockSize)) {
    throw new Error(`pairedBlockBootstrapSharpeDiff: blockSize must be int ≥ 1, got ${blockSize}`);
  }

  const observedDelta = mean(seriesA) - mean(seriesB);

  const rng = mulberry32(seed);
  // Number of blocks needed to cover n samples
  const nBlocks = Math.ceil(n / blockSize);
  // Valid block start indices: [0, n - blockSize] inclusive when n >= blockSize,
  // otherwise just [0] (wrap is not used in moving-block; we truncate the series instead).
  const maxStartExclusive = Math.max(1, n - blockSize + 1);

  const bootstrapDeltas: number[] = new Array(nResamples);
  for (let i = 0; i < nResamples; i++) {
    // SAME block starts for seriesA AND seriesB — paired sampling
    const starts: number[] = new Array(nBlocks);
    for (let b = 0; b < nBlocks; b++) {
      starts[b] = Math.floor(rng() * maxStartExclusive);
    }
    let sumA = 0;
    let sumB = 0;
    let count = 0;
    outer: for (let b = 0; b < nBlocks; b++) {
      const start = starts[b];
      for (let j = 0; j < blockSize; j++) {
        const idx = start + j;
        if (idx >= n) break;
        sumA += seriesA[idx];
        sumB += seriesB[idx];
        count++;
        if (count >= n) break outer;
      }
    }
    bootstrapDeltas[i] = sumA / count - sumB / count;
  }

  // Percentile method: sort, then index 24 (2.5th of 1000, 0-indexed) and 974
  // (97.5th of 1000, 0-indexed). Per plan 20-C-05 Task 2 test 9 literal:
  //   ci95Lower = sorted[Math.floor(0.025 * nResamples) - 1]  (1-based 25th → 0-indexed 24)
  //   ci95Upper = sorted[Math.floor(0.975 * nResamples) - 1]  (1-based 975th → 0-indexed 974)
  const sorted = bootstrapDeltas.slice().sort((a, b) => a - b);
  const lowerIdx = Math.max(0, Math.floor(0.025 * nResamples) - 1);
  const upperIdx = Math.max(0, Math.floor(0.975 * nResamples) - 1);
  const ci95Lower = sorted[lowerIdx];
  const ci95Upper = sorted[upperIdx];

  // Two-sided p-value: 2 × min(P(delta ≤ 0), P(delta ≥ 0))
  let belowZero = 0;
  let aboveZero = 0;
  for (const d of bootstrapDeltas) {
    if (d <= 0) belowZero++;
    if (d >= 0) aboveZero++;
  }
  const pBelow = belowZero / nResamples;
  const pAbove = aboveZero / nResamples;
  const pValueTwoSided = Math.max(0, Math.min(1, 2 * Math.min(pBelow, pAbove)));

  return {
    observedDelta,
    bootstrapDeltas,
    ci95Lower,
    ci95Upper,
    blockSize,
    nResamples,
    pValueTwoSided,
  };
}
