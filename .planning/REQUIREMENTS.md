# Requirements: Ticker Research Assistant

**Defined:** 2026-03-10
**Core Value:** Given a ticker, return a clear, evidence-backed research report with transparent reasoning and traceable sources — no hallucinated conclusions, only what the data supports.

## v1 Requirements

### Ticker Input

- [x] **TICK-01**: User can enter a ticker symbol (e.g., AAPL, TSLA) to initiate research
- [x] **TICK-02**: System displays a chart preview for the entered ticker so user can confirm the correct stock
- [x] **TICK-03**: User must confirm the correct stock before research pipeline begins

### Data Collection

- [x] **DATA-01**: System retrieves current market data: price, volume, 52-week high/low, market cap
- [x] **DATA-02**: System retrieves company fundamentals: P/E ratio, revenue, earnings, EPS, debt ratios
- [x] **DATA-03**: System retrieves recent news headlines from the past 7-30 days via Anthropic web search
- [x] **DATA-04**: System retrieves SEC filing summaries (recent 10-K and 10-Q content) via Anthropic web search
- [x] **DATA-05**: System retrieves analyst ratings and consensus (Buy/Hold/Sell breakdown, price targets) via Anthropic web search
- [x] **DATA-06**: System retrieves media and social sentiment signals (financial press tone, Reddit/Stocktwits discussion) via Anthropic web search
- [x] **DATA-07**: All retrieved sources carry a collection timestamp ("data as of [datetime]")
- [x] **DATA-08**: Claude Code SDK orchestrates all data collection using yahoo-finance2 (structured market data) and Anthropic web search (news, filings, analyst content, sentiment), and structures inputs as a source package

### Research & Analysis

- [ ] **RSRCH-01**: Structured source package is fed to NotebookLM via Claude Code SDK NotebookLM skill
- [ ] **RSRCH-02**: NotebookLM produces market sentiment analysis (bullish / neutral / bearish)
- [ ] **RSRCH-03**: NotebookLM identifies and lists key bullish signals from sources
- [ ] **RSRCH-04**: NotebookLM identifies and lists key bearish signals from sources
- [ ] **RSRCH-05**: NotebookLM produces a Buy / Hold / Sell assessment with supporting reasoning
- [ ] **RSRCH-06**: NotebookLM assigns a confidence level to the overall assessment
- [ ] **RSRCH-07**: All conclusions reference their supporting source (no unsupported claims)

### Report Output

- [ ] **REPT-01**: Report renders as a formatted page in the user's browser
- [ ] **REPT-02**: Report includes a PDF download option
- [ ] **REPT-03**: Report follows the defined structure: Ticker Overview → Market Sentiment → Bullish Factors → Bearish Factors → Buy/Hold/Sell Assessment → Confidence Level → Sources Used
- [ ] **REPT-04**: Report includes a "data as of [datetime]" timestamp
- [ ] **REPT-05**: Report includes a financial disclaimer section ("Not financial advice")
- [ ] **REPT-06**: Sources section lists all sources used with attribution

### Deployment

- [ ] **DEPLOY-01**: System runs locally on a user's device (local execution mode)
- [ ] **DEPLOY-02**: System is deployable as a web application (web mode)

## v2 Requirements

### Enhanced Data Sources

- **DATA-V2-01**: Real-time quote data (vs. delayed/snapshot) via Polygon.io Starter or similar
- **DATA-V2-02**: Earnings call transcripts
- **DATA-V2-03**: Insider trading filings (Form 4)
- **DATA-V2-04**: Options flow / unusual activity signals

### User Accounts

- **USER-01**: User can connect their own NotebookLM account for user-owned research reasoning
- **USER-02**: User can view history of past research reports
- **USER-03**: User can save and annotate reports

### Enhanced Analysis

- **ANLYS-01**: Historical signal comparison (compare current signals to past research)
- **ANLYS-02**: Sentiment trend over time (not just current sentiment)
- **ANLYS-03**: Sector/peer comparison

## Out of Scope

| Feature | Reason |
|---------|--------|
| Portfolio tracking | Separate product; not core to research value |
| Trade execution / brokerage integration | Out of scope entirely; research-only tool |
| Stock screener / filter tools | Different UX paradigm; not a research report |
| Mobile native app | Web-first; mobile deferred |
| Storing research artifacts in the repo | Explicitly excluded per CLAUDE.md — outputs are ephemeral |
| Real-time streaming data (v1) | Cost and complexity; batch research per request is sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TICK-01 | Phase 1 | Complete |
| TICK-02 | Phase 1 | Complete |
| TICK-03 | Phase 1 | Complete |
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 1 | Complete |
| DATA-07 | Phase 1 | Complete |
| DATA-08 | Phase 1 | Complete |
| RSRCH-01 | Phase 2 | Pending |
| RSRCH-02 | Phase 2 | Pending |
| RSRCH-03 | Phase 2 | Pending |
| RSRCH-04 | Phase 2 | Pending |
| RSRCH-05 | Phase 2 | Pending |
| RSRCH-06 | Phase 2 | Pending |
| RSRCH-07 | Phase 2 | Pending |
| REPT-01 | Phase 3 | Pending |
| REPT-02 | Phase 3 | Pending |
| REPT-03 | Phase 3 | Pending |
| REPT-04 | Phase 3 | Pending |
| REPT-05 | Phase 3 | Pending |
| REPT-06 | Phase 3 | Pending |
| DEPLOY-01 | Phase 4 | Pending |
| DEPLOY-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 — traceability updated after roadmap creation; REPT items moved to Phase 3; count corrected to 26*
