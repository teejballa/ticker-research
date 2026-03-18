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
- [ ] **Phase 5: User Identity & Report History** - Google auth as app identity, persistent report storage, home page history with regeneration

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
**Plans**: TBD

Plans:
- [ ] 05-01: Report persistence — local JSON store (or SQLite) for AnalysisResult + metadata; write on analysis complete; read on home page load
- [ ] 05-02: Google identity display — extract connected email from notebooklm auth check; show "Connected as [email]" in app header/nav; reconnect flow when session expires
- [ ] 05-03: Report history UI — home page past reports section (ticker, date, sentiment chip, open/regenerate actions); Bloomberg-terminal style to match report design
- [ ] 05-04: Regenerate flow — "Run New Analysis" on a past report triggers full Phase 1+2 pipeline for that ticker; result stored as new entry; old reports preserved

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Pipeline | 5/5 | Complete | 2026-03-13 |
| 2. Research Integration | 4/4 | Complete | 2026-03-14 |
| 3. Report Output | 1/3 | In Progress|  |
| 4. Deployment | 3/3 | Complete   | 2026-03-18 |
| 5. User Identity & Report History | 0/4 | Not started | - |
