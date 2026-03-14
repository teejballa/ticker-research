# Phase 3: Report Output - Research

**Researched:** 2026-03-14
**Domain:** React/Next.js report rendering, Tailwind CSS theming, browser print-to-PDF, Bloomberg terminal aesthetic
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Bloomberg terminal aesthetic app-wide — dark background, amber/orange accents, monospace feel
- Applies to the WHOLE app, not just the report page: SetupWizard, TickerSearch, ChartConfirmation, and ResearchProgress all get restyled in Phase 3
- Single scrolling page for the report — top to bottom, no tabs
- Sticky top bar on the report page: ticker, company name, and download button always visible as user scrolls
- Section order (per REPT-03): Ticker Overview → Market Sentiment → Bullish Factors → Bearish Factors → Buy/Hold/Sell Assessment → Confidence Level → Sources Used
- PDF export: Print CSS + `window.print()` — zero new dependencies, uses browser native print-to-PDF
- PDF is reformatted for print: white background, black text (light/print-friendly version, not the dark terminal screen)
- Download button lives in the sticky top bar, always visible
- PDF filename encodes ticker + analysis date: `AAPL-2026-03-13.pdf`
- Stats header block at the top of the report: price, % change today, market cap, P/E, revenue, 52-week range, EPS — sourced from SourcePackage market_data + fundamentals
- Buy/Hold/Sell rendered as terminal-style horizontal progress bars: `BUY: ██████████ 65% / HOLD: ████ 25% / SELL: █ 10%` with the buy/hold/sell rationale text below each bar
- Bullish and bearish signals: each on its own line as `▲ Signal text [source_citation]` / `▼ Signal text [source_citation]` — inline attribution, no cards
- Confidence level: `CONFIDENCE: HIGH [██████████]` followed by the one-sentence `confidence_explanation`
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REPT-01 | Report renders as a formatted page in the user's browser | New `ResearchReport` component, replace placeholder in `complete` state of `page.tsx` |
| REPT-02 | Report includes a PDF download option | `window.print()` + `@media print` CSS in `globals.css`; filename via `document.title` manipulation |
| REPT-03 | Report follows defined structure: Ticker Overview → Market Sentiment → Bullish Factors → Bearish Factors → Buy/Hold/Sell Assessment → Confidence Level → Sources Used | Component section order enforced in JSX; sticky nav bar with section labels |
| REPT-04 | Report includes a "data as of [datetime]" timestamp | `AnalysisResult.analyzed_at` formatted as natural language; `formatTimestamp()` utility |
| REPT-05 | Report includes a financial disclaimer section ("Not financial advice") | Static disclaimer block rendered at top of report, above analysis content |
| REPT-06 | Sources section lists all sources used with attribution | `sources_used[]` (name + key_fact) from AnalysisResult; `source_warnings[]` shown if non-empty |
</phase_requirements>

---

## Summary

Phase 3 is a pure rendering phase: no new API routes, no data collection, no Python integration. It consumes `AnalysisResult` (already in `page.tsx` `complete` state) and `SourcePackage` data (accessible for the stats header block), and renders a formatted research report page. The full app is simultaneously restyled to a Bloomberg terminal aesthetic using Tailwind utilities (bg-black, text-amber-400, font-mono). PDF export is handled entirely by browser print-to-PDF triggered via `window.print()` — zero new npm packages required.

The central design challenge is the data flow for the stats header block. The `page.tsx` `complete` state currently holds only `AnalysisResult`. Market stats (price, 52-week range, P/E, EPS, revenue) live in `SourcePackage`, which is written to a temp file by Phase 1 and its path passed through the analysis flow. The planner needs to decide whether to embed market_data + fundamentals into `AnalysisResult` during the Python script output phase, or pass the temp file path alongside the `AnalysisResult` through the SSE stream so the frontend can fetch or reference the `SourcePackage`.

The restyling scope is significant: six files need color/style updates (page.tsx, TickerSearch.tsx, ChartConfirmation.tsx, SetupWizard.tsx, ResearchProgress.tsx, globals.css) plus two new components (ResearchReport, StickyTopBar). The Bloomberg aesthetic is entirely achievable with existing Tailwind utilities — no custom CSS framework changes required.

**Primary recommendation:** Build `ResearchReport` as a single self-contained component receiving `analysisResult` + `marketStats` props. Restyle all existing components in one wave. Add `@media print` CSS block to globals.css. Use `window.print()` with a `document.title` trick for filename suggestion.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | v4 (already installed via `@import "tailwindcss"`) | All styling including terminal theme | Already in use; `bg-zinc-950`, `text-amber-400`, `font-mono` cover all needs |
| React | 18 (already installed) | Component tree | Already in use throughout app |
| Next.js App Router | 15.x (already installed) | Page routing, `'use client'` components | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native browser print API | N/A | PDF export via `window.print()` | Zero dependency PDF — the locked decision |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `window.print()` | `@react-pdf/renderer`, `puppeteer`, `html2canvas+jsPDF` | Print CSS is zero-dependency and already decided; third-party libs add 200KB+ bundle, complex setup, Vercel incompatibility |

**Installation:**
No new packages required. All libraries are already installed.

---

## Architecture Patterns

### Recommended Component Structure
```
src/
├── components/
│   ├── ResearchReport.tsx        # Root report component — receives AnalysisResult + marketStats
│   ├── StickyTopBar.tsx          # Sticky header: ticker, company, download button (print-only hidden)
│   ├── StatsHeader.tsx           # Price/market cap/P-E/EPS/52w block from SourcePackage data
│   ├── SignalList.tsx            # Reusable for both Bullish and Bearish signal sections
│   ├── AssessmentBars.tsx        # Buy/Hold/Sell terminal progress bars + rationale
│   ├── ConfidenceBar.tsx         # CONFIDENCE: HIGH [██████████] display
│   └── SourcesList.tsx           # Bottom sources list + source_warnings note
├── lib/
│   └── formatters.ts             # formatTimestamp(), formatMarketCap(), formatPercent() etc.
└── app/
    └── globals.css               # Add @media print block
```

### Pattern 1: Terminal Theming via Tailwind Utilities
**What:** Replace all `bg-white`, `bg-gray-50`, `text-gray-900`, `border-gray-200`, `rounded-xl` etc. with terminal equivalents.
**When to use:** Uniformly across all six components being restyled.
**Tailwind palette:**
```
Background:   bg-zinc-950  (near-black, ~#09090b)
Surface:      bg-zinc-900  (slightly lighter for cards/panels)
Border:       border-zinc-700  (subtle separator)
Text primary: text-amber-400  (the Bloomberg amber)
Text muted:   text-zinc-400
Text dim:     text-zinc-600
Accent:       text-amber-300 (lighter amber for values)
Mono:         font-mono (for all data values, tickers, codes)
Positive:     text-emerald-400  (price up / bullish)
Negative:     text-red-400      (price down / bearish)
```

**Example class migration:**
```tsx
// Before (white card)
<div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
  <h2 className="text-lg font-semibold text-gray-800">...</h2>
</div>

// After (terminal panel)
<div className="bg-zinc-900 border border-zinc-700 p-4">
  <h2 className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-widest mb-3">...</h2>
</div>
```

### Pattern 2: Print CSS Block in globals.css
**What:** `@media print` rules that override the dark terminal theme for clean PDF output.
**When to use:** Applied globally — affects any page that gets printed, including the report.

```css
/* src/app/globals.css */
@media print {
  /* White background, black text for all elements */
  * {
    background: white !important;
    color: black !important;
    border-color: #ccc !important;
  }

  /* Hide elements that shouldn't appear in PDF */
  .print\:hidden {
    display: none !important;
  }

  /* Force page breaks where needed */
  .print\:break-before {
    page-break-before: always;
  }

  /* Reset sticky positioning */
  .sticky {
    position: static !important;
  }

  /* Ensure monospace stays for data blocks */
  .font-mono {
    font-family: "Courier New", monospace !important;
  }
}
```

**Tailwind print: prefix** (Tailwind v3+ and v4): Use `print:hidden`, `print:block` utility classes directly on elements to control print visibility — cleaner than custom class names.

### Pattern 3: PDF Download via window.print()
**What:** Set `document.title` before calling `window.print()` so browser uses it as the PDF filename suggestion, then restore title after.
**When to use:** Download button in sticky top bar.

```tsx
// Source: MDN Web Docs — window.print() and document.title
function handleDownloadPDF(ticker: string, analyzedAt: string) {
  const date = new Date(analyzedAt).toISOString().slice(0, 10); // "2026-03-13"
  const originalTitle = document.title;
  document.title = `${ticker}-${date}`;
  window.print();
  // Restore after slight delay (print dialog blocks, then resumes)
  setTimeout(() => {
    document.title = originalTitle;
  }, 1000);
}
```

**Limitation:** `document.title` is a filename SUGGESTION — Chrome typically honors it, Safari may not, Firefox behavior varies. Actual filename is browser-controlled. This is the tradeoff accepted by the locked decision.

### Pattern 4: Sticky Top Bar
**What:** `position: sticky; top: 0` bar with `z-index` above content. Hidden during print.
**When to use:** Report page only; disappears in printed PDF via `print:hidden`.

```tsx
// Sticky top bar — visible during browsing, hidden in print
<div className="sticky top-0 z-10 bg-zinc-950 border-b border-zinc-700 px-6 py-3 flex items-center justify-between print:hidden">
  <div className="flex items-center gap-3">
    <span className="font-mono font-bold text-amber-400 text-lg">{ticker}</span>
    <span className="text-zinc-400 text-sm">{companyName}</span>
  </div>
  <button onClick={handleDownloadPDF} className="font-mono text-xs text-amber-400 border border-amber-400 px-3 py-1 hover:bg-amber-400 hover:text-black transition-colors">
    DOWNLOAD PDF
  </button>
</div>
```

### Pattern 5: Terminal Progress Bars (Buy/Hold/Sell and Confidence)
**What:** ASCII block-character bars are unreliable across fonts. Use CSS width bars styled to look like block characters — or use Unicode block elements with a known monospace fallback.
**Recommendation:** CSS width bars with `font-mono` label — more reliable than Unicode block fills, still looks terminal.

```tsx
// AssessmentBars.tsx — CSS bar approach
function TerminalBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const filled = Math.round(pct / 10); // 0–10 blocks
  const blocks = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return (
    <div className="font-mono text-sm mb-1">
      <span className={`${color} font-bold w-6 inline-block`}>{label}:</span>
      <span className="text-zinc-400 mx-2">{blocks}</span>
      <span className="text-amber-300">{pct}%</span>
    </div>
  );
}
```

**Unicode note:** `█` (U+2588 FULL BLOCK) and `░` (U+2591 LIGHT SHADE) render consistently in Courier New / Menlo / monospace fonts. Safe to use with `font-mono`.

### Pattern 6: SourcePackage Data for Stats Header Block
**What:** The stats header block needs `market_data` + `fundamentals` from SourcePackage. Currently, `page.tsx` `complete` state only holds `AnalysisResult` (which does not include raw market stats).

**Two implementation paths:**

**Option A — Embed stats in SSE result (RECOMMENDED):** During the Python analysis script, the `notebooklm_research.py` already reads the SourcePackage JSON. It can include a `market_snapshot` key in its `RESULT:` JSON output that plucks the needed fields from the SourcePackage. The `AnalysisResult` type gets a `market_snapshot` field. No extra fetch needed on the frontend.

```python
# In notebooklm_research.py RESULT output — add market_snapshot
result = {
    ...existing_fields...,
    "market_snapshot": {
        "price": source_pkg["market_data"]["price"],
        "percent_change_today": source_pkg["market_data"]["percent_change_today"],
        "market_cap": source_pkg["market_data"]["market_cap"],
        "fifty_two_week_high": source_pkg["market_data"]["fifty_two_week_high"],
        "fifty_two_week_low": source_pkg["market_data"]["fifty_two_week_low"],
        "pe_ratio": source_pkg["fundamentals"]["pe_ratio"],
        "eps": source_pkg["fundamentals"]["eps"],
        "revenue": source_pkg["fundamentals"]["revenue"],
    }
}
```

**Option B — Pass file path through state:** Keep `AnalysisResult` unchanged, store the source package `filePath` in page state alongside the result, fetch `/tmp/...json` via a new API route to retrieve market data on the complete state render. More moving parts, extra network round-trip.

**Recommendation:** Option A. Simpler, fewer moving parts, co-locates all report data in a single typed object. Requires adding `market_snapshot` to `AnalysisResult` type and the Python script.

### Anti-Patterns to Avoid
- **Tabs or multi-page layout:** Locked as single scroll — don't introduce React Router tabs, accordion sections that hide content, or pagination.
- **New npm packages for PDF:** `@react-pdf/renderer`, `puppeteer`, `html2canvas` — all locked out by the print CSS decision.
- **Rounding errors in Buy/Hold/Sell display:** Phase 2 already normalizes percentages (clamp → proportional scale → sell_pct absorbs rounding drift). Don't re-normalize in the report component — trust the values from `AnalysisResult.assessment`.
- **Using `bg-black` for the main background:** `bg-zinc-950` (#09090b) is preferable — pure black on modern displays has harsh contrast; zinc-950 is the Bloomberg-accurate near-black.
- **Wrapping sticky bar in `<main>`:** Sticky positioning requires the bar to be a sibling of the scrollable content, not nested inside a flex container that constrains scroll. Structure: `<div className="relative">[sticky bar][scrollable content]</div>`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF generation | Custom canvas/SVG PDF serializer | `window.print()` + `@media print` CSS | Locked decision; browser handles page breaks, font embedding, image rasterization correctly |
| Timestamp formatting | Manual date string manipulation | `Intl.DateTimeFormat` (built-in) | Locale-aware, handles timezone correctly, no library needed |
| Number formatting | `toFixed()` chains | `Intl.NumberFormat` (built-in) | Handles compact notation ($2.1T), commas, locale — no library needed |
| Terminal bars | SVG charts or D3 | Unicode block chars + CSS widths | The terminal aesthetic IS the feature; lightweight-charts would be overkill for a percentage bar |
| Color theme tokens | CSS custom properties + theme file | Tailwind utility classes directly | Tailwind v4 already installed; custom property tokens add complexity without benefit at this scale |

**Key insight:** This phase is styling-heavy and data-display-heavy, but algorithmically simple. All the hard work (data collection, analysis, type parsing) is done by Phases 1–2. Phase 3 is a React rendering phase and should stay that way.

---

## Common Pitfalls

### Pitfall 1: Sticky Bar Breaks in Print
**What goes wrong:** The sticky bar appears on every printed page instead of being hidden.
**Why it happens:** `position: sticky` is treated as block-flow in print context; without explicit `print:hidden`, it renders as a normal block at the top of the first page and potentially bleeds.
**How to avoid:** Apply `print:hidden` to the sticky bar element. Tailwind v4's `@media print` utilities (`print:`) are available via the standard import.
**Warning signs:** Print preview shows the bar consuming space at top of first page.

### Pitfall 2: document.title Restores During Print Dialog
**What goes wrong:** `document.title` is set, `window.print()` is called, the user takes a few seconds in the dialog, then the title reverts before they save — browser uses the reverted title.
**Why it happens:** `setTimeout` fires while print dialog is still open; dialog is not blocking in all browsers.
**How to avoid:** Use a `window.onafterprint` event to restore the title instead of `setTimeout`.
```tsx
window.onafterprint = () => {
  document.title = originalTitle;
  window.onafterprint = null;
};
document.title = `${ticker}-${date}`;
window.print();
```

### Pitfall 3: AnalysisResult Missing market_snapshot (Open Question)
**What goes wrong:** Report renders without the stats header block because `AnalysisResult` doesn't carry market data.
**Why it happens:** Phase 2 designed `AnalysisResult` to hold only analysis output; market data was left in `SourcePackage`.
**How to avoid:** Add `market_snapshot` to `AnalysisResult` type in `src/lib/types.ts` AND update `notebooklm_research.py` to include it in the `RESULT:` output. Both changes must happen in the same wave.
**Warning signs:** Stats header block shows all `—` values despite successful analysis.

### Pitfall 4: Unicode Block Characters Misalign in Non-Monospace Context
**What goes wrong:** `█` characters appear narrower or different width from the label text, making bars look uneven.
**Why it happens:** `█` is only fixed-width in monospace fonts. If a fallback sans-serif kicks in, it becomes proportional.
**How to avoid:** Wrap ALL terminal bar elements in `font-mono`. Never mix block chars with non-monospace text on the same line.

### Pitfall 5: Tailwind v4 Syntax Differences
**What goes wrong:** Using Tailwind v3 syntax like `@apply` in CSS files, or expecting `tailwind.config.js` to exist.
**Why it happens:** This project uses Tailwind v4 (`@import "tailwindcss"` in globals.css), which is CSS-first — no config file, no `@apply` for arbitrary values, utilities auto-generated.
**How to avoid:** Use utility classes in JSX directly. For `@media print` in globals.css, write raw CSS (not `@apply`). For custom animations (like `animate-shake` already present), define as raw `@keyframes` + class — which is already the pattern in globals.css.

### Pitfall 6: percent_change_today is Decimal (Not Percentage)
**What goes wrong:** Stats header shows "0.02%" instead of "2%".
**Why it happens:** `MarketDataSection.percent_change_today` stores the raw decimal fraction (0.02 = 2%), consistent with Yahoo Finance's format.
**How to avoid:** Multiply by 100 before display. Same pattern already used in `ChartConfirmation.tsx` line 89: `(percentChange * 100).toFixed(2)`.

---

## Code Examples

Verified patterns from existing codebase and standard APIs:

### Timestamp Formatting (natural language)
```tsx
// Source: MDN Intl.DateTimeFormat — built-in, no library needed
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  // e.g. "March 13, 2026 at 2:32 PM"
}
```

### Market Cap Formatting
```tsx
// Pattern already in ChartConfirmation.tsx — reuse via formatters.ts
function formatMarketCap(value: number | null): string {
  if (value == null) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9)  return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6)  return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}
```

### Report Integration Point (page.tsx complete state)
```tsx
// Replace the existing placeholder div in page.tsx complete state:
// BEFORE:
<div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
  <h1>Report ready — Phase 3 will render here</h1>
  ...
</div>

// AFTER:
<ResearchReport
  analysisResult={analysisResult}
  ticker={ticker}
/>
// (ResearchReport internally renders the sticky bar, stats header, all sections)
```

### Existing Colors to Replace (migration reference)
```
bg-gray-50       → bg-zinc-950  (page backgrounds)
bg-white         → bg-zinc-900  (card/panel surfaces)
border-gray-200  → border-zinc-700
text-gray-900    → text-amber-400 (headings/labels)
text-gray-800    → text-zinc-200 (body text)
text-gray-500    → text-zinc-400 (muted text)
text-gray-400    → text-zinc-600 (dim text)
text-blue-600    → text-amber-400 (accent/interactive)
bg-blue-600      → bg-amber-400 text-black (primary buttons)
border-blue-500  → border-amber-400 (focus rings, spinners)
text-green-600   → text-emerald-400 (success/positive)
text-red-500     → text-red-400 (error/negative)
rounded-xl       → remove (terminal aesthetic = sharp corners, no border-radius)
shadow-sm        → remove (flat terminal look, no shadows)
```

### Full App Background Reset
```tsx
// page.tsx and research/[ticker]/page.tsx — replace main element background:
// BEFORE:
<main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
// AFTER:
<main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Next.js `<Document>` for global styles | App Router `layout.tsx` + `globals.css` | Next.js 13+ | Phase 3 adds `@media print` to globals.css, which is the right place |
| External PDF libs (wkhtmltopdf, Puppeteer) | Browser print-to-PDF | ~2020 onwards | Print CSS is reliable, zero server-side dependency — correct for local-first tool |
| Tailwind v3 `tailwind.config.js` | Tailwind v4 CSS-first (`@import "tailwindcss"`) | Tailwind v4 stable (Oct 2024) | This project is already on v4; no config file expected |

**Deprecated/outdated:**
- `@apply` for arbitrary utilities in CSS files: v4 still supports `@apply` for defined utility classes, but arbitrary value syntax is different. Prefer JSX classes.
- `tailwind.config.js` `extend.colors`: Not present in this project (v4 CSS-first). Use CSS custom properties in globals.css or inline Tailwind values if custom colors are needed beyond the palette.

---

## Open Questions

1. **`market_snapshot` embedding — Python script modification scope**
   - What we know: `notebooklm_research.py` already reads the SourcePackage JSON from file to build the research brief
   - What's unclear: Whether Phase 2's plan explicitly handles the `RESULT:` JSON structure as modifiable, or if the script is considered complete and frozen
   - Recommendation: Treat it as in-scope for Phase 3 Wave 0 — add `market_snapshot` extraction to the script output and extend the `AnalysisResult` type. This is minimal Python change (5-6 lines) and the type change is non-breaking (new optional field).

2. **`AnalysisResult` type extension — optional vs required**
   - What we know: Adding `market_snapshot` as a required field would require updating existing tests that construct mock `AnalysisResult` objects
   - What's unclear: Test impact extent
   - Recommendation: Declare `market_snapshot` as optional (`market_snapshot?: MarketSnapshot`) so existing test fixtures remain valid. Stats header falls back to `—` if undefined (handles edge cases where old SourcePackage lacked market data).

3. **Spinner/loading indicator color during restyle**
   - What we know: Spinners currently use `border-blue-500 border-t-transparent` pattern in multiple components
   - What's unclear: Whether amber spinner looks right or needs a different approach
   - Recommendation: Change to `border-amber-400 border-t-transparent` — consistent with terminal palette.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (already configured at `vitest.config.ts`) |
| Config file | `vitest.config.ts` — environment: node, globals: true |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REPT-01 | `ResearchReport` renders without crashing given valid `AnalysisResult` | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ Wave 0 |
| REPT-02 | `handleDownloadPDF` sets document.title to `TICKER-YYYY-MM-DD` before calling `window.print()` | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ Wave 0 |
| REPT-03 | Report sections appear in correct order: Ticker Overview → Market Sentiment → Bullish → Bearish → Assessment → Confidence → Sources | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ Wave 0 |
| REPT-04 | `formatTimestamp()` converts ISO 8601 string to natural language "Month D, YYYY at H:MM AM/PM" | unit | `npm test -- --reporter=verbose formatters` | ❌ Wave 0 |
| REPT-05 | Report renders disclaimer text containing "not financial advice" | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ Wave 0 |
| REPT-06 | Sources section renders all `sources_used[]` entries; shows warning note when `source_warnings[]` is non-empty | unit | `npm test -- --reporter=verbose ResearchReport` | ❌ Wave 0 |

**Manual-only behaviors** (cannot be automated in jsdom/node environment):
- Visual terminal aesthetic fidelity — requires visual inspection
- Print CSS rendering in actual browser print dialog
- PDF filename suggestion in browser Save dialog
- Sticky bar scroll behavior

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/__tests__/ResearchReport.test.tsx` — covers REPT-01, REPT-02, REPT-03, REPT-05, REPT-06
- [ ] `src/lib/__tests__/formatters.test.ts` — covers REPT-04 (`formatTimestamp`, `formatMarketCap`, `formatPercent`)

**Note on test environment:** Existing vitest config uses `environment: node`. React component tests (`ResearchReport.test.tsx`) will need `environment: 'jsdom'` either globally or per-file via `@vitest-environment jsdom` comment. Check whether existing component tests use this pattern.

```ts
// Pattern from existing component tests — check SetupWizard.test.tsx to confirm
// @vitest-environment jsdom
```

---

## Sources

### Primary (HIGH confidence)
- Existing codebase — `src/lib/types.ts`, `src/app/research/[ticker]/page.tsx`, all component files — direct inspection
- `vitest.config.ts` — test infrastructure confirmed
- `package.json` — dependency versions confirmed (no PDF library installed, Tailwind v4 via `@import "tailwindcss"`)
- `src/app/globals.css` — confirmed Tailwind v4 CSS-first import, `@keyframes` pattern already in use

### Secondary (MEDIUM confidence)
- Tailwind CSS v4 documentation — print: prefix utilities available, CSS-first architecture confirmed
- MDN Web Docs — `window.print()`, `window.onafterprint`, `Intl.DateTimeFormat` — standard browser APIs
- `ChartConfirmation.tsx` — `percent_change_today` multiplication pattern (`percentChange * 100`) confirmed in existing code

### Tertiary (LOW confidence)
- Browser PDF filename behavior via `document.title` — behavior varies by browser; Safari in particular may ignore the title suggestion. Flagged as known limitation of the locked decision.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries already installed and in use
- Architecture: HIGH — component structure derived directly from existing code patterns and locked decisions
- Pitfalls: HIGH for code pitfalls (confirmed from codebase); MEDIUM for browser PDF behavior (known variation, not fully testable)
- Market snapshot data flow: MEDIUM — Option A recommended but requires Python script modification; open question flagged

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable stack; Tailwind v4/Next.js 15 unlikely to change in 30 days)
