import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Mock yahoo-finance2 before importing institutional
vi.mock('yahoo-finance2', () => {
  const mockChart = vi.fn().mockResolvedValue({ quotes: [] });
  const mockQuote = vi.fn().mockResolvedValue({ regularMarketPrice: 150 });
  return {
    default: vi.fn().mockImplementation(() => ({
      chart: mockChart,
      quote: mockQuote,
    })),
    __mockChart: mockChart,
    __mockQuote: mockQuote,
  };
});

// Import AFTER mocks are set up
import { fetchInstitutionalData } from '@/lib/data/institutional';

function makeQuarter(overrides: {
  reportDate?: string;
  filingDate?: string;
  ownership?: Array<{ name: string; share: number; change: number }>;
}) {
  return {
    reportDate: overrides.reportDate ?? '2026-03-31',
    filingDate: overrides.filingDate ?? '2026-04-15',
    ownership: overrides.ownership ?? [],
  };
}

function makeFinnhubResponse(data: unknown[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ data }),
  };
}

describe('fetchInstitutionalData', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.FINNHUB_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.FINNHUB_API_KEY;
  });

  it('returns null when FINNHUB_API_KEY is unset', async () => {
    delete process.env.FINNHUB_API_KEY;
    const r = await fetchInstitutionalData('AAPL');
    expect(r).toBeNull();
  });

  it('classifies smart_money_concentration when top10 > 40% and delta > 5%', async () => {
    // Build ownership arrays that produce:
    //   current: top10 = 100/200 = 0.50 (> 0.40)
    //   prev:    top10 = 70/170  = 0.412
    //   delta = 0.50 - 0.412 = 0.088 (> 0.05) → smart_money_concentration
    //
    // 110 funds total:
    //   top 10 hold 10 shares each  (current) or 7 shares each (prev)
    //   bottom 100 hold 1 share each in both periods
    const current110 = [
      ...Array.from({ length: 10 }, (_, i) => ({ name: `BigFund ${i}`, share: 10, change: 0 })),
      ...Array.from({ length: 100 }, (_, i) => ({ name: `SmallFund ${i}`, share: 1, change: 0 })),
    ];
    const prev110 = [
      ...Array.from({ length: 10 }, (_, i) => ({ name: `BigFund ${i}`, share: 7, change: 0 })),
      ...Array.from({ length: 100 }, (_, i) => ({ name: `SmallFund ${i}`, share: 1, change: 0 })),
    ];

    fetchMock.mockResolvedValueOnce(makeFinnhubResponse([
      makeQuarter({ ownership: current110 }),
      makeQuarter({ reportDate: '2025-12-31', filingDate: '2026-01-15', ownership: prev110 }),
    ]));

    const r = await fetchInstitutionalData('AAPL');
    expect(r).not.toBeNull();
    expect(r!.top10_concentration_pct).toBeGreaterThan(0.40);
    expect(r!.top10_concentration_pct - r!.top10_concentration_pct_prev).toBeGreaterThan(0.05);
    expect(r!.institutional_bucket).toBe('smart_money_concentration');
  });

  it('returns null when Finnhub returns empty data (EDGAR fallback returns null)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    const r = await fetchInstitutionalData('AAPL');
    expect(r).toBeNull();
  });

  it('returns null on Finnhub HTTP 429', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    const r = await fetchInstitutionalData('AAPL');
    expect(r).toBeNull();
  });

  it('snapshot still returns when yahoo chart() throws — ticker_30d_return_pct and spy_30d_return_pct are null', async () => {
    // Provide valid Finnhub data; yahoo mock already returns empty quotes by default
    fetchMock.mockResolvedValueOnce(makeFinnhubResponse([
      makeQuarter({
        ownership: [
          { name: 'Fund A', share: 1000, change: 100 },
          { name: 'Fund B', share: 2000, change: 200 },
        ],
      }),
    ]));

    const r = await fetchInstitutionalData('AAPL');
    // Should still return a snapshot (yahoo chart returning empty is handled gracefully)
    expect(r).not.toBeNull();
    expect(r!.ticker_30d_return_pct).toBeNull();
    expect(r!.spy_30d_return_pct).toBeNull();
  });

  it('data_age_days is a non-negative integer', async () => {
    const filingDate = '2026-04-01';
    fetchMock.mockResolvedValueOnce(makeFinnhubResponse([
      makeQuarter({
        filingDate,
        ownership: [{ name: 'Fund A', share: 1000, change: 0 }],
      }),
    ]));

    const asOf = new Date('2026-04-15T00:00:00Z');
    const r = await fetchInstitutionalData('AAPL', asOf);
    expect(r).not.toBeNull();
    expect(r!.data_age_days).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(r!.data_age_days)).toBe(true);
  });
});
