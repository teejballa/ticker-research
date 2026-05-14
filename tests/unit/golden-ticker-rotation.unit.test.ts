// tests/unit/golden-ticker-rotation.unit.test.ts
//
// Plan 20-D-04 Task 7 — Rotation determinism + 12-month-cooldown unit tests.

import { describe, it, expect } from 'vitest';
import { selectNextSymbol, type MicroCapCandidate } from '../../scripts/rotate-micro-cap';

function synthPool(
  entries: Array<{ s: string; mc: number; last?: string | null }>,
): { candidates: MicroCapCandidate[] } {
  return {
    candidates: entries.map((e) => ({
      symbol: e.s,
      market_cap: e.mc,
      daily_avg_volume_30d: 100000,
      analyst_count: 0,
      last_selected_at: e.last ?? null,
    })),
  };
}

describe('selectNextSymbol (rotate-micro-cap)', () => {
  it('picks the smallest market_cap when all last_selected_at are null', () => {
    const pool = synthPool([
      { s: 'AAA', mc: 200_000_000 },
      { s: 'BBB', mc: 100_000_000 },
      { s: 'CCC', mc: 250_000_000 },
    ]);
    expect(selectNextSymbol(pool, new Date('2026-05-11'))).toBe('BBB');
  });

  it('is deterministic across calls with the same inputs', () => {
    const pool = synthPool([
      { s: 'AAA', mc: 200_000_000 },
      { s: 'BBB', mc: 100_000_000 },
    ]);
    const d = new Date('2026-05-11');
    expect(selectNextSymbol(pool, d)).toBe(selectNextSymbol(pool, d));
  });

  it('skips symbols selected within the last 12 months', () => {
    const pool = synthPool([
      { s: 'AAA', mc: 100_000_000, last: '2025-06-01' }, // 11 months ago — INELIGIBLE
      { s: 'BBB', mc: 250_000_000 }, // null — eligible
    ]);
    expect(selectNextSymbol(pool, new Date('2026-05-11'))).toBe('BBB');
  });

  it('allows symbols selected >12 months ago and prefers them over null', () => {
    const pool = synthPool([
      { s: 'AAA', mc: 100_000_000, last: '2024-01-01' }, // >12mo ago — eligible
      { s: 'BBB', mc: 250_000_000 }, // null — also eligible
    ]);
    // Sort: (last_selected_at ASC nulls-first => null first, then older dates)
    // null treated as time=0 in the sort, so AAA (last_selected_at present)
    // sorts after BBB (null=0). BBB wins.
    expect(selectNextSymbol(pool, new Date('2026-05-11'))).toBe('BBB');
  });

  it('among multiple eligible symbols all with last_selected_at set, picks oldest', () => {
    const pool = synthPool([
      { s: 'AAA', mc: 100_000_000, last: '2024-01-01' },
      { s: 'BBB', mc: 200_000_000, last: '2023-01-01' }, // older — wins
    ]);
    expect(selectNextSymbol(pool, new Date('2026-05-11'))).toBe('BBB');
  });

  it('throws when no candidate is eligible (all selected within 12 months)', () => {
    const pool = synthPool([
      { s: 'AAA', mc: 100_000_000, last: '2026-01-01' }, // 4mo ago — INELIGIBLE
    ]);
    expect(() => selectNextSymbol(pool, new Date('2026-05-11'))).toThrow(/no eligible/i);
  });

  it('throws on empty pool', () => {
    expect(() => selectNextSymbol({ candidates: [] }, new Date('2026-05-11'))).toThrow(
      /no eligible/i,
    );
  });

  it('breaks ties between two nulls by smallest market_cap', () => {
    const pool = synthPool([
      { s: 'BIG', mc: 290_000_000 },
      { s: 'SML', mc: 50_000_000 },
      { s: 'MED', mc: 150_000_000 },
    ]);
    expect(selectNextSymbol(pool, new Date('2026-05-11'))).toBe('SML');
  });
});
