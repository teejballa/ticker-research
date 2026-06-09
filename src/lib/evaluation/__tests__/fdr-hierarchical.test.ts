/**
 * PHASE 22 Wave 0 RED stub — Wave 4 delivers GREEN.
 * Covers: D-15 (hierarchical BY → meta-BH FDR) per 22-VALIDATION.md §Wave 0 Gaps.
 * Decision refs: D-15 (Benjamini-Bogomolov 2014 multi-tissue eQTL precedent) per 22-CONTEXT.md.
 *
 * Intentionally imports the target export `hierarchicalBYBH` from `../fdr` —
 * the function does NOT exist yet (only `benjaminiYekutieli` ships in fdr.ts today).
 * Vitest reports a runtime "hierarchicalBYBH is not a function" → RED.
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
// Intentionally imports the target export so the file fails at runtime until Wave 4 lands.
import * as fdrModule from '../fdr';

// Module-level RED guard: if Wave 4 has not landed `hierarchicalBYBH`, this assertion
// fires before any `it.todo` runs, producing a meaningful error that points at the
// missing implementation (not a silent skip).
describe('hierarchicalBYBH — Wave 4 RED guard', () => {
  it('Wave 4 must export hierarchicalBYBH from src/lib/evaluation/fdr.ts (D-15)', () => {
    expect(
      typeof (fdrModule as Record<string, unknown>).hierarchicalBYBH,
      'hierarchicalBYBH is not exported from src/lib/evaluation/fdr.ts — Wave 4 has not landed yet (D-15)',
    ).toBe('function');
  });
});

describe('hierarchicalBYBH — Wave 4 contract (Benjamini-Bogomolov 2014)', () => {
  it.todo('signal in 1 regime + noise in 3 → only the signal regime promotes (preserves per-regime power)');
  it.todo('signal in all 4 regimes → all 4 regimes promote');
  it.todo('noise in all 4 regimes → 0 regimes promote');
  it.todo('empty regime panel handled without divide-by-zero (returns ACCEPT for empty regime)');
  it.todo('single cell per regime handled (m=1 edge case across hierarchy)');
  it.todo('per_regime BY q-values are monotonically non-decreasing within each regime');
  it.todo('outer meta-BH decisions key on min(per-family q) per Benjamini-Bogomolov 2014 §3');
});
