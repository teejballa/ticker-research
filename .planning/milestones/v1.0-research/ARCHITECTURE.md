# Architecture Patterns

**Domain:** AI-powered financial ticker research assistant
**Researched:** 2026-03-10
**Confidence:** MEDIUM — project constraints are well-defined; NotebookLM programmatic integration has LOW confidence due to limited public API documentation as of knowledge cutoff

---

## Recommended Architecture

The system is a two-layer pipeline with a thin coordination surface between them. The boundary is strict: the first layer (Claude Code SDK) owns all I/O with the external world; the second layer (NotebookLM) owns all reasoning.

```
┌─────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                        │
│              (CLI for local / Web UI for deployed)           │
└────────────────────────────┬────────────────────────────────┘
                             │ ticker symbol input
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              LAYER 1: DATA COLLECTION & ORCHESTRATION        │
│                      (Claude Code SDK)                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Ticker       │  │ Data         │  │ Source           │   │
│  │ Validator    │→ │ Gatherers    │→ │ Packager         │   │
│  │              │  │ (per domain) │  │                  │   │
│  └──────────────┘  └──────────────┘  └─────────┬────────┘   │
│                                                │             │
└────────────────────────────────────────────────┼────────────┘
                                                 │ structured sources
                                                 ▼
┌─────────────────────────────────────────────────────────────┐
│              LAYER 2: RESEARCH & REASONING                   │
│                      (NotebookLM Skill)                      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Source       │  │ Analysis     │  │ Report           │   │
│  │ Ingestion    │→ │ Engine       │→ │ Formatter        │   │
│  │              │  │              │  │                  │   │
│  └──────────────┘  └──────────────┘  └─────────┬────────┘   │
│                                                │             │
└────────────────────────────────────────────────┼────────────┘
                                                 │ formatted report
                                                 ▼
                                        USER (report output)
```

---

## Component Boundaries

| Component | Layer | Responsibility | Communicates With |
|-----------|-------|---------------|-------------------|
| User Interface | Surface | Accepts ticker input, renders report output | Ticker Validator (in), Report Formatter (out) |
| Ticker Validator | Layer 1 | Resolves ticker symbol to confirmed company; provides chart preview for user confirmation | Data Gatherers (on confirmation) |
| Data Gatherers | Layer 1 | Parallel collectors: market data, news articles, fundamentals, analyst sentiment, future outlook | Source Packager |
| Source Packager | Layer 1 | Normalizes collected data into a structured source bundle (text, URLs, metadata) suitable for NotebookLM | NotebookLM Skill (Source Ingestion) |
| Source Ingestion | Layer 2 | Accepts source bundle; uploads sources to NotebookLM notebook (via API or skill) | Analysis Engine |
| Analysis Engine | Layer 2 | NotebookLM processes sources; produces sentiment, bullish/bearish signals, Buy/Hold/Sell reasoning | Report Formatter |
| Report Formatter | Layer 2 | Structures NotebookLM output into the canonical report format with source citations | User Interface (out) |

**Boundary rule:** Layer 1 components must never perform reasoning or draw conclusions. Layer 2 components must never perform external I/O. The Source Packager / Source Ingestion interface is the only crossing point.

---

## Data Flow

### Step-by-step flow (happy path)

```
1. User inputs ticker symbol
        │
        ▼
2. Ticker Validator resolves symbol → fetches lightweight chart/price preview
        │
        ▼
3. User confirms correct company (chart confirmation prevents wasted research)
        │
        ▼
4. Data Gatherers run in parallel:
        ├── Market data (price, volume, technicals) via financial data API
        ├── Recent news articles (last 30–90 days) via news API
        ├── Company fundamentals (revenue, earnings, balance sheet)
        ├── Analyst ratings and price targets
        └── Public/social sentiment signals
        │
        ▼
5. Source Packager normalizes outputs:
        - Deduplicates sources
        - Truncates / summarizes to fit NotebookLM context limits
        - Attaches metadata (source name, URL, date) to each document
        - Produces a structured source bundle (list of documents + metadata)
        │
        ▼
6. Source bundle handed to NotebookLM Skill (Layer 1 → Layer 2 boundary)
        │
        ▼
7. Source Ingestion uploads documents to a per-request NotebookLM notebook
        │
        ▼
8. Analysis Engine queries NotebookLM with structured prompts:
        - Overall market sentiment
        - Bullish signals with source citations
        - Bearish signals with source citations
        - Buy / Hold / Sell reasoning
        - Confidence assessment
        │
        ▼
9. Report Formatter assembles canonical output:
        - Ticker Overview
        - Market Sentiment Summary
        - Key Bullish Factors (with sources)
        - Key Bearish Factors (with sources)
        - Buy / Hold / Sell Assessment
        - Confidence Level
        - Sources Used
        │
        ▼
10. Report delivered to user (rendered page or file)
         Notebook cleaned up / ephemeral (not persisted in repo)
```

---

## Suggested Build Order

Build in dependency order — each phase unblocks the next.

### Step 1: Ticker Validation + Data Gathering (no reasoning required)
**Why first:** Everything downstream depends on having clean, confirmed source data. Validate the ticker resolution and data collection before adding reasoning complexity.

Components to build:
- Ticker Validator (symbol → confirmed company + chart)
- At least one Data Gatherer (start with market data + news; add fundamentals, sentiment later)
- Source Packager (even a simple version that concatenates text)

Deliverable: Given a ticker, produce a structured text bundle of sources with no reasoning.

### Step 2: NotebookLM Skill Integration (reasoning layer)
**Why second:** Requires clean source input from Step 1. The integration surface (how sources are uploaded to NotebookLM and how analysis is extracted) is the highest-risk part of the system — validate it early.

Components to build:
- Source Ingestion (upload bundle to NotebookLM)
- Analysis Engine (query NotebookLM, extract structured responses)
- Report Formatter (assemble canonical output)

Deliverable: End-to-end pipeline — ticker in, formatted report out.

### Step 3: User Environment Integration
**Why third:** Requires the pipeline to be working. User authentication and per-user NotebookLM accounts are a configuration concern layered on top of the working pipeline.

Components to build:
- User authentication (Google OAuth if web, token-based if local)
- NotebookLM account connector (route requests through user's own account)

### Step 4: Deployment Packaging
**Why last:** Package what is already working. Daytona bubble, environment setup, and web app serving are packaging concerns.

---

## Local vs Web Deployment Differences

The architecture is identical between local and web deployments. The differences are surface-level configuration and how the user interface is served.

| Concern | Local Execution | Web Deployment |
|---------|----------------|----------------|
| User interface | CLI or local web server (localhost) | Hosted web application |
| Claude Code SDK execution | Runs on user's machine | Runs on backend server |
| NotebookLM account | User's own Google/NotebookLM account | System account (Phase 1-2) → user account (Phase 3+) |
| API keys | Stored in local `.env` | Stored in server environment variables / secrets manager |
| Research artifacts | Written to local filesystem, ephemeral | Generated in-memory or temp storage, delivered, discarded |
| Backend | Not needed | Required: API routes, session management, request queue |
| Auth | Not needed (user runs their own instance) | Required: user accounts, token management |

**Design implication:** The core pipeline (Ticker Validator → Data Gatherers → Source Packager → NotebookLM Skill → Report Formatter) should be written as a pure function with no server-specific dependencies. The interface layer (CLI vs HTTP handler) wraps this function. This keeps the pipeline portable.

---

## Claude Code SDK Integration Patterns

**Confidence: MEDIUM** — Based on Claude Code SDK documentation available through knowledge cutoff (August 2025). Verify current API surface before implementation.

Claude Code SDK is the orchestration engine for Layer 1. The recommended integration pattern:

### Pattern 1: Tool-Based Data Gathering
Define each Data Gatherer as a Claude Code tool (function with typed inputs/outputs). Claude Code orchestrates the tools in parallel to gather all required data for a ticker.

```typescript
// Conceptual structure — verify current SDK API
const tools = [
  {
    name: "get_market_data",
    description: "Fetch price, volume, and technical indicators for a ticker",
    input_schema: { ticker: string, period: string },
    handler: async ({ ticker, period }) => { /* financial API call */ }
  },
  {
    name: "get_news",
    description: "Fetch recent news articles for a ticker",
    input_schema: { ticker: string, limit: number },
    handler: async ({ ticker, limit }) => { /* news API call */ }
  },
  // ... additional gatherers
];
```

**Why this pattern:** Tools are composable, individually testable, and the SDK handles orchestration. Adding a new data source means adding one tool, not changing pipeline logic.

### Pattern 2: Structured Source Bundle Output
The final output of Layer 1 should be a typed structure, not free text. This makes the Layer 1 / Layer 2 boundary explicit and testable.

```typescript
interface SourceBundle {
  ticker: string;
  company_name: string;
  research_date: string;
  sources: Array<{
    type: "market_data" | "news" | "fundamentals" | "analyst" | "sentiment";
    title: string;
    content: string;    // truncated to fit context limits
    url?: string;
    date?: string;
  }>;
}
```

---

## NotebookLM Skill Integration Approach

**Confidence: LOW** — NotebookLM does not have a documented public REST API as of August 2025. The integration approach is constrained by what is actually available. This is the highest-risk technical component and requires early investigation.

### Known integration surfaces (as of August 2025)

| Method | Status | Notes |
|--------|--------|-------|
| Official REST API | Not publicly available | No documented programmatic API |
| Google Cloud / Vertex AI integration | Partial | Some NotebookLM functionality may be accessible via Vertex AI |
| Browser automation | Fragile | Possible but not recommended for production |
| Claude Code "NotebookLM skill" | Project-defined | This term appears to be project-internal; exact implementation TBD |

### Recommended approach given uncertainty

Because NotebookLM's programmatic interface is unclear, design the Analysis Engine behind an abstraction interface:

```typescript
interface ResearchReasoningEngine {
  analyze(bundle: SourceBundle): Promise<ResearchReport>;
}
```

The initial implementation can use Claude directly (with the source bundle as context) to produce the analysis, using the same output format that NotebookLM would produce. When the NotebookLM integration is validated, swap in the NotebookLM implementation behind the same interface. This avoids blocking Phase 1 progress on a low-confidence integration.

**Phase 2 should begin with a spike:** Upload sources to NotebookLM manually and verify the expected analysis quality before writing any automation code. This validates the reasoning layer before investing in integration code.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Merging Data Gathering with Reasoning
**What goes wrong:** Gathering market data and drawing conclusions in the same function/module.
**Why bad:** Makes it impossible to test data gathering independently; conflates two distinct failure modes (bad data vs. bad reasoning); breaks the architectural contract.
**Instead:** Layer 1 never concludes. Layer 2 never fetches. The Source Bundle is the contract.

### Anti-Pattern 2: Storing Research Artifacts in the Repository
**What goes wrong:** Saving generated PDFs, reports, or notebook content to `./output/` or similar.
**Why bad:** Bloats repo, introduces stale data, leaks potentially sensitive financial analysis.
**Instead:** All outputs are ephemeral — generated in-memory or temp storage, delivered to user, discarded.

### Anti-Pattern 3: Building a Backend Before It Is Required
**What goes wrong:** Adding Express/FastAPI + database + auth in Phase 1 to "future-proof" the app.
**Why bad:** Over-engineering before product/market fit; doubles the surface area to maintain; slows early iteration.
**Instead:** Start with a CLI or simple local UI. Introduce backend components only when a specific web deployment requirement cannot be satisfied without them.

### Anti-Pattern 4: Hard-Coding NotebookLM as the Only Reasoning Path
**What goes wrong:** Writing all analysis code directly against NotebookLM's interface (whatever it turns out to be) with no abstraction.
**Why bad:** NotebookLM's API surface is uncertain; if it changes or is unavailable, the entire reasoning layer breaks.
**Instead:** Define `ResearchReasoningEngine` as an interface. NotebookLM is one implementation. Claude-direct is the fallback implementation.

### Anti-Pattern 5: Sequential Data Gathering
**What goes wrong:** Fetching market data, then news, then fundamentals one at a time.
**Why bad:** Research latency adds up — 5 sequential network calls at 1–2s each = 5–10s before any analysis begins.
**Instead:** Data Gatherers run in parallel (Promise.all or equivalent). Source Packager assembles results after all complete.

---

## Scalability Considerations

| Concern | Local (single user) | Web MVP (dozens of users) | Web Scale (thousands) |
|---------|---------------------|--------------------------|----------------------|
| Data gathering | Direct API calls | Same — per request | Rate limiting + caching layer needed |
| NotebookLM notebooks | Per-request, deleted after | Same | Notebook lifecycle management required |
| API key management | `.env` file | Server env vars | Secrets manager (AWS Secrets, GCP Secret Manager) |
| Concurrency | N/A | Simple queue or async | Job queue (BullMQ, Celery) |
| Report storage | Local filesystem | In-memory, delivered | User accounts with storage |

---

## Sources

- Project requirements: `/Users/tj/Desktop/Ticker-Research/.planning/PROJECT.md`
- Project guidelines: `/Users/tj/Desktop/Ticker-Research/CLAUDE.md`
- Claude Code SDK: training data through August 2025 (MEDIUM confidence — verify current API)
- NotebookLM programmatic API availability: training data through August 2025 (LOW confidence — requires validation spike in Phase 2)
- AI financial research pipeline patterns: general knowledge of LLM orchestration patterns (MEDIUM confidence)
