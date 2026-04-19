// src/lib/gemini-analysis.ts
// Gemini analysis service — calls Gemini via AI SDK + Vercel AI Gateway.
// Auth: VERCEL_OIDC_TOKEN auto-read from process.env (local) or injected by Vercel runtime (deployed).
// No provider import needed — plain model string 'google/gemini-3-flash' routes through AI Gateway.

import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import Firecrawl from '@mendable/firecrawl-js';
import Anthropic from '@anthropic-ai/sdk';
import { formatResearchBrief, extractNewsUrls } from '@/lib/research-brief';
import type { AnalysisResult, SourcePackage } from '@/lib/types';

const anthropicClient = new Anthropic();
// Reads ANTHROPIC_API_KEY from process.env automatically.

// Tracks community pages scraped in the most recent scrapeCommunitySentiment() call.
// Set before returning — read by runGeminiAnalysis() immediately after the call.
let _lastCommunityScrapePageCount = 0;

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
  business_description: z.string().optional().default(''),
  financial_analysis: z.string().optional().default(''),
  competitive_landscape: z.string().optional().default(''),
  future_projection: z.string().optional().default(''),
  community_sources_scraped: z.number().optional(),
  sentiment_intelligence_summary: z.object({
    stocktwits_bull_pct: z.number().nullable().optional(),
    stocktwits_bear_pct: z.number().nullable().optional(),
    stocktwits_message_count: z.number().nullable().optional(),
    stocktwits_is_trending: z.boolean().nullable().optional(),
    put_call_ratio: z.number().nullable().optional(),
    put_call_interpretation: z.enum(['bullish', 'bearish', 'neutral']).nullable().optional(),
  }).optional(),
});

// ---- System prompt ----

export const SYSTEM_PROMPT = `You are a senior equity research analyst at a bulge-bracket investment bank. Synthesize the provided market data, fundamentals, news, analyst sentiment, SEC filings, supplementary data, and community discussion into a Wall Street-grade structured research report. The goal is a report a serious investor can read and genuinely understand the company, its financial position, competitive dynamics, and investment merits — not a surface-level summary.

REQUIRED OUTPUT SECTIONS:

executive_summary: Opening paragraph of 6-8 sentences that sets the full context for the report. Cover: what the company does and its market position, the current fundamental picture (revenue trajectory, profitability, key metrics), the primary investment debate (bull vs bear), the sentiment and analyst picture, and your overall analytical stance with conviction. An investor who reads only this section should understand the full situation.

business_description: 3-4 sentences describing the company's business in concrete terms. Cover: primary revenue streams and their approximate mix, the business model (how it makes money), key customer segments or end markets, and geographic footprint if relevant. Write from first principles — assume the reader knows finance but has never analyzed this company. Be specific with what the data supports.

financial_analysis: 4-5 sentences analyzing the financial story. Cover: revenue growth trajectory with specific rates if available, gross margin and operating margin levels and their direction (expanding/compressing), free cash flow generation or burn, debt load and coverage, and any notable financial inflection points visible in the data. Lead with the most important financial narrative — is this a growth story, a margin recovery, a turnaround, or a cash cow? Cite specific numbers from the research data.

competitive_landscape: 3-4 sentences on competitive position. Name the primary competitors and how this company is positioned against them. Identify the sustainable competitive advantage (moat) if one exists — or the absence of one. Note any competitive threats, disruption risk, or market share dynamics visible in the data. Be specific — use names and numbers where the data supports it.

investment_thesis: A full paragraph of 5-7 sentences articulating the bull case. Lead with the single most compelling driver, then build the supporting evidence: specific financial metrics, market opportunity sizing, competitive advantages, catalysts on the horizon, and why this moment is the right time to own the stock. Cite specific numbers throughout — price targets, growth rates, margins, multiples.

key_risks: A full paragraph of 5-7 sentences articulating the bear case. Cover the most credible risks: valuation risk if the stock is expensive, execution risk if strategy is unproven, competitive threats, macro headwinds, regulatory exposure, balance sheet concerns. Be specific — generic risks like "competition" are not enough without naming the competitor and the threat.

valuation_context: 3-4 sentences on whether the stock is cheap, fairly valued, or expensive. Compare the P/E ratio to historical averages and sector peers if available. Calculate the premium or discount to the analyst consensus price target. State a clear valuation verdict with the supporting math.

catalyst_watch: Array of 2-4 upcoming events that could materially move the stock. Each entry: event name, expected timing, directional impact (positive/negative/uncertain).

market_sentiment: 'bullish', 'neutral', or 'bearish' — your overall analytical stance.

sentiment_reasoning: 3-4 sentences supporting the market_sentiment verdict. Tie directly to specific data points: price action, analyst consensus, community tone, options positioning. Explain the weight of evidence.

bullish_signals: Exactly 5 specific, evidence-backed growth catalysts when data is sufficient (minimum 1 if data is sparse). Each signal must be a full sentence with specific numbers or quotes. source_citation must name the exact source (e.g., "Finnhub fundamentals: ROE 145%" or "Reuters Apr 15 2026" or "SEC 10-K filing Oct 2025").

bearish_signals: Exactly 5 specific, evidence-backed risk vectors when data is sufficient (minimum 1 if data is sparse). Same citation standards as bullish_signals.

assessment: buy_pct + hold_pct + sell_pct MUST sum to exactly 100. Rationale for each: 2-3 sentences tied to the thesis and risk/reward.

confidence_level: 'Low' if fewer than 3 reliable data sources; 'Medium' if 3-5; 'High' if 6 or more.

price_target: Extract from analyst consensus in the research brief. Format as "$X" or "$X–$Y range". Null if not present in the data.

sources_used: List every distinct data source that informed this analysis with a key fact extracted from it. Minimum 5 sources when data is available.

future_projection: 3-4 sentences forward-looking outlook synthesizing ALL available signals: StockTwits retail sentiment, options put/call ratio, community discussion tone, price target vs current price, upcoming catalysts, fundamental trends. Be specific — cite data points. This is the capstone directional statement of the report.

sentiment_intelligence_summary: Echo back the structured sentiment signals from the SENTIMENT INTELLIGENCE section exactly as provided. Do not fabricate. Return null for the entire object if the section is absent or all values are null.

CRITICAL RULES:
1. All claims must be grounded in the provided research data — cite specific sources, never hallucinate.
2. buy_pct + hold_pct + sell_pct must sum to exactly 100.
3. Use professional financial language throughout. Be direct and conviction-driven.
4. If supplementary data (Finnhub, Polygon) is present, use it to enrich valuation_context, financial_analysis, bullish_signals, and bearish_signals.
5. This analysis is for research purposes only. Do not provide personalized investment advice.
6. future_projection must incorporate StockTwits sentiment percentages and options put/call ratio when non-null.
7. sentiment_intelligence_summary must echo exact numeric values from the SENTIMENT INTELLIGENCE section — never invent numbers.
8. business_description, financial_analysis, and competitive_landscape must be substantive — do not produce one-sentence answers. These sections give the reader genuine understanding of the company.

Return your analysis as a structured JSON object matching the provided schema.`;

// ---- Prompt builder ----

/**
 * Assembles the Gemini user prompt from the research brief, news URLs, optional
 * Firecrawl community sentiment content, and optional structured sentiment intelligence data.
 */
export function buildUserPrompt(
  brief: string,
  newsUrls: string[],
  communityContent: string,
  sentimentIntelligence?: {
    stocktwits_bull_pct: number | null;
    stocktwits_bear_pct: number | null;
    stocktwits_message_count: number | null;
    stocktwits_is_trending: boolean | null;
    put_call_ratio: number | null;
    put_call_interpretation: string | null;
  } | null,
): string {
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
  // Inject sentiment intelligence section for Gemini to echo back + use in future_projection
  if (sentimentIntelligence) {
    const si = sentimentIntelligence;
    prompt += '=== SENTIMENT INTELLIGENCE ===\n';
    prompt += `StockTwits Bullish: ${si.stocktwits_bull_pct != null ? si.stocktwits_bull_pct + '%' : 'N/A'}\n`;
    prompt += `StockTwits Bearish: ${si.stocktwits_bear_pct != null ? si.stocktwits_bear_pct + '%' : 'N/A'}\n`;
    prompt += `StockTwits Messages: ${si.stocktwits_message_count ?? 'N/A'}\n`;
    prompt += `StockTwits Trending: ${si.stocktwits_is_trending != null ? si.stocktwits_is_trending : 'N/A'}\n`;
    prompt += `Options Put/Call Ratio: ${si.put_call_ratio != null ? si.put_call_ratio.toFixed(3) : 'N/A'}\n`;
    prompt += `Options Interpretation: ${si.put_call_interpretation ?? 'N/A'}\n`;
    prompt += '\n';
  }
  prompt += 'Analyze the ticker based on all research data above. Return the structured analysis.';
  return prompt;
}

// ---- Firecrawl community sentiment gatherer ----

// Domain tier ranking for URL selection (Claude's Discretion).
// Higher tier = more retail sentiment signal. Top 5 by tier are scraped.
function domainTier(url: string): number {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    if (['reddit.com', 'stocktwits.com'].includes(host)) return 4;
    if (['seekingalpha.com'].includes(host)) return 3;
    if (['investorshub.com', 'elitetrader.com', 'valueinvestorsclub.com'].includes(host)) return 2;
    return 1;
  } catch {
    return 0;
  }
}

// Scrape a single URL via Firecrawl. Returns '' on failure or paywall content.
async function scrapeUrlWithFirecrawl(fc: Firecrawl, url: string): Promise<string> {
  try {
    const doc = await fc.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    } as Parameters<typeof fc.scrape>[1]);
    const content = (doc as { markdown?: string }).markdown ?? '';
    // Paywall/bot guard: skip pages with < 200 chars (login walls, bot blocks)
    return content.length >= 200 ? content : '';
  } catch {
    return '';
  }
}

/**
 * Discovers community discussion URLs for the ticker using Anthropic Haiku web search,
 * then scrapes the top 5 most relevant URLs via Firecrawl for full content.
 *
 * Two-step process per D-01 to D-05:
 * Step 1: stocktwits.com/symbol/{ticker} is pinned as a guaranteed candidate (D-05).
 *         Haiku then discovers up to 10 additional candidate URLs from Reddit, StockTwits
 *         threads, SeekingAlpha, and niche forums.
 * Step 2: All candidates (pinned + discovered) are ranked by domain tier; top 5 scraped via fc.scrape().
 *
 * StockTwits thread scraping (qualitative text) is separate from the StockTwits API
 * structured data (bull/bear counts) gathered in source-package.ts — both per D-05.
 *
 * Sets _lastCommunityScrapePageCount to the number of non-empty pages scraped.
 * Returns empty string if FIRECRAWL_API_KEY is absent.
 */
export async function scrapeCommunitySentiment(ticker: string): Promise<string> {
  _lastCommunityScrapePageCount = 0;
  if (!process.env.FIRECRAWL_API_KEY) return '';
  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

  // D-05: Pin StockTwits thread URL as a guaranteed candidate.
  // encodeURIComponent ensures safe URL even for tickers like BRK.A.
  const pinnedStockTwitsUrl = `https://stocktwits.com/symbol/${encodeURIComponent(ticker)}`;
  let candidateUrls: string[] = [pinnedStockTwitsUrl];

  // Step 1: Haiku URL discovery (D-02, D-03, D-04) — adds dynamic ticker-specific sources
  try {
    const discoveryResponse = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }],
      messages: [{
        role: 'user',
        content: `Find 10 URLs where ${ticker} stock is being actively discussed right now. ` +
          `Target: Reddit posts in r/wallstreetbets, r/stocks, r/investing, r/SecurityAnalysis; ` +
          `StockTwits discussion threads; SeekingAlpha articles; Investors Hub and Elite Trader forums. ` +
          `Prefer recent posts (past 7 days). ` +
          `Return ONLY a JSON array of URL strings, no commentary. Example: ["https://reddit.com/r/...", ...]`,
      }],
    });

    // Extract text block from response
    const textBlock = discoveryResponse.content.filter(b => b.type === 'text').pop();
    const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    // Parse JSON, strip markdown fences
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as unknown;
      if (Array.isArray(parsed)) {
        // Filter to valid HTTP URLs only (guard against malformed Haiku output)
        const discovered = (parsed as unknown[])
          .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
          .slice(0, 10);
        // Append discovered URLs — pinned StockTwits URL remains at index 0
        candidateUrls = [...candidateUrls, ...discovered];
      }
    } catch { /* parse failure — proceed with pinned URL only */ }
  } catch { /* Haiku call failure — proceed with pinned URL only */ }

  // Step 2: Rank by domain tier, take top 5, scrape each (D-03)
  // De-duplicate by URL string before ranking
  const unique = [...new Set(candidateUrls)];
  const ranked = unique.sort((a, b) => domainTier(b) - domainTier(a));
  const top5 = ranked.slice(0, 5);

  const scraped = await Promise.all(top5.map(url => scrapeUrlWithFirecrawl(fc, url)));
  const pages = scraped.filter(Boolean);

  _lastCommunityScrapePageCount = pages.length;
  return pages.join('\n\n---\n\n');
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
  const userPrompt = buildUserPrompt(brief, newsUrls, communityContent, pkg.sentiment_intelligence);

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
      business_description: output.business_description || undefined,
      financial_analysis: output.financial_analysis || undefined,
      competitive_landscape: output.competitive_landscape || undefined,
      investment_thesis: output.investment_thesis,
      key_risks: output.key_risks,
      valuation_context: output.valuation_context,
      catalyst_watch: output.catalyst_watch ?? [],
      sources_used: output.sources_used,
      future_projection: output.future_projection || undefined,
      community_sources_scraped: _lastCommunityScrapePageCount > 0 ? _lastCommunityScrapePageCount : undefined,
      sentiment_intelligence: output.sentiment_intelligence_summary ? {
        stocktwits_bull_pct: output.sentiment_intelligence_summary.stocktwits_bull_pct ?? null,
        stocktwits_bear_pct: output.sentiment_intelligence_summary.stocktwits_bear_pct ?? null,
        stocktwits_message_count: output.sentiment_intelligence_summary.stocktwits_message_count ?? null,
        stocktwits_is_trending: output.sentiment_intelligence_summary.stocktwits_is_trending ?? null,
        put_call_ratio: output.sentiment_intelligence_summary.put_call_ratio ?? null,
        put_call_interpretation: output.sentiment_intelligence_summary.put_call_interpretation ?? null,
      } : undefined,
    };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      const rawText = (err as NoObjectGeneratedError).text?.slice(0, 200) ?? 'none';
      throw new Error(`Gemini returned unstructured response. Raw: ${rawText}`);
    }
    throw err;
  }
}
