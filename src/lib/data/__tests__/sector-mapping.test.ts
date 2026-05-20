// src/lib/data/__tests__/sector-mapping.test.ts
//
// Phase 21 — Sector-Relative Outcome Labels.
//
// Plan 21-0-01 wrote the red-phase scaffolding (all tests failed with
// 'Not implemented'). Plan 21-1-03 wires per-test vi.mock for the
// yahoo-finance2 module so the 11 sector mappings + SPY fallback + 6
// META/GOOGL reconstitution-override cases + cache-hit semantics all
// resolve green against the real getSectorETF implementation.
//
// Mocking strategy:
//   • Single shared `mockQuoteSummary = vi.fn()` is installed by
//     vi.mock('yahoo-finance2') at module load. Each test arms exactly
//     one mockResolvedValueOnce / mockRejectedValueOnce before invoking
//     getSectorETF — guarantees cross-test isolation.
//   • Upstash cache cleared between tests via
//     __resetUpstashClientForTests() so cache hits from prior cases
//     don't leak into the next ticker.
//   • SECTOR_RECONSTITUTIONS override cases (META/GOOGL with asOfDate)
//     intentionally do NOT install a mock — the test then asserts
//     `mockQuoteSummary` was NEVER called. This proves the override
//     path executes before any Yahoo lookup.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.hoisted` ensures mockQuoteSummary exists before vi.mock's factory runs
// (vi.mock is hoisted above all imports; without vi.hoisted the mock factory
// would reference an undefined `mockQuoteSummary`).
const { mockQuoteSummary } = vi.hoisted(() => ({ mockQuoteSummary: vi.fn() }));

vi.mock('yahoo-finance2', () => ({
  default: class {
    quoteSummary = mockQuoteSummary;
  },
}));

// Use the Phase 30 in-memory Upstash mock so the cache-hit test actually
// observes a hit between two getSectorETF calls (real upstash.ts no-ops
// without UPSTASH env vars, which would defeat the cache-hit assertion).
vi.mock('@/lib/data/cache/upstash', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

import { __resetUpstashClientForTests } from '@/lib/data/cache';
import { getSectorETF, type SectorETF } from '../sector-mapping';

describe('getSectorETF', () => {
  beforeEach(() => {
    mockQuoteSummary.mockReset();
    __resetUpstashClientForTests();
  });

  // ─── 11 SPDR sector mappings (Yahoo → ETF) ──────────────────────────────

  it('maps AAPL to XLK (Technology)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Technology' } });
    expect(await getSectorETF({ ticker: 'AAPL' })).toBe('XLK' satisfies SectorETF);
  });

  it('maps JPM to XLF (Financials)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Financial Services' } });
    expect(await getSectorETF({ ticker: 'JPM' })).toBe('XLF' satisfies SectorETF);
  });

  it('maps XOM to XLE (Energy)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Energy' } });
    expect(await getSectorETF({ ticker: 'XOM' })).toBe('XLE' satisfies SectorETF);
  });

  it('maps UNH to XLV (Healthcare)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Healthcare' } });
    expect(await getSectorETF({ ticker: 'UNH' })).toBe('XLV' satisfies SectorETF);
  });

  it('maps AMZN to XLY (Consumer Cyclical)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Consumer Cyclical' } });
    expect(await getSectorETF({ ticker: 'AMZN' })).toBe('XLY' satisfies SectorETF);
  });

  it('maps PG to XLP (Consumer Defensive)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Consumer Defensive' } });
    expect(await getSectorETF({ ticker: 'PG' })).toBe('XLP' satisfies SectorETF);
  });

  it('maps CAT to XLI (Industrials)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Industrials' } });
    expect(await getSectorETF({ ticker: 'CAT' })).toBe('XLI' satisfies SectorETF);
  });

  it('maps NEE to XLU (Utilities)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Utilities' } });
    expect(await getSectorETF({ ticker: 'NEE' })).toBe('XLU' satisfies SectorETF);
  });

  it('maps LIN to XLB (Basic Materials)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Basic Materials' } });
    expect(await getSectorETF({ ticker: 'LIN' })).toBe('XLB' satisfies SectorETF);
  });

  it('maps AMT to XLRE (Real Estate)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Real Estate' } });
    expect(await getSectorETF({ ticker: 'AMT' })).toBe('XLRE' satisfies SectorETF);
  });

  it('maps GOOGL (no asOfDate, today) to XLC (Communication Services)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Communication Services' } });
    expect(await getSectorETF({ ticker: 'GOOGL' })).toBe('XLC' satisfies SectorETF);
  });

  // ─── SPY fallback (null sector + thrown error) ──────────────────────────

  it('falls back to SPY when summary.sector is null/missing', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: {} });
    expect(await getSectorETF({ ticker: 'XYZUNKNOWN_FAKE_TICKER' })).toBe('SPY' satisfies SectorETF);
  });

  it('falls back to SPY when yf.quoteSummary throws', async () => {
    mockQuoteSummary.mockRejectedValueOnce(new Error('404 Not Found'));
    expect(await getSectorETF({ ticker: 'ANOTHER_UNKNOWN' })).toBe('SPY' satisfies SectorETF);
  });

  // ─── Reconstitution-override cases (asOfDate provided; NO Yahoo call) ──
  //
  // The 2018-09-28 GICS reconstitution moved META, GOOGL, GOOG, NFLX, DIS,
  // T, and VZ out of "Technology / Consumer Discretionary" into the new
  // "Communication Services" sector. XLK/XLY indexing of these names stops
  // EOD 2018-09-28; XLC indexing begins 2018-09-29.

  it('respects asOfDate — META pre-2018-09-28 → XLK via override (no Yahoo call)', async () => {
    expect(await getSectorETF({ ticker: 'META', asOfDate: new Date('2017-01-01') })).toBe('XLK');
    expect(mockQuoteSummary).not.toHaveBeenCalled();
  });

  it('respects asOfDate — META ON the 2018-09-28 cutover day → XLK via override (last day of XLK indexing)', async () => {
    expect(await getSectorETF({ ticker: 'META', asOfDate: new Date('2018-09-28') })).toBe('XLK');
    expect(mockQuoteSummary).not.toHaveBeenCalled();
  });

  it('respects asOfDate — META 2018-09-29 → XLC via override (XLC indexing begins)', async () => {
    expect(await getSectorETF({ ticker: 'META', asOfDate: new Date('2018-09-29') })).toBe('XLC');
    expect(mockQuoteSummary).not.toHaveBeenCalled();
  });

  it('respects asOfDate — META 2019-01-01 → XLC via override (post-reconstitution sticky)', async () => {
    expect(await getSectorETF({ ticker: 'META', asOfDate: new Date('2019-01-01') })).toBe('XLC');
    expect(mockQuoteSummary).not.toHaveBeenCalled();
  });

  it('no asOfDate → today classification via Yahoo — META → XLC (override skipped without asOfDate)', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Communication Services' } });
    expect(await getSectorETF({ ticker: 'META' })).toBe('XLC');
    expect(mockQuoteSummary).toHaveBeenCalledTimes(1);
  });

  it('GOOGL on 2018-09-28 cutover → XLK via override (same Telecom→Comm-Services event)', async () => {
    expect(await getSectorETF({ ticker: 'GOOGL', asOfDate: new Date('2018-09-28') })).toBe('XLK');
    expect(mockQuoteSummary).not.toHaveBeenCalled();
  });

  // ─── Cache-hit: second call does not re-fetch from Yahoo ────────────────

  it('caches per-ticker — second call does not re-fetch from Yahoo', async () => {
    mockQuoteSummary.mockResolvedValueOnce({ summaryProfile: { sector: 'Technology' } });
    await getSectorETF({ ticker: 'AAPL_CACHE_PROBE' });
    await getSectorETF({ ticker: 'AAPL_CACHE_PROBE' });
    expect(mockQuoteSummary).toHaveBeenCalledTimes(1);
  });
});
