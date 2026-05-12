/**
 * Plan 20-A-01 — Unit tests for the crowdedConsensus predicate.
 *
 * Predicate fires iff:
 *   entropy_bits < H_thresh
 *   AND mention_z > V_thresh
 *   AND author_gini > D_thresh
 *
 * Returns null when:
 *   - thresholds is null (no calibration row exists yet)
 *   - any feature input is non-finite (NaN/Infinity)
 */

import { describe, it, expect } from 'vitest';
import {
  crowdedConsensus,
  type CrowdedConsensusThresholds,
  type DispersionFeatures,
} from '@/lib/sentiment/dispersion';

const THRESH: CrowdedConsensusThresholds = {
  H_thresh: 1.0,
  V_thresh: 2.0,
  D_thresh: 0.4,
  model_version: 'grid-search-v1',
  computed_at: new Date('2026-05-12T00:00:00Z'),
  brier_skill_score: 0.1,
};

function feats(p: Partial<DispersionFeatures> = {}): DispersionFeatures {
  return {
    entropy_bits: 0.3,
    bull_pct_std: 10,
    author_gini: 0.6,
    mention_z: 3.0,
    ...p,
  };
}

describe('crowdedConsensus predicate', () => {
  it('fires when all three conditions are met', () => {
    expect(crowdedConsensus(feats(), THRESH)).toBe(true);
  });

  it('does NOT fire when entropy ≥ H_thresh', () => {
    expect(crowdedConsensus(feats({ entropy_bits: 1.2 }), THRESH)).toBe(false);
  });

  it('does NOT fire when mention_z ≤ V_thresh', () => {
    expect(crowdedConsensus(feats({ mention_z: 1.5 }), THRESH)).toBe(false);
  });

  it('does NOT fire when author_gini ≤ D_thresh', () => {
    expect(crowdedConsensus(feats({ author_gini: 0.2 }), THRESH)).toBe(false);
  });

  it('returns null when any feature is non-finite (NaN)', () => {
    expect(crowdedConsensus(feats({ entropy_bits: NaN }), THRESH)).toBeNull();
    expect(crowdedConsensus(feats({ mention_z: Infinity }), THRESH)).toBeNull();
  });

  it('returns null when thresholds is null (no calibration row yet)', () => {
    expect(crowdedConsensus(feats(), null)).toBeNull();
  });

  it('boundary: entropy exactly equal to H_thresh does NOT fire (strict <)', () => {
    expect(
      crowdedConsensus(feats({ entropy_bits: THRESH.H_thresh }), THRESH),
    ).toBe(false);
  });
});
