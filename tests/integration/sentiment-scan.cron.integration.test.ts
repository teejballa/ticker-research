// Phase: 30 — Provider Health Hardening
// Phase 30 D-12, D-13
//
// RED-state scaffold for sentiment-scan cron resilience under provider outages.
// The "crons never 500" invariant is load-bearing: a single ticker's failure or
// a single open breaker must not surface as a non-200 response from the cron.
//
// D-12: skip + log + continue. When all providers fail for one ticker in a batch,
// increment a counter and move on. The rotating watchlist retries on the next sweep.
//
// D-13: cron summary log MUST include per-batch counts:
//   { scanned, skipped_no_data, skipped_breaker_open, errors }
// (renaming the existing `failed` counter to `skipped_no_data` for clarity).
// These counters feed the Phase-30 done-gate alerting (D-17).
//
// Plan 30-04 implements the rename + new counters + try/catch differentiation;
// until then every entry is a pending todo. Tests will run under
// `npm run test:integration` once Plan 30-02 ships withBreaker (so the test can
// drive the BreakerOpenError branch).

import { describe, it, beforeEach, vi } from 'vitest';
import { __resetMockRedis } from '@/lib/data/cache/__mocks__/upstash';

vi.mock('@/lib/data/cache/upstash', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

beforeEach(() => {
  __resetMockRedis();
});

describe('Phase 30 / D-12: sentiment-scan cron resilience', () => {
  it.todo('D-12: returns HTTP 200 even when every external provider throws');
  it.todo('D-12: skips a ticker when withBreaker throws BreakerOpenError; continues to next ticker');
  it.todo('D-12: a single ticker failure does NOT abort the remaining watchlist sweep');
  it.todo('D-12: matches the existing "6 scanned / 13 skipped" pattern (counter shape preserved)');
});

describe('Phase 30 / D-13: cron summary counters', () => {
  it.todo('D-13: response body shape includes scanned, skipped_no_data, skipped_breaker_open, errors counters');
  it.todo('D-13: skipped_breaker_open counter increments by exactly 1 per BreakerOpenError thrown');
  it.todo('D-13: original "failed" counter is renamed skipped_no_data with same semantics');
  it.todo('D-13: errors counter increments only for unclassified throws — not BreakerOpenError, not no-data');
  it.todo('D-13: scanned + skipped_no_data + skipped_breaker_open + errors === total tickers in watchlist');
});
