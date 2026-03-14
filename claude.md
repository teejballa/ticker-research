# Project Overview

This project builds a deployable **Ticker Research Assistant** that analyzes financial tickers and generates structured, source-based research reports.

The system evaluates financial data and produces:

- Market sentiment analysis
- Buy / Hold / Sell guidance
- Bullish and bearish signals
- Evidence-backed reasoning
- Source attribution for all research

The goal is to allow a user to input a ticker symbol and receive a **clear, structured research report with transparent reasoning and traceable sources**.

The project should be designed so it can function both as:

- a **local research tool for users**
- a **deployable web application suitable for a startup product**

---

# Core Design Principles

## Modular AI Architecture

The system separates **data collection, orchestration, and research reasoning** into distinct components to keep the system flexible and maintainable.

## Source-Grounded Research

All conclusions should be based on **retrieved sources and gathered data**, not unsupported model assumptions.

## Local-First Philosophy

Whenever possible, research functionality should support **execution on the user's device or within the user's environment**.

## Scalable Deployment

The architecture should remain compatible with future **web deployment and startup infrastructure**.

---

# System Architecture

The system consists of two primary functional layers.

---

## Data Collection & Orchestration Layer

**Claude Code SDK**

Claude Code SDK is responsible for gathering and preparing research inputs.

Responsibilities:

- Retrieve structured market data (price, volume, fundamentals) via **yahoo-finance2**
- Gather financial news, SEC filing summaries, analyst commentary, and sentiment signals via **Anthropic web search**
- Collect and attribute all relevant sources
- Prepare structured research inputs with timestamps
- Coordinate the research pipeline

**Data sources used:**
- `yahoo-finance2` (npm) — free, no API key required; covers price, volume, 52-week stats, P/E, revenue, EPS, market cap
- Anthropic API web search — covers news headlines, SEC filing summaries, analyst ratings/consensus, social/media sentiment

Claude Code functions as the **information pipeline and orchestration engine**, ensuring that downstream research components receive relevant and structured data.

---

## Research & Reasoning Layer

**notebooklm-py** (teng-lin, PyPI `notebooklm-py==0.3.4`)

The NotebookLM integration uses `notebooklm-py` — a Python async library that drives NotebookLM programmatically. It is **not** an official API (uses browser automation under the hood), but exposes a clean Python API.

**Installed via pip:** `pip install "notebooklm-py[browser]"` (see `scripts/requirements.txt`)

**What it does:**
- Creates notebooks programmatically per research run
- Adds raw text as a source: `add_text(notebook_id, title, content, wait=True)`
- Adds web URLs as sources: `add_url(notebook_id, url, wait=True)` — Gemini fetches and indexes the page
- Queries the notebook: `chat.ask(notebook_id, question)` — same as the NotebookLM chat UI
- Deletes notebooks after analysis to keep the user's account clean
- Runs **fully headless** after a one-time browser-based Google login

**Authentication:** One-time `notebooklm login` opens a browser for Google login. Credentials persist at `~/.notebooklm/auth.json`. All subsequent runs are fully headless — no user interaction per research run.

**Setup commands (one-time):**
```bash
pip install "notebooklm-py[browser]"
playwright install chromium
notebooklm login   # browser opens → user logs into Google → auth.json saved
```

**Dependencies:** Python 3.10+, Playwright + Chromium (auto-installed), `notebooklm-py==0.3.4`

**Rate limits:** ~50 queries/day on the free tier (resets midnight PST). At 6 queries per research run, this supports ~8 full runs per day.

NotebookLM functions as the **research reasoning engine** of the system. The Python script `scripts/notebooklm_research.py` creates a fresh notebook per run, adds sources, runs structured queries, and deletes the notebook on completion.

**Note on PleasePrompto notebooklm-skill:** The skill at `~/.claude/skills/notebooklm/` (cloned from https://github.com/PleasePrompto/notebooklm-skill) remains installed and is useful for Claude Code to query any NotebookLM notebook interactively during development. It is **not** used for the automated research pipeline — `notebooklm-py` handles that.

---

# System Data Flow

The pipeline runs in two modes depending on execution environment. Local execution supports the full notebooklm-skill flow. Cloud deployment routes the reasoning layer through a persistent container.

## Local Execution (Phases 1–3)

```
User → Next.js UI (localhost:3000)
  → First-time setup: GET /api/setup/status
      → checks: Python 3.10+, notebooklm-py installed, ~/.notebooklm/auth.json exists
      → POST /api/setup/install: spawns pip install -r scripts/requirements.txt + playwright install chromium (SSE progress)
      → POST /api/setup/auth: spawns notebooklm login (Chrome opens on user's screen → user logs into Google → auth.json saved)
  → /api/research/[ticker] (POST)
      → yahoo-finance2: price, volume, fundamentals
      → Anthropic web search: news, SEC filings, analyst ratings, sentiment
      → SourcePackage JSON → /tmp/source-package-[ticker].json
      → returns { filePath, ticker, assembled_at }
  → POST /api/analysis/[ticker]
      → child_process.spawn('python3', ['scripts/notebooklm_research.py', filePath])
          → creates fresh notebook (ticker + timestamp as title)
          → add_text(market data + fundamentals as structured text, wait=True)
          → add_url(each news URL from SourcePackage, wait=True)  [per-URL try/except; failed → source_warnings]
          → 6x chat.ask(structured questions)
          → delete notebook (clean up user's NotebookLM account)
          → prints PROGRESS: lines + final RESULT: line to stdout
      → Next.js reads stdout lines → SSE stream → frontend progress display
      → On RESULT line: AnalysisResult handed to Phase 3 report renderer
  → /research/[ticker] renders the formatted report
  → User downloads PDF
```

## Cloud/Deployed Execution (Phase 4 — Daytona container)

```
User → Next.js UI (Vercel)
  → /api/research/[ticker] (POST)
      → POST job to Daytona container (persistent, has Node.js 18+ + Python 3.10+ + Chromium)
          → Full notebooklm-py script runs inside container
          → Container has notebooklm-py pre-installed, user auth pre-configured (auth.json persists across restarts)
      → Stream results back via SSE
  → /research/[ticker] renders report
```

**Why Vercel Functions cannot run notebooklm-py directly:**
Vercel Functions are ephemeral serverless containers with no persistent filesystem, no display server for Playwright/Chromium, and binary size limits that preclude a full browser. The Daytona container runs persistently on user-owned infrastructure and has full access to Chromium, Python 3.10+, and the notebooklm-py library.

**Separation of responsibilities (must be preserved):**
- **Data Collection:** `yahoo-finance2` + Anthropic web search API — gather raw sources, produce SourcePackage
- **Research Brief Formatter:** SourcePackage JSON → structured text + URL list for NotebookLM ingestion
- **Research Reasoning:** `notebooklm-py` creates notebook → adds sources → runs queries → Gemini-synthesized answers → AnalysisResult schema
- **Report Renderer:** AnalysisResult → formatted page + PDF

Do not merge these layers. Each is independently testable and replaceable.

---

# Execution Model

## Local Execution (Current Architecture)

The app runs as a local Next.js server (`npm start`). The Claude Agent SDK runs inside Next.js API routes — no separate process needed. The SDK spawns a bundled Claude Code executable as a subprocess; no separate `claude` CLI installation is required.

**System requirements (local):**
- Node.js 18+
- Python 3.10+ (for notebooklm-py — 3.10 minimum, not 3.8)
- `ANTHROPIC_API_KEY` environment variable
- Google account (for NotebookLM)

**Auto-install flow (first launch):**
The API route at `GET /api/setup/status` checks:
1. Python 3.10+ is installed — if missing, UI shows link to python.org
2. `notebooklm-py` is installed — if not, `POST /api/setup/install` spawns `pip install -r scripts/requirements.txt && playwright install chromium` with SSE progress
3. `~/.notebooklm/auth.json` exists — if not, return `{ needsAuth: true }` to the UI
4. UI shows "Connect Your NotebookLM Account" → user clicks → `POST /api/setup/auth` spawns `notebooklm login` → browser opens on their screen → user logs into Google → `auth.json` saved

**Google account linking:**
`notebooklm-py` uses browser-based authentication (`notebooklm login`). The UX is identical to OAuth: user logs in once in a browser window, credentials persist at `~/.notebooklm/auth.json`. All subsequent research runs are fully headless — no user interaction required per run.

## Web Application Deployment (Phase 4)

`notebooklm-py` runs inside a **Daytona container** on the user's own infrastructure. The container is pre-configured with all dependencies. The Next.js frontend (on Vercel or similar) sends research jobs to the container via API and streams results back.

This preserves the "user-owned reasoning infrastructure" goal: the Daytona container is the user's environment, running under their Google account.

---

# NotebookLM Setup (User One-Time — Automated by App)

The app's setup wizard handles this automatically on first launch. For reference, the underlying commands are:

```bash
# Install notebooklm-py and Playwright browser
pip install "notebooklm-py[browser]"
playwright install chromium

# Auth setup (opens browser → user logs into Google → auth.json saved)
notebooklm login
```

No notebook needs to be created manually. The `scripts/notebooklm_research.py` script creates a fresh notebook for each research run and deletes it afterward.

**Per-ticker research run (fully automatic after setup):**
1. User enters ticker and confirms the chart
2. App calls `POST /api/research/[ticker]` → gathers data → writes SourcePackage to `/tmp/source-package-[ticker].json`
3. App calls `POST /api/analysis/[ticker]` → spawns `scripts/notebooklm_research.py`
4. Script creates notebook, adds sources, runs 6 queries, deletes notebook, prints `RESULT: {...}`
5. Frontend streams progress updates and renders the final report

**The user only ever interacts with: entering a ticker, confirming the chart, and waiting for results.**

---

# Research Output Storage

Generated research artifacts (such as research PDFs or research pages) **must not be stored in this repository or committed to the project codebase**.

In production, these outputs should be:

- generated temporarily
- delivered to the user
- stored on the user's device or within the user's environment

Future deployment architectures may allow storage within **user accounts or user-owned environments**, but not within the source repository.

---

# Development Roadmap

Development should proceed in stages.

## Phase 1 — Research Pipeline Prototype

Goals:

- Build the ticker research workflow
- Integrate Claude Code SDK
- Implement source gathering for:
  - market data
  - financial news
  - supporting research sources

Outputs should be **clean, structured research inputs**.

---

## Phase 2 — NotebookLM Research Integration

Goals:

- Setup wizard: `GET /api/setup/status` checks Python 3.10+, `notebooklm-py` install, and `~/.notebooklm/auth.json`; `POST /api/setup/install` + `POST /api/setup/auth` handle automated install and one-time Google login
- Format Phase 1 SourcePackage into structured text + URL list for `notebooklm-py` ingestion
- `scripts/notebooklm_research.py`: creates fresh notebook per run, adds sources via `add_text`/`add_url`, runs 6 structured queries via `chat.ask`, deletes notebook, streams `PROGRESS:` and `RESULT:` lines to stdout
- `POST /api/analysis/[ticker]`: spawns Python script, reads stdout, SSE streams progress and final `AnalysisResult` to frontend
- Parse Gemini responses into typed `AnalysisResult` schema
- Wire the full flow into the app UI with streaming progress display

Focus during this phase is **research quality, source grounding, and end-to-end flow reliability**.

---

## Phase 3 — Report Output

Goals:

- Render the `AnalysisResult` as a formatted research report page
- Generate downloadable PDF from the report
- Display data timestamps, source attribution, and financial disclaimer

---

## Phase 4 — Deployment & Environment Setup

Goals:

- Package the application for distribution (local install via `npm install && npm start`)
- Create a **Daytona container** with full dependency stack: Node.js 18+, Python 3.10+, Chromium, `notebooklm-py` pre-installed via `scripts/requirements.txt`
- Auth is NOT baked into the container image — user runs `notebooklm login` once inside the Daytona container; `~/.notebooklm/auth.json` persists across container restarts
- Daytona container runs `scripts/notebooklm_research.py` on user-owned infrastructure
- Next.js frontend (Vercel) sends research jobs to the Daytona container and streams results back
- Ensure reproducible environments
- Prepare the system for deployment as a web application or local tool

---

# Development Guidelines for AI Agents

When contributing to this repository, agents should follow these principles:

1. Maintain **clear separation between data gathering and research reasoning**
2. Prefer **modular and reusable components** over monolithic scripts
3. Prioritize **source retrieval before analysis**
4. Avoid unnecessary infrastructure during early development
5. Design systems that can support both **local execution and future web deployment**
6. Never store generated research artifacts inside the repository

Agents should focus on improving the **research pipeline, reliability, and clarity of outputs**.

---

# Expected Output Format

Ticker research responses should follow this structure:

1. **Ticker Overview**
2. **Market Sentiment Summary**
3. **Key Bullish Factors**
4. **Key Bearish Factors**
5. **Buy / Hold / Sell Assessment**
6. **Confidence Level**
7. **Sources Used**

All conclusions should reference the **supporting research sources whenever possible**.

---

# Long-Term Vision

The long-term goal is to build a **personal AI financial research assistant** capable of running locally or as a scalable web application.

Future capabilities may include:

- rapid ticker analysis
- sentiment monitoring
- historical signal comparison
- expanded financial research tools

The system should prioritize:

- transparency
- modular AI architecture
- user ownership of research workflows
- scalable deployment potential