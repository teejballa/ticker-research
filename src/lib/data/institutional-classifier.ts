// src/lib/data/institutional-classifier.ts
// Phase 17 — Pure deterministic classifier mapping InstitutionalSnapshot
// inputs to one of 8 InstitutionalBuckets. No LLM, no I/O, no async.
// Thresholds locked by 17-RESEARCH §3.3.

import type { InstitutionalBucket, InstitutionalSnapshot } from '@/lib/types';

export function classifyInstitutional(s: InstitutionalSnapshot): InstitutionalBucket | null {
  if (s.fund_count_current === 0 && s.fund_count_prev === 0) return null;

  // Edge cases first
  if (s.fund_count_prev === 0 && s.fund_count_current > 0) return 'new_initiation';
  if (s.fund_count_current === 0 && s.fund_count_prev > 0) return 'complete_exit';

  // Concentration shifts
  if (s.top10_concentration_pct > 0.40 && s.top10_concentration_pct - s.top10_concentration_pct_prev > 0.05) {
    return 'smart_money_concentration';
  }
  if (s.top10_concentration_pct < 0.20 && s.top10_concentration_pct_prev - s.top10_concentration_pct > 0.05) {
    return 'smart_money_dispersion';
  }

  // Net flow vs price direction (contrarian)
  if (s.ticker_30d_return_pct != null && s.spy_30d_return_pct != null) {
    const tickerVsSpy = s.ticker_30d_return_pct - s.spy_30d_return_pct;
    if (s.net_share_change_pct > 0.05 && tickerVsSpy < -2) return 'contrarian_inflow';
    if (s.net_share_change_pct < -0.05 && tickerVsSpy > 2) return 'contrarian_outflow';
  }

  // Default flow direction
  if (s.net_share_change_pct > 0.02) return 'net_accumulation';
  if (s.net_share_change_pct < -0.02) return 'net_distribution';

  return null;
}
