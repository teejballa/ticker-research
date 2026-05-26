import { describe, it, expect } from 'vitest';
// RED: enforceLiveOnlyGate does not exist yet — Plan 04 adds it to learning.ts.
import { enforceLiveOnlyGate, LIVE_OUTCOME_THRESHOLD } from '@/lib/learning';

describe('live-only promotion gate (COVERAGE-10 / D-10)', () => {
  it('default threshold is 10', () => {
    expect(LIVE_OUTCOME_THRESHOLD).toBe(10);
  });
  it('forces EXPLORATORY when live outcomes < threshold (backfill alone cannot graduate)', () => {
    expect(enforceLiveOnlyGate('ACTIVE', 0)).toBe('EXPLORATORY');
    expect(enforceLiveOnlyGate('ACTIVE', 9)).toBe('EXPLORATORY');
  });
  it('allows ACTIVE once live outcomes >= threshold', () => {
    expect(enforceLiveOnlyGate('ACTIVE', 10)).toBe('ACTIVE');
    expect(enforceLiveOnlyGate('ACTIVE', 25)).toBe('ACTIVE');
  });
  it('never PROMOTES a non-ACTIVE status (gate only demotes)', () => {
    expect(enforceLiveOnlyGate('EXPLORATORY', 50)).toBe('EXPLORATORY');
    expect(enforceLiveOnlyGate('DEPRECATED', 50)).toBe('DEPRECATED');
  });
});
