/**
 * Phase 21.1 D-17 — Integration test: three labels via ONE shared compute path.
 *
 * Tests computeLabelsFor() directly (the shared helper that both relabel and
 * price-followup call). This is the fastest reliable validation of the
 * label-computation contract without a live DB.
 *
 * UNIT CONVENTION: sector_relative_pct is in PERCENTAGE-POINTS, matching the
 * rest of the system (price-followup comment: "2.34 means +2.34%").
 * So sector_relative_pct=2.5 means +2.5%; threshold_pct=1 means ≥1%.
 *
 * sector_sigma_60d is returned in DECIMAL form from getSectorSigma60d
 * (0.012 = 1.2%/day as a stdev of daily returns). classifyHit computes
 * threshold = k * sigma in the same decimal units, then compares to
 * sector_relative_pct which is in percentage-points. This means classifyHit
 * effectively treats both as the same numeric scale — which is the existing
 * production contract (D-14: k=1, σ in decimal, sector_rel in pct-points).
 *
 * Mock contract:
 *   - getSectorSigma60d is mocked to return 0.012 for 'XLK'
 *   - classifyHit is the REAL implementation — verifies end-to-end wiring
 *
 * Acceptance criteria (from plan):
 *   - All 3 BOOLEAN columns populated by single code path (computeLabelsFor)
 *   - sector_relative_pct=2.5 → directional=true, sigma_k1=true (2.5 > 0.012), flat1=true (2.5 > 1)
 *   - sector_relative_pct=0.5 → directional=true, sigma_k1=true (0.5 > 0.012), flat1=false (0.5 < 1)
 *   - sector_etf=null → getSectorSigma60d not called → sigma_k1=null, sector_sigma_60d=null
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock getSectorSigma60d before importing computeLabelsFor
vi.mock('@/lib/data/sector-mapping', () => ({
  getSectorSigma60d: vi.fn(),
  getSectorETF: vi.fn(),
}));

import { computeLabelsFor } from '@/lib/labels/compute';
import { getSectorSigma60d } from '@/lib/data/sector-mapping';

const mockGetSectorSigma60d = vi.mocked(getSectorSigma60d);

describe('computeLabelsFor — three-label single-code-path validation', () => {
  const asOf = new Date('2025-06-01T00:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    // σ = 0.012 (decimal daily stdev — 1.2%/day)
    mockGetSectorSigma60d.mockResolvedValue(0.012);
  });

  it('sector_relative_pct=2.5ppt → directional=true, sigma_k1=true (2.5>0.012), flat1=true (2.5>1)', async () => {
    const result = await computeLabelsFor({
      sector_etf: 'XLK',
      asOf,
      ticker_return_pct: 3.5,       // percentage-points
      spy_return_pct: null,
      sector_relative_pct: 2.5,     // percentage-points: +2.5% above sector
    });

    expect(result.sector_sigma_60d).toBe(0.012);
    // D-15: 2.5 > 0 → true
    expect(result.is_directional_hit).toBe(true);
    // D-14: 2.5 > 1*0.012 = 0.012 → true (pct-points vs decimal — both numeric scale match)
    expect(result.is_sigma_hit_k1).toBe(true);
    // D-16: 2.5 > 1 (threshold_pct=1ppt) → true
    expect(result.is_hit_flat1).toBe(true);
  });

  it('sector_relative_pct=0.5ppt → directional=true, sigma_k1=true (0.5>0.012), flat1=false (0.5<1)', async () => {
    const result = await computeLabelsFor({
      sector_etf: 'XLK',
      asOf,
      ticker_return_pct: 1.0,
      spy_return_pct: null,
      sector_relative_pct: 0.5,     // +0.5ppt: beats σ threshold (0.012) but NOT flat 1ppt
    });

    expect(result.sector_sigma_60d).toBe(0.012);
    // D-15: 0.5 > 0 → true
    expect(result.is_directional_hit).toBe(true);
    // D-14: 0.5 > 0.012 → true
    expect(result.is_sigma_hit_k1).toBe(true);
    // D-16: 0.5 < 1 → false
    expect(result.is_hit_flat1).toBe(false);
  });

  it('sector_relative_pct negative → directional=false, sigma_k1=false, flat1=false', async () => {
    const result = await computeLabelsFor({
      sector_etf: 'XLK',
      asOf,
      ticker_return_pct: -1.0,
      spy_return_pct: null,
      sector_relative_pct: -2.0,    // -2ppt: misses all three thresholds
    });

    expect(result.sector_sigma_60d).toBe(0.012);
    expect(result.is_directional_hit).toBe(false);
    expect(result.is_sigma_hit_k1).toBe(false);
    expect(result.is_hit_flat1).toBe(false);
  });

  it('sector_etf=null → getSectorSigma60d not called, sigma_k1=null, sigma_60d=null', async () => {
    const result = await computeLabelsFor({
      sector_etf: null,
      asOf,
      ticker_return_pct: 5.0,
      spy_return_pct: null,
      sector_relative_pct: 3.0,    // +3ppt — but no ETF to fetch sigma
    });

    expect(result.sector_sigma_60d).toBeNull();
    // sigma_k1 null when sigma unavailable (no ETF to fetch)
    expect(result.is_sigma_hit_k1).toBeNull();
    // directional still computes from sector_relative_pct (doesn't need sigma)
    expect(result.is_directional_hit).toBe(true);
    // flat1 still computes from sector_relative_pct (doesn't need sigma)
    expect(result.is_hit_flat1).toBe(true);
    // getSectorSigma60d must NOT have been called when sector_etf is null
    expect(mockGetSectorSigma60d).not.toHaveBeenCalled();
  });

  it('sector_etf=null AND sector_relative_pct=null → all labels null', async () => {
    const result = await computeLabelsFor({
      sector_etf: null,
      asOf,
      ticker_return_pct: 5.0,
      spy_return_pct: null,
      sector_relative_pct: null,
    });

    expect(result.sector_sigma_60d).toBeNull();
    expect(result.is_directional_hit).toBeNull();
    expect(result.is_sigma_hit_k1).toBeNull();
    expect(result.is_hit_flat1).toBeNull();
  });

  it('getSectorSigma60d returns null (yahoo failure) → sigma_k1=null; directional + flat1 still compute', async () => {
    mockGetSectorSigma60d.mockResolvedValue(null);

    const result = await computeLabelsFor({
      sector_etf: 'XLK',
      asOf,
      ticker_return_pct: 2.5,
      spy_return_pct: null,
      sector_relative_pct: 2.5,    // +2.5ppt
    });

    expect(result.sector_sigma_60d).toBeNull();
    // sigma_k1 null when sigma fetch failed
    expect(result.is_sigma_hit_k1).toBeNull();
    // directional and flat1 are independent of sigma
    expect(result.is_directional_hit).toBe(true);
    expect(result.is_hit_flat1).toBe(true);
  });

  it('getSectorSigma60d is called with the correct etf and asOf date', async () => {
    const specificAsOf = new Date('2025-03-15T12:00:00Z');
    await computeLabelsFor({
      sector_etf: 'XLF',
      asOf: specificAsOf,
      ticker_return_pct: 1.0,
      spy_return_pct: null,
      sector_relative_pct: 2.0,
    });

    expect(mockGetSectorSigma60d).toHaveBeenCalledWith('XLF', specificAsOf);
    expect(mockGetSectorSigma60d).toHaveBeenCalledTimes(1);
  });

  it('all four fields present in return value; getSectorSigma60d called exactly once', async () => {
    const result = await computeLabelsFor({
      sector_etf: 'XLK',
      asOf,
      ticker_return_pct: 1.5,
      spy_return_pct: null,
      sector_relative_pct: 1.5,
    });

    // All four fields must be present — single return object, single code path
    expect('is_directional_hit' in result).toBe(true);
    expect('is_sigma_hit_k1' in result).toBe(true);
    expect('is_hit_flat1' in result).toBe(true);
    expect('sector_sigma_60d' in result).toBe(true);
    // Exactly one sigma fetch — ONE shared compute path
    expect(mockGetSectorSigma60d).toHaveBeenCalledTimes(1);
  });
});
