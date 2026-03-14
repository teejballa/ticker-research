# Phase 2: Research Integration - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Fully automated pipeline from SourcePackage JSON → NotebookLM notebook creation via `notebooklm-py` → source ingestion → 6 structured queries → typed AnalysisResult → SSE streaming to browser. Covers setup wizard, research brief formatting, Python script, and Next.js integration. Report rendering is Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Setup wizard placement & flow
- Inline on home page — a "Before you start" card appears above the search input when setup is incomplete
- 3-step checklist: Python 3.10+ check → notebooklm-py install → Google account connection
- Completed steps show ✓, active step shows spinner, pending steps are grayed out
- **Maximize automation**: Python check and notebooklm-py install run automatically in the background — the user should never have to trigger these manually
- Google login is the only unavoidably manual step (browser opens, user logs in once)
- Once all 3 steps complete, the setup card disappears and the search UI appears

### Python not installed
- Show OS-specific install instructions inline (Homebrew for Mac, winget for Windows, apt for Linux)
- Include a "Re-check" button so user can continue after installing

### Google login UX
- Spinner + instructional text: "A browser window has opened — log in to your Google account to continue."
- Poll for `~/.notebooklm/auth.json` creation in the background
- Animated dots to indicate waiting state

### Analysis progress display
- Named step list with status icons: ✓ complete, ◌ active (spinning), ○ pending
- Steps visible to user: Creating notebook → Loading market data → Adding news sources → Querying sentiment → Generating assessment → Cleaning up
- Source warnings (failed URL loads) are NOT shown during progress — surfaced in the Phase 3 report's Sources section only
- Auto-transition to report on completion — no "View Report" button needed

### Error handling
- Script crash / NotebookLM unavailable: progress screen switches to error state with clear message + "Try Again" button; notebook cleaned up server-side
- Rate limit hit: show "NotebookLM daily limit reached. Resets at midnight PST — try again tomorrow."
- Navigation away: tab switching is fine (analysis continues); closing the tab or quitting the browser triggers a `beforeunload` warning — no background job tracking needed

### Buy/Hold/Sell format
- Probability breakdown: Buy: X% / Hold: Y% / Sell: Z% with reasoning for each tier
- More nuanced than a single recommendation — better reflects uncertainty in financial analysis

### Confidence level
- Three-tier qualitative scale: Low / Medium / High
- Accompanied by a one-sentence explanation (e.g., "High — multiple independent sources agree on direction")

### Bullish/Bearish signals
- Exactly 3 bullish + 3 bearish signals in the AnalysisResult
- Each signal must reference its supporting source (no unsupported claims — satisfies RSRCH-07)

### Research question strategy
- Claude crafts the 6 questions optimized for the required outputs
- Questions must cover: market sentiment classification, bullish signals (×3 sourced), bearish signals (×3 sourced), Buy/Hold/Sell probability breakdown, confidence level, and overall source attribution
- Researcher will fine-tune question phrasing based on notebooklm-py documentation and query behavior

### Claude's Discretion
- Exact phrasing of the 6 NotebookLM queries
- AnalysisResult JSON schema field names and nesting
- Python script internal retry logic for individual URL adds
- Debounce/polling interval for auth.json detection
- Exact step names shown in progress display

</decisions>

<specifics>
## Specific Ideas

- "Always minimize everything the user has to do manually if it can work in the background" — this is the guiding principle for the setup wizard
- notebooklm-py install should happen automatically on first research attempt, not require a manual user action
- The Google account connection is the only exception to the automation rule — it's unavoidably manual (browser-based auth)
- In cloud/Daytona deployment, notebooklm-py will be pre-installed — the wizard only applies to local execution mode

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/types.ts` — SourcePackage and related interfaces already defined; AnalysisResult and AnalysisSignal will be added here
- `src/components/ChartConfirmation.tsx` — existing SSE/streaming pattern (Confirm button posts to API, reads streaming response); ResearchProgress component follows the same pattern
- `src/lib/temp-file.ts` — temp file write/read/cleanup utilities; reused by analysis route to pass SourcePackage path to Python script
- `src/app/page.tsx` — home page already built; setup wizard card is added conditionally based on `GET /api/setup/status` response

### Established Patterns
- SSE streaming: `child_process.spawn` → stdout line reader → `ReadableStream` with `text/event-stream` content type — established in the roadmap for Phase 2, same pattern used in ChartConfirmation for pipeline POST
- Temp files: `os.tmpdir()` for ephemeral data, never committed to repo
- API routes: Next.js App Router `route.ts` files under `src/app/api/`

### Integration Points
- `src/app/page.tsx` — add `useEffect` to call `GET /api/setup/status` on mount; conditionally render SetupWizard or TickerSearch
- `src/app/research/[ticker]/page.tsx` — reads `file` query param (SourcePackage path from Phase 1), starts analysis stream, renders ResearchProgress then hands AnalysisResult to Phase 3 report component
- `scripts/notebooklm_research.py` — new file; reads SourcePackage JSON from argv[1], drives full notebook lifecycle, prints PROGRESS:/RESULT:/ERROR: lines to stdout

</code_context>

<deferred>
## Deferred Ideas

- Background job queue with status polling (user navigates away and returns to check) — Phase 4 complexity, not needed for local execution
- Showing remaining daily quota in the UI — adds complexity, not worth it for v1
- Automatic fallback to Anthropic Messages API if notebooklm-py fails — possible future resilience improvement; for now, show error + retry

</deferred>

---

*Phase: 02-research-integration*
*Context gathered: 2026-03-12*
