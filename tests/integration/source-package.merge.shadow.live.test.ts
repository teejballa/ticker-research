// tests/integration/source-package.merge.shadow.live.test.ts
//
// Phase 19 / Plan 19-B-06 (Task 3) — live-DB shadow lifecycle test for the
// `source-package-merge` path.
//
// EXCLUDED from `npx vitest run` (default unit suite) by vitest.config.ts
// `exclude: ['tests/integration/**']`. Run via:
//
//   npm run test:integration -- source-package.merge.shadow.live
//
// What this test asserts (D-29 + D-05/D-14 + 19-Z-04 gate):
//   1. mode='off'    — only old ladder runs; no ShadowComparison row written
//   2. mode='shadow' — both ladders run; ShadowComparison row created with
//                      path_name='source-package-merge', latencies recorded
//   3. shadow rows carry per-leg payload usable by shadow-verdict CLI for
//      per-field fill-rate + Jaccard scoring (D-29 PASS criterion)
//   4. mode='on'     — only new ladder runs; no ShadowComparison row written
//   5. New-ladder errors do NOT propagate to user (caught in setImmediate per
//      runWithShadow contract — T-19-Z-03-02)
//
// Mock strategy: every Wave-B adapter that hits the network is mocked at the
// module boundary so this test runs hermetically against a single live Neon
// connection. The shadow harness (`runWithShadow`) is exercised end-to-end —
// only upstream HTTP is mocked.

import { describe, it, expect, vi, afterAll, afterEach, beforeAll } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const HAS_DB = !!process.env.DATABASE_URL && /^postgres/i.test(process.env.DATABASE_URL ?? '');
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

const TEST_PATH = 'source-package-merge';
const TEST_TICKER_PREFIX = 'B06TST';

// Mock every fetcher at the module boundary so neither ladder hits the
// network. Old-ladder primaries return synthetic data; new-ladder primaries
// (tiingo / twelvedata / exa) return null so the new ladder falls through
// to its yahoo/finnhub/polygon backstops — this keeps the "outputs disagree
// only on FieldOrigin attribution, not on values" property that the verdict
// CLI relies on for Jaccard ≥95%.
vi.mock('@/lib/data/yahoo', () => ({
  fetchMarketData: vi.fn(async () => ({
    collected_at: new Date().toISOString(),
    price: 187.42,
    volume: 50_000_000,
    market_cap: 2_900_000_000_000,
    fifty_two_week_high: 199.62,
    fifty_two_week_low: 164.08,
    percent_change_today: 0.42,
    exchange: 'NASDAQ',
  })),
  fetchFundamentals: vi.fn(async () => ({
    collected_at: new Date().toISOString(),
    pe_ratio: 31.2,
    eps: 6.01,
    revenue: 383_000_000_000,
    debt_to_equity: 1.78,
    profit_margin: 0.249,
  })),
  searchTickers: vi.fn(async () => []),
  fetchChartData: vi.fn(async () => []),
}));

vi.mock('@/lib/data/finnhub', () => ({
  fetchFinnhub: vi.fn(async () => ({
    name: 'Finnhub',
    fetched_at: new Date().toISOString(),
    text_block: '',
    available: false,
  })),
}));

vi.mock('@/lib/data/polygon', () => ({
  fetchPolygon: vi.fn(async () => ({
    name: 'Polygon',
    fetched_at: new Date().toISOString(),
    text_block: '',
    available: false,
  })),
}));

vi.mock('@/lib/data/anthropic-search', () => ({
  fetchNews: vi.fn(async () => ({ collected_at: new Date().toISOString(), items: [] })),
  fetchAnalystSentiment: vi.fn(async () => ({
    collected_at: new Date().toISOString(),
    consensus: null,
    avg_price_target: null,
    analyst_count: null,
    recent_changes: [],
  })),
  fetchSecFilingSummary: vi.fn(async () => ({
    collected_at: new Date().toISOString(),
    most_recent_10k: null,
    most_recent_10q: null,
    filing_dates: { '10k': null, '10q': null },
  })),
  fetchSocialSentiment: vi.fn(async () => ({
    collected_at: new Date().toISOString(),
    overall_tone: null,
    signals: [],
    sources_checked: [],
  })),
}));

vi.mock('@/lib/data/stocktwits', () => ({
  fetchStockTwitsSentiment: vi.fn(async () => null),
}));

vi.mock('@/lib/data/options-sentiment', () => ({
  fetchOptionsSentiment: vi.fn(async () => null),
  fetchOptionsSentimentTermStructure: vi.fn(async () => null),
}));

vi.mock('@/lib/data/adapters/tiingo', () => ({
  fetchTiingoQuote: vi.fn(async () => null),
  fetchTiingoFundamentals: vi.fn(async () => null),
}));

vi.mock('@/lib/data/adapters/twelve-data', () => ({
  fetchTwelveDataFundamentals: vi.fn(async () => null),
}));

vi.mock('@/lib/data/adapters/exa-search', () => ({
  fetchExaNews: vi.fn(async () => null),
  fetchExaAnalystSentiment: vi.fn(async () => null),
}));

beforeAll(() => {
  // shadow-runner uses runtime feature flags only via its mode argument here,
  // so we don't need to set FEATURE_* vars — we drive the harness directly.
});

afterAll(async () => {
  if (HAS_DB) await prisma.$disconnect();
});

afterEach(async () => {
  if (!HAS_DB) return;
  await prisma.shadowComparison.deleteMany({
    where: {
      path_name: TEST_PATH,
      ticker: { startsWith: TEST_TICKER_PREFIX },
    },
  });
});

describe.skipIf(!HAS_DB)('19-B-06 source-package shadow lifecycle (live)', () => {
  it('mode=off: only old ladder runs; no ShadowComparison row created', async () => {
    const { runWithShadow } = await import('@/lib/shadow/shadow-runner');
    const ticker = `${TEST_TICKER_PREFIX}-OFF`;

    let oldCalled = 0;
    let newCalled = 0;
    const result = await runWithShadow(
      TEST_PATH,
      async () => {
        oldCalled++;
        return { ladder: 'old', price: 187.42 };
      },
      async () => {
        newCalled++;
        return { ladder: 'new', price: 187.42 };
      },
      'off',
      { ticker },
    );

    expect(oldCalled).toBe(1);
    expect(newCalled).toBe(0);
    expect(result.ladder).toBe('old');

    // Wait briefly to confirm setImmediate doesn't fire.
    await new Promise(r => setTimeout(r, 200));

    const row = await prisma.shadowComparison.findFirst({
      where: { path_name: TEST_PATH, ticker },
    });
    expect(row).toBeNull();
  });

  it('mode=shadow: both ladders run; ShadowComparison row recorded with latencies', async () => {
    const { runWithShadow } = await import('@/lib/shadow/shadow-runner');
    const ticker = `${TEST_TICKER_PREFIX}-SHADOW`;

    let oldCalled = 0;
    let newCalled = 0;
    const result = await runWithShadow(
      TEST_PATH,
      async () => {
        oldCalled++;
        return { ladder: 'old', price: 187.42, fill_rate: 0.86 };
      },
      async () => {
        newCalled++;
        return { ladder: 'new', price: 187.42, fill_rate: 0.93 };
      },
      'shadow',
      { ticker },
    );

    // Old-path output is what the user sees (D-14 invariant).
    expect(result.ladder).toBe('old');
    expect(oldCalled).toBe(1);

    // New-path runs in setImmediate — poll for ShadowComparison row.
    let row: {
      path_name: string;
      old_output_json: unknown;
      new_output_json: unknown;
      old_latency_ms: number | null;
      new_latency_ms: number | null;
    } | null = null;
    for (let i = 0; i < 30 && !row; i++) {
      await new Promise(r => setTimeout(r, 100));
      row = await prisma.shadowComparison.findFirst({
        where: { path_name: TEST_PATH, ticker },
        orderBy: { created_at: 'desc' },
      });
    }

    expect(row).not.toBeNull();
    expect(newCalled).toBe(1);
    expect(row!.path_name).toBe(TEST_PATH);
    const oldOut = row!.old_output_json as { ladder: string; fill_rate: number };
    const newOut = row!.new_output_json as { ladder: string; fill_rate: number };
    expect(oldOut.ladder).toBe('old');
    expect(newOut.ladder).toBe('new');
    expect(typeof row!.old_latency_ms).toBe('number');
    expect(typeof row!.new_latency_ms).toBe('number');
  });

  it('mode=shadow: per-leg payload preserved for verdict per-field fill-rate scoring', async () => {
    const { runWithShadow } = await import('@/lib/shadow/shadow-runner');
    const ticker = `${TEST_TICKER_PREFIX}-FILL`;

    await runWithShadow(
      TEST_PATH,
      async () => ({
        market_data: { price: 187.42, market_cap: 2.9e12, _field_sources: { price: 'yahoo' } },
        fundamentals: { pe_ratio: 31.2, _field_sources: { pe_ratio: 'yahoo' } },
      }),
      async () => ({
        market_data: { price: 187.42, market_cap: 2.9e12, _field_sources: { price: 'tiingo' } },
        fundamentals: { pe_ratio: 31.2, _field_sources: { pe_ratio: 'tiingo' } },
      }),
      'shadow',
      { ticker },
    );

    let row: { new_output_json: unknown } | null = null;
    for (let i = 0; i < 30 && !row; i++) {
      await new Promise(r => setTimeout(r, 100));
      row = await prisma.shadowComparison.findFirst({
        where: { path_name: TEST_PATH, ticker },
        orderBy: { created_at: 'desc' },
      });
    }
    expect(row).not.toBeNull();
    const newOut = row!.new_output_json as {
      market_data: { _field_sources: { price: string } };
      fundamentals: { _field_sources: { pe_ratio: string } };
    };
    // Per-field provenance is preserved in JSONB so shadow-verdict CLI can
    // compute per-field fill-rate delta and per-origin attribution shifts.
    expect(newOut.market_data._field_sources.price).toBe('tiingo');
    expect(newOut.fundamentals._field_sources.pe_ratio).toBe('tiingo');
  });

  it('mode=on: only new ladder runs; no ShadowComparison row created (cutover state)', async () => {
    const { runWithShadow } = await import('@/lib/shadow/shadow-runner');
    const ticker = `${TEST_TICKER_PREFIX}-ON`;

    let oldCalled = 0;
    let newCalled = 0;
    const result = await runWithShadow(
      TEST_PATH,
      async () => {
        oldCalled++;
        return { ladder: 'old' };
      },
      async () => {
        newCalled++;
        return { ladder: 'new' };
      },
      'on',
      { ticker },
    );

    expect(oldCalled).toBe(0);
    expect(newCalled).toBe(1);
    expect(result.ladder).toBe('new');

    await new Promise(r => setTimeout(r, 200));
    const row = await prisma.shadowComparison.findFirst({
      where: { path_name: TEST_PATH, ticker },
    });
    expect(row).toBeNull();
  });

  it('new-ladder errors NEVER propagate to user — caught in setImmediate (T-19-Z-03-02)', async () => {
    const { runWithShadow } = await import('@/lib/shadow/shadow-runner');
    const ticker = `${TEST_TICKER_PREFIX}-ERR`;

    const result = await runWithShadow(
      TEST_PATH,
      async () => ({ ladder: 'old', price: 187.42 }),
      async () => {
        throw new Error('intentional new-ladder explosion');
      },
      'shadow',
      { ticker },
    );

    // User sees old-path result — exception is swallowed.
    expect(result.ladder).toBe('old');

    // ShadowComparison row IS persisted with error captured in new_output_json.
    let row: { new_output_json: unknown } | null = null;
    for (let i = 0; i < 30 && !row; i++) {
      await new Promise(r => setTimeout(r, 100));
      row = await prisma.shadowComparison.findFirst({
        where: { path_name: TEST_PATH, ticker },
        orderBy: { created_at: 'desc' },
      });
    }
    expect(row).not.toBeNull();
    const newOut = row!.new_output_json as { error?: string };
    expect(newOut.error).toContain('intentional new-ladder explosion');
  });
});
