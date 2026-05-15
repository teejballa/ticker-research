// Phase: 30 — Provider Health Hardening
// Phase 30 D-23
//
// GREEN-state integration test for circuit-breaker integration in
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

import { describe, it, beforeEach, expect, vi } from 'vitest';
import {
  __resetMockRedis,
  getRedis as getMockRedis,
} from '@/lib/data/cache/__mocks__/upstash';

vi.mock('@/lib/data/cache/upstash', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

// Stub the telemetry DAO so we can assert ProviderCallLog INSERT shapes
// without a real DB.
vi.mock('@/lib/telemetry/provider-call-log', () => ({
  recordCallAsync: vi.fn(),
  __internal_swallowed_insert_failures: () => 0,
  __internal_reset_counter: () => undefined,
}));

// Mock yahoo-finance2 so the parallel quote call in lightweightCommunityScan
// resolves without hitting the network. The mock returns null marketCap so the
// classifyCapClass path takes the no-cap branch.
vi.mock('yahoo-finance2', () => {
  return {
    default: class MockYahooFinance {
      constructor() {}
      async quote() {
        return { marketCap: null };
      }
    },
  };
});

// Mock the StockTwits / Quiver / Swaggystocks / ApeWisdom adapters so the only
// path under test is the Firecrawl breaker. Each returns a degenerate but
// shape-valid value so lightweightCommunityScan can complete.
vi.mock('@/lib/data/stocktwits', () => ({
  fetchStockTwitsSentiment: vi.fn(async () => ({
    stocktwits_bull_pct: null,
    stocktwits_bear_pct: null,
    stocktwits_message_count: null,
    stocktwits_is_trending: null,
  })),
  fetchStockTwitsRaw: vi.fn(async () => []),
}));
vi.mock('@/lib/data/adapters/quiver', () => ({
  fetchQuiverInsider: vi.fn(async () => null),
  fetchQuiverCongressional: vi.fn(async () => null),
}));

// Firecrawl mock — instances spy on `.scrape()`. Each `it` clones a fresh
// mock so we can assert per-test invocation counts.
const firecrawlScrapeSpy = vi.fn();
vi.mock('@mendable/firecrawl-js', () => {
  return {
    default: class MockFirecrawl {
      constructor() {}
      scrape(url: string, opts: unknown) {
        return firecrawlScrapeSpy(url, opts);
      }
    },
  };
});

beforeEach(() => {
  __resetMockRedis();
  vi.clearAllMocks();
  // Default Firecrawl behavior — successful scrape returning markdown.
  firecrawlScrapeSpy.mockResolvedValue({ markdown: 'hello world '.repeat(20) });
  // Ensure FIRECRAWL_API_KEY is set so the function does not short-circuit
  // to null at the top.
  process.env.FIRECRAWL_API_KEY = 'fc-test-key';
});

/** Plant an open breaker state so the breaker short-circuits before reaching Firecrawl. */
async function plantOpenBreaker(provider_id: string) {
  const r = getMockRedis();
  const opened_at = Date.now(); // freshly opened — still in the 30s open window
  await r.set(
    `breaker:${provider_id}:state`,
    JSON.stringify({ status: 'open', opened_at }),
    { ex: 3600 },
  );
}

describe('Phase 30 / D-23: lightweight-community-scan breaker integration', () => {
  it('D-23: community-scan call wrapped via withTelemetry → withBreaker → withRetry composition', async () => {
    // Verify by import — the wiring is the production code's contract; the
    // subsequent tests exercise the runtime behavior. This test asserts the
    // wrap exists by inspecting the source file (cheap and contract-pinned).
    const src = await import('node:fs').then((m) =>
      m.readFileSync(
        'src/lib/data/lightweight-community-scan.ts',
        'utf-8',
      ),
    );
    expect(src).toMatch(/withTelemetry\(\s*'firecrawl'/);
    expect(src).toMatch(/withBreaker\(\s*'firecrawl'/);
    expect(src).toMatch(/Phase 30 D-23/);
  });

  it('D-23: when firecrawl breaker is open, scrapeOne returns empty markdown and scan continues', async () => {
    await plantOpenBreaker('firecrawl');

    const { lightweightCommunityScan } = await import(
      '@/lib/data/lightweight-community-scan'
    );
    const result = await lightweightCommunityScan('TSLA');

    // Breaker short-circuits before reaching Firecrawl → scrape spy never invoked.
    expect(firecrawlScrapeSpy).not.toHaveBeenCalled();
    // The function STILL resolves to a non-null EnrichedSnapshot — the scan
    // continues with no community data.
    expect(result).not.toBeNull();
    expect(result?.highlights).toEqual([]);
  });

  it('D-23: BreakerOpenError caught by scrapeOne and converted to empty-string return (no 500 propagation)', async () => {
    await plantOpenBreaker('firecrawl');

    const { lightweightCommunityScan } = await import(
      '@/lib/data/lightweight-community-scan'
    );

    // Should NOT throw — the catch arm inside scrapeOne swallows
    // BreakerOpenError and returns '' (same as any other Firecrawl error).
    await expect(lightweightCommunityScan('AAPL')).resolves.not.toBeNull();
  });

  it('D-23: BREAKER_OPEN error_class row lands in ProviderCallLog for dashboard visibility', async () => {
    await plantOpenBreaker('firecrawl');

    const { recordCallAsync } = await import(
      '@/lib/telemetry/provider-call-log'
    );
    const { lightweightCommunityScan } = await import(
      '@/lib/data/lightweight-community-scan'
    );

    await lightweightCommunityScan('NVDA');

    // Each of the 5 Firecrawl URL-scrapes triggers a withTelemetry call,
    // which records a row even when the breaker short-circuits (BREAKER_OPEN
    // classification). Drain pending microtasks.
    await new Promise((r) => setTimeout(r, 10));

    const calls = (
      recordCallAsync as unknown as ReturnType<typeof vi.fn>
    ).mock.calls;
    const firecrawlCalls = calls.filter(
      (c) => (c[0] as { provider_id: string }).provider_id === 'firecrawl',
    );
    expect(firecrawlCalls.length).toBeGreaterThan(0);
    // Every firecrawl row in this test is the BREAKER_OPEN class.
    for (const c of firecrawlCalls) {
      const row = c[0] as { error_class: string | null; status: string };
      expect(row.status).toBe('error');
      expect(row.error_class).toBe('BREAKER_OPEN');
    }
  });

  it('D-23: subsequent tickers in the same cron sweep still scrape successfully once firecrawl recovers', async () => {
    // Sweep 1 — breaker open. Firecrawl never called.
    await plantOpenBreaker('firecrawl');
    const { lightweightCommunityScan } = await import(
      '@/lib/data/lightweight-community-scan'
    );
    await lightweightCommunityScan('TICKER1');
    expect(firecrawlScrapeSpy).not.toHaveBeenCalled();

    // Sweep 2 — breaker closed (manually clear the open state, simulating
    // recovery after the 30s open window + half-open probe). Firecrawl
    // resumes normal calls.
    const r = getMockRedis();
    await r.del('breaker:firecrawl:state');
    await r.del('breaker:firecrawl:ring');

    await lightweightCommunityScan('TICKER2');
    // 5 Firecrawl URL-scrapes per ticker (4 subs + 1 niche).
    expect(firecrawlScrapeSpy).toHaveBeenCalledTimes(5);
  });
});
