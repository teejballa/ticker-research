/**
 * Plan 20-Z-03 — cost-estimators pinned-value test (T-20-Z-03-03 quarterly review).
 *
 * Each constant pinned with its citation. Editing the constants WILL fail this
 * suite — force the editor to update both the value and this assertion.
 */
import { describe, it, expect } from 'vitest';
import { COST_PER_CALL_USD, GEMINI_TOKEN_RATES } from '@/lib/telemetry/cost-estimators';

describe('COST_PER_CALL_USD — pinned per-provider rates (T-20-Z-03-03 quarterly review)', () => {
  it('anthropic-search = $0.01/call (https://docs.anthropic.com/.../web-search-tool)', () => {
    expect(COST_PER_CALL_USD['anthropic-search']).toBe(0.01);
  });
  it('firecrawl = $0.001/call (https://www.firecrawl.dev/pricing)', () => {
    expect(COST_PER_CALL_USD['firecrawl']).toBe(0.001);
  });
  it('finbert-hf = $0.0001/call (HF $0.033/hr CPU amortized)', () => {
    expect(COST_PER_CALL_USD['finbert-hf']).toBe(0.0001);
  });
  it.each(['yahoo', 'polygon', 'finnhub', 'stocktwits', 'apewisdom', 'gemini'] as const)(
    '%s = $0/call (free-tier or token-priced)',
    (id) => {
      expect(COST_PER_CALL_USD[id]).toBe(0);
    },
  );

  // Plan 30.1 — Reddit OAuth app-only client_credentials grant (100 QPM ceiling,
  // free; UA: Cipher/1.0 per D-06). Citation: https://github.com/reddit-archive/reddit/wiki/API
  it('reddit = $0/call (OAuth app-only, 100 QPM ceiling)', () => {
    expect(COST_PER_CALL_USD['reddit']).toBe(0);
  });

  // Plan 30.1 — HackerNews Algolia public search API (free, no auth).
  // Citation: https://hn.algolia.com/api
  it('hackernews = $0/call (Algolia public search, no auth)', () => {
    expect(COST_PER_CALL_USD['hackernews']).toBe(0);
  });
});

describe('GEMINI_TOKEN_RATES — pinned 2026-Q1 (https://ai.google.dev/pricing)', () => {
  it('input = $0.000125/token', () => {
    expect(GEMINI_TOKEN_RATES.input).toBe(0.000125);
  });
  it('output = $0.000375/token', () => {
    expect(GEMINI_TOKEN_RATES.output).toBe(0.000375);
  });
});
