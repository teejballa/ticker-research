// src/lib/__tests__/engine-context.test.ts
// Unit tests for getEngineContextForTicker. Prisma + lightweightCommunityScan
// + computeTechnicalSnapshot are mocked — these tests assert orchestration & math,
// not DB behavior.
//
// Phase 16-04 expansion: 10 new test cases pin the dual-class shape (technical_*,
// horizon_calibrations, agreement, combined_logistic_score, parallel cold-start).

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock Prisma + the two cold-start sensors ───────────────────────────
// `vi.hoisted` so the mock object exists when the module under test is imported.
const mocks = vi.hoisted(() => ({
  sentimentSnapshot: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  learnedPattern: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  logisticEpoch: {
    findFirst: vi.fn(),
  },
  learningEvent: {
    findFirst: vi.fn(),
  },
  lightweightCommunityScan: vi.fn(),
  computeTechnicalSnapshot: vi.fn(),
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

vi.mock('../data/technical', () => ({
  computeTechnicalSnapshot: mocks.computeTechnicalSnapshot,
}));

import { getEngineContextForTicker, computeAgreement, computeAgreementNWay } from '../engine-context';
import type { TechnicalSnapshot, TechPattern } from '../types';

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

function buildTechSnap(overrides: Partial<TechnicalSnapshot> = {}): TechnicalSnapshot {
  return {
    rsi_14: 55,
    macd_line: 0.3,
    macd_signal: 0.1,
    macd_histogram: 0.2,
    sma_50: 110,
    sma_200: 100,
    atr_14: 2.5,
    avg_volume_20d: 1_000_000,
    volume_ratio: 1.2,
    trend_regime: 'uptrend',
    momentum_regime: 'neutral',
    cross_state: 'none',
    tech_pattern: 'breakout_uptrend' as TechPattern,
    bar_count: 250,
    computed_at: ASOF.toISOString(),
    data_source: 'yahoo',
    ...overrides,
  };
}

function buildLearnedCell(opts: {
  alpha: number;
  beta: number;
  status?: 'ACTIVE' | 'EXPLORATORY' | 'EXPLORATORY-WATCH' | 'DEPRECATED';
  sample_size?: number;
  effective_sample_size?: number;
  alpha_30d?: number;
  beta_30d?: number;
}) {
  return {
    alpha: opts.alpha,
    beta: opts.beta,
    alpha_30d: opts.alpha_30d ?? 1,
    beta_30d: opts.beta_30d ?? 1,
    sample_size: opts.sample_size ?? Math.round(opts.alpha + opts.beta),
    // Phase 18: ESS defaults to raw sample_size when not specified — matches
    // the cron's first-tick behavior where decay weights are all close to 1.
    effective_sample_size: opts.effective_sample_size ?? opts.sample_size ?? Math.round(opts.alpha + opts.beta),
    hits: Math.round(opts.alpha),
    brier_in_sample: 0.18,
    brier_out_sample: 0.21,
    brier_null: 0.25,
    drift_z: 0.4,
    status: opts.status ?? 'ACTIVE',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sentimentSnapshot.findMany.mockResolvedValue([]);
  mocks.sentimentSnapshot.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'created', ...data }),
  );
  mocks.learnedPattern.findUnique.mockResolvedValue(null);
  mocks.learnedPattern.findFirst.mockResolvedValue(null);
  mocks.logisticEpoch.findFirst.mockResolvedValue(null);
  mocks.learningEvent.findFirst.mockResolvedValue(null);
  mocks.lightweightCommunityScan.mockResolvedValue(null);
  mocks.computeTechnicalSnapshot.mockResolvedValue(null);
});

// ── EXISTING tests (preserved) ─────────────────────────────────────────

describe('getEngineContextForTicker — NO_DATA paths', () => {
  it('returns NO_DATA status when no LearnedPattern exists', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 2, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 3, middle: 1, mainstream: 0 }),
      buildSnapshot({ daysAgo: 2, niche: 1, middle: 0, mainstream: 0 }),
    ]);
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

describe('getEngineContextForTicker — populated diffusion cell', () => {
  it('returns posterior_mean, CI, and ACTIVE status when LearnedPattern exists', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 12, middle: 6, mainstream: 4 }),
      buildSnapshot({ daysAgo: 1, niche: 9,  middle: 4, mainstream: 2 }),
      buildSnapshot({ daysAgo: 2, niche: 6,  middle: 2, mainstream: 0 }),
      buildSnapshot({ daysAgo: 3, niche: 2,  middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 12, middle: 6, mainstream: 4 }),
    ]);
    // Diffusion cell at horizon=7, plus all 12 horizon-table queries default to null.
    mocks.learnedPattern.findUnique.mockImplementation((args: { where: { signal_class_pattern_key_cap_class_horizon_days: { signal_class: string; horizon_days: number } } }) => {
      const k = args.where.signal_class_pattern_key_cap_class_horizon_days;
      if (k.signal_class === 'diffusion' && k.horizon_days === 7) {
        return Promise.resolve(buildLearnedCell({ alpha: 18, beta: 8, sample_size: 24, alpha_30d: 6, beta_30d: 2 }));
      }
      return Promise.resolve(null);
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

// ── Phase 16-04 NEW tests (10 behaviors locked by the plan) ────────────

describe('Phase 16-04 — getEngineContextForTicker dual-class extension', () => {
  it('Test 1 — shape: returns all 8 NEW fields', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 1, middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);

    const ctx = await getEngineContextForTicker('AAPL', ASOF);

    expect(ctx).toHaveProperty('technical_pattern');
    expect(ctx).toHaveProperty('technical_posterior_mean');
    expect(ctx).toHaveProperty('technical_ci');
    expect(ctx).toHaveProperty('technical_sample_size');
    expect(ctx).toHaveProperty('technical_status');
    expect(ctx).toHaveProperty('horizon_calibrations');
    expect(ctx).toHaveProperty('combined_logistic_score');
    expect(ctx).toHaveProperty('agreement');
  });

  it('Test 2 — horizon_calibrations length === 6 covering 3,7,14,30,60,90 in order', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 1, middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);

    const ctx = await getEngineContextForTicker('AAPL', ASOF);

    expect(ctx.horizon_calibrations).toHaveLength(6);
    expect(ctx.horizon_calibrations.map(h => h.horizon_days)).toEqual([3, 7, 14, 30, 60, 90]);
  });

  it('Test 3 — agreement === aligned when both posteriors > 0.55 AND both ACTIVE', () => {
    expect(computeAgreement(0.62, 0.58, 'ACTIVE', 'ACTIVE')).toBe('aligned');
  });

  it('Test 4 — agreement === aligned when both posteriors < 0.45 AND both ACTIVE', () => {
    expect(computeAgreement(0.38, 0.42, 'ACTIVE', 'ACTIVE')).toBe('aligned');
  });

  it('Test 5 — agreement === opposed when diffusion > 0.6 && technical < 0.4 (both ACTIVE)', () => {
    expect(computeAgreement(0.65, 0.35, 'ACTIVE', 'ACTIVE')).toBe('opposed');
    expect(computeAgreement(0.30, 0.70, 'ACTIVE', 'ACTIVE')).toBe('opposed');
  });

  it('Test 6 — agreement === mixed when both ACTIVE but neither aligned nor opposed (e.g. 0.62 / 0.55)', () => {
    expect(computeAgreement(0.62, 0.55, 'ACTIVE', 'ACTIVE')).toBe('mixed');
  });

  it('Test 7 — agreement === unknown when EITHER status is NO_DATA / EXPLORATORY / DEPRECATED', () => {
    expect(computeAgreement(0.62, 0.58, 'NO_DATA', 'ACTIVE')).toBe('unknown');
    expect(computeAgreement(0.62, 0.58, 'ACTIVE', 'EXPLORATORY')).toBe('unknown');
    expect(computeAgreement(0.62, 0.58, 'DEPRECATED', 'ACTIVE')).toBe('unknown');
    expect(computeAgreement(null, 0.58, 'ACTIVE', 'ACTIVE')).toBe('unknown');
  });

  it('Test 8 — cold-start path: triggers parallel lightweightCommunityScan + computeTechnicalSnapshot via Promise.all', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]); // initial fetch returns []
    mocks.lightweightCommunityScan.mockResolvedValueOnce({
      quantity: 10,
      quality: 0.5,
      market_cap: 50_000_000_000,
      cap_class: 'large_cap',
      highlights: [],
    });
    mocks.computeTechnicalSnapshot.mockResolvedValueOnce(buildTechSnap());
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]); // history fetch (after create)

    const ctx = await getEngineContextForTicker('NEWCO', ASOF);

    expect(mocks.lightweightCommunityScan).toHaveBeenCalledWith('NEWCO');
    expect(mocks.computeTechnicalSnapshot).toHaveBeenCalledWith('NEWCO');
    expect(mocks.sentimentSnapshot.create).toHaveBeenCalled();
    // Either resolution counts as a valid cold-start result.
    expect(ctx.trace_window_size).toBe(1);
    // Tech snap was returned, so technical_pattern is populated.
    expect(ctx.technical_pattern).toBe('breakout_uptrend');
  });

  it('Test 9 — backwards-compat: empty LearnedPattern table → all horizons NO_DATA, agreement unknown', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 1, middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);
    mocks.computeTechnicalSnapshot.mockResolvedValueOnce(null);
    // learnedPattern.findUnique → null (default beforeEach)

    const ctx = await getEngineContextForTicker('AAPL', ASOF);

    expect(ctx.technical_pattern).toBeNull();
    expect(ctx.technical_posterior_mean).toBeNull();
    expect(ctx.technical_status).toBe('NO_DATA');
    expect(ctx.horizon_calibrations).toHaveLength(6);
    for (const h of ctx.horizon_calibrations) {
      expect(h.diffusion_posterior).toBeNull();
      expect(h.technical_posterior).toBeNull();
      expect(h.status).toBe('NO_DATA');
    }
    expect(ctx.agreement).toBe('unknown');
  });

  it('Test 10 — combined_logistic_score: 12-d epoch + trace + techSnap → number in (0,1)', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 3, middle: 1, mainstream: 0 }),
      buildSnapshot({ daysAgo: 2, niche: 1, middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);
    mocks.computeTechnicalSnapshot.mockResolvedValueOnce(buildTechSnap());
    mocks.logisticEpoch.findFirst.mockResolvedValueOnce({
      epoch: 14,
      intercept: 0.05,
      coefficients: {
        _intercept: { mu: 0.05, sigma: 0.5 },
        v_niche:                   { mu: 0.4, sigma: 0.2 },
        v_middle:                  { mu: 0.1, sigma: 0.2 },
        v_mainstream:              { mu: -0.05, sigma: 0.2 },
        niche_lead_cycles:         { mu: 0.3, sigma: 0.2 },
        q_z:                       { mu: 0.1, sigma: 0.2 },
        qual_z:                    { mu: 0.1, sigma: 0.2 },
        rsi_14:                    { mu: 0.01, sigma: 0.2 },
        macd_histogram:            { mu: 0.2, sigma: 0.2 },
        sma_relative_spread:       { mu: 0.5, sigma: 0.2 },
        atr_14:                    { mu: 0.0, sigma: 0.2 },
        volume_ratio:              { mu: 0.1, sigma: 0.2 },
        tech_pattern_uptrend_flag: { mu: 0.4, sigma: 0.2 },
      },
      brier_in: 0.19,
      sample_size: 87,
    });

    const ctx = await getEngineContextForTicker('AAPL', ASOF);

    expect(ctx.combined_logistic_score).not.toBeNull();
    expect(ctx.combined_logistic_score!).toBeGreaterThan(0);
    expect(ctx.combined_logistic_score!).toBeLessThan(1);
    // The 6-d diffusion-only score should also be populated for back-compat.
    expect(ctx.logistic_score).not.toBeNull();
  });

  it('Test 11 — populated technical cell yields ACTIVE technical_status + posterior + ci', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 1, middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);
    mocks.computeTechnicalSnapshot.mockResolvedValueOnce(buildTechSnap());
    mocks.learnedPattern.findUnique.mockImplementation((args: { where: { signal_class_pattern_key_cap_class_horizon_days: { signal_class: string; horizon_days: number } } }) => {
      const k = args.where.signal_class_pattern_key_cap_class_horizon_days;
      if (k.signal_class === 'technical' && k.horizon_days === 30) {
        return Promise.resolve(buildLearnedCell({ alpha: 16, beta: 8, sample_size: 24 }));
      }
      return Promise.resolve(null);
    });

    const ctx = await getEngineContextForTicker('AAPL', ASOF);

    expect(ctx.technical_pattern).toBe('breakout_uptrend');
    expect(ctx.technical_status).toBe('ACTIVE');
    expect(ctx.technical_sample_size).toBe(24);
    expect(ctx.technical_posterior_mean).toBeCloseTo(16 / 24, 3);
    expect(ctx.technical_ci).not.toBeNull();
    expect(ctx.technical_ci![0]).toBeLessThan(ctx.technical_posterior_mean!);
    expect(ctx.technical_ci![1]).toBeGreaterThan(ctx.technical_posterior_mean!);
  });
});

// ── Phase 17-04 — computeAgreementNWay table tests ────────────────────

describe('computeAgreementNWay', () => {
  it.each([
    // 0 ACTIVE classes → unknown
    [
      [{ posterior: null, status: 'NO_DATA' as const }, { posterior: null, status: 'NO_DATA' as const }],
      'unknown',
      '0 ACTIVE → unknown',
    ],
    // 1 ACTIVE class → unknown (gate requires ≥ 2)
    [
      [
        { posterior: 0.65, status: 'ACTIVE' as const },
        { posterior: null, status: 'NO_DATA' as const },
        { posterior: null, status: 'NO_DATA' as const },
      ],
      'unknown',
      '1 ACTIVE → unknown',
    ],
    // 4 ACTIVE all > 0.55 → aligned (bullish)
    [
      [
        { posterior: 0.62, status: 'ACTIVE' as const },
        { posterior: 0.58, status: 'ACTIVE' as const },
        { posterior: 0.60, status: 'ACTIVE' as const },
        { posterior: 0.57, status: 'ACTIVE' as const },
      ],
      'aligned',
      '4 ACTIVE all > 0.55 → aligned (bullish)',
    ],
    // 4 ACTIVE all < 0.45 → aligned (bearish)
    [
      [
        { posterior: 0.38, status: 'ACTIVE' as const },
        { posterior: 0.42, status: 'ACTIVE' as const },
        { posterior: 0.40, status: 'ACTIVE' as const },
        { posterior: 0.35, status: 'ACTIVE' as const },
      ],
      'aligned',
      '4 ACTIVE all < 0.45 → aligned (bearish)',
    ],
    // one > 0.6 + one < 0.4 → opposed (rest in neutral band)
    [
      [
        { posterior: 0.65, status: 'ACTIVE' as const },
        { posterior: 0.35, status: 'ACTIVE' as const },
        { posterior: 0.50, status: 'ACTIVE' as const },
      ],
      'opposed',
      '1 strong-bull + 1 strong-bear → opposed',
    ],
    // 4 ACTIVE in mixed band (no alignment, no strong opposition)
    [
      [
        { posterior: 0.48, status: 'ACTIVE' as const },
        { posterior: 0.52, status: 'ACTIVE' as const },
        { posterior: 0.55, status: 'ACTIVE' as const },
        { posterior: 0.45, status: 'ACTIVE' as const },
      ],
      'mixed',
      '4 ACTIVE mixed band → mixed',
    ],
    // 2 ACTIVE bullish + 2 NO_DATA → aligned (gate counts only ACTIVE)
    [
      [
        { posterior: 0.65, status: 'ACTIVE' as const },
        { posterior: 0.60, status: 'ACTIVE' as const },
        { posterior: null, status: 'NO_DATA' as const },
        { posterior: null, status: 'NO_DATA' as const },
      ],
      'aligned',
      '2 ACTIVE bullish + 2 NO_DATA → aligned (gate counts only ACTIVE)',
    ],
  ])('%s → %s', (classes, expected, _desc) => {
    expect(computeAgreementNWay(classes)).toBe(expected);
  });
});

// ── Phase 17-04 — getEngineContextForTicker institutional + insider ─────

describe('Phase 17-04 — getEngineContextForTicker institutional + insider resolution', () => {
  function buildSnapWithSmartMoney(opts: {
    insiderBucket?: string | null;
    institutionalBucket?: string | null;
    dataAgeDays?: number;
  }) {
    const snap = buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 });
    return {
      ...snap,
      insider_data: opts.insiderBucket !== null && opts.insiderBucket !== undefined
        ? {
            insider_bucket: opts.insiderBucket,
            data_age_days: opts.dataAgeDays ?? 5,
            distinct_buyers: 3,
            distinct_sellers: 0,
            net_buy_share_count: 10000,
            net_sell_share_count: 0,
            buy_value_usd: 500000,
            sell_value_usd: null,
            has_ceo_buy: true,
            has_cfo_buy: false,
            has_director_buy: false,
            is_planned_10b5_1: false,
            filings_count: 3,
            earliest_filing_date: '2026-04-01',
            latest_filing_date: '2026-04-25',
            computed_at: '2026-04-30T00:00:00.000Z',
            data_source: 'finnhub',
            insider_sentiment_mspr: 0.6,
          }
        : null,
      institutional_data: opts.institutionalBucket !== null && opts.institutionalBucket !== undefined
        ? {
            institutional_bucket: opts.institutionalBucket,
            data_age_days: opts.dataAgeDays ?? 14,
            total_institutional_share: 5000000,
            total_institutional_share_prev: 4800000,
            net_share_change: 200000,
            net_share_change_pct: 4.2,
            fund_count_current: 142,
            fund_count_prev: 137,
            fund_count_delta: 5,
            top10_concentration_pct: 38,
            top10_concentration_pct_prev: 36,
            ticker_30d_return_pct: 3.5,
            spy_30d_return_pct: 1.2,
            report_date: '2026-03-31',
            filing_date: '2026-04-15',
            computed_at: '2026-04-30T00:00:00.000Z',
            data_source: 'finnhub',
          }
        : null,
    };
  }

  it('resolves insiderBucket and institutionalBucket from mostRecentSnap', async () => {
    const snap = buildSnapWithSmartMoney({ insiderBucket: 'cluster_buys', institutionalBucket: 'accumulation' });
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([snap]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([snap]);

    const ctx = await getEngineContextForTicker('TSLA', ASOF);

    expect(ctx.insider_pattern).toBe('cluster_buys');
    expect(ctx.institutional_pattern).toBe('accumulation');
    expect(ctx.insider_data_age_days).toBe(5);
    expect(ctx.institutional_data_age_days).toBe(14);
  });

  it('returns NO_DATA defaults when insider_data and institutional_data are null', async () => {
    const snap = buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 });
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([snap]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([snap]);

    const ctx = await getEngineContextForTicker('TSLA', ASOF);

    expect(ctx.insider_pattern).toBeNull();
    expect(ctx.insider_posterior_mean).toBeNull();
    expect(ctx.insider_status).toBe('NO_DATA');
    expect(ctx.insider_data_age_days).toBeNull();
    expect(ctx.institutional_pattern).toBeNull();
    expect(ctx.institutional_posterior_mean).toBeNull();
    expect(ctx.institutional_status).toBe('NO_DATA');
    expect(ctx.institutional_data_age_days).toBeNull();
  });

  it('populates institutional posterior from LearnedPattern when bucket present', async () => {
    const snap = buildSnapWithSmartMoney({ insiderBucket: null, institutionalBucket: 'accumulation' });
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([snap]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([snap]);
    mocks.learnedPattern.findUnique.mockImplementation((args: { where: { signal_class_pattern_key_cap_class_horizon_days: { signal_class: string } } }) => {
      const k = args.where.signal_class_pattern_key_cap_class_horizon_days;
      if (k.signal_class === 'institutional') {
        return Promise.resolve(buildLearnedCell({ alpha: 14, beta: 6, sample_size: 20 }));
      }
      return Promise.resolve(null);
    });

    const ctx = await getEngineContextForTicker('MSFT', ASOF);

    expect(ctx.institutional_pattern).toBe('accumulation');
    expect(ctx.institutional_posterior_mean).toBeCloseTo(14 / 20, 3);
    expect(ctx.institutional_status).toBe('ACTIVE');
    expect(ctx.institutional_ci).not.toBeNull();
  });

  it('horizon_calibrations rows carry institutional_posterior and insider_posterior fields', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 }),
      buildSnapshot({ daysAgo: 1, niche: 1, middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([]);

    const ctx = await getEngineContextForTicker('AAPL', ASOF);

    expect(ctx.horizon_calibrations).toHaveLength(6);
    for (const row of ctx.horizon_calibrations) {
      expect(row).toHaveProperty('institutional_posterior');
      expect(row).toHaveProperty('institutional_ci');
      expect(row).toHaveProperty('insider_posterior');
      expect(row).toHaveProperty('insider_ci');
    }
  });
});

// ── Phase 18-07 — ESS + 'EXPLORATORY-WATCH' surface ───────────────────

describe('Phase 18-07 — getEngineContextForTicker ESS + EXPLORATORY-WATCH surface', () => {
  it('surfaces effective_sample_size from the diffusion LearnedPattern row', async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 12, middle: 6, mainstream: 4 }),
      buildSnapshot({ daysAgo: 1, niche: 9,  middle: 4, mainstream: 2 }),
      buildSnapshot({ daysAgo: 2, niche: 6,  middle: 2, mainstream: 0 }),
      buildSnapshot({ daysAgo: 3, niche: 2,  middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 12, middle: 6, mainstream: 4 }),
    ]);
    mocks.learnedPattern.findUnique.mockImplementation((args: { where: { signal_class_pattern_key_cap_class_horizon_days: { signal_class: string; horizon_days: number } } }) => {
      const k = args.where.signal_class_pattern_key_cap_class_horizon_days;
      if (k.signal_class === 'diffusion' && k.horizon_days === 7) {
        return Promise.resolve(buildLearnedCell({
          alpha: 18, beta: 8, sample_size: 24, effective_sample_size: 42,
        }));
      }
      return Promise.resolve(null);
    });

    const ctx = await getEngineContextForTicker('AMD', ASOF);

    expect(ctx.effective_sample_size).toBe(42);
    // Per-class ESS fields exist (default 0 when no class-specific cell).
    expect(ctx.technical_ess).toBe(0);
    expect(ctx.institutional_ess).toBe(0);
    expect(ctx.insider_ess).toBe(0);
    expect(ctx.logistic_ess).toBe(0);
  });

  it("preserves 'EXPLORATORY-WATCH' status when the cell is in drift watch", async () => {
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 12, middle: 6, mainstream: 4 }),
      buildSnapshot({ daysAgo: 1, niche: 9,  middle: 4, mainstream: 2 }),
      buildSnapshot({ daysAgo: 2, niche: 6,  middle: 2, mainstream: 0 }),
      buildSnapshot({ daysAgo: 3, niche: 2,  middle: 0, mainstream: 0 }),
    ]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([
      buildSnapshot({ daysAgo: 0, niche: 12, middle: 6, mainstream: 4 }),
    ]);
    mocks.learnedPattern.findUnique.mockImplementation((args: { where: { signal_class_pattern_key_cap_class_horizon_days: { signal_class: string; horizon_days: number } } }) => {
      const k = args.where.signal_class_pattern_key_cap_class_horizon_days;
      if (k.signal_class === 'diffusion' && k.horizon_days === 7) {
        return Promise.resolve(buildLearnedCell({
          alpha: 18, beta: 8, sample_size: 30, effective_sample_size: 30,
          status: 'EXPLORATORY-WATCH',
        }));
      }
      return Promise.resolve(null);
    });

    const ctx = await getEngineContextForTicker('AMD', ASOF);

    expect(ctx.status).toBe('EXPLORATORY-WATCH');
    expect(ctx.effective_sample_size).toBe(30);
  });

  it('surfaces per-class ESS for technical/institutional/insider when those cells exist', async () => {
    const snap = buildSnapshot({ daysAgo: 0, niche: 5, middle: 3, mainstream: 1 });
    const snapWithSmartMoney = {
      ...snap,
      insider_data: {
        insider_bucket: 'cluster_buying',
        data_age_days: 5,
        distinct_buyers: 3,
        distinct_sellers: 0,
        net_buy_share_count: 10000,
        net_sell_share_count: 0,
        buy_value_usd: 500000,
        sell_value_usd: null,
        has_ceo_buy: true,
        has_cfo_buy: false,
        has_director_buy: false,
        is_planned_10b5_1: false,
        filings_count: 3,
        earliest_filing_date: '2026-04-01',
        latest_filing_date: '2026-04-25',
        computed_at: '2026-04-30T00:00:00.000Z',
        data_source: 'finnhub',
        insider_sentiment_mspr: 0.6,
      },
      institutional_data: {
        institutional_bucket: 'net_accumulation',
        data_age_days: 14,
        total_institutional_share: 5000000,
        total_institutional_share_prev: 4800000,
        net_share_change: 200000,
        net_share_change_pct: 4.2,
        fund_count_current: 142,
        fund_count_prev: 137,
        fund_count_delta: 5,
        top10_concentration_pct: 38,
        top10_concentration_pct_prev: 36,
        ticker_30d_return_pct: 3.5,
        spy_30d_return_pct: 1.2,
        report_date: '2026-03-31',
        filing_date: '2026-04-15',
        computed_at: '2026-04-30T00:00:00.000Z',
        data_source: 'finnhub',
      },
    };
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([snapWithSmartMoney]);
    mocks.sentimentSnapshot.findMany.mockResolvedValueOnce([snapWithSmartMoney]);
    mocks.computeTechnicalSnapshot.mockResolvedValueOnce(buildTechSnap());
    mocks.learnedPattern.findUnique.mockImplementation((args: { where: { signal_class_pattern_key_cap_class_horizon_days: { signal_class: string; horizon_days: number } } }) => {
      const k = args.where.signal_class_pattern_key_cap_class_horizon_days;
      if (k.signal_class === 'technical' && k.horizon_days === 30) {
        return Promise.resolve(buildLearnedCell({
          alpha: 16, beta: 8, sample_size: 24, effective_sample_size: 19,
        }));
      }
      if (k.signal_class === 'institutional' && k.horizon_days === 30) {
        return Promise.resolve(buildLearnedCell({
          alpha: 14, beta: 6, sample_size: 20, effective_sample_size: 17,
        }));
      }
      if (k.signal_class === 'insider' && k.horizon_days === 30) {
        return Promise.resolve(buildLearnedCell({
          alpha: 10, beta: 5, sample_size: 15, effective_sample_size: 12,
        }));
      }
      return Promise.resolve(null);
    });

    const ctx = await getEngineContextForTicker('TSLA', ASOF);

    expect(ctx.technical_ess).toBe(19);
    expect(ctx.institutional_ess).toBe(17);
    expect(ctx.insider_ess).toBe(12);
    // Diffusion cell wasn't seeded here, so its ESS is 0.
    expect(ctx.effective_sample_size).toBe(0);
    // LogisticEpoch carries no ESS column — Plan 18-07 documents this as 0.
    expect(ctx.logistic_ess).toBe(0);
  });
});

// ── Phase 17-04 — types back-compat test ───────────────────────────────

import type { EngineCalibration, HorizonCalibration, AnalysisResult } from '@/lib/types';

describe('types — Phase 17-04 back-compat', () => {
  it('old EngineCalibration without Phase-17 fields still satisfies the type', () => {
    const oldCal: EngineCalibration = {
      cycle_count: 5,
      flow_pattern: 'niche_leads',
      cap_class: 'large_cap',
      trace_window_size: 4,
      posterior_mean: 0.62,
      ci_low: 0.50,
      ci_high: 0.74,
      sample_size: 20,
      status: 'ACTIVE',
      brier_in_sample: 0.18,
      brier_null: 0.25,
      drift_z: 0.3,
      logistic_score: 0.58,
      logistic_ci_low: 0.45,
      logistic_ci_high: 0.71,
      logistic_sample_size: 80,
      predicted_at: '2026-04-30T12:00:00.000Z',
      engine_alignment: 'Niche leads × large cap historically beats SPY by 4% over 7d.',
      engine_disagreement: null,
      diffusion_sparkline: [{ niche: 5, middle: 3, mainstream: 1, scanned_at: '2026-04-29T00:00:00.000Z' }],
      // No Phase-17 fields — this is intentional: testing backward compatibility
    } as EngineCalibration;
    expect(oldCal).toBeDefined();
    expect(oldCal.institutional_posterior_mean).toBeUndefined();
    expect(oldCal.insider_posterior_mean).toBeUndefined();
  });

  it('old HorizonCalibration without Phase-17 fields still satisfies the type', () => {
    const oldRow: HorizonCalibration = {
      horizon_days: 30,
      diffusion_posterior: 0.5,
      diffusion_ci: [0.4, 0.6],
      technical_posterior: null,
      technical_ci: null,
      sample_size: 12,
      status: 'ACTIVE',
    };
    expect(oldRow).toBeDefined();
    expect(oldRow.institutional_posterior).toBeUndefined();
    expect(oldRow.insider_posterior).toBeUndefined();
  });

  it('old AnalysisResult without snapshot fields still satisfies the type', () => {
    const oldResult: Partial<AnalysisResult> = {
      ticker: 'AAPL',
      company_name: 'Apple Inc.',
      analyzed_at: '2026-04-30T12:00:00.000Z',
      market_sentiment: 'bullish',
      sentiment_reasoning: 'Strong fundamentals.',
      bullish_signals: [{ signal: 'Revenue growth', source_citation: 'Yahoo Finance' }],
      bearish_signals: [{ signal: 'Valuation stretched', source_citation: 'Finnhub' }],
      assessment: { buy_pct: 60, hold_pct: 30, sell_pct: 10, buy_rationale: '', hold_rationale: '', sell_rationale: '' },
      confidence_level: 'High',
      confidence_explanation: 'Multiple data sources agree.',
      sources_used: [{ name: 'Yahoo Finance', key_fact: 'Revenue $90B' }],
      source_warnings: [],
      // No insider_at_report or institutional_at_report — testing backward compatibility
    };
    expect(oldResult).toBeDefined();
    expect((oldResult as AnalysisResult).insider_at_report).toBeUndefined();
    expect((oldResult as AnalysisResult).institutional_at_report).toBeUndefined();
  });
});
