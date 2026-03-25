# Roadmap: Ticker Research Assistant

## Overview

The project delivers a financial research tool in five phases. Phase 1 builds the data pipeline — ticker confirmation, market data, fundamentals, news, filings, and analyst sentiment — producing a clean, timestamped source package ready for reasoning. Phase 2 integrates NotebookLM as the reasoning engine via `notebooklm-py` (teng-lin, PyPI); the source package is formatted into structured text and URL sources, programmatically ingested into a fresh NotebookLM notebook, queried with 6 structured questions, and the notebook is deleted after analysis — no manual steps from the user. Phase 3 assembles the pipeline outputs into a formatted, downloadable report with full source attribution. Phase 4 packages the system for both local execution and web deployment via Daytona container.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Pipeline** - Ticker confirmation, comprehensive data collection, and structured source package output (completed 2026-03-13)
- [x] **Phase 2: Research Integration** - NotebookLM API verification spike, then full research analysis pipeline (completed 2026-03-14)
- [x] **Phase 3: Report Output** - Formatted research report rendering with source attribution and PDF export (completed 2026-03-18)
- [x] **Phase 4: Deployment** - Local execution packaging and web application deployment (completed 2026-03-18)
- [x] **Phase 5: User Identity & Report History** - Google auth as app identity, persistent report storage, home page history with regeneration (completed 2026-03-20)

## Phase Details

### Phase 1: Data Pipeline
**Goal**: User can enter a ticker, confirm the correct stock, and the system produces a complete, timestamped source package ready for the reasoning layer
**Depends on**: Nothing (first phase)
**Requirements**: TICK-01, TICK-02, TICK-03, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08
**Success Criteria** (what must be TRUE):
  1. User can type a ticker symbol (e.g., AAPL) and see a chart preview before research begins
  2. User must explicitly confirm the correct stock before the pipeline runs — no accidental research on wrong ticker
  3. System retrieves price, volume, 52-week range, market cap, fundamentals (P/E, revenue, EPS, debt) via yahoo-finance2, and news, SEC filing summaries, analyst commentary, and sentiment signals via Anthropic web search
  4. Every collected source carries a "data as of [datetime]" timestamp
  5. Claude Code SDK produces a structured source package containing all retrieved data, ready to pass to the reasoning layer
**Plans**: 5 plans

Plans:
- [ ] 01-01-PLAN.md — Next.js 15 scaffolding, dependency installation, SourcePackage type contracts, Wave 0 test stubs
- [ ] 01-02-PLAN.md — Ticker search autocomplete UI, chart confirmation page, Confirm/Search Again flow
- [ ] 01-03-PLAN.md — yahoo-finance2 data functions: searchTickers, fetchChartData, fetchMarketData, fetchFundamentals
- [ ] 01-04-PLAN.md — Anthropic web search functions: fetchNews, fetchAnalystSentiment, fetchSecFilingSummary, fetchSocialSentiment
- [ ] 01-05-PLAN.md — Source package assembly: parallel collection, temp file lifecycle, POST /api/research/[ticker] pipeline route

### Phase 2: Research Integration
**Goal**: Gathered sources are automatically ingested into a fresh NotebookLM notebook, queried via `notebooklm-py`, and produce structured sentiment, signals, and Buy/Hold/Sell assessment with source-referenced conclusions — with no manual steps from the user after initial setup

**Architecture**: Uses `notebooklm-py` (teng-lin, PyPI `notebooklm-py==0.3.4`) — a Python async library that creates a fresh notebook per research run, adds market data as text and news articles as URLs, runs 6 structured queries via `chat.ask`, then deletes the notebook. One-time Google login stores credentials at `~/.notebooklm/storage_state.json`; all subsequent runs are fully headless.

**Key constraint**: Requires Python 3.10+. Cannot run in Vercel Functions (no Playwright/Chromium). Cloud deployment routes through a Daytona container.

**Depends on**: Phase 1
**Requirements**: RSRCH-01, RSRCH-02, RSRCH-03, RSRCH-04, RSRCH-05, RSRCH-06, RSRCH-07
**Success Criteria** (what must be TRUE):
  1. Phase 1 SourcePackage is formatted into a Research Brief (structured text) and a list of news URLs, both consumed programmatically — no user upload required
  2. `scripts/notebooklm_research.py` creates a fresh notebook, adds sources, runs queries, and deletes the notebook without user interaction
  3. System queries NotebookLM with 6 structured questions covering all required report sections
  4. Analysis output includes market sentiment classification (bullish / neutral / bearish)
  5. Analysis output includes bullish and bearish signals, each tied to a source
  6. Analysis output includes a Buy / Hold / Sell assessment with explicit reasoning
  7. Analysis output includes a confidence level for the overall assessment
  8. Every conclusion references its supporting source from the ingested data
**Plans**: 4 plans

Plans:
- [ ] 02-01-PLAN.md — Setup wizard: `GET /api/setup/status` checks Python 3.10+, notebooklm-py, `~/.notebooklm/storage_state.json`; `POST /api/setup/install` auto-installs in background; `POST /api/setup/auth` spawns `notebooklm login` and polls for auth file; `<SetupWizard />` 3-step UI; home page conditionally renders wizard or TickerSearch
- [ ] 02-02-PLAN.md — Research Brief formatter (TDD): `src/lib/research-brief.ts` with `formatResearchBrief(pkg): string` (6 labeled sections) and `extractNewsUrls(pkg): string[]` (dedup, max 15)
- [ ] 02-03-PLAN.md — Python research script: `scripts/notebooklm_research.py` full notebook lifecycle — create, add_text, add_url loop with per-URL error handling, 6x chat.ask with conversation threading, parse_answers → AnalysisResult JSON, delete notebook, PROGRESS:/RESULT:/ERROR: stdout protocol
- [ ] 02-04-PLAN.md — Next.js integration: AnalysisResult types added to `src/lib/types.ts`; `POST /api/analysis/[ticker]` SSE route spawning Python script; `<ResearchProgress />` 6-step streaming UI with auto-transition; research page wiring with error/rate-limit handling

### Phase 3: Report Output
**Goal**: Analysis output is rendered as a readable, formatted research report with source attribution, downloadable as PDF, and carrying a financial disclaimer
**Depends on**: Phase 2
**Requirements**: REPT-01, REPT-02, REPT-03, REPT-04, REPT-05, REPT-06
**Success Criteria** (what must be TRUE):
  1. Research report renders as a formatted page in the user's browser following the defined section order: Ticker Overview, Market Sentiment, Bullish Factors, Bearish Factors, Buy/Hold/Sell Assessment, Confidence Level, Sources Used
  2. User can download the report as a PDF
  3. Report displays a "data as of [datetime]" timestamp reflecting when data was collected
  4. Report includes a "Not financial advice" disclaimer section
  5. Sources section lists all sources used with attribution — no conclusion is left without a traceable source
**Plans**: 3 plans

Plans:
- [ ] 03-01-PLAN.md — Type contracts, formatter utilities, Python market_snapshot extraction, Wave 0 test stubs
- [ ] 03-02-PLAN.md — ResearchReport component with all 7 sections, sticky top bar, PDF download trigger, wired into page.tsx
- [ ] 03-03-PLAN.md — Full app Bloomberg terminal restyle: all existing components and pages + visual checkpoint

### Phase 4: Deployment
**Goal**: System runs on a user's local device via a single setup command, and is deployable as a production web application using a Daytona container for the `notebooklm-py` research layer

**Architecture**: `notebooklm-py` cannot run in Vercel Functions (no filesystem, no Playwright/Chromium, ephemeral containers). Cloud deployment uses a **Daytona container** (persistent, user-owned infrastructure) that runs the full `scripts/notebooklm_research.py` stack. The Next.js frontend deploys to Vercel and sends research jobs to the Daytona container via API, streaming results back via SSE.

**Depends on**: Phase 3
**Requirements**: DEPLOY-01, DEPLOY-02
**Success Criteria** (what must be TRUE):
  1. User can clone the repo, run `npm install && npm start`, and complete a full ticker research workflow locally — including auto-install of `notebooklm-py` and Google auth prompt
  2. Daytona container image includes: Node.js 18+, Python 3.10+, Chromium, `notebooklm-py` pre-installed via `scripts/requirements.txt`; auth is NOT baked in — user runs `notebooklm login` once inside the container
  3. Next.js frontend deploys to Vercel; research requests are forwarded to the Daytona container and streamed back
  4. User's Google auth for NotebookLM persists in the Daytona container via `~/.notebooklm/storage_state.json` (persists across container restarts)
  5. Full ticker research request completes end-to-end in production (data collection → notebooklm-py notebook creation + queries → report)
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md — Local install packaging: prestart validator (scripts/setup.sh), `next build && next start`, .env.local.example
- [ ] 04-02-PLAN.md — Daytona devcontainer spec (.devcontainer/devcontainer.json) with Python 3.12 + Node 18 + notebooklm-py; vercel.json maxDuration
- [ ] 04-03-PLAN.md — DEPLOYMENT_MODE=cloud proxy branch in analysis route, force-dynamic exports, extended tests, production smoke test checkpoint

### Phase 5: User Identity & Report History
**Goal**: The connected Google account is the user's app identity with no separate signup, completed reports are persisted locally and visible on the home page, and any past report can be regenerated with fresh data
**Depends on**: Phase 3
**Requirements**: AUTH-01, HIST-01, HIST-02, HIST-03
**Success Criteria** (what must be TRUE):
  1. The Google account connected during setup is displayed as the user's identity in the app (e.g., "Connected as you@gmail.com") — no separate signup required
  2. Each completed research report is saved locally (ticker, timestamp, sentiment verdict, full AnalysisResult JSON)
  3. Home page shows a history of past reports grouped by ticker, each with date and sentiment verdict, openable without re-running analysis
  4. A "Regenerate" action on any past report kicks off a fresh data collection and analysis run for the same ticker, storing the result as a new timestamped report
**Plans**: 5 plans

Plans:
- [ ] 05-01-PLAN.md — Foundation: StoredReport type + reports.ts helpers (writeReport/readReport/listReports), scripts/get_email.py, Wave 0 test stubs (unit + e2e)
- [ ] 05-02-PLAN.md — API layer: GET /api/history, GET /api/history/[filename], extend analysis route to persist on RESULT, extend setup/status to return userEmail
- [ ] 05-03-PLAN.md — History UI: ReportHistory component (terminal-style table with OPEN/REGEN actions), NavIdentity wired into page.tsx nav
- [ ] 05-04-PLAN.md — Saved report loading: research page ?report= branch loads StoredReport from API, mutually exclusive with analysis pipeline
- [ ] 05-05-PLAN.md — Playwright e2e tests pass, screenshots confirm terminal aesthetic, user checkpoint approval

### Phase 6: Full Web Deployment — Vercel, Database, Auth, Report & Account Persistence

**Goal**: Transform the local-first app into a deployed multi-user web product — Google OAuth authentication via NextAuth.js, Neon PostgreSQL for cloud report persistence, custom terminal-aesthetic sign-in page, and DEPLOYMENT_MODE-gated middleware that leaves local mode completely intact until web deployment is confirmed working.
**Requirements**: WEB-AUTH, WEB-DB, WEB-MIDDLEWARE, WEB-SIGNIN-UI, WEB-NAV-IDENTITY, WEB-PERSISTENCE, WEB-HISTORY, WEB-DEPLOY, WEB-ENV
**Depends on:** Phase 5
**Plans:** 4/4 plans complete

Plans:
- [ ] 06-01-PLAN.md — Auth/DB foundation: install next-auth@4.24.13 + prisma@7.5.0 + neon adapter, Wave 0 test stubs, Prisma schema, NextAuth authOptions, Prisma singleton, session type augmentation, App Router handler, DEPLOYMENT_MODE-gated middleware
- [ ] 06-02-PLAN.md — Custom sign-in page (/auth/signin, terminal aesthetic per UI-SPEC), NavIdentity web-mode email via updated /api/setup/status, visual checkpoint
- [ ] 06-03-PLAN.md — Neon persistence: reports-db.ts (writeReportToDb/listReportsFromDb/readReportFromDb), history route DEPLOYMENT_MODE switch (dynamic import), analysis route web-mode persist
- [x] 06-04-PLAN.md — Vercel deployment config (prisma migrate deploy build command), .env.local.example with all Phase 6 env vars, full test suite green, final checkpoint (completed 2026-03-23)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Pipeline | 5/5 | Complete | 2026-03-13 |
| 2. Research Integration | 4/4 | Complete | 2026-03-14 |
| 3. Report Output | 1/3 | In Progress|  |
| 4. Deployment | 3/3 | Complete   | 2026-03-18 |
| 5. User Identity & Report History | 5/5 | Complete   | 2026-03-20 |
| 6. Full Web Deployment | 4/4 | Complete   | 2026-03-23 |
| 7. Research Quality & Special Situation Coverage | 0/4 | Planned | |
| 8. Full Public Deployment | 0/? | Planned | |
| 9. Reliable Market Data | 0/? | Planned | |
| 10. Public Sentiment Layer | 0/? | Planned | |

### Phase 7: Research Quality & Special Situation Coverage

**Goal**: The research pipeline detects what type of security it's analyzing and adapts its search queries accordingly — so SPACs surface merger details and vote dates, ETFs surface holdings and expense ratios, and even standard equities get more aggressive web search coverage. The deprecated model and stale landing page data are already fixed; this phase improves research depth and output quality before public deployment.

**Problem being solved**: Search queries in `anthropic-search.ts` are generic stock prompts — they ask for "news, SEC 10-K/10-Q, analyst ratings, social sentiment" regardless of what the ticker actually is. For a pre-merger SPAC like ETHM, the merger target, S-4 proxy filing, trust NAV, and shareholder vote date are the most important facts — but none of the current prompts surface them. The `max_uses: 3` web search cap also limits coverage for fast-moving or niche situations.

**Architecture**:
- `src/lib/data/security-type.ts`: `detectSecurityType(ticker, quote): SecurityType` — classify as `equity | spac | etf | adr | preferred | crypto | unknown` using Yahoo Finance quote fields (`quoteType`, `longName`, company name keywords)
- `src/lib/data/anthropic-search.ts`: each fetch function receives `securityType` and branches prompt logic:
  - **SPAC**: news query targets merger agreement, PIPE investors, vote date, redemption deadline; SEC query targets S-4/DEF 14A proxy filings (not 10-K/10-Q); analyst query skips if pre-merger (no coverage); social query targets merger speculation
  - **ETF**: fundamentals query targets AUM, expense ratio, top holdings, tracking index; SEC query targets N-CEN/N-PORT filings; analyst query targets ETF-specific commentary
  - **Equity (default)**: current queries with `max_uses` bumped from 3 to 5 for news and analyst searches
- `src/lib/data/source-package.ts`: calls `detectSecurityType` before parallel data collection; passes type to each fetch function; adds `security_type` field to `SourcePackage`
- `scripts/notebooklm_research.py`: reads `security_type` from source package; adds type-specific preamble to structured questions so Gemini understands the instrument context

**Depends on**: Phase 6
**Requirements**: RQ-01, RQ-02, RQ-03, RQ-04
**Success Criteria** (what must be TRUE):
  1. ETHM research output mentions the merger target, expected vote/close date, and trust NAV — information that currently goes missing
  2. An ETF ticker (e.g., QQQ) research output mentions holdings, expense ratio, and tracking index — not "SEC 10-K filings" that don't exist for ETFs
  3. A standard equity (AAPL, NVDA) research output is at least as good as today — no regression
  4. Security type is logged in the SourcePackage and visible in the research report (e.g., "Security Type: SPAC")
**Plans:** 4 plans

Plans:
- [ ] 07-01-PLAN.md — SecurityType type contracts, detectSecurityType() module, types.ts extensions (SourcePackage + AnalysisResult), Wave 0 test stubs
- [ ] 07-02-PLAN.md — Prompt branching in all 4 anthropic-search.ts functions + source-package.ts securityType threading + route.ts integration
- [ ] 07-03-PLAN.md — Python preamble injection in notebooklm_research.py, security_type propagation to AnalysisResult, ETF analyst brief improvement
- [ ] 07-04-PLAN.md — NavBar security type badge (SPAC/ETF amber chip), ResearchReport wiring, Playwright badge tests, visual checkpoint

### Phase 8: Full public deployment — Vercel frontend + Daytona container for notebooklm-py, fully live and accessible to anyone on the web

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 7
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 8 to break down)

### Phase 9: Reliable Market Data — Multi-Source Fallback & Full Ticker Coverage

**Goal**: Any ticker a user enters returns complete, populated market data. Yahoo-finance2 is the primary source but automatically falls back to secondary sources (Alpha Vantage free tier, Financial Modeling Prep free tier, Anthropic web search extraction) when fields are missing or the primary call fails — so major stocks like AAPL never produce empty report sections.

**Problem being solved**: yahoo-finance2 is an unofficial API that silently returns partial or empty data for many tickers (including large-caps like AAPL). Currently, missing fundamentals fields (P/E, EPS, revenue, market cap) leave report sections blank. Users have no indication that data is missing vs. unavailable.

**Architecture**:
- `src/lib/market-data.ts`: unified `fetchMarketData(ticker)` function with cascading fallback chain
  - Primary: yahoo-finance2 (price, volume, fundamentals, 52-week range)
  - Secondary: Alpha Vantage free tier (OVERVIEW endpoint — P/E, EPS, market cap, revenue)
  - Tertiary: Financial Modeling Prep free tier (company profile + key metrics)
  - Final fallback: Anthropic web search extraction for any still-missing fields
- Each source is tried independently per field — partial data from primary is supplemented by secondary (not replaced wholesale)
- `DataField` envelope tracks `{ value, source, fetchedAt }` per field so report can show "P/E ratio: 28.4 (via Alpha Vantage)"
- Missing fields after all fallbacks are explicitly marked `{ value: null, unavailable: true }` — sections show "Data unavailable" instead of rendering empty
- No API keys required for free tiers in local mode; optional env vars `ALPHA_VANTAGE_API_KEY` and `FMP_API_KEY` unlock higher rate limits

**Depends on**: Phase 8 (public deployment)
**Requirements**: DATA-RELIABLE-01, DATA-RELIABLE-02, DATA-RELIABLE-03
**Success Criteria** (what must be TRUE):
  1. AAPL, TSLA, NVDA, and 10 other major tickers all produce fully-populated report sections with no blank fields
  2. When primary source (yahoo-finance2) fails or returns partial data, fallback sources fill missing fields transparently
  3. Report shows source attribution per data field when a fallback was used (e.g., "via Alpha Vantage")
  4. Tickers with genuinely unavailable data (small-cap, OTC) display "Data unavailable" explicitly rather than blank sections
  5. Fallback chain completes within 10 seconds total — no single source blocks the pipeline
**Plans:** 0 plans (run /gsd:plan-phase 9 to break down)

Plans:
- [ ] TBD

### Phase 10: Public Sentiment Layer — X, YouTube, Reddit & Social Signal Ingestion

**Goal**: The research report gains a dedicated Public Sentiment section sourced from what real people — not analysts — are saying about the ticker on X (Twitter), YouTube, Reddit, and StockTwits. These sources are gathered automatically and fed into NotebookLM alongside the existing analyst/news data so Gemini can synthesize crowd sentiment as a distinct signal.

**Problem being solved**: Current sentiment is analyst-only (SEC filings, institutional commentary). Retail investor sentiment on social platforms often diverges from analyst consensus and is a meaningful signal — especially for high-attention stocks. The report should reflect both.

**Architecture**:
- `src/lib/social-sentiment.ts`: `fetchSocialSentiment(ticker, companyName)` returns `SocialSentimentPackage`
  - **X/Twitter**: Anthropic web search queries for recent `$TICKER` mentions, extracts top posts with engagement signals (likes/retweets as rough weight)
  - **YouTube**: Anthropic web search queries for `[ticker] stock analysis [year]` — extracts video titles, channel names, view counts from search results (no YouTube API needed)
  - **Reddit**: Anthropic web search queries `site:reddit.com [ticker] stock` — extracts post titles, subreddit, and upvote context from r/wallstreetbets, r/stocks, r/investing
  - **StockTwits**: Anthropic web search queries `site:stocktwits.com $[ticker]` — extracts bullish/bearish signal counts if available
- Each platform result is formatted as a `SocialSource` with `{ platform, content, url, fetchedAt, engagementSignal }`
- Social sources are added to NotebookLM notebook as additional `add_url` entries (same pipeline as news URLs)
- NotebookLM query set extended with a 7th question: "What is the general public and retail investor sentiment from social platforms? Separate from analyst views."
- `AnalysisResult` schema gains `publicSentiment: { summary, platforms: string[], bullishSignals: string[], bearishSignals: string[] }`
- Report gains a new **Public Sentiment** section between Market Sentiment and Bullish Factors, showing platform breakdown and crowd tone

**Depends on**: Phase 9 (reliable data foundation)
**Requirements**: SOCIAL-01, SOCIAL-02, SOCIAL-03, SOCIAL-04
**Success Criteria** (what must be TRUE):
  1. Report includes a Public Sentiment section with content from at least 2 of: X, YouTube, Reddit, StockTwits
  2. Public sentiment is clearly labeled as distinct from analyst/institutional sentiment
  3. Each social signal links back to its source platform with attribution
  4. Social sources are added to the NotebookLM notebook so Gemini synthesizes them grounded in actual posts/videos — not hallucinated
  5. For a high-attention ticker (AAPL, TSLA, GME), at least 5 social sources are surfaced per run
  6. Pipeline still completes within 60 seconds with social sources added
**Plans:** 0 plans (run /gsd:plan-phase 10 to break down)

Plans:
- [ ] TBD
