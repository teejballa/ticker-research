# Project Overview

This project builds **Cipher** — a deployable Ticker Research Assistant that
analyzes financial tickers and generates structured, source-based research reports.

The system evaluates financial data and produces:

- Market sentiment analysis (bullish / neutral / bearish + reasoning)
- Buy / Hold / Sell guidance with confidence level
- Bullish and bearish signals tied to sources
- Forward outlook + price target context
- Community Intelligence (Reddit / X / forums via Firecrawl)
- Engine Calibration — historical alpha-vs-SPY priors injected into the prompt

The goal is to allow a user to input a ticker symbol and receive a clear,
structured research report with transparent reasoning and traceable sources.

---

# Core Design Principles

1. **Source-grounded reasoning** — conclusions must reference retrieved data, not model assumptions.
2. **Modular pipeline** — data collection, prompt assembly, model reasoning, and rendering are independently testable.
3. **Self-improving thesis** — the diffusion learning engine accumulates priors per
   `(sentiment_type × cap_class × direction)` and injects them into every report.
4. **Scalable deployment** — primary target is a Vercel-hosted multi-user web app.

---

# System Architecture (current — post-Phase 12)

The reasoning layer is a pure-TypeScript pipeline. There is no Python, no container,
and no external notebook engine — the previous container-based stack was decommissioned
in Phase 12 (2026-04-15).

## Data Collection Layer (`src/lib/data/`)

Parallel fetchers feed a single `SourcePackage`:

- **yahoo-finance2** — primary market data + fundamentals (price, volume, 52w range, P/E, EPS, revenue, market cap)
- **Polygon** + **Finnhub** — fallback fields when Yahoo returns null. Field-level merge in `merge.ts` — first non-null wins. Each field carries a `FieldOrigin` (`yahoo` | `finnhub` | `polygon`).
- **Anthropic web search** (`anthropic-search.ts`) — news, SEC filings, analyst commentary, social sentiment
- **StockTwits API** + **yahoo-finance2 options** — bull/bear percentages and put/call ratio
- **Firecrawl** — community intelligence (Reddit / X / forums); Haiku-driven URL discovery

Output: `SourcePackage` JSON written to `/tmp/source-package-<ticker>.json`.

## Reasoning Layer (`src/lib/gemini-analysis.ts`)

- Uses Gemini via the **Vercel AI Gateway** (no separate provider key required in production).
- Reads the SourcePackage, formats it via `research-brief.ts` into a structured prompt, and calls Gemini with a Zod schema for the `AnalysisResult` shape.
- Injects **Engine Calibration Context** — the matching learned prior (alpha-vs-SPY) for the ticker's diffusion regime, looked up via `engine-context.ts`. Numbers in the prior are post-process overwritten so the LLM can't drift them.

## Diffusion Learning Engine (`src/lib/learning.ts` + crons)

Three Vercel cron jobs (configured in `vercel.json`):

1. `/api/cron/sentiment-scan` — sweeps the rotating watchlist, writes `SentimentSnapshot` rows
2. `/api/cron/price-followup` — closes the prediction loop at 3/7/14 days, computes alpha vs SPY
3. `/api/cron/learn` — Bayesian update of `LearnedPattern` priors

Surfaced via `EngineCalibrationPanel` in `/research/[ticker]` and the `InsightsDashboard` at `/insights`.

## Persistence

- **Neon Postgres** via Prisma (`@prisma/adapter-neon` singleton in `src/lib/db.ts`)
- **NextAuth** (Google provider) for identity; `Report.user_id` scopes per-user history

## Deployment

- **Vercel** for everything — Functions for API routes, Crons for the learning engine, Neon for storage, AI Gateway for Gemini.
- No container infrastructure. `DEPLOYMENT_MODE=web` switches the app from local-Filesystem persistence to Neon.

---

# System Data Flow

```
User → Vercel-hosted Next.js UI
  → POST /api/research/[ticker]
      → parallel fetch: yahoo + finnhub + polygon + anthropic web search
                       + stocktwits + options + firecrawl community
      → field-level merge (yahoo → finnhub → polygon)
      → SourcePackage JSON → /tmp/source-package-[ticker].json
  → POST /api/analysis/[ticker]
      → runGeminiAnalysis(pkg)
          → engine-context lookup → Engine Calibration block
          → research-brief → prompt
          → Gemini via AI Gateway (Zod-validated AnalysisResult)
      → writeReportToDb (web mode) or local file (local mode)
      → SSE stream of progress + final RESULT to client
  → /research/[ticker] renders ResearchReport + EngineCalibrationPanel
  → User downloads PDF via browser print
```

---

# Research Output Storage

In web mode, reports are persisted in Neon (`Report` table, scoped by `user_id`).
In local mode, reports are written to `~/.cipher/reports/`. **Do not commit
generated research artifacts** (PDFs, sample reports) to the repo.

---

# Development Roadmap (high level)

Detailed roadmap lives in `.planning/ROADMAP.md`. Current state:

- **Phases 1–9, 11–15: complete.** Data pipeline, multi-cap watchlist, Gemini reasoning, Firecrawl community, StockTwits, options sentiment, Forward Outlook, DB QA, Diffusion Learning Engine.
- **Phase 10:** field-level merge layer + UI source attribution shipped.
- **Phase 16: Technical Analysis** — context document only, plans pending.
- **Phase 17: Institutional & Insider Intelligence** — context document only, plans pending.

---

# Development Guidelines for AI Agents

1. Maintain a clean separation between data collection, prompt assembly, model reasoning, and rendering.
2. Prefer modular fetchers; new data sources go in `src/lib/data/` with their own unit tests.
3. Source retrieval comes before analysis — the LLM should never invent data.
4. Vitest for units (`npm test`), live-DB integration tests (`npm run test:integration`), Playwright for e2e (`npm run test:e2e`).
5. Never store generated research artifacts inside the repository.

---

# Expected Report Sections

1. **Ticker Overview** (with security-type badge)
2. **Market Sentiment** + reasoning
3. **Bullish / Bearish Signals** (each tied to a source)
4. **Buy / Hold / Sell Assessment** + confidence
5. **Forward Outlook** + price target context
6. **Sentiment Intelligence** (StockTwits + put/call)
7. **Community Intelligence** (Firecrawl-scraped public discussion)
8. **Engine Calibration** (learned prior alignment / disagreement)
9. **Sources Used**

All conclusions should reference their supporting source where possible.

---

# Long-Term Vision

A personal AI financial research assistant that calibrates itself against
the market over time. Future capabilities under planning:

- Technical analysis layer (Phase 16)
- Institutional + insider intelligence (Phase 17)
- Expanded sentiment niches via Firecrawl

Priorities: transparency, modularity, user-owned research history, and scalable deployment.
