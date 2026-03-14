# Ticker Research Assistant

## What This Is

A financial research tool that takes a ticker symbol, confirms the correct stock via chart preview, gathers comprehensive data (market data, news, company fundamental
s, future outlook, public sentiment), and produces a structured, source-backed research report. The system is designed to run locally on a user's device or deploy as a web application.

## Core Value

Given a ticker, return a clear, evidence-backed research report with transparent reasoning and traceable sources — no hallucinated conclusions, only what the data supports.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can input a ticker symbol and confirm the correct stock via chart preview
- [ ] System gathers comprehensive financial data: market data, news, company fundamentals, future outlook, analyst sentiment
- [ ] Claude Code SDK orchestrates data collection and structures research inputs
- [ ] Gathered sources are fed into NotebookLM via the Claude Code SDK NotebookLM skill
- [ ] NotebookLM produces structured analysis: sentiment, bullish/bearish signals, Buy/Hold/Sell reasoning
- [ ] Research report is returned to the user as a formatted page on their device
- [ ] Report follows the defined output format: Ticker Overview, Market Sentiment, Bullish Factors, Bearish Factors, Buy/Hold/Sell Assessment, Confidence Level, Sources Used
- [ ] All conclusions reference supporting sources
- [ ] System supports local execution (user's device + their own NotebookLM account)
- [ ] System supports deployment as a web application

### Out of Scope

- Storing generated research artifacts in the repository — outputs are ephemeral, delivered to user
- Real-time streaming/live market data — batch research per request
- Portfolio tracking or trade execution — research only, no trading functionality
- Mobile native app — web-first, mobile later

## Context

The system uses a two-layer architecture:
- **Data Collection & Orchestration**: Claude Code SDK gathers market data, news, and sources, then structures them as research inputs
- **Research & Reasoning**: NotebookLM processes the structured sources and produces the analysis

Users will eventually connect their own NotebookLM account so research reasoning occurs within their environment. The system must remain architecturally compatible with both local execution and web deployment without over-engineering early stages.

The CLAUDE.md defines a 4-phase roadmap:
1. Research Pipeline Prototype (data gathering + Claude Code SDK integration)
2. NotebookLM Research Integration (analysis + structured report output)
3. User Environment Integration (user's own NotebookLM account)
4. Deployment & Environment Setup (Daytona bubble, web app packaging)

## Constraints

- **Architecture**: Maintain separation between data gathering (Claude Code SDK) and research reasoning (NotebookLM) — do not merge these layers
- **Storage**: Never commit generated research artifacts to the repository
- **Infrastructure**: Avoid over-engineering; introduce backend only when required for application functionality
- **Deployment**: Must support both local execution and future web deployment from day one

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude Code SDK for data orchestration | Acts as the information pipeline, modular, extensible | — Pending |
| NotebookLM as reasoning engine | Source-grounded analysis, user-owned environment option | — Pending |
| Local-first execution model | Users own their research workflow; no dependency on centralized servers | — Pending |
| Chart confirmation step before research | Prevents running expensive research on wrong ticker | — Pending |
| yahoo-finance2 + Anthropic web search for data collection | Eliminates need for Finnhub, SEC EDGAR, Reddit/Stocktwits API keys — yahoo-finance2 handles structured market data (free, no key), Anthropic web search covers news, filings, analyst content, and sentiment | Phase 1 |

---
*Last updated: 2026-03-10 after initialization*
