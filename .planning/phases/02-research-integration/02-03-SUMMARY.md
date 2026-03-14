---
phase: 02-research-integration
plan: "03"
subsystem: python-script
tags: [python, notebooklm, research-pipeline, async, sse, tdd]

# Dependency graph
requires:
  - phase: 02-research-integration
    plan: "02"
    provides: formatResearchBrief canonical spec and SourcePackage structure
provides:
  - scripts/notebooklm_research.py — full notebook lifecycle: create → add_text → add_url loop → 6x chat.ask → delete → RESULT:
  - parse_answers() — defensive text parser producing AnalysisResult dict from 6 NotebookLM answers
  - format_research_brief() — pure Python equivalent of TypeScript canonical formatter
  - extract_news_urls() — deduplicated, capped URL list for add_url calls
affects:
  - 02-04-analysis-api (route spawns this script and streams its stdout)

# Tech tracking
tech-stack:
  added:
    - asyncio (Python stdlib — async/await for NotebookLM client)
    - notebooklm-py==0.3.4 (listed in scripts/requirements.txt — not installed here)
  patterns:
    - Graceful ImportError guard for missing notebooklm-py (argv validation still works)
    - Per-URL asyncio.wait_for(timeout=120) with catch-all exception → source_warnings list
    - Two-phase cleanup: notebook deletion attempted in both success and error paths via separate client context
    - Defensive regex parsing with explicit defaults (pad to 3 signals, default 34/33/33 split)

key-files:
  created:
    - scripts/notebooklm_research.py
  modified: []

key-decisions:
  - "Graceful ImportError guard added so argv validation works even without notebooklm-py installed — smoke test passes without requiring the library"
  - "dict.fromkeys replaced with explicit seen dict for Python 3.10 compatibility in extract_news_urls"
  - "parse_answers detects sentiment by first match priority: bullish > bearish > neutral default"
  - "Assessment normalization: clamp then proportional scale, ensuring sum always equals 100"

requirements-completed: [RSRCH-02, RSRCH-03, RSRCH-04, RSRCH-05, RSRCH-06, RSRCH-07]

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 2 Plan 03: NotebookLM Python Research Script Summary

**Full NotebookLM notebook lifecycle script with defensive answer parsing and per-URL error isolation, producing typed AnalysisResult JSON to stdout**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-14T01:43:34Z
- **Completed:** 2026-03-14T01:46:32Z
- **Tasks:** 2 (Task 1 committed; Task 2 already implemented in 02-04)
- **Files modified:** 1

## Accomplishments

- `scripts/notebooklm_research.py` fully implemented with all required functions and Q1-Q6 constants
- `format_research_brief()` — pure Python 6-section brief formatter matching TypeScript canonical in `src/lib/research-brief.ts`
- `extract_news_urls()` — deduplicated, filtered, capped-at-15 URL extractor
- `parse_answers()` — defensive regex parsers for all 6 NotebookLM free-text answers
- Full notebook lifecycle: create → add_text → sleep(15) → per-URL add_url with wait_for(120s) → sleep(20) → 6x chat.ask with conversation threading → delete
- Error paths always attempt notebook deletion via second client context
- Rate limit detection: 'rate'/'quota'/'limit' keywords → "midnight PST" message
- Graceful ImportError guard: script prints argv error correctly even without notebooklm-py installed
- All 62 tests passing, TypeScript compiles clean

## Task Commits

1. **Task 1: Python research script** — `5b92041` (feat) — `scripts/notebooklm_research.py` (579 lines)
2. **Task 2: Wave 0 test stubs** — Already implemented in commit `7bb185e` (plan 02-04 pre-work)

## Files Created/Modified

- `/Users/tj/Desktop/Ticker-Research/scripts/notebooklm_research.py` — full notebook lifecycle script

## Decisions Made

- Graceful ImportError guard added for environments without notebooklm-py — `main()` checks `NotebookLMClient is None` and prints a helpful install message before exiting
- Sentiment detection uses first-match priority: bullish checked before bearish, default to neutral
- Assessment percentage normalization: clamp 0-100 first, then proportional scale to sum=100, final sell_pct = 100 - buy - hold to avoid rounding drift

## Deviations from Plan

### Pre-completed Work Discovered

**Task 2: Wave 0 test stubs** — The test file `src/app/api/analysis/__tests__/route.test.ts` and the route implementation `src/app/api/analysis/[ticker]/route.ts` were already fully implemented in a prior session commit `7bb185e`. The tests are not "Wave 0 stubs" but full passing integration tests. This represents forward progress — 3 tests pass, the route implementation is complete. No action required.

## Self-Check: PASSED

- `scripts/notebooklm_research.py` exists and is 579 lines
- `python3 -c "import ast; ast.parse(...)"` exits 0 — syntax valid
- `python3 scripts/notebooklm_research.py` (no args) prints `ERROR: No source package path provided`
- All functions defined: `format_research_brief`, `extract_news_urls`, `parse_answers`, `main`
- Q1-Q6 constants defined at module level
- All 62 tests pass, TypeScript compiles clean
- Commit `5b92041` verified in git log

## Next Phase Readiness

- `scripts/notebooklm_research.py` is ready to be spawned by `POST /api/analysis/[ticker]`
- The analysis route and test suite are already in place (from 02-04 pre-work)
- No blockers for 02-04

---
*Phase: 02-research-integration*
*Completed: 2026-03-14*
