/**
 * Phase 21.1 D-18 — z-score feature companion unit tests.
 *
 * Reference values verified by hand and cross-checked against numpy formulas:
 *   tickerRolling60dZ: mean = sum(x)/n, sample_std = sqrt(sum((x-mean)^2)/(n-1))
 *   crossSectionalZ:   same math, different vocabulary
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tickerRolling60dZ, crossSectionalZ } from '../zscore';

// ─── Reference data ──────────────────────────────────────────────────────────
// history = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
// n = 10, mean = 5.5
// variance (sample) = sum((x-5.5)^2) / 9
//   = (20.25+12.25+6.25+2.25+0.25+0.25+2.25+6.25+12.25+20.25) / 9
//   = 82.5 / 9 = 9.1667
// std = sqrt(9.1667) ≈ 3.02765
// z for value=10: (10 - 5.5) / 3.02765 ≈ 1.4863
const REFERENCE_HISTORY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const REFERENCE_MEAN = 5.5;
const REFERENCE_STD = Math.sqrt(82.5 / 9); // ≈ 3.02765
const REFERENCE_Z_AT_10 = (10 - REFERENCE_MEAN) / REFERENCE_STD; // ≈ 1.4863
const REFERENCE_Z_AT_1 = (1 - REFERENCE_MEAN) / REFERENCE_STD;   // ≈ -1.4863

describe('tickerRolling60dZ', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns correct z-score matching numpy reference for value=10', () => {
    const z = tickerRolling60dZ(10, REFERENCE_HISTORY);
    expect(z).toBeCloseTo(REFERENCE_Z_AT_10, 3);
  });

  it('returns correct z-score matching numpy reference for value=1', () => {
    const z = tickerRolling60dZ(1, REFERENCE_HISTORY);
    expect(z).toBeCloseTo(REFERENCE_Z_AT_1, 3);
  });

  it('returns correct z-score for value at mean (should be ~0)', () => {
    const z = tickerRolling60dZ(5.5, REFERENCE_HISTORY);
    expect(Math.abs(z)).toBeLessThan(1e-10);
  });

  it('returns 0 and warns when history.length < 5 (cold-start safety)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(tickerRolling60dZ(5, [])).toBe(0);
    expect(tickerRolling60dZ(5, [1])).toBe(0);
    expect(tickerRolling60dZ(5, [1, 2, 3, 4])).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy.mock.calls[0][0]).toContain('insufficient history');
  });

  it('returns 0 and warns when stdev = 0 (all-identical history)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = tickerRolling60dZ(7, [7, 7, 7, 7, 7, 7]);
    expect(result).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('zero variance'),
    );
  });

  it('returns finite non-NaN result for typical values', () => {
    const z = tickerRolling60dZ(42, [10, 20, 30, 40, 50, 60]);
    expect(Number.isFinite(z)).toBe(true);
    expect(Number.isNaN(z)).toBe(false);
  });

  it('exact n=5 boundary: returns a result (not cold-start fallback)', () => {
    const z = tickerRolling60dZ(5, [1, 2, 3, 4, 5]);
    // mean=3, std=sqrt(10/4)≈1.5811, z=(5-3)/1.5811≈1.2649
    expect(Number.isFinite(z)).toBe(true);
    expect(z).toBeCloseTo(1.2649, 3);
  });
});

describe('crossSectionalZ', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns correct z-score matching numpy reference for value=10', () => {
    const z = crossSectionalZ(10, REFERENCE_HISTORY);
    expect(z).toBeCloseTo(REFERENCE_Z_AT_10, 3);
  });

  it('returns correct z-score matching numpy reference for value=1', () => {
    const z = crossSectionalZ(1, REFERENCE_HISTORY);
    expect(z).toBeCloseTo(REFERENCE_Z_AT_1, 3);
  });

  it('returns 0 and warns when universe.length < 5 (cold-start safety)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(crossSectionalZ(5, [])).toBe(0);
    expect(crossSectionalZ(5, [1, 2])).toBe(0);
    expect(crossSectionalZ(5, [1, 2, 3, 4])).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy.mock.calls[0][0]).toContain('universe too small');
  });

  it('returns 0 and warns when stdev = 0 (all-identical universe)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = crossSectionalZ(3, [3, 3, 3, 3, 3, 3]);
    expect(result).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('zero variance'),
    );
  });

  it('returns finite non-NaN result for typical values', () => {
    const universe = [15, 25, 35, 45, 55, 65, 75];
    const z = crossSectionalZ(45, universe);
    expect(Number.isFinite(z)).toBe(true);
    expect(Number.isNaN(z)).toBe(false);
  });

  it('exact n=5 boundary: returns a result (not cold-start fallback)', () => {
    const z = crossSectionalZ(5, [1, 2, 3, 4, 5]);
    expect(Number.isFinite(z)).toBe(true);
    expect(z).toBeCloseTo(1.2649, 3);
  });

  it('symmetric: value below mean gives negative z, above gives positive z', () => {
    const universe = [10, 20, 30, 40, 50];
    const zAbove = crossSectionalZ(50, universe);
    const zBelow = crossSectionalZ(10, universe);
    expect(zAbove).toBeGreaterThan(0);
    expect(zBelow).toBeLessThan(0);
    // Symmetric around mean (30), so magnitudes equal
    expect(Math.abs(zAbove - Math.abs(zBelow))).toBeLessThan(1e-10);
  });
});
