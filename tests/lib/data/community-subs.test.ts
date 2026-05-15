/**
 * Plan 30.1-01 — Frozen-contract tests for the COMMUNITY_SUBS roster (D-10, D-11).
 *
 * Locks the roster shape + size so plan 30.1-03 (orchestrator) can rely on a
 * known set when fan-out compute lands. The per-ticker niche sub `r/{TICKER}`
 * is appended by the orchestrator at scan time — it MUST NOT live in this list.
 */
import { describe, it, expect } from 'vitest';
import { COMMUNITY_SUBS, type CommunitySubConfig } from '@/lib/data/community-subs';

const EXPECTED_NAMES = [
  'wallstreetbets',
  'stocks',
  'investing',
  'StockMarket',
  'options',
  'Daytrading',
  'SecurityAnalysis',
  'algotrading',
  'ValueInvesting',
  'dividends',
  'Bogleheads',
  'FinancialIndependence',
  'Vitards',
  'pennystocks',
  'Superstonk',
  'biotech_stocks',
] as const;

describe('COMMUNITY_SUBS — Plan 30.1-01 frozen roster (D-10)', () => {
  it('exposes exactly 16 entries (r/{TICKER} is appended at scan time, not here)', () => {
    expect(COMMUNITY_SUBS.length).toBe(16);
  });

  it('every entry has all four typed keys with correct primitive types', () => {
    for (const sub of COMMUNITY_SUBS) {
      const _typeCheck: CommunitySubConfig = sub; // type-level assertion
      void _typeCheck;
      expect(typeof sub.name).toBe('string');
      expect(sub.name.length).toBeGreaterThan(0);
      expect(['mainstream', 'middle', 'niche']).toContain(sub.community_type);
      expect(typeof sub.audience).toBe('string');
      expect(sub.audience.length).toBeGreaterThan(0);
      expect(typeof sub.theme).toBe('string');
      expect(sub.theme.length).toBeGreaterThan(0);
    }
  });

  it('names match the spec literally and in order (D-10)', () => {
    expect(COMMUNITY_SUBS.map((s) => s.name)).toEqual([...EXPECTED_NAMES]);
  });

  it('no duplicates in the roster', () => {
    const names = COMMUNITY_SUBS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('roster name does NOT contain a leading "r/" prefix', () => {
    for (const sub of COMMUNITY_SUBS) {
      expect(sub.name.startsWith('r/')).toBe(false);
    }
  });
});
