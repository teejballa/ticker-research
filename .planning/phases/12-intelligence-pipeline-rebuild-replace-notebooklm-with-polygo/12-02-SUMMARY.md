---
phase: 12-intelligence-pipeline-rebuild-replace-notebooklm-with-polygo
plan: "02"
subsystem: analysis-pipeline
tags: [gemini, ai-sdk, firecrawl, sse, typescript, vitest, security]

# Dependency graph
requires:
  - "12-01: ai@6.0.168 and @mendable/firecrawl-js@4.18.3 installed; AnalysisResult schema evolved"
provides:
  - "src/lib/gemini-analysis.ts — runGeminiAnalysis, scrapeCommunitySentiment, buildUserPrompt, extractMarketSnapshot"
  - "POST /api/analysis/[ticker] rewritten — no Python subprocess, no container proxy"
  - "SSE progress messages contain required stepper substrings for ResearchProgress.tsx"
  - "filePath validated against os.tmpdir() (T-12-02-01 path traversal mitigation)"
  - "Firecrawl scraping optional — graceful skip when FIRECRAWL_API_KEY absent"
affects:
  - "src/app/research/[ticker]/page.tsx — consumes AnalysisResult (unchanged, backward-compat)"
  - "src/components/ResearchProgress.tsx — SSE progress step triggers (unchanged)"
  - "12-03: container decommission — analysis route no longer references container"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "generateText + Output.object({ schema }) for typed Gemini structured output"
    - "Promise.allSettled for graceful Firecrawl partial-failure handling"
    - "realpathSync canonicalization for cross-platform path traversal validation (macOS symlinks)"
    - "Async IIFE pattern for SSE streaming without blocking route handler return"

key-files:
  created:
    - "src/lib/gemini-analysis.ts — Gemini analysis service: runGeminiAnalysis, scrapeCommunitySentiment, buildUserPrompt, extractMarketSnapshot"
    - "src/lib/gemini-analysis.test.ts — 5 Vitest tests covering scrapeCommunitySentiment and buildUserPrompt behaviors"
  modified:
    - "src/app/api/analysis/[ticker]/route.ts — rewritten: Gemini call, no spawn, no CONTAINER_URL"
    - "src/app/api/analysis/__tests__/route.test.ts — rewritten: mocks ai module, 6 Gemini-based tests"
    - "tests/unit/analysis-web-mode.test.ts — rewritten: covers new Gemini web mode behavior (Neon persistence)"

key-decisions:
  - "google/gemini-3-flash model string used (verified live from ai-gateway.vercel.sh/v1/models 2026-04-16 and 2026-04-17)"
  - "realpathSync used on both filePath parent dir and tmpdir() to canonicalize macOS /tmp symlink correctly"
  - "DEPLOYMENT_MODE=web retained only for history persistence branch (Neon vs filesystem) — not for analysis routing"
  - "vi.mock factory values inlined (not referencing module-level const) to avoid Vitest hoisting ReferenceError"

patterns-established:
  - "Path traversal mitigation: realpathSync parent dir when file does not yet exist, then startsWith(canonicalTmpdir)"
  - "SSE async IIFE: return Response(stream) immediately, run pipeline asynchronously, enqueue progress events inline"

requirements-completed:
  - INTEL-04
  - INTEL-05
  - INTEL-06
  - INTEL-07

# Metrics
duration: 25min
completed: 2026-04-17
---

# Phase 12 Plan 02: Gemini Analysis Engine and Rewritten Analysis Route Summary

**Direct Gemini API call via AI SDK replaces Python subprocess and Cloud Run container proxy — SSE streaming, filePath validation, and optional Firecrawl community sentiment all implemented and tested**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-17
- **Tasks:** 2
- **Files created:** 2 (gemini-analysis.ts, gemini-analysis.test.ts)
- **Files modified:** 3 (route.ts, route.test.ts, analysis-web-mode.test.ts)

## Accomplishments

- Created `src/lib/gemini-analysis.ts` with `runGeminiAnalysis`, `scrapeCommunitySentiment`, `buildUserPrompt`, `extractMarketSnapshot` exports
- Zod schema for typed Gemini structured output — eliminates all regex parsing from the old Python script
- System prompt instructs Gemini to produce exactly 5 bullish and 5 bearish signals, cite all sources, and ensure buy+hold+sell sum to 100
- Firecrawl scraping with `Promise.allSettled` — partial URL failures skip gracefully; absent `FIRECRAWL_API_KEY` returns empty string immediately
- Rewrote `POST /api/analysis/[ticker]/route.ts` — no `spawn()`, no `CONTAINER_URL`, no Python subprocess
- SSE progress messages contain all required step-trigger substrings: `creating`, `adding market`, `adding news`, `querying sentiment`, `querying confidence`, `cleaning`
- filePath validated against `os.tmpdir()` using `realpathSync` to prevent path traversal (T-12-02-01)
- Community URLs sourced only from `pkg.social_sentiment.sources_checked` (T-12-02-03 SSRF mitigation)
- `DEPLOYMENT_MODE=web` persistence branch retained for Neon history writes (unrelated to analysis engine)
- All 5 gemini-analysis.test.ts tests pass; all 6 route.test.ts tests pass; all 5 analysis-web-mode.test.ts tests pass
- `npm run build` exits 0; `npx tsc --noEmit` exits 0

## Task Commits

1. **Task 1: gemini-analysis.ts service module and tests** — `8104926` (feat)
2. **Task 2: rewrite analysis route and update tests** — `6ea0fa8` (feat)

## Files Created/Modified

- `src/lib/gemini-analysis.ts` — New Gemini analysis service module (145 lines)
- `src/lib/gemini-analysis.test.ts` — 5 Vitest tests for scrapeCommunitySentiment and buildUserPrompt (65 lines)
- `src/app/api/analysis/[ticker]/route.ts` — Rewritten SSE route: Gemini call, no spawn, no CONTAINER_URL (145 lines)
- `src/app/api/analysis/__tests__/route.test.ts` — Rewritten route tests: mock ai module, 6 tests (240 lines)
- `tests/unit/analysis-web-mode.test.ts` — Rewritten web-mode tests: covers new Gemini-based persistence path (165 lines)

## Decisions Made

- `google/gemini-3-flash` chosen over `google/gemini-2.0-flash` (RESEARCH.md Open Question 1 resolved) — higher version, better reasoning, verified live from gateway endpoint on both 2026-04-16 and 2026-04-17
- `realpathSync` used on both sides of the path traversal check rather than `resolve()` — required to handle macOS `/tmp` → `/private/var/folders/.../T` symlink correctly; fallback to parent-dir canonicalization when file does not yet exist (test environments)
- `DEPLOYMENT_MODE=web` persistence branch kept in route — RESEARCH.md Pattern 5 explicitly states this distinction remains for history routes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] macOS tmpdir symlink caused path traversal guard to reject valid test paths**
- **Found during:** Task 2, GREEN phase (route tests 1-4 failing with 400 instead of 200/SSE)
- **Issue:** `resolve('/tmp/source-package-AAPL.json')` returns `/tmp/...` but `tmpdir()` returns `/var/folders/.../T` on macOS. `startsWith` comparison always failed.
- **Fix:** Added `realpathSync` canonicalization on both `tmpdir()` and the resolved filePath parent directory (file doesn't exist yet in tests). Both paths then share `/private/var/folders/.../T` prefix.
- **Files modified:** `src/app/api/analysis/[ticker]/route.ts`, `src/app/api/analysis/__tests__/route.test.ts` (test uses `tmpdir()` directly)
- **Committed in:** 6ea0fa8

**2. [Rule 1 - Bug] Vitest hoisting ReferenceError in analysis-web-mode.test.ts**
- **Found during:** Task 2, rewriting analysis-web-mode.test.ts
- **Issue:** `vi.mock('@/lib/gemini-analysis', () => ({ runGeminiAnalysis: vi.fn().mockResolvedValue(MOCK_RESULT) }))` — Vitest hoists `vi.mock()` factories to top of file, before `MOCK_RESULT` const is initialized. `ReferenceError: Cannot access 'MOCK_RESULT' before initialization`.
- **Fix:** Inlined the mock return values directly in factory functions (no reference to module-level constants).
- **Files modified:** `tests/unit/analysis-web-mode.test.ts`
- **Committed in:** 6ea0fa8

**3. [Rule 1 - Bug] analysis-web-mode.test.ts tested deleted container-proxy behavior**
- **Found during:** Task 2 (full suite run showed 3 failures in this file)
- **Issue:** The existing test file asserted 401 on missing session, 400 on missing credential, and verified container `fetch` call — all behaviors removed by the route rewrite.
- **Fix:** Rewrote test file entirely to cover the new Gemini-based behavior: SSE stream returned (no 401 gate on analysis), `writeReportToDb` called in web mode, `spawn` never called, local mode calls `writeReport`.
- **Files modified:** `tests/unit/analysis-web-mode.test.ts`
- **Committed in:** 6ea0fa8

## Known Stubs

None — all exports are fully implemented. `runGeminiAnalysis` makes a real `generateText()` call; `scrapeCommunitySentiment` makes real Firecrawl calls when key is present.

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model (T-12-02-01 through T-12-02-05). All mitigations implemented:
- T-12-02-01: `realpathSync` + `startsWith(canonicalTmpdir)` path traversal guard in route
- T-12-02-02: `VERCEL_OIDC_TOKEN` never referenced in application code — AI SDK reads it internally
- T-12-02-03: Community URLs sourced only from `pkg.social_sentiment.sources_checked` (Anthropic-vetted), not user input
- T-12-02-04: `Output.object()` Zod schema rejects unexpected fields; output is display-only
- T-12-02-05: Web-mode `writeReportToDb` gated behind `getServerSession` — unauthenticated users get analysis but report not persisted

## Self-Check: PASSED

- FOUND: src/lib/gemini-analysis.ts
- FOUND: src/lib/gemini-analysis.test.ts
- FOUND: src/app/api/analysis/[ticker]/route.ts
- FOUND: src/app/api/analysis/__tests__/route.test.ts
- FOUND: tests/unit/analysis-web-mode.test.ts
- FOUND commit: 8104926
- FOUND commit: 6ea0fa8
- grep CONTAINER_URL route.ts: NOT FOUND (correct)
- grep spawn route.ts: NOT FOUND (correct)
- grep runGeminiAnalysis route.ts: FOUND (correct)
- grep google/gemini-3-flash gemini-analysis.ts: FOUND (correct)
- npx tsc --noEmit: exits 0
- npm run build: exits 0
- gemini-analysis.test.ts: 5/5 pass
- route.test.ts: 6/6 pass
- analysis-web-mode.test.ts: 5/5 pass

---
*Phase: 12-intelligence-pipeline-rebuild-replace-notebooklm-with-polygo*
*Completed: 2026-04-17*
