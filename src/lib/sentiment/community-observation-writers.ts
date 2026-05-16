/**
 * Plan 30.1-04 (D-15 / D-16 / D-17) — Reddit + HackerNews → SentimentObservation
 * writers extracted into a unit-testable module so the cron route stays lean.
 *
 * Both writers:
 *   - Are idempotent across rescans (the DAO's (ticker, message_id, model_version)
 *     unique index throws SentimentObservationDuplicateError on retry; we count it).
 *   - Honor the Crons-never-500 invariant — no error escapes the loop; all
 *     non-duplicate errors increment a per-ticker errors counter and log a
 *     `console.warn`.
 *   - PII discipline (T-30.1-04-02): raw author username is NEVER persisted.
 *     We SHA-256-hash `${source}:${PEPPER}:${author.toLowerCase()}` so the
 *     same author always produces the same `author_id` across rescans — that
 *     determinism is load-bearing for Phase 20-C-03 Cresci bot clustering
 *     and Phase 20-C-04 Nam/Yang pump-and-dump cluster detection.
 *   - PIT discipline (T-30.1-04-09 / CLAUDE.md §Statistical-Methods Reference
 *     rule #6): fetched_at = post.created_utc*1000 (Reddit) or
 *     story.created_at_i*1000 (HN). Each call site is marked LOOKAHEAD-OK so
 *     the static lookahead-bias check recognizes the override is intentional.
 *
 * Pepper rotation playbook: rotating SENTIMENT_AUTHOR_PEPPER requires bumping
 * `model_version` from `{source}-tag-v1` → `{source}-tag-v2` because author_id
 * partitioning is per-(message_id, model_version). See plan 30.1-04 SUMMARY.
 */
import { createHash } from 'crypto';
import type { RedditPost } from '@/lib/data/adapters/reddit';
import type { HNStory } from '@/lib/data/adapters/hackernews';
import {
  insertObservation,
  SentimentObservationDuplicateError,
} from '@/lib/sentiment/observation-store';

export const MODEL_VERSION_REDDIT = 'reddit-tag-v1';
export const MODEL_VERSION_HACKERNEWS = 'hackernews-tag-v1';

/** D-17 — SHA-256(`reddit:${pepper}:${lowercased_author}`). Reddit usernames
 *  are case-insensitive (Reddit allows `/u/Foo` and `/u/foo` for the same user);
 *  lowercasing before hashing is MANDATORY for deterministic clustering.
 *  Empty / null / undefined author falls back to `[deleted]` (Reddit's own
 *  convention for removed-author posts). */
export function hashRedditAuthor(author: string | null | undefined, pepper: string): string {
  const normalized = author && author.length > 0 ? author : '[deleted]';
  return createHash('sha256')
    .update(`reddit:${pepper}:${normalized.toLowerCase()}`, 'utf8')
    .digest('hex');
}

/** D-17 — SHA-256(`hackernews:${pepper}:${lowercased_author}`). Empty / null /
 *  undefined author falls back to `anonymous`. */
export function hashHackerNewsAuthor(author: string | null | undefined, pepper: string): string {
  const normalized = author && author.length > 0 ? author : 'anonymous';
  return createHash('sha256')
    .update(`hackernews:${pepper}:${normalized.toLowerCase()}`, 'utf8')
    .digest('hex');
}

const NULL_AUTHOR_FEATURES = {
  account_age_days: null,
  follower_count: null,
  is_verified: null,
  message_count_30d: null,
} as const;

/**
 * Write one SentimentObservation row per Reddit post. Increments
 * `reddit_obs_written_${ticker}`, `reddit_obs_dupes_${ticker}`, and
 * `reddit_obs_errors_${ticker}` on the provided results object.
 *
 * `undefined` or empty `posts` is a no-op (firecrawl branch surfaces undefined).
 */
export async function writeRedditObservations(
  ticker: string,
  posts: RedditPost[] | undefined,
  results: Record<string, number>,
): Promise<void> {
  const PEPPER = process.env.SENTIMENT_AUTHOR_PEPPER ?? '';
  let written = 0;
  let dupes = 0;
  let errors = 0;

  for (const post of posts ?? []) {
    if (!post.permalink || !post.created_utc) continue;
    const body = `${post.title}\n\n${post.selftext}`.trim();
    if (body.length === 0) continue; // observation-store rejects empty raw_body
    const author_id = hashRedditAuthor(post.author, PEPPER);
    try {
      await insertObservation({
        ticker,
        source: 'reddit', // D-15 — already in TS union
        message_id: post.permalink, // unique per-post path
        raw_body: body, // hashed inside DAO; never persisted raw
        classifier_version: MODEL_VERSION_REDDIT,
        classifier_score: null, // bootstrap — Phase 20-B-01 fills via new model_version
        model_version: MODEL_VERSION_REDDIT,
        decay_weight: null, // populated by 20-A-03 via new model_version
        author_id,
        author_features_snapshot: { ...NULL_AUTHOR_FEATURES },
        // LOOKAHEAD-OK: post.created_utc IS the as-of-time (Reddit-claimed post creation); backtest joins in 20-C-02 use fetched_at as PIT key per CLAUDE.md §Statistical-Methods rule #6.
        fetched_at: new Date(post.created_utc * 1000),
        // LOOKAHEAD-OK: published_at mirrors fetched_at for Reddit — column carries a // PIT-INVARIANT marker forbidding backtest joins, informational-only.
        published_at: new Date(post.created_utc * 1000),
      });
      written++;
    } catch (e) {
      if (e instanceof SentimentObservationDuplicateError) {
        dupes++;
      } else {
        errors++;
        console.warn(
          `[sentiment-scan][reddit] ${ticker} ${post.permalink}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
  results[`reddit_obs_written_${ticker}`] = written;
  results[`reddit_obs_dupes_${ticker}`] = dupes;
  results[`reddit_obs_errors_${ticker}`] = errors;
}

/**
 * Write one SentimentObservation row per HackerNews story. Counter naming
 * matches the Reddit writer (`hackernews_obs_*_${ticker}`).
 */
export async function writeHackerNewsObservations(
  ticker: string,
  stories: HNStory[] | undefined,
  results: Record<string, number>,
): Promise<void> {
  const PEPPER = process.env.SENTIMENT_AUTHOR_PEPPER ?? '';
  let written = 0;
  let dupes = 0;
  let errors = 0;

  for (const story of stories ?? []) {
    if (!story.objectID || !story.created_at_i) continue;
    const body = `${story.title}\n\n${story.story_text ?? ''}`.trim();
    if (body.length === 0) continue;
    const author_id = hashHackerNewsAuthor(story.author, PEPPER);
    try {
      await insertObservation({
        ticker,
        source: 'hackernews', // D-16 — added to union by 30.1-01
        message_id: story.objectID, // unique HN story ID
        raw_body: body,
        classifier_version: MODEL_VERSION_HACKERNEWS,
        classifier_score: null,
        model_version: MODEL_VERSION_HACKERNEWS,
        decay_weight: null,
        author_id,
        author_features_snapshot: { ...NULL_AUTHOR_FEATURES },
        // LOOKAHEAD-OK: HN Algolia created_at_i is Unix epoch seconds [VERIFIED 30.1-RESEARCH.md line 502]; IS the as-of-time. Backtest joins in 20-C-02 use fetched_at as PIT key.
        fetched_at: new Date(story.created_at_i * 1000),
        // LOOKAHEAD-OK: published_at mirrors fetched_at for HN — column carries a // PIT-INVARIANT marker forbidding backtest joins, informational-only.
        published_at: new Date(story.created_at_i * 1000),
      });
      written++;
    } catch (e) {
      if (e instanceof SentimentObservationDuplicateError) {
        dupes++;
      } else {
        errors++;
        console.warn(
          `[sentiment-scan][hackernews] ${ticker} ${story.objectID}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
  results[`hackernews_obs_written_${ticker}`] = written;
  results[`hackernews_obs_dupes_${ticker}`] = dupes;
  results[`hackernews_obs_errors_${ticker}`] = errors;
}
