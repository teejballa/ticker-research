/**
 * Plan 30.1-03 — Task 2 + Task 3 tests for the community-scan orchestrator.
 *
 * Task 2 covers `toEngagementFromFields` + `ENGAGEMENT_TIER_THRESHOLDS`
 * (pure-function thresholds, no external dependencies).
 *
 * Task 3 covers the flag-gated orchestrator (Reddit / Firecrawl / shadow
 * branches). Module-level `COMMUNITY_SCAN_SOURCE` requires `vi.resetModules()`
 * + dynamic `await import()` per-test so the flag-gating logic re-evaluates
 * against the mocked features module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toEngagementFromFields,
  ENGAGEMENT_TIER_THRESHOLDS,
} from '@/lib/data/lightweight-community-scan';
import type { RedditPost } from '@/lib/data/adapters/reddit';
import type { HNStory } from '@/lib/data/adapters/hackernews';

describe('toEngagementFromFields (Plan 30.1-03 Task 2)', () => {
  it('returns high when score >= 100', () => {
    expect(toEngagementFromFields({ score: 100, num_comments: 0 })).toBe('high');
  });
  it('returns high when num_comments >= 50', () => {
    expect(toEngagementFromFields({ score: 0, num_comments: 50 })).toBe('high');
  });
  it('returns medium when score >= 20 but below high', () => {
    expect(toEngagementFromFields({ score: 50, num_comments: 0 })).toBe('medium');
  });
  it('returns medium when num_comments >= 10 but below high', () => {
    expect(toEngagementFromFields({ score: 0, num_comments: 20 })).toBe('medium');
  });
  it('returns low when both below medium', () => {
    expect(toEngagementFromFields({ score: 5, num_comments: 2 })).toBe('low');
  });
  it('thresholds are exported for plan 30.1-05 calibration', () => {
    expect(ENGAGEMENT_TIER_THRESHOLDS.high_score).toBe(100);
    expect(ENGAGEMENT_TIER_THRESHOLDS.high_comments).toBe(50);
    expect(ENGAGEMENT_TIER_THRESHOLDS.medium_score).toBe(20);
    expect(ENGAGEMENT_TIER_THRESHOLDS.medium_comments).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Task 3 — flag-gated orchestrator branches
// ─────────────────────────────────────────────────────────────────────────

/**
 * Test helpers — mock factories. Reset & re-applied per-test via
 * vi.resetModules() so each describe-block has independent module state.
 */
function makeRedditPost(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id: 'p1',
    subreddit: 'stocks',
    title: 'AAPL crushes earnings',
    selftext: '',
    score: 50,
    num_comments: 20,
    upvote_ratio: 0.95,
    author: 'foo',
    permalink: '/r/stocks/comments/p1/aapl_crushes_earnings/',
    created_utc: 1715200000,
    domain: 'self.stocks',
    ...overrides,
  };
}
function makeHNStory(overrides: Partial<HNStory> = {}): HNStory {
  return {
    objectID: 'h1',
    title: 'AAPL revenue beat',
    url: 'https://example.com',
    story_text: null,
    points: 100,
    num_comments: 30,
    author: 'hn-user',
    created_at_i: 1715200000,
    permalink: 'https://news.ycombinator.com/item?id=h1',
    ...overrides,
  };
}

describe('lightweightCommunityScan — Reddit branch (Plan 30.1-03 Task 3)', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset env for each test so absent vars truly default.
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
    delete process.env.FIRECRAWL_API_KEY;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('runRedditPath returns null when REDDIT_CLIENT_ID is unset', async () => {
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'reddit' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/hackernews', () => ({
      fetchHackerNewsStories: vi.fn(async () => []),
    }));
    const mod = await import('@/lib/data/lightweight-community-scan');
    const out = await mod.lightweightCommunityScan('AAPL');
    expect(out).toBeNull();
  });

  it('runRedditPath calls fetchRedditCommunity with subs = COMMUNITY_SUBS + ticker', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'fake-id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'fake-secret');
    // Typed mock so mock.calls[0][1] is recognized as the `subs` arg.
    const fetchRedditCommunityMock = vi.fn<
      (ticker: string, subs: string[], priority?: 'report' | 'cron') => Promise<RedditPost[]>
    >(async () => []);
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'reddit' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: fetchRedditCommunityMock,
    }));
    vi.doMock('@/lib/data/adapters/hackernews', () => ({
      fetchHackerNewsStories: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/stocktwits', () => ({
      fetchStockTwitsSentiment: vi.fn(async () => ({
        stocktwits_bull_pct: null,
        stocktwits_bear_pct: null,
        stocktwits_message_count: null,
      })),
      fetchStockTwitsRaw: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/quiver', () => ({
      fetchQuiverInsider: vi.fn(async () => null),
      fetchQuiverCongressional: vi.fn(async () => null),
    }));
    const mod = await import('@/lib/data/lightweight-community-scan');
    await mod.lightweightCommunityScan('AAPL');
    expect(fetchRedditCommunityMock).toHaveBeenCalled();
    const subsArg = fetchRedditCommunityMock.mock.calls[0]![1];
    expect(subsArg.length).toBe(17); // 16 fixed + 1 ticker niche
    expect(subsArg[subsArg.length - 1]).toBe('AAPL');
  });

  it('runRedditPath emits one highlight per subreddit with posts', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'fake-id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'fake-secret');
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'reddit' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async () => [
        makeRedditPost({ id: 's1', subreddit: 'stocks', score: 30, num_comments: 5 }),
        makeRedditPost({ id: 'w1', subreddit: 'wallstreetbets', score: 200, num_comments: 80 }),
      ]),
    }));
    vi.doMock('@/lib/data/adapters/hackernews', () => ({
      fetchHackerNewsStories: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/stocktwits', () => ({
      fetchStockTwitsSentiment: vi.fn(async () => ({
        stocktwits_bull_pct: null,
        stocktwits_bear_pct: null,
        stocktwits_message_count: null,
      })),
      fetchStockTwitsRaw: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/quiver', () => ({
      fetchQuiverInsider: vi.fn(async () => null),
      fetchQuiverCongressional: vi.fn(async () => null),
    }));
    const mod = await import('@/lib/data/lightweight-community-scan');
    const out = await mod.lightweightCommunityScan('AAPL');
    expect(out).not.toBeNull();
    expect(out!.highlights.length).toBe(2);
    expect(out!.highlights.every(h => h.community_name.startsWith('r/'))).toBe(true);
  });

  it('runRedditPath emits HackerNews highlight when stories returned', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'fake-id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'fake-secret');
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'reddit' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/hackernews', () => ({
      fetchHackerNewsStories: vi.fn(async () => [makeHNStory()]),
    }));
    vi.doMock('@/lib/data/stocktwits', () => ({
      fetchStockTwitsSentiment: vi.fn(async () => ({
        stocktwits_bull_pct: null,
        stocktwits_bear_pct: null,
        stocktwits_message_count: null,
      })),
      fetchStockTwitsRaw: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/quiver', () => ({
      fetchQuiverInsider: vi.fn(async () => null),
      fetchQuiverCongressional: vi.fn(async () => null),
    }));
    const mod = await import('@/lib/data/lightweight-community-scan');
    const out = await mod.lightweightCommunityScan('AAPL');
    expect(out).not.toBeNull();
    const hnHighlight = out!.highlights.find(h => h.community_name === 'HackerNews');
    expect(hnHighlight).toBeDefined();
    expect(hnHighlight!.community_type).toBe('middle');
  });

  it('runRedditPath returns null on empty everything', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'fake-id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'fake-secret');
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'reddit' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/hackernews', () => ({
      fetchHackerNewsStories: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/stocktwits', () => ({
      fetchStockTwitsSentiment: vi.fn(async () => ({
        stocktwits_bull_pct: null,
        stocktwits_bear_pct: null,
        stocktwits_message_count: null,
      })),
      fetchStockTwitsRaw: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/quiver', () => ({
      fetchQuiverInsider: vi.fn(async () => null),
      fetchQuiverCongressional: vi.fn(async () => null),
    }));
    // marketCap mock — return null so the "nothing to say" branch triggers.
    vi.doMock('yahoo-finance2', () => ({
      default: class {
        suppressNotices() {}
        async quote() { return { marketCap: null }; }
      },
    }));
    const mod = await import('@/lib/data/lightweight-community-scan');
    const out = await mod.lightweightCommunityScan('AAPL');
    expect(out).toBeNull();
  });

  it('reddit-branch EnrichedSnapshot exposes reddit_posts + hackernews_stories', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'fake-id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'fake-secret');
    const post = makeRedditPost({ id: 'unique', score: 100, num_comments: 50 });
    const story = makeHNStory({ objectID: 'unique-hn' });
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'reddit' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async () => [post]),
    }));
    vi.doMock('@/lib/data/adapters/hackernews', () => ({
      fetchHackerNewsStories: vi.fn(async () => [story]),
    }));
    vi.doMock('@/lib/data/stocktwits', () => ({
      fetchStockTwitsSentiment: vi.fn(async () => ({
        stocktwits_bull_pct: null,
        stocktwits_bear_pct: null,
        stocktwits_message_count: null,
      })),
      fetchStockTwitsRaw: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/quiver', () => ({
      fetchQuiverInsider: vi.fn(async () => null),
      fetchQuiverCongressional: vi.fn(async () => null),
    }));
    const mod = await import('@/lib/data/lightweight-community-scan');
    const out = await mod.lightweightCommunityScan('AAPL');
    expect(out).not.toBeNull();
    expect(out!.reddit_posts).toHaveLength(1);
    expect(out!.reddit_posts![0].id).toBe('unique');
    expect(out!.hackernews_stories).toHaveLength(1);
    expect(out!.hackernews_stories![0].objectID).toBe('unique-hn');
  });
});

describe('lightweightCommunityScan — Firecrawl branch (Plan 30.1-03 Task 3)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FIRECRAWL_API_KEY;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('branches to runFirecrawlPath when COMMUNITY_SCAN_SOURCE=firecrawl', async () => {
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'firecrawl' };
    });
    // Reddit adapters should NOT be called when firecrawl is selected.
    const fetchRedditCommunityMock = vi.fn(async () => []);
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: fetchRedditCommunityMock,
    }));
    vi.doMock('@/lib/data/adapters/hackernews', () => ({
      fetchHackerNewsStories: vi.fn(async () => []),
    }));
    const mod = await import('@/lib/data/lightweight-community-scan');
    // FIRECRAWL_API_KEY unset → legacy early-exit returns null.
    const out = await mod.lightweightCommunityScan('AAPL');
    expect(out).toBeNull();
    expect(fetchRedditCommunityMock).not.toHaveBeenCalled();
  });
});

describe('lightweightCommunityScan — Shadow branch (Plan 30.1-03 Task 3)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FIRECRAWL_API_KEY;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('shadow mode returns Firecrawl result and fires Reddit in background via after()', async () => {
    vi.stubEnv('REDDIT_CLIENT_ID', 'fake-id');
    vi.stubEnv('REDDIT_CLIENT_SECRET', 'fake-secret');
    const fetchRedditCommunityMock = vi.fn(async () => [] as RedditPost[]);
    // Mock `after` from next/server to run the callback synchronously so we
    // can assert the Reddit path was invoked. Real Vercel honors `after` to
    // extend the lambda lifetime past the response — the test harness just
    // needs the callback to execute.
    vi.doMock('next/server', () => ({
      after: (fn: () => Promise<void>) => { void fn(); },
    }));
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'shadow' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: fetchRedditCommunityMock,
    }));
    vi.doMock('@/lib/data/adapters/hackernews', () => ({
      fetchHackerNewsStories: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/stocktwits', () => ({
      fetchStockTwitsSentiment: vi.fn(async () => ({
        stocktwits_bull_pct: null,
        stocktwits_bear_pct: null,
        stocktwits_message_count: null,
      })),
      fetchStockTwitsRaw: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/quiver', () => ({
      fetchQuiverInsider: vi.fn(async () => null),
      fetchQuiverCongressional: vi.fn(async () => null),
    }));
    const mod = await import('@/lib/data/lightweight-community-scan');
    const out = await mod.lightweightCommunityScan('AAPL');
    // Firecrawl path short-circuits to null since FIRECRAWL_API_KEY is unset.
    expect(out).toBeNull();
    // Flush microtasks so the after() callback completes.
    await new Promise((r) => setImmediate(r));
    expect(fetchRedditCommunityMock).toHaveBeenCalled();
  });
});
