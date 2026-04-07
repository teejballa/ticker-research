<p align="center">
  <img src="docs/banner.png" alt="Cipher — AI-Powered Investment Research" width="100%" />
</p>

<h1 align="center">Cipher [Ciphersearch.app]] </h1>
<p align="center">
  <strong>AI-powered investment research that shows its work.</strong><br/>
  Enter a ticker. Get a source-cited research report with bullish/bearish signals, a Buy/Hold/Sell assessment, and a confidence score — every claim traced back to real data.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <!-- Replace with actual screenshot -->
  <img src="docs/report-screenshot.png" alt="Research report screenshot" width="720" />
</p>

---

## The Problem

Most AI finance tools either hallucinate numbers or give vague, unattributed analysis. You get a "Buy" recommendation with no evidence, or a wall of text with no sources. You can't tell what's real and what the model invented.

## The Solution

Cipher retrieves fresh data from multiple sources, structures it into a typed source package, and feeds it to an AI reasoning engine that **cites every claim**. No hallucinated numbers. No vague hand-waving. Every bullish signal, bearish signal, and assessment percentage traces back to a real source.

---

## Features

- **Ticker Search** — Real-time autocomplete across all major exchanges
- **Chart Confirmation** — Live 1-month OHLCV chart (TradingView) so you confirm the right stock before researching
- **Parallel Data Pipeline** — Market data, fundamentals, news, analyst sentiment, SEC filings, and social sentiment fetched simultaneously
- **Source-Cited Analysis** — Every claim in the report links back to its data source
- **Buy/Hold/Sell Assessment** — Percentage breakdown with confidence score
- **Bullish & Bearish Signals** — Structured evidence with attribution
- **Report History** — Save, revisit, and regenerate past reports
- **PDF Export** — Print-ready research reports
- **Google Auth** — Sign in to persist your report history
- **Terminal Aesthetic** — zinc-950 + amber-400 design language. Looks like a trading terminal, not a toy.

**Only one API key required:** `ANTHROPIC_API_KEY`. No Bloomberg Terminal, no Finnhub, no paid data subscriptions.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA COLLECTION                         │
│                                                             │
│   yahoo-finance2              Anthropic Web Search          │
│   ├─ Market data              ├─ News & headlines           │
│   ├─ Fundamentals             ├─ Analyst sentiment          │
│   ├─ Chart (OHLCV)            ├─ SEC filing summaries       │
│   └─ Company profile          └─ Social sentiment           │
│                                                             │
│          └──────── Promise.allSettled ────────┘             │
│                         │                                   │
│                   SourcePackage                              │
│              (fully typed JSON)                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    AI ANALYSIS                               │
│                                                             │
│   Anthropic Messages API reasoning engine                   │
│   ├─ Processes structured source data                       │
│   ├─ Generates bullish signals (with citations)             │
│   ├─ Generates bearish signals (with citations)             │
│   ├─ Calculates Buy/Hold/Sell breakdown                     │
│   └─ Assigns confidence level                               │
│                         │                                   │
│                   AnalysisResult                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                    Research Report
                  (web + PDF export)
```

Single-source failures don't crash the pipeline — `Promise.allSettled` ensures partial data still produces useful analysis.

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/cipher.git
cd cipher

# Install dependencies
npm install

# Set your Anthropic API key
echo "ANTHROPIC_API_KEY=your_key_here" > .env.local

# Run it
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Search a ticker, confirm the chart, get your report.

**Requirements:** Node 18+, Python 3.10+ (for container routes)

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Market Data | yahoo-finance2 |
| AI / Search | Anthropic SDK (Messages API + web search) |
| Charts | lightweight-charts (TradingView) |
| Database | Neon (PostgreSQL) |
| Auth | Google OAuth |
| Testing | Vitest |
| Frontend Deploy | Vercel |
| Container Deploy | Google Cloud Run |

### Key Types

```typescript
// All collected data, structured and typed
interface SourcePackage {
  marketData: MarketSnapshot;
  fundamentals: Fundamentals;
  news: NewsItem[];
  analystSentiment: SentimentData;
  secFilings: FilingSummary[];
  socialSentiment: SocialData;
}

// AI reasoning output
interface AnalysisResult {
  bullishSignals: Signal[];   // each with source citation
  bearishSignals: Signal[];   // each with source citation
  assessment: {
    buy: number;              // percentage
    hold: number;
    sell: number;
  };
  confidence: number;
  brief: string;
}
```

### Key Design Decisions

- **Anthropic web search replaces 3 separate APIs** (Finnhub, SEC EDGAR, Reddit) — one credential, one client, broader coverage
- **Promise.allSettled for data collection** — a single failed source doesn't kill the whole report
- **Terminal aesthetic** — zinc-950 backgrounds, amber-400 accents, flat sharp-edged surfaces. Designed to feel like a real trading tool.
- **No hallucinated data** — the model never generates financial numbers. All data is retrieved, structured, then reasoned about.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ticker/search?q=` | GET | Ticker autocomplete |
| `/api/ticker/chart?symbol=` | GET | 1-month OHLCV data |
| `/api/research/[ticker]` | POST | Full data collection pipeline |
| `/api/analysis/[ticker]` | GET | AI analysis + report generation |
| `/api/setup/` | GET | Setup wizard & validation |

---

## Deployment

**Frontend (Vercel):**
```bash
vercel deploy
```

**Container (Google Cloud Run):**
```bash
# Build and push container
gcloud builds submit --tag gcr.io/PROJECT_ID/cipher

# Deploy
gcloud run deploy cipher \
  --image gcr.io/PROJECT_ID/cipher \
  --platform managed \
  --allow-unauthenticated
```

**Environment Variables:**
| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for analysis + web search |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth (for report persistence) |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth |
| `CONTAINER_URL` | Production | Cloud Run container URL |

---

## Roadmap

- [x] Ticker search + chart confirmation
- [x] Parallel data collection pipeline
- [x] AI reasoning engine with source citations
- [x] Terminal-aesthetic report renderer + PDF export
- [x] Google auth + report history
- [x] Vercel + database deployment
- [ ] Google Cloud Run container migration (in progress)
- [ ] Schwab OAuth — connect your brokerage, research your holdings
- [ ] Portfolio-level analysis (not just single tickers)
- [ ] Watchlist with automated daily reports

---

## Development

This project uses a phased planning system. See `.planning/` for research docs, phase plans, and architecture decisions.

```bash
# Run tests
npm test

# Run dev server
npm run dev

# Type check
npx tsc --noEmit
```

---

## Built by

**TJ Walsh** — High school student building AI tools for investment research.

- Built for learning, not for financial advice
- This is a research tool, not a trading platform
- Past performance of any analysis does not predict future results

---

<p align="center">
  <sub>Built with Next.js, Anthropic, and too much time staring at stock charts.</sub>
</p>
