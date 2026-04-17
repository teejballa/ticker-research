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

  it('Test 1: returns empty string for empty URL list without calling Firecrawl', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key');
    const result = await scrapeCommunitySentiment([]);
    expect(result).toBe('');
    expect(Firecrawl).not.toHaveBeenCalled();
  });

  it('Test 2: returns empty string when FIRECRAWL_API_KEY is absent, without throwing', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', '');
    const result = await scrapeCommunitySentiment(['https://reddit.com/r/stocks/1', 'https://stocktwits.com/2']);
    expect(result).toBe('');
    expect(Firecrawl).not.toHaveBeenCalled();
  });

  it('Test 3: returns only successful content when one URL fails (Promise.allSettled)', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key');
    const mockScrape = vi.fn()
      .mockResolvedValueOnce({ markdown: 'good content' })
      .mockRejectedValueOnce(new Error('scrape failed'));
    (Firecrawl as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ scrape: mockScrape });

    const result = await scrapeCommunitySentiment(['https://url1.com', 'https://url2.com']);
    expect(result).toContain('good content');
    expect(result).not.toContain('scrape failed');
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
