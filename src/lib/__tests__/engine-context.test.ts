// src/lib/__tests__/engine-context.test.ts
// Unit tests for getEngineContextForTicker. Prisma + lightweightCommunityScan
// are mocked — the test asserts orchestration & math, not DB behavior.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock Prisma ────────────────────────────────────────────────────────
// `vi.hoisted` so the mock object exists when the module under test is imported.
const mocks = vi.hoisted(() => ({
  sentimentSnapshot: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  learnedPattern: {
    findUnique: vi.fn(),
  },
  logisticEpoch: {
    findFirst: vi.fn(),
  },
  learningEvent: {
    findFirst: vi.fn(),
  },
  lightweightCommunityScan: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    sentimentSnapshot: mocks.sentimentSnapshot,
    learnedPattern: mocks.learnedPattern,
    logisticEpoch: mocks.logisticEpoch,
    learningEvent: mocks.learningEvent,
  },
}));

vi.mock('../data/lightweight-community-scan', () => ({
  lightweightCommunityScan: mocks.lightweightCommunityScan,
}));

import { getEngineContextForTicker } from '../engine-context';

// ── Helpers ────────────────────────────────────────────────────────────
const ASOF = new Date('2026-04-26T12:00:00.000Z');

function buildSnapshot(opts: {
  daysAgo: number;
  niche: number;
  middle: number;
  mainstream: number;
  marketCap?: number | null;
  quantity?: number;
  quality?: number;
}) {
  const scanned_at = new Date(ASOF.getTime() - opts.daysAgo * 24 * 60 * 60 * 1000);
  const market_cap = 'marketCap' in opts ? opts.marketCap : 50_000_000_000;
  return {
    id: `snap-${opts.daysAgo}`,
    ticker: 'AMD',
    scanned_at,
    price_at_scan: 100,
    community_data: {
      tier_breakdown: { mainstream: opts.mainstream, middle: opts.middle, niche: opts.niche },
      quantity: opts.quantity ?? opts.niche + opts.middle + opts.mainstream,
      quality: opts.quality ?? 0.5,
      market_cap,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sentimentSnapshot.findMany.mockResolvedValue([]);
  mocks.sentimentSnapshot.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'created', ...data }),
  );
  mocks.learnedPattern.findUnique.mockResolvedValue(null);
  mocks.logisticEpoch.findFirst.mockResolvedValue(null);
  mocks.learningEvent.findFirst.mockResolvedValue(null);
  mocks.lightweightCommunityScan.mockResolvedValue(null);
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('getEngineContextForTicker — NO_DATA paths', () => {
  it('returns NO_DATA status when no LearnedPattern exists', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 2, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 3, middle: 1, mainstream: 0 }),
      buildSnapshot({ daysAgo: 2, niche: 1, middle: 0, mainstream: 0 }),
    ]);
    // history call
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 2, mainstream: 1 }),
    ]);

    const ctx = await getEngineContextForTicker('AMD', ASOF);

    expect(ctx.status).toBe('NO_DATA');
    expect(ctx.posterior_mean).toBeNull();
    expect(ctx.ci_low).toBeNull();
    expect(ctx.ci_high).toBeNull();
    expect(ctx.sample_size).toBe(0);
  });

  it('returns flow_pattern null and trace_window_size 1 with one snapshot', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 2, mainstream: 1 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 2, mainstream: 1 }),
    ]);

    const ctx = await getEngineContextForTicker('AMD', ASOF);

    expect(ctx.flow_pattern).toBeNull();
    expect(ctx.trace_window_size).toBe(1);
    expect(ctx.status).toBe('NO_DATA');
  });

  it('returns cap_class "unknown" when market_cap missing on most-recent snapshot', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 2, mainstream: 1, marketCap: null }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 2, mainstream: 1, marketCap: null }),
    ]);

    const ctx = await getEngineContextForTicker('XYZ', ASOF);

    expect(ctx.cap_class).toBe('unknown');
  });
});

describe('getEngineContextForTicker — cold-start path', () => {
  it('triggers lightweightCommunityScan when no snapshots exist', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);   // initial fetch returns []
    mocks.lightweightCommunityScan.mockResolvedValueOnce({
      quantity: 10,
      quality: 0.5,
      market_cap: 50_000_000_000,
      cap_class: 'large_cap',
      highlights: [],
    });
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]); // history fetch (after create)

    const ctx = await getEngineContextForTicker('NEWCO', ASOF);

    expect(mocks.lightweightCommunityScan).toHaveBeenCalledWith('NEWCO');
    expect(mocks.sentimentSnapshot.create).toHaveBeenCalled();
    expect(ctx.trace_window_size).toBe(1);
    expect(ctx.flow_pattern).toBeNull();           // 1 snap → can't classify
    expect(ctx.status).toBe('NO_DATA');
  });

  it('handles cold-start scrape failure gracefully (returns NO_DATA, no throw)', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);
    mocks.lightweightCommunityScan.mockRejectedValueOnce(new Error('FIRECRAWL_API_KEY missing'));
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);

    const ctx = await getEngineContextForTicker('NEWCO', ASOF);

    expect(ctx.status).toBe('NO_DATA');
    expect(ctx.trace_window_size).toBe(0);
    expect(ctx.flow_pattern).toBeNull();
  });
});

describe('getEngineContextForTicker — populated cell', () => {
  it('returns posterior_mean, CI, and ACTIVE status when LearnedPattern exists', async () => {
    // Four snapshots — niche velocity > 0 starting earlier than mainstream:
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 12, middle: 6, mainstream: 4 }),
      buildSnapshot({ daysAgo: 1, niche: 9,  middle: 4, mainstream: 2 }),
      buildSnapshot({ daysAgo: 2, niche: 6,  middle: 2, mainstream: 0 }),
      buildSnapshot({ daysAgo: 3, niche: 2,  middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 12, middle: 6, mainstream: 4 }),
    ]);
    mocks.learnedPattern.findUnique.mockResolvedValueOnce({
      flow_pattern: 'niche_leads',
      cap_class: 'large_cap',
      alpha: 18, beta: 8,
      alpha_30d: 6, beta_30d: 2,
      sample_size: 24,
      hits: 17,
      brier_in_sample: 0.18,
      brier_out_sample: 0.21,
      brier_null: 0.25,
      drift_z: 0.4,
      status: 'ACTIVE',
    });

    const ctx = await getEngineContextForTicker('AMD', ASOF);

    expect(ctx.flow_pattern).toBe('niche_leads');
    expect(ctx.cap_class).toBe('large_cap');
    expect(ctx.status).toBe('ACTIVE');
    expect(ctx.sample_size).toBe(24);
    expect(ctx.posterior_mean).toBeCloseTo(18 / 26, 3);
    expect(ctx.ci_low).not.toBeNull();
    expect(ctx.ci_high).not.toBeNull();
    expect((ctx.ci_low as number)).toBeLessThan(ctx.posterior_mean as number);
    expect((ctx.ci_high as number)).toBeGreaterThan(ctx.posterior_mean as number);
    expect(ctx.brier_in_sample).toBe(0.18);
    expect(ctx.brier_null).toBe(0.25);
    expect(ctx.posterior_30d_mean).toBeCloseTo(6 / 8, 3);
  });

  it('skips cell lookup when flow_pattern is flat', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 1, middle: 1, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 1, middle: 1, mainstream: 1 }),
      buildSnapshot({ daysAgo: 2, niche: 1, middle: 1, mainstream: 1 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);

    const ctx = await getEngineContextForTicker('FLAT', ASOF);

    expect(ctx.flow_pattern).toBe('flat');
    expect(mocks.learnedPattern.findUnique).not.toHaveBeenCalled();
    expect(ctx.status).toBe('NO_DATA');
  });
});

describe('getEngineContextForTicker — logistic forward pass', () => {
  it('computes logistic_score from latest LogisticEpoch coefficients', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 3, middle: 1, mainstream: 0 }),
      buildSnapshot({ daysAgo: 2, niche: 1, middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);
    mocks.logisticEpoch.findFirst.mockResolvedValueOnce({
      epoch: 12,
      intercept: 0.1,
      coefficients: {
        _intercept: { mu: 0.1, sigma: 0.5 },
        v_niche:           { mu: 0.4, sigma: 0.2 },
        v_middle:          { mu: 0.1, sigma: 0.2 },
        v_mainstream:      { mu: -0.05, sigma: 0.2 },
        niche_lead_cycles: { mu: 0.3, sigma: 0.2 },
        q_z:               { mu: 0.1, sigma: 0.2 },
        qual_z:            { mu: 0.1, sigma: 0.2 },
      },
      brier_in: 0.19,
      sample_size: 87,
    });

    const ctx = await getEngineContextForTicker('AMD', ASOF);

    expect(ctx.logistic_score).not.toBeNull();
    expect(ctx.logistic_score!).toBeGreaterThan(0);
    expect(ctx.logistic_score!).toBeLessThan(1);
    expect(ctx.logistic_ci_low!).toBeLessThanOrEqual(ctx.logistic_score!);
    expect(ctx.logistic_ci_high!).toBeGreaterThanOrEqual(ctx.logistic_score!);
    expect(ctx.feature_contributions.length).toBe(6);
    expect(ctx.cycle_count).toBe(12);
    expect(ctx.logistic_sample_size).toBe(87);
  });

  it('returns logistic_score null when no epoch exists', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 1, middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);

    const ctx = await getEngineContextForTicker('AMD', ASOF);

    expect(ctx.logistic_score).toBeNull();
    expect(ctx.cycle_count).toBe(0);
  });
});

describe('getEngineContextForTicker — sparkline + meta', () => {
  it('builds sparkline in chronological order from snapshots', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 4, middle: 2, mainstream: 1 }),
      buildSnapshot({ daysAgo: 2, niche: 3, middle: 1, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);

    const ctx = await getEngineContextForTicker('AMD', ASOF);

    expect(ctx.diffusion_sparkline).toHaveLength(3);
    // chronological → first entry is the OLDEST (daysAgo=2)
    expect(ctx.diffusion_sparkline[0].niche).toBe(3);
    expect(ctx.diffusion_sparkline[2].niche).toBe(5);
  });

  it('embeds prediction_id_seed deterministically', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);
    mocks.lightweightCommunityScan.mockResolvedValueOnce(null);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);

    const ctx = await getEngineContextForTicker('amd', ASOF);

    expect(ctx.prediction_id_seed).toBe(`AMD-${ASOF.toISOString()}`);
    expect(ctx.predicted_at).toEqual(ASOF);
  });
});
