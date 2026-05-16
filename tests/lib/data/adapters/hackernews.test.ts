/**
 * Plan 30.1-03 — HackerNews adapter implementation tests.
 *
 * Wave 0 (Plan 30.1-01) pinned the endpoint + HNStory type. This file
 * unskips the skeleton describe and adds concrete RED tests that drive
 * the Algolia adapter implementation. Mirrors the apewisdom adapter's
 * mock style: `withTelemetry` + `withBreaker` + `withRetry` composition
 * with `cached()` cache layer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock cache layer — bypass Upstash, run the fetcher inline.
vi.mock('@/lib/data/cache/upstash', () => ({
  cached: vi.fn(async <T,>(_key: string, fetcher: () => Promise<T>) => fetcher()),
}));
// Mock telemetry / breaker — pass-through so we exercise withRetry directly.
vi.mock('@/lib/telemetry/withTelemetry', () => ({
  withTelemetry: vi.fn((_id: string, fn: () => Promise<unknown>) => fn()),
}));
vi.mock('@/lib/data/circuit-breaker', () => ({
  withBreaker: vi.fn((_id: string, fn: () => Promise<unknown>) => fn()),
}));

import {
  HN_SEARCH_ENDPOINT,
  fetchHackerNewsStories,
  type HNStory,
} from '@/lib/data/adapters/hackernews';

describe('hackernews adapter — Wave 0 frozen contracts (Plan 30.1-01)', () => {
  it('exports the Algolia search endpoint per D-07', () => {
    expect(HN_SEARCH_ENDPOINT).toBe('https://hn.algolia.com/api/v1/search');
  });

  it('exports the HNStory type shape', () => {
    const sample: HNStory = {
      objectID: 'x', title: 't', url: null, story_text: null,
      points: 0, num_comments: 0, author: 'a', created_at_i: 1715200000,
      permalink: 'https://news.ycombinator.com/item?id=x',
    };
    expect(sample.objectID).toBe('x');
  });
});

describe('hackernews adapter — implementation (Plan 30.1-03)', () => {
  beforeEach(() => {
    // Per Plan 30.1-02 reddit.test.ts pattern — stubGlobal replaces fetch
    // for the duration of the test; vi.unstubAllGlobals() restores after.
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetchHackerNewsStories returns empty array when fetch fails with 5xx after retries', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(new Response('upstream broken', { status: 503 }));
    const out = await fetchHackerNewsStories('AAPL');
    expect(out).toEqual([]);
    // withRetry default budget is 3; 5xx is retryable.
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('fetchHackerNewsStories returns empty array when fetch returns 429 (4xx fast-fail, no retry)', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(new Response('rate limit', { status: 429 }));
    const out = await fetchHackerNewsStories('AAPL');
    expect(out).toEqual([]);
    expect(f.mock.calls.length).toBe(1);
  });

  it('fetchHackerNewsStories maps Algolia hits to HNStory[]', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(
      new Response(
        JSON.stringify({
          hits: [
            {
              objectID: '123',
              title: 'AAPL beats earnings',
              url: 'https://example.com/aapl',
              story_text: null,
              points: 142,
              num_comments: 89,
              author: 'foo',
              created_at_i: 1715200000,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const out = await fetchHackerNewsStories('AAPL');
    expect(out).toHaveLength(1);
    expect(out[0].objectID).toBe('123');
    expect(out[0].title).toBe('AAPL beats earnings');
    expect(out[0].points).toBe(142);
    expect(out[0].num_comments).toBe(89);
    expect(out[0].permalink).toBe('https://news.ycombinator.com/item?id=123');
  });

  it('fetchHackerNewsStories filters hits missing objectID or created_at_i', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(
      new Response(
        JSON.stringify({
          hits: [
            // valid
            { objectID: 'a1', title: 'valid one', points: 10, num_comments: 5, author: 'u1', created_at_i: 1715200000 },
            // missing objectID
            { title: 'no id', points: 1, num_comments: 0, author: 'u2', created_at_i: 1715200001 },
            // missing created_at_i
            { objectID: 'a3', title: 'no timestamp', points: 1, num_comments: 0, author: 'u3' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const out = await fetchHackerNewsStories('AAPL');
    expect(out).toHaveLength(1);
    expect(out[0].objectID).toBe('a1');
  });

  it('fetchHackerNewsStories sends query=TICKER + tags=story + numericFilters in URL', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(new Response(JSON.stringify({ hits: [] }), { status: 200 }));
    await fetchHackerNewsStories('AAPL');
    expect(f).toHaveBeenCalledTimes(1);
    const calledUrl = String(f.mock.calls[0]![0]);
    expect(calledUrl).toContain('https://hn.algolia.com/api/v1/search');
    expect(calledUrl).toContain('query=AAPL');
    expect(calledUrl).toContain('tags=story');
    // numericFilters value may contain a literal '>' (the RESEARCH example) OR
    // be URL-encoded as %3E. Accept either form.
    expect(calledUrl).toMatch(/numericFilters=created_at_i(?:%3E|>)\d+/);
  });

  it('fetchHackerNewsStories uppercases the ticker before encoding', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(new Response(JSON.stringify({ hits: [] }), { status: 200 }));
    await fetchHackerNewsStories('aapl');
    const calledUrl = String(f.mock.calls[0]![0]);
    expect(calledUrl).toContain('query=AAPL');
  });

  it('fetchHackerNewsStories never throws — even on malformed JSON', async () => {
    const f = globalThis.fetch as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(
      new Response('not-json{', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    // adapter contract: NEVER throws — Phase 19-C-05 T-19-C-05-01 pattern.
    await expect(fetchHackerNewsStories('AAPL')).resolves.toEqual([]);
  });
});
