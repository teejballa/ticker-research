// tests/sentiment-per-source-ic.unit.test.ts
//
// Phase 20-C-01 Task 5: Per-source IC orchestrator unit tests.
//
// The DB-touching `computePerSourceIC` paths use a mocked Prisma client.
// The pure-function helpers (spearmanIC, rollingICIR, selectNeweyWestLag)
// are tested directly with literal inputs and hand-derived expectations.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the Prisma singleton BEFORE importing the module under test.
vi.mock('@/lib/db', () => {
  const findManyMock = vi.fn();
  return {
    prisma: {
      sentimentObservation: { findMany: findManyMock },
      priceOutcome: { findMany: findManyMock },
    },
    __findManyMock: findManyMock,
  };
});

import {
  spearmanIC,
  rollingICIR,
  selectNeweyWestLag,
  computePerSourceIC,
} from '../src/lib/sentiment/per-source-ic';
import { rollingSpearmanIC } from '../src/lib/reasoning/alpha-decay-monitor';

describe('spearmanIC re-export', () => {
  it('is the same reference as rollingSpearmanIC from alpha-decay-monitor', () => {
    expect(spearmanIC).toBe(rollingSpearmanIC);
  });

  it('returns 1.0 on perfectly monotone inputs', () => {
    const ic = spearmanIC({
      predictions: [1, 2, 3, 4, 5],
      realizedReturns: [10, 20, 30, 40, 50],
    });
    expect(Math.abs(ic - 1.0)).toBeLessThan(1e-9);
  });

  it('returns -1.0 on perfectly anti-monotone inputs', () => {
    const ic = spearmanIC({
      predictions: [1, 2, 3, 4, 5],
      realizedReturns: [50, 40, 30, 20, 10],
    });
    expect(Math.abs(ic - -1.0)).toBeLessThan(1e-9);
  });
});

describe('rollingICIR', () => {
  it('computes mean(IC) / sample_std(IC) on synthetic series with Bessel correction', () => {
    // IC = [0.1, 0.15, 0.05, 0.20, 0.10]
    // mean = 0.12; deviations from mean: [-0.02, 0.03, -0.07, 0.08, -0.02]
    // sum_sq_dev = 0.0004 + 0.0009 + 0.0049 + 0.0064 + 0.0004 = 0.0130
    // sample variance (n-1 = 4 denom): 0.0130 / 4 = 0.00325
    // sample std: sqrt(0.00325) ≈ 0.0570087712549569
    // ICIR ≈ 0.12 / 0.0570087712549569 ≈ 2.10493...
    const series = [0.1, 0.15, 0.05, 0.2, 0.1];
    const icir = rollingICIR(series, 5);
    expect(icir).not.toBeNull();
    const expected = 0.12 / Math.sqrt(0.013 / 4);
    expect(Math.abs((icir as number) - expected)).toBeLessThan(1e-9);
  });

  it('returns null when perDayIC.length < window', () => {
    expect(rollingICIR([0.1, 0.2, 0.3], 20)).toBeNull();
  });

  it('returns null when sample_std === 0 (constant IC)', () => {
    expect(rollingICIR([0.1, 0.1, 0.1, 0.1, 0.1], 5)).toBeNull();
  });
});

describe('selectNeweyWestLag', () => {
  it('returns 5 for horizon = 7 (Newey-West 1987 rule)', () => {
    expect(selectNeweyWestLag(7)).toBe(5);
  });

  it('returns 10 for horizon = 30 (Newey-West 1987 rule)', () => {
    expect(selectNeweyWestLag(30)).toBe(10);
  });
});

describe('computePerSourceIC', () => {
  let findManyMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const dbMod = (await import('@/lib/db')) as unknown as {
      __findManyMock: ReturnType<typeof vi.fn>;
    };
    findManyMock = dbMod.__findManyMock;
    findManyMock.mockReset();
  });

  it('returns null when n_observations < 20 (cold-start, no row written)', async () => {
    // Only 19 distinct fetched_at days — below n_min=20.
    const obs: Array<{
      ticker: string;
      fetched_at: Date;
      classifier_score: number;
    }> = [];
    for (let day = 0; day < 19; day++) {
      for (let t = 0; t < 8; t++) {
        obs.push({
          ticker: `TICKER${t}`,
          fetched_at: new Date(2026, 0, day + 1),
          classifier_score: Math.random(),
        });
      }
    }
    // First call: SentimentObservation.findMany returns obs.
    // Second call (if reached): PriceOutcome.findMany returns []. We return [] anyway.
    findManyMock.mockResolvedValue(obs);

    const result = await computePerSourceIC('stocktwits', 7, new Date(2026, 0, 20));
    expect(result).toBeNull();
  });

  it('returns null when cross-sectional N per day < 5 for every day', async () => {
    // 25 days, each with only 4 tickers — Spearman undefined.
    const obs: Array<{
      ticker: string;
      fetched_at: Date;
      classifier_score: number;
    }> = [];
    for (let day = 0; day < 25; day++) {
      for (let t = 0; t < 4; t++) {
        obs.push({
          ticker: `T${t}`,
          fetched_at: new Date(2026, 0, day + 1),
          classifier_score: Math.random(),
        });
      }
    }
    findManyMock.mockResolvedValue(obs);

    const result = await computePerSourceIC('stocktwits', 7, new Date(2026, 0, 26));
    expect(result).toBeNull();
  });

  it('SQL join uses fetched_at NEVER published_at (PIT discipline)', async () => {
    findManyMock.mockResolvedValue([]);

    await computePerSourceIC('stocktwits', 7, new Date(2026, 0, 20));

    // Walk every mock invocation and assert no WHERE clause references
    // `published_at`. Only `fetched_at` is allowed.
    for (const call of findManyMock.mock.calls) {
      const arg = call[0] as
        | { where?: Record<string, unknown> }
        | undefined;
      const serialized = JSON.stringify(arg ?? {});
      expect(serialized).not.toContain('published_at');
      // At least one call should reference fetched_at (the sentiment-observation query).
    }
    const allArgs = JSON.stringify(findManyMock.mock.calls);
    expect(allArgs).toContain('fetched_at');
  });
});
