# Roadmap: Ticker Research Assistant

## Overview

The project delivers a financial research tool in four phases. Phase 1 builds the data pipeline — ticker confirmation, market data, fundamentals, news, filings, and analyst sentiment — producing a clean, timestamped source package ready for reasoning. Phase 2 integrates NotebookLM as the reasoning engine via `notebooklm-py` (teng-lin, PyPI); the source package is formatted into structured text and URL sources, programmatically ingested into a fresh NotebookLM notebook, queried with 6 structured questions, and the notebook is deleted after analysis — no manual steps from the user. Phase 3 assembles the pipeline outputs into a formatted, downloadable report with full source attribution. Phase 4 packages the system for both local execution and web deployment via Daytona container.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Pipeline** - Ticker confirmation, comprehensive data collection, and structured source package output (completed 2026-03-13)
- [ ] **Phase 2: Research Integration** - NotebookLM API verification spike, then full research analysis pipeline
- [ ] **Phase 3: Report Output** - Formatted research report rendering with source attribution and PDF export
- [ ] **Phase 4: Deployment** - Local execution packaging and web application deployment

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
**Plans**: TBD

Plans:
- [ ] 03-01: Report page layout — section structure, typography, responsive design matching defined output format
- [ ] 03-02: PDF export — PDF generation from report page, download trigger
- [ ] 03-03: Disclaimer, timestamp, and sources section — financial disclaimer block, data timestamp display, attributed sources list

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
- [ ] 04-01: Local install packaging — `npm install && npm start` setup script that auto-installs all dependencies, documents environment variables (ANTHROPIC_API_KEY), validates Python 3.10+ and Node versions, runs setup wizard on first boot
- [ ] 04-02: Daytona container — Dockerfile/devcontainer with Node.js 18+, Python 3.10+, Chromium, `notebooklm-py` pre-installed via `pip install -r scripts/requirements.txt && playwright install chromium`; auth NOT baked in — user runs `notebooklm login` once; `~/.notebooklm/storage_state.json` persists across restarts; container exposes endpoint that accepts research job requests and streams results; user runs one-time `daytona create` command
- [ ] 04-03: Vercel + Daytona integration — Next.js API routes detect deployment mode (env var `DEPLOYMENT_MODE=cloud`), forward research jobs to Daytona container URL, SSE stream results to browser; environment variable management; production smoke test

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Pipeline | 5/5 | Complete   | 2026-03-13 |
| 2. Research Integration | 1/4 | In Progress|  |
| 3. Report Output | 0/3 | Not started | - |
| 4. Deployment | 0/3 | Not started | - |
