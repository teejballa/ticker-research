// src/lib/gemini-analysis.ts
// Gemini analysis service — calls Gemini via AI SDK + Vercel AI Gateway.
// Auth: VERCEL_OIDC_TOKEN auto-read from process.env (local) or injected by Vercel runtime (deployed).
// No provider import needed — plain model string 'google/gemini-3-flash' routes through AI Gateway.

import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import Firecrawl from '@mendable/firecrawl-js';
// Direct Anthropic SDK is required here — Pool B niche discovery and community extraction use
// the `web_search_20250305` tool, which is an Anthropic-native feature not available through
// the AI Gateway. Gemini calls route through the Gateway via plain model strings as normal.
import Anthropic from '@anthropic-ai/sdk';
import {
  formatResearchBrief,
  extractNewsUrls,
  assembleCitationsFromPackage,
  renderCitationsSection,
} from '@/lib/research-brief';
import type { AnalysisResult, EngineCalibration, SourcePackage } from '@/lib/types';
import { getEngineContextForTicker, type EngineContext } from '@/lib/engine-context';
import { CitationsArraySchema, type Citation } from '@/lib/sentiment/citation-schema';
import { derivePipelineProviders } from '@/lib/sentiment/pipeline-providers';
import { runWithShadow } from '@/lib/shadow/shadow-runner';
import { FEATURES, type FeatureMode } from '@/lib/features';
// Phase 19-C-08 (D-40) — Chain-of-Verification two-pass.
// runCoVe runs Pass 2 (NLI verification) on the 3 claims Gemini emits during
// Pass 1. Activated behind FEATURE_COVE_TWO_PASS via runWithShadow; baseline
// behavior is unchanged when the flag is off.
import { runCoVe } from '@/lib/reasoning/cove';
// Phase 19 / Plan 19-C-09 — model cascade router + cost telemetry (D-41).
// Router decides which LLM to call based on engine context (controversy proxy,
// ic_decay_flag, market_cap); cost telemetry persists per-call USD into the
// existing LearningEvent table (event_type='model_router_decision').
// Schema audit (prisma/schema.prisma lines 134-150): event_type, ticker, delta
// (Json), message all already exist — NO new columns required.
import { routeModel, estimateCost, type ModelChoice } from '@/lib/reasoning/router';
import { prisma } from '@/lib/db';
// Plan 20-Z-03 — wrap the Gemini generateText() call with per-call telemetry.
// cost_usd_estimator reads usage.inputTokens/outputTokens off the SDK return
// shape and multiplies by GEMINI_TOKEN_RATES (pinned 2026-Q1).
import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import { GEMINI_TOKEN_RATES } from '@/lib/telemetry/cost-estimators';
// Plan 20-Z-04 — every Gemini prompt is a (id, version) artifact in the
// registry. renderPrompt() substitutes {{var}} placeholders + throws on
// missing required vars or leftover placeholders (T-20-Z-04-03).
import { renderPrompt } from '@/lib/prompts/render';
// Plan 20-B-01 — fixed 7-element AspectTag taxonomy for per-doc classifier output.
import { ASPECT_TAGS } from '@/lib/sentiment/aspects';

// Reads ANTHROPIC_API_KEY from process.env automatically.
const anthropicClient = new Anthropic();

// ---- Zod schema for structured Gemini output ----

const CatalystEventSchema = z.object({
  event: z.string(),
  timing: z.string(),
  impact: z.enum(['positive', 'negative', 'uncertain']),
});

const CommunityHighlightSchema = z.object({
  community_name: z.string(),
  community_type: z.enum(['mainstream', 'middle', 'niche']),
  audience: z.string(),
  standout_quote: z.string(),
  theme: z.string(),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  engagement_signal: z.enum(['high', 'medium', 'low']),
  quotes: z.array(z.string()).optional().default([]),
  recurring_themes: z.array(z.string()).optional().default([]),
  unique_to_community: z.array(z.string()).optional().default([]),
  analysis_paragraph: z.string().optional().default(''),
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
    // Plan 20-D-03 — per-claim CoVe verdict; optional for backward compat.
    verified: z.enum(['true', 'false', 'null']).optional(),
  })).min(1).max(5),
  bearish_signals: z.array(z.object({
    signal: z.string(),
    source_citation: z.string(),
    // Plan 20-D-03 — per-claim CoVe verdict; optional for backward compat.
    verified: z.enum(['true', 'false', 'null']).optional(),
  })).min(1).max(5),
  // Plan 20-D-03 — Structured risks list parallel to legacy `key_risks` string.
  // Optional; legacy `key_risks` field preserved verbatim. Each risk carries
  // an optional per-claim `verified` field driven by the same NLI verifier.
  risks: z.array(z.object({
    description: z.string(),
    source_citation: z.string().optional(),
    verified: z.enum(['true', 'false', 'null']).optional(),
  })).max(7).optional(),
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
  community_highlights: z.array(CommunityHighlightSchema).optional().default([]),
  community_analysis: z.string().optional().default(''),

  // Phase 19-C-07 (D-39) — structured citations v2.
  // Optional in the schema during shadow mode (off path won't populate).
  // Once cutover lands per shadow lifecycle, the legacy free-text
  // `source_citation: string` on each bullish/bearish signal will be removed
  // and `citations_v2` becomes mandatory at the report level.
  citations_v2: CitationsArraySchema.optional(),

  // Phase 19-C-08 (D-40) — Chain-of-Verification Pass-1 claims.
  // Optional in the schema; populated when the CoVe prompt instruction is
  // appended (FEATURE_COVE_TWO_PASS in shadow or on). Pass-2 (runCoVe) runs
  // an NLI verifier on each claim against the SourcePackage. Min 0 / max 5
  // (target 3) — Gemini occasionally emits 0 if no verifiable factual claim
  // is appropriate, and we don't want a Zod failure to block the entire
  // analysis on this enrichment.
  verification_claims: z.array(z.string()).max(5).optional(),

  // Plan 20-B-01 — per-document sentiment + aspect classification.
  // Optional + default [] so the field is additive; off-flag branch writes
  // an empty array. Populated by classifyDocumentsBatch via
  // src/lib/sentiment/per-doc-classifier.ts before runGeminiAnalysis runs,
  // then post-process-written here (overwrites any LLM hallucination).
  // Consumed downstream by 20-B-05 per-aspect aggregator.
  per_document_sentiment: z
    .array(
      z.object({
        doc_id: z.string().min(1),
        polarity: z.number().min(-1).max(1),
        confidence: z.number().min(0).max(1),
        aspects: z.array(z.enum(ASPECT_TAGS)).max(7),
      }),
    )
    .optional()
    .default([]),

  // Plan 20-B-05 — per-aspect Beta-smoothed bull% (chip stack source).
  // Authored by aggregateByAspect() in source-package.ts; the LLM does NOT
  // contribute this field (post-process overwrite mirrors engine_calibration).
  // Zod accepts shadow-mode runs; off-mode wires an empty array.
  per_aspect_sentiment: z
    .array(
      z.object({
        aspect: z.enum(ASPECT_TAGS),
        bull_pct: z.number().min(0).max(100).nullable(),
        n_docs: z.number().int().nonnegative(),
        confidence_mean: z.number().min(0).max(1),
      }),
    )
    .optional(),

  // Engine calibration block — Gemini contributes only the alignment/disagreement
  // strings (4 of them, post-Phase-16; 8 total post-Phase-17). All numeric fields
  // are overwritten post-generation with authoritative values from getEngineContextForTicker.
  engine_calibration: z.object({
    engine_alignment: z.string().nullable().default(null),
    engine_disagreement: z.string().nullable().default(null),
    // Phase 16 — technical signal class prose. LLM contributes the strings;
    // all numeric technical_* fields are written by engine-context post-process.
    technical_alignment: z.string().nullable().default(null),
    technical_disagreement: z.string().nullable().default(null),
    // Phase 17-04 — institutional + insider prose (D-05: ONLY these 4 strings; numerics discarded)
    institutional_alignment: z.string().nullable().optional(),
    institutional_disagreement: z.string().nullable().optional(),
    insider_alignment: z.string().nullable().optional(),
    insider_disagreement: z.string().nullable().optional(),
    // Accept (and immediately discard) any numeric fields the LLM might hallucinate.
    // The post-process overwrite block replaces them with authoritative engineCtx values.
    institutional_posterior_mean: z.number().nullable().optional(),
    institutional_sample_size: z.number().nullable().optional(),
    institutional_status: z.string().nullable().optional(),
    insider_posterior_mean: z.number().nullable().optional(),
    insider_sample_size: z.number().nullable().optional(),
    insider_status: z.string().nullable().optional(),
  }).optional(),
});

// ---- System prompt ----

export const SYSTEM_PROMPT = renderPrompt('gemini-research-brief-system', {});

// ---- Prompt builder ----

/**
 * Assembles the Gemini user prompt from the research brief, news URLs, optional
 * Firecrawl community sentiment content, optional structured sentiment intelligence data,
 * and optional structured community highlights extracted by Haiku.
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
    put_call_ratio?: number | null;
    put_call_interpretation?: 'bullish' | 'bearish' | 'neutral' | null;
  },
  communityHighlights?: import('@/lib/types').CommunityHighlight[],
  newsItems?: import('@/lib/types').NewsItem[],
): string {
  // ── news_section ─────────────────────────────────────────────────────────
  // Original (pre-20-Z-04) behavior: when newsItems is present, append
  // '=== NEWS SOURCES ===\n' + per-item lines + '\n' (trailing single newline).
  // When only newsUrls is present, append '=== NEWS SOURCES ===\n' + bullet
  // list + '\n\n' (trailing double newline). When neither, append nothing.
  let news_section = '';
  if (newsItems && newsItems.length > 0) {
    news_section = '=== NEWS SOURCES ===\n';
    for (const item of newsItems.slice(0, 15)) {
      news_section += `[${item.published_date}] ${item.headline} (${item.source})\n`;
      news_section += `  URL: ${item.url}\n`;
    }
    news_section += '\n';
  } else if (newsUrls.length > 0) {
    news_section = '=== NEWS SOURCES ===\n';
    news_section += newsUrls.map(url => `- ${url}`).join('\n');
    news_section += '\n\n';
  }

  // ── community_sentiment_section ──────────────────────────────────────────
  let community_sentiment_section = '';
  if (communityContent) {
    community_sentiment_section = '=== COMMUNITY SENTIMENT ===\n';
    community_sentiment_section += communityContent;
    community_sentiment_section += '\n\n';
  }

  // ── sentiment_intelligence_section ───────────────────────────────────────
  let sentiment_intelligence_section = '';
  if (sentimentIntelligence) {
    const si = sentimentIntelligence;
    sentiment_intelligence_section = '=== SENTIMENT INTELLIGENCE ===\n';
    sentiment_intelligence_section += `StockTwits Bullish: ${si.stocktwits_bull_pct != null ? si.stocktwits_bull_pct + '%' : 'N/A'}\n`;
    sentiment_intelligence_section += `StockTwits Bearish: ${si.stocktwits_bear_pct != null ? si.stocktwits_bear_pct + '%' : 'N/A'}\n`;
    sentiment_intelligence_section += `StockTwits Messages: ${si.stocktwits_message_count ?? 'N/A'}\n`;
    sentiment_intelligence_section += `StockTwits Trending: ${si.stocktwits_is_trending != null ? si.stocktwits_is_trending : 'N/A'}\n`;
    sentiment_intelligence_section += `Options Put/Call Ratio: ${si.put_call_ratio != null ? si.put_call_ratio.toFixed(3) : 'N/A'}\n`;
    sentiment_intelligence_section += `Options Interpretation: ${si.put_call_interpretation ?? 'N/A'}\n`;
    sentiment_intelligence_section += '\n';
  }

  // ── community_intelligence_section ───────────────────────────────────────
  // Original behavior: when present, starts with '\n\n=== COMMUNITY INTELLIGENCE ===\n'
  // (note the leading two newlines that separated it from the previous section).
  let community_intelligence_section = '';
  if (communityHighlights && communityHighlights.length > 0) {
    community_intelligence_section = `\n\n=== COMMUNITY INTELLIGENCE ===\n`;
    community_intelligence_section += `Structured findings extracted from ${communityHighlights.length} community source${communityHighlights.length !== 1 ? 's' : ''}:\n\n`;
    for (const h of communityHighlights) {
      community_intelligence_section += `Community: ${h.community_name} (${h.community_type}, audience: ${h.audience})\n`;
      community_intelligence_section += `Sentiment: ${h.sentiment} | Engagement: ${h.engagement_signal}\n`;
      community_intelligence_section += `Primary theme: ${h.theme}\n`;
      if (h.quotes && h.quotes.length > 0) {
        community_intelligence_section += `Direct user quotes (verbatim):\n`;
        h.quotes.forEach(q => { community_intelligence_section += `  - "${q}"\n`; });
      } else {
        community_intelligence_section += `Standout quote: "${h.standout_quote}"\n`;
      }
      if (h.recurring_themes && h.recurring_themes.length > 0) {
        community_intelligence_section += `Recurring themes (mentioned by multiple users): ${h.recurring_themes.join('; ')}\n`;
      }
      if (h.unique_to_community && h.unique_to_community.length > 0) {
        community_intelligence_section += `Unique to this community (not in mainstream financial news): ${h.unique_to_community.join('; ')}\n`;
      }
      community_intelligence_section += '\n';
    }
  }

  // Plan 20-Z-04 — the registered v1 template composes these sections plus
  // the trailing "Analyze the ticker…" instruction. The empty-section default
  // ('') ensures bit-identical output when a section is absent.
  return renderPrompt('gemini-research-brief-user', {
    brief,
    news_section,
    community_sentiment_section,
    sentiment_intelligence_section,
    community_intelligence_section,
  });
}

// ---- Firecrawl community sentiment gatherer ----

// Mainstream tier — high volume, hype-heavy, ideas arrive after spreading
const MAINSTREAM_URLS = [
  'https://www.reddit.com/r/wallstreetbets/search/?q={TICKER}&sort=new&t=week',
  'https://finance.yahoo.com/quote/{TICKER}/community/',
];

// Middle tier — general investor audience, mixed quality
const MIDDLE_URLS = [
  'https://www.reddit.com/search/?q={TICKER}+stock&sort=new',
  'https://seekingalpha.com/symbol/{TICKER}',
];

function buildTieredUrls(ticker: string): { mainstream: string[]; middle: string[] } {
  return {
    mainstream: MAINSTREAM_URLS.map(u => u.replace('{TICKER}', encodeURIComponent(ticker))),
    middle: MIDDLE_URLS.map(u => u.replace('{TICKER}', encodeURIComponent(ticker))),
  };
}

// Extract reddit.com comment thread URLs from a scraped search page's markdown.
function extractRedditThreadUrls(markdown: string): string[] {
  const pattern = /https?:\/\/(?:www\.)?reddit\.com\/r\/\w+\/comments\/[a-z0-9]+\/[^\s\)\]"'<>]*/gi;
  const matches = markdown.match(pattern) ?? [];
  const cleaned = matches.map(u => u.replace(/[.,;!?]+$/, ''));
  return [...new Set(cleaned)].slice(0, 3);
}

// Scrape a single URL via Firecrawl. Returns '' on failure or paywall content.
async function scrapeUrlWithFirecrawl(fc: Firecrawl, url: string): Promise<string> {
  try {
    const doc = await fc.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    } as Parameters<typeof fc.scrape>[1]);
    const content = (doc as { markdown?: string }).markdown ?? '';
    return content.length >= 200 ? content : '';
  } catch {
    return '';
  }
}

/**
 * Three-tier community scraping:
 *   Mainstream: r/WallStreetBets, Yahoo Finance — high volume, hype-heavy.
 *   Middle:     Reddit search + SeekingAlpha — general investor audience.
 *   Niche:      Haiku discovers sector-specific communities for this ticker.
 *
 * Returns: { pinnedContent, nicheContent, nicheUrls, pageCount, mainstreamPageCount, middlePageCount, nichePageCount }
 * pageCount is the total number of non-empty pages successfully scraped.
 */
export async function scrapeCommunitySentiment(
  ticker: string,
  companyName: string,
): Promise<{
  pinnedContent: string;
  nicheContent: string;
  nicheUrls: string[];
  pageCount: number;
  mainstreamPageCount: number;
  middlePageCount: number;
  nichePageCount: number;
}> {
  const empty = { pinnedContent: '', nicheContent: '', nicheUrls: [], pageCount: 0, mainstreamPageCount: 0, middlePageCount: 0, nichePageCount: 0 };
  if (!process.env.FIRECRAWL_API_KEY) return empty;

  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

  // ── Mainstream + Middle tiers ─────────────────────────────────────────────
  const { mainstream, middle } = buildTieredUrls(ticker);
  const [mainstreamScraped, middleScraped] = await Promise.all([
    Promise.all(mainstream.map(u => scrapeUrlWithFirecrawl(fc, u))),
    Promise.all(middle.map(u => scrapeUrlWithFirecrawl(fc, u))),
  ]);
  const mainstreamPages = mainstreamScraped.filter(Boolean);
  const middlePages = middleScraped.filter(Boolean);

  // ── Pool A+: Reddit comment threads ─────────────────────────────────────
  // Extract actual thread URLs from the Reddit search page (middleScraped[0]) and scrape the comment content.
  const redditSearchMarkdown = middleScraped[0] ?? '';
  const redditThreadUrls = extractRedditThreadUrls(redditSearchMarkdown);
  const redditThreadPages = redditThreadUrls.length > 0
    ? (await Promise.all(redditThreadUrls.map(u => scrapeUrlWithFirecrawl(fc, u)))).filter(Boolean)
    : [];

  // ── Pool B: Niche discovery via Haiku ───────────────────────────────────
  let nicheUrls: string[] = [];

  try {
    // Search 1: community mapping — what niche places discuss this stock?
    const mapResponse = await anthropicClient.messages.create({
      model: 'claude-haiku-4.5',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 3 }],
      messages: [{
        role: 'user',
        content:
          `Find the most active NICHE communities that discuss ${ticker} (${companyName}) stock online. ` +
          `Target sector-specific forums, specialized subreddits (NOT r/wallstreetbets or r/stocks), ` +
          `Discord communities, Substack comment sections, ValueInvestorsClub, Bogleheads forums, ` +
          `EliteTrader threads, industry fan/critic sites, financial blogs, and any specialized ` +
          `investor community that would uniquely discuss this company. ` +
          `Exclude: reddit.com/r/wallstreetbets, reddit.com/r/stocks, reddit.com/r/investing, seekingalpha.com, stocktwits.com. ` +
          `Return ONLY a JSON array of URL strings. Example: ["https://valueinvestorsclub.com/...", ...]`,
      }],
    });

    // Search 2: recent discussion threads in niche communities
    const threadResponse = await anthropicClient.messages.create({
      model: 'claude-haiku-4.5',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 3 }],
      messages: [{
        role: 'user',
        content:
          `Find recent (past 14 days) discussion threads specifically about ${ticker} stock in niche ` +
          `investor communities. Look in specialized subreddits, sector-specific forums, ` +
          `financial Discord communities, Substack comments, EliteTrader, ValueInvestorsClub, ` +
          `industry analyst blogs, and any non-mainstream discussion venue. ` +
          `Exclude: reddit.com/r/wallstreetbets, reddit.com/r/stocks, reddit.com/r/investing, seekingalpha.com, stocktwits.com. ` +
          `Return ONLY a JSON array of URL strings.`,
      }],
    });

    // Extract and merge URLs from both searches
    for (const response of [mapResponse, threadResponse]) {
      const textBlock = response.content.filter(b => b.type === 'text').pop();
      const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      // Find JSON array anywhere in the text
      const arrayMatch = cleaned.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[0]) as unknown;
          if (Array.isArray(parsed)) {
            const urls = (parsed as unknown[])
              .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
              .slice(0, 8);
            nicheUrls = [...nicheUrls, ...urls];
          }
        } catch { /* ignore parse errors */ }
      }
    }
  } catch { /* Haiku failure — proceed with pinned only */ }

  // Deduplicate niche URLs, exclude pinned domains
  const pinnedDomains = new Set(['reddit.com', 'seekingalpha.com', 'stocktwits.com']);
  const uniqueNiche = [...new Set(nicheUrls)].filter(u => {
    try {
      const host = new URL(u).hostname.replace('www.', '');
      return !pinnedDomains.has(host);
    } catch { return false; }
  }).slice(0, 6);

  // Scrape niche pool
  const nicheScraped = await Promise.all(uniqueNiche.map(u => scrapeUrlWithFirecrawl(fc, u)));
  const nichePages = nicheScraped.filter(Boolean);

  const allMiddlePages = [...middlePages, ...redditThreadPages];
  const pageCount = mainstreamPages.length + allMiddlePages.length + nichePages.length;

  return {
    pinnedContent: [...mainstreamPages, ...allMiddlePages].join('\n\n---\n\n'),
    nicheContent: nichePages.join('\n\n---\n\n'),
    nicheUrls: uniqueNiche,
    pageCount,
    mainstreamPageCount: mainstreamPages.length,
    middlePageCount: allMiddlePages.length,
    nichePageCount: nichePages.length,
  };
}

/**
 * Extraction pass: Haiku reads raw scraped markdown and extracts structured
 * per-community findings with standout quotes and sentiment direction.
 *
 * Returns an array of CommunityHighlight objects. Empty array on failure.
 * Filters out pages with no real user opinions (price tables, login walls, etc.).
 */
export async function extractCommunityHighlights(
  pinnedContent: string,
  nicheContent: string,
  nicheUrls: string[],
): Promise<import('@/lib/types').CommunityHighlight[]> {
  const allContent = [pinnedContent, nicheContent].filter(Boolean).join('\n\n===PAGE BREAK===\n\n');
  if (!allContent || allContent.length < 200) return [];

  const extractionPrompt =
    `You are extracting structured community sentiment findings from scraped investor discussion pages. ` +
    `For each distinct community or page in the content below, extract ONE finding object. ` +
    `\n\nRULES:\n` +
    `- If a page has fewer than 3 actual user opinions (just price data, login walls, or article text with no comments), SKIP it entirely.\n` +
    `- standout_quote: the single most revealing or surprising user opinion you found.\n` +
    `- quotes: extract 3-5 VERBATIM user quotes that represent the range of opinion. Must be actual user words, not article text or price data.\n` +
    `- recurring_themes: list ONLY themes mentioned independently by 2 or more distinct users. If a concern appears once, omit it.\n` +
    `- unique_to_community: list signals, concerns, or viewpoints discussed in this community that would NOT appear in mainstream financial news or analyst reports (e.g. insider anecdotes, product experiences, regulatory rumors, niche competitive intel). Omit if nothing qualifies.\n` +
    `- community_name should be the real name (e.g. "r/SecurityAnalysis", "ValueInvestorsClub", "BioPharma Catalyst Forum").\n` +
    `- community_type: "mainstream" for r/WallStreetBets and Yahoo Finance boards; "middle" for r/investing, r/stocks, SeekingAlpha, r/SecurityAnalysis; "niche" for all sector-specific, ticker-specific, or specialized communities (ValueInvestorsClub, EliteTrader, r/NVDA, industry blogs, Bogleheads).\n` +
    `- audience: describe who uses this community in 3-6 words (e.g. "institutional-adjacent analysts", "retail momentum traders").\n` +
    `- engagement_signal: "high" if many active replies/upvotes visible, "low" if sparse.\n` +
    `\nNiche URLs found (for reference): ${nicheUrls.join(', ')}\n\n` +
    `SCRAPED CONTENT:\n${allContent.slice(0, 18000)}\n\n` +
    `Return ONLY a JSON array. Each element:\n` +
    `{"community_name":"...","community_type":"mainstream|middle|niche","audience":"...","standout_quote":"...","theme":"...","sentiment":"bullish|bearish|neutral","engagement_signal":"high|medium|low","quotes":["verbatim quote 1","verbatim quote 2","verbatim quote 3"],"recurring_themes":["theme mentioned by 2+ users"],"unique_to_community":["signal not in mainstream financial news"]}`;

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-4.5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: extractionPrompt }],
    });

    const textBlock = response.content.filter(b => b.type === 'text').pop();
    const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const arrayMatch = cleaned.match(/\[[\s\S]*?\]/);
    if (!arrayMatch) return [];

    const parsed = JSON.parse(arrayMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return [];

    return (parsed as unknown[]).filter((item): item is import('@/lib/types').CommunityHighlight => {
      if (typeof item !== 'object' || item === null) return false;
      const h = item as Record<string, unknown>;
      return (
        typeof h.community_name === 'string' &&
        typeof h.standout_quote === 'string' &&
        typeof h.theme === 'string' &&
        ['bullish', 'bearish', 'neutral'].includes(h.sentiment as string)
      );
    });
  } catch {
    return [];
  }
}

// ---- Market snapshot extractor ----

/**
 * Extracts a MarketSnapshot from a SourcePackage for embedding in the AnalysisResult.
 */
export function extractMarketSnapshot(pkg: SourcePackage) {
  const m = pkg.market_data._field_sources;
  const f = pkg.fundamentals._field_sources;
  return {
    price: pkg.market_data.price,
    percent_change_today: pkg.market_data.percent_change_today,
    market_cap: pkg.market_data.market_cap,
    fifty_two_week_high: pkg.market_data.fifty_two_week_high,
    fifty_two_week_low: pkg.market_data.fifty_two_week_low,
    pe_ratio: pkg.fundamentals.pe_ratio,
    eps: pkg.fundamentals.eps,
    revenue: pkg.fundamentals.revenue,
    field_sources: (m || f) ? {
      price: m?.price ?? null,
      percent_change_today: m?.percent_change_today ?? null,
      market_cap: m?.market_cap ?? null,
      fifty_two_week_high: m?.fifty_two_week_high ?? null,
      fifty_two_week_low: m?.fifty_two_week_low ?? null,
      pe_ratio: f?.pe_ratio ?? null,
      eps: f?.eps ?? null,
      revenue: f?.revenue ?? null,
    } : undefined,
  };
}

// ---- Engine calibration prompt + post-process ----

/**
 * Build the TECHNICAL CALIBRATION CONTEXT block (Phase 16). Concatenated
 * AFTER the existing ENGINE CALIBRATION CONTEXT block in the system prompt.
 *
 * Renders empty when the engine has no horizon_calibrations yet (backwards-compat
 * with first-cycle reports / pre-Phase-16 state) — the LLM then sees only the
 * diffusion block.
 *
 * Verbatim spec: 16-RESEARCH.md §11 lines 845-868.
 */
export function buildTechnicalContextBlock(ctx: EngineContext): string {
  if (!ctx.horizon_calibrations || ctx.horizon_calibrations.length === 0) {
    return '';
  }
  const pct = (n: number | null): string => (n == null ? '—' : `${(n * 100).toFixed(0)}%`);

  // 3d is omitted from the prompt table (UI-SPEC §A line 150 — too noisy for
  // thesis horizons, though the backend still stores it).
  const horizonRows = ctx.horizon_calibrations
    .filter((h) => h.horizon_days !== 3)
    .map((h) => {
      const marker = h.horizon_days === 30 ? '★' : ' ';
      const label30 = h.horizon_days === 30 ? '  ← primary, drives logistic' : '';
      return `    ${h.horizon_days}d${marker}  diffusion ${pct(h.diffusion_posterior).padEnd(4)}  technical ${pct(h.technical_posterior).padEnd(4)}  ${h.status}${label30}`;
    })
    .join('\n');

  const techCi = ctx.technical_ci
    ? `[CI ${pct(ctx.technical_ci[0])}–${pct(ctx.technical_ci[1])}]`
    : '';

  // Plan 20-Z-04 — body lives in src/lib/prompts/_v1/gemini-technical-context-block.md.
  return renderPrompt('gemini-technical-context-block', {
    technical_sample_size: String(ctx.technical_sample_size ?? 0),
    technical_pattern: ctx.technical_pattern ?? '—',
    cap_class: ctx.cap_class,
    technical_posterior_pct: pct(ctx.technical_posterior_mean ?? null),
    technical_ci: techCi,
    technical_status: ctx.technical_status ?? 'NO_DATA',
    horizon_rows: horizonRows,
    combined_logistic_pct: pct(ctx.combined_logistic_score ?? null),
    agreement: ctx.agreement ?? 'unknown',
  });
}

/**
 * Phase 17-04: Build the smart money calibration context block for the system prompt.
 * Renders empty when neither institutional nor insider class has data
 * (backwards-compat with pre-Phase-17 state).
 *
 * D-04 trust boundary: numbers shown here are for LLM awareness only —
 * the post-process overwrite in runGeminiAnalysis replaces all numeric
 * institutional/insider fields regardless of what the LLM outputs.
 *
 * D-05: LLM may only write 4 prose strings:
 *   institutional_alignment, institutional_disagreement,
 *   insider_alignment, insider_disagreement.
 *
 * D-06: When either class is ACTIVE at 30d, the buy/sell rationale MUST
 *   cite the calibrating bucket by exact name.
 */
export function buildSmartMoneyContextBlock(ctx: EngineContext): string {
  const hasInstitutional = ctx.institutional_status !== 'NO_DATA' || ctx.institutional_pattern != null;
  const hasInsider        = ctx.insider_status !== 'NO_DATA'        || ctx.insider_pattern != null;
  if (!hasInstitutional && !hasInsider) return '';

  const pct = (n: number | null | undefined): string => (n != null ? `${(n * 100).toFixed(0)}%` : '—');
  const ci  = (c: [number, number] | null | undefined): string =>
    c ? `[CI ${pct(c[0])}–${pct(c[1])}]` : '';

  // 30d horizon row for the 4-class table
  const row30 = ctx.horizon_calibrations?.find(h => h.horizon_days === 30);

  // Plan 20-Z-04 — body lives in src/lib/prompts/_v1/gemini-smart-money-context-block.md.
  return renderPrompt('gemini-smart-money-context-block', {
    institutional_pattern: ctx.institutional_pattern ?? 'NO PATTERN',
    cap_class: ctx.cap_class,
    institutional_posterior_pct: pct(ctx.institutional_posterior_mean),
    institutional_ci: ci(ctx.institutional_ci),
    institutional_sample_size: String(ctx.institutional_sample_size ?? 0),
    institutional_status: ctx.institutional_status ?? 'NO_DATA',
    institutional_age_text:
      ctx.institutional_data_age_days != null
        ? `${ctx.institutional_data_age_days} days since latest 13F`
        : 'unknown',
    insider_pattern: ctx.insider_pattern ?? 'NO PATTERN',
    insider_posterior_pct: pct(ctx.insider_posterior_mean),
    insider_ci: ci(ctx.insider_ci),
    insider_sample_size: String(ctx.insider_sample_size ?? 0),
    insider_status: ctx.insider_status ?? 'NO_DATA',
    insider_age_text:
      ctx.insider_data_age_days != null
        ? `${ctx.insider_data_age_days} days since latest Form 4`
        : 'unknown',
    row30_diffusion_pct: pct(row30?.diffusion_posterior),
    row30_diffusion_ci: ci(row30?.diffusion_ci),
    row30_technical_pct: pct(row30?.technical_posterior),
    row30_technical_ci: ci(row30?.technical_ci),
    row30_institutional_pct: pct(row30?.institutional_posterior),
    row30_institutional_ci: ci(row30?.institutional_ci),
    row30_insider_pct: pct(row30?.insider_posterior),
    row30_insider_ci: ci(row30?.insider_ci),
    agreement: ctx.agreement?.toUpperCase() ?? 'UNKNOWN',
  });
}

/**
 * Top-level system-prompt assembler. Composes SYSTEM_PROMPT + the engine
 * calibration block + the technical calibration block + the smart money block.
 * Exported as a NAMED function so plan 16-05's integration test can import
 * and assert against the prompt without a Gemini call.
 */
export function buildSystemPrompt(engineCtx: EngineContext | null): string {
  if (!engineCtx) return SYSTEM_PROMPT;
  return (
    SYSTEM_PROMPT +
    buildEngineContextBlock(engineCtx) +
    buildTechnicalContextBlock(engineCtx) +
    buildSmartMoneyContextBlock(engineCtx)
  );
}

/**
 * Build the ENGINE CALIBRATION CONTEXT block appended to the system prompt.
 * Numbers are formatted as percentages where appropriate. The LLM is told the
 * numbers will be overwritten post-generation, so it should focus on producing
 * the engine_alignment / engine_disagreement strings.
 */
export function buildEngineContextBlock(ctx: EngineContext): string {
  if (ctx.status === 'NO_DATA') {
    // Plan 20-Z-04 — body lives in
    // src/lib/prompts/_v1/gemini-engine-context-block-no-data.md.
    return renderPrompt('gemini-engine-context-block-no-data', {
      cycle_count: String(ctx.cycle_count),
    });
  }

  const pct = (n: number | null) => (n != null ? (n * 100).toFixed(0) + '%' : '—');
  const fix = (n: number | null) => (n != null ? n.toFixed(2) : '—');

  // Plan 20-Z-04 — body lives in
  // src/lib/prompts/_v1/gemini-engine-context-block-active.md.
  // Legacy template literal coerced flow_pattern via `${ctx.flow_pattern}` which
  // produces 'null' for null. Use String() for the same coercion.
  return renderPrompt('gemini-engine-context-block-active', {
    cycle_count: String(ctx.cycle_count),
    flow_pattern: String(ctx.flow_pattern),
    cap_class: ctx.cap_class,
    posterior_mean_pct: pct(ctx.posterior_mean),
    ci_low_pct: pct(ctx.ci_low),
    ci_high_pct: pct(ctx.ci_high),
    sample_size: String(ctx.sample_size),
    status: ctx.status,
    logistic_score_pct: pct(ctx.logistic_score),
    logistic_ci_low_pct: pct(ctx.logistic_ci_low),
    logistic_ci_high_pct: pct(ctx.logistic_ci_high),
    logistic_sample_size: String(ctx.logistic_sample_size),
    brier_in_sample: fix(ctx.brier_in_sample),
    brier_null: fix(ctx.brier_null),
    drift_z: ctx.drift_z.toFixed(2),
  });
}

// ---- Main analysis function ----

/**
 * Read FEATURE_CITATIONS_V2 once per call. Three-mode flag (D-09):
 *   off    → legacy free-text source_citation only (default)
 *   shadow → legacy is canonical (returned to caller); new (with citations_v2)
 *            runs in setImmediate via runWithShadow + persists ShadowComparison
 *   on     → new path is canonical
 *
 * This flag is intentionally local to gemini-analysis.ts (NOT in the central
 * features.ts matrix) because per the 19-C-07 plan: "this plan uses
 * runWithShadow with no specific feature flag — citations_v2 is the canonical
 * post-cutover; flag-removal step is N/A". Once shadow → cutover lands and
 * 7-day hatch closes, this helper + the shadow wrap is removed and the
 * citations-v2 path becomes the only path.
 */
function getCitationsV2Mode(): FeatureMode {
  const raw = process.env.FEATURE_CITATIONS_V2;
  if (raw === 'true' || raw === 'on') return 'on';
  if (raw === 'shadow') return 'shadow';
  return 'off';
}

/**
 * Calls Gemini via AI SDK + Vercel AI Gateway and returns a fully typed AnalysisResult.
 * Auth: VERCEL_OIDC_TOKEN (auto-managed by Vercel runtime — never reference in application code).
 *
 * Phase 19-C-07: wrapped in runWithShadow('citations-v2', ...). When mode=off,
 * the legacy free-text source_citation path runs (no citations_v2). When mode=
 * shadow, the new structured-citations path runs in setImmediate background and
 * persists a ShadowComparison row for shadow-verdict scoring; the user sees
 * the legacy result. When mode=on, the structured-citations path is canonical.
 *
 * @param ticker - The ticker symbol (e.g., 'AAPL')
 * @param pkg - The assembled SourcePackage from the research pipeline
 * @param communityData - Structured community data from the scrape + extraction pass, or null if unavailable
 */
export async function runGeminiAnalysis(
  ticker: string,
  pkg: SourcePackage,
  communityData: {
    pinnedContent: string;
    nicheContent: string;
    nicheUrls: string[];
    pageCount: number;
    highlights: import('@/lib/types').CommunityHighlight[];
  } | null,
): Promise<AnalysisResult> {
  // Phase 19-C-07 inner shadow gate (citations-v2). Stays the canonical
  // baseline pathway. When citations-v2 mode is off, this returns the legacy
  // path; otherwise the structured-citations path either shadows or is on.
  const citationsMode = getCitationsV2Mode();
  const baseline = (): Promise<AnalysisResult> =>
    runWithShadow<AnalysisResult>(
      'citations-v2',
      () => generateAnalysis(ticker, pkg, communityData, false),
      () => generateAnalysis(ticker, pkg, communityData, true),
      citationsMode,
      { ticker },
    );

  // Phase 19-C-09 middle shadow gate (model-router). When FEATURE_MODEL_ROUTER
  // is off (default), `baseline` runs unchanged (today's flash-only behavior,
  // wrapped by the citations-v2 shadow). When shadow, the routed path runs in
  // setImmediate via runWithShadow + persists a ShadowComparison row + writes
  // a LearningEvent (event_type='model_router_decision') with cost telemetry.
  // When on, the routed path is canonical.
  const routerMode = FEATURES.model_router_mode;
  const routed = (): Promise<AnalysisResult> =>
    runWithShadow<AnalysisResult>(
      'model-router',
      baseline,
      () => geminiRouted(ticker, pkg, communityData),
      routerMode,
      { ticker },
    );

  // Phase 19-C-08 outer shadow gate (cove-two-pass). Per D-40, Pass 1 is
  // already done inside `routed` (Gemini emits AnalysisResult + the optional
  // `verification_claims` field — populated only when the upstream prompt
  // requested it). Pass 2 — runCoVe — runs an NLI verifier over each claim
  // against the SourcePackage and appends contradictions to source_warnings
  // additively. The `cove_verified` field is the structured surface for
  // shadow-verdict scoring; it is omitted on the OFF path so the shape stays
  // identical to today's behavior.
  //
  // Cost gate (T-19-C-08-02 in plan threat model): the router (19-C-09) is
  // expected to gate CoVe to high-stakes tickers in a follow-up wiring; for
  // now this layer just gates on the feature flag mode.
  const coveMode = FEATURES.cove_two_pass_mode;
  const result = await runWithShadow<AnalysisResult>(
    'cove-two-pass',
    routed,
    () => runWithCove(ticker, pkg, routed),
    coveMode,
    { ticker },
  );

  // Plan 20-B-01 — per-doc sentiment post-process pickup. The classifier ran
  // upstream in collectAllData and attached results as `_per_document_sentiment`
  // on the SourcePackage. Overwrite any LLM hallucination of this field with
  // the authoritative classifier output (S5 pinned-versions: classifier-emitted
  // records are the source of truth, never the analysis-prompt's reflection).
  const perDocSidecar = (pkg as SourcePackage & { _per_document_sentiment?: import('@/lib/types').PerDocSentimentResult[] })
    ._per_document_sentiment;
  // Plan 20-B-05 — per-aspect sidecar pickup. aggregateByAspect ran in
  // source-package.ts under FEATURE_PER_ASPECT_AGGREGATE. Same trust boundary
  // as engine_calibration / per_document_sentiment: authoritative numerics
  // overwrite any LLM hallucination of this field.
  const perAspectSidecar = (pkg as SourcePackage & { _per_aspect_sentiment?: import('@/lib/types').PerAspectSentimentEntry[] })
    ._per_aspect_sentiment;
  let out: AnalysisResult = result;
  if (Array.isArray(perDocSidecar)) {
    out = { ...out, per_document_sentiment: perDocSidecar };
  }
  if (Array.isArray(perAspectSidecar)) {
    out = { ...out, per_aspect_sentiment: perAspectSidecar };
  }

  // ── Plan 20-D-03 — Per-claim CoVe verification (post-Zod, pre-return) ───
  //
  // Three-mode contract:
  //   off    → bypass entirely; out.bullish_signals[*].verified stays undefined.
  //            Bit-identical to pre-plan behavior.
  //   shadow → verdicts computed + merged onto in-memory AnalysisResult. Persists
  //            via Report.analysis JSONB (the canonical shadow surface for this
  //            high-cardinality output — see Task 4 sub-decision). UI badge gate
  //            (NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED) keeps the (?) hidden.
  //   on     → verdicts merged + UI badge renders for verified ∈ {false, null}.
  //
  // Belt-and-suspender: try/catch swallows verifier failure so a partial HF
  // outage NEVER aborts the user-facing report (T-20-D-03-04 + the 19-C-08
  // runWithCove precedent).
  const perClaimMode = FEATURES.per_claim_verified_mode;
  if (perClaimMode !== 'off') {
    try {
      const { verifyClaimsBatch } = await import('@/lib/eval/per-claim-verifier');
      const bullishSignals = out.bullish_signals ?? [];
      const bearishSignals = out.bearish_signals ?? [];
      const risksList = ((out as AnalysisResult & { risks?: import('@/lib/types').AnalysisRisk[] }).risks) ?? [];
      const signals = [
        ...bullishSignals.map((s, i) => ({
          id: `bullish-${i}`,
          description: s.signal,
          supporting_evidence: s.source_citation,
        })),
        ...bearishSignals.map((s, i) => ({
          id: `bearish-${i}`,
          description: s.signal,
          supporting_evidence: s.source_citation,
        })),
        ...risksList.map((r, i) => ({
          id: `risks-${i}`,
          description: r.description,
          supporting_evidence: r.source_citation,
        })),
      ];
      if (signals.length > 0) {
        const verdicts = await verifyClaimsBatch(signals, pkg);
        const mergedBullish = bullishSignals.map((s, i) => {
          const v = verdicts.get(`bullish-${i}`);
          return v ? { ...s, verified: v } : s;
        });
        const mergedBearish = bearishSignals.map((s, i) => {
          const v = verdicts.get(`bearish-${i}`);
          return v ? { ...s, verified: v } : s;
        });
        const mergedRisks = risksList.length > 0
          ? risksList.map((r, i) => {
              const v = verdicts.get(`risks-${i}`);
              return v ? { ...r, verified: v } : r;
            })
          : undefined;
        out = {
          ...out,
          bullish_signals: mergedBullish,
          bearish_signals: mergedBearish,
          ...(mergedRisks !== undefined ? { risks: mergedRisks } : {}),
        };
      }
    } catch {
      // Belt-and-suspender — never abort the report on verifier failure.
    }
  }

  return out;
}

/**
 * Phase 19-C-08 (D-40): NEW path of the cove-two-pass shadow.
 *
 * 1. Runs the canonical analysis pipeline (Pass 1 — Gemini draft + Pass-1
 *    verification_claims).
 * 2. Calls runCoVe (Pass 2 — NLI verification) on the emitted claims against
 *    the SourcePackage.
 * 3. Returns an AnalysisResult with `cove_verified` populated and
 *    `source_warnings` extended additively with the CoVe contradictions.
 *
 * Failures inside runCoVe are non-fatal — the shadow runner already swallows
 * new-path errors, but we additionally guard at this layer so the analysis
 * still ships even if the NLI endpoint is unreachable.
 */
async function runWithCove(
  ticker: string,
  pkg: SourcePackage,
  pass1: () => Promise<AnalysisResult>,
): Promise<AnalysisResult> {
  const analysis = await pass1();

  // If Pass 1 didn't emit any verification claims (off-prompt run, or Gemini
  // chose not to populate the optional field), there's nothing to verify.
  // Return the analysis as-is — but tag cove_verified=[] so callers can
  // distinguish "ran with empty claims" from "off path".
  const claims = analysis.verification_claims ?? [];
  if (claims.length === 0) {
    return { ...analysis, cove_verified: [] };
  }

  try {
    const cove = await runCoVe({
      analysisResult: analysis,
      verificationClaims: claims,
      sourcePackage: pkg,
    });
    return {
      ...analysis,
      source_warnings: [
        ...(analysis.source_warnings ?? []),
        ...cove.contradictions,
      ],
      cove_verified: cove.verified,
    };
  } catch (err) {
    // Non-fatal — log and return the unverified analysis. Touch `ticker` so
    // the symbol is included in the error trail.
    console.error(`[gemini-analysis] CoVe pass-2 failed for ${ticker}:`, err);
    return analysis;
  }
}

/**
 * Phase 19-C-09 (D-41): the routed path. Resolves the engine context, picks a
 * model via routeModel(), runs generateAnalysis with that model, and writes a
 * LearningEvent row (event_type='model_router_decision') with cost telemetry.
 *
 * Schema reuse: prisma/schema.prisma's existing LearningEvent table already has
 * event_type, ticker, delta (Json), message — so this plan ships ZERO new
 * columns. The delta JSONB carries {model, tokens, estimated_cost_usd,
 * controversy, ic_decay_flag, market_cap_class}.
 *
 * This function never throws on telemetry-write failures (matches the
 * shadow-runner contract: new-path errors must NEVER propagate to caller).
 */
async function geminiRouted(
  ticker: string,
  pkg: SourcePackage,
  communityData: {
    pinnedContent: string;
    nicheContent: string;
    nicheUrls: string[];
    pageCount: number;
    highlights: import('@/lib/types').CommunityHighlight[];
  } | null,
): Promise<AnalysisResult> {
  // Look up engine context to get the routing inputs. Failures are non-fatal
  // — fall back to safe defaults that route to gemini-flash (the standard tier).
  let controversy = 0;
  let icDecayFlag = false;
  let capClassForRouter: 'mega' | 'large' | 'mid' | 'small' | 'unknown' = 'unknown';
  try {
    const ctx = await getEngineContextForTicker(ticker, new Date(pkg.assembled_at));
    // Controversy proxy from drift_z magnitude (0..1 clipped). Engine-context
    // does not currently expose a dedicated controversy_score field; drift_z
    // is the closest first-order signal (large drift ⇒ pattern in flux ⇒
    // controversial). Threshold 3σ saturates the proxy at 1.0.
    controversy = Math.min(1, Math.abs(ctx.drift_z ?? 0) / 3);
    capClassForRouter = ctx.cap_class as typeof capClassForRouter;
  } catch (err) {
    console.error('[gemini-analysis] router engine-context fetch failed:', err);
  }

  // ic_decay_flag is sourced from the diffusion LearnedPattern row at horizon=7
  // (Plan 19-A-05 wrote this nullable column on the existing table). Read direct
  // from Prisma so the router doesn't need EngineContext to expose the field.
  try {
    const row = await prisma.learnedPattern.findFirst({
      where: { signal_class: 'diffusion', cap_class: capClassForRouter, horizon_days: 7 },
      select: { ic_decay_flag: true },
      orderBy: { sample_size: 'desc' },
    });
    icDecayFlag = row?.ic_decay_flag === true;
  } catch (err) {
    console.error('[gemini-analysis] router ic_decay_flag lookup failed:', err);
  }

  const choice: ModelChoice = routeModel({
    ticker,
    controversy,
    ic_decay_flag: icDecayFlag,
    market_cap_class: capClassForRouter,
  });

  // Run the analysis with the chosen model (default citations-v2 OFF inside
  // the routed path — the citations shadow lives at the baseline branch).
  const { result, tokensUsed } = await generateAnalysisWithUsage(
    ticker,
    pkg,
    communityData,
    /* useCitationsV2 */ getCitationsV2Mode() === 'on',
    choice,
  );

  // Cost telemetry — write into existing LearningEvent table (no schema
  // change). Failures must not propagate to caller.
  const estimated_cost_usd = estimateCost(choice, tokensUsed);
  try {
    await prisma.learningEvent.create({
      data: {
        event_type: 'model_router_decision',
        ticker,
        message: `routed ${ticker} to ${choice} (${tokensUsed} tokens, $${estimated_cost_usd.toFixed(5)})`,
        delta: {
          model: choice,
          tokens: tokensUsed,
          estimated_cost_usd,
          controversy,
          ic_decay_flag: icDecayFlag,
          market_cap_class: capClassForRouter,
        },
      },
    });
  } catch (err) {
    console.error('[gemini-analysis] router LearningEvent persist failed:', err);
  }

  return result;
}

/**
 * Plan 19-C-09 helper: same as generateAnalysis but also returns the token
 * usage from the underlying generateText call so the router path can write
 * cost telemetry. A thin shim around generateAnalysis that re-invokes the
 * AI Gateway with the chosen model and surfaces usage.totalTokens.
 *
 * Implementation note: rather than thread a usage handle through every
 * generateAnalysis call site, we call generateAnalysis with a model override
 * and have it return token usage via a side-channel object. This keeps the
 * 19-C-07 generateAnalysis signature backward-compatible for the citations-v2
 * shadow path (which doesn't need the usage).
 */
async function generateAnalysisWithUsage(
  ticker: string,
  pkg: SourcePackage,
  communityData: Parameters<typeof generateAnalysis>[2],
  useCitationsV2: boolean,
  modelOverride: ModelChoice,
): Promise<{ result: AnalysisResult; tokensUsed: number }> {
  // Side-channel for usage. generateAnalysis writes into this when
  // modelOverride is set, then we return both the result and the tokens.
  const usageOut: { tokens: number } = { tokens: 0 };
  const result = await generateAnalysis(ticker, pkg, communityData, useCitationsV2, {
    modelOverride,
    usageOut,
  });
  return { result, tokensUsed: usageOut.tokens };
}

/**
 * Inner generator. `useCitationsV2=false` → legacy prompt + no citations_v2 on
 * the result (free-text source_citation already inside bullish/bearish signals).
 * `useCitationsV2=true` → CITATIONS section appended to the user prompt + the
 * resulting `output.citations_v2` is filtered to only include entries whose URL
 * appears in the assembled SourcePackage list (T-19-C-07-01: LLM may not invent
 * URLs even when it tries).
 */
async function generateAnalysis(
  ticker: string,
  pkg: SourcePackage,
  communityData: {
    pinnedContent: string;
    nicheContent: string;
    nicheUrls: string[];
    pageCount: number;
    highlights: import('@/lib/types').CommunityHighlight[];
  } | null,
  useCitationsV2: boolean,
  // Phase 19-C-09 (D-41): optional router context. When provided, the chosen
  // ModelChoice is mapped to a Vercel AI Gateway model string and total tokens
  // are written into routerCtx.usageOut.tokens for the caller's cost telemetry.
  // When undefined (default — citations-v2 path), the legacy
  // 'google/gemini-3-flash' string is used and usage is ignored.
  routerCtx?: { modelOverride: ModelChoice; usageOut: { tokens: number } },
): Promise<AnalysisResult> {
  const brief = formatResearchBrief(pkg);
  const newsUrls = extractNewsUrls(pkg);
  const combinedContent = communityData
    ? [communityData.pinnedContent, communityData.nicheContent].filter(Boolean).join('\n\n---\n\n')
    : '';

  // Phase 19-C-07 (D-39): assemble structured citations from the SourcePackage.
  // The LLM is shown this list and must SELECT (not fabricate). When useCitationsV2
  // is false (shadow off path), the section is omitted and the legacy prompt
  // is unchanged.
  const assembledCitations = useCitationsV2 ? assembleCitationsFromPackage(pkg) : [];
  const allowedUrls = new Set<string>(
    assembledCitations.map((c) => c.url).filter((u): u is string => typeof u === 'string'),
  );

  const baseUserPrompt = buildUserPrompt(
    brief,
    newsUrls,
    combinedContent,
    pkg.sentiment_intelligence,
    communityData?.highlights ?? [],
    pkg.news.items ?? [],
  );
  // Phase 19-C-08 (D-40) — CoVe Pass-1 prompt instruction.
  // When the cove-two-pass flag is shadow OR on, append a short instruction
  // asking Gemini to ALSO emit `verification_claims: string[]` (3 short,
  // checkable factual claims) so Pass 2 (runCoVe) can NLI-verify them
  // against the SourcePackage. The instruction is additive and harmless
  // when the flag is off (omitted entirely).
  //
  // Plan 20-Z-04 Task 5 — pinned to v1 explicitly. A v2 of this prompt is
  // registered (gemini-cove-pass1-instruction@v2 prefers numeric-grounded
  // claims) but NOT wired into the live call site yet.
  // TODO(20-Z-05): switch this pin to default (latest non-deprecated = v2)
  // once the LLM-as-judge eval harness in 20-Z-05 confirms v2 is a
  // non-regression on numeric-grounding + citation-coverage metrics.
  const coveModeInner = FEATURES.cove_two_pass_mode;
  const coveSection =
    coveModeInner !== 'off'
      ? renderPrompt('gemini-cove-pass1-instruction', {}, 'v1')
      : '';

  const userPrompt =
    (useCitationsV2 ? renderCitationsSection(assembledCitations) + '\n' : '') +
    coveSection +
    baseUserPrompt;

  // Fetch engine calibration context. Failures are non-fatal — the report
  // generates without an engine_calibration block (UI hides the panel).
  let engineCtx: EngineContext | null = null;
  try {
    engineCtx = await getEngineContextForTicker(ticker, new Date(pkg.assembled_at));
  } catch (err) {
    console.error('[gemini-analysis] engine context fetch failed:', err);
  }

  // Phase 16: full system prompt now composes BOTH engine + technical blocks via
  // buildSystemPrompt (so the LLM sees the dual-class context in one message).
  const systemPrompt = buildSystemPrompt(engineCtx);

  // Phase 30 D-14 — explicit model pin, no AI-Gateway fuzzy routing.
  // R-3 resolution: 3-tier slugs reflect the live codebase; CONTEXT.md mentions
  // 2.5 slugs but the live codebase has been on 3-tier since Phase 19-C-09.
  // The haiku fallback branch is removed because D-14 mandates explicit pinning
  // to gemini-3-pro for analysis; haiku routing was previously a fuzzy-routing
  // artifact from the now-deprecated AI-Gateway auto-route path and never
  // reflected an intentional product decision for the main analysis call.
  //
  // If you need to change this model, also update
  // tests/unit/gemini-analysis.model-pin.unit.test.ts and re-verify the
  // Phase 30 done-gate cost SQL.
  //
  // Per R-12 — DO NOT delete src/lib/reasoning/router.ts. The router still
  // runs, emits LearningEvent rows with event_type='model_router_decision',
  // and tracks token usage. We just ignore its `modelOverride` output for the
  // model SELECTION at this call site. The usage write below
  // (`routerCtx.usageOut.tokens`) is preserved.
  const modelString = 'google/gemini-3-pro';

  try {
    // Plan 20-Z-03: wrap the Gemini call with telemetry. cost_usd_estimator
    // reads token usage off the AI SDK return shape and multiplies by the
    // pinned 2026-Q1 GEMINI_TOKEN_RATES. Wrapper is fire-and-forget on the
    // INSERT; caller sees identical return value + timing.
    const { output, usage } = await withTelemetry(
      'gemini',
      () =>
        generateText({
          model: modelString,
          output: Output.object({ schema: AnalysisResultSchema }),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      {
        ticker,
        cost_usd_estimator: (r) => {
          const u = (r as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
          const inT = u?.inputTokens ?? 0;
          const outT = u?.outputTokens ?? 0;
          return inT * GEMINI_TOKEN_RATES.input + outT * GEMINI_TOKEN_RATES.output;
        },
      },
    );
    // Surface token usage to the caller's side-channel (cost telemetry).
    // generateText returns { usage: { totalTokens?: number } } from the AI SDK.
    if (routerCtx) {
      routerCtx.usageOut.tokens = usage?.totalTokens ?? 0;
    }

    // Build the authoritative engine_calibration block. Numeric fields come
    // from the database via engineCtx; LLM contributes only the prose
    // (engine_alignment / engine_disagreement / technical_alignment /
    // technical_disagreement). Phase 16 trust-boundary expansion: ALL technical_*
    // numeric fields + horizon_calibrations + agreement are post-process
    // overwritten from engineCtx — the LLM cannot inject false posteriors.
    let engine_calibration: EngineCalibration | undefined;
    if (engineCtx) {
      const llm = output.engine_calibration ?? {
        engine_alignment: null,
        engine_disagreement: null,
        technical_alignment: null,
        technical_disagreement: null,
      };
      engine_calibration = {
        // Diffusion fields (existing — unchanged semantics)
        cycle_count: engineCtx.cycle_count,
        flow_pattern: engineCtx.flow_pattern,
        cap_class: engineCtx.cap_class,
        trace_window_size: engineCtx.trace_window_size,
        posterior_mean: engineCtx.posterior_mean,
        ci_low: engineCtx.ci_low,
        ci_high: engineCtx.ci_high,
        sample_size: engineCtx.sample_size,
        status: engineCtx.status,
        brier_in_sample: engineCtx.brier_in_sample,
        brier_null: engineCtx.brier_null,
        drift_z: engineCtx.drift_z,
        logistic_score: engineCtx.logistic_score,
        logistic_ci_low: engineCtx.logistic_ci_low,
        logistic_ci_high: engineCtx.logistic_ci_high,
        logistic_sample_size: engineCtx.logistic_sample_size,
        predicted_at: engineCtx.predicted_at.toISOString(),
        engine_alignment: llm.engine_alignment ?? null,
        engine_disagreement: llm.engine_disagreement ?? null,
        diffusion_sparkline: engineCtx.diffusion_sparkline,

        // ── Phase 16 — technical signal class (numeric overwrites) ─────
        technical_pattern: engineCtx.technical_pattern,
        technical_posterior_mean: engineCtx.technical_posterior_mean,
        technical_ci: engineCtx.technical_ci,
        technical_sample_size: engineCtx.technical_sample_size,
        technical_status: engineCtx.technical_status,
        horizon_calibrations: engineCtx.horizon_calibrations,
        combined_logistic_score: engineCtx.combined_logistic_score,
        agreement: engineCtx.agreement,
        // LLM-authored prose only (numeric values were overwritten above)
        technical_alignment: llm.technical_alignment ?? null,
        technical_disagreement: llm.technical_disagreement ?? null,

        // ── Phase 17-04 — institutional + insider numeric overwrites (D-04) ──
        // Ten numeric/categorical fields are always overwritten from engineCtx
        // regardless of what the LLM returned. Prose strings are left as-is (D-05).
        // Types now correctly use InstitutionalBucket | null and InsiderBucket | null
        // (widened in types.ts task — no `as` casts required).
        institutional_pattern:         engineCtx.institutional_pattern ?? null,
        institutional_posterior_mean:  engineCtx.institutional_posterior_mean ?? null,
        institutional_ci:              engineCtx.institutional_ci ?? null,
        institutional_sample_size:     engineCtx.institutional_sample_size ?? null,
        institutional_status:          engineCtx.institutional_status ?? null,
        insider_pattern:               engineCtx.insider_pattern ?? null,
        insider_posterior_mean:        engineCtx.insider_posterior_mean ?? null,
        insider_ci:                    engineCtx.insider_ci ?? null,
        insider_sample_size:           engineCtx.insider_sample_size ?? null,
        insider_status:                engineCtx.insider_status ?? null,
        // Prose strings — NOT overwritten (these are the LLM's sole contribution per D-05)
        institutional_alignment:       (llm as { institutional_alignment?: string | null }).institutional_alignment ?? null,
        institutional_disagreement:    (llm as { institutional_disagreement?: string | null }).institutional_disagreement ?? null,
        insider_alignment:             (llm as { insider_alignment?: string | null }).insider_alignment ?? null,
        insider_disagreement:          (llm as { insider_disagreement?: string | null }).insider_disagreement ?? null,

        // ── Phase 18-07 — effective sample size numeric overwrites (D-04) ────
        // ESS values are authoritative numerics — written by the engine, NEVER
        // by the LLM. The Zod schema accepts these from the LLM only so we can
        // discard them here and replace with engineCtx values. Mirrors the
        // Phase 17-04 pattern for institutional/insider numerics.
        effective_sample_size: engineCtx.effective_sample_size,
        technical_ess:         engineCtx.technical_ess,
        institutional_ess:     engineCtx.institutional_ess,
        insider_ess:           engineCtx.insider_ess,
        logistic_ess:          engineCtx.logistic_ess,
      };
    }

    // Phase 19-C-07 (D-39) — citations_v2 post-process.
    // Filter LLM-emitted citations to ONLY include entries whose URL appears
    // in the assembled SourcePackage list (T-19-C-07-01: defense-in-depth even
    // if Gemini ignores the "do not invent URLs" instruction). Re-validate
    // each entry against CitationSchema in case the LLM produced a row that
    // breaks the analyst-mandatory-URL invariant.
    let citations_v2: Citation[] | undefined;
    if (useCitationsV2) {
      const llmCitations = (output.citations_v2 ?? []) as Citation[];
      const filtered: Citation[] = [];
      for (const c of llmCitations) {
        if (c.url && !allowedUrls.has(c.url)) continue; // fabricated URL — drop
        filtered.push(c);
      }
      // If the LLM returned nothing (or everything was fabricated), fall back
      // to the assembled list so users always see SOME citation provenance.
      citations_v2 = filtered.length > 0 ? filtered : assembledCitations;
    }

    return {
      ticker,
      company_name: pkg.company_name,
      analyzed_at: new Date().toISOString(),
      security_type: pkg.security_type,
      market_snapshot: extractMarketSnapshot(pkg),
      community_sentiment_available: combinedContent.length > 0,
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
      // Post-Phase-19: append data-pipeline provider attribution. The LLM
      // emits publisher names (CNBC, Reuters) from news items but doesn't
      // know which retrieval-layer providers (Twelve Data, Exa, Yahoo,
      // Finnhub, Polygon, Anthropic web search) actually fired. We derive
      // those from the SourcePackage and append them so the UI credits the
      // full pipeline, not just the publishers. Dedup on name in case the
      // LLM also surfaced one (e.g. "Yahoo Finance") on its own.
      sources_used: (() => {
        const llmSources = output.sources_used ?? [];
        const providers = derivePipelineProviders(pkg);
        const llmNames = new Set(llmSources.map((s) => s.name.toLowerCase()));
        const additions = providers.filter((p) => !llmNames.has(p.name.toLowerCase()));
        return [...llmSources, ...additions];
      })(),
      future_projection: output.future_projection || undefined,
      community_sources_scraped: communityData?.pageCount && communityData.pageCount > 0 ? communityData.pageCount : undefined,
      sentiment_intelligence: output.sentiment_intelligence_summary ? {
        stocktwits_bull_pct: output.sentiment_intelligence_summary.stocktwits_bull_pct ?? null,
        stocktwits_bear_pct: output.sentiment_intelligence_summary.stocktwits_bear_pct ?? null,
        stocktwits_message_count: output.sentiment_intelligence_summary.stocktwits_message_count ?? null,
        stocktwits_is_trending: output.sentiment_intelligence_summary.stocktwits_is_trending ?? null,
        put_call_ratio: output.sentiment_intelligence_summary.put_call_ratio ?? null,
        put_call_interpretation: output.sentiment_intelligence_summary.put_call_interpretation ?? null,
        // Post-Phase-19 — overlay aggregated cross-source fields from the
        // SourcePackage directly (server-side truth, not LLM-echoed) so the UI
        // gets the smoothed multi-source sentiment without the LLM re-emitting it.
        aggregated_bull_pct: pkg.sentiment_intelligence?.aggregated_bull_pct ?? null,
        aggregated_bear_pct: pkg.sentiment_intelligence?.aggregated_bear_pct ?? null,
        sentiment_source_count: pkg.sentiment_intelligence?.sentiment_source_count ?? null,
        sentiment_components: pkg.sentiment_intelligence?.sentiment_components ?? null,
      } : undefined,
      community_highlights: output.community_highlights?.length
        ? output.community_highlights
        : undefined,
      community_analysis: output.community_analysis || undefined,
      citations_v2,
      // Phase 19-C-08 (D-40): Pass-1 verification claims surface forward
      // through the result. runGeminiAnalysis's CoVe shadow layer reads this
      // field to drive Pass-2 NLI verification. When the cove-two-pass flag
      // is off, the field is still passed through (the LLM only emits it
      // when prompted; under the off-prompt run it stays undefined).
      verification_claims: output.verification_claims ?? undefined,
      engine_calibration,
    };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      const rawText = (err as NoObjectGeneratedError).text?.slice(0, 200) ?? 'none';
      throw new Error(`Gemini returned unstructured response. Raw: ${rawText}`);
    }
    throw err;
  }
}
