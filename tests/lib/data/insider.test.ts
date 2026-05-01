import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Import AFTER stubbing global fetch
import { fetchInsiderData } from '@/lib/data/insider';

function makeFinnhubResponse(data: unknown[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ data, symbol: 'AAPL' }),
  };
}

function makeSentimentResponse(data: unknown[] = []) {
  return {
    ok: true,
    json: () => Promise.resolve({ data }),
  };
}

describe('fetchInsiderData', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    process.env.FINNHUB_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.FINNHUB_API_KEY;
  });

  it('returns null when FINNHUB_API_KEY is unset', async () => {
    delete process.env.FINNHUB_API_KEY;
    const r = await fetchInsiderData('AAPL');
    expect(r).toBeNull();
  });

  it('parses Finnhub response into snapshot, classifies lone_sell', async () => {
    fetchMock
      .mockResolvedValueOnce(makeFinnhubResponse([
        {
          name: 'COOK TIMOTHY D',
          share: 511000,
          change: -25000,
          filingDate: '2026-04-22',
          transactionDate: '2026-04-20',
          transactionCode: 'S',
          transactionPrice: 175.42,
          isDerivative: false,
        },
      ]))
      .mockResolvedValueOnce(makeSentimentResponse([]));

    const r = await fetchInsiderData('AAPL');
    expect(r).not.toBeNull();
    expect(r!.distinct_sellers).toBe(1);
    expect(r!.net_sell_share_count).toBe(25000);
    expect(r!.sell_value_usd).toBeCloseTo(25000 * 175.42, 0);
    expect(r!.insider_bucket).toBe('lone_sell');
    expect(r!.data_source).toBe('finnhub');
  });

  it('returns null when Finnhub returns empty data array (EDGAR fallback returns null)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    const r = await fetchInsiderData('AAPL');
    expect(r).toBeNull();
  });

  it('returns null on Finnhub HTTP 429', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    const r = await fetchInsiderData('AAPL');
    expect(r).toBeNull();
  });

  it('returns null on Finnhub HTTP 500', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const r = await fetchInsiderData('AAPL');
    expect(r).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));
    const r = await fetchInsiderData('AAPL');
    expect(r).toBeNull();
  });

  it('classifies cluster_buying when 3 distinct buyers totaling 9000 shares', async () => {
    fetchMock
      .mockResolvedValueOnce(makeFinnhubResponse([
        { name: 'BUYER ONE', change: 3000, filingDate: '2026-04-20', transactionPrice: 100 },
        { name: 'BUYER TWO', change: 3000, filingDate: '2026-04-21', transactionPrice: 100 },
        { name: 'BUYER THREE', change: 3000, filingDate: '2026-04-22', transactionPrice: 100 },
      ]))
      .mockResolvedValueOnce(makeSentimentResponse([]));

    const r = await fetchInsiderData('AAPL');
    expect(r).not.toBeNull();
    expect(r!.distinct_buyers).toBe(3);
    expect(r!.net_buy_share_count).toBe(9000);
    expect(r!.insider_bucket).toBe('cluster_buying');
  });
});
