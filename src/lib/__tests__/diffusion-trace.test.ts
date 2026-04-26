import { describe, it, expect } from 'vitest';
import {
  classifyCapClass,
  classifyFlowPattern,
  computeDiffusionTrace,
  type SnapshotInput,
} from '../diffusion-trace';

function snap(scanned_at: Date, niche: number, middle: number, mainstream: number, opts?: { quantity?: number; quality?: number }): SnapshotInput {
  return {
    scanned_at,
    community_data: {
      tier_breakdown: { mainstream, middle, niche },
      quantity: opts?.quantity ?? niche + middle + mainstream,
      quality: opts?.quality ?? 0.5,
      market_cap: 50_000_000_000,
    },
  };
}

describe('classifyCapClass', () => {
  it('returns large_cap for >= $10B', () => {
    expect(classifyCapClass(10_000_000_000)).toBe('large_cap');
    expect(classifyCapClass(500_000_000_000)).toBe('large_cap');
  });
  it('returns mid_cap for $2B–$10B', () => {
    expect(classifyCapClass(2_000_000_000)).toBe('mid_cap');
    expect(classifyCapClass(5_000_000_000)).toBe('mid_cap');
  });
  it('returns small_cap for < $2B', () => {
    expect(classifyCapClass(1_000_000_000)).toBe('small_cap');
    expect(classifyCapClass(0)).toBe('small_cap');
  });
  it('returns unknown for null/undefined/NaN', () => {
    expect(classifyCapClass(null)).toBe('unknown');
    expect(classifyCapClass(undefined)).toBe('unknown');
    expect(classifyCapClass(NaN)).toBe('unknown');
  });
});

describe('classifyFlowPattern', () => {
  it('flat when all velocities below epsilon', () => {
    const r = classifyFlowPattern({
      v_niche: 0.1, v_middle: 0.0, v_mainstream: -0.2,
      niche_first_idx: null, middle_first_idx: null, mainstream_first_idx: null,
    });
    expect(r.flow_pattern).toBe('flat');
  });

  it('niche_leads when niche turns positive before mainstream', () => {
    const r = classifyFlowPattern({
      v_niche: 2, v_middle: 1.5, v_mainstream: 1,
      niche_first_idx: 1, middle_first_idx: 2, mainstream_first_idx: 3,
    });
    expect(r.flow_pattern).toBe('niche_leads');
    expect(r.niche_lead_cycles).toBe(2);
  });

  it('mainstream_first when mainstream turns positive first', () => {
    const r = classifyFlowPattern({
      v_niche: 1, v_middle: 1, v_mainstream: 2,
      niche_first_idx: 3, middle_first_idx: 2, mainstream_first_idx: 1,
    });
    expect(r.flow_pattern).toBe('mainstream_first');
  });

  it('simultaneous when all turn positive at same cycle', () => {
    const r = classifyFlowPattern({
      v_niche: 1, v_middle: 1, v_mainstream: 1,
      niche_first_idx: 1, middle_first_idx: 1, mainstream_first_idx: 1,
    });
    expect(r.flow_pattern).toBe('simultaneous');
  });

  it('niche_leads with strong signal when only niche has activity', () => {
    const r = classifyFlowPattern({
      v_niche: 3, v_middle: 0, v_mainstream: 0,
      niche_first_idx: 1, middle_first_idx: null, mainstream_first_idx: null,
    });
    expect(r.flow_pattern).toBe('niche_leads');
    expect(r.niche_lead_cycles).toBe(3);
  });
});

describe('computeDiffusionTrace', () => {
  it('returns null for fewer than 2 snapshots', () => {
    const snaps = [snap(new Date('2026-04-01'), 5, 3, 2)];
    expect(computeDiffusionTrace(snaps, [], [])).toBeNull();
  });

  it('detects niche-leads pattern in 4-cycle window', () => {
    // cycles 1-4: niche grows first (from 0→8), middle later, mainstream last
    const snaps = [
      snap(new Date('2026-04-01'), 0, 0, 0),
      snap(new Date('2026-04-04'), 4, 0, 0),
      snap(new Date('2026-04-07'), 6, 3, 0),
      snap(new Date('2026-04-10'), 8, 5, 2),
    ];
    const r = computeDiffusionTrace(snaps, [], []);
    expect(r).not.toBeNull();
    expect(r!.flow_pattern).toBe('niche_leads');
    expect(r!.v_niche).toBeGreaterThan(0);
    expect(r!.v_mainstream).toBeGreaterThanOrEqual(0);
    expect(r!.niche_lead_cycles).toBeGreaterThanOrEqual(1);
    expect(r!.cap_class).toBe('large_cap');
  });

  it('detects mainstream_first pattern', () => {
    const snaps = [
      snap(new Date('2026-04-01'), 0, 0, 0),
      snap(new Date('2026-04-04'), 0, 0, 5),
      snap(new Date('2026-04-07'), 0, 2, 7),
      snap(new Date('2026-04-10'), 1, 4, 9),
    ];
    const r = computeDiffusionTrace(snaps, [], []);
    expect(r!.flow_pattern).toBe('mainstream_first');
  });

  it('z-scores quantity within ticker history', () => {
    const snaps = [
      snap(new Date('2026-04-04'), 5, 3, 2, { quantity: 10 }),
      snap(new Date('2026-04-07'), 5, 3, 2, { quantity: 20 }),
    ];
    // historical quantity has mean ~10, last quantity is 20 → z ≈ +1
    const r = computeDiffusionTrace(snaps, [5, 10, 15], [0.5, 0.5, 0.5]);
    expect(r!.q_z).toBeGreaterThan(0);
  });

  it('sorts snapshots chronologically before computing velocity', () => {
    // pass in reverse order
    const snaps = [
      snap(new Date('2026-04-10'), 8, 5, 2),
      snap(new Date('2026-04-01'), 0, 0, 0),
      snap(new Date('2026-04-04'), 4, 0, 0),
      snap(new Date('2026-04-07'), 6, 3, 0),
    ];
    const r = computeDiffusionTrace(snaps, [], []);
    expect(r!.flow_pattern).toBe('niche_leads');
    expect(r!.v_niche).toBeGreaterThan(0);
  });

  it('falls back to tier_breakdown when highlights absent', () => {
    const snaps: SnapshotInput[] = [
      { scanned_at: new Date('2026-04-01'), community_data: { tier_breakdown: { mainstream: 0, middle: 0, niche: 0 } } },
      { scanned_at: new Date('2026-04-04'), community_data: { tier_breakdown: { mainstream: 0, middle: 0, niche: 5 } } },
    ];
    const r = computeDiffusionTrace(snaps, [], []);
    expect(r).not.toBeNull();
    expect(r!.v_niche).toBeGreaterThan(0);
  });
});
