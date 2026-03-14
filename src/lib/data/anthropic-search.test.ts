// src/lib/data/anthropic-search.test.ts
// Tests mock the Anthropic SDK — no real API calls or costs.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK before any imports.
// The mocked client's messages.create returns a graceful response shape.
// Functions catch errors and return typed fallbacks — tests verify the shape.
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [
      { type: 'text', text: '[]' },
    ],
  });
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

describe('fetchNews', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns NewsSection with collected_at and items array', async () => {
    const { fetchNews } = await import('./anthropic-search');
    const result = await fetchNews('AAPL');
    expect(result).toHaveProperty('collected_at');
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
  });
});

describe('fetchAnalystSentiment', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns AnalystSentimentSection with collected_at and consensus field', async () => {
    const { fetchAnalystSentiment } = await import('./anthropic-search');
    const result = await fetchAnalystSentiment('AAPL');
    expect(result).toHaveProperty('collected_at');
    expect('consensus' in result).toBe(true);
    expect('recent_changes' in result).toBe(true);
    expect(Array.isArray(result.recent_changes)).toBe(true);
  });
});

describe('fetchSecFilingSummary', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns SecFilingSummarySection with collected_at and filing_dates', async () => {
    const { fetchSecFilingSummary } = await import('./anthropic-search');
    const result = await fetchSecFilingSummary('AAPL');
    expect(result).toHaveProperty('collected_at');
    expect('most_recent_10k' in result).toBe(true);
    expect('filing_dates' in result).toBe(true);
    expect(result.filing_dates).toHaveProperty('10k');
    expect(result.filing_dates).toHaveProperty('10q');
  });
});

describe('fetchSocialSentiment', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns SocialSentimentSection with collected_at and overall_tone', async () => {
    const { fetchSocialSentiment } = await import('./anthropic-search');
    const result = await fetchSocialSentiment('AAPL');
    expect(result).toHaveProperty('collected_at');
    expect('overall_tone' in result).toBe(true);
    expect(Array.isArray(result.signals)).toBe(true);
    expect(Array.isArray(result.sources_checked)).toBe(true);
  });
});
