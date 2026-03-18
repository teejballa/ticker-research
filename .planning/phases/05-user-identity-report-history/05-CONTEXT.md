# Phase 5: User Identity & Report History - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface the connected Google account as the user's identity in the app UI (no separate signup), persist completed research reports locally on the user's filesystem, display a report history list on the home page (newest first), and allow any past report to be regenerated with fresh data. No new data collection mechanisms — all data still flows through the existing Phase 1–2 pipeline.

</domain>

<decisions>
## Implementation Decisions

### Report Storage
- **Format:** Filesystem JSON files — one file per report
- **Location:** `~/.equinfo/reports/` (user's home directory, survives git ops and project moves)
- **Contents per file:** Full `AnalysisResult` JSON plus metadata: ticker, company_name, analyzed_at, market_sentiment, confidence_level
- **Filename convention:** `{TICKER}-{analyzed_at_iso}.json` (e.g., `AAPL-2026-03-18T14-32-00Z.json`) — sortable, unique
- **Write trigger:** After `POST /api/analysis/[ticker]` returns a successful `AnalysisResult`, the API route writes the file before streaming the final RESULT line to the frontend
- **Read:** `GET /api/history` reads all files in `~/.equinfo/reports/`, parses each, and returns sorted list (newest first)

### History UI (Home Page)
- **Placement:** Below the ticker search input on the home page, above or replacing the "How it works" section
- **Entry design:** Compact terminal-style rows — one row per report:
  `AAPL | Apple Inc. | Mar 18 2026 | BULLISH | HIGH`
  Columns: SYMBOL, COMPANY, DATE, SENTIMENT, CONFIDENCE
- **Each row has two actions:** `[OPEN]` (view the saved report) and `[REGENERATE]` (restart full pipeline for same ticker)
- **Sorting:** Newest first, no pagination — show all reports (local tool; users won't have hundreds)
- **Empty state:** Inline terminal-style message: `No reports yet. Analyze a ticker to get started.` — no illustration, no hidden section
- **Section header:** Terminal-style label: `RESEARCH HISTORY`

### Identity Display
- **Location:** Fixed nav bar, top-right — visible on every page
- **Format:** Compact — `you@gmail.com` or truncated if long (max ~24 chars visible)
- **Data source:** Extend `GET /api/setup/status` to also parse and return `email` from `~/.notebooklm/auth.json` (or `storage_state.json` — see canonical refs). No new endpoint needed.
- **If auth.json is missing or email can't be parsed:** Show `NOT CONNECTED` as a link that scrolls to or opens the SetupWizard

### Regeneration UX
- **Pipeline:** Full pipeline restart — navigates to `/research/[ticker]` which triggers chart confirmation, then fresh data collection, then NotebookLM analysis. Guarantees fresh data.
- **Trigger location:** `[REGENERATE]` button in the history row (inline action, same row as `[OPEN]`)
- **Navigation:** Clicking Regenerate navigates to `/research/[ticker]` — same as entering a new ticker. The chart confirmation step is included (user can quickly confirm).
- **Old reports:** Kept — new report is saved as a separate entry in history. User can compare AAPL Mar 12 vs AAPL Mar 18.

### Claude's Discretion
- Exact truncation behavior for long email addresses in the nav
- Precise column widths and spacing in the history table rows
- Error handling if `~/.equinfo/reports/` can't be created (permissions issue)
- Loading state while history is being fetched from the server

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth file location
- `scripts/notebooklm_research.py` — check how `storage_state.json` is referenced (Phase 2 discovery: the actual auth file path is `storage_state.json`, not `auth.json`)
- `.planning/phases/02-research-integration/02-CONTEXT.md` — Phase 2 auth discovery section; `storage_state.json` was the confirmed auth file path

### Existing API routes (extend, don't replace)
- `src/app/api/setup/status/route.ts` — already reads Python/notebooklm/auth status. Extend to parse and return email.
- `src/app/api/analysis/[ticker]/route.ts` — already produces AnalysisResult. Add report persistence here after successful analysis.
- `src/app/api/research/[ticker]/route.ts` — data collection pipeline, for reference.

### Existing types (extend, don't replace)
- `src/lib/types.ts` — `AnalysisResult` is the canonical type for what gets stored. Do not duplicate.

### Home page
- `src/app/page.tsx` — integrate history UI here. Currently shows SetupWizard OR TickerSearch after setup check. History section goes below the search.

### Components to reference for terminal aesthetic
- `src/components/ResearchReport.tsx` — established terminal color patterns (zinc-950 bg, amber accents, tabular-nums, tracking-widest)
- `src/app/globals.css` — existing terminal utility classes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/api/setup/status/route.ts`: Already reads `~/.notebooklm/` state. Natural place to add email extraction.
- `src/app/api/analysis/[ticker]/route.ts`: Already has the completed `AnalysisResult` in memory — just needs to write to `~/.equinfo/reports/` before returning.
- `src/lib/types.ts` `AnalysisResult`: Exactly what gets stored. No new type needed for storage — just add a `StoredReport` wrapper type with the file metadata.
- `src/app/page.tsx`: Home page is a `'use client'` component. History list can be fetched via `useEffect` from a new `GET /api/history` endpoint.

### Established Patterns
- API routes use Node.js `fs` module directly (see `src/lib/temp-file.ts` for filesystem pattern)
- Terminal aesthetic: zinc-950 backgrounds, amber-400 (`#f59e0b`) accents, tabular-nums, tracking-widest, monospace feel
- All components are `'use client'` — history component follows same pattern
- SSE streaming is already established for analysis — history is a simple JSON fetch (no SSE needed)

### Integration Points
- **New `GET /api/history` route** — reads `~/.equinfo/reports/`, parses JSON files, returns sorted array
- **Extend `POST /api/analysis/[ticker]`** — write report JSON to `~/.equinfo/reports/` after successful AnalysisResult parse
- **Extend `GET /api/setup/status`** — add `userEmail` field to response
- **`src/app/page.tsx`** — add `<ReportHistory />` component below `<TickerSearch />` (or `<SetupWizard />` when setup incomplete)
- **Layout nav bar in `src/app/layout.tsx`** — not currently a shared component; the nav is embedded in `page.tsx`. Will need to either update page.tsx nav or extract a shared nav with email display.

</code_context>

<specifics>
## Specific Ideas

- Nav email display should feel like a system status indicator, not a user profile — fits the terminal aesthetic. Muted color, small tracking.
- History table should use the same `panel` and `border-[#1a2d42]` styling established in other components.
- `REGENERATE` button styling: subtle, inline — not a primary CTA. Could be styled like the existing small action buttons in the terminal.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-user-identity-report-history*
*Context gathered: 2026-03-18*
