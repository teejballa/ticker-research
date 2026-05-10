// tests/lib/data/stocktwits.reputation.test.ts
//
// Plan 19-C-03 — Reputation-weighted StockTwits aggregation (D-35).
//
// Tests pin the reputation-weighted score formula and per-user 24h reputation
// caching behavior. The naive count path remains unchanged when
// FEATURE_REPUTATION_WEIGHTED_STOCKTWITS=off (verified by the existing
// src/lib/data/__tests__/stocktwits.test.ts suite).
//
// Threat-model coverage:
//   T-19-C-03-01: extreme reputation users skew score → winsorize at p95.
//   T-19-C-03-02: per-user API call burns rate limit → cache 24h.
//
// Helpers under test:
//   reputationWeight(user)            — pure formula
//   reputationWeightedSentiment(...)  — Σ(s_i × r_i) / Σ(r_i)
//   getUserReputation(userId, fetch?) — TTL-cached fetch wrapper

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  reputationWeight,
  reputationWeightedSentiment,
  getUserReputation,
  __resetReputationCacheForTests,
  type StocktwitsUserSnapshot,
  type StocktwitsScoredMessage,
} from '../../../src/lib/data/stocktwits';

beforeEach(() => {
  __resetReputationCacheForTests();
  vi.useRealTimers();
});

// ── Test 1: reputationWeight derives from follower_count + post_history ──
describe('reputationWeight (Plan 19-C-03)', () => {
  it('derives from follower_count + post_history per pinned formula', () => {
    // Pinned formula: log10(followers + 1) + log10(post_count + 1)
    const user: StocktwitsUserSnapshot = {
      id: 1,
      followers: 999,           // log10(1000)  = 3
      post_count: 99,           // log10(100)   = 2
    };
    expect(reputationWeight(user)).toBeCloseTo(5, 9);

    // Sanity: the all-zeros baseline scores 0 (no followers, no posts).
    expect(reputationWeight({ id: 2, followers: 0, post_count: 0 })).toBe(0);

    // Monotone: more followers ⇒ strictly higher weight at fixed post_count.
    const a = reputationWeight({ id: 3, followers: 100, post_count: 10 });
    const b = reputationWeight({ id: 4, followers: 1_000, post_count: 10 });
    expect(b).toBeGreaterThan(a);
  });

  // ── Test 2: winsorize at percentile-95 of group ───────────────────────
  it('winsorizes a single extreme reputation at percentile-95 of the group', () => {
    // Group of 21 users — one whale (followers=1e9), 20 with followers=100.
    const whale: StocktwitsUserSnapshot = { id: 0, followers: 1_000_000_000, post_count: 1_000_000 };
    const peers: StocktwitsUserSnapshot[] = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      followers: 100,
      post_count: 10,
    }));
    const group = [whale, ...peers];

    // The raw whale weight is far above any peer's; after winsorizing the
    // capped weight equals the p95 cap (which is the whale itself by
    // definition for n=21 — but the implementation must clip relative to the
    // group, not pass through the raw value).
    const rawWhale = reputationWeight(whale);
    const cappedWhale = reputationWeight(whale, group);

    // Strict cap: capped weight must be strictly less than the raw weight.
    expect(cappedWhale).toBeLessThan(rawWhale);
    // The cap is the p95 of the group's raw weights — which (with n=21) is
    // the 20th-ranked weight = a peer's weight (since the whale is rank 21).
    const peerWeight = reputationWeight(peers[0]);
    expect(cappedWhale).toBeCloseTo(peerWeight, 9);
  });

  // ── Test 3: weighted sentiment formula ─────────────────────────────────
  it('reputationWeightedSentiment = Σ(s_i × r_i) / Σ(r_i)', () => {
    // s ∈ {-1 bearish, +1 bullish}.
    const messages: StocktwitsScoredMessage[] = [
      { sentiment: 1,  reputation: 4 },
      { sentiment: -1, reputation: 1 },
      { sentiment: 1,  reputation: 5 },
    ];
    // (1*4 + -1*1 + 1*5) / (4 + 1 + 5) = 8/10 = 0.8
    expect(reputationWeightedSentiment(messages)).toBeCloseTo(0.8, 9);
  });

  // ── Test 4: fallback to naive count when all reputations null ─────────
  it('falls back to naive count when all users have null reputation', () => {
    const messages: StocktwitsScoredMessage[] = [
      { sentiment: 1,  reputation: null },
      { sentiment: -1, reputation: null },
      { sentiment: 1,  reputation: null },
    ];
    // Naive: (1 + -1 + 1) / 3 = 0.333…
    expect(reputationWeightedSentiment(messages)).toBeCloseTo(1 / 3, 9);
  });

  // ── Test 5: high-rep bullish post outweighs many low-rep bearish ──────
  it('single high-reputation bullish post outweighs many low-reputation bearish posts', () => {
    const messages: StocktwitsScoredMessage[] = [
      { sentiment: 1, reputation: 100 }, // one whale, bullish
      ...Array.from({ length: 50 }, () => ({ sentiment: -1 as const, reputation: 1 })),
    ];
    // Σ(s*r) = +100 + (-50) = +50; Σ(r) = 100 + 50 = 150 ⇒ +0.333…
    expect(reputationWeightedSentiment(messages)).toBeGreaterThan(0);
  });
});

describe('getUserReputation cache (Plan 19-C-03 / T-19-C-03-02)', () => {
  // ── Test 6: cache hit on second call within 24h ───────────────────────
  it('cache hit on second call for same user within 24h (fetcher called once)', async () => {
    const fetcher = vi.fn(async (_userId: number): Promise<StocktwitsUserSnapshot> => ({
      id: 42,
      followers: 1_000,
      post_count: 500,
    }));

    const a = await getUserReputation(42, fetcher);
    const b = await getUserReputation(42, fetcher);

    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  // ── Test 7: cache miss after 24h TTL ───────────────────────────────────
  it('cache miss after 24h TTL — fetcher called twice', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (_userId: number): Promise<StocktwitsUserSnapshot> => ({
      id: 42,
      followers: 1_000,
      post_count: 500,
    }));

    await getUserReputation(42, fetcher);
    // Advance 24h + 1 second.
    vi.advanceTimersByTime(86_401 * 1_000);
    await getUserReputation(42, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
