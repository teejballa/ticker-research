/**
 * Plan 30.1-pivot — Live Xpoz Reddit integration test.
 *
 * Gated by RUN_LIVE_XPOZ=true so `npm test` runs the suite as a no-op in CI
 * (no credentials, no network) but operator can opt-in locally with:
 *
 *   RUN_LIVE_XPOZ=true \
 *   XPOZ_API_KEY=... \
 *   npx vitest run tests/integration/reddit-live.integration.test.ts
 *
 * Mirrors the RUN_LIVE_JUDGE pattern from Plan 20-Z-05 — opt-in live tests
 * never run in CI, but are reproducible per-operator against the real Xpoz
 * Pro endpoint to prove the SDK + search path is wired correctly.
 *
 * Asserts the four invariants:
 *   1. At least one post returned from r/stocks for AAPL within the last week.
 *   2. Every returned post has a non-empty id.
 *   3. Every returned post has created_utc within the last 14 days (search
 *      uses time=week + small grace for clock skew).
 *   4. (implicit) Authorization header was sent — if missing, Xpoz would
 *      AuthenticationError and (1) would throw.
 */
import { describe, it, expect } from 'vitest';
import { fetchRedditCommunity } from '@/lib/data/adapters/reddit';

const LIVE = process.env.RUN_LIVE_XPOZ === 'true';

describe.skipIf(!LIVE)(
  'reddit adapter — live Xpoz integration (gated by RUN_LIVE_XPOZ=true)',
  () => {
    it('fetches r/stocks for AAPL via Xpoz Pro', async () => {
      const posts = await fetchRedditCommunity('AAPL', 'stocks');

      // (1) At least one post — r/stocks always has recent AAPL chatter.
      expect(posts.length).toBeGreaterThanOrEqual(1);

      for (const p of posts) {
        // (2) Non-empty id.
        expect(p.id).not.toBe('');
        // (3) created_utc populated.
        expect(p.created_utc).toBeGreaterThan(0);
        // Age window — Xpoz time='week' + 7d grace for clock skew.
        const ageDays = (Date.now() / 1000 - p.created_utc) / 86400;
        expect(ageDays).toBeLessThan(14);
      }
    }, 15_000);
  },
);
