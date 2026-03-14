# Feature Landscape

**Domain:** Financial ticker research / stock analysis assistant
**Researched:** 2026-03-10
**Confidence note:** Web search and WebFetch tools were unavailable during research. All findings are drawn from training data on Simply Wall St, Finviz, Seeking Alpha, Bloomberg Terminal, Morningstar, Stock Analysis, and AI-powered research tools (e.g., Perplexity Finance, Koyfin). Confidence levels are marked accordingly. Training data cutoff: August 2025.

---

## Table Stakes

Features users expect from any stock research tool. Missing or broken = users leave or don't trust the product.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Ticker search with disambiguation | Every tool has it; tickers collide (e.g., "PARA" changed, "META" is Meta, not Metacore) | Low | Must confirm exchange + company name before running research |
| Stock confirmation step (chart preview or name+exchange display) | Prevents wasted research on wrong ticker; Simply Wall St and Bloomberg both do this | Low-Med | PROJECT.md already lists this as a requirement — good instinct |
| Current price + basic quote data | Users expect to see price, change %, market cap, volume at minimum | Low | Can source from Yahoo Finance API, Alpha Vantage, Polygon.io, or Financial Modeling Prep |
| Analyst Buy/Hold/Sell consensus | Wall Street consensus is the anchor most retail users compare against | Low | Available from most free/paid data APIs |
| Price target (analyst consensus) | Pairs with Buy/Hold/Sell; users want a number to compare to current price | Low | Same APIs as consensus ratings |
| Key fundamentals display | P/E, EPS (TTM + forward), revenue growth, profit margin, debt-to-equity | Med | Standard across Finviz, Morningstar, Simply Wall St |
| Recent news headlines with source links | Users expect to see what's moving the stock right now | Low-Med | News APIs: Alphaalpaca, Benzinga, Polygon news, or web scraping |
| Earnings history + next earnings date | Earnings are the single biggest catalyst; any serious tool shows this | Low | Available via most financial APIs |
| 52-week high/low | Universal reference point for price context | Low | Part of basic quote data |
| Structured research report output | The core value prop of this product — if the report is unstructured users won't trust it | Med | Defined format in CLAUDE.md already; well-scoped |
| Source attribution in report | Without sources, AI analysis is untrustworthy; Seeking Alpha and Bloomberg both surface sources | Med | This product's primary differentiator — non-negotiable |
| Sentiment summary (bullish/bearish signals) | Users want a synthesized view, not raw data; Simply Wall St's "snowflake" and Seeking Alpha's quant ratings are examples | Med-High | Core of NotebookLM reasoning layer |
| Clear confidence or caveat statement | Users need to know how reliable the analysis is | Low | Already in defined output format (Confidence Level field) |

---

## Differentiators

Features that set this product apart. Users don't assume these exist, but they create competitive advantage and loyalty when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Source-grounded AI reasoning (no hallucination) | Most AI tools assert conclusions without evidence; this product shows its work | High | The NotebookLM layer is specifically designed for this — every claim traces to a source |
| NotebookLM as reasoning engine (user-owned) | Users own their research; no black-box centralized AI model controlling outputs | High | Phase 3 of roadmap — true differentiator once user account integration exists |
| Chart confirmation before research runs | Prevents bad UX from wrong ticker; creates trust before the first result | Low | Simple but surprisingly absent in many tools — good for early trust-building |
| Structured bullish vs bearish signal breakdown | Simply Wall St and Seeking Alpha do this but with opaque weighting; this tool surfaces source-backed signals | Med | The core report format — execution quality is the differentiator here |
| Transparent pipeline (what was gathered, from where) | Show users what sources were collected before NotebookLM processes them | Med | "Sources Used" section in report covers this; could go further with source list in report |
| Local execution option | Users can run the research pipeline on their own device without a cloud backend | High | Phase 4 of roadmap; rare in the market — most tools are cloud-only |
| User's own NotebookLM account for analysis | Research reasoning happens inside the user's environment, not a shared server | High | Privacy-first; differentiates from Seeking Alpha, Koyfin, etc. |
| Ephemeral report delivery (no storage of outputs) | Privacy-conscious design; reports go to the user, not a database | Low | Already a design constraint in PROJECT.md — easy win to communicate as a feature |
| Future outlook synthesis | Gathering analyst estimates, management guidance, and sector trends into a "what's ahead" section | Med-High | Not just historical data — forward-looking synthesis is rare in free tools |
| Public sentiment signal | Reddit (WallStreetBets, r/investing), Twitter/X, Stocktwits aggregation | High | Valuable leading indicator; complex to gather reliably; flag as Phase 2+ |

---

## Anti-Features

Features to deliberately NOT build in v1. Each is a distraction or premature complexity that would slow delivery without validating core value.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real-time streaming price data | Requires WebSocket infrastructure, data licensing, high cost; adds latency complexity | Use snapshot price at research time; label timestamp clearly |
| Portfolio tracking | Scope creep; changes the product from research tool to portfolio manager; different UX entirely | Keep focus on single-ticker research per session |
| Trade execution / brokerage integration | Regulatory risk, compliance overhead, entirely different product surface | Explicitly disclaim: "for research only, not financial advice" |
| Stock screener (multi-ticker filtering) | Finviz does this better; building a screener is a full separate product | Let users come in with a ticker; don't try to surface tickers for them |
| Price alerts / watchlists | Requires persistent accounts, notification infrastructure, background jobs | Out of scope for local-first research tool |
| Historical signal backtesting | Enormous complexity; requires clean historical data, backtesting engine, statistical validation | Not relevant to the report-per-ticker model |
| Social/community features (comment threads, ratings) | Seeking Alpha has this and it degrades signal quality; drives moderation complexity | Keep the product a single-user research tool |
| Mobile native app | Different build pipeline; premature before web version is validated | Web-first; responsive design handles mobile adequately in v1 |
| Options / derivatives data | Different user segment (options traders); adds significant data sourcing complexity | Stick to equity fundamentals in v1 |
| Earnings call transcript analysis | Valuable but high complexity — requires transcript sourcing, full-document LLM processing | Flag as Phase 2+ enhancement; not v1 |
| Multi-language / international ticker support | Non-US exchanges have different data availability, regulatory context, currency complexity | US-listed tickers only in v1 (NYSE, NASDAQ, AMEX) |

---

## Feature Dependencies

```
Ticker input
  → Ticker disambiguation / exchange confirmation
      → Chart preview / basic quote display [confirms correct ticker]
          → Data gathering pipeline (market data, news, fundamentals, outlook)
              → Structured research inputs (Claude Code SDK output)
                  → NotebookLM analysis (sentiment, bullish/bearish, buy/hold/sell)
                      → Structured report with source attribution
                          → Report delivery to user

Analyst consensus / price targets
  → Required before Buy/Hold/Sell section (provides benchmark)

News gathering
  → Required before sentiment analysis (primary signal source)

Company fundamentals
  → Required before financial health assessment
  → Required before valuation commentary (P/E context, etc.)

Source attribution
  → Depends on NotebookLM preserving source links from gathered inputs
  → Claude Code SDK must pass sources through, not just content
```

---

## MVP Recommendation

Build in this priority order to validate core value as fast as possible:

**Must have in v1:**
1. Ticker input with disambiguation and chart/name confirmation
2. Data gathering: current price, basic quote, fundamentals, recent news, analyst consensus
3. Structured research inputs passed to NotebookLM
4. NotebookLM-generated report: sentiment, bullish signals, bearish signals, Buy/Hold/Sell reasoning
5. Source attribution section in report (non-negotiable for trust)
6. Confidence level statement in report

**Defer to Phase 2:**
- Public sentiment (Reddit/Stocktwits) — high complexity, not core
- Earnings transcript analysis — high complexity
- User's own NotebookLM account — Phase 3 per roadmap

**Defer to Phase 3+:**
- Local execution model — Phase 4 per roadmap
- Forward outlook synthesis beyond analyst estimates — needs prompt engineering iteration

**Never build:**
- Portfolio tracking, trade execution, stock screener, social features, mobile native (see Anti-Features)

---

## Competitive Landscape Notes

| Tool | Strength | Weakness | What to Learn |
|------|----------|----------|---------------|
| Simply Wall St | Visual "snowflake" scoring, intuitive UI | Opaque scoring methodology; no source tracing | Visual clarity matters; but show your work |
| Finviz | Fast screener, dense data display | No narrative analysis; overwhelming for non-experts | Data completeness table stakes; but narrative adds value |
| Seeking Alpha | Rich analyst articles, quant ratings | Paywalled; subjective author quality varies | Source diversity is valuable; but quality control matters |
| Bloomberg Terminal | Most comprehensive | $24K/year; complexity overwhelming | Depth is differentiating but accessibility wins for retail |
| Koyfin | Modern Bloomberg alternative | Data depth but no AI synthesis | AI synthesis is the gap in the market |
| Perplexity Finance | AI-powered, fast, sourced | Generic; not equity-research-specific; no structured report format | Source attribution done right; but domain-specific structure adds trust |

**The gap this product fills:** Source-grounded, structured AI research reports for individual tickers, accessible to retail investors, with transparent reasoning — none of the existing tools do all three well simultaneously.

---

## Confidence Assessment

| Feature Category | Confidence | Basis |
|-----------------|------------|-------|
| Table stakes identification | HIGH | Consistent across all major tools in training data; well-established market norms |
| Differentiator framing | MEDIUM | Based on observed gaps in existing tools as of Aug 2025; market may have shifted |
| Anti-features list | HIGH | These are scope decisions aligned with project constraints in CLAUDE.md and PROJECT.md |
| Competitive landscape | MEDIUM | Tool features verified via training data through Aug 2025; new features may exist |
| Feature dependencies | HIGH | Logical dependencies based on project architecture in CLAUDE.md |

---

## Sources

- Training data: Simply Wall St, Finviz, Seeking Alpha, Bloomberg Terminal, Koyfin, Morningstar, Stock Analysis, Perplexity Finance feature sets (as of Aug 2025 knowledge cutoff)
- Project context: `/Users/tj/Desktop/Ticker-Research/.planning/PROJECT.md`
- Architecture constraints: `/Users/tj/Desktop/Ticker-Research/CLAUDE.md`
- Note: WebSearch and WebFetch tools were unavailable during research. Independent verification against current product pages is recommended before roadmap finalization.
