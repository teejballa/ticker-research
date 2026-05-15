// Phase: 30 — Provider Health Hardening
// Phase 30 D-12, D-13 — GREEN integration coverage for sentiment-scan cron.
//
// The "crons never 500" invariant is load-bearing: a single ticker's failure or
// a single open breaker must not surface as a non-200 response from the cron.
//
// D-12: skip + log + continue. When all providers fail for one ticker, increment
//       a counter and move on (errors / skipped_breaker_open / skipped_no_data).
// D-13: cron summary log + body MUST include per-batch counts:
//         { scanned, skipped_no_data, skipped_breaker_open, errors }
//       (the old `failed` key is renamed `skipped_no_data` and is no longer
//       present on the response body — downstream readers must be migrated.)

import { describe, it, beforeEach, expect, vi } from 'vitest';
import { __resetMockRedis } from '@/lib/data/cache/__mocks__/upstash';
import { BreakerOpenError } from '@/lib/data/circuit-breaker';

vi.mock('@/lib/data/cache/upstash', async () =>
  import('@/lib/data/cache/__mocks__/upstash'),
);

// Force the watchlist to a single throwaway ticker.
vi.mock('@/lib/data/ticker-watchlist', () => ({
  getCurrentWatchlist: () => ['TESTP30D12'],
}));

// Stub the four sensor fetches and the price quote so the test can drive
// each branch (BreakerOpenError, null prices, generic throws).
vi.mock('yahoo-finance2', () => ({
  default: class {
    quote() {
      return Promise.resolve({ regularMarketPrice: 150 });
    }
  },
}));

vi.mock('@/lib/data/lightweight-community-scan', () => ({
  lightweightCommunityScan: vi.fn(),
}));
vi.mock('@/lib/data/technical', () => ({
  computeTechnicalSnapshot: vi.fn(),
}));
vi.mock('@/lib/data/insider', () => ({
  fetchInsiderData: vi.fn(),
}));
vi.mock('@/lib/data/institutional', () => ({
  fetchInstitutionalData: vi.fn(),
}));

// Stub the SentimentSnapshot DB write so we don't need a real DB for these
// assertions (the cron's response shape is what we care about here).
vi.mock('@/lib/db', () => ({
  prisma: {
    sentimentSnapshot: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: 'fake-snapshot' })),
    },
    botFilterFlag: { create: vi.fn(async () => ({ id: 'fake-bot-flag' })) },
    coordinationCluster: { create: vi.fn(async () => ({ id: 'fake-cluster' })) },
  },
}));

// Stub the observation store + downstream sentiment helpers so the route
// completes without DB writes.
vi.mock('@/lib/sentiment/observation-store', () => ({
  insertObservation: vi.fn(async () => undefined),
  SentimentObservationDuplicateError: class extends Error {},
}));
vi.mock('@/lib/sentiment/aggregator', () => ({
  computeCrowdedConsensus: vi.fn(async () => ({ mode: 'off', flag: undefined, features: undefined })),
}));
vi.mock('@/lib/sentiment/bot-filter', () => ({
  cresciBotScore: vi.fn(() => ({
    is_bot: false,
    reason: 'no_red_flags',
    features: { max_text_cosine_similarity: 0, pump_phrase_density: 0, hashtag_count_max: 0 },
  })),
}));
vi.mock('@/lib/sentiment/coordination', () => ({
  detectCoordinatedPosting: vi.fn(() => null),
  COORDINATION_SIMILARITY: 0.9,
}));
vi.mock('@/lib/sentiment/per-message-pass', () => ({
  runPerMessagePass: vi.fn(async () => ({
    primary_path_count: 0,
    secondary_path_count: 0,
    tertiary_path_count: 0,
    cost_capped_count: 0,
  })),
}));

const ORIG_SECRET = process.env.CRON_SECRET;
const TEST_SECRET = 'integration-test-secret';

beforeEach(() => {
  __resetMockRedis();
  process.env.CRON_SECRET = TEST_SECRET;
  vi.clearAllMocks();
});

async function callCron(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { NextRequest } = await import('next/server');
  const { GET } = await import('@/app/api/cron/sentiment-scan/route');
  const req = new NextRequest('http://localhost/api/cron/sentiment-scan', {
    headers: { authorization: `Bearer ${TEST_SECRET}` },
  });
  const res = await GET(req);
  const body = await res.json();
  return { status: res.status, body };
}

describe('Phase 30 / D-12: sentiment-scan cron resilience', () => {
  it('D-12: returns HTTP 200 even when every external provider throws', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
    const { fetchInsiderData } = await import('@/lib/data/insider');
    const { fetchInstitutionalData } = await import('@/lib/data/institutional');
    vi.mocked(lightweightCommunityScan).mockRejectedValueOnce(new Error('upstream blown'));
    vi.mocked(computeTechnicalSnapshot).mockRejectedValueOnce(new Error('upstream blown'));
    vi.mocked(fetchInsiderData).mockRejectedValueOnce(new Error('upstream blown'));
    vi.mocked(fetchInstitutionalData).mockRejectedValueOnce(new Error('upstream blown'));

    const { status, body } = await callCron();
    expect(status).toBe(200);
    // Promise.all rejects on the first throw, which is caught at the top-level
    // try/catch and classified as `errors` (a generic Error, not BreakerOpenError).
    expect(typeof body.errors).toBe('number');
    expect((body.errors as number) >= 1).toBe(true);
  });

  it('D-12: skips a ticker when withBreaker throws BreakerOpenError; continues without erroring', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    vi.mocked(lightweightCommunityScan).mockRejectedValueOnce(
      new BreakerOpenError('firecrawl', Date.now()),
    );

    const { status, body } = await callCron();
    expect(status).toBe(200);
    expect(body.skipped_breaker_open).toBe(1);
    expect(body.scanned).toBe(0);
    expect(body.errors).toBe(0); // BreakerOpenError must NOT inflate errors
  });
});

describe('Phase 30 / D-13: cron summary counters', () => {
  it('D-13: response body shape includes scanned, skipped_no_data, skipped_breaker_open, errors counters', async () => {
    const { status, body } = await callCron();
    expect(status).toBe(200);
    expect(typeof body.scanned).toBe('number');
    expect(typeof body.skipped_no_data).toBe('number');
    expect(typeof body.skipped_breaker_open).toBe('number');
    expect(typeof body.errors).toBe('number');
  });

  it('D-13: the old "failed" key is GONE from the response body (renamed to skipped_no_data)', async () => {
    const { body } = await callCron();
    expect((body as { failed?: unknown }).failed).toBeUndefined();
  });

  it('D-13: skipped_no_data increments when every sensor returns null (semantic equivalent of old `failed`)', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
    const { fetchInsiderData } = await import('@/lib/data/insider');
    const { fetchInstitutionalData } = await import('@/lib/data/institutional');
    vi.mocked(lightweightCommunityScan).mockResolvedValueOnce(null);
    vi.mocked(computeTechnicalSnapshot).mockResolvedValueOnce(null);
    vi.mocked(fetchInsiderData).mockResolvedValueOnce(null);
    vi.mocked(fetchInstitutionalData).mockResolvedValueOnce(null);

    const { body } = await callCron();
    expect(body.skipped_no_data).toBe(1);
    expect(body.scanned).toBe(0);
    expect(body.errors).toBe(0);
    expect(body.skipped_breaker_open).toBe(0);
  });

  it('D-13: skipped_breaker_open increments by exactly 1 per BreakerOpenError thrown', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    vi.mocked(lightweightCommunityScan).mockRejectedValueOnce(
      new BreakerOpenError('firecrawl', Date.now()),
    );

    const { body } = await callCron();
    expect(body.skipped_breaker_open).toBe(1);
  });

  it('D-13: errors increments for unclassified throws (not BreakerOpenError, not no-data)', async () => {
    const { lightweightCommunityScan } = await import('@/lib/data/lightweight-community-scan');
    vi.mocked(lightweightCommunityScan).mockRejectedValueOnce(new TypeError('boom — generic'));

    const { body } = await callCron();
    expect(body.errors).toBe(1);
    expect(body.skipped_breaker_open).toBe(0);
  });
});
