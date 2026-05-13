// tests/sentiment-source-tier.unit.test.ts
//
// Phase 20-B-04 Task 5: Source-tier pure-function + DB-mock unit tests.
//
// Pure functions (softmaxWithCaps, computeSourceWeights) are tested directly.
// getWeightForSource is tested with a mocked Prisma singleton.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the Prisma singleton BEFORE importing the module under test.
vi.mock('@/lib/db', () => {
  const findFirstMock = vi.fn();
  return {
    prisma: {
      sourceTier: { findFirst: findFirstMock },
    },
    __findFirstMock: findFirstMock,
  };
});

import {
  softmaxWithCaps,
  computeSourceWeights,
  getWeightForSource,
  type PerSourceICRow,
} from '@/lib/sentiment/source-tier';
import { SOURCE_TIER_HYPERPARAMETERS } from '@/lib/sentiment/source-tier-hyperparameters';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — accessing mocked export via dynamic shape
import * as dbMock from '@/lib/db';

describe('softmaxWithCaps', () => {
  it('preserves ordering: highest IC → highest weight', () => {
    const w = softmaxWithCaps([0.5, 0.0, -0.5]);
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[1]).toBeGreaterThan(w[2]);
  });

  it('all-equal inputs → all weights equal 1.0 (uniform × N convention)', () => {
    const w = softmaxWithCaps([0.1, 0.1, 0.1]);
    for (const wi of w) {
      expect(Math.abs(wi - 1.0)).toBeLessThan(1e-9);
    }
  });

  it('clamps at cap_max=5.0 when one source dominates over many', () => {
    // 6 sources, one very high — softmax×N for the high source >> 5 without clamp
    const w = softmaxWithCaps([10.0, -10.0, -10.0, -10.0, -10.0, -10.0]);
    expect(w[0]).toBe(5.0);
    // Others get clamped to cap_min floor
    for (let i = 1; i < w.length; i++) {
      expect(w[i]).toBe(0.5);
    }
  });

  it('clamps at cap_min=0.5 when a source is far below others (with N>=3)', () => {
    // With 3 elements where one is far below: softmax×3 of the low one ≈ 0 → clamped to 0.5
    const w = softmaxWithCaps([5.0, 5.0, -10.0]);
    // Low one is below 0.5 after softmax×N, so clamped to floor
    expect(w[2]).toBe(0.5);
  });

  it('throws on empty input (caller bug)', () => {
    expect(() => softmaxWithCaps([])).toThrow(/empty/i);
  });

  it('throws on non-finite value', () => {
    expect(() => softmaxWithCaps([0.1, NaN, 0.3])).toThrow(/non-finite/i);
    expect(() => softmaxWithCaps([0.1, Infinity])).toThrow(/non-finite/i);
  });

  it('throws on cap_min >= cap_max', () => {
    expect(() => softmaxWithCaps([0.1, 0.2], 5.0, 5.0)).toThrow(/cap/i);
    expect(() => softmaxWithCaps([0.1, 0.2], 5.0, 1.0)).toThrow(/cap/i);
  });

  it('throws on non-positive cap_min', () => {
    expect(() => softmaxWithCaps([0.1, 0.2], 0, 5.0)).toThrow(/cap/i);
    expect(() => softmaxWithCaps([0.1, 0.2], -1.0, 5.0)).toThrow(/cap/i);
  });
});

describe('computeSourceWeights', () => {
  it('source with n_observations < 30 → weight = 1.0 + is_cold_start = true', () => {
    const rows: PerSourceICRow[] = [
      { source_id: 'X', mean_ic_90d: 0.1, n_observations: 10 },
      { source_id: 'Y', mean_ic_90d: 0.2, n_observations: 50 },
      { source_id: 'Z', mean_ic_90d: -0.1, n_observations: 50 },
    ];
    const result = computeSourceWeights(rows);
    const x = result.find((r) => r.source_id === 'X');
    expect(x).toBeDefined();
    expect(x!.weight).toBe(1.0);
    expect(x!.is_cold_start).toBe(true);
  });

  it('source with mean_ic_90d == null → weight = 1.0 + is_cold_start = true', () => {
    const rows: PerSourceICRow[] = [
      { source_id: 'A', mean_ic_90d: null, n_observations: 90 },
      { source_id: 'B', mean_ic_90d: 0.1, n_observations: 90 },
      { source_id: 'C', mean_ic_90d: 0.2, n_observations: 90 },
    ];
    const result = computeSourceWeights(rows);
    const a = result.find((r) => r.source_id === 'A');
    expect(a!.weight).toBe(1.0);
    expect(a!.is_cold_start).toBe(true);
  });

  it('mixed cold-start + eligible: cold-start gets 1.0; eligible go through softmax', () => {
    const rows: PerSourceICRow[] = [
      { source_id: 'cold', mean_ic_90d: 0.99, n_observations: 5 }, // n<30 → cold
      { source_id: 'e1', mean_ic_90d: 0.05, n_observations: 90 },
      { source_id: 'e2', mean_ic_90d: 0.10, n_observations: 90 },
      { source_id: 'e3', mean_ic_90d: -0.05, n_observations: 90 },
    ];
    const result = computeSourceWeights(rows);
    expect(result.find((r) => r.source_id === 'cold')!.weight).toBe(1.0);
    const eligible = result.filter((r) => !r.is_cold_start);
    expect(eligible.length).toBe(3);
    // Eligible sources should NOT all be 1.0 — softmax differentiates them
    const distinct = new Set(eligible.map((r) => r.weight));
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });

  it('all eligible weights ∈ [cap_min, cap_max]', () => {
    const rows: PerSourceICRow[] = [
      { source_id: 'a', mean_ic_90d: 100.0, n_observations: 90 },
      { source_id: 'b', mean_ic_90d: -100.0, n_observations: 90 },
      { source_id: 'c', mean_ic_90d: 0.0, n_observations: 90 },
    ];
    const result = computeSourceWeights(rows);
    const eligible = result.filter((r) => !r.is_cold_start);
    for (const r of eligible) {
      expect(r.weight).toBeGreaterThanOrEqual(
        SOURCE_TIER_HYPERPARAMETERS.cap_min,
      );
      expect(r.weight).toBeLessThanOrEqual(
        SOURCE_TIER_HYPERPARAMETERS.cap_max,
      );
    }
  });

  it('all cold-start → all weights = 1.0; no softmax invocation', () => {
    const rows: PerSourceICRow[] = [
      { source_id: 'a', mean_ic_90d: null, n_observations: 90 },
      { source_id: 'b', mean_ic_90d: 0.1, n_observations: 5 },
    ];
    const result = computeSourceWeights(rows);
    expect(result.length).toBe(2);
    for (const r of result) {
      expect(r.weight).toBe(1.0);
      expect(r.is_cold_start).toBe(true);
    }
  });
});

describe('getWeightForSource', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dbMock as any).__findFirstMock.mockReset();
  });

  it('returns 1.0 when no SourceTier row exists (cold-start fallback)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dbMock as any).__findFirstMock.mockResolvedValueOnce(null);
    const w = await getWeightForSource('stocktwits', new Date());
    expect(w).toBe(1.0);
  });

  it('returns the latest row weight when one exists', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dbMock as any).__findFirstMock.mockResolvedValueOnce({ weight: 2.5 });
    const w = await getWeightForSource('stocktwits', new Date());
    expect(w).toBe(2.5);
  });

  it('returns 1.0 when DB throws (defensive fallback, never crashes aggregator)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (dbMock as any).__findFirstMock.mockRejectedValueOnce(
      new Error('connection refused'),
    );
    const w = await getWeightForSource('stocktwits', new Date());
    expect(w).toBe(1.0);
  });
});
