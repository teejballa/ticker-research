// src/lib/gemini-analysis.test.ts
// Vitest unit tests for scrapeCommunitySentiment and buildUserPrompt behaviors.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firecrawl before importing the module under test
vi.mock('@mendable/firecrawl-js', () => ({
  default: vi.fn(),
}));

import Firecrawl from '@mendable/firecrawl-js';
import { scrapeCommunitySentiment, buildUserPrompt } from './gemini-analysis';

describe('scrapeCommunitySentiment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Test 1: returns empty string when FIRECRAWL_API_KEY is absent, without calling Firecrawl', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', '');
    const result = await scrapeCommunitySentiment('AAPL');
    expect(result).toBe('');
    expect(Firecrawl).not.toHaveBeenCalled();
  });

  it('Test 2: calls fc.search with a query containing the ticker and returns joined markdown', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key');
    const mockSearch = vi.fn().mockResolvedValue({
      results: [
        { markdown: 'reddit post content', url: 'https://reddit.com/r/stocks/1' },
        { markdown: 'stocktwits content', url: 'https://stocktwits.com/2' },
      ],
    });
    (Firecrawl as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

    const result = await scrapeCommunitySentiment('AAPL');
    expect(mockSearch).toHaveBeenCalledOnce();
    const [query] = mockSearch.mock.calls[0];
    expect(query).toContain('AAPL');
    expect(result).toContain('reddit post content');
    expect(result).toContain('stocktwits content');
  });

  it('Test 3: returns empty string gracefully when fc.search throws', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key');
    const mockSearch = vi.fn().mockRejectedValue(new Error('search failed'));
    (Firecrawl as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ search: mockSearch });

    const result = await scrapeCommunitySentiment('AAPL');
    expect(result).toBe('');
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
