# Phase 7: Research Quality & Special Situation Coverage - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Detect what type of security a ticker is (equity, SPAC, ETF, etc.) and adapt all search queries and NotebookLM questions accordingly — so SPACs surface merger details and vote dates, ETFs surface holdings and expense ratios, and standard equities get deeper web search coverage. The deprecated model and stale landing page data are already fixed; this phase improves research depth and output quality before public deployment.

Creating or modifying the report layout structure, adding new data sources beyond classification-driven prompt changes, or building public-facing infrastructure are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Security Type Detection
- Use **news-based detection**: run a quick web search ("is [ticker] a SPAC?") to classify the security type
- Detection runs **in parallel** with the main data collection — no added latency to the pipeline; the classification search fires alongside Yahoo Finance + anthropic-search calls
- On ambiguous/failed detection: fall back to `'unknown'` internally and continue the pipeline with generic equity prompts
- Type hierarchy: quoteType from Yahoo Finance handles ETF/MUTUALFUND/CRYPTOCURRENCY directly; news-based search is specifically for SPAC detection within EQUITY-typed tickers
- `SecurityType` values: `equity | spac | etf | adr | preferred | crypto | unknown`

### Prompt Branching — SEC Filing Function
- **SPAC**: Full prompt replacement — asks specifically for S-4 merger agreement, DEF 14A shareholder vote details, trust NAV, redemption deadline. No mention of 10-K/10-Q (irrelevant pre-merger)
- **ETF**: Replace 10-K/10-Q prompt with N-CEN/N-PORT filing search, fund structure, and expense documentation
- **Equity (default)**: Existing prompt unchanged

### Prompt Branching — Analyst Sentiment Function
- **ETF**: Skip entirely — return empty analyst section with `"Not applicable — ETF"` note. No API call made.
- **SPAC**: Keep analyst search but reframe toward merger arbitrage commentary, special situation coverage
- **Equity (default)**: Existing prompt, but bump `max_uses` from 3 → 5 for broader coverage

### Prompt Branching — News Function
- **SPAC**: Target merger agreement, PIPE investors, vote date, redemption deadline in prompt
- **ETF**: Target fund flows, AUM changes, index rebalancing, creation/redemption activity
- **Equity (default)**: Existing prompt, bump `max_uses` from 3 → 5

### Prompt Branching — Social Sentiment Function
- **SPAC**: Target merger speculation, retail arbitrage discussion, vote sentiment
- **ETF**: Keep as-is (ETFs get social discussion too)
- **Equity (default)**: Existing prompt, `max_uses` stays at 3

### web_search max_uses Changes (Equity only)
- `fetchNews`: 3 → **5**
- `fetchAnalystSentiment`: 3 → **5**
- `fetchSecFilingSummary`: stays at **3**
- `fetchSocialSentiment`: stays at **3**

### NotebookLM Question Adaptation
- Add a **single preamble** prepended to all 6 questions per security type — same preamble text on every question (not varied per question)
- Example SPAC preamble: `"Note: this is a pre-merger SPAC. Evaluate in terms of merger probability, trust value, vote timeline, and redemption risk rather than operating financials or revenue metrics."`
- Example ETF preamble: `"Note: this is an ETF/fund, not an individual equity. Focus on expense ratio, AUM, tracking accuracy, and fund flow trends rather than company-level earnings or analyst ratings."`
- Equity type: no preamble (questions are already equity-focused)
- `scripts/notebooklm_research.py` reads `security_type` from the source package JSON and selects the appropriate preamble string before building questions

### Report Presentation
- Security type shown as a **small badge next to the ticker in the header** (e.g., amber text badge "SPAC" or "ETF")
- Badge only shows for known types: equity, spac, etf, adr, preferred, crypto
- `unknown` type: **no badge shown** — report looks identical to pre-phase behavior; user sees no indication
- "EQUITY" badge omitted for standard equities (the default; no need to label it)

### Claude's Discretion
- Exact SPAC/ETF preamble wording
- Whether ADR/preferred/crypto get specialized prompts in this phase or just type detection
- Badge styling details (exact color, size, position within the terminal header)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing implementation to modify
- `src/lib/data/anthropic-search.ts` — All 4 fetch functions being modified; current prompt text and max_uses values are the baseline
- `src/lib/data/source-package.ts` — Orchestration layer where security type detection must be inserted (parallel with existing calls)
- `scripts/notebooklm_research.py` — Q1–Q6 constants and question dispatch logic; preamble injection goes here
- `src/lib/types.ts` — SourcePackage type needs `security_type` field added

### New file to create
- `src/lib/data/security-type.ts` — `detectSecurityType(ticker, quoteType, longName): Promise<SecurityType>` — news-based SPAC detection + quoteType field mapping

No external specs or ADRs — requirements fully captured in decisions above and the phase goal in ROADMAP.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extractTextContent()` + `parseJsonFromResponse<T>()` helpers in `anthropic-search.ts` — both reusable for the security type detection web search call
- `client` (Anthropic SDK singleton) in `anthropic-search.ts` — import/reuse in `security-type.ts`
- `Promise.allSettled` + `settle()` pattern in `source-package.ts` — security type detection slots in as a 7th parallel call in `collectAllData()`

### Established Patterns
- Each fetch function takes `ticker: string` and returns a typed section — `detectSecurityType` follows same signature pattern, adding `quoteType` and `longName` params from Yahoo quote
- `max_uses` is set inline per `messages.create()` call — easy to branch by security type
- Python script reads top-level fields from source package JSON — `security_type` field on `SourcePackage` is directly accessible

### Integration Points
- `collectAllData()` in `source-package.ts`: add `detectSecurityType()` to the parallel call array; pass resulting type to each fetch function
- `SourcePackage` type in `src/lib/types.ts`: add `security_type: SecurityType` field
- `scripts/notebooklm_research.py` question dispatch: read `pkg['security_type']`, select preamble, prepend to Q1–Q6 before `chat.ask()` calls
- Report header component (ResearchReport or ticker overview section): read `security_type` from AnalysisResult/SourcePackage; conditionally render badge

</code_context>

<specifics>
## Specific Ideas

- ETHM (a SPAC) should surface: merger target, expected vote/close date, trust NAV — these are the phase success criteria
- QQQ (an ETF) should surface: top holdings, expense ratio (0.20%), tracking index (Nasdaq-100) — not "SEC 10-K filings"
- The amber badge ("SPAC", "ETF") should feel like a tag/chip in the terminal header, consistent with existing amber accent usage

</specifics>

<deferred>
## Deferred Ideas

- ADR-specific prompts (e.g., for foreign ADRs: currency risk, home country regulatory filings) — type detection will classify ADRs, but specialized prompts deferred to a future iteration
- Preferred stock specialized prompts — type detection covers it; prompts deferred
- Crypto-specific prompts (on-chain data, tokenomics) — deferred; crypto detection included in SecurityType enum but prompt branching not in scope this phase
- Post-merger SPAC handling (ticker that was a SPAC but completed merger and now files 10-Ks) — edge case; deferred

</deferred>

---

*Phase: 07-research-quality-special-situation-coverage*
*Context gathered: 2026-03-25*
