import { describe, it, expect } from 'vitest';
import { classifyInsider } from '@/lib/data/insider-classifier';
import type { InsiderSnapshot } from '@/lib/types';

function snap(overrides: Partial<InsiderSnapshot> = {}): InsiderSnapshot {
  return {
    insider_bucket: null,
    distinct_buyers: 0,
    distinct_sellers: 0,
    net_buy_share_count: 0,
    net_sell_share_count: 0,
    buy_value_usd: null,
    sell_value_usd: null,
    has_ceo_buy: false,
    has_cfo_buy: false,
    has_director_buy: false,
    is_planned_10b5_1: false,
    filings_count: 1,
    earliest_filing_date: '2026-04-01',
    latest_filing_date: '2026-04-25',
    data_age_days: 5,
    computed_at: new Date().toISOString(),
    data_source: 'finnhub',
    insider_sentiment_mspr: null,
    ...overrides,
  };
}

describe('classifyInsider', () => {
  it('returns null on empty input (filings_count === 0)', () => {
    expect(classifyInsider(snap({ filings_count: 0 }))).toBeNull();
  });

  it('10b5-1 takes highest priority over cluster_selling', () => {
    expect(classifyInsider(snap({ is_planned_10b5_1: true, distinct_sellers: 5, net_sell_share_count: 1000 }))).toBe('planned_sell_10b5_1');
  });

  it('cluster_selling when 3+ sellers and sell count > 0', () => {
    expect(classifyInsider(snap({ distinct_sellers: 3, net_sell_share_count: 1000 }))).toBe('cluster_selling');
  });

  it('lone_sell when single seller, no buyers, sell count > 0', () => {
    expect(classifyInsider(snap({ distinct_sellers: 1, net_sell_share_count: 500, distinct_buyers: 0 }))).toBe('lone_sell');
  });

  it('cluster_buying when 3+ buyers and buy count > 0', () => {
    expect(classifyInsider(snap({ distinct_buyers: 3, net_buy_share_count: 5000 }))).toBe('cluster_buying');
  });

  it('ceo_buy precedes lone_buy', () => {
    expect(classifyInsider(snap({ has_ceo_buy: true, distinct_buyers: 1, net_buy_share_count: 100 }))).toBe('ceo_buy');
  });

  it('cfo_buy when no CEO buy present', () => {
    expect(classifyInsider(snap({ has_cfo_buy: true, has_ceo_buy: false, distinct_buyers: 1, net_buy_share_count: 100 }))).toBe('cfo_buy');
  });

  it('director_buy when no CEO or CFO buy', () => {
    expect(classifyInsider(snap({ has_director_buy: true, has_ceo_buy: false, has_cfo_buy: false, distinct_buyers: 1, net_buy_share_count: 100 }))).toBe('director_buy');
  });

  it('lone_buy when single buyer, no titled insider', () => {
    expect(classifyInsider(snap({ distinct_buyers: 1, net_buy_share_count: 100 }))).toBe('lone_buy');
  });

  it('returns null when filings exist but all counts are zero (flat activity)', () => {
    expect(classifyInsider(snap({ filings_count: 3 }))).toBeNull();
  });
});
