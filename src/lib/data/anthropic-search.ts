// src/lib/data/anthropic-search.ts
// Anthropic web search data collection functions.
// Uses the web_search_20250305 tool via Anthropic Messages API.
// DATA-03: news, DATA-04: SEC filings, DATA-05: analyst ratings, DATA-06: social sentiment.
// SECURITY: ANTHROPIC_API_KEY is read from process.env by the Anthropic SDK automatically.
//           This file is server-only — never import from client components.

import Anthropic from '@anthropic-ai/sdk';
import type {
  NewsSection,
  AnalystSentimentSection,
  SecFilingSummarySection,
  SocialSentimentSection,
} from '@/lib/types';

const client = new Anthropic();
// Anthropic SDK reads ANTHROPIC_API_KEY from process.env automatically.
// Do not pass apiKey manually — keeps the key out of source code.

// Extract the final text content block from an Anthropic response
function extractTextContent(response: Anthropic.Message): string {
  const textBlock = response.content
    .filter((block) => block.type === 'text')
    .pop();
  return textBlock && textBlock.type === 'text' ? textBlock.text : '';
}

// Parse JSON from model response, return null on failure
function parseJsonFromResponse<T>(text: string): T | null {
  // Model may wrap JSON in markdown code fences — strip them
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

// DATA-03: Recent news headlines (past 30 days)
export async function fetchNews(ticker: string): Promise<NewsSection> {
  const collected_at = new Date().toISOString();
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{
        role: 'user',
        content: `Search for recent news headlines about ${ticker} stock from the past 30 days.
Return a JSON array (no markdown, just raw JSON) of objects with these fields:
{ "headline": string, "url": string, "published_date": "YYYY-MM-DD", "source": string }
Focus on: earnings reports, analyst upgrades/downgrades, product launches, regulatory events.
Only include articles from the last 30 days with clear publication dates.
Return an empty array [] if no relevant news is found.`,
      }],
    });

    const text = extractTextContent(response);
    const parsed = parseJsonFromResponse<Array<{ headline: string; url: string; published_date: string; source: string }>>(text);

    return {
      collected_at,
      items: parsed ?? [],
    };
  } catch (err) {
    return {
      collected_at,
      items: [],
      error: err instanceof Error ? err.message : 'fetchNews failed',
    };
  }
}

// DATA-05: Analyst ratings and consensus
export async function fetchAnalystSentiment(ticker: string): Promise<AnalystSentimentSection> {
  const collected_at = new Date().toISOString();
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{
        role: 'user',
        content: `Search for current analyst ratings and price targets for ${ticker} stock.
Return a JSON object (no markdown, raw JSON only):
{
  "consensus": "Buy" | "Hold" | "Sell" | null,
  "avg_price_target": number | null,
  "analyst_count": number | null,
  "recent_changes": [{ "analyst": string, "firm": string, "action": string, "date": "YYYY-MM-DD" }]
}
Focus on: Wall Street consensus rating, average price target, recent upgrades/downgrades in the past 30 days.`,
      }],
    });

    const text = extractTextContent(response);
    const parsed = parseJsonFromResponse<{
      consensus: 'Buy' | 'Hold' | 'Sell' | null;
      avg_price_target: number | null;
      analyst_count: number | null;
      recent_changes: Array<{ analyst: string; firm: string; action: string; date: string }>;
    }>(text);

    return {
      collected_at,
      consensus: parsed?.consensus ?? null,
      avg_price_target: parsed?.avg_price_target ?? null,
      analyst_count: parsed?.analyst_count ?? null,
      recent_changes: parsed?.recent_changes ?? [],
    };
  } catch (err) {
    return {
      collected_at,
      consensus: null,
      avg_price_target: null,
      analyst_count: null,
      recent_changes: [],
      error: err instanceof Error ? err.message : 'fetchAnalystSentiment failed',
    };
  }
}

// DATA-04: SEC filing summaries (10-K and 10-Q key points)
export async function fetchSecFilingSummary(ticker: string): Promise<SecFilingSummarySection> {
  const collected_at = new Date().toISOString();
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{
        role: 'user',
        content: `Search for the most recent SEC 10-K and 10-Q filings for ${ticker}.
Return a JSON object (no markdown, raw JSON only):
{
  "most_recent_10k": string | null,
  "most_recent_10q": string | null,
  "filing_dates": { "10k": "YYYY-MM-DD" | null, "10q": "YYYY-MM-DD" | null }
}
For most_recent_10k and most_recent_10q: write a 2-3 paragraph summary of key financial highlights,
risks, and business developments from the filing. Return null if the filing cannot be found.`,
      }],
    });

    const text = extractTextContent(response);
    const parsed = parseJsonFromResponse<{
      most_recent_10k: string | null;
      most_recent_10q: string | null;
      filing_dates: { '10k': string | null; '10q': string | null };
    }>(text);

    return {
      collected_at,
      most_recent_10k: parsed?.most_recent_10k ?? null,
      most_recent_10q: parsed?.most_recent_10q ?? null,
      filing_dates: parsed?.filing_dates ?? { '10k': null, '10q': null },
    };
  } catch (err) {
    return {
      collected_at,
      most_recent_10k: null,
      most_recent_10q: null,
      filing_dates: { '10k': null, '10q': null },
      error: err instanceof Error ? err.message : 'fetchSecFilingSummary failed',
    };
  }
}

// DATA-06: Social/media sentiment signals
export async function fetchSocialSentiment(ticker: string): Promise<SocialSentimentSection> {
  const collected_at = new Date().toISOString();
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{
        role: 'user',
        content: `Search for social media and financial press sentiment about ${ticker} stock.
Look at Reddit (r/investing, r/stocks, r/wallstreetbets), Stocktwits, and financial news tone.
Return a JSON object (no markdown, raw JSON only):
{
  "overall_tone": "bullish" | "bearish" | "neutral" | null,
  "signals": ["signal 1", "signal 2", "..."],
  "sources_checked": ["Reddit r/investing", "Stocktwits", "..."]
}
Signals should be specific observations like "high call option activity" or "bullish momentum posts increasing".
Return null for overall_tone if sentiment is unclear or insufficient data.`,
      }],
    });

    const text = extractTextContent(response);
    const parsed = parseJsonFromResponse<{
      overall_tone: 'bullish' | 'bearish' | 'neutral' | null;
      signals: string[];
      sources_checked: string[];
    }>(text);

    return {
      collected_at,
      overall_tone: parsed?.overall_tone ?? null,
      signals: parsed?.signals ?? [],
      sources_checked: parsed?.sources_checked ?? [],
    };
  } catch (err) {
    return {
      collected_at,
      overall_tone: null,
      signals: [],
      sources_checked: [],
      error: err instanceof Error ? err.message : 'fetchSocialSentiment failed',
    };
  }
}
