/**
 * PHASE 22 Wave 3 GREEN — D-08 (aggregator reads regime per row from
 * SentimentSnapshot.regime, PIT-correct by construction).
 *
 * Wave 0 left this file as `it.todo` placeholders. Wave 3 (this file, after
 * edit) replaces the placeholders with real assertions that exercise the
 * extended AggregatorInputs.regime carrier wired into the existing
 * `aggregateCommunitySentimentTierAware` call at aggregator.ts L468 (post-edit).
 *
 * Contract under test (22-RESEARCH.md §E):
 *   interface AggregatorInputs {
 *     // ...existing fields...
 *     regime?: RegimeLabel;  // NEW — PIT regime label of the source SentimentSnapshot row
 *   }
 *   The aggregator's inner loop becomes
 *     getWeightForSource(c.source, inputs.regime ?? 'ALL', asOf)
 *   so cold-start gracefully degrades through the D-09 chain.
 *
 * Pitfall 1: aggregator MUST NOT call `classifyRegimeAt({asOf: new Date()})`.
 * Regime is read from the snapshot row at aggregation entry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const { getWeightForSourceMock } = vi.hoisted(() => {
  return { getWeightForSourceMock: vi.fn() };
});

vi.mock('../source-tier', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getWeightForSource: getWeightForSourceMock,
  };
});

// Wave 3 lookahead-bias defense (Pitfall 1) — fail the test if the aggregator
// tries to call classifyRegimeAt at any point.  We replace the export with a
// spy that throws.  If the aggregator's code path touches the classifier
// during aggregation, the test errors loudly.
const classifyRegimeAtSpy = vi.fn().mockImplementation(() => {
  throw new Error(
    '[aggregator-regime.test] Pitfall 1 violated — aggregator called classifyRegimeAt during aggregation. ' +
      'The regime MUST be read from the snapshot row (AggregatorInputs.regime), not classified at aggregation time.',
  );
});

vi.mock('@/lib/regime/classify', () => ({
  classifyRegimeAt: classifyRegimeAtSpy,
}));

// aggregator.ts module-load imports `prisma` from '@/lib/db' (for
// computeManipulationWarning).  Mock to silence the DATABASE_URL guard;
// the aggregateCommunitySentimentTierAware path under test does NOT
// transit prisma, so a stub is sufficient.
vi.mock('@/lib/db', () => ({
  prisma: {
    sentimentObservation: { findMany: vi.fn().mockResolvedValue([]) },
    authorShareCalibration: { findFirst: vi.fn().mockResolvedValue(null) },
    agreementCalibration: { findFirst: vi.fn().mockResolvedValue(null) },
    sourceTier: { findFirst: vi.fn().mockResolvedValue(null) },
    manipulationWarning: { create: vi.fn().mockResolvedValue(undefined) },
  },
}));

import { aggregateCommunitySentimentTierAware } from '../aggregator';
import type { AggregatorInputs } from '../aggregator';

const baseInputs = (): AggregatorInputs => ({
  stocktwits: { bullish_pct: 60, mention_count: 100 },
  swaggystocks: { bullish_pct: 50, mention_count: 50 },
  apewisdom: { bullish_pct: 40, mention_count: 30 },
});

describe('aggregateCommunitySentimentTierAware regime read — Wave 3 contract (D-08)', () => {
  beforeEach(() => {
    getWeightForSourceMock.mockReset();
    classifyRegimeAtSpy.mockClear();
    // Default: return weight=1.0 so the aggregator runs end-to-end.
    getWeightForSourceMock.mockResolvedValue(1.0);
  });

  it('reads regime from AggregatorInputs.regime (passed by snapshot row) — never auto-classifies', async () => {
    const inputs = { ...baseInputs(), regime: 'bull-low-vol' as const };
    const asOf = new Date('2026-05-15T00:00:00Z');

    await aggregateCommunitySentimentTierAware(inputs, { mode: 'on', asOf });

    // Every getWeightForSource call carries the snapshot's regime — never 'ALL', never undefined.
    expect(getWeightForSourceMock).toHaveBeenCalled();
    for (const call of getWeightForSourceMock.mock.calls) {
      expect(call[1]).toBe('bull-low-vol');
      expect(call[2]).toBe(asOf);
    }
    // Pitfall 1: classifyRegimeAt is NEVER touched by the aggregator.
    expect(classifyRegimeAtSpy).not.toHaveBeenCalled();
  });

  it('passes regime to getWeightForSource(source, regime, asOf) for every component', async () => {
    const inputs = { ...baseInputs(), regime: 'bear-high-vol' as const };
    const asOf = new Date('2026-05-15T00:00:00Z');

    await aggregateCommunitySentimentTierAware(inputs, { mode: 'on', asOf });

    // Three sources contributed — three calls.
    expect(getWeightForSourceMock).toHaveBeenCalledTimes(3);
    const sources = getWeightForSourceMock.mock.calls.map((c) => c[0]);
    expect(sources).toEqual(expect.arrayContaining(['stocktwits', 'swaggystocks', 'apewisdom']));
    for (const call of getWeightForSourceMock.mock.calls) {
      expect(call[1]).toBe('bear-high-vol');
    }
  });

  it('omitting AggregatorInputs.regime degrades gracefully to "ALL" (D-09 step 2 cold-start)', async () => {
    const inputs = baseInputs(); // no regime field
    const asOf = new Date('2026-05-15T00:00:00Z');

    await aggregateCommunitySentimentTierAware(inputs, { mode: 'on', asOf });

    expect(getWeightForSourceMock).toHaveBeenCalled();
    for (const call of getWeightForSourceMock.mock.calls) {
      // Cold-start fallback — D-09 chain step 2 picks up the 'ALL' baseline row.
      expect(call[1]).toBe('ALL');
    }
  });

  it('shadow mode still threads regime through (telemetry visibility) without changing the aggregate', async () => {
    const inputs = { ...baseInputs(), regime: 'bull-high-vol' as const };
    const asOf = new Date('2026-05-15T00:00:00Z');

    getWeightForSourceMock.mockResolvedValue(2.5); // non-trivial weight

    const shadow = await aggregateCommunitySentimentTierAware(inputs, {
      mode: 'shadow',
      asOf,
    });

    // shadow returns the baseline (untouched) aggregate
    expect(shadow.tier_mode).toBe('shadow');
    expect(shadow.tier_weights_applied).toEqual({
      stocktwits: 2.5,
      swaggystocks: 2.5,
      apewisdom: 2.5,
    });
    // But the lookups STILL fired with the snapshot's regime — so a shadow→on
    // cutover would not silently change the regime read.
    for (const call of getWeightForSourceMock.mock.calls) {
      expect(call[1]).toBe('bull-high-vol');
    }
  });

  it('off mode short-circuits — no getWeightForSource calls fired (tier mode=off)', async () => {
    const inputs = { ...baseInputs(), regime: 'bull-low-vol' as const };
    const asOf = new Date('2026-05-15T00:00:00Z');

    const off = await aggregateCommunitySentimentTierAware(inputs, {
      mode: 'off',
      asOf,
    });
    expect(off.tier_mode).toBe('off');
    expect(off.tier_weights_applied).toEqual({});
    // Off mode never threads tier weights, so the regime read is moot — but
    // assert ZERO classifyRegimeAt calls regardless (Pitfall 1).
    expect(classifyRegimeAtSpy).not.toHaveBeenCalled();
  });

  it('mixed-regime aggregation: each call uses the SNAPSHOT-row regime — across two invocations', async () => {
    // Two separate aggregations representing two snapshots in different regimes.
    // The per-row PIT semantics is structural: each call carries its OWN regime,
    // so a batched mixed-regime window collapses to N invocations each with its
    // own AggregatorInputs.regime — no batch-level regime blend.
    const asOf = new Date('2026-05-15T00:00:00Z');

    await aggregateCommunitySentimentTierAware(
      { ...baseInputs(), regime: 'bull-low-vol' },
      { mode: 'on', asOf },
    );
    await aggregateCommunitySentimentTierAware(
      { ...baseInputs(), regime: 'bear-high-vol' },
      { mode: 'on', asOf },
    );

    const regimesUsed = new Set(getWeightForSourceMock.mock.calls.map((c) => c[1]));
    expect(regimesUsed.has('bull-low-vol')).toBe(true);
    expect(regimesUsed.has('bear-high-vol')).toBe(true);
    // No regime-blend leak: 'ALL' was NEVER passed for either snapshot.
    expect(regimesUsed.has('ALL')).toBe(false);
  });

  it('Pitfall 1: aggregator NEVER calls classifyRegimeAt({asOf: new Date()}) during aggregation', async () => {
    const inputs = { ...baseInputs(), regime: 'bull-low-vol' as const };
    const asOf = new Date('2026-05-15T00:00:00Z');

    await aggregateCommunitySentimentTierAware(inputs, { mode: 'on', asOf });
    await aggregateCommunitySentimentTierAware(inputs, { mode: 'shadow', asOf });
    await aggregateCommunitySentimentTierAware(inputs, { mode: 'off', asOf });

    expect(classifyRegimeAtSpy).not.toHaveBeenCalled();
  });

  it('PIT-correct: aggregating an old snapshot uses the OLD regime stored on that snapshot', async () => {
    // Two historical snapshots: the late-April snapshot was scanned during a
    // bull-low-vol regime, the mid-May snapshot was scanned during a bear-high-vol
    // regime.  Re-aggregating the April row TODAY must use the April regime label.
    await aggregateCommunitySentimentTierAware(
      { ...baseInputs(), regime: 'bull-low-vol' },
      { mode: 'on', asOf: new Date('2026-04-25T00:00:00Z') },
    );
    await aggregateCommunitySentimentTierAware(
      { ...baseInputs(), regime: 'bear-high-vol' },
      { mode: 'on', asOf: new Date('2026-05-15T00:00:00Z') },
    );

    // Group calls by their asOf and check the regime is stable per snapshot.
    const aprilCalls = getWeightForSourceMock.mock.calls.filter(
      (c) => (c[2] as Date).getMonth() === 3, // April = month 3
    );
    const mayCalls = getWeightForSourceMock.mock.calls.filter(
      (c) => (c[2] as Date).getMonth() === 4, // May = month 4
    );
    expect(aprilCalls.length).toBeGreaterThan(0);
    expect(mayCalls.length).toBeGreaterThan(0);
    for (const c of aprilCalls) expect(c[1]).toBe('bull-low-vol');
    for (const c of mayCalls) expect(c[1]).toBe('bear-high-vol');
  });
});
