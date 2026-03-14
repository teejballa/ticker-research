# Phase 3: Report Output - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Render the AnalysisResult (produced by Phase 2 NotebookLM pipeline) as a formatted, downloadable research report with source attribution, a data timestamp, and a financial disclaimer. Includes a full app-wide restyling to Bloomberg terminal aesthetic. No new data collection or analysis — Phase 3 consumes AnalysisResult and SourcePackage (already in-memory in the research page's `complete` state).

</domain>

<decisions>
## Implementation Decisions

### Visual style
- Bloomberg terminal aesthetic app-wide — dark background, amber/orange accents, monospace feel
- Applies to the WHOLE app, not just the report page: SetupWizard, TickerSearch, ChartConfirmation, and ResearchProgress all get restyled in Phase 3
- Single scrolling page for the report — top to bottom, no tabs
- Sticky top bar on the report page: ticker, company name, and download button always visible as user scrolls
- Section order (per REPT-03): Ticker Overview → Market Sentiment → Bullish Factors → Bearish Factors → Buy/Hold/Sell Assessment → Confidence Level → Sources Used

### PDF export
- Print CSS + `window.print()` — zero new dependencies, uses browser native print-to-PDF
- PDF is reformatted for print: white background, black text (light/print-friendly version, not the dark terminal screen)
- Download button lives in the sticky top bar, always visible
- PDF filename encodes ticker + analysis date: `AAPL-2026-03-13.pdf`

### Information density
- Stats header block at the top of the report: price, % change today, market cap, P/E, revenue, 52-week range, EPS — sourced from SourcePackage market_data + fundamentals
- Buy/Hold/Sell rendered as terminal-style horizontal progress bars: `BUY: ██████████ 65% / HOLD: ████ 25% / SELL: █ 10%` with the buy/hold/sell rationale text below each bar
- Bullish and bearish signals: each on its own line as `▲ Signal text [source_citation]` / `▼ Signal text [source_citation]` — inline attribution, no cards
- Confidence level: `CONFIDENCE: HIGH [██████████]` followed by the one-sentence `confidence_explanation`

### Sources section
- Both inline + bottom list: signal citations stay inline; a dedicated Sources section at the bottom lists all `sources_used[]` entries with name + key_fact
- source_warnings (failed URL loads from Phase 2): if `source_warnings[]` is non-empty, show a subtle note at the bottom of the Sources section: "Note: X source(s) could not be loaded during analysis"
- Data timestamp format: natural language — "Data collected March 13, 2026 at 2:32 PM" — sourced from `AnalysisResult.analyzed_at`
- Financial disclaimer placement: top of report, before the analysis content

### Claude's Discretion
- Exact dark background hex value and amber shade
- Typography — monospace vs. sans-serif for body text vs. labels
- Exact bar rendering for Buy/Hold/Sell and Confidence (CSS vs. SVG vs. block characters)
- Spacing and padding within sections
- Responsive behavior on mobile

</decisions>

<specifics>
## Specific Ideas

- Bloomberg terminal aesthetic is the guiding reference — amber on black, dense data display, credibility through data density
- The report should feel like a financial document, not a web app page
- The restyled app flow (search → chart → progress → report) should feel like using a Bloomberg terminal throughout, not just for the report
- Stats header block echoes Bloomberg's ticker summary bar — grounds the analysis in hard numbers before the qualitative content begins

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/types.ts` — `AnalysisResult` fully typed: `market_sentiment`, `sentiment_reasoning`, `bullish_signals[]` / `bearish_signals[]` (each with `signal` + `source_citation`), `assessment` (`BuySellBreakdown` with `buy_pct/hold_pct/sell_pct` + rationale strings), `confidence_level`, `confidence_explanation`, `sources_used[]` (name + key_fact), `source_warnings[]`
- `src/lib/types.ts` — `SourcePackage` also available: `market_data` (price, percent_change_today, market_cap, 52-week high/low) + `fundamentals` (pe_ratio, eps, revenue) for the stats header block
- `src/app/research/[ticker]/page.tsx` — `complete` state already holds `analysisResult` in state; Phase 3 replaces the placeholder card with the real report component
- `src/components/ResearchProgress.tsx`, `SetupWizard.tsx`, `ChartConfirmation.tsx`, `TickerSearch.tsx` — all need terminal restyling; currently use white cards / light gray backgrounds

### Established Patterns
- Tailwind CSS throughout — terminal restyling done via Tailwind utilities (bg-black/bg-zinc-950, text-amber-400, font-mono)
- `@media print` CSS for PDF formatting already a natural extension of existing globals.css (currently only has `animate-shake`)
- Next.js App Router `'use client'` components for stateful UI

### Integration Points
- `src/app/research/[ticker]/page.tsx` `complete` state — replace placeholder div with `<ResearchReport analysisResult={analysisResult} ticker={ticker} />` component
- Stats header block needs `SourcePackage` data — either pass it through from the analysis SSE response or fetch it separately from the temp file; the research page currently only receives `AnalysisResult` from the SSE stream (check if SourcePackage market data should be embedded in AnalysisResult or fetched separately for the report)
- `src/app/globals.css` — add `@media print` styles for PDF export

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-report-output*
*Context gathered: 2026-03-13*
