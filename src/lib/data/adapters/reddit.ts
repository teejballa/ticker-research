/**
 * Phase 30.1 — Reddit OAuth community scan (D-01..D-06, D-14, D-18).
 *
 * SKELETON LANDED IN PLAN 30.1-01. Implementation lands in plan 30.1-02.
 * Public types + USER_AGENT + endpoint constants are frozen here so
 * downstream plans can import without dependency-cycle worry.
 *
 * Composition order (D-04, Phase 30 carryover): withTelemetry → withBreaker → withRetry.
 */

// MANDATORY per D-06 + Reddit TOS.
// https://github.com/reddit-archive/reddit/wiki/API — "Many default User-Agents
// (like 'Python/urllib' or 'Java') are drastically limited to encourage unique
// and descriptive user-agent strings." Missing/generic UA is the #1 cause of
// 429s + bans on Reddit OAuth — non-negotiable.
export const USER_AGENT = 'Cipher/1.0 (by /u/cipher-research)';

export const TOKEN_ENDPOINT = 'https://www.reddit.com/api/v1/access_token';
export const OAUTH_BASE = 'https://oauth.reddit.com';

/** D-14 — structured Reddit post. 10 fields; supersedes the regex-extracted
 *  rawEngagementCount() approximations from the Firecrawl-era community scan. */
export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  upvote_ratio: number;
  author: string;
  permalink: string;        // path fragment; prefix with https://www.reddit.com for citation
  created_utc: number;      // Unix epoch SECONDS — PIT join key (D-15)
  domain: string;
}

export async function getRedditToken(): Promise<string> {
  throw new Error('NOT_IMPLEMENTED — Plan 30.1-02');
}

export async function consumeRateToken(
  priority: 'report' | 'cron',
): Promise<'ok' | 'throttle'> {
  void priority;
  throw new Error('NOT_IMPLEMENTED — Plan 30.1-02');
}

export async function fetchRedditCommunity(
  ticker: string,
  subs: string[],
  priority: 'report' | 'cron' = 'cron',
): Promise<RedditPost[]> {
  void ticker; void subs; void priority;
  throw new Error('NOT_IMPLEMENTED — Plan 30.1-02');
}
