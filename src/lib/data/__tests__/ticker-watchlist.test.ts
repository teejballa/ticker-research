import { describe, it, expect } from 'vitest';
import {
  ANCHORS,
  LARGE_POOL,
  MID_POOL,
  SMALL_POOL,
  LARGE_BY_SECTOR,
  MID_BY_SECTOR,
  SMALL_BY_SECTOR,
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

  it('rotates non-anchor slice between consecutive weeks', () => {
    const w1 = getCurrentWatchlist(new Date('2026-04-26T12:00:00Z')).filter(t => !ANCHORS.includes(t));
    const w2 = getCurrentWatchlist(new Date('2026-05-03T12:00:00Z')).filter(t => !ANCHORS.includes(t));
    expect(w1).not.toEqual(w2);
  });

  it('rotates non-anchor slice between consecutive months', () => {
    const m1 = getCurrentWatchlist(new Date('2026-04-15T12:00:00Z')).filter(t => !ANCHORS.includes(t));
    const m2 = getCurrentWatchlist(new Date('2026-05-15T12:00:00Z')).filter(t => !ANCHORS.includes(t));
    expect(m1).not.toEqual(m2);
  });

  it('hits at least 5 distinct sectors across the non-anchor slice each cycle', () => {
    const days = ['2026-04-26', '2026-05-15', '2026-06-04', '2026-07-22', '2026-09-10'];
    const sectorOf = (ticker: string): string | null => {
      for (const p of [...LARGE_BY_SECTOR, ...MID_BY_SECTOR, ...SMALL_BY_SECTOR]) {
        if (p.tickers.includes(ticker)) return p.sector;
      }
      return null;
    };
    for (const d of days) {
      const list = getCurrentWatchlist(new Date(`${d}T12:00:00Z`)).filter(t => !ANCHORS.includes(t));
      const sectors = new Set(list.map(sectorOf).filter((s): s is string => s !== null));
      expect(sectors.size).toBeGreaterThanOrEqual(5);
    }
  });

  it('covers every sector pool over a 60-day window', () => {
    const seenSectors = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const d = new Date('2026-04-01T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      const list = getCurrentWatchlist(d);
      for (const t of list) {
        for (const p of [...LARGE_BY_SECTOR, ...MID_BY_SECTOR, ...SMALL_BY_SECTOR]) {
          if (p.tickers.includes(t)) seenSectors.add(p.sector);
        }
      }
    }
    const allSectors = new Set([
      ...LARGE_BY_SECTOR.map(p => p.sector),
      ...MID_BY_SECTOR.map(p => p.sector),
      ...SMALL_BY_SECTOR.map(p => p.sector),
    ]);
    for (const s of allSectors) expect(seenSectors).toContain(s);
  });
});
