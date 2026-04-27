import { describe, it, expect } from 'vitest';
import {
  ANCHORS,
  LARGE_POOL,
  MID_POOL,
  SMALL_POOL,
  getCurrentWatchlist,
} from '../ticker-watchlist';

describe('ticker-watchlist rotation', () => {
  it('always includes every anchor', () => {
    const list = getCurrentWatchlist(new Date('2026-04-26T12:00:00Z'));
    for (const a of ANCHORS) expect(list).toContain(a);
  });

  it('mixes anchors + large + mid + small', () => {
    const list = new Set(getCurrentWatchlist(new Date('2026-04-26T12:00:00Z')));
    const anyLarge = LARGE_POOL.some(t => list.has(t));
    const anyMid   = MID_POOL.some(t => list.has(t));
    const anySmall = SMALL_POOL.some(t => list.has(t));
    expect(anyLarge).toBe(true);
    expect(anyMid).toBe(true);
    expect(anySmall).toBe(true);
  });

  it('returns deduplicated tickers', () => {
    const list = getCurrentWatchlist(new Date('2026-04-26T12:00:00Z'));
    expect(new Set(list).size).toBe(list.length);
  });

  it('rotates the slice when the day changes', () => {
    const day1 = getCurrentWatchlist(new Date('2026-04-26T12:00:00Z'));
    const day2 = getCurrentWatchlist(new Date('2026-04-27T12:00:00Z'));
    // Anchors are common; the rotated slices should differ.
    const day1NonAnchors = day1.filter(t => !ANCHORS.includes(t));
    const day2NonAnchors = day2.filter(t => !ANCHORS.includes(t));
    expect(day1NonAnchors).not.toEqual(day2NonAnchors);
  });

  it('returns the same slice for the same day (idempotent within a day)', () => {
    const a = getCurrentWatchlist(new Date('2026-04-26T01:00:00Z'));
    const b = getCurrentWatchlist(new Date('2026-04-26T22:00:00Z'));
    expect(a).toEqual(b);
  });

  it('cycles through the full pool over time', () => {
    // 365 days of rotation should hit every ticker in each pool at least once.
    const seen = new Set<string>();
    for (let i = 0; i < 365; i++) {
      const d = new Date('2026-01-01T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      for (const t of getCurrentWatchlist(d)) seen.add(t);
    }
    for (const t of LARGE_POOL) expect(seen).toContain(t);
    for (const t of MID_POOL)   expect(seen).toContain(t);
    for (const t of SMALL_POOL) expect(seen).toContain(t);
  });

  it('every pool ticker is uppercase A-Z (no whitespace, no punctuation)', () => {
    const all = [...ANCHORS, ...LARGE_POOL, ...MID_POOL, ...SMALL_POOL];
    for (const t of all) expect(t).toMatch(/^[A-Z]{1,5}$/);
  });
});
