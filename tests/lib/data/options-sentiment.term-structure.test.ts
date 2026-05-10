// tests/lib/data/options-sentiment.term-structure.test.ts
//
// Plan 19-C-04 — Options term-structure 30/60/90d + IV regime gate.
//
// Tests pin (per the threat model and `<behavior>` block):
//   T-19-C-04-01: OI-weighted formula `Σ(p/c_i × oi_i) / Σ(oi_i)` over the 3 expiries
//   T-19-C-04-02: IV regime classifier boundaries (0.8 / 1.3 thresholds)
//
// Mock strategy mirrors the existing fetchOptionsSentiment unit test
// (src/lib/data/__tests__/options-sentiment.test.ts) — `default: { options, chart }`
// off `yahoo-finance2`. Vitest replaces the singleton default export per
// spec in `options-sentiment.ts`.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// IMPORTANT: mock BEFORE importing the SUT.
vi.mock('yahoo-finance2', () => ({
  default: {
    options: vi.fn(),
    chart: vi.fn(),
  },
}));

import yahooFinance from 'yahoo-finance2';
import { fetchOptionsTermStructure } from '@/lib/data/options-sentiment';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOptions = (yahooFinance as any).options as ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChart = (yahooFinance as any).chart as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal yahoo-finance2 OptionsResult for a single expiration.
 * Each call/put contract gets `openInterest` and a fixed `impliedVolatility`
 * so the implementation has both a put/call ratio and an IV signal to read.
 */
function buildChain({
  expirationDate,
  callOIs,
  putOIs,
  iv = 0.30,
}: {
  expirationDate: Date;
  callOIs: number[];
  putOIs: number[];
  iv?: number;
}) {
  return {
    options: [
      {
        expirationDate,
        calls: callOIs.map((openInterest) => ({ openInterest, impliedVolatility: iv })),
        puts: putOIs.map((openInterest) => ({ openInterest, impliedVolatility: iv })),
      },
    ],
  };
}

/**
 * Synthesize a chart() response of N daily closes. Realized vol is computed
 * from log returns of the close series (annualized × √252).
 */
function buildFlatChart(closes: number[]) {
  return {
    quotes: closes.map((close) => ({ close })),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('fetchOptionsTermStructure (Plan 19-C-04)', () => {
  // ── Test 1: returns 30/60/90d put/call ratios ────────────────────────────
  it('returns 30/60/90d put/call ratios from three separate options chains', async () => {
    // 30d: callOI=1000, putOI=400 → p/c = 0.40
    // 60d: callOI=1000, putOI=600 → p/c = 0.60
    // 90d: callOI=1000, putOI=800 → p/c = 0.80
    mockOptions.mockImplementation((_ticker: string, opts?: { date?: Date }) => {
      const expirationDate = opts?.date ?? new Date();
      const daysOut = Math.round((expirationDate.getTime() - Date.now()) / 86_400_000);
      if (daysOut <= 35 && daysOut >= 25) {
        return Promise.resolve(buildChain({ expirationDate, callOIs: [1000], putOIs: [400] }));
      }
      if (daysOut <= 65 && daysOut >= 55) {
        return Promise.resolve(buildChain({ expirationDate, callOIs: [1000], putOIs: [600] }));
      }
      if (daysOut <= 95 && daysOut >= 85) {
        return Promise.resolve(buildChain({ expirationDate, callOIs: [1000], putOIs: [800] }));
      }
      return Promise.reject(new Error('unexpected expiry request'));
    });
    mockChart.mockResolvedValue(buildFlatChart([100, 100, 100, 100, 100]));

    const result = await fetchOptionsTermStructure('AAPL');

    expect(result).not.toBeNull();
    expect(result!.put_call_30d).toBeCloseTo(0.4, 3);
    expect(result!.put_call_60d).toBeCloseTo(0.6, 3);
    expect(result!.put_call_90d).toBeCloseTo(0.8, 3);
  });

  // ── Test 2: OI-weighted formula pinned ────────────────────────────────────
  it('oi_weighted_avg = Σ(p/c_i × oi_i) / Σ(oi_i) over the 3 expiries', async () => {
    // 30d: callOI=1000, putOI=400 → p/c = 0.40, total OI = 1400
    // 60d: callOI=2000, putOI=1200 → p/c = 0.60, total OI = 3200
    // 90d: callOI=500,  putOI=400  → p/c = 0.80, total OI = 900
    //
    // oi_weighted = (0.40 × 1400 + 0.60 × 3200 + 0.80 × 900) / (1400 + 3200 + 900)
    //             = (560 + 1920 + 720) / 5500
    //             = 3200 / 5500 ≈ 0.5818181818
    mockOptions.mockImplementation((_ticker: string, opts?: { date?: Date }) => {
      const expirationDate = opts?.date ?? new Date();
      const daysOut = Math.round((expirationDate.getTime() - Date.now()) / 86_400_000);
      if (daysOut <= 35 && daysOut >= 25) {
        return Promise.resolve(buildChain({ expirationDate, callOIs: [1000], putOIs: [400] }));
      }
      if (daysOut <= 65 && daysOut >= 55) {
        return Promise.resolve(buildChain({ expirationDate, callOIs: [2000], putOIs: [1200] }));
      }
      if (daysOut <= 95 && daysOut >= 85) {
        return Promise.resolve(buildChain({ expirationDate, callOIs: [500], putOIs: [400] }));
      }
      return Promise.reject(new Error('unexpected expiry request'));
    });
    mockChart.mockResolvedValue(buildFlatChart([100, 100, 100, 100, 100]));

    const result = await fetchOptionsTermStructure('AAPL');

    expect(result).not.toBeNull();
    expect(result!.oi_weighted_avg).toBeCloseTo(3200 / 5500, 4);
  });

  // ── Test 3: IV regime classifier boundaries ──────────────────────────────
  describe('IV regime classifier (T-19-C-04-02)', () => {
    /**
     * The implementation classifies regime via implied/realized vol ratio:
     *   ≥ 1.3   → 'high'
     *   0.8–1.3 → 'normal'
     *   < 0.8   → 'low'
     *
     * To pin the boundaries we drive realized vol via chart closes and
     * implied vol via the contract IV field.
     *
     * Realized closes pattern: alternating 100, 101.260, 100, 101.260, ...
     * Daily log returns: ±ln(101.260/100) ≈ ±0.01253; stdev ≈ 0.01253
     * Annualized ≈ 0.01253 × √252 ≈ 0.199.
     */
    const realizedTargetClose = [
      100, 101.260, 100, 101.260, 100, 101.260,
      100, 101.260, 100, 101.260, 100, 101.260,
    ];

    function setupChainsForRegime(iv: number) {
      mockOptions.mockImplementation((_ticker: string, opts?: { date?: Date }) => {
        const expirationDate = opts?.date ?? new Date();
        return Promise.resolve(
          buildChain({ expirationDate, callOIs: [1000], putOIs: [500], iv }),
        );
      });
      mockChart.mockResolvedValue(buildFlatChart(realizedTargetClose));
    }

    it("returns regime='high' when implied/realized ratio >= 1.3", async () => {
      // implied = 0.30 / realized ≈ 0.199 → ratio ≈ 1.508 → 'high'
      setupChainsForRegime(0.30);

      const result = await fetchOptionsTermStructure('AAPL');
      expect(result).not.toBeNull();
      expect(result!.iv_regime).toBe('high');
      expect(result!.iv_realized_ratio).toBeGreaterThanOrEqual(1.3);
    });

    it("returns regime='normal' when ratio is in [0.8, 1.3)", async () => {
      // implied = 0.199 / realized ≈ 0.199 → ratio ≈ 1.0 → 'normal'
      setupChainsForRegime(0.199);

      const result = await fetchOptionsTermStructure('AAPL');
      expect(result).not.toBeNull();
      expect(result!.iv_regime).toBe('normal');
      expect(result!.iv_realized_ratio).toBeGreaterThanOrEqual(0.8);
      expect(result!.iv_realized_ratio).toBeLessThan(1.3);
    });

    it("returns regime='low' when ratio < 0.8", async () => {
      // implied = 0.10 / realized ≈ 0.199 → ratio ≈ 0.50 → 'low'
      setupChainsForRegime(0.10);

      const result = await fetchOptionsTermStructure('AAPL');
      expect(result).not.toBeNull();
      expect(result!.iv_regime).toBe('low');
      expect(result!.iv_realized_ratio).toBeLessThan(0.8);
    });
  });

  // ── Test 4: null sentinel on yahoo-finance2 error ────────────────────────
  it('returns null when yahoo-finance2 throws on every expiry', async () => {
    mockOptions.mockRejectedValue(new Error('yahoo down'));
    mockChart.mockRejectedValue(new Error('yahoo down'));

    const result = await fetchOptionsTermStructure('INVALID');

    expect(result).toBeNull();
  });

  // ── Test 5: null when ticker has no options chain ─────────────────────────
  it('returns null when ticker has no options chain (all expiries return empty options[])', async () => {
    mockOptions.mockResolvedValue({ options: [] });
    mockChart.mockResolvedValue(buildFlatChart([100, 100, 100, 100, 100]));

    const result = await fetchOptionsTermStructure('NOOPTIONS');

    expect(result).toBeNull();
  });

  // ── Test 6: Promise.allSettled — partial failure resilience ──────────────
  it('uses Promise.allSettled — one expiry failing does not block the other two', async () => {
    let callCount = 0;
    mockOptions.mockImplementation((_ticker: string, opts?: { date?: Date }) => {
      callCount++;
      const expirationDate = opts?.date ?? new Date();
      const daysOut = Math.round((expirationDate.getTime() - Date.now()) / 86_400_000);
      // Make 60d expiry fail; 30d and 90d succeed.
      if (daysOut <= 65 && daysOut >= 55) {
        return Promise.reject(new Error('60d chain unavailable'));
      }
      if (daysOut <= 35 && daysOut >= 25) {
        return Promise.resolve(buildChain({ expirationDate, callOIs: [1000], putOIs: [500] }));
      }
      if (daysOut <= 95 && daysOut >= 85) {
        return Promise.resolve(buildChain({ expirationDate, callOIs: [1000], putOIs: [700] }));
      }
      return Promise.reject(new Error('unexpected expiry'));
    });
    mockChart.mockResolvedValue(buildFlatChart([100, 100, 100, 100, 100]));

    const result = await fetchOptionsTermStructure('AAPL');

    // All three expiries should have been attempted (allSettled, not race/all)
    expect(callCount).toBe(3);
    // 30d and 90d filled in; 60d is null/missing
    expect(result).not.toBeNull();
    expect(result!.put_call_30d).toBeCloseTo(0.5, 3);
    expect(result!.put_call_90d).toBeCloseTo(0.7, 3);
    // 60d should be null since it failed
    expect(result!.put_call_60d).toBeNull();
  });
});
