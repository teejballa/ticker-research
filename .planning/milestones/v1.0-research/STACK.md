# Technology Stack

**Project:** Ticker Research Assistant
**Researched:** 2026-03-10
**Note:** External search tools were unavailable during this research session. Findings are based on training data through August 2025. All confidence levels reflect this. Items marked LOW confidence require manual verification before implementation.

---

## Recommended Stack

### Core Orchestration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Claude Code SDK | Latest (check anthropic.com) | Data orchestration, pipeline coordination, tool calling | Specified in CLAUDE.md; purpose-built for agentic workflows with tool use; handles sub-agent spawning and structured outputs natively |
| Node.js | 20 LTS | Runtime for SDK and backend glue | Claude Code SDK TypeScript/Node support is primary; v20 LTS is stable through 2026 |
| TypeScript | 5.x | Type safety across the pipeline | Prevents runtime errors in financial data transformations; Claude Code SDK ships TypeScript types |

### Financial Data APIs

These are ranked by recommendation strength. The project needs: price/quote data, fundamentals, analyst ratings, and chart data for the ticker confirmation step.

| Technology | Tier | Purpose | Why |
|------------|------|---------|-----|
| Yahoo Finance (via yfinance or yahoo-finance2 npm) | Free | Price quotes, fundamentals, analyst estimates, historical OHLCV | No API key required; extremely broad coverage; well-maintained community libraries; sufficient for MVP and early phases; unofficial but widely used |
| Polygon.io | Free tier (5 calls/min) / Starter $29/mo | Production-grade market data, OHLCV, snapshots | Official API with documented SLAs; free tier covers prototyping; Starter tier removes rate limits and adds real-time data; use when Yahoo Finance reliability becomes a bottleneck |
| Alpha Vantage | Free (25 calls/day) / Premium $50/mo | Fundamentals, earnings, technical indicators | Solid fundamentals coverage; free tier is extremely limited (25/day is the current limit as of 2025); premium required for any real usage volume |
| Financial Modeling Prep (FMP) | Free (250 calls/day) / $29/mo | Income statements, balance sheets, DCF data, analyst ratings | Better free tier than Alpha Vantage; strong fundamentals depth; good for Phase 1 development |

**Recommended for MVP:** Start with `yahoo-finance2` (npm package) for zero-cost, broad coverage. Add Polygon.io Starter ($29/mo) when moving to production or when rate limits block development.

**Do not use:** Alpha Vantage free tier — 25 calls/day is insufficient for a single research request that fetches multiple data types.

### News Aggregation

| Technology | Tier | Purpose | Why |
|------------|------|---------|-----|
| NewsAPI.org | Free (100 req/day, dev only) / $449/mo Business | General financial news by ticker keyword | Free dev tier is useful for prototyping; production pricing is steep; paywall restrictions on free tier (articles older than 1 month only) |
| Benzinga Pro API | Paid ($149+/mo) | Financial news specifically | Purpose-built for financial markets; high quality; expensive for early stage |
| Finnhub | Free (60 calls/min) / Paid tiers | Company news, earnings calendar, sentiment | **Best free tier for financial news**; 60 calls/minute is generous; includes sentiment data; returns news filtered by ticker symbol natively |
| SEC EDGAR API | Free | Official filings (10-K, 10-Q, 8-K) | Completely free; official source; critical for fundamentals and material event research; underused by competitors |

**Recommended for MVP:** Finnhub free tier for news (ticker-specific, good rate limits) + SEC EDGAR for filings. Both are free and together cover the most important source categories.

**Upgrade path:** Add Benzinga or Bloomberg API when the product reaches paying users who need real-time breaking news.

### Chart Data (for Ticker Confirmation Step)

| Technology | Purpose | Why |
|------------|---------|-----|
| TradingView Lightweight Charts (npm: lightweight-charts) | Client-side chart rendering for ticker confirmation UI | Free, open source (Apache 2.0), maintained by TradingView; renders OHLCV data; the de facto standard for web-based financial charts in 2025 |
| yahoo-finance2 (OHLCV endpoint) | Data source for chart | Same library used for price data; returns historical OHLCV sufficient to render a confirmation chart |

### AI Reasoning Engine

| Technology | Purpose | Why |
|------------|---------|-----|
| NotebookLM (Google) | Structured research reasoning, sentiment analysis, Buy/Hold/Sell output | Specified in CLAUDE.md; source-grounded reasoning means conclusions tie directly to provided documents; user can connect their own account for local-first execution |

**Critical note on NotebookLM integration (LOW confidence — verify before Phase 2):** As of my knowledge cutoff (August 2025), Google had not released a public programmatic API for NotebookLM. Integration required either: (a) the Claude Code SDK's NotebookLM skill (which appears to be a specialized tool in the Claude Code ecosystem — verify current availability at docs.anthropic.com), or (b) browser automation via Playwright/Puppeteer to interact with the NotebookLM web UI. Before beginning Phase 2, verify whether a NotebookLM API exists at notebooklm.google.com or through Google Cloud.

If no programmatic API exists at implementation time, the fallback is: Claude Code SDK calls a Playwright-based tool that uploads sources to NotebookLM and retrieves the output. This is fragile but functional.

**Alternative if NotebookLM API remains unavailable:** Use Claude's native document analysis (Anthropic API, `claude-3-5-sonnet`) with sources passed as context. Less "user-owned" but fully programmable and high quality.

### Web Application Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 14+ (App Router) | Full-stack web framework | Best-in-class for financial web apps: SSR for SEO, API routes eliminate need for separate backend in early phases, TypeScript-first, strong ecosystem; supports local execution via `next dev` and cloud deployment via Vercel |
| React | 18+ | UI component library | Ships with Next.js; component model fits the research report structure well |
| Tailwind CSS | 3.x | Styling | Utility-first; fast to prototype; no design system overhead needed at this stage |

**Do not use:** Express.js as the primary framework — over-engineering for Phase 1-2; Next.js API routes cover the same ground without a separate server.

### Backend / API Layer (Phase 4+)

Introduce only when needed for multi-user web deployment. Do not build early.

| Technology | Purpose | Why |
|------------|---------|-----|
| Next.js API Routes | Request handling in early phases | Already in the stack; no additional infrastructure |
| Vercel | Deployment | Zero-config Next.js deployment; serverless functions handle API routes; generous free tier; scales to production |

**Do not use:** Dedicated Express/Fastify server in early phases. Add only if API route complexity warrants it (e.g., Phase 4 when adding auth).

### Authentication (Phase 3+ only)

| Technology | Purpose | Why |
|------------|---------|-----|
| NextAuth.js (Auth.js) | User auth for web deployment | First-class Next.js integration; supports Google OAuth (needed if users connect Google/NotebookLM accounts); session management built in |

Do not implement until Phase 3. Phase 1-2 work is local-only with no auth requirement.

### Local Execution Runtime

| Technology | Purpose | Why |
|------------|---------|-----|
| Node.js 20 LTS | Local CLI script execution | Same runtime as web app; users can run `node research.js AAPL` locally without additional dependencies |
| dotenv | Environment variable management | API keys stored in `.env`, never committed; required for both local and web execution |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Financial data | yahoo-finance2 + Polygon.io | Alpha Vantage | Alpha Vantage free tier (25 calls/day) is insufficient for development; premium tier is pricier than Polygon.io with less data quality |
| Financial data | yahoo-finance2 + Polygon.io | Quandl/Nasdaq Data Link | Quandl was acquired by Nasdaq; pricing opaque; less developer-friendly than Polygon.io |
| News | Finnhub + SEC EDGAR | NewsAPI.org | NewsAPI free tier is dev-only (cannot deploy), article paywall restrictions, general news not financial-specific |
| Charts | TradingView Lightweight Charts | Chart.js | Chart.js is general purpose; Lightweight Charts is purpose-built for OHLCV financial data with proper candlestick rendering |
| Framework | Next.js | Vite + Express | Two separate apps to maintain; Next.js unifies frontend + API in one project; unnecessary complexity for early stages |
| AI reasoning | NotebookLM | Direct Anthropic API | Anthropic API is a strong fallback if NotebookLM API remains unavailable; loses "user-owned" reasoning model but gains full programmability |
| Deployment | Vercel | AWS / GCP | AWS/GCP introduce significant DevOps overhead; Vercel deploys Next.js with zero config; use cloud providers only if compliance or data residency requires |
| Auth | NextAuth.js | Supabase Auth | Supabase adds a database dependency not yet needed; NextAuth is lighter for Phase 3 requirements |

---

## Financial Data API Comparison

This is the most critical stack decision for Phase 1. Detail below.

| Criterion | yahoo-finance2 (npm) | Polygon.io Free | Polygon.io Starter ($29/mo) | Finnhub Free | FMP Free |
|-----------|---------------------|-----------------|------------------------------|--------------|----------|
| Price | Free | Free | $29/mo | Free | Free |
| Rate limit | Unofficial; generally permissive | 5 calls/min | Unlimited | 60 calls/min | 250 calls/day |
| Real-time quotes | Delayed (15 min) | No | Yes | Yes (some) | Delayed |
| Fundamentals | Yes (income, balance, ratios) | Limited | Limited | Yes | Yes (strong) |
| Analyst ratings | Yes | No | No | Yes | Yes |
| Historical OHLCV | Yes | Yes (2yr free) | Yes (full) | Yes | Yes |
| News | Yes (basic) | No | No | Yes (ticker-specific) | Yes |
| Earnings data | Yes | No | No | Yes | Yes |
| Official SLA | No (unofficial) | Yes | Yes | Yes | Yes |
| Best for | MVP, prototyping | - | Production data layer | MVP news | MVP fundamentals |

**Recommended Phase 1 combination:** `yahoo-finance2` (price, fundamentals, historical) + `Finnhub` free (news, sentiment) + SEC EDGAR (filings). Total cost: $0.

**Recommended Phase 3+ combination:** Polygon.io Starter ($29/mo, price/OHLCV) + Finnhub free or paid (news) + SEC EDGAR (filings) + FMP free/paid (deep fundamentals). Total cost: $29-80/mo.

---

## Installation

```bash
# Core framework
npm install next react react-dom typescript

# Financial data
npm install yahoo-finance2
# Finnhub SDK (optional, can also use fetch directly)
npm install finnhub

# Charts (for ticker confirmation UI)
npm install lightweight-charts

# Claude Code SDK (verify package name at docs.anthropic.com)
npm install @anthropic-ai/claude-code

# Environment management
npm install dotenv

# Dev dependencies
npm install -D @types/node @types/react @types/react-dom tailwindcss postcss autoprefixer
```

**Verify package names before installing.** The Claude Code SDK package name (`@anthropic-ai/claude-code`) should be confirmed at the official Anthropic docs — it may differ from the Anthropic Messages SDK (`@anthropic-ai/sdk`).

---

## Environment Variables Required

```
# Financial Data
POLYGON_API_KEY=          # Get at polygon.io (free tier available)
FINNHUB_API_KEY=          # Get at finnhub.io (free tier available)
FMP_API_KEY=              # Get at financialmodelingprep.com (free tier available)

# AI
ANTHROPIC_API_KEY=        # Required for Claude Code SDK

# NotebookLM (verify method at Phase 2)
GOOGLE_CLIENT_ID=         # If OAuth required for NotebookLM access
GOOGLE_CLIENT_SECRET=     # If OAuth required for NotebookLM access
```

Never commit `.env` to the repository. Add `.env` and `.env.local` to `.gitignore` immediately.

---

## Confidence Assessment

| Component | Confidence | Reason |
|-----------|------------|--------|
| Next.js as framework | HIGH | Stable, well-documented, strong community; no major changes expected |
| yahoo-finance2 for MVP data | MEDIUM | Unofficial API; Yahoo can break compatibility; confirmed working through mid-2025 |
| Polygon.io pricing/tiers | MEDIUM | Based on training data; pricing tiers can change; verify at polygon.io before committing |
| Finnhub free tier (60 calls/min) | MEDIUM | Based on training data; confirm current limits at finnhub.io |
| SEC EDGAR API (free) | HIGH | Official government API; stable; well-documented at sec.gov/developer |
| TradingView Lightweight Charts | HIGH | Open source Apache 2.0; widely adopted; stable API |
| Claude Code SDK integration | LOW | Package name, exact API surface, and "NotebookLM skill" capability need verification at docs.anthropic.com before Phase 1 begins |
| NotebookLM programmatic access | LOW | No confirmed public API as of August 2025; this is the highest-risk assumption in the entire stack; must be resolved before Phase 2 |
| Alpha Vantage free tier limits | MEDIUM | 25 calls/day confirmed through training data; verify current limits |
| Vercel deployment | HIGH | Zero-config Next.js deployment; stable and widely used |

---

## Sources

- Training data through August 2025 (no live web access available during this research session)
- SEC EDGAR Developer documentation: https://www.sec.gov/developer (verify)
- Anthropic Claude Code SDK: https://docs.anthropic.com/en/docs/claude-code/sdk (verify current package name and capabilities)
- Polygon.io pricing: https://polygon.io/stocks (verify current tiers)
- Finnhub API documentation: https://finnhub.io/docs/api (verify rate limits)
- TradingView Lightweight Charts: https://tradingview.github.io/lightweight-charts/ (HIGH confidence, Apache 2.0 open source)
- NotebookLM: https://notebooklm.google.com (verify programmatic access status — CRITICAL before Phase 2)
- yahoo-finance2 npm: https://www.npmjs.com/package/yahoo-finance2 (verify maintenance status)
