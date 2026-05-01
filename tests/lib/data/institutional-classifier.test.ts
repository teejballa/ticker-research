import { describe, it, expect } from 'vitest';
import { classifyInstitutional } from '@/lib/data/institutional-classifier';
import type { InstitutionalSnapshot } from '@/lib/types';

function snap(overrides: Partial<InstitutionalSnapshot> = {}): InstitutionalSnapshot {
  return {
    institutional_bucket: null,
    total_institutional_share: 1_000_000,
    total_institutional_share_prev: 1_000_000,
    net_share_change: 0,
    net_share_change_pct: 0,
    fund_count_current: 10,
    fund_count_prev: 10,
    fund_count_delta: 0,
    top10_concentration_pct: 0.30,
    top10_concentration_pct_prev: 0.30,
    ticker_30d_return_pct: null,
    spy_30d_return_pct: null,
    report_date: '2026-03-31',
    filing_date: '2026-04-15',
    data_age_days: 15,
    computed_at: new Date().toISOString(),
    data_source: 'finnhub',
    ...overrides,
  };
}

describe('classifyInstitutional', () => {
  it('returns null when both fund counts are zero', () => {
    expect(classifyInstitutional(snap({ fund_count_current: 0, fund_count_prev: 0 }))).toBeNull();
  });

  it('new_initiation when prev=0 and current>0', () => {
    expect(classifyInstitutional(snap({ fund_count_prev: 0, fund_count_current: 5 }))).toBe('new_initiation');
  });

  it('complete_exit when current=0 and prev>0', () => {
    expect(classifyInstitutional(snap({ fund_count_current: 0, fund_count_prev: 5 }))).toBe('complete_exit');
  });

  it('smart_money_concentration when top10 > 0.40 and delta >= 0.05', () => {
    expect(classifyInstitutional(snap({
      top10_concentration_pct: 0.45,
      top10_concentration_pct_prev: 0.38,
    }))).toBe('smart_money_concentration');
  });

  it('smart_money_dispersion when top10 < 0.20 and prev - current >= 0.05', () => {
    expect(classifyInstitutional(snap({
      top10_concentration_pct: 0.18,
      top10_concentration_pct_prev: 0.30,
    }))).toBe('smart_money_dispersion');
  });

  it('contrarian_inflow when net_share_change_pct > 0.05 and tickerVsSpy < -2', () => {
    expect(classifyInstitutional(snap({
      net_share_change_pct: 0.06,
      ticker_30d_return_pct: -5,
      spy_30d_return_pct: 1,
    }))).toBe('contrarian_inflow');
  });

  it('contrarian_outflow when net_share_change_pct < -0.05 and tickerVsSpy > 2', () => {
    expect(classifyInstitutional(snap({
      net_share_change_pct: -0.06,
      ticker_30d_return_pct: 8,
      spy_30d_return_pct: 2,
    }))).toBe('contrarian_outflow');
  });

  it('net_accumulation when net_share_change_pct > 0.02 and no return data', () => {
    expect(classifyInstitutional(snap({
      net_share_change_pct: 0.04,
      ticker_30d_return_pct: null,
      spy_30d_return_pct: null,
    }))).toBe('net_accumulation');
  });

  it('net_distribution when net_share_change_pct < -0.02', () => {
    expect(classifyInstitutional(snap({
      net_share_change_pct: -0.03,
    }))).toBe('net_distribution');
  });

  it('returns null within ±0.02 deadband with no concentration shift or contrarian signal', () => {
    expect(classifyInstitutional(snap({
      net_share_change_pct: 0.01,
      top10_concentration_pct: 0.30,
      top10_concentration_pct_prev: 0.30,
      ticker_30d_return_pct: null,
      spy_30d_return_pct: null,
    }))).toBeNull();
  });
});
