/**
 * PHASE 22 Wave 4 — D-05 transition-zone exclusion test contract.
 *
 * Covers: D-05 (sample-relative transition-zone exclusion in posterior update path)
 *         per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Reference implementation contract (22-RESEARCH.md §G + Pitfall 5 + Risk R4):
 *   Filter weightedObs to DROP events where:
 *     snapshot.regime !== outcomeTimeRegime
 *
 * Boundary semantics (R4):
 *   - flip mid-window or ON the right boundary day → EXCLUDE (strict)
 *   - NULL at either end → KEEP (no flip detectable, fail-open)
 *   - regime='ALL' on either end → KEEP (cold-start, regime conditioning
 *     not yet defined for this observation)
 *
 * Anti-pattern (Pitfall 5): over-exclusion that drops >30% of evidence
 * indicates a bug in boundary handling.
 */

import { describe, it, expect } from 'vitest';
import { excludeTransitionZoneEvents } from '@/app/api/cron/learn/route';

// Local minimal type matching the helper's input shape — keeping the test free
// of Prisma-row coupling so it runs without a DB.
interface TestEvent {
  snapshot_regime: string | null;
  outcome_regime: string | null;
}

describe('excludeTransitionZoneEvents — D-05 sample-relative transition exclusion', () => {
  it('keeps event when snapshot.regime === outcome-time regime (same-regime window)', () => {
    const events: TestEvent[] = [
      { snapshot_regime: 'bull-low-vol', outcome_regime: 'bull-low-vol' },
    ];
    const kept = excludeTransitionZoneEvents(events);
    expect(kept.length).toBe(1);
  });

  it('excludes event when snapshot.regime !== outcome-time regime (flip mid-window)', () => {
    const events: TestEvent[] = [
      { snapshot_regime: 'bull-low-vol', outcome_regime: 'bear-high-vol' },
      { snapshot_regime: 'bull-low-vol', outcome_regime: 'bull-high-vol' },
    ];
    const kept = excludeTransitionZoneEvents(events);
    expect(kept.length).toBe(0);
  });

  it('keeps event when snapshot.regime is NULL (fail-open per R4)', () => {
    const events: TestEvent[] = [
      { snapshot_regime: null, outcome_regime: 'bull-low-vol' },
    ];
    const kept = excludeTransitionZoneEvents(events);
    expect(kept.length).toBe(1);
  });

  it('keeps event when outcome-time regime is NULL (fail-open per R4)', () => {
    const events: TestEvent[] = [
      { snapshot_regime: 'bull-low-vol', outcome_regime: null },
    ];
    const kept = excludeTransitionZoneEvents(events);
    expect(kept.length).toBe(1);
  });

  it("keeps event when either side is 'ALL' (cold-start, regime conditioning not defined)", () => {
    const events: TestEvent[] = [
      { snapshot_regime: 'ALL', outcome_regime: 'bull-low-vol' },
      { snapshot_regime: 'bull-low-vol', outcome_regime: 'ALL' },
      { snapshot_regime: 'ALL', outcome_regime: 'ALL' },
    ];
    const kept = excludeTransitionZoneEvents(events);
    expect(kept.length).toBe(3);
  });

  it('mixed batch: drops only cross-regime same-side-labeled events', () => {
    const events: TestEvent[] = [
      { snapshot_regime: 'bull-low-vol', outcome_regime: 'bull-low-vol' },     // keep
      { snapshot_regime: 'bull-low-vol', outcome_regime: 'bear-high-vol' },    // drop (flip)
      { snapshot_regime: 'bear-low-vol', outcome_regime: 'bear-low-vol' },     // keep
      { snapshot_regime: null, outcome_regime: 'bull-low-vol' },               // keep (NULL)
      { snapshot_regime: 'ALL', outcome_regime: 'bear-high-vol' },             // keep (ALL)
    ];
    const kept = excludeTransitionZoneEvents(events);
    expect(kept.length).toBe(4);
  });

  it('over-exclusion guard (Pitfall 5): same-regime fraction stays > 70% on a synthetic 4-regime corpus', () => {
    // Construct a synthetic 4-regime corpus where ~95% of events have matching
    // snapshot/outcome regimes (the realistic case — most prediction windows
    // do not straddle a regime flip).
    const regimes = ['bull-low-vol', 'bull-high-vol', 'bear-low-vol', 'bear-high-vol'] as const;
    const events: TestEvent[] = [];
    for (let i = 0; i < 400; i++) {
      const r = regimes[i % 4];
      // 95% same-regime, 5% cross-regime flips
      const outcome_regime = i % 20 === 0 ? regimes[(i + 1) % 4] : r;
      events.push({ snapshot_regime: r, outcome_regime });
    }
    const kept = excludeTransitionZoneEvents(events);
    const keepFraction = kept.length / events.length;
    expect(keepFraction).toBeGreaterThan(0.7);
    expect(keepFraction).toBeGreaterThanOrEqual(0.94);
  });

  it('does NOT touch the unconditional "ALL" cell evaluation (caller-level decision)', () => {
    // The helper is purely a per-event filter on (snapshot_regime, outcome_regime).
    // The "do not apply transition exclusion to the ALL aggregate cell" rule
    // lives in the caller (evaluateOneCell). This test documents that the
    // helper itself never special-cases ALL events to be dropped — it always
    // KEEPS them under the rule above (ALL is fail-open).
    const events: TestEvent[] = [
      { snapshot_regime: 'ALL', outcome_regime: 'ALL' },
    ];
    expect(excludeTransitionZoneEvents(events).length).toBe(1);
  });
});
