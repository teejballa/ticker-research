# Community Intelligence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the raw community markdown dump with a structured two-pass pipeline that discovers niche communities adaptively, scrapes them via Firecrawl, extracts named per-community standout quotes via Haiku, and renders a dedicated Community Intelligence section in the report.

**Architecture:** (1) Haiku runs two web searches to discover niche communities specific to the ticker/company, excluding the 3 pinned mainstream sites. (2) Firecrawl scrapes the 3 pinned URLs + top 5-6 niche discovered URLs in two separate pools. (3) A second Haiku call reads all scraped markdown and extracts structured per-community findings. (4) Gemini receives structured highlights (not raw markdown) and writes a narrative community_analysis paragraph + community_highlights array. (5) ResearchReport renders a new Community Intelligence card.

**Tech Stack:** Anthropic SDK (Haiku), Firecrawl JS, Zod, TypeScript, React/Tailwind

---

## Files Touched

- Modify: `src/lib/gemini-analysis.ts` — scraper rewrite, new extraction function, schema additions, prompt updates
- Modify: `src/lib/types.ts` — add `CommunityHighlight` interface + fields to `AnalysisResult`
- Modify: `src/components/ResearchReport.tsx` — new Community Intelligence card

---

### Task 1: Add types for community highlights

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Add `CommunityHighlight` interface after the `CatalystEvent` interface (~line 154)**

```typescript
export interface CommunityHighlight {
  community_name: string;           // e.g. "r/SecurityAnalysis", "BioPharma Catalyst Forum"
  community_type: 'mainstream' | 'niche';
  audience: string;                 // e.g. "institutional-adjacent analysts"
  standout_quote: string;           // actual user opinion extracted from scraped content
  theme: string;                    // e.g. "Accounting concerns / earnings quality"
  sentiment: 'bullish' | 'bearish' | 'neutral';
  engagement_signal: 'high' | 'medium' | 'low';
}
```

**Step 2: Add fields to `AnalysisResult` interface (after `sentiment_intelligence` field, before closing `}`):**

```typescript
  community_highlights?: CommunityHighlight[];   // per-community structured findings
  community_analysis?: string;                   // Gemini-written narrative paragraph
```

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(community): add CommunityHighlight type and AnalysisResult fields"
```

---

### Task 2: Rewrite `scrapeCommunitySentiment()` with two-pool scraping

**Files:**
- Modify: `src/lib/gemini-analysis.ts`

**Context:** The function currently returns raw scraped markdown as a string. We're keeping that signature (`Promise<string>`) for now but will change it in Task 3 after the extraction pass is added. This task just splits scraping into two pools.

**Step 1: Replace the `domainTier()` function and `scrapeCommunitySentiment()` with the following.** Find the section starting at `// ---- Firecrawl community sentiment gatherer ----` and replace everything from there through the closing `}` of `scrapeCommunitySentiment()`:

```typescript
// ---- Firecrawl community sentiment gatherer ----

// Pinned mainstream URLs — always scraped regardless of ticker.
// StockTwits web page stripped (login wall) — structured API data from stocktwits.ts covers it.
const PINNED_URLS = [
  'https://www.reddit.com/search/?q={TICKER}&sort=new',
  'https://seekingalpha.com/symbol/{TICKER}',
];

function buildPinnedUrls(ticker: string): string[] {
  return PINNED_URLS.map(u => u.replace('{TICKER}', ticker));
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
 * Two-pool community scraping:
 *   Pool A (pinned): Reddit + SeekingAlpha — always scraped.
 *   Pool B (niche):  Haiku discovers sector-specific niche communities for this ticker,
 *                    excluding mainstream sites. Top 5-6 scraped via Firecrawl.
 *
 * Returns: { pinnedContent: string, nicheContent: string, nicheUrls: string[] }
 * Sets _lastCommunityScrapePageCount to total non-empty pages scraped.
 */
export async function scrapeCommunitySentiment(
  ticker: string,
  companyName: string,
): Promise<{ pinnedContent: string; nicheContent: string; nicheUrls: string[] }> {
  _lastCommunityScrapePageCount = 0;

  const empty = { pinnedContent: '', nicheContent: '', nicheUrls: [] };
  if (!process.env.FIRECRAWL_API_KEY) return empty;

  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

  // ── Pool A: Pinned mainstream URLs ──────────────────────────────────────
  const pinnedUrls = buildPinnedUrls(ticker);
  const pinnedScraped = await Promise.all(pinnedUrls.map(u => scrapeUrlWithFirecrawl(fc, u)));
  const pinnedPages = pinnedScraped.filter(Boolean);

  // ── Pool B: Niche discovery via Haiku ───────────────────────────────────
  let nicheUrls: string[] = [];

  try {
    // Search 1: community mapping — what niche places discuss this stock?
    const mapResponse = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
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
      model: 'claude-haiku-4-5-20251001',
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

  _lastCommunityScrapePageCount = pinnedPages.length + nichePages.length;

  return {
    pinnedContent: pinnedPages.join('\n\n---\n\n'),
    nicheContent: nichePages.join('\n\n---\n\n'),
    nicheUrls: uniqueNiche,
  };
}
```

**Step 2: Commit**

```bash
git add src/lib/gemini-analysis.ts
git commit -m "feat(community): rewrite scrapeCommunitySentiment() with two-pool niche discovery"
```

---

### Task 3: Add `extractCommunityHighlights()` function

**Files:**
- Modify: `src/lib/gemini-analysis.ts`

**Step 1: Add the following function immediately after `scrapeCommunitySentiment()` (before `// ---- Market snapshot extractor ----`):**

```typescript
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
    `- standout_quote must be an ACTUAL USER OPINION or concern, not an article headline or price summary.\n` +
    `- If a page has no real user opinions (just price data, login walls, or article text), SKIP it.\n` +
    `- community_name should be the real name (e.g. "r/SecurityAnalysis", "ValueInvestorsClub", "BioPharma Catalyst Forum").\n` +
    `- community_type: "mainstream" for Reddit/SeekingAlpha; "niche" for everything else.\n` +
    `- audience: describe who uses this community in 3-6 words (e.g. "institutional-adjacent analysts", "retail momentum traders").\n` +
    `- engagement_signal: "high" if many active replies/upvotes visible, "low" if sparse.\n` +
    `\nNiche URLs found (for reference): ${nicheUrls.join(', ')}\n\n` +
    `SCRAPED CONTENT:\n${allContent.slice(0, 12000)}\n\n` +
    `Return ONLY a JSON array. Each element:\n` +
    `{"community_name":"...","community_type":"mainstream|niche","audience":"...","standout_quote":"...","theme":"...","sentiment":"bullish|bearish|neutral","engagement_signal":"high|medium|low"}`;

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: extractionPrompt }],
    });

    const textBlock = response.content.filter(b => b.type === 'text').pop();
    const rawText = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
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
```

**Step 2: Commit**

```bash
git add src/lib/gemini-analysis.ts
git commit -m "feat(community): add extractCommunityHighlights() Haiku extraction pass"
```

---

### Task 4: Add `community_highlights` and `community_analysis` to Zod schema + SYSTEM_PROMPT

**Files:**
- Modify: `src/lib/gemini-analysis.ts`

**Step 1: Add `CommunityHighlightSchema` near the top of the file, after `CatalystEventSchema`:**

```typescript
const CommunityHighlightSchema = z.object({
  community_name: z.string(),
  community_type: z.enum(['mainstream', 'niche']),
  audience: z.string(),
  standout_quote: z.string(),
  theme: z.string(),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  engagement_signal: z.enum(['high', 'medium', 'low']),
});
```

**Step 2: Add to `AnalysisResultSchema` (after `sentiment_intelligence_summary`):**

```typescript
  community_highlights: z.array(CommunityHighlightSchema).optional().default([]),
  community_analysis: z.string().optional().default(''),
```

**Step 3: Add the following two sections to `SYSTEM_PROMPT` after the `sentiment_intelligence_summary` instruction (before `CRITICAL RULES:`):**

```
community_highlights: Echo back the structured community findings exactly as provided in the COMMUNITY INTELLIGENCE section. Do not invent communities. Return empty array if section is absent.

community_analysis: Write one sentence per community found in the COMMUNITY INTELLIGENCE section. For each: name the community, characterize who uses it and whether it is niche or mainstream, describe the specific topic or concern discussed, and state whether this is bullish or bearish. Use the format: "In [community name], [audience characterization], members [discussed/raised/questioned] [specific topic], [sentiment direction implication]." Combine into a single flowing paragraph with no bullet points. If no community data is available, return an empty string.
```

**Step 4: Add rule 9 to CRITICAL RULES:**

```
9. community_analysis must name each community individually and follow the sentence-per-community format — do not write vague summaries like "communities were bearish".
```

**Step 5: Commit**

```bash
git add src/lib/gemini-analysis.ts
git commit -m "feat(community): add community schema fields and SYSTEM_PROMPT instructions"
```

---

### Task 5: Update `buildUserPrompt()` to inject structured community highlights

**Files:**
- Modify: `src/lib/gemini-analysis.ts`

**Step 1: Update `buildUserPrompt()` signature to accept structured highlights alongside raw content. Find the function signature:**

```typescript
export function buildUserPrompt(
  brief: string,
  newsUrls: string[],
  communityContent: string,
  sentimentIntelligence?: {
```

Replace with:

```typescript
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
): string {
```

(Remove the closing `: string {` from the original signature since it moves to the new one.)

**Step 2: After the existing community content injection block (the `if (communityContent)` block), add the structured highlights injection:**

```typescript
  // Inject structured community highlights for Gemini to echo + synthesize
  if (communityHighlights && communityHighlights.length > 0) {
    prompt += `\n\nCOMMUNITY INTELLIGENCE\n`;
    prompt += `Structured findings extracted from ${communityHighlights.length} community sources:\n\n`;
    for (const h of communityHighlights) {
      prompt += `Community: ${h.community_name} (${h.community_type}, audience: ${h.audience})\n`;
      prompt += `Standout quote: "${h.standout_quote}"\n`;
      prompt += `Theme: ${h.theme}\n`;
      prompt += `Sentiment: ${h.sentiment} | Engagement: ${h.engagement_signal}\n\n`;
    }
  }
```

**Step 3: Commit**

```bash
git add src/lib/gemini-analysis.ts
git commit -m "feat(community): inject structured community highlights into Gemini prompt"
```

---

### Task 6: Wire the new pipeline in `runGeminiAnalysis()`

**Files:**
- Modify: `src/lib/gemini-analysis.ts`

**Step 1: Update `runGeminiAnalysis()` signature to accept `companyName`:**

```typescript
export async function runGeminiAnalysis(
  ticker: string,
  pkg: SourcePackage,
  communityContent: string,
): Promise<AnalysisResult> {
```

→ Note: `communityContent` is now unused as a direct string (the caller will call the new functions). But to avoid breaking the call site, we'll instead change the function to accept structured data. Replace the signature and body as follows:

Find `export async function runGeminiAnalysis(` and replace the whole function signature + first few lines:

```typescript
export async function runGeminiAnalysis(
  ticker: string,
  pkg: SourcePackage,
  communityData: {
    pinnedContent: string;
    nicheContent: string;
    nicheUrls: string[];
    highlights: import('@/lib/types').CommunityHighlight[];
  } | null,
): Promise<AnalysisResult> {
  const brief = formatResearchBrief(pkg);
  const newsUrls = extractNewsUrls(pkg);
  const combinedContent = communityData
    ? [communityData.pinnedContent, communityData.nicheContent].filter(Boolean).join('\n\n---\n\n')
    : '';
  const userPrompt = buildUserPrompt(
    brief,
    newsUrls,
    combinedContent,
    pkg.sentiment_intelligence,
    communityData?.highlights ?? [],
  );
```

**Step 2: Update the `return` block in `runGeminiAnalysis()` to include new fields (after `sentiment_intelligence:`):**

```typescript
      community_highlights: output.community_highlights?.length
        ? output.community_highlights
        : undefined,
      community_analysis: output.community_analysis || undefined,
```

**Step 3: Update `community_sentiment_available` to use combinedContent:**

```typescript
      community_sentiment_available: combinedContent.length > 0,
```

**Step 4: Commit**

```bash
git add src/lib/gemini-analysis.ts
git commit -m "feat(community): update runGeminiAnalysis() to accept structured community data"
```

---

### Task 7: Update the analysis API route to call the new pipeline

**Files:**
- Find and modify the API route that calls `scrapeCommunitySentiment()` and `runGeminiAnalysis()`

**Step 1: Find the call site:**

```bash
grep -rn "scrapeCommunitySentiment\|runGeminiAnalysis" src/app/api/ --include="*.ts"
```

**Step 2: Replace the call pattern from:**

```typescript
const communityContent = await scrapeCommunitySentiment(ticker);
const result = await runGeminiAnalysis(ticker, pkg, communityContent);
```

To:

```typescript
const scraped = await scrapeCommunitySentiment(ticker, pkg.company_name);
const highlights = await extractCommunityHighlights(
  scraped.pinnedContent,
  scraped.nicheContent,
  scraped.nicheUrls,
);
const result = await runGeminiAnalysis(ticker, pkg, { ...scraped, highlights });
```

**Step 3: Update the import if `extractCommunityHighlights` is not already imported from `gemini-analysis`.**

**Step 4: Commit**

```bash
git add src/app/api/
git commit -m "feat(community): wire new scrape+extract+analyze pipeline in API route"
```

---

### Task 8: Add Community Intelligence card to `ResearchReport.tsx`

**Files:**
- Modify: `src/components/ResearchReport.tsx`

**Step 1: Add `community_highlights` and `community_analysis` to the destructure block (after `sentiment_intelligence`):**

```typescript
    community_highlights,   // new community intelligence
    community_analysis,     // new community narrative
```

**Step 2: Find the closing `}` of the Sentiment Intelligence card (around line 313) and insert the new Community Intelligence card immediately after:**

```tsx
{/* Community Intelligence Card */}
{community_highlights && community_highlights.length > 0 && (
  <div className="bg-surface-container rounded-xl p-5 space-y-4">
    <h3 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant flex items-center gap-2">
      <span className="material-symbols-outlined text-sm">groups</span>
      Community Intelligence
      <span className="ml-auto text-[9px] font-normal normal-case text-on-surface-variant/60">
        {community_highlights.length} source{community_highlights.length !== 1 ? 's' : ''} analyzed
      </span>
    </h3>

    {/* Prose narrative */}
    {community_analysis && (
      <p className="text-xs text-on-surface-variant leading-relaxed">
        {community_analysis}
      </p>
    )}

    {/* Per-community rows */}
    <div className="space-y-3">
      {community_highlights.map((h, i) => (
        <div key={i} className="flex items-start gap-3 p-3 bg-surface-container-low rounded-lg hover:bg-surface-container-high transition-colors">
          {/* Sentiment icon */}
          <span
            className={`material-symbols-outlined text-sm mt-0.5 shrink-0 ${
              h.sentiment === 'bullish' ? 'text-secondary' :
              h.sentiment === 'bearish' ? 'text-error' :
              'text-on-surface-variant'
            }`}
          >
            {h.sentiment === 'bullish' ? 'trending_up' : h.sentiment === 'bearish' ? 'trending_down' : 'remove'}
          </span>

          <div className="flex-1 min-w-0 space-y-1">
            {/* Community name + type badge + audience */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] font-bold text-on-surface">{h.community_name}</span>
              <span className={`text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded ${
                h.community_type === 'niche'
                  ? 'bg-tertiary/10 text-tertiary border border-tertiary/20'
                  : 'bg-surface-container-highest text-on-surface-variant border border-outline/20'
              }`}>
                {h.community_type}
              </span>
              <span className="text-[10px] text-on-surface-variant/70">{h.audience}</span>
            </div>

            {/* Theme */}
            <div className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">{h.theme}</div>

            {/* Standout quote */}
            <blockquote className="text-[11px] text-on-surface leading-relaxed italic border-l-2 border-outline/30 pl-2">
              "{h.standout_quote}"
            </blockquote>
          </div>

          {/* Engagement signal */}
          <span className={`text-[9px] font-bold shrink-0 mt-0.5 ${
            h.engagement_signal === 'high' ? 'text-secondary' :
            h.engagement_signal === 'medium' ? 'text-on-surface-variant' :
            'text-on-surface-variant/50'
          }`}>
            {h.engagement_signal}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

**Step 3: Commit**

```bash
git add src/components/ResearchReport.tsx
git commit -m "feat(community): add Community Intelligence card to ResearchReport"
```

---

### Task 9: End-to-end smoke test

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Run a report on a well-known ticker with active community discussion (e.g. NVDA or TSLA)**

Navigate to `http://localhost:3000`, enter `NVDA`, and run a full report.

**Step 3: Verify in the browser:**
- Community Intelligence card appears between Sentiment Intelligence and Bullish/Bearish
- At least 1-2 entries are marked `niche`
- Each row shows: community name, niche/mainstream badge, audience, theme, quoted standout, sentiment icon
- Prose narrative paragraph names communities individually
- `community_sources_scraped` count in Sentiment Intelligence card reflects the higher scrape count

**Step 4: Check terminal logs for any Haiku or Firecrawl errors**

**Step 5: Commit any fixes, then deploy**

```bash
vercel --prod
```

---

## Rollback

If the Haiku extraction pass causes timeouts (unlikely — it's a single call with no web search):
- Set `communityHighlights` to `[]` in the API route (skip extraction pass)
- Gemini will produce empty `community_highlights` and empty `community_analysis`
- The card simply won't render (conditional render guard)
- No other functionality is affected
