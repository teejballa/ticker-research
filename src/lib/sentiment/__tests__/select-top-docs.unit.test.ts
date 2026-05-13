// src/lib/sentiment/__tests__/select-top-docs.unit.test.ts
// Plan 20-B-01 Task 6 — RED→GREEN tests for the top-N doc selector.

import { describe, it, expect } from 'vitest';
import {
  selectTopDocs,
  TOP_NEWS,
  TOP_COMMUNITY,
  COST_CAP_DOCS_PER_TICKER,
  MAX_TEXT_CHARS,
} from '@/lib/sentiment/select-top-docs';
import type { SourcePackage, NewsItem } from '@/lib/types';

function makePkg(overrides: Partial<SourcePackage> = {}): SourcePackage {
  return {
    ticker: 'TEST',
    company_name: 'TEST',
    exchange: null,
    security_type: 'equity',
    assembled_at: new Date().toISOString(),
    market_data: { collected_at: new Date().toISOString(), price: null, volume: null, market_cap: null, fifty_two_week_high: null, fifty_two_week_low: null, percent_change_today: null, exchange: null },
    fundamentals: { collected_at: new Date().toISOString(), pe_ratio: null, eps: null, revenue: null, debt_to_equity: null, profit_margin: null },
    news: { collected_at: new Date().toISOString(), items: [] },
    analyst_sentiment: { collected_at: new Date().toISOString(), consensus: null, avg_price_target: null, analyst_count: null, recent_changes: [] },
    sec_filing_summary: { collected_at: new Date().toISOString(), most_recent_10k: null, most_recent_10q: null, filing_dates: { '10k': null, '10q': null } },
    social_sentiment: { collected_at: new Date().toISOString(), overall_tone: null, signals: [], sources_checked: [] },
    collection_errors: [],
    supplementary_market_data: { sources: [] },
    sentiment_intelligence: { collected_at: new Date().toISOString(), stocktwits_bull_pct: null, stocktwits_bear_pct: null, stocktwits_message_count: null, stocktwits_is_trending: null, reddit_tone: null, put_call_ratio: null, put_call_interpretation: null },
    ...overrides,
  };
}

function mkNews(i: number, daysAgo: number): NewsItem {
  const d = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    headline: `Headline ${i}`,
    url: `https://example.com/n/${i}`,
    published_date: d,
    source: 'TestWire',
  };
}

describe('selectTopDocs — constants exposed', () => {
  it('exports TOP_NEWS=20, TOP_COMMUNITY=10, total cap=30, MAX_TEXT_CHARS=2000', () => {
    expect(TOP_NEWS).toBe(20);
    expect(TOP_COMMUNITY).toBe(10);
    expect(COST_CAP_DOCS_PER_TICKER).toBe(30);
    expect(MAX_TEXT_CHARS).toBe(2000);
  });
});

describe('selectTopDocs — empty + small inputs', () => {
  it('empty package → []', () => {
    expect(selectTopDocs(makePkg())).toEqual([]);
  });

  it('5 news + no community → 5 docs (all news)', () => {
    const items = Array.from({ length: 5 }, (_, i) => mkNews(i, i));
    const pkg = makePkg({ news: { collected_at: new Date().toISOString(), items } });
    const result = selectTopDocs(pkg);
    expect(result.length).toBe(5);
    expect(result.every((d) => d.source === 'news')).toBe(true);
  });

  it('news without a url is filtered out', () => {
    const items: NewsItem[] = [
      { headline: 'no-url', url: '', published_date: new Date().toISOString(), source: 'TW' },
      mkNews(1, 0),
    ];
    const pkg = makePkg({ news: { collected_at: new Date().toISOString(), items } });
    const result = selectTopDocs(pkg);
    expect(result.length).toBe(1);
  });
});

describe('selectTopDocs — hard cap at 30 docs (20 news + 10 community)', () => {
  it('50 news + 20 community → 30 docs (20 news + 10 community)', () => {
    const items = Array.from({ length: 50 }, (_, i) => mkNews(i, i));
    const community = Array.from({ length: 20 }, (_, i) => ({
      message_id: `m-${i}`,
      body: `Body for ${i}`,
      source: 'reddit',
      upvotes: 100 - i,
      fetched_at: new Date(Date.now() - i * 3600_000).toISOString(),
    }));
    const pkg = makePkg({ news: { collected_at: new Date().toISOString(), items } }) as ReturnType<typeof makePkg> & { _raw_community_docs: typeof community };
    pkg._raw_community_docs = community;
    const result = selectTopDocs(pkg);
    expect(result.length).toBe(30);
    expect(result.filter((d) => d.source === 'news').length).toBe(20);
    expect(result.filter((d) => d.source === 'community').length).toBe(10);
  });

  it('news sorted by recency DESC (newest first)', () => {
    const items = [mkNews(0, 5), mkNews(1, 1), mkNews(2, 3)];
    const pkg = makePkg({ news: { collected_at: new Date().toISOString(), items } });
    const result = selectTopDocs(pkg);
    expect(result[0].text).toContain('Headline 1'); // daysAgo=1
    expect(result[1].text).toContain('Headline 2'); // daysAgo=3
    expect(result[2].text).toContain('Headline 0'); // daysAgo=5
  });

  it('community sorted by upvotes DESC; recency breaks ties', () => {
    const community = [
      { message_id: 'low', body: 'low', source: 'reddit', upvotes: 5, fetched_at: new Date().toISOString() },
      { message_id: 'high', body: 'high', source: 'reddit', upvotes: 100, fetched_at: new Date().toISOString() },
      { message_id: 'tied-old', body: 'tied-old', source: 'reddit', upvotes: 50, fetched_at: new Date(Date.now() - 86_400_000).toISOString() },
      { message_id: 'tied-new', body: 'tied-new', source: 'reddit', upvotes: 50, fetched_at: new Date().toISOString() },
    ];
    const pkg = makePkg() as ReturnType<typeof makePkg> & { _raw_community_docs: typeof community };
    pkg._raw_community_docs = community;
    const result = selectTopDocs(pkg);
    expect(result.length).toBe(4);
    expect(result.map((d) => d.text)).toEqual(['high', 'tied-new', 'tied-old', 'low']);
  });
});

describe('selectTopDocs — doc_id derivation', () => {
  it('news doc_id = first 16 chars of sha256(url) — deterministic across reruns', () => {
    const items = [mkNews(42, 0)];
    const pkg = makePkg({ news: { collected_at: new Date().toISOString(), items } });
    const a = selectTopDocs(pkg);
    const b = selectTopDocs(pkg);
    expect(a[0].doc_id).toBe(b[0].doc_id);
    expect(a[0].doc_id.length).toBe(16);
    expect(/^[0-9a-f]{16}$/.test(a[0].doc_id)).toBe(true);
  });

  it('community doc_id = `${source}:${message_id}`', () => {
    const community = [{ message_id: 'abc123', body: 'body', source: 'reddit', upvotes: 1 }];
    const pkg = makePkg() as ReturnType<typeof makePkg> & { _raw_community_docs: typeof community };
    pkg._raw_community_docs = community;
    const result = selectTopDocs(pkg);
    expect(result[0].doc_id).toBe('reddit:abc123');
  });
});

describe('selectTopDocs — text truncation', () => {
  it('community body longer than MAX_TEXT_CHARS is truncated', () => {
    const longBody = 'x'.repeat(MAX_TEXT_CHARS + 500);
    const community = [{ message_id: 'mlong', body: longBody, source: 'x', upvotes: 1 }];
    const pkg = makePkg() as ReturnType<typeof makePkg> & { _raw_community_docs: typeof community };
    pkg._raw_community_docs = community;
    const result = selectTopDocs(pkg);
    expect(result[0].text.length).toBe(MAX_TEXT_CHARS);
  });
});
