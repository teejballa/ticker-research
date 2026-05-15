/**
 * Phase 30.1 — HackerNews Algolia search adapter (D-07..D-09, D-16, D-18).
 *
 * SKELETON LANDED IN PLAN 30.1-01. Implementation lands in plan 30.1-03.
 *
 * Endpoint is free + no auth (per https://hn.algolia.com/api). Rate limit is
 * per-IP only; Vercel's shared egress means breaker is the safety net.
 */

export const HN_SEARCH_ENDPOINT = 'https://hn.algolia.com/api/v1/search';

/** D-16 — structured HackerNews story. 9 fields, mirrors RedditPost PIT shape. */
export interface HNStory {
  objectID: string;
  title: string;
  url: string | null;
  story_text: string | null;
  points: number;
  num_comments: number;
  author: string;
  created_at_i: number;     // Unix epoch SECONDS — PIT join key
  permalink: string;        // computed: https://news.ycombinator.com/item?id={objectID}
}

export async function fetchHackerNewsStories(ticker: string): Promise<HNStory[]> {
  void ticker;
  throw new Error('NOT_IMPLEMENTED — Plan 30.1-03');
}
