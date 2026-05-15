/**
 * Plan 30.1-01 — HackerNews adapter frozen contracts (Wave 0).
 *
 * Wave 0 pins the endpoint + HNStory type so plan 30.1-03 can implement
 * against fixed inputs. The `describe.skip` block contains the RED test
 * for the implementation; it unskips in plan 30.1-03.
 */
import { describe, it, expect } from 'vitest';
import { HN_SEARCH_ENDPOINT, fetchHackerNewsStories, type HNStory } from '@/lib/data/adapters/hackernews';

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

describe.skip('hackernews adapter — implementation (UNSKIP IN PLAN 30.1-03)', () => {
  it('fetches one /search?query={ticker}&tags=story call per ticker (D-08)', async () => {
    await expect(fetchHackerNewsStories('AAPL')).rejects.toThrow();
  });
});
