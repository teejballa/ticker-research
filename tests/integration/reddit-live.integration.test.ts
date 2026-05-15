/**
 * Plan 30.1-02 Task 3 — Live Reddit OAuth integration test.
 *
 * Gated by RUN_LIVE_REDDIT=true so `npm test` runs the suite as a no-op in CI
 * (no credentials, no network) but operator can opt-in locally with:
 *
 *   RUN_LIVE_REDDIT=true \
 *   REDDIT_CLIENT_ID=... \
 *   REDDIT_CLIENT_SECRET=... \
 *   npx vitest run tests/integration/reddit-live.integration.test.ts
 *
 * Mirrors the RUN_LIVE_JUDGE pattern from Plan 20-Z-05 — opt-in live tests
 * never run in CI, but are reproducible per-operator against the real API
 * to prove the OAuth + search path is wired correctly post-deploy-config.
 *
 * Asserts the four invariants from the plan §verification:
 *   1. At least one post returned from r/stocks for AAPL within the last week.
 *   2. Every returned post has a non-empty id.
 *   3. Every returned post has created_utc within the last 14 days (search uses
 *      t=week + small grace for clock skew between Reddit and CI runner).
 *   4. (implicit) USER_AGENT header was sent — if missing, Reddit would 429
 *      or empty-page us and (1) would fail.
 */
import { describe, it, expect } from 'vitest';
import { fetchRedditCommunity } from '@/lib/data/adapters/reddit';

const LIVE = process.env.RUN_LIVE_REDDIT === 'true';

describe.skipIf(!LIVE)(
  'reddit adapter — live OAuth integration (gated by RUN_LIVE_REDDIT=true)',
  () => {
    it('mints token and fetches r/stocks for AAPL', async () => {
      const posts = await fetchRedditCommunity('AAPL', ['stocks'], 'report');

      // (1) At least one post — Reddit r/stocks always has recent AAPL chatter.
      expect(posts.length).toBeGreaterThanOrEqual(1);

      for (const p of posts) {
        // (2) Non-empty id.
        expect(p.id).not.toBe('');
        // (3) created_utc populated.
        expect(p.created_utc).toBeGreaterThan(0);
        // Age window — t=week + 7d grace for any clock skew.
        const ageDays = (Date.now() / 1000 - p.created_utc) / 86400;
        expect(ageDays).toBeLessThan(14);
      }
    }, 15_000);
  },
);
