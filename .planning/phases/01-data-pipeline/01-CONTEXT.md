# Phase 1: Data Pipeline - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

User enters a ticker symbol, confirms the correct stock via a chart preview, and the system collects comprehensive financial data — producing a structured, timestamped source package ready for the reasoning layer. Covers ticker search/confirmation UI and all data collection. Report rendering and reasoning/analysis are out of scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### Ticker search experience
- User can search by company name OR ticker symbol (e.g., "Apple" resolves to AAPL)
- Live autocomplete dropdown appears as user types — no submit required to see results
- Each result in the dropdown shows: ticker + company name + current price (e.g., AAPL — Apple Inc. — $189.42)
- Invalid/unknown ticker: shake animation on the input field + inline error message below it

### Chart confirmation view
- Simple line chart, 1-month time range
- Shown alongside the chart before confirming: company name + ticker, current price + % change today, market cap, exchange + sector
- Two action buttons: **Confirm** (proceed to research) and **Search again** (return to ticker input)

### Data sources
- **yahoo-finance2** (npm, free, no API key required) — covers: market_data, fundamentals
- **Anthropic web search** (uses ANTHROPIC_API_KEY) — covers: news headlines, SEC filing summaries, analyst ratings/commentary, social/media sentiment
- No Finnhub, no SEC EDGAR direct integration, no Reddit/Stocktwits API keys required

### API key configuration
- Single `.env` file — only `ANTHROPIC_API_KEY` required
- yahoo-finance2 needs no key — free unofficial npm package
- Agents must document required env vars clearly in setup instructions

### Source package format
- Output is a **single JSON object** — all sections in one payload
- Written to a **temp file** during the session, automatically deleted when done — never committed to the repo
- Six sections in the JSON:
  - `market_data` — price, volume, 52-week high/low, market cap (yahoo-finance2)
  - `fundamentals` — P/E ratio, revenue, EPS, debt ratios (yahoo-finance2)
  - `news` — recent headlines + URLs, past 7-30 days (Anthropic web search)
  - `analyst_sentiment` — Buy/Hold/Sell breakdown, price targets, analyst commentary (Anthropic web search)
  - `sec_filing_summary` — key points from most recent 10-K and 10-Q (Anthropic web search)
  - `social_sentiment` — Reddit/Stocktwits discussion tone and signals (Anthropic web search)
- Each section includes a `collected_at` timestamp (DATA-07)

### Frontend/UI approach
- All frontend, UI, and design work must use the `/frontend-design` skill — this is a locked project rule (per CLAUDE.md memory)

### Claude's Discretion
- Exact loading state / skeleton UI during data collection
- Debounce timing for the autocomplete dropdown
- Temp file naming convention and cleanup mechanism
- Error handling for individual failed data sources (e.g., Anthropic web search rate limit)

</decisions>

<specifics>
## Specific Ideas

- Autocomplete dropdown should feel like a modern financial app search (think Bloomberg terminal or Robinhood search — fast, responsive, shows the right info at a glance)
- The confirmation step should be frictionless but intentional — user should feel confident they're researching the right stock before the pipeline runs

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing components or utilities

### Established Patterns
- None yet — this is Phase 1; patterns established here will carry forward

### Integration Points
- Source package JSON output feeds directly into Phase 2 reasoning layer (NotebookLM or Anthropic Messages API fallback)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-data-pipeline*
*Context gathered: 2026-03-10*
