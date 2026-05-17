/**
 * Plan 30.1-pivot Task 4 — orchestrator tests for the Xpoz community-scan path.
 *
 * Covers (a) `toEngagementFromFields` + `ENGAGEMENT_TIER_THRESHOLDS` (pure
 * thresholds), and (b) the flag-gated orchestrator branches (xpoz / firecrawl
 * / shadow). The new Xpoz `fetchRedditCommunity` is invoked PER-subreddit
 * (one call per sub), so tests assert call count + ticker uppercase + that
 * `fetchTwitterCommunity` is invoked alongside.
 *
 * Module-level `COMMUNITY_SCAN_SOURCE` requires `vi.resetModules()` + dynamic
 * `await import()` per-test so the flag-gating re-evaluates per-test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toEngagementFromFields,
  ENGAGEMENT_TIER_THRESHOLDS,
} from '@/lib/data/lightweight-community-scan';
import type { RedditPost } from '@/lib/data/adapters/reddit';
import type { TwitterPost } from '@/lib/data/adapters/twitter';
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
// Task 4 — flag-gated orchestrator branches (xpoz / firecrawl / shadow)
// ─────────────────────────────────────────────────────────────────────────

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
function makeTwitterPost(overrides: Partial<TwitterPost> = {}): TwitterPost {
  return {
    id: 't1',
    text: '$AAPL is mooning',
    author: 'cryptoBro',
    like_count: 100,
    retweet_count: 20,
    reply_count: 5,
    quote_count: 0,
    impression_count: 5000,
    lang: 'en',
    is_retweet: false,
    possibly_sensitive: false,
    created_utc: 1715200000,
    url: 'https://twitter.com/cryptoBro/status/t1',
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

describe('lightweightCommunityScan — Xpoz branch (Plan 30.1-pivot Task 4)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.XPOZ_API_KEY;
    delete process.env.FIRECRAWL_API_KEY;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns null when XPOZ_API_KEY is unset', async () => {
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'xpoz' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/twitter', () => ({
      fetchTwitterCommunity: vi.fn(async () => []),
      isAuthenticTwitterUser: vi.fn(async () => true),
    }));
    vi.doMock('@/lib/data/adapters/hackernews', () => ({
      fetchHackerNewsStories: vi.fn(async () => []),
    }));
    const mod = await import('@/lib/data/lightweight-community-scan');
    const out = await mod.lightweightCommunityScan('AAPL');
    expect(out).toBeNull();
  });

  it('calls fetchRedditCommunity once per sub in COMMUNITY_SUBS + ticker niche', async () => {
    vi.stubEnv('XPOZ_API_KEY', 'fake-xpoz-key');
    const fetchRedditCommunityMock = vi.fn(async () => [] as RedditPost[]);
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'xpoz' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: fetchRedditCommunityMock,
    }));
    vi.doMock('@/lib/data/adapters/twitter', () => ({
      fetchTwitterCommunity: vi.fn(async () => []),
      isAuthenticTwitterUser: vi.fn(async () => true),
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
    const { COMMUNITY_SUBS } = await import('@/lib/data/community-subs');
    const mod = await import('@/lib/data/lightweight-community-scan');
    await mod.lightweightCommunityScan('AAPL');
    // Each sub gets its own call, plus the per-ticker niche sub `r/AAPL`.
    expect(fetchRedditCommunityMock).toHaveBeenCalledTimes(COMMUNITY_SUBS.length + 1);
    // Last call should be the ticker-niche sub passed as `AAPL` (upper).
    const lastCall = fetchRedditCommunityMock.mock.calls[fetchRedditCommunityMock.mock.calls.length - 1];
    expect(lastCall[0]).toBe('AAPL');
    expect(lastCall[1]).toBe('AAPL');
  });

  it('calls fetchTwitterCommunity once per ticker per run', async () => {
    vi.stubEnv('XPOZ_API_KEY', 'fake-xpoz-key');
    const fetchTwitterCommunityMock = vi.fn(async () => [] as TwitterPost[]);
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'xpoz' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/twitter', () => ({
      fetchTwitterCommunity: fetchTwitterCommunityMock,
      isAuthenticTwitterUser: vi.fn(async () => true),
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
    expect(fetchTwitterCommunityMock).toHaveBeenCalledTimes(1);
    expect(fetchTwitterCommunityMock.mock.calls[0][0]).toBe('AAPL');
  });

  it('emits one highlight per subreddit that returned posts', async () => {
    vi.stubEnv('XPOZ_API_KEY', 'fake-xpoz-key');
    // Two subs return posts (stocks, wallstreetbets); others return [].
    const fetchRedditCommunityMock = vi.fn(async (_ticker: string, sub: string) => {
      if (sub === 'stocks') {
        return [makeRedditPost({ id: 's1', subreddit: 'stocks', score: 30, num_comments: 5 })];
      }
      if (sub === 'wallstreetbets') {
        return [
          makeRedditPost({
            id: 'w1',
            subreddit: 'wallstreetbets',
            score: 200,
            num_comments: 80,
          }),
        ];
      }
      return [];
    });
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'xpoz' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: fetchRedditCommunityMock,
    }));
    vi.doMock('@/lib/data/adapters/twitter', () => ({
      fetchTwitterCommunity: vi.fn(async () => []),
      isAuthenticTwitterUser: vi.fn(async () => true),
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

  it('emits a Twitter highlight when Twitter returns ≥1 post', async () => {
    vi.stubEnv('XPOZ_API_KEY', 'fake-xpoz-key');
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'xpoz' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/twitter', () => ({
      fetchTwitterCommunity: vi.fn(async () => [
        makeTwitterPost({ id: 't1', like_count: 600 }),
      ]),
      isAuthenticTwitterUser: vi.fn(async () => true),
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
    const twHighlight = out!.highlights.find(h => h.community_name === 'Twitter');
    expect(twHighlight).toBeDefined();
    expect(twHighlight!.engagement).toBe('high');
  });

  it('drops top-3 Twitter posts that fail authenticity gate', async () => {
    vi.stubEnv('XPOZ_API_KEY', 'fake-xpoz-key');
    const tweets = [
      makeTwitterPost({ id: 'top1', author: 'bot', like_count: 1000 }),
      makeTwitterPost({ id: 'top2', author: 'real', like_count: 500 }),
      makeTwitterPost({ id: 'top3', author: 'bot', like_count: 250 }),
      makeTwitterPost({ id: 'tail', author: 'low', like_count: 50 }),
    ];
    const isAuthMock = vi.fn(async (username: string) => username !== 'bot');
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'xpoz' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/twitter', () => ({
      fetchTwitterCommunity: vi.fn(async () => tweets),
      isAuthenticTwitterUser: isAuthMock,
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
    // Only the top 3 are checked; bots removed → 1 real + tail = 2.
    expect(out!.twitter_posts).toHaveLength(2);
    expect(out!.twitter_posts!.map(p => p.id)).toEqual(['top2', 'tail']);
    // Auth check called exactly 3 times (top-3 only).
    expect(isAuthMock).toHaveBeenCalledTimes(3);
  });

  it('returns null when everything is empty', async () => {
    vi.stubEnv('XPOZ_API_KEY', 'fake-xpoz-key');
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'xpoz' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async () => []),
    }));
    vi.doMock('@/lib/data/adapters/twitter', () => ({
      fetchTwitterCommunity: vi.fn(async () => []),
      isAuthenticTwitterUser: vi.fn(async () => true),
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

  it('xpoz-branch EnrichedSnapshot exposes reddit_posts + hackernews_stories + twitter_posts', async () => {
    vi.stubEnv('XPOZ_API_KEY', 'fake-xpoz-key');
    const redditPost = makeRedditPost({ id: 'rp1', score: 100, num_comments: 50 });
    const tweet = makeTwitterPost({ id: 'tw1' });
    const story = makeHNStory({ objectID: 'hn1' });
    vi.doMock('@/lib/features', async () => {
      const actual = await vi.importActual<typeof import('@/lib/features')>('@/lib/features');
      return { ...actual, COMMUNITY_SCAN_SOURCE: 'xpoz' };
    });
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: vi.fn(async (_t: string, sub: string) =>
        sub === 'stocks' ? [redditPost] : [],
      ),
    }));
    vi.doMock('@/lib/data/adapters/twitter', () => ({
      fetchTwitterCommunity: vi.fn(async () => [tweet]),
      isAuthenticTwitterUser: vi.fn(async () => true),
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
    expect(out!.reddit_posts![0].id).toBe('rp1');
    expect(out!.twitter_posts).toHaveLength(1);
    expect(out!.twitter_posts![0].id).toBe('tw1');
    expect(out!.hackernews_stories).toHaveLength(1);
    expect(out!.hackernews_stories![0].objectID).toBe('hn1');
  });
});

describe('lightweightCommunityScan — Firecrawl branch (Plan 30.1-pivot Task 4)', () => {
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
    const fetchRedditCommunityMock = vi.fn(async () => []);
    const fetchTwitterCommunityMock = vi.fn(async () => []);
    vi.doMock('@/lib/data/adapters/reddit', () => ({
      fetchRedditCommunity: fetchRedditCommunityMock,
    }));
    vi.doMock('@/lib/data/adapters/twitter', () => ({
      fetchTwitterCommunity: fetchTwitterCommunityMock,
      isAuthenticTwitterUser: vi.fn(async () => true),
    }));
    vi.doMock('@/lib/data/adapters/hackernews', () => ({
      fetchHackerNewsStories: vi.fn(async () => []),
    }));
    const mod = await import('@/lib/data/lightweight-community-scan');
    // FIRECRAWL_API_KEY unset → legacy early-exit returns null.
    const out = await mod.lightweightCommunityScan('AAPL');
    expect(out).toBeNull();
    expect(fetchRedditCommunityMock).not.toHaveBeenCalled();
    expect(fetchTwitterCommunityMock).not.toHaveBeenCalled();
  });
});

describe('lightweightCommunityScan — Shadow branch (Plan 30.1-pivot Task 4)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FIRECRAWL_API_KEY;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('shadow mode returns Firecrawl result and fires Xpoz path in background via after()', async () => {
    vi.stubEnv('XPOZ_API_KEY', 'fake-xpoz-key');
    const fetchRedditCommunityMock = vi.fn(async () => [] as RedditPost[]);
    const fetchTwitterCommunityMock = vi.fn(async () => [] as TwitterPost[]);
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
    vi.doMock('@/lib/data/adapters/twitter', () => ({
      fetchTwitterCommunity: fetchTwitterCommunityMock,
      isAuthenticTwitterUser: vi.fn(async () => true),
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
    expect(out).toBeNull();
    // Flush microtasks so the after() callback completes.
    await new Promise((r) => setImmediate(r));
    // Both Xpoz fetchers should have been invoked in the background.
    expect(fetchRedditCommunityMock).toHaveBeenCalled();
    expect(fetchTwitterCommunityMock).toHaveBeenCalled();
  });
});
