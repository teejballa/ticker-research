// Phase: 30 — Provider Health Hardening
// Phase 30 D-23
//
// RED-state scaffold for circuit-breaker integration in
// `src/lib/data/lightweight-community-scan.ts`. If Firecrawl dies mid-phase-30
// (the prior 100% error-rate incident that motivated this phase), the cron
// pipeline MUST continue scanning even with no community data.
//
// Composition order: withTelemetry → withBreaker → withRetry → fn.
//   - The breaker check happens INSIDE telemetry so BREAKER_OPEN rows still
//     land in ProviderCallLog (dashboard visibility).
//   - The breaker check happens OUTSIDE withRetry so a tripped breaker does
//     not consume retry budget.
//
// `scrapeOne` already has try/catch returning ''; the breaker integration adds
// a specific catch arm for BreakerOpenError so the breaker short-circuit is
// classified separately from genuine Firecrawl errors.
//
// Plan 30-03 lands the wiring; until then every entry is a pending todo.

import { describe, it, beforeEach, vi } from 'vitest';
import { __resetMockRedis } from '@/lib/data/cache/__mocks__/upstash';

vi.mock('@/lib/data/cache/upstash', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

beforeEach(() => {
  __resetMockRedis();
});

describe('Phase 30 / D-23: lightweight-community-scan breaker integration', () => {
  it.todo('D-23: community-scan call wrapped via withTelemetry → withBreaker → withRetry composition');
  it.todo('D-23: when firecrawl breaker is open, scrapeOne returns empty markdown and scan continues');
  it.todo('D-23: BreakerOpenError caught by scrapeOne and converted to empty-string return (no 500 propagation)');
  it.todo('D-23: BREAKER_OPEN error_class row lands in ProviderCallLog for dashboard visibility');
  it.todo('D-23: subsequent tickers in the same cron sweep still scrape successfully once firecrawl recovers');
});
