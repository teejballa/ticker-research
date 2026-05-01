// src/lib/data/insider-classifier.ts
// Phase 17 — Pure deterministic classifier mapping InsiderSnapshot inputs
// to one of 8 InsiderBuckets. No LLM, no I/O, no async. Thresholds locked
// by 17-RESEARCH §3.3; tune via histogram inspection in plan 17-05 closeout.

import type { InsiderBucket, InsiderSnapshot } from '@/lib/types';

export function classifyInsider(s: InsiderSnapshot): InsiderBucket | null {
  if (s.filings_count === 0) return null;

  // Sells take priority over buys when both occur in window — selling is louder.
  if (s.is_planned_10b5_1) return 'planned_sell_10b5_1';
  if (s.distinct_sellers >= 3 && s.net_sell_share_count > 0) return 'cluster_selling';
  if (s.distinct_sellers === 1 && s.net_sell_share_count > 0 && s.distinct_buyers === 0) return 'lone_sell';

  // Buys
  if (s.distinct_buyers >= 3 && s.net_buy_share_count > 0) return 'cluster_buying';
  if (s.has_ceo_buy) return 'ceo_buy';
  if (s.has_cfo_buy) return 'cfo_buy';
  if (s.has_director_buy) return 'director_buy';
  if (s.distinct_buyers === 1 && s.net_buy_share_count > 0) return 'lone_buy';

  return null;
}
