/**
 * Phase 22 Wave 1 — Regime classifier tests (turning Wave 0 RED stub GREEN).
 *
 * Covers: CORE-ML-07 per 22-VALIDATION.md §Per-Task Verification Map.
 * Decision refs: D-02 (4-bucket), D-03 (trend axis), D-04 (vol axis), D-09 (cold-start).
 *
 * Strategy: mock the two input helpers (`getVix60dPercentile`, `getSpyMaCross`)
 * to drive the classifier's branching logic deterministically. The helpers' own
 * fixture-driven correctness lives in their dedicated test files (vix-percentile.test.ts,
 * ma-cross.test.ts).
 *
 * No `@knowable_at` on test files — only on production code per CLAUDE.md rule #6.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetVix, mockGetMa } = vi.hoisted(() => ({
  mockGetVix: vi.fn(),
  mockGetMa: vi.fn(),
}));

vi.mock('../vix-percentile', () => ({
  getVix60dPercentile: mockGetVix,
}));
vi.mock('../ma-cross', () => ({
  getSpyMaCross: mockGetMa,
}));

import { classifyRegimeAt } from '../classify';

const asOf = new Date('2024-01-15T00:00:00Z');

describe('classifyRegimeAt — D-02..D-04 + D-09 contract', () => {
  beforeEach(() => {
    mockGetVix.mockReset();
    mockGetMa.mockReset();
  });

  it('returns regime="ALL" when VIX helper returns null (D-09 cold-start)', async () => {
    mockGetVix.mockResolvedValueOnce(null);
    mockGetMa.mockResolvedValueOnce({ ma50_minus_ma200: 10 });
    const result = await classifyRegimeAt({ asOf });
    expect(result).toEqual({
      regime: 'ALL',
      vix_level: null,
      vix_60d_percentile: null,
      spy_ma_50_minus_200: null,
    });
  });

  it('returns regime="ALL" when SPY MA helper returns null (D-09 cold-start)', async () => {
    mockGetVix.mockResolvedValueOnce({ level: 18.0, percentile_60d: 0.3 });
    mockGetMa.mockResolvedValueOnce(null);
    const result = await classifyRegimeAt({ asOf });
    expect(result.regime).toBe('ALL');
    expect(result.vix_level).toBeNull();
    expect(result.spy_ma_50_minus_200).toBeNull();
  });

  it('returns "bull-low-vol" when MA50 > MA200 AND VIX < 60d 50th-pct (D-02 + D-03 + D-04)', async () => {
    mockGetVix.mockResolvedValueOnce({ level: 16.0, percentile_60d: 0.25 });
    mockGetMa.mockResolvedValueOnce({ ma50_minus_ma200: 12.5 });
    const result = await classifyRegimeAt({ asOf });
    expect(result.regime).toBe('bull-low-vol');
    expect(result.vix_level).toBe(16.0);
    expect(result.vix_60d_percentile).toBe(0.25);
    expect(result.spy_ma_50_minus_200).toBe(12.5);
  });

  it('returns "bull-high-vol" when MA50 > MA200 AND VIX >= 60d 50th-pct', async () => {
    mockGetVix.mockResolvedValueOnce({ level: 26.0, percentile_60d: 0.75 });
    mockGetMa.mockResolvedValueOnce({ ma50_minus_ma200: 3.0 });
    const result = await classifyRegimeAt({ asOf });
    expect(result.regime).toBe('bull-high-vol');
  });

  it('returns "bear-low-vol" when MA50 < MA200 AND VIX < 60d 50th-pct', async () => {
    mockGetVix.mockResolvedValueOnce({ level: 14.0, percentile_60d: 0.15 });
    mockGetMa.mockResolvedValueOnce({ ma50_minus_ma200: -8.0 });
    const result = await classifyRegimeAt({ asOf });
    expect(result.regime).toBe('bear-low-vol');
  });

  it('returns "bear-high-vol" when MA50 < MA200 AND VIX >= 60d 50th-pct', async () => {
    mockGetVix.mockResolvedValueOnce({ level: 30.0, percentile_60d: 0.9 });
    mockGetMa.mockResolvedValueOnce({ ma50_minus_ma200: -15.0 });
    const result = await classifyRegimeAt({ asOf });
    expect(result.regime).toBe('bear-high-vol');
  });

  it('treats VIX percentile == 0.5 as "high-vol" per D-04 strict `>=` semantics', async () => {
    mockGetVix.mockResolvedValueOnce({ level: 20.0, percentile_60d: 0.5 });
    mockGetMa.mockResolvedValueOnce({ ma50_minus_ma200: 5.0 });
    const result = await classifyRegimeAt({ asOf });
    expect(result.regime).toBe('bull-high-vol');
  });

  it('treats MA50 == MA200 boundary as "bull" axis (sign(0) = +) per D-03', async () => {
    mockGetVix.mockResolvedValueOnce({ level: 17.0, percentile_60d: 0.3 });
    mockGetMa.mockResolvedValueOnce({ ma50_minus_ma200: 0 });
    const result = await classifyRegimeAt({ asOf });
    expect(result.regime).toBe('bull-low-vol');
  });

  it('annotates result with vix_level, vix_60d_percentile, and spy_ma_50_minus_200 for audit trail', async () => {
    mockGetVix.mockResolvedValueOnce({ level: 22.5, percentile_60d: 0.62 });
    mockGetMa.mockResolvedValueOnce({ ma50_minus_ma200: -2.3 });
    const result = await classifyRegimeAt({ asOf });
    expect(result).toMatchObject({
      regime: 'bear-high-vol',
      vix_level: 22.5,
      vix_60d_percentile: 0.62,
      spy_ma_50_minus_200: -2.3,
    });
  });

  it('passes asOf through to both input helpers (PIT discipline — no Date.now() leakage)', async () => {
    mockGetVix.mockResolvedValueOnce({ level: 17.0, percentile_60d: 0.3 });
    mockGetMa.mockResolvedValueOnce({ ma50_minus_ma200: 1.0 });
    const pastDate = new Date('2020-03-15T00:00:00Z');
    await classifyRegimeAt({ asOf: pastDate });
    expect(mockGetVix).toHaveBeenCalledWith(pastDate);
    expect(mockGetMa).toHaveBeenCalledWith(pastDate);
  });
});
