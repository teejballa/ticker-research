// src/lib/data/yahoo.test.ts
// Tests for yahoo-finance2 data collection functions.
// Uses real network calls — run sparingly (not in CI on every commit).
// Each test has a 15s timeout to allow for network latency.

import { describe, it, expect } from 'vitest';
import {
  searchTickers,
  fetchChartData,
  fetchMarketData,
  fetchFundamentals,
} from './yahoo';

describe('searchTickers', () => {
  it('returns AAPL when searching "Apple"', async () => {
    const results = await searchTickers('Apple');
    expect(results.some((r) => r.symbol === 'AAPL')).toBe(true);
  }, 15000);

  it('returns Apple result when searching "AAPL"', async () => {
    const results = await searchTickers('AAPL');
    const apple = results.find((r) => r.symbol === 'AAPL');
    expect(apple).toBeDefined();
    expect(apple?.longname ?? apple?.shortname).toMatch(/Apple/i);
  }, 15000);
});

describe('fetchChartData', () => {
  it('returns at least 20 data points for AAPL', async () => {
    const points = await fetchChartData('AAPL');
    expect(points.length).toBeGreaterThanOrEqual(20);
    expect(points[0]).toHaveProperty('time');
    expect(points[0]).toHaveProperty('value');
    expect(typeof points[0].value).toBe('number');
  }, 15000);
});

describe('fetchMarketData', () => {
  it('returns market data with all required fields for AAPL', async () => {
    const data = await fetchMarketData('AAPL');
    expect(data.collected_at).toBeDefined();
    expect(typeof data.price).toBe('number');
    expect(typeof data.volume).toBe('number');
    expect(data.market_cap).not.toBeUndefined();
    expect(data.fifty_two_week_high).not.toBeUndefined();
    expect(data.fifty_two_week_low).not.toBeUndefined();
  }, 15000);
});

describe('fetchFundamentals', () => {
  it('returns fundamentals with all required fields for AAPL', async () => {
    const data = await fetchFundamentals('AAPL');
    expect(data.collected_at).toBeDefined();
    expect(data.pe_ratio).not.toBeUndefined();
    expect(data.eps).not.toBeUndefined();
    expect(data.revenue).not.toBeUndefined();
    expect(data.debt_to_equity).not.toBeUndefined();
  }, 15000);
});
