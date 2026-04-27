// src/lib/gemini-analysis.test.ts
// Vitest unit tests for scrapeCommunitySentiment and buildUserPrompt behaviors.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firecrawl before importing the module under test
vi.mock('@mendable/firecrawl-js', () => ({
  default: vi.fn(),
}));

// gemini-analysis.ts now imports engine-context (which imports @/lib/db).
// Stub the prisma client so vitest doesn't need a live DATABASE_URL.
vi.mock('@/lib/db', () => ({ prisma: {} }));

import Firecrawl from '@mendable/firecrawl-js';
import { scrapeCommunitySentiment, buildUserPrompt } from './gemini-analysis';

describe('scrapeCommunitySentiment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Test 1: returns empty result when FIRECRAWL_API_KEY is absent, without calling Firecrawl', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', '');
    const result = await scrapeCommunitySentiment('AAPL', 'Apple Inc.');
    expect(result).toEqual({
      pinnedContent: '',
      nicheContent: '',
      nicheUrls: [],
      pageCount: 0,
      mainstreamPageCount: 0,
      middlePageCount: 0,
      nichePageCount: 0,
    });
    expect(Firecrawl).not.toHaveBeenCalled();
  });

  it('Test 2: calls fc.scrape for pinned URLs and returns pinnedContent with scraped markdown', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key');
    // scrapeUrlWithFirecrawl drops content under 200 chars — pad markdown above that threshold.
    const longMarkdown = 'reddit post content '.repeat(20);
    const mockScrape = vi.fn().mockResolvedValue({ markdown: longMarkdown });
    (Firecrawl as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ scrape: mockScrape });

    const result = await scrapeCommunitySentiment('AAPL', 'Apple Inc.');
    expect(mockScrape).toHaveBeenCalled();
    const [url] = mockScrape.mock.calls[0];
    expect(url).toContain('AAPL');
    expect(result.pinnedContent).toContain('reddit post content');
  });

  it('Test 3: returns empty pinnedContent gracefully when fc.scrape throws', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key');
    const mockScrape = vi.fn().mockRejectedValue(new Error('scrape failed'));
    (Firecrawl as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ scrape: mockScrape });

    const result = await scrapeCommunitySentiment('AAPL', 'Apple Inc.');
    expect(result.pinnedContent).toBe('');
    expect(result.nicheContent).toBe('');
  });
});

describe('buildUserPrompt', () => {
  it('Test 4: includes COMMUNITY SENTIMENT section when communityContent is non-empty', () => {
    const result = buildUserPrompt('brief text', ['https://news.com'], 'reddit discussion content');
    expect(result).toContain('=== COMMUNITY SENTIMENT ===');
    expect(result).toContain('reddit discussion content');
  });

  it('Test 5: omits COMMUNITY SENTIMENT section when communityContent is empty string', () => {
    const result = buildUserPrompt('brief text', ['https://news.com'], '');
    expect(result).not.toContain('=== COMMUNITY SENTIMENT ===');
  });
});
