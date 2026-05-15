/**
 * Plan 30.1-01 — Reddit adapter frozen contracts (Wave 0).
 *
 * Wave 0 tests pin the public type/constant surface so plan 30.1-02 can
 * implement against fixed inputs. The `describe.skip` block contains the
 * RED tests for the implementation; they unskip in plan 30.1-02.
 */
import { describe, it, expect } from 'vitest';
import {
  USER_AGENT, TOKEN_ENDPOINT, OAUTH_BASE,
  fetchRedditCommunity, getRedditToken, consumeRateToken,
  type RedditPost,
} from '@/lib/data/adapters/reddit';

describe('reddit adapter — Wave 0 frozen contracts (Plan 30.1-01)', () => {
  it('exports the mandatory User-Agent string per D-06', () => {
    expect(USER_AGENT).toBe('Cipher/1.0 (by /u/cipher-research)');
  });

  it('exports the OAuth token endpoint per D-01', () => {
    expect(TOKEN_ENDPOINT).toBe('https://www.reddit.com/api/v1/access_token');
  });

  it('exports the OAUTH_BASE per D-01', () => {
    expect(OAUTH_BASE).toBe('https://oauth.reddit.com');
  });

  it('exports the RedditPost type shape (10 fields, D-14)', () => {
    // Type-only smoke: assert assignment succeeds at type-check time.
    const sample: RedditPost = {
      id: '1', subreddit: 's', title: 't', selftext: '', score: 0,
      num_comments: 0, upvote_ratio: 1, author: 'a', permalink: '/r/x/comments/1/t/',
      created_utc: 1715200000, domain: 'self.s',
    };
    expect(sample.id).toBe('1');
  });
});

describe.skip('reddit adapter — implementation (UNSKIP IN PLAN 30.1-02)', () => {
  it('mints token via OAuth and caches in Upstash for ~24h (D-03)', async () => {
    await expect(getRedditToken()).rejects.toThrow();
  });

  it('respects 100 QPM rate bucket with report-path priority (D-04)', async () => {
    await expect(consumeRateToken('report')).rejects.toThrow();
  });

  it('fetches /r/{sub}/search.json for each sub in parallel (D-18)', async () => {
    await expect(fetchRedditCommunity('AAPL', ['stocks'])).rejects.toThrow();
  });
});
