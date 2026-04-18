# Wall Street Report Upgrade — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the research pipeline and report to produce institutional-grade output by (1) wiring already-collected Finnhub/Polygon data into the Gemini prompt, (2) expanding the Gemini output schema with executive summary, investment thesis, key risks, valuation context, and catalyst watch, (3) upgrading the system prompt to instruct Wall Street-quality writing, (4) rendering the new sections in the report UI, and (5) creating roadmap phase stubs for future deep-adds (Phase 13–15).

**Architecture:** The fix is additive across four files — `research-brief.ts` (append supplementary text blocks to prompt), `types.ts` (add new AnalysisResult fields), `gemini-analysis.ts` (expand schema + rewrite system prompt), `ResearchReport.tsx` (render new sections). All new fields are optional on `AnalysisResult` for backward compatibility with stored reports. Phase stubs are pure documentation — no code.

**Tech Stack:** TypeScript, Zod (schema validation), Next.js App Router, Tailwind CSS, Vitest

---

## Task 1: Wire Finnhub/Polygon data into the Gemini prompt

**Files:**
- Modify: `src/lib/research-brief.ts`
- Test: `src/lib/__tests__/research-brief.test.ts`

**Step 1: Write the failing test**

Add this test block at the end of `src/lib/__tests__/research-brief.test.ts`, inside the `describe('formatResearchBrief', ...)` block — before the closing `});`:

```typescript
it('includes Finnhub text_block when supplementary source is available', () => {
  const pkg: SourcePackage = {
    ...basePackage,
    supplementary_market_data: {
      sources: [
        {
          name: 'Finnhub',
          fetched_at: '2026-04-17T10:00:00Z',
          text_block: '=== MARKET DATA: FINNHUB ===\nBeta: 1.2\nROE (TTM): 145%',
          available: true,
        },
      ],
    },
  };
  const result = formatResearchBrief(pkg);
  expect(result).toContain('=== MARKET DATA: FINNHUB ===');
  expect(result).toContain('Beta: 1.2');
  expect(result).toContain('ROE (TTM): 145%');
});

it('excludes text_block when supplementary source is not available', () => {
  const pkg: SourcePackage = {
    ...basePackage,
    supplementary_market_data: {
      sources: [
        {
          name: 'Finnhub',
          fetched_at: '2026-04-17T10:00:00Z',
          text_block: '=== MARKET DATA: FINNHUB ===\nBeta: 1.2',
          available: false,
        },
      ],
    },
  };
  const result = formatResearchBrief(pkg);
  expect(result).not.toContain('=== MARKET DATA: FINNHUB ===');
});

it('includes both Finnhub and Polygon blocks when both available', () => {
  const pkg: SourcePackage = {
    ...basePackage,
    supplementary_market_data: {
      sources: [
        {
          name: 'Finnhub',
          fetched_at: '2026-04-17T10:00:00Z',
          text_block: '=== MARKET DATA: FINNHUB ===\nBeta: 1.2',
          available: true,
        },
        {
          name: 'Polygon',
          fetched_at: '2026-04-17T10:00:00Z',
          text_block: '=== MARKET DATA: POLYGON ===\nEmployees: 161000',
          available: true,
        },
      ],
    },
  };
  const result = formatResearchBrief(pkg);
  expect(result).toContain('=== MARKET DATA: FINNHUB ===');
  expect(result).toContain('=== MARKET DATA: POLYGON ===');
  expect(result).toContain('Employees: 161000');
});
```

**Step 2: Run tests to confirm they fail**

```bash
cd /Users/tj/Desktop/Cipher
npx vitest run src/lib/__tests__/research-brief.test.ts
```

Expected: 3 new tests fail — the supplementary blocks don't appear in the brief output.

**Step 3: Implement the fix in `src/lib/research-brief.ts`**

Find the `// Collection Notes` section near the end of `formatResearchBrief`. Insert a new section **before** it (between the `social_sentiment` section's trailing empty line and the `// Collection Notes` comment):

Replace this block:
```typescript
  // Collection Notes
  lines.push('--- COLLECTION NOTES ---');
```

With:
```typescript
  // Supplementary Market Data (Finnhub, Polygon) — append available text_blocks
  const availableSuppSources = pkg.supplementary_market_data?.sources?.filter(s => s.available) ?? [];
  if (availableSuppSources.length > 0) {
    lines.push('--- SUPPLEMENTARY MARKET DATA ---');
    for (const source of availableSuppSources) {
      lines.push('');
      lines.push(source.text_block);
    }
    lines.push('');
  }

  // Collection Notes
  lines.push('--- COLLECTION NOTES ---');
```

Also update the header line that says `Supplementary Sources: N of 2 available (Finnhub, Polygon)` — change it to just confirm what's included:

Replace:
```typescript
  const suppCount = pkg.supplementary_market_data?.sources?.filter(s => s.available).length ?? 0;
  lines.push(`Supplementary Sources: ${suppCount} of 2 available (Finnhub, Polygon)`);
```

With:
```typescript
  const suppCount = pkg.supplementary_market_data?.sources?.filter(s => s.available).length ?? 0;
  lines.push(`Supplementary Sources Included: ${suppCount} (${suppCount > 0 ? pkg.supplementary_market_data.sources.filter(s => s.available).map(s => s.name).join(', ') : 'none'})`);
```

**Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/__tests__/research-brief.test.ts
```

Expected: All tests pass including the 3 new ones.

**Step 5: Commit**

```bash
git add src/lib/research-brief.ts src/lib/__tests__/research-brief.test.ts
git commit -m "fix(research-brief): include Finnhub/Polygon text blocks in Gemini prompt

Previously collectAllData() fetched Finnhub and Polygon data and stored
them in SourcePackage.supplementary_market_data, but formatResearchBrief()
only logged their count and dropped the text_block content. Gemini never
saw beta, ROE/ROA, P/B, forward P/E, dividend yield, or Polygon descriptions.

Now appends all available text_blocks to the research brief under a new
SUPPLEMENTARY MARKET DATA section, positioned before COLLECTION NOTES."
```

---

## Task 2: Add new types to `types.ts`

**Files:**
- Modify: `src/lib/types.ts`

No unit tests needed for type-only changes — TypeScript compilation is the test.

**Step 1: Add `CatalystEvent` interface**

Insert after the `AnalysisSource` interface (around line 133):

```typescript
export interface CatalystEvent {
  event: string;    // e.g. "Q2 Earnings Release", "FDA Decision on GLP-1 drug"
  timing: string;   // e.g. "Expected May 2026", "Q3 2026"
  impact: 'positive' | 'negative' | 'uncertain';
}
```

**Step 2: Add new fields to `AnalysisResult`**

After the existing `price_target` field (line 159), add:

```typescript
  executive_summary?: string;   // One-paragraph institutional thesis
  investment_thesis?: string;   // Bull case narrative (2-3 sentences)
  key_risks?: string;           // Bear case narrative (2-3 sentences)
  valuation_context?: string;   // Cheap/fair/expensive vs P/E history and analyst target
  catalyst_watch?: CatalystEvent[];  // Upcoming events that could move the stock
```

**Step 3: Verify TypeScript compiles**

```bash
cd /Users/tj/Desktop/Cipher
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add CatalystEvent and Wall Street report fields to AnalysisResult

New optional fields: executive_summary, investment_thesis, key_risks,
valuation_context, catalyst_watch. All optional for backward compatibility
with stored reports that predate this schema."
```

---

## Task 3: Upgrade Gemini schema + system prompt

**Files:**
- Modify: `src/lib/gemini-analysis.ts`

**Step 1: Replace `AnalysisResultSchema` with upgraded version**

Replace the entire `export const AnalysisResultSchema = z.object({...});` block with:

```typescript
const CatalystEventSchema = z.object({
  event: z.string(),
  timing: z.string(),
  impact: z.enum(['positive', 'negative', 'uncertain']),
});

export const AnalysisResultSchema = z.object({
  // Wall Street report sections (new)
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
```

**Step 2: Replace the system prompt**

Replace the entire `export const SYSTEM_PROMPT = \`...\`` with:

```typescript
export const SYSTEM_PROMPT = `You are a senior equity research analyst at a bulge-bracket investment bank. Synthesize the provided market data, fundamentals, news, analyst sentiment, SEC filings, supplementary data, and community discussion into a Wall Street-grade structured research report.

REQUIRED OUTPUT SECTIONS:

executive_summary: One paragraph (4-6 sentences) encapsulating the investment case, current market position, key fundamental and catalytic drivers, and overall analytical stance. Write this as the opening paragraph of a Goldman Sachs or Morgan Stanley research note — precise, professional, conviction-driven.

investment_thesis: 2-3 sentences articulating the bull case. Lead with the single most compelling fundamental or catalytic driver. Be specific — cite numbers and sources.

key_risks: 2-3 sentences articulating the bear case. Focus on the most credible risks that could impair the investment thesis. Be specific — cite numbers and sources.

valuation_context: 1-2 sentences assessing whether the stock appears cheap, fairly valued, or expensive. Reference the P/E ratio vs historical averages, vs sector, and compare current price to analyst consensus price target to derive premium or discount percentage.

catalyst_watch: Array of 2-4 upcoming events that could materially move the stock (earnings dates, product launches, regulatory decisions, macro catalysts, analyst events). Each entry must include: event name, expected timing, and directional impact (positive/negative/uncertain).

market_sentiment: 'bullish', 'neutral', or 'bearish' — your overall analytical stance.

sentiment_reasoning: 2-3 sentences supporting the market_sentiment verdict. Tie to specific data points.

bullish_signals: Exactly 5 specific, evidence-backed growth catalysts when data is sufficient (minimum 1 if data is sparse). Each signal must be a full sentence with specific numbers or quotes. source_citation must name the exact source (e.g., "Finnhub fundamentals: ROE 145%" or "Reuters, 2026-04-15" or "SEC 10-K filing 2025-10-30").

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
```

**Step 3: Wire new fields into the returned `AnalysisResult` in `runGeminiAnalysis`**

In the `return { ... }` block inside `runGeminiAnalysis`, add the new fields after `price_target`:

```typescript
      executive_summary: output.executive_summary,
      investment_thesis: output.investment_thesis,
      key_risks: output.key_risks,
      valuation_context: output.valuation_context,
      catalyst_watch: output.catalyst_watch ?? [],
```

**Step 4: Verify TypeScript compiles**

```bash
cd /Users/tj/Desktop/Cipher
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All existing tests pass. (The `gemini-analysis.ts` tests mock the AI call — they don't test prompt content, so no schema changes needed there.)

**Step 6: Commit**

```bash
git add src/lib/gemini-analysis.ts
git commit -m "feat(gemini): upgrade schema and system prompt for Wall Street-grade reports

Adds 5 new output fields: executive_summary, investment_thesis, key_risks,
valuation_context, catalyst_watch. Rewrites SYSTEM_PROMPT from a generic
'senior analyst' stub to a detailed Goldman Sachs-style brief that instructs
Gemini on how to use supplementary Finnhub/Polygon data, cite specific sources
in every signal, and produce a professional institutional research note."
```

---

## Task 4: Render new sections in `ResearchReport.tsx`

**Files:**
- Modify: `src/components/ResearchReport.tsx`

**Step 1: Destructure new fields**

In the destructuring block at the top of `ResearchReport` (around line 69), add the new fields:

```typescript
  const {
    company_name,
    analyzed_at,
    market_sentiment,
    sentiment_reasoning,
    bullish_signals,
    bearish_signals,
    assessment,
    confidence_level,
    confidence_explanation,
    sources_used,
    source_warnings,
    market_snapshot,
    // New Wall Street fields
    executive_summary,
    investment_thesis,
    key_risks,
    valuation_context,
    catalyst_watch,
  } = analysisResult;
```

**Step 2: Add Executive Summary card (full-width, above stats grid)**

Inside `<main>`, find the comment `{/* Main Dashboard Grid (Asymmetric) */}`. Insert this block immediately **before** it:

```tsx
        {/* Executive Summary — full width thesis card */}
        {executive_summary && (
          <section className="bg-surface-container p-6 rounded-lg border-l-4 border-primary relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-[100px]" />
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>analyst_insights</span>
              <h3 className="text-[11px] font-bold tracking-widest uppercase text-primary">Executive Summary</h3>
            </div>
            <p className="text-sm text-on-surface leading-relaxed max-w-4xl">
              <Md text={executive_summary} />
            </p>
          </section>
        )}
```

**Step 3: Add Investment Thesis + Key Risks section (after bullish/bearish signals)**

Find the closing `</div>` of the `{/* Bullish/Bearish Factors */}` grid (around line 254). Insert this block immediately after it, still inside the left column (`lg:col-span-8`):

```tsx
            {/* Investment Thesis + Key Risks */}
            {(investment_thesis || key_risks) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {investment_thesis && (
                  <div className="bg-secondary/5 border border-secondary/20 p-5 rounded-lg">
                    <h4 className="text-[10px] font-bold tracking-widest uppercase text-secondary flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-sm">rocket_launch</span> Investment Thesis
                    </h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      <Md text={investment_thesis} />
                    </p>
                  </div>
                )}
                {key_risks && (
                  <div className="bg-error/5 border border-error/20 p-5 rounded-lg">
                    <h4 className="text-[10px] font-bold tracking-widest uppercase text-error flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-sm">shield_with_heart</span> Key Risks
                    </h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      <Md text={key_risks} />
                    </p>
                  </div>
                )}
              </div>
            )}
```

**Step 4: Add Valuation Context card in the right column**

In the right column (`lg:col-span-4`), find the `{/* Source Warnings */}` block. Insert the Valuation Context card **before** it:

```tsx
            {/* Valuation Context */}
            {valuation_context && (
              <div className="bg-surface-container-high p-5 rounded-lg">
                <h3 className="text-[11px] font-bold tracking-widest uppercase text-on-surface-variant mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-tertiary">finance_mode</span>
                  Valuation
                </h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  <Md text={valuation_context} />
                </p>
              </div>
            )}
```

**Step 5: Add Catalyst Watch section (before Sources)**

Find the `{/* Sources Section */}` comment. Insert this block immediately **before** it:

```tsx
        {/* Catalyst Watch */}
        {catalyst_watch && catalyst_watch.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-xs font-bold tracking-widest uppercase text-on-surface-variant flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-tertiary">event_upcoming</span>
              Catalyst Watch
              <span className="ml-1 font-mono text-tertiary">[{catalyst_watch.length} events]</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {catalyst_watch.map((catalyst, i) => {
                const impactColor =
                  catalyst.impact === 'positive' ? 'border-secondary text-secondary' :
                  catalyst.impact === 'negative' ? 'border-error text-error' :
                  'border-outline text-on-surface-variant';
                const impactBg =
                  catalyst.impact === 'positive' ? 'bg-secondary/5' :
                  catalyst.impact === 'negative' ? 'bg-error/5' :
                  'bg-surface-container-low';
                return (
                  <div key={i} className={`${impactBg} border-l-2 ${impactColor} p-4 rounded-r`}>
                    <span className={`text-[9px] font-black tracking-widest uppercase block mb-1 ${impactColor.split(' ')[1]}`}>
                      {catalyst.impact}
                    </span>
                    <h5 className="text-xs font-bold text-on-surface mb-1">{catalyst.event}</h5>
                    <p className="text-[10px] text-on-surface-variant">{catalyst.timing}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}
```

**Step 6: Verify TypeScript compiles**

```bash
cd /Users/tj/Desktop/Cipher
npx tsc --noEmit
```

Expected: No errors.

**Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

**Step 8: Commit**

```bash
git add src/components/ResearchReport.tsx
git commit -m "feat(report): render Wall Street report sections in ResearchReport UI

Adds 4 new sections:
- Executive Summary: full-width thesis card with primary accent border
- Investment Thesis + Key Risks: two-column cards below bull/bear signals
- Valuation Context: right column card below confidence meter
- Catalyst Watch: event grid above sources, color-coded by impact direction

All sections are guarded with conditional rendering so existing stored
reports (missing new fields) display identically to before."
```

---

## Task 5: Create future phase stubs in `.planning/phases/`

These are documentation-only tasks — no code. They define what each future phase will build so the work is captured in the planning system.

**Step 1: Create Phase 13 context**

Create file `.planning/phases/13-deep-sentiment-intelligence/13-CONTEXT.md`:

```markdown
# Phase 13 — Deep Sentiment Intelligence

## Goal
Replace the single Anthropic web search sentiment call with real-time multi-source sentiment
aggregation: StockTwits API, targeted Reddit scraping, and options market sentiment (put/call ratio).

## Motivation
The current `fetchSocialSentiment()` in `src/lib/data/anthropic-search.ts` runs one web search
prompt to infer sentiment from Reddit/StockTwits/financial press. This produces low-signal,
often-stale results. Phase 13 replaces it with direct API/scraping feeds.

## Planned Approach

### StockTwits (no auth, free)
- GET `https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json`
- Returns last 30 messages with bull/bear labels from users
- Compute: message count, bull%, bear%, trending status
- New file: `src/lib/data/stocktwits.ts`

### Reddit targeted scraping (Firecrawl)
- Firecrawl search: `{ticker} site:reddit.com/r/wallstreetbets OR site:reddit.com/r/stocks OR site:reddit.com/r/investing`
- Limit 5 results, extract post titles + upvotes + comment counts
- Compute: overall directional tone, top cited reasons
- New file: `src/lib/data/reddit-sentiment.ts`

### Options sentiment (yahoo-finance2)
- `yahoo-finance2.options(ticker)` returns calls/puts chains
- Compute: total call OI vs total put OI → put/call ratio
- Put/call > 1.0 = bearish, < 0.5 = bullish, 0.5-1.0 = neutral
- New file: `src/lib/data/options-sentiment.ts`

## New SourcePackage section
```typescript
export interface SentimentIntelligenceSection extends SourceSection {
  stocktwits_bull_pct: number | null;
  stocktwits_bear_pct: number | null;
  stocktwits_message_count: number | null;
  reddit_tone: 'bullish' | 'bearish' | 'neutral' | null;
  reddit_top_signals: string[];
  put_call_ratio: number | null;
  put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null;
}
```

## New AnalysisResult section
Add `sentiment_intelligence` section rendered in report UI alongside existing social sentiment.

## Dependencies
- Firecrawl API key (already available: `FIRECRAWL_API_KEY`)
- No new API keys required (StockTwits is public, yahoo-finance2 already installed)
```

**Step 2: Create Phase 14 context**

Create file `.planning/phases/14-technical-analysis/14-CONTEXT.md`:

```markdown
# Phase 14 — Technical Analysis Layer

## Goal
Add RSI, MACD, and moving average signals to the research pipeline. Gemini receives
technical context alongside fundamentals, producing a dedicated Technical Assessment
section in the report.

## Motivation
Currently there is zero technical analysis in the pipeline. Institutional research
always includes technical signals. Many traders will not trust a report that ignores
price action, momentum, and trend.

## Planned Approach

### Data
- Extend `src/lib/data/yahoo.ts` to fetch 6-month daily OHLCV (use `yahoo-finance2.chart()`)
- Store in new `ohlcv_history` field on `SourcePackage`

### Computation
- Install `technicalindicators` npm package (MIT, no API dependency)
- Compute in `src/lib/data/technical.ts`:
  - RSI(14) — overbought >70, oversold <30
  - MACD (12/26/9) — signal cross direction
  - SMA(50) and SMA(200) — golden cross / death cross status
  - Current price vs 50-day MA (above = bullish, below = bearish)

### Output
New `technical_analysis` field in `AnalysisResult`:
```typescript
export interface TechnicalAnalysis {
  rsi_14: number | null;
  rsi_signal: 'overbought' | 'neutral' | 'oversold' | null;
  macd_signal: 'bullish_cross' | 'bearish_cross' | 'neutral' | null;
  sma_50: number | null;
  sma_200: number | null;
  golden_cross: boolean | null;  // 50 SMA crossed above 200 SMA recently
  trend: 'uptrend' | 'downtrend' | 'sideways' | null;
  technical_summary: string;  // Gemini-written 2-3 sentence technical assessment
}
```

### Report UI
New "Technical Signals" section in report: RSI gauge, MACD direction badge, MA status,
trend label.

## Dependencies
- `npm install technicalindicators`
- `@types/technicalindicators` (or manual type declaration)
```

**Step 3: Create Phase 15 context**

Create file `.planning/phases/15-institutional-insider-intelligence/15-CONTEXT.md`:

```markdown
# Phase 15 — Institutional & Insider Intelligence

## Goal
Add insider transaction data (SEC Form 4), short interest, and institutional ownership
percentage to the research pipeline and report.

## Motivation
These are the signals that separate retail research from institutional research.
A report without short interest, insider activity, and institutional ownership is
missing critical context that every Wall Street desk checks.

## Planned Approach

### Insider Transactions (SEC EDGAR — free, no auth)
- SEC EDGAR full-text search API: `https://efts.sec.gov/LATEST/search-index?q=%22{ticker}%22&dateRange=custom&startdt={90daysago}&forms=4`
- Parse Form 4 filings: purchase/sale/disposition, shares, price, insider name/title
- New file: `src/lib/data/sec-insider.ts`
- Surface: last 5 transactions, net buy/sell bias over 90 days

### Short Interest (Finviz scrape via Firecrawl)
- Firecrawl scrape: `https://finviz.com/quote.ashx?t={ticker}`
- Extract: Short Float %, Short Ratio (days to cover), institutional ownership %
- New file: `src/lib/data/finviz.ts`
- Requires Firecrawl API key (already available)

### New SourcePackage section
```typescript
export interface InstitutionalDataSection extends SourceSection {
  short_float_pct: number | null;
  short_ratio: number | null;
  institutional_ownership_pct: number | null;
  insider_transactions: InsiderTransaction[];
  insider_net_bias: 'buying' | 'selling' | 'neutral' | null;
}

export interface InsiderTransaction {
  insider_name: string;
  title: string;
  transaction_type: 'purchase' | 'sale' | 'disposition';
  shares: number;
  price: number | null;
  date: string;
}
```

### Report UI
New "Institutional Intelligence" section in report:
- Short float % with color-coded badge (>20% = high short interest = bearish)
- Institutional ownership % bar
- Insider activity timeline (last 5 transactions)

## Dependencies
- Firecrawl API key (already available)
- SEC EDGAR full-text search (free, no key)
```

**Step 4: Commit phase stubs**

```bash
git add .planning/phases/13-deep-sentiment-intelligence/ \
        .planning/phases/14-technical-analysis/ \
        .planning/phases/15-institutional-insider-intelligence/
git commit -m "docs(roadmap): add Phase 13-15 context stubs for future deep adds

Phase 13 — Deep Sentiment Intelligence: StockTwits API, targeted Reddit
scraping, options put/call ratio
Phase 14 — Technical Analysis: RSI, MACD, SMA via technicalindicators
Phase 15 — Institutional & Insider: SEC Form 4, Finviz short interest,
institutional ownership"
```

---

## Verification

After all 5 tasks are committed:

```bash
# Full test suite
npx vitest run

# TypeScript
npx tsc --noEmit

# Build
npm run build
```

All should pass clean. Then do a live test run with AAPL:
1. Start dev server: `npm run dev`
2. Navigate to localhost:3000
3. Search AAPL, confirm chart, run research
4. Verify report shows: Executive Summary card, Investment Thesis + Key Risks panel, Valuation Context card, Catalyst Watch section
5. Check browser console for Gemini prompt to confirm Finnhub/Polygon blocks are present (if keys are set in `.env.local`)
