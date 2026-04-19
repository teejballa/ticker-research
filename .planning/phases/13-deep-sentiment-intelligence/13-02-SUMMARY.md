---
phase: 13-deep-sentiment-intelligence
plan: 02
subsystem: api
tags: [gemini, firecrawl, anthropic, haiku, stocktwits, community-sentiment, options, zod]

# Dependency graph
requires:
  - phase: 13-01
    provides: SentimentIntelligenceSection in SourcePackage, stocktwits.ts, options-sentiment.ts

provides:
  - scrapeCommunitySentiment() replaced with pinned StockTwits URL + Haiku discovery + Firecrawl scrape
  - domainTier() and scrapeUrlWithFirecrawl() helpers in gemini-analysis.ts
  - AnalysisResultSchema extended with future_projection, community_sources_scraped, sentiment_intelligence_summary
  - SYSTEM_PROMPT extended with forward-looking synthesis instructions and echo-back fidelity rules
  - buildUserPrompt() accepts optional sentimentIntelligence param and injects SENTIMENT INTELLIGENCE section
  - runGeminiAnalysis() maps new fields to AnalysisResult output

affects:
  - 13-03 (report renderer will consume future_projection, community_sources_scraped, sentiment_intelligence)
  - any consumer of AnalysisResult or buildUserPrompt()

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pinned URL guarantee pattern: inject known high-value URL before LLM discovery to ensure coverage"
    - "Domain tier ranking: sort LLM-discovered URLs by source quality before scraping"
    - "Module-level side-channel variable (_lastCommunityScrapePageCount) to return extra data without changing function signature"
    - "Paywall guard: skip scraped content < 200 chars"
    - "LLM echo-back: SYSTEM_PROMPT instructs Gemini to return exact numeric values from structured input section"

key-files:
  created: []
  modified:
    - src/lib/gemini-analysis.ts

key-decisions:
  - "Used direct Anthropic SDK (not AI Gateway) for Haiku web_search_20250305 — consistent with 5 existing files; web_search tool not available via AI Gateway"
  - "Kept claude-haiku-4-5-20251001 model string matching existing codebase convention (anthropic-search.ts, security-type.ts)"
  - "Module-level _lastCommunityScrapePageCount avoids changing scrapeCommunitySentiment() return type signature"
  - "StockTwits URL pinned before Haiku candidates so tier-ranking cannot exclude it unless 5 higher-tier URLs exist"

patterns-established:
  - "Pattern: Pinned URL guarantee — inject domain-specific URL before LLM discovery to ensure coverage (D-05)"
  - "Pattern: LLM URL filter — startsWith('http') guard before passing to Firecrawl (T-13-02-01 mitigation)"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase 13 Plan 02: Deep Sentiment Intelligence — Community Scraper Replacement + Zod Schema Extension Summary

**Replaced fc.search() with pinned StockTwits URL + Anthropic Haiku URL discovery + Firecrawl fc.scrape() pipeline; extended AnalysisResultSchema with future_projection, community_sources_scraped, and sentiment_intelligence_summary fields; wired SourcePackage.sentiment_intelligence into Gemini prompt and output mapping.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-19T22:52:58Z
- **Completed:** 2026-04-19T22:55:58Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Replaced brittle `fc.search()` with a two-step Haiku URL discovery + `fc.scrape()` pipeline guaranteeing StockTwits thread coverage (D-05)
- Extended `AnalysisResultSchema` with `future_projection`, `community_sources_scraped`, and `sentiment_intelligence_summary` Zod fields
- Extended `SYSTEM_PROMPT` with forward-looking synthesis instructions and two new CRITICAL RULES enforcing signal use and echo-back fidelity
- Updated `buildUserPrompt()` to inject a `=== SENTIMENT INTELLIGENCE ===` section from `SourcePackage.sentiment_intelligence`
- Updated `runGeminiAnalysis()` to map all three new fields to the returned `AnalysisResult`

## Task Commits

1. **Task 1: Replace scrapeCommunitySentiment()** - `bde99c7` (feat)
2. **Task 2: Extend AnalysisResultSchema, SYSTEM_PROMPT, buildUserPrompt(), runGeminiAnalysis()** - `b358597` (feat)

**Plan metadata:** (committed below)

## Files Created/Modified

- `src/lib/gemini-analysis.ts` — scrapeCommunitySentiment() replaced; domainTier() and scrapeUrlWithFirecrawl() added; AnalysisResultSchema extended; SYSTEM_PROMPT extended; buildUserPrompt() signature extended; runGeminiAnalysis() maps new fields

## Decisions Made

- Used direct Anthropic SDK (`@anthropic-ai/sdk`) for Haiku URL discovery — `web_search_20250305` tool is not available through the Vercel AI Gateway; this is the established pattern in 5 existing codebase files
- Kept `claude-haiku-4-5-20251001` model string matching existing codebase convention (5 files use this exact string)
- Used a module-level `_lastCommunityScrapePageCount` variable to expose page count without changing the `scrapeCommunitySentiment()` return signature
- StockTwits URL pinned at index 0 before Haiku candidates — tier-ranking cannot displace it unless 5 higher-tier (score > 4) URLs exist, which is impossible by the tier definition

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The `posttooluse-validate` hook flagged the direct Anthropic SDK import and the Haiku model string on every edit. These are pre-existing patterns used in `anthropic-search.ts` and `security-type.ts` — both files use `import Anthropic from '@anthropic-ai/sdk'` and `claude-haiku-4-5-20251001` for `web_search_20250305` tool access. The AI Gateway does not support this tool. The validator flags are not applicable to this usage. TypeScript compiles clean with zero errors.

## Threat Surface Scan

All threat mitigations from the plan's threat model were implemented:

| Threat ID | Mitigation | Status |
|-----------|------------|--------|
| T-13-02-00 | `encodeURIComponent(ticker)` applied to pinned StockTwits URL | Implemented |
| T-13-02-01 | `u.startsWith('http')` filter on Haiku URL output before Firecrawl | Implemented |
| T-13-02-02 | Scraped content passed as user prompt data only (not system instructions) | Maintained |
| T-13-02-03 | CRITICAL RULE 7 added to SYSTEM_PROMPT enforcing exact numeric echo-back | Implemented |

## Next Phase Readiness

- `future_projection`, `community_sources_scraped`, and `sentiment_intelligence` fields are now populated in `AnalysisResult`
- Report renderer (Plan 03 or subsequent) can consume these fields for display
- `buildUserPrompt()` and `runGeminiAnalysis()` are backward-compatible — no callers needed updating

## Self-Check: PASSED

- `src/lib/gemini-analysis.ts` — exists on disk
- `13-02-SUMMARY.md` — exists on disk
- Commit `bde99c7` (Task 1) — verified in git log
- Commit `b358597` (Task 2) — verified in git log
- `npx tsc --noEmit` — exits 0, no errors

---
*Phase: 13-deep-sentiment-intelligence*
*Completed: 2026-04-19*
