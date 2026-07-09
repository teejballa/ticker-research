/**
 * PHASE 22 Wave 5 GREEN — was Wave 0 RED stub; now delivers assertions.
 *
 * Covers: D-14 (Brier-lift + BCa CI done-gate over regime-flipped cells)
 * per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Gate semantics (D-14):
 *   For every 4-tuple (signal_class, pattern_key, cap_class, horizon_days)
 *   with BOTH a regime-specific row AND an 'ALL' row:
 *     brier_lift[i] = brier_all[i] - brier_regime[i]
 *     bca = bootstrapBCa(brier_lift, mean, n=10_000, α=0.05)
 *     PROMOTE if bca.point > 0.005 AND bca.low > 0.
 *
 *   n_promoted = 0 is a valid output (D-16 honest null finding).
 *
 * Reuses P21.1's BCa primitive at src/lib/evaluation/bootstrap.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  regimeDoneGate,
  BRIER_LIFT_THRESHOLD,
  BCA_N_RESAMPLES,
  type DoneGateInputRow,
} from '../regime-done-gate';

/**
 * Fixture builder — constructs a paired (regime, ALL) input where the
 * regime row is `deltaPerObs` better than ALL on every observation, plus a
 * Gaussian-ish noise term with SD `noiseSd`. Deterministic via seed-like
 * numeric transform on i so the tests are reproducible without a PRNG.
 */
function pairedRows(opts: {
  regime: DoneGateInputRow['regime'];
  n: number;
  deltaPerObs: number;
  noiseSd?: number;
  signal_class?: string;
  pattern_key?: string;
  cap_class?: string;
  horizon_days?: number;
}): [DoneGateInputRow, DoneGateInputRow] {
  const {
    regime,
    n,
    deltaPerObs,
    noiseSd = 0,
    signal_class = 'diffusion',
    pattern_key = 'niche_lead',
    cap_class = 'small',
    horizon_days = 7,
  } = opts;

  // Simple deterministic noise (Box-Muller flavored, seeded via i).
  const noiseAt = (i: number): number => {
    if (noiseSd === 0) return 0;
    const u1 = ((i * 2654435761) % 1_000_000) / 1_000_000 + 1e-6;
    const u2 = ((i * 40503) % 1_000_000) / 1_000_000 + 1e-6;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z * noiseSd;
  };

  const brier_all = Array.from({ length: n }, (_, i) => 0.20 + noiseAt(i));
  const brier_regime = Array.from(
    { length: n },
    (_, i) => 0.20 - deltaPerObs + noiseAt(i + 10_000),
  );

  const allRow: DoneGateInputRow = {
    signal_class,
    pattern_key,
    cap_class,
    horizon_days,
    regime: 'ALL',
    brier_series: brier_all,
  };
  const regimeRow: DoneGateInputRow = {
    signal_class,
    pattern_key,
    cap_class,
    horizon_days,
    regime,
    brier_series: brier_regime,
  };
  return [allRow, regimeRow];
}

describe('regimeDoneGate — Wave 5 contract (D-14)', () => {
  it('promotes regime-flipped cell when brier_lift > 0.005 AND BCa 95% CI low > 0', () => {
    // Regime cell is 0.012 better per observation (well above threshold),
    // low noise so the BCa CI is clearly above 0.
    const [allRow, regimeRow] = pairedRows({
      regime: 'bear-high-vol',
      n: 200,
      deltaPerObs: 0.012,
      noiseSd: 0.02,
    });
    const out = regimeDoneGate([allRow, regimeRow]);
    expect(out.total_evaluated).toBe(1);
    expect(out.promoted_cells).toHaveLength(1);
    const p = out.promoted_cells[0];
    expect(p.regime).toBe('bear-high-vol');
    expect(p.brier_lift.point).toBeGreaterThan(BRIER_LIFT_THRESHOLD);
    expect(p.brier_lift.low).toBeGreaterThan(0);
  });

  it('does NOT promote when brier_lift > 0.005 but BCa CI includes 0 (uncertain lift)', () => {
    // Delta at exactly 0.006 (just over threshold) but HUGE noise so the CI
    // spans zero — the point estimate may fluctuate but the CI is diffuse.
    const [allRow, regimeRow] = pairedRows({
      regime: 'bull-low-vol',
      n: 30,
      deltaPerObs: 0.006,
      noiseSd: 0.20,
    });
    const out = regimeDoneGate([allRow, regimeRow]);
    expect(out.total_evaluated).toBe(1);
    // With this SD/n combo the CI must include 0 (or point may drift below
    // threshold). Assert the gate did NOT promote it.
    expect(out.promoted_cells).toHaveLength(0);
  });

  it('does NOT promote when brier_lift <= 0.005 (under threshold)', () => {
    // Tiny lift (0.002 < 0.005) even with clean data.
    const [allRow, regimeRow] = pairedRows({
      regime: 'bull-high-vol',
      n: 200,
      deltaPerObs: 0.002,
      noiseSd: 0.005,
    });
    const out = regimeDoneGate([allRow, regimeRow]);
    expect(out.total_evaluated).toBe(1);
    expect(out.promoted_cells).toHaveLength(0);
  });

  it(`uses ${BCA_N_RESAMPLES.toLocaleString()} BCa resamples per cell (matches P21.1 precedent)`, () => {
    // Structural assertion — exposed constant matches P21.1.
    expect(BCA_N_RESAMPLES).toBe(10_000);
    expect(BRIER_LIFT_THRESHOLD).toBe(0.005);
  });

  it('skips cells lacking either a regime-specific row OR an "ALL" row (incomplete pair)', () => {
    // Only regime row, no ALL row.
    const [, regimeRow] = pairedRows({
      regime: 'bull-low-vol',
      n: 100,
      deltaPerObs: 0.02,
    });
    const outNoAll = regimeDoneGate([regimeRow]);
    expect(outNoAll.total_evaluated).toBe(0);
    expect(outNoAll.promoted_cells).toHaveLength(0);

    // Only ALL row, no regime row.
    const [allOnly] = pairedRows({
      regime: 'bull-low-vol',
      n: 100,
      deltaPerObs: 0.02,
    });
    const outNoRegime = regimeDoneGate([allOnly]);
    expect(outNoRegime.total_evaluated).toBe(0);
    expect(outNoRegime.promoted_cells).toHaveLength(0);
  });

  it('n_promoted = 0 is a valid output (D-16 honest null finding) — does NOT throw', () => {
    // Zero-effect regime cell. Empty input also should return cleanly.
    const [allRow, regimeRow] = pairedRows({
      regime: 'bear-low-vol',
      n: 60,
      deltaPerObs: 0,
      noiseSd: 0.05,
    });
    expect(() => regimeDoneGate([allRow, regimeRow])).not.toThrow();
    expect(() => regimeDoneGate([])).not.toThrow();

    const emptyOut = regimeDoneGate([]);
    expect(emptyOut.promoted_cells).toEqual([]);
    expect(emptyOut.total_evaluated).toBe(0);
    expect(emptyOut.threshold_used).toBe(BRIER_LIFT_THRESHOLD);
  });

  it('compares against the LIVE "ALL" row from the same relearn (Q7 same-fold apples-to-apples)', () => {
    // Series-length mismatch → the pair is NOT apples-to-apples → skip
    // promotion but still count as evaluated so composite report reflects it.
    const [allRow, regimeRow] = pairedRows({
      regime: 'bull-high-vol',
      n: 100,
      deltaPerObs: 0.02,
    });
    // Corrupt the length pairing.
    const mismatchedRegime: DoneGateInputRow = {
      ...regimeRow,
      brier_series: regimeRow.brier_series.slice(0, 50),
    };
    const out = regimeDoneGate([allRow, mismatchedRegime]);
    expect(out.total_evaluated).toBe(1);
    expect(out.promoted_cells).toHaveLength(0);
  });

  it('groups multiple regime cells within the same 4-tuple against a single ALL row', () => {
    // One ALL row + all 4 non-ALL regimes for the SAME 4-tuple.
    const [allRow, bullLow] = pairedRows({
      regime: 'bull-low-vol',
      n: 150,
      deltaPerObs: 0.010,
      noiseSd: 0.02,
    });
    const [, bearHigh] = pairedRows({
      regime: 'bear-high-vol',
      n: 150,
      deltaPerObs: 0.012,
      noiseSd: 0.02,
    });
    const [, bullHigh] = pairedRows({
      regime: 'bull-high-vol',
      n: 150,
      deltaPerObs: 0.001, // under threshold
      noiseSd: 0.02,
    });
    const [, bearLow] = pairedRows({
      regime: 'bear-low-vol',
      n: 150,
      deltaPerObs: 0.020, // well above
      noiseSd: 0.02,
    });

    const out = regimeDoneGate([allRow, bullLow, bearHigh, bullHigh, bearLow]);
    expect(out.total_evaluated).toBe(4);
    // Under-threshold cell must NOT be present in promoted.
    const promotedRegimes = out.promoted_cells.map((p) => p.regime).sort();
    expect(promotedRegimes).not.toContain('bull-high-vol');
    // The 3 above-threshold cells must at least contain the two high-delta ones.
    expect(promotedRegimes).toContain('bear-high-vol');
    expect(promotedRegimes).toContain('bear-low-vol');
  });
});
