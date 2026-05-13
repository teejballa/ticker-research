import { describe, it, expect } from 'vitest';
import { pairedBlockBootstrapSharpeDiff } from './paired-bootstrap';

function makeSeries(n: number, fn: (i: number) => number): number[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

describe('pairedBlockBootstrapSharpeDiff (plan 20-C-05)', () => {
  it('defaults nResamples to exactly 1000', () => {
    const r = pairedBlockBootstrapSharpeDiff({
      seriesA: makeSeries(30, () => 1),
      seriesB: makeSeries(30, () => 0),
    });
    expect(r.nResamples).toBe(1000);
  });

  it('defaults blockSize to exactly 7', () => {
    const r = pairedBlockBootstrapSharpeDiff({
      seriesA: makeSeries(30, () => 1),
      seriesB: makeSeries(30, () => 0),
    });
    expect(r.blockSize).toBe(7);
  });

  it('bootstrapDeltas.length === 1000 literal on defaults', () => {
    const r = pairedBlockBootstrapSharpeDiff({
      seriesA: makeSeries(30, () => 1),
      seriesB: makeSeries(30, () => 0),
    });
    expect(r.bootstrapDeltas.length).toBe(1000);
  });

  it('constant +1 vs constant 0 → observedDelta=1, CI lower > 0', () => {
    const r = pairedBlockBootstrapSharpeDiff({
      seriesA: makeSeries(10, () => 1),
      seriesB: makeSeries(10, () => 0),
    });
    expect(r.observedDelta).toBeCloseTo(1.0, 9);
    expect(r.ci95Lower).toBeGreaterThan(0);
  });

  it('identical series → observedDelta=0, CI straddles 0', () => {
    const series = makeSeries(30, (i) => Math.sin(i));
    const r = pairedBlockBootstrapSharpeDiff({
      seriesA: series.slice(),
      seriesB: series.slice(),
    });
    expect(r.observedDelta).toBe(0);
    expect(r.ci95Lower).toBeLessThanOrEqual(0);
    expect(r.ci95Upper).toBeGreaterThanOrEqual(0);
  });

  it('throws when seriesA.length !== seriesB.length', () => {
    expect(() =>
      pairedBlockBootstrapSharpeDiff({
        seriesA: [1, 2, 3],
        seriesB: [1, 2],
      }),
    ).toThrow(/pairing|length/i);
  });

  it('determinism: same seed → byte-identical bootstrapDeltas', () => {
    const seriesA = makeSeries(50, (i) => 0.1 * i + Math.sin(i));
    const seriesB = makeSeries(50, (i) => 0.1 * i + Math.cos(i));
    const r1 = pairedBlockBootstrapSharpeDiff({ seriesA, seriesB, seed: 42 });
    const r2 = pairedBlockBootstrapSharpeDiff({ seriesA, seriesB, seed: 42 });
    expect(r1.bootstrapDeltas).toEqual(r2.bootstrapDeltas);
  });

  it('block bootstrap is wider than iid bootstrap on AR(1) phi=0.8 data', () => {
    // Generate AR(1) series with phi=0.8 — strong positive autocorrelation
    const rng = (() => {
      let s = 12345 >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    function gauss(): number {
      // Box-Muller
      const u = Math.max(rng(), 1e-12);
      const v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    const n = 100;
    const phi = 0.8;
    const a: number[] = [gauss()];
    const b: number[] = [gauss()];
    for (let i = 1; i < n; i++) {
      a.push(phi * a[i - 1] + gauss());
      b.push(phi * b[i - 1] + gauss());
    }
    const blockResult = pairedBlockBootstrapSharpeDiff({
      seriesA: a,
      seriesB: b,
      blockSize: 7,
      seed: 7,
    });
    const iidResult = pairedBlockBootstrapSharpeDiff({
      seriesA: a,
      seriesB: b,
      blockSize: 1, // iid bootstrap is block-bootstrap with block_size=1
      seed: 7,
    });
    const blockWidth = blockResult.ci95Upper - blockResult.ci95Lower;
    const iidWidth = iidResult.ci95Upper - iidResult.ci95Lower;
    expect(blockWidth).toBeGreaterThan(iidWidth);
  });

  it('percentile method: ci95Lower = sorted[24], ci95Upper = sorted[974]', () => {
    const seriesA = makeSeries(30, (i) => 0.01 * i);
    const seriesB = makeSeries(30, () => 0);
    const r = pairedBlockBootstrapSharpeDiff({ seriesA, seriesB, seed: 1 });
    const sorted = r.bootstrapDeltas.slice().sort((x, y) => x - y);
    expect(r.ci95Lower).toBe(sorted[24]);
    expect(r.ci95Upper).toBe(sorted[974]);
  });

  it('pValueTwoSided in [0,1]; equals 1.0 when delta = 0 in expectation', () => {
    const r = pairedBlockBootstrapSharpeDiff({
      seriesA: makeSeries(30, () => 0),
      seriesB: makeSeries(30, () => 0),
    });
    expect(r.pValueTwoSided).toBeGreaterThanOrEqual(0);
    expect(r.pValueTwoSided).toBeLessThanOrEqual(1);
    // All deltas exactly 0 → both belowZero and aboveZero are 1000 → 2 * min(1, 1) = 2 → clamped to 1
    expect(r.pValueTwoSided).toBe(1);
  });
});
