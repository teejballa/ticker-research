// src/lib/gemini-analysis.ts
// Gemini analysis service — calls Gemini via AI SDK + Vercel AI Gateway.
// Auth: VERCEL_OIDC_TOKEN auto-read from process.env (local) or injected by Vercel runtime (deployed).
// No provider import needed — plain model string 'google/gemini-3-flash' routes through AI Gateway.

import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import Firecrawl from '@mendable/firecrawl-js';
import { formatResearchBrief, extractNewsUrls } from '@/lib/research-brief';
import type { AnalysisResult, SourcePackage } from '@/lib/types';

// ---- Zod schema for structured Gemini output ----

const CatalystEventSchema = z.object({
  event: z.string(),
  timing: z.string(),
  impact: z.enum(['positive', 'negative', 'uncertain']),
});

export const AnalysisResultSchema = z.object({
  // Wall Street report sections
  executive_summary: z.string(),
  investment_thesis: z.string(),
  key_risks: z.string(),
  valuation_context: z.string(),
  catalyst_watch: z.array(CatalystEventSchema).optional().default([]),

  // Core analysis (existing)
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

export const SYSTEM_PROMPT = `You are a senior equity research analyst at a bulge-bracket investment bank. Synthesize the provided market data, fundamentals, news, analyst sentiment, SEC filings, supplementary data, and community discussion into a Wall Street-grade structured research report.

REQUIRED OUTPUT SECTIONS:

executive_summary: One paragraph (4-6 sentences) encapsulating the investment case, current market position, key fundamental and catalytic drivers, and overall analytical stance. Write this as the opening paragraph of a Goldman Sachs or Morgan Stanley research note — precise, professional, conviction-driven.

investment_thesis: 2-3 sentences articulating the bull case. Lead with the single most compelling fundamental or catalytic driver. Be specific — cite numbers and sources.

key_risks: 2-3 sentences articulating the bear case. Focus on the most credible risks that could impair the investment thesis. Be specific — cite numbers and sources.

valuation_context: 1-2 sentences assessing whether the stock appears cheap, fairly valued, or expensive. Reference the P/E ratio vs historical averages, vs sector, and compare current price to analyst consensus price target to derive premium or discount percentage.

catalyst_watch: Array of 2-4 upcoming events that could materially move the stock (earnings dates, product launches, regulatory decisions, macro catalysts, analyst events). Each entry must include: event name, expected timing, and directional impact (positive/negative/uncertain).

market_sentiment: 'bullish', 'neutral', or 'bearish' — your overall analytical stance.

sentiment_reasoning: 2-3 sentences supporting the market_sentiment verdict. Tie to specific data points.

bullish_signals: Exactly 5 specific, evidence-backed growth catalysts when data is sufficient (minimum 1 if data is sparse). Each signal must be a full sentence with specific numbers or quotes. source_citation must name the exact source (e.g., "Finnhub fundamentals: ROE 145%" or "Reuters Apr 15 2026" or "SEC 10-K filing Oct 2025").

bearish_signals: Exactly 5 specific, evidence-backed risk vectors when data is sufficient (minimum 1 if data is sparse). Same citation standards as bullish_signals.

assessment: buy_pct + hold_pct + sell_pct MUST sum to exactly 100. Rationale for each should be 1-2 sentences tied to the thesis.

confidence_level: 'Low' if fewer than 3 reliable data sources; 'Medium' if 3-5; 'High' if 6 or more.

price_target: Extract from analyst consensus in the research brief. Format as "$X" or "$X–$Y range". Null if not present in the data.

sources_used: List every distinct data source that informed this analysis with a key fact extracted from it. Minimum 5 sources when data is available.

CRITICAL RULES:
1. All claims must be grounded in the provided research data — cite specific sources, never hallucinate.
2. buy_pct + hold_pct + sell_pct must sum to exactly 100.
3. Use professional financial language throughout: "likely", "expected", "data suggests" — avoid "may" or "might" without qualification.
4. If supplementary data (Finnhub, Polygon) is present, use it to enrich valuation_context, bullish_signals, and bearish_signals.
5. This analysis is for research purposes only. Do not provide personalized investment advice.

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
 * Auth: VERCEL_OIDC_TOKEN (auto-managed by Vercel runtime — never reference in application code).
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
      model: 'google/gemini-3-flash',
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
      executive_summary: output.executive_summary,
      investment_thesis: output.investment_thesis,
      key_risks: output.key_risks,
      valuation_context: output.valuation_context,
      catalyst_watch: output.catalyst_watch ?? [],
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
