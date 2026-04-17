# Phase 12: Intelligence Pipeline Rebuild — Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the NotebookLM browser-automation reasoning layer with a direct API-based intelligence pipeline. The data collection layer (yahoo-finance2 + Anthropic web search) is **unchanged**. This phase:

1. Eliminates the Python subprocess + NotebookLM + Cloud Run container stack entirely
2. Calls Gemini directly via AI SDK + Vercel AI Gateway from the TypeScript analysis route
3. Adds Firecrawl to scrape niche community sentiment (Reddit, blogs, comment threads) — URLs found by Anthropic search, content fetched by Firecrawl
4. Decommissions the Google Cloud Run container and all associated VNC/auth infrastructure
5. Evolves the AnalysisResult schema with improved depth and source attribution

**Not in scope:** Multi-source market data aggregation (Phase 10), institutionalized social sentiment pipeline (Phase 11). Those phases remain queued and will run against the new intelligence layer.

</domain>

<decisions>
## Implementation Decisions

### Scope
- **D-01:** Phase 12 is a targeted swap of the reasoning layer only — same data inputs (yahoo-finance2, Anthropic web search), different reasoning engine
- **D-02:** Phases 10 and 11 are not absorbed — they remain future phases to be executed against the new pipeline

### Gemini Integration
- **D-03:** Call Gemini via AI SDK + Vercel AI Gateway — use `generateText()` with model string `'google/gemini-2.0-flash'`. OIDC auth via `vercel env pull`, no GOOGLE_API_KEY or ANTHROPIC_API_KEY needed
- **D-04:** Reasoning logic lives inside `POST /api/analysis/[ticker]/route.ts` — no subprocess, no Python, no container for this step
- **D-05:** Keep existing SSE streaming protocol — emit `PROGRESS:` events from the TypeScript route the same way the Python script did. `<ResearchProgress />` UI requires zero changes

### Firecrawl Role
- **D-06:** Firecrawl scrapes niche community sentiment sources — Reddit threads, blog comment sections, small investor communities, StockTwits discussion pages
- **D-07:** URL discovery: Anthropic web search finds community discussion URLs for the ticker (queries like `$TICKER reddit discussion`, `TICKER stocktwits community`, `TICKER investing forum`). Firecrawl fetches full page content from those URLs
- **D-08:** Firecrawl scraped content is passed to Gemini as context, not added to NotebookLM (which no longer exists). Community sentiment becomes a distinct input section in the Gemini prompt

### AnalysisResult Schema Evolution
- **D-09:** Expand from 3 to 5 bullish signals and 3 to 5 bearish signals
- **D-10:** Add `price_target` field — analyst-consensus price target or target range if available from sources
- **D-11:** Richer source attribution is at Claude's discretion — improve `AnalysisSignal.source_citation` or `AnalysisSource` structure as makes sense for the new pipeline
- **D-12:** `StoredReport` wraps `AnalysisResult` — any schema changes must be backward-compatible or include a migration path for existing stored reports

### Container Decommission
- **D-13:** Decommission the Google Cloud Run container entirely in this phase
- **D-14:** Remove: `CONTAINER_URL`, `CONTAINER_SECRET`, `CONTAINER_VNC_URL` environment variables from Vercel
- **D-15:** Remove: VNC auth API routes (`src/app/api/setup/nbm-auth/`, `src/app/api/setup/nbm-auth/status/`)
- **D-16:** Remove: NotebookLM setup routes (`src/app/api/setup/install/`, `src/app/api/setup/auth/` if they still exist)
- **D-17:** Remove: `scripts/notebooklm_research.py`, `scripts/container_server.py`, `Dockerfile`, `scripts/setup.sh`, `scripts/notebooklm_auth.py`
- **D-18:** Remove: All `DEPLOYMENT_MODE` branching — the cloud container path is gone; local and deployed behavior is now identical (both call Gemini API directly)
- **D-19:** The GCP project (`cipher-491101`) and Google OAuth credentials can remain — they may be useful for future GCP services. Only the Cloud Run service and Artifact Registry image are deleted

### Claude's Discretion
- Exact Gemini prompt structure — how market data, news, and community sentiment are formatted as context sections
- How many Firecrawl URLs to scrape per run (balance quality vs latency)
- Whether to call Firecrawl in parallel with the existing Anthropic news search or sequentially
- Exact `AnalysisSource` / `AnalysisSignal` type changes beyond what's specified above
- Error handling for Firecrawl failures (graceful degradation — analysis proceeds without community sentiment if Firecrawl fails)
- Whether `FIRECRAWL_API_KEY` is required or optional (suggest optional with graceful skip)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current reasoning layer (being replaced)
- `scripts/notebooklm_research.py` — The 6-question protocol, AnalysisResult parser, PROGRESS:/RESULT:/ERROR: stdout protocol. The question structure and output parsing are the reference for what Gemini must produce
- `src/app/api/analysis/[ticker]/route.ts` — Current SSE route that spawns the Python subprocess. This becomes the Gemini call site

### Types and schema
- `src/lib/types.ts` — `AnalysisResult`, `AnalysisSignal`, `BuySellBreakdown`, `AnalysisSource`, `StoredReport`, `SourcePackage` — must understand all before modifying
- `src/lib/research-brief.ts` — Current SourcePackage → text formatter for NotebookLM. Equivalent formatting will be needed for the Gemini prompt

### Infrastructure to decommission
- `scripts/container_server.py` — FastAPI VNC server; delete entirely
- `Dockerfile` (or `Dockerfile.daytona`) — Container image; delete
- `src/app/api/setup/nbm-auth/route.ts` — NotebookLM auth routes; delete
- `.planning/phases/09-migrate-container-from-daytona-to-google-cloud-run/09-CONTEXT.md` — Full list of CONTAINER_* env vars, header names, and routes modified in Phase 9; use as decommission checklist

### Frontend (should require no changes)
- `src/app/research/[ticker]/` — Report renderer consumes `AnalysisResult`; backward-compatible schema changes only

### Project constraints
- `CLAUDE.md` — Project architecture principles, separation of layers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/research-brief.ts`: `formatResearchBrief(pkg)` and `extractNewsUrls(pkg)` — these functions format the SourcePackage. The same formatted text blocks become the Gemini prompt context (instead of NotebookLM text sources)
- `src/app/api/analysis/[ticker]/route.ts`: SSE response pattern, PROGRESS event emission — the streaming infrastructure carries forward; only the subprocess call is replaced
- `src/lib/types.ts`: `SourcePackage` type — unchanged input to the new reasoning step

### Established Patterns
- SSE streaming: `TransformStream` + `ReadableStream` pattern in the existing analysis route — reuse for Gemini streaming
- `export const dynamic = 'force-dynamic'` — required on analysis route for streaming
- `DEPLOYMENT_MODE` env var: currently gates local vs. cloud behavior — this conditional is removed entirely; the new pipeline runs identically everywhere

### Integration Points
- `POST /api/analysis/[ticker]` is the single integration point — it receives the SourcePackage file path, runs the pipeline, and streams results back
- `<ResearchProgress />` on the frontend expects SSE events with the existing PROGRESS format — emit compatible events from TypeScript
- `StoredReport` persistence in `src/lib/reports.ts` — must write the evolved `AnalysisResult` in a backward-compatible way

</code_context>

<specifics>
## Specific Ideas

- The 6-question protocol from `notebooklm_research.py` is a good structural reference for the Gemini prompt — break the analysis into the same logical sections (sentiment, bullish, bearish, buy/hold/sell, confidence, sources) as separate prompt sections or a structured output schema
- Community sentiment from Firecrawl should be a clearly labeled section in the Gemini context ("=== COMMUNITY SENTIMENT ===") so Gemini can distinguish analyst/news data from retail discussion
- Consider using AI SDK structured output (`generateText` + `Output.object()`) to get the `AnalysisResult` schema directly from Gemini rather than parsing text — eliminates regex parsing fragility from the old Python script
- `FIRECRAWL_API_KEY` should follow the same env var pattern as `FINNHUB_API_KEY` and `POLYGON_API_KEY` — optional, gracefully skipped if absent

</specifics>

<deferred>
## Deferred Ideas

- Multi-source market data aggregation (Finnhub/Polygon market data enrichment) — Phase 10
- Institutionalized social sentiment pipeline with dedicated section in report — Phase 11
- Streaming Gemini tokens live to the frontend — could be a future UX improvement, but requires UI changes

</deferred>

---

*Phase: 12-intelligence-pipeline-rebuild-replace-notebooklm-with-polygo*
*Context gathered: 2026-04-16*
