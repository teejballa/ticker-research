// src/lib/data/__tests__/sector-mapping.test.ts
//
// Phase 21 — Sector-Relative Outcome Labels (21-0-01 TDD red-phase scaffolding).
//
// Every it() block currently fails with "Not implemented" because the stub in
// src/lib/data/sector-mapping.ts throws. 21-1-03 implements getSectorETF with
// yahoo-finance2 + Upstash cache + the 2018-09-28 GICS reconstitution override
// table, at which point every test in this file flips to green.
//
// Coverage:
//   • 11 SPDR sector mappings (Test 1–11)
//   • Null/unknown sector → SPY fallback (Test 12)
//   • asOfDate sector-reconstitution drift — META XLK→XLC on 2018-09-28 cutover
//     (Test 13a pre, 13b on-cutover, 13c day-after, 13d sticky-post, 13e
//     no-date-defaults-today)
//   • GOOGL cutover case (Test 13f) — same 2018-09-28 Telecom→Comm-Services event
//   • Cache-hit smoke test (Test 14) — second call does not re-issue Yahoo fetch

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSectorETF, type SectorETF } from '../sector-mapping';

describe('getSectorETF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test 1–11: 11 SPDR sector mappings ─────────────────────────────────

  it('maps AAPL to XLK (Technology)', async () => {
    const etf = await getSectorETF({ ticker: 'AAPL' });
    expect(etf).toBe('XLK' satisfies SectorETF);
  });

  it('maps JPM to XLF (Financials)', async () => {
    const etf = await getSectorETF({ ticker: 'JPM' });
    expect(etf).toBe('XLF' satisfies SectorETF);
  });

  it('maps XOM to XLE (Energy)', async () => {
    const etf = await getSectorETF({ ticker: 'XOM' });
    expect(etf).toBe('XLE' satisfies SectorETF);
  });

  it('maps UNH to XLV (Health Care)', async () => {
    const etf = await getSectorETF({ ticker: 'UNH' });
    expect(etf).toBe('XLV' satisfies SectorETF);
  });

  it('maps AMZN to XLY (Consumer Discretionary)', async () => {
    const etf = await getSectorETF({ ticker: 'AMZN' });
    expect(etf).toBe('XLY' satisfies SectorETF);
  });

  it('maps PG to XLP (Consumer Staples)', async () => {
    const etf = await getSectorETF({ ticker: 'PG' });
    expect(etf).toBe('XLP' satisfies SectorETF);
  });

  it('maps CAT to XLI (Industrials)', async () => {
    const etf = await getSectorETF({ ticker: 'CAT' });
    expect(etf).toBe('XLI' satisfies SectorETF);
  });

  it('maps NEE to XLU (Utilities)', async () => {
    const etf = await getSectorETF({ ticker: 'NEE' });
    expect(etf).toBe('XLU' satisfies SectorETF);
  });

  it('maps LIN to XLB (Materials)', async () => {
    const etf = await getSectorETF({ ticker: 'LIN' });
    expect(etf).toBe('XLB' satisfies SectorETF);
  });

  it('maps AMT to XLRE (Real Estate)', async () => {
    const etf = await getSectorETF({ ticker: 'AMT' });
    expect(etf).toBe('XLRE' satisfies SectorETF);
  });

  it('maps GOOGL to XLC (Communication Services)', async () => {
    const etf = await getSectorETF({ ticker: 'GOOGL' });
    expect(etf).toBe('XLC' satisfies SectorETF);
  });

  // ─── Test 12: SPY fallback when sector is null/unknown ──────────────────

  it('falls back to SPY when sector is null/unknown', async () => {
    const etf = await getSectorETF({ ticker: 'XYZUNKNOWN_FAKE_TICKER' });
    expect(etf).toBe('SPY' satisfies SectorETF);
  });

  // ─── Test 13a–f: asOfDate reconstitution-drift handling ─────────────────
  //
  // The 2018-09-28 GICS reconstitution moved META, GOOGL, GOOG, NFLX, DIS, T,
  // and VZ out of "Technology / Telecom" into the new "Communication Services"
  // sector. XLK indexing of these names stops EOD 2018-09-28; XLC indexing
  // begins 2018-09-29.

  it('respects asOfDate for sector reconstitution drift — META pre-2018-09-28 → XLK', async () => {
    const etf = await getSectorETF({ ticker: 'META', asOfDate: new Date('2017-01-01') });
    expect(etf).toBe('XLK' satisfies SectorETF);
  });

  it('respects asOfDate — META ON the 2018-09-28 cutover day → XLK (last day of XLK indexing)', async () => {
    const etf = await getSectorETF({ ticker: 'META', asOfDate: new Date('2018-09-28') });
    expect(etf).toBe('XLK' satisfies SectorETF);
  });

  it('respects asOfDate — META 2018-09-29 (XLC indexing begins) → XLC', async () => {
    const etf = await getSectorETF({ ticker: 'META', asOfDate: new Date('2018-09-29') });
    expect(etf).toBe('XLC' satisfies SectorETF);
  });

  it('respects asOfDate — META 2019-01-01 → XLC (post-reconstitution sticky)', async () => {
    const etf = await getSectorETF({ ticker: 'META', asOfDate: new Date('2019-01-01') });
    expect(etf).toBe('XLC' satisfies SectorETF);
  });

  it('no asOfDate → today classification via quoteSummary.sector — META → XLC', async () => {
    const etf = await getSectorETF({ ticker: 'META' });
    expect(etf).toBe('XLC' satisfies SectorETF);
  });

  it('GOOGL on 2018-09-28 cutover → XLK (same Telecom→Comm-Services event)', async () => {
    const etf = await getSectorETF({ ticker: 'GOOGL', asOfDate: new Date('2018-09-28') });
    expect(etf).toBe('XLK' satisfies SectorETF);
  });

  // ─── Test 14: Cache-hit smoke (21-1-03 wires full vi.mock) ──────────────

  it('caches per-ticker lookup (second call does not re-fetch from Yahoo)', async () => {
    // 21-1-03 will replace this body with full vi.mock('yahoo-finance2') wiring:
    //   const yahooSpy = vi.fn().mockResolvedValue({ summaryProfile: { sector: 'Technology' } });
    //   await getSectorETF({ ticker: 'AAPL' });
    //   await getSectorETF({ ticker: 'AAPL' });
    //   expect(yahooSpy).toHaveBeenCalledTimes(1);
    //
    // For now, the raw call below throws "Not implemented" (the stub),
    // confirming red phase. expect(true).toBe(true) below never executes.
    await getSectorETF({ ticker: 'AAPL' });
    await getSectorETF({ ticker: 'AAPL' });
    expect(true).toBe(true);
  });
});
