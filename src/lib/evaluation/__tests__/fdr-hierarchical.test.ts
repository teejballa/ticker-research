/**
 * PHASE 22 Wave 4 — `hierarchicalBYBH` test contract.
 *
 * Covers: D-15 (hierarchical BY → meta-BH FDR) per 22-VALIDATION.md §Wave 0 Gaps.
 * Decision refs: D-15 (Benjamini-Bogomolov 2014 multi-tissue eQTL precedent) per 22-CONTEXT.md.
 *
 * Reference implementation contract (22-RESEARCH.md §H + Pattern 2):
 *   export interface HierarchicalBYResult {
 *     per_regime: Record<RegimeLabel, BYResult>;
 *     meta_bh_decisions: Record<RegimeLabel, 'REJECT' | 'ACCEPT'>;
 *     effective_q: Record<RegimeLabel, number>;
 *   }
 *   export function hierarchicalBYBH(
 *     perRegimePValues: Record<RegimeLabel, number[]>,
 *     q_inner?: number, q_outer?: number
 *   ): HierarchicalBYResult
 *
 * Why hierarchical (not naive BY across all 4× cells):
 *   - Naive BY raises c(m) from 5.6 to 7.0 → ~25% power loss per regime (Pitfall 3).
 *   - Hierarchical structure preserves per-regime inner-BY power even when the
 *     other regimes are noise.
 */

import { describe, it, expect } from 'vitest';
import { hierarchicalBYBH, benjaminiYekutieli } from '../fdr';
import type { RegimeLabel } from '@/lib/regime/types';

// Module-level guard: hierarchicalBYBH must be exported as a function.
describe('hierarchicalBYBH — export contract', () => {
  it('exports `hierarchicalBYBH` as a function (D-15)', () => {
    expect(typeof hierarchicalBYBH).toBe('function');
  });
});

describe('hierarchicalBYBH — Benjamini-Bogomolov 2014 contract', () => {
  // Tiny helper: build a Record<RegimeLabel, number[]> from per-regime panels.
  const panels = (overrides: Partial<Record<RegimeLabel, number[]>>): Record<RegimeLabel, number[]> => ({
    'bull-low-vol': [],
    'bull-high-vol': [],
    'bear-low-vol': [],
    'bear-high-vol': [],
    ALL: [],
    ...overrides,
  });

  it('signal in 1 regime + noise in 3 → only the signal regime promotes (preserves per-regime power)', () => {
    // bull-low-vol has small p-values; the other 3 are uniformly noisy.
    const result = hierarchicalBYBH(
      panels({
        'bull-low-vol': [0.001, 0.002, 0.003],
        'bull-high-vol': [0.4, 0.5, 0.7],
        'bear-low-vol': [0.45, 0.55, 0.65],
        'bear-high-vol': [0.6, 0.7, 0.8],
      }),
      0.1,
      0.1,
    );

    expect(result.meta_bh_decisions['bull-low-vol']).toBe('REJECT');
    expect(result.meta_bh_decisions['bull-high-vol']).toBe('ACCEPT');
    expect(result.meta_bh_decisions['bear-low-vol']).toBe('ACCEPT');
    expect(result.meta_bh_decisions['bear-high-vol']).toBe('ACCEPT');

    // Inner BY on the signal regime: at least one cell rejects (p=0.001 is very strong).
    const sig = result.per_regime['bull-low-vol'];
    expect(sig.decisions.some((d) => d === 'REJECT')).toBe(true);

    // Noise regimes: even if any inner BY rejected (none should at q=0.1),
    // outer meta-BH-failed → all inner rejections demoted to ACCEPT in
    // effective_q via consumer (the consumer reads meta_bh_decisions[r]
    // and demotes per-cell). We assert the regime-level decision here.
    for (const noisy of ['bull-high-vol', 'bear-low-vol', 'bear-high-vol'] as const) {
      expect(result.meta_bh_decisions[noisy]).toBe('ACCEPT');
    }
  });

  it('signal in all 4 regimes → all 4 regimes promote', () => {
    const result = hierarchicalBYBH(
      panels({
        'bull-low-vol': [0.001, 0.002],
        'bull-high-vol': [0.001, 0.002],
        'bear-low-vol': [0.001, 0.002],
        'bear-high-vol': [0.001, 0.002],
      }),
      0.1,
      0.1,
    );

    for (const r of ['bull-low-vol', 'bull-high-vol', 'bear-low-vol', 'bear-high-vol'] as const) {
      expect(result.meta_bh_decisions[r]).toBe('REJECT');
    }
  });

  it('noise in all 4 regimes → 0 regimes promote', () => {
    const result = hierarchicalBYBH(
      panels({
        'bull-low-vol': [0.4, 0.5, 0.6, 0.7],
        'bull-high-vol': [0.45, 0.55, 0.65, 0.75],
        'bear-low-vol': [0.5, 0.6, 0.7, 0.8],
        'bear-high-vol': [0.55, 0.65, 0.75, 0.85],
      }),
      0.1,
      0.1,
    );

    for (const r of ['bull-low-vol', 'bull-high-vol', 'bear-low-vol', 'bear-high-vol'] as const) {
      expect(result.meta_bh_decisions[r]).toBe('ACCEPT');
    }
  });

  it('empty regime panel handled without divide-by-zero (returns ACCEPT for empty regime)', () => {
    const result = hierarchicalBYBH(
      panels({
        'bull-low-vol': [0.001, 0.002, 0.003],
        // bull-high-vol intentionally empty (no cells observed yet in that regime)
        'bear-low-vol': [0.4, 0.5],
        'bear-high-vol': [0.45, 0.55],
      }),
      0.1,
      0.1,
    );

    // Empty regime is treated as "no signal" — Q_r = 1.0, fails outer BH.
    expect(result.meta_bh_decisions['bull-high-vol']).toBe('ACCEPT');
    expect(result.effective_q['bull-high-vol']).toBe(1.0);
    expect(result.per_regime['bull-high-vol'].decisions).toEqual([]);
    expect(result.per_regime['bull-high-vol'].adjusted_p).toEqual([]);

    // Signal regime still promotes.
    expect(result.meta_bh_decisions['bull-low-vol']).toBe('REJECT');
  });

  it('single cell per regime handled (m=1 edge case across hierarchy)', () => {
    const result = hierarchicalBYBH(
      panels({
        'bull-low-vol': [0.001],
        'bull-high-vol': [0.001],
        'bear-low-vol': [0.5],
        'bear-high-vol': [0.6],
      }),
      0.1,
      0.1,
    );

    // Per-regime BY at m=1: c(m)=1, threshold = q. p=0.001 << 0.1 → REJECT.
    expect(result.per_regime['bull-low-vol'].harmonic_sum).toBe(1);
    expect(result.per_regime['bull-low-vol'].decisions).toEqual(['REJECT']);
    expect(result.per_regime['bear-low-vol'].decisions).toEqual(['ACCEPT']);
  });

  it('per_regime BY adjusted_p values are non-decreasing in sorted order (monotone enforcement)', () => {
    const result = hierarchicalBYBH(
      panels({
        'bull-low-vol': [0.001, 0.04, 0.06, 0.5, 0.9],
        'bull-high-vol': [0.5, 0.6, 0.7],
        'bear-low-vol': [0.3, 0.4, 0.5],
        'bear-high-vol': [0.5, 0.6, 0.7],
      }),
      0.1,
      0.1,
    );

    // Walk the sorted p-values in each regime and confirm the corresponding
    // adjusted_p values are non-decreasing.
    for (const regime of ['bull-low-vol', 'bull-high-vol', 'bear-low-vol', 'bear-high-vol'] as const) {
      const { adjusted_p } = result.per_regime[regime];
      const inputs = (() => {
        switch (regime) {
          case 'bull-low-vol':
            return [0.001, 0.04, 0.06, 0.5, 0.9];
          case 'bull-high-vol':
            return [0.5, 0.6, 0.7];
          case 'bear-low-vol':
            return [0.3, 0.4, 0.5];
          case 'bear-high-vol':
            return [0.5, 0.6, 0.7];
        }
      })();
      const sortedIdx = inputs.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
      const sortedAdj = sortedIdx.map(({ i }) => adjusted_p[i]);
      for (let k = 1; k < sortedAdj.length; k++) {
        expect(sortedAdj[k]).toBeGreaterThanOrEqual(sortedAdj[k - 1] - 1e-12);
      }
    }
  });

  it('inner BY uses the existing benjaminiYekutieli primitive verbatim (no re-implementation)', () => {
    // Compute inner BY independently for one regime, confirm hierarchicalBYBH
    // delegates to the same primitive: outputs match exactly.
    const oneRegime = [0.001, 0.04, 0.06, 0.5, 0.9];
    const standalone = benjaminiYekutieli(oneRegime, 0.1);
    const result = hierarchicalBYBH(
      panels({
        'bull-low-vol': oneRegime,
        'bull-high-vol': [0.5],
        'bear-low-vol': [0.5],
        'bear-high-vol': [0.5],
      }),
      0.1,
      0.1,
    );

    expect(result.per_regime['bull-low-vol'].adjusted_p).toEqual(standalone.adjusted_p);
    expect(result.per_regime['bull-low-vol'].decisions).toEqual(standalone.decisions);
    expect(result.per_regime['bull-low-vol'].harmonic_sum).toBe(standalone.harmonic_sum);
  });

  it('outer meta-BH keys on min(per-family adjusted q) per Benjamini-Bogomolov 2014 §3', () => {
    // Verify the family-summary statistic is the per-regime minimum adjusted q.
    const result = hierarchicalBYBH(
      panels({
        'bull-low-vol': [0.001, 0.5, 0.9],   // strong: min adj q very small
        'bull-high-vol': [0.3, 0.4, 0.5],    // weak
        'bear-low-vol': [0.5, 0.6, 0.7],     // weak
        'bear-high-vol': [0.6, 0.7, 0.8],    // weakest
      }),
      0.1,
      0.1,
    );

    // The strongest regime's family-min q should be the smallest, and
    // the weakest's the largest — confirming the ordering used by outer BH.
    const familyMins: Array<{ r: RegimeLabel; min: number }> = (
      ['bull-low-vol', 'bull-high-vol', 'bear-low-vol', 'bear-high-vol'] as const
    ).map((r) => ({
      r,
      min: Math.min(...result.per_regime[r].adjusted_p),
    }));

    familyMins.sort((a, b) => a.min - b.min);
    expect(familyMins[0].r).toBe('bull-low-vol');
    expect(familyMins[familyMins.length - 1].r).toBe('bear-high-vol');
  });
});
