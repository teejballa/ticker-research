// tests/lib/sentiment/community-observation-writers.test.ts
//
// Plan 30.1-04 Tasks 1 + 2 — unit tests for the Reddit + HN SentimentObservation
// writer helpers. These exercise:
//   - source='reddit' / source='hackernews' values
//   - PIT-correct fetched_at = created_utc*1000 (Reddit) / created_at_i*1000 (HN)
//   - SHA-256(pepper + lowercased author) author hashing
//   - SentimentObservationDuplicateError → dupes counter
//   - other errors → errors counter (logged-and-continued; never throws)
//   - empty / undefined input → no-op
//
// Tests run as vitest unit tests with insertObservation mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RedditPost } from '@/lib/data/adapters/reddit';
import type { HNStory } from '@/lib/data/adapters/hackernews';

// Re-implement the duplicate error locally to avoid loading the observation-store
// module (which imports prisma → requires DATABASE_URL). The mock below replaces
// the real module with a factory that exports a compatible class.
class FakeDuplicateError extends Error {
  constructor(
    public readonly ticker: string,
    public readonly message_id: string,
    public readonly model_version: string,
  ) {
    super('dup');
    this.name = 'SentimentObservationDuplicateError';
  }
}

// vi.mock is hoisted — factory must not capture top-level identifiers from this file.
// We expose insertObservation as a vi.fn so tests can configure return values via
// vi.mocked(...) lookups. We also export SentimentObservationDuplicateError so
// production code's `instanceof` check matches.
vi.mock('@/lib/sentiment/observation-store', () => {
  class SentimentObservationDuplicateError extends Error {
    constructor(
      public readonly ticker: string,
      public readonly message_id: string,
      public readonly model_version: string,
    ) {
      super('dup');
      this.name = 'SentimentObservationDuplicateError';
    }
  }
  return {
    insertObservation: vi.fn(),
    SentimentObservationDuplicateError,
  };
});

import {
  writeRedditObservations,
  writeHackerNewsObservations,
  hashRedditAuthor,
  hashHackerNewsAuthor,
} from '@/lib/sentiment/community-observation-writers';
import { insertObservation, SentimentObservationDuplicateError } from '@/lib/sentiment/observation-store';

const insertObservationMock = vi.mocked(insertObservation);
// Reference FakeDuplicateError to satisfy noUnusedLocals — used as a typed shim
// for tests that want to construct a duplicate error pre-mock (rarely needed).
void FakeDuplicateError;

const SAMPLE_REDDIT_POST: RedditPost = {
  id: 'p1',
  subreddit: 'wallstreetbets',
  title: 'AAPL puts',
  selftext: '',
  score: 50,
  num_comments: 20,
  upvote_ratio: 0.9,
  author: 'Foo',
  permalink: '/r/wallstreetbets/comments/1abc/aapl_puts/',
  created_utc: 1715200000,
  domain: 'self.wallstreetbets',
};

const SAMPLE_HN_STORY: HNStory = {
  objectID: '12345',
  title: 'AAPL discussion',
  url: null,
  story_text: null,
  points: 42,
  num_comments: 10,
  author: 'pg',
  created_at_i: 1715200000,
  permalink: 'https://news.ycombinator.com/item?id=12345',
};

describe('reddit writer — writeRedditObservations', () => {
  beforeEach(() => {
    insertObservationMock.mockReset();
    insertObservationMock.mockResolvedValue({ id: 'obs-1' });
    process.env.SENTIMENT_AUTHOR_PEPPER = 'test-pepper-30.1';
  });

  it('writes one observation per post with PIT-correct fetched_at', async () => {
    const results: Record<string, number> = {};
    await writeRedditObservations('AAPL', [SAMPLE_REDDIT_POST], results);

    expect(insertObservationMock).toHaveBeenCalledTimes(1);
    const call = insertObservationMock.mock.calls[0][0];
    expect(call.source).toBe('reddit');
    expect(call.ticker).toBe('AAPL');
    expect(call.message_id).toBe('/r/wallstreetbets/comments/1abc/aapl_puts/');
    expect(call.raw_body).toBe('AAPL puts');
    expect(call.classifier_version).toBe('reddit-tag-v1');
    expect(call.model_version).toBe('reddit-tag-v1');
    expect(call.classifier_score).toBeNull();
    expect(call.decay_weight).toBeNull();
    expect(call.fetched_at).toEqual(new Date(1715200000 * 1000));
    expect(call.published_at).toEqual(new Date(1715200000 * 1000));
    expect(call.author_features_snapshot).toEqual({
      account_age_days: null,
      follower_count: null,
      is_verified: null,
      message_count_30d: null,
    });
    expect(results.reddit_obs_written_AAPL).toBe(1);
    expect(results.reddit_obs_dupes_AAPL).toBe(0);
    expect(results.reddit_obs_errors_AAPL).toBe(0);
  });

  it('SentimentObservationDuplicateError increments dupes and does not throw', async () => {
    insertObservationMock.mockRejectedValueOnce(
      new SentimentObservationDuplicateError('AAPL', SAMPLE_REDDIT_POST.permalink, 'reddit-tag-v1'),
    );
    const results: Record<string, number> = {};
    await expect(
      writeRedditObservations('AAPL', [SAMPLE_REDDIT_POST], results),
    ).resolves.not.toThrow();
    expect(results.reddit_obs_written_AAPL).toBe(0);
    expect(results.reddit_obs_dupes_AAPL).toBe(1);
    expect(results.reddit_obs_errors_AAPL).toBe(0);
  });

  it('other errors increment errors counter and do not throw', async () => {
    insertObservationMock.mockRejectedValueOnce(new Error('db down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const results: Record<string, number> = {};
    await expect(
      writeRedditObservations('AAPL', [SAMPLE_REDDIT_POST], results),
    ).resolves.not.toThrow();
    expect(results.reddit_obs_written_AAPL).toBe(0);
    expect(results.reddit_obs_dupes_AAPL).toBe(0);
    expect(results.reddit_obs_errors_AAPL).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('undefined / empty input → no-op (writer never calls insertObservation)', async () => {
    const results: Record<string, number> = {};
    await writeRedditObservations('AAPL', undefined, results);
    await writeRedditObservations('AAPL', [], results);
    expect(insertObservationMock).not.toHaveBeenCalled();
    expect(results.reddit_obs_written_AAPL).toBe(0);
  });

  it('author hash is deterministic + case-insensitive (D-17: lowercases before SHA-256)', () => {
    const a = hashRedditAuthor('Foo', 'pepper-x');
    const b = hashRedditAuthor('FOO', 'pepper-x');
    const c = hashRedditAuthor('foo', 'pepper-x');
    expect(a).toBe(b);
    expect(b).toBe(c);
    // Different pepper produces different hash
    const d = hashRedditAuthor('foo', 'pepper-y');
    expect(a).not.toBe(d);
  });

  it('skips posts with missing permalink or created_utc', async () => {
    const bad: RedditPost = { ...SAMPLE_REDDIT_POST, permalink: '' };
    const bad2: RedditPost = { ...SAMPLE_REDDIT_POST, created_utc: 0 };
    const results: Record<string, number> = {};
    await writeRedditObservations('AAPL', [bad, bad2], results);
    expect(insertObservationMock).not.toHaveBeenCalled();
  });

  it('skips posts where title+selftext is empty (raw_body would be empty)', async () => {
    const empty: RedditPost = { ...SAMPLE_REDDIT_POST, title: '', selftext: '' };
    const results: Record<string, number> = {};
    await writeRedditObservations('AAPL', [empty], results);
    expect(insertObservationMock).not.toHaveBeenCalled();
  });

  it('uses SENTIMENT_AUTHOR_PEPPER env var (empty default in dev)', async () => {
    delete process.env.SENTIMENT_AUTHOR_PEPPER;
    const results: Record<string, number> = {};
    await writeRedditObservations('AAPL', [SAMPLE_REDDIT_POST], results);
    expect(insertObservationMock).toHaveBeenCalledTimes(1);
    const call = insertObservationMock.mock.calls[0][0];
    // With empty pepper, hash is sha256('reddit::foo')
    expect(call.author_id).toBe(hashRedditAuthor('Foo', ''));
  });
});

describe('hackernews writer — writeHackerNewsObservations', () => {
  beforeEach(() => {
    insertObservationMock.mockReset();
    insertObservationMock.mockResolvedValue({ id: 'obs-1' });
    process.env.SENTIMENT_AUTHOR_PEPPER = 'test-pepper-30.1';
  });

  it('writes one observation per story with PIT-correct fetched_at', async () => {
    const results: Record<string, number> = {};
    await writeHackerNewsObservations('AAPL', [SAMPLE_HN_STORY], results);
    expect(insertObservationMock).toHaveBeenCalledTimes(1);
    const call = insertObservationMock.mock.calls[0][0];
    expect(call.source).toBe('hackernews');
    expect(call.ticker).toBe('AAPL');
    expect(call.message_id).toBe('12345');
    expect(call.raw_body).toBe('AAPL discussion');
    expect(call.model_version).toBe('hackernews-tag-v1');
    expect(call.classifier_version).toBe('hackernews-tag-v1');
    expect(call.fetched_at).toEqual(new Date(1715200000 * 1000));
    expect(call.published_at).toEqual(new Date(1715200000 * 1000));
    expect(results.hackernews_obs_written_AAPL).toBe(1);
  });

  it('combines title + story_text into raw_body when story_text non-null', async () => {
    const story: HNStory = { ...SAMPLE_HN_STORY, story_text: 'long ask hn body' };
    const results: Record<string, number> = {};
    await writeHackerNewsObservations('AAPL', [story], results);
    const call = insertObservationMock.mock.calls[0][0];
    expect(call.raw_body).toBe('AAPL discussion\n\nlong ask hn body');
  });

  it('skips story when title is empty AND story_text is null', async () => {
    const story: HNStory = { ...SAMPLE_HN_STORY, title: '', story_text: null };
    const results: Record<string, number> = {};
    await writeHackerNewsObservations('AAPL', [story], results);
    expect(insertObservationMock).not.toHaveBeenCalled();
  });

  it('SentimentObservationDuplicateError → dupes; other errors → errors; both no-throw', async () => {
    insertObservationMock.mockRejectedValueOnce(
      new SentimentObservationDuplicateError('AAPL', '12345', 'hackernews-tag-v1'),
    );
    insertObservationMock.mockRejectedValueOnce(new Error('db down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const results: Record<string, number> = {};
    await writeHackerNewsObservations(
      'AAPL',
      [SAMPLE_HN_STORY, { ...SAMPLE_HN_STORY, objectID: '67890' }],
      results,
    );
    expect(results.hackernews_obs_dupes_AAPL).toBe(1);
    expect(results.hackernews_obs_errors_AAPL).toBe(1);
    expect(results.hackernews_obs_written_AAPL).toBe(0);
    warnSpy.mockRestore();
  });

  it('undefined / empty input → no-op', async () => {
    const results: Record<string, number> = {};
    await writeHackerNewsObservations('AAPL', undefined, results);
    await writeHackerNewsObservations('AAPL', [], results);
    expect(insertObservationMock).not.toHaveBeenCalled();
  });

  it('author hash is deterministic + case-insensitive', () => {
    const a = hashHackerNewsAuthor('PG', 'pepper-x');
    const b = hashHackerNewsAuthor('pg', 'pepper-x');
    expect(a).toBe(b);
    const c = hashHackerNewsAuthor('pg', 'pepper-y');
    expect(a).not.toBe(c);
  });

  it('handles null author with "anonymous" fallback', async () => {
    const story = { ...SAMPLE_HN_STORY, author: '' } as HNStory;
    const results: Record<string, number> = {};
    await writeHackerNewsObservations('AAPL', [story], results);
    const call = insertObservationMock.mock.calls[0][0];
    expect(call.author_id).toBe(hashHackerNewsAuthor('anonymous', 'test-pepper-30.1'));
  });
});
