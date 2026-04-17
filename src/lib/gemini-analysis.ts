// src/lib/gemini-analysis.ts
// Gemini analysis service — calls Gemini via AI SDK + Vercel AI Gateway.
// Auth: VERCEL_OIDC_TOKEN auto-read from process.env (local) or injected by Vercel runtime (deployed).
// No provider import needed — plain model string 'google/gemini-3.0-flash' routes through AI Gateway.

import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import Firecrawl from '@mendable/firecrawl-js';
import { formatResearchBrief, extractNewsUrls } from '@/lib/research-brief';
import type { AnalysisResult, SourcePackage } from '@/lib/types';

// ---- Zod schema for structured Gemini output ----

export const AnalysisResultSchema = z.object({
  market_sentiment: z.enum(['bullish', 'neutral', 'bearish']),
  sentiment_reasoning: z.string(),
  bullish_signals: z.array(z.object({
    signal: z.string(),
    source_citation: z.string(),
  })).min(1).max(5),
  bearish_signals: z.array(z.object({
    signal: z.string(),
    source_citation: z.string(),
  })).min(1).max(5),
  assessment: z.object({
    buy_pct: z.number(),
    hold_pct: z.number(),
    sell_pct: z.number(),
    buy_rationale: z.string(),
    hold_rationale: z.string(),
    sell_rationale: z.string(),
  }),
  confidence_level: z.enum(['Low', 'Medium', 'High']),
  confidence_explanation: z.string(),
  price_target: z.string().optional().nullable(),
  sources_used: z.array(z.object({
    name: z.string(),
    key_fact: z.string(),
    url: z.string().optional(),
  })),
  source_warnings: z.array(z.string()).optional().default([]),
});

// ---- System prompt ----

export const SYSTEM_PROMPT = `You are a senior equity research analyst. Your task is to synthesize provided market data, news, analyst sentiment, and community discussion into a structured financial analysis.

CRITICAL RULES:
1. All signals must cite the specific source from the research brief — do not hallucinate claims without supporting data.
2. Produce exactly 5 bullish signals and exactly 5 bearish signals when data is sufficient; produce a minimum of 1 signal of each type if data is sparse.
3. buy_pct + hold_pct + sell_pct must sum to exactly 100.
4. price_target should be extracted from analyst consensus or target range in the research data. If unavailable, set to null.
5. Mark confidence_level as "Low" if data is sparse, contradictory, or covers fewer than 3 reliable sources.
6. source_citation in each signal must name the specific source (e.g., "Reuters, 2026-04-15" or "SEC 10-K filing" or "Reddit r/stocks sentiment").
7. This analysis is for research purposes only. Do not provide personalized investment advice.

Return your analysis as a structured JSON object matching the provided schema.`;

// ---- Prompt builder ----

/**
 * Assembles the Gemini user prompt from the research brief, news URLs, and optional
 * Firecrawl community sentiment content.
 */
export function buildUserPrompt(brief: string, newsUrls: string[], communityContent: string): string {
  let prompt = brief + '\n\n';
  if (newsUrls.length > 0) {
    prompt += '=== NEWS SOURCES ===\n';
    prompt += newsUrls.map(url => `- ${url}`).join('\n');
    prompt += '\n\n';
  }
  if (communityContent) {
    prompt += '=== COMMUNITY SENTIMENT ===\n';
    prompt += communityContent;
    prompt += '\n\n';
  }
  prompt += 'Analyze the ticker based on all research data above. Return the structured analysis.';
  return prompt;
}

// ---- Firecrawl community sentiment gatherer ----

/**
 * Searches for community discussion about the ticker using Firecrawl search.
 * Returns empty string if FIRECRAWL_API_KEY is absent.
 *
 * Uses search (not scrape) because we need URL discovery — the source package
 * contains source *names* ("Reddit r/investing"), not actual URLs.
 * Firecrawl search returns page content inline, so one call = discovery + extraction.
 * Targets Reddit, StockTwits, and Seeking Alpha for highest signal-to-noise ratio.
 * Limit 3 results = ~3 credits per run (efficient on free tier).
 */
export async function scrapeCommunitySentiment(ticker: string): Promise<string> {
  if (!process.env.FIRECRAWL_API_KEY) return '';
  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const query = `${ticker} stock discussion community sentiment site:reddit.com OR site:stocktwits.com OR site:seekingalpha.com`;
  try {
    const response = await fc.search(query, {
      limit: 3,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    } as Parameters<typeof fc.search>[1]);
    const results = (response as { results?: Array<{ markdown?: string; url?: string }> }).results ?? [];
    const pages = results
      .map(r => r.markdown ?? '')
      .filter(Boolean);
    return pages.join('\n\n---\n\n');
  } catch {
    return '';
  }
}

// ---- Market snapshot extractor ----

/**
 * Extracts a MarketSnapshot from a SourcePackage for embedding in the AnalysisResult.
 */
export function extractMarketSnapshot(pkg: SourcePackage) {
  return {
    price: pkg.market_data.price,
    percent_change_today: pkg.market_data.percent_change_today,
    market_cap: pkg.market_data.market_cap,
    fifty_two_week_high: pkg.market_data.fifty_two_week_high,
    fifty_two_week_low: pkg.market_data.fifty_two_week_low,
    pe_ratio: pkg.fundamentals.pe_ratio,
    eps: pkg.fundamentals.eps,
    revenue: pkg.fundamentals.revenue,
  };
}

// ---- Main analysis function ----

/**
 * Calls Gemini via AI SDK + Vercel AI Gateway and returns a fully typed AnalysisResult.
 * Auth: VERCEL_OIDC_TOKEN (auto-managed — never reference in application code per T-12-02-02).
 *
 * @param ticker - The ticker symbol (e.g., 'AAPL')
 * @param pkg - The assembled SourcePackage from the research pipeline
 * @param communityContent - Scraped community sentiment markdown (empty string if unavailable)
 */
export async function runGeminiAnalysis(
  ticker: string,
  pkg: SourcePackage,
  communityContent: string,
): Promise<AnalysisResult> {
  const brief = formatResearchBrief(pkg);
  const newsUrls = extractNewsUrls(pkg);
  const userPrompt = buildUserPrompt(brief, newsUrls, communityContent);

  try {
    const { output } = await generateText({
      model: 'google/gemini-3.0-flash',
      output: Output.object({ schema: AnalysisResultSchema }),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    return {
      ticker,
      company_name: pkg.company_name,
      analyzed_at: new Date().toISOString(),
      security_type: pkg.security_type,
      market_snapshot: extractMarketSnapshot(pkg),
      community_sentiment_available: communityContent.length > 0,
      source_warnings: output.source_warnings ?? [],
      market_sentiment: output.market_sentiment,
      sentiment_reasoning: output.sentiment_reasoning,
      bullish_signals: output.bullish_signals,
      bearish_signals: output.bearish_signals,
      assessment: output.assessment,
      confidence_level: output.confidence_level,
      confidence_explanation: output.confidence_explanation,
      price_target: output.price_target ?? null,
      sources_used: output.sources_used,
    };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      const rawText = (err as NoObjectGeneratedError).text?.slice(0, 200) ?? 'none';
      throw new Error(`Gemini returned unstructured response. Raw: ${rawText}`);
    }
    throw err;
  }
}
